"""Export a diagram using the same Graphviz build as the live viewer."""

from pathlib import Path
import shutil
import subprocess

from teocomp.definition import MachineDefinition
from teocomp.designer import WEB, ensure_assets
from teocomp.diagram import machine_diagram


def export_diagram(definition: MachineDefinition, target: Path):
    if target.suffix.lower() not in ('.svg', '.dot'):
        raise ValueError('Choose a .svg or .dot output file.')
    dot = machine_diagram(definition).source
    if target.suffix.lower() == '.dot':
        rendered = dot
    else:
        ensure_assets()
        node = shutil.which('node')
        if not node:
            raise RuntimeError('Install Node.js to export SVG diagrams.')
        result = subprocess.run([node, str(WEB / 'assets/render.cjs')], input=dot,
                                text=True, capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or 'Graphviz rendering failed')
        rendered = result.stdout
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(rendered)
    return target
