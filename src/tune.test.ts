import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProvider } from './providers'
import { judgePrompt, parseScores, parseVariants, proposePrompt, tuneAgent, tuneCalls } from './tune'

function reply(text: string): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('tune', () => {
  it('reads the proposed versions from a JSON block, up to the number asked', () => {
    const text = 'Aqui:\n```json\n{"variants":[{"label":"Curto","change":"limita a 5 tópicos","system":"Seja breve."},{"label":"Fonte","system":"Cite a fonte."},{"label":"Vazio","system":"  "}]}\n```'
    expect(parseVariants(text, 3)).toEqual([
      { label: 'Curto', change: 'limita a 5 tópicos', system: 'Seja breve.' },
      { label: 'Fonte', change: '', system: 'Cite a fonte.' },
    ])
    expect(parseVariants(text, 1)).toHaveLength(1)
    expect(() => parseVariants('sem json', 2)).toThrow('O modelo não devolveu as versões em JSON.')
    // A version that only repeats the current instructions is dropped.
    const same = '{"variants":[{"label":"Igual","system":"Seja útil."},{"label":"Nova","system":"Seja útil e breve."}]}'
    expect(parseVariants(same, 2, 'Seja útil.').map((v) => v.label)).toEqual(['Nova'])
    // A stray backtick before the closing fence (seen with a 4B local model) still parses.
    expect(parseVariants('```json\n{"variants":[{"label":"A","system":"Seja breve."}]}`\n```', 1)).toEqual([
      { label: 'A', change: '', system: 'Seja breve.' },
    ])
    expect(() => parseVariants('{"variants":[]}', 2)).toThrow('O modelo não propôs nenhuma versão.')
  })

  it('reads the scores by answer number, clamped to 0–10, and leaves gaps empty', () => {
    const text = '{"scores":[{"answer":2,"score":12,"reason":"completa"},{"answer":1,"score":4}]}'
    expect(parseScores(text, 3)).toEqual([{ score: 4 }, { score: 10, reason: 'completa' }, {}])
    expect(parseScores('nada', 2)).toEqual([{}, {}])
  })

  it('puts the instructions, task and criteria in the prompts', () => {
    const propose = proposePrompt('Seja útil.', 'Resuma o texto', 'Até 3 frases', 2)
    expect(propose).toContain('Propose 2 improved versions')
    expect(propose).toContain('<instructions>\nSeja útil.\n</instructions>')
    expect(propose).toContain('<criteria>\nAté 3 frases\n</criteria>')
    const judge = judgePrompt('Resuma', '', ['a', ''])
    expect(judge).toContain('<answer number="1">\na\n</answer>')
    expect(judge).toContain('<answer number="2">\n(no answer)\n</answer>')
    expect(tuneCalls(3)).toBe(6)
  })

  it('proposes, runs the current and each new version on the task, and scores them', async () => {
    const replies = [
      reply('```json\n{"variants":[{"label":"Tópicos","change":"usa tópicos","system":"Responda em tópicos."}]}\n```'),
      reply('resposta atual'),
      reply('- resposta em tópicos'),
      reply('{"scores":[{"answer":1,"score":5,"reason":"longa"},{"answer":2,"score":8,"reason":"direta"}]}'),
    ]
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => replies.shift()!)
    vi.stubGlobal('fetch', fetch)
    const steps: string[] = []
    const found = await tuneAgent(
      {
        conn: { provider: getProvider('openai'), baseUrl: 'https://example.test/v1', apiKey: 'k' },
        model: 'm',
        system: 'Seja útil.',
        task: 'Explique DNS',
        criteria: 'curto',
        count: 1,
        onStep: (s) => steps.push(s.kind),
      },
      'Atual',
    )
    expect(found).toEqual([
      { label: 'Atual', change: '', system: 'Seja útil.', answer: 'resposta atual', score: 5, reason: 'longa' },
      { label: 'Tópicos', change: 'usa tópicos', system: 'Responda em tópicos.', answer: '- resposta em tópicos', score: 8, reason: 'direta' },
    ])
    expect(steps).toEqual(['propose', 'probe', 'probe', 'judge'])
    const sent = fetch.mock.calls.map((c) => JSON.parse(c[1].body as string))
    expect(sent[1].messages).toEqual([
      { role: 'system', content: 'Seja útil.' },
      { role: 'user', content: 'Explique DNS' },
    ])
    expect(sent[2].messages[0]).toEqual({ role: 'system', content: 'Responda em tópicos.' })
    expect(sent[2]).not.toHaveProperty('tools')
  })
})
