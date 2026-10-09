"""Validate an unsaved VS Code buffer via a small JSON stdin/stdout protocol."""

from dataclasses import asdict
import json
import sys

import yaml

from teocomp.definition import DefinitionError, UniqueKeyLoader, parse_definition


def inspect_source(source: str) -> dict:
    # Keep completion available while the transition section is incomplete.
    suggestions = {"states": [], "symbols": [], "moves": ["L", "R", "S"],
                   "models": ["deterministic", "nondeterministic"]}
    try:
        data = yaml.load(source, Loader=UniqueKeyLoader)
        if isinstance(data, dict):
            for field, key in (("states", "states"), ("tape_alphabet", "symbols")):
                values = data.get(field)
                if isinstance(values, list):
                    suggestions[key] = [v for v in values if isinstance(v, str)]
    except yaml.YAMLError:
        pass
    try:
        _, warnings = parse_definition(source)
        return {"valid": True, "diagnostics": [asdict(d) for d in warnings], "suggestions": suggestions}
    except DefinitionError as error:
        return {"valid": False, "diagnostics": [asdict(d) for d in error.diagnostics], "suggestions": suggestions}


def main():
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict) or not isinstance(request.get("source"), str):
            raise ValueError("Expected a source string")
        json.dump(inspect_source(request["source"]), sys.stdout)
        sys.stdout.write("\n")
    except (ValueError, RecursionError) as error:
        json.dump({"error": str(error)}, sys.stdout)
        sys.stdout.write("\n")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
