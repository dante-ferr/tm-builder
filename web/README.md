# tm-builder web interface

A strict TypeScript application using the Next.js App Router and React. The UI
exports statically so the Python viewer can serve both the site and its local API.
Next's development server proxies `/api` to Python.

Use Node.js 20.9 or newer. Run `make dev` from the project root to start Next on
port 3000 and the Python API on port 8765. Set `DEV_PORT` or `PORT` to change the
ports. To start them separately, run `npm run dev` here and
`TM_BUILDER_DEV_ORIGIN=http://127.0.0.1:3000 make view` from the project root.
`TM_BUILDER_API_ORIGIN` overrides the development proxy destination.

Run `npm run typecheck`, `npm test`, and `npm run build` here, or `make test` from
the project root for the production build and all repository regression checks.
`npm run build` creates the static site in `out/` and the Node SVG renderer in
`public/assets/render.cjs`. `make view` serves the exported application.

## Architecture

- `app/`: server route, typed metadata and root layout, loading/error/not-found
  boundaries, and global design tokens with responsive light/dark themes.
- `src/components/`: client workspace composition, machine/input library, graph,
  tape playback, export dialog, and shared icons.
- `src/hooks/`: API polling and request cancellation, playback timing, and theme
  persistence. React owns forms, trace state, and application status.
- `src/lib/`: shared API contracts, API/download helpers, and pure playback logic.
- `src/graph-navigation.ts`: isolated SVG camera behavior (zoom, pan, and follow).
  Only this boundary and the graph component manage Graphviz's generated SVG.
- `src/render.ts`: Node renderer used by the Python SVG exporter. It uses the same
  Graphviz library as the graph component.

The workspace polls the selected machine and library, including unsaved IDE
buffers. Requests are aborted on unmount, and selection/input/trace generations
reject outdated results. Simulation and exports use the diagram revision so
results match the selected machine. Traces include initial and subsequent tape
configurations, applied rules, and a final execution status and stop reason.

The library lists workspace `machines/` and `inputs/` YAML files. Bundled examples
are identified by the explicit `.gitignore` allowlist in `data/examples/`.
Selecting an example loads its paired input when available. Hide bundled examples
filters both library selectors. Imported machines stay in memory; imported inputs
populate the setup editor.

Graph controls support wheel zoom, middle mouse dragging, focused WASD/arrow
panning, Fit view, expansion (Escape to close), and SVG download. Follow active
state starts at `FOLLOW_ZOOM` while playing. Panning or Fit turns following off;
pause, seeking, breakpoints, and the end of playback stop camera movement.

Export table supports CSV, PNG, and LaTeX, readable/formal styles, language,
layout, and DPI. An independent imported machine can be exported without changing
the selected diagram. The Python server validates each request and returns a file
or a ZIP of numbered A4 pieces.
