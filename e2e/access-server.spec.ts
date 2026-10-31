import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { accessGate, accessKey, addSubscription, encryptPush, isLocal, notifyAll, pushAllowed, vapidHeader, vapidKeys } from '../server/access.mjs'

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

// A request as the gate sees it.
const req = (host: string, remote: string, extra: Record<string, unknown> = {}) => ({ url: '/', headers: { host }, socket: { remoteAddress: remote }, ...extra }) as any
function answer() {
  const out: any = { status: 0, headers: {}, body: '' }
  return Object.assign(out, {
    writeHead: (s: number, h: Record<string, string>) => ((out.status = s), (out.headers = h)),
    end: (b = '') => (out.body = b),
  })
}

test('the computer itself needs no key; Tailscale and everything else do, once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-access-'))
  const key = await accessKey(root)
  expect(key.length).toBeGreaterThanOrEqual(32)
  expect(await accessKey(root)).toBe(key)
  if (process.platform !== 'win32') expect((await stat(join(root, '.tsrs-access-key'))).mode & 0o777).toBe(0o600)
  expect(isLocal(req('localhost:5173', '127.0.0.1'))).toBe(true)
  expect(isLocal(req('[::1]:5173', '::1'))).toBe(true)
  // tailscale serve: from loopback, but under its own name.
  expect(isLocal(req('pc.tail1234.ts.net', '127.0.0.1'))).toBe(false)
  expect(isLocal(req('localhost:5173', '192.168.0.9'))).toBe(false)

  const gate = accessGate(() => accessKey(root))
  const pass = async (r: any) => {
    const res = answer()
    let through = false
    await gate(r, res, () => (through = true))
    return { through, res }
  }
  expect((await pass(req('localhost:5173', '127.0.0.1'))).through).toBe(true)
  const blocked = await pass(req('pc.tail1234.ts.net', '127.0.0.1'))
  expect(blocked.through).toBe(false)
  expect(blocked.res.status).toBe(401)
  expect(blocked.res.body).toContain('tsrs access')
  expect((await pass(req('pc.tail1234.ts.net', '127.0.0.1', { url: '/?key=wrong' }))).res.status).toBe(401)
  const opened = await pass(req('pc.tail1234.ts.net', '127.0.0.1', { url: `/chat?key=${key}&x=1` }))
  expect(opened.res.status).toBe(302)
  expect(opened.res.headers.Location).toBe('/chat?x=1')
  expect(opened.res.headers['Set-Cookie']).toMatch(new RegExp(`^tsrs_key=${key}; Path=/; Max-Age=\\d+; HttpOnly; SameSite=Lax; Secure$`))
  expect((await pass(req('pc.tail1234.ts.net', '127.0.0.1', { headers: { host: 'pc.tail1234.ts.net', cookie: `a=1; tsrs_key=${key}` } }))).through).toBe(true)
  expect((await pass(req('x', '10.0.0.2', { headers: { host: 'x', 'x-tsrs-key': key } }))).through).toBe(true)
  // Rotating signs the old link out.
  const next = await accessKey(root, { rotate: true })
  expect(next).not.toBe(key)
  expect((await pass(req('pc.tail1234.ts.net', '127.0.0.1', { headers: { host: 'pc.tail1234.ts.net', cookie: `tsrs_key=${key}` } }))).through).toBe(false)
})

test('encrypts a push message as RFC 8291 says, signed with its own VAPID key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-push-'))
  // The browser's side: its key pair and auth secret.
  const ua = createECDH('prime256v1')
  ua.generateKeys()
  const auth = randomBytes(16)
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: b64url(ua.getPublicKey()), auth: b64url(auth) } }
  const body = encryptPush('{"title":"TSRS","body":"3 takes"}', sub)
  // Decrypt it as a browser would.
  const salt = body.subarray(0, 16)
  expect(body.readUInt32BE(16)).toBe(4096)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const shared = ua.computeSecret(asPublic)
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32))
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const data = body.subarray(21 + idlen)
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(data.subarray(data.length - 16))
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()])
  expect(plain.at(-1)).toBe(2)
  expect(plain.subarray(0, -1).toString()).toBe('{"title":"TSRS","body":"3 takes"}')

  const keys = await vapidKeys(root)
  expect(unb64(keys.publicKey)).toHaveLength(65)
  const header = vapidHeader(keys, sub.endpoint, { now: 1_000_000_000_000 })
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
  expect(k).toBe(keys.publicKey)
  const [h, p, s] = jwt.split('.')
  expect(JSON.parse(unb64(p).toString())).toMatchObject({ aud: 'https://fcm.googleapis.com', exp: 1_000_000_000 + 12 * 3600 })
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: keys.privateJwk.x, y: keys.privateJwk.y }, format: 'jwk' })
  expect(verify('sha256', Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: 'ieee-p1363' }, unb64(s))).toBe(true)
})

test('sends to the devices, drops the ones the push service no longer knows, and only to real push services', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-notify-'))
  const ua = createECDH('prime256v1')
  ua.generateKeys()
  const keys = { p256dh: b64url(ua.getPublicKey()), auth: b64url(randomBytes(16)) }
  expect(pushAllowed('https://web.push.apple.com/abc')).toBe(true)
  expect(pushAllowed('https://evil.example.com/push')).toBe(false)
  expect(pushAllowed('http://fcm.googleapis.com/x')).toBe(false)
  await expect(addSubscription(root, { endpoint: 'https://evil.example.com/p', keys })).rejects.toThrow('not one TSRS writes to')
  await addSubscription(root, { endpoint: 'https://fcm.googleapis.com/fcm/send/phone', keys }, 'phone')
  await addSubscription(root, { endpoint: 'https://web.push.apple.com/gone', keys }, 'old iPad')
  const posted: string[] = []
  const fetchImpl = async (url: string, init: any) => {
    posted.push(url)
    expect(init.headers['Content-Encoding']).toBe('aes128gcm')
    expect(init.headers.Authorization).toMatch(/^vapid t=/)
    return new Response(null, { status: url.includes('gone') ? 410 : 201 })
  }
  expect(await notifyAll(root, { title: 'TSRS', body: 'dailies' }, { fetchImpl: fetchImpl as any })).toEqual({ sent: 1, devices: 1 })
  expect(posted).toHaveLength(2)
  expect(JSON.parse(await readFile(join(root, '.tsrs-push.json'), 'utf8')).map((s: any) => s.label)).toEqual(['phone'])
})
