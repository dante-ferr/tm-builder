import assert from 'node:assert/strict';
import {test} from 'node:test';
import {alphabetIssue} from '../src/lib/alphabet';

test('alphabets accept empty input sets and single Unicode symbols without coercion', () => {
  assert.equal(alphabetIssue([], 'Input alphabet'), '');
  assert.equal(alphabetIssue(['0', '1', ' ', '😀', '"', ':'], 'Input alphabet'), '');
});
test('alphabets reject duplicate symbols and incomplete or multi-character rows', () => {
  assert.match(alphabetIssue(['a', 'a'], 'Input alphabet'), /unique/);
  assert.match(alphabetIssue([''], 'Input alphabet'), /one character/);
  assert.match(alphabetIssue(['ab'], 'Input alphabet'), /one character/);
});
