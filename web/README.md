# tm-builder web interface

The interface uses the Next.js App Router. Routes and the root layout are in
`app/`; reusable workspace JSX lives in `src/components/`. The client workspace
mounts the existing controller from `src/viewer.js` in an effect and calls its
cleanup when the component unmounts. `src/render.js` remains the Node-side SVG
renderer used by the Python exporter; the build bundles it to
`public/assets/render.cjs`.

Use Node.js 20.9 or newer. From the project root, run `make dev` to start Next
on port 3000 and the Python API on port 8765 together. Next proxies `/api`
requests to the API, and the viewer opens on the Next origin for live code
reload. Set `DEV_PORT` or `PORT` to change those ports. To start the servers
separately, use `npm run dev` here and
`TM_BUILDER_DEV_ORIGIN=http://127.0.0.1:3000 make view` from the project root.
`npm run build` creates a static App Router export in `out/`; `make build` runs
this build from the project root. The Python server serves the exported site and
API when started with `make view`.

The viewer posts starting tape YAML, a step limit, and the diagram revision to
`/api/simulate`. Stale revisions are rejected so traces always match the displayed
machine, including unsaved IDE buffers. Traces contain initial and subsequent
configurations, applied rules, and the final execution status and stop reason.

Select Follow active state in the playback controls to center the graph on the
executing state. Following starts at a fixed close zoom (`FOLLOW_ZOOM` in
`src/graph-navigation.js`); wheel and button zoom remain available. Middle mouse
dragging, WASD/arrow panning, or Fit turns following off. Pause, breakpoints,
seeking, and the end of playback stop camera movement; the selected option starts
following again when playback resumes. Other controls and graph resizing preserve
following during playback.

Without a machine argument, the viewer starts at the machine picker. `/api/library`
lists the project’s `machines/` and `inputs/` YAML files; bundled examples are
identified by the explicit `.gitignore` allowlist. The shared Hide examples
checkbox filters both pickers. `/api/machine` selects a library machine or loads
an imported file in memory; `/api/input` reads a library input into the setup editor.

The Export table menu posts format, style, language, layout, DPI, and a filename to
`/api/export`, with either the current revision or an independent imported YAML
source. The server validates the machine, runs the shared `make table` command
on a temporary snapshot, and returns a downloadable CSV, PNG, LaTeX file, or
ZIP of numbered A4 pieces. The menu disables irrelevant options and reports
progress and export errors. Imported exports do not change the selected machine.
