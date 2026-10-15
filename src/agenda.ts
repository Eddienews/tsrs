import { get, post } from './extensions'
import { t } from './i18n'

export type Schedule =
  | { kind: 'once'; at: string }
  | { kind: 'daily'; time: string; days?: number[] }
  | { kind: 'interval'; hours: number }

export interface Task {
  id: string
  name: string
  prompt: string
  system: string
  providerId: string
  model: string
  baseUrl?: string
  schedule: Schedule
  enabled: boolean
  nextRun: number | null
  lastRun: number | null
  lastError: string | null
}

export interface AgendaResult {
  id: string
  taskId: string
  name: string
  prompt: string
  providerId: string
  model: string
  text: string
  error: string | null
  at: number
}

export interface AgendaState {
  tasks: Task[]
  // Providers whose key the server has (kept on the computer or in the environment).
  keys: string[]
  keysFile: string
  pending: number
}

export const loadAgenda = () => get<AgendaState>('/agenda')

export function saveTask(task: Partial<Task>, key?: { apiKey: string }) {
  return post<Task>('/agenda/save', { task, ...(key ? { key } : {}) })
}

export const removeTask = (id: string) => post('/agenda/remove', { id })
export const runTask = (id: string) => post('/agenda/run', { id })
export const forgetKey = (providerId: string) => post('/agenda/forget-key', { providerId })

export async function pendingResults(): Promise<AgendaResult[]> {
  return (await get<{ results: AgendaResult[] }>('/agenda/queue')).results
}

export const ackResults = (ids: string[]) => post('/agenda/ack', { ids })

const WEEKDAYS = () => [t('dom'), t('seg'), t('ter'), t('qua'), t('qui'), t('sex'), t('sáb')]

export function weekdayNames(): string[] {
  return WEEKDAYS()
}

// The schedule in words, such as "Todo dia às 08:00 (seg, qua, sex)".
export function describeSchedule(schedule: Schedule, locale = 'pt-BR'): string {
  if (schedule.kind === 'once') {
    const at = new Date(schedule.at)
    return Number.isNaN(at.getTime())
      ? t('Uma vez')
      : t('Uma vez, em {date}', { date: at.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) })
  }
  if (schedule.kind === 'interval') return t('A cada {hours} h', { hours: schedule.hours })
  const days = schedule.days?.length && schedule.days.length < 7 ? schedule.days : null
  const names = WEEKDAYS()
  return days
    ? t('Às {time} ({days})', { time: schedule.time, days: [...days].sort().map((d) => names[d]).join(', ') })
    : t('Todo dia às {time}', { time: schedule.time })
}
