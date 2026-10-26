import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { EN, trDeep, untr } from './lang'

// A stand-in for the Anthropic Messages API, for the tutorial recordings: it
// streams replies written for the video, a few words at a time, so the screen
// shows the app as it really works with Claude.

export interface Scripted {
  // Chosen when the last user message matches.
  when: RegExp
  // And, when given, the system prompt must match too (agents at a table).
  system?: RegExp
  text: string
  // Title for the chat, when the app asks for one.
  title?: string
  // Tool calls to make first, one round each; the text comes after them.
  tools?: { name: string | RegExp; input: object }[]
  thinking?: string
  // Words per second while streaming.
  wps?: number
  usage?: { input: number; output: number }
}

export interface VideoMock {
  url: string
  // Items matching the same message are used in turn (regenerate gets the next);
  // reset(n) starts every such turn at the n-th item.
  reset(n?: number): void
  close(): Promise<void>
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const textOf = (content: any): string =>
  typeof content === 'string' ? content : (content ?? []).map((c: any) => (c.type === 'text' ? c.text : '')).join('\n')

export async function startVideoMock(script: Scripted[]): Promise<VideoMock> {
  // The English take: replies translated; what the user sends is matched in Portuguese.
  if (EN) script = script.map((s) => ({ ...s, text: trDeep(s.text), title: trDeep(s.title), thinking: trDeep(s.thinking), tools: trDeep(s.tools) }))
  const seen = new Map<Scripted, number>()
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end()
    if (req.url?.endsWith('/models')) {
      return res
        .writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ data: [{ id: 'claude-opus-5-5' }, { id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-5-5' }] }))
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw || '{}')
    const messages: any[] = body.messages ?? []
    const last = messages.at(-1)
    const lastUser = messages.findLast((m) => m.role === 'user' && textOf(m.content).trim())
    const asked = untr(textOf(lastUser?.content))
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream' })
    const send = (event: object) => res.write(`event: ${(event as any).type}\ndata: ${JSON.stringify(event)}\n\n`)

    // Title requests carry the conversation in one message.
    if (raw.includes('Crie um título')) {
      const all = untr(messages.map((m) => textOf(m.content)).join('\n'))
      const item = script.find((s) => s.title && s.when.test(all))
      const title = item?.title ?? (EN ? 'Chat' : 'Conversa')
      send({ type: 'message_start', message: { usage: { input_tokens: 80, output_tokens: 0 } } })
      send({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: title } })
      send({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 6 } })
      send({ type: 'message_stop' })
      return res.end()
    }

    const system = untr(typeof body.system === 'string' ? body.system : (body.system ?? []).map((b: any) => b.text ?? '').join('\n'))
    const matches = script.filter((s) => s.when.test(asked) && (!s.system || s.system.test(system)))
    // A tool round in progress: count the tool results since the user spoke.
    const since = messages.slice(messages.lastIndexOf(lastUser) + 1)
    const rounds = since.filter((m) => m.role === 'assistant').length
    const fresh = rounds === 0 && last?.role === 'user'
    // Items written for the same message (same pattern) take turns.
    const turns = matches.filter((s) => s.when.source === matches[0]?.when.source)
    let item = turns[0]
    if (turns.length > 1) {
      const n = seen.get(turns[0]) ?? 0
      item = turns[Math.min(n, turns.length - 1)]
      if (fresh) seen.set(turns[0], n + 1)
    }
    const usage = item?.usage ?? { input: 1200, output: 180 }
    send({ type: 'message_start', message: { usage: { input_tokens: usage.input, output_tokens: 0 } } })
    await sleep(250)
    let index = 0
    if (item?.thinking && rounds === 0) {
      send({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } })
      for (const w of item.thinking.split(/(?<= )/)) {
        send({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: w } })
        await sleep(40)
      }
      send({ type: 'content_block_stop', index })
      index++
    }
    const tool = item?.tools?.[rounds]
    if (tool) {
      // A pattern picks the tool among those the app offered (MCP tools get a prefix).
      const name =
        typeof tool.name === 'string'
          ? tool.name
          : ((body.tools ?? []).map((t: any) => t.name).find((n: string) => (tool.name as RegExp).test(n)) ?? 'missing_tool')
      send({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_${Date.now()}`, name, input: {} } })
      send({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } })
      send({ type: 'content_block_stop', index })
      send({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 60 } })
      send({ type: 'message_stop' })
      return res.end()
    }
    const text = item?.text ?? (EN ? 'Sure.' : 'Certo.')
    send({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
    const wps = item?.wps ?? 14
    for (const w of text.split(/(?<=\s)/)) {
      send({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: w } })
      await sleep(1000 / wps)
    }
    send({ type: 'content_block_stop', index })
    send({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: usage.output } })
    send({ type: 'message_stop' })
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/v1`,
    reset: (n = 0) => {
      seen.clear()
      for (const s of script) seen.set(s, n)
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
