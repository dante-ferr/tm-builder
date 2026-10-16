import {useState} from 'react';
import type {WorkspaceController} from '../hooks/use-workspace';
import {Icon} from './icon';
import {LoadingSpinner} from './loading-spinner';

export function LibraryPanel({workspace: w}: {workspace: WorkspaceController}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const tapeCount = w.machine?.tapes ?? 1;
  const parseSetup = () => {
    const entries = [...w.setup.matchAll(/^\s*-\s+contents:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))?\s*$/gm)];
    return Array.from({length: tapeCount}, (_, index) => {
      const start = entries[index]?.index ?? -1;
      const end = entries[index + 1]?.index ?? w.setup.length;
      const block = start < 0 ? '' : w.setup.slice(start, end);
      const match = entries[index];
      const contents = match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
      const field = (name: string) => Number(block.match(new RegExp(`\\b${name}:\\s*(-?\\d+)`))?.[1] ?? 0);
      return {contents, origin: field('origin'), head: field('head')};
    });
  };
  const [tapes, setTapes] = useState(parseSetup);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFilename, setNewFilename] = useState('new-machine.yaml');
  const [customFilename, setCustomFilename] = useState(false);
  const [hideExamples, setHideExamples] = useState(false);
  const machineFilename = !w.hosted && w.machine?.mode === 'Imported file' ? '' : w.diagram?.path.split(/[/\\]/).pop() || '';
  const machines = w.library.machines.filter(entry => w.hosted || !hideExamples || !entry.example);
  const inputs = w.library.inputs.filter(entry => w.hosted || !hideExamples || !entry.example);
  return <aside className="sidebar" aria-label="Workspace setup">
    <a className="brand" href="/" aria-label="TMBuilder home"><span className="brand-mark" aria-hidden="true"><span className="brand-logo" /></span><span><strong>TMBuilder<span className="brand-period">.</span></strong><small>A playground for computation</small></span></a>
    <div className="sidebar-caption">{w.hosted ? 'EXAMPLES' : 'YOUR WORKSPACE'}</div>
    <section className="sidebar-section" aria-labelledby="library-title">
      <div className="section-heading"><Icon name="library" /><h2 id="library-title">Machine library</h2><span className="count">{machines.length}</span>{!w.hosted && <button className="icon-button" title="Create machine" aria-label="New machine" aria-expanded={creating} disabled={!w.connected || w.selecting || w.saving} onClick={() => setCreating(value => !value)}><Icon name="plus" size={16} /></button>}</div>
      {creating && <form className="create-machine-form" aria-label="Create machine" onSubmit={async event => {
        event.preventDefault();
        if (await w.createMachine(newName, newFilename)) {setCreating(false); setNewName(''); setNewFilename('new-machine.yaml'); setCustomFilename(false);}
      }}><label>Machine name<input required autoFocus value={newName} onChange={event => {setNewName(event.target.value); if (!customFilename) setNewFilename((event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-machine') + '.yaml');}} /></label>
        <label>Machine filename<input required value={newFilename} onChange={event => {setCustomFilename(true); setNewFilename(event.target.value);}} /></label>
        <p className="help">Creates a machine with one start state in your workspace. Customize it on the graph.</p>
        <div className="create-machine-actions"><button type="button" disabled={w.selecting} onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={w.selecting || w.saving} type="submit">Create machine</button></div>
      </form>}
      <label>Machine<select id="machine-select" value={machines.some(entry => entry.filename === machineFilename) ? machineFilename : ''} disabled={w.selecting || w.saving} onChange={event => {if (event.target.value) void w.selectMachine({filename: event.target.value});}}><option value="">Choose a machine…</option>{machines.map(entry => <option key={entry.filename} value={entry.filename}>{entry.filename}{entry.example ? ' · example' : ''}</option>)}</select></label>
      <label className="file-upload"><Icon name="upload" size={15} /><span>Import machine YAML</span><input id="machine-file" type="file" accept=".yaml,.yml" disabled={w.selecting || w.saving} onChange={event => {const file = event.target.files?.[0]; if (file) void w.importFile(file, 'machine'); event.target.value = '';}} /></label>
      {!w.hosted && <label className="inline-check"><input type="checkbox" checked={hideExamples} onChange={event => setHideExamples(event.target.checked)} />Hide bundled examples</label>}
    </section>
    <section className="sidebar-section" aria-labelledby="setup-title">
      <div className="section-heading"><Icon name="tape" /><h2 id="setup-title">Starting tapes</h2></div>
      <label>Input setup<select id="input-select" value={inputs.some(entry => entry.filename === w.input) ? w.input : ''} onChange={event => void w.selectInput(event.target.value)}><option value="">Custom / blank tapes</option>{inputs.map(entry => <option key={entry.filename} value={entry.filename}>{entry.filename}{entry.example ? ' · example' : ''}</option>)}</select></label>
      <button type="button" className="setup-edit-button" onClick={() => {setTapes(parseSetup()); setSetupOpen(true);}}>Edit starting tapes</button>
      <label className="file-upload compact"><Icon name="upload" size={14} /><span>Import input YAML</span><input type="file" accept=".yaml,.yml" onChange={event => {const file = event.target.files?.[0]; if (file) void w.importFile(file, 'input'); event.target.value = '';}} /></label>
      <p className="help">Set contents, origin, and head per tape. Omitted tapes start blank.</p>
      <form onSubmit={event => {event.preventDefault(); void w.run();}}>
        <label className="limit-label">Step limit<input id="max-steps" type="number" min={1} max={w.maximumSteps} step={1} required value={Number.isNaN(w.maxSteps) ? '' : w.maxSteps} onChange={event => w.changeMaxSteps(event.target.valueAsNumber)} /></label>
        <button id="run" className="primary run-button" type="submit" aria-busy={w.running} disabled={!w.machine || !w.connected || w.selecting || w.saving || w.running}>{w.running ? <LoadingSpinner /> : <Icon name="play" size={16} />}{w.running ? 'Loading trace…' : 'Load Trace'}</button>
      </form>
    </section>
    {setupOpen && <div className="setup-overlay" role="presentation" onMouseDown={event => {if (event.target === event.currentTarget) setSetupOpen(false);}}><section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-dialog-title"><div className="export-heading"><div><p className="eyebrow">STARTING CONFIGURATION</p><h2 id="setup-dialog-title">Edit tapes</h2></div><button type="button" className="icon-button" aria-label="Close setup editor" onClick={() => setSetupOpen(false)}><Icon name="close" /></button></div><p className="help">Enter tape symbols and cell positions. Values are saved as YAML automatically.</p><div className="setup-tapes">{tapes.map((tape, index) => <fieldset className="setup-tape" key={index}><legend>Tape {index + 1}</legend><label>Contents<input aria-label={`Tape ${index + 1} contents`} value={tape.contents} onChange={event => setTapes(current => current.map((item, i) => i === index ? {...item, contents: event.target.value} : item))} placeholder="Leave empty for a blank tape" /></label><div className="setup-number-fields">{(['origin', 'head'] as const).map(field => <label key={field}>{field === 'origin' ? 'Origin cell' : 'Head position'}<input type="number" step={1} value={tape[field]} onChange={event => setTapes(current => current.map((item, i) => i === index ? {...item, [field]: event.target.valueAsNumber || 0} : item))} /></label>)}</div></fieldset>)}</div><div className="setup-actions"><button type="button" onClick={() => setSetupOpen(false)}>Cancel</button><button type="button" className="primary" onClick={() => {const active = tapes.slice(0, Math.max(1, tapes.findLastIndex(tape => tape.contents || tape.origin !== 0 || tape.head !== 0) + 1)); const yaml = active.length ? `tapes:\n${active.map(tape => `  - contents: ${JSON.stringify(tape.contents)}\n    origin: ${tape.origin}\n    head: ${tape.head}`).join('\n')}` : 'tapes: []'; w.changeSetup(yaml); setSetupOpen(false);}}>Apply setup</button></div></section></div>}
    <div className="sidebar-bottom"><span className={`connection-dot ${w.connected ? 'connected' : ''}`} />{w.connected ? (w.hosted ? 'Connected' : 'Connected to local workspace') : (w.hosted ? 'Connecting…' : 'Connecting to workspace…')}<p>{w.hosted ? 'Import a machine, edit it here, then save the YAML.' : 'Small machines. Infinite possibilities.'}</p></div>
  </aside>;
}
