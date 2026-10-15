"""User-owned machine and input files, seeded from the bundled examples."""

import json
import os
from pathlib import Path
import shutil
import sys


PROJECT = Path(__file__).resolve().parents[3]
EXAMPLES = PROJECT / "data" / "examples"
MACHINE_EXAMPLES = ("copy.yaml", "single_tape.yaml", "nondeterministic_contains_one.yaml",
                   "blank_writer.yaml", "halt.yaml", "loop.yaml", "binary_counter.yaml")
INPUT_EXAMPLES = ("copy.yaml", "binary.yaml", "copy_preloaded.yaml", "binary_counter.yaml",
                  "binary_counter_million.yaml")


def workspace_path() -> Path:
    configured = os.environ.get("TM_BUILDER_WORKSPACE")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.home() / "Documents" / "TM Builder").resolve()


def config_dir() -> Path:
    """Return the platform's standard per-user application config directory."""
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "tm-builder"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "tm-builder"
    xdg = os.environ.get("XDG_CONFIG_HOME")
    base = Path(xdg).expanduser() if xdg and Path(xdg).is_absolute() else Path.home() / ".config"
    return base / "tm-builder"


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
    ensure_vscode_workspace(root)
    return root


def ensure_vscode_workspace(root: Path) -> Path:
    """Create a local VS Code workspace configured for this repository."""
    workspace_file = config_dir() / "workspaces" / f"{root.name}.code-workspace"
    workspace_file.parent.mkdir(parents=True, exist_ok=True)
    legacy_file = root.parent / f"{root.name}.code-workspace"
    config = {}
    migrated_legacy = False
    if not workspace_file.exists() and legacy_file.exists():
        workspace_file.write_text(legacy_file.read_text())
        migrated_legacy = True
    if workspace_file.exists():
        try:
            config = json.loads(workspace_file.read_text())
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Cannot update VS Code workspace file {workspace_file}: {error}") from error
        if not isinstance(config, dict):
            raise RuntimeError(f"Cannot update VS Code workspace file {workspace_file}: expected a JSON object")

    folders = config.setdefault("folders", [])
    if not isinstance(folders, list):
        raise RuntimeError(f"Cannot update VS Code workspace file {workspace_file}: folders must be a list")
    root_entry = {"path": str(root)}
    if root_entry not in folders:
        folders.append(root_entry)

    settings = config.setdefault("settings", {})
    if not isinstance(settings, dict):
        raise RuntimeError(f"Cannot update VS Code workspace file {workspace_file}: settings must be an object")
    settings["tm-builder.projectPath"] = str(PROJECT)
    schemas = settings.setdefault("yaml.schemas", {})
    if not isinstance(schemas, dict):
        raise RuntimeError(f"Cannot update VS Code workspace file {workspace_file}: yaml.schemas must be an object")
    schemas[str(PROJECT / "schemas/machine.schema.json")] = ["machines/**/*.yaml", "machines/**/*.yml"]
    schemas[str(PROJECT / "schemas/inputs.schema.json")] = ["inputs/**/*.yaml", "inputs/**/*.yml"]
    settings["yaml.validate"] = True
    settings["yaml.completion"] = True

    extensions_config = config.setdefault("extensions", {})
    if not isinstance(extensions_config, dict):
        raise RuntimeError(f"Cannot update VS Code workspace file {workspace_file}: extensions must be an object")
    extensions = extensions_config.setdefault("recommendations", [])
    if not isinstance(extensions, list):
        raise RuntimeError(f"Cannot update VS Code workspace file {workspace_file}: recommendations must be a list")
    for extension in ("redhat.vscode-yaml", "tm-builder-local.tm-builder-machines"):
        if extension not in extensions:
            extensions.append(extension)
    serialized = json.dumps(config, indent=2) + "\n"
    if not workspace_file.exists() or workspace_file.read_text() != serialized:
        workspace_file.write_text(serialized)
    if migrated_legacy:
        legacy_file.unlink()
    return workspace_file
