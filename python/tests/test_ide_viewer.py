"""IDE buffers, diagram updates, and export regression checks."""

from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import yaml

from teocomp.definition import parse_definition
from teocomp.designer import DiagramSource
from teocomp.export import export_diagram
from teocomp.ide import inspect_source

SOURCE = (Path(__file__).resolve().parent / 'fixtures/machines/copy.yaml').read_text()


class IDEViewerTests(unittest.TestCase):
    def test_grouped_diagnostics_point_to_original_yaml(self):
        prefix = SOURCE[:SOURCE.index('transitions:')]
        rules = ('transitions:\n  copy:\n'
                 '    - {read: [a, _], to: typo, write: [a, a], move: [R, R]}\n'
                 '    - {read: [b, _], to: copy, write: [b, b], move: [R]}\n')
        result = inspect_source(prefix + rules)
        self.assertFalse(result['valid'])
        first_line = len(prefix.splitlines()) + 3
        self.assertEqual(result['diagnostics'][0]['line'], first_line)
        self.assertEqual(result['diagnostics'][1]['line'], first_line + 1)
        self.assertIn('Unknown state', result['diagnostics'][0]['message'])
        self.assertIn('needs 2 entries', result['diagnostics'][1]['message'])
        self.assertEqual(result['suggestions']['states'], ['copy', 'accept'])

    def test_grouped_halting_source_points_to_state_key(self):
        prefix = SOURCE[:SOURCE.index('transitions:')]
        result = inspect_source(prefix + 'transitions:\n  accept:\n'
                                '    - {read: [_, _], to: accept, write: [_, _], move: [S, S]}\n')
        self.assertFalse(result['valid'])
        self.assertEqual(result['diagnostics'][0]['line'], len(prefix.splitlines()) + 2)
        self.assertIn('outgoing transitions', result['diagnostics'][0]['message'])

    def test_missing_fields_in_unsaved_buffer(self):
        data = yaml.safe_load(SOURCE)
        for field in ('name', 'model', 'tapes', 'blank', 'input_alphabet',
                      'tape_alphabet', 'states', 'start', 'accept', 'reject', 'transitions'):
            with self.subTest(field=field):
                incomplete = {key: value for key, value in data.items() if key != field}
                result = inspect_source(yaml.safe_dump(incomplete))
                self.assertFalse(result['valid'])
                self.assertEqual(result['diagnostics'][0]['message'], f'{field}: Field required')
                self.assertEqual(result['diagnostics'][0]['severity'], 'error')
                self.assertEqual(result['suggestions']['moves'], ['L', 'R', 'S'])

    def test_unsaved_diagnostics_and_completion(self):
        result = inspect_source(SOURCE.replace('to: accept', 'to: typo'))
        self.assertFalse(result['valid'])
        self.assertIn('Unknown state', result['diagnostics'][0]['message'])
        self.assertEqual(result['diagnostics'][0]['line'], 18)
        self.assertEqual(result['suggestions']['states'], ['copy', 'accept'])
        self.assertEqual(result['suggestions']['symbols'], ['a', 'b', '_'])
        self.assertTrue(inspect_source(SOURCE)['valid'])

    def test_buffer_preview_does_not_save_and_expires(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'machine.yaml'
            target.write_text(SOURCE)
            viewer = DiagramSource(target)
            initial = viewer.snapshot()
            changed = SOURCE.replace('Two-tape copy', 'Unsaved preview')
            self.assertFalse(viewer.update_buffer(str(target.with_name('other.yaml')), changed))
            self.assertTrue(viewer.update_buffer(str(target), changed))
            live = viewer.snapshot()
            self.assertEqual(live['name'], 'Unsaved preview')
            self.assertEqual(live['mode'], 'Unsaved VS Code buffer')
            self.assertNotEqual(initial['revision'], live['revision'])
            self.assertEqual(target.read_text(), SOURCE)
            with patch('teocomp.designer.time.monotonic', return_value=time.monotonic() + 4):
                self.assertEqual(viewer.snapshot()['name'], 'Two-tape copy')

    def test_saved_edits_and_invalid_buffer(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'machine.yaml'
            target.write_text(SOURCE)
            viewer = DiagramSource(target)
            old = viewer.snapshot()
            target.write_text(SOURCE.replace('Two-tape copy', 'Saved change'))
            self.assertEqual(viewer.snapshot()['name'], 'Saved change')
            self.assertNotEqual(viewer.snapshot()['revision'], old['revision'])
            viewer.update_buffer(str(target), SOURCE.replace('to: accept', 'to: typo'))
            self.assertFalse(viewer.snapshot()['valid'])

    def test_rendered_svg_and_dot_export(self):
        definition, _ = parse_definition(SOURCE)
        with tempfile.TemporaryDirectory() as directory:
            svg = export_diagram(definition, Path(directory) / 'copy.svg')
            self.assertEqual(ET.parse(svg).getroot().tag, '{http://www.w3.org/2000/svg}svg')
            dot = export_diagram(definition, Path(directory) / 'copy.dot')
            self.assertIn('state_0 -> state_1', dot.read_text())
            with self.assertRaises(ValueError):
                export_diagram(definition, Path(directory) / 'copy.png')
