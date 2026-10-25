import { describe, expect, it } from 'vitest'
import type { Task } from './agenda'
import { addFocus, focusToday, greeting, recentWork, removeFocus, scheduleResults, todayTasks, toggleFocus } from './mission'
import type { ChatMeta } from './types'

const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime()
const NOW = at(25, 10)

function task(id: string, fields: Partial<Task>): Task {
  return {
    id, name: id, prompt: '', system: '', providerId: 'p', model: 'm',
    schedule: { kind: 'daily', time: '08:00' } as Task['schedule'],
    enabled: true, nextRun: null, lastRun: null, lastError: null, ...fields,
  }
}

function chat(id: string, updatedAt: number, fields: Partial<ChatMeta> = {}): ChatMeta {
  return { id, title: id, createdAt: updatedAt, updatedAt, providerId: 'p', model: 'm', ...fields }
}

describe('Mission Control', () => {
  it('greets by the time of day', () => {
    expect([greeting(7), greeting(14), greeting(21), greeting(2)]).toEqual(['Bom dia.', 'Boa tarde.', 'Boa noite.', 'Boa noite.'])
  })

  it('lists the schedule of today: what ran and what is still to run', () => {
    const rows = todayTasks(
      [
        task('boletim', { lastRun: at(25, 7), nextRun: at(26, 7) }),
        task('tarde', { nextRun: at(25, 15) }),
        task('ontem', { lastRun: at(24, 9), nextRun: at(26, 9) }),
        task('desligada', { enabled: false, nextRun: at(25, 11) }),
      ],
      NOW,
    )
    expect(rows.map((r) => [r.task.id, r.ran])).toEqual([
      ['boletim', true],
      ['tarde', false],
    ])
  })

  it('keeps open items from earlier days and drops old done ones as the list changes', () => {
    let items = addFocus([], 'Gravar Milo #4', at(24, 9))
    items = addFocus(items, '  ', at(24, 9))
    items = addFocus(items, 'Revisar AD', at(24, 9))
    items = toggleFocus(items, items[1].id, at(24, 18))
    expect(items.map((i) => [i.text, i.done, i.day])).toEqual([
      ['Gravar Milo #4', false, '2026-10-24'],
      ['Revisar AD', true, '2026-10-24'],
    ])
    // Next day: the open item carries over, yesterday's done one is not shown.
    expect(focusToday(items, NOW).map((i) => i.text)).toEqual(['Gravar Milo #4'])
    items = toggleFocus(items, items[0].id, NOW)
    expect(items.map((i) => [i.text, i.done, i.day])).toEqual([['Gravar Milo #4', true, '2026-10-25']])
    expect(removeFocus(items, items[0].id)).toEqual([])
  })

  it('shows the recent work and the schedule answers of today', () => {
    const chats = [
      chat('velha', at(10, 9)),
      chat('ontem', at(24, 9)),
      chat('hoje', at(25, 9)),
      chat('arquivada', at(25, 9), { archived: true }),
      chat('agenda', at(25, 7), { scheduleId: 's' }),
      chat('agenda-ontem', at(24, 7), { scheduleId: 's2' }),
    ]
    expect(recentWork(chats, NOW).map((c) => c.id)).toEqual(['hoje', 'agenda', 'ontem', 'agenda-ontem'])
    expect(scheduleResults(chats, NOW).map((c) => c.id)).toEqual(['agenda'])
  })
})
