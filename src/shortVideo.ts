import plexBold from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2?inline'
import type { MediaTarget } from './media'
import { narrate, sceneTimes, type Word } from './narration'
import { fileUrl, saveFiles } from './projects'
import { creditLine, saveClip, searchStock, type Orientation, type StockClip } from './stock'
import type { ChatProject, Settings } from './types'
import { findRenderer, jsonLines } from './videoRender'

// Short videos made in TSRS: the model writes the scenes (what is said and
// what is seen), TSRS narrates them with word times, finds a stock clip for
// each, and the local server cuts the clips to the narration, mixes the music
// under the voice and draws captions word by word, the title and an end card
// on top (render/short.mjs). Everything lands in the project folder.

export type ShortFormat = '9:16' | '16:9' | '1:1'

export interface ShortScene {
  // What the narrator says in this scene.
  text: string
  // What should be seen, as a stock search in English.
  search: string
}

export interface ShortPlan {
  title: string
  format: ShortFormat
  scenes: ShortScene[]
  // A line for the end card, such as "Siga @nwlab".
  cta?: string
  // 'generate' asks the music service; a path uses a file of the project; 'none' has none.
  music?: string
  // What the generated music should be like.
  musicStyle?: string
}

export const SIZES: Record<ShortFormat, [number, number]> = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] }
const ORIENTATION: Record<ShortFormat, Orientation> = { '9:16': 'portrait', '16:9': 'landscape', '1:1': 'square' }
// The end card, after the narration.
export const TAIL = 2.5

export interface CaptionGroup {
  words: Word[]
  start: number
  end: number
}

// Words shown together: a few at a time, breaking after punctuation, so the
// captions read at the pace of the voice.
export function captionGroups(words: Word[], maxChars = 22, maxWords = 4): CaptionGroup[] {
  const groups: CaptionGroup[] = []
  let current: Word[] = []
  const flush = () => {
    if (!current.length) return
    groups.push({ words: current, start: current[0].start, end: current.at(-1)!.end })
    current = []
  }
  for (const word of words) {
    const length = current.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length
    if (current.length && (current.length >= maxWords || length > maxChars)) flush()
    current.push(word)
    if (/[.!?;:,…]$/.test(word.text)) flush()
  }
  flush()
  // Each group stays until the next one starts, so the screen is never empty mid-sentence.
  groups.forEach((g, i) => {
    const next = groups[i + 1]
    if (next && next.start - g.end < 0.6) g.end = next.start
  })
  return groups
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// The overlay composition: captions, title, progress line and end card, on a
// transparent background, drawn over the clips by the renderer.
export function shortOverlay(plan: Pick<ShortPlan, 'title' | 'format' | 'cta'>, words: Word[], speech: number, fps = 30): string {
  const [width, height] = SIZES[plan.format]
  const unit = Math.min(width, height) / 1080
  const duration = speech + TAIL
  const groups = captionGroups(words).map((g) => ({ s: +g.start.toFixed(3), e: +g.end.toFixed(3), w: g.words.map((w) => [w.text, +w.start.toFixed(3)]) }))
  const data = JSON.stringify({ groups, speech, duration }).replace(/</g, '\\u003c')
  const px = (n: number) => `${Math.round(n * unit)}px`
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<meta name="nwlab:duration" content="${duration.toFixed(3)}">
<meta name="nwlab:size" content="${width}x${height}">
<meta name="nwlab:fps" content="${fps}">
<title>${escapeHtml(plan.title)}</title>
<style>
@font-face { font-family: Plex; font-weight: 700; src: url(${plexBold}) format('woff2'); }
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: transparent; font-family: Plex, 'Helvetica Neue', Arial, sans-serif; }
#bar { position: absolute; left: 0; top: 0; height: ${px(8)}; background: #ff6a13; width: 0; }
#title { position: absolute; left: ${px(72)}; right: ${px(72)}; top: ${Math.round(height * 0.12)}px; color: #fff; font-size: ${px(56)}; font-weight: 700; line-height: 1.15;
  text-shadow: 0 ${px(3)} ${px(18)} rgba(0,0,0,.75); opacity: 0; }
#title::before { content: ''; display: block; width: ${px(96)}; height: ${px(8)}; background: #ff6a13; margin-bottom: ${px(22)}; border-radius: ${px(4)}; }
#caption { position: absolute; left: ${px(60)}; right: ${px(60)}; top: ${Math.round(height * (plan.format === '16:9' ? 0.7 : 0.64))}px; text-align: center; color: #fff;
  font-size: ${px(84)}; font-weight: 700; line-height: 1.12; letter-spacing: ${px(-1)};
  text-shadow: 0 0 ${px(4)} #000, 0 ${px(4)} ${px(22)} rgba(0,0,0,.85); }
#caption span { display: inline-block; margin: 0 ${px(14)}; transform-origin: 50% 70%; }
#caption span.on { color: #ff6a13; }
#end { position: absolute; inset: 0; background: #06080c; opacity: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: ${px(80)}; box-sizing: border-box; }
#end h1 { color: #fbefdf; font-size: ${px(88)}; line-height: 1.1; margin: 0; }
#end .rule { width: ${px(420)}; height: ${px(6)}; background: #ff6a13; margin: ${px(48)} 0; border-radius: ${px(3)}; }
#end p { color: #ff6a13; font-size: ${px(48)}; margin: 0; letter-spacing: ${px(2)}; }
</style></head><body>
<div id="bar"></div>
<div id="title">${escapeHtml(plan.title)}</div>
<div id="caption"></div>
<div id="end"><h1>${escapeHtml(plan.title)}</h1><div class="rule"></div><p>${escapeHtml(plan.cta ?? '')}</p></div>
<script>
  const D = ${data}
  const $ = (id) => document.getElementById(id)
  const clamp = (v) => Math.min(1, Math.max(0, v))
  const ease = (x) => 1 - Math.pow(1 - x, 3)
  let shown = -1
  function render(t) {
    $('bar').style.width = (100 * clamp(t / D.speech)) + '%'
    const title = clamp(t / 0.35) * (1 - clamp((t - 2.2) / 0.4))
    $('title').style.opacity = title
    $('title').style.transform = 'translateY(' + (1 - ease(clamp(t / 0.5))) * 30 + 'px)'
    const at = D.groups.findIndex((g) => t >= g.s && t < g.e + 0.05)
    const caption = $('caption')
    if (at !== shown) {
      shown = at
      caption.innerHTML = ''
      if (at >= 0) for (const [text] of D.groups[at].w) {
        const span = document.createElement('span')
        span.textContent = text
        caption.appendChild(span)
      }
    }
    if (at >= 0) {
      const g = D.groups[at]
      const pop = ease(clamp((t - g.s) / 0.12))
      caption.style.transform = 'scale(' + (0.9 + 0.1 * pop) + ')'
      caption.style.opacity = t > D.speech ? 0 : 1
      ;[...caption.children].forEach((span, i) => {
        const start = g.w[i][1]
        const next = i + 1 < g.w.length ? g.w[i + 1][1] : g.e
        const on = t >= start && t < next
        span.className = on ? 'on' : ''
        span.style.transform = on ? 'scale(1.05)' : 'scale(1)'
      })
    }
    const end = ease(clamp((t - D.speech - 0.1) / 0.45))
    $('end').style.opacity = end
    $('end').style.transform = 'scale(' + (1.04 - 0.04 * end) + ')'
  }
  if (window.NWLab && NWLab.onSeek) NWLab.onSeek(render)
  window.nwlabSeek = render
  render(0)
</script>
</body></html>`
}

// A clip for each scene: one that lasts the scene when there is any, never the
// same clip twice, trying the scene's search and then the video's title.
export function chooseClip(found: StockClip[], seconds: number, used: Set<string>): StockClip | undefined {
  const fresh = found.filter((c) => !used.has(`${c.provider}-${c.id}`))
  return fresh.find((c) => c.duration >= seconds) ?? fresh[0]
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'video-curto'

export interface ShortResult {
  file: string
  url: string
  seconds: number
  scenes: number
  credits: string[]
  timing: string
}

export async function makeShortVideo(job: {
  settings: Settings
  project: ChatProject
  plan: ShortPlan
  voice: MediaTarget
  musicTarget: MediaTarget | null
  signal?: AbortSignal
  onStep?: (text: string) => void
}): Promise<ShortResult> {
  const { settings, project, plan, signal } = job
  const step = job.onStep ?? (() => {})
  const scenes = plan.scenes.filter((s) => s.text?.trim())
  if (!scenes.length) throw new Error('The video needs at least one scene with narration.')
  const renderer = await findRenderer()
  if (!renderer) throw new Error('The short video is made by the TSRS server: open TSRS with npm run dev.')
  const stem = slug(plan.title)

  step('narração')
  const narration = await narrate(settings, job.voice, scenes.map((s) => s.text.trim()).join(' '), signal)
  const voiceFile = `midia/${stem}-narracao.mp3`
  await saveFiles(project.path, [{ name: voiceFile, content: narration.data, encoding: 'base64' }])
  const times = sceneTimes(scenes.map((s) => s.text), narration.words, narration.duration + TAIL)

  const used = new Set<string>()
  const clips: { file: string; duration: number }[] = []
  const credits: string[] = []
  for (const [i, scene] of scenes.entries()) {
    step(`imagens ${i + 1}/${scenes.length}`)
    const seconds = times[i].end - times[i].start
    let clip = chooseClip(await searchStock(settings, scene.search || plan.title, ORIENTATION[plan.format], 12, signal), seconds, used)
    if (!clip && scene.search) clip = chooseClip(await searchStock(settings, plan.title, ORIENTATION[plan.format], 12, signal), seconds, used)
    if (!clip) throw new Error(`No stock clip found for scene ${i + 1} ("${scene.search}").`)
    used.add(`${clip.provider}-${clip.id}`)
    const file = await saveClip(project, clip, signal)
    clips.push({ file, duration: seconds })
    credits.push(creditLine(clip, file))
  }

  let music: string | null = null
  if (plan.music && plan.music !== 'none' && plan.music !== 'generate') music = plan.music
  else if (plan.music === 'generate' && job.musicTarget) {
    step('música')
    try {
      const length = Math.ceil((narration.duration + TAIL) * 1000)
      const { generateMedia } = await import('./mediaJobs')
      const made = await generateMedia({
        settings,
        // ElevenLabs makes music of the length asked.
        target: job.musicTarget.source === 'elevenlabs' ? { ...job.musicTarget, options: JSON.stringify({ music_length_ms: length }) } : job.musicTarget,
        kind: 'audio',
        prompt: `${plan.musicStyle || 'calm, modern instrumental background music'}, instrumental, no vocals, ${Math.ceil(narration.duration + TAIL)} seconds`,
        signal,
      })
      if (made.data) {
        music = `midia/${stem}-musica.mp3`
        await saveFiles(project.path, [{ name: music, content: made.data, encoding: 'base64' }])
      }
    } catch {
      // The video is made without music rather than not at all.
    }
  }

  step('montagem')
  const response = await fetch(`${renderer}/short`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project: project.path,
      name: stem,
      html: shortOverlay(plan, narration.words, narration.duration),
      format: plan.format,
      narration: voiceFile,
      ...(music ? { music } : {}),
      scenes: clips,
    }),
    signal,
  })
  if (!response.ok || !response.body) throw new Error((await response.text().catch(() => '')) || `HTTP ${response.status}`)
  let name = ''
  for await (const line of jsonLines(response.body)) {
    if (line.error) throw new Error(line.error)
    if (line.frames) step(`montagem ${Math.round((100 * line.frame) / line.frames)}%`)
    if (line.done) name = line.name
  }
  if (!name) throw new Error('The renderer stopped without a video.')
  const file = `videos/${name}`
  await saveFiles(project.path, [
    { name: 'CREDITOS.md', content: `\n## ${file}\n\n${credits.join('\n')}\n`, append: true },
  ])
  return {
    file,
    url: fileUrl(project.path, file),
    seconds: Math.round((narration.duration + TAIL) * 10) / 10,
    scenes: scenes.length,
    credits,
    timing: narration.timing,
  }
}

