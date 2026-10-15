export interface RenderOptions {
  input: string | null
  out: string | null
  audio: string | null
  fps: number | null
  crf: number
  lufs: number
  online: boolean
  help?: boolean
  // Called after each frame is encoded.
  onFrame?: (done: number, frames: number) => void
}

export function parseArgs(argv: string[]): RenderOptions
export function freeName(wanted: string, exists?: (path: string) => boolean): string
export function insideRoot(root: string, path: string): string | null
export function render(options: RenderOptions, log?: (line: string) => void): Promise<string>
