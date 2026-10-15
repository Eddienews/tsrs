import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'

export const RENDER_PATH: string
export function sameOrigin(req: Pick<IncomingMessage, 'headers' | 'method'>): boolean
export function tsrsRenderer(): Plugin
