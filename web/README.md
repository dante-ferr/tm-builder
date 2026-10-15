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
Press **Load Trace** to execute the current machine and starting tapes. Changing
the machine, input, or step limit clears the old trace without starting a run.
The button shows a loading wheel while the trace is computed and indexed. Runs
that reach a limit show a dismissible overlay with a browser-persisted **Do not
show again** option; completed computations do not show the overlay.
Runs above 10,000 requested steps use initial sparse tapes and a sequence of rule
indices instead of a full snapshot per step. The simulation worker fetches this
recording and builds head positions and per-cell write histories. Visible tape
windows are recovered with binary search, so arbitrary seeks do not replay the
whole run. Playback speed controls how quickly the recorded timeline is animated.
Changing inputs or selecting a machine disposes the old client worker; the bounded
server request can finish independently.

`GET /api/limits` benchmarks three 50,000-step counter runs on the API computer,
caches the median speed for that server process, and returns a five-second estimate
and a 10,000,000-step maximum. This estimates simulation time; network transfer and
browser indexing add overhead. Users can edit the limit and machine selection
preserves their choice. Nondeterministic searches retain a separate configuration
limit; all bounded incomplete results remain `RUNNING`.

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

## Machine editing

The editor saves validated changes through `POST /api/edit`, passing the displayed
revision and changed definition fields. File edits use an atomic replacement;
stale revisions and unsaved IDE buffers are rejected. Imported machines are edited
in memory and can be downloaded as YAML. Applying any edit clears the old trace.
Unchanged top-level YAML fields retain their source text; changed fields are
serialized again. Comments inside changed fields are not retained. Grouped transitions remain
grouped. No schema or machine syntax changes are required.

Icon tools live in the state graph header. Select and edit opens state properties
at the node or read/write/move fields directly on the connection. Transition tool
selects a source, then a destination (including self-loops). Add state selects a
location on empty canvas. Enter or the checkmark saves; Escape cancels. Multiple
rules on one connection are navigated with previous/next arrows in the inline
editor. There is no separate state or transition list; YAML remains the list view.

Inline editors are HTML anchored to graph coordinates. They move with the graph
but keep their size in website pixels, independently of graph zoom. Selection
centers the editor without changing zoom. Camera keyboard shortcuts
ignore focused form controls. Machine settings expands inside the graph panel.
State renames update references; state deletion removes connected rules and
requires choosing another start state first. Settings supports model, name,
alphabets, blank, and tape count; tape count changes resize rule actions and any
embedded inputs. Invalid combinations leave the YAML untouched.

Playback and debugger is a collapsible bar at the bottom of the workspace. It
starts collapsed, opens when a new trace arrives, and tucks away when graph editing
begins. Collapsing preserves playback,
timeline, speed, and breakpoint settings.


Machine history uses `POST /api/history` with a revision and `undo`/`redo`.
Each edit records the exact before/after YAML; undo and redo autosave atomically
and invalidate the trace. The current selection retains up to 50 edits in server
memory. Selection resets history, and external file changes disable history
rather than overwrite another editor's work. Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, and
matching Cmd shortcuts work outside editable inputs, with icon buttons in the
graph toolbar as well.

**Open workspace folder** in the viewer header calls `POST /api/open-workspace`.
The API waits until any in-progress machine write finishes, then runs
`make open-workspace`, which opens the VS Code workspace for the user folder.

New machine (+) in the library opens a name and filename form. `POST /api/create`
creates a valid one-state deterministic machine in the workspace's `machines/`
folder, then selects it. Creation refuses directory traversal, symlinks, existing
filenames, and non-YAML extensions.

Alphabet settings use symbol lists rather than JSON text. Entries accept one
Unicode character, including spaces; duplicate symbols and incomplete rows are
rejected. Arrays stay typed as strings across the API, and Python serializes
numeric-looking or YAML-significant symbols with the necessary quoting.


The camera fits when selecting a different machine or pressing Fit view. Edits,
undo/redo, window resizing, graph expansion, settings panels, and playback bar
changes preserve manual zoom and pan. Active playback following still starts at
85% zoom; subsequent manual zoom is preserved while following.


Selected states and connections remain visible and highlighted while editing.
Editors anchor above the selected item using SVG-to-screen coordinate conversion.
Drag the editor's header to reposition it, or focus the header and use arrow keys
(Shift moves farther). The offset is remembered for that editor while working;
it does not alter the machine YAML or move the camera. Editor size and drag
spacing stay in website pixels as graph zoom changes.
