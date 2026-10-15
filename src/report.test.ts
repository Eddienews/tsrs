import { expect, test } from 'vitest'
import { dayKey, usageReport } from './report'
import type { Chat, Message } from './types'

const NOW = new Date(2026, 9, 14, 15).getTime()
const daysAgo = (n: number) => new Date(2026, 9, 14 - n, 10).getTime()

function reply(fields: Partial<Message>): Message {
  return { id: crypto.randomUUID(), role: 'assistant', content: 'r', ...fields }
}

function chat(messages: Message[], fields: Partial<Chat> = {}): Chat {
  return {
    id: crypto.randomUUID(),
    title: 'c',
    createdAt: 0,
    updatedAt: daysAgo(0),
    providerId: 'anthropic',
    model: 'claude-haiku-5-5',
    messages,
    ...fields,
  }
}

test('counts replies per day and per model within the range', () => {
  const report = usageReport(
    [
      chat([
        { id: 'u', role: 'user', content: 'q', createdAt: daysAgo(1) },
        reply({ createdAt: daysAgo(1), usage: { input: 100, output: 10, cost: 0.5 } }),
        reply({
          createdAt: daysAgo(0),
          providerId: 'openai',
          model: 'gpt-x',
          usage: { input: 1000, output: 50 },
        }),
        // Older than the range.
        reply({ createdAt: daysAgo(9), usage: { input: 7, output: 7, cost: 9 } }),
      ]),
    ],
    7,
    NOW,
  )
  expect(report.daily.map((d) => d.day)).toHaveLength(7)
  expect(report.daily.at(-1)).toMatchObject({ day: dayKey(NOW), input: 1000, output: 50, replies: 1 })
  expect(report.daily.at(-1)!.cost).toBeUndefined()
  expect(report.daily.at(-2)).toMatchObject({ input: 100, output: 10, cost: 0.5, replies: 1 })
  expect(report.byModel.map((m) => m.model)).toEqual(['gpt-x', 'claude-haiku-5-5'])
  expect(report.total).toEqual({ input: 1100, output: 60, cost: 0.5, replies: 2 })
  expect(report.unpriced).toBe(1)
})

test('includes earlier versions and dates old replies by their conversation', () => {
  const old = reply({ usage: { input: 5, output: 5, cost: 0.1 } })
  const current = reply({
    createdAt: daysAgo(0),
    usage: { input: 20, output: 2, cost: 0.2 },
    alts: [[old]],
    altIndex: 1,
  })
  const report = usageReport([chat([current], { updatedAt: daysAgo(2) })], 30, NOW)
  expect(report.total.replies).toBe(2)
  expect(report.total.cost).toBeCloseTo(0.3)
  expect(report.undated).toBe(1)
  expect(report.daily.find((d) => d.day === dayKey(daysAgo(2)))!.replies).toBe(1)
})

test('replies saved before their price was known are priced when it is', () => {
  const chat = {
    id: 'c',
    title: 'x',
    createdAt: 0,
    updatedAt: Date.now(),
    providerId: 'deepseek',
    model: 'deepseek-v5',
    messages: [{ id: 'r', role: 'assistant', content: 'oi', createdAt: Date.now(), usage: { input: 1_000_000, output: 0 } }],
  } as Chat
  expect(usageReport([chat], 7).unpriced).toBe(1)
  const priced = usageReport([chat], 7, Date.now(), () => ({ inputPrice: 0.5, outputPrice: 2 }))
  expect(priced.total.cost).toBeCloseTo(0.5)
  expect(priced.unpriced).toBe(0)
})
