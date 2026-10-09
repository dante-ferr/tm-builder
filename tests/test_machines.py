"""Checks for silent definition corruption and multi-tape execution semantics."""

from pathlib import Path
import unittest

from teocomp.definition import DefinitionError, parse_definition
from teocomp.diagram import machine_diagram
from teocomp.simulation import simulate

SOURCE = (Path(__file__).resolve().parents[1] / 'machines/copy.yaml').read_text()
SINGLE = (Path(__file__).resolve().parents[1] / 'machines/single_tape.yaml').read_text()
NONDETERMINISTIC = (Path(__file__).resolve().parents[1] / 'machines/nondeterministic_contains_one.yaml').read_text()


class MachineTests(unittest.TestCase):
    def assert_invalid(self, source, message):
        with self.assertRaises(DefinitionError) as caught:
            parse_definition(source)
        self.assertIn(message, str(caught.exception))
        self.assertTrue(all(d.line >= 1 and d.column >= 1 for d in caught.exception.diagnostics))
        return caught.exception

    def test_copy_and_empty_input(self):
        definition, warnings = parse_definition(SOURCE)
        self.assertEqual(warnings, [])
        for value in ('', 'a', 'abba', 'baaba'):
            machine = definition.create_machine([value, ''])
            self.assertEqual(machine.run(), 'ACCEPT')
            for tape in machine.tapes:
                self.assertEqual(''.join(tape.cells.get(i, '_') for i in range(len(value))), value)

    def test_single_tape_definition_runs(self):
        definition, warnings = parse_definition(SINGLE)
        self.assertEqual(definition.tapes, 1)
        self.assertEqual(warnings, [])
        for value, expected in [('101', 'ACCEPT'), ('0', 'REJECT'), ('', 'REJECT')]:
            self.assertEqual(simulate(definition, [value])['status'], expected)

    def test_nondeterministic_branches_accept_if_any_branch_accepts(self):
        definition, warnings = parse_definition(NONDETERMINISTIC)
        self.assertEqual(warnings, [])
        self.assertEqual(definition.model, 'nondeterministic')
        for value in ('1', '00100', '0001', '01011'):
            result = simulate(definition, [value])
            self.assertEqual(result['status'], 'ACCEPT')
            self.assertEqual(result['frames'][-1]['state'], 'accept')
        for value in ('', '0', '000'):
            self.assertEqual(simulate(definition, [value])['status'], 'REJECT')
        with self.assertRaisesRegex(ValueError, '[Nn]ondeterministic'):
            definition.create_machine()

    def test_nondeterministic_depth_limit_reports_running(self):
        definition, _ = parse_definition(NONDETERMINISTIC)
        result = simulate(definition, ['00100'], max_steps=1)
        self.assertEqual(result['status'], 'RUNNING')

    def test_duplicate_rules_do_not_silently_override(self):
        self.assert_invalid(SOURCE + '  - {from: copy, read: [a, _], to: accept, write: [a, a], move: [S, S]}\n', 'Duplicate rule')

    def test_nondeterministic_rules_with_same_read_tuple_are_valid(self):
        self.assertEqual(parse_definition(NONDETERMINISTIC)[0].model, 'nondeterministic')
        self.assert_invalid(NONDETERMINISTIC.replace('model: nondeterministic', 'model: deterministic'), 'Duplicate rule')

    def test_duplicate_yaml_keys(self):
        self.assert_invalid(SOURCE + 'tapes: 3\n', 'Duplicate key')

    def test_invalid_fields_and_locations(self):
        error = self.assert_invalid(SOURCE.replace('to: accept', 'to: typo'), 'Unknown state')
        self.assertEqual(error.diagnostics[0].line, 17)
        self.assert_invalid(SOURCE.replace('move: [R, R]', 'move: [R]'), 'needs 2 entries')
        self.assert_invalid(SOURCE.replace('move: [R, R]', 'move: [UP, R]'), "'L', 'R' or 'S'")
        self.assert_invalid(SOURCE.replace('write: [a, a]', 'write: [z, a]'), 'Unknown tape symbol')
        self.assert_invalid(SOURCE.replace('tapes: 2', 'tapes: "2"'), 'integer')
        self.assert_invalid(SOURCE.replace('reject: []', 'reject: [accept]'), 'disjoint')
        self.assert_invalid(SOURCE.replace('from: copy', 'from: accept'), 'outgoing transitions')

    def test_trace_includes_initial_and_final_configurations(self):
        definition, _ = parse_definition(SOURCE)
        result = simulate(definition)
        self.assertEqual(result['status'], 'ACCEPT')
        self.assertEqual([f['step'] for f in result['frames']], list(range(6)))
        self.assertEqual(result['frames'][0]['tapes'][1]['head'], 0)
        self.assertEqual(result['frames'][-1]['state'], 'accept')

    def test_limit_halt_and_terminal_start(self):
        definition, _ = parse_definition(SOURCE)
        self.assertEqual(simulate(definition, max_steps=2)['status'], 'RUNNING')
        prefix = SOURCE[:SOURCE.index('transitions:')]
        halted, _ = parse_definition(prefix + 'transitions: []\n')
        self.assertEqual(simulate(halted)['status'], 'HALT')
        accepted, _ = parse_definition(prefix.replace('start: copy', 'start: accept') + 'transitions: []\n')
        self.assertEqual(simulate(accepted)['status'], 'ACCEPT')
        self.assertEqual(len(simulate(accepted)['frames']), 1)

    def test_alphabet_and_input_validation(self):
        self.assert_invalid(SOURCE.replace('tape_alphabet: [a, b, _]', 'tape_alphabet: [a, _]'), 'subset')
        self.assert_invalid(SOURCE.replace('inputs: [abba, ""]', 'inputs: [abba]'), 'needs 2 strings')
        self.assert_invalid(SOURCE.replace('inputs: [abba, ""]', 'inputs: [xyz, ""]'), 'outside input_alphabet')
        definition, _ = parse_definition(SOURCE)
        with self.assertRaises(ValueError):
            simulate(definition, ['xyz', ''])

    def test_graph_uses_definition_with_safe_node_ids(self):
        definition, _ = parse_definition(SOURCE.replace('copy', 'copy:scan'))
        dot = machine_diagram(definition).source
        self.assertIn('label="copy:scan"', dot)
        self.assertIn('state_0 -> state_1', dot)
        self.assertIn('id=state_0', dot)


if __name__ == '__main__':
    unittest.main()
