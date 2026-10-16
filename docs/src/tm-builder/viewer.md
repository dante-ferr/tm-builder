# Viewer

`make view` opens the machine picker. The local viewer autosaves graph edits to
the selected workspace file. Save unsaved VS Code buffers before those edits.
Imported files stay in memory; download YAML to keep their changes.

The hosted app lists bundled examples, keeps edits in memory, and offers
**Save YAML**. It does not create files or open a workspace folder.

## Edit the graph

The icon tools in the state-graph header select and edit a state, connection,
or group. Click empty canvas to add a state. Add a group and choose its states,
or create a transition by selecting its source and destination. Edit state
properties and per-tape read, write, and move fields in place. Enter or the
checkmark writes the YAML. The settings icon edits the model, alphabets, blank,
and tape count.

**Open workspace folder** opens the configured workspace after the current
machine file is written. Set `CODE` to choose the editor.

**New machine** (+) in the library creates a workspace YAML file with one start
state. Alphabet settings use editable symbol lists: add or remove one character
per entry, and the app writes valid YAML. **Ctrl+Z** undoes the last applied
graph or settings change, and **Ctrl+Shift+Z** redoes it (**Cmd** on macOS).
Both autosave the result. Typing in a text field keeps normal text undo. History
covers the current machine's latest 50 edits during the server session.

## Run a trace

Playback and debugger controls expand from the bottom bar when you load a
trace. Collapse them to give the graph more room. Execution runs on a background
request thread. Browser workers load and index long traces. Set playback speed
with the slider or the numeric field, then seek through the recorded timeline.

The UI benchmarks this computer when the server starts being used and estimates
a default step budget of roughly five seconds. The step limit is editable, up
to 10,000,000. Actual runtime depends on the machine and input. Short
computations halt earlier. The CLI keeps its explicit `--max-steps` option
(default 1000). Nondeterministic search keeps its 10,000-configuration bound.

Valid machines can run forever. The checker validates syntax and machine
structure. It cannot solve the halting problem. Reaching a step or search limit
reports **Limit reached** (`RUNNING`). That result is not a rejection or a proof
of an infinite computation. There is no unbounded execution mode.
