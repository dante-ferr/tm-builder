const vscode = require('vscode');
const {spawn} = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('tm-builder');
  const output = vscode.window.createOutputChannel('tm-builder');
  const jobs = new Map(), timers = new Map(), completions = new Map();
  const previewBuffers = new Map();
  const scope = document => document.uri.scheme === 'file' &&
    /\.(yaml|yml)$/i.test(document.fileName) &&
    document.fileName.split(path.sep).includes('machines') &&
    vscode.workspace.getWorkspaceFolder(document.uri);
  const config = uri => vscode.workspace.getConfiguration('tm-builder', uri);
  function projectRoot(document) {
    const configured = config(document.uri).get('projectPath');
    if (configured) return path.resolve(configured);
    const roots = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
    const matching = roots.find(root => fs.existsSync(path.join(root, 'python', '.venv')));
    if (matching) return matching;
    const extensionProject = path.resolve(context.extensionPath, '..', '..');
    if (fs.existsSync(path.join(extensionProject, 'python', '.venv'))) return extensionProject;
    return roots[0] || path.dirname(document.fileName);
  }
  function interpreter(document) {
    const root = projectRoot(document);
    const configured = config(document.uri).get('pythonPath');
    return configured ? (path.isAbsolute(configured) ? configured : path.join(root, configured)) :
      path.join(root, 'python', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  }
  function preview(document) {
    if (document.isClosed || !scope(document)) return;
    const body = JSON.stringify({path: document.fileName, source: document.getText()});
    const request = http.request({hostname: '127.0.0.1', port: config(document.uri).get('previewPort', 8765),
      path: '/api/buffer', method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)}},
      response => response.resume());
    request.on('error', () => {}); // Viewer is optional and may not be running.
    request.setTimeout(750, () => request.destroy());
    request.end(body);
  }
  function schedule(document) {
    if (!scope(document)) return;
    const key = document.uri.toString();
    previewBuffers.set(key, document);
    clearTimeout(timers.get(key));
    const pending = jobs.get(key);
    jobs.delete(key); // A cancelled job must not overwrite current diagnostics.
    pending?.kill();
    timers.set(key, setTimeout(() => validate(document), 250));
  }
  function validate(document) {
    if (document.isClosed) return;
    const key = document.uri.toString(), version = document.version;
    preview(document);
    const root = vscode.workspace.getWorkspaceFolder(document.uri).uri.fsPath;
    const python = interpreter(document);
    const child = spawn(python, ['-m', 'tm_builder.ide'], {cwd: root, stdio: ['pipe', 'pipe', 'pipe']});
    jobs.set(key, child);
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.stdin.on('error', () => {});
    let timedOut = false;
    const watchdog = setTimeout(() => { timedOut = true; child.kill(); }, 10000);
    child.on('error', error => {
      output.appendLine(`Cannot start validator: ${error.message}. Run make setup in the workspace root.`);
      if (!document.isClosed && document.version === version) {
        const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1),
          'tm-builder validator unavailable. Run make setup; see the tm-builder output channel.', vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'tm-builder'; diagnostics.set(document.uri, [diagnostic]);
      }
    });
    child.on('close', code => {
      clearTimeout(watchdog);
      if (jobs.get(key) !== child) return;
      jobs.delete(key);
      if (document.isClosed || document.version !== version) return;
      try {
        if (code !== 0) throw new Error(timedOut ? 'Validator timed out after 10 seconds.' :
          stderr || stdout || `Validator exited with ${code}`);
        const result = JSON.parse(stdout);
        if (result.error || !Array.isArray(result.diagnostics)) {
          throw new Error(result.error || 'Validator returned an invalid response.');
        }
        completions.set(key, result.suggestions);
        diagnostics.set(document.uri, result.diagnostics.map(item => {
          const line = document.lineAt(Math.min(document.lineCount - 1, Math.max(0, item.line - 1)));
          // Python columns count Unicode code points; VS Code uses UTF-16 offsets.
          const start = [...line.text].slice(0, Math.max(0, item.column - 1)).join('').length;
          const range = new vscode.Range(line.lineNumber, start, line.lineNumber, Math.min(line.text.length, start + 1));
          const diagnostic = new vscode.Diagnostic(range, item.message,
            item.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);
          diagnostic.source = 'tm-builder'; return diagnostic;
        }));
      } catch (error) {
        output.appendLine(`Validation failed (${python}): ${error.message}`);
        const detail = error.message.trim().split('\n').at(-1);
        const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1),
          `tm-builder validation failed: ${detail}. Interpreter: ${python}. See the tm-builder output channel.`, vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'tm-builder'; diagnostics.set(document.uri, [diagnostic]);
      }
    });
    child.stdin.end(JSON.stringify({source: document.getText()}));
  }
  context.subscriptions.push(diagnostics, output,
    vscode.workspace.onDidOpenTextDocument(schedule),
    vscode.workspace.onDidChangeTextDocument(event => schedule(event.document)),
    vscode.workspace.onDidCloseTextDocument(document => {
      const key = document.uri.toString();
      clearTimeout(timers.get(key)); timers.delete(key); jobs.get(key)?.kill(); jobs.delete(key);
      previewBuffers.delete(key); completions.delete(key); diagnostics.delete(document.uri);
    }),
    vscode.languages.registerCompletionItemProvider([{scheme: 'file', language: 'yaml'}, {scheme: 'file', language: 'plaintext'}], {
      provideCompletionItems(document, position) {
        if (!scope(document)) return [];
        const values = completions.get(document.uri.toString()); if (!values) return [];
        const prefix = document.lineAt(position.line).text.slice(0, position.character);
        const key = [...prefix.matchAll(/\b(from|to|read|write|move|tapes|model|start|accept|reject)\s*:/g)].at(-1)?.[1];
        const action = prefix.slice(prefix.lastIndexOf('[') + 1);
        const options = key === 'move' || (key === 'tapes' && (action.match(/,/g) || []).length >= 2)
          ? values.moves : ['read', 'write', 'tapes'].includes(key) ? values.symbols : values.states;
        const items = key === 'model' ? values.models : options;
        const token = prefix.match(/(?:^|[\s,[{:])((?:"[^"\n]*|'[^'\n]*|[A-Za-z0-9_-]+))$/)?.[1] || '';
        const closingQuote = ['"', "'"].includes(token[0]) && document.lineAt(position.line).text[position.character] === token[0];
        return items.map(value => {
          const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
          item.insertText = JSON.stringify(value);
          item.range = new vscode.Range(position.line, position.character - token.length,
            position.line, position.character + (closingQuote ? 1 : 0));
          return item;
        });
      }
    }),
    vscode.commands.registerCommand('tm-builder.preview', () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document || !scope(document)) return vscode.window.showInformationMessage('Open a machine YAML file under machines/.');
      const terminal = vscode.window.createTerminal('tm-builder diagram');
      const quote = value => process.platform === 'win32' ? `"${value.replaceAll('"', '\\"')}"` : `'${value.replaceAll("'", "'\\''")}'`;
      terminal.sendText(`${quote(interpreter(document))} -m tm_builder.cli design ${quote(document.fileName)} --port ${config(document.uri).get('previewPort', 8765)}`);
      terminal.show();
    }),
    {dispose() { for (const timer of timers.values()) clearTimeout(timer); for (const job of jobs.values()) job.kill(); }}
  );
  const heartbeat = setInterval(() => { for (const document of previewBuffers.values()) preview(document); }, 1000);
  context.subscriptions.push({dispose: () => clearInterval(heartbeat)});
  for (const document of vscode.workspace.textDocuments) schedule(document);
}
module.exports = {activate};
