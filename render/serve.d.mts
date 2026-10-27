import type { Server } from 'node:http'

export interface ServeOptions {
  port: number
  origins: string[]
  folder: string
}

export function serveOptions(argv: string[]): ServeOptions
export function safeStem(name: string): string
export function audioExtension(name: string): string | null
export function defaultFolder(): string
export function startRenderServer(config: ServeOptions, log?: (line: string) => void): Promise<Server>
export function bringProjectFiles(html: string, project: string, into: string): Promise<string[]>
export function renderBusy(): boolean
export function exclusiveRender<T>(work: () => Promise<T>): Promise<T>
export function renderMotion(
  job: { html: string; name?: string; audio?: { name: string; data: string }; project?: string; lufs?: number },
  folder: string,
  log?: (line: string) => void,
  onFrame?: (frame: number, frames: number) => void,
): Promise<string>
