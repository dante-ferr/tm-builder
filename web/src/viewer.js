import {instance} from '@viz-js/viz';
const $ = id => document.getElementById(id);
const renderer = instance();
let revision = null, svg = null, filename = 'machine', scale = 1;
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
  try {
    const response = await fetch('/api/diagram');
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Viewer unavailable');
    if (result.revision === revision) return;
    clearTrace(revision === null ? 'Load a trace to inspect the tapes.' : 'Machine changed. Load a new trace.');
    machine = result.valid ? result : null;
    $('run').disabled = true;
    $('states').replaceChildren(...(result.states || []).map(state => {
      const option = document.createElement('option'); option.value = state; return option;
    }));
    $('path').textContent = result.path;
    $('download').disabled = true;
    if (!result.valid) {
      $('graph').classList.add('stale');
      $('status').textContent = result.diagnostics.map(d => `${d.line}:${d.column} ${d.message}`).join(' · ');
      revision = result.revision;
      return;
    }
    const viz = await renderer;
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
    $('status').textContent = error.message;
    $('download').disabled = true;
    revision = null;
    machine = null;
    $('run').disabled = true;
    clearTrace('Viewer unavailable.');
  } finally { setTimeout(refresh, 500); }
}
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
  if (file) {
    try {
      $('setup').value = await file.text(); clearTrace('Starting tapes changed. Load a new trace.');
      $('run').disabled = !machine;
    }
    catch (error) { $('execution').textContent = error.message; }
  }
};
for (const id of ['setup', 'max-steps']) $(id).oninput = () => {
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
