import assert from 'node:assert/strict';
import {test} from 'node:test';
import {advancePlayback, initialPlayback} from '../src/lib/playback';
import type {Trace} from '../src/lib/types';

const trace: Trace = {
  revision: 'test', model: 'deterministic', status: 'ACCEPT', reason: 'Accepted',
  frames: [
    {state: 'start', step: 0, tapes: []},
    {state: 'copy', step: 1, tapes: [], transition: {index: 0, source: 'start', to: 'copy', tapes: []}},
    {state: 'accept', step: 2, tapes: [], transition: {index: 1, source: 'copy', to: 'accept', tapes: []}},
  ],
};
test('animated playback completes read, write, and move before advancing the frame', () => {
  let cursor = {...initialPlayback, playing: true};
  for (const phase of [1, 2, 3]) {
    cursor = advancePlayback(cursor, trace, '', '');
    assert.equal(cursor.phase, phase);
    assert.equal(cursor.position, 0);
    assert.equal(cursor.playing, true);
  }
  assert.deepEqual(advancePlayback(cursor, trace, '', ''), {position: 1, phase: 0, playing: true, breakpoint: false});
});
test('state and upcoming-rule breakpoints pause at a complete configuration', () => {
  for (const [state, rule] of [['copy', ''], ['', '2']]) {
    assert.deepEqual(advancePlayback({position: 0, phase: 3, playing: true, breakpoint: false}, trace, state, rule),
      {position: 1, phase: 0, playing: false, breakpoint: true});
  }
});
test('reaching the final frame stops playback without advancing beyond the trace', () => {
  const end = advancePlayback({position: 1, phase: 3, playing: true, breakpoint: false}, trace, '', '');
  assert.deepEqual(end, {position: 2, phase: 0, playing: false, breakpoint: false});
  assert.deepEqual(advancePlayback(end, trace, '', ''), end);
});
