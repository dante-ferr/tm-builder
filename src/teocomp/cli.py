"""CLI for the machine designer, validator, simulator, and DOT exporter."""

import argparse
import json
from pathlib import Path

from teocomp.definition import DefinitionError, MachineDefinition, parse_definition
from teocomp.simulation import simulate


def main() -> None:
    parser = argparse.ArgumentParser(description="Design multi-tape Turing machines.")
    commands = parser.add_subparsers(dest="command")
    design = commands.add_parser("design", aliases=["view"], help="Open a live diagram for a YAML file")
    design.add_argument("machine", nargs="?", default="machines/copy.yaml")
    design.add_argument("--port", type=int, default=8765)
    design.add_argument("--no-open", action="store_true", help="Print the URL without opening a browser")
    for name, help_text in (("check", "Validate a YAML definition"), ("run", "Run a machine"),
                            ("graph", "Render a YAML machine to SVG or DOT")):
        cmd = commands.add_parser(name, help=help_text)
        cmd.add_argument("machine", nargs="?", default="machines/copy.yaml")
        if name == "run":
            cmd.add_argument("--input", nargs="+", help="One string per tape, e.g. --input abba ''")
            cmd.add_argument("--max-steps", type=int, default=1000)
        if name == "graph":
            cmd.add_argument("--output", default="output/machine.svg")
    schema = commands.add_parser("schema", help="Generate the YAML editor JSON schema")
    schema.add_argument("--output", default="schemas/machine.schema.json")
    args = parser.parse_args()
    try:
        if args.command in (None, "design", "view"):
            from teocomp.designer import serve
            serve(Path(getattr(args, "machine", "machines/copy.yaml")),
                  getattr(args, "port", 8765), not getattr(args, "no_open", False))
        elif args.command == "schema":
            target = Path(args.output)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(MachineDefinition.model_json_schema(), indent=2) + "\n")
            print(target)
        else:
            definition, warnings = parse_definition(Path(args.machine).read_text())
            for warning in warnings:
                print(f"Warning {warning.line}:{warning.column}: {warning.message}")
            if args.command == "check":
                print(f"Valid: {definition.name} ({definition.tapes} tapes, {len(definition.transitions)} rules)")
            elif args.command == "run":
                result = simulate(definition, args.input, args.max_steps)
                print(f"Status: {result['status']}")
                print(json.dumps(result["configuration"], indent=2))
            elif args.command == "graph":
                from teocomp.export import export_diagram
                print(export_diagram(definition, Path(args.output)))
    except (DefinitionError, ValueError, OSError, RuntimeError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
