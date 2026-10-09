# Contributing

Contributions that improve machine definitions, correctness, and course usability
are welcome. Add machine examples under `machines/` and keep the variant table in
`README.md` aligned with implemented behavior.

Before opening a pull request, run the checks from the repository root:

```bash
poetry run teocomp schema
npm ci
npm run build
npm run package:extension
for machine in machines/*.yaml; do poetry run teocomp check "$machine"; done
poetry run python -m unittest discover -s tests -v
```

For Python changes, add a focused regression case. If you change a machine field,
regenerate and commit `schemas/machine.schema.json`. Keep viewer and direct SVG export
rendering from the same validated machine definition. Keep NTM semantics and search
limits clear in the documentation; results reached at a search limit must not be
reported as rejection.

Use a conventional commit prefix such as `feat:`, `fix:`, or `docs:`.
