import type { ChartSpec } from './charts'

// The JavaScript interpreter the model can use: code runs in a Web Worker made
// inside a sandboxed frame with no origin of its own, so it cannot reach TSRS,
// its storage or its keys. The frame's content security policy also forbids
// any network request, so what it is given (the conversation's files) cannot
// be sent anywhere. Taking too long removes the frame, which ends the worker,
// without freezing the page.

export const TIMEOUT = 15_000
const MAX_OUTPUT = 20_000
const MAX_CHARTS = 6
// The most a run may send back, all told.
const MAX_MESSAGE = 2_000_000

export interface RunResult {
  ok: boolean
  // What console.log and friends printed, in order.
  output: string
  // What the code returned, as text; empty when nothing.
  value: string
  error?: string
  charts: ChartSpec[]
}

// What runs in the worker: the helpers, then the user's code as an async
// function body. Kept as a string because the worker is made from a blob.
const WORKER = String.raw`
const lines = []
const charts = []
const show = (v) => typeof v === 'string' ? v : (() => { try { return JSON.stringify(v, null, 2) } catch { return String(v) } })()
for (const level of ['log', 'info', 'warn', 'error', 'table', 'debug']) {
  console[level] = (...args) => lines.push((level === 'error' || level === 'warn' ? level + ': ' : '') + args.map(show).join(' '))
}
// CSV (or TSV) text as rows of objects keyed by the header; numbers become numbers.
function csv(text, separator) {
  const source = String(text).replace(/^﻿/, '')
  const first = source.split(/\r?\n/, 1)[0] || ''
  const sep = separator || (first.split('\t').length > first.split(',').length ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',')
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows.filter((r) => r.some((cell) => cell.trim() !== ''))
  if (!head) return []
  const value = (cell) => {
    const t = cell.trim()
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
    if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t) || /^-?\d+,\d+$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'))
    return t
  }
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), value(r[i] ?? '')])))
}
function chart(spec) {
  if (charts.length >= ${MAX_CHARTS}) throw new Error('At most ${MAX_CHARTS} charts per run.')
  charts.push(JSON.parse(JSON.stringify(spec)))
  return 'chart ' + charts.length + ' drawn'
}
// Only this script answers; the code gets no way to post, to reach the network
// or to start other workers (the frame's policy forbids the network too).
const post = self.postMessage.bind(self)
const onMessage = async (event) => {
  const { code, files } = event.data
  const send = (result) => {
    let size = 0
    try { size = JSON.stringify(result).length } catch {}
    post(size > ${MAX_MESSAGE} ? { ok: false, output: '', value: '', error: 'The result was too large.', charts: [] } : result)
  }
  try {
    const run = new (Object.getPrototypeOf(async function () {}).constructor)('files', 'csv', 'chart', code)
    const value = await run(files, csv, chart)
    send({ ok: true, output: lines.join('\n').slice(0, ${MAX_OUTPUT * 2}), value: value === undefined ? '' : show(value).slice(0, ${MAX_OUTPUT * 2}), charts })
  } catch (error) {
    send({ ok: false, output: lines.join('\n').slice(0, ${MAX_OUTPUT * 2}), value: '', error: String(error && error.stack || error).slice(0, 4000), charts })
  }
}
for (const name of ['postMessage', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'onmessage']) {
  for (const target of [self, Object.getPrototypeOf(self), DedicatedWorkerGlobalScope.prototype, WorkerGlobalScope.prototype]) {
    try { delete target[name] } catch {}
    try { Object.defineProperty(target, name, { value: undefined, configurable: false, writable: false }) } catch {}
  }
}
addEventListener('message', onMessage, { once: true })
`

// The frame: no origin, no network; it makes the worker and relays messages.
function frameHtml(): string {
  const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:"
  return (
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}">` +
    `<script>addEventListener('message', (e) => {` +
    `const { id, code, files, worker } = e.data;` +
    `const w = new Worker(URL.createObjectURL(new Blob([worker], { type: 'text/javascript' })));` +
    `w.onmessage = (m) => parent.postMessage({ ...m.data, tsrsRun: id }, '*');` +
    `w.onerror = (err) => parent.postMessage({ tsrsRun: id, ok: false, output: '', value: '', error: String(err.message || err), charts: [] }, '*');` +
    `w.postMessage({ code, files }) })<\/script>`
  )
}

function clip(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n[cut at ${MAX_OUTPUT} characters]` : text
}

export function runInterpreter(code: string, files: Record<string, string>, timeout = TIMEOUT): Promise<RunResult> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.style.display = 'none'
    const id = crypto.randomUUID()
    const finish = (result: RunResult) => {
      clearTimeout(timer)
      window.removeEventListener('message', receive)
      frame.remove()
      resolve({ ...result, output: clip(result.output), value: clip(result.value), charts: result.charts.slice(0, MAX_CHARTS) })
    }
    const timer = setTimeout(
      () => finish({ ok: false, output: '', value: '', error: `Stopped after ${timeout / 1000} seconds.`, charts: [] }),
      timeout,
    )
    function receive(event: MessageEvent) {
      const data = event.data as Partial<RunResult> & { tsrsRun?: string }
      if (event.source !== frame.contentWindow || data?.tsrsRun !== id) return
      finish({
        ok: !!data.ok,
        output: String(data.output ?? ''),
        value: String(data.value ?? ''),
        ...(data.error ? { error: String(data.error) } : {}),
        charts: Array.isArray(data.charts) ? data.charts.filter((c) => c && typeof c === 'object') : [],
      })
    }
    window.addEventListener('message', receive)
    frame.srcdoc = frameHtml()
    frame.onload = () => frame.contentWindow?.postMessage({ id, code, files, worker: WORKER }, '*')
    document.body.append(frame)
  })
}

// The result as the model reads it.
export function resultText(result: RunResult): string {
  const parts = [
    result.output && `Output:\n${result.output}`,
    result.value && `Returned:\n${result.value}`,
    result.charts.length && `${result.charts.length} chart(s) drawn and shown to the user.`,
    result.error && `Error:\n${result.error}`,
  ].filter(Boolean)
  return parts.join('\n\n') || 'The code ran and printed nothing.'
}

export const INTERPRETER_TOOL = {
  name: 'run_javascript',
  description:
    'Run JavaScript (an async function body) in an isolated sandbox with no network and no access to the app, ' +
    'and get back what it printed and returned. Use it for exact calculations, data analysis and charts instead ' +
    'of doing the math yourself. Available inside: `files`, an object mapping the name of each text or CSV file ' +
    'attached to this conversation to its text (spreadsheets arrive as CSV, one per sheet); `csv(text)`, which ' +
    'parses CSV/TSV into an array of row objects with numbers as numbers; `chart(spec)`, which draws a chart the ' +
    'user sees, where spec is {type: "bar"|"line"|"pie"|"scatter", title, labels: string[], series: [{name, values: number[]}], x, y} ' +
    '(scatter series use points: [[x, y], ...]); console.log for output; `return` a value to get it back. ' +
    'No fetch, no DOM, no imports. Stops after 15 seconds.',
  schema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript to run, as the body of an async function.' },
    },
    required: ['code'],
  },
}

// The text files of a conversation's messages, by name, for the interpreter.
export function conversationFiles(messages: { attachments?: { kind: string; name: string; data: string }[] }[]): Record<string, string> {
  const files: Record<string, string> = {}
  for (const message of messages) {
    for (const a of message.attachments ?? []) {
      if (a.kind !== 'text') continue
      let name = a.name
      for (let n = 2; name in files; n++) name = a.name.replace(/(\.[^.]*)?$/, ` (${n})$1`)
      files[name] = a.data
    }
  }
  return files
}
