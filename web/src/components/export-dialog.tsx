'use client';
import {useEffect, useRef, useState} from 'react';
import {api, downloadBlob, errorMessage} from '../lib/api';
import type {ExportOptions, Machine, MachineSource} from '../lib/types';
import {Icon} from './icon';

export function ExportDialog({machine, svg}: {machine: Machine | null; svg: SVGSVGElement | null}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lifetime = useRef<AbortController | null>(null);
  const fileRequest = useRef(0);
  const [source, setSource] = useState('current');
  const [file, setFile] = useState<MachineSource | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [options, setOptions] = useState<Omit<ExportOptions, 'name'>>({format: 'image', style: 'readable', language: 'english', layout: 'split', dpi: 200});
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => {lifetime.current?.abort();};
  }, []);
  const imported = source === 'file';
  const basename = ((imported ? file?.filename : machine?.filename) || 'machine').replace(/\.ya?ml$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'machine';
  const filename = name ?? `${basename.slice(0, 80)}-${options.style}`;
  async function readFile(selected: File | undefined) {
    const token = ++fileRequest.current;
    setFile(null); setStatus('');
    if (!selected) {setLoadingFile(false); return;}
    setLoadingFile(true);
    try {
      if (selected.size > 1_900_000) throw new Error('Choose a YAML file smaller than 1.9 MB.');
      const text = await selected.text();
      if (!lifetime.current?.signal.aborted && token === fileRequest.current) setFile({filename: selected.name, source: text});
    } catch (error) {if (token === fileRequest.current) setStatus(errorMessage(error));}
    finally {if (token === fileRequest.current) setLoadingFile(false);}
  }
  async function submit() {
    if (busy || !lifetime.current || !(imported ? file : machine)) return;
    const selected = imported ? file! : {revision: machine!.revision};
    setBusy(true); setStatus('Preparing your table…');
    try {
      const result = await api.export({...options, name: filename, ...selected}, lifetime.current.signal);
      if (lifetime.current.signal.aborted) return;
      downloadBlob(result.blob, result.filename); setStatus(`Downloaded ${result.filename}`);
    } catch (error) {if (!lifetime.current.signal.aborted) setStatus(errorMessage(error));}
    finally {if (!lifetime.current.signal.aborted) setBusy(false);}
  }
  function downloadSvg() {
    if (!svg || !machine) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.removeAttribute('style');
    copy.querySelectorAll('[data-inline-editor]').forEach(node => node.remove());
    copy.querySelectorAll('.editing-node, .editing-edge').forEach(node => node.classList.remove('editing-node', 'editing-edge'));
    copy.querySelectorAll('.active-state, .active-rule, .edit-selected, .editable').forEach(node => {node.classList.remove('active-state', 'active-rule', 'edit-selected', 'editable'); node.removeAttribute('tabindex'); node.removeAttribute('role'); node.removeAttribute('aria-label');});
    downloadBlob(new Blob([new XMLSerializer().serializeToString(copy)], {type: 'image/svg+xml'}), `${machine.filename}.svg`);
  }
  return <><button id="export-open" onClick={() => {setStatus(''); dialog.current?.showModal();}}><Icon name="download" size={15} />Export</button>
    <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title"><form onSubmit={event => {event.preventDefault(); void submit();}}>
      <div className="export-heading"><div><p className="eyebrow">TAKE YOUR WORK WITH YOU</p><h2 id="export-title">Export</h2></div><button type="button" className="icon-button" onClick={() => dialog.current?.close()} aria-label="Close export menu"><Icon name="close" /></button></div>
      <div className="export-actions"><span>State graph</span><button type="button" onClick={downloadSvg} disabled={!svg || !machine}>Download SVG<Icon name="download" size={15} /></button></div>
      <h3>Transition table</h3>
      <fieldset disabled={busy}>
        <label>Machine<select value={source} onChange={event => {setSource(event.target.value); setStatus('');}}><option value="current">Currently selected machine</option><option value="file">Another YAML file…</option></select></label>
        <p className="help">{imported ? file?.filename || 'Choose a YAML machine to export.' : machine ? `${machine.name} · ${machine.path.split('/').pop()}` : 'Select a valid machine, or choose another YAML file.'}</p>
        {imported && <label>Import a machine<input type="file" accept=".yaml,.yml" onChange={event => void readFile(event.target.files?.[0])} /></label>}
        <div className="export-grid"><label>Format<select value={options.format} onChange={event => setOptions({...options, format: event.target.value as ExportOptions['format']})}><option value="image">Image (PNG)</option><option value="csv">CSV</option><option value="tex">LaTeX source</option></select></label>
          <label>Style<select value={options.style} onChange={event => setOptions({...options, style: event.target.value as ExportOptions['style']})}><option value="readable">Readable</option><option value="formal">Formal mathematics</option></select></label>
          <label>Language<select value={options.language} onChange={event => setOptions({...options, language: event.target.value as ExportOptions['language']})}><option value="english">English</option><option value="portuguese">Português</option></select></label>
          {options.format !== 'csv' && <label>Layout<select value={options.layout} onChange={event => setOptions({...options, layout: event.target.value as ExportOptions['layout']})}><option value="split">A4 pieces</option><option value="long">One long table</option></select></label>}
          {options.format === 'image' && <label>Resolution (DPI)<input type="number" min={72} max={600} step={1} value={Number.isNaN(options.dpi) ? '' : options.dpi} required onChange={event => setOptions({...options, dpi: event.target.valueAsNumber})} /></label>}
        </div>
        <p className="help">{options.style === 'formal' ? `Formal mathematics uses δ, blank symbols, and sets of nondeterministic results.${options.format === 'image' ? ' Requires LaTeX.' : ''}` : 'Clear column names and read/write/move tuples in tape order.'}</p>
        <label>File name (without extension)<input type="text" maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,99}" title="Start with a letter or number; use letters, numbers, dots, underscores, or hyphens." value={filename} required onChange={event => setName(event.target.value)} /></label>
        <p className="help">Images contain only the table. Multiple A4 pieces download together as a ZIP.</p>
        <div className="export-actions"><span role="status" aria-live="polite">{status}</span><button className="primary" type="submit" disabled={busy || loadingFile || !(imported ? file : machine)}>{busy ? 'Preparing download…' : 'Export & download'}<Icon name="download" size={15} /></button></div>
      </fieldset>
    </form></dialog>
  </>;
}
