'use client';
import {useEffect, useRef, useState} from 'react';
import {mountGraphNavigation} from '../graph-navigation';
import {downloadBlob, errorMessage} from '../lib/api';
import type {Machine} from '../lib/types';
import type {PlaybackController} from '../hooks/use-playback';
import {Icon} from './icon';

type Navigation = ReturnType<typeof mountGraphNavigation>;
export function StateGraph({machine, playback: p}: {machine: Machine | null; playback: PlaybackController}) {
  const graph = useRef<HTMLDivElement>(null);
  const navigation = useRef<Navigation | null>(null);
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [rendering, setRendering] = useState(false);
  const stopFollow = useRef(() => p.setFollow(false));
  stopFollow.current = () => p.setFollow(false);
  useEffect(() => {
    const target = graph.current!;
    const lifetime = new AbortController();
    const nav = mountGraphNavigation(target, lifetime.signal, () => stopFollow.current());
    navigation.current = nav;
    const observer = new ResizeObserver(() => nav.resize()); observer.observe(target);
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
      graph.current?.replaceChildren(diagram); navigation.current?.setDiagram(diagram); setSvg(diagram);
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
  function download() {
    if (!svg || !machine) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.removeAttribute('style');
    copy.querySelectorAll('.active-state, .active-rule').forEach(node => node.classList.remove('active-state', 'active-rule'));
    downloadBlob(new Blob([new XMLSerializer().serializeToString(copy)], {type: 'image/svg+xml'}), `${machine.filename}.svg`);
  }
  return <section className={`graph-panel panel ${expanded ? 'expanded' : ''}`} id="graph-panel" aria-label="State graph">
    <div className="panel-heading"><div className="panel-title"><Icon name="graph" size={17} /><h2>State graph</h2><span className="subtle">{machine ? `${machine.states.length} states · ${machine.tapes} ${machine.tapes === 1 ? 'tape' : 'tapes'}` : 'Visualization'}</span></div><div className="graph-actions"><span className="live-pill"><span />Live preview</span><button className="icon-button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="graph-panel" aria-label={expanded ? 'Shrink state graph' : 'Expand state graph'} title={expanded ? 'Shrink state graph (Esc)' : 'Expand state graph'}><Icon name="expand" size={16} /></button></div></div>
    <div className="graph-stage"><div id="graph" ref={graph} className="graph-canvas" tabIndex={0} aria-label="Rendered machine diagram" aria-describedby="graph-help" />
      {!svg && <div className="graph-empty"><span className="empty-graph"><i>q₀</i><span>→</span><i>q₁</i><span>→</span><i>q₂</i></span><h3>{renderError ? 'Unable to render diagram' : rendering ? 'Drawing your machine…' : 'Everything starts with a state.'}</h3><p>{renderError || (rendering ? 'Arranging states and transitions.' : 'Choose a machine from your library or import a YAML file to explore its transitions.')}</p>{!machine && <span className="empty-hint"><Icon name="library" size={14} />Your machine library is on the left</span>}</div>}
      <div className="graph-toolbar" aria-label="Graph tools"><button className="icon-button" onClick={() => navigation.current?.zoom(.8)} disabled={!svg} aria-label="Zoom out"><Icon name="minus" size={16} /></button><button className="icon-button" onClick={() => navigation.current?.zoom(1.25)} disabled={!svg} aria-label="Zoom in"><Icon name="plus" size={16} /></button><span className="toolbar-divider" /><button onClick={() => navigation.current?.fit()} disabled={!svg}>Fit view</button><span className="toolbar-divider" /><button onClick={download} disabled={!svg}><Icon name="download" size={14} />SVG</button></div>
    </div>
    <div className="graph-footer"><span id="graph-help">Scroll to zoom <span>·</span> Middle drag to pan <span>·</span> Focus graph for WASD / arrows</span><span className="graph-legend"><i />State <i />Accept state</span></div>
  </section>;
}
