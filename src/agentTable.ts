import { t } from './i18n'
import type { ChatRequest, RequestMessage, StreamEvent } from './stream'
import type { AgentTable, Persona, TableMember, Usage } from './types'

export type { AgentTable, TableMember }

// The agent table: several agents from the library work on one task, each in
// its role, in rounds where everyone reads what the others wrote so far; a
// coordinator, when there is one, then writes the result from all of it.
// Members are ordinary agents (personas), with their own model, which may be
// a coding agent on this computer.

export interface TableTurn {
  id: string
  personaId: string
  name: string
  role: string
  // 0 for the coordinator's result.
  round: number
  providerId: string
  model: string
  text: string
  usage?: Usage
  error?: string
}

export type TableEvent =
  | { type: 'start'; turn: TableTurn }
  | { type: 'text'; id: string; text: string }
  | { type: 'usage'; id: string; usage: Usage }
  | { type: 'end'; id: string }
  | { type: 'error'; id: string; error: string }

export const MAX_ROUNDS = 3

export function newTable(name: string): AgentTable {
  return { id: crypto.randomUUID(), name, members: [], rounds: 1 }
}

// The members whose agents still exist, in order.
export function seated(table: AgentTable, personas: Persona[]): { member: TableMember; persona: Persona }[] {
  return table.members.flatMap((member) => {
    const persona = personas.find((p) => p.id === member.personaId)
    return persona ? [{ member, persona }] : []
  })
}

function turnsText(turns: TableTurn[]): string {
  return turns
    .filter((turn) => turn.text.trim())
    .map((turn) => {
      const who = turn.round ? `${turn.name} (${turn.role || 'member'}), round ${turn.round}` : `${turn.name} (coordinator)`
      return `<turn agent="${who}">\n${turn.text.trim()}\n</turn>`
    })
    .join('\n\n')
}

function seats(table: AgentTable, personas: Persona[]): string {
  return seated(table, personas)
    .map(({ member, persona }) => `- ${persona.name}: ${member.role || 'member'}`)
    .join('\n')
}

// What a member is sent for its turn: its own prompt and role, who else is
// at the table, the task and everything said so far.
export function memberRequest(
  table: AgentTable,
  personas: Persona[],
  persona: Persona,
  member: TableMember,
  round: number,
  task: string,
  turns: TableTurn[],
): { system: string; messages: RequestMessage[] } {
  const system = [
    persona.system.trim(),
    `You are ${persona.name}, one of several agents working together at a table${table.name ? ` called "${table.name}"` : ''}.`,
    `Your role here: ${member.role.trim() || 'contribute from your own expertise'}.`,
    `The agents at the table:\n${seats(table, personas)}`,
    table.instructions?.trim() ? `How the table works:\n${table.instructions.trim()}` : '',
    'Do your part only, in your role. Build on what the others wrote: do not repeat it, point out what is wrong or missing. Write in the language of the task.',
    table.rounds > 1 ? `This is round ${round} of ${table.rounds}.` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const before = turnsText(turns)
  const content = before ? `<task>\n${task}\n</task>\n\n<table-so-far>\n${before}\n</table-so-far>` : `<task>\n${task}\n</task>`
  return { system, messages: [{ role: 'user', content }] }
}

// What the coordinator is sent: the task and the whole table, to write the result.
export function coordinatorRequest(
  table: AgentTable,
  personas: Persona[],
  coordinator: Persona,
  task: string,
  turns: TableTurn[],
): { system: string; messages: RequestMessage[] } {
  const system = [
    coordinator.system.trim(),
    `You coordinate a table of agents${table.name ? ` called "${table.name}"` : ''}:\n${seats(table, personas)}`,
    table.instructions?.trim() ? `How the table works:\n${table.instructions.trim()}` : '',
    'Write the final result of the task from their work: settle disagreements, keep what is best, leave out repetition. Deliver the result itself, not a summary of who said what. Write in the language of the task.',
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    system,
    messages: [{ role: 'user', content: `<task>\n${task}\n</task>\n\n<table>\n${turnsText(turns)}\n</table>` }],
  }
}

export interface TableDeps {
  personas: Persona[]
  // Where an agent without a model of its own answers.
  fallback: { providerId: string; model: string }
  // The connection, parameters and folder for one agent's request.
  request: (persona: Persona, providerId: string, model: string, turnId: string) => Omit<ChatRequest, 'model' | 'system' | 'messages'>
  stream: (req: ChatRequest) => AsyncGenerator<StreamEvent>
  signal?: AbortSignal
}

// Runs the table on a task: every member in turn, round after round, then
// the coordinator. A member that fails is reported and the table goes on.
export async function* runTable(table: AgentTable, task: string, deps: TableDeps): AsyncGenerator<TableEvent> {
  const members = seated(table, deps.personas)
  const turns: TableTurn[] = []
  const rounds = Math.min(Math.max(1, Math.round(table.rounds) || 1), MAX_ROUNDS)

  async function* speak(persona: Persona, role: string, round: number, ask: { system: string; messages: RequestMessage[] }) {
    const providerId = persona.model ? (persona.providerId ?? deps.fallback.providerId) : deps.fallback.providerId
    const model = persona.model || deps.fallback.model
    const turn: TableTurn = { id: crypto.randomUUID(), personaId: persona.id, name: persona.name, role, round, providerId, model, text: '' }
    turns.push(turn)
    yield { type: 'start', turn: { ...turn } } as TableEvent
    try {
      for await (const event of deps.stream({ ...deps.request(persona, providerId, model, turn.id), model, ...ask })) {
        if (event.type === 'text') {
          turn.text += event.text
          yield { type: 'text', id: turn.id, text: event.text } as TableEvent
        } else if (event.type === 'usage') {
          turn.usage = event.usage
          yield { type: 'usage', id: turn.id, usage: event.usage } as TableEvent
        }
      }
      yield { type: 'end', id: turn.id } as TableEvent
    } catch (err) {
      if (deps.signal?.aborted) throw err
      turn.error = err instanceof Error ? err.message : String(err)
      yield { type: 'error', id: turn.id, error: turn.error } as TableEvent
    }
  }

  for (let round = 1; round <= rounds; round++) {
    for (const { member, persona } of members) {
      if (deps.signal?.aborted) return
      const before = turns.filter((turn) => !turn.error)
      yield* speak(persona, member.role, round, memberRequest(table, deps.personas, persona, member, round, task, before))
    }
  }
  const coordinator = deps.personas.find((p) => p.id === table.coordinatorId)
  if (coordinator && !deps.signal?.aborted) {
    const done = turns.filter((turn) => !turn.error)
    yield* speak(coordinator, '', 0, coordinatorRequest(table, deps.personas, coordinator, task, done))
  }
}

// The table's work as Markdown, for the project folder.
export function tableMarkdown(table: AgentTable, task: string, turns: TableTurn[], at = new Date()): string {
  const lines = [`# ${table.name}`, '', `_${at.toISOString().slice(0, 16).replace('T', ' ')}_`, '', `## ${t('Tarefa')}`, '', task.trim(), '']
  for (const turn of turns) {
    const title = turn.round
      ? `${turn.name} — ${turn.role || t('membro')} (${t('rodada {number}', { number: turn.round })})`
      : `${turn.name} — ${t('resultado')}`
    const body = turn.error ? `> ${t('Erro: {error}', { error: turn.error })}` : turn.text.trim()
    lines.push(`## ${title}`, '', `<sub>${turn.providerId} · ${turn.model}</sub>`, '', body, '')
  }
  return lines.join('\n')
}

// A finished run kept as a conversation: the task, and the table's work as
// the reply, the result first when a coordinator wrote one.
export function tableReply(turns: TableTurn[]): string {
  const result = turns.find((turn) => turn.round === 0 && !turn.error && turn.text.trim())
  const work = turns
    .filter((turn) => turn.round > 0)
    .map((turn) => {
      const title = `**${turn.name}** — ${turn.role || t('membro')} (${t('rodada {number}', { number: turn.round })})`
      return `${title}\n\n${turn.error ? `> ${t('Erro: {error}', { error: turn.error })}` : turn.text.trim()}`
    })
  const parts = result ? [result.text.trim(), '---', `### ${t('O trabalho da mesa')}`, ...work] : work
  return parts.join('\n\n')
}
