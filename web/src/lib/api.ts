import type {Diagram, ExecutionLimits, ExportOptions, Library, MachineDefinition, MachineSource, Trace} from './types';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
async function checked(response: Response): Promise<Response> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Request failed (${response.status}). Is the Python API running?`);
  }
  return response;
}
async function json<T>(path: string, signal: AbortSignal, data?: unknown): Promise<T> {
  const response = await checked(await fetch(`/api/${path}`, {
    signal,
    ...(data === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)}),
  }));
  return response.json() as Promise<T>;
}
export const api = {
  limits: (signal: AbortSignal) => json<ExecutionLimits>('limits', signal),
  diagram: (signal: AbortSignal) => json<Diagram>('diagram', signal),
  edit: (revision: string, changes: Partial<MachineDefinition>, signal: AbortSignal) => json<Diagram>('edit', signal, {revision, changes}),
  library: (signal: AbortSignal) => json<Library>('library', signal),
  selectMachine: (source: MachineSource, signal: AbortSignal) => json<Diagram>('machine', signal, source),
  input: (filename: string, signal: AbortSignal) => json<{source: string}>(`input?filename=${encodeURIComponent(filename)}`, signal),
  simulate: (revision: string, setup: string, max_steps: number, signal: AbortSignal) => new Promise<Trace>((resolve, reject) => {
    if (signal.aborted) {reject(new DOMException('Aborted', 'AbortError')); return;}
    const worker = new Worker(new URL('../workers/simulate.ts', import.meta.url));
    const dispose = () => {worker.terminate(); signal.removeEventListener('abort', abort);};
    const abort = () => {dispose(); reject(new DOMException('Aborted', 'AbortError'));};
    signal.addEventListener('abort', abort, {once: true});
    worker.onmessage = event => {
      dispose();
      if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.trace);
    };
    worker.onerror = () => {dispose(); reject(new Error('Simulation worker failed. Please try again.'));};
    worker.postMessage({revision, setup, max_steps});
  }),
  async export(options: ExportOptions & (MachineSource | {revision: string}), signal: AbortSignal) {
    const response = await checked(await fetch('/api/export', {
      method: 'POST', signal, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(options),
    }));
    return {blob: await response.blob(), filename: response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'table'};
  },
};
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
