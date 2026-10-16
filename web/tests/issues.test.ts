import assert from 'node:assert/strict';
import {test} from 'node:test';
import {formatDiagnostics, issueKind} from '../src/lib/issues';

test('missing files and definition messages stay machine issues', () => {
  assert.equal(issueKind("[Errno 2] No such file or directory: 'machines/protocol_phases.yaml'"), 'machine');
  assert.equal(issueKind('Machine file does not exist: /tmp/missing.yaml'), 'machine');
  assert.equal(issueKind('That filename already exists. Choose another filename.'), 'machine');
  assert.equal(issueKind('Unknown state \'typo\''), 'machine');
});

test('connection and request failures are workspace issues', () => {
  assert.equal(issueKind('Request failed (500). Is the Python API running?'), 'system');
  assert.equal(issueKind('Failed to fetch'), 'system');
  assert.equal(issueKind('Simulation worker failed. Please try again.'), 'system');
  assert.equal(issueKind('Invalid host or origin'), 'system');
});

test('diagnostics keep line and column', () => {
  assert.equal(formatDiagnostics([
    {line: 4, column: 3, message: 'Unknown state'},
    {line: 9, column: 1, message: 'Field required'},
  ]), 'Line 4:3 · Unknown state\nLine 9:1 · Field required');
});
