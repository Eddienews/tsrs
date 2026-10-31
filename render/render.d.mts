export interface RenderOptions {
  input: string | null
  out: string | null
  audio: string | null
  fps: number | null
  crf: number
  lufs: number
  online: boolean
  help?: boolean
  // Browsers capturing side by side (default: about half the processor threads, at most 8).
  workers?: number | null
  // Seconds, instead of the composition's nwlab:duration.
  duration?: number
  // Values the composition reads from NWLab.data (data.timeline: the narration).
  data?: Record<string, unknown>
  // Captions the runtime draws over the frame.
  captions?: { cues: { start: number; end: number; words: { w: string; t: number; end: number }[] }[]; style?: Record<string, unknown> } | null
  // A video the (transparent) frames are laid on.
  background?: string | null
  // false: no <video>.manifest.json.
  manifest?: boolean
  // Called after each frame is encoded.
  onFrame?: (done: number, frames: number) => void
}

export function autoWorkers(frames: number, fps: number, cpus?: number): number
export function splitFrames(frames: number, count: number): [number, number][]

export function parseArgs(argv: string[]): RenderOptions
export function freeName(wanted: string, exists?: (path: string) => boolean): string
export function insideRoot(root: string, path: string): string | null
export function render(options: RenderOptions, log?: (line: string) => void): Promise<string>
