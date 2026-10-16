'use client';
import {useEffect, useState, type ReactNode} from 'react';
import type {WorkspaceController} from '../hooks/use-workspace';
import type {PlaybackController} from '../hooks/use-playback';
import type {Machine, MachineDefinition, Rule} from '../lib/types';
import {assignGroup, renameInGroups, writeGroup} from '../lib/groups';
import {downloadBlob, errorMessage} from '../lib/api';
import {StateGraph, type GraphAnchor} from './state-graph';
import {Icon} from './icon';
import {SymbolList} from './symbol-list';
import {alphabetIssue} from '../lib/alphabet';

type Edit = {kind: 'state'; original?: string; name: string; start: boolean; role: string; groupChoice: string; newGroup: string; point?: {x: number; y: number}}
  | {kind: 'rule'; index?: number; rule: Rule}
  | {kind: 'group'; original?: string; name: string; members: string[]; point?: {x: number; y: number}}
  | {kind: 'settings'; name: string; model: MachineDefinition['model']; tapes: number; blank: string; input: string[]; alphabet: string[]};

export function MachineEditor({workspace: w, playback, onBeginEdit, actions}: {workspace: WorkspaceController; playback: PlaybackController; onBeginEdit?: () => void; actions?: ReactNode}) {
  const machine = w.selecting ? null : w.machine;
  const [tool, setTool] = useState<'inspect' | 'state' | 'transition'>('inspect');
  const [source, setSource] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [base, setBase] = useState<Machine | null>(null);
  const [error, setError] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const disabled = !machine || !w.connected || w.selecting || w.saving || machine.mode === 'Unsaved VS Code buffer';
  useEffect(() => {setSource(null);}, [machine?.revision]);
  useEffect(() => {setEdit(null); setError(''); setSource(null);}, [w.historyGeneration]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {if (event.key === 'Escape' && !w.saving) {setEdit(null); setError(''); setSource(null); setTool('inspect');}};
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [w.saving]);
  function open(value: Edit, snapshot = machine) {onBeginEdit?.(); setBase(snapshot); setEdit(value); setError(''); setMemberQuery(''); playback.pause();}
  function stateForm(state?: string): Extract<Edit, {kind: 'state'}> {
    const d = machine!.definition;
    const group = state ? Object.entries(d.groups).find(([, members]) => members.includes(state))?.[0] || '' : '';
    return {kind: 'state', original: state, name: state || '', start: state === d.start, groupChoice: group, newGroup: '',
      role: state && d.accept.includes(state) ? 'accept' : state && d.reject.includes(state) ? 'reject' : 'normal'};
  }
  function openGroup(name?: string) {
    const d = machine!.definition;
    open(name ? {kind: 'group', original: name, name, members: [...d.groups[name]]} : {kind: 'group', name: '', members: []});
  }
  function ruleForm(from?: string, to?: string): Edit {
    const d = machine!.definition;
    return {kind: 'rule', rule: {from: from || d.states.find(s => !d.accept.includes(s) && !d.reject.includes(s)) || d.start,
      to: to || d.start, tapes: Array.from({length: d.tapes}, () => [d.blank, d.blank, 'S'])}};
  }
  function pickState(state: string) {
    if (disabled) return;
    playback.pause(); playback.setFollow(false);
    if (tool !== 'transition') {open(stateForm(state)); return;}
    if (!source) {
      if (machine!.definition.accept.includes(state) || machine!.definition.reject.includes(state)) {
        setError('Halting states cannot have outgoing transitions. Choose another source state.'); return;
      }
      close(); setSource(state);
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
      const groupName = edit.groupChoice === '__new__' ? edit.newGroup.trim() : edit.groupChoice;
      if (edit.groupChoice === '__new__' && !groupName) {setError('Enter a group name.'); return;}
      void save({states: edit.original ? d.states.map(rename) : [...d.states, name],
        start: edit.start ? name : rename(d.start), accept, reject,
        groups: assignGroup(renameInGroups(d.groups, edit.original, name), name, groupName),
        transitions: d.transitions.map(r => ({...r, from: rename(r.from), to: rename(r.to)}))});
    } else if (edit.kind === 'group') {
      const name = edit.name.trim();
      if (!name) {setError('Enter a group name.'); return;}
      const members = d.states.filter(state => edit.members.includes(state));
      if (!members.length) {setError('Choose at least one state.'); return;}
      if (name !== edit.original && name in d.groups) {setError('That group already exists.'); return;}
      void save({groups: writeGroup(d.groups, edit.original, name, members)});
    } else if (edit.kind === 'rule') {
      const transitions = [...d.transitions];
      if (edit.index === undefined) transitions.push(edit.rule); else transitions[edit.index] = edit.rule;
      void save({transitions});
    } else if (edit.kind === 'settings') {
      try {
        const input = edit.input, alphabet = edit.alphabet;
        const issue = alphabetIssue(input, 'Input alphabet') || alphabetIssue(alphabet, 'Tape alphabet');
        if (issue) throw new Error(issue);
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
    void save({states: d.states.filter(s => s !== state), accept: d.accept.filter(s => s !== state),
      reject: d.reject.filter(s => s !== state), groups: assignGroup(d.groups, state, ''),
      transitions: d.transitions.filter(r => r.from !== state && r.to !== state)});
  }
  function removeGroup() {
    if (edit?.kind !== 'group' || !edit.original || !base) return;
    const groups = {...base.definition.groups};
    delete groups[edit.original];
    void save({groups});
  }

  function close() {setEdit(null); setError('');}
  function chooseTool(next: typeof tool) {if (w.saving) return; if (next !== 'inspect') onBeginEdit?.(); close(); setTool(next); setSource(null); playback.pause(); playback.setFollow(false);}
  function pickEdge(from: string, to: string) {
    if (!machine || disabled || tool !== 'inspect') return;
    const index = machine.definition.transitions.findIndex(r => r.from === from && r.to === to);
    if (index >= 0) open({kind: 'rule', index, rule: structuredClone(machine.definition.transitions[index])});
  }
  const stale = Boolean(base && base.revision !== machine?.revision);
  const locked = w.saving || stale || !w.connected;
  const anchor: GraphAnchor = edit?.kind === 'state' ? {state: edit.original, point: edit.point}
    : edit?.kind === 'rule' ? {from: edit.rule.from, to: edit.rule.to}
    : edit?.kind === 'group' ? {group: edit.original ?? ''} : {};
  const related = edit?.kind === 'rule' && base ? base.definition.transitions.map((r, index) => ({r, index}))
    .filter(({r}) => r.from === edit.rule.from && r.to === edit.rule.to) : [];
  const rulePosition = related.findIndex(r => edit?.kind === 'rule' && r.index === edit.index);
  const formActions = <div className="inline-actions">
    {edit?.kind === 'state' && edit.original && <button className="icon-button danger" type="button" disabled={locked} title="Delete state and connected transitions" aria-label="Delete state and connected transitions" onClick={removeState}><Icon name="trash" size={15} /></button>}
    {edit?.kind === 'group' && edit.original && <button className="icon-button danger" type="button" disabled={locked} title="Delete group. States stay on the graph." aria-label="Delete group. States stay on the graph." onClick={removeGroup}><Icon name="trash" size={15} /></button>}
    {edit?.kind === 'rule' && edit.index !== undefined && <button className="icon-button danger" type="button" disabled={locked} title="Delete transition" aria-label="Delete transition" onClick={() => void save({transitions: base!.definition.transitions.filter((_, i) => i !== edit.index)})}><Icon name="trash" size={15} /></button>}
    <span className="inline-save-hint">{w.saving ? 'Saving…' : 'Enter to save'}</span>
    <button className="icon-button" type="button" disabled={w.saving} aria-label="Cancel edit" title="Cancel (Esc)" onClick={close}><Icon name="close" size={15} /></button>
    <button className="icon-button primary" type="submit" disabled={locked} aria-label="Save changes" title="Save changes (Enter)"><Icon name="check" size={16} /></button>
  </div>;
  const feedback = <>{stale && <p className="inline-error" role="alert">Machine changed. Close and select it again.</p>}{error && <p className="inline-error" role="alert">{error}</p>}</>;
  const shownMembers = edit?.kind === 'group' && base ? base.definition.states.filter(state => state.toLowerCase().includes(memberQuery.trim().toLowerCase())) : [];
  const content = edit && base && <form className={`inline-machine-form ${edit.kind}-form`} aria-label={edit.kind === 'state' ? 'Edit state on graph' : edit.kind === 'rule' ? 'Edit transition on graph' : edit.kind === 'group' ? 'Edit group on graph' : 'Machine settings'} onKeyDown={event => {if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'BUTTON') {event.preventDefault(); event.currentTarget.requestSubmit();}}} onSubmit={event => {event.preventDefault(); submit();}}>
    <fieldset disabled={locked}>
      {edit.kind === 'state' && <>
        <label className="inline-state-name"><span className="sr-only">State name</span><input required autoFocus placeholder="State name" value={edit.name} onChange={e => setEdit({...edit, name: e.target.value})} /></label>
        <div className="inline-state-properties"><label><span className="sr-only">State type</span><select aria-label="State type" value={edit.role} onChange={e => setEdit({...edit, role: e.target.value})}><option value="normal">Normal state</option><option value="accept">Accept state</option><option value="reject">Reject state</option></select></label>
          <label className="inline-check"><input type="checkbox" checked={edit.start} disabled={edit.original === base.definition.start} onChange={e => setEdit({...edit, start: e.target.checked})} />Start</label></div>
        <label className="inline-group-field">Group<select aria-label="Group" value={edit.groupChoice} onChange={e => setEdit({...edit, groupChoice: e.target.value})}><option value="">No group</option>{Object.keys(base.definition.groups).map(name => <option key={name} value={name}>{name}</option>)}<option value="__new__">New group…</option></select></label>
        {edit.groupChoice === '__new__' && <input className="inline-group-name" aria-label="New group name" placeholder="Group name" value={edit.newGroup} onChange={e => setEdit({...edit, newGroup: e.target.value})} />}
      </>}
      {edit.kind === 'rule' && <>
        <div className="inline-rule-heading"><span>{edit.rule.from} → {edit.rule.to}</span>
          {related.length > 1 && edit.index !== undefined && <div className="inline-rule-pager"><button className="icon-button" type="button" title="Previous rule on this connection" aria-label="Previous rule on this connection" disabled={rulePosition <= 0} onClick={() => {const r = related[rulePosition - 1]; open({kind: 'rule', index: r.index, rule: structuredClone(r.r)}, base);}}><Icon name="back" size={13} /></button><span>{rulePosition + 1} / {related.length}</span><button className="icon-button" type="button" title="Next rule on this connection" aria-label="Next rule on this connection" disabled={rulePosition >= related.length - 1} onClick={() => {const r = related[rulePosition + 1]; open({kind: 'rule', index: r.index, rule: structuredClone(r.r)}, base);}}><Icon name="next" size={13} /></button></div>}
        </div>
        <div className="inline-tape-head"><span>Tape</span><span>Read</span><span>Write</span><span>Move</span></div>
        <div className="inline-tape-rows">{edit.rule.tapes.map((t, i) => <div className="inline-tape-action" key={i}><span>{i + 1}</span>{(['Read', 'Write', 'Move'] as const).map((label, j) => <select key={label} aria-label={`Tape ${i + 1} ${label}`} value={t[j]} onChange={e => {const tapes = structuredClone(edit.rule.tapes); if (j === 2) tapes[i][2] = e.target.value as 'L' | 'R' | 'S'; else tapes[i][j === 0 ? 0 : 1] = e.target.value; setEdit({...edit, rule: {...edit.rule, tapes}});}}>{(j === 2 ? ['L', 'R', 'S'] : base.definition.tape_alphabet).map(symbol => <option key={symbol} value={symbol}>{j === 2 ? {L: '← Left', R: '→ Right', S: '· Stay'}[symbol] : symbol === ' ' ? '␠' : symbol}</option>)}</select>)}</div>)}</div>
      </>}
      {edit.kind === 'group' && <>
        <label>Group name<input className="inline-group-name" required autoFocus value={edit.name} onChange={e => setEdit({...edit, name: e.target.value})} /></label>
        <label className="inline-member-filter">States<input aria-label="Filter states" placeholder="Filter states" value={memberQuery} onChange={e => setMemberQuery(e.target.value)} /></label>
        <div className="inline-members">{shownMembers.map(state => {
          const owner = Object.entries(base.definition.groups).find(([name, members]) => name !== edit.original && members.includes(state))?.[0];
          return <label key={state}><input type="checkbox" checked={edit.members.includes(state)} onChange={() => setEdit({...edit, members: edit.members.includes(state) ? edit.members.filter(member => member !== state) : [...edit.members, state]})} /><span>{state}</span>{owner && <span className="group-hint">in {owner}</span>}</label>;
        })}{!shownMembers.length && <span className="group-hint">No matching states.</span>}</div>
      </>}
      {edit.kind === 'settings' && <div className="inline-settings-grid">
        <label>Name<input required value={edit.name} onChange={e => setEdit({...edit, name: e.target.value})} /></label>
        <label>Model<select value={edit.model} onChange={e => setEdit({...edit, model: e.target.value as MachineDefinition['model']})}><option value="deterministic">Deterministic</option><option value="nondeterministic">Nondeterministic</option></select></label>
        <label>Tapes<input type="number" required min={1} max={32} value={Number.isNaN(edit.tapes) ? '' : edit.tapes} onChange={e => setEdit({...edit, tapes: e.target.valueAsNumber})} /></label>
        <label>Blank<input required value={edit.blank} onChange={e => setEdit({...edit, blank: e.target.value})} /></label>
        <SymbolList label="Input alphabet" symbols={edit.input} onChange={input => setEdit({...edit, input})} />
        <SymbolList label="Tape alphabet" symbols={edit.alphabet} onChange={alphabet => setEdit({...edit, alphabet})} />
      </div>}
    </fieldset>
    {feedback}{formActions}
  </form>;
  const tools = <div className="graph-edit-tools" role="toolbar" aria-label="Machine tools">
    <button className="icon-button" aria-label="Select and edit" title="Select and edit" aria-pressed={tool === 'inspect'} onClick={() => chooseTool('inspect')}><Icon name="cursor" size={17} /></button>
    <button className="icon-button" disabled={disabled} aria-label="Add state" title="Add state — click empty canvas" aria-pressed={tool === 'state'} onClick={() => chooseTool('state')}><Icon name="state" size={18} /></button>
    <button className="icon-button" disabled={disabled} aria-label="Transition tool" title="Transition — select source, then destination" aria-pressed={tool === 'transition'} onClick={() => chooseTool('transition')}><Icon name="transition" size={18} /></button>
    <button className="icon-button" disabled={disabled} aria-label="Add group" title="Add group — choose the states it encloses" aria-pressed={edit?.kind === 'group' && !edit.original} onClick={() => {if (w.saving) return; setTool('inspect'); setSource(null); if (edit?.kind === 'group' && !edit.original) {close(); return;} openGroup();}}><Icon name="group" size={18} /></button>
    <span className="toolbar-divider" />
    <button className="icon-button" disabled={disabled || !machine?.can_undo} aria-label="Undo change" title="Undo (Ctrl+Z)" onClick={() => void w.changeHistory('undo')}><Icon name="undo" size={17} /></button>
    <button className="icon-button" disabled={disabled || !machine?.can_redo} aria-label="Redo change" title="Redo (Ctrl+Shift+Z)" onClick={() => void w.changeHistory('redo')}><Icon name="redo" size={17} /></button>
    <button className="icon-button" disabled={disabled} aria-label="Machine settings" title="Machine settings" aria-pressed={edit?.kind === 'settings'} onClick={() => {if (edit?.kind === 'settings') {close(); return;} const d = machine!.definition; open({kind: 'settings', name: d.name, model: d.model, tapes: d.tapes, blank: d.blank, input: [...d.input_alphabet], alphabet: [...d.tape_alphabet]});}}><Icon name="settings" size={17} /></button>
    <button className="icon-button" disabled={!machine} aria-label="Download YAML" title="Download YAML" onClick={() => downloadBlob(new Blob([machine!.source], {type: 'text/yaml'}), machine!.path.split('/').pop() || 'machine.yaml')}><Icon name="code" size={17} /></button>
  </div>;
  const help = w.saving ? 'Saving YAML…' : !w.connected ? 'Reconnecting to workspace…' : w.machineError && !machine ? 'Fix this machine, or choose another one.' : disabled ? machine?.mode === 'Unsaved VS Code buffer' ? 'Save your VS Code buffer to edit here.' : 'Choose a machine to begin.'
    : edit ? 'Edit here · Enter saves · Esc cancels' : tool === 'state' ? 'Click empty canvas to add a state.' : tool === 'transition' ? source ? `From ${source} → select destination. Esc cancels.` : 'Select source → destination. Same state twice creates a loop.'
    : 'Click a state, connection, or group · Scroll to zoom · Middle drag to pan';
  return <StateGraph machine={machine} playback={playback} machineIssue={w.machineError} tools={tools} actions={actions} help={<>{!edit && error ? <span role="alert">{error}</span> : help}{machine?.mode === 'Imported file' && ' · Imported: download YAML to keep edits.'}</>}
    settings={edit?.kind === 'settings' ? <div className="graph-settings">{content}</div> : null}
    inlineEditor={edit && edit.kind !== 'settings' ? {key: `${base?.revision}:${edit.kind}:${edit.kind === 'state' ? edit.original || 'new' : edit.kind === 'group' ? edit.original || 'new' : edit.index ?? 'new'}`, anchor, content,
      height: edit.kind === 'state' ? (edit.groupChoice === '__new__' ? 318 : 270) : edit.kind === 'group' ? 400 : Math.min(330, 155 + edit.rule.tapes.length * 36)} : null}
    addingState={tool === 'state' && !edit} onCanvas={point => {if (!disabled) {let index = 0; while (machine!.states.includes(`q${index}`)) index++; open({...stateForm(), name: `q${index}`, point});}}}
    onState={disabled ? undefined : pickState} onEdge={disabled || tool !== 'inspect' ? undefined : pickEdge}
    onGroup={disabled || tool !== 'inspect' ? undefined : openGroup}
    selectedState={source || (edit?.kind === 'state' ? edit.original : null)} selectedGroup={edit?.kind === 'group' ? edit.original : null} />;
}
