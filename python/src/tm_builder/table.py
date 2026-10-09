"""Minimal transition tables: CSV, readable PNGs, and formal LaTeX PNGs."""

import csv
from pathlib import Path
import shutil
import subprocess
import tempfile

from tm_builder.definition import MachineDefinition

_ESCAPES = {
    '\\': r'\textbackslash{}', '{': r'\{', '}': r'\}',
    '$': r'\$', '&': r'\&', '#': r'\#', '_': r'\_',
    '%': r'\%', '~': r'\textasciitilde{}', '^': r'\textasciicircum{}',
}


def latex_text(value: str, *, wrap: bool = False) -> str:
    separator = r'\allowbreak{}' if wrap else ''
    return separator.join(_ESCAPES.get(c, c) if not c.isspace() else ' ' for c in value)


def _state(value):
    return r'\texttt{' + latex_text(value, wrap=True) + '}'


def _tuple(values, *, latex=False):
    separator = r',\allowbreak{} ' if latex else ', '
    return '(' + separator.join(_state(v) if latex else v for v in values) + ')'


def _math_symbol(value, blank):
    return r'\sqcup' if value == blank else r'\text{' + _state(value) + '}'


def _math_tuple(values, blank):
    values = list(values)
    if len(values) == 1:
        return _math_symbol(values[0], blank)
    return '(' + r',\allowbreak{} '.join(_math_symbol(v, blank) for v in values) + ')'


def table_cells(definition: MachineDefinition, style='readable', *, latex=False):
    """Formal NTM rows group all alternatives for each (state, read tuple)."""
    if style == 'readable':
        rows = [[_state(t.source) if latex else t.source,
                 _tuple((a[0] for a in t.tapes), latex=latex),
                 _state(t.to) if latex else t.to,
                 _tuple((a[1] for a in t.tapes), latex=latex),
                 _tuple((a[2] for a in t.tapes), latex=latex)] for t in definition.transitions]
        return ['Source', 'Read', 'Next', 'Write', 'Move'], rows
    groups = {}
    for t in definition.transitions:
        key = (t.source, tuple(a[0] for a in t.tapes))
        groups.setdefault(key, []).append(t)
    rows = []
    for (source, read), transitions in groups.items():
        left = r'(\text{' + _state(source) + '}, ' + _math_tuple(read, definition.blank) + ')'
        alternatives = []
        for t in transitions:
            alternatives.append(r'(\text{' + _state(t.to) + '}, '
                                + _math_tuple((a[1] for a in t.tapes), definition.blank) + ', '
                                + _math_tuple((a[2] for a in t.tapes), None) + ')')
        right = alternatives[0]
        if definition.model == 'nondeterministic':
            right = r'\{' + r',\allowbreak{} '.join(dict.fromkeys(alternatives)) + r'\}'
        rows.append([r'\(' + left + r'\)', r'\(' + right + r'\)'])
    return [r'\((q,\boldsymbol{a})\)', r'\(\delta(q,\boldsymbol{a})\)'], rows


def transition_table(definition: MachineDefinition, *, style='readable', layout='split') -> str:
    headers, rows = table_cells(definition, style, latex=True)
    widths = ('.18', '.23', '.18', '.23', '.18') if style == 'readable' else ('.40', '.60')
    columns = ''.join(r'>{\raggedright\arraybackslash}p{\dimexpr' + w
                      + r'\linewidth-2\tabcolsep\relax}' for w in widths)
    header = ' & '.join(r'\textbf{' + h + '}' for h in headers) + r' \\'
    body = [('\\rowcolor{black!4} ' if i % 2 == 0 else '') + ' & '.join(row) + r' \\'
            for i, row in enumerate(rows)]
    if not body:
        body = [r'\multicolumn{' + str(len(headers)) + r'}{c}{No transitions.} \\']
    preamble = [r'\documentclass[10pt,a4paper]{article}',
                r'\usepackage[margin=18mm]{geometry}', r'\usepackage{fontspec,amsmath}',
                r'\usepackage{array,booktabs,longtable}', r'\usepackage[table]{xcolor}',
                r'\pagestyle{empty}', r'\setlength{\parindent}{0pt}',
                r'\setlength{\tabcolsep}{5pt}', r'\renewcommand{\arraystretch}{1.3}']
    if layout == 'long':
        preamble += [r'\usepackage{iftex}', r'\ifluatex\usepackage{luatex85}\fi',
                     r'\usepackage[active,tightpage]{preview}', r'\PreviewEnvironment{tabular}',
                     r'\setlength{\PreviewBorder}{0pt}']
        content = [r'\begin{tabular}{@{}' + columns + '@{}}', r'\toprule', header,
                   r'\midrule', *body, r'\bottomrule', r'\end{tabular}']
    else:
        content = [r'\begin{longtable}{@{}' + columns + '@{}}', r'\toprule', header,
                   r'\midrule', r'\endfirsthead', r'\toprule', header, r'\midrule',
                   r'\endhead', r'\bottomrule', r'\endfoot', r'\bottomrule',
                   r'\endlastfoot', *body, r'\end{longtable}']
    return '\n'.join([*preamble, r'\begin{document}', *content, r'\end{document}', ''])


def _run(command, directory, description):
    try:
        # LuaLaTeX needs a writable cache even when its fonts are already cached.
        import os
        environment = dict(os.environ, TEXMFCACHE=str(directory / 'tex-cache'),
                           TEXMFVAR=str(directory / 'tex-cache'))
        (directory / 'tex-cache').mkdir(exist_ok=True)
        result = subprocess.run(command, cwd=directory, env=environment,
                                capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f'{description} timed out after 120 seconds.') from error
    if result.returncode:
        detail = (result.stderr.strip() or result.stdout.strip())[-4000:]
        raise RuntimeError(f'{description} failed:\n{detail}')


def _latex_images(definition, work, style, layout, dpi):
    from PIL import Image, ImageChops
    engine = shutil.which('lualatex') or shutil.which('xelatex')
    rasterizer = shutil.which('pdftoppm')
    if not engine or not rasterizer:
        raise RuntimeError('Formal images require LuaLaTeX or XeLaTeX and pdftoppm (Poppler) on PATH.')
    (work / 'table.tex').write_text(transition_table(definition, style=style, layout=layout), encoding='utf-8')
    for _ in range(2):
        _run([engine, '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'table.tex'],
             work, 'LaTeX compilation')
    _run([rasterizer, '-png', '-r', str(dpi), 'table.pdf', 'page'], work, 'Image rendering')
    pages = sorted(work.glob('page-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
    if not pages:
        raise RuntimeError('Image rendering produced no pages.')
    if layout == 'long' and len(pages) != 1:
        raise RuntimeError('The long table exceeds LaTeX page limits; use LAYOUT=split.')
    images = []
    for page in pages:
        with Image.open(page) as source:
            image = source.convert('RGB')
        bounds = ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()
        images.append(image.crop(bounds) if bounds else image)
    return images


def _font(size, bold=False):
    from PIL import ImageFont
    name = 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
    for path in (name, '/usr/share/fonts/TTF/' + name,
                 '/usr/share/fonts/truetype/dejavu/' + name):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def _readable_images(definition, layout, dpi):
    from PIL import Image, ImageDraw
    headers, rows = table_cells(definition)
    width, limit = round(174 * dpi / 25.4), round(261 * dpi / 25.4)
    pad = max(2, round(4 * dpi / 72))
    font, bold = _font(round(10 * dpi / 72)), _font(round(10 * dpi / 72), True)
    line = round(13 * dpi / 72)
    widths = [round(width * w) for w in (.18, .23, .18, .23)]
    widths.append(width - sum(widths))

    def wrap(text, available):
        lines, current = [], ''
        for character in text:
            if character == '\n' or (current and font.getlength(current + character) > available):
                lines.append(current)
                current = ''
            if character != '\n':
                current += character
        return lines + [current]

    prepared = []
    for row in rows:
        cells = [wrap(text, w - 2 * pad) for text, w in zip(row, widths)]
        prepared.append((cells, max(map(len, cells)) * line + 2 * pad))
    if not prepared:
        prepared = [([['No transitions.'], [], [], [], []], line + 2 * pad)]
    header_height = line + 2 * pad
    groups, group, height = [], [], header_height + 2
    for row in prepared:
        if layout == 'split' and header_height + row[1] + 2 > limit:
            raise ValueError('A transition is taller than an A4 piece; use LAYOUT=long.')
        if layout == 'split' and group and height + row[1] > limit:
            groups.append(group)
            group, height = [], header_height + 2
        group.append(row)
        height += row[1]
    groups.append(group)
    images = []
    for group in groups:
        image = Image.new('RGB', (width, header_height + sum(h for _, h in group) + 2), 'white')
        draw = ImageDraw.Draw(image)
        draw.line((0, 0, width, 0), fill='black', width=2)
        x = 0
        for heading, w in zip(headers, widths):
            draw.text((x + pad, pad), heading, font=bold, fill='black')
            x += w
        draw.line((0, header_height, width, header_height), fill='black')
        y = header_height + 1
        for index, (cells, h) in enumerate(group):
            if index % 2 == 0:
                draw.rectangle((0, y, width, y + h - 1), fill='#f4f4f4')
            x = 0
            for cell, w in zip(cells, widths):
                for offset, text in enumerate(cell):
                    draw.text((x + pad, y + pad + offset * line), text, font=font, fill='black')
                x += w
            y += h
        draw.line((0, y, width, y), fill='black')
        images.append(image)
    return images


def export_table(definition: MachineDefinition, target: Path, *, format=None,
                 style='readable', layout='split', split_a4=False, dpi=200) -> list[Path]:
    format = format or {'.tex': 'tex', '.csv': 'csv', '.png': 'image'}.get(target.suffix.lower())
    if format not in ('tex', 'csv', 'image') or style not in ('readable', 'formal') or layout not in ('split', 'long'):
        raise ValueError('Choose FORMAT=csv|image|tex, STYLE=readable|formal, LAYOUT=split|long.')
    expected = {'tex': '.tex', 'csv': '.csv', 'image': '.png'}[format]
    if target.suffix.lower() != expected:
        raise ValueError(f'{format} output requires a {expected} file.')
    if not 72 <= dpi <= 600:
        raise ValueError('DPI must be between 72 and 600.')
    if split_a4 and format == 'csv':
        raise ValueError('--split-a4 applies to image or tex output, not CSV.')
    if split_a4:
        layout = 'split'
    target.parent.mkdir(parents=True, exist_ok=True)
    if format == 'csv':
        headers, rows = table_cells(definition, style)
        with target.open('w', encoding='utf-8', newline='') as stream:
            writer = csv.writer(stream)
            writer.writerow(headers)
            writer.writerows(rows)
        return [target]
    outputs = []
    if format == 'tex':
        target.write_text(transition_table(definition, style=style, layout=layout), encoding='utf-8')
        outputs.append(target)
        if not split_a4:
            return outputs
    with tempfile.TemporaryDirectory(prefix='tm-builder-table-') as directory:
        if style == 'formal' or format == 'tex':
            images = _latex_images(definition, Path(directory), style, layout, dpi)
        else:
            images = _readable_images(definition, layout, dpi)
        # Stage every image before replacing any existing output.
        staged = []
        for index, image in enumerate(images, 1):
            destination = (target.with_name(f'{target.stem}-a4-{index:03d}.png')
                           if layout == 'split' else target.with_suffix('.png'))
            temp = Path(directory) / f'rendered-{index}.png'
            image.save(temp, dpi=(dpi, dpi))
            staged.append((temp, destination))
        for temp, destination in staged:
            shutil.copyfile(temp, destination)
            outputs.append(destination)
        prefix = target.stem + '-a4-'
        for previous in target.parent.iterdir():
            if (previous.is_file() and previous.suffix == '.png'
                    and previous.stem.startswith(prefix)
                    and previous.stem.removeprefix(prefix).isdigit()
                    and previous not in outputs):
                previous.unlink()
    return outputs
