"""Checks for silent definition corruption and multi-tape execution semantics."""

from pathlib import Path
import unittest

import yaml

from tm_builder.definition import DefinitionError, parse_definition
from tm_builder.diagram import machine_diagram
from tm_builder.simulation import simulate

SOURCE = (Path(__file__).resolve().parent / 'fixtures/machines/copy.yaml').read_text()
SINGLE = (Path(__file__).resolve().parent / 'fixtures/machines/single_tape.yaml').read_text()
NONDETERMINISTIC = (Path(__file__).resolve().parent / 'fixtures/machines/nondeterministic_contains_one.yaml').read_text()


def grouped_source(source):
    data = yaml.safe_load(source)
    groups = {}
    for transition in data['transitions']:
        state = transition.pop('from')
        groups.setdefault(state, []).append(transition)
    data['transitions'] = groups
    return yaml.safe_dump(data, sort_keys=False)


class MachineTests(unittest.TestCase):
    def assert_invalid(self, source, message):
        with self.assertRaises(DefinitionError) as caught:
            parse_definition(source)
        self.assertIn(message, str(caught.exception))
        self.assertTrue(all(d.line >= 1 and d.column >= 1 for d in caught.exception.diagnostics))
        return caught.exception

    def test_grouped_transitions_render_and_run_like_flat_transitions(self):
        flat, _ = parse_definition(SOURCE)
        grouped, warnings = parse_definition(grouped_source(SOURCE))
        self.assertEqual(warnings, [])
        self.assertEqual(grouped.transitions, flat.transitions)
        self.assertEqual(machine_diagram(grouped).source, machine_diagram(flat).source)
        self.assertEqual(simulate(grouped, ['abba', '']), simulate(flat, ['abba', '']))

    def test_grouped_flow_mapping_and_optional_from(self):
        prefix = SOURCE[:SOURCE.index('transitions:')]
        source = prefix + 'transitions: {copy: [{from: copy, tapes: [[_, _, S], [_, _, S]], to: accept}]}\n'
        definition, _ = parse_definition(source)
        self.assertEqual(simulate(definition, ['', ''])['status'], 'ACCEPT')
        self.assert_invalid(source.replace('from: copy', 'from: accept'), "from must match outer state 'copy'")

    def test_grouped_nondeterministic_rules(self):
        definition, _ = parse_definition(grouped_source(NONDETERMINISTIC))
        self.assertEqual(simulate(definition, ['00100'])['status'], 'ACCEPT')
        self.assert_invalid(grouped_source(NONDETERMINISTIC).replace('model: nondeterministic', 'model: deterministic'),
                            'Duplicate rule')

    def test_grouped_unknown_empty_state_and_missing_fields(self):
        prefix = SOURCE[:SOURCE.index('transitions:')]
        self.assert_invalid(prefix + 'transitions: {typo: []}\n', "Unknown state 'typo'")
        for field in ('tapes', 'to'):
            with self.subTest(field=field):
                data = yaml.safe_load(grouped_source(SOURCE))
                del data['transitions']['copy'][0][field]
                self.assert_invalid(yaml.safe_dump(data), f'transitions.copy.0.{field}: Field required')
        self.assert_invalid(prefix + 'transitions: {copy: [{tapes: [[a, a, UP], [_, a, R]], to: copy}]}\n',
                            "'L', 'R' or 'S'")
        self.assert_invalid(prefix + 'transitions: {copy: {}, accept: []}\n', 'valid list')

    def test_grouped_empty_mapping_is_valid(self):
        definition, _ = parse_definition(SOURCE[:SOURCE.index('transitions:')] + 'transitions: {}\n')
        self.assertEqual(definition.transitions, [])
        self.assertEqual(simulate(definition, ['', ''])['status'], 'HALT')

    def test_missing_machine_fields_are_rejected(self):
        data = yaml.safe_load(SOURCE)
        for field in ('name', 'model', 'tapes', 'blank', 'input_alphabet',
                      'tape_alphabet', 'states', 'start', 'accept', 'reject', 'transitions'):
            with self.subTest(field=field):
                incomplete = {key: value for key, value in data.items() if key != field}
                error = self.assert_invalid(yaml.safe_dump(incomplete), f'{field}: Field required')
                self.assertEqual(len(error.diagnostics), 1)

    def test_missing_transition_fields_are_rejected(self):
        for field in ('from', 'tapes', 'to'):
            with self.subTest(field=field):
                data = yaml.safe_load(SOURCE)
                del data['transitions'][0][field]
                self.assert_invalid(yaml.safe_dump(data), f'transitions.0.{field}: Field required')

    def test_inputs_are_optional_and_empty_sets_are_valid(self):
        data = yaml.safe_load(SOURCE)
        del data['inputs']
        data.update(accept=[], reject=[], transitions=[])
        definition, _ = parse_definition(yaml.safe_dump(data))
        self.assertIsNone(definition.inputs)
        self.assertEqual(definition.accept, [])
        self.assertEqual(definition.reject, [])
        self.assertEqual(simulate(definition)['status'], 'HALT')

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
        self.assert_invalid(SOURCE + '  - {from: copy, tapes: [[a, a, S], [_, a, S]], to: accept}\n', 'Duplicate rule')

    def test_nondeterministic_rules_with_same_read_tuple_are_valid(self):
        self.assertEqual(parse_definition(NONDETERMINISTIC)[0].model, 'nondeterministic')
        self.assert_invalid(NONDETERMINISTIC.replace('model: nondeterministic', 'model: deterministic'), 'Duplicate rule')

    def test_duplicate_yaml_keys(self):
        self.assert_invalid(SOURCE + 'tapes: 3\n', 'Duplicate key')

    def test_invalid_fields_and_locations(self):
        error = self.assert_invalid(SOURCE.replace('to: accept', 'to: typo'), 'Unknown state')
        self.assertEqual(error.diagnostics[0].line, 18)
        self.assert_invalid(SOURCE.replace('[_, a, R]', '[_, a]'), 'Field required')
        self.assert_invalid(SOURCE.replace('[_, a, R]', '[_, a, UP]'), "'L', 'R' or 'S'")
        self.assert_invalid(SOURCE.replace('[a, a, R]', '[a, z, R]'), 'Unknown tape symbol')
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

    def test_state_groups_are_optional_clusters(self):
        ungrouped, _ = parse_definition(SOURCE)
        self.assertEqual(ungrouped.groups, {})
        self.assertNotIn('subgraph', machine_diagram(ungrouped).source)
        source = (Path(__file__).parents[2] / 'data/examples/machines/state_groups.yaml').read_text()
        definition, warnings = parse_definition(source)
        self.assertEqual(warnings, [])
        self.assertEqual(list(definition.groups), ['Read', 'Halt'])
        dot = machine_diagram(definition).source
        self.assertIn('subgraph cluster_0', dot)
        self.assertIn('id=group_0', dot)
        self.assertIn('label=Read', dot)
        self.assertIn('subgraph cluster_1', dot)
        self.assert_invalid(source.replace('Read: [scan, step]', 'Read: [scan, missing]'), "Unknown state 'missing'")
        self.assert_invalid(source.replace('Halt: [accept, reject]', 'Halt: [accept, step]'), "already in group 'Read'")
        self.assert_invalid(source.replace('Read: [scan, step]', 'Read: [scan, scan]'), 'listed more than once')
        self.assert_invalid(source.replace('Read: [scan, step]', 'Read: []'), 'at least 1')

    def test_graph_uses_definition_with_safe_node_ids(self):
        definition, _ = parse_definition(SOURCE.replace('copy', 'copy:scan'))
        dot = machine_diagram(definition).source
        self.assertIn('label="copy:scan"', dot)
        self.assertIn('state_0 -> state_1', dot)
        self.assertIn('id=state_0', dot)


if __name__ == '__main__':
    unittest.main()
