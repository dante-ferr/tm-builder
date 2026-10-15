import type {Trace} from './types';
import {frameCount, stateAt, transitionAt} from './timeline';
export interface Playback {position: number; phase: number; playing: boolean; breakpoint: boolean}
export const initialPlayback: Playback = {position: 0, phase: 0, playing: false, breakpoint: false};

export function advancePlayback(current: Playback, trace: Trace, stateBreak: string, ruleBreak: string): Playback {
  if (current.position >= frameCount(trace) - 1) return {...current, playing: false};
  const phase = (current.phase + 1) % 4;
  const position = current.position + (phase === 0 ? 1 : 0);
  const breakpoint = phase === 0 && Boolean(
    (stateBreak.trim() && stateAt(trace, position) === stateBreak.trim()) ||
    (Number(ruleBreak) && (transitionAt(trace, position + 1)?.index ?? -2) + 1 === Number(ruleBreak))
  );
  return {position, phase, breakpoint, playing: !breakpoint && position < frameCount(trace) - 1};
}
