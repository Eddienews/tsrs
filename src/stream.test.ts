import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProvider } from './providers'
import { completeText, listModels, streamChat, type ChatRequest, type StreamEvent } from './stream'

// A streaming response whose body arrives in the given chunks.
function sse(chunks: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, init)
}

function stubFetch(response: Response | Error) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function request(providerId: string, overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    provider: getProvider(providerId),
    baseUrl: 'https://example.test/v1/',
    apiKey: 'secret',
    model: 'm',
    system: 'sys',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  }
}

async function collect(req: ChatRequest): Promise<StreamEvent[]> {
  const events: StreamEvent[] = []
  for await (const event of streamChat(req)) events.push(event)
  return events
}

function sentBody(fetch: ReturnType<typeof stubFetch>): any {
  return JSON.parse(fetch.mock.calls[0][1].body as string)
}

afterEach(() => vi.unstubAllGlobals())

describe('streamChat, OpenAI format', () => {
  it('reassembles text split across network chunks', async () => {
    stubFetch(
      sse([
        'data: {"choices":[{"delta":{"content":"Ol',
        'á"}}]}\n\ndata: {"choices":[{"delta":{"content":" mundo"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    expect(await completeText(request('openai'))).toBe('Olá mundo')
  })

  it('reports usage, provider cost and truncation', async () => {
    stubFetch(
      sse([
        'data: {"choices":[{"delta":{"content":"a"},"finish_reason":"length"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":3,"cost":0.002}}\n\n',
      ]),
    )
    expect(await collect(request('openrouter'))).toEqual([
      { type: 'text', text: 'a' },
      { type: 'truncated' },
      { type: 'usage', usage: { input: 10, output: 3, cost: 0.002 } },
    ])
  })

  it('sends system prompt, parameters and auth header', async () => {
    const fetch = stubFetch(sse(['data: [DONE]\n\n']))
    await collect(
      request('openai', { params: { temperature: 0.2, maxTokens: 50, effort: 'high' } }),
    )
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://example.test/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret')
    expect(sentBody(fetch)).toMatchObject({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      temperature: 0.2,
      max_completion_tokens: 50,
      reasoning_effort: 'high',
      stream_options: { include_usage: true },
    })
  })

  it('reads reasoning under either field name', async () => {
    stubFetch(
      sse([
        'data: {"choices":[{"delta":{"reasoning":"hmm "}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"ok"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"pronto"}}]}\n\n',
      ]),
    )
    expect(await collect(request('openrouter'))).toEqual([
      { type: 'thinking', text: 'hmm ' },
      { type: 'thinking', text: 'ok' },
      { type: 'text', text: 'pronto' },
    ])
  })

  it('omits the auth header for keyless providers', async () => {
    const fetch = stubFetch(sse(['data: [DONE]\n\n']))
    await collect(request('ollama', { apiKey: '' }))
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
  })

  it('sends images and PDFs as content parts and inlines text files', async () => {
    const fetch = stubFetch(sse(['data: [DONE]\n\n']))
    await collect(
      request('openai', {
        messages: [
          {
            role: 'user',
            content: 'veja',
            attachments: [
              { id: '1', name: 'a.png', mime: 'image/png', kind: 'image', data: 'AAAA' },
              { id: '2', name: 'b.pdf', mime: 'application/pdf', kind: 'pdf', data: 'BBBB' },
              { id: '3', name: 'n.txt', mime: 'text/plain', kind: 'text', data: 'nota' },
            ],
          },
        ],
      }),
    )
    expect(sentBody(fetch).messages[1].content).toEqual([
      { type: 'text', text: 'veja\n\n<file name="n.txt">\nnota\n</file>' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      { type: 'file', file: { filename: 'b.pdf', file_data: 'data:application/pdf;base64,BBBB' } },
    ])
  })
})

describe('streamChat, Anthropic format', () => {
  it('reads text and combines input and output usage', async () => {
    stubFetch(
      sse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":7,"cache_read_input_tokens":5}}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"x"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"oi"}}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":4}}\n\n',
      ]),
    )
    expect(await collect(request('anthropic'))).toEqual([
      { type: 'thinking', text: 'x' },
      { type: 'text', text: 'oi' },
      { type: 'truncated' },
      { type: 'usage', usage: { input: 12, output: 4 } },
    ])
  })

  it('sends effort in output_config and never sends temperature', async () => {
    const fetch = stubFetch(sse([]))
    await collect(request('anthropic', { params: { temperature: 0.5, effort: 'low' } }))
    const body = sentBody(fetch)
    expect(body).toMatchObject({ system: 'sys', output_config: { effort: 'low' }, stream: true })
    expect(body).not.toHaveProperty('temperature')
    expect(body.max_tokens).toBeGreaterThan(0)
    expect((fetch.mock.calls[0][1].headers as Record<string, string>)['x-api-key']).toBe('secret')
  })

  it('asks for summarized thinking only on models that think adaptively', async () => {
    for (const [model, asked] of [
      ['claude-haiku-5-5', true],
      ['claude-opus-4-6', true],
      ['claude-sonnet-4-5-20250929', false],
      ['claude-3-7-sonnet-latest', false],
    ] as const) {
      const fetch = stubFetch(sse([]))
      await collect(request('anthropic', { model, showThinking: true }))
      expect(sentBody(fetch).thinking).toEqual(
        asked ? { type: 'adaptive', display: 'summarized' } : undefined,
      )
    }
    const fetch = stubFetch(sse([]))
    await collect(request('anthropic', { model: 'claude-haiku-5-5' }))
    expect(sentBody(fetch)).not.toHaveProperty('thinking')
  })

  it('puts documents and images before the text', async () => {
    const fetch = stubFetch(sse([]))
    await collect(
      request('anthropic', {
        messages: [
          {
            role: 'user',
            content: 'veja',
            attachments: [
              { id: '2', name: 'b.pdf', mime: 'application/pdf', kind: 'pdf', data: 'BBBB' },
            ],
          },
        ],
      }),
    )
    expect(sentBody(fetch).messages[0].content).toEqual([
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'BBBB' },
      },
      { type: 'text', text: 'veja' },
    ])
  })

  it('turns a refusal into an error', async () => {
    stubFetch(sse(['data: {"type":"message_delta","delta":{"stop_reason":"refusal"}}\n\n']))
    await expect(collect(request('anthropic'))).rejects.toThrow('recusou')
  })
})

describe('tools', () => {
  // Answers each request with the next response and records the bodies sent.
  function stubRounds(...responses: Response[]) {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => responses.shift()!)
    vi.stubGlobal('fetch', fetch)
    return () => fetch.mock.calls.map((call) => JSON.parse(call[1].body as string))
  }

  const data = (...events: unknown[]) => sse(events.map((e) => `data: ${JSON.stringify(e)}\n\n`))
  const tools = [{ name: 'clock', description: 'Tells the time', schema: { type: 'object' } }]
  const runTool = vi.fn(async () => ({ content: '12:00', isError: false }))

  it('runs an Anthropic tool call and sends the turn back unchanged', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: '' }
    const bodies = stubRounds(
      data(
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_start', index: 0, content_block: thinking },
        { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
        { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'clock', input: {} } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"zone":' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"utc"}' } },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
      ),
      data(
        { type: 'message_start', message: { usage: { input_tokens: 20 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'meio-dia' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
      ),
    )
    const events = await collect(request('anthropic', { tools, runTool }))

    expect(runTool).toHaveBeenCalledWith({ id: 't1', name: 'clock', input: { zone: 'utc' } })
    const [first, second] = bodies()
    expect(first.tools).toEqual([
      { name: 'clock', description: 'Tells the time', input_schema: { type: 'object' } },
    ])
    expect(second.messages.slice(1)).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'tool_use', id: 't1', name: 'clock', input: { zone: 'utc' } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '12:00' }] },
    ])
    expect(events.filter((e) => e.type === 'tool').map((e) => e.part.status)).toEqual([
      'running',
      'done',
    ])
    expect(events.at(-1)).toEqual({
      type: 'usage',
      usage: { input: 30, output: 8, context: 23 },
    })
  })

  it('runs an OpenAI-format tool call', async () => {
    const call = (fn: object, id?: string) => ({
      choices: [{ delta: { tool_calls: [{ index: 0, ...(id ? { id } : {}), function: fn }] } }],
    })
    const bodies = stubRounds(
      data(
        call({ name: 'clock', arguments: '' }, 'c1'),
        call({ arguments: '{"zone":"utc"}' }),
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ),
      data({ choices: [{ delta: { content: 'meio-dia' } }] }),
    )
    const failing = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await completeText(request('openai', { tools, runTool: failing }))).toBe('meio-dia')

    const [first, second] = bodies()
    expect(first.tools[0].function).toEqual({
      name: 'clock',
      description: 'Tells the time',
      parameters: { type: 'object' },
    })
    expect(second.messages.slice(2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'clock', arguments: '{"zone":"utc"}' } },
        ],
      },
      // A tool that throws is reported to the model instead of ending the reply.
      { role: 'tool', tool_call_id: 'c1', content: 'offline' },
    ])
  })

  it('continues a turn the provider paused and shows provider-side tools', async () => {
    const search = { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }
    const found = {
      type: 'web_search_tool_result',
      tool_use_id: 's1',
      content: [{ type: 'web_search_result', title: 'Exemplo', url: 'https://example.test' }],
    }
    const bodies = stubRounds(
      data(
        { type: 'content_block_start', index: 0, content_block: search },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"x"}' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: found },
        { type: 'message_delta', delta: { stop_reason: 'pause_turn' } },
      ),
      data({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'achei' } }),
    )
    const events = await collect(request('anthropic', { webSearch: true, webFetch: true }))

    const [first, second] = bodies()
    expect(first.tools).toEqual([
      { type: 'web_search_20260209', name: 'web_search' },
      { type: 'web_fetch_20260209', name: 'web_fetch' },
    ])
    expect(second.messages.at(-1)).toEqual({
      role: 'assistant',
      content: [{ ...search, input: { query: 'x' } }, found],
    })
    expect(events.filter((e) => e.type === 'tool').map((e) => e.part)).toMatchObject([
      { id: 's1', name: 'web_search', provider: true, input: '{"query":"x"}', status: 'running' },
      { id: 's1', status: 'done', result: 'Exemplo\nhttps://example.test' },
    ])
  })

  it('uses the basic web tools on Haiku and the web plugin on OpenRouter', async () => {
    let bodies = stubRounds(data())
    await collect(request('anthropic', { model: 'claude-haiku-5-5', webSearch: true }))
    expect(bodies()[0].tools).toEqual([{ type: 'web_search_20250305', name: 'web_search' }])

    bodies = stubRounds(data(), data())
    await collect(request('openrouter', { webSearch: true }))
    await collect(request('openai', { webSearch: true }))
    expect(bodies().map((b) => b.plugins)).toEqual([[{ id: 'web' }], undefined])
  })

  it('replays earlier tool calls only when tools are declared', async () => {
    const messages: ChatRequest['messages'] = [
      { role: 'user', content: 'que horas são?' },
      {
        role: 'assistant',
        content: 'Vou ver. É meio-dia.',
        parts: [
          { type: 'text', text: 'Vou ver. ' },
          { type: 'tool', id: 't1', name: 'clock', input: '{}', result: '12:00', status: 'done' },
          { type: 'tool', id: 's1', name: 'web_search', provider: true, input: '{}', status: 'done' },
          { type: 'text', text: 'É meio-dia.' },
        ],
      },
      { role: 'user', content: 'e agora?' },
    ]
    const bodies = stubRounds(data(), data(), data())
    await collect(request('anthropic', { messages, tools, runTool }))
    await collect(request('openai', { messages, tools, runTool }))
    await collect(request('anthropic', { messages }))
    const [anthropic, openai, plain] = bodies()

    expect(anthropic.messages.slice(1, 4)).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Vou ver. ' },
          { type: 'tool_use', id: 't1', name: 'clock', input: {} },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '12:00' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'É meio-dia.' }] },
    ])
    expect(openai.messages.slice(2, 5)).toEqual([
      {
        role: 'assistant',
        content: 'Vou ver. ',
        tool_calls: [{ id: 't1', type: 'function', function: { name: 'clock', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 't1', content: '12:00' },
      { role: 'assistant', content: 'É meio-dia.' },
    ])
    expect(plain.messages[1]).toEqual({ role: 'assistant', content: 'Vou ver. É meio-dia.' })
  })
})

describe('errors', () => {
  it('explains an invalid key and keeps the provider detail', async () => {
    stubFetch(new Response('{"error":{"message":"bad key"}}', { status: 401 }))
    await expect(collect(request('openai'))).rejects.toThrow(
      'Chave de API inválida ou sem permissão (HTTP 401): bad key',
    )
  })

  it('reports the wait on rate limits', async () => {
    stubFetch(new Response('{}', { status: 429, headers: { 'retry-after': '12' } }))
    await expect(collect(request('openai'))).rejects.toThrow('tente de novo em 12 s')
  })

  it('explains network and CORS failures', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    await expect(collect(request('openai'))).rejects.toThrow(
      'Não foi possível conectar a example.test',
    )
  })

  it('surfaces an error event sent mid-stream', async () => {
    stubFetch(sse(['data: {"error":{"message":"overloaded"}}\n\n']))
    await expect(collect(request('openai'))).rejects.toThrow('overloaded')
  })
})

describe('listModels', () => {
  it('normalizes ids, limits and prices', async () => {
    stubFetch(
      Response.json({
        data: [
          { id: 'models/b' },
          { id: 'a', context_length: 1000, pricing: { prompt: '0.000002', completion: '0.00001' } },
          { id: 'c', max_input_tokens: 5 },
        ],
      }),
    )
    const list = await listModels(request('openrouter'))
    expect(list.ids).toEqual(['a', 'b', 'c'])
    expect(list.info.a.context).toBe(1000)
    expect(list.info.a.inputPrice).toBeCloseTo(2)
    expect(list.info.a.outputPrice).toBeCloseTo(10)
    expect(list.info.c.context).toBe(5)
    expect(list.info.b).toEqual({})
  })
})
