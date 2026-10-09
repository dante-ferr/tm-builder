import {instance} from '@viz-js/viz';
const $ = id => document.getElementById(id);
const renderer = instance();
let revision = null, svg = null, filename = 'machine', scale = 1;
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
    fit();
  } catch (error) {
    $('status').textContent = error.message;
    $('download').disabled = true;
    revision = null;
  } finally { setTimeout(refresh, 500); }
}
$('fit').onclick = fit;
$('zoom-in').onclick = () => zoom(1.25);
$('zoom-out').onclick = () => zoom(.8);
$('download').onclick = () => {
  if (!svg || $('download').disabled) return;
  const copy = svg.cloneNode(true); copy.removeAttribute('style');
  const text = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(new Blob([text], {type: 'image/svg+xml'}));
  const link = document.createElement('a'); link.href = url; link.download = `${filename}.svg`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('resize', fit);
refresh();
