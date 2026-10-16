export type IssueKind = 'machine' | 'system';

const systemMessage = /Request failed \(\d+\)|Is the Python API running|Simulation worker failed|Invalid host or origin|Failed to fetch|NetworkError|Load failed|ECONNREFUSED|fetch failed/i;

/** Classify a failure. Machine issues are definition, file, and input problems a person can correct. */
export function issueKind(message: string): IssueKind {
  return systemMessage.test(message) ? 'system' : 'machine';
}

export function formatDiagnostics(diagnostics: {line: number; column: number; message: string}[]): string {
  return diagnostics.map(diagnostic => `Line ${diagnostic.line}:${diagnostic.column} · ${diagnostic.message}`).join('\n');
}
