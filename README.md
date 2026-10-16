# tm-builder

Define, validate, visualize, and run deterministic or nondeterministic Turing
machines in YAML.

## Online app

It's possible to use TMBuilder on-line [HERE](https://tm-builder.onrender.com).

However, it doesn't live update graphs on machine .yaml file changes. It also doesn't auto save: it's necessary to manually load and download ui-edited machines. If you're interested in those features, execute the app locally with the following commands.

## Setup

```bash
make setup
make view
```

Setup installs dependencies and seeds a `TM Builder` folder in your Documents
folder. Commands, Windows, and exports are in the
[command guide](docs/src/tm-builder/commands.md). Editing and step limits are in
the [viewer guide](docs/src/tm-builder/viewer.md). YAML fields and examples are
in [machine definitions](docs/src/tm-builder/machines.md).

Licensed under [Apache-2.0](LICENSE).
