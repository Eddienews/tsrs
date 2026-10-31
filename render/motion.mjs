// How a motion composition becomes a page that can be seeked: shared by the
// preview (src/preview.ts) and the video renderer (render/render.mjs), so the
// preview's timeline and the MP4 show the same frames.
//
// A composition is one HTML document. It may declare, in its <head>:
//   <meta name="nwlab:duration" content="8">      seconds
//   <meta name="nwlab:size" content="1080x1920">  width x height in pixels
//   <meta name="nwlab:fps" content="30">          frames per second of the video
// and animates with the NWLab motion contract (public/motion/runtime.js).

export const MOTION_DEFAULTS = { duration: 6, width: 1080, height: 1920, fps: 30 }

const LIMITS = { duration: [0.5, 600], side: [16, 3840], fps: [1, 60] }

function meta(code, name) {
  const tags = code.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const key = /\bname\s*=\s*["']?([^"'\s>]+)/i.exec(tag)
    if (key && key[1].toLowerCase() === name) {
      const value = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag)
      return value ? (value[1] ?? value[2] ?? value[3]).trim() : null
    }
  }
  return null
}

const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value))
// Video encoders want even sides.
const even = (value) => Math.round(clamp(value, LIMITS.side) / 2) * 2

// Duration, frame size and frame rate of a composition, from its meta tags,
// with defaults for what is missing or invalid.
export function motionSettings(code) {
  const settings = { ...MOTION_DEFAULTS }
  const duration = Number.parseFloat(meta(code, 'nwlab:duration') ?? '')
  if (Number.isFinite(duration)) settings.duration = clamp(duration, LIMITS.duration)
  const size = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(meta(code, 'nwlab:size') ?? '')
  if (size) {
    settings.width = even(Number(size[1]))
    settings.height = even(Number(size[2]))
  }
  const fps = Number.parseFloat(meta(code, 'nwlab:fps') ?? '')
  if (Number.isFinite(fps)) settings.fps = Math.round(clamp(fps, LIMITS.fps))
  return settings
}

// Libraries a composition may use, served from public/motion/: anime.js 4.5.0
// and lottie-web 5.13.0 (SVG player), both MIT. Loaded only when the code
// names them.
const LIBRARIES = [
  { test: /\banime\s*\./, file: 'anime.umd.min.js' },
  { test: /\blottie\s*\./, file: 'lottie_svg.min.js' },
]

// The scripts that go at the top of the composition's <head>, before its own:
// the configuration, the runtime and the libraries it uses. `base` is the
// address of the folder that holds runtime.js, ending in a slash.
// `extra` (from the video pipeline, render/video.mjs):
//   duration   seconds, instead of nwlab:duration (the narration's length)
//   data       values the composition reads from NWLab.data; data.timeline is
//              the narration's scenes and words (NWLab.scene, NWLab.word)
//   captions   { cues, style }: captions the runtime draws over the frame
export function motionHead(code, base, extra = {}) {
  const s = motionSettings(code)
  const config = {
    duration: Number(extra.duration) > 0 ? Number(extra.duration) : s.duration,
    viewport: [s.width, s.height],
    fps: s.fps,
    data: extra.data && typeof extra.data === 'object' ? extra.data : {},
    ...(extra.captions?.cues?.length ? { captions: extra.captions } : {}),
  }
  const scripts = [
    `<style>html,body{margin:0;width:${s.width}px;height:${s.height}px;overflow:hidden}</style>`,
    `<script>window.__NWLAB__=${JSON.stringify(config).replace(/</g, '\\u003c')}</script>`,
    `<script src="${base}runtime.js"></script>`,
    ...LIBRARIES.filter((library) => library.test.test(code)).map(
      (library) => `<script src="${base}${library.file}"></script>`,
    ),
  ]
  return scripts.join('')
}

// Puts `head` right after the composition's <head> (or <html>, or doctype),
// so it runs before the composition's own scripts without quirks mode.
export function insertHead(html, head) {
  for (const anchor of [/<head[^>]*>/i, /<html[^>]*>/i, /<!doctype[^>]*>/i]) {
    const match = anchor.exec(html)
    if (match) {
      const end = match.index + match[0].length
      return html.slice(0, end) + head + html.slice(end)
    }
  }
  return head + html
}
