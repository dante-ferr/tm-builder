'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {api, errorMessage} from '../lib/api';
import {formatDiagnostics, issueKind, type IssueKind} from '../lib/issues';
import type {Diagram, Library, MachineDefinition, MachineSource, Trace} from '../lib/types';

const pairedInputs: Record<string, string> = {
  'binary_counter.yaml': 'binary_counter_million.yaml',
  'copy.yaml': 'copy.yaml', 'single_tape.yaml': 'binary.yaml', 'nondeterministic_contains_one.yaml': 'binary.yaml',
  'four_groups.yaml': 'four_groups.yaml',
};
function machineNotice(diagram: Diagram | null, action: {kind: IssueKind; message: string} | null) {
  const diagnostics = diagram && !diagram.valid && diagram.revision !== 'unselected' ? formatDiagnostics(diagram.diagnostics) : '';
  const actionText = action?.kind === 'machine' ? action.message : '';
  if (!diagnostics) return actionText;
  if (!actionText || diagnostics.includes(actionText)) return diagnostics;
  return `${diagnostics}\n${actionText}`;
}
export function useWorkspace() {
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [library, setLibrary] = useState<Library>({machines: [], inputs: []});
  const [setup, setSetup] = useState('tapes: []');
  const [input, setInput] = useState('');
  const [maxSteps, setMaxSteps] = useState(1_000_000);
  const [maximumSteps, setMaximumSteps] = useState(10_000_000);
  const customLimit = useRef(false);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [message, setMessage] = useState('Load a trace to inspect the tapes.');
  const [actionIssue, setActionIssue] = useState<{kind: IssueKind; message: string} | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [libraryError, setLibraryError] = useState('');
  const [connected, setConnected] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [historyGeneration, setHistoryGeneration] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const activeRun = useRef<AbortController | null>(null);
  const selection = useRef(0), inputRequest = useRef(0), simulation = useRef(0);
  const selectionBusy = useRef(false);
  const revision = useRef<string | null>(null);

  const report = useCallback((error: unknown, expected: IssueKind) => {
    const message = errorMessage(error);
    setActionIssue({kind: issueKind(message) === 'system' ? 'system' : expected, message});
  }, []);
  const clearTrace = useCallback((note: string) => {
    activeRun.current?.abort(); activeRun.current = null;
    simulation.current++; setTrace(null); setRunning(false); setMessage(note);
  }, []);
  const acceptDiagram = useCallback((next: Diagram) => {
    if (next.revision !== revision.current) {
      revision.current = next.revision;
      setDiagram(next);
      setActionIssue(current => current?.kind === 'machine' ? null : current);
      clearTrace('Machine changed. Load a trace to inspect the tapes.');
    }
  }, [clearTrace]);

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    let diagramTimer: ReturnType<typeof setTimeout>, libraryTimer: ReturnType<typeof setTimeout>;
    async function pollDiagram() {
      const version = selection.current;
      try {
        if (!selectionBusy.current) {
          const next = await api.diagram(controller.signal);
          if (!controller.signal.aborted && version === selection.current) {
            acceptDiagram(next); setConnected(true); setConnectionError('');
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setConnected(false); setConnectionError(errorMessage(error));
          clearTrace('API connection lost. Reconnect and load a new trace.');
        }
      } finally { if (!controller.signal.aborted) diagramTimer = setTimeout(pollDiagram, 500); }
    }
    async function pollLibrary() {
      try {
        const next = await api.library(controller.signal);
        if (!controller.signal.aborted) {
          setLibrary(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
          setLibraryError('');
        }
      } catch (error) { if (!controller.signal.aborted) setLibraryError(errorMessage(error)); }
      finally { if (!controller.signal.aborted) libraryTimer = setTimeout(pollLibrary, 2000); }
    }
    void pollDiagram(); void pollLibrary();
    void api.limits(controller.signal).then(limits => {
      if (controller.signal.aborted) return;
      setMaximumSteps(limits.maximum);
      if (!customLimit.current) setMaxSteps(limits.default_max_steps);
    }).catch(() => {});
    return () => { controller.abort(); activeRun.current?.abort(); clearTimeout(diagramTimer); clearTimeout(libraryTimer); };
  }, [acceptDiagram, clearTrace]);

  async function selectMachine(source: MachineSource) {
    if (selectionBusy.current || !lifetime.current) return;
    const controller = lifetime.current;
    const version = ++selection.current;
    const inputToken = ++inputRequest.current;
    selectionBusy.current = true; setSelecting(true); setActionIssue(null);
    clearTrace('Selecting machine…');
    try {
      const next = await api.selectMachine(source, controller.signal);
      if (controller.signal.aborted || version !== selection.current) return;
      acceptDiagram(next);
      const example = source.source === undefined && library.machines.some(entry => entry.filename === source.filename && entry.example);
      if (example) {
        const filename = pairedInputs[source.filename];
        const loaded = filename ? await api.input(filename, controller.signal) : {source: 'tapes: []'};
        if (!controller.signal.aborted && version === selection.current && inputToken === inputRequest.current) {
          setSetup(loaded.source); setInput(filename || '');
        }
      }
    } catch (error) { if (!controller.signal.aborted) report(error, 'machine'); }
    finally { if (!controller.signal.aborted && version === selection.current) { selectionBusy.current = false; setSelecting(false); } }
  }
  async function editMachine(expectedRevision: string, changes: Partial<MachineDefinition>) {
    if (selectionBusy.current || !lifetime.current || !connected) throw new Error('Wait for the workspace connection.');
    const controller = lifetime.current;
    selectionBusy.current = true; selection.current++; setSaving(true); setActionIssue(null);
    clearTrace('Machine edited. Load a new trace.');
    try {
      const next = await api.edit(expectedRevision, changes, controller.signal);
      if (!controller.signal.aborted) acceptDiagram(next);
    } finally {
      selectionBusy.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }
  async function changeHistory(direction: 'undo' | 'redo') {
    if (selectionBusy.current || !lifetime.current || !connected || !diagram?.valid) return;
    selectionBusy.current = true; selection.current++; setSaving(true); setActionIssue(null);
    clearTrace('Machine changed. Load a new trace.');
    try {
      const next = await api.history(revision.current!, direction, lifetime.current.signal);
      acceptDiagram(next); setHistoryGeneration(value => value + 1);
    } catch (error) {report(error, 'machine');}
    finally {selectionBusy.current = false; setSaving(false);}
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.defaultPrevented) return;
      if ((event.target as Element)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      const direction = key === 'z' ? event.shiftKey ? 'redo' : 'undo' : key === 'y' ? 'redo' : null;
      if (!direction || !diagram?.valid || !(direction === 'undo' ? diagram.can_undo : diagram.can_redo)) return;
      event.preventDefault(); void changeHistory(direction);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });
  async function createMachine(name: string, filename: string) {
    if (selectionBusy.current || !lifetime.current || !connected) return false;
    const controller = lifetime.current;
    selectionBusy.current = true; selection.current++; setSelecting(true); setActionIssue(null);
    try {
      const next = await api.create(name, filename, controller.signal);
      if (controller.signal.aborted) return false;
      acceptDiagram(next);
      inputRequest.current++; setSetup('tapes: []'); setInput('');
      setLibrary(current => ({...current, machines: [...current.machines.filter(entry => entry.filename !== filename), {filename, example: false}].sort((a, b) => a.filename.localeCompare(b.filename))}));
      return true;
    } catch (error) {if (!controller.signal.aborted) report(error, 'machine'); return false;}
    finally {selectionBusy.current = false; if (!controller.signal.aborted) setSelecting(false);}
  }
  async function selectInput(filename: string) {
    const token = ++inputRequest.current;
    setInput(filename); setActionIssue(null);
    clearTrace('Starting tapes changed. Load a new trace.');
    if (!filename || !lifetime.current) {
      if (!filename) setSetup('tapes: []');
      return;
    }
    const controller = lifetime.current;
    try {
      const result = await api.input(filename, controller.signal);
      if (!controller.signal.aborted && token === inputRequest.current) {
        setSetup(result.source); clearTrace('Starting tapes changed. Load a new trace.');
      }
    } catch (error) { if (!controller.signal.aborted && token === inputRequest.current) report(error, 'machine'); }
  }
  function changeSetup(value: string) {
    inputRequest.current++; setInput(''); setSetup(value); clearTrace('Starting tapes changed. Load a new trace.');
  }
  async function importFile(file: File, kind: 'machine' | 'input') {
    const token = kind === 'input' ? ++inputRequest.current : 0;
    try {
      if (file.size > 1_900_000) throw new Error('Choose a YAML file smaller than 1.9 MB.');
      const source = await file.text();
      if (lifetime.current?.signal.aborted) return;
      if (kind === 'machine') await selectMachine({filename: file.name, source});
      else if (token === inputRequest.current) changeSetup(source);
    } catch (error) { report(error, 'machine'); }
  }
  async function openWorkspace() {
    if (!lifetime.current || !connected || saving || opening || selectionBusy.current) return;
    setOpening(true); setActionIssue(null);
    try {
      await api.openWorkspace(lifetime.current.signal);
    } catch (error) { if (!lifetime.current.signal.aborted) report(error, 'system'); }
    finally { setOpening(false); }
  }
  async function run() {
    if (!diagram?.valid || !lifetime.current || selectionBusy.current) return;
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > maximumSteps) {
      setMessage(`Set a whole-number step limit from 1 to ${maximumSteps.toLocaleString()}.`); return;
    }
    customLimit.current = true;
    clearTrace('Computing bounded trace…');
    const token = simulation.current, controller = new AbortController();
    activeRun.current = controller;
    setRunning(true);
    try {
      const result = await api.simulate(diagram.revision, setup, maxSteps, controller.signal);
      if (controller.signal.aborted || token !== simulation.current) return;
      if (result.revision !== revision.current) throw new Error('Machine changed. Load a new trace.');
      setTrace(result); setMessage('');
    } catch (error) {
      if (controller.signal.aborted || token !== simulation.current) return;
      const text = errorMessage(error);
      if (issueKind(text) === 'system') setActionIssue({kind: 'system', message: text});
      else setMessage(text);
    }
    finally { if (!controller.signal.aborted && token === simulation.current) setRunning(false); }
  }
  return {
    diagram, machine: diagram?.valid ? diagram : null, library, setup, input, maxSteps, maximumSteps, trace, message,
    machineError: machineNotice(diagram, actionIssue),
    systemError: connectionError || libraryError || (actionIssue?.kind === 'system' ? actionIssue.message : ''),
    connected, selecting, running, saving, opening, historyGeneration, changeHistory, createMachine, editMachine, selectMachine, selectInput, changeSetup, importFile, openWorkspace, run,
    changeMaxSteps: (value: number) => {
      customLimit.current = true; setMaxSteps(value);
      clearTrace('Step limit changed. Load a new trace.');
    },
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
