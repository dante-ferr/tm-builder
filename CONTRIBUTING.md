# Contributing

Contributions that improve machine definitions, correctness, and course usability
are welcome. Bundled examples under `data/examples/machines/` and
`data/examples/inputs/` are listed in `docs/src/tm-builder/machines.md` and allowlisted in `.gitignore`.
Keep examples focused on distinct syntax features. Put regression fixtures under
`python/tests/fixtures/` and keep the docs aligned with implemented behavior.

Before opening a pull request, run the checks from the repository root:

```bash
make setup
make extension
make schemas
make check-all
make test
```

For Python changes, add a focused regression case. If you change a machine field,
regenerate and commit the affected file under `schemas/`. Keep viewer and direct SVG export
rendering from the same validated machine definition. Keep NTM semantics and search
limits clear in the documentation; results reached at a search limit must not be
reported as rejection.

Use a conventional commit prefix such as `feat:`, `fix:`, or `docs:`.
