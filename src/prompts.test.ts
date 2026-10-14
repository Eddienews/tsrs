import { expect, test } from 'vitest'
import { fillPrompt, promptFields } from './prompts'

test('lists each field once, in order', () => {
  expect(promptFields('Traduza {{texto}} para {{ idioma }}; mantenha {{texto}} curto.')).toEqual([
    'texto',
    'idioma',
  ])
  expect(promptFields('sem campos, só {chaves} simples')).toEqual([])
})

test('accepts accents and spaces in field names', () => {
  expect(promptFields('Fale sobre {{tópico principal}}.')).toEqual(['tópico principal'])
})

test('fills the fields that have a value and keeps the rest', () => {
  expect(fillPrompt('{{a}} e {{ b }} e {{a}}', { a: 'um' })).toBe('um e {{ b }} e um')
})
