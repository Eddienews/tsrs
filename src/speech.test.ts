import { expect, test } from 'vitest'
import { speakable } from './speech'

test('leaves code, symbols and link targets out of what is read aloud', () => {
  const text = '# Título\n\nVeja **isto** e [o site](https://x.test).\n\n```js\nconst a = 1\n```\n\n- item `um`'
  expect(speakable(text)).toBe('Título Veja isto e o site. item um')
})
