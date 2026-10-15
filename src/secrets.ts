import type { Settings } from './types'

// Secrets kept in the vault: provider keys by provider id; MCP tokens and
// media service keys by id under a prefix; the sync passwords.
const MCP_SECRET = 'mcp:'
const SYNC_SECRET = 'sync:password'
const WEBDAV_SECRET = 'sync:webdav'
const S3_SECRET = 'sync:s3'
const MEDIA_SECRET = 'media:'

export function withoutKeys(settings: Settings): Settings {
  return {
    ...settings,
    providers: Object.fromEntries(
      Object.entries(settings.providers).map(([id, p]) => [id, { ...p, apiKey: '' }]),
    ),
    mcpServers: settings.mcpServers.map((server) => ({ ...server, token: '' })),
    mediaKeys: {},
    sync: {
      ...settings.sync,
      password: '',
      webdav: settings.sync.webdav && { ...settings.sync.webdav, password: '' },
      s3: settings.sync.s3 && { ...settings.sync.s3, secretKey: '' },
    },
  }
}

export function keysOf(settings: Settings): Record<string, string> {
  return Object.fromEntries([
    ...Object.entries(settings.providers)
      .filter(([, p]) => p.apiKey)
      .map(([id, p]) => [id, p.apiKey]),
    ...settings.mcpServers.filter((s) => s.token).map((s) => [MCP_SECRET + s.id, s.token]),
    ...(settings.sync.password ? [[SYNC_SECRET, settings.sync.password]] : []),
    ...(settings.sync.webdav?.password ? [[WEBDAV_SECRET, settings.sync.webdav.password]] : []),
    ...(settings.sync.s3?.secretKey ? [[S3_SECRET, settings.sync.s3.secretKey]] : []),
    ...Object.entries(settings.mediaKeys)
      .filter(([, key]) => key)
      .map(([id, key]) => [MEDIA_SECRET + id, key]),
  ])
}

export function withKeys(settings: Settings, keys: Record<string, string>): Settings {
  return {
    ...settings,
    providers: Object.fromEntries(
      Object.entries(settings.providers).map(([id, p]) => [id, { ...p, apiKey: keys[id] ?? '' }]),
    ),
    mcpServers: settings.mcpServers.map((server) => ({
      ...server,
      token: keys[MCP_SECRET + server.id] ?? '',
    })),
    mediaKeys: Object.fromEntries(
      Object.entries(keys)
        .filter(([name]) => name.startsWith(MEDIA_SECRET))
        .map(([name, key]) => [name.slice(MEDIA_SECRET.length), key]),
    ),
    sync: {
      ...settings.sync,
      password: keys[SYNC_SECRET] ?? '',
      webdav: settings.sync.webdav && { ...settings.sync.webdav, password: keys[WEBDAV_SECRET] ?? '' },
      s3: settings.sync.s3 && { ...settings.sync.s3, secretKey: keys[S3_SECRET] ?? '' },
    },
  }
}
