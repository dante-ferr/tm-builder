import {useState} from 'react';
import type {WorkspaceController} from '../hooks/use-workspace';
import {Icon} from './icon';

export function LibraryPanel({workspace: w}: {workspace: WorkspaceController}) {
  const [hideExamples, setHideExamples] = useState(false);
  const machineFilename = w.machine?.mode === 'Imported file' ? '' : w.diagram?.path.split('/').pop() || '';
  const machines = w.library.machines.filter(entry => !hideExamples || !entry.example);
  const inputs = w.library.inputs.filter(entry => !hideExamples || !entry.example);
  return <aside className="sidebar" aria-label="Workspace setup">
    <a className="brand" href="/" aria-label="TMBuilder home"><span className="brand-mark"><Icon name="graph" size={27} /></span><span><strong>TMBuilder<span className="brand-period">.</span></strong><small>A playground for computation</small></span></a>
    <div className="sidebar-caption">YOUR WORKSPACE</div>
    <section className="sidebar-section" aria-labelledby="library-title">
      <div className="section-heading"><Icon name="library" /><h2 id="library-title">Machine library</h2><span className="count">{machines.length}</span></div>
      <label>Machine<select id="machine-select" value={machines.some(entry => entry.filename === machineFilename) ? machineFilename : ''} disabled={w.selecting} onChange={event => {if (event.target.value) void w.selectMachine({filename: event.target.value});}}><option value="">Choose a machine…</option>{machines.map(entry => <option key={entry.filename} value={entry.filename}>{entry.filename}{entry.example ? ' · example' : ''}</option>)}</select></label>
      <label className="file-upload"><Icon name="upload" size={15} /><span>Import machine YAML</span><input id="machine-file" type="file" accept=".yaml,.yml" disabled={w.selecting} onChange={event => {const file = event.target.files?.[0]; if (file) void w.importFile(file, 'machine'); event.target.value = '';}} /></label>
      <label className="inline-check"><input type="checkbox" checked={hideExamples} onChange={event => setHideExamples(event.target.checked)} />Hide bundled examples</label>
    </section>
    <section className="sidebar-section" aria-labelledby="setup-title">
      <div className="section-heading"><Icon name="tape" /><h2 id="setup-title">Starting tapes</h2><span className="subtle">YAML</span></div>
      <label>Input setup<select id="input-select" value={inputs.some(entry => entry.filename === w.input) ? w.input : ''} onChange={event => void w.selectInput(event.target.value)}><option value="">Custom / blank tapes</option>{inputs.map(entry => <option key={entry.filename} value={entry.filename}>{entry.filename}{entry.example ? ' · example' : ''}</option>)}</select></label>
      <label className="editor-label"><span>Setup editor <Icon name="code" size={14} /></span><textarea id="setup" spellCheck={false} rows={6} value={w.setup} onChange={event => w.changeSetup(event.target.value)} /></label>
      <label className="file-upload compact"><Icon name="upload" size={14} /><span>Import input YAML</span><input type="file" accept=".yaml,.yml" onChange={event => {const file = event.target.files?.[0]; if (file) void w.importFile(file, 'input'); event.target.value = '';}} /></label>
      <p className="help">Set contents, origin, and head per tape. Omitted tapes start blank.</p>
      <form onSubmit={event => {event.preventDefault(); void w.run();}}>
        <label className="limit-label">Step limit<input id="max-steps" type="number" min={1} max={10000} step={1} required value={Number.isNaN(w.maxSteps) ? '' : w.maxSteps} onChange={event => w.changeMaxSteps(event.target.valueAsNumber)} /></label>
        <button id="run" className="primary run-button" type="submit" disabled={!w.machine || !w.connected || w.selecting || w.running}><Icon name="play" size={16} />{w.running ? 'Computing trace…' : 'Load trace'}<span aria-hidden="true">↵</span></button>
      </form>
    </section>
    <div className="sidebar-bottom"><span className={`connection-dot ${w.connected ? 'connected' : ''}`} />{w.connected ? 'Connected to local workspace' : 'Connecting to workspace…'}<p>Small machines. Infinite possibilities.</p></div>
  </aside>;
}
