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
