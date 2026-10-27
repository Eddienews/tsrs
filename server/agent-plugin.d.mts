import type { Plugin } from 'vite'

export function localUrl(address: unknown, https?: boolean): string | null
export function tsrsAgent(agendaFor?: (server: any) => any): Plugin
