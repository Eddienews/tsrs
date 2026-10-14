import type { SyncStore } from './sync'

// The sync folder, reached through the File System Access API (Chrome, Edge
// and other Chromium browsers). The browser asks before each session whether
// the app may keep using a folder chosen earlier.

type Folder = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
}

export function canPickFolder(): boolean {
  return 'showDirectoryPicker' in window
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as any).showDirectoryPicker
  return picker({ id: 'tsrs-sync', mode: 'readwrite' })
}

// Whether the app may use the folder; `ask` shows the browser's prompt, which
// only works right after a click.
export async function mayUse(folder: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const handle = folder as Folder
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return ask && (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

export function folderStore(folder: FileSystemDirectoryHandle): SyncStore {
  const dir = folder as Folder
  return {
    async list() {
      const names: string[] = []
      for await (const entry of dir.values()) if (entry.kind === 'file') names.push(entry.name)
      return names
    },
    async read(name) {
      return (await (await dir.getFileHandle(name)).getFile()).text()
    },
    async write(name, text) {
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable()
      await writable.write(text)
      await writable.close()
    },
    async remove(name) {
      await dir.removeEntry(name)
    },
  }
}
