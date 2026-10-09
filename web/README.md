# Teocomp web interface

`src/viewer.js` displays live diagrams and recorded tape playback; `src/render.js` renders SVG from DOT for
the Python exporter. Both use the same Viz.js Graphviz WebAssembly dependency.
Static HTML and CSS are in `public/`; generated bundles are in `public/assets/`.

Run `npm ci` and `npm run build` inside this folder, or `make build` from the
workspace root. The Python server serves `public/` and provides the diagram API.
Start it with `make view` from the workspace root.

The viewer posts starting tape YAML, a step limit, and the diagram revision to
`/api/simulate`. Stale revisions are rejected so traces always match the displayed
machine, including unsaved IDE buffers. Traces contain initial and subsequent
configurations, applied rules, and the final execution status and stop reason.

Without a machine argument, the viewer starts at the machine picker. `/api/library`
lists the project’s `machines/` and `inputs/` YAML files; bundled examples are
identified by the explicit `.gitignore` allowlist. The shared Hide examples
checkbox filters both pickers. `/api/machine` selects a library machine or loads
an imported file in memory; `/api/input` reads a library input into the setup editor.

The Export table menu posts format, style, layout, DPI, and a filename to
`/api/export`, with either the current revision or an independent imported YAML
source. The server validates the machine, runs the shared `make table` command
on a temporary snapshot, and returns a downloadable CSV, PNG, LaTeX file, or
ZIP of numbered A4 pieces. The menu disables irrelevant options and reports
progress and export errors. Imported exports do not change the selected machine.
