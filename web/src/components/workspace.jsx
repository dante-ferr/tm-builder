function ExportDialog() {
  return (
    <dialog id="export-dialog" className="export-dialog" aria-labelledby="export-title">
      <form id="export-form">
        <div className="export-heading">
          <h2 id="export-title">Export transition table</h2>
          <button type="button" id="export-close" aria-label="Close export menu">×</button>
        </div>
        <label>Machine <select id="export-source"><option value="current">Currently selected machine</option><option value="file">Another YAML file…</option></select></label>
        <p id="export-machine" className="export-help"></p>
        <label id="export-file-label" hidden>Import a machine <input id="export-file" type="file" accept=".yaml,.yml" /></label>
        <div className="export-grid">
          <label>Format <select id="export-format"><option value="image">Image (PNG)</option><option value="csv">CSV</option><option value="tex">LaTeX source</option></select></label>
          <label>Style <select id="export-style"><option value="readable">Readable</option><option value="formal">Formal mathematics</option></select></label>
          <label id="export-layout-label">Layout <select id="export-layout"><option value="split">A4 pieces</option><option value="long">One long table</option></select></label>
          <label id="export-dpi-label">Resolution (DPI) <input id="export-dpi" type="number" min="72" max="600" step="1" defaultValue="200" required /></label>
        </div>
        <p id="export-help" className="export-help"></p>
        <label>File name (without extension) <input id="export-name" type="text" maxLength="100" pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,99}" title="Start with a letter or number; use letters, numbers, dots, underscores, or hyphens." required /></label>
        <p className="export-help">Images contain only the table. Multiple A4 pieces download together as a ZIP.</p>
        <div className="export-actions"><span id="export-status" role="status" aria-live="polite"></span><button type="submit" id="export-submit">Export &amp; download</button></div>
      </form>
    </dialog>
  );
}

export default function Workspace({theme, onCycleTheme}) {
  return (
    <div className="workspace-shell" data-theme={theme}>
      <aside className="sidebar" aria-label="Workspace setup">
        <a className="brand" href="#" aria-label="TMBuilder home">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
            <rect x="3" y="3" width="34" height="34" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="13" cy="13" r="3" fill="currentColor" /><circle cx="27" cy="13" r="3" fill="currentColor" />
            <circle cx="20" cy="27" r="3" fill="currentColor" /><path d="M15.5 14.5 18 24m6.5-9.5L22 24m-5-10h6" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          <span className="brand-copy"><strong>TMBuilder</strong><small>Turing machine debugger</small></span>
        </a>

        <section className="sidebar-section library" aria-label="Machine library">
          <div className="section-heading"><span className="section-number">01</span><h2>Machine library</h2></div>
          <label>Machine <select id="machine-select"><option value="">Choose a machine…</option></select></label>
          <label>Import a machine <input id="machine-file" type="file" accept=".yaml,.yml" /></label>
          <label className="inline-check"><input id="hide-examples" type="checkbox" /> Hide examples</label>
          <span id="library-status" role="status"></span>
        </section>

        <section className="sidebar-section setup-section">
          <div className="section-heading"><span className="section-number">02</span><h2>Starting tapes</h2></div>
          <details open id="setup-panel" className="setup-panel">
            <summary>Configure input</summary>
            <div className="setup-grid">
              <label>Setup YAML <textarea id="setup" spellCheck="false" rows="4" defaultValue="tapes: []" /></label>
              <div className="setup-options">
                <label>Input setup <select id="input-select"><option value="">Choose an input…</option></select></label>
                <label>Import an input setup <input id="setup-file" type="file" accept=".yaml,.yml" /></label>
                <p>Use contents, origin, and head from the input setup format. Omitted tapes start blank.</p>
                <label>Maximum steps <input id="max-steps" type="number" min="1" max="10000" defaultValue="1000" /></label>
                <button id="run" disabled>Load trace</button>
              </div>
            </div>
          </details>
        </section>
      </aside>

      <main className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-title"><p className="eyebrow">MACHINE WORKSPACE</p><h1 id="title">Machine diagram</h1><div id="path"></div></div>
          <div className="tools" aria-label="Graph tools"><button id="theme-toggle" onClick={onCycleTheme} aria-label={`Theme: ${theme}. Click to change theme.`} title={`Theme: ${theme}`}>◐ <span>Theme: {theme[0].toUpperCase() + theme.slice(1)}</span></button><button id="zoom-out" aria-label="Zoom out">−</button><button id="zoom-in" aria-label="Zoom in">+</button><button id="fit">Fit</button><button id="export-open">Export table…</button><button id="download" disabled>Download SVG</button></div>
        </header>

        <div className="workspace-content">
          <section id="graph-panel" className="graph-panel" aria-label="State graph">
            <div className="panel-heading"><div className="graph-heading-copy"><p className="eyebrow">VISUALIZATION</p><h2>STATE GRAPH</h2><p id="graph-help" className="graph-help">Scroll to zoom · Middle mouse drag to pan · Click graph for WASD / arrows</p></div><div className="graph-heading-actions"><span className="live-pill"><span className="live-dot"></span>Live view</span><button id="graph-expand" type="button" aria-expanded="false" aria-controls="graph-panel" aria-label="Expand state graph" title="Expand state graph"><span aria-hidden="true">⛶</span></button></div></div>
            <div id="graph" className="graph-canvas" aria-label="Rendered machine diagram" aria-describedby="graph-help" tabIndex={0}><div className="graph-empty"><span className="empty-orbit" aria-hidden="true"><i></i><i></i><i></i></span><strong>Your state graph will appear here</strong><span>Choose a machine from the library to begin.</span></div></div>
          </section>

          <section id="debugger" className="playback-panel" aria-label="Machine debugger">
            <div className="panel-heading playback-heading"><div><p className="eyebrow">TRACE CONTROLS</p><h2>Playback &amp; debugger</h2></div></div>
            <div className="controls">
              <button id="reset" disabled>Reset</button><button id="back" disabled>← Back</button>
              <button id="play" disabled>Play</button><button id="next" disabled>Step →</button>
              <label>Speed <select id="speed" defaultValue="2"><option value="1">1 step/s</option><option value="2">2 steps/s</option><option value="5">5 steps/s</option></select></label>
              <label className="inline-check"><input id="follow-state" type="checkbox" defaultChecked /> Follow active state</label>
              <label>Break on state <input id="break-state" placeholder="State name" list="states" /></label>
              <datalist id="states"></datalist>
              <label>Break before rule <input id="break-rule" type="number" min="1" placeholder="Rule number" /></label>
            </div>
            <label className="timeline">Timeline <input id="timeline" type="range" min="0" max="0" defaultValue="0" disabled /></label>
            <div className="debugger-output"><div id="execution" role="status">Load a trace to inspect the tapes.</div>
              <div id="trace-note"></div><div id="tapes"></div>
              <pre id="rule-details">No transition selected.</pre>
            </div>
          </section>
        </div>
        <footer className="workspace-footer"><span id="status" role="status">Loading…</span><span>Edges: read → write, move · | separates tapes</span></footer>
      </main>
      <ExportDialog />
    </div>
  );
}
