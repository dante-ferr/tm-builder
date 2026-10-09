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
