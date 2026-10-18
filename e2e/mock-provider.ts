import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface RecordedRequest {
  headers: http.IncomingHttpHeaders
  body: any
  url?: string
}

export interface MockProvider {
  // Base URL to type into the app, ending in /v1.
  url: string
  // Chat requests received, excluding title generation.
  chats: RecordedRequest[]
  // Audio transcription requests received, as raw multipart bodies.
  transcriptions: string[]
  // Image generation requests received.
  images: any[]
  // Texts sent to be turned into vectors.
  embedded: string[]
  // Makes the next chat request fail with this status.
  failNext(status: number, headers?: Record<string, string>): void
  close(): Promise<void>
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

// A 1×1 orange PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

// A page that logs to the console and reports whether it can reach the
// storage of the app that previews it.
const PAGE = `<!doctype html>
<html>
  <body>
    <h1>Olá do preview</h1>
    <script>
      console.log('log do preview', { n: 1 })
      try {
        localStorage.getItem('tsrs:settings')
        document.body.dataset.storage = 'open'
      } catch {
        document.body.dataset.storage = 'blocked'
      }
      console.error('erro do preview')
    </script>
  </body>
</html>`

const COMPONENT = `import { useState } from 'react'

export default function Contador() {
  const [n, setN] = useState<number>(0)
  return <button onClick={() => setN(n + 1)}>Cliques: {n}</button>
}`

// A motion composition that moves in the three ways the contract seeks: an
// anime.js timeline, a CSS animation and a seek handler.
const MOTION = `<!doctype html>
<html><head>
<meta name="nwlab:duration" content="4">
<meta name="nwlab:size" content="1280x720">
<style>
  body { background: #05070a; color: #fff; font: 48px sans-serif }
  #bar { height: 20px; background: orange; animation: grow 2s linear forwards }
  @keyframes grow { from { width: 0 } to { width: 100px } }
</style>
</head><body>
<div id="bar"></div>
<p id="box" style="opacity: 0">Caixa</p>
<p id="clock"></p>
<script>
  NWLab.register(anime.createTimeline({ autoplay: false }).add('#box', { opacity: { from: 0, to: 1 }, duration: 1000, ease: 'linear' }))
  NWLab.onSeek((t) => { document.getElementById('clock').textContent = 't=' + t.toFixed(2) })
</script>
</body></html>`

// A page in two files, as a reply that names them.
const SITE = `<!doctype html>
<html><head><link rel="stylesheet" href="styles.css"></head>
<body><h1>NorthWind Lab</h1></body></html>`
const SITE_CSS = 'h1 { color: rgb(220, 80, 0) }'

// A pretend embedding: one dimension per topic, so texts about the same topic
// point the same way even without a word in common.
const TOPICS = [/férias|descanso|folga/i, /prazo|entrega/i, /reembolso|despesa/i]

function meaning(text: string): number[] {
  return [...TOPICS.map((topic) => (topic.test(text) ? 1 : 0)), 0.1]
}

// An OpenAI-compatible server that streams canned replies and records what
// the app sent.
export async function startMockProvider(): Promise<MockProvider> {
  const chats: RecordedRequest[] = []
  const transcriptions: string[] = []
  const images: any[] = []
  const embedded: string[] = []
  let failure: { status: number; headers: Record<string, string> } | null = null
  let replies = 0

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end()
    if (req.url === '/v1/models') {
      return res
        .writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ data: [{ id: 'mock-a', context_length: 1000 }, { id: 'mock-b' }] }))
    }
    // A weather service for the plugin tools: GET /clima/<city>.
    const weather = /^\/clima\/([^/?]+)/.exec(req.url ?? '')
    if (weather) {
      return res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ cidade: decodeURIComponent(weather[1]), graus: 30, unidade: new URL(req.url!, 'http://x').searchParams.get('unidade') }))
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (req.url === '/v1/audio/transcriptions') {
      transcriptions.push(raw)
      return res
        .writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ text: 'ditado de teste' }))
    }
    if (req.url === '/v1/images/generations') {
      images.push(JSON.parse(raw))
      return res
        .writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ data: [{ b64_json: PNG, revised_prompt: 'Um gato laranja, de perfil' }] }))
    }
    if (req.url === '/v1/embeddings') {
      const { input } = JSON.parse(raw)
      embedded.push(...input)
      const data = input.map((text: string, index: number) => ({ index, embedding: meaning(text) }))
      return res
        .writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ data }))
    }
    const body = JSON.parse(raw)
    const isTitle = raw.includes('Crie um título')
    if (!isTitle) chats.push({ headers: req.headers, body, url: req.url })

    if (failure && !isTitle) {
      const { status, headers } = failure
      failure = null
      return res
        .writeHead(status, { ...CORS, ...headers, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: { message: 'mock failure' } }))
    }

    // Like gpt-6.1-sol: function tools only on the Responses API, whatever the effort.
    if (req.url === '/v1/responses') {
      const said = body.input.filter((i: any) => i.role === 'user').at(-1)?.content
      const text = String(said ?? '').replace(/^responda: /, '')
      res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n`)
      const usage = { input_tokens: 300, output_tokens: 20 }
      return res.end(`data: ${JSON.stringify({ type: 'response.completed', response: { usage } })}\n\n`)
    }
    if (String(body.messages.at(-1)?.content ?? '').includes('modelo exigente')) {
      return res
        .writeHead(400, { ...CORS, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: { message: "Function tools with reasoning_effort are not supported for gpt-6.1-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'." } }))
    }

    res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream' })
    const last = body.messages.at(-1)
    // Asked about the project folder, the mock reads or writes a file in it.
    const offered = (name: string) => body.tools?.some((t: any) => t.function.name === name)
    const projectCall =
      last.role === 'user' && String(last.content).includes('leia o index') && offered('project_read_file')
        ? { name: 'project_read_file', args: { file: 'index.html' } }
        : last.role === 'user' && String(last.content).includes('grave a página sobre') && offered('project_write_file')
          ? { name: 'project_write_file', args: { file: 'paginas/sobre.html', content: '<h1>Sobre</h1>' } }
          : null
    // "chame <tool> <json>" calls that tool, when it was offered.
    const asked = last.role === 'user' ? /^chame (\S+) (\{.*\})$/.exec(String(last.content)) : null
    const named = asked && body.tools?.find((t: any) => t.function.name === asked[1])
    if (asked && named) {
      const call = { index: 0, id: `call_${chats.length}`, function: { name: asked[1], arguments: asked[2] } }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [call] } }] })}\n\n`)
      const done = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
      return res.end(`data: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`)
    }
    if (projectCall) {
      const call = {
        index: 0,
        id: `call_${chats.length}`,
        function: { name: projectCall.name, arguments: JSON.stringify(projectCall.args) },
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [call] } }] })}\n\n`)
      const done = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
      return res.end(`data: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`)
    }
    // Asked to use a tool, the mock calls the first one it was offered.
    if (body.tools?.length && last.role === 'user' && String(last.content).includes('ferramenta')) {
      const name = body.tools[0].function.name
      const args =
        name === 'memory_save'
          ? '{"fact":"Gosta de café"}'
          : name === 'canvas_write'
            ? JSON.stringify({ content: '# Plano\n\nPasso 1', title: 'Plano' })
            : name === 'knowledge_search'
              ? '{"query":"descanso anual"}'
              : '{"text":"olá"}'
      const call = { index: 0, id: `call_${chats.length}`, function: { name, arguments: args } }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [call] } }] })}\n\n`)
      const done = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
      return res.end(`data: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`)
    }
    if (!isTitle && String(last.content).includes('fontes')) {
      const cited = { search_results: [{ title: 'Fonte A', url: 'https://a.example/x' }], choices: [] }
      res.write(`data: ${JSON.stringify(cited)}\n\n`)
    }
    if (!isTitle && String(last.content).includes('pense')) {
      const thought = { choices: [{ delta: { reasoning: 'Primeiro, o pedido. ' } }] }
      const more = { choices: [{ delta: { reasoning_content: 'Depois, a resposta.' } }] }
      res.write(`data: ${JSON.stringify(thought)}\n\ndata: ${JSON.stringify(more)}\n\n`)
    }
    // Pictures a tool returned come in a user message right after its result.
    const pictures = Array.isArray(last.content) && body.messages.at(-2)?.role === 'tool'
      ? last.content.filter((p: any) => p.type === 'image_url').length
      : 0
    const toolReply = last.role === 'tool' ? last : pictures ? body.messages.at(-2) : null
    const parts = isTitle
      ? ['"Saudação ', 'inicial".']
      : toolReply
        ? [`A ferramenta respondeu: ${toolReply.content}${pictures ? ` (com ${pictures} imagens)` : ''}`]
        : typeof last.content === 'string' && last.content.startsWith('responda: ')
          ? [last.content.slice('responda: '.length)]
        : String(last.content).includes('componente')
          ? ['Aqui:\n\n', '```tsx\n' + COMPONENT + '\n```\n\n```mermaid\ngraph TD\n  A[Início] --> B[Fim]\n```']
          : String(last.content).includes('site do NWLab')
          ? ['O site:\n\n', '```html index.html\n' + SITE + '\n```\n\n```css styles.css\n' + SITE_CSS + '\n```']
          : String(last.content).includes('animação')
          ? ['Sua animação:\n\n', '```motion\n' + MOTION + '\n```']
          : String(last.content).includes('página')
          ? ['Aqui está:\n\n', '```html\n' + PAGE + '\n```']
          : [`Resposta ${++replies}. `, 'Sou um **mock**.\n\n', '```js\nconst x = "oi"\n```']
    for (const content of parts) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
    }
    const usage = { prompt_tokens: 850, completion_tokens: 50 }
    res.end(`data: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/v1`,
    chats,
    transcriptions,
    images,
    embedded,
    failNext: (status, headers = {}) => {
      failure = { status, headers }
    },
    // Kept-alive browser connections would hold close() open until they time out.
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}
