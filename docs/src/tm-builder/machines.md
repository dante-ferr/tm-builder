# Machine definitions

A machine file requires `name`, `model`, `tapes`, `blank`, `input_alphabet`,
`tape_alphabet`, `states`, `start`, `accept`, `reject`, and `transitions`.
`model` is `deterministic` or `nondeterministic`. Each transition has one
`[read, write, move]` triple per tape. Moves are `L`, `R`, or `S`. Rules can be
flat or grouped by source state.

Optional `groups` maps each cluster name to the states it encloses in the state
graph. A state belongs to at most one group. Omitting `groups` leaves every
state ungrouped. Symbols are single characters. Quote YAML values that YAML
could read as numbers or booleans. See
[copy](../../../data/examples/machines/copy.yaml) and
[state groups](../../../data/examples/machines/state_groups.yaml).

## Inputs

An input file has a `tapes` list. Each entry has `contents` and optional
`origin` and `head` positions, which default to zero. Omitted trailing tapes
start blank.

```yaml
tapes:
  - contents: "abba"
    origin: 0
    head: 0
```

## Examples

`make setup` copies these files into a new workspace. Later setup runs leave
existing files in place.

| Machine | Demonstrates | Setup |
| --- | --- | --- |
| [copy](../../../data/examples/machines/copy.yaml) | Multiple tapes and flat rules | [copy](../../../data/examples/inputs/copy.yaml) |
| [single_tape](../../../data/examples/machines/single_tape.yaml) | Grouped rules, quoted symbols, rejection | [binary](../../../data/examples/inputs/binary.yaml) |
| [nondeterministic_contains_one](../../../data/examples/machines/nondeterministic_contains_one.yaml) | Nondeterministic rules | [binary](../../../data/examples/inputs/binary.yaml) |
| [halt](../../../data/examples/machines/halt.yaml) | Custom blank and terminal states | — |
| [binary_counter](../../../data/examples/machines/binary_counter.yaml) | Exponential binary counting and long traces | [8,190 steps](../../../data/examples/inputs/binary_counter.yaml), [1,000,000 steps](../../../data/examples/inputs/binary_counter_million.yaml) |
| [state_groups](../../../data/examples/machines/state_groups.yaml) | Optional state groups | — |

Selecting the binary counter in the viewer loads the million-step input. Allow
at least 1,000,000 steps and press **Load Trace**.
