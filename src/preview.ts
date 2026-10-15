import { insertHead, motionHead } from '../render/motion.mjs'
import { t } from './i18n'

export { motionSettings, type MotionSettings } from '../render/motion.mjs'

// Something shown in the preview panel: a code block from a reply, or a page
// opened by address.
export interface Artifact {
  id: string
  name: string
  // Language of the code block, or 'url' for a page.
  lang: string
  // The code, or the page's address.
  code: string
}

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error'
  text: string
}

// Marks the messages a preview sends to the app.
export const PREVIEW_SOURCE = 'tsrs-preview'

const EXTENSIONS: Record<string, string> = {
  html: 'html',
  svg: 'svg',
  markdown: 'md',
  md: 'md',
  js: 'js',
  javascript: 'js',
  jsx: 'jsx',
  tsx: 'tsx',
  react: 'jsx',
  mermaid: 'mmd',
  mmd: 'mmd',
  // An animated composition that becomes a video (render/motion.mjs).
  motion: 'motion',
}

// Libraries the React and Mermaid previews load from public CDNs, pinned.
const REACT = 'https://esm.sh/react@19.0.0'
const REACT_DOM = 'https://esm.sh/react-dom@19.0.0'
const BABEL = 'https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.4/babel.min.js'
const TAILWIND = 'https://cdn.tailwindcss.com/3.4.16'
const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs'

export function previewable(lang: string): boolean {
  return lang.toLowerCase() in EXTENSIONS
}

export function isMarkdown(lang: string): boolean {
  return EXTENSIONS[lang.toLowerCase()] === 'md'
}

export function isScript(lang: string): boolean {
  return EXTENSIONS[lang.toLowerCase()] === 'js'
}

export function isMotion(lang: string): boolean {
  return EXTENSIONS[lang.toLowerCase()] === 'motion'
}

export function artifactName(lang: string, number: number): string {
  if (isMotion(lang)) return `motion-${number}.html`
  return `preview-${number}.${EXTENSIONS[lang.toLowerCase()] ?? 'txt'}`
}

// Runs inside the preview and reports console output and uncaught errors to
// the app. Kept on one line so error line numbers still match the code.
const BRIDGE =
  '<script>(function(){function text(a){if(typeof a==="string")return a;' +
  'if(a instanceof Error)return a.stack||a.message;' +
  'try{var s=JSON.stringify(a);return s===undefined?String(a):s}catch(e){return String(a)}}' +
  'function send(level,args){try{parent.postMessage({source:"' +
  PREVIEW_SOURCE +
  '",level:level,text:Array.prototype.map.call(args,text).join(" ")},"*")}catch(e){}}' +
  '["log","info","debug","warn","error"].forEach(function(name){var real=console[name];' +
  'console[name]=function(){send(name==="warn"||name==="error"?name:"log",arguments);' +
  'real.apply(console,arguments)}});' +
  'addEventListener("error",function(e){send("error",[e.message+(e.lineno?" (line "+e.lineno+")":"")])});' +
  'addEventListener("unhandledrejection",function(e){' +
  'send("error",["Unhandled rejection: "+text(e.reason&&e.reason.message||e.reason)])})})()</script>'

// The bridge goes after the doctype and <head>, where it runs first without
// pushing the page into quirks mode.
function withBridge(html: string): string {
  for (const anchor of [/<head[^>]*>/i, /<html[^>]*>/i, /<!doctype[^>]*>/i]) {
    const match = anchor.exec(html)
    if (match) {
      const end = match.index + match[0].length
      return html.slice(0, end) + BRIDGE + html.slice(end)
    }
  }
  return BRIDGE + html
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// A value written into an inline script, which must not close the script tag.
function scriptValue(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

// Shows an error in the frame and in the console tab.
function errorHelper(): string {
  return `
const show = (error) => {
  const text = error && error.message ? error.message : String(error)
  console.error(text)
  const pre = document.createElement('pre')
  pre.style.cssText = 'color:#b91c1c;white-space:pre-wrap;font:13px ui-monospace,monospace;padding:16px'
  pre.textContent = text
  document.body.append(pre)
}
const offline = ${scriptValue(t('Não foi possível carregar as bibliotecas do preview. Verifique a conexão com a internet.'))}`
}

// Compiles the component in the frame (JSX and TypeScript), loads its imports
// from esm.sh and renders its default export, or `App`.
function reactDocument(code: string): string {
  const imports = {
    react: REACT,
    'react/': `${REACT}/`,
    'react-dom': REACT_DOM,
    'react-dom/': `${REACT_DOM}/`,
  }
  const run = `
const source = ${scriptValue(code)}
${errorHelper()}
try {
  if (typeof Babel === 'undefined') throw new Error(offline)
  let { code } = Babel.transform(source, {
    filename: 'App.tsx',
    presets: [['react', { runtime: 'automatic' }], ['typescript', { isTSX: true, allExtensions: true }]],
  })
  code = code
    .replace(/^\\s*import\\s+['"][^'"]+\\.css['"];?\\s*$/gm, '')
    .replace(/(\\bfrom\\s*|\\bimport\\s*\\(?\\s*)(['"])([^'"./][^'"]*)\\2/g, (match, before, quote, name) =>
      /^(https?:|react(-dom)?(\\/|$))/.test(name)
        ? match
        : before + quote + 'https://esm.sh/' + name + '?external=react,react-dom' + quote)
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  // A missing library or package fails here, with a message that names only the blob.
  const mod = await import(url).catch((error) => {
    throw new Error(offline + '\\n\\n' + (error && error.message ? error.message : error))
  })
  const App = mod.default ?? mod.App
  if (typeof App === 'function') {
    const [{ createElement }, { createRoot }] = await Promise.all([import('react'), import('react-dom/client')])
    createRoot(document.getElementById('root')).render(createElement(App))
  }
} catch (error) {
  show(error)
}`
  return withBridge(
    '<!doctype html><html><head>' +
      `<script type="importmap">${scriptValue({ imports })}</script>` +
      `<script src="${TAILWIND}"></script><script src="${BABEL}"></script>` +
      '<style>body{margin:0;font-family:system-ui,sans-serif}</style></head>' +
      `<body><div id="root"></div><script type="module">${run}</script></body></html>`,
  )
}

function mermaidDocument(code: string): string {
  const run = `
${errorHelper()}
let mermaid
try {
  mermaid = (await import('${MERMAID}')).default
} catch {
  show(new Error(offline))
}
if (mermaid) {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
  try {
    await mermaid.run()
  } catch (error) {
    show(error)
  }
}`
  return withBridge(
    '<!doctype html><html><head><style>body{margin:0;padding:16px;font-family:system-ui,sans-serif}</style></head>' +
      `<body><pre class="mermaid">${escapeHtml(code)}</pre><script type="module">${run}</script></body></html>`,
  )
}

// Where the motion runtime and its libraries are served from: public/motion/
// of this app. The address is absolute because a preview opened in a new tab
// has no base of its own.
function motionBase(): string {
  const root = import.meta.env?.BASE_URL ?? '/'
  return typeof location === 'undefined'
    ? `${root}motion/`
    : new URL(`${root}motion/`, location.href).href
}

// A composition with the motion runtime in front of its own scripts. It
// stands still until the preview's timeline seeks it.
export function motionDocument(code: string, base = motionBase()): string {
  return withBridge(insertHead(code, motionHead(code, base)))
}

// The HTML document that renders a code block, or null when the language is
// not one that runs in a frame.
export function previewDocument(lang: string, code: string): string | null {
  switch (EXTENSIONS[lang.toLowerCase()]) {
    case 'html':
      return withBridge(code)
    case 'svg':
      return withBridge(
        `<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh">${code}</body>`,
      )
    case 'jsx':
    case 'tsx':
      return reactDocument(code)
    case 'mmd':
      return mermaidDocument(code)
    case 'motion':
      return motionDocument(code)
    case 'js':
      return withBridge(
        `<!doctype html><body><script>${code.replace(/<\/script/gi, '<\\/script')}</script></body>`,
      )
    default:
      return null
  }
}

// Turns what was typed in the address bar into an http(s) address, or null.
export function normalizeUrl(text: string): string | null {
  const typed = text.trim()
  if (!typed || /\s/.test(typed)) return null
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(typed)
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed)
    ? typed
    : `${local ? 'http' : 'https'}://${typed}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!local && !url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return url.href
  } catch {
    return null
  }
}

// Sandbox of a page opened by address. A page of the app's own origin loses
// its origin: with it, the page could read the app's storage and the API keys.
export function urlSandbox(url: string, origin: string): string {
  let same = true
  try {
    same = new URL(url).origin === origin
  } catch {
    // An address that does not parse gets the strict sandbox.
  }
  return same
    ? 'allow-scripts allow-forms allow-popups'
    : 'allow-scripts allow-same-origin allow-forms allow-popups'
}

// How to write a motion block: the same contract as NWLab ForgeOS's motion pages.
const MOTION_HINT =
  '\n\nFor an animation or video (an intro, a teaser, an animated title, a social clip), write ' +
  'one complete HTML document in a block tagged motion. The panel shows it with a timeline and ' +
  'its "Gerar MP4" button renders it to a video frame by frame, so the page must never ' +
  'move by itself: everything it shows at a time t must come from t alone. Declare in <head> ' +
  '<meta name="nwlab:duration" content="SECONDS">, <meta name="nwlab:size" content="1080x1920"> ' +
  '(or 1920x1080, 1080x1080) and optionally <meta name="nwlab:fps" content="30">; html and body ' +
  'already have that size. Animate with any of: CSS animations and transitions (they are paused ' +
  'and seeked); anime.js v4, which is already loaded as the global `anime` (create timelines ' +
  'with autoplay: false and pass them to NWLab.register(tl)); NWLab.onSeek((seconds) => { ... }) ' +
  'to draw a frame yourself; lottie (global `lottie`, renderer svg, autoplay false, inline ' +
  'animationData, then goToAndStop in onSeek). Never use Date, performance.now, ' +
  'requestAnimationFrame, setTimeout or Math.random without a fixed seed to move things. Keep ' +
  'everything inline: no external images, fonts or scripts, since the video is rendered offline.'

// Appended to the system prompt so the model knows the reader can render code,
// instead of telling them to save a file or use another site. `button` is the
// name of the button in the interface's language.
export function withPreviewHint(system: string, button: string): string {
  const hint =
    'The user is reading this conversation in an app with a built-in preview panel. Every ' +
    'fenced code block tagged html, svg, javascript, jsx, tsx, mermaid, markdown or motion gets a ' +
    `"${button}" button that renders it in that panel. When asked to show, build or preview a ` +
    'page, drawing, diagram or script, write one complete, self-contained block (CSS and ' +
    'scripts inline) and point to that button. A React component goes in one jsx or tsx ' +
    'block that default-exports it; it may import npm packages and use Tailwind classes. Do ' +
    'not say you cannot show a preview, and do not suggest saving files or using other sites ' +
    'to see the result.' +
    MOTION_HINT
  return system.trim() ? `${system.trim()}\n\n${hint}` : hint
}

const FENCE = /^(`{3,})([\w-]+)[^\n]*\n([\s\S]*?)\n\1[ \t]*$/gm

// The last code block in `text` that the preview can show.
export function lastPreviewable(
  text: string,
  // Languages to consider; any previewable one when absent.
  only?: string[],
): { lang: string; code: string } | null {
  const blocks = [...text.matchAll(FENCE)].filter((match) =>
    only ? only.includes(match[2].toLowerCase()) : previewable(match[2]),
  )
  const last = blocks.at(-1)
  return last ? { lang: last[2].toLowerCase(), code: last[3] } : null
}

// Code as a Markdown block, with a fence longer than any run of backticks in it.
export function fenced(lang: string, code: string): string {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${lang}\n${code}\n${fence}`
}
