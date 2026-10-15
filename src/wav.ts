// Small audio helpers for the local voices, kept apart from the workers so
// they can be tested.

// Sentences grouped up to about `size` characters, so a long text is said in
// pieces the voice model handles well.
export function sentenceGroups(text: string, size = 400): string[] {
  const sentences = text.trim().match(/[^.!?…\n]+[.!?…]*\s*/g) ?? []
  const out: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current && (current + sentence).length > size) {
      out.push(current.trim())
      current = ''
    }
    current += sentence
  }
  if (current.trim()) out.push(current.trim())
  return out
}

// 16-bit mono WAV from the pieces of sound, one after the other.
export function pcmToWav(parts: Float32Array[], sampleRate: number): ArrayBuffer {
  const length = parts.reduce((sum, p) => sum + p.length, 0)
  const view = new DataView(new ArrayBuffer(44 + length * 2))
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, length * 2, true)
  let at = 44
  for (const part of parts) {
    for (const sample of part) {
      const s = Math.max(-1, Math.min(1, sample))
      view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      at += 2
    }
  }
  return view.buffer
}

// Mono samples at `rate`, from any audio file the browser can decode.
export async function decodeMono(audio: Blob, rate: number): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, 1, rate)
  const decoded = await context.decodeAudioData(await audio.arrayBuffer())
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0)
  const out = new Float32Array(decoded.length)
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c)
    for (let i = 0; i < out.length; i++) out[i] += channel[i] / decoded.numberOfChannels
  }
  return out
}
