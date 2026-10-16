# tm-builder Python tools

Typed YAML validation, machine simulation, diagram generation, and the local HTTP
server. Source code is in `src/tm_builder/`; regression checks are in `tests/`.

From the workspace root, use `make setup`, `make run`, and `make test`.
The Poetry environment lives in `python/.venv`. Direct commands from the workspace
root use `poetry --project python run tm-builder ...` so YAML paths stay relative to
the workspace. Browser assets and npm dependencies live in the sibling `web/`
project. See `docs/src/tm-builder/` for commands and machine/input formats.
