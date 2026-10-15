import type { Plugin, Skill } from './extensions'
import type { ChatParams, Persona } from './types'

// What an agent brings to a conversation beyond its prompt: its own
// parameters, skills and plugins, and being called by name with @.

// The conversation's own parameters win; the agent's fill in the rest.
export function agentParams(chat: ChatParams | undefined, agent: Persona | undefined): ChatParams {
  const own = chat ?? {}
  const from = agent?.params ?? {}
  return {
    ...own,
    temperature: own.temperature ?? from.temperature,
    maxTokens: own.maxTokens ?? from.maxTokens,
    effort: own.effort || from.effort,
  }
}

// The skills an agent may use, among those turned on.
export function agentSkills(skills: Skill[], agent: Persona | undefined): Skill[] {
  if (!agent?.skills) return skills
  const chosen = new Set(agent.skills)
  return skills.filter((s) => chosen.has(s.id))
}

export function agentPlugins(plugins: Plugin[], agent: Persona | undefined): Plugin[] {
  if (!agent?.plugins) return plugins
  const chosen = new Set(agent.plugins)
  return plugins.filter((p) => chosen.has(p.name))
}

// Names compare without case or accents: "@redacao" finds "Redação".
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
}

// The agent called with @name in a message: the first mention, matched to the
// longest name that fits, so "@Redator Técnico" beats "@Redator". The name
// must end at a space, punctuation or the end of the text.
export function findMention(text: string, personas: Persona[]): Persona | undefined {
  const named = personas.filter((p) => p.name.trim()).sort((a, b) => b.name.trim().length - a.name.trim().length)
  const folded = fold(text)
  for (const match of folded.matchAll(/(^|\s)@/g)) {
    const at = match.index + match[0].length
    const found = named.find((p) => {
      const name = fold(p.name.trim())
      return folded.startsWith(name, at) && !/[\p{L}\p{N}_-]/u.test(folded[at + name.length] ?? '')
    })
    if (found) return found
  }
  return undefined
}

// What is typed after an @ right before the caret, for suggestions; null when
// the caret is not in a mention. Names may have spaces, so the query runs to
// the caret, within the line and a few words.
export function mentionQuery(beforeCaret: string): string | null {
  const match = /(?:^|\s)@([^\n@]{0,40})$/u.exec(beforeCaret)
  return match ? match[1] : null
}

// Agents whose name starts with what was typed after @, or contains it.
export function mentionMatches(query: string, personas: Persona[]): Persona[] {
  const wanted = fold(query).trimStart()
  const named = personas.filter((p) => p.name.trim())
  if (!wanted) return named
  const starts = named.filter((p) => fold(p.name.trim()).startsWith(wanted))
  // Past the first word, only names that go on that way still count.
  if (/\s/.test(wanted)) return starts
  const contains = named.filter((p) => !starts.includes(p) && fold(p.name).includes(wanted))
  return [...starts, ...contains]
}

// Puts "@Name " in place of the @query before the caret.
export function insertMention(text: string, caret: number, name: string): { text: string; caret: number } {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  const start = at < 0 ? caret : at
  const inserted = `@${name} `
  return { text: text.slice(0, start) + inserted + text.slice(caret).replace(/^ /, ''), caret: start + inserted.length }
}

// --- Chains -----------------------------------------------------------------

const REPLY = /\{\{\s*resposta\s*\}\}/gi

// The prompts of a chain, in order: the first text, then each step.
export function chainSteps(text: string, steps: string[] | undefined): string[] {
  return [text, ...(steps ?? [])].map((s) => s.trim()).filter(Boolean)
}

// A step with {{resposta}} replaced by the reply to the step before it.
export function withReply(step: string, reply: string): string {
  return step.replace(REPLY, reply.trim())
}
