// The checks a take passes before anyone looks at it, on the CPU:
//
//   wordCheck(script, heard)   the lines the take was asked to say, against what
//                              Whisper heard: redo when under 85 % of the words
//                              are heard, 3 or more in a row are missing, or the
//                              ending is missing; voices in a shot without lines.
//   shotCheck(file, { first, last })   hard cuts inside the shot, whether the
//                              first and last frames held the pictures given,
//                              and the longest stretch without a cut (to trim to).
//
// The policy and thresholds follow Imagination Studio by Keys and Sam Wasserman
// (wordcheck.py, after TensorFold's drama3 verify.py; shot.py), Apache-2.0: see
// CREDITS.md. The shot thresholds were measured on FastH3 at 1280x736 and may
// need tuning on other builds; every number is reported with the verdict.

import { spawnSync } from 'node:child_process'
import { ffprobePath } from '../render/words.mjs'

export const POLICY = { minCoverage: 0.85, maxMissingRun: 2, matchSimilarity: 0.6 }
export const SHOT = { heldDifference: 12, heldLikeness: 0.9, cutLikeness: 0.7, cutRatio: 1.75, cutWindow: 6, cutFloor: 0.5, width: 160 }

// ---- words -------------------------------------------------------------------

const fold = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const EN_ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ')
const EN_TENS = '_ _ twenty thirty forty fifty sixty seventy eighty ninety'.split(' ')
function enNumber(n) {
  if (n < 20) return [EN_ONES[n]]
  if (n < 100) return [EN_TENS[Math.floor(n / 10)], ...(n % 10 ? [EN_ONES[n % 10]] : [])]
  if (n < 1000) return [EN_ONES[Math.floor(n / 100)], 'hundred', ...(n % 100 ? enNumber(n % 100) : [])]
  if (n < 1e6) return [...enNumber(Math.floor(n / 1000)), 'thousand', ...(n % 1000 ? enNumber(n % 1000) : [])]
  return [...enNumber(Math.floor(n / 1e6)), 'million', ...(n % 1e6 ? enNumber(n % 1e6) : [])]
}

const PT_ONES = 'zero um dois tres quatro cinco seis sete oito nove dez onze doze treze catorze quinze dezesseis dezessete dezoito dezenove'.split(' ')
const PT_TENS = '_ _ vinte trinta quarenta cinquenta sessenta setenta oitenta noventa'.split(' ')
const PT_HUNDREDS = '_ cento duzentos trezentos quatrocentos quinhentos seiscentos setecentos oitocentos novecentos'.split(' ')
function ptNumber(n) {
  if (n < 20) return [PT_ONES[n]]
  if (n < 100) return [PT_TENS[Math.floor(n / 10)], ...(n % 10 ? ['e', PT_ONES[n % 10]] : [])]
  if (n === 100) return ['cem']
  if (n < 1000) return [PT_HUNDREDS[Math.floor(n / 100)], ...(n % 100 ? ['e', ...ptNumber(n % 100)] : [])]
  if (n < 1e6) {
    const k = Math.floor(n / 1000)
    const rest = n % 1000
    return [...(k === 1 ? [] : ptNumber(k)), 'mil', ...(rest ? (rest < 100 || rest % 100 === 0 ? ['e'] : []).concat(ptNumber(rest)) : [])]
  }
  const m = Math.floor(n / 1e6)
  return [...ptNumber(m), m === 1 ? 'milhao' : 'milhoes', ...(n % 1e6 ? ptNumber(n % 1e6) : [])]
}

const isPortuguese = (lang) => /^(pt|portug)/i.test(String(lang ?? ''))

// The spoken words of a text: lower case, no accents or punctuation, numbers spelled out.
export function wordsOf(text, lang = 'en') {
  const out = []
  const tokens = String(text ?? '')
    .replace(/<\|[^|]*\|>|\[[^\]]*\]/g, ' ')
    .replace(/%/g, ' percent ')
    .split(/[\s\-–—/]+/)
  for (let raw of tokens) {
    raw = raw.replace(/^[.,!?;:"'()[\]{}…«»“”„*_~`]+|[.,!?;:"'()[\]{}…«»“”„*_~`]+$/g, '')
    if (!raw) continue
    const num = /^(\d{1,3}(?:[.,]\d{3})+|\d+)$/.exec(raw)
    if (num) {
      const n = Number(num[1].replace(/[.,]/g, ''))
      if (Number.isSafeInteger(n) && n < 1e9) {
        out.push(...(isPortuguese(lang) ? ptNumber(n) : enNumber(n)))
        continue
      }
    }
    for (const w of fold(raw).split(/[^\p{L}\p{N}']+/u)) {
      const clean = w.replace(/^'+|'+$/g, '')
      if (clean) out.push(clean)
    }
  }
  return out
}

// 1 for the same word, down to 0: one minus the edit distance over the longer length.
export function similarity(a, b) {
  if (a === b) return 1
  const m = a.length
  const n = b.length
  if (!m || !n) return 0
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return 1 - prev[n] / Math.max(m, n)
}

// Minimum-cost alignment of the script's words (ref) and the heard ones (hyp):
// steps [refIndices, hypIndices]. A near word costs up to 0.4, a different one
// 1.5 (dearer than a missing plus an extra), a split or merge only when near-exact.
export function align(ref, hyp, matchSimilarity = POLICY.matchSimilarity) {
  const n = ref.length
  const m = hyp.length
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity))
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1))
  cost[0][0] = 0
  const sub = (a, b) => {
    const s = similarity(a, b)
    return s === 1 ? 0 : s >= matchSimilarity ? 1 - s : 1.5
  }
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      const here = cost[i][j]
      if (here === Infinity) continue
      const moves = []
      if (i < n) moves.push([i + 1, j, 1, [[i], []]])
      if (j < m) moves.push([i, j + 1, 1, [[], [j]]])
      if (i < n && j < m) moves.push([i + 1, j + 1, sub(ref[i], hyp[j]), [[i], [j]]])
      // A split or merge of real pieces: "tensor fold" for "tensorfold", never "agora e" for "agora".
      if (i < n && j + 1 < m && hyp[j].length > 1 && hyp[j + 1].length > 1) {
        const c = sub(ref[i], hyp[j] + hyp[j + 1])
        if (c <= 0.2) moves.push([i + 1, j + 2, c + 0.25, [[i], [j, j + 1]]])
      }
      if (i + 1 < n && j < m && ref[i].length > 1 && ref[i + 1].length > 1) {
        const c = sub(ref[i] + ref[i + 1], hyp[j])
        if (c <= 0.2) moves.push([i + 2, j + 1, c + 0.25, [[i, i + 1], [j]]])
      }
      for (const [a, b, c, step] of moves)
        if (here + c < cost[a][b]) {
          cost[a][b] = here + c
          back[a][b] = [i, j, step]
        }
    }
  const path = []
  let a = n
  let b = m
  while (a || b) {
    const [i, j, step] = back[a][b]
    path.push(step)
    a = i
    b = j
  }
  return path.reverse()
}

const FUNCTION_WORDS = new Set(
  'a an the to of and or but in on at by for with from up it is be am are was so too oh ah uh um me you we us he him she her they them i my our its o os as um uma de do da dos das e em no na nos nas por para com que se eu tu ele ela nos eles elas meu minha seu sua'.split(' '),
)

// `script`: [{ text, language }] the lines; `heard`: [{ text, t, end }] from Whisper.
export function wordCheck(script, heard, policy = POLICY) {
  const lang = script.find((l) => l.language)?.language ?? 'en'
  const ref = script.flatMap((l) => wordsOf(l.text, l.language ?? lang))
  const hypWords = []
  for (const w of heard) {
    const parts = wordsOf(w.text, lang)
    const span = (Number(w.end) - Number(w.t)) / Math.max(1, parts.length)
    parts.forEach((p, k) => hypWords.push({ text: p, t: Number(w.t) + k * span, end: Number(w.t) + (k + 1) * span }))
  }
  const hyp = hypWords.map((w) => w.text)
  const heardText = heard.map((w) => String(w.text).trim()).join(' ').trim()

  if (!ref.length) {
    // A shot without lines: any voice is one the prompt did not ask for.
    const voiced = hyp.filter((w) => !FUNCTION_WORDS.has(w)).length >= 2
    return {
      words: 0, matched: 0, coverage: 1, longestMissingRun: 0, missing: [], tail: [], heard: heardText,
      passed: !voiced, reason: voiced ? `a voice in a shot without lines: "${heardText.slice(0, 80)}"` : '',
    }
  }
  const path = align(ref, hyp, policy.matchSimilarity)
  const matched = new Set()
  let lastHyp = -1
  for (const [ri, hj] of path) {
    if (!ri.length || !hj.length) continue
    if (similarity(ri.map((i) => ref[i]).join(''), hj.map((j) => hyp[j]).join('')) >= policy.matchSimilarity) {
      ri.forEach((i) => matched.add(i))
      lastHyp = Math.max(lastHyp, ...hj)
    }
  }
  const missingIdx = ref.map((_, i) => i).filter((i) => !matched.has(i))
  let run = 0
  let longest = 0
  for (let i = 0; i < ref.length; i++) {
    run = matched.has(i) ? 0 : run + 1
    longest = Math.max(longest, run)
  }
  const coverage = matched.size / ref.length
  const lastTwo = ref.length >= 2 && missingIdx.includes(ref.length - 1) && missingIdx.includes(ref.length - 2)
  const lastText = script.at(-1)?.text ?? ''
  const lastContent = missingIdx.includes(ref.length - 1) && !/\d\W*$/.test(lastText) && !FUNCTION_WORDS.has(ref.at(-1))
  const tail = lastHyp >= 0 ? hyp.slice(lastHyp + 1) : []
  const out = {
    words: ref.length,
    matched: matched.size,
    coverage: Math.round(coverage * 1000) / 1000,
    longestMissingRun: longest,
    missing: missingIdx.map((i) => ref[i]),
    tail,
    lastWordEnd: lastHyp >= 0 ? Math.round(hypWords[lastHyp].end * 100) / 100 : null,
    heard: heardText,
    passed: true,
    reason: '',
  }
  if (coverage < policy.minCoverage) Object.assign(out, { passed: false, reason: `${Math.round(coverage * 100)} % of the words heard (under ${policy.minCoverage * 100} %)` })
  else if (longest > policy.maxMissingRun) Object.assign(out, { passed: false, reason: `${longest} words in a row missing` })
  else if (lastTwo || lastContent) Object.assign(out, { passed: false, reason: lastTwo ? 'the ending is missing' : 'the last word is missing' })
  else if (tail.filter((w) => !FUNCTION_WORDS.has(w)).length >= 2) out.reason = `words after the lines: ${tail.join(' ')} (the mouth may keep going)`
  return out
}

// ---- pictures ----------------------------------------------------------------

// Grey frames at `width` pixels wide: { frames: [Float32Array], w, h, fps }.
export function greyFrames(file, { ffmpeg = 'ffmpeg', width = SHOT.width } = {}) {
  const probe = spawnSync(ffprobePath(ffmpeg), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' })
  const s = JSON.parse(probe.stdout || '{}').streams?.[0]
  if (!s) throw new Error(`cannot read the video of ${file}`)
  const h = Math.max(2, Math.round((width * s.height) / s.width / 2) * 2)
  const [num, den] = String(s.r_frame_rate).split('/').map(Number)
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', `scale=${width}:${h},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1024 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`ffmpeg could not read the frames of ${file}`)
  const size = width * h
  const frames = []
  for (let k = 0; k + size <= r.stdout.length; k += size) frames.push(Float32Array.from(r.stdout.subarray(k, k + size)))
  return { frames, w: width, h, fps: den ? num / den : num || 24, size: { w: s.width, h: s.height } }
}

// A picture as the node put it in the clip: centre-cropped to the clip's shape.
export function greyPicture(file, w, h, { ffmpeg = 'ffmpeg' } = {}) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0 || r.stdout.length < w * h) throw new Error(`ffmpeg could not read the picture ${file}`)
  return Float32Array.from(r.stdout.subarray(0, w * h))
}

// (mean absolute difference in grey levels, correlation) of two grey pictures.
export function likeness(a, b) {
  let ma = 0
  let mb = 0
  for (let i = 0; i < a.length; i++) (ma += a[i]), (mb += b[i])
  ma /= a.length
  mb /= b.length
  let diff = 0
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    diff += Math.abs(a[i] - b[i])
    const x = a[i] - ma
    const y = b[i] - mb
    ab += x * y
    aa += x * x
    bb += y * y
  }
  const scale = Math.sqrt(aa * bb)
  return { difference: diff / a.length, likeness: scale > 1e-6 ? ab / scale : 0 }
}

const median = (list) => {
  const s = [...list].sort((x, y) => x - y)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}

// Hard cuts: a frame unlike the one before (correlation under 0.70) and whose
// change stands out (1.75x the median change of the 6 frames each side).
export function findCuts(frames, fps = 24, s = SHOT) {
  if (frames.length < 3) return []
  const change = []
  for (let k = 1; k < frames.length; k++) change.push(likeness(frames[k - 1], frames[k]).difference)
  const found = []
  for (let at = 0; at < change.length; at++) {
    const around = [...change.slice(Math.max(0, at - s.cutWindow), at), ...change.slice(at + 1, at + 1 + s.cutWindow)]
    const ratio = change[at] / Math.max(median(around), s.cutFloor)
    if (ratio < s.cutRatio) continue
    const same = likeness(frames[at], frames[at + 1]).likeness
    if (same < s.cutLikeness) found.push({ frame: at + 1, seconds: Math.round(((at + 1) / fps) * 100) / 100, likeness: Math.round(same * 100) / 100, ratio: Math.round(ratio * 10) / 10 })
  }
  return found
}

// The longest stretch without a cut (the later of two equal ones).
export function trimWindow(count, cuts, fps = 24) {
  const marks = [0, ...[...new Set(cuts.map((c) => c.frame))].filter((f) => f > 0 && f < count).sort((a, b) => a - b), count]
  let best = [0, 0]
  for (let k = 0; k + 1 < marks.length; k++) if (marks[k + 1] - marks[k] >= best[1] - best[0]) best = [marks[k], marks[k + 1]]
  return { start: best[0], end: best[1], frames: best[1] - best[0], in: Math.round((best[0] / fps) * 1000) / 1000, out: Math.round((best[1] / fps) * 1000) / 1000, whole: best[0] === 0 && best[1] === count }
}

export function shotCheck(file, { first, last, ffmpeg = 'ffmpeg', single = true } = {}, s = SHOT) {
  const { frames, w, h, fps } = greyFrames(file, { ffmpeg, width: s.width })
  if (!frames.length) throw new Error(`no frames in ${file}`)
  const held = (frame, picture) => {
    const l = likeness(frame, greyPicture(picture, w, h, { ffmpeg }))
    return { held: l.difference <= s.heldDifference && l.likeness >= s.heldLikeness, difference: Math.round(l.difference * 10) / 10, likeness: Math.round(l.likeness * 1000) / 1000 }
  }
  const cuts = single ? findCuts(frames, fps, s) : []
  const report = {
    frames: frames.length,
    cuts,
    window: trimWindow(frames.length, cuts, fps),
    first: first ? held(frames[0], first) : null,
    last: last ? held(frames.at(-1), last) : null,
  }
  const reasons = []
  if (cuts.length) reasons.push(`${cuts.length} cut(s) inside the shot, at ${cuts.map((c) => `${c.seconds} s`).join(', ')}`)
  if (report.first && !report.first.held) reasons.push(`the first frame did not hold the picture (difference ${report.first.difference}, likeness ${report.first.likeness})`)
  if (report.last && !report.last.held) reasons.push(`the last frame did not hold the picture (difference ${report.last.difference}, likeness ${report.last.likeness})`)
  return { ...report, passed: reasons.length === 0, reason: reasons.join('; ') }
}

const CODES = { english: 'en', portuguese: 'pt', spanish: 'es', french: 'fr', german: 'de', italian: 'it', japanese: 'ja', chinese: 'zh', korean: 'ko' }
// Whisper takes a language code: 'pt' for Portuguese, '' to guess.
export const whisperLanguage = (value) => {
  const v = String(value ?? '').trim().toLowerCase()
  return CODES[v] ?? (/^[a-z]{2}(-[a-z]{2})?$/.test(v) ? v.slice(0, 2) : '')
}

// Both checks on one take; `hear(file, language)` gives Whisper's words.
export async function checkTake(file, { script = [], first, last, hear, ffmpeg = 'ffmpeg' } = {}) {
  const shot = shotCheck(file, { first, last, ffmpeg })
  let words = null
  if (hear) {
    const language = whisperLanguage(script.find((l) => l.language)?.language)
    const heard = await hear(file, language)
    words = wordCheck(script, heard)
  }
  const reasons = [shot.passed ? '' : shot.reason, words && !words.passed ? words.reason : ''].filter(Boolean)
  return { passed: reasons.length === 0, reason: reasons.join('; '), shot, words, checked: new Date().toISOString() }
}
