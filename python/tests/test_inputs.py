"""External tape setups: typing, positions, execution, and CLI integration."""

from contextlib import redirect_stdout, redirect_stderr
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import yaml

from tm_builder.cli import main
from tm_builder.definition import DefinitionError, parse_definition
from tm_builder.inputs import parse_inputs
from tm_builder.simulation import simulate

ROOT = Path(__file__).resolve().parents[1]
COPY = ROOT / 'tests/fixtures/machines/copy.yaml'


class InputTests(unittest.TestCase):
    def setUp(self):
        self.definition, _ = parse_definition(COPY.read_text())

    def test_first_tape_setup_and_blank_trailing_tape(self):
        setup = parse_inputs('tapes: [{contents: abba}]', self.definition)
        result = simulate(self.definition, setup=setup)
        self.assertEqual(result['status'], 'ACCEPT')
        machine = self.definition.create_machine(setup=setup)
        self.assertEqual(machine.tapes[1].cells, {})
        machine.run()
        self.assertEqual(''.join(machine.tapes[1].cells[i] for i in range(4)), 'abba')

    def test_arbitrary_work_tape_symbols_and_head_positions(self):
        setup = parse_inputs('tapes:\n  - contents: "_ab"\n    origin: -2\n    head: -1\n'
                             '  - contents: "_b"\n    origin: 4\n    head: 5\n', self.definition)
        for model in ('deterministic', 'nondeterministic'):
            with self.subTest(model=model):
                definition = self.definition.model_copy(update={'model': model})
                machine_tapes = setup.build_tapes(definition)
                self.assertEqual(machine_tapes[0].cells, {-2: '_', -1: 'a', 0: 'b'})
                self.assertEqual(machine_tapes[1].head, 5)
                result = simulate(definition, setup=setup)
                self.assertEqual(result['configuration']['state'], 'copy')
                self.assertEqual(result['configuration']['step'], 0)

    def test_nondeterministic_machine_with_offset_input(self):
        definition, _ = parse_definition((ROOT / 'tests/fixtures/machines/nondeterministic_contains_one.yaml').read_text())
        setup = parse_inputs('tapes: [{contents: "00100", origin: -3, head: -3}]', definition)
        result = simulate(definition, setup=setup)
        self.assertEqual(result['status'], 'ACCEPT')
        self.assertEqual(result['frames'][0]['tapes'][0]['head'], -3)

    def test_empty_setup_overrides_embedded_inputs(self):
        setup = parse_inputs('tapes: []', self.definition)
        result = simulate(self.definition, setup=setup)
        self.assertEqual(result['status'], 'ACCEPT')
        self.assertEqual(result['configuration']['step'], 1)
        self.assertTrue(all(symbol == '_' for tape in result['frames'][0]['tapes'] for symbol in tape['cells']))

    def test_no_inputs_starts_blank(self):
        definition = self.definition.model_copy(update={'inputs': None})
        self.assertEqual(simulate(definition)['configuration']['step'], 1)

    def test_cli_no_input_ignores_legacy_embedded_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'machine.yaml'
            for model in ('deterministic', 'nondeterministic'):
                with self.subTest(model=model):
                    data = self.definition.model_dump(by_alias=True)
                    data['model'] = model
                    path.write_text(yaml.safe_dump(data))
                    output = io.StringIO()
                    with patch('sys.argv', ['tm-builder', 'run', str(path)]), redirect_stdout(output):
                        main()
                    status, configuration = output.getvalue().split('\n', 1)
                    self.assertEqual(status, 'Status: ACCEPT')
                    self.assertEqual(json.loads(configuration)['step'], 1)

    def test_cli_direct_input_still_initializes_tapes(self):
        output = io.StringIO()
        with patch('sys.argv', ['tm-builder', 'run', str(COPY), '--input', 'abba', '']), redirect_stdout(output):
            main()
        self.assertEqual(json.loads(output.getvalue().split('\n', 1)[1])['step'], 5)

    def test_invalid_yaml_and_machine_compatibility(self):
        cases = [
            ('{}', 'tapes: Field required'),
            ('tapes: [{}]', 'tapes.0.contents: Field required'),
            ('tapes: [{contents: 101}]', 'valid string'),
            ('tapes: [{contents: "", head: true}]', 'valid integer'),
            ('tapes: [{contents: "", origin: "0"}]', 'valid integer'),
            ('tapes: [{contents: "", typo: 1}]', 'Extra inputs'),
            ('tapes: []\ntapes: []', 'Duplicate key'),
            ('tapes: [{contents: z}]', 'tape alphabet'),
            ('tapes: [{contents: ""}, {contents: ""}, {contents: ""}]', 'machine has 2'),
        ]
        for source, message in cases:
            with self.subTest(source=source):
                with self.assertRaises(DefinitionError) as caught:
                    parse_inputs(source, self.definition)
                self.assertIn(message, str(caught.exception))
                self.assertGreaterEqual(caught.exception.diagnostics[0].line, 1)

    def test_programmatic_conflicting_inputs_are_rejected(self):
        setup = parse_inputs('tapes: []')
        for model in ('deterministic', 'nondeterministic'):
            with self.subTest(model=model), self.assertRaisesRegex(ValueError, 'not both'):
                simulate(self.definition.model_copy(update={'model': model}), ['abba', ''], setup=setup)

    def test_cli_import_and_error_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'inputs.yaml'
            path.write_text('tapes: [{contents: abba}]')
            output = io.StringIO()
            with patch('sys.argv', ['tm-builder', 'run', str(COPY), '--inputs-file', str(path)]), redirect_stdout(output):
                main()
            self.assertIn('Status: ACCEPT', output.getvalue())
            path.write_text('tapes: [{contents: 101}]')
            errors = io.StringIO()
            with patch('sys.argv', ['tm-builder', 'run', str(COPY), '--inputs-file', str(path)]), redirect_stderr(errors):
                with self.assertRaises(SystemExit) as caught:
                    main()
            self.assertEqual(caught.exception.code, 1)
            self.assertIn(str(path), errors.getvalue())
            self.assertIn('valid string', errors.getvalue())
