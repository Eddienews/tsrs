// TSRS from a phone: the app over Tailscale (`tailscale serve`), opened once
// with a key, and Web Push notifications (the night shift's dailies), with no
// account anywhere.
//
// Access. This computer, asking for itself by its own name (a loopback client
// AND a loopback Host), needs no key. Anything else needs the key: a cookie set
// by opening /?key=… once (the link `tsrs access` prints), or an X-TSRS-Key
// header. `tailscale serve` connects from loopback but under its .ts.net name,
// so it is asked for the key too — that is the point. The key is one random
// string per TSRS folder, readable by its owner only; rotating it signs every
// phone out.
//
// Push. TSRS's own VAPID keys, and each message encrypted for its subscription
// as RFC 8291 says (aes128gcm), with Node's crypto only. Only the real push
// services are written to; a subscription they no longer know is dropped.
//
// After Imagination Studio's access key and push (Keys, Sam Wasserman;
// Apache-2.0): see CREDITS.md.

import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const KEY_FILE = '.tsrs-access-key'
export const VAPID_FILE = '.tsrs-vapid.json'
export const PUSH_FILE = '.tsrs-push.json'
export const COOKIE = 'tsrs_key'
const YEAR = 400 * 24 * 3600

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')

async function writePrivate(file, text) {
  await writeFile(`${file}.tmp`, text, { mode: 0o600 })
  await rename(`${file}.tmp`, file)
  await chmod(file, 0o600).catch(() => {})
}

// The key of this TSRS folder: made once, kept.
export async function accessKey(root, { rotate = false } = {}) {
  const file = join(root, KEY_FILE)
  if (!rotate) {
    try {
      const key = (await readFile(file, 'utf8')).trim()
      if (key.length >= 24) return key
    } catch {
      // none yet
    }
  }
  await mkdir(root, { recursive: true })
  const key = b64url(randomBytes(24))
  await writePrivate(file, key)
  return key
}

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
export function hostName(host) {
  const h = String(host ?? '').toLowerCase()
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1)
  return h.split(':')[0]
}
// This computer asking for itself by its own name.
export function isLocal(req) {
  return LOOPBACK_IPS.has(req.socket?.remoteAddress ?? '') && LOOPBACK_NAMES.has(hostName(req.headers?.host))
}

function cookies(req) {
  const out = {}
  for (const part of String(req.headers?.cookie ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim())
  }
  return out
}

export const sameKey = (a, b) => {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && y.length > 0 && timingSafeEqual(x, y)
}

const LOCKED = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TSRS</title><body style="font:16px system-ui;background:#0b0d12;color:#e6e6e6;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:28em;padding:24px"><h1 style="font-size:20px">TSRS asks for its key</h1>
<p>Open the link that <code>tsrs access</code> prints on the computer running TSRS. It is needed once on each phone.</p></div>`

// The middleware: next() when allowed; 401 otherwise. `key()` gives the key.
export function accessGate(key, { secure = () => true } = {}) {
  return async (req, res, next) => {
    if (isLocal(req)) return next()
    const want = await key()
    const url = new URL(req.url ?? '/', 'http://tsrs.local')
    const given = url.searchParams.get('key')
    if (given !== null) {
      if (!sameKey(given, want)) return locked(res)
      url.searchParams.delete('key')
      res.writeHead(302, {
        'Set-Cookie': `${COOKIE}=${encodeURIComponent(want)}; Path=/; Max-Age=${YEAR}; HttpOnly; SameSite=Lax${secure(req) ? '; Secure' : ''}`,
        Location: `${url.pathname}${url.search}` || '/',
        'Cache-Control': 'no-store',
      })
      return res.end()
    }
    if (sameKey(cookies(req)[COOKIE], want) || sameKey(req.headers['x-tsrs-key'], want)) return next()
    return locked(res)
  }
}
function locked(res) {
  res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(LOCKED)
}

// ---- Web Push ---------------------------------------------------------------

export async function vapidKeys(root) {
  const file = join(root, VAPID_FILE)
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'))
    if (saved.publicKey && saved.privateJwk) return saved
  } catch {
    // make them
  }
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' })
  const keys = { publicKey: b64url(Buffer.concat([Buffer.from([4]), unb64url(jwk.x), unb64url(jwk.y)])), privateJwk: privateKey.export({ format: 'jwk' }) }
  await mkdir(root, { recursive: true })
  await writePrivate(file, JSON.stringify(keys, null, 2))
  return keys
}

// The VAPID Authorization header for a push service's origin.
export function vapidHeader(keys, endpoint, { contact = process.env.TSRS_PUSH_CONTACT || 'https://github.com/Eddienews/tsrs', now = Date.now() } = {}) {
  const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const body = b64url(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: contact }))
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey({ key: keys.privateJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' })
  return `vapid t=${head}.${body}.${b64url(signature)}, k=${keys.publicKey}`
}

// RFC 8291: the message for one subscription, as one aes128gcm record.
export function encryptPush(payload, subscription, { salt = randomBytes(16), ecdh = null } = {}) {
  const uaPublic = unb64url(subscription.keys.p256dh)
  const auth = unb64url(subscription.keys.auth)
  if (!ecdh) {
    ecdh = createECDH('prime256v1')
    ecdh.generateKeys()
  }
  const asPublic = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(uaPublic)
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32))
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

// Only the push services of the browsers.
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /^android\.googleapis\.com$/]
export const pushAllowed = (endpoint) => {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && PUSH_HOSTS.some((p) => p.test(u.hostname))
  } catch {
    return false
  }
}

async function readSubs(root) {
  try {
    return JSON.parse(await readFile(join(root, PUSH_FILE), 'utf8'))
  } catch {
    return []
  }
}
async function saveSubs(root, subs) {
  await writePrivate(join(root, PUSH_FILE), JSON.stringify(subs, null, 2))
}

export async function addSubscription(root, sub, label = '') {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('Not a push subscription.')
  if (!pushAllowed(sub.endpoint)) throw new Error('That push service is not one TSRS writes to.')
  const subs = (await readSubs(root)).filter((s) => s.endpoint !== sub.endpoint)
  subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, label: String(label).slice(0, 80), added: new Date().toISOString() })
  await saveSubs(root, subs)
  return subs.length
}

// Sends { title, body, url } to every subscribed device; drops the gone ones.
export async function notifyAll(root, message, { fetchImpl = fetch } = {}) {
  const subs = await readSubs(root)
  if (!subs.length) return { sent: 0, devices: 0 }
  const keys = await vapidKeys(root)
  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url ?? '/' })
  let sent = 0
  const keep = []
  for (const sub of subs) {
    if (!pushAllowed(sub.endpoint)) continue
    try {
      const res = await fetchImpl(sub.endpoint, {
        method: 'POST',
        headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal', Authorization: vapidHeader(keys, sub.endpoint) },
        body: encryptPush(payload, sub),
        redirect: 'error',
      })
      if (res.status === 404 || res.status === 410) continue
      if (res.ok) sent++
      keep.push(sub)
    } catch {
      keep.push(sub)
    }
  }
  if (keep.length !== subs.length) await saveSubs(root, keep)
  return { sent, devices: keep.length }
}

// GET /__tsrs/push/key · POST /__tsrs/push/subscribe { subscription, label } · POST /__tsrs/push/test
export function pushHandler(root) {
  return async (req, res, next) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    const path = new URL(req.url ?? '/', 'http://x').pathname
    try {
      if (req.method === 'GET' && path === '/key') return json(200, { publicKey: (await vapidKeys(root)).publicKey, devices: (await readSubs(root)).length })
      if (req.method !== 'POST') return next()
      // Only the app itself, never another site's page.
      const origin = req.headers.origin
      if (origin && hostName(new URL(origin).host) !== hostName(req.headers.host)) return json(403, { error: 'Not from this TSRS.' })
      if (!String(req.headers['content-type'] ?? '').includes('application/json')) return json(415, { error: 'JSON only.' })
      const chunks = []
      let size = 0
      for await (const c of req) {
        size += c.length
        if (size > 16 * 1024) return json(413, { error: 'Too large.' })
        chunks.push(c)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      if (path === '/subscribe') return json(200, { devices: await addSubscription(root, body.subscription, body.label) })
      if (path === '/test') return json(200, await notifyAll(root, { title: 'TSRS', body: 'Notifications work on this device.', url: '/' }))
      return next()
    } catch (error) {
      return json(400, { error: error.message })
    }
  }
}
