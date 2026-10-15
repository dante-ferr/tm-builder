export type Theme = 'system' | 'light' | 'dark';
export type MachineModel = 'deterministic' | 'nondeterministic';
export interface Diagnostic {line: number; column: number; message: string; severity: string}
interface Snapshot {revision: string; path: string; diagnostics: Diagnostic[]}
export interface Machine extends Snapshot {
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
export interface Trace {
  revision: string;
  model: MachineModel;
  status: 'ACCEPT' | 'REJECT' | 'HALT' | 'RUNNING';
  reason: string;
  frames: Frame[];
}
export interface ExportOptions {
  format: 'image' | 'csv' | 'tex';
  style: 'readable' | 'formal';
  language: 'english' | 'portuguese';
  layout: 'split' | 'long';
  dpi: number;
  name: string;
}
