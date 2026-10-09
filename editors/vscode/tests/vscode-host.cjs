// Run in an isolated VS Code Extension Development Host.
const vscode = require('vscode');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
exports.run = async () => {
  const report = process.env.TEOCOMP_TEST_REPORT;
  try {
    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'python/tests/fixtures/machines/copy.yaml')));
    await vscode.window.showTextDocument(document);
    const extension = vscode.extensions.getExtension('teocomp-local.teocomp-machines');
    assert.ok(extension, 'Development extension is registered');
    await extension.activate();
    const original = document.getText();
    const replace = async text => {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
      assert.equal(await vscode.workspace.applyEdit(edit), true);
    };
    const waitFor = async predicate => {
      for (let i = 0; i < 40; i++) {
        const issues = vscode.languages.getDiagnostics(document.uri).filter(d => d.source === 'teocomp');
        if (predicate(issues)) return issues;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      throw new Error('Timed out waiting for live VS Code diagnostics');
    };
    try {
      await replace(original.replace('to: accept', 'to: typo'));
      const stateErrors = await waitFor(items => items.some(d => d.message.includes("Unknown state 'typo'")));
      assert.ok(stateErrors.some(d => d.range.start.line === 17), 'Diagnostics point at the unsaved rule');
      assert.equal(document.isDirty, true, 'Validation runs before saving');
      await replace(original.replace('move: [R, R]', 'move: [UP, R]'));
      await waitFor(items => items.some(d => d.message.includes("'L', 'R' or 'S'")));
      await replace(original);
      await waitFor(items => items.length === 0);
      assert.equal(document.getText(), original);
      const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',
        document.uri, document.positionAt(original.indexOf('read: [a') + 7));
      assert.ok(completion.items.some(item => item.label === 'a' && item.insertText === '"a"'),
        'Symbol suggestions insert YAML-safe quoted strings');
    } finally { if (document.getText() !== original) await replace(original); }
    if (report) fs.writeFileSync(report, 'PASS: unsaved semantic errors, move types, locations, and clearing diagnostics\n');
  } catch (error) {
    if (report) fs.writeFileSync(report, `FAIL: ${error.stack}\n`);
    throw error;
  }
};
