import { withoutKeys } from './secrets'
import { ACTIVE_PROFILE, DEFAULT_PROFILE } from './storage'
import type { Settings } from './types'

// The automatic backup on disk (server/backups.mjs): the browser's storage can
// be wiped by a cleanup, so a few seconds after every change the conversations,
// the library and the settings are written to the TSRS folder too. API keys go
// only sealed with the user's password; without a password they stay out.

export const BACKUPS_PATH = '/__tsrs/backups'
// Each profile's backups go to a folder of their own.
const PROFILE = ACTIVE_PROFILE === DEFAULT_PROFILE ? '' : `?profile=${encodeURIComponent(ACTIVE_PROFILE)}`
// Saved this long after the last change, and at least this often while
// changes keep coming (a long reply streaming, say).
export const BACKUP_DELAY = 5_000
export const BACKUP_MAX_WAIT = 60_000

export interface BackupMeta {
  savedAt: number
  day: string
  chats: number
  keys: 'sealed' | 'none'
  size: number
}

export type BackupStatus = { off: true } | { off?: false; dir: string; latest: BackupMeta | null }

export interface AutoBackupState {
  // off: turned off here or on the server; unavailable: no TSRS server.
  state: 'off' | 'unavailable' | 'idle' | 'saving' | 'saved' | 'error'
  dir?: string
  latest?: BackupMeta | null
  error?: string
  // Whether the browser promised to keep this site's data; null when unknown.
  persisted?: boolean | null
}

// The settings as they go to disk: from what the browser stores, which with a
// password holds the keys only in the sealed vault; plain keys never leave.
export function settingsForBackup(stored: string | null): Partial<Settings> | undefined {
  try {
    const settings = JSON.parse(stored ?? 'null') as Settings | null
    if (!settings) return undefined
    // withoutKeys keeps the sealed vault, when there is one.
    return withoutKeys(settings)
  } catch {
    return undefined
  }
}

// What a restore can bring back: offered only when this browser has no
// conversations and the disk has some.
export function backupToOffer(localChats: number, status: BackupStatus | null): BackupMeta | null {
  if (localChats > 0 || !status || status.off || !status.latest) return null
  return status.latest.chats > 0 ? status.latest : null
}

export async function backupStatus(): Promise<BackupStatus | null> {
  try {
    const res = await fetch(`${BACKUPS_PATH}/status${PROFILE}`)
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function saveBackupToDisk(text: string): Promise<BackupMeta> {
  const res = await fetch(`${BACKUPS_PATH}/save${PROFILE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

export async function readLatestBackup(): Promise<string> {
  const res = await fetch(`${BACKUPS_PATH}/latest${PROFILE}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}
