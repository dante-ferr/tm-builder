# tm-builder

Define, validate, visualize, and run deterministic or nondeterministic Turing
machines in YAML.

## Setup

```bash
make setup
```

Setup installs dependencies and creates `~/Documents/TM Builder/`, seeding its
`machines/` and `inputs/` folders with examples. Existing files are preserved.
It creates a private VS Code workspace configuration in the platform's app
config directory and installs the tm-builder extension when the VS Code `code`
command is available. Open the configured workspace with:

```bash
make open-workspace
```

The viewer header **Open workspace folder** button runs that same command after
the current machine file has been written.

Machine files under `machines/` then get syntax, schema, and type diagnostics.
If the VS Code CLI is not on `PATH`, pass its executable to both commands, for
example `make setup CODE=/path/to/code` and
`make open-workspace CODE=/path/to/code`. Set `TM_BUILDER_WORKSPACE` before
setup to choose another data location.

On Windows, run Make commands in WSL2 or Git Bash with GNU Make, Python 3.14,
Poetry, and Node.js 20.9+. Formal PNG table export setup is Linux-only.

Formal PNG table export also needs TeX and Poppler system packages; run
`make setup-formal` on supported Linux distributions.

## Commands

| Command | Purpose |
| --- | --- |
| `make view` | Open the machine picker and debugger |
| `make check` / `make run` | Validate or run the default machine |
| `make graph` / `make table` | Export a diagram or transition table |
| `make dev` | Run the web UI with live reload |
| `make test` | Run project checks |

Choose files with `MACHINE=...` and `INPUTS=...`, for example:

```bash
make run MACHINE=single_tape.yaml INPUTS=binary.yaml
```

See the [command guide](docs/src/tm-builder/commands.md) for options, defaults,
and export details.

User files live outside the application repository, so the workspace can be a
Git repository for your group. Initialize Git there and add a shared remote, or
point `TM_BUILDER_WORKSPACE` at an existing clone. The viewer starts with a
machine picker; CLI commands that need a machine default to `copy.yaml`.

Edit a loaded machine directly in the graph. The icon tools in its header let you
select and edit a state or connection, add a state by clicking empty canvas, or
create a transition by selecting its source and destination. Edit state properties
and per-tape read/write/move fields in place; Enter or the checkmark saves to YAML.
Use the settings icon for model, alphabets, blank, and tape count. Imported files
stay in memory; download YAML to keep their changes. Save unsaved VS Code buffers
before UI edits. Playback and debugger controls expand from the bottom bar when
you load a trace, and can be collapsed to give the graph more room.

Use **New machine** (+) in the library to create a workspace YAML file with one
start state. Alphabet settings use editable symbol lists: add or remove one
character per entry; the app writes valid YAML automatically. **Ctrl+Z** undoes
the last applied graph/settings change and **Ctrl+Shift+Z** redoes it (Cmd on
macOS). Both autosave the result. Typing in a text field keeps normal text undo.
History covers the current machine's latest 50 edits during the server session.

## Examples

Bundled examples live in `data/examples/` and are copied to a new workspace.

| Machine | Demonstrates | Setup |
| --- | --- | --- |
| [copy](data/examples/machines/copy.yaml) | Multiple tapes and flat rules | [copy](data/examples/inputs/copy.yaml), [preloaded](data/examples/inputs/copy_preloaded.yaml) |
| [single_tape](data/examples/machines/single_tape.yaml) | Grouped rules, quoted symbols, rejection | [binary](data/examples/inputs/binary.yaml) |
| [nondeterministic_contains_one](data/examples/machines/nondeterministic_contains_one.yaml) | Nondeterministic rules | [binary](data/examples/inputs/binary.yaml) |
| [blank_writer](data/examples/machines/blank_writer.yaml) | Empty input alphabet | — |
| [halt](data/examples/machines/halt.yaml) | Custom blank and terminal states | — |
| [loop](data/examples/machines/loop.yaml) | Self-loop and step limits | — |
| [binary_counter](data/examples/machines/binary_counter.yaml) | Exponential binary counting and long traces | [8,190 steps](data/examples/inputs/binary_counter.yaml), [1,000,000 steps](data/examples/inputs/binary_counter_million.yaml) |

Selecting the binary counter loads the million-step input. Allow at least 1,000,000
steps and press **Load Trace**. Execution runs on a background request thread;
browser workers load and index long traces. Set playback speed with the slider or
numeric field, then seek freely through the recorded timeline.

The UI benchmarks this computer when the server starts being used and estimates a
default step budget of roughly five seconds. The step limit is editable, up to
10,000,000; actual runtime depends on the machine and input. Short computations
halt earlier. The CLI retains its explicit `--max-steps` option (default 1000).
Nondeterministic search also retains its 10,000-configuration bound.

Valid machines can run forever (see `loop.yaml`). The checker validates syntax and
machine structure; it cannot solve the general halting problem. Reaching a step or
search limit reports **Limit reached** (`RUNNING`), never a rejection or proof of
an infinite computation. There is no unbounded execution mode.

## YAML

Machine YAML requires `name`, `model`, `tapes`, `blank`, `input_alphabet`,
`tape_alphabet`, `states`, `start`, `accept`, `reject`, and `transitions`.
`model` is `deterministic` or `nondeterministic`. Each transition has one
`[read, write, move]` triple per tape; moves are `L`, `R`, or `S`. Rules can be
flat or grouped by source state. Symbols are single characters; quote YAML
values that could be read as numbers or booleans. See [the copy example](data/examples/machines/copy.yaml).

Input YAML has a `tapes` list. Each entry has `contents` and optional `origin`
and `head` positions, which default to zero. Omitted trailing tapes start blank.

```yaml
tapes:
  - contents: "abba"
    origin: 0
    head: 0
```

## Development

Use Node.js 20.9 or newer. See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and
[web/README.md](web/README.md) for web details. Licensed under
[Apache-2.0](LICENSE).
