"""Playback traces and live-buffer execution regression checks."""
from pathlib import Path
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from tm_builder.definition import parse_definition
from tm_builder.designer import DiagramSource
from tm_builder.inputs import parse_inputs
from tm_builder.simulation import simulate
from tm_builder.execution_limits import budget_for_sample

ROOT = Path(__file__).resolve().parents[2]


class PlaybackTests(unittest.TestCase):
    def load(self, name):
        return parse_definition((ROOT / 'data/examples/machines' / name).read_text())[0]

    def test_rule_trace_matches_writes_and_head_moves(self):
        definition = self.load('copy.yaml')
        setup = parse_inputs((ROOT / 'data/examples/inputs/copy_preloaded.yaml').read_text(), definition)
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
            text = (ROOT / 'data/examples/machines/copy.yaml').read_text()
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
        viewer = DiagramSource(ROOT / 'data/examples/machines/copy.yaml')
        revision = viewer.snapshot()['revision']
        for limit in (0, 10_000_001, True, 1.5):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                viewer.simulation({'revision': revision, 'max_steps': limit})
        with self.assertRaises(ValueError):
            viewer.simulation({'revision': revision, 'setup': 'tapes: [{contents: z}]'})

    def test_calibrated_budget_scales_with_measured_speed_and_is_bounded(self):
        self.assertEqual(budget_for_sample(50000, .1), 2_500_000)
        self.assertEqual(budget_for_sample(50000, .2), 1_250_000)
        self.assertEqual(budget_for_sample(50000, 100), 10000)
        self.assertEqual(budget_for_sample(50000, 0), 10_000_000)

    def test_compact_trace_replays_exactly_like_snapshots(self):
        definition = self.load('copy.yaml')
        setup = parse_inputs((ROOT / 'data/examples/inputs/copy_preloaded.yaml').read_text(), definition)
        expected = simulate(definition, setup=setup)
        compact = simulate(definition, setup=setup, compact=True)
        self.assertEqual(compact['configuration'], expected['configuration'])
        recording = compact['recording']
        tapes = [{'head': tape['head'], 'cells': dict(tape['cells'])} for tape in recording['initial']]
        for step, rule_index in enumerate(recording['steps'], 1):
            rule = recording['rules'][rule_index]
            self.assertEqual(rule, expected['frames'][step]['transition'])
            for tape, (_, write, move), frame in zip(tapes, rule['tapes'], expected['frames'][step]['tapes']):
                tape['cells'][tape['head']] = write
                tape['head'] += {'L': -1, 'R': 1, 'S': 0}[move]
                self.assertEqual(tape['head'], frame['head'])
                self.assertEqual([tape['cells'].get(frame['left'] + offset, recording['blank'])
                                  for offset in range(17)], frame['cells'])

    def test_infinite_machine_stops_at_user_limit(self):
        result = simulate(self.load('loop.yaml'), max_steps=12000)
        self.assertEqual(result['status'], 'RUNNING')
        self.assertIn('limit', result['reason'])
        self.assertEqual(result['configuration']['step'], 12000)
        self.assertEqual(len(result['recording']['steps']), 12000)

    def test_background_execution_does_not_block_source_changes(self):
        viewer = DiagramSource(ROOT / 'data/examples/machines/copy.yaml')
        revision = viewer.snapshot()['revision']
        started, release = threading.Event(), threading.Event()

        def slow_simulate(definition, **kwargs):
            started.set()
            if not release.wait(5):
                raise TimeoutError('Simulation was not released')
            return simulate(definition, **kwargs)

        with ThreadPoolExecutor(max_workers=2) as threads, patch('tm_builder.designer.simulate', slow_simulate):
            result = threads.submit(viewer.simulation, {'revision': revision, 'setup': 'tapes: [{contents: abba}]'})
            try:
                self.assertTrue(started.wait(2))

                def change_machine():
                    self.assertEqual(viewer.snapshot()['revision'], revision)
                    viewer.select(ROOT / 'data/examples/machines/halt.yaml')
                    return viewer.snapshot()

                current = threads.submit(change_machine).result(timeout=2)
                self.assertNotEqual(current['revision'], revision)
            finally:
                release.set()
            original = result.result(timeout=2)
            self.assertEqual(original['revision'], revision)
            self.assertEqual(original['status'], 'ACCEPT')
            self.assertEqual(original['frames'][-1]['step'], 5)
