// MiniMax H3 prompts from a shot: the model's own prompt form, the clip
// lengths it takes, and the checks that catch what it gets wrong. No Node
// imports, so the app, the server and the tsrs command share it.
//
// The prompt forms, the camera vocabulary, the 17n+5 rule, the negation check
// and the quiet sentences follow Imagination Studio by Keys (github.com/drowzeys)
// and Sam Wasserman / Wasserman Productions (wassermanproductions.com),
// Apache License 2.0 — see CREDITS.md. Their measurements are quoted where a
// rule comes from one.
//
// A shot:
//   {
//     scene, action, camera,            words (camera may be left to size/angle/movement)
//     size, angle, lens, movement,      size: EWS WS MWS MS MCU CU ECU Insert · movement: see MOVES
//     beats: ['...', '...'],            what happens, in order ("First, … Then, … Finally, …")
//     dialogue: [{ speaker, voice, text, language }],   language: English, Portuguese, en, pt…
//     soundscape, music,                music: usually N/A (music is laid in the edit)
//     people,                           true/false; guessed from the words when absent
//     seconds | frames,                 the clip's length
//     start: 'text' | 'first' | 'last' | 'first-last' | 'reference',
//     subjects: ['the man in the grey coat', …]   for 'reference': who each picture is
//     aspect, fps
//   }

export const FPS = 24
export const SHORTEST = 22
export const LONGEST = 362
export const MAX_CHARS = 7000
export const REFERENCE_LIMIT = 9
export const ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9']
export const STARTS = ['text', 'first', 'last', 'first-last', 'reference']

// H3 takes 17n+5 frames at 24 fps, from 22 to 362: 5 s = 124, 8 s = 192,
// 10 s = 243, 15 s = 362.
export const validFrames = (n) => Number.isInteger(n) && n >= SHORTEST && n <= LONGEST && n % 17 === 5
export function framesFor(seconds) {
  const target = Math.max(SHORTEST, Math.min(LONGEST, Number(seconds) * FPS))
  return Math.round((target - 5) / 17) * 17 + 5
}
export const secondsOf = (frames) => Math.round((frames / FPS) * 100) / 100

// Shot size, angle and movement in the camera vocabulary of MiniMax's H3 guide.
export const SIZE_WORDS = {
  EWS: 'Extreme wide shot', WS: 'Wide shot', MWS: 'Medium wide shot', MS: 'Medium shot', MCU: 'Medium close-up',
  CU: 'Close-up', ECU: 'Extreme close-up', Insert: 'Insert shot of a detail',
}
export const ANGLE_WORDS = {
  'eye level': 'at eye level', low: 'from a low angle', high: 'from a high angle', overhead: 'from directly overhead',
  dutch: 'with a tilted, dutch-angle horizon', 'over-shoulder': 'over the shoulder of the nearer person', POV: "from the character's point of view",
}
export const MOVES = {
  locked: 'Static shot on a locked, still camera.',
  handheld: 'Handheld: the camera shakes slightly.',
  'push-in': 'The camera pushes in with small amplitude at slow speed.',
  'pull-back': 'The camera zooms out with small amplitude at slow speed.',
  orbit: 'Arc shot: the camera arcs around the subject at slow speed.',
  pan: 'The camera pans with small amplitude at slow speed.',
  tilt: 'The camera tilts with small amplitude at slow speed.',
  track: 'Tracking shot: the camera follows the subject at its pace.',
  crane: 'The camera pedestals up with large amplitude at slow speed.',
  drone: 'Aerial tracking shot at slow speed.',
  steadicam: 'Smooth tracking shot gliding with the subject.',
}

// A clip without spoken lines is told what is there, not what is not: the
// model has no negative prompt, and "Nobody speaks." made voices.
export const QUIET_PICTURE = 'Mouths stay closed.'
export const QUIET_SOUND = 'Only ambient sound is heard.'
export const QUIET_AFTER = 'After the spoken lines only ambient sound is heard.'
export const MOUTH =
  'Mouth movements follow the words. After the last word the speaker stops talking, closes the mouth and stays silent until the end of the clip.'

const PEOPLE =
  /(?<!\p{L})(man|men|woman|women|person|people|boy|boys|girl|girls|child|children|kid|kids|baby|he|she|they|him|her|his|them|their|someone|somebody|everyone|crowd|couple|friends?|students?|dancers?|singers?|actors?|actress|workers?|soldiers?|mother|father|son|daughter|brother|sister|husband|wife|face|faces|homem|homens|mulher|mulheres|pessoa|pessoas|menino|menina|crian[cç]as?|beb[eê]|ele|ela|eles|elas|algu[eé]m|todos|casal|amigos?|amigas?|m[aã]e|pai|filho|filha|rosto|rostos|senhor|senhora|rob[oô])(?!\p{L})/iu

export const LANGUAGES = { en: 'English', pt: 'Portuguese', 'pt-br': 'Portuguese', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean' }
export function languageName(value) {
  const v = String(value ?? '').trim()
  if (!v) return 'English'
  return LANGUAGES[v.toLowerCase()] ?? v[0].toUpperCase() + v.slice(1)
}

// Spoken words a second at most: about 3 in English (Imagination Studio's
// 3.4 limit, 3 when planning); Portuguese words are longer, so less.
export const WORDS_PER_SECOND = { English: 3.4, Portuguese: 2.8 }

const STOPS = '.!?…:;,"”’\')'
const joined = (...parts) => {
  const list = parts.map((p) => String(p ?? '').trim()).filter(Boolean)
  return list.map((p, i) => (i < list.length - 1 && !STOPS.includes(p.at(-1)) ? `${p}.` : p)).join(' ')
}
const sentence = (text) => {
  const t = String(text ?? '').trim()
  return !t ? '' : STOPS.includes(t.at(-1)) ? t : `${t}.`
}

// The camera sentence: the shot's own words, else its size, angle, lens and move.
export function cameraWords(shot) {
  const framing = [SIZE_WORDS[shot.size], ANGLE_WORDS[shot.angle], shot.lens && `on a ${shot.lens} lens`].filter(Boolean).join(' ')
  return [sentence(framing), MOVES[shot.movement] ?? '', sentence(shot.camera)].filter(Boolean).join(' ')
}

// Beats as "First, … Then, … Finally, …": never [Shot 2], which asks for a cut.
export function beatWords(beats) {
  const list = (beats ?? []).map((b) => String(typeof b === 'string' ? b : b?.text ?? '').trim()).filter(Boolean)
  if (list.length < 2) return list.map(sentence).join(' ')
  const lead = ['First,', 'Then,', 'After that,', 'Next,']
  return list.map((b, i) => `${i === list.length - 1 ? 'Finally,' : lead[Math.min(i, lead.length - 1)]} ${b[0].toLowerCase()}${b.slice(1)}`).map(sentence).join(' ')
}

// The line that opens a keyframe prompt: which picture stands at which moment.
export const LEAD = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.'
export function lead(start, frames) {
  const end = (frames / FPS).toFixed(2)
  if (start === 'first-last') return `${LEAD.slice(0, -1)}; at ${end} seconds into the target video, <Picture 2> (from [Shot 1]) is fully referenced.`
  if (start === 'last') return `For the target video, at ${end} seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`
  return start === 'first' ? LEAD : ''
}

const lines = (shot) =>
  (shot.dialogue ?? [])
    .map((l) => ({ ...l, text: String(l?.text ?? '').trim() }))
    .filter((l) => l.text)

function quietLine(shot, ...texts) {
  const people = shot.people ?? PEOPLE.test(texts.join(' '))
  return people ? ` ${QUIET_PICTURE}` : ''
}

function soundWords(shot, spoken) {
  let sound = String(shot.soundscape ?? '').trim() || 'Natural ambient sound for the scene.'
  if (!/no speech|only ambient sound/i.test(sound)) sound = sentence(sound) + ' ' + (spoken ? QUIET_AFTER : QUIET_SOUND)
  return sound
}

// The prompt in MiniMax H3's own form. Returns { prompt, frames, seconds, form }.
export function composeShot(shot) {
  const start = STARTS.includes(shot.start) ? shot.start : 'text'
  const frames = shot.frames && validFrames(Number(shot.frames)) ? Number(shot.frames) : framesFor(shot.seconds ?? 5)
  const action = joined(shot.action, beatWords(shot.beats))
  const spoken = lines(shot)
  const music = String(shot.music ?? '').trim() || 'N/A'

  if (start === 'reference') {
    const count = Math.max(1, Math.min(REFERENCE_LIMIT, (shot.subjects ?? []).length || 1))
    const names = Array.from({ length: count }, (_, i) => String(shot.subjects?.[i] ?? '').trim() || 'the main subject')
    const subjects = names.map((n, i) => `<Subject ${i + 1}> is ${n} shown in <Picture ${i + 1}>.`)
    const kept = names.map((_, i) => `<Subject ${i + 1}> (appears in [Shot 1]): fully_preserved - the identity, face, hair, clothing and colours shown in <Picture ${i + 1}> are kept.`)
    let body = sentence(joined(shot.scene, cameraWords(shot), action))
    if (spoken.length) {
      body += ' ' + spoken.map((l, i) => `<Subject ${Number(l.subject) || 1}> (S${i + 1}), in ${String(l.voice ?? '').trim() || 'a natural voice'}, speaks: <d>[${languageName(l.language)}] ${l.text}</d>`).join(' ')
      body += ` ${MOUTH}`
    } else {
      body += quietLine({ people: shot.people ?? true }, shot.scene, action)
    }
    let sound = soundWords(shot, spoken.length > 0)
    if (music.toUpperCase() !== 'N/A') sound += ` Music: ${sentence(music)}`
    const who = names.map((_, i) => `<Subject ${i + 1}>`).join(', ')
    // The sound under its own heading: written at the end of the shot it was
    // read as speech (a voice in 41 % and 63 % of the frames of a silent clip,
    // on two seeds; none with the heading).
    const prompt =
      `subject_definitions:\n${subjects.join('\n')}\n\n` +
      `summary:\n[subject reference] A new video with ${who}, keeping how each looks in its picture. ${sentence(shot.scene) || 'A new scene.'}\n\n` +
      `retention_analysis:\n${kept.join('\n')}\n\n` +
      `detailed_description:\n[Shot 1] ${body.trim()}\n\noverall_soundscape:\n${sound}`
    return { prompt, frames, seconds: secondsOf(frames), form: 'reference' }
  }

  let body = sentence(joined(shot.scene, cameraWords(shot), action))
  if (spoken.length) {
    body +=
      ' ' +
      spoken
        .map((l, i) => `${String(l.speaker ?? '').trim() || 'The speaker'}, in ${String(l.voice ?? '').trim() || 'a natural voice'} (S${i + 1}), ${l.sung ? 'sings' : 'says'}: <d>[${languageName(l.language)}] ${l.text}</d>`)
        .join(' ') +
      ` ${MOUTH}`
  } else {
    body += quietLine(shot, shot.scene, action)
  }
  const main =
    `integrated_multimodal_description: [Shot 1] ${body.trim()}\n\n` +
    `overall_soundscape: ${soundWords(shot, spoken.length > 0)}\n\n` +
    `non_diegetic_music: ${music}`
  const opening = lead(start, frames)
  return { prompt: opening ? `${opening}\n\n${main}` : main, frames, seconds: secondsOf(frames), form: start }
}

// Phrases that name what should not be there. H3 has no negative prompt, so
// naming a thing tends to bring it: "No photographs" put photographs on the
// walls; "NEVER look at the camera" made people look. Warned, never rewritten.
const NEGATION = {
  en: /(?<!\p{L})(?:no|not|never|without|nobody|nothing|none|don'?t|doesn'?t|isn'?t|aren'?t|won'?t|can'?t)(?![\p{L}'])[^.,;:!?\n]{0,40}/giu,
  pt: /(?<!\p{L})(?:n[aã]o|nunca|sem|nenhuma?|ningu[eé]m|nada|jamais)(?!\p{L})[^.,;:!?\n]{0,40}/giu,
}
const IDIOMS = /^(?:no matter|no longer|not only|nothing but|no doubt|n[aã]o s[oó]|sem d[uú]vida)(?!\p{L})/iu
const KEPT = /Mouths stay closed|only ambient sound|non_diegetic_music|stays silent|N\/A/i
export function findNegations(text) {
  const plain = String(text ?? '')
    .replace(/<d>[\s\S]*?<\/d>/g, ' ') // spoken lines may say anything
    .replace(/non_diegetic_music:.*$/gim, ' ')
  const found = []
  for (const pattern of Object.values(NEGATION)) {
    for (const m of plain.matchAll(pattern)) {
      const phrase = m[0].trim()
      if (!IDIOMS.test(phrase) && !KEPT.test(phrase)) found.push(phrase)
    }
  }
  return [...new Set(found)]
}

// Speech written inside the picture, not in `dialogue`: the model reads it as
// a picture of words, or says it at the wrong moment.
const SPEECH_IN_PROMPT = /(?<!\p{L})(?:says?|said|whispers?|shouts?|asks?|replies|diz|disse|fala|sussurra|grita|pergunta|responde)(?!\p{L})[^"“”«»]{0,20}["“«][^"”»]{3,}["”»]/iu

const wordCount = (text) => String(text).trim().split(/\s+/).filter(Boolean).length

// What to fix before rendering: [{ level: 'error' | 'warn', text }].
export function checkShot(shot, prompt = composeShot(shot).prompt) {
  const out = []
  const warn = (text) => out.push({ level: 'warn', text })
  const error = (text) => out.push({ level: 'error', text })
  const frames = shot.frames && validFrames(Number(shot.frames)) ? Number(shot.frames) : framesFor(shot.seconds ?? 5)
  if (shot.frames !== undefined && !validFrames(Number(shot.frames))) {
    error(`H3 takes 17n+5 frames (22 to 362); ${shot.frames} is not one. Nearest: ${framesFor(Number(shot.frames) / FPS)}.`)
  }
  if (shot.seconds !== undefined && Math.abs(frames / FPS - Number(shot.seconds)) > 0.5) {
    warn(`A clip is ${(SHORTEST / FPS).toFixed(1)} to ${(LONGEST / FPS).toFixed(0)} s; ${shot.seconds} s renders as ${frames} frames (${secondsOf(frames)} s).`)
  }
  if (shot.fps !== undefined && Number(shot.fps) !== FPS) warn(`H3 renders at 24 fps; the shot says ${shot.fps}.`)
  if (shot.aspect && !ASPECTS.includes(shot.aspect)) error(`Aspect ${shot.aspect} is not one H3 takes: ${ASPECTS.join(', ')}.`)
  if (shot.start && !STARTS.includes(shot.start)) error(`start is one of ${STARTS.join(', ')}.`)
  if (shot.movement && !MOVES[shot.movement]) warn(`Movement "${shot.movement}" has no H3 phrase; known: ${Object.keys(MOVES).join(', ')}.`)
  if (shot.size && !SIZE_WORDS[shot.size]) warn(`Size "${shot.size}" is not one of ${Object.keys(SIZE_WORDS).join(', ')}.`)
  if (prompt.length > MAX_CHARS) error(`The prompt is ${prompt.length} characters; H3 reads at most ${MAX_CHARS}.`)
  if ((shot.subjects ?? []).length > REFERENCE_LIMIT) error(`At most ${REFERENCE_LIMIT} reference pictures.`)

  const spoken = lines(shot)
  const byLanguage = {}
  for (const l of spoken) {
    const lang = languageName(l.language)
    byLanguage[lang] = (byLanguage[lang] ?? 0) + wordCount(l.text)
    if (!String(l.speaker ?? '').trim() && shot.start !== 'reference') warn(`A line has no speaker: "${l.text.slice(0, 40)}".`)
  }
  for (const [lang, words] of Object.entries(byLanguage)) {
    const most = WORDS_PER_SECOND[lang] ?? 3
    if (words > most * (frames / FPS)) {
      error(`${words} ${lang} words in ${secondsOf(frames)} s is more than ${most} a second: lengthen the clip or cut the lines (up to ${Math.floor(most * (frames / FPS))}).`)
    }
  }
  const pictureText = [shot.scene, shot.action, shot.camera, ...(shot.beats ?? []).map((b) => (typeof b === 'string' ? b : b?.text))].filter(Boolean).join(' ')
  if (SPEECH_IN_PROMPT.test(pictureText)) warn('Spoken words are written in the scene or action: move them to dialogue, so the mouth and the sound follow them.')
  for (const phrase of findNegations(prompt)) warn(`"${phrase}": H3 has no negative prompt, so naming a thing tends to bring it. Say what is there instead.`)
  if (/\[Shot [2-9]\]/.test(prompt)) warn('[Shot 2] inside one clip asks the model for a cut. Use beats ("First, … Then, …").')
  return out
}
