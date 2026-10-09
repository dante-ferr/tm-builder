"""CSV semantics, minimal images, row pagination, and formal LaTeX rendering."""

import csv
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

from teocomp.definition import parse_definition
from teocomp.table import export_table, latex_text, table_cells, transition_table

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    return parse_definition((ROOT / 'machines' / name).read_text())[0]


class TableTests(unittest.TestCase):
    def test_bundled_rules_and_minimal_tex(self):
        for path in sorted((ROOT / 'machines').glob('*.yaml')):
            definition = parse_definition(path.read_text())[0]
            with self.subTest(machine=path.name):
                headers, rows = table_cells(definition)
                self.assertEqual(headers, ['Source', 'Read', 'Next', 'Write', 'Move'])
                self.assertEqual(len(rows), len(definition.transitions))
                document = transition_table(definition)
                self.assertIn(r'\endhead', document)
                self.assertIn(r'\pagestyle{empty}', document)
                self.assertNotIn(definition.name, document)
                self.assertNotIn('continued', document.lower())
        self.assertEqual(table_cells(load('copy.yaml'))[1][0],
                         ['copy', '(a, _)', 'copy', '(a, a)', '(R, R)'])
        self.assertIn('No transitions.', transition_table(load('halt.yaml')))

    def test_literal_latex_characters_and_unicode(self):
        self.assertEqual(latex_text('\\{}$&#_%~^'),
                         r'\textbackslash{}\{\}\$\&\#\_\%\textasciitilde{}\textasciicircum{}')
        definition = load('copy.yaml')
        definition.transitions[0].source = r'q_1\input{secret}'
        for style in ('formal', 'readable'):
            document = transition_table(definition, style=style)
            self.assertIn(latex_text(definition.transitions[0].source, wrap=True), document)
            self.assertNotIn(r'\input{secret}', document)

    def test_csv_quotes_unicode_and_rule_order(self):
        definition = load('copy.yaml')
        definition.transitions[0].source = 'q,"á"\nnext'
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'table.csv'
            with patch('teocomp.table.shutil.which', side_effect=AssertionError('tool lookup')):
                self.assertEqual(export_table(definition, target), [target])
            with target.open(newline='') as stream:
                rows = list(csv.reader(stream))
            self.assertEqual(rows[1][0], definition.transitions[0].source)
            self.assertEqual(rows[1][1:], ['(a, _)', 'copy', '(a, a)', '(R, R)'])
            self.assertEqual(len(rows), 4)

    def test_formal_ntm_sets_and_blank_notation(self):
        definition = load('nondeterministic_contains_one.yaml')
        headers, rows = table_cells(definition, 'formal')
        self.assertIn(r'\delta', headers[1])
        self.assertEqual(len(rows), len({(t.source, tuple(a[0] for a in t.tapes))
                                        for t in definition.transitions}))
        for _, result in rows:
            self.assertTrue(result.startswith(r'\(\{'))
        # No branch for a read tuple is lost; identical set members are deduplicated.
        multi = [row for row in rows if row[1].count(r'\texttt{') > 3]
        self.assertTrue(multi)
        blank = load('halt.yaml').blank
        writer = load('blank_writer.yaml')
        writer.blank = blank
        writer.transitions[0].tapes[0] = (blank, 'x', 'L')
        self.assertIn(r'\sqcup', table_cells(writer, 'formal')[1][0][0])
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'formal.csv'
            export_table(definition, target, style='formal')
            with target.open(newline='') as stream:
                exported = list(csv.reader(stream))
            self.assertEqual(exported, [headers, *rows])

    def test_readable_images_need_no_tex_and_are_tightly_sized(self):
        definition = load('loop.yaml')
        definition.transitions *= 160
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch('teocomp.table.shutil.which', side_effect=AssertionError('tool lookup')):
                split = export_table(definition, root / 'table.png', dpi=72)
                long = export_table(definition, root / 'long.png', layout='long', dpi=72)
            self.assertGreater(len(split), 1)
            split_sizes = []
            for path in split:
                with Image.open(path) as image:
                    split_sizes.append(image.size)
                    self.assertLessEqual(image.height, round(261 / 25.4 * 72))
                    self.assertAlmostEqual(image.width, 493, delta=1)
            with Image.open(long[0]) as image:
                self.assertGreater(image.height, max(h for _, h in split_sizes))
                self.assertLess(image.height, sum(h for _, h in split_sizes))
            # Re-export a small table and remove obsolete numbered files.
            unrelated = root / 'table-a4-custom.png'
            unrelated.write_bytes(b'keep')
            small = export_table(load('copy.yaml'), root / 'table.png', dpi=72)
            self.assertEqual(len(small), 1)
            self.assertFalse(split[-1].exists())
            self.assertTrue(unrelated.exists())
            with Image.open(small[0]) as image:
                self.assertLess(image.height, 150)

    def test_validation_tex_only_and_failure_preserves_images(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tex = root / 'table.tex'
            with patch('teocomp.table.shutil.which', return_value=None):
                self.assertEqual(export_table(load('copy.yaml'), tex), [tex])
                with self.assertRaisesRegex(RuntimeError, 'require'):
                    export_table(load('copy.yaml'), tex, split_a4=True)
            self.assertTrue(tex.exists())
            for options in ({'format': 'csv'}, {'dpi': 0}, {'style': 'unknown'}, {'layout': 'bad'}):
                with self.assertRaises(ValueError):
                    export_table(load('copy.yaml'), root / 'table.png', **options)
            existing = root / 'table-a4-001.png'
            existing.write_bytes(b'previous')
            with patch('teocomp.table.shutil.which', return_value='/tools/engine'), \
                 patch('teocomp.table.subprocess.run', return_value=subprocess.CompletedProcess([], 1, '', 'bad font')):
                with self.assertRaisesRegex(RuntimeError, 'LaTeX compilation failed'):
                    export_table(load('copy.yaml'), root / 'table.png', style='formal')
            self.assertEqual(existing.read_bytes(), b'previous')

    def test_cli_and_make_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'table.csv'
            with patch('sys.argv', ['teocomp', 'table', str(ROOT / 'machines/copy.yaml'),
                                    '--output', str(target), '--format', 'csv', '--style', 'formal']), \
                 patch('builtins.print'):
                from teocomp.cli import main
                main()
            self.assertIn(r'\delta', target.read_text())
        result = subprocess.run(['make', '-n', 'table', 'FORMAT=image', 'STYLE=formal', 'LAYOUT=long'],
                                cwd=ROOT, text=True, capture_output=True, check=True)
        self.assertIn('copy-formal.png', result.stdout)
        self.assertIn('--layout "long"', result.stdout)

    @unittest.skipUnless((shutil.which('lualatex') or shutil.which('xelatex')) and shutil.which('pdftoppm'),
                         'Requires a LaTeX engine and Poppler')
    def test_real_formal_split_and_long(self):
        definition = load('loop.yaml')
        template = definition.transitions[0]
        definition.transitions = [template.model_copy(deep=True) for _ in range(100)]
        definition.states = ['loop', *(f'q_{i}' for i in range(100))]
        for index, transition in enumerate(definition.transitions):
            transition.source = f'q_{index}'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            split = export_table(definition, root / 'split.png', style='formal', dpi=72)
            self.assertGreater(len(split), 1)
            for path in split:
                with Image.open(path) as image:
                    self.assertLess(image.height, 842)
                    self.assertLess(image.width, 595)
            long = export_table(definition, root / 'long.png', style='formal', layout='long', dpi=72)
            self.assertEqual(len(long), 1)
            with Image.open(long[0]) as image:
                self.assertGreater(image.height, 842)
                self.assertLess(image.width, 595)
