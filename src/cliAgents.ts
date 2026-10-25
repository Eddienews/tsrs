import { t } from './i18n'
import type { ChatRequest, RequestMessage, StreamEvent } from './stream'
import { sseData, textOf } from './stream'
import type { CliAgent, ToolPart, Usage } from './types'

// Coding agents installed on this computer (Claude Code, Codex), started by
// the TSRS server in the conversation's project folder (server/cli.mjs). The
// server relays every line the agent prints; this module turns those lines
// into the same events as any other provider: text, reasoning, tool calls and
// usage, in tokens only: the agent's own plan pays for it, so no price is
// put on it (models such as "opus" have none). The agent runs its own tools, so TSRS's tools are not offered, and
// its tool calls are marked as the provider's own: shown, never sent back.

export const CLI = '/__tsrs/cli'

export interface CliStatus {
  agent: CliAgent
  ok: boolean
  version?: string
  error?: string
  // The agent's own usage window, when it reported one (Claude Code does).
  limit?: { window?: string; used?: number; resetsAt?: number; status?: string; at: number }
}

export interface CliPrompt {
  // The new message, for an agent that already has the conversation.
  prompt: string
  // The whole conversation, for one that starts afresh.
  transcript: string
  // Which user message this is, from 1: the server resumes the session only
  // when the previous turn was the last one it ran.
  turn: number
}

function said(message: RequestMessage): string {
  const files = (message.attachments ?? [])
    .filter((a) => a.kind !== 'text' && a.kind !== 'audio' && a.kind !== 'video')
    .map((a) => `[${t('Anexo')}: ${a.savedPath ?? a.name}]`)
  return [textOf(message), ...files].filter(Boolean).join('\n\n')
}

// What the agent is sent: the new message alone, or with the instructions and
// the earlier messages when its session has to start over.
export function cliPrompt(req: Pick<ChatRequest, 'system' | 'messages'>): CliPrompt {
  const messages = req.messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  const last = messages.findLast((m) => m.role === 'user')
  const prompt = last ? said(last) : ''
  const earlier = last ? messages.slice(0, messages.lastIndexOf(last)) : []
  const parts: string[] = []
  if (req.system.trim()) parts.push(`<instructions>\n${req.system.trim()}\n</instructions>`)
  if (earlier.length) {
    const lines = earlier.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${said(m)}`)
    parts.push(`<earlier-conversation>\n${lines.join('\n\n')}\n</earlier-conversation>`)
  }
  parts.push(prompt)
  return {
    prompt,
    transcript: parts.join('\n\n'),
    turn: messages.filter((m) => m.role === 'user').length,
  }
}

const json = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

// Tool results come as text or as blocks of text.
function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : c?.type === 'text' ? c.text : '')).join('\n')
  }
  return content === undefined ? '' : json(content)
}

const RESULT_LIMIT = 20_000
const clip = (text: string) => (text.length > RESULT_LIMIT ? `${text.slice(0, RESULT_LIMIT)}\n…` : text)

export interface CliDecoder {
  decode(event: any): StreamEvent[]
  // Set when the agent reported that the turn failed.
  failure?: string
}

// Claude Code's stream-json, with partial messages: text and reasoning arrive
// as deltas; tool calls in the whole assistant message; their results in the
// user message that follows; tokens in the result. A subagent's messages carry
// parent_tool_use_id and stay inside the tool call that started it.
export function claudeDecoder(): CliDecoder {
  let wrote = false
  let fresh = false
  const decoder: CliDecoder = {
    decode(event) {
      if (event.parent_tool_use_id) return []
      if (event.type === 'stream_event') {
        const inner = event.event ?? {}
        if (inner.type === 'message_start') fresh = wrote
        if (inner.type !== 'content_block_delta') return []
        const delta = inner.delta ?? {}
        if (delta.type === 'text_delta' && delta.text) {
          const text = fresh ? `\n\n${delta.text}` : delta.text
          fresh = false
          wrote = true
          return [{ type: 'text', text }]
        }
        if (delta.type === 'thinking_delta' && delta.thinking) return [{ type: 'thinking', text: delta.thinking }]
        return []
      }
      if (event.type === 'assistant') {
        return (event.message?.content ?? [])
          .filter((block: any) => block?.type === 'tool_use')
          .map((block: any) => ({
            type: 'tool' as const,
            part: { type: 'tool', id: String(block.id), name: String(block.name), input: json(block.input), status: 'running', provider: true } satisfies ToolPart,
          }))
      }
      if (event.type === 'user') {
        const content = event.message?.content
        if (!Array.isArray(content)) return []
        return content
          .filter((block: any) => block?.type === 'tool_result')
          .map((block: any) => ({
            type: 'tool' as const,
            part: {
              type: 'tool',
              id: String(block.tool_use_id),
              name: '',
              input: '',
              status: 'done',
              provider: true,
              result: clip(resultText(block.content)),
              ...(block.is_error ? { error: true } : {}),
            } satisfies ToolPart,
          }))
      }
      if (event.type === 'result') {
        if (event.is_error || (event.subtype && event.subtype !== 'success')) {
          decoder.failure = String(event.result || event.subtype || 'error')
        }
        const u = event.usage ?? {}
        const read = Number(u.cache_read_input_tokens) || 0
        const write = Number(u.cache_creation_input_tokens) || 0
        const usage: Usage = {
          input: (Number(u.input_tokens) || 0) + read + write,
          output: Number(u.output_tokens) || 0,
          ...(read ? { cacheRead: read } : {}),
          ...(write ? { cacheWrite: write } : {}),
        }
        return usage.input || usage.output ? [{ type: 'usage', usage }] : []
      }
      return []
    },
  }
  return decoder
}

// What a Codex item did, as a tool call: commands, file changes, MCP calls
// and web searches.
function codexTool(item: any, status: ToolPart['status']): ToolPart | undefined {
  const id = String(item.id)
  if (item.type === 'command_execution') {
    const failed = typeof item.exit_code === 'number' && item.exit_code !== 0
    return {
      type: 'tool',
      id,
      name: 'shell',
      input: json({ command: item.command }),
      status,
      ...(status === 'done' ? { result: clip(String(item.aggregated_output ?? '')) } : {}),
      ...(status === 'done' && (failed || item.status === 'failed') ? { error: true } : {}),
    }
  }
  if (item.type === 'file_change') {
    const changes = Array.isArray(item.changes) ? item.changes : []
    return {
      type: 'tool',
      id,
      name: 'file_change',
      input: json({ files: changes.map((c: any) => c.path) }),
      status,
      ...(status === 'done'
        ? { result: changes.map((c: any) => `${c.kind ?? 'update'} ${c.path}`).join('\n') }
        : {}),
      ...(item.status === 'failed' ? { error: true } : {}),
    }
  }
  if (item.type === 'mcp_tool_call') {
    return {
      type: 'tool',
      id,
      name: `${item.server ?? 'mcp'}.${item.tool ?? 'tool'}`,
      input: json(item.arguments),
      status,
      ...(status === 'done' ? { result: clip(resultText(item.result?.content ?? item.result ?? item.error)) } : {}),
      ...(item.status === 'failed' || item.error ? { error: true } : {}),
    }
  }
  if (item.type === 'web_search') {
    return { type: 'tool', id, name: 'web_search', input: json({ query: item.query }), status }
  }
  return undefined
}

// Codex's JSONL: items start and finish; a turn ends with its usage, or fails.
export function codexDecoder(): CliDecoder {
  let wrote = false
  const decoder: CliDecoder = {
    decode(event) {
      if (event.type === 'error') {
        decoder.failure = String(event.message ?? 'error')
        return []
      }
      if (event.type === 'turn.failed') {
        decoder.failure = String(event.error?.message ?? 'error')
        return []
      }
      if (event.type === 'turn.completed') {
        const u = event.usage ?? {}
        const read = Number(u.cached_input_tokens) || 0
        const usage: Usage = {
          input: Number(u.input_tokens) || 0,
          output: Number(u.output_tokens) || 0,
          ...(read ? { cacheRead: read } : {}),
        }
        return usage.input || usage.output ? [{ type: 'usage', usage }] : []
      }
      const item = event.item
      if (!item || (event.type !== 'item.started' && event.type !== 'item.completed' && event.type !== 'item.updated')) {
        return []
      }
      const done = event.type === 'item.completed'
      if (item.type === 'agent_message') {
        if (!done || !item.text) return []
        const text = wrote ? `\n\n${item.text}` : item.text
        wrote = true
        return [{ type: 'text', text }]
      }
      if (item.type === 'reasoning') return done && item.text ? [{ type: 'thinking', text: `${item.text}\n` }] : []
      // Codex reports its own warnings (settings it ignores, say) as error items.
      if (item.type === 'error') return []
      const part = codexTool(item, done ? 'done' : 'running')
      return part ? [{ type: 'tool', part: { ...part, provider: true } }] : []
    },
  }
  return decoder
}

export function decoderFor(agent: CliAgent): CliDecoder {
  return agent === 'codex' ? codexDecoder() : claudeDecoder()
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${CLI}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error(t('Os agentes de linha de comando precisam do servidor local do TSRS (npm run dev).'))
  }
  if (!res.ok || !res.body) {
    let error = ''
    try {
      error = (await res.json()).error ?? ''
    } catch {
      // A static build answers with its page.
    }
    throw new Error(error || t('Os agentes de linha de comando precisam do servidor local do TSRS (npm run dev).'))
  }
  return res
}

export async function cliStatus(agent: CliAgent, command?: string, signal?: AbortSignal): Promise<CliStatus> {
  const res = await post('/status', { agent, command }, signal)
  return (await res.json()) as CliStatus
}

// A reply from the coding agent behind `req.provider`.
export async function* streamCli(req: ChatRequest): AsyncGenerator<StreamEvent> {
  const agent = req.provider.cli
  if (!agent) throw new Error(`${req.provider.name} has no command line agent.`)
  const { prompt, transcript, turn } = cliPrompt(req)
  if (!prompt.trim()) throw new Error(t('Escreva uma mensagem para o agente.'))
  const res = await post(
    '/run',
    {
      agent,
      command: req.baseUrl,
      model: req.model,
      effort: req.params?.effort || undefined,
      // Without a conversation (a summary, a side question) the agent only reads.
      access: req.cli ? (req.access ?? 'edit') : 'read',
      chatId: req.cli?.chatId ?? '',
      cwd: req.cli?.cwd,
      turn,
      prompt,
      transcript,
    },
    req.signal,
  )
  const decoder = decoderFor(agent)
  let ended: { code?: number; error?: string } | undefined
  for await (const data of sseData(res)) {
    if (!data) continue
    let event: any
    try {
      event = JSON.parse(data)
    } catch {
      // A line the agent printed for people, not an event.
      continue
    }
    if (event?.tsrs === 'end') {
      ended = event
      continue
    }
    yield* decoder.decode(event)
  }
  if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (decoder.failure) throw new Error(`${req.provider.name}: ${decoder.failure}`)
  if (!ended) throw new Error(t('A conexão com o agente caiu antes do fim.'))
  if (ended.code !== 0) throw new Error(`${req.provider.name}: ${ended.error ?? ended.code}`)
}
