import type { Vault } from './types'

// Password-based encryption for the API keys: PBKDF2 derives an AES-GCM key
// from the password, so the keys at rest are unreadable without it.

const ITERATIONS = 600_000

function encode(bytes: Uint8Array): string {
  // In slices: spreading a large array into one call overflows the stack.
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function decode(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

export function newSalt(): string {
  return encode(crypto.getRandomValues(new Uint8Array(16)))
}

export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: decode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(
  key: CryptoKey,
  salt: string,
  secrets: Record<string, string>,
): Promise<Vault> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(secrets)),
  )
  return { salt, iv: encode(iv), data: encode(new Uint8Array(data)) }
}

// Rejects when the key is wrong: AES-GCM authenticates the ciphertext.
export async function unseal(key: CryptoKey, vault: Vault): Promise<Record<string, string>> {
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(vault.iv) },
    key,
    decode(vault.data),
  )
  return JSON.parse(new TextDecoder().decode(data))
}

// Any text, sealed as JSON with its own IV; for files in the sync folder.
export async function encryptText(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))
  return JSON.stringify({ iv: encode(iv), data: encode(new Uint8Array(data)) })
}

// Rejects when the key is wrong or the text was not sealed with encryptText.
export async function decryptText(key: CryptoKey, sealed: string): Promise<string> {
  const { iv, data } = JSON.parse(sealed)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, key, decode(data))
  return new TextDecoder().decode(plain)
}
