"""User-owned machine and input files, seeded from the bundled examples."""

import os
from pathlib import Path
import shutil


PROJECT = Path(__file__).resolve().parents[3]
EXAMPLES = PROJECT / "data" / "examples"
MACHINE_EXAMPLES = ("copy.yaml", "single_tape.yaml", "nondeterministic_contains_one.yaml",
                   "blank_writer.yaml", "halt.yaml", "loop.yaml")
INPUT_EXAMPLES = ("copy.yaml", "binary.yaml", "copy_preloaded.yaml")


def workspace_path() -> Path:
    configured = os.environ.get("TM_BUILDER_WORKSPACE")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.home() / "Documents" / "TM Builder").resolve()


def ensure_workspace() -> Path:
    """Create the user workspace and copy only examples that are not there yet."""
    root = workspace_path()
    for kind, names in (("machines", MACHINE_EXAMPLES), ("inputs", INPUT_EXAMPLES)):
        destination = root / kind
        destination.mkdir(parents=True, exist_ok=True)
        for name in names:
            target = destination / name
            if not target.exists() and not target.is_symlink():
                shutil.copyfile(EXAMPLES / kind / name, target)
    return root
