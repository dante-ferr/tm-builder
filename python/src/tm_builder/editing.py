"""Validated YAML edits shared by the visual editor and file persistence."""

import yaml

from tm_builder.definition import MachineDefinition, parse_definition


class _Action(list):
    """Keep read/write/move triples compact in the regenerated YAML."""


class _Dumper(yaml.SafeDumper):
    pass


_Dumper.add_representer(_Action, lambda dumper, value: dumper.represent_sequence(
    'tag:yaml.org,2002:seq', value, flow_style=True))


def _dump(value):
    def prepare(item):
        if isinstance(item, dict):
            return {key: [_Action(action) for action in child]
                    if key == 'tapes' and isinstance(child, list)
                    else prepare(child) for key, child in item.items()}
        if isinstance(item, list):
            return [prepare(child) for child in item]
        return item
    return yaml.dump(prepare(value), Dumper=_Dumper, sort_keys=False, allow_unicode=True)


def edit_yaml(source: str, changes: dict) -> str:
    """Replace changed top-level fields, retaining untouched YAML and grouped rules.

    Comments inside a replaced field are regenerated along with that field.
    """
    if not isinstance(changes, dict) or not changes:
        raise ValueError('Expected nonempty machine changes.')
    allowed = set(MachineDefinition.model_fields)
    if set(changes) - allowed:
        raise ValueError('Unknown machine fields.')
    definition, _ = parse_definition(source)
    before = definition.model_dump(by_alias=True, mode='json', exclude_none=True)
    candidate = {**before, **changes}
    # Validate semantics before touching the file, including deterministic rules.
    parse_definition(yaml.safe_dump(candidate, sort_keys=False, allow_unicode=True))
    original = yaml.safe_load(source)
    changed = {key: value for key, value in changes.items() if before.get(key) != value}
    if 'transitions' in changed and isinstance(original['transitions'], dict):
        groups = {state: [] for state in original['transitions'] if state in candidate['states']}
        for rule in changed['transitions']:
            groups.setdefault(rule['from'], []).append({k: v for k, v in rule.items() if k != 'from'})
        changed['transitions'] = groups
    root = yaml.compose(source)
    if root.flow_style:
        return _dump({**original, **changed})
    replacements = []
    for key, value in root.value:
        if key.value not in changed:
            continue
        text = _dump({key.value: changed.pop(key.value)})
        end = value.end_mark.index
        # Scalar values end before their newline; collections normally include it.
        if end < len(source) and source[end] in '\r\n':
            text = text.rstrip('\n')
        replacements.append((key.start_mark.index, end, text))
    for start, end, text in reversed(replacements):
        source = source[:start] + text + source[end:]
    if changed:
        source = source.rstrip() + '\n' + _dump(changed)
    # Aliases and unusual YAML layouts must never result in invalid persisted YAML.
    parse_definition(source)
    return source
