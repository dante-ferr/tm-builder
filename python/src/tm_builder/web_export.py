"""Package table exports produced by the Python exporter for browser downloads."""

import io
from pathlib import Path
import re
import tempfile
import zipfile

from tm_builder.definition import MachineDefinition
from tm_builder.table import export_table


def export_download(definition: MachineDefinition, filename: str, options: dict):
    format = options.get('format', 'image')
    style = options.get('style', 'readable')
    language = options.get('language', 'english')
    layout = options.get('layout', 'split')
    dpi = options.get('dpi', 200)
    if (format not in ('csv', 'image', 'tex') or style not in ('readable', 'formal')
            or language not in ('english', 'portuguese') or layout not in ('split', 'long')):
        raise ValueError('Choose a supported format, style, language, and layout.')
    if type(dpi) is not int or not 72 <= dpi <= 600:
        raise ValueError('Resolution must be an integer between 72 and 600 DPI.')
    default = re.sub(r'[^A-Za-z0-9_.-]+', '-', Path(filename).stem).strip('._-') or 'machine'
    name = options.get('name') or f'{default[:80]}-{style}'
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', name):
        raise ValueError('File name must be 1–100 letters, numbers, dots, underscores, or hyphens; start with a letter or number.')
    extension = 'png' if format == 'image' else format
    with tempfile.TemporaryDirectory(prefix='tm-builder-download-') as directory:
        work = Path(directory)
        output = work / f'{name}.{extension}'
        produced = export_table(definition, output, format=format, style=style,
                                layout=layout, dpi=dpi, language=language)
        files = []
        for path in produced:
            resolved = path.resolve()
            if resolved.parent != work.resolve() or not resolved.is_file():
                raise RuntimeError('The exporter did not produce a download.')
            files.append(resolved)
        if format == 'image' and layout == 'split':
            files.sort(key=lambda path: int(path.stem.rsplit('-', 1)[1]))
        if not files:
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
