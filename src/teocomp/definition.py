"""Typed YAML definitions and validation shared by every entry point."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Literal

import yaml
from mtm import MultiTapeTuringMachine
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from yaml.nodes import MappingNode, SequenceNode

Symbol = Annotated[str, Field(min_length=1, max_length=1)]
State = Annotated[str, Field(min_length=1)]


class Transition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    source: State = Field(alias="from")
    read: list[Symbol]
    to: State
    write: list[Symbol]
    move: list[Literal["L", "R", "S"]]


class MachineDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = "Turing machine"
    tapes: int = Field(ge=1, le=32)
    blank: Symbol = "_"
    input_alphabet: list[Symbol]
    tape_alphabet: list[Symbol]
    states: list[State] = Field(min_length=1)
    start: State
    accept: list[State] = Field(default_factory=list)
    reject: list[State] = Field(default_factory=list)
    inputs: list[str] | None = None
    transitions: list[Transition]

    def create_machine(self, inputs: list[str] | None = None) -> MultiTapeTuringMachine:
        chosen = inputs if inputs is not None else self.inputs
        if chosen is None:
            chosen = [""] * self.tapes
        if len(chosen) != self.tapes:
            raise ValueError(f"Expected {self.tapes} input strings, one per tape.")
        for index, value in enumerate(chosen):
            if not isinstance(value, str) or any(s not in self.input_alphabet for s in value):
                raise ValueError(f"Tape {index + 1}: input must use only the input alphabet.")
        moves = {"L": -1, "R": 1, "S": 0}
        return MultiTapeTuringMachine(
            states=self.states, input_alphabet=self.input_alphabet,
            tape_alphabet=self.tape_alphabet, blank=self.blank,
            transitions={
                (t.source, tuple(t.read)): (t.to, tuple(t.write), tuple(moves[m] for m in t.move))
                for t in self.transitions
            },
            start_state=self.start, accept_states=self.accept, reject_states=self.reject,
            num_tapes=self.tapes, initial_inputs=chosen,
        )


class UniqueKeyLoader(yaml.SafeLoader):
    """Reject duplicate keys instead of silently overriding a definition."""

    def construct_mapping(self, node, deep=False):
        seen = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, str):
                raise yaml.constructor.ConstructorError(None, None, "Keys must be strings", key_node.start_mark)
            if key in seen:
                raise yaml.constructor.ConstructorError(None, None, f"Duplicate key: {key}", key_node.start_mark)
            seen.add(key)
        return super().construct_mapping(node, deep=deep)


@dataclass
class Diagnostic:
    message: str
    line: int = 1
    column: int = 1
    severity: str = "error"


class DefinitionError(ValueError):
    def __init__(self, diagnostics: list[Diagnostic]):
        self.diagnostics = diagnostics
        super().__init__("\n".join(f"{d.line}:{d.column}: {d.message}" for d in diagnostics))


def parse_definition(source: str) -> tuple[MachineDefinition, list[Diagnostic]]:
    """Validate syntax, field types, and TM semantics; retain source locations."""
    try:
        root = yaml.compose(source, Loader=UniqueKeyLoader)
        data = yaml.load(source, Loader=UniqueKeyLoader)
    except yaml.YAMLError as error:
        mark = getattr(error, "problem_mark", None)
        raise DefinitionError([Diagnostic(
            getattr(error, "problem", None) or str(error),
            mark.line + 1 if mark else 1, mark.column + 1 if mark else 1,
        )]) from error

    def diagnostic(message, path=(), severity="error"):
        node = root
        for part in path:
            if isinstance(node, MappingNode):
                node = next((v for k, v in node.value if k.value == str(part)), node)
            elif isinstance(node, SequenceNode) and isinstance(part, int) and part < len(node.value):
                node = node.value[part]
            else:
                break
        mark = node.start_mark if node else None
        return Diagnostic(message, mark.line + 1 if mark else 1, mark.column + 1 if mark else 1, severity)

    try:
        definition = MachineDefinition.model_validate(data)
    except ValidationError as error:
        raise DefinitionError([
            diagnostic(f"{'.'.join(map(str, e['loc'])) or 'machine'}: {e['msg']}", e["loc"])
            for e in error.errors()
        ]) from error

    issues = []
    states, symbols = set(definition.states), set(definition.tape_alphabet)
    for field in ("states", "input_alphabet", "tape_alphabet", "accept", "reject"):
        values = getattr(definition, field)
        if len(set(values)) != len(values):
            issues.append(diagnostic(f"{field}: duplicate entries", (field,)))
    if definition.blank not in symbols:
        issues.append(diagnostic("Blank must belong to tape_alphabet", ("blank",)))
    if definition.blank in definition.input_alphabet:
        issues.append(diagnostic("Blank must not belong to input_alphabet", ("input_alphabet",)))
    if not set(definition.input_alphabet) <= symbols:
        issues.append(diagnostic("input_alphabet must be a subset of tape_alphabet", ("input_alphabet",)))
    for field in ("start", "accept", "reject"):
        values = [definition.start] if field == "start" else getattr(definition, field)
        for value in values:
            if value not in states:
                issues.append(diagnostic(f"Unknown state {value!r}", (field,)))
    if set(definition.accept) & set(definition.reject):
        issues.append(diagnostic("Accept and reject states must be disjoint", ("reject",)))
    if definition.inputs is not None:
        if len(definition.inputs) != definition.tapes:
            issues.append(diagnostic(f"inputs needs {definition.tapes} strings", ("inputs",)))
        for i, value in enumerate(definition.inputs):
            if any(s not in definition.input_alphabet for s in value):
                issues.append(diagnostic("Input contains symbols outside input_alphabet", ("inputs", i)))

    seen = set()
    terminal = set(definition.accept) | set(definition.reject)
    for index, transition in enumerate(definition.transitions):
        path = ("transitions", index)
        for field, value in (("from", transition.source), ("to", transition.to)):
            if value not in states:
                issues.append(diagnostic(f"Unknown state {value!r}", (*path, field)))
        if transition.source in terminal:
            issues.append(diagnostic("Halting states cannot have outgoing transitions", (*path, "from")))
        for field in ("read", "write", "move"):
            values = getattr(transition, field)
            if len(values) != definition.tapes:
                issues.append(diagnostic(f"{field} needs {definition.tapes} entries", (*path, field)))
            if field != "move":
                for j, symbol in enumerate(values):
                    if symbol not in symbols:
                        issues.append(diagnostic(f"Unknown tape symbol {symbol!r}", (*path, field, j)))
        key = (transition.source, tuple(transition.read))
        if key in seen:
            issues.append(diagnostic("Duplicate rule for this state and read tuple (nondeterministic)", path))
        seen.add(key)
    if issues:
        raise DefinitionError(issues)

    reachable = {definition.start}
    while True:
        expanded = reachable | {t.to for t in definition.transitions if t.source in reachable}
        if expanded == reachable:
            break
        reachable = expanded
    warnings = [diagnostic(f"State {state!r} is unreachable", ("states", i), "warning")
                for i, state in enumerate(definition.states) if state not in reachable]
    return definition, warnings
