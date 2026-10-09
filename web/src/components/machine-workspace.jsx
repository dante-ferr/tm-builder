'use client';

import {useEffect, useRef} from 'react';
import Workspace from './workspace';

export default function MachineWorkspace() {
  const root = useRef(null);
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
  return <div ref={root}><Workspace /></div>;
}
