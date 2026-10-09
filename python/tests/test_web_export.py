"""Browser exports invoke make with validated arguments and snapshot the machine."""

import csv
from http.client import HTTPConnection
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import zipfile

import yaml

from teocomp.definition import parse_definition
from teocomp.designer import DiagramSource, create_server
from teocomp.web_export import export_download

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT / 'machines/copy.yaml').read_text()


class WebExportTests(unittest.TestCase):
    def test_current_buffer_import_and_stale_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'machine.yaml'
            path.write_text(SOURCE)
            viewer = DiagramSource(path)
            saved = viewer.snapshot()
            viewer.update_buffer(str(path), SOURCE.replace('Two-tape copy', 'Unsaved'))
            live = viewer.snapshot()
            with patch('teocomp.web_export.export_download', return_value=(b'csv', 'text/csv', 'table.csv')) as download:
                viewer.export({'revision': live['revision'], 'format': 'csv'})
                self.assertEqual(download.call_args.args[0].name, 'Unsaved')
                with self.assertRaisesRegex(ValueError, 'changed'):
                    viewer.export({'revision': saved['revision']})
                viewer.export({'source': SOURCE, 'filename': 'another.yaml', 'format': 'csv'})
                self.assertEqual(download.call_args.args[0].name, 'Two-tape copy')
                self.assertEqual(viewer.snapshot()['revision'], live['revision'])
                viewer.select(source=SOURCE, filename='imported.yaml')
                viewer.export({'revision': viewer.snapshot()['revision']})
                self.assertEqual(download.call_args.args[1], 'imported.yaml')
            self.assertEqual(path.read_text(), SOURCE)

    def test_validation_prevents_make_expression_injection(self):
        definition = parse_definition(SOURCE)[0]
        for options in ({'name': '$(shell touch hacked)'}, {'name': '../table'},
                        {'format': '$(shell echo bad)'}, {'style': 'other'}, {'layout': 'other'},
                        {'dpi': True}, {'dpi': 601}, {'dpi': 100.5}):
            with self.subTest(options=options), patch('teocomp.web_export.subprocess.run') as run:
                with self.assertRaises(ValueError):
                    export_download(definition, 'machine.yaml', options, ROOT)
                run.assert_not_called()

    def test_make_arguments_and_numeric_zip_order(self):
        definition = parse_definition(SOURCE)[0]
        def run(command, **kwargs):
            self.assertEqual(command[1:3], ['--no-print-directory', 'table'])
            values = dict(value.split('=', 1) for value in command[3:])
            self.assertEqual(values['FORMAT'], 'image')
            self.assertEqual(values['STYLE'], 'formal')
            self.assertEqual(values['LAYOUT'], 'split')
            self.assertEqual(values['DPI'], '300')
            self.assertEqual(values['ARGS'], '')
            self.assertEqual(parse_definition(Path(values['MACHINE']).read_text())[0].name, definition.name)
            output = Path(values['OUTPUT'])
            for index in (2, 1):
                output.with_name(f'{output.stem}-a4-{index:03d}.png').write_bytes(bytes([index]))
            import subprocess
            return subprocess.CompletedProcess(command, 0, '', '')
        with patch('teocomp.web_export.subprocess.run', side_effect=run):
            body, mime, name = export_download(definition, 'copy.yaml',
                                               {'name': 'table', 'style': 'formal', 'dpi': 300}, ROOT)
        self.assertEqual((mime, name), ('application/zip', 'table.zip'))
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            self.assertEqual(archive.namelist(), ['table-a4-001.png', 'table-a4-002.png'])

    def test_http_real_make_downloads_and_errors(self):
        server = create_server(ROOT / 'machines/copy.yaml', port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = HTTPConnection('127.0.0.1', server.server_port, timeout=30)

        def request(method, route, data=None, headers=None):
            connection.request(method, route, json.dumps(data) if data is not None else None,
                               headers or ({'Content-Type': 'application/json'} if data is not None else {}))
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        try:
            current = json.loads(request('GET', '/api/diagram')[2])
            status, headers, body = request('POST', '/api/export',
                {'revision': current['revision'], 'format': 'csv', 'style': 'readable', 'name': 'my-table'})
            self.assertEqual(status, 200)
            self.assertIn('my-table.csv', headers['Content-Disposition'])
            rows = list(csv.reader(io.StringIO(body.decode())))
            self.assertEqual(rows[1], ['copy', '(a, _)', 'copy', '(a, a)', '(R, R)'])
            status, headers, body = request('POST', '/api/export',
                {'source': SOURCE, 'filename': 'imported.yaml', 'format': 'csv', 'style': 'formal'})
            self.assertEqual(status, 200)
            self.assertIn(r'\delta', body.decode())
            status, headers, body = request('POST', '/api/export',
                {'revision': current['revision'], 'format': 'image', 'layout': 'long', 'dpi': 72})
            self.assertEqual(status, 200)
            self.assertEqual(headers['Content-Type'], 'image/png')
            self.assertTrue(body.startswith(b'\x89PNG'))
            # Build a valid large machine to exercise the actual make-to-ZIP path.
            data = yaml.safe_load(SOURCE)
            template = data['transitions'][0]
            data['states'] += [f'q{i}' for i in range(100)]
            data['transitions'] = [{**template, 'from': f'q{i}'} for i in range(100)]
            status, headers, body = request('POST', '/api/export',
                {'source': yaml.safe_dump(data), 'filename': 'large.yaml', 'format': 'image', 'dpi': 72})
            self.assertEqual(status, 200)
            self.assertEqual(headers['Content-Type'], 'application/zip')
            with zipfile.ZipFile(io.BytesIO(body)) as archive:
                self.assertGreater(len(archive.namelist()), 1)
            self.assertEqual(request('POST', '/api/export', {'revision': 'stale'})[0], 400)
            self.assertEqual(request('POST', '/api/export', {'source': 'bad: yaml', 'filename': 'bad.yaml'})[0], 400)
            self.assertEqual(request('POST', '/api/export', {'revision': current['revision'], 'name': '../outside'})[0], 400)
            self.assertEqual(request('POST', '/api/export', {'revision': current['revision']},
                                     headers={'Origin': 'https://example.com', 'Content-Type': 'application/json'})[0], 403)
            self.assertEqual(json.loads(request('GET', '/api/diagram')[2])['revision'], current['revision'])
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            thread.join()
