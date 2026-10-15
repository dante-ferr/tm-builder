import {finishPlayback} from '../lib/playback';
import type {Playback} from '../lib/playback';
import type {Trace} from '../lib/types';

self.onmessage = (event: MessageEvent<{cursor: Playback; trace: Trace; stateBreak: string; ruleBreak: string}>) => {
  const {cursor, trace, stateBreak, ruleBreak} = event.data;
  self.postMessage(finishPlayback(cursor, trace, stateBreak, ruleBreak));
};
