"""Playback traces and live-buffer execution regression checks."""
from pathlib import Path
import tempfile
import unittest

from teocomp.definition import parse_definition
from teocomp.designer import DiagramSource
from teocomp.inputs import parse_inputs
from teocomp.simulation import simulate

ROOT = Path(__file__).resolve().parents[2]


class PlaybackTests(unittest.TestCase):
    def load(self, name):
        return parse_definition((ROOT / 'machines' / name).read_text())[0]

    def test_rule_trace_matches_writes_and_head_moves(self):
        definition = self.load('copy.yaml')
        setup = parse_inputs((ROOT / 'inputs/copy_preloaded.yaml').read_text(), definition)
        result = simulate(definition, setup=setup)
        self.assertEqual(result['status'], 'ACCEPT')
        self.assertNotIn('transition', result['frames'][0])
        for before, after in zip(result['frames'], result['frames'][1:]):
            rule = after['transition']
            self.assertEqual(before['state'], rule['source'])
            self.assertEqual(after['state'], rule['to'])
            for previous, current, (read, write, move) in zip(before['tapes'], after['tapes'], rule['tapes']):
                self.assertEqual(previous['cells'][previous['head'] - previous['left']], read)
                self.assertEqual(current['cells'][previous['head'] - current['left']], write)
                self.assertEqual(current['head'] - previous['head'], {'L': -1, 'R': 1, 'S': 0}[move])

    def test_stop_reasons_and_bounded_loop(self):
        halted = simulate(self.load('halt.yaml'))
        self.assertEqual(halted['status'], 'HALT')
        self.assertIn('No transition', halted['reason'])
        loop = simulate(self.load('loop.yaml'), max_steps=3)
        self.assertEqual(loop['status'], 'RUNNING')
        self.assertEqual([f['step'] for f in loop['frames']], [0, 1, 2, 3])
        self.assertIn('limit', loop['reason'])

    def test_nondeterministic_paths_replay_for_all_results(self):
        definition = self.load('nondeterministic_contains_one.yaml')
        for text, limit, status in [('001', 20, 'ACCEPT'), ('000', 20, 'REJECT'), ('001', 1, 'RUNNING')]:
            with self.subTest(status=status):
                result = simulate(definition, [text], max_steps=limit)
                self.assertEqual(result['status'], status)
                self.assertEqual(result['frames'][0]['step'], 0)
                self.assertEqual(result['frames'][-1]['step'], result['configuration']['step'])
                for before, after in zip(result['frames'], result['frames'][1:]):
                    self.assertEqual(after['step'], before['step'] + 1)
                    self.assertEqual(after['transition']['source'], before['state'])

    def test_execute_current_buffer_and_reject_stale_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'machine.yaml'
            text = (ROOT / 'machines/copy.yaml').read_text()
            path.write_text(text)
            viewer = DiagramSource(path)
            saved = viewer.snapshot()
            result = viewer.simulation({'revision': saved['revision'], 'setup': 'tapes:\n  - contents: abba'})
            self.assertEqual(result['status'], 'ACCEPT')
            self.assertEqual(len(result['frames']), 6)
            viewer.update_buffer(str(path), text.replace('start: copy', 'start: accept'))
            with self.assertRaisesRegex(ValueError, 'changed'):
                viewer.simulation({'revision': saved['revision']})
            live = viewer.snapshot()
            self.assertEqual(len(viewer.simulation({'revision': live['revision']})['frames']), 1)
            self.assertEqual(path.read_text(), text)
            viewer.update_buffer(str(path), 'name: incomplete')
            with self.assertRaisesRegex(ValueError, 'diagnostics'):
                viewer.simulation({'revision': viewer.snapshot()['revision']})

    def test_invalid_setup_and_limits(self):
        viewer = DiagramSource(ROOT / 'machines/copy.yaml')
        revision = viewer.snapshot()['revision']
        for limit in (0, 10001, True, 1.5):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                viewer.simulation({'revision': revision, 'max_steps': limit})
        with self.assertRaises(ValueError):
            viewer.simulation({'revision': revision, 'setup': 'tapes: [{contents: z}]'})
