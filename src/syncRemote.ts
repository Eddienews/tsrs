import { t } from './i18n'
import type { SyncStore } from './sync'
import type { S3Sync, WebdavSync } from './types'
import { decodeXml } from './xml'

// Syncing without a folder, for browsers that cannot reach one (Firefox,
// Safari): files kept on a WebDAV server or in an S3-compatible bucket of the
// user's own. Both must accept calls from the app's address (CORS), or be
// reached through the local proxy.

// The request goes through the local proxy when there is one.
function via(proxy: string | undefined, url: string): string {
  return proxy ? `${proxy.replace(/\/+$/, '')}/${url}` : url
}

async function call(url: string, init: RequestInit, proxy?: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(via(proxy, url), { cache: 'no-store', ...init })
  } catch {
    throw new Error(
      proxy
        ? t('Não foi possível conectar ao proxy local em {url}. Inicie-o com npm run proxy.', { url: proxy })
        : t('Não foi possível conectar a {host}. O servidor precisa aceitar chamadas deste endereço (CORS), ou use o proxy local.', {
            host: new URL(url).host,
          }),
    )
  }
  return res
}

async function fail(res: Response, what: string): Promise<Error> {
  if (res.status === 401 || res.status === 403) {
    return new Error(t('O servidor recusou o acesso ({status}). Confira o usuário e a senha ou as chaves.', { status: res.status }))
  }
  const text = (await res.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return new Error(`${what}: ${res.status}${text ? ` ${text.slice(0, 200)}` : ''}`)
}


function utf8Base64(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// ── WebDAV ──────────────────────────────────────────────────────────────────

// File names in a PROPFIND answer, leaving out folders.
export function parsePropfind(xml: string): string[] {
  const names: string[] = []
  for (const response of xml.split(/<(?:[\w-]+:)?response[\s>]/).slice(1)) {
    const href = /<(?:[\w-]+:)?href>([^<]*)<\//.exec(response)?.[1]
    if (!href || /<(?:[\w-]+:)?collection\s*\/?>/.test(response)) continue
    const path = decodeXml(href).replace(/\/+$/, '')
    const name = path.slice(path.lastIndexOf('/') + 1)
    try {
      names.push(decodeURIComponent(name))
    } catch {
      names.push(name)
    }
  }
  return names
}

export function webdavStore(config: WebdavSync, proxy?: string): SyncStore {
  const base = config.url.trim().replace(/\/*$/, '/')
  const headers: Record<string, string> = config.user
    ? { Authorization: `Basic ${utf8Base64(`${config.user}:${config.password}`)}` }
    : {}
  const fileUrl = (name: string) => base + encodeURIComponent(name)
  return {
    async list() {
      const body =
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'
      const init = {
        method: 'PROPFIND',
        headers: { ...headers, Depth: '1', 'Content-Type': 'application/xml' },
        body,
      }
      let res = await call(base, init, proxy)
      if (res.status === 404) {
        // The folder does not exist yet: it is created, empty.
        const made = await call(base, { method: 'MKCOL', headers }, proxy)
        if (!made.ok) throw await fail(made, t('Não foi possível criar a pasta no servidor'))
        res = await call(base, init, proxy)
      }
      if (!res.ok) throw await fail(res, t('Não foi possível listar a pasta no servidor'))
      return parsePropfind(await res.text())
    },
    async read(name) {
      const res = await call(fileUrl(name), { headers }, proxy)
      if (!res.ok) throw await fail(res, name)
      return res.text()
    },
    async write(name, text) {
      const init = {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: text,
      }
      const res = await call(fileUrl(name), init, proxy)
      if (!res.ok) throw await fail(res, name)
    },
    async remove(name) {
      const res = await call(fileUrl(name), { method: 'DELETE', headers }, proxy)
      if (!res.ok && res.status !== 404) throw await fail(res, name)
    },
  }
}

// ── S3 ──────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder()

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

async function hmac(key: ArrayBuffer | Uint8Array<ArrayBuffer>, text: string): Promise<ArrayBuffer> {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return crypto.subtle.sign('HMAC', imported, encoder.encode(text))
}

// RFC 3986 encoding, as Signature Version 4 wants it.
function encode(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export interface SignInput {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
  accessKey: string
  secretKey: string
  region: string
  // When the request is signed, as 20130524T000000Z.
  date: string
}

// The headers that sign an S3 request (AWS Signature Version 4): the ones
// given, plus x-amz-date, x-amz-content-sha256 and Authorization.
export async function signS3(input: SignInput): Promise<Record<string, string>> {
  const url = new URL(input.url)
  const payload = await sha256(input.body ?? '')
  const headers: Record<string, string> = {
    ...input.headers,
    'x-amz-content-sha256': payload,
    'x-amz-date': input.date,
  }
  const signed: Record<string, string> = { host: url.host }
  for (const [name, value] of Object.entries(headers)) signed[name.toLowerCase()] = value.trim()
  const names = Object.keys(signed).sort()
  const query = [...url.searchParams]
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  const path = url.pathname
    .split('/')
    .map((segment) => encode(decodeURIComponent(segment)))
    .join('/')
  const canonical = [
    input.method,
    path,
    query,
    names.map((name) => `${name}:${signed[name]}\n`).join(''),
    names.join(';'),
    payload,
  ].join('\n')
  const day = input.date.slice(0, 8)
  const scope = `${day}/${input.region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', input.date, scope, await sha256(canonical)].join('\n')
  let key = await hmac(encoder.encode(`AWS4${input.secretKey}`), day)
  for (const part of [input.region, 's3', 'aws4_request']) key = await hmac(key, part)
  const signature = hex(await hmac(key, toSign))
  return {
    ...headers,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, ` +
      `SignedHeaders=${names.join(';')}, Signature=${signature}`,
  }
}

function amzDate(): string {
  return new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')
}

// The bucket's address: path-style on a custom endpoint (MinIO, R2, B2…),
// virtual-hosted on AWS itself.
export function bucketUrl(config: S3Sync): string {
  const endpoint = config.endpoint.trim().replace(/\/+$/, '')
  if (endpoint) return `${/^https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`}/${config.bucket}`
  return `https://${config.bucket}.s3.${config.region || 'us-east-1'}.amazonaws.com`
}

export function s3Store(config: S3Sync, proxy?: string): SyncStore {
  const base = bucketUrl(config)
  const prefix = config.prefix.trim().replace(/^\/+|\/+$/g, '')
  const keyOf = (name: string) => (prefix ? `${prefix}/${name}` : name)
  const objectUrl = (name: string) => `${base}/${keyOf(name).split('/').map(encode).join('/')}`
  const send = async (method: string, url: string, body?: string, headers?: Record<string, string>) => {
    const signed = await signS3({
      method,
      url,
      body,
      headers,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region || 'us-east-1',
      date: amzDate(),
    })
    return call(url, { method, headers: signed, body }, proxy)
  }
  return {
    async list() {
      const names: string[] = []
      let token = ''
      do {
        const query = new URLSearchParams({ 'list-type': '2', prefix: prefix ? `${prefix}/` : '' })
        if (token) query.set('continuation-token', token)
        const res = await send('GET', `${base}/?${query}`)
        if (!res.ok) throw await fail(res, t('Não foi possível listar o bucket'))
        const xml = await res.text()
        for (const [, key] of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) {
          const name = decodeXml(key).slice(prefix ? prefix.length + 1 : 0)
          if (name && !name.includes('/')) names.push(name)
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? decodeXml(/<NextContinuationToken>([^<]*)</.exec(xml)?.[1] ?? '')
          : ''
      } while (token)
      return names
    },
    async read(name) {
      const res = await send('GET', objectUrl(name))
      if (!res.ok) throw await fail(res, name)
      return res.text()
    },
    async write(name, text) {
      const res = await send('PUT', objectUrl(name), text, { 'content-type': 'application/json' })
      if (!res.ok) throw await fail(res, name)
    },
    async remove(name) {
      const res = await send('DELETE', objectUrl(name))
      if (!res.ok && res.status !== 404) throw await fail(res, name)
    },
  }
}
