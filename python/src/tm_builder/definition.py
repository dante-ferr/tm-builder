"""Typed YAML definitions and validation shared by every entry point."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Annotated, Literal

import yaml
from mtm import MultiTapeTuringMachine
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, TypeAdapter, ValidationError, ValidationInfo
from yaml.nodes import MappingNode, SequenceNode

if TYPE_CHECKING:
    from tm_builder.inputs import InputDefinition

Symbol = Annotated[str, Field(min_length=1, max_length=1)]
State = Annotated[str, Field(min_length=1)]
GroupName = Annotated[str, Field(min_length=1)]
GroupStates = Annotated[list[State], Field(min_length=1)]
Move = Literal["L", "R", "S"]
TapeAction = Annotated[
    tuple[Symbol, Symbol, Move],
    BeforeValidator(lambda value: tuple(value) if isinstance(value, list) else value),
]


class Transition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    source: State = Field(alias="from")
    tapes: list[TapeAction]
    to: State


class GroupedTransition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    source: State | None = Field(default=None, alias="from")
    tapes: list[TapeAction]
    to: State


GroupedTransitions = dict[State, list[GroupedTransition]]
grouped_adapter = TypeAdapter(GroupedTransitions)


def normalize_transitions(value, info: ValidationInfo):
    """Convert grouped YAML to the flat representation used by the runtime."""
    if not isinstance(value, dict):
        return value
    groups = grouped_adapter.validate_python(value, strict=True)
    errors, transitions = [], []
    for state, rules in groups.items():
        # Even empty groups must refer to a declared state.
        if "states" in info.data and state not in info.data["states"]:
            errors.append({"type": "value_error", "loc": (state,), "input": state,
                           "ctx": {"error": ValueError(f"Unknown state {state!r}")}})
        for index, rule in enumerate(rules):
            if rule.source is not None and rule.source != state:
                errors.append({"type": "value_error", "loc": (state, index, "from"), "input": rule.source,
                               "ctx": {"error": ValueError(f"from must match outer state {state!r}")}})
            transitions.append(Transition.model_validate({**rule.model_dump(by_alias=True), "from": state}))
    if errors:
        raise ValidationError.from_exception_data("GroupedTransitions", errors)
    return transitions


Transitions = Annotated[
    list[Transition],
    BeforeValidator(normalize_transitions, json_schema_input_type=list[Transition] | GroupedTransitions),
]


class MachineDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str
    model: Literal["deterministic", "nondeterministic"]
    tapes: int = Field(ge=1, le=32)
    blank: Symbol
    input_alphabet: list[Symbol]
    tape_alphabet: list[Symbol]
    states: list[State] = Field(min_length=1)
    start: State
    accept: list[State]
    reject: list[State]
    inputs: list[str] | None = None
    # Optional clusters. Each state belongs to at most one group.
    groups: dict[GroupName, GroupStates] = Field(default_factory=dict)
    transitions: Transitions

    def create_machine(self, inputs: list[str] | None = None, *,
                       setup: InputDefinition | None = None) -> MultiTapeTuringMachine:
        if self.model != "deterministic":
            raise ValueError("Nondeterministic machines run with tm-builder simulation, not as a single mtm machine.")
        if setup is not None and inputs is not None:
            raise ValueError("Choose input strings or a tape setup, not both.")
        prepared = setup.build_tapes(self) if setup is not None else None
        chosen = [""] * self.tapes if prepared is not None else (inputs if inputs is not None else self.inputs)
        if chosen is None:
            chosen = [""] * self.tapes
        if len(chosen) != self.tapes:
            raise ValueError(f"Expected {self.tapes} input strings, one per tape.")
        for index, value in enumerate(chosen):
            if not isinstance(value, str) or any(s not in self.input_alphabet for s in value):
                raise ValueError(f"Tape {index + 1}: input must use only the input alphabet.")
        moves = {"L": -1, "R": 1, "S": 0}
        machine = MultiTapeTuringMachine(
            states=self.states, input_alphabet=self.input_alphabet,
            tape_alphabet=self.tape_alphabet, blank=self.blank,
            transitions={
                (t.source, tuple(action[0] for action in t.tapes)): (
                    t.to, tuple(action[1] for action in t.tapes),
                    tuple(moves[action[2]] for action in t.tapes))
                for t in self.transitions
            },
            start_state=self.start, accept_states=self.accept, reject_states=self.reject,
            num_tapes=self.tapes, initial_inputs=chosen,
        )
        if prepared is not None:
            machine.tapes = prepared
        return machine


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


def parse_yaml_model(source: str, model: type[BaseModel]):
    """Validate a strict YAML model and retain locations for diagnostics."""
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
        # Semantic checks use flat indices; map them back to the grouped YAML.
        groups = data.get("transitions") if isinstance(data, dict) else None
        if (isinstance(groups, dict) and len(path) > 1
                and path[0] == "transitions" and isinstance(path[1], int)):
            remaining = path[1]
            for state, rules in groups.items():
                if not isinstance(rules, list):
                    continue
                if remaining < len(rules):
                    inferred_source = len(path) > 2 and path[2] == "from" and "from" not in rules[remaining]
                    path = ("transitions", state) if inferred_source else ("transitions", state, remaining, *path[2:])
                    break
                remaining -= len(rules)
        node = root
        for depth, part in enumerate(path):
            if isinstance(node, MappingNode):
                pair = next(((k, v) for k, v in node.value if k.value == str(part)), None)
                if pair is not None:
                    # A diagnostic about an entire state group belongs on its key.
                    node = pair[0] if depth == 1 and len(path) == 2 and path[0] == "transitions" else pair[1]
            elif isinstance(node, SequenceNode) and isinstance(part, int) and part < len(node.value):
                node = node.value[part]
            else:
                break
        mark = node.start_mark if node else None
        return Diagnostic(message, mark.line + 1 if mark else 1, mark.column + 1 if mark else 1, severity)

    try:
        definition = model.model_validate(data)
    except ValidationError as error:
        raise DefinitionError([
            diagnostic(f"{'.'.join(map(str, e['loc'])) or 'machine'}: {e['msg']}", e["loc"])
            for e in error.errors()
        ]) from error

    return definition, diagnostic


def parse_definition(source: str) -> tuple[MachineDefinition, list[Diagnostic]]:
    """Validate syntax, field types, and TM semantics; retain source locations."""
    definition, diagnostic = parse_yaml_model(source, MachineDefinition)

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
    seen_members = {}
    for name, members in definition.groups.items():
        listed = set()
        for member in members:
            if member not in states:
                issues.append(diagnostic(f"Unknown state {member!r}", ("groups", name)))
            elif member in listed or member in seen_members:
                previous = seen_members.get(member, name)
                message = (f"State {member!r} is listed more than once" if previous == name
                           else f"State {member!r} is already in group {previous!r}")
                issues.append(diagnostic(message, ("groups", name)))
            else:
                listed.add(member)
                seen_members[member] = name
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
        if len(transition.tapes) != definition.tapes:
            issues.append(diagnostic(f"tapes needs {definition.tapes} entries", (*path, "tapes")))
        for j, (read, write, _move) in enumerate(transition.tapes):
            for field, symbol in (("read", read), ("write", write)):
                if symbol not in symbols:
                    issues.append(diagnostic(f"Unknown tape symbol {symbol!r}", (*path, "tapes", j, field)))
        key = (transition.source, tuple(action[0] for action in transition.tapes))
        if key in seen and definition.model == "deterministic":
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
