'use client';
import {useState} from 'react';
import {useWorkspace} from '../hooks/use-workspace';
import {usePlayback} from '../hooks/use-playback';
import {useTheme} from '../hooks/use-theme';
import type {Theme} from '../lib/types';
import {LibraryPanel} from './library-panel';
import {MachineEditor} from './machine-editor';
import {PlaybackPanel} from './playback-panel';
import {Icon} from './icon';
import {LimitReachedDialog} from './limit-reached-dialog';

const themeCycle: Record<Theme, {next: Theme; icon: 'sun' | 'moon' | 'monitor'; label: string}> = {
  light: {next: 'dark', icon: 'sun', label: 'Light'},
  dark: {next: 'system', icon: 'moon', label: 'Dark'},
  system: {next: 'light', icon: 'monitor', label: 'System'},
};

export default function MachineWorkspace() {
  const w = useWorkspace();
  const playback = usePlayback(w.trace);
  const [playbackExpanded, setPlaybackExpanded] = useState(false);
  const {theme, setTheme} = useTheme();
  const current = themeCycle[theme];
  const actions = <div className="page-actions">
    {!w.hosted && <button className="icon-button" type="button" aria-label="Open workspace folder" title="Open workspace folder" disabled={!w.connected || w.saving || w.opening} onClick={() => void w.openWorkspace()}><Icon name="folder" size={16} /></button>}
    <button className="icon-button" type="button" aria-label={`${current.label} theme. Click to change theme.`} title={`${current.label} theme`} onClick={() => setTheme(current.next)}><Icon name={current.icon} size={16} /></button>
  </div>;
  return <div className="workspace-shell" data-theme={theme}>
    <a className="skip-link" href="#workspace">Skip to machine workspace</a>
    <LibraryPanel workspace={w} />
    <main className="workspace-main" id="workspace">
      <div className="workspace-content">
        <MachineEditor key={w.diagram?.path} workspace={w} playback={playback} actions={actions} onBeginEdit={() => setPlaybackExpanded(false)} />
      </div>
      <footer className="workspace-footer"><span><span className={`connection-dot ${w.connected ? 'connected' : ''}`} />{w.machine ? w.machine.mode : w.connected ? (w.hosted ? 'Ready' : 'Workspace ready') : 'Connecting…'}</span>{w.systemError && <p className="system-issue" role="alert"><span className="issue-label">Workspace</span>{w.systemError}</p>}<span>Transitions <code>read → write, move</code><span className="footer-divider">/</span><code>|</code> separates tapes</span></footer>
      <PlaybackPanel trace={w.trace} machine={w.machine} message={w.message} playback={playback} expanded={playbackExpanded} onExpandedChange={setPlaybackExpanded} />
    </main>
    <LimitReachedDialog trace={w.trace} />
  </div>;
}
