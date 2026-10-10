# tm-builder Turing Machines

Local VS Code integration for this repository. Validates machine YAML buffers on
open and change, including unsaved edits, and publishes errors/warnings to VS Code's
Problems panel. Completes declared states, tape symbols, and movement directions
inside each tape's `[read, write, direction]` triple.

Run `make setup` in the project root, then open `~/Documents/TM Builder` in VS Code
to edit user machines. Setup creates and seeds that folder. When the extension
is running from this checkout, it locates the repository's
`python/.venv`; otherwise set `tm-builder.projectPath` to the repository root or
`tm-builder.pythonPath` to the Python interpreter. Definitions must be under a
directory named `machines`. The recommended Red Hat YAML extension provides
syntax highlighting and schema completion for bundled examples.

The command **tm-builder: Preview Machine Diagram** launches the viewer for the
active file. Unsaved edits are sent to the viewer on `127.0.0.1` at
`tm-builder.previewPort` (default 8765). Opening and editing machine files does
not require the viewer.

Package and install the extension from the workspace root with
`make install-extension`. Packaging dependencies live in this subproject.
