"""Keep the documented examples valid and verify their intended behavior."""

from pathlib import Path
import unittest

from tm_builder.definition import parse_definition
from tm_builder.inputs import parse_inputs
from tm_builder.simulation import simulate

ROOT = Path(__file__).resolve().parents[2]


class ExampleTests(unittest.TestCase):
    def load(self, filename):
        definition, warnings = parse_definition((ROOT / 'machines' / filename).read_text())
        self.assertEqual(warnings, [], filename)
        return definition

    def setup(self, filename, definition):
        return parse_inputs((ROOT / 'inputs' / filename).read_text(), definition)

    def test_copy_examples(self):
        definition = self.load('copy.yaml')
        normal = self.setup('copy.yaml', definition)
        self.assertEqual(simulate(definition, setup=normal)['status'], 'ACCEPT')
        preloaded = self.setup('copy_preloaded.yaml', definition)
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
        writer = self.load('blank_writer.yaml').create_machine()
        self.assertEqual(writer.run(), 'ACCEPT')
        self.assertEqual(writer.tapes[0].cells, {0: 'x', -1: 'x'})
        self.assertEqual(simulate(self.load('halt.yaml'))['status'], 'HALT')
        looping = simulate(self.load('loop.yaml'), max_steps=3)
        self.assertEqual(looping['status'], 'RUNNING')
        self.assertEqual(looping['configuration']['step'], 3)
