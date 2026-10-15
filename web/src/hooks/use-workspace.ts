'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {api, errorMessage} from '../lib/api';
import type {Diagram, Library, MachineSource, Trace} from '../lib/types';

const pairedInputs: Record<string, string> = {
  'copy.yaml': 'copy.yaml', 'single_tape.yaml': 'binary.yaml', 'nondeterministic_contains_one.yaml': 'binary.yaml',
};
export function useWorkspace() {
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [library, setLibrary] = useState<Library>({machines: [], inputs: []});
  const [setup, setSetup] = useState('tapes: []');
  const [input, setInput] = useState('');
  const [maxSteps, setMaxSteps] = useState(1000);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [message, setMessage] = useState('Load a trace to inspect the tapes.');
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [libraryError, setLibraryError] = useState('');
  const [connected, setConnected] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [running, setRunning] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const selection = useRef(0), inputRequest = useRef(0), simulation = useRef(0);
  const selectionBusy = useRef(false);
  const revision = useRef<string | null>(null);

  const clearTrace = useCallback((note: string) => {
    simulation.current++; setTrace(null); setRunning(false); setMessage(note);
  }, []);
  const acceptDiagram = useCallback((next: Diagram) => {
    if (next.revision !== revision.current) {
      revision.current = next.revision;
      setDiagram(next);
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
    return () => { controller.abort(); clearTimeout(diagramTimer); clearTimeout(libraryTimer); };
  }, [acceptDiagram, clearTrace]);

  async function selectMachine(source: MachineSource) {
    if (selectionBusy.current || !lifetime.current) return;
    const controller = lifetime.current;
    const version = ++selection.current;
    const inputToken = ++inputRequest.current;
    selectionBusy.current = true; setSelecting(true); setError('');
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
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (!controller.signal.aborted && version === selection.current) { selectionBusy.current = false; setSelecting(false); } }
  }
  async function selectInput(filename: string) {
    const token = ++inputRequest.current;
    setInput(filename); setError('');
    clearTrace('Starting tapes changed. Load a new trace.');
    if (!filename || !lifetime.current) return;
    const controller = lifetime.current;
    try {
      const result = await api.input(filename, controller.signal);
      if (!controller.signal.aborted && token === inputRequest.current) {
        setSetup(result.source); clearTrace('Starting tapes changed. Load a new trace.');
      }
    } catch (error) { if (!controller.signal.aborted && token === inputRequest.current) setError(errorMessage(error)); }
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
    } catch (error) { setError(errorMessage(error)); }
  }
  async function run() {
    if (!diagram?.valid || !lifetime.current || selectionBusy.current) return;
    clearTrace('Computing bounded trace…');
    const token = simulation.current, controller = lifetime.current;
    setRunning(true);
    try {
      const result = await api.simulate(diagram.revision, setup, maxSteps, controller.signal);
      if (controller.signal.aborted || token !== simulation.current) return;
      if (result.revision !== revision.current) throw new Error('Machine changed. Load a new trace.');
      setTrace(result); setMessage('');
    } catch (error) { if (!controller.signal.aborted && token === simulation.current) setMessage(errorMessage(error)); }
    finally { if (!controller.signal.aborted && token === simulation.current) setRunning(false); }
  }
  return {
    diagram, machine: diagram?.valid ? diagram : null, library, setup, input, maxSteps, trace, message, error: error || connectionError || libraryError,
    connected, selecting, running, selectMachine, selectInput, changeSetup, importFile, run,
    changeMaxSteps: (value: number) => {setMaxSteps(value); clearTrace('Step limit changed. Load a new trace.');},
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
