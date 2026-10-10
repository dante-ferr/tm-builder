"""CLI for the machine designer, validator, simulator, and DOT exporter."""

import argparse
import json
from pathlib import Path

from tm_builder.definition import DefinitionError, MachineDefinition, parse_definition
from tm_builder.simulation import simulate
from tm_builder.inputs import InputDefinition, parse_inputs
from tm_builder.workspace import ensure_vscode_workspace, ensure_workspace


def main() -> None:
    parser = argparse.ArgumentParser(prog="tm-builder", description="Design multi-tape Turing machines.")
    commands = parser.add_subparsers(dest="command")
    design = commands.add_parser("design", aliases=["view"], help="Open the machine picker and live diagram")
    design.add_argument("machine", nargs="?", type=Path)
    design.add_argument("--port", type=int, default=8765)
    design.add_argument("--no-open", action="store_true", help="Print the URL without opening a browser")
    for name, help_text in (("check", "Validate a YAML definition"), ("run", "Run a machine"),
                            ("graph", "Render a YAML machine to SVG or DOT"),
                            ("table", "Export transitions to LaTeX and optional A4 PNG pages")):
        cmd = commands.add_parser(name, help=help_text)
        cmd.add_argument("machine", nargs="?", type=Path)
        if name == "run":
            inputs = cmd.add_mutually_exclusive_group()
            inputs.add_argument("--input", nargs="+", help="One input-alphabet string per tape, e.g. --input abba ''")
            inputs.add_argument("--inputs-file", type=Path, help="Typed YAML starting tape setup")
            cmd.add_argument("--max-steps", type=int, default=1000)
        if name == "graph":
            cmd.add_argument("--output", default="output/machine.svg")
        if name == "table":
            cmd.add_argument("--output", help="Output path (extension must match format)")
            cmd.add_argument("--format", choices=("csv", "image", "tex"))
            cmd.add_argument("--style", choices=("readable", "formal"), default="readable")
            cmd.add_argument("--language", choices=("english", "portuguese"), default="english",
                             help="Table label language (default: english)")
            cmd.add_argument("--layout", choices=("split", "long"), default="split")
            cmd.add_argument("--split-a4", action="store_true",
                             help="Render one PNG per A4 page, with repeated headers")
            cmd.add_argument("--dpi", type=int, default=200,
                             help="A4 PNG resolution, 72–600 DPI (default: 200)")
    schema = commands.add_parser("schema", help="Generate the YAML editor JSON schema")
    schema.add_argument("--output", help="Output path (defaults to schemas/<kind>.schema.json)")
    schema.add_argument("--kind", choices=("machine", "inputs"), default="machine")
    commands.add_parser("workspace", help="Create the user workspace and print its location")
    args = parser.parse_args()
    try:
        if args.command in (None, "design", "view"):
            from tm_builder.designer import serve
            serve(getattr(args, "machine", None),
                  getattr(args, "port", 8765), not getattr(args, "no_open", False))
        elif args.command == "schema":
            target = Path(args.output or f"schemas/{args.kind}.schema.json")
            target.parent.mkdir(parents=True, exist_ok=True)
            model = InputDefinition if args.kind == "inputs" else MachineDefinition
            target.write_text(json.dumps(model.model_json_schema(), indent=2) + "\n")
            print(target)
        elif args.command == "workspace":
            workspace = ensure_workspace()
            print(ensure_vscode_workspace(workspace))
        else:
            workspace = ensure_workspace()
            machine = args.machine or (workspace / "machines/copy.yaml")
            if args.machine is not None and not machine.exists() and not machine.is_absolute():
                candidate = workspace / "machines" / machine.name
                if candidate.exists():
                    machine = candidate
            definition, warnings = parse_definition(machine.read_text())
            for warning in warnings:
                print(f"Warning {warning.line}:{warning.column}: {warning.message}")
            if args.command == "check":
                print(f"Valid: {definition.name} ({definition.tapes} tapes, {len(definition.transitions)} rules)")
            elif args.command == "run":
                # No supplied input means blank tapes, even for legacy definitions
                # containing embedded inputs. Direct --input retains its behavior.
                setup = InputDefinition(tapes=[]) if args.input is None else None
                if args.inputs_file is not None:
                    try:
                        input_path = args.inputs_file
                        if not input_path.exists() and not input_path.is_absolute():
                            candidate = workspace / "inputs" / input_path.name
                            if candidate.exists():
                                input_path = candidate
                        setup = parse_inputs(input_path.read_text(), definition)
                    except DefinitionError as error:
                        raise ValueError(f"{args.inputs_file}: {error}") from error
                result = simulate(definition, args.input, args.max_steps, setup=setup)
                print(f"Status: {result['status']}")
                print(json.dumps(result["configuration"], indent=2))
            elif args.command == "graph":
                from tm_builder.export import export_diagram
                print(export_diagram(definition, Path(args.output)))
            elif args.command == "table":
                from tm_builder.table import export_table
                format = args.format or (None if args.output else "image")
                extension = "png" if format == "image" else format
                output = Path(args.output or f"output/{machine.stem}-{args.style}.{extension}")
                for target in export_table(definition, output, format=format, style=args.style,
                                           layout=args.layout, split_a4=args.split_a4, dpi=args.dpi,
                                           language=args.language):
                    print(target)
    except (DefinitionError, ValueError, OSError, RuntimeError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
