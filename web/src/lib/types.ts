export type Theme = 'system' | 'light' | 'dark';
export type MachineModel = 'deterministic' | 'nondeterministic';
export interface Diagnostic {line: number; column: number; message: string; severity: string}
interface Snapshot {revision: string; path: string; diagnostics: Diagnostic[]}
export interface Rule {from: string; to: string; tapes: [string, string, 'L' | 'R' | 'S'][]}
export interface MachineDefinition {
  name: string; model: MachineModel; tapes: number; blank: string;
  input_alphabet: string[]; tape_alphabet: string[]; states: string[];
  start: string; accept: string[]; reject: string[]; inputs?: string[];
  groups: Record<string, string[]>;
  transitions: Rule[];
}
export interface Machine extends Snapshot {
  source: string;
  can_undo: boolean;
  can_redo: boolean;
  definition: MachineDefinition;
  valid: true;
  name: string;
  filename: string;
  mode: string;
  model: MachineModel;
  tapes: number;
  states: string[];
  dot: string;
}
export type Diagram = Machine | (Snapshot & {valid: false});
export interface LibraryEntry {filename: string; example: boolean}
export interface Library {machines: LibraryEntry[]; inputs: LibraryEntry[]}
export interface MachineSource {filename: string; source?: string}
export interface Transition {index: number; source: string; to: string; tapes: [string, string, 'L' | 'R' | 'S'][]}
export interface Tape {head: number; left: number; cells: string[]}
export interface Frame {state: string; step: number; tapes: Tape[]; transition?: Transition}
export interface Recording {
  blank: string; start: string;
  initial: {head: number; cells: [number, string][]}[];
  rules: Transition[];
  steps: number[] | Uint32Array;
}
export interface TimelineIndex {
  heads: Float64Array[];
  cells: Map<number, {steps: number[]; symbols: string[]}>[];
}
export interface ExecutionLimits {
  default_max_steps: number; maximum: number; target_seconds: number;
  sample_steps: number; sample_seconds: number;
}
export interface Trace {
  revision: string;
  model: MachineModel;
  status: 'ACCEPT' | 'REJECT' | 'HALT' | 'RUNNING';
  reason: string;
  frames: Frame[];
  recording?: Recording;
  timeline?: TimelineIndex;
}
export interface ExportOptions {
  format: 'image' | 'csv' | 'tex';
  style: 'readable' | 'formal';
  language: 'english' | 'portuguese';
  layout: 'split' | 'long';
  dpi: number;
  name: string;
}
