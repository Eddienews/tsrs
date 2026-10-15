import { expect, test } from 'vitest'
import { describeSchedule } from './agenda'

test('a schedule in words', () => {
  expect(describeSchedule({ kind: 'daily', time: '08:00' })).toBe('Todo dia às 08:00')
  expect(describeSchedule({ kind: 'daily', time: '08:00', days: [5, 1, 3] })).toBe('Às 08:00 (seg, qua, sex)')
  expect(describeSchedule({ kind: 'daily', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Todo dia às 08:00')
  expect(describeSchedule({ kind: 'interval', hours: 6 })).toBe('A cada 6 h')
  expect(describeSchedule({ kind: 'once', at: '2026-10-20T10:30:00' })).toBe('Uma vez, em 20/10/2026, 10:30')
})
