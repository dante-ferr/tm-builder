"""Bounded execution traces for the CLI and interactive workspace."""

from collections import deque

from mtm.tape import Tape

from teocomp.definition import MachineDefinition


def _rule(transition, index):
    return {"index": index, "source": transition.source, "to": transition.to,
            "tapes": [list(action) for action in transition.tapes]}


def _reason(status, nondeterministic=False):
    return {"ACCEPT": "An accepting state was reached.",
            "REJECT": "The search was exhausted without an accepting branch." if nondeterministic else "A rejecting state was reached.",
            "HALT": "No transition matches the current state and symbols.",
            "RUNNING": "Execution stopped at the step or configuration limit."}[status]


def simulate(definition: MachineDefinition, inputs=None, max_steps=1000, *, setup=None):
    if type(max_steps) is not int or not 1 <= max_steps <= 10000:
        raise ValueError("max_steps must be an integer between 1 and 10000.")
    if definition.model == "nondeterministic":
        return _simulate_nondeterministic(definition, inputs, max_steps, setup=setup)
    machine = definition.create_machine(inputs, setup=setup)
    rules = {(transition.source, tuple(action[0] for action in transition.tapes)): (index, transition)
             for index, transition in enumerate(definition.transitions)}

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
        selected = rules.get((machine.current_state, tuple(tape.read() for tape in machine.tapes)))
        before = machine.step_count
        status = machine.step()
        if machine.step_count != before:
            frame = snapshot()
            frame["transition"] = _rule(selected[1], selected[0])
            frames.append(frame)
    return {"status": status, "reason": _reason(status), "frames": frames,
            "configuration": machine.get_configuration()}


def _simulate_nondeterministic(definition, inputs, max_steps, max_configurations=10000, *, setup=None):
    """Breadth-first search so any accepting computation is found first."""
    if setup is not None and inputs is not None:
        raise ValueError("Choose input strings or a tape setup, not both.")
    prepared = setup.build_tapes(definition) if setup is not None else None
    chosen = [""] * definition.tapes if prepared is not None else (inputs if inputs is not None else definition.inputs)
    if chosen is None:
        chosen = [""] * definition.tapes
    if len(chosen) != definition.tapes:
        raise ValueError(f"Expected {definition.tapes} input strings, one per tape.")
    for index, value in enumerate(chosen):
        if not isinstance(value, str) or any(symbol not in definition.input_alphabet for symbol in value):
            raise ValueError(f"Tape {index + 1}: input must use only the input alphabet.")

    def snapshot(state, tapes, step):
        rendered = []
        for tape in tapes:
            left, right = tape.head - 8, tape.head + 8
            rendered.append({"head": tape.head, "left": left,
                             "cells": [tape.cells.get(i, definition.blank) for i in range(left, right + 1)]})
        return {"state": state, "step": step, "tapes": rendered}

    moves = {"L": -1, "R": 1, "S": 0}
    tapes = prepared if prepared is not None else [Tape(definition.blank, text) for text in chosen]
    records = [{"state": definition.start, "tapes": tapes, "step": 0, "parent": None, "transition": None}]
    queue = deque([0])
    seen = set()
    leaf = 0
    exhausted = True

    def path_to(record_id):
        path = []
        while record_id is not None:
            record = records[record_id]
            frame = snapshot(record["state"], record["tapes"], record["step"])
            if record["transition"] is not None:
                frame["transition"] = record["transition"]
            path.append(frame)
            record_id = record["parent"]
        return list(reversed(path))

    while queue:
        record_id = queue.popleft()
        current = records[record_id]
        state, current_tapes, step_count = current["state"], current["tapes"], current["step"]
        leaf = record_id
        if state in definition.accept:
            path = path_to(record_id)
            last = path[-1]
            configuration = {"state": last["state"], "step": last["step"],
                             "tapes": [str(tape) for tape in current_tapes]}
            return {"status": "ACCEPT", "reason": _reason("ACCEPT", True), "frames": path, "configuration": configuration}
        if state in definition.reject:
            continue

        signature = (state, tuple((tape.head, tuple(sorted(tape.cells.items()))) for tape in current_tapes))
        if signature in seen:
            continue
        seen.add(signature)
        options = [(index, transition) for index, transition in enumerate(definition.transitions)
                   if transition.source == state
                   and tuple(tape.read() for tape in current_tapes)
                   == tuple(action[0] for action in transition.tapes)]
        if not options:
            continue
        if step_count >= max_steps:
            exhausted = False
            continue
        for index, transition in options:
            if len(transition.tapes) != definition.tapes:
                continue
            if len(records) >= max_configurations:
                exhausted = False
                break
            next_tapes = []
            for tape, (_read, symbol, direction) in zip(current_tapes, transition.tapes):
                clone = Tape(definition.blank)
                clone.cells = tape.cells.copy()
                clone.head = tape.head
                clone.write(symbol)
                clone.move(moves[direction])
                next_tapes.append(clone)
            records.append({"state": transition.to, "tapes": next_tapes,
                            "step": step_count + 1, "parent": record_id,
                            "transition": _rule(transition, index)})
            queue.append(len(records) - 1)

    chosen_leaf = records[leaf]
    status = "REJECT" if exhausted else "RUNNING"
    configuration = {"state": chosen_leaf["state"], "step": chosen_leaf["step"],
                     "tapes": [str(tape) for tape in chosen_leaf["tapes"]]}
    return {"status": status, "reason": _reason(status, True),
            "frames": path_to(leaf), "configuration": configuration}
