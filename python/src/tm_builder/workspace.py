"""User-owned machine and input files, seeded from the bundled examples."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


PROJECT = Path(__file__).resolve().parents[3]
EXAMPLES = PROJECT / "data" / "examples"
MACHINE_EXAMPLES = ("copy.yaml", "single_tape.yaml", "nondeterministic_contains_one.yaml",
                   "halt.yaml", "binary_counter.yaml", "state_groups.yaml", "four_groups.yaml")
INPUT_EXAMPLES = ("copy.yaml", "binary.yaml", "binary_counter.yaml",
                  "binary_counter_million.yaml", "four_groups.yaml")


def workspace_path() -> Path:
    """Return the user data directory.

    TM_BUILDER_WORKSPACE replaces the whole directory when it is set. Otherwise
    the data lives in ``TM Builder`` inside the system's Documents folder,
    including a translated folder such as Documentos.
    """
    configured = os.environ.get("TM_BUILDER_WORKSPACE")
    if configured:
        return Path(configured).expanduser().resolve()
    return (documents_directory() / "TM Builder").resolve()


def documents_directory() -> Path:
    """Return the Documents folder the operating system actually uses."""
    if sys.platform == "win32":
        found = _windows_documents()
    elif sys.platform == "darwin":
        found = Path.home() / "Documents"
    else:
        found = _xdg_documents()
    if found is not None:
        return found
    home = Path.home()
    for name in ("Documents", "Documentos"):
        candidate = home / name
        if candidate.is_dir():
            return candidate
    return home / "Documents"


def _expand_home(value: str) -> Path | None:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    home = str(Path.home())
    expanded = []
    index = 0
    while index < len(value):
        if value.startswith("${HOME}", index):
            expanded.append(home)
            index += len("${HOME}")
        elif value.startswith("$HOME", index) and not value[index + 5:index + 6].isalnum() and value[index + 5:index + 6] != "_":
            expanded.append(home)
            index += len("$HOME")
        else:
            expanded.append(value[index])
            index += 1
    text = "".join(expanded).strip()
    if not text:
        return None
    path = Path(text).expanduser()
    if not path.is_absolute():
        path = Path.home() / path
    return path


def _xdg_documents() -> Path | None:
    configured = os.environ.get("XDG_DOCUMENTS_DIR", "").strip()
    if configured:
        return _expand_home(configured)
    config_home = os.environ.get("XDG_CONFIG_HOME", "").strip()
    base = Path(config_home).expanduser() if config_home and Path(config_home).is_absolute() else Path.home() / ".config"
    try:
        lines = (base / "user-dirs.dirs").read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        entry = line.strip()
        if not entry or entry.startswith("#") or "=" not in entry:
            continue
        key, value = entry.split("=", 1)
        if key.strip() == "XDG_DOCUMENTS_DIR":
            return _expand_home(value.strip())
    return None


def _windows_documents() -> Path | None:
    """Return the Windows Known Folder for Documents, including a redirected one."""
    try:
        import ctypes
        from ctypes import wintypes
    except OSError:
        return None

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", wintypes.DWORD),
            ("Data2", wintypes.WORD),
            ("Data3", wintypes.WORD),
            ("Data4", wintypes.BYTE * 8),
        ]

    folder = GUID()
    folder.Data1 = 0xFDD39AD0
    folder.Data2 = 0xFF42
    folder.Data3 = 0x40F4
    folder.Data4[:] = (0xBA, 0x4B, 0xF6, 0xF6, 0xB6, 0xF1, 0xD0, 0xE4)
    pointer = ctypes.c_wchar_p()
    shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    ole32 = ctypes.WinDLL("ole32", use_last_error=True)
    shell32.SHGetKnownFolderPath.argtypes = [
        ctypes.POINTER(GUID), wintypes.DWORD, wintypes.HANDLE, ctypes.POINTER(ctypes.c_wchar_p)]
    shell32.SHGetKnownFolderPath.restype = ctypes.c_long
    ole32.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    if shell32.SHGetKnownFolderPath(ctypes.byref(folder), 0, None, ctypes.byref(pointer)) != 0:
        return None
    value = pointer.value
    ole32.CoTaskMemFree(pointer)
    return Path(value) if value else None


def config_dir() -> Path:
    """Return the platform's standard per-user application config directory."""
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "tm-builder"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "tm-builder"
    xdg = os.environ.get("XDG_CONFIG_HOME")
    base = Path(xdg).expanduser() if xdg and Path(xdg).is_absolute() else Path.home() / ".config"
    return base / "tm-builder"


def open_in_editor() -> None:
    """Open the user workspace in the editor chosen for its workspace file."""
    workspace_file = ensure_vscode_workspace(ensure_workspace())
    explicit = os.environ.get("CODE", "").strip()
    if explicit:
        resolved = shutil.which(explicit)
        if resolved is None and not Path(explicit).is_file():
            raise RuntimeError(f"Editor command not found: {explicit}")
        _launch([resolved or explicit, str(workspace_file)])
        return
    try:
        _open_with_default_app(workspace_file)
    except OSError:
        command = _editor_command()
        if command is None:
            raise RuntimeError(
                "Could not open the workspace. Install VS Code or Cursor, or set CODE to your editor command.")
        _launch([*command, str(workspace_file)])


def _open_with_default_app(path: Path) -> None:
    """Open a file with the application the user associated with it."""
    if sys.platform == "win32":
        os.startfile(path)  # noqa: S606 — the associated editor, not a shell command
        return
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    try:
        completed = subprocess.run([opener, str(path)], check=False, timeout=30,
                                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise OSError(str(error)) from error
    if completed.returncode != 0:
        raise OSError(f"{opener} could not open {path.name}")


def _editor_command() -> list[str] | None:
    for name in ("code", "cursor", "codium", "code-insiders"):
        found = shutil.which(name)
        if found:
            return [found]
    if sys.platform != "win32":
        return None
    local = os.environ.get("LOCALAPPDATA", "")
    program = os.environ.get("PROGRAMFILES", "")
    candidates = [
        Path(local) / "Programs/Microsoft VS Code/bin/code.cmd",
        Path(program) / "Microsoft VS Code/bin/code.cmd",
        Path(local) / "Programs/cursor/resources/app/bin/cursor.cmd",
        Path(local) / "cursor/resources/app/bin/cursor.cmd",
        Path(program) / "Cursor/resources/app/bin/cursor.cmd",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return [str(candidate)]
    return None


EDITOR_EXTENSION = "teocomp-local.teocomp-machines"
VSIX = PROJECT / "dist" / "tm-builder-vscode.vsix"


def resolve_editor_cli(explicit: str) -> list[str] | None:
    """Return the editor executable named by Make, when it exists."""
    text = explicit.strip()
    if not text:
        return None
    resolved = shutil.which(text)
    if resolved:
        return [resolved]
    candidate = Path(text)
    if candidate.is_file():
        return [str(candidate)]
    if sys.platform == "win32" and candidate.suffix == "" and candidate.with_suffix(".cmd").is_file():
        return [str(candidate.with_suffix(".cmd"))]
    return None


def install_editor_extension(explicit: str, *, optional: bool = False, package: bool = False) -> None:
    """Install the packaged extension. Optional setup skips a missing editor CLI."""
    command = resolve_editor_cli(explicit)
    if command is None:
        message = "VS Code CLI not found; run make install-extension after installing the code command."
        if optional:
            print(message)
            return
        raise RuntimeError(message)
    if package:
        _package_editor_extension()
    if not VSIX.is_file():
        raise RuntimeError(f"Extension package not found: {VSIX}")
    _run_editor([*command, "--uninstall-extension", EDITOR_EXTENSION], check=False)
    _run_editor([*command, "--install-extension", str(VSIX), "--force"], check=True)


def _package_editor_extension() -> None:
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    try:
        completed = subprocess.run([npm, "--prefix", "editors/vscode", "run", "package"], cwd=PROJECT, check=False)
    except OSError as error:
        raise RuntimeError(f"Could not package the VS Code extension: {error}") from error
    if completed.returncode != 0:
        raise RuntimeError(f"Could not package the VS Code extension (status {completed.returncode}).")


def _editor_argv(command: list[str]) -> list[str]:
    if sys.platform == "win32" and Path(command[0]).suffix.lower() in {".cmd", ".bat"}:
        return ["cmd", "/d", "/c", *command]
    return command


def _run_editor(command: list[str], *, check: bool) -> None:
    stdout = subprocess.DEVNULL if not check else None
    stderr = subprocess.DEVNULL if not check else None
    try:
        completed = subprocess.run(_editor_argv(command), check=False, stdin=subprocess.DEVNULL,
                                   stdout=stdout, stderr=stderr)
    except OSError as error:
        raise RuntimeError(f"Could not run the editor CLI: {error}") from error
    if check and completed.returncode != 0:
        raise RuntimeError(f"Editor command failed with status {completed.returncode}.")


def _launch(command: list[str]) -> None:
    try:
        subprocess.Popen(_editor_argv(command), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=sys.platform != "win32")
    except OSError as error:
        raise RuntimeError(f"Could not open the workspace: {error}") from error


def ensure_workspace() -> Path:
    """Create the user workspace and copy only examples that are not there yet."""
    root = workspace_path()
    for kind, names in (("machines", MACHINE_EXAMPLES), ("inputs", INPUT_EXAMPLES)):
        destination = root / kind
        destination.mkdir(parents=True, exist_ok=True)
        for name in names:
            source = EXAMPLES / kind / name
            target = destination / name
            if source.is_file() and not target.exists() and not target.is_symlink():
                shutil.copyfile(source, target)
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
