'use client';

import {useEffect, useRef, useState} from 'react';
import Workspace from './workspace';

export default function MachineWorkspace() {
  const root = useRef(null);
  const [theme, setTheme] = useState('system');
  useEffect(() => {
    const saved = window.localStorage.getItem('tm-builder-theme');
    if (['system', 'light', 'dark'].includes(saved)) setTheme(saved);
  }, []);
  function cycleTheme() {
    const next = {system: 'light', light: 'dark', dark: 'system'}[theme];
    setTheme(next);
    window.localStorage.setItem('tm-builder-theme', next);
  }
  useEffect(() => {
    let disposed = false;
    let cleanup;
    import('../viewer').then(({mountViewer}) => {
      if (!disposed) cleanup = mountViewer(root.current);
    }).catch(() => {
      if (!disposed) root.current.querySelector('#status').textContent = 'Unable to load the workspace. Please refresh to try again.';
    });
    return () => { disposed = true; cleanup?.(); };
  }, []);
  return <div ref={root}><Workspace theme={theme} onCycleTheme={cycleTheme} /></div>;
}
