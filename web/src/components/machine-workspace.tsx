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

const themes: {id: Theme; label: string; icon: 'sun' | 'moon' | 'monitor'}[] = [
  {id: 'light', label: 'Light', icon: 'sun'},
  {id: 'dark', label: 'Dark', icon: 'moon'},
  {id: 'system', label: 'System', icon: 'monitor'},
];

export default function MachineWorkspace() {
  const w = useWorkspace();
  const playback = usePlayback(w.trace);
  const [playbackExpanded, setPlaybackExpanded] = useState(false);
  const {theme, setTheme} = useTheme();
  const actions = <div className="page-actions">
    <button className="icon-button" type="button" aria-label="Open workspace folder" title="Open workspace folder" disabled={!w.connected || w.saving || w.opening} onClick={() => void w.openWorkspace()}><Icon name="folder" size={16} /></button>
    <div className="theme-switch" role="group" aria-label="Color theme">{themes.map(mode => <button key={mode.id} className="theme-option" type="button" aria-pressed={theme === mode.id} title={`${mode.label} theme`} onClick={() => setTheme(mode.id)}><Icon name={mode.icon} size={14} /><span>{mode.label}</span></button>)}</div>
  </div>;
  return <div className="workspace-shell" data-theme={theme}>
    <a className="skip-link" href="#workspace">Skip to machine workspace</a>
    <LibraryPanel workspace={w} />
    <main className="workspace-main" id="workspace">
      <div className="workspace-content">
        {w.error && <div className="error-banner" role="alert">{w.error}</div>}
        {w.diagram && !w.diagram.valid && w.diagram.revision !== 'unselected' && <div className="error-banner" role="alert">{w.diagram.diagnostics.map((diagnostic, index) => <div key={index}>Line {diagnostic.line}:{diagnostic.column} · {diagnostic.message}</div>)}</div>}
        <MachineEditor key={w.diagram?.path} workspace={w} playback={playback} actions={actions} onBeginEdit={() => setPlaybackExpanded(false)} />
      </div>
      <footer className="workspace-footer"><span><span className={`connection-dot ${w.connected ? 'connected' : ''}`} />{w.machine ? w.machine.mode : w.connected ? 'Workspace ready' : 'Connecting…'}</span><span>Transitions <code>read → write, move</code><span className="footer-divider">/</span><code>|</code> separates tapes</span></footer>
      <PlaybackPanel trace={w.trace} machine={w.machine} message={w.message} playback={playback} expanded={playbackExpanded} onExpandedChange={setPlaybackExpanded} />
    </main>
    <LimitReachedDialog trace={w.trace} />
  </div>;
}
