'use client';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {mountGraphNavigation} from '../graph-navigation';
import {errorMessage} from '../lib/api';
import {boundsInSvg, centerInSvg} from '../lib/graph-geometry';
import type {Machine} from '../lib/types';
import type {PlaybackController} from '../hooks/use-playback';
import {Icon} from './icon';
import {ExportDialog} from './export-dialog';

type Navigation = ReturnType<typeof mountGraphNavigation>;
export interface GraphAnchor {state?: string; from?: string; to?: string; point?: {x: number; y: number}}
export interface GraphEditor {key: string; anchor: GraphAnchor; content: ReactNode; height: number}
export function StateGraph({machine, playback: p, onState, onEdge, selectedState, tools, help, inlineEditor, settings, addingState, onCanvas}: {
  machine: Machine | null; playback: PlaybackController;
  onState?: (state: string) => void; onEdge?: (from: string, to: string) => void; selectedState?: string | null;
  tools?: ReactNode; help?: ReactNode; inlineEditor?: GraphEditor | null; settings?: ReactNode;
  addingState?: boolean; onCanvas?: (point: {x: number; y: number}) => void;
}) {
  const graph = useRef<HTMLDivElement>(null);
  const navigation = useRef<Navigation | null>(null);
  const activeEditor = useRef<{key: string; x: number; y: number; height: number; halfHeight: number} | null>(null);
  const editorOffsets = useRef(new Map<string, {x: number; y: number}>());
  const editorHandle = useRef<HTMLButtonElement>(null);
  const editorDrag = useRef<{pointerId: number; x: number; y: number; offset: {x: number; y: number}} | null>(null);
  const [draggingEditor, setDraggingEditor] = useState(false);
  const previousMachinePath = useRef<string | null>(null);
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [editorPosition, setEditorPosition] = useState<{x: number; y: number} | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [rendering, setRendering] = useState(false);
  const stopFollow = useRef(() => p.setFollow(false));
  stopFollow.current = () => p.setFollow(false);
  function positionEditor() {
    const anchor = activeEditor.current, nav = navigation.current;
    if (!anchor || !nav) return;
    const position = nav.project(anchor.x, anchor.y);
    const offset = editorOffsets.current.get(anchor.key) || {x: 0, y: 0};
    const halfHeight = Math.abs(nav.project(anchor.x, anchor.y + anchor.halfHeight).y - position.y);
    const next = {x: position.x + offset.x, y: position.y - anchor.height / 2 - halfHeight - 12 + offset.y};
    setEditorPosition(current => current?.x === next.x && current?.y === next.y ? current : next);
  }
  function moveEditor(x: number, y: number) {
    const anchor = activeEditor.current;
    if (!anchor) return;
    const offset = editorOffsets.current.get(anchor.key) || {x: 0, y: 0};
    editorOffsets.current.set(anchor.key, {x: offset.x + x, y: offset.y + y});
    positionEditor();
  }
  function stopEditorDrag(target: HTMLButtonElement | null = editorHandle.current) {
    const pointerId = editorDrag.current?.pointerId;
    editorDrag.current = null; setDraggingEditor(false);
    if (pointerId !== undefined && target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  }
  useEffect(() => {
    const target = graph.current!;
    const lifetime = new AbortController();
    const nav = mountGraphNavigation(target, lifetime.signal, () => stopFollow.current(), positionEditor);
    navigation.current = nav;
    const observer = new ResizeObserver(() => nav.resize()); observer.observe(target);
    const finishDrag = () => stopEditorDrag();
    window.addEventListener('pointermove', event => {
      const drag = editorDrag.current, anchor = activeEditor.current;
      if (!drag || !anchor || drag.pointerId !== event.pointerId) return;
      editorOffsets.current.set(anchor.key, {x: drag.offset.x + event.clientX - drag.x, y: drag.offset.y + event.clientY - drag.y});
      positionEditor();
    }, {signal: lifetime.signal});
    for (const event of ['pointerup', 'pointercancel', 'mouseup', 'blur'])
      window.addEventListener(event, finishDrag, {signal: lifetime.signal});
    return () => {observer.disconnect(); nav.stopPan(); nav.stopFollowing(); lifetime.abort(); navigation.current = null;};
  }, []);
  useEffect(() => {
    let disposed = false;
    setSvg(null); setRenderError(''); graph.current?.replaceChildren();
    if (!machine) {setRendering(false); return;}
    setRendering(true);
    import('@viz-js/viz').then(module => module.instance()).then(viz => {
      if (disposed) return;
      const diagram = viz.renderSVGElement(machine.dot);
      diagram.setAttribute('role', 'group'); diagram.setAttribute('aria-label', 'Machine state graph');
      graph.current?.replaceChildren(diagram);
      navigation.current?.setDiagram(diagram, {fit: previousMachinePath.current !== machine.path});
      previousMachinePath.current = machine.path;
      setSvg(diagram);
    }).catch(error => {if (!disposed) setRenderError(errorMessage(error));})
      .finally(() => {if (!disposed) setRendering(false);});
    return () => {disposed = true;};
  }, [machine]);
  useEffect(() => {
    if (!svg || !machine) return;
    svg.querySelectorAll('.active-state, .active-rule').forEach(node => node.classList.remove('active-state', 'active-rule'));
    const node = p.frame ? svg.querySelector<SVGGraphicsElement>(`#state_${machine.states.indexOf(p.frame.state)}`) : null;
    node?.classList.add('active-state');
    if (p.rule) svg.querySelector(`#edge_${machine.states.indexOf(p.rule.source)}_${machine.states.indexOf(p.rule.to)}`)?.classList.add('active-rule');
    navigation.current?.follow(node);
  }, [svg, machine, p.frame, p.rule]);
  useEffect(() => {
    if (p.playing && p.follow) navigation.current?.startFollowing(svg?.querySelector<SVGGraphicsElement>('.active-state') || null);
    else navigation.current?.stopFollowing();
  }, [p.playing, p.follow, svg]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {if (event.key === 'Escape') setExpanded(false);};
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [expanded]);
  useEffect(() => {
    if (!svg || !machine) return;
    const controller = new AbortController();
    for (const node of svg.querySelectorAll<SVGGElement>('.node, .edge')) {
      const state = node.id.match(/^state_(\d+)$/);
      const edge = node.id.match(/^edge_(\d+)_(\d+)$/);
      const activate = state && onState ? () => onState(machine.states[Number(state[1])])
        : edge && onEdge ? () => onEdge(machine.states[Number(edge[1])], machine.states[Number(edge[2])]) : null;
      node.classList.toggle('edit-selected', Boolean(state && machine.states[Number(state[1])] === selectedState));
      if (!activate) continue;
      node.setAttribute('tabindex', '0'); node.setAttribute('role', 'button');
      node.setAttribute('aria-label', state ? `State ${machine.states[Number(state[1])]}` : `Transitions ${machine.states[Number(edge![1])]} to ${machine.states[Number(edge![2])]}`);
      node.classList.add('editable');
      node.addEventListener('click', activate, {signal: controller.signal});
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); event.stopPropagation(); activate();}
      }, {signal: controller.signal});
    }
    return () => {
      controller.abort();
      svg.querySelectorAll('.editable').forEach(node => {node.classList.remove('editable'); node.removeAttribute('tabindex'); node.removeAttribute('role'); node.removeAttribute('aria-label');});
    };
  }, [svg, machine, onState, onEdge, selectedState]);
  useEffect(() => {
    setEditorPosition(null);
    if (!svg || !machine || !inlineEditor) return;
    const {anchor, height} = inlineEditor;
    const state = anchor.state ? svg.querySelector<SVGGraphicsElement>(`#state_${machine.states.indexOf(anchor.state)}`) : null;
    const edge = anchor.from ? svg.querySelector<SVGGraphicsElement>(`#edge_${machine.states.indexOf(anchor.from)}_${machine.states.indexOf(anchor.to!)}`) : null;
    const target = state || edge;
    let point = anchor.point;
    if (target) {
      const text = edge?.querySelector<SVGGraphicsElement>('text');
      point = centerInSvg(svg, text || target);
    } else if (anchor.from && anchor.to) {
      const a = svg.querySelector<SVGGraphicsElement>(`#state_${machine.states.indexOf(anchor.from)}`);
      const b = svg.querySelector<SVGGraphicsElement>(`#state_${machine.states.indexOf(anchor.to)}`);
      if (a && b) {const first = centerInSvg(svg, a), second = centerInSvg(svg, b); point = {x: (first.x + second.x) / 2, y: (first.y + second.y) / 2};}
    }
    point ||= {x: svg.viewBox.baseVal.width / 2, y: svg.viewBox.baseVal.height / 2};
    // Keep the item visible below its editor; camera movement never changes zoom.
    const item = state || edge?.querySelector<SVGGraphicsElement>('text');
    const halfHeight = item ? boundsInSvg(svg, item).height / 2 : 0;
    target?.classList.add(state ? 'editing-node' : 'editing-edge');
    activeEditor.current = {...point, height, halfHeight, key: inlineEditor.key};
    navigation.current?.reveal(point.x, point.y, {offsetY: -height / 2 - 6});
    return () => {activeEditor.current = null; editorDrag.current = null; setDraggingEditor(false); target?.classList.remove('editing-node', 'editing-edge');};
  }, [svg, machine, inlineEditor?.key]);
  return <section className={`graph-panel panel ${expanded ? 'expanded' : ''}`} id="graph-panel" aria-label="State graph">
    <div className="panel-heading"><div className="panel-title"><Icon name="graph" size={17} /><h2>State graph</h2><span className="subtle">{machine ? `${machine.states.length} states · ${machine.tapes} ${machine.tapes === 1 ? 'tape' : 'tapes'}` : 'Visualization'}</span></div><div className="graph-actions">{tools}<div className="graph-view-tools" role="toolbar" aria-label="Graph view tools"><button className="icon-button" onClick={() => navigation.current?.zoom(.8)} disabled={!svg} aria-label="Zoom out" title="Zoom out"><Icon name="minus" size={16} /></button><button className="icon-button" onClick={() => navigation.current?.zoom(1.25)} disabled={!svg} aria-label="Zoom in" title="Zoom in"><Icon name="plus" size={16} /></button><button className="icon-button" onClick={() => navigation.current?.fit()} disabled={!svg} aria-label="Fit view" title="Fit view"><Icon name="fit" size={16} /></button></div><ExportDialog machine={machine} svg={svg} /><button className="icon-button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="graph-panel" aria-label={expanded ? 'Shrink state graph' : 'Expand state graph'} title={expanded ? 'Shrink state graph (Esc)' : 'Expand state graph'}><Icon name="expand" size={16} /></button></div></div>
    {settings}
    <div className="graph-stage"><div id="graph" ref={graph} className={`graph-canvas ${addingState ? 'adding-state' : ''}`} onClick={event => {
      if (!addingState || !svg || (event.target as Element).closest('.node, .edge, [data-graph-editor]')) return;
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const local = point.matrixTransform(svg.getScreenCTM()!.inverse()); onCanvas?.({x: local.x, y: local.y});
    }} onKeyDown={event => {
      if (!addingState || !svg || event.key !== 'Enter' || event.target !== event.currentTarget) return;
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect(), point = svg.createSVGPoint();
      point.x = bounds.left + bounds.width / 2; point.y = bounds.top + bounds.height / 2;
      const local = point.matrixTransform(svg.getScreenCTM()!.inverse()); onCanvas?.({x: local.x, y: local.y});
    }} tabIndex={0} aria-label="Rendered machine diagram" aria-describedby="graph-help" />
      {svg && inlineEditor && editorPosition && <div data-inline-editor="true" data-graph-editor="true" className={`graph-editor-layer ${draggingEditor ? 'dragging-editor' : ''}`} style={{left: editorPosition.x, top: editorPosition.y, height: inlineEditor.height}}
        onKeyDown={event => {if (event.key !== 'Escape' && !event.ctrlKey && !event.metaKey) event.stopPropagation();}} onClick={event => event.stopPropagation()}>
        <button ref={editorHandle} type="button" className="graph-editor-handle" aria-label="Move graph editor" title="Drag to move · Arrow keys move when focused"
          onPointerDown={event => {
            if (event.button !== 0 || !activeEditor.current) return;
            event.preventDefault(); event.stopPropagation();
            event.currentTarget.focus({preventScroll: true});
            const offset = editorOffsets.current.get(activeEditor.current.key) || {x: 0, y: 0};
            editorDrag.current = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset};
            event.currentTarget.setPointerCapture(event.pointerId); setDraggingEditor(true);
          }} onLostPointerCapture={event => stopEditorDrag(event.currentTarget)}
          onKeyDown={event => {
            const distance = event.shiftKey ? 40 : 10;
            const directions: Record<string, [number, number]> = {ArrowLeft: [-distance, 0], ArrowRight: [distance, 0], ArrowUp: [0, -distance], ArrowDown: [0, distance]};
            const direction = directions[event.key];
            if (direction) {event.preventDefault(); event.stopPropagation(); moveEditor(...direction);}
          }}><Icon name="grip" size={14} /><span>{inlineEditor.anchor.state ? 'State' : inlineEditor.anchor.from ? 'Transition' : 'New state'}</span><span className="editor-drag-hint">Drag to move</span></button>
        <div className="graph-inline-editor">{inlineEditor.content}</div>
      </div>}
      {!svg && <div className="graph-empty"><span className="empty-graph"><i>q₀</i><span>→</span><i>q₁</i><span>→</span><i>q₂</i></span><h3>{renderError ? 'Unable to render diagram' : rendering ? 'Drawing your machine…' : 'Everything starts with a state.'}</h3><p>{renderError || (rendering ? 'Arranging states and transitions.' : 'Choose a machine from your library or import a YAML file to explore its transitions.')}</p>{!machine && <span className="empty-hint"><Icon name="library" size={14} />Your machine library is on the left</span>}</div>}

    </div>
    <div className="graph-footer"><span id="graph-help">{help || <>Scroll to zoom <span>·</span> Middle drag to pan <span>·</span> Focus graph for WASD / arrows</>}</span><span className="graph-legend"><i />State <i />Accept state</span></div>
  </section>;
}
