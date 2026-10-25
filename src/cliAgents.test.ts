import { describe, expect, it } from 'vitest'
import { claudeDecoder, cliPrompt, codexDecoder } from './cliAgents'
import type { StreamEvent } from './stream'

const decodeAll = (decoder: { decode(event: any): StreamEvent[] }, events: object[]) =>
  events.flatMap((event) => decoder.decode(event))

describe('cliPrompt', () => {
  it('sends the new message alone and the whole conversation for a fresh session', () => {
    const prompt = cliPrompt({
      system: 'Seja breve.',
      messages: [
        { role: 'user', content: 'Oi' },
        { role: 'assistant', content: 'Olá!' },
        { role: 'user', content: 'Liste a pasta', attachments: [{ id: 'a', name: 'logo.png', mime: 'image/png', kind: 'image', data: '' }] },
      ],
    })
    expect(prompt.turn).toBe(2)
    expect(prompt.prompt).toBe('Liste a pasta\n\n[Anexo: logo.png]')
    expect(prompt.transcript).toBe(
      '<instructions>\nSeja breve.\n</instructions>\n\n' +
        '<earlier-conversation>\nUser: Oi\n\nAssistant: Olá!\n</earlier-conversation>\n\n' +
        'Liste a pasta\n\n[Anexo: logo.png]',
    )
  })

  it('needs no instructions or history on the first message', () => {
    expect(cliPrompt({ system: ' ', messages: [{ role: 'user', content: 'Oi' }] })).toEqual({
      prompt: 'Oi',
      transcript: 'Oi',
      turn: 1,
    })
  })

  it('takes text files along, as for any provider', () => {
    const prompt = cliPrompt({
      system: '',
      messages: [{ role: 'user', content: 'Resuma', attachments: [{ id: 'n', name: 'n.txt', mime: 'text/plain', kind: 'text', data: 'abc' }] }],
    })
    expect(prompt.prompt).toBe('Resuma\n\n<file name="n.txt">\nabc\n</file>')
  })
})

describe('claudeDecoder', () => {
  it('reads the stream-json Claude Code really prints', () => {
    // Lines from claude 2.1.310 (`-p --output-format stream-json --verbose --include-partial-messages`).
    const events = [
      { type: 'system', subtype: 'init', cwd: 'C:\\x', session_id: 'f9ec', tools: ['Bash'] },
      { type: 'system', subtype: 'status', status: 'requesting', session_id: 'f9ec' },
      { type: 'stream_event', event: { type: 'message_start', message: { model: 'claude-sonnet-5-5', content: [] } }, session_id: 'f9ec' },
      { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, parent_tool_use_id: null },
      { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }, parent_tool_use_id: null },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] }, parent_tool_use_id: null },
      { type: 'stream_event', event: { type: 'message_stop' }, parent_tool_use_id: null },
      { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', utilization: 0.83 } },
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'ok',
        total_cost_usd: 0.08,
        usage: { input_tokens: 2, cache_creation_input_tokens: 19630, cache_read_input_tokens: 16776, output_tokens: 4 },
      },
    ]
    const decoder = claudeDecoder()
    expect(decodeAll(decoder, events)).toEqual([
      { type: 'text', text: 'ok' },
      { type: 'usage', usage: { input: 36408, output: 4, cacheRead: 16776, cacheWrite: 19630 } },
    ])
    expect(decoder.failure).toBeUndefined()
  })

  it('shows tool calls with their results, reasoning, and splits the text of later messages', () => {
    const events = [
      { type: 'stream_event', event: { type: 'message_start' }, parent_tool_use_id: null },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Vou ver.' } }, parent_tool_use_id: null },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Olhando.' } }, parent_tool_use_id: null },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Olhando.' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] }, parent_tool_use_id: null },
      // A subagent's own messages stay inside its tool call.
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'interno' } }, parent_tool_use_id: 't1' },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'a.txt' }], is_error: true }] }, parent_tool_use_id: null },
      { type: 'stream_event', event: { type: 'message_start' }, parent_tool_use_id: null },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Pronto.' } }, parent_tool_use_id: null },
    ]
    expect(decodeAll(claudeDecoder(), events)).toEqual([
      { type: 'thinking', text: 'Vou ver.' },
      { type: 'text', text: 'Olhando.' },
      { type: 'tool', part: { type: 'tool', id: 't1', name: 'Bash', input: '{"command":"ls"}', status: 'running', provider: true } },
      { type: 'tool', part: { type: 'tool', id: 't1', name: '', input: '', status: 'done', provider: true, result: 'a.txt', error: true } },
      { type: 'text', text: '\n\nPronto.' },
    ])
  })

  it('keeps the reason of a turn that failed', () => {
    const decoder = claudeDecoder()
    decoder.decode({ type: 'result', subtype: 'error_max_turns', is_error: true, usage: {} })
    expect(decoder.failure).toBe('error_max_turns')
  })
})

describe('codexDecoder', () => {
  it('reads the JSONL codex exec --json really prints, without its warnings', () => {
    // Lines from codex-cli 0.156.1.
    const events = [
      { type: 'thread.started', thread_id: '01a1716c' },
      { type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Codex is ignoring 1 unrecognized configuration setting.' } },
      { type: 'turn.started' },
      { type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: 'ok' } },
      { type: 'turn.completed', usage: { input_tokens: 23306, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0 } },
    ]
    expect(decodeAll(codexDecoder(), events)).toEqual([
      { type: 'text', text: 'ok' },
      { type: 'usage', usage: { input: 23306, output: 5 } },
    ])
  })

  it('shows commands, file changes and searches as tool calls', () => {
    const events = [
      { type: 'item.started', item: { id: 'c', type: 'command_execution', command: 'npm test', status: 'in_progress' } },
      { type: 'item.completed', item: { id: 'c', type: 'command_execution', command: 'npm test', aggregated_output: 'falhou', exit_code: 1, status: 'failed' } },
      { type: 'item.completed', item: { id: 'f', type: 'file_change', changes: [{ path: 'a.ts', kind: 'update' }], status: 'completed' } },
      { type: 'item.completed', item: { id: 'w', type: 'web_search', query: 'tsrs' } },
      { type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'Pensando' } },
      { type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: 'Um' } },
      { type: 'item.completed', item: { id: 'm2', type: 'agent_message', text: 'Dois' } },
    ]
    expect(decodeAll(codexDecoder(), events)).toEqual([
      { type: 'tool', part: { type: 'tool', id: 'c', name: 'shell', input: '{"command":"npm test"}', status: 'running', provider: true } },
      { type: 'tool', part: { type: 'tool', id: 'c', name: 'shell', input: '{"command":"npm test"}', status: 'done', result: 'falhou', error: true, provider: true } },
      { type: 'tool', part: { type: 'tool', id: 'f', name: 'file_change', input: '{"files":["a.ts"]}', status: 'done', result: 'update a.ts', provider: true } },
      { type: 'tool', part: { type: 'tool', id: 'w', name: 'web_search', input: '{"query":"tsrs"}', status: 'done', provider: true } },
      { type: 'thinking', text: 'Pensando\n' },
      { type: 'text', text: 'Um' },
      { type: 'text', text: '\n\nDois' },
    ])
  })

  it('keeps the reason of a turn that failed', () => {
    const decoder = codexDecoder()
    decoder.decode({ type: 'turn.failed', error: { message: 'usage limit reached' } })
    expect(decoder.failure).toBe('usage limit reached')
  })
})
