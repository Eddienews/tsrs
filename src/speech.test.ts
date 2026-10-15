import { expect, test } from 'vitest'
import { pieces, speakable } from './speech'

test('leaves code, symbols and link targets out of what is read aloud', () => {
  const text = '# Título\n\nVeja **isto** e [o site](https://x.test).\n\n```js\nconst a = 1\n```\n\n- item `um`'
  expect(speakable(text)).toBe('Título Veja isto e o site. item um')
})

test('cuts long text for a voice service at the end of a sentence, or else at a space', () => {
  const sentence = 'Uma frase curta de exemplo. '
  const text = sentence.repeat(10).trim()
  const parts = pieces(text, 100)
  expect(parts.every((p) => p.length <= 100 && p.endsWith('.'))).toBe(true)
  expect(parts.join(' ')).toBe(text)
  expect(pieces('palavra '.repeat(30), 50).every((p) => p.length <= 50 && !p.includes('  '))).toBe(true)
  expect(pieces('curto')).toEqual(['curto'])
  expect(pieces('   ')).toEqual([])
})
