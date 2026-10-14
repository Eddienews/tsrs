import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface RecordedRequest {
  headers: http.IncomingHttpHeaders
  body: any
}

export interface MockProvider {
  // Base URL to type into the app, ending in /v1.
  url: string
  // Chat requests received, excluding title generation.
  chats: RecordedRequest[]
  // Makes the next chat request fail with this status.
  failNext(status: number, headers?: Record<string, string>): void
  close(): Promise<void>
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

// An OpenAI-compatible server that streams canned replies and records what
// the app sent.
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

export async function startMockProvider(): Promise<MockProvider> {
  const chats: RecordedRequest[] = []
  let failure: { status: number; headers: Record<string, string> } | null = null
  let replies = 0

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end()
    if (req.url === '/v1/models') {
      return res
        .writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ data: [{ id: 'mock-a', context_length: 1000 }, { id: 'mock-b' }] }))
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    const isTitle = raw.includes('Crie um título')
    if (!isTitle) chats.push({ headers: req.headers, body })

    if (failure && !isTitle) {
      const { status, headers } = failure
      failure = null
      return res
        .writeHead(status, { ...CORS, ...headers, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: { message: 'mock failure' } }))
    }

    res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream' })
    const last = body.messages.at(-1)
    // Asked to use a tool, the mock calls the first one it was offered.
    if (body.tools?.length && last.role === 'user' && String(last.content).includes('ferramenta')) {
      const call = {
        index: 0,
        id: `call_${chats.length}`,
        function: { name: body.tools[0].function.name, arguments: '{"text":"olá"}' },
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [call] } }] })}\n\n`)
      const done = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
      return res.end(`data: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`)
    }
    const parts = isTitle
      ? ['"Saudação ', 'inicial".']
      : last.role === 'tool'
        ? [`A ferramenta respondeu: ${last.content}`]
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
