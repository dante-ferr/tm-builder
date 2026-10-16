"""Live diagrams and bounded execution playback for local machines."""

from dataclasses import asdict
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import shutil
import subprocess
import threading
import tempfile
import time
from urllib.parse import parse_qs, unquote, urlparse
import webbrowser

from tm_builder.definition import DefinitionError, parse_definition
from tm_builder.editing import edit_yaml, _dump
from tm_builder.diagram import machine_diagram
from tm_builder.inputs import parse_inputs
from tm_builder.simulation import simulate
from tm_builder.execution_limits import execution_limits
from tm_builder.workspace import EXAMPLES, INPUT_EXAMPLES, MACHINE_EXAMPLES, ensure_workspace, open_in_editor

PROJECT = Path(__file__).resolve().parents[3]
WEB_PROJECT = PROJECT / 'web'
WEB = WEB_PROJECT / 'public'
WEB_OUT = WEB_PROJECT / 'out'


def ensure_assets():
    if (WEB_OUT / 'index.html').is_file() and (WEB / 'assets/render.cjs').is_file():
        built_at = min((WEB_OUT / 'index.html').stat().st_mtime_ns,
                       (WEB / 'assets/render.cjs').stat().st_mtime_ns)
        sources = [WEB_PROJECT / name for name in
                   ('package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json')]
        for folder in ('app', 'src'):
            sources.extend(path for path in (WEB_PROJECT / folder).rglob('*') if path.is_file())
        if all(not path.exists() or path.stat().st_mtime_ns <= built_at for path in sources):
            return
    npm = shutil.which('npm')
    if not npm:
        raise RuntimeError('Install Node.js/npm, then run this command again.')
    print('Building diagram tools…', flush=True)
    try:
        subprocess.run([npm, 'ci', '--no-audit', '--no-fund'], cwd=WEB_PROJECT, check=True)
        subprocess.run([npm, 'run', 'build'], cwd=WEB_PROJECT, check=True)
    except subprocess.CalledProcessError as error:
        raise RuntimeError('Asset build failed. Run npm run build in the web directory.') from error


def hosted():
    """True when this process is the public Render app, not a local viewer."""
    return bool(_render_url())


def library_files(kind):
    """List YAML files in the user's machine or input workspace.

    The hosted app lists bundled examples only. It does not read or create a
    user workspace.
    """
    if kind not in ('machines', 'inputs'):
        raise ValueError('Unknown library')
    names = MACHINE_EXAMPLES if kind == 'machines' else INPUT_EXAMPLES
    if hosted():
        folder = EXAMPLES / kind
        return [{'filename': name, 'example': True}
                for name in sorted(names)
                if (folder / name).is_file() and not (folder / name).is_symlink()]
    examples = set(names)
    folder = ensure_workspace() / kind
    return [{'filename': path.name, 'example': path.name in examples}
            for path in sorted(folder.iterdir())
            if path.suffix.lower() in ('.yaml', '.yml') and path.is_file()
            and path.resolve().parent == folder.resolve()]


def library_path(kind, filename):
    if not isinstance(filename, str) or filename not in {entry['filename'] for entry in library_files(kind)}:
        raise ValueError('File is not in the library')
    root = EXAMPLES if hosted() else ensure_workspace()
    return root / kind / filename


class DiagramSource:
    """Prefer a fresh IDE buffer; otherwise follow the saved file."""

    def __init__(self, path: Path | None = None):
        self.path = path.resolve() if path else None
        self.imported = None
        self.buffer = None
        self.buffer_time = 0
        self.lock = threading.RLock()
        self.cache = None
        self.definition = None
        self.undo_stack = []
        self.redo_stack = []

    def select(self, path: Path | None = None, *, source=None, filename=None):
        with self.lock:
            self.path = path.resolve() if path else None
            self.imported = (filename, source) if source is not None else None
            self.buffer = None
            self.cache = None
            self.definition = None
            self.undo_stack = []
            self.redo_stack = []

    def update_buffer(self, path: str, source: str) -> bool:
        with self.lock:
            if Path(path).resolve() != self.path:
                return False
            self.buffer = source
            self.buffer_time = time.monotonic()
        return True

    def snapshot(self):
        with self.lock:
            return self._snapshot()

    def _snapshot(self):
        if self.path is None and self.imported is None:
            return {'valid': False, 'revision': 'unselected', 'path': '',
                    'diagnostics': [{'message': 'Choose a machine or import a YAML file.',
                                     'line': 1, 'column': 1, 'severity': 'info'}]}
        live = self.buffer is not None and time.monotonic() - self.buffer_time < 3
        source = self.buffer if live else None
        try:
            saved = self.imported[1] if self.imported else self.path.read_text()
            if source is None:
                source = saved
            mode = 'Imported file' if self.imported else 'Unsaved VS Code buffer' if live and source != saved else 'Saved file'
        except OSError as error:
            if source is None:
                return {'valid': False, 'revision': str(error), 'path': str(self.path),
                        'diagnostics': [{'message': str(error), 'line': 1, 'column': 1, 'severity': 'error'}]}
            mode = 'Unsaved VS Code buffer'
        name = self.imported[0] if self.imported else str(self.path)
        revision = sha256((source + '\0' + mode + '\0' + name).encode()).hexdigest()
        if self.cache and self.cache['revision'] == revision:
            return self.cache
        result = {'path': name, 'filename': Path(name).stem, 'revision': revision, 'mode': mode,
                  'can_undo': bool(self.undo_stack and self.undo_stack[-1][1] == source and mode != 'Unsaved VS Code buffer'),
                  'can_redo': bool(self.redo_stack and self.redo_stack[-1][0] == source and mode != 'Unsaved VS Code buffer')}
        try:
            definition, warnings = parse_definition(source)
            self.definition = definition
            result.update(valid=True, name=definition.name, dot=machine_diagram(definition).source,
                          model=definition.model, tapes=definition.tapes, states=definition.states,
                          source=source, definition=definition.model_dump(by_alias=True, mode='json', exclude_none=True),
                          diagnostics=[asdict(d) for d in warnings])
        except DefinitionError as error:
            result.update(valid=False, diagnostics=[asdict(d) for d in error.diagnostics])
        self.cache = result
        return result

    def _editable(self, data):
        current = self.snapshot()
        if not current['valid'] or data.get('revision') != current['revision']:
            raise ValueError('Machine changed. Review the latest machine and retry your edit.')
        if current['mode'] == 'Unsaved VS Code buffer':
            raise ValueError('Save your VS Code changes before editing in the UI.')
        return current

    def _write(self, current, updated):
        if self.imported:
            self.imported = (self.imported[0], updated)
        else:
            if self.path.read_text() != current['source']:
                raise ValueError('Machine changed on disk. Review it and retry your edit.')
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                                 dir=self.path.parent, delete=False) as file:
                    temporary = Path(file.name)
                    file.write(updated)
                temporary.chmod(self.path.stat().st_mode & 0o777)
                if self.path.read_text() != current['source']:
                    raise ValueError('Machine changed on disk. Review it and retry your edit.')
                temporary.replace(self.path)
            finally:
                if temporary and temporary.exists():
                    temporary.unlink()
        self.buffer = None
        self.cache = None

    def edit(self, data):
        """Validate and autosave, retaining exact YAML for undo and redo."""
        with self.lock:
            current = self._editable(data)
            updated = edit_yaml(current['source'], data.get('changes'))
            if updated != current['source']:
                self._write(current, updated)
                self.undo_stack.append((current['source'], updated))
                self.undo_stack = self.undo_stack[-50:]
                self.redo_stack.clear()
            return self.snapshot()

    def history(self, data):
        with self.lock:
            current = self._editable(data)
            direction = data.get('direction')
            if direction not in ('undo', 'redo'):
                raise ValueError('Choose undo or redo.')
            undo = direction == 'undo'
            stack = self.undo_stack if undo else self.redo_stack
            destination = self.redo_stack if undo else self.undo_stack
            if not stack:
                raise ValueError(f'Nothing to {direction}.')
            before, after = stack[-1]
            if current['source'] != (after if undo else before):
                raise ValueError('Machine changed outside the UI. Undo history cannot overwrite those changes.')
            self._write(current, before if undo else after)
            destination.append(stack.pop())
            return self.snapshot()

    @staticmethod
    def _new_file(workspace, filename, text):
        if (not isinstance(filename, str) or not filename.strip()
                or '/' in filename or '\\' in filename or '\0' in filename
                or Path(filename).suffix.lower() not in ('.yaml', '.yml')):
            raise ValueError('Choose a .yaml or .yml filename without directories.')
        folder = (workspace / 'machines').resolve()
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / filename
        # Exclusive creation also rejects symlinks and never overwrites a machine.
        try:
            with target.open('x', encoding='utf-8') as file:
                file.write(text)
        except FileExistsError as error:
            raise ValueError('That filename already exists. Choose another filename.') from error
        return target

    def create(self, data, workspace):
        if hosted():
            raise ValueError('The hosted app cannot create workspace files. Import a YAML file, then use Save YAML to keep your edits.')
        name = data.get('name')
        if not isinstance(name, str) or not name.strip():
            raise ValueError('Enter a machine name.')
        text = _dump(dict(name=name.strip(), model='deterministic', tapes=1,
                          blank='_', input_alphabet=['0', '1'], tape_alphabet=['0', '1', '_'],
                          states=['q0'], start='q0', accept=[], reject=[], transitions=[]))
        parse_definition(text)
        with self.lock:
            target = self._new_file(workspace, data.get('filename'), text)
            self.select(target)
            return self.snapshot()

    def open_workspace(self):
        """Wait for an in-progress disk write, then open the workspace in VS Code."""
        if hosted():
            raise ValueError('Opening a workspace folder is only available in the local viewer.')
        self.lock.acquire()
        self.lock.release()
        open_in_editor()
        return {'opened': True}

    def simulation(self, data):
        with self.lock:
            current = self.snapshot()
            if not current['valid']:
                raise ValueError('Fix the machine diagnostics before running.')
            if data.get('revision') != current['revision']:
                raise ValueError('Machine changed; reload the trace.')
            setup_text = data.get('setup', 'tapes: []')
            if not isinstance(setup_text, str):
                raise ValueError('Expected starting tape YAML as a string.')
            definition = self.definition.model_copy(deep=True)
            revision = current['revision']
        # Each HTTP request already runs on its own thread. Keep execution outside
        # the source lock so polling, edits, and machine selection stay responsive.
        setup = parse_inputs(setup_text, definition)
        result = simulate(definition, max_steps=data.get('max_steps', 1000), setup=setup)
        return {**result, 'revision': revision, 'model': definition.model}

    def export(self, data):
        from tm_builder.web_export import export_download
        if 'source' in data:
            if not isinstance(data['source'], str) or not isinstance(data.get('filename'), str):
                raise ValueError('Expected imported machine YAML and a filename.')
            definition, _ = parse_definition(data['source'])
            filename = data['filename']
        else:
            with self.lock:
                current = self.snapshot()
                if not current['valid']:
                    raise ValueError('Choose a valid machine or import a file to export.')
                if data.get('revision') != current['revision']:
                    raise ValueError('Machine changed; try exporting again.')
                definition = self.definition.model_copy(deep=True)
                filename = current['path']
        return export_download(definition, filename, data)


def _render_url():
    return os.environ.get('RENDER_EXTERNAL_URL', '').strip()


def viewer_listen(port, open_browser=True):
    """Choose the bind address, port, and whether to open a browser.

    Local runs keep the requested port and bind to loopback. When Render sets
    RENDER_EXTERNAL_URL, its PORT value wins over an explicit port so the
    process matches the proxy, and the browser is left closed.
    """
    if not _render_url():
        return '127.0.0.1', port, open_browser
    raw = os.environ.get('PORT')
    if raw is not None and str(raw).strip() != '':
        port = int(str(raw).strip())
    return '0.0.0.0', port, False


def _render_allowance():
    """Return the public hosts and origin Render is allowed to send."""
    raw = _render_url()
    if not raw:
        return None
    parsed = urlparse(raw)
    hostname = (parsed.hostname or '').lower()
    if parsed.scheme not in ('http', 'https') or not hostname:
        return None
    default_port = 443 if parsed.scheme == 'https' else 80
    explicit = parsed.port
    hosts = {hostname, f'{hostname}:{explicit or default_port}'}
    if explicit not in (None, default_port):
        origin = f'{parsed.scheme}://{hostname}:{explicit}'
    else:
        origin = f'{parsed.scheme}://{hostname}'
    return hosts, origin


def _origin_matches(header, expected):
    if header is None:
        return True
    got = urlparse(header)
    expected_parts = urlparse(expected)
    if got.scheme != expected_parts.scheme or (got.hostname or '').lower() != (expected_parts.hostname or '').lower():
        return False
    if got.port != expected_parts.port:
        return False
    if got.username or got.password or got.query or got.fragment or got.path not in ('',):
        return False
    return True


def create_server(machine_path: Path | None = None, port=8765, workspace: Path | None = None):
    if workspace is None and not hosted():
        workspace = ensure_workspace()
    if workspace is not None and machine_path is not None and not machine_path.exists() and not machine_path.is_absolute():
        candidate = workspace / 'machines' / machine_path.name
        if candidate.exists():
            machine_path = candidate
    machine_path = machine_path.resolve() if machine_path else None
    if machine_path and not machine_path.is_file():
        raise ValueError(f'Machine file does not exist: {machine_path}')
    source = DiagramSource(machine_path)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def respond(self, value, status=200, mime='application/json', filename=None):
            body = json.dumps(value).encode() if mime == 'application/json' else value
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            if filename:
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.end_headers()
            self.wfile.write(body)

        def local_request(self):
            local_host = f'127.0.0.1:{self.server.server_port}'
            request_host = self.headers.get('Host')
            # Loopback clients keep the original host and origin rules, including
            # TM_BUILDER_DEV_ORIGIN. The peer address has to be loopback, so a
            # public client cannot pass by sending Host: 127.0.0.1.
            if self.client_address[0] in ('127.0.0.1', '::1') and request_host == local_host:
                allowed_origins = {f'http://{local_host}'}
                dev_origin = os.environ.get('TM_BUILDER_DEV_ORIGIN')
                if dev_origin:
                    allowed_origins.add(dev_origin)
                if self.headers.get('Origin', f'http://{local_host}') in allowed_origins:
                    return True
            else:
                allowance = _render_allowance()
                if (allowance and request_host and request_host.strip().lower() in allowance[0]
                        and _origin_matches(self.headers.get('Origin'), allowance[1])):
                    return True
            self.respond({'error': 'Invalid host or origin'}, 403)
            return False

        def do_GET(self):
            if not self.local_request():
                return
            route = urlparse(self.path).path
            try:
                if route == '/api/library':
                    library = {kind: library_files(kind) for kind in ('machines', 'inputs')}
                    library['hosted'] = hosted()
                    self.respond(library)
                elif route == '/api/input':
                    filename = parse_qs(urlparse(self.path).query).get('filename', [''])[0]
                    self.respond({'source': library_path('inputs', filename).read_text()})
                elif route == '/api/diagram':
                    self.respond(source.snapshot())
                elif route == '/api/limits':
                    self.respond(execution_limits())
                else:
                    self.serve_static(route)
            except (OSError, ValueError, RecursionError) as error:
                self.respond({'error': str(error)}, 400)

        def serve_static(self, route):
            """Serve files from the Next.js static export without exposing workspace files."""
            root = WEB_OUT.resolve()
            requested = unquote(route).lstrip('/')
            if not requested:
                requested = 'index.html'
            def confined(path):
                resolved = path.resolve()
                try:
                    resolved.relative_to(root)
                except ValueError:
                    return None
                return resolved

            path = confined(root / requested)
            if path is None:
                self.respond({'error': 'Not found'}, 404)
                return

            # Next exports routes as either route.html or route/index.html.
            if path.is_dir():
                path = confined(path / 'index.html')
                if path is None:
                    self.respond({'error': 'Not found'}, 404)
                    return
            if not path.is_file() and not Path(requested).suffix:
                html_path = path.with_suffix('.html')
                if html_path.is_file():
                    path = confined(html_path)
                    if path is None:
                        self.respond({'error': 'Not found'}, 404)
                        return
            if not path.is_file():
                self.respond({'error': 'Not found'}, 404)
                return

            mime, _encoding = mimetypes.guess_type(path.name)
            mime = mime or 'application/octet-stream'
            if mime.startswith('text/') or mime in ('application/javascript', 'application/json', 'image/svg+xml'):
                mime += '; charset=utf-8'
            self.respond(path.read_bytes(), mime=mime)

        def do_POST(self):
            if not self.local_request():
                return
            if self.path not in ('/api/buffer', '/api/simulate', '/api/machine', '/api/export', '/api/edit', '/api/history', '/api/create', '/api/open-workspace'):
                self.respond({'error': 'Not found'}, 404)
                return
            try:
                size = int(self.headers.get('Content-Length', 0))
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/json' or not 0 < size <= 2_000_000:
                    raise ValueError('Expected a JSON body of at most 2 MB')
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise ValueError('Expected a JSON object')
                if self.path == '/api/history':
                    self.respond(source.history(data))
                    return
                if self.path == '/api/create':
                    self.respond(source.create(data, workspace))
                    return
                if self.path == '/api/open-workspace':
                    self.respond(source.open_workspace())
                    return
                if self.path == '/api/edit':
                    self.respond(source.edit(data))
                    return
                if self.path == '/api/export':
                    body, mime, filename = source.export(data)
                    self.respond(body, mime=mime, filename=filename)
                    return
                if self.path == '/api/machine':
                    if 'source' in data:
                        if not isinstance(data['source'], str) or not isinstance(data.get('filename'), str):
                            raise ValueError('Expected filename and source strings')
                        filename = data['filename']
                        if not filename or '/' in filename or '\\' in filename:
                            raise ValueError('Expected a filename without directories')
                        source.select(source=data['source'], filename=filename)
                    else:
                        path = library_path('machines', data.get('filename'))
                        # Hosted edits stay in memory so example files are never overwritten.
                        if hosted():
                            source.select(source=path.read_text(), filename=path.name)
                        else:
                            source.select(path)
                    self.respond(source.snapshot())
                    return
                if self.path == '/api/simulate':
                    self.respond(source.simulation(data))
                    return
                if not isinstance(data.get('source'), str) or not isinstance(data.get('path'), str):
                    raise ValueError('Expected path and source strings')
                self.respond({'matched': source.update_buffer(data['path'], data['source'])})
            except (ValueError, OSError, RuntimeError) as error:
                self.respond({'error': str(error)}, 400)

    bind_host = '0.0.0.0' if _render_url() else '127.0.0.1'
    return ThreadingHTTPServer((bind_host, port), Handler)


def serve(machine_path: Path | None = None, port=8765, open_browser=True):
    # In web dev mode, Next serves the UI and proxies API requests here. Avoid
    # building the static export, which can reinstall web dependencies while
    # the Next dev server is starting.
    if not os.environ.get('TM_BUILDER_DEV_ORIGIN'):
        ensure_assets()
    public = _render_url()
    workspace = None if public else ensure_workspace()
    _bind_host, port, open_browser = viewer_listen(port, open_browser)
    server = create_server(machine_path, port, workspace)
    if public:
        print(f'Diagram: {public}\nListening: 0.0.0.0:{server.server_port}\n'
              f'Examples only. UI edits stay in memory; use Save YAML to download them.\n'
              f'Press Ctrl+C to stop.', flush=True)
    else:
        url = f'http://127.0.0.1:{server.server_port}'
        print(f'Diagram: {url}\nWorkspace: {workspace}\nWatching: {machine_path or workspace / "machines"}\nPress Ctrl+C to stop.', flush=True)
        if open_browser:
            threading.Timer(.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
