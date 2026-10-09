"""Typed starting tape setups stored separately from machine definitions."""

from mtm.tape import Tape
from pydantic import BaseModel, ConfigDict, Field

from tm_builder.definition import DefinitionError, MachineDefinition, parse_yaml_model


class TapeSetup(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    contents: str = Field(description="Tape symbols, in cell order; quote numeric strings.")
    origin: int = Field(default=0, description="Cell index of the first character in contents.")
    head: int = Field(default=0, description="Initial head cell index.")


class InputDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    tapes: list[TapeSetup] = Field(description="Tape setups in order. Omitted trailing tapes start blank.")

    def validate_machine(self, definition: MachineDefinition):
        if len(self.tapes) > definition.tapes:
            raise ValueError(f"Setup has {len(self.tapes)} tapes; machine has {definition.tapes}.")
        for index, setup in enumerate(self.tapes):
            if any(symbol not in definition.tape_alphabet for symbol in setup.contents):
                raise ValueError(f"Tape {index + 1}: contents must use only the tape alphabet.")

    def build_tapes(self, definition: MachineDefinition) -> list[Tape]:
        self.validate_machine(definition)
        tapes = []
        for setup in self.tapes:
            tape = Tape(definition.blank)
            tape.cells = {setup.origin + i: symbol for i, symbol in enumerate(setup.contents)}
            tape.head = setup.head
            tapes.append(tape)
        return tapes + [Tape(definition.blank) for _ in range(definition.tapes - len(tapes))]


def parse_inputs(source: str, definition: MachineDefinition | None = None) -> InputDefinition:
    setup, diagnostic = parse_yaml_model(source, InputDefinition)
    if definition is not None:
        issues = []
        if len(setup.tapes) > definition.tapes:
            issues.append(diagnostic(f"Setup has {len(setup.tapes)} tapes; machine has {definition.tapes}.", ("tapes",)))
        for index, tape in enumerate(setup.tapes):
            if any(symbol not in definition.tape_alphabet for symbol in tape.contents):
                issues.append(diagnostic("Contents must use only the tape alphabet.", ("tapes", index, "contents")))
        if issues:
            raise DefinitionError(issues)
    return setup
