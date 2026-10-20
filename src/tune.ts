import { t } from './i18n'
import { completeText, type Connection } from './stream'
import type { ChatParams } from './types'

// Tuning an agent, after Harness² (google-research/harness2): propose a few
// edits to its instructions, probe each one on the same task, and let a judge
// score the answers against what a good answer needs. The person adopts the
// version they prefer; nothing changes until they do.

export interface Variant {
  label: string
  // What this version changes, in one line.
  change: string
  system: string
}

export interface Candidate extends Variant {
  answer: string
  score?: number
  reason?: string
  error?: string
}

export interface TuneRequest {
  conn: Connection
  model: string
  params?: ChatParams
  // The agent's current instructions.
  system: string
  // The task every version answers.
  task: string
  // What a good answer needs; the judge scores against it.
  criteria: string
  // How many new versions to propose.
  count: number
  signal?: AbortSignal
  onStep?: (step: TuneStep) => void
}

export type TuneStep =
  | { kind: 'propose' }
  | { kind: 'probe'; index: number; total: number }
  | { kind: 'judge' }

// Calls a run takes: one to propose, one per version (the current one too), one to judge.
export function tuneCalls(count: number): number {
  return count + 3
}

export function proposePrompt(system: string, task: string, criteria: string, count: number): string {
  return [
    '## Agent tuning: propose variants',
    `Below are the instructions (system prompt) of an AI agent, a task it must do, and what a good answer needs. Propose ${count} improved versions of the instructions. Each version makes one clear, different change (a rule added, a step reordered, a format fixed, an ambiguity removed) aimed at the criteria; keep what already works, the agent's language and its purpose.`,
    'Answer only with a JSON block. Each "system" is the complete instructions with that change applied, never the original text unchanged; use only these three fields:',
    '```json\n{"variants":[{"label":"short name","change":"what changed, one line","system":"the full new instructions"}]}\n```',
    `<instructions>\n${system.trim() || '(empty)'}\n</instructions>`,
    `<task>\n${task.trim()}\n</task>`,
    `<criteria>\n${criteria.trim() || 'A correct, complete and clear answer to the task.'}\n</criteria>`,
  ].join('\n\n')
}

export function judgePrompt(task: string, criteria: string, answers: string[]): string {
  return [
    '## Agent tuning: judge answers',
    `Score each answer to the task from 0 to 10 against the criteria, independently, and give the main reason in one short sentence. The answers are numbered; do not favour one for its position or length.`,
    'Answer only with a JSON block, one entry per answer, in order:',
    '```json\n{"scores":[{"answer":1,"score":7,"reason":"..."}]}\n```',
    `<task>\n${task.trim()}\n</task>`,
    `<criteria>\n${criteria.trim() || 'A correct, complete and clear answer to the task.'}\n</criteria>`,
    ...answers.map((a, i) => `<answer number="${i + 1}">\n${a.trim() || '(no answer)'}\n</answer>`),
  ].join('\n\n')
}

// The JSON object in a reply: the first ```json block, or the whole reply.
function jsonOf(reply: string): any {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply)
  const text = fenced ? fenced[1] : reply
  // Small local models leave stray characters around the object (a backtick before the closing fence, a word
  // after it), so read from the first { to the last }.
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
}

// `current` drops versions that only repeat the current instructions (a small model may describe a change it
// did not make).
export function parseVariants(reply: string, count: number, current?: string): Variant[] {
  let data: any
  try {
    data = jsonOf(reply)
  } catch {
    throw new Error(t('O modelo não devolveu as versões em JSON.'))
  }
  const list: Variant[] = (Array.isArray(data?.variants) ? data.variants : [])
    .filter((v: any) => typeof v?.system === 'string' && v.system.trim())
    .filter((v: any) => current === undefined || v.system.trim() !== current.trim())
    .slice(0, count)
    .map((v: any, i: number) => ({
      label: String(v.label || `V${i + 1}`).slice(0, 60),
      change: String(v.change || '').slice(0, 300),
      system: v.system.trim(),
    }))
  if (!list.length) throw new Error(t('O modelo não propôs nenhuma versão.'))
  return list
}

export function parseScores(reply: string, total: number): { score?: number; reason?: string }[] {
  const out: { score?: number; reason?: string }[] = Array.from({ length: total }, () => ({}))
  let data: any
  try {
    data = jsonOf(reply)
  } catch {
    return out
  }
  for (const [i, s] of (Array.isArray(data?.scores) ? data.scores : []).entries()) {
    const at = Number.isInteger(s?.answer) ? s.answer - 1 : i
    if (at < 0 || at >= total) continue
    const score = Number(s?.score)
    out[at] = {
      ...(Number.isFinite(score) ? { score: Math.max(0, Math.min(10, score)) } : {}),
      ...(s?.reason ? { reason: String(s.reason).slice(0, 300) } : {}),
    }
  }
  return out
}

// Proposes versions, runs the current one and each new one on the task, and
// scores them. The current version comes first.
export async function tuneAgent(req: TuneRequest, currentLabel: string): Promise<Candidate[]> {
  const ask = (system: string, content: string) =>
    completeText({ ...req.conn, model: req.model, system, messages: [{ role: 'user', content }], params: req.params, signal: req.signal })

  req.onStep?.({ kind: 'propose' })
  const variants = parseVariants(await ask('', proposePrompt(req.system, req.task, req.criteria, req.count)), req.count, req.system)
  const versions: Variant[] = [{ label: currentLabel, change: '', system: req.system }, ...variants]

  const candidates: Candidate[] = []
  for (const [index, v] of versions.entries()) {
    req.onStep?.({ kind: 'probe', index, total: versions.length })
    try {
      candidates.push({ ...v, answer: await ask(v.system, req.task) })
    } catch (err) {
      if (req.signal?.aborted) throw err
      candidates.push({ ...v, answer: '', error: err instanceof Error ? err.message : String(err) })
    }
  }

  req.onStep?.({ kind: 'judge' })
  const scores = parseScores(
    await ask('', judgePrompt(req.task, req.criteria, candidates.map((c) => c.answer))),
    candidates.length,
  )
  return candidates.map((c, i) => ({ ...c, ...scores[i] }))
}
