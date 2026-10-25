import { describe, expect, it } from 'vitest'
import { memberRequest, runTable, tableMarkdown, type AgentTable, type TableEvent } from './agentTable'
import type { ChatRequest, StreamEvent } from './stream'
import type { Persona } from './types'

const personas: Persona[] = [
  { id: 'pesq', name: 'Pesquisadora', system: 'Você pesquisa.', providerId: 'anthropic', model: 'claude-haiku-5-5' },
  { id: 'rot', name: 'Roteirista', system: 'Você escreve roteiros.' },
  { id: 'nori', name: 'Nori', system: 'Você coordena a NorthWindLab.', providerId: 'claude-code', model: 'opus' },
]

const table: AgentTable = {
  id: 't',
  name: 'Sala de roteiro',
  members: [
    { personaId: 'pesq', role: 'traz referências' },
    { personaId: 'rot', role: 'escreve a cena' },
    { personaId: 'sumiu', role: 'agente apagado' },
  ],
  coordinatorId: 'nori',
  rounds: 2,
}

// A stand-in for streamChat that answers with the agent's name and turn
// number, failing where told to, and records what it was asked.
function fakeStream(fails: string[] = []) {
  const asked: ChatRequest[] = []
  const failed = new Set<string>()
  async function* stream(req: ChatRequest): AsyncGenerator<StreamEvent> {
    asked.push(req)
    const who = req.system.includes('You coordinate') ? 'Nori' : req.system.match(/You are (\S+),/)![1]
    // Each listed agent fails its first turn only.
    if (fails.includes(who) && !failed.has(who)) {
      failed.add(who)
      throw new Error('caiu')
    }
    yield { type: 'text', text: `${who} ${asked.length}` }
    yield { type: 'usage', usage: { input: 10, output: 2 } }
  }
  return { stream, asked }
}

const deps = (stream: (req: ChatRequest) => AsyncGenerator<StreamEvent>) => ({
  personas,
  fallback: { providerId: 'openai', model: 'gpt-5' },
  request: (_p: Persona, providerId: string) => ({ provider: { id: providerId } as never, baseUrl: '', apiKey: '' }),
  stream,
})

async function collect(events: AsyncGenerator<TableEvent>) {
  const all: TableEvent[] = []
  for await (const event of events) all.push(event)
  return all
}

describe('agent table', () => {
  it('tells each member its role, the others, the task and what was said before', () => {
    const ask = memberRequest(table, personas, personas[1], table.members[1], 2, 'Cena de abertura do Milo', [
      { id: '1', personaId: 'pesq', name: 'Pesquisadora', role: 'traz referências', round: 1, providerId: 'x', model: 'y', text: 'Três referências.' },
    ])
    expect(ask.system).toContain('Você escreve roteiros.')
    expect(ask.system).toContain('Your role here: escreve a cena.')
    expect(ask.system).toContain('- Pesquisadora: traz referências\n- Roteirista: escreve a cena')
    expect(ask.system).toContain('This is round 2 of 2.')
    expect(ask.messages).toEqual([
      {
        role: 'user',
        content:
          '<task>\nCena de abertura do Milo\n</task>\n\n<table-so-far>\n' +
          '<turn agent="Pesquisadora (traz referências), round 1">\nTrês referências.\n</turn>\n</table-so-far>',
      },
    ])
  })

  it('runs every member round after round, then the coordinator, going on past a failure', async () => {
    const { stream, asked } = fakeStream(['Roteirista'])
    const events = await collect(runTable(table, 'Cena de abertura', deps(stream)))
    const starts = events.filter((e): e is Extract<TableEvent, { type: 'start' }> => e.type === 'start').map((e) => e.turn)
    expect(starts.map((turn) => [turn.name, turn.round, turn.providerId, turn.model])).toEqual([
      ['Pesquisadora', 1, 'anthropic', 'claude-haiku-5-5'],
      // Without a model of its own, an agent answers with the table's default.
      ['Roteirista', 1, 'openai', 'gpt-5'],
      ['Pesquisadora', 2, 'anthropic', 'claude-haiku-5-5'],
      ['Roteirista', 2, 'openai', 'gpt-5'],
      ['Nori', 0, 'claude-code', 'opus'],
    ])
    expect(events.filter((e) => e.type === 'error')).toEqual([{ type: 'error', id: starts[1].id, error: 'caiu' }])
    // The failed turn is left out of what the next agents read.
    const coordinator = asked.at(-1)!
    expect(coordinator.messages[0].content).toContain('Pesquisadora (traz referências), round 1">\nPesquisadora 1')
    expect(coordinator.messages[0].content).not.toContain('Roteirista 2')
    expect(coordinator.messages[0].content).toContain('Roteirista (escreve a cena), round 2">\nRoteirista 4')
  })

  it('stops between turns when stopped', async () => {
    const stop = new AbortController()
    const { stream, asked } = fakeStream()
    const events: TableEvent[] = []
    for await (const event of runTable(table, 'x', { ...deps(stream), signal: stop.signal })) {
      events.push(event)
      if (event.type === 'end') stop.abort()
    }
    expect(asked).toHaveLength(1)
  })

  it('writes the work as Markdown', () => {
    const md = tableMarkdown(table, 'Cena', [
      { id: '1', personaId: 'pesq', name: 'Pesquisadora', role: 'traz referências', round: 1, providerId: 'anthropic', model: 'h', text: 'Refs' },
      { id: '2', personaId: 'rot', name: 'Roteirista', role: 'escreve a cena', round: 1, providerId: 'openai', model: 'g', text: '', error: 'caiu' },
      { id: '3', personaId: 'nori', name: 'Nori', role: '', round: 0, providerId: 'claude-code', model: 'opus', text: 'Final' },
    ], new Date('2026-10-25T05:00:00Z'))
    expect(md).toContain('# Sala de roteiro\n\n_2026-10-25 05:00_\n\n## Tarefa\n\nCena')
    expect(md).toContain('## Pesquisadora — traz referências (rodada 1)')
    expect(md).toContain('> Erro: caiu')
    expect(md).toContain('## Nori — resultado\n\n<sub>claude-code · opus</sub>\n\nFinal')
  })
})

describe('tableReply', () => {
  it('puts the coordinator\'s result first, then the table\'s work', async () => {
    const { tableReply } = await import('./agentTable')
    const turns = [
      { id: '1', personaId: 'a', name: 'A', role: 'pesquisa', round: 1, providerId: 'p', model: 'm', text: 'Achados' },
      { id: '2', personaId: 'b', name: 'B', role: '', round: 1, providerId: 'p', model: 'm', text: '', error: 'caiu' },
      { id: '3', personaId: 'c', name: 'C', role: '', round: 0, providerId: 'p', model: 'm', text: 'Resultado final' },
    ]
    expect(tableReply(turns)).toBe(
      'Resultado final\n\n---\n\n### O trabalho da mesa\n\n**A** — pesquisa (rodada 1)\n\nAchados\n\n**B** — membro (rodada 1)\n\n> Erro: caiu',
    )
    expect(tableReply(turns.slice(0, 1))).toBe('**A** — pesquisa (rodada 1)\n\nAchados')
  })
})
