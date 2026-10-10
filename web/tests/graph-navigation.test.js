import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mountGraphNavigation} from '../src/graph-navigation.js';

class Graph extends EventTarget {
  clientWidth = 800;
  clientHeight = 400;
  captured = new Set();
  classes = new Set();
  classList = {add: value => this.classes.add(value), remove: value => this.classes.delete(value)};
  getBoundingClientRect() { return {left: 100, top: 50}; }
  focus() { this.focused = true; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}
function emit(target, type, fields) {
  const event = Object.assign(new Event(type, {cancelable: true}), fields);
  target.dispatchEvent(event);
  return event;
}
function fixture(t) {
  globalThis.window = new EventTarget();
  const graph = new Graph();
  const lifetime = new AbortController();
  const svg = {style: {}, viewBox: {baseVal: {width: 200, height: 100}}};
  const navigation = mountGraphNavigation(graph, lifetime.signal);
  navigation.setDiagram(svg);
  const view = () => {
    const [x, y, scale] = svg.style.transform.match(/-?\d+(?:\.\d+)?/g).map(Number);
    return {x, y, scale};
  };
  t.after(() => { navigation.stopPan(); lifetime.abort(); });
  return {graph, lifetime, svg, navigation, view};
}

test('wheel zoom preserves the diagram point under the pointer', t => {
  const {graph, view} = fixture(t);
  const before = view();
  const point = {x: (350 - before.x) / before.scale, y: (180 - before.y) / before.scale};
  const event = emit(graph, 'wheel', {deltaY: -150, deltaMode: 0, clientX: 450, clientY: 230});
  const after = view();
  assert.ok(after.scale > before.scale);
  assert.ok(Math.abs(after.x + point.x * after.scale - 350) < 1e-9);
  assert.ok(Math.abs(after.y + point.y * after.scale - 180) < 1e-9);
  assert.ok(event.defaultPrevented);
});

test('middle drag pans a fitted diagram freely and stops on release', t => {
  const {graph, view} = fixture(t);
  const before = view();
  assert.ok(200 * before.scale < graph.clientWidth);
  const down = emit(graph, 'pointerdown', {button: 1, pointerId: 7, clientX: 400, clientY: 200});
  assert.ok(down.defaultPrevented);
  assert.ok(graph.focused);
  assert.ok(graph.hasPointerCapture(7));
  emit(graph, 'pointermove', {buttons: 4, pointerId: 7, clientX: 520, clientY: 270});
  assert.deepEqual(view(), {...before, x: before.x + 120, y: before.y + 70});
  emit(graph, 'pointerup', {button: 1, pointerId: 7});
  assert.ok(!graph.hasPointerCapture(7));
  assert.ok(!graph.classes.has('panning'));
  emit(graph, 'pointermove', {buttons: 0, pointerId: 7, clientX: 600, clientY: 300});
  assert.deepEqual(view(), {...before, x: before.x + 120, y: before.y + 70});
});

test('left and right buttons do not start dragging', t => {
  const {graph, view} = fixture(t);
  const before = view();
  for (const button of [0, 2]) {
    const event = emit(graph, 'pointerdown', {button, pointerId: 7, clientX: 400, clientY: 200});
    emit(graph, 'pointermove', {buttons: button === 0 ? 1 : 2, pointerId: 7, clientX: 520, clientY: 270});
    assert.deepEqual(view(), before);
    assert.ok(!event.defaultPrevented);
  }
});

test('WASD and arrows pan even without scroll overflow', t => {
  const {graph, view} = fixture(t);
  const before = view();
  for (const key of ['ArrowRight', 'd', 'ArrowDown', 's'])
    assert.ok(emit(graph, 'keydown', {key}).defaultPrevented);
  assert.deepEqual(view(), {...before, x: before.x - 80, y: before.y - 80});
  for (const key of ['ArrowLeft', 'a', 'ArrowUp', 'w']) emit(graph, 'keydown', {key});
  assert.deepEqual(view(), before);
  emit(graph, 'keydown', {key: 'a', ctrlKey: true});
  assert.deepEqual(view(), before);
});

test('Fit recenters after panning and zoom stays within its limits', t => {
  const {graph, navigation, view} = fixture(t);
  const before = view();
  emit(graph, 'keydown', {key: 's'});
  navigation.zoom(1000);
  assert.equal(view().scale, 20);
  navigation.zoom(.0000001);
  assert.equal(view().scale, .02);
  navigation.fit();
  assert.deepEqual(view(), before);
});

test('cancel and disposal remove drag state and event handlers', t => {
  const {graph, navigation, lifetime, view} = fixture(t);
  emit(graph, 'pointerdown', {button: 1, pointerId: 7, clientX: 400, clientY: 200});
  emit(graph, 'pointercancel', {pointerId: 7});
  assert.ok(!graph.hasPointerCapture(7));
  emit(graph, 'pointerdown', {button: 1, pointerId: 7, clientX: 400, clientY: 200});
  navigation.stopPan();
  lifetime.abort();
  const before = view();
  emit(graph, 'keydown', {key: 'd'});
  emit(graph, 'wheel', {deltaY: -150, deltaMode: 0, clientX: 450, clientY: 230});
  emit(graph, 'pointermove', {buttons: 4, pointerId: 7, clientX: 520, clientY: 270});
  assert.deepEqual(view(), before);
  assert.ok(!graph.classes.has('panning'));
});
