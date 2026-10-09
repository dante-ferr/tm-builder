# Teocomp: Turing machine design tools

Define Turing machines in YAML, validate them in VS Code, view live diagrams,
and execute them with custom tape setups. Supports deterministic and
nondeterministic machines with one or more tapes, infinite in both directions.

## Setup

Run from the project root:

```bash
make setup
make install-extension
```

Open the root in VS Code, reload the window, and install the recommended Red Hat
YAML extension. Teocomp validates unsaved machine definitions and completes states,
symbols, and moves. It uses `python/.venv`; set `teocomp.pythonPath` for another
interpreter.

## Commands

| Command | Action |
| --- | --- |
| `make view` | Open the live diagram, tape debugger, and SVG download |
| `make check` | Validate a machine |
| `make run INPUTS=inputs/copy.yaml` | Execute with a starting tape setup |
| `make run` | Execute with blank tapes |
| `make graph` | Export SVG |
| `make graph OUTPUT=output/copy.dot` | Export DOT |
| `make test` | Run regression checks |
| `make` | List all available commands |

Commands default to `machines/copy.yaml`. Select another file with
`MACHINE=machines/your-machine.yaml`. Use `MAX_STEPS` for execution limits,
`PORT` for the viewer port, and `ARGS` for additional CLI options:

```bash
make run ARGS='--input abba ""'
```
`make view` opens a picker listing YAML files in `machines/`; select a machine or
import a machine file. An explicit `MACHINE=...` still opens that file directly.
Starting tapes also lists YAML files in `inputs/` alongside the file import.
Bundled files are labeled **(example)**; **Hide examples** filters both lists.
The lists update as files are added or removed. Imported machines stay in memory.


The viewer follows saved changes and unsaved VS Code edits. It keeps the last
valid diagram visible while errors are fixed. For a custom port, set
`teocomp.previewPort` to match `PORT`.

## Animated debugging

Run `make view`, choose a machine, expand **Starting tapes**, and select an input,
paste setup YAML, or import a file such as `inputs/copy.yaml`. Choose a maximum step count and click **Load trace**.
Use **Step**, **Back**, **Reset**, or the timeline to inspect configurations;
**Play** animates reading, writing, head movement, and entering the next state.
The diagram highlights the active state and the applied rule's edge. Rule details
show the exact transition when several rules share an edge.

Set a state breakpoint or a rule number (starting at 1) to pause playback.
**Play** resumes past the current breakpoint. Machine edits invalidate the trace;
load it again after fixing diagnostics. A step limit leaves the result `RUNNING`.
Nondeterministic playback shows one accepting path, or the last explored path;
the final status describes the whole bounded search, not just the displayed path.

## Machine definitions

Start with [machines/copy.yaml](machines/copy.yaml).
Keep your definitions under `machines/` and setups under `inputs/`. The bundled
examples are tracked; other files in those folders are ignored.

| Machine | Syntax demonstrated | Input setup |
| --- | --- | --- |
| [copy](machines/copy.yaml) | Flat transitions, multiple tapes, `R`/`S` | [copy](inputs/copy.yaml) or [preloaded tapes](inputs/copy_preloaded.yaml) |
| [single_tape](machines/single_tape.yaml) | `{state: [...]}` groups, optional matching `from`, quoted symbols, rejection | [binary](inputs/binary.yaml) |
| [nondeterministic_contains_one](machines/nondeterministic_contains_one.yaml) | Block groups, multiple rules for the same read tuple | [binary](inputs/binary.yaml) |
| [blank_writer](machines/blank_writer.yaml) | Grouped transitions, empty input alphabet, `L` | None |
| [halt](machines/halt.yaml) | Custom blank symbol, empty rules and terminal sets | None |
| [loop](machines/loop.yaml) | Self-loop and execution limits (`RUNNING`) | None |

```bash
make run MACHINE=machines/single_tape.yaml INPUTS=inputs/binary.yaml
```

Required fields: `name`, `model`, `tapes`, `blank`, `input_alphabet`,
`tape_alphabet`, `states`, `start`, `accept`, `reject`, and `transitions`.
Empty accept/reject sets and transition lists use `[]`. Each transition requires
`from`, `tapes`, and `to`. Each entry in `tapes` contains the symbol read, the
symbol written, and the head direction for that tape:

```yaml
- {from: copy, tapes: [[a, a, R], [_, a, R]], to: copy}
```

Alternatively, group transitions by source state to infer `from`:

```yaml
transitions: {
  copy: [
    {tapes: [[a, a, R], [_, a, R]], to: copy},
    {tapes: [[_, _, S], [_, _, S]], to: accept}
  ]
}
```

Block-style YAML works too. In a group, `from` is optional; if supplied, it must
match the outer state. Both formats require `tapes` and `to` (and `from` in
the flat format).

The `tapes` array follows tape order. Each triple is `[read, write, move]`;
moves are `L` (left), `R` (right), or `S` (stay).
Symbols are single characters; quote numeric or boolean-like YAML values.
Set `model` to `deterministic` or `nondeterministic`.

Execution prints the final tapes and status: `ACCEPT`, `REJECT`, `HALT`, or
`RUNNING`. A deterministic machine halts when no rule applies. A nondeterministic
machine accepts if any branch accepts and rejects if every branch halts without
accepting. Reaching an execution limit returns `RUNNING`.

## Starting tapes

Optional setup files belong under `inputs/`:

```yaml
tapes:
  - contents: "abba"
    origin: 0  # First character's cell index; default 0
    head: 0    # Initial head position; default 0
  - contents: ""
```

Each tape requires string `contents`; optional `origin` and `head` are integers
and may be negative. Contents can use any symbol in `tape_alphabet`. Omitted
trailing tapes start blank; `tapes: []` starts all tapes blank.

A run without a setup or direct input starts all tapes blank, including for legacy
definitions with embedded `inputs`. Direct `--input` strings use `input_alphabet`,
one string per tape, and cannot be combined with a setup file. YAML files receive type and schema
checks in VS Code and are validated when executed.

## Development

Use `make build` after web changes, `make install-extension` after extension
changes, and `make schemas` after model changes. `make test-vscode` runs the
extension host checks. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution checks.

Simulation uses [multitape-tm](https://pypi.org/project/multitape-tm/); diagrams use
[Graphviz via Viz.js](https://viz-js.com/api/).

Licensed under [MIT](LICENSE).
