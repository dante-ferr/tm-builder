'use client';
import {useState} from 'react';
import {useWorkspace} from '../hooks/use-workspace';
import {usePlayback} from '../hooks/use-playback';
import {useTheme} from '../hooks/use-theme';
import {LibraryPanel} from './library-panel';
import {MachineEditor} from './machine-editor';
import {PlaybackPanel} from './playback-panel';
import {Icon} from './icon';
import {LimitReachedDialog} from './limit-reached-dialog';

export default function MachineWorkspace() {
  const w = useWorkspace();
  const playback = usePlayback(w.trace);
  const [playbackExpanded, setPlaybackExpanded] = useState(false);
  const {theme, cycleTheme} = useTheme();
  return <div className="workspace-shell" data-theme={theme}>
    <a className="skip-link" href="#workspace">Skip to machine workspace</a>
    <LibraryPanel workspace={w} />
    <main className="workspace-main" id="workspace">
      <header className="workspace-header"><div><div className="breadcrumb">Workspace <span>/</span> <strong>Machine explorer</strong></div><h1>{w.machine?.name || 'Machine explorer'}</h1><p className="workspace-description">{w.machine ? <><span className="model-badge">{w.machine.model}</span><span className="machine-path" title={w.machine.path}>{w.machine.path.split('/').pop()}</span></> : 'Build intuition. Follow every transition.'}</p></div>
        <div className="header-actions"><button className="theme-button" onClick={cycleTheme} aria-label={`Theme: ${theme}. Click to change theme.`} title={`Theme: ${theme}`}><Icon name="sun" size={16} /><span>{theme[0].toUpperCase() + theme.slice(1)}</span></button></div>
      </header>
      <div className="workspace-content">
        {w.error && <div className="error-banner" role="alert">{w.error}</div>}
        {w.diagram && !w.diagram.valid && w.diagram.revision !== 'unselected' && <div className="error-banner" role="alert">{w.diagram.diagnostics.map((diagnostic, index) => <div key={index}>Line {diagnostic.line}:{diagnostic.column} · {diagnostic.message}</div>)}</div>}
        <MachineEditor key={w.diagram?.path} workspace={w} playback={playback} onBeginEdit={() => setPlaybackExpanded(false)} />
      </div>
      <PlaybackPanel trace={w.trace} machine={w.machine} message={w.message} playback={playback} expanded={playbackExpanded} onExpandedChange={setPlaybackExpanded} />
      <footer className="workspace-footer"><span><span className={`connection-dot ${w.connected ? 'connected' : ''}`} />{w.machine ? w.machine.mode : w.connected ? 'Workspace ready' : 'Connecting…'}</span><span>Transitions <code>read → write, move</code><span className="footer-divider">/</span><code>|</code> separates tapes</span></footer>
    </main>
    <LimitReachedDialog trace={w.trace} />
  </div>;
}
