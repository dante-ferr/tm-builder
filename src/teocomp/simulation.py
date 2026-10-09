"""Bounded execution traces for the CLI and interactive workspace."""

from teocomp.definition import MachineDefinition


def simulate(definition: MachineDefinition, inputs=None, max_steps=1000):
    if type(max_steps) is not int or not 1 <= max_steps <= 10000:
        raise ValueError("max_steps must be an integer between 1 and 10000.")
    machine = definition.create_machine(inputs)

    def snapshot():
        tapes = []
        for tape in machine.tapes:
            left, right = tape.head - 8, tape.head + 8
            tapes.append({"head": tape.head, "left": left,
                          "cells": [tape.cells.get(i, machine.blank) for i in range(left, right + 1)]})
        return {"state": machine.current_state, "step": machine.step_count, "tapes": tapes}

    frames = [snapshot()]
    status = "ACCEPT" if machine.current_state in machine.accept_states else (
        "REJECT" if machine.current_state in machine.reject_states else "RUNNING")
    while status == "RUNNING" and machine.step_count < max_steps:
        before = machine.step_count
        status = machine.step()
        if machine.step_count != before:
            frames.append(snapshot())
    return {"status": status, "frames": frames, "configuration": machine.get_configuration()}
