// A take's lines in a cloned voice: the take's sound goes through ElevenLabs'
// voice changer (speech-to-speech), which keeps the timing, so the mouth still
// matches. The picture is not touched; the take's own sound is kept beside it
// (takes/<name>.h3.mp4), so it can be done again with another voice.
//
// The key is ELEVENLABS_API_KEY, read from the environment (on Windows also
// from the user's saved variables, so a key saved with setx works without
// restarting TSRS). It is never written, logged or put in an error.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const STS_MODEL = 'eleven_multilingual_sts_v2'
export const VOICE_ID = /^[A-Za-z0-9]{12,40}$/
const API = 'https://api.elevenlabs.io/v1'

export function elevenKey(env = process.env, platform = process.platform) {
  if (env.ELEVENLABS_API_KEY) return env.ELEVENLABS_API_KEY
  if (platform !== 'win32') return null
  const r = spawnSync('reg', ['query', 'HKCU\\Environment', '/v', 'ELEVENLABS_API_KEY'], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
  return /ELEVENLABS_API_KEY\s+REG_(?:EXPAND_)?SZ\s+(\S+)/.exec(r.stdout ?? '')?.[1] ?? null
}

export class RevoiceError extends Error {
  constructor(message, { key = false } = {}) {
    super(message)
    this.key = key
  }
}

function meanVolume(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr ?? '')
  return m ? Number(m[1]) : null
}

// The voice of the lines in `file` (a take's mp4) becomes `voice`. With `from`,
// the sound is taken from that file instead (the take's own, when a take is
// done again). Returns { gain, original }.
export async function revoice(file, { voice, from, key = elevenKey(), ffmpeg = 'ffmpeg', fetch = globalThis.fetch, model = STS_MODEL } = {}) {
  if (!key) throw new RevoiceError('No ElevenLabs key: save it as ELEVENLABS_API_KEY (on Windows: setx ELEVENLABS_API_KEY "...").', { key: true })
  if (!VOICE_ID.test(String(voice ?? ''))) throw new RevoiceError(`"${voice}" is not an ElevenLabs voice id.`)
  const original = file.replace(/\.mp4$/i, '.h3.mp4')
  const source = from ?? (existsSync(original) ? original : file)
  const work = await mkdtemp(join(tmpdir(), 'tsrs-revoice-'))
  try {
    const wav = join(work, 'lines.wav')
    const x = spawnSync(ffmpeg, ['-v', 'error', '-y', '-i', source, '-vn', '-ac', '1', '-ar', '44100', wav], { encoding: 'utf8' })
    if (x.status !== 0 || !existsSync(wav)) throw new RevoiceError('The take has no sound to change.')

    const form = new FormData()
    form.append('audio', new Blob([await readFile(wav)], { type: 'audio/wav' }), 'lines.wav')
    form.append('model_id', model)
    form.append('remove_background_noise', 'false')
    const r = await fetch(`${API}/speech-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key }, body: form })
    if (r.status === 401 || r.status === 403) throw new RevoiceError(`ElevenLabs refused the key (HTTP ${r.status}): check ELEVENLABS_API_KEY and its permissions. Not trying again.`, { key: true })
    if (!r.ok) throw new RevoiceError(`ElevenLabs answered HTTP ${r.status}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)}`)
    const mp3 = join(work, 'voice.mp3')
    await writeFile(mp3, Buffer.from(await r.arrayBuffer()))

    // As loud as the take was, within reason.
    const before = meanVolume(ffmpeg, wav)
    const after = meanVolume(ffmpeg, mp3)
    const gain = before !== null && after !== null ? Math.max(-6, Math.min(9, Math.round((before - after) * 10) / 10)) : 0
    const out = join(work, 'take.mp4')
    const m = spawnSync(ffmpeg, [
      '-v', 'error', '-y', '-i', source, '-i', mp3, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-af', `volume=${gain}dB,apad`, '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', out,
    ], { encoding: 'utf8' })
    if (m.status !== 0) throw new RevoiceError(`ffmpeg could not put the voice in: ${(m.stderr ?? '').slice(-300)}`)

    if (!existsSync(original)) await copyFile(file, original)
    await rename(out, file).catch(async () => {
      await copyFile(out, file)
    })
    return { gain, original }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
