# tm-builder

Define Turing machines in YAML, validate them in VS Code, view diagrams, and
run deterministic or nondeterministic machines with one or more tapes.

## Setup

From the project root:

```bash
make setup
make install-extension
```

Open the root folder in VS Code and install the recommended Red Hat YAML
extension. The extension uses `python/.venv`; set `tm-builder.pythonPath` to use
another Python interpreter.

Formal table images need system software that Python and npm cannot install as
project dependencies. On Arch, Debian/Ubuntu, or Fedora Linux, install it with:

```bash
make setup-formal
```

This uses the OS package manager and may prompt for `sudo`. Other systems need
TeX Live (LuaLaTeX or XeLaTeX, plus LaTeX packages) and Poppler's `pdftoppm` on
`PATH`. This extra setup is only needed for `STYLE=formal` image exports;
readable images, CSV, and LaTeX source exports do not need it.

## Commands

| Command | Action |
| --- | --- |
| `make view` | Open the viewer and debugger |
| `make check` | Validate a machine |
| `make run` | Run with blank tapes |
| `make run INPUTS=inputs/copy.yaml` | Run with a tape setup |
| `make graph` | Export SVG |
| `make table` | Export readable PNG pieces |
| `make test` | Run project checks |

Commands use `machines/copy.yaml` by default. Set `MACHINE=...` to choose a
machine. `make` lists all commands. For example:

```bash
make run MACHINE=machines/single_tape.yaml INPUTS=inputs/binary.yaml
```

## Transition tables

Choose `FORMAT=csv|image|tex`, `STYLE=readable|formal`, and `LAYOUT=split|long`.
Defaults are `image`, `readable`, and `split`. Split images fit A4 and break
between rows; long images use one continuous page. Set `DPI` from 72 to 600.

```bash
make table FORMAT=image STYLE=readable
make table FORMAT=image STYLE=formal LAYOUT=long
make table FORMAT=csv STYLE=formal
```

Readable tables list source, read, next, write, and move. Formal tables show
`(q, a)` and `δ(q, a)`; nondeterministic results are grouped into sets. Formal
CSV contains LaTeX text. `FORMAT=tex` saves LaTeX source without compiling it.
Outputs go under `output/` by default; set `OUTPUT=...` to choose a path.

The viewer's **Export table…** menu offers the same options. Multiple image
pieces download as a ZIP.

## Examples

Machine files go in `machines/`; tape setups go in `inputs/`. Bundled examples
are tracked; personal files in these folders are ignored.

| Machine | Demonstrates | Setup |
| --- | --- | --- |
| [copy](machines/copy.yaml) | Multiple tapes, flat transitions, `R` and `S` | [copy](inputs/copy.yaml), [preloaded](inputs/copy_preloaded.yaml) |
| [single_tape](machines/single_tape.yaml) | Grouped transitions, quoted symbols, rejection | [binary](inputs/binary.yaml) |
| [nondeterministic_contains_one](machines/nondeterministic_contains_one.yaml) | Nondeterministic rules | [binary](inputs/binary.yaml) |
| [blank_writer](machines/blank_writer.yaml) | Empty input alphabet, `L` | — |
| [halt](machines/halt.yaml) | Custom blank, empty rules and terminal sets | — |
| [loop](machines/loop.yaml) | Self-loop and step limits | — |

## YAML syntax

Start with [machines/copy.yaml](machines/copy.yaml). Required fields are
`name`, `model`, `tapes`, `blank`, `input_alphabet`, `tape_alphabet`, `states`,
`start`, `accept`, `reject`, and `transitions`. Set `model` to `deterministic`
or `nondeterministic`. Empty lists use `[]`.

Each rule has a source state, one `[read, write, move]` triple per tape, and a
destination state. Moves are `L`, `R`, or `S`. Rules can be flat:

```yaml
- {from: copy, tapes: [[a, a, R], [_, a, R]], to: copy}
```

Or grouped by source state, where `from` is inferred:

```yaml
transitions:
  copy:
    - {tapes: [[a, a, R], [_, a, R]], to: copy}
```

Block-style YAML is supported too. Symbols are single characters; quote values
that YAML might read as numbers or booleans.

## Tape setups

Setup files contain one entry per tape. `origin` and `head` default to zero:

```yaml
tapes:
  - contents: "abba"
    origin: 0
    head: 0
  - contents: ""
```

Omitted trailing tapes start blank. Without a setup, all tapes start blank.
Direct `--input` strings use the input alphabet and cannot be combined with a
setup file.

## Development

Use Node.js 20.9 or newer. `make setup` installs project dependencies;
`make build` builds the web UI. See [CONTRIBUTING.md](CONTRIBUTING.md) for
development checks and [web/README.md](web/README.md) for web-specific details.

Simulation uses [multitape-tm](https://pypi.org/project/multitape-tm/);
diagrams use [Viz.js](https://viz-js.com/api/). Licensed under [MIT](LICENSE).
