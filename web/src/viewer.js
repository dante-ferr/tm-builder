import {instance} from '@viz-js/viz';
const $ = id => document.getElementById(id);
const renderer = instance();
let revision = null, svg = null, filename = 'machine', scale = 1;
let library = {machines: [], inputs: []}, selectionVersion = 0, selectionBusy = false, inputRequest = 0, selectedMachine = '';
let machine = null, trace = null, position = 0, phase = 0, timer = null, request = 0;
function fit() {
  if (!svg) return;
  const {width, height} = svg.viewBox.baseVal;
  scale = Math.min(2, Math.max(.05, Math.min(($('graph').clientWidth - 60) / width, ($('graph').clientHeight - 60) / height)));
  zoom(1);
}
function zoom(factor) {
  if (!svg) return;
  scale = Math.max(.02, Math.min(20, scale * factor));
  svg.style.width = `${svg.viewBox.baseVal.width * scale}px`;
  svg.style.height = `${svg.viewBox.baseVal.height * scale}px`;
}
async function refresh() {
  const version = selectionVersion;
  try {
    if (selectionBusy) return;
    const response = await fetch('/api/diagram');
    const result = await response.json();
    if (version !== selectionVersion) return;
    if (!response.ok || result.error) throw new Error(result.error || 'Viewer unavailable');
    if (result.revision === revision) return;
    clearTrace(revision === null ? 'Load a trace to inspect the tapes.' : 'Machine changed. Load a new trace.');
    machine = result.valid ? result : null;
    updateExport();
    $('run').disabled = true;
    $('states').replaceChildren(...(result.states || []).map(state => {
      const option = document.createElement('option'); option.value = state; return option;
    }));
    selectedMachine = result.mode === 'Imported file' ? '' : result.path.split('/').pop();
    $('path').textContent = result.path;
    renderLibrary();
    $('download').disabled = true;
    if (!result.valid) {
      $('title').textContent = 'Machine diagram';
      $('graph').classList.add('stale');
      $('status').textContent = result.diagnostics.map(d => `${d.line}:${d.column} ${d.message}`).join(' · ');
      revision = result.revision;
      return;
    }
    const viz = await renderer;
    if (version !== selectionVersion) return;
    svg = viz.renderSVGElement(result.dot);
    filename = result.filename;
    $('graph').replaceChildren(svg);
    $('graph').classList.remove('stale');
    $('title').textContent = result.name;
    $('status').textContent = `${result.model || 'deterministic'} · ${result.mode} · Live preview`;
    $('download').disabled = false;
    revision = result.revision;
    $('run').disabled = false;
    fit();
  } catch (error) {
    if (version !== selectionVersion) return;
    $('status').textContent = error.message;
    $('download').disabled = true;
    revision = null;
    machine = null;
    updateExport();
    $('run').disabled = true;
    clearTrace('Viewer unavailable.');
  } finally { setTimeout(refresh, 500); }
}
function renderLibrary() {
  for (const [kind, id, placeholder] of [['machines', 'machine-select', 'Choose a machine…'], ['inputs', 'input-select', 'Choose an input…']]) {
    const select = $(id);
    const selected = kind === 'machines' ? selectedMachine : select.value;
    const options = [new Option(placeholder, '')];
    for (const entry of library[kind]) {
      if ($('hide-examples').checked && entry.example) continue;
      options.push(new Option(entry.filename + (entry.example ? ' (example)' : ''), entry.filename));
    }
    select.replaceChildren(...options);
    select.value = options.some(option => option.value === selected) ? selected : '';
  }
}
async function loadLibrary() {
  try {
    const response = await fetch('/api/library');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Library unavailable');
    if (JSON.stringify(library) !== JSON.stringify(result)) { library = result; renderLibrary(); }
  } catch (error) { $('library-status').textContent = error.message; }
  finally { setTimeout(loadLibrary, 2000); }
}
async function selectMachine(data) {
  const version = ++selectionVersion;
  selectionBusy = true; $('machine-select').disabled = true; $('machine-file').disabled = true; machine = null; revision = null;
  updateExport();
  $('run').disabled = true; $('download').disabled = true;
  clearTrace('Machine changed. Load a new trace.');
  try {
    const response = await fetch('/api/machine', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Machine unavailable');
    $('library-status').textContent = '';
  } catch (error) { $('library-status').textContent = error.message; }
  finally { if (version === selectionVersion) { selectionBusy = false; $('machine-select').disabled = false; $('machine-file').disabled = false; } }
}
$('hide-examples').onchange = renderLibrary;
$('machine-select').onchange = event => {
  if (event.target.value && !selectionBusy) selectMachine({filename: event.target.value});
};
$('machine-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file || selectionBusy) return;
  try { await selectMachine({filename: file.name, source: await file.text()}); }
  catch (error) { $('library-status').textContent = error.message; }
  event.target.value = '';
};
$('input-select').onchange = async event => {
  const filename = event.target.value;
  const token = ++inputRequest;
  if (!filename) return;
  try {
    const response = await fetch('/api/input?filename=' + encodeURIComponent(filename));
    const result = await response.json();
    if (token !== inputRequest) return;
    if (!response.ok) throw new Error(result.error || 'Input unavailable');
    $('setup').value = result.source;
    clearTrace('Starting tapes changed. Load a new trace.'); $('run').disabled = !machine;
  } catch (error) { if (token === inputRequest) $('execution').textContent = error.message; }
};
loadLibrary();
$('fit').onclick = fit;
$('zoom-in').onclick = () => zoom(1.25);
$('zoom-out').onclick = () => zoom(.8);
$('download').onclick = () => {
  if (!svg || $('download').disabled) return;
  const copy = svg.cloneNode(true); copy.removeAttribute('style');
  copy.querySelectorAll('.active-state, .active-rule').forEach(node => node.classList.remove('active-state', 'active-rule'));
  const text = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(new Blob([text], {type: 'image/svg+xml'}));
  const link = document.createElement('a'); link.href = url; link.download = `${filename}.svg`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('resize', fit);

let exportBusy = false, exportFile = null, exportFileRequest = 0, exportNameDirty = false;
function updateExport() {
  const imported = $('export-source').value === 'file';
  const format = $('export-format').value;
  const formal = $('export-style').value === 'formal';
  $('export-file-label').hidden = !imported;
  $('export-layout-label').hidden = format === 'csv';
  $('export-dpi-label').hidden = format !== 'image';
  $('export-dpi').disabled = format !== 'image' || exportBusy;
  $('export-machine').textContent = imported
    ? exportFile?.filename || 'Choose a YAML machine to export without changing the diagram.'
    : machine ? `${machine.name} · ${machine.path.split('/').pop()}` : 'Select a valid machine, or choose another YAML file.';
  $('export-help').textContent = formal
    ? format === 'csv' ? 'Formal CSV contains LaTeX expressions for δ and its results.'
      : format === 'image' ? 'Formal mathematics uses δ, blank symbols, and sets of nondeterministic results. Requires LaTeX.'
        : 'Formal mathematics uses δ, blank symbols, and sets of nondeterministic results.'
    : 'Clear column names and read/write/move tuples in tape order.';
  if (!exportNameDirty) {
    const file = imported ? exportFile?.filename : machine?.path.split('/').pop();
    const base = (file || 'machine').replace(/\.ya?ml$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'machine';
    $('export-name').value = `${base.slice(0, 80)}-${$('export-style').value}`;
  }
  for (const id of ['export-source', 'export-file', 'export-format', 'export-style', 'export-layout', 'export-name']) $(id).disabled = exportBusy;
  $('export-submit').disabled = exportBusy || !(imported ? exportFile : machine);
  $('export-submit').textContent = exportBusy ? 'Preparing download…' : 'Export & download';
}
$('export-open').onclick = () => { updateExport(); $('export-dialog').showModal(); };
$('export-close').onclick = () => $('export-dialog').close();
for (const id of ['export-source', 'export-format', 'export-style', 'export-layout']) $(id).onchange = () => {
  $('export-status').textContent = ''; updateExport();
};
$('export-name').oninput = () => { exportNameDirty = true; };
$('export-file').onchange = async event => {
  const token = ++exportFileRequest, file = event.target.files[0];
  exportFile = null; updateExport();
  if (!file) return;
  try {
    if (file.size > 1_900_000) throw new Error('Choose a YAML file smaller than 1.9 MB.');
    const source = await file.text();
    if (token !== exportFileRequest) return;
    exportFile = {filename: file.name, source};
    $('export-status').textContent = ''; updateExport();
  } catch (error) { if (token === exportFileRequest) $('export-status').textContent = error.message; }
};
$('export-form').onsubmit = async event => {
  event.preventDefault();
  if (exportBusy) return;
  const imported = $('export-source').value === 'file';
  if (!(imported ? exportFile : machine)) return;
  const data = {format: $('export-format').value, style: $('export-style').value,
    layout: $('export-layout').value, dpi: $('export-format').value === 'image' ? Number($('export-dpi').value) : 200,
    name: $('export-name').value, ...(imported ? exportFile : {revision: machine.revision})};
  exportBusy = true; $('export-status').textContent = 'Preparing your table…'; updateExport();
  try {
    const response = await fetch('/api/export', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
    if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Export failed.'); }
    const downloaded = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'table';
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = downloaded;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('export-status').textContent = `Downloaded ${downloaded}`;
  } catch (error) { $('export-status').textContent = error.message; }
  finally { exportBusy = false; updateExport(); }
};

function pause() {
  clearTimeout(timer); timer = null; $('play').textContent = 'Play';
}
function clearTrace(message) {
  pause(); request++; trace = null; position = 0; phase = 0;
  for (const id of ['reset', 'back', 'play', 'next', 'timeline']) $(id).disabled = true;
  $('timeline').max = 0; $('timeline').value = 0;
  $('tapes').replaceChildren(); $('execution').textContent = message;
  $('trace-note').textContent = ''; $('rule-details').textContent = 'No transition selected.';
  highlight(null, null);
}
function highlight(state, rule) {
  if (!svg) return;
  svg.querySelectorAll('.active-state, .active-rule').forEach(node => node.classList.remove('active-state', 'active-rule'));
  if (!machine) return;
  svg.querySelector(`#state_${machine.states.indexOf(state)}`)?.classList.add('active-state');
  if (rule) svg.querySelector(`#edge_${machine.states.indexOf(rule.source)}_${machine.states.indexOf(rule.to)}`)?.classList.add('active-rule');
}
function renderFrame() {
  if (!trace) return;
  const frame = trace.frames[position];
  const pending = phase ? trace.frames[position + 1] : null;
  const rule = pending?.transition || frame.transition;
  const tapes = phase === 3 ? pending.tapes : frame.tapes;
  $('tapes').replaceChildren(...tapes.map((tape, index) => {
    const row = document.createElement('div'); row.className = 'tape';
    const label = document.createElement('div'); label.className = 'tape-label';
    label.textContent = `Tape ${index + 1} · head ${tape.head}`;
    const cells = document.createElement('div'); cells.className = 'cells';
    tape.cells.forEach((symbol, offset) => {
      const address = tape.left + offset;
      const written = phase === 2 && address === tape.head;
      const cell = document.createElement('div'); cell.className = 'cell';
      if (address === tape.head) cell.classList.add('head');
      if (written) cell.classList.add('written');
      cell.append(document.createTextNode(written ? rule.tapes[index][1] : symbol));
      const number = document.createElement('small'); number.textContent = address;
      cell.append(number); cells.append(cell);
    });
    const window = document.createElement('div'); window.className = 'tape-window';
    window.append(cells); row.append(label, window); return row;
  }));
  for (const window of document.querySelectorAll('.tape-window'))
    window.scrollLeft = Math.max(0, 8.5 * 38 - window.clientWidth / 2);
  const atEnd = position === trace.frames.length - 1 && !phase;
  const phaseLabel = ['', ' · Read', ' · Write', ' · Move'][phase];
  $('execution').textContent = `Step ${frame.step} · State ${frame.state}${phaseLabel}` +
    (atEnd ? ` · ${trace.status}: ${trace.reason}` : '');
  $('rule-details').textContent = rule
    ? `Rule ${rule.index + 1}: ${rule.source} → ${rule.to}\n` + rule.tapes.map(([read, write, move], i) =>
      `Tape ${i + 1}: read ${read} → write ${write}, ${move === 'L' ? 'left' : move === 'R' ? 'right' : 'stay'}`).join('\n')
    : 'Initial configuration. No transition applied.';
  $('timeline').value = position;
  $('back').disabled = position === 0 && !phase;
  $('next').disabled = atEnd; $('play').disabled = atEnd;
  highlight(frame.state, rule);
}
function seek(value) {
  pause(); position = value; phase = 0; renderFrame();
}
function schedule() {
  timer = setTimeout(tick, 1000 / Number($('speed').value) / 4);
}
function tick() {
  timer = null;
  if (!trace || position >= trace.frames.length - 1) { pause(); return; }
  phase++;
  if (phase === 4) { position++; phase = 0; }
  renderFrame();
  const nextRule = trace.frames[position + 1]?.transition;
  const stateBreak = $('break-state').value.trim();
  const ruleBreak = Number($('break-rule').value);
  if (!phase && ((stateBreak && trace.frames[position].state === stateBreak) ||
      (ruleBreak && nextRule?.index + 1 === ruleBreak))) {
    pause(); $('execution').textContent += ' · Breakpoint'; return;
  }
  if (position >= trace.frames.length - 1) { pause(); return; }
  schedule();
}
$('run').onclick = async () => {
  if (!machine) return;
  clearTrace('Computing bounded trace…');
  const token = request;
  $('run').disabled = true;
  try {
    const response = await fetch('/api/simulate', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({revision, setup: $('setup').value, max_steps: Number($('max-steps').value)})});
    const result = await response.json();
    if (token !== request) return;
    if (!response.ok || result.error) throw new Error(result.error || 'Simulation unavailable');
    if (result.revision !== revision) throw new Error('Machine changed. Load a new trace.');
    trace = result;
    $('timeline').max = trace.frames.length - 1;
    $('timeline').disabled = false; $('reset').disabled = false;
    $('trace-note').textContent = result.model === 'nondeterministic'
      ? 'Playback shows one accepting path, or the last explored path. The final status describes the whole bounded search.'
      : 'Playback replays the recorded trace. Change starting tapes and load a new trace to run again.';
    $('setup-panel').open = false;
    renderFrame(); fit();
  } catch (error) { if (token === request) $('execution').textContent = error.message; }
  finally { if (token === request) $('run').disabled = !machine; }
};
$('setup-file').onchange = async event => {
  const file = event.target.files[0];
  const token = ++inputRequest;
  if (file) {
    try {
      const text = await file.text();
      if (token !== inputRequest) return;
      $('input-select').value = ''; $('setup').value = text; clearTrace('Starting tapes changed. Load a new trace.');
      $('run').disabled = !machine;
    }
    catch (error) { $('execution').textContent = error.message; }
  }
};
for (const id of ['setup', 'max-steps']) $(id).oninput = () => {
  if (id === 'setup') { inputRequest++; $('input-select').value = ''; }
  clearTrace('Run settings changed. Load a new trace.'); $('run').disabled = !machine;
};
$('setup-panel').ontoggle = fit;
$('reset').onclick = () => seek(0);
$('back').onclick = () => seek(phase ? position : Math.max(0, position - 1));
$('next').onclick = () => seek(Math.min(trace.frames.length - 1, position + 1));
$('timeline').oninput = event => seek(Number(event.target.value));
$('play').onclick = () => {
  if (timer !== null) { pause(); return; }
  $('play').textContent = 'Pause'; schedule();
};
refresh();
