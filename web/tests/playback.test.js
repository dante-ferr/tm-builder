import assert from 'node:assert/strict';
import {test} from 'node:test';
import {advancePlayback, finishPlayback, initialPlayback} from '../src/lib/playback.ts';

const trace = {
  status: 'ACCEPT',
  frames: Array.from({length: 8191}, (_, step) => ({
    step, state: step === 8190 ? 'accept' : step % 2 ? 'increment' : 'scan',
    tapes: [], ...(step ? {transition: {index: step % 3}} : {}),
  })),
};
function animatedToStop(cursor, state = '', rule = '') {
  do {cursor = advancePlayback(cursor, trace, state, rule);} while (cursor.playing);
  return cursor;
}

test('instant playback retains every frame for arbitrary backward and forward seeking', () => {
  const original = structuredClone(trace);
  const end = finishPlayback({...initialPlayback, playing: true}, trace, '', '');
  assert.deepEqual(end, {position: 8190, phase: 0, playing: false, breakpoint: false});
  for (const position of [8000, 1, 4096, 0, 8189]) {
    assert.equal(trace.frames[position].step, position);
    assert.equal(finishPlayback({...initialPlayback, position}, trace, '', '').position, 8190);
  }
  assert.deepEqual(trace, original);
});

test('instant playback matches animated state and rule breakpoints from every phase', () => {
  for (const [state, rule] of [['increment', ''], ['', '2'], ['accept', ''], ['missing', ''], ['', 'nonsense']]) {
    for (const phase of [0, 1, 2, 3]) {
      const cursor = {...initialPlayback, position: 4000, phase, playing: true};
      assert.deepEqual(finishPlayback(cursor, trace, state, rule), animatedToStop(cursor, state, rule));
    }
  }
});

test('instant playback handles terminal and single-frame traces', () => {
  assert.equal(finishPlayback({...initialPlayback, position: 8190}, trace, '', '').position, 8190);
  assert.deepEqual(finishPlayback(initialPlayback, {...trace, frames: trace.frames.slice(0, 1)}, '', ''), initialPlayback);
});
