# Commands

Run Make commands from the repository root. `make` lists available targets.
Use `MACHINE=...` to select a machine and `INPUTS=...` to select an input setup.
Relative filenames are looked up in the current directory first, then in the
user workspace's matching folder.

## Setup and workspace

| Command | Effect |
| --- | --- |
| `make setup` | Install dependencies, build the web UI, seed the user workspace, configure a `.code-workspace` file, and install the VS Code extension when the `code` command is available. |
| `make install-extension` | Package and install the local VS Code extension. |
| `make open-workspace` | Open the configured machine workspace in VS Code. |
| `make setup-formal` | Install OS packages needed for formal PNG table exports on supported Linux distributions. |

The default workspace is a `TM Builder` folder inside the system Documents
folder. Windows uses the Documents known folder, including a translated folder
such as `Documentos`. Linux uses `XDG_DOCUMENTS_DIR`. `make setup` creates its
`machines/` and `inputs/` folders and copies the examples from
`data/examples/`. It only copies missing files, so later setup runs preserve
local edits. Setup writes the VS Code workspace file in the platform's private
application config directory, with the repository's Python environment and
machine/input schemas configured. `make open-workspace` opens it with the `code`
command; edit files under `machines/`. If the `code` command is unavailable, pass
`CODE=/path/to/code` to setup and open-workspace. The viewer's **Open workspace
folder** button opens the same file with the application associated with it on
Windows, macOS, and Linux, after the current machine file is saved. Set `CODE`
to choose that editor explicitly.
Set `TM_BUILDER_WORKSPACE` to a full path before setup, or before starting the
viewer, to replace that Documents location. To use a
shared Git repository, initialize Git in the workspace and add a remote, or
point the variable at an existing clone.

## Run and inspect machines

| Command | Effect |
| --- | --- |
| `make view` | Start the local viewer and open the machine picker. Set `MACHINE=...` to open a specific file. |
| `make dev` | Run the viewer with the Next.js development server and live reload. Set `PORT` or `DEV_PORT` to change ports. |
| `make check` | Validate the selected machine and print errors or warnings. |
| `make check-all` | Validate all bundled example machines. |
| `make run` | Simulate the selected machine. Set `INPUTS=...` for a tape setup, or `MAX_STEPS=...` to change the step limit. |

Examples:

```bash
make check MACHINE=single_tape.yaml
make run MACHINE=single_tape.yaml INPUTS=binary.yaml MAX_STEPS=500
```

Without `MACHINE`, commands that need a definition use `copy.yaml` from the
user workspace. The viewer instead opens the picker.

## Export

| Command | Effect |
| --- | --- |
| `make graph` | Export the selected machine as SVG. Set `OUTPUT=...` to choose the destination. |
| `make table` | Export a transition table. |

`make table` accepts `FORMAT=csv|image|tex`, `STYLE=readable|formal`,
`LANGUAGE=english|portuguese`, `LAYOUT=split|long`, `DPI=72..600`, and `OUTPUT=...`.
The defaults are a readable split PNG in English at 200 DPI. The viewer uses
the same Python exporter, including on Windows, and does not call Make. Formal
PNG output uses LuaLaTeX or XeLaTeX and Poppler when they are on `PATH`.
`make setup-formal` installs them on supported Linux systems. Without those
tools, the viewer draws the formal table directly.

## Development

| Command | Effect |
| --- | --- |
| `make build` | Build the web UI. |
| `make schemas` | Regenerate the machine and input JSON schemas. |
| `make test` | Run web, Python, and extension checks. |
| `make test-vscode` | Run the VS Code Extension Development Host checks. |
| `make docs-build` | Build this book into `docs/book/`. |
| `make docs-serve` | Serve the book locally with live reload. |
