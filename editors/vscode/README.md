# tm-builder Turing Machines

Local VS Code integration for this repository. Validates machine YAML buffers on
open and change, including unsaved edits, and publishes errors/warnings to VS Code's
Problems panel. Completes declared states, tape symbols, and movement directions
inside each tape's `[read, write, direction]` triple.

Open the project root and run `make setup`. The extension uses `python/.venv` by default;
configure `tm-builder.pythonPath` if using another environment. Definitions must be under
a directory named `machines`. Use the recommended Red Hat YAML extension for syntax
highlighting and JSON schema field completion.

The command **tm-builder: Preview Machine Diagram** launches the viewer for the active
file. Unsaved edits are sent to the viewer on `127.0.0.1` at `tm-builder.previewPort`
(default 8765). Opening and editing machine files does not require the viewer.

Package and install the extension from the workspace root with
`make install-extension`. Packaging dependencies live in this subproject.
