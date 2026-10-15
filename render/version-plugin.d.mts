import type { Plugin } from 'vite'

export interface VersionInfo {
  version: string
  commit: string
  branch: string
  dirty: boolean
  date: string
  dev: boolean
}

export function versionInfo(dev: boolean): VersionInfo
export function gitStamp(root?: string): string
export function tsrsVersion(): Plugin
