import assert from 'node:assert/strict';
import {test} from 'node:test';
import {frameAt, frameCount, indexTrace} from '../src/lib/timeline';
import {advancePlayback, finishPlayback, initialPlayback} from '../src/lib/playback';
import type {Trace} from '../src/lib/types';

test('compact history preserves negative addresses, erasure, untouched cells, and arbitrary seeking', () => {
  const trace = indexTrace({
    revision: 'test', model: 'deterministic', status: 'ACCEPT', reason: '', frames: [],
    recording: {
      blank: '_', start: 'start', initial: [{head: 0, cells: [[0, 'a'], [3, 'b']]}],
      rules: [
        {index: 0, source: 'start', to: 'left', tapes: [['a', 'x', 'L']]},
        {index: 1, source: 'left', to: 'erase', tapes: [['_', 'y', 'R']]},
        {index: 2, source: 'erase', to: 'write', tapes: [['x', '_', 'R']]},
        {index: 3, source: 'write', to: 'accept', tapes: [['_', 'z', 'S']]},
      ], steps: [0, 1, 2, 3],
    },
  });
  const symbol = (step: number, address: number) => {
    const tape = frameAt(trace, step)!.tapes[0]; return tape.cells[address - tape.left];
  };
  assert.equal(frameCount(trace), 5);
  for (const step of [4, 0, 3, 1, 2, 4]) {
    const frame = frameAt(trace, step)!;
    assert.equal(frame.step, step);
    assert.equal(frame.tapes[0].head, [0, -1, 0, 1, 1][step]);
    assert.equal(symbol(step, 3), 'b');
    assert.equal(symbol(step, 0), ['a', 'x', 'x', '_', '_'][step]);
    assert.equal(symbol(step, -1), step >= 2 ? 'y' : '_');
    assert.equal(symbol(step, 1), step === 4 ? 'z' : '_');
  }
  assert.equal(frameAt(trace, -1), undefined);
  assert.equal(frameAt(trace, 5), undefined);
  assert.equal(finishPlayback(initialPlayback, trace, 'erase', '').position, 2);
  assert.equal(finishPlayback(initialPlayback, trace, '', '3').position, 2);
  assert.equal(advancePlayback({...initialPlayback, phase: 3}, trace, 'left', '').breakpoint, true);
});

test('a million steps remain seekable without a million frame objects', () => {
  const trace: Trace = indexTrace({
    revision: 'million', model: 'deterministic', status: 'RUNNING', reason: 'Limit reached', frames: [],
    recording: {
      blank: '_', start: 'even', initial: [{head: -3, cells: []}],
      rules: [
        {index: 0, source: 'even', to: 'odd', tapes: [['_', '1', 'S']]},
        {index: 1, source: 'odd', to: 'even', tapes: [['1', '_', 'S']]},
      ], steps: Array.from({length: 1_000_000}, (_, step) => step % 2),
    },
  });
  assert.equal(trace.frames.length, 0);
  assert.equal(frameCount(trace), 1_000_001);
  for (const step of [1_000_000, 1, 500_001, 0, 999_999, 42]) {
    const frame = frameAt(trace, step)!;
    assert.equal(frame.step, step);
    assert.equal(frame.state, step % 2 ? 'odd' : 'even');
    assert.equal(frame.tapes[0].cells[8], step % 2 ? '1' : '_');
  }
  assert.equal(finishPlayback(initialPlayback, trace, '', '').position, 1_000_000);
  assert.equal(finishPlayback(initialPlayback, trace, 'odd', '').position, 1);
});

test('blank scans do not allocate a cell history per visited address', () => {
  const trace = indexTrace({
    revision: 'scan', model: 'deterministic', status: 'RUNNING', reason: '', frames: [],
    recording: {blank: '_', start: 'scan', initial: [{head: 5_000_000_000, cells: []}],
      rules: [{index: 0, source: 'scan', to: 'scan', tapes: [['_', '_', 'R']]}], steps: Array(10000).fill(0)},
  });
  assert.equal(trace.timeline!.cells[0].size, 0);
  assert.equal(frameAt(trace, 10000)!.tapes[0].head, 5_000_010_000);
});
