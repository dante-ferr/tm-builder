'use client';
import {useEffect, useRef, useState} from 'react';
import type {WorkspaceController} from '../hooks/use-workspace';
import type {PlaybackController} from '../hooks/use-playback';
import type {Machine, MachineDefinition, Rule} from '../lib/types';
import {downloadBlob, errorMessage} from '../lib/api';
import {StateGraph} from './state-graph';

type Edit = {kind: 'state'; original?: string; name: string; start: boolean; role: string}
  | {kind: 'rule'; index?: number; rule: Rule}
  | {kind: 'settings'; name: string; model: MachineDefinition['model']; tapes: number; blank: string; input: string; alphabet: string}
  | {kind: 'rules'; from: string; to: string};

export function MachineEditor({workspace: w, playback}: {workspace: WorkspaceController; playback: PlaybackController}) {
  const machine = w.selecting ? null : w.machine;
  const [tool, setTool] = useState<'inspect' | 'transition'>('inspect');
  const [source, setSource] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [base, setBase] = useState<Machine | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const disabled = !machine || !w.connected || w.selecting || w.saving || machine.mode === 'Unsaved VS Code buffer';
  useEffect(() => {setSource(null);}, [machine?.revision]);
  useEffect(() => {if (edit) dialog.current?.showModal(); else dialog.current?.close();}, [edit !== null]);
  useEffect(() => {
    if (tool !== 'transition') return;
    const cancel = (event: KeyboardEvent) => {if (event.key === 'Escape' && !edit) {setSource(null); setTool('inspect');}};
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [tool, edit]);
  function open(value: Edit, snapshot = machine) {setBase(snapshot); setEdit(value); setError(''); playback.pause();}
  function stateForm(state?: string): Edit {
    const d = machine!.definition;
    return {kind: 'state', original: state, name: state || '', start: state === d.start,
      role: state && d.accept.includes(state) ? 'accept' : state && d.reject.includes(state) ? 'reject' : 'normal'};
  }
  function ruleForm(from?: string, to?: string): Edit {
    const d = machine!.definition;
    return {kind: 'rule', rule: {from: from || d.states.find(s => !d.accept.includes(s) && !d.reject.includes(s)) || d.start,
      to: to || d.start, tapes: Array.from({length: d.tapes}, () => [d.blank, d.blank, 'S'])}};
  }
  function pickState(state: string) {
    if (disabled) return;
    playback.pause(); playback.setFollow(false);
    if (tool === 'inspect') {open(stateForm(state)); return;}
    if (!source) {
      if (machine!.definition.accept.includes(state) || machine!.definition.reject.includes(state)) {
        setError('Halting states cannot have outgoing transitions. Choose another source state.'); return;
      }
      setError(''); setSource(state);
    } else {open(ruleForm(source, state)); setSource(null);}
  }
  async function save(changes: Partial<MachineDefinition>) {
    if (!base) return;
    setError('');
    try {await w.editMachine(base.revision, changes); setEdit(null);}
    catch (error) {setError(errorMessage(error));}
  }
  function submit() {
    if (!edit || !base) return;
    const d = base.definition;
    if (edit.kind === 'state') {
      const name = edit.name.trim();
      if (!name) {setError('Enter a state name.'); return;}
      if (name !== edit.original && d.states.includes(name)) {setError('That state already exists.'); return;}
      const rename = (s: string) => s === edit.original ? name : s;
      const accept = d.accept.filter(s => s !== edit.original), reject = d.reject.filter(s => s !== edit.original);
      if (edit.role === 'accept') accept.push(name);
      if (edit.role === 'reject') reject.push(name);
      if (edit.role !== 'normal' && d.transitions.some(r => r.from === edit.original)) {
        setError('Remove outgoing transitions before making this a halting state.'); return;
      }
      void save({states: edit.original ? d.states.map(rename) : [...d.states, name],
        start: edit.start ? name : rename(d.start), accept, reject,
        transitions: d.transitions.map(r => ({...r, from: rename(r.from), to: rename(r.to)}))});
    } else if (edit.kind === 'rule') {
      const transitions = [...d.transitions];
      if (edit.index === undefined) transitions.push(edit.rule); else transitions[edit.index] = edit.rule;
      void save({transitions});
    } else if (edit.kind === 'settings') {
      try {
        const input: unknown = JSON.parse(edit.input), alphabet: unknown = JSON.parse(edit.alphabet);
        if (!Array.isArray(input) || !Array.isArray(alphabet)) throw new Error('Alphabets must be JSON arrays of symbols.');
        void save({name: edit.name, model: edit.model, tapes: edit.tapes, blank: edit.blank,
          input_alphabet: input, tape_alphabet: alphabet,
          transitions: d.transitions.map(r => ({...r, tapes: Array.from({length: edit.tapes}, (_, i) => r.tapes[i] || [edit.blank, edit.blank, 'S'])})),
          ...(d.inputs ? {inputs: Array.from({length: edit.tapes}, (_, i) => d.inputs![i] || '')} : {})});
      } catch (error) {setError(errorMessage(error));}
    }
  }
  function removeState() {
    if (edit?.kind !== 'state' || !edit.original || !base) return;
    const state = edit.original, d = base.definition;
    if (state === d.start) {setError('Choose a different start state before deleting this state.'); return;}
    if (!window.confirm(`Delete state “${state}” and all its incoming and outgoing transitions?`)) return;
    void save({states: d.states.filter(s => s !== state), accept: d.accept.filter(s => s !== state),
      reject: d.reject.filter(s => s !== state), transitions: d.transitions.filter(r => r.from !== state && r.to !== state)});
  }
  const ruleRows = (snapshot: Machine, from?: string, to?: string) => snapshot.definition.transitions.map((r, i) => ({r, i}))
    .filter(({r}) => !from || r.from === from && r.to === to)
    .map(({r, i}) => <button key={i} type="button" className="rule-row" disabled={disabled || snapshot.revision !== machine?.revision} onClick={() => open({kind: 'rule', index: i, rule: structuredClone(r)}, snapshot)}>
      <strong>{r.from} → {r.to}</strong><code>{r.tapes.map(t => `${t[0]} → ${t[1]}, ${t[2]}`).join(' | ')}</code><span>Edit</span></button>);
  return <>
    <section className="machine-tools panel" aria-label="Machine editing tools">
      <div className="edit-tools"><button aria-pressed={tool === 'inspect'} onClick={() => {setTool('inspect'); setSource(null);}}>Select / edit</button>
        <button disabled={disabled} aria-pressed={tool === 'transition'} onClick={() => {setTool('transition'); setSource(null); playback.pause(); playback.setFollow(false);}}>Transition tool</button>
        <button disabled={disabled} onClick={() => open(stateForm())}>+ State</button>
        <button disabled={disabled} onClick={() => open(ruleForm())}>+ Transition</button>
        <button disabled={disabled} onClick={() => {const d = machine!.definition; open({kind: 'settings', name: d.name, model: d.model, tapes: d.tapes, blank: d.blank, input: JSON.stringify(d.input_alphabet), alphabet: JSON.stringify(d.tape_alphabet)});}}>Machine settings</button>
        <button disabled={!machine} onClick={() => downloadBlob(new Blob([machine!.source], {type: 'text/yaml'}), machine!.path.split('/').pop() || 'machine.yaml')}>Download YAML</button>
      </div>
      <p role="status">{w.saving ? 'Saving…' : disabled ? machine?.mode === 'Unsaved VS Code buffer' ? 'Save your VS Code buffer to enable UI editing.' : 'Select a machine to edit.' : tool === 'transition' ? source ? `From ${source}: select the destination state. Esc cancels.` : 'Select the source state, then the destination. Select the same state twice for a loop.' : 'Select a state or transition to edit it.'} {machine && (machine.mode === 'Imported file' ? 'Imported edits stay in this session. Download YAML to keep them.' : 'Changes save to the workspace YAML when you apply an edit.')}</p>
      {!edit && error && <div className="error-banner" role="alert">{error}</div>}
    </section>
    <div className="editor-graph" onKeyDown={event => {if (event.key === 'Escape') {setSource(null); setTool('inspect');}}}>
      <StateGraph machine={machine} playback={playback} onState={disabled ? undefined : pickState}
        onEdge={disabled || tool !== 'inspect' ? undefined : (from, to) => open({kind: 'rules', from, to})} selectedState={source} />
    </div>
    {machine && <details className="panel transition-list"><summary>States and transitions · {machine.definition.transitions.length} rules</summary>
      <div className="state-list">{machine.states.map(s => <button key={s} disabled={disabled} onClick={() => pickState(s)}>{s}{s === source ? ' · source' : ''}</button>)}</div>
      {ruleRows(machine)}{!machine.definition.transitions.length && <p className="help">No transitions yet. Use the transition tool to link two states.</p>}
    </details>}
    <dialog aria-labelledby="machine-edit-title" className="export-dialog machine-edit-dialog" ref={dialog} onCancel={event => {event.preventDefault(); if (!w.saving) {setEdit(null); setError('');}}} onClose={() => {setEdit(null); setError('');}}>
      {edit && base && <form onSubmit={event => {event.preventDefault(); submit();}}>
        <div className="export-heading"><h2 id="machine-edit-title">{edit.kind === 'state' ? edit.original ? 'Edit state' : 'Add state' : edit.kind === 'rule' ? edit.index === undefined ? 'Add transition' : 'Edit transition' : edit.kind === 'rules' ? `${edit.from} → ${edit.to}` : 'Machine settings'}</h2><button type="button" disabled={w.saving} aria-label="Close editor" onClick={() => {setEdit(null); setError('');}}>×</button></div>
        <fieldset disabled={w.saving || base.revision !== machine?.revision}>
          {edit.kind === 'state' && <>
            <label>State name<input required autoFocus value={edit.name} onChange={e => setEdit({...edit, name: e.target.value})} /></label>
            <label>State type<select value={edit.role} onChange={e => setEdit({...edit, role: e.target.value})}><option value="normal">Normal</option><option value="accept">Accept (halt)</option><option value="reject">Reject (halt)</option></select></label>
            <label className="inline-check"><input type="checkbox" checked={edit.start} disabled={edit.original === base.definition.start} onChange={e => setEdit({...edit, start: e.target.checked})} />Start state</label>
            {edit.original && <p className="help">Renaming updates all references. Deleting also removes every connected transition.</p>}
          </>}
          {edit.kind === 'rule' && <>
            <div className="export-grid">{(['from', 'to'] as const).map(key => <label key={key}>{key === 'from' ? 'Source state' : 'Destination state'}<select value={edit.rule[key]} onChange={e => setEdit({...edit, rule: {...edit.rule, [key]: e.target.value}})}>{base.states.map(s => <option key={s} disabled={key === 'from' && (base.definition.accept.includes(s) || base.definition.reject.includes(s))}>{s}</option>)}</select></label>)}</div>
            {edit.rule.tapes.map((t, i) => <div className="tape-action" key={i}><strong>Tape {i + 1}</strong>{(['Read', 'Write', 'Move'] as const).map((label, j) => <label key={label}>{label}<select aria-label={`Tape ${i + 1} ${label}`} value={t[j]} onChange={e => {const tapes = structuredClone(edit.rule.tapes); if (j === 2) tapes[i][2] = e.target.value as 'L' | 'R' | 'S'; else tapes[i][j === 0 ? 0 : 1] = e.target.value; setEdit({...edit, rule: {...edit.rule, tapes}});}}>{(j === 2 ? ['L', 'R', 'S'] : base.definition.tape_alphabet).map(symbol => <option key={symbol} value={symbol}>{j === 2 ? {L: 'L · Left', R: 'R · Right', S: 'S · Stay'}[symbol] : symbol === ' ' ? '␠ (space)' : symbol}</option>)}</select></label>)}</div>)}
          </>}
          {edit.kind === 'settings' && <>
            <label>Name<input required value={edit.name} onChange={e => setEdit({...edit, name: e.target.value})} /></label>
            <label>Model<select value={edit.model} onChange={e => setEdit({...edit, model: e.target.value as MachineDefinition['model']})}><option value="deterministic">Deterministic</option><option value="nondeterministic">Nondeterministic</option></select></label>
            <div className="export-grid"><label>Tapes<input type="number" required min={1} max={32} value={Number.isNaN(edit.tapes) ? '' : edit.tapes} onChange={e => setEdit({...edit, tapes: e.target.valueAsNumber})} /></label><label>Blank symbol<input required value={edit.blank} onChange={e => setEdit({...edit, blank: e.target.value})} /></label></div>
            <label>Input alphabet (JSON array)<input required value={edit.input} onChange={e => setEdit({...edit, input: e.target.value})} /></label>
            <label>Tape alphabet (JSON array)<input required value={edit.alphabet} onChange={e => setEdit({...edit, alphabet: e.target.value})} /></label>
            <p className="help">Example: ["0", "1", "_"]. Increasing tapes adds blank / blank / stay actions. Decreasing tapes removes trailing tape actions and embedded inputs. Existing rules must use the resulting alphabet.</p>
          </>}
          {edit.kind === 'rules' && <div>{ruleRows(base, edit.from, edit.to)}</div>}
        </fieldset>
        {base.revision !== machine?.revision && <p className="error-banner" role="alert">The machine changed while this editor was open. Close and reopen it to edit the latest version.</p>}
        {error && <p className="error-banner" role="alert">{error}</p>}
        {edit.kind !== 'rules' && <div className="export-actions">
          {edit.kind === 'state' && edit.original ? <button type="button" disabled={w.saving || base.revision !== machine?.revision} onClick={removeState}>Delete state</button> : edit.kind === 'rule' && edit.index !== undefined ? <button type="button" disabled={w.saving || base.revision !== machine?.revision} onClick={() => void save({transitions: base.definition.transitions.filter((_, i) => i !== edit.index)})}>Delete transition</button> : <span />}
          <button className="primary" type="submit" disabled={w.saving || base.revision !== machine?.revision}>{w.saving ? 'Saving…' : 'Apply changes'}</button>
        </div>}
      </form>}
    </dialog>
  </>;
}
