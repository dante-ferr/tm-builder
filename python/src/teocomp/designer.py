"""A diagram-only viewer for a local YAML file and VS Code's live buffer."""

from dataclasses import asdict
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import threading
import time
from urllib.parse import urlparse
import webbrowser

from teocomp.definition import DefinitionError, parse_definition
from teocomp.diagram import machine_diagram

PROJECT = Path(__file__).resolve().parents[3]
WEB_PROJECT = PROJECT / 'web'
WEB = WEB_PROJECT / 'public'


def ensure_assets():
    if all((WEB / f'assets/{name}').exists() for name in ('viewer.js', 'render.cjs')):
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


class DiagramSource:
    """Prefer a fresh IDE buffer; otherwise follow the saved file."""

    def __init__(self, path: Path):
        self.path = path.resolve()
        self.buffer = None
        self.buffer_time = 0
        self.lock = threading.Lock()
        self.cache = None

    def update_buffer(self, path: str, source: str) -> bool:
        if Path(path).resolve() != self.path:
            return False
        with self.lock:
            self.buffer = source
            self.buffer_time = time.monotonic()
        return True

    def snapshot(self):
        with self.lock:
            live = self.buffer is not None and time.monotonic() - self.buffer_time < 3
            source = self.buffer if live else None
        try:
            saved = self.path.read_text()
            if source is None:
                source = saved
            mode = 'Unsaved VS Code buffer' if live and source != saved else 'Saved file'
        except OSError as error:
            if source is None:
                return {'valid': False, 'revision': str(error), 'path': str(self.path),
                        'diagnostics': [{'message': str(error), 'line': 1, 'column': 1, 'severity': 'error'}]}
            mode = 'Unsaved VS Code buffer'
        revision = sha256((source + '\0' + mode).encode()).hexdigest()
        if self.cache and self.cache['revision'] == revision:
            return self.cache
        result = {'path': str(self.path), 'filename': self.path.stem, 'revision': revision, 'mode': mode}
        try:
            definition, warnings = parse_definition(source)
            result.update(valid=True, name=definition.name, dot=machine_diagram(definition).source,
                          diagnostics=[asdict(d) for d in warnings])
        except DefinitionError as error:
            result.update(valid=False, diagnostics=[asdict(d) for d in error.diagnostics])
        self.cache = result
        return result


def serve(machine_path: Path, port=8765, open_browser=True):
    machine_path = machine_path.resolve()
    if not machine_path.is_file():
        raise ValueError(f'Machine file does not exist: {machine_path}')
    ensure_assets()
    source = DiagramSource(machine_path)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def respond(self, value, status=200, mime='application/json'):
            body = json.dumps(value).encode() if mime == 'application/json' else value
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(body)

        def local_request(self):
            host = f'127.0.0.1:{self.server.server_port}'
            if self.headers.get('Host') != host or self.headers.get('Origin', f'http://{host}') != f'http://{host}':
                self.respond({'error': 'Invalid host or origin'}, 403)
                return False
            return True

        def do_GET(self):
            if not self.local_request():
                return
            route = urlparse(self.path).path
            try:
                if route == '/api/diagram':
                    self.respond(source.snapshot())
                elif route in ('/', '/style.css', '/assets/viewer.js', '/assets/viewer.js.LEGAL.txt'):
                    relative = 'index.html' if route == '/' else route.lstrip('/')
                    mime = 'text/html' if relative.endswith('html') else 'text/css' if relative.endswith('css') else 'text/javascript' if relative.endswith('js') else 'text/plain'
                    self.respond((WEB / relative).read_bytes(), mime=mime + '; charset=utf-8')
                else:
                    self.respond({'error': 'Not found'}, 404)
            except (OSError, ValueError, RecursionError) as error:
                self.respond({'error': str(error)}, 400)

        def do_POST(self):
            if not self.local_request():
                return
            if self.path != '/api/buffer':
                self.respond({'error': 'Not found'}, 404)
                return
            try:
                size = int(self.headers.get('Content-Length', 0))
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/json' or not 0 < size <= 2_000_000:
                    raise ValueError('Expected a JSON body of at most 2 MB')
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict) or not isinstance(data.get('source'), str) or not isinstance(data.get('path'), str):
                    raise ValueError('Expected path and source strings')
                self.respond({'matched': source.update_buffer(data['path'], data['source'])})
            except (ValueError, OSError) as error:
                self.respond({'error': str(error)}, 400)

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'Diagram: {url}\nWatching: {machine_path}\nPress Ctrl+C to stop.', flush=True)
    if open_browser:
        threading.Timer(.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
