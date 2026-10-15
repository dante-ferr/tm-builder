'use client';
import {useEffect, useState} from 'react';
import {advancePlayback, initialPlayback} from '../lib/playback';
import type {Trace} from '../lib/types';
import {frameAt, frameCount} from '../lib/timeline';

export function usePlayback(trace: Trace | null) {
  const [cursor, setCursor] = useState(initialPlayback);
  const [speed, setSpeed] = useState(2);
  const [stateBreak, setStateBreak] = useState('');
  const [ruleBreak, setRuleBreak] = useState('');
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setCursor(initialPlayback); }, [trace]);
  useEffect(() => {
    if (!cursor.playing || !trace) return;
    if (speed === 0) {
      setBusy(true);
      setError('');
      let worker: Worker;
      try {
        worker = new Worker(new URL('../workers/quick-playback.ts', import.meta.url));
        worker.onmessage = event => {setCursor(event.data); setBusy(false);};
        worker.onerror = () => {
          setError('Instant playback failed. Try again or choose a slower speed.');
          setCursor(current => ({...current, playing: false})); setBusy(false);
        };
        worker.postMessage({cursor, trace: {...trace, timeline: undefined}, stateBreak, ruleBreak});
      } catch {
        setError('Instant playback could not start. Choose a slower speed.');
        setCursor(current => ({...current, playing: false})); setBusy(false);
      }
      return () => {worker?.terminate(); setBusy(false);};
    }
    const timer = setTimeout(() => setCursor(current => advancePlayback(current, trace, stateBreak, ruleBreak)), 1000 / speed / 4);
    return () => clearTimeout(timer);
  }, [cursor, trace, speed, stateBreak, ruleBreak]);
  const frame = trace ? frameAt(trace, cursor.position) : undefined;
  const pending = cursor.phase && trace ? frameAt(trace, cursor.position + 1) : undefined;
  const count = trace ? frameCount(trace) : 0;
  const rule = pending?.transition || frame?.transition;
  const seek = (position: number) => setCursor({position, phase: 0, playing: false, breakpoint: false});
  return {
    ...cursor, busy, error, frame, rule, count, tapes: (cursor.phase === 3 ? pending : frame)?.tapes,
    atEnd: Boolean(trace && cursor.position === count - 1 && !cursor.phase),
    speed, setSpeed, stateBreak, setStateBreak, ruleBreak, setRuleBreak, follow, setFollow, seek,
    pause: () => setCursor(current => ({...current, playing: false})),
    toggle: () => setCursor(current => ({...current, playing: !current.playing, breakpoint: false})),
  };
}
export type PlaybackController = ReturnType<typeof usePlayback>;
