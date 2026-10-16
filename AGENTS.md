# Minimal examples

Users should be able to learn the supported YAML syntax by reading the bundled
examples. Apply these rules when adding or changing machine types, syntax, or
starting tape options:

- Maintain small, runnable examples under `machines/` and paired setups under
  `inputs/` when input is needed. Include an example for every new syntax feature
  or machine type.
- Give each example one teaching purpose. Use the fewest states, tapes, and rules
  that explain it, with short comments only where the syntax needs explanation.
  Prefer updating an existing example over adding a redundant one.
- Show all mandatory fields and make optional fields and defaults understandable
  across the set. Cover each supported alternative syntax without duplicating
  entire examples just to change formatting.
- Keep examples valid and executable. Validate with `make check-all`, execute
  affected examples with their intended setups, and verify expected outcomes in
  `python/tests/test_examples.py`. Use a step limit for looping examples.
- Add new bundled files to the explicit allowlist in `.gitignore`; personal
  machine definitions and input files must remain ignored.
- Keep the examples table in `docs/src/tm-builder/machines.md` accurate and concise. Document implemented
  behavior; avoid lengthy tutorials and speculative future features.
- Regenerate schemas with `make schemas` when model fields or syntax change, and
  run the relevant checks from `CONTRIBUTING.md`.
