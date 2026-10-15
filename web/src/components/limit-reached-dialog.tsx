import {useEffect, useRef, useState} from 'react';
import type {Trace} from '../lib/types';
import {frameCount} from '../lib/timeline';
import {Icon} from './icon';
import styles from './limit-reached-dialog.module.css';

const PREFERENCE = 'tm-builder-hide-limit-notification';

export function LimitReachedDialog({trace}: {trace: Trace | null}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const suppressed = useRef(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    let hide = suppressed.current;
    try {hide = window.localStorage.getItem(PREFERENCE) === 'true' || hide;} catch { /* Keep the session preference when storage is unavailable. */ }
    if (trace?.status === 'RUNNING' && !hide && !element.open) element.showModal();
    return () => {element.close();};
  }, [trace]);

  function changePreference(checked: boolean) {
    suppressed.current = checked;
    setDoNotShowAgain(checked);
    try {
      if (checked) window.localStorage.setItem(PREFERENCE, 'true');
      else window.localStorage.removeItem(PREFERENCE);
    } catch { /* The preference still applies for this session. */ }
  }

  return <dialog ref={dialog} className={`export-dialog ${styles.dialog}`} role="alertdialog" aria-labelledby="limit-title" aria-describedby="limit-description limit-guidance">
    <div className="export-heading"><h2 id="limit-title">Execution limit reached</h2><button type="button" className="icon-button" aria-label="Close limit notification" onClick={() => dialog.current?.close()}><Icon name="close" /></button></div>
    <p id="limit-description">{trace?.model === 'nondeterministic'
      ? 'The search reached its step or configuration limit before it could finish.'
      : `The machine had not halted after ${trace ? (frameCount(trace) - 1).toLocaleString() : 0} steps. Execution was stopped at your step limit.`}</p>
    <p id="limit-guidance">This does not prove the machine will run forever. Inspect the recorded timeline, or raise the step limit and run again.</p>
    <label className={styles.preference}><input type="checkbox" checked={doNotShowAgain} onChange={event => changePreference(event.target.checked)} />Do not show again</label>
    <form method="dialog" className={styles.actions}><button className="primary" autoFocus>Inspect timeline</button></form>
  </dialog>;
}
