import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assignGroup, renameInGroups, writeGroup} from '../src/lib/groups';

const groups = {Read: ['scan', 'step'], Halt: ['accept', 'reject']};

test('assigning a state keeps group order and drops an empty group', () => {
  assert.equal(assignGroup(groups, 'scan', 'Read'), groups);
  assert.deepEqual(assignGroup(groups, 'step', 'Halt'), {Read: ['scan'], Halt: ['accept', 'reject', 'step']});
  assert.deepEqual(assignGroup(groups, 'scan', ''), {Read: ['step'], Halt: ['accept', 'reject']});
  assert.deepEqual(assignGroup({Only: ['scan']}, 'scan', ''), {});
  assert.deepEqual(Object.keys(assignGroup(groups, 'scan', 'Extra')), ['Read', 'Halt', 'Extra']);
});

test('renaming a state updates every group before the new assignment', () => {
  const renamed = renameInGroups(groups, 'scan', 'look');
  assert.deepEqual(assignGroup(renamed, 'look', 'Read'), {Read: ['look', 'step'], Halt: ['accept', 'reject']});
  assert.deepEqual(renameInGroups(groups, undefined, 'look'), groups);
});

test('writing a group moves members and can rename in place', () => {
  assert.deepEqual(writeGroup(groups, 'Read', 'Scan', ['scan', 'accept']), {
    Scan: ['scan', 'accept'], Halt: ['reject'],
  });
  assert.deepEqual(writeGroup(groups, undefined, 'Extra', ['step']), {
    Read: ['scan'], Halt: ['accept', 'reject'], Extra: ['step'],
  });
});
