// Notifications from TSRS on this device (the night shift's dailies): a
// push-only service worker (public/push-sw.js) and a subscription the TSRS
// server keeps (server/access.mjs). Needs a secure page: localhost, or the
// phone over Tailscale (https).

export type PushState = 'unsupported' | 'insecure' | 'denied' | 'off' | 'on'

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration('/__tsrs/push/')) ?? navigator.serviceWorker.register('/push-sw.js', { scope: '/__tsrs/push/' })
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration('/__tsrs/push/')
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`/__tsrs/push/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(String(data.error ?? res.status))
  return data
}

export async function enablePush(label: string): Promise<number> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied')
  const { publicKey } = (await (await fetch('/__tsrs/push/key')).json()) as { publicKey: string }
  const reg = await registration()
  await navigator.serviceWorker.ready
  const subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  const { devices } = await post('subscribe', { subscription: subscription.toJSON(), label })
  return Number(devices) || 1
}

export async function testPush(): Promise<number> {
  const { sent } = await post('test', {})
  return Number(sent) || 0
}
