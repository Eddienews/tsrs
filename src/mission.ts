import type { Task } from './agenda'
import { t } from './i18n'
import { dayKey } from './report'
import type { ChatMeta, FocusItem } from './types'

// Mission Control: the day at a glance, from what TSRS already keeps (usage,
// schedule, board, coding agents, recent work) plus a short list of what to
// get done today.

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return t('Bom dia.')
  if (hour >= 12 && hour < 18) return t('Boa tarde.')
  return t('Boa noite.')
}

// Scheduled tasks that run today or already ran today, in time order.
export function todayTasks(tasks: Task[], now = Date.now()): { task: Task; at: number; ran: boolean }[] {
  const today = dayKey(now)
  const rows = tasks.flatMap((task) => {
    if (task.lastRun && dayKey(task.lastRun) === today) return [{ task, at: task.lastRun, ran: true }]
    if (task.enabled && task.nextRun && dayKey(task.nextRun) === today) return [{ task, at: task.nextRun, ran: false }]
    return []
  })
  return rows.sort((a, b) => a.at - b.at)
}

// Today's list: what was added today, and what is still open from before.
export function focusToday(items: FocusItem[], now = Date.now()): FocusItem[] {
  const today = dayKey(now)
  return items.filter((item) => item.day === today || !item.done)
}

export function addFocus(items: FocusItem[], text: string, now = Date.now()): FocusItem[] {
  const clean = text.trim()
  if (!clean) return items
  return [...items, { id: crypto.randomUUID(), text: clean, done: false, day: dayKey(now) }]
}

// Done items from earlier days are dropped as the list is changed, so it
// does not grow forever; open ones carry over.
export function toggleFocus(items: FocusItem[], id: string, now = Date.now()): FocusItem[] {
  const today = dayKey(now)
  return items
    .map((item) => (item.id === id ? { ...item, done: !item.done, day: item.done ? item.day : today } : item))
    .filter((item) => !item.done || item.day === today)
}

export function removeFocus(items: FocusItem[], id: string): FocusItem[] {
  return items.filter((item) => item.id !== id)
}

// The conversations worked on lately, newest first.
export function recentWork(chats: ChatMeta[], now = Date.now(), count = 6, days = 7): ChatMeta[] {
  const since = now - days * 86_400_000
  return chats
    .filter((c) => !c.archived && !c.temporary && c.updatedAt >= since)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, count)
}

// Conversations with an answer from the schedule today.
export function scheduleResults(chats: ChatMeta[], now = Date.now()): ChatMeta[] {
  const today = dayKey(now)
  return chats.filter((c) => c.scheduleId && dayKey(c.updatedAt) === today)
}
