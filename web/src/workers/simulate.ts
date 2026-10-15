import {indexTrace} from '../lib/timeline';
import type {Trace} from '../lib/types';

self.onmessage = async (event: MessageEvent<{revision: string; setup: string; max_steps: number}>) => {
  try {
    const response = await fetch('/api/simulate', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(event.data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || `Simulation request failed (${response.status}).`);
    }
    const trace = indexTrace(await response.json() as Trace);
    self.postMessage({trace});
  } catch (error) {
    self.postMessage({error: error instanceof Error ? error.message : 'Simulation failed.'});
  }
};
