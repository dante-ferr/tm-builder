import type {CSSProperties} from 'react';
const paths = {
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  undo: 'M3 10h10a7 7 0 0 1 7 7M3 10l5-5m-5 5 5 5',
  redo: 'M21 10H11a7 7 0 0 0-7 7m17-7-5-5m5 5-5 5',
  cursor: 'm5 3 14 9-7 1-3 7Z',
  state: 'M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0M12 9v6m-3-3h6',
  transition: 'M4 17C4 6 12 6 20 6m-4-4 4 4-4 4',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  check: 'm5 12 4 4L19 6', trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  chevron: 'm6 9 6 6 6-6',
  graph: 'M5 6h.01M19 6h.01M12 18h.01M7 7l4 9m6-9-4 9M7 6h10',
  library: 'M4 4h5v16H4zM12 4h4l4 15-4 1z',
  tape: 'M3 7h18v10H3zM9 7v10m6-10v10',
  play: 'm9 5 11 7-11 7Z', pause: 'M8 5v14M16 5v14',
  reset: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
  back: 'M6 5v14m12-14L8 12l10 7Z', next: 'M18 5v14M6 5l10 7-10 7Z',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8z',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
  close: 'm6 6 12 12M6 18 18 6', code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18',
};
export function Icon({name, size = 18, style}: {name: keyof typeof paths; size?: number; style?: CSSProperties}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
