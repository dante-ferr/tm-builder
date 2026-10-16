"""Generate state diagrams directly from validated machine definitions."""

from collections import defaultdict

from graphviz import Digraph, escape

from tm_builder.definition import MachineDefinition


def machine_diagram(definition: MachineDefinition) -> Digraph:
    graph = Digraph("machine")
    graph.attr(rankdir="LR", bgcolor="transparent", pad="0.3")
    graph.attr("node", shape="circle", fontname="Helvetica", color="#64748b")
    graph.attr("edge", fontname="Helvetica", fontsize="11", color="#64748b")
    identifiers = {state: f"state_{i}" for i, state in enumerate(definition.states)}
    start_id = "start_arrow"
    graph.node(start_id, shape="point", label="")

    def add_state(target, state):
        target.node(identifiers[state], label=escape(state), id=identifiers[state],
                    shape="doublecircle" if state in definition.accept else "circle",
                    color="#d14c49" if state in definition.reject else "#64748b")

    # Subgraph names must start with "cluster" or Graphviz will not draw the box.
    grouped = set()
    for index, (name, members) in enumerate(definition.groups.items()):
        with graph.subgraph(name=f"cluster_{index}") as cluster:
            cluster.attr(label=escape(name), id=f"group_{index}", labelloc="t",
                         style="rounded,filled", color="#8b93b8", fillcolor="#e4e7f4",
                         fontname="Helvetica", fontsize="13", fontcolor="#202236", penwidth="1.6")
            for state in members:
                add_state(cluster, state)
                grouped.add(state)
    for state in definition.states:
        if state not in grouped:
            add_state(graph, state)
    graph.edge(start_id, identifiers[definition.start])
    edges = defaultdict(list)
    for t in definition.transitions:
        per_tape = [f"{r} → {w}, {m}" for r, w, m in t.tapes]
        edges[t.source, t.to].append(" | ".join(per_tape))
    for (source, target), labels in edges.items():
        graph.edge(identifiers[source], identifiers[target], label=escape("\n".join(labels)),
                   id=f"edge_{definition.states.index(source)}_{definition.states.index(target)}")
    return graph
