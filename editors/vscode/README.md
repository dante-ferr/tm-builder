# tm-builder Turing Machines

Local VS Code integration for this repository. Validates machine YAML buffers on
open and change, including unsaved edits, and publishes errors/warnings to VS Code's
Problems panel. Completes declared states, tape symbols, and movement directions
inside each tape's `[read, write, direction]` triple.

Run `make setup` in the project root, then run `make open-workspace`. Setup seeds
the data folder, stores the workspace file in the platform's private config
directory, and configures the repository's interpreter path and YAML schemas. It
installs this extension when the `code` command is available; otherwise run
`make install-extension` once. Definitions must be under `machines/` and
setups under `inputs/`. The workspace recommends Red Hat YAML for highlighting
and schema completion.

The command **tm-builder: Preview Machine Diagram** launches the viewer for the
active file. Unsaved edits are sent to the viewer on `127.0.0.1` at
`tm-builder.previewPort` (default 8765). Opening and editing machine files does
not require the viewer.

Packaging dependencies live in this subproject.
