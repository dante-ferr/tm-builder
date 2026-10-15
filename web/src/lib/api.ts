import type {Diagram, ExportOptions, Library, MachineSource, Trace} from './types';

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
  diagram: (signal: AbortSignal) => json<Diagram>('diagram', signal),
  library: (signal: AbortSignal) => json<Library>('library', signal),
  selectMachine: (source: MachineSource, signal: AbortSignal) => json<Diagram>('machine', signal, source),
  input: (filename: string, signal: AbortSignal) => json<{source: string}>(`input?filename=${encodeURIComponent(filename)}`, signal),
  simulate: (revision: string, setup: string, max_steps: number, signal: AbortSignal) => json<Trace>('simulate', signal, {revision, setup, max_steps}),
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
