import { t } from './i18n'
import type {
  Attachment,
  ChatParams,
  ModelInfo,
  Part,
  Provider,
  Reference,
  Role,
  Source,
  ToolPart,
  Usage,
} from './types'

export interface Connection {
  provider: Provider
  baseUrl: string
  apiKey: string
  // Local proxy the request goes through, for providers without CORS.
  proxy?: string
}

export interface RequestMessage {
  role: Role
  content: string
  attachments?: Attachment[]
  // Tool calls made while writing an earlier reply.
  parts?: Part[]
}

// A tool the app can run for the model.
export interface ToolDef {
  name: string
  description: string
  // JSON Schema of the arguments.
  schema: unknown
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

// A picture a tool returns for the model to see (a screenshot, say).
export interface ToolImage {
  mime: string
  // Base64, without the data: prefix.
  data: string
}

export interface ToolResult {
  content: string
  isError: boolean
  // Pictures for the model, sent with this round's results only (the
  // conversation keeps the text).
  images?: ToolImage[]
  // Knowledge base passages the tool found, shown with the reply.
  references?: Reference[]
  // Web pages the tool found or read, listed under the reply.
  sources?: Source[]
}

export interface ChatRequest extends Connection {
  // How many rounds of tool calls a reply may take (12 unless set).
  maxRounds?: number
  model: string
  system: string
  messages: RequestMessage[]
  params?: ChatParams
  signal?: AbortSignal
  tools?: ToolDef[]
  // Runs one of `tools`; required when there are any.
  runTool?: (call: ToolCall) => Promise<ToolResult>
  // Provider-side tools, for providers that have them.
  webSearch?: boolean
  webFetch?: boolean
  // Ask for the model's reasoning, where the provider only sends it on request.
  showThinking?: boolean
  // Let the provider cache the prompt (Anthropic).
  promptCache?: boolean
}

export type StreamEvent =
  | { type: 'text'; text: string }
  // Part of the model's reasoning, shown apart from the reply.
  | { type: 'thinking'; text: string }
  // Pages cited for the reply so far; each event has the whole list.
  | { type: 'sources'; sources: Source[] }
  // Cumulative over the requests made so far for this reply.
  | { type: 'usage'; usage: Usage }
  | { type: 'truncated' }
  // A tool call started or finished; the same id is reported more than once.
  | { type: 'tool'; part: ToolPart }

// Requests a single reply may take: each round of tool calls costs one.
const MAX_ROUNDS = 12

// The Messages API requires max_tokens; streaming makes a generous cap safe.
const ANTHROPIC_MAX_TOKENS = 64000

function url(conn: Connection, path: string): string {
  const target = conn.baseUrl.replace(/\/+$/, '') + path
  return conn.proxy ? `${conn.proxy.replace(/\/+$/, '')}/${target}` : target
}

function headers(conn: Connection): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(conn.provider.headers)) {
    // Keyless providers (local servers) simply omit the auth header.
    if (value.includes('{apiKey}') && !conn.apiKey) continue
    out[key] = value.replace('{apiKey}', conn.apiKey)
  }
  return out
}

function explain(status: number, retryAfter: string | null): string {
  if (status === 401 || status === 403) return t('Chave de API inválida ou sem permissão')
  if (status === 404) return t('Modelo ou endereço não encontrado')
  if (status === 429) {
    const wait = Number(retryAfter)
    return wait > 0
      ? t('Limite de uso atingido; tente de novo em {seconds} s', { seconds: Math.ceil(wait) })
      : t('Limite de uso atingido; tente de novo em instantes')
  }
  if (status >= 500) return t('O provedor está com problemas; tente de novo em instantes')
  return t('O provedor recusou a requisição')
}

async function failure(res: Response): Promise<Error> {
  const text = await res.text()
  let detail = text
  try {
    const json = JSON.parse(text)
    detail = json.error?.message ?? json.message ?? text
  } catch {
    // not JSON; keep the raw body
  }
  const summary = `${explain(res.status, res.headers.get('retry-after'))} (HTTP ${res.status})`
  return new Error(detail ? `${summary}: ${detail.slice(0, 500)}` : summary)
}

// fetch that turns network failures and error statuses into readable errors.
async function request(target: string, init: RequestInit, conn?: Connection): Promise<Response> {
  let res: Response
  try {
    res = await fetch(target, init)
  } catch (err) {
    if (init.signal?.aborted) throw err
    if (conn?.proxy) {
      throw new Error(
        t('Não foi possível conectar ao proxy local em {url}. Inicie-o com npm run proxy.', {
          url: conn.proxy,
        }),
      )
    }
    let host = target
    try {
      host = new URL(target).host
    } catch {
      // not a valid URL; show it as typed
    }
    throw new Error(
      t(
        'Não foi possível conectar a {host}. Verifique sua conexão e a URL base; se ambas estiverem certas, o provedor pode não permitir chamadas diretas do navegador (CORS).',
        { host },
      ),
    )
  }
  if (!res.ok) throw await failure(res)
  return res
}

// Text files have no native content block, so they travel inside the text,
// and so does what an audio file says: chat APIs take no audio files.
export function textOf(message: RequestMessage): string {
  const files = (message.attachments ?? []).flatMap((a) =>
    a.kind === 'text'
      ? [`<file name="${a.name}">\n${a.data}\n</file>`]
      : a.kind === 'video' && a.frames?.length
        ? [videoText(a)]
      : a.kind === 'audio'
        ? [
            a.transcript
              ? `<audio name="${a.name}" transcription="automatic">\n${a.transcript}\n</audio>`
              : `[Audio file attached: ${a.name}. It was not transcribed, so its sound is not available to you.]`,
          ]
        : [],
  )
  return [message.content, ...files].filter(Boolean).join('\n\n')
}

// What the model is told about an attached video, whose frames go along as
// images in its place.
function videoText(a: Attachment): string {
  const frames = a.frames ?? []
  const times = frames.map((f) => `${f.at}s`).join(', ')
  const sound =
    a.transcript === undefined
      ? 'Its audio was not transcribed, so its sound is not available to you.'
      : a.transcript.trim()
        ? `What is said in it (automatic transcription):\n${a.transcript.trim()}`
        : 'No speech was found in its audio.'
  return [
    `<video name="${a.name}" duration="${Math.round(a.duration ?? 0)}s">`,
    `${frames.length} of the attached images are frames of this video, in order, taken at ${times}.`,
    sound,
    '</video>',
  ].join('\n')
}

// Images and PDFs, and the frames of attached videos as images; chat APIs
// take no video or audio files.
function binaries(message: RequestMessage): Attachment[] {
  return (message.attachments ?? []).flatMap((a) =>
    a.kind === 'image' || a.kind === 'pdf'
      ? [a]
      : a.kind === 'video' && a.frames?.length
        ? a.frames.map((f, i) => ({ ...a, id: `${a.id}-${i}`, kind: 'image' as const, mime: 'image/jpeg', data: f.data }))
        : [],
  )
}

function replayable(part: Part): part is ToolPart {
  return part.type === 'tool' && !part.provider && part.status === 'done'
}

function parse(json: string): unknown {
  try {
    return JSON.parse(json || '{}')
  } catch {
    return {}
  }
}

// An earlier reply that used tools, as the rounds of requests that made it: the
// text and calls of each round, with the results that answered them.
function rounds(parts: Part[]): { text: string; calls: ToolPart[] }[] {
  const out: { text: string; calls: ToolPart[] }[] = [{ text: '', calls: [] }]
  for (const part of parts) {
    let last = out[out.length - 1]
    if (part.type === 'text') {
      if (last.calls.length) out.push((last = { text: '', calls: [] }))
      last.text += part.text
    } else if (replayable(part)) {
      last.calls.push(part)
    }
  }
  return out.filter((round) => round.text || round.calls.length)
}

// Tool calls are replayed only when the request declares tools; without them
// the reply travels as plain text, which every provider accepts.
function usedTools(message: RequestMessage, req: ChatRequest): boolean {
  return !!req.tools?.length && !!message.parts?.some(replayable)
}

function anthropicMessages(message: RequestMessage, req: ChatRequest): unknown[] {
  if (usedTools(message, req)) {
    return rounds(message.parts!).flatMap((round) => [
      {
        role: 'assistant',
        content: [
          ...(round.text ? [{ type: 'text', text: round.text }] : []),
          ...round.calls.map((c) => ({
            type: 'tool_use',
            id: c.id,
            name: c.name,
            input: parse(c.input),
          })),
        ],
      },
      ...(round.calls.length ? [anthropicResults(round.calls)] : []),
    ])
  }
  const text = textOf(message)
  const media = binaries(message)
  if (!media.length) return [{ role: message.role, content: text }]
  return [
    {
      role: message.role,
      content: [
        ...media.map((a) => ({
          type: a.kind === 'pdf' ? 'document' : 'image',
          source: { type: 'base64', media_type: a.mime, data: a.data },
        })),
        ...(text ? [{ type: 'text', text }] : []),
      ],
    },
  ]
}

function anthropicResults(calls: Pick<ToolPart, 'id' | 'result' | 'error'>[]): unknown {
  return {
    role: 'user',
    content: calls.map((c) => ({
      type: 'tool_result',
      tool_use_id: c.id,
      content: c.result ?? '',
      ...(c.error ? { is_error: true } : {}),
    })),
  }
}

function openaiMessages(message: RequestMessage, req: ChatRequest): unknown[] {
  if (usedTools(message, req)) {
    return rounds(message.parts!).flatMap((round) => [
      {
        role: 'assistant',
        content: round.text || null,
        ...(round.calls.length
          ? {
              tool_calls: round.calls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: c.input || '{}' },
              })),
            }
          : {}),
      },
      ...openaiResults(round.calls),
    ])
  }
  const text = textOf(message)
  const media = binaries(message)
  if (!media.length) return [{ role: message.role, content: text }]
  return [
    {
      role: message.role,
      content: [
        ...(text ? [{ type: 'text', text }] : []),
        ...media.map((a) => {
          const dataUrl = `data:${a.mime};base64,${a.data}`
          return a.kind === 'pdf'
            ? { type: 'file', file: { filename: a.name, file_data: dataUrl } }
            : { type: 'image_url', image_url: { url: dataUrl } }
        }),
      ],
    },
  ]
}

function openaiResults(calls: Pick<ToolPart, 'id' | 'result'>[]): unknown[] {
  return calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: c.result ?? '' }))
}

// Provider-side web tools. The newer versions filter results with code the
// model writes, which Haiku models do not support.
function anthropicWebTools(req: ChatRequest): unknown[] {
  const basic = req.model.includes('haiku')
  return [
    ...(req.webSearch
      ? [{ type: basic ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search' }]
      : []),
    ...(req.webFetch
      ? [{ type: basic ? 'web_fetch_20250910' : 'web_fetch_20260209', name: 'web_fetch' }]
      : []),
  ]
}

// Claude models from 4.6 on think adaptively and, from 4.7 on, leave the
// reasoning text out unless asked for a summary of it.
export function adaptiveThinking(model: string): boolean {
  const match = /claude-(?:opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2})(?!\d))?/.exec(model)
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2] ?? 0)
  return major > 4 || (major === 4 && minor >= 6)
}

// `wire` is the conversation in the provider's own format, which grows by one
// round of tool calls at a time while a reply is being written.
function body(req: ChatRequest, wire: unknown[]): unknown {
  const { provider, params = {} } = req
  const temperature =
    provider.temperature && params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}
  const defs = req.tools ?? []

  if (provider.format === 'anthropic') {
    const tools = [
      ...defs.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })),
      ...(provider.webTools === 'anthropic' ? anthropicWebTools(req) : []),
    ]
    return {
      model: req.model,
      max_tokens: params.maxTokens ?? ANTHROPIC_MAX_TOKENS,
      ...(req.system ? { system: req.system } : {}),
      messages: wire,
      stream: true,
      ...temperature,
      ...(params.effort ? { output_config: { effort: params.effort } } : {}),
      ...(req.showThinking && adaptiveThinking(req.model)
        ? { thinking: { type: 'adaptive', display: 'summarized' } }
        : {}),
      ...(tools.length ? { tools } : {}),
      // Automatic caching: the breakpoint follows the end of the conversation,
      // so each request reads everything the previous one sent.
      ...(req.promptCache ? { cache_control: { type: 'ephemeral' } } : {}),
    }
  }
  return {
    model: req.model,
    messages: [...(req.system ? [{ role: 'system', content: req.system }] : []), ...wire],
    stream: true,
    ...(provider.streamUsage ? { stream_options: { include_usage: true } } : {}),
    ...temperature,
    ...(params.maxTokens ? { [provider.maxTokensField]: params.maxTokens } : {}),
    ...(params.effort ? { reasoning_effort: params.effort } : {}),
    ...(defs.length
      ? {
          tools: defs.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.schema },
          })),
        }
      : {}),
    ...(provider.webTools === 'openrouter' && req.webSearch ? { plugins: [{ id: 'web' }] } : {}),
  }
}

// One request of a reply: turns decoded SSE payloads into stream events and
// keeps what is needed to continue the reply if the model called tools.
interface Turn {
  decode(event: any): StreamEvent[]
  usage: Usage
  // 'tools' when the model is waiting for tool results, 'pause' when the
  // provider stopped a long turn that must be sent back to continue.
  stop: 'end' | 'tools' | 'pause'
  calls(): ToolCall[]
  // The model's turn in the provider's format, to append to the conversation.
  message(): unknown
  results(done: (ToolCall & ToolResult)[]): unknown[]
}

// What a provider-side tool returned, as text for the user to inspect.
function summarize(content: any): string {
  if (Array.isArray(content)) {
    return content
      .map((item) => (item.url ? `${item.title ?? ''}\n${item.url}`.trim() : ''))
      .filter(Boolean)
      .join('\n\n')
  }
  return content?.url ?? content?.error_code ?? ''
}

function anthropicTurn(): Turn {
  // Content blocks exactly as the API sent them: thinking blocks and
  // provider-side tool results must go back unchanged.
  const blocks: any[] = []
  const json: string[] = []
  const turn: Turn = {
    usage: { input: 0, output: 0 },
    stop: 'end',
    decode(event) {
      const events: StreamEvent[] = []
      const block = blocks[event.index]
      if (event.type === 'message_start') {
        const u = event.message?.usage ?? {}
        turn.usage.input =
          (u.input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0)
        if (u.cache_read_input_tokens) turn.usage.cacheRead = u.cache_read_input_tokens
        if (u.cache_creation_input_tokens) turn.usage.cacheWrite = u.cache_creation_input_tokens
      } else if (event.type === 'content_block_start') {
        const started = { ...event.content_block }
        blocks[event.index] = started
        json[event.index] = ''
        if (started.tool_use_id && String(started.type).endsWith('_tool_result')) {
          const failed = String(started.content?.type).endsWith('_error')
          events.push({
            type: 'tool',
            part: {
              type: 'tool',
              id: started.tool_use_id,
              name: '',
              provider: true,
              input: '',
              status: 'done',
              result: summarize(started.content),
              ...(failed ? { error: true } : {}),
            },
          })
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta ?? {}
        if (delta.type === 'text_delta') events.push({ type: 'text', text: delta.text })
        if (delta.type === 'thinking_delta' && delta.thinking) {
          events.push({ type: 'thinking', text: delta.thinking })
        }
        if (!block) return events
        if (delta.type === 'text_delta') {
          block.text += delta.text
        } else if (delta.type === 'input_json_delta') {
          json[event.index] += delta.partial_json
        } else if (delta.type === 'thinking_delta') {
          block.thinking += delta.thinking
        } else if (delta.type === 'signature_delta') {
          block.signature = delta.signature
        } else if (delta.type === 'citations_delta') {
          block.citations = [...(block.citations ?? []), delta.citation]
        }
      } else if (event.type === 'content_block_stop' && block) {
        if (block.type === 'tool_use' || block.type === 'server_tool_use') {
          if (json[event.index]) block.input = parse(json[event.index])
        }
        if (block.type === 'server_tool_use') {
          events.push({
            type: 'tool',
            part: {
              type: 'tool',
              id: block.id,
              name: block.name,
              provider: true,
              input: JSON.stringify(block.input ?? {}),
              status: 'running',
            },
          })
        }
      } else if (event.type === 'message_delta') {
        const reason = event.delta?.stop_reason
        if (reason === 'refusal') throw new Error(t('O modelo recusou esta solicitação.'))
        if (event.usage) turn.usage.output = event.usage.output_tokens ?? 0
        if (reason === 'max_tokens') events.push({ type: 'truncated' })
        if (reason === 'tool_use') turn.stop = 'tools'
        if (reason === 'pause_turn') turn.stop = 'pause'
      }
      return events
    },
    calls: () =>
      blocks
        .filter((b) => b?.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} })),
    message: () => ({ role: 'assistant', content: blocks.filter(Boolean) }),
    results: (done) =>
      done.length
        ? [
            {
              role: 'user',
              content: done.map((d) => ({
                type: 'tool_result',
                tool_use_id: d.id,
                content: d.images?.length
                  ? [
                      { type: 'text', text: d.content || '(no text)' },
                      ...d.images.map((image) => ({
                        type: 'image',
                        source: { type: 'base64', media_type: image.mime, data: image.data },
                      })),
                    ]
                  : d.content,
                ...(d.isError ? { is_error: true } : {}),
              })),
            },
          ]
        : [],
  }
  return turn
}

// Citations as Perplexity (search_results, or the older citations) and
// OpenRouter's web search (url_citation annotations) report them.
function sourcesOf(event: any): Source[] {
  const found: Source[] = []
  const add = (url: unknown, title?: unknown) => {
    if (typeof url === 'string' && url) found.push({ url, ...(title ? { title: String(title) } : {}) })
  }
  for (const result of event.search_results ?? []) add(result?.url, result?.title)
  for (const url of event.citations ?? []) add(url)
  const choice = event.choices?.[0]
  for (const note of choice?.delta?.annotations ?? choice?.message?.annotations ?? []) {
    if (note?.type === 'url_citation') add(note.url_citation?.url, note.url_citation?.title)
  }
  return found
}

function openaiTurn(): Turn {
  let content = ''
  const sources: Source[] = []
  const calls: { id: string; name: string; args: string }[] = []
  const turn: Turn = {
    usage: { input: 0, output: 0 },
    stop: 'end',
    decode(event) {
      const events: StreamEvent[] = []
      const choice = event.choices?.[0]
      // OpenRouter and Ollama call it `reasoning`; DeepSeek and vLLM, `reasoning_content`.
      const reasoning = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content
      if (typeof reasoning === 'string' && reasoning) events.push({ type: 'thinking', text: reasoning })
      if (choice?.delta?.content) {
        content += choice.delta.content
        events.push({ type: 'text', text: choice.delta.content })
      }
      for (const call of choice?.delta?.tool_calls ?? []) {
        const slot = (calls[call.index ?? 0] ??= { id: '', name: '', args: '' })
        if (call.id) slot.id = call.id
        slot.name += call.function?.name ?? ''
        slot.args += call.function?.arguments ?? ''
      }
      if (choice?.finish_reason === 'length') events.push({ type: 'truncated' })
      if (choice?.finish_reason === 'tool_calls') turn.stop = 'tools'
      if (event.usage) {
        // OpenAI and most others report cached input in prompt_tokens_details;
        // DeepSeek, as prompt_cache_hit_tokens.
        const cached =
          event.usage.prompt_tokens_details?.cached_tokens ?? event.usage.prompt_cache_hit_tokens
        turn.usage = {
          input: event.usage.prompt_tokens ?? 0,
          output: event.usage.completion_tokens ?? 0,
          ...(cached ? { cacheRead: cached } : {}),
          ...(typeof event.usage.cost === 'number' ? { cost: event.usage.cost } : {}),
        }
      }
      // Lists may repeat in every chunk or arrive a few at a time.
      let added = false
      for (const source of sourcesOf(event)) {
        if (sources.some((known) => known.url === source.url)) continue
        sources.push(source)
        added = true
      }
      if (added) {
        events.push({ type: 'sources', sources: [...sources] })
      }
      return events
    },
    calls: () =>
      calls
        .filter(Boolean)
        .map((c, i) => ({ id: c.id || `call_${i}`, name: c.name, input: parse(c.args) })),
    message: () => ({
      role: 'assistant',
      content: content || null,
      tool_calls: turn.calls().map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.input) },
      })),
    }),
    results: (done) => [
      ...openaiResults(done.map((d) => ({ id: d.id, result: d.content }))),
      // Tool messages carry text only: pictures follow in a user message.
      ...(done.some((d) => d.images?.length)
        ? [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Pictures returned by the tools above:' },
                ...done.flatMap((d) =>
                  (d.images ?? []).map((image) => ({
                    type: 'image_url',
                    image_url: { url: `data:${image.mime};base64,${image.data}` },
                  })),
                ),
              ],
            },
          ]
        : []),
    ],
  }
  return turn
}

async function* sseData(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
  if (buffer.startsWith('data:')) yield buffer.slice(5).trim()
}

function aborted(): Error {
  return new DOMException('Aborted', 'AbortError')
}

// Streams a reply, running the tools the model calls and sending their
// results back until it has nothing more to ask for.
export async function* streamChat(req: ChatRequest): AsyncGenerator<StreamEvent> {
  const anthropic = req.provider.format === 'anthropic'
  const wire = req.messages.flatMap((m) =>
    anthropic ? anthropicMessages(m, req) : openaiMessages(m, req),
  )
  const total: Usage = { input: 0, output: 0 }

  // Some OpenAI models refuse a reasoning effort together with function tools on
  // chat completions and ask for 'none'; the reply carries on that way.
  let sent = req
  for (let round = 1; ; round++) {
    const init = (): RequestInit => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers(sent) },
      body: JSON.stringify(body(sent, wire)),
      signal: req.signal,
    })
    let res: Response
    try {
      res = await request(url(req, req.provider.chatPath), init(), req)
    } catch (err) {
      const refused = err instanceof Error && /reasoning_effort/i.test(err.message) && /tools?/i.test(err.message)
      if (anthropic || !refused || !sent.params?.effort || sent.params.effort === 'none') throw err
      sent = { ...sent, params: { ...sent.params, effort: 'none' } }
      res = await request(url(req, req.provider.chatPath), init(), req)
    }
    const turn = anthropic ? anthropicTurn() : openaiTurn()
    for await (const data of sseData(res)) {
      if (!data || data === '[DONE]') continue
      const event = JSON.parse(data)
      if (event.error) throw new Error(event.error.message ?? JSON.stringify(event.error))
      yield* turn.decode(event)
    }

    total.input += turn.usage.input
    total.output += turn.usage.output
    for (const field of ['cacheRead', 'cacheWrite'] as const) {
      if (turn.usage[field]) total[field] = (total[field] ?? 0) + turn.usage[field]
    }
    if (turn.usage.cost !== undefined) total.cost = (total.cost ?? 0) + turn.usage.cost
    if (total.input || total.output) {
      const context = turn.usage.input + turn.usage.output
      yield { type: 'usage', usage: { ...total, ...(round > 1 ? { context } : {}) } }
    }

    const calls = turn.stop === 'tools' ? turn.calls() : []
    if (turn.stop !== 'pause' && !calls.length) return
    if (round === (req.maxRounds ?? MAX_ROUNDS)) {
      throw new Error(
        t('O modelo pediu ferramentas {count} vezes seguidas; a resposta foi interrompida.', {
          count: req.maxRounds ?? MAX_ROUNDS,
        }),
      )
    }
    wire.push(turn.message())

    const done: (ToolCall & ToolResult)[] = []
    for (const call of calls) {
      const part: ToolPart = {
        type: 'tool',
        id: call.id,
        name: call.name,
        input: JSON.stringify(call.input),
        status: 'running',
      }
      yield { type: 'tool', part }
      let result: ToolResult
      try {
        if (!req.runTool) throw new Error(`No tool named ${call.name}.`)
        result = await req.runTool(call)
      } catch (err) {
        result = { content: err instanceof Error ? err.message : String(err), isError: true }
      }
      if (req.signal?.aborted) throw aborted()
      done.push({ ...call, ...result })
      yield {
        type: 'tool',
        part: {
          ...part,
          status: 'done',
          result: result.content,
          ...(result.isError ? { error: true } : {}),
        },
      }
    }
    wire.push(...turn.results(done))
  }
}

export async function completeText(req: ChatRequest): Promise<string> {
  let text = ''
  for await (const event of streamChat(req)) {
    if (event.type === 'text') text += event.text
  }
  return text
}

export interface ModelList {
  ids: string[]
  info: Record<string, ModelInfo>
}

// Limits and prices come back under different names per provider; absent
// fields stay undefined.
function infoOf(model: any): ModelInfo {
  const perMillion = (price: unknown) =>
    price === undefined || Number.isNaN(Number(price)) ? undefined : Number(price) * 1_000_000
  return {
    context: model.max_input_tokens ?? model.context_length ?? model.context_window,
    inputPrice: perMillion(model.pricing?.prompt),
    outputPrice: perMillion(model.pricing?.completion),
  }
}

// Turns recorded speech into text with the provider's transcription model.
// Speech to text with the provider's transcription model. `name` tells the
// API the format; without a language, the model detects it.
export async function transcribe(
  conn: Connection,
  audio: Blob,
  language: string,
  name = `dictation.${audio.type.includes('ogg') ? 'ogg' : 'webm'}`,
): Promise<string> {
  const form = new FormData()
  form.append('file', audio, name)
  form.append('model', conn.provider.transcription ?? '')
  if (language) form.append('language', language)
  const init = { method: 'POST', headers: headers(conn), body: form }
  const res = await request(url(conn, '/audio/transcriptions'), init, conn)
  const json = await res.json()
  return String(json.text ?? '').trim()
}

// Transcribes with the time of every word (OpenAI's whisper-1, Groq's
// Whisper), for captions that follow a voice.
export async function transcribeWords(
  conn: Connection,
  audio: Blob,
  language: string,
  signal?: AbortSignal,
): Promise<{ words: { text: string; start: number; end: number }[]; duration: number }> {
  const form = new FormData()
  form.append('file', audio, `narration.${audio.type.includes('wav') ? 'wav' : 'mp3'}`)
  // gpt-4o transcription models give no word times; whisper-1 does.
  form.append('model', conn.provider.id === 'openai' ? 'whisper-1' : (conn.provider.transcription ?? ''))
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  if (language) form.append('language', language)
  const res = await request(url(conn, '/audio/transcriptions'), { method: 'POST', headers: headers(conn), body: form, signal }, conn)
  const json = await res.json()
  const words = (json.words ?? []).map((w: any) => ({ text: String(w.word ?? '').trim(), start: Number(w.start) || 0, end: Number(w.end) || 0 }))
  return { words, duration: Number(json.duration) || words.at(-1)?.end || 0 }
}

export interface GeneratedImage {
  mime: string
  // Base64.
  data: string
  // The prompt as the provider rewrote it, when it did.
  revised?: string
}

// Draws one image with the provider's image model.
export async function generateImage(
  conn: Connection,
  model: string,
  prompt: string,
  signal?: AbortSignal,
  // Parameters only some models take, such as size or quality.
  options: Record<string, unknown> = {},
): Promise<GeneratedImage> {
  const payload = {
    model,
    prompt,
    n: 1,
    // GPT Image always answers in base64 and rejects the field; Gemini requires it.
    ...(conn.provider.id === 'openai' ? {} : { response_format: 'b64_json' }),
    ...options,
  }
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers(conn) },
    body: JSON.stringify(payload),
    signal,
  }
  const res = await request(url(conn, '/images/generations'), init, conn)
  const json = await res.json()
  const image = json.data?.[0]
  if (!image?.b64_json) throw new Error(t('O provedor não devolveu nenhuma imagem.'))
  const format = String(json.output_format ?? 'png')
  return {
    mime: `image/${format === 'jpg' ? 'jpeg' : format}`,
    data: image.b64_json,
    ...(image.revised_prompt ? { revised: image.revised_prompt } : {}),
  }
}

// Turns texts into vectors with the provider's embedding model, in order.
export async function embed(
  conn: Connection,
  model: string,
  input: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers(conn) },
    body: JSON.stringify({ model, input }),
    signal,
  }
  const res = await request(url(conn, '/embeddings'), init, conn)
  const json = await res.json()
  const data: { index?: number; embedding?: unknown }[] = Array.isArray(json.data) ? json.data : []
  const vectors = [...data]
    .sort((x, y) => (x.index ?? 0) - (y.index ?? 0))
    .map((item) => item.embedding)
  if (vectors.length !== input.length || !vectors.every(Array.isArray)) {
    throw new Error(t('O provedor não devolveu os vetores pedidos.'))
  }
  return vectors as number[][]
}

export async function listModels(conn: Connection): Promise<ModelList> {
  if (!conn.provider.modelsPath) return { ids: conn.provider.defaultModels, info: {} }
  const init = { headers: headers(conn) }
  const res = await request(url(conn, conn.provider.modelsPath), init, conn)
  const json = await res.json()
  const info: Record<string, ModelInfo> = {}
  for (const model of json.data ?? []) {
    // Gateways that serve each model on one wire format say which.
    const endpoints = model.supported_endpoints
    if (Array.isArray(endpoints) && !endpoints.includes(conn.provider.chatPath)) continue
    info[String(model.id).replace(/^models\//, '')] = infoOf(model)
  }
  return { ids: Object.keys(info).sort(), info }
}
