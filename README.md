# Teocomp: Turing machine design tools

Write multi-tape machines as YAML in VS Code, get type and semantic diagnostics
as you type, and keep a live diagram open beside your editor.

## VS Code setup

Open this project root in VS Code. The local **Teocomp Turing Machines** extension
validates machine files under `machines/`, including unsaved edits. It shows squiggles,
hover messages, and entries in the Problems panel for unknown states/symbols, wrong
tape counts, invalid moves, duplicate rules/keys, and inconsistent alphabets. It warns
about unreachable states and completes your declared states, symbols, and moves.

The extension uses the project's `.venv` Python interpreter by default. Run:

```bash
poetry install
```

For a fresh checkout, build and install the local extension once:

```bash
npm ci
npm run build
npm run package:extension
code --install-extension dist/teocomp-vscode.vsix
```

Reload the VS Code window if it was already open when installing/updating the
extension. Also install the recommended **YAML** extension by Red Hat for YAML
highlighting, field completion, and JSON schema checks. The Teocomp extension supplies
semantic validation independently of the diagram viewer.

If your virtual environment is elsewhere, set `teocomp.pythonPath` in VS Code.
The **Teocomp** output channel reports interpreter/validation startup failures.

## Live diagram

```bash
poetry run teocomp view machines/copy.yaml
```

`design` remains an alias for the same viewer. It opens `http://127.0.0.1:8765` with
only the diagram, zoom/fit controls, and **Download SVG**. No editing or simulation
controls are on the page.

Saved file changes update the diagram automatically. With the local VS Code
extension active, unsaved edits also update it, after a short debounce. If a definition
is invalid, the last valid diagram is faded, downloads are disabled, and a short error
message appears until you fix it. The viewer never writes your machine file.

You can also launch the viewer from the Command Palette using
**Teocomp: Preview Machine Diagram** while a machine file is active. Stop a running
viewer before launching another on the same port. For a different port, use
`--port 8766` and set `teocomp.previewPort` to match. The live buffer connection is
local to `127.0.0.1`. If VS Code closes the file or stops sending updates, the viewer
returns to the saved file within three seconds. Stop the server with `Ctrl C`.

## Export directly from a file

Generate the same Graphviz SVG without opening the browser:

```bash
poetry run teocomp graph machines/copy.yaml --output output/copy.svg
```

For Graphviz DOT source, use a `.dot` output path:

```bash
poetry run teocomp graph machines/copy.yaml --output output/copy.dot
```

VS Code also has a task named **Teocomp: Export active machine SVG**. Terminal export
reads the saved file; the viewer's download uses the currently displayed diagram,
including an unsaved VS Code preview. Both SVG paths use the same Graphviz WebAssembly
build and require no system `dot` installation.

## Write a machine

Copy `machines/copy.yaml` to another file under `machines/` for your assignment:

```yaml
name: Two-tape copy
tapes: 2
blank: _
input_alphabet: [a, b]
tape_alphabet: [a, b, _]
states: [copy, accept]
start: copy
accept: [accept]
reject: []
inputs: [abba, ""]
transitions:
  - {from: copy, read: [a, _], to: copy, write: [a, a], move: [R, R]}
  - {from: copy, read: [b, _], to: copy, write: [b, b], move: [R, R]}
  - {from: copy, read: [_, _], to: accept, write: [_, _], move: [S, S]}
```

Each rule reads symbols under the heads, writes one symbol per tape, then moves each
head: `L` left, `R` right, `S` stay. Arrays follow tape order. Heads start at cell 0;
tapes extend infinitely in both directions. `inputs` is optional (defaults to empty
tapes). Symbols are single characters. Quote numeric/boolean-like YAML values:
`input_alphabet: ["0", "1"]` and `inputs: ["0101", ""]`.

A missing rule produces `HALT`, not rejection. Enter a declared reject state for
`REJECT` or an accept state for `ACCEPT`; these states halt immediately. Terminal
simulation remains available:

```bash
poetry run teocomp check machines/copy.yaml
poetry run teocomp run machines/copy.yaml --input abba "" --max-steps 1000
```

## Development

Requires Python 3.14+, Poetry, and Node.js/npm. If browser assets are missing, the
first viewer/export command automatically installs the locked npm dependencies and
builds them. Subsequent viewer launches and exports work offline. All browser assets
are served locally.

After frontend changes, run `npm run build`. After extension changes, run
`npm run package:extension` and reinstall the resulting VSIX. If the Python model
changes, regenerate the JSON schema with `poetry run teocomp schema`.

Run the Python regression checks:

```bash
poetry run python -m unittest discover -s tests
```

The live diagnostics also have a VS Code Extension Development Host test:

```bash
code --user-data-dir /tmp/teocomp-vscode-tests \
  --extensionDevelopmentPath="$PWD/editors/vscode" \
  --extensionTestsPath="$PWD/tests/vscode-host.cjs" \
  --disable-workspace-trust "$PWD"
```

## Layout

```text
machines/                 # Your machine YAML files
schemas/                  # JSON schema for IDE field completion
.vscode/                  # Recommended extensions, schema, export task
editors/vscode/           # Local VS Code diagnostics and live preview integration
frontend/                 # Diagram viewer and standalone SVG renderer
src/teocomp/
  definition.py           # Shared typed model and semantic validation
  ide.py                  # Unsaved-buffer validation protocol for VS Code
  diagram.py              # Graphviz graph generation
  export.py               # Direct SVG/DOT export
  designer.py             # Diagram viewer and live buffer reception
  simulation.py           # Bounded machine execution
  cli.py                  # view / graph / check / run commands
  web/                    # Page, styles, generated assets
tests/                    # Python and VS Code integration checks
```

Simulation uses [multitape-tm](https://pypi.org/project/multitape-tm/); graph rendering
uses [Graphviz via Viz.js](https://viz-js.com/api/).
