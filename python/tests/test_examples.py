"""Keep the documented examples valid and verify their intended behavior."""

from pathlib import Path
import unittest

from tm_builder.definition import parse_definition
from tm_builder.diagram import machine_diagram
from tm_builder.inputs import parse_inputs
from tm_builder.simulation import simulate

ROOT = Path(__file__).resolve().parents[2]


class ExampleTests(unittest.TestCase):
    def load(self, filename):
        definition, warnings = parse_definition((ROOT / 'data/examples/machines' / filename).read_text())
        self.assertEqual(warnings, [], filename)
        return definition

    def setup(self, filename, definition):
        return parse_inputs((ROOT / 'data/examples/inputs' / filename).read_text(), definition)

    def test_copy_examples(self):
        definition = self.load('copy.yaml')
        normal = self.setup('copy.yaml', definition)
        self.assertEqual(simulate(definition, setup=normal)['status'], 'ACCEPT')
        preloaded = parse_inputs('tapes:\n  - {contents: abba, origin: -2, head: -2}\n  - {contents: _bb, head: 4}\n', definition)
        machine = definition.create_machine(setup=preloaded)
        self.assertEqual(machine.run(), 'ACCEPT')
        self.assertEqual(''.join(machine.tapes[1].cells[i] for i in range(4, 8)), 'abba')
        self.assertEqual(''.join(machine.tapes[1].cells[i] for i in range(1, 3)), 'bb')
        self.assertEqual(machine.tapes[0].head, 2)
        self.assertEqual(machine.tapes[1].head, 8)

    def test_binary_examples(self):
        for filename in ('single_tape.yaml', 'nondeterministic_contains_one.yaml'):
            with self.subTest(machine=filename):
                definition = self.load(filename)
                self.assertEqual(simulate(definition, setup=self.setup('binary.yaml', definition))['status'], 'ACCEPT')
                self.assertEqual(simulate(definition, ['000'])['status'], 'REJECT')
                self.assertEqual(simulate(definition, [''])['status'], 'REJECT')
        self.assertEqual(simulate(self.load('single_tape.yaml'), ['10'])['status'], 'REJECT')
        self.assertEqual(simulate(self.load('nondeterministic_contains_one.yaml'), ['10'])['status'], 'ACCEPT')

    def test_examples_without_inputs(self):
        self.assertEqual(simulate(self.load('halt.yaml'))['status'], 'HALT')

    def test_state_groups_and_four_group_ring(self):
        grouped = self.load('state_groups.yaml')
        self.assertEqual(list(grouped.groups), ['Read', 'Halt'])
        self.assertEqual(simulate(grouped, ['a'])['status'], 'ACCEPT')
        self.assertEqual(simulate(grouped, ['aa'])['status'], 'ACCEPT')
        self.assertEqual(simulate(grouped, [''])['status'], 'REJECT')
        self.assertEqual(machine_diagram(grouped).source.count('subgraph cluster_'), 2)
        ring = self.load('four_groups.yaml')
        self.assertEqual(list(ring.groups), ['North', 'East', 'South', 'West'])
        self.assertEqual(machine_diagram(ring).source.count('subgraph cluster_'), 4)
        home = {state: name for name, members in ring.groups.items() for state in members}
        neighbors = {}
        for rule in ring.transitions:
            left, right = home[rule.source], home[rule.to]
            if left == right:
                continue
            neighbors.setdefault(left, set()).add(right)
            neighbors.setdefault(right, set()).add(left)
        self.assertEqual({name: len(linked) for name, linked in neighbors.items()},
                         {'North': 2, 'East': 2, 'South': 2, 'West': 2})
        setup = self.setup('four_groups.yaml', ring)
        accepted = simulate(ring, setup=setup)
        self.assertEqual(accepted['status'], 'ACCEPT')
        self.assertEqual(accepted['configuration']['step'], 3)
        self.assertEqual(simulate(ring, [''])['status'], 'HALT')

    def test_binary_counter_stress_trace(self):
        definition = self.load('binary_counter.yaml')
        setup = self.setup('binary_counter.yaml', definition)
        result = simulate(definition, setup=setup, max_steps=10000)
        self.assertEqual(result['status'], 'ACCEPT')
        self.assertEqual(result['configuration']['step'], 8190)
        self.assertEqual(len(result['frames']), 8191)
        self.assertEqual([frame['step'] for frame in result['frames']], list(range(8191)))
        for index in (8190, 4095, 0, 7000, 12, 1):
            self.assertEqual(result['frames'][index]['step'], index)
        machine = definition.create_machine(setup=setup)
        self.assertEqual(machine.run(max_steps=10000), 'ACCEPT')
        self.assertEqual([machine.tapes[0].cells.get(i) for i in range(11)], ['0'] * 11)
        bounded = simulate(definition, setup=setup, max_steps=1000)
        self.assertEqual(bounded['status'], 'RUNNING')
        self.assertEqual(len(bounded['frames']), 1001)

    def test_million_step_counter(self):
        definition = self.load('binary_counter.yaml')
        setup = self.setup('binary_counter_million.yaml', definition)
        result = simulate(definition, setup=setup, max_steps=1_000_000)
        self.assertEqual(result['status'], 'ACCEPT')
        self.assertEqual(result['configuration']['step'], 1_000_000)
        self.assertEqual(len(result['recording']['steps']), 1_000_000)
        self.assertEqual(result['frames'], [])
        self.assertEqual(result['recording']['rules'][result['recording']['steps'][-1]]['to'], 'accept')
