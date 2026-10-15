import {useEffect, useRef} from 'react';
import type {PlaybackController} from '../hooks/use-playback';
import type {Machine, Tape, Trace, Transition} from '../lib/types';
import {Icon} from './icon';
import {LoadingSpinner} from './loading-spinner';

function TapeRow({tape, index, phase, rule}: {tape: Tape; index: number; phase: number; rule?: Transition}) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = viewport.current;
    if (target) target.scrollLeft = Math.max(0, 8.5 * 38 - target.clientWidth / 2);
  }, [tape]);
  return <div className="tape"><div className="tape-label"><span>TAPE {String(index + 1).padStart(2, '0')}</span><span>head <b>{tape.head}</b></span></div><div className="tape-window" ref={viewport}><div className="cells">{tape.cells.map((symbol, offset) => {
    const address = tape.left + offset, head = address === tape.head, written = phase === 2 && head;
    return <div key={offset} className={`cell ${head ? 'head' : ''} ${written ? 'written' : ''}`}><span>{written ? rule?.tapes[index][1] ?? symbol : symbol}</span><small>{address}</small></div>;
  })}</div></div></div>;
}
export function PlaybackPanel({trace, machine, message, playback: p}: {trace: Trace | null; machine: Machine | null; message: string; playback: PlaybackController}) {
  return <section className="playback-panel panel" aria-labelledby="playback-title">
    <div className="panel-heading"><div className="panel-title"><Icon name="tape" size={17} /><h2 id="playback-title">Playback &amp; debugger</h2></div><span className={`trace-badge ${trace && p.atEnd ? trace.status.toLowerCase() : ''}`}>{trace ? p.atEnd ? trace.status === 'RUNNING' ? 'Limit reached' : trace.status : p.playing ? 'Playing' : 'Paused' : 'No trace loaded'}</span></div>
    <div className="playback-controls"><div className="transport"><button className="icon-button" onClick={() => p.seek(0)} disabled={!trace} title="Reset" aria-label="Reset"><Icon name="reset" size={16} /></button><button className="icon-button" onClick={() => p.seek(p.phase ? p.position : Math.max(0, p.position - 1))} disabled={!trace || (!p.position && !p.phase)} aria-label="Back one step"><Icon name="back" size={16} /></button><button className="play-button" onClick={p.toggle} disabled={!trace || p.atEnd}><Icon name={p.playing ? 'pause' : 'play'} size={15} />{p.playing ? 'Pause' : 'Play'}</button><button className="icon-button" onClick={() => p.seek(Math.min((p.count || 1) - 1, p.position + 1))} disabled={!trace || p.atEnd} aria-label="Next step"><Icon name="next" size={16} /></button></div>
      <label className="speed-label"><span>Speed</span><select value={p.speed} onChange={event => p.setSpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={5}>5×</option><option value={0}>As quick as possible</option></select></label>
      <label className="inline-check follow-check"><input type="checkbox" checked={p.follow} onChange={event => p.setFollow(event.target.checked)} />Follow active state</label>
      <span className="step-counter">{String(p.frame?.step || 0).padStart(3, '0')} <span>/ {String((p.count || 1) - 1).padStart(3, '0')}</span></span>
    </div>
    <label className="timeline"><span className="sr-only">Timeline</span><input id="timeline" type="range" min={0} max={(p.count || 1) - 1} value={p.position} disabled={!trace} onInput={event => p.seek(Number(event.currentTarget.value))} /></label>
    <div className="debugger-output"><div id="execution" role="status" aria-busy={p.busy}>{p.busy ? <><LoadingSpinner /> Computing instant playback…</> : p.frame ? <><span className="state-label">STATE</span> <strong>{p.frame.state}</strong><span className="phase-label">{['', 'Read', 'Write', 'Move'][p.phase]}{p.breakpoint ? ' · Breakpoint' : ''}</span>{p.atEnd && <span className="stop-reason">{trace?.reason}</span>}</> : <span className="muted">{message}</span>}</div>
      {p.error && <p role="alert">{p.error}</p>}
      {trace?.model === 'nondeterministic' && <p className="trace-note">One accepting path, or the last explored path. Final status describes the whole bounded search.</p>}
      {p.tapes?.map((tape, index) => <TapeRow key={index} tape={tape} index={index} phase={p.phase} rule={p.rule} />)}
      {trace && <pre className="rule-details">{p.rule ? `Rule ${p.rule.index + 1}: ${p.rule.source} → ${p.rule.to}\n${p.rule.tapes.map(([read, write, move], index) => `Tape ${index + 1}: read ${read} → write ${write}, ${move === 'L' ? 'left' : move === 'R' ? 'right' : 'stay'}`).join('\n')}` : 'Initial configuration. No transition applied.'}</pre>}
    </div>
    <details className="breakpoints"><summary>Breakpoints<span className="subtle">Pause where it matters</span></summary><div><label>Break on state<input value={p.stateBreak} onChange={event => p.setStateBreak(event.target.value)} placeholder="State name" list="states" /></label><datalist id="states">{machine?.states.map(state => <option key={state} value={state} />)}</datalist><label>Break before rule<input type="number" min={1} value={p.ruleBreak} onChange={event => p.setRuleBreak(event.target.value)} placeholder="Rule number" /></label></div></details>
  </section>;
}
