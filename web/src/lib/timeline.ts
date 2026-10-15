import type {Frame, Trace} from './types';

export function frameCount(trace: Trace): number {
  return trace.recording ? trace.recording.steps.length + 1 : trace.frames.length;
}
export function transitionAt(trace: Trace, position: number) {
  if (!trace.recording) return trace.frames[position]?.transition;
  return position > 0 && position < frameCount(trace)
    ? trace.recording.rules[trace.recording.steps[position - 1]] : undefined;
}
export function stateAt(trace: Trace, position: number) {
  return trace.recording ? (position === 0 ? trace.recording.start : transitionAt(trace, position)?.to)
    : trace.frames[position]?.state;
}

// Build once on the simulation worker. Each tape cell has a history of writes;
// binary search recovers any visible cell without replaying earlier steps.
export function indexTrace(trace: Trace): Trace {
  const recording = trace.recording;
  if (!recording) return trace;
  const steps = Uint32Array.from(recording.steps);
  const heads = recording.initial.map(tape => {
    const result = new Float64Array(steps.length + 1); result[0] = tape.head; return result;
  });
  const cells = recording.initial.map(tape => new Map<number, {steps: number[]; symbols: string[]}>(
    tape.cells.map(([address, symbol]) => [address, {steps: [0], symbols: [symbol]}])));
  for (let step = 1; step <= steps.length; step++) {
    const rule = recording.rules[steps[step - 1]];
    rule.tapes.forEach(([, symbol, move], tape) => {
      const address = heads[tape][step - 1];
      let history = cells[tape].get(address);
      if (!history && symbol !== recording.blank) {history = {steps: [], symbols: []}; cells[tape].set(address, history);}
      // Rewriting the same symbol does not change cell contents.
      if (history && (history.symbols.at(-1) ?? recording.blank) !== symbol) {
        history.steps.push(step); history.symbols.push(symbol);
      }
      heads[tape][step] = address + (move === 'L' ? -1 : move === 'R' ? 1 : 0);
    });
  }
  return {...trace, recording: {...recording, steps}, timeline: {heads, cells}};
}

export function frameAt(trace: Trace, position: number): Frame | undefined {
  if (!trace.recording) return trace.frames[position];
  if (!trace.timeline || position < 0 || position >= frameCount(trace)) return undefined;
  const {blank} = trace.recording;
  return {
    step: position, state: stateAt(trace, position)!, transition: transitionAt(trace, position),
    tapes: trace.timeline.heads.map((heads, tape) => {
      const head = heads[position], left = head - 8;
      return {head, left, cells: Array.from({length: 17}, (_, offset) => {
        const history = trace.timeline!.cells[tape].get(left + offset);
        if (!history) return blank;
        let lo = 0, hi = history.steps.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (history.steps[mid] <= position) lo = mid + 1; else hi = mid;
        }
        return lo ? history.symbols[lo - 1] : blank;
      })};
    }),
  };
}
