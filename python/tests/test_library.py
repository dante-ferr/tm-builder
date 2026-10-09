"""Folder libraries, imported machines, and viewer HTTP regression checks."""
from http.client import HTTPConnection
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from tm_builder.cli import main
from tm_builder.designer import DiagramSource, create_server, library_files

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT / 'machines/copy.yaml').read_text()


class LibraryTests(unittest.TestCase):
    def test_optional_cli_machine(self):
        for args, expected in [([], None), (['view', '--no-open'], None),
                               (['view', 'machines/copy.yaml'], Path('machines/copy.yaml'))]:
            with self.subTest(args=args), patch('sys.argv', ['tm-builder', *args]), patch('tm_builder.designer.serve') as serve:
                main()
                self.assertEqual(serve.call_args.args[0], expected)

    def test_folder_listing_and_examples(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'machines').mkdir()
            (root / '.gitignore').write_text('/machines/*\n!/machines/example.yaml\n')
            for name in ('example.yaml', 'personal.yml', 'notes.txt'):
                (root / 'machines' / name).write_text(SOURCE)
            (root / 'machines/outside.yaml').symlink_to(ROOT / 'machines/copy.yaml')
            with patch('tm_builder.designer.PROJECT', root):
                self.assertEqual(library_files('machines'), [
                    {'filename': 'example.yaml', 'example': True},
                    {'filename': 'personal.yml', 'example': False}])
                (root / 'machines/new.yaml').write_text(SOURCE)
                self.assertEqual(len(library_files('machines')), 3)

    def test_selection_import_and_revisions(self):
        viewer = DiagramSource()
        self.assertFalse(viewer.snapshot()['valid'])
        viewer.select(ROOT / 'machines/copy.yaml')
        saved = viewer.snapshot()
        viewer.update_buffer(str(ROOT / 'machines/copy.yaml'), SOURCE.replace('Two-tape copy', 'Buffer'))
        viewer.select(source=SOURCE, filename='imported.yaml')
        imported = viewer.snapshot()
        self.assertEqual(imported['mode'], 'Imported file')
        self.assertNotEqual(saved['revision'], imported['revision'])
        self.assertEqual(imported['name'], 'Two-tape copy')
        self.assertFalse(viewer.update_buffer(str(ROOT / 'machines/copy.yaml'), SOURCE))
        result = viewer.simulation({'revision': imported['revision'], 'setup': 'tapes: [{contents: abba}]'})
        self.assertEqual(result['status'], 'ACCEPT')
        with self.assertRaisesRegex(ValueError, 'changed'):
            viewer.simulation({'revision': saved['revision']})

    def test_http_library_selection_and_import(self):
        server = create_server(port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = HTTPConnection('127.0.0.1', server.server_port)

        def request(method, path, data=None, headers=None):
            connection.request(method, path, json.dumps(data) if data is not None else None,
                               headers or ({'Content-Type': 'application/json'} if data is not None else {}))
            response = connection.getresponse()
            return response.status, json.loads(response.read())

        try:
            self.assertFalse(request('GET', '/api/diagram')[1]['valid'])
            status, library = request('GET', '/api/library')
            self.assertEqual(status, 200)
            self.assertIn({'filename': 'copy.yaml', 'example': True}, library['machines'])
            self.assertIn({'filename': 'binary.yaml', 'example': True}, library['inputs'])
            status, selected = request('POST', '/api/machine', {'filename': 'copy.yaml'})
            self.assertEqual(status, 200)
            self.assertTrue(selected['valid'])
            status, setup = request('GET', '/api/input?filename=copy.yaml')
            self.assertEqual(setup['source'], (ROOT / 'inputs/copy.yaml').read_text())
            status, trace = request('POST', '/api/simulate', {'revision': selected['revision'], 'setup': setup['source']})
            self.assertEqual(trace['status'], 'ACCEPT')
            for path in ('../README.md', str(ROOT / 'machines/copy.yaml'), 'absent.yaml'):
                self.assertEqual(request('POST', '/api/machine', {'filename': path})[0], 400)
            self.assertEqual(request('GET', '/api/input?filename=../README.md')[0], 400)
            self.assertEqual(request('POST', '/api/machine', {'filename': 'bad.yaml', 'source': 42})[0], 400)
            status, imported = request('POST', '/api/machine', {'filename': 'copy.yaml', 'source': SOURCE})
            self.assertEqual(status, 200)
            self.assertEqual(imported['mode'], 'Imported file')
            self.assertEqual(request('POST', '/api/simulate', {'revision': selected['revision']})[0], 400)
            self.assertEqual(request('GET', '/api/library', headers={'Origin': 'https://example.com'})[0], 403)
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_http_serves_static_export_files_and_rejects_workspace_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            output = base / 'out'
            output.mkdir()
            (output / '_next/static/chunks').mkdir(parents=True)
            (output / 'guide').mkdir()
            escaped = base / 'outside'
            escaped.mkdir()
            (escaped / 'index.html').write_text('<main>outside</main>')
            (output / 'symlink-index').mkdir()
            (output / 'symlink-index/index.html').symlink_to(escaped / 'index.html')
            (output / 'symlink-fallback.html').symlink_to(escaped / 'index.html')
            (output / 'index.html').write_text('<main>exported app</main>')
            (output / 'guide.html').write_text('<main>guide</main>')
            (output / 'guide/index.html').write_text('<main>guide directory</main>')
            (output / '_next/static/chunks/app.js').write_text('export default 1')
            (output / 'styles.css').write_text('body { color: black }')
            with patch('tm_builder.designer.WEB_OUT', output):
                server = create_server(port=0)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                connection = HTTPConnection('127.0.0.1', server.server_port)

                def get(path):
                    connection.request('GET', path)
                    response = connection.getresponse()
                    return response.status, response.getheader('Content-Type'), response.read()

                try:
                    status, mime, body = get('/')
                    self.assertEqual((status, mime, body),
                                     (200, 'text/html; charset=utf-8', b'<main>exported app</main>'))
                    self.assertEqual(get('/guide')[:2], (200, 'text/html; charset=utf-8'))
                    self.assertEqual(get('/guide/')[2], b'<main>guide directory</main>')
                    self.assertEqual(get('/_next/static/chunks/app.js')[:2],
                                     (200, 'text/javascript; charset=utf-8'))
                    self.assertEqual(get('/styles.css')[:2], (200, 'text/css; charset=utf-8'))
                    self.assertEqual(get('/missing.js')[0], 404)
                    self.assertEqual(get('/%2e%2e/AGENTS.md')[0], 404)
                    self.assertEqual(get('/symlink-index/')[0], 404)
                    self.assertEqual(get('/symlink-fallback')[0], 404)
                    self.assertEqual(get('/api/library')[0], 200)
                finally:
                    connection.close()
                    server.shutdown()
                    server.server_close()
                    thread.join()

    def test_http_accepts_only_configured_dev_origin_with_backend_host(self):
        with patch.dict('os.environ', {'TM_BUILDER_DEV_ORIGIN': 'http://127.0.0.1:3000'}):
            server = create_server(port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            connection = HTTPConnection('127.0.0.1', server.server_port)
            try:
                connection.request('GET', '/api/library', headers={
                    'Origin': 'http://127.0.0.1:3000',
                    'Host': f'127.0.0.1:{server.server_port}',
                })
                accepted = connection.getresponse()
                self.assertEqual(accepted.status, 200)
                accepted.read()
                connection.request('GET', '/api/library', headers={
                    'Origin': 'https://unrelated.example',
                    'Host': f'127.0.0.1:{server.server_port}',
                })
                rejected = connection.getresponse()
                self.assertEqual(rejected.status, 403)
                rejected.read()
                connection.request('GET', '/api/library', headers={
                    'Origin': 'http://127.0.0.1:3000',
                    'Host': '127.0.0.1:3000',
                })
                wrong_host = connection.getresponse()
                self.assertEqual(wrong_host.status, 403)
                wrong_host.read()
            finally:
                connection.close()
                server.shutdown()
                server.server_close()
                thread.join()
