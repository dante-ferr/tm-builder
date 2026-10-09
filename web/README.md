# Teocomp web interface

`src/viewer.js` displays live diagrams; `src/render.js` renders SVG from DOT for
the Python exporter. Both use the same Viz.js Graphviz WebAssembly dependency.
Static HTML and CSS are in `public/`; generated bundles are in `public/assets/`.

Run `npm ci` and `npm run build` inside this folder, or `make build` from the
workspace root. The Python server serves `public/` and provides the diagram API.
Start it with `make view` from the workspace root.
