"""Run the shared Makefile table exporter and package browser downloads."""

import io
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

import yaml

from teocomp.definition import MachineDefinition


def export_download(definition: MachineDefinition, filename: str, options: dict, project: Path):
    format = options.get('format', 'image')
    style = options.get('style', 'readable')
    layout = options.get('layout', 'split')
    dpi = options.get('dpi', 200)
    if format not in ('csv', 'image', 'tex') or style not in ('readable', 'formal') or layout not in ('split', 'long'):
        raise ValueError('Choose a supported format, style, and layout.')
    if type(dpi) is not int or not 72 <= dpi <= 600:
        raise ValueError('Resolution must be an integer between 72 and 600 DPI.')
    default = re.sub(r'[^A-Za-z0-9_.-]+', '-', Path(filename).stem).strip('._-') or 'machine'
    name = options.get('name') or f'{default[:80]}-{style}'
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', name):
        raise ValueError('File name must be 1–100 letters, numbers, dots, underscores, or hyphens; start with a letter or number.')
    make = shutil.which('make')
    if not make:
        raise RuntimeError('Install make to export tables from the viewer.')
    extension = 'png' if format == 'image' else format
    with tempfile.TemporaryDirectory(prefix='teocomp-download-') as directory:
        work = Path(directory)
        machine = work / 'machine.yaml'
        machine.write_text(yaml.safe_dump(definition.model_dump(by_alias=True, exclude_none=True),
                                          allow_unicode=True, sort_keys=False), encoding='utf-8')
        output = work / f'{name}.{extension}'
        # All make values are controlled paths, validated enums/integers, or safe
        # names. An argv list alone would not prevent make's $(shell ...) syntax.
        command = [make, '--no-print-directory', 'table', f'MACHINE={machine}', f'OUTPUT={output}',
                   f'FORMAT={format}', f'STYLE={style}', f'LAYOUT={layout}', f'DPI={dpi}', 'ARGS=']
        try:
            result = subprocess.run(command, cwd=project, capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired as error:
            raise RuntimeError('Export timed out. Try splitting the image or a lower resolution.') from error
        if result.returncode:
            raise RuntimeError('Export failed: ' + (result.stderr.strip() or result.stdout.strip())[-4000:])
        files = (sorted(work.glob(f'{name}-a4-*.png'), key=lambda p: int(p.stem.rsplit('-', 1)[1]))
                 if format == 'image' and layout == 'split' else [output])
        if not files or any(not path.is_file() for path in files):
            raise RuntimeError('The exporter did not produce a download.')
        if len(files) == 1:
            mime = {'csv': 'text/csv; charset=utf-8', 'image': 'image/png',
                    'tex': 'application/x-tex; charset=utf-8'}[format]
            return files[0].read_bytes(), mime, files[0].name
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for path in files:
                archive.write(path, path.name)
        return buffer.getvalue(), 'application/zip', f'{name}.zip'
