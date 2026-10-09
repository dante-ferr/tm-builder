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
import time
from urllib.parse import parse_qs, unquote, urlparse
import webbrowser

from tm_builder.definition import DefinitionError, parse_definition
from tm_builder.diagram import machine_diagram
from tm_builder.inputs import parse_inputs
from tm_builder.simulation import simulate

PROJECT = Path(__file__).resolve().parents[3]
WEB_PROJECT = PROJECT / 'web'
WEB = WEB_PROJECT / 'public'
WEB_OUT = WEB_PROJECT / 'out'


def ensure_assets():
    if (WEB_OUT / 'index.html').is_file() and (WEB / 'assets/render.cjs').is_file():
        return
    npm = shutil.which('npm')
    if not npm:
        raise RuntimeError('Install Node.js/npm, then run this command again.')
    print('Building diagram tools (first launch only)…', flush=True)
    try:
        subprocess.run([npm, 'ci', '--no-audit', '--no-fund'], cwd=WEB_PROJECT, check=True)
        subprocess.run([npm, 'run', 'build'], cwd=WEB_PROJECT, check=True)
    except subprocess.CalledProcessError as error:
        raise RuntimeError('Asset build failed. Run make build from the workspace root.') from error


def library_files(kind):
    """List local YAML files; the gitignore allowlist identifies bundled examples."""
    if kind not in ('machines', 'inputs'):
        raise ValueError('Unknown library')
    examples = set()
    for line in (PROJECT / '.gitignore').read_text().splitlines():
        prefix = f'!/{kind}/'
        if line.startswith(prefix):
            examples.add(line[len(prefix):])
    folder = PROJECT / kind
    return [{'filename': path.name, 'example': path.name in examples}
            for path in sorted(folder.iterdir())
            if path.suffix.lower() in ('.yaml', '.yml') and path.is_file()
            and path.resolve().parent == folder.resolve()]


def library_path(kind, filename):
    if not isinstance(filename, str) or filename not in {entry['filename'] for entry in library_files(kind)}:
        raise ValueError('File is not in the library')
    return PROJECT / kind / filename


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

    def select(self, path: Path | None = None, *, source=None, filename=None):
        with self.lock:
            self.path = path.resolve() if path else None
            self.imported = (filename, source) if source is not None else None
            self.buffer = None
            self.cache = None
            self.definition = None

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
        result = {'path': name, 'filename': Path(name).stem, 'revision': revision, 'mode': mode}
        try:
            definition, warnings = parse_definition(source)
            self.definition = definition
            result.update(valid=True, name=definition.name, dot=machine_diagram(definition).source,
                          model=definition.model, tapes=definition.tapes, states=definition.states,
                          diagnostics=[asdict(d) for d in warnings])
        except DefinitionError as error:
            result.update(valid=False, diagnostics=[asdict(d) for d in error.diagnostics])
        self.cache = result
        return result

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
            setup = parse_inputs(setup_text, self.definition)
            result = simulate(self.definition, max_steps=data.get('max_steps', 1000), setup=setup)
            return {**result, 'revision': current['revision'], 'model': self.definition.model}

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
        return export_download(definition, filename, data, PROJECT)


def create_server(machine_path: Path | None = None, port=8765):
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
            host = f'127.0.0.1:{self.server.server_port}'
            allowed_origins = {f'http://{host}'}
            dev_origin = os.environ.get('TM_BUILDER_DEV_ORIGIN')
            if dev_origin:
                allowed_origins.add(dev_origin)
            if self.headers.get('Host') != host or self.headers.get('Origin', f'http://{host}') not in allowed_origins:
                self.respond({'error': 'Invalid host or origin'}, 403)
                return False
            return True

        def do_GET(self):
            if not self.local_request():
                return
            route = urlparse(self.path).path
            try:
                if route == '/api/library':
                    self.respond({kind: library_files(kind) for kind in ('machines', 'inputs')})
                elif route == '/api/input':
                    filename = parse_qs(urlparse(self.path).query).get('filename', [''])[0]
                    self.respond({'source': library_path('inputs', filename).read_text()})
                elif route == '/api/diagram':
                    self.respond(source.snapshot())
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
            if self.path not in ('/api/buffer', '/api/simulate', '/api/machine', '/api/export'):
                self.respond({'error': 'Not found'}, 404)
                return
            try:
                size = int(self.headers.get('Content-Length', 0))
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/json' or not 0 < size <= 2_000_000:
                    raise ValueError('Expected a JSON body of at most 2 MB')
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise ValueError('Expected a JSON object')
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
                        source.select(library_path('machines', data.get('filename')))
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

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


def serve(machine_path: Path | None = None, port=8765, open_browser=True):
    ensure_assets()
    server = create_server(machine_path, port)
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'Diagram: {url}\nWatching: {machine_path or PROJECT / "machines"}\nPress Ctrl+C to stop.', flush=True)
    if open_browser:
        threading.Timer(.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
