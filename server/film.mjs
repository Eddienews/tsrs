// A film planned before anything renders: one file, film.json, with the bible
// (cast, places, look) and the scenes with their shots. Whoever directs —
// Claude, Codex, a bot — writes it; TSRS checks it the same way every time and
// says exactly what to fix, then turns each shot into a shot file for a take.
// The quality bar lives in these checks, not in the model that writes the plan.
//
//   {
//     "title": "Seu Silva — ep. 07", "language": "pt", "aspect": "16:9", "resolution": "540P",
//     "look": "warm natural light, soft film grain",
//     "characters": [{ "id": "silva", "name": "Seu Silva", "description": "a man in his sixties with glasses and a grey beard, a light-blue shirt over a navy t-shirt",
//                      "voice": "a calm, warm voice", "pictures": ["midia/silva.png"],
//                      "elevenlabsVoice": "a cloned voice's id (optional): the lines are then changed to it" }],
//     "locations": [{ "id": "cozinha", "name": "the kitchen", "description": "a small kitchen, morning light, plants on the window", "pictures": [] }],
//     "scenes": [{ "id": "c1", "location": "cozinha", "shots": [
//       { "id": "s01", "intent": "a note for people, never sent to the model",
//         "size": "MS", "angle": "eye level", "movement": "locked", "seconds": 5,
//         "cast": ["silva"], "action": "He pours coffee and sits down", "beats": [],
//         "lines": [{ "speaker": "silva", "text": "Bom dia!" }], "soundscape": "a quiet kitchen",
//         "start": "text" | "cast" | "previous" | "image", "image": "midia/s01.png" } ] }]
//   }
//
// start: text (from words), cast (the cast's pictures as references: who they
// are stays the same from shot to shot), previous (opens on the last frame of
// the shot before: a continuous move), image (opens on a picture).
//
// After the Director and Slate of Imagination Studio (Keys and Sam Wasserman,
// Apache-2.0): the bible repeated word for word in every prompt, lines kept out
// of the picture, a checked plan with exact messages. See CREDITS.md.

import { checkShot, composeShot, REFERENCE_LIMIT } from './h3prompt.mjs'
import { VOICE_ID } from './revoice.mjs'

export const FILM_FILE = 'film.json'
export const FILM_STARTS = ['text', 'cast', 'previous', 'image']
const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/i

const sentence = (t) => {
  const s = String(t ?? '').trim()
  if (!s) return ''
  const up = s[0].toUpperCase() + s.slice(1)
  return /[.!?…]$/.test(up) ? up : `${up}.`
}

// The shot as H3 takes it: the bible's words for who and where, then the shot.
export function shotFromFilm(film, scene, shot, index) {
  const cast = (shot.cast ?? []).map((id) => (film.characters ?? []).find((c) => c.id === id)).filter(Boolean)
  const place = (film.locations ?? []).find((l) => l.id === (shot.location ?? scene.location))
  const start = FILM_STARTS.includes(shot.start) ? shot.start : 'text'
  const byPicture = start === 'cast'
  // With reference pictures the pictures carry who they are; in words, the
  // bible's description goes into every shot unchanged.
  const who = cast.filter((c) => !byPicture || !(c.pictures ?? []).length).map((c) => sentence(`${c.name} is ${c.description}`))
  const where = place ? sentence(`${place.name}: ${String(place.description ?? '').replace(/\.$/, '')}`) : ''
  const out = {
    from: FILM_FILE,
    film: film.title ?? '',
    scene: [sentence(film.look), where, ...who].filter(Boolean).join(' '),
    action: shot.action ?? '',
    beats: shot.beats ?? [],
    size: shot.size,
    angle: shot.angle,
    lens: shot.lens,
    movement: shot.movement,
    camera: shot.camera,
    seconds: shot.seconds ?? film.seconds ?? 5,
    aspect: shot.aspect ?? film.aspect ?? '16:9',
    resolution: shot.resolution ?? film.resolution ?? '540P',
    soundscape: shot.soundscape ?? '',
    music: shot.music ?? 'N/A',
    people: cast.length > 0 || shot.people === true,
    dialogue: (shot.lines ?? []).map((l) => {
      const who2 = cast.find((c) => c.id === l.speaker) ?? (film.characters ?? []).find((c) => c.id === l.speaker)
      // In reference form a speaker is the subject of their first picture.
      const owners = cast.flatMap((c) => (c.pictures ?? []).slice(0, 2).map(() => c.id))
      const subject = byPicture ? owners.indexOf(l.speaker) + 1 : undefined
      return { speaker: who2?.name ?? l.speaker, voice: l.voice ?? who2?.voice ?? '', text: l.text, language: l.language ?? film.language ?? 'en', ...(subject ? { subject } : {}) }
    }),
    seed: shot.seed,
  }
  const clone = cloneOf(film, shot)
  if (clone.voice) out.revoice = { engine: 'elevenlabs', voice: clone.voice }
  if (start === 'cast') {
    const refs = cast.flatMap((c) => (c.pictures ?? []).slice(0, 2))
    const placePics = (place?.pictures ?? []).slice(0, 2)
    out.refs = [...refs, ...placePics].slice(0, REFERENCE_LIMIT)
    out.subjects = [
      ...cast.flatMap((c) => (c.pictures ?? []).slice(0, 2).map(() => `${c.name}, ${c.description}`)),
      ...placePics.map(() => `${place.name}, the place where the scene happens`),
    ].slice(0, REFERENCE_LIMIT)
    out.start = 'reference'
  } else if (start === 'image') {
    out.image = shot.image
  } else if (start === 'previous') {
    const before = scene.shots[index - 1]
    if (before) out.after = shotFile(scene, before)
  }
  return out
}

// The cloned voice a shot's lines change to: only when every line is spoken by
// characters with the same cloned voice (the voice changer changes every voice
// it hears). { voice } or { why } when some lines have one and others do not.
export function cloneOf(film, shot) {
  const lines = shot.lines ?? []
  if (!lines.length) return {}
  const voices = lines.map((l) => (film.characters ?? []).find((c) => c.id === l.speaker)?.elevenlabsVoice ?? null)
  if (voices.every((v) => !v)) return {}
  if (voices.every((v) => v === voices[0])) return { voice: voices[0] }
  return { why: 'Its lines are spoken in more than one voice, and the voice changer changes every voice it hears: the take keeps the voices H3 made. Give the lines to one cloned voice, or split the shot.' }
}

export const shotFile = (scene, shot) => `shots/${scene.id}-${shot.id}.json`

// [{ scene, shot, file, errors: [], warnings: [] }] and the totals. `exists(rel)`
// says whether a file of the project is there.
export function checkFilm(film, { exists = () => true } = {}) {
  const report = []
  const top = []
  if (!film || typeof film !== 'object' || Array.isArray(film)) return { ok: false, errors: 1, warnings: 0, film: ['film.json is not a JSON object.'], shots: [] }
  const characters = film.characters ?? []
  const locations = film.locations ?? []
  const scenes = film.scenes ?? []
  const ids = (list, what) => {
    const seen = new Set()
    for (const item of list) {
      if (!ID.test(String(item?.id ?? ''))) top.push(`A ${what} needs an id of letters, numbers, - or _ (got "${item?.id ?? ''}").`)
      else if (seen.has(item.id)) top.push(`Two ${what}s have the id "${item.id}".`)
      seen.add(item?.id)
    }
  }
  ids(characters, 'character')
  ids(locations, 'location')
  ids(scenes, 'scene')
  for (const c of characters) {
    if (!String(c.name ?? '').trim()) top.push(`Character "${c.id}" needs a name.`)
    if (!String(c.description ?? '').trim()) top.push(`Character "${c.id}" needs a description (it is repeated in every shot they are in).`)
    for (const p of c.pictures ?? []) if (!exists(p)) top.push(`Character "${c.id}": the picture ${p} is not in the project.`)
    if (c.elevenlabsVoice !== undefined && !VOICE_ID.test(String(c.elevenlabsVoice))) top.push(`Character "${c.id}": elevenlabsVoice is the id of an ElevenLabs voice (like e1MAZ8in8PhkrhQwfrMh), not "${c.elevenlabsVoice}".`)
  }
  for (const l of locations) {
    if (!String(l.name ?? '').trim() || !String(l.description ?? '').trim()) top.push(`Location "${l.id}" needs a name and a description.`)
    for (const p of l.pictures ?? []) if (!exists(p)) top.push(`Location "${l.id}": the picture ${p} is not in the project.`)
  }
  if (!scenes.length) top.push('The film has no scenes.')
  const castIds = new Set(characters.map((c) => c.id))
  const placeIds = new Set(locations.map((l) => l.id))
  const names = characters.map((c) => ({ id: c.id, name: String(c.name ?? '').trim() })).filter((c) => c.name)

  for (const scene of scenes) {
    if (scene.location && !placeIds.has(scene.location)) top.push(`Scene "${scene.id}": no location "${scene.location}". Locations: ${[...placeIds].join(', ') || 'none yet'}.`)
    if (!(scene.shots ?? []).length) top.push(`Scene "${scene.id}" has no shots.`)
    const shotIds = new Set()
    ;(scene.shots ?? []).forEach((shot, index) => {
      const errors = []
      const warnings = []
      if (!ID.test(String(shot.id ?? ''))) errors.push(`Needs an id of letters, numbers, - or _ (got "${shot.id ?? ''}").`)
      else if (shotIds.has(shot.id)) errors.push(`Another shot of the scene has the id "${shot.id}".`)
      shotIds.add(shot.id)
      for (const id of shot.cast ?? []) if (!castIds.has(id)) errors.push(`Cast "${id}" is not in the bible. Characters: ${[...castIds].join(', ') || 'none yet'}.`)
      if (shot.location && !placeIds.has(shot.location)) errors.push(`No location "${shot.location}".`)
      for (const line of shot.lines ?? []) {
        if (!String(line.text ?? '').trim()) errors.push('A line has no text.')
        if (!(shot.cast ?? []).includes(line.speaker)) errors.push(`The speaker "${line.speaker}" of "${String(line.text ?? '').slice(0, 30)}" is not cast in the shot.`)
      }
      const clone = cloneOf(film, shot)
      if (clone.why) warnings.push(clone.why)
      const start = shot.start ?? 'text'
      if (!FILM_STARTS.includes(start)) errors.push(`start is one of ${FILM_STARTS.join(', ')}.`)
      if (start === 'image' && (!shot.image || !exists(shot.image))) errors.push(`start "image" needs an image of the project (${shot.image ?? 'none given'}).`)
      if (start === 'previous' && index === 0) errors.push('start "previous" opens on the shot before, and this is the first shot of its scene.')
      if (start === 'cast') {
        const pics = (shot.cast ?? []).flatMap((id) => characters.find((c) => c.id === id)?.pictures ?? [])
        if (!pics.length) errors.push('start "cast" needs pictures of the cast in the bible (characters[].pictures).')
        for (const id of shot.cast ?? []) {
          const c = characters.find((x) => x.id === id)
          if (c && !(c.pictures ?? []).length && pics.length) warnings.push(`${c.name} has no picture: described in words only, so their look may change from shot to shot.`)
        }
      }
      // Someone named in the action but not cast: the model draws a stranger.
      const action = [shot.action, ...(shot.beats ?? [])].join(' ')
      for (const c of names) if (!(shot.cast ?? []).includes(c.id) && new RegExp(`(?<!\\p{L})${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'iu').test(action)) warnings.push(`${c.name} is in the action but not cast: add "${c.id}" to cast, or the model draws a stranger.`)
      if (!String(shot.action ?? '').trim() && !(shot.beats ?? []).length && !(shot.lines ?? []).length) errors.push('Say what happens: action, beats or lines.')
      const made = shotFromFilm(film, scene, shot, index)
      const prompt = composeShot(made).prompt
      for (const c of checkShot(made, prompt)) (c.level === 'error' ? errors : warnings).push(c.text)
      report.push({ scene: scene.id, shot: shot.id, file: shotFile(scene, shot), seconds: composeShot(made).seconds, errors, warnings })
    })
  }
  const errors = top.length + report.reduce((n, s) => n + s.errors.length, 0)
  const warnings = report.reduce((n, s) => n + s.warnings.length, 0)
  return { ok: errors === 0, errors, warnings, film: top, shots: report, seconds: Math.round(report.reduce((n, s) => n + s.seconds, 0) * 100) / 100 }
}

export function describeFilm(report) {
  const lines = []
  if (report.film.length) lines.push('Film:', ...report.film.map((e) => `  ✗ ${e}`))
  for (const s of report.shots) {
    const mark = s.errors.length ? '✗' : s.warnings.length ? '!' : '✓'
    lines.push(`${mark} ${s.scene}/${s.shot} (${s.seconds} s)`)
    lines.push(...s.errors.map((e) => `    ✗ ${e}`), ...s.warnings.map((w) => `    ! ${w}`))
  }
  lines.push('', report.ok ? `Ready: ${report.shots.length} shot(s), ${report.seconds} s. Next: tsrs film take <project>` : `${report.errors} error(s) to fix, ${report.warnings} warning(s). Fix film.json and check again.`)
  return lines.join('\n')
}

// The shot files of the film (or of some of its scenes and shots), in order.
export function filmShots(film, { scenes, shots } = {}) {
  const out = []
  for (const scene of film.scenes ?? []) {
    if (scenes?.length && !scenes.includes(scene.id)) continue
    ;(scene.shots ?? []).forEach((shot, index) => {
      if (shots?.length && !shots.includes(shot.id) && !shots.includes(`${scene.id}-${shot.id}`)) return
      out.push({ file: shotFile(scene, shot), shot: shotFromFilm(film, scene, shot, index) })
    })
  }
  return out
}
