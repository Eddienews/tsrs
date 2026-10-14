import type { Chat, Message } from './types'

export interface UsageRow {
  input: number
  output: number
  // Undefined when none of the replies counted here has a known cost.
  cost?: number
  replies: number
}

export interface DayUsage extends UsageRow {
  // Local date, YYYY-MM-DD.
  day: string
}

export interface ModelUsage extends UsageRow {
  providerId: string
  model: string
}

export interface UsageReport {
  daily: DayUsage[]
  byModel: ModelUsage[]
  total: UsageRow
  // Replies with tokens but no known price, left out of the cost.
  unpriced: number
  // Replies written before messages had a date, counted on the day their
  // conversation was last updated.
  undated: number
}

function empty(): UsageRow {
  return { input: 0, output: 0, replies: 0 }
}

function add(row: UsageRow, message: Message) {
  const usage = message.usage!
  row.input += usage.input
  row.output += usage.output
  row.replies += 1
  if (usage.cost !== undefined) row.cost = (row.cost ?? 0) + usage.cost
}

export function dayKey(time: number): string {
  const date = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Every message of a conversation, including the versions left behind by
// edits and regenerations: those were paid for too.
function* everyMessage(messages: Message[]): Generator<Message> {
  for (const message of messages) {
    yield message
    for (const alt of message.alts ?? []) yield* everyMessage(alt)
  }
}

// Tokens and cost of the replies of the last `days` days, today included.
export function usageReport(chats: Chat[], days: number, now = Date.now()): UsageReport {
  const daily = new Map<string, DayUsage>()
  const today = new Date(now)
  for (let i = days - 1; i >= 0; i--) {
    // Noon avoids skipping or repeating a day across daylight saving changes.
    const day = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i, 12).getTime())
    daily.set(day, { day, ...empty() })
  }
  const byModel = new Map<string, ModelUsage>()
  const total = empty()
  let unpriced = 0
  let undated = 0

  for (const chat of chats) {
    for (const message of everyMessage(chat.messages)) {
      if (message.role !== 'assistant' || !message.usage) continue
      const day = daily.get(dayKey(message.createdAt ?? chat.updatedAt))
      if (!day) continue
      const providerId = message.providerId ?? chat.providerId
      const model = message.model ?? chat.model
      const key = `${providerId}/${model}`
      if (!byModel.has(key)) byModel.set(key, { providerId, model, ...empty() })
      add(day, message)
      add(byModel.get(key)!, message)
      add(total, message)
      if (message.usage.cost === undefined) unpriced++
      if (message.createdAt === undefined) undated++
    }
  }

  const tokens = (row: UsageRow) => row.input + row.output
  return {
    daily: [...daily.values()],
    byModel: [...byModel.values()].sort((a, b) => tokens(b) - tokens(a)),
    total,
    unpriced,
    undated,
  }
}

