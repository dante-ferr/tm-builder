"""Generate state diagrams directly from validated machine definitions."""

from collections import defaultdict

from graphviz import Digraph, escape

from tm_builder.definition import MachineDefinition


def machine_diagram(definition: MachineDefinition) -> Digraph:
    cells = _group_cells(definition)
    graph = Digraph("machine")
    graph.attr(rankdir="TB" if cells else "LR", bgcolor="transparent",
               pad="0.55" if cells else "0.3")
    if cells:
        # Busy rings need a wider gutter so edge labels are not stacked on one corridor.
        cross = _cross_edge_count(definition, cells)
        graph.attr(nodesep="1.15" if cross >= 10 else "0.7",
                   ranksep="1.7" if cross >= 10 else "1.15")
    graph.attr("node", shape="circle", fontname="Helvetica", color="#64748b")
    graph.attr("edge", fontname="Helvetica", fontsize="11", color="#64748b")
    identifiers = {state: f"state_{i}" for i, state in enumerate(definition.states)}
    columns = _column_groups(definition, cells)
    start_id = "start_arrow"
    graph.node(start_id, shape="point", label="")

    def add_state(target, state):
        attrs = {}
        if state in columns:
            # Shared group names line vertical neighbors up, so those edges stay straight.
            attrs["group"] = columns[state]
        target.node(identifiers[state], label=escape(state), id=identifiers[state],
                    shape="doublecircle" if state in definition.accept else "circle",
                    color="#d14c49" if state in definition.reject else "#64748b", **attrs)

    # Subgraph names must start with "cluster" or Graphviz will not draw the box.
    grouped = set()
    for index, (name, members) in enumerate(definition.groups.items()):
        with graph.subgraph(name=f"cluster_{index}") as cluster:
            cluster.attr(label=escape(name), id=f"group_{index}", labelloc="t",
                         style="rounded,filled", color="#8b93b8", fillcolor="#e4e7f4",
                         fontname="Helvetica", fontsize="13", fontcolor="#202236", penwidth="1.6")
            if cells:
                cluster.attr(rank="same")
            for state in members:
                add_state(cluster, state)
                grouped.add(state)
    for state in definition.states:
        if state not in grouped:
            add_state(graph, state)
    if cells:
        _hold_grid(graph, definition, identifiers, cells)
    graph.edge(start_id, identifiers[definition.start])
    edges = defaultdict(list)
    for t in definition.transitions:
        per_tape = [f"{r} → {w}, {m}" for r, w, m in t.tapes]
        edges[t.source, t.to].append(" | ".join(per_tape))
    for (source, target), labels in edges.items():
        graph.edge(identifiers[source], identifiers[target], label=escape("\n".join(labels)),
                   id=f"edge_{definition.states.index(source)}_{definition.states.index(target)}",
                   **_layout_attrs(source, target, cells))
    return graph


def _group_cells(definition: MachineDefinition) -> dict[str, tuple[int, int]]:
    """Place four or more groups on a grid so neighbor links use separate sides."""
    names = list(definition.groups)
    if len(names) < 4:
        return {}
    order = _cycle_order(definition) or names
    columns = 2 if len(order) <= 6 else 3
    group_cell = {}
    index = 0
    for row in range((len(order) + columns - 1) // columns):
        cols = range(columns) if row % 2 == 0 else range(columns - 1, -1, -1)
        for col in cols:
            if index >= len(order):
                break
            group_cell[order[index]] = (row, col)
            index += 1
    return {state: group_cell[name] for name, members in definition.groups.items() for state in members}


def _cycle_order(definition: MachineDefinition) -> list[str] | None:
    """Return group names around a ring when every group meets exactly two others."""
    names = list(definition.groups)
    home = {state: name for name, members in definition.groups.items() for state in members}
    links = {name: set() for name in names}
    for rule in definition.transitions:
        left, right = home.get(rule.source), home.get(rule.to)
        if left and right and left != right:
            links[left].add(right)
            links[right].add(left)
    if any(len(neighbors) != 2 for neighbors in links.values()):
        return None
    order = [names[0]]
    previous = None
    while len(order) < len(names):
        nxt = [name for name in links[order[-1]] if name != previous]
        if len(nxt) != 1 or nxt[0] in order:
            return None
        previous, nxt = order[-1], nxt[0]
        order.append(nxt)
    if names[0] not in links[order[-1]]:
        return None
    return order


def _column_groups(definition: MachineDefinition, cells: dict[str, tuple[int, int]]) -> dict[str, str]:
    if not cells:
        return {}
    columns: dict[int, list[tuple[int, list[str]]]] = {}
    for name, members in definition.groups.items():
        row, col = cells[members[0]]
        columns.setdefault(col, []).append((row, list(members)))
    assigned = {}
    for col, entries in columns.items():
        for _, members in entries:
            for index, state in enumerate(members):
                assigned[state] = f"column_{col}_{index}"
    return assigned


def _cross_edge_count(definition: MachineDefinition, cells: dict[str, tuple[int, int]]) -> int:
    seen = set()
    for rule in definition.transitions:
        if cells.get(rule.source) != cells.get(rule.to):
            seen.add((rule.source, rule.to))
    return len(seen)


def _layout_attrs(source: str, target: str, cells: dict[str, tuple[int, int]]) -> dict[str, str]:
    if source not in cells or target not in cells:
        return {}
    source_row = cells[source][0]
    target_row = cells[target][0]
    if source_row == target_row:
        # Same rank, including transitions inside one group. minlen 0 keeps the row intact.
        return {"minlen": "0"}
    if target_row > source_row:
        return {"minlen": str(target_row - source_row)}
    # An upward edge must not pull the source group below its row.
    return {"constraint": "false"}


def _hold_grid(graph: Digraph, definition: MachineDefinition, identifiers: dict[str, str],
               cells: dict[str, tuple[int, int]]) -> None:
    """Pin neighboring groups when no transition already connects that side."""
    real = {(rule.source, rule.to) for rule in definition.transitions}
    by_cell: dict[tuple[int, int], list[str]] = {}
    for name, members in definition.groups.items():
        by_cell[cells[members[0]]] = list(members)
    rows: dict[int, list[tuple[int, list[str]]]] = {}
    cols: dict[int, list[tuple[int, list[str]]]] = {}
    for (row, col), members in by_cell.items():
        rows.setdefault(row, []).append((col, members))
        cols.setdefault(col, []).append((row, members))
    for entries in rows.values():
        entries.sort()
        for (_, left), (_, right) in zip(entries, entries[1:]):
            pair = _free_pair(left, right, real)
            if pair:
                graph.edge(identifiers[pair[0]], identifiers[pair[1]], style="invis", minlen="0", weight="8")
    for entries in cols.values():
        entries.sort()
        for (row, upper), (lower_row, lower) in zip(entries, entries[1:]):
            if lower_row != row + 1:
                continue
            pair = _free_pair(upper, lower, real)
            if pair:
                graph.edge(identifiers[pair[0]], identifiers[pair[1]], style="invis", minlen="1", weight="8")


def _free_pair(left: list[str], right: list[str], real: set[tuple[str, str]]) -> tuple[str, str] | None:
    for source in left:
        for target in right:
            if (source, target) not in real and (target, source) not in real:
                return source, target
    return None
