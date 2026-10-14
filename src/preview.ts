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
}

export function previewable(lang: string): boolean {
  return lang.toLowerCase() in EXTENSIONS
}

export function isMarkdown(lang: string): boolean {
  return EXTENSIONS[lang.toLowerCase()] === 'md'
}

export function isScript(lang: string): boolean {
  return EXTENSIONS[lang.toLowerCase()] === 'js'
}

export function artifactName(lang: string, number: number): string {
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

// Appended to the system prompt so the model knows the reader can render code,
// instead of telling them to save a file or use another site. `button` is the
// name of the button in the interface's language.
export function withPreviewHint(system: string, button: string): string {
  const hint =
    'The user is reading this conversation in an app with a built-in preview panel. ' +
    `Every fenced code block tagged html, svg, javascript or markdown gets a "${button}" button ` +
    'that renders it in that panel. When asked to show, build or preview a page, drawing or ' +
    'script, write one complete, self-contained block (CSS and scripts inline) and point to that ' +
    'button. Do not say you cannot show a preview, and do not suggest saving files or using ' +
    'other sites to see the result.'
  return system.trim() ? `${system.trim()}\n\n${hint}` : hint
}

const FENCE = /^(`{3,})([\w-]+)[^\n]*\n([\s\S]*?)\n\1[ \t]*$/gm

// The last code block in `text` that the preview can show.
export function lastPreviewable(text: string): { lang: string; code: string } | null {
  const blocks = [...text.matchAll(FENCE)].filter((match) => previewable(match[2]))
  const last = blocks.at(-1)
  return last ? { lang: last[2].toLowerCase(), code: last[3] } : null
}
