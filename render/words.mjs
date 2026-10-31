// When each word of a narration is said, for captions and for animations that
// land on a word (NWLab.word in the runtime). Two sources:
//
//   whisper   Whisper's word timestamps (render/whisper.mjs, on this computer,
//             free), laid onto the script's own words by aligning their
//             letters, so a misheard "clinica sorizo" still gives the times of
//             "Clínica Sorriso";
//   pauses    without Whisper: the words spread over the time the voice is
//             actually speaking (ffmpeg's silence detection), by their length.
//
// Either way the result is the script's words: [{ w, t, end }] in seconds from
// the start of the audio file.

import { spawnSync } from 'node:child_process'

export function fold(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// The script's words, as written (punctuation kept on the word).
export function scriptWords(text) {
  return String(text).split(/\s+/).filter((w) => fold(w))
}

export function ffprobePath(ffmpeg = 'ffmpeg') {
  return /ffmpeg(\.exe)?$/i.test(ffmpeg) ? ffmpeg.replace(/ffmpeg(\.exe)?$/i, (_, exe) => `ffprobe${exe ?? ''}`) : 'ffprobe'
}

export function audioDuration(file, ffmpeg = 'ffmpeg') {
  const r = spawnSync(ffprobePath(ffmpeg), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  const d = Number.parseFloat(r.stdout)
  if (r.status !== 0 || !Number.isFinite(d)) throw new Error(`cannot read the length of ${file}`)
  return d
}

// The stretches where the voice speaks: [[start, end], ...], from ffmpeg's
// silencedetect (quieter than `noise` for at least `min` seconds is a pause).
export function parseSilences(stderr, duration) {
  const starts = [...stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])))
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]))
  const speech = []
  let at = 0
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] > at + 0.01) speech.push([at, starts[i]])
    at = ends[i] ?? duration
  }
  if (duration > at + 0.01) speech.push([at, duration])
  return speech.length ? speech : [[0, duration]]
}

export function speechSegments(file, ffmpeg = 'ffmpeg', { noise = -38, min = 0.16 } = {}) {
  const duration = audioDuration(file, ffmpeg)
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=n=${noise}dB:d=${min}`, '-f', 'null', '-'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return parseSilences(r.stderr ?? '', duration)
}

// The words spread over the speech by their length (a word's share is its
// letters plus one). Each pause is first matched to the word boundary nearest
// to it in that proportion, preferring one after punctuation, so a sentence
// does not start before the pause that precedes it; then each group of words
// fills its stretch of speech.
export function proportionalWords(text, segments) {
  const words = scriptWords(text)
  if (!words.length) return []
  const weights = words.map((w) => fold(w).length + 1)
  const total = weights.reduce((a, b) => a + b, 0)
  const cum = []
  weights.reduce((acc, w, i) => ((cum[i] = (acc + w) / total), acc + w), 0)
  const speaking = segments.reduce((a, [s, e]) => a + (e - s), 0) || 1
  // Which word ends before each pause (between segment k and k+1).
  const cuts = []
  let at = 0
  let lastWord = -1
  for (let k = 0; k < segments.length - 1; k++) {
    at += segments[k][1] - segments[k][0]
    const p = at / speaking
    let best = -1
    let cost = Infinity
    for (let j = lastWord + 1; j < words.length - 1; j++) {
      const c = Math.abs(cum[j] - p) * (/[.,;:!?…]$/.test(words[j]) ? 0.5 : 1)
      if (c < cost) (cost = c), (best = j)
    }
    // A pause too far from any boundary (or none left) joins its neighbours.
    if (best < 0 || Math.abs(cum[best] - p) > 0.2) cuts.push(null)
    else if (cuts.includes(best)) cuts.push(null)
    else (cuts.push(best), (lastWord = best))
  }
  // Groups of words, each with the stretches of speech it fills.
  const groups = []
  let first = 0
  let segs = [segments[0]]
  for (let k = 0; k < segments.length - 1; k++) {
    if (cuts[k] === null) {
      segs.push(segments[k + 1])
      continue
    }
    groups.push({ from: first, to: cuts[k] + 1, segs })
    first = cuts[k] + 1
    segs = [segments[k + 1]]
  }
  groups.push({ from: first, to: words.length, segs })
  const out = []
  for (const g of groups) {
    const ws = weights.slice(g.from, g.to)
    const sum = ws.reduce((a, b) => a + b, 0) || 1
    const len = g.segs.reduce((a, [s, e]) => a + (e - s), 0)
    const place = (x) => {
      let left = x
      for (const [s, e] of g.segs) {
        if (left <= e - s + 1e-9) return s + left
        left -= e - s
      }
      return g.segs.at(-1)[1]
    }
    let acc = 0
    for (let j = g.from; j < g.to; j++) {
      const a = (acc / sum) * len
      acc += weights[j]
      const b = ((acc - 1) / sum) * len
      out.push({ w: words[j], t: round(place(a)), end: round(Math.max(place(a), place(b))) })
    }
  }
  return out
}

const round = (x) => Math.round(x * 1000) / 1000

// Lays recognized words ([{ text, t, end }]) onto the script's words: both are
// reduced to letters and digits, aligned letter by letter (edit distance), and
// each script word takes the times of its matched letters. Words with no match
// share the time between their neighbours by length.
export function alignWords(text, recognized) {
  const words = scriptWords(text)
  // The script's letters, each with its word.
  const S = []
  const owner = []
  words.forEach((w, i) => {
    for (const ch of fold(w)) {
      S.push(ch)
      owner.push(i)
    }
  })
  // The recognized letters, each with its time, spread inside its word.
  const R = []
  const time = []
  for (const r of recognized) {
    const letters = fold(r.text)
    const t0 = Number(r.t)
    const t1 = Number.isFinite(Number(r.end)) ? Number(r.end) : t0
    for (let k = 0; k < letters.length; k++) {
      R.push(letters[k])
      time.push(t0 + ((t1 - t0) * k) / Math.max(1, letters.length))
    }
  }
  const n = S.length
  const m = R.length
  const first = new Array(words.length).fill(null)
  const last = new Array(words.length).fill(null)
  if (n && m) {
    // Edit distance with a back-pointer table (0 diagonal, 1 up, 2 left).
    const cols = m + 1
    const dist = new Uint32Array((n + 1) * cols)
    const back = new Uint8Array((n + 1) * cols)
    for (let i = 0; i <= n; i++) (dist[i * cols] = i), (back[i * cols] = 1)
    for (let j = 0; j <= m; j++) (dist[j] = j), (back[j] = 2)
    for (let i = 1; i <= n; i++)
      for (let j = 1; j <= m; j++) {
        const diag = dist[(i - 1) * cols + j - 1] + (S[i - 1] === R[j - 1] ? 0 : 1)
        const up = dist[(i - 1) * cols + j] + 1
        const left = dist[i * cols + j - 1] + 1
        const best = Math.min(diag, up, left)
        dist[i * cols + j] = best
        back[i * cols + j] = best === diag ? 0 : best === up ? 1 : 2
      }
    let i = n
    let j = m
    while (i > 0 && j > 0) {
      const b = back[i * cols + j]
      if (b === 0) {
        if (S[i - 1] === R[j - 1]) {
          const w = owner[i - 1]
          const t = time[j - 1]
          first[w] = first[w] === null ? t : Math.min(first[w], t)
          last[w] = last[w] === null ? t : Math.max(last[w], t)
        }
        i--
        j--
      } else if (b === 1) i--
      else j--
    }
  }
  // A recognized word's end is later than its last letter's spread time.
  const ends = recognized.map((r) => Number(r.end)).filter(Number.isFinite)
  const audioEnd = ends.length ? Math.max(...ends) : 0
  const out = words.map((w, k) => ({ w, t: first[k], end: last[k] }))
  for (let k = 0; k < out.length; k++) {
    if (out[k].t !== null) continue
    // A run of words with no match: spread between the neighbours.
    let e = k
    while (e < out.length && out[e].t === null) e++
    const from = k > 0 ? out[k - 1].end : 0
    const to = e < out.length ? out[e].t : audioEnd || from
    const run = out.slice(k, e)
    const weights = run.map((x) => fold(x.w).length + 1)
    const total = weights.reduce((a, b) => a + b, 0)
    let acc = 0
    for (const [q, x] of run.entries()) {
      x.t = from + ((to - from) * acc) / total
      acc += weights[q]
      x.end = from + ((to - from) * (acc - 1)) / total
    }
    k = e - 1
  }
  // Each word lasts until the next begins, at most 0.6 s past its last letter.
  for (let k = 0; k < out.length; k++) {
    const next = k + 1 < out.length ? out[k + 1].t : Math.max(out[k].end + 0.3, audioEnd)
    out[k].end = Math.max(out[k].t, Math.min(next, out[k].end + 0.6))
    out[k].t = round(out[k].t)
    out[k].end = round(out[k].end)
  }
  return out
}

// The words of each narration file: [{ text, audio }] → [{ words, source, duration }].
// `whisper` is { model, language } to try Whisper first, or false.
export async function wordTimings(lines, { ffmpeg = 'ffmpeg', whisper = false, log = () => {} } = {}) {
  let heard = null
  if (whisper) {
    try {
      const { transcribeWords } = await import('./whisper.mjs')
      heard = await transcribeWords(lines.map((l) => l.audio), { ...whisper, ffmpeg, log })
    } catch (error) {
      log(`Whisper could not run (${error.message.split('\n')[0]}); the words follow the pauses instead.`)
      heard = null
    }
  }
  return lines.map((line, i) => {
    const duration = audioDuration(line.audio, ffmpeg)
    if (heard?.[i]?.length) return { words: alignWords(line.text, heard[i]), source: 'whisper', duration }
    return { words: proportionalWords(line.text, speechSegments(line.audio, ffmpeg)), source: 'pauses', duration }
  })
}
