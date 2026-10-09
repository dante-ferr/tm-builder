// Exercise validator lifecycle without opening an editor or spawning Python.
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const Module = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const children = [], messages = [], diagnostics = [], timers = new Map();
let changed, timerId = 0;
const document = {
  uri: {scheme: 'file', toString: () => 'file://machine'},
  fileName: path.join(root, 'machines/copy.yaml'),
  isClosed: false, version: 1, lineCount: 1,
  getText: () => 'transitions: []',
  lineAt: () => ({lineNumber: 0, text: 'transitions: []'}),
};
const disposable = {dispose() {}};
const vscode = {
  languages: {
    createDiagnosticCollection: () => ({set: (_, items) => diagnostics.push(items), delete() {}, dispose() {}}),
    registerCompletionItemProvider: () => disposable,
  },
  window: {createOutputChannel: () => ({appendLine: text => messages.push(text), dispose() {}})},
  workspace: {
    textDocuments: [document], getWorkspaceFolder: () => ({uri: {fsPath: root}}),
    getConfiguration: () => ({get: (_, fallback) => fallback}),
    onDidOpenTextDocument: () => disposable,
    onDidChangeTextDocument: callback => { changed = callback; return disposable; },
    onDidCloseTextDocument: () => disposable,
  },
  commands: {registerCommand: () => disposable},
  Range: class {},
  Diagnostic: class { constructor(range, message) { this.range = range; this.message = message; } },
  DiagnosticSeverity: {Error: 0, Warning: 1},
};
const childProcess = {spawn(python) {
  const child = new EventEmitter();
  child.python = python;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.end = () => {};
  child.kill = () => { child.killed = true; };
  children.push(child);
  return child;
}};
const http = {request: () => ({on() {}, setTimeout() {}, end() {}})};
const savedLoad = Module._load;
const savedTimers = {setTimeout, clearTimeout, setInterval};
try {
  Module._load = function(name, ...args) {
    return name === 'vscode' ? vscode : name === 'node:child_process' ? childProcess :
      name === 'node:http' ? http : savedLoad.call(this, name, ...args);
  };
  global.setTimeout = (callback, delay) => { timers.set(++timerId, {callback, delay}); return timerId; };
  global.clearTimeout = id => timers.delete(id);
  global.setInterval = () => 0;
  const fire = delay => {
    const entry = [...timers].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `A ${delay}ms timer is scheduled`);
    timers.delete(entry[0]); entry[1].callback();
  };
  require('../extension.cjs').activate({subscriptions: []});
  fire(250);
  assert.equal(children[0].python, path.join(root, 'python/.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'));
  changed({document});
  assert.equal(children[0].killed, true);
  children[0].emit('close', null);
  assert.deepEqual(messages, [], 'Cancelled jobs do not report a validation failure');
  assert.deepEqual(diagnostics, [], 'Cancelled jobs do not overwrite diagnostics');
  fire(250);
  children[1].stdout.emit('data', JSON.stringify({diagnostics: [], suggestions: {states: []}}));
  children[1].emit('close', 0);
  assert.deepEqual(diagnostics.at(-1), []);

  changed({document}); fire(250);
  children[2].stderr.emit('data', "ModuleNotFoundError: No module named 'teocomp'");
  children[2].emit('close', 1);
  assert.match(diagnostics.at(-1)[0].message, /ModuleNotFoundError/);
  assert.ok(diagnostics.at(-1)[0].message.includes(children[2].python));

  changed({document}); fire(250); fire(10000);
  children[3].emit('close', null);
  assert.match(diagnostics.at(-1)[0].message, /timed out/);
  console.log('PASS: interpreter path, cancellation, successful validation, errors, and timeout');
} finally {
  Module._load = savedLoad;
  Object.assign(global, savedTimers);
}
