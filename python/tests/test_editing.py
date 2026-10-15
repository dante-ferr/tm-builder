"""Visual edits must produce valid YAML without losing concurrent file changes."""
from pathlib import Path
from http.client import HTTPConnection
import json
import threading
import tempfile
import unittest

import yaml

from tm_builder.definition import parse_definition
from tm_builder.designer import DiagramSource, create_server
from tm_builder.editing import edit_yaml

SOURCE = (Path(__file__).parent / 'fixtures/machines/copy.yaml').read_text()


class EditingTests(unittest.TestCase):
    def test_only_changed_fields_are_replaced(self):
        source = '# My machine\n' + SOURCE + '\n# Keep my notes\n'
        result = edit_yaml(source, {'name': 'Visual copy'})
        self.assertEqual(result, source.replace('Two-tape copy', 'Visual copy'))
        self.assertEqual(parse_definition(result)[0].name, 'Visual copy')

    def test_multitape_rule_round_trip_and_grouped_syntax(self):
        definition, _ = parse_definition(SOURCE)
        rules = definition.model_dump(by_alias=True, mode='json')['transitions']
        # Exercise all bundled YAML styles, including grouped transitions.
        for machine in (Path(__file__).parents[2] / 'data/examples/machines').glob('*.yaml'):
            with self.subTest(machine=machine.name):
                text = machine.read_text()
                d, _ = parse_definition(text)
                transitions = d.model_dump(by_alias=True, mode='json')['transitions']
                updated = edit_yaml(text, {'transitions': transitions[:-1]})
                self.assertEqual(len(parse_definition(updated)[0].transitions), max(0, len(transitions) - 1))
                self.assertEqual(type(yaml.safe_load(text)['transitions']), type(yaml.safe_load(updated)['transitions']))
        rules[0]['tapes'][0][2] = 'S'
        result = edit_yaml(SOURCE, {'transitions': rules})
        self.assertEqual(parse_definition(result)[0].transitions[0].tapes[0][2], 'S')

    def test_invalid_edits_do_not_write(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'copy.yaml'
            path.write_text(SOURCE)
            source = DiagramSource(path)
            for changes in ({'start': 'typo'}, {'tapes': 1}, {'accept': ['copy']}, {'unknown': 1}, None):
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    source.edit({'revision': source.snapshot()['revision'], 'changes': changes})
                self.assertEqual(path.read_text(), SOURCE)

    def test_saves_and_rejects_stale_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'copy.yaml'
            path.write_text(SOURCE)
            path.chmod(0o640)
            source = DiagramSource(path)
            initial = source.snapshot()
            updated = source.edit({'revision': initial['revision'], 'changes': {'name': 'Saved in UI'}})
            self.assertEqual(updated['name'], 'Saved in UI')
            self.assertEqual(updated['source'], path.read_text())
            self.assertEqual(path.stat().st_mode & 0o777, 0o640)
            self.assertEqual(updated['definition']['transitions'][0]['from'], 'copy')
            with self.assertRaisesRegex(ValueError, 'Machine changed'):
                source.edit({'revision': initial['revision'], 'changes': {'name': 'Stale'}})
            path.write_text(SOURCE.replace('Two-tape copy', 'External edit'))
            with self.assertRaisesRegex(ValueError, 'Machine changed'):
                source.edit({'revision': updated['revision'], 'changes': {'name': 'Overwrite'}})
            self.assertIn('External edit', path.read_text())

    def test_live_buffers_and_imports(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'copy.yaml'
            path.write_text(SOURCE)
            source = DiagramSource(path)
            source.update_buffer(str(path), SOURCE.replace('Two-tape copy', 'Unsaved'))
            with self.assertRaisesRegex(ValueError, 'Save your VS Code'):
                source.edit({'revision': source.snapshot()['revision'], 'changes': {'name': 'UI'}})
            self.assertEqual(path.read_text(), SOURCE)
            source.select(source=SOURCE, filename='import.yaml')
            result = source.edit({'revision': source.snapshot()['revision'], 'changes': {'name': 'Imported edit'}})
            self.assertEqual(result['mode'], 'Imported file')
            self.assertEqual(result['name'], 'Imported edit')
            self.assertEqual(path.read_text(), SOURCE)

    def test_state_rename_updates_references(self):
        definition, _ = parse_definition(SOURCE)
        data = definition.model_dump(by_alias=True, mode='json', exclude_none=True)
        data['states'] = ['run' if s == 'copy' else s for s in data['states']]
        data['start'] = 'run'
        for r in data['transitions']:
            r['from'] = 'run' if r['from'] == 'copy' else r['from']
            r['to'] = 'run' if r['to'] == 'copy' else r['to']
        updated, _ = parse_definition(edit_yaml(SOURCE, data))
        self.assertEqual(updated.start, 'run')
        self.assertNotIn('copy', updated.states)
        self.assertTrue(all(r.source == 'run' for r in updated.transitions))

    def test_http_edits_validate_revisions_and_origin(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'copy.yaml'
            path.write_text(SOURCE)
            server = create_server(path, port=0, workspace=Path(directory))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            connection = HTTPConnection('127.0.0.1', server.server_port)
            def request(route, data=None, origin=None):
                headers = {'Content-Type': 'application/json'}
                if origin:
                    headers['Origin'] = origin
                connection.request('POST' if data is not None else 'GET', route,
                                   json.dumps(data) if data is not None else None, headers)
                response = connection.getresponse()
                return response.status, json.loads(response.read())
            try:
                _, current = request('/api/diagram')
                edit = {'revision': current['revision'], 'changes': {'name': 'From HTTP'}}
                self.assertEqual(request('/api/edit', edit, 'https://example.com')[0], 403)
                self.assertEqual(path.read_text(), SOURCE)
                status, updated = request('/api/edit', edit)
                self.assertEqual(status, 200)
                self.assertEqual(updated['name'], 'From HTTP')
                self.assertIn('From HTTP', path.read_text())
                self.assertEqual(request('/api/edit', edit)[0], 400)
                self.assertEqual(request('/api/simulate', {'revision': current['revision']})[0], 400)
                invalid = {'revision': updated['revision'], 'changes': {'start': 'unknown'}}
                self.assertEqual(request('/api/edit', invalid)[0], 400)
                self.assertEqual(request('/api/diagram')[1]['revision'], updated['revision'])
            finally:
                connection.close()
                server.shutdown()
                server.server_close()
                thread.join()
