import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FOLLOW_ZOOM, mountGraphNavigation} from '../src/graph-navigation.ts';

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
function point(x = 0, y = 0) {
  return {x, y, matrixTransform(matrix) { return point(this.x + matrix.x, this.y + matrix.y); }};
}
function state(x, y) {
  return {getBBox: () => ({x, y, width: 40, height: 20}), getCTM: () => ({x: 4, y: 112})};
}
function fixture(t, onFollowStop) {
  globalThis.window = new EventTarget();
  const graph = new Graph();
  const lifetime = new AbortController();
  const svg = {style: {}, viewBox: {baseVal: {x: 0, y: 0, width: 200, height: 100}},
    createSVGPoint: () => point(), getCTM: () => ({inverse: () => ({x: 0, y: 0})})};
  const navigation = mountGraphNavigation(graph, lifetime.signal, onFollowStop);
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
  emit(graph, 'pointermove', {buttons: 4, pointerId: 7, clientX: 400, clientY: 200});
  assert.deepEqual(view(), before);
  emit(graph, 'pointermove', {buttons: 4, pointerId: 7, clientX: 520, clientY: 270});
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

test('following centers translated states at a fixed initial zoom and preserves user zoom', t => {
  const {graph, navigation, view} = fixture(t);
  navigation.startFollowing(state(10, -80));
  assert.deepEqual(view(), {x: 400 - 34 * FOLLOW_ZOOM, y: 200 - 42 * FOLLOW_ZOOM, scale: FOLLOW_ZOOM});
  navigation.zoom(1.25);
  emit(graph, 'wheel', {deltaY: -150, deltaMode: 0, clientX: 450, clientY: 230});
  const scale = view().scale;
  navigation.follow(state(100, -20));
  assert.deepEqual(view(), {x: 400 - 124 * scale, y: 200 - 102 * scale, scale});
  graph.clientWidth = 1000;
  navigation.resize();
  assert.deepEqual(view(), {x: 500 - 124 * scale, y: 200 - 102 * scale, scale});
});

test('only actual camera panning or Fit cancels following', t => {
  let stops = 0;
  const {graph, navigation, view} = fixture(t, () => stops++);
  navigation.startFollowing(state(10, -80));
  emit(graph, 'pointerdown', {button: 1, pointerId: 7, clientX: 400, clientY: 200});
  emit(graph, 'pointermove', {buttons: 4, pointerId: 7, clientX: 400, clientY: 200});
  emit(graph, 'pointerup', {pointerId: 7});
  emit(window, 'blur', {});
  assert.equal(stops, 0);
  navigation.follow(state(100, -20));
  const following = view();
  emit(graph, 'pointerdown', {button: 1, pointerId: 7, clientX: 400, clientY: 200});
  emit(graph, 'pointermove', {buttons: 4, pointerId: 7, clientX: 450, clientY: 240});
  const panned = view();
  assert.deepEqual(panned, {...following, x: following.x + 50, y: following.y + 40});
  navigation.follow(state(10, -80));
  assert.deepEqual(view(), panned);
  assert.equal(stops, 1);
  navigation.startFollowing(state(10, -80));
  emit(graph, 'keydown', {key: 'd'});
  const keyboardView = view();
  navigation.follow(state(100, -20));
  assert.deepEqual(view(), keyboardView);
  assert.equal(stops, 2);
  navigation.startFollowing(state(10, -80));
  navigation.fit();
  assert.equal(stops, 3);
});

test('playback stop and diagram replacement discard the followed state', t => {
  const {navigation, svg, view} = fixture(t);
  navigation.startFollowing(state(10, -80));
  navigation.stopFollowing();
  const stopped = view();
  navigation.follow(state(100, -20));
  assert.deepEqual(view(), stopped);
  navigation.zoom(.8);
  navigation.startFollowing(state(100, -20));
  assert.equal(view().scale, FOLLOW_ZOOM);
  navigation.setDiagram(svg);
  const replaced = view();
  navigation.follow(state(10, -80));
  assert.deepEqual(view(), replaced);
});


test('typing and arrow keys inside an inline graph editor do not move the camera', t => {
  const {graph, view} = fixture(t);
  const input = new EventTarget();
  input.closest = selector => selector.includes('input') ? input : null;
  const before = view();
  const event = new Event('keydown', {cancelable: true});
  Object.defineProperty(event, 'target', {value: input});
  Object.assign(event, {key: 'ArrowLeft'});
  graph.dispatchEvent(event);
  assert.deepEqual(view(), before);
  assert.equal(event.defaultPrevented, false);
});

test('selecting a graph item pans without changing the current zoom', t => {
  const {navigation, view} = fixture(t);
  navigation.zoom(.63);
  const scale = view().scale;
  navigation.reveal(120, 60);
  assert.deepEqual(view(), {x: 400 - 120 * scale, y: 200 - 60 * scale, scale});
});

test('editor spacing stays in website pixels at every graph zoom', t => {
  const {navigation, view} = fixture(t);
  for (const factor of [.1, 20, .5]) {
    navigation.zoom(factor);
    const scale = view().scale;
    navigation.reveal(120, 60, {offsetY: -127});
    const anchor = navigation.project(120, 60);
    assert.equal(view().scale, scale);
    assert.equal(anchor.x, 400);
    assert.equal(anchor.y - 127, 200);
  }
});

test('viewport resizing preserves manual zoom and pan', t => {
  const {graph, navigation, view} = fixture(t);
  navigation.zoom(.4);
  emit(graph, 'keydown', {key: 'd'});
  const before = view();
  graph.clientWidth = 1200; graph.clientHeight = 180;
  navigation.resize();
  assert.deepEqual(view(), before);
});

test('diagram redraws preserve the camera while a new machine can explicitly fit', t => {
  const {navigation, svg, view} = fixture(t);
  navigation.zoom(.4);
  const before = view();
  const replacement = {...svg, style: {}, viewBox: {baseVal: {x: 0, y: 0, width: 900, height: 800}}};
  navigation.setDiagram(replacement, {fit: false});
  assert.equal(replacement.style.transform, svg.style.transform);
  navigation.setDiagram(replacement, {fit: true});
  const numbers = replacement.style.transform.match(/-?\d+(?:\.\d+)?/g).map(Number);
  assert.notEqual(numbers[2], before.scale);
  assert.equal(numbers[2], 340 / 800);
});
