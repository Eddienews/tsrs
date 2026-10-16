import { expect, test } from 'vitest'
import { designToolSet, foundText, isTasteSkill, savedText } from './design'

test('the draw comes only with the taste-skill skill', () => {
  const names = (taste: boolean) => designToolSet({ project: () => undefined, taste }).defs.map((d) => d.name)
  expect(names(false)).toEqual(['find_images', 'get_image', 'inspect_page'])
  expect(names(true)).toContain('design_draw')
  expect(isTasteSkill({ name: 'taste-skill' })).toBe(true)
  expect(isTasteSkill({ name: 'design-taste-frontend' })).toBe(true)
  expect(isTasteSkill({ name: 'escrita-clara' })).toBe(false)
})

test('without a project folder the tools say so', async () => {
  const set = designToolSet({ project: () => undefined, taste: false })
  expect(await set.run({ id: '1', name: 'inspect_page', input: { file: 'index.html' } })).toEqual({
    content: 'This conversation has no project folder.',
    isError: true,
  })
})

test('found and saved pictures are told with their credits', () => {
  const text = foundText(
    [{ ref: 'met:1', title: 'Fig', source: 'The Met', license: 'Public domain', credit: 'Fig, The Met, public domain', page: 'https://met/1', thumbnail: '', width: 1200, height: 900 }],
    ['Openverse: HTTP 429'],
  )
  expect(text).toContain('met:1  Fig')
  expect(text).toContain('1200x900, The Met, Public domain')
  expect(text).toContain('credit: Fig, The Met, public domain')
  expect(text).toContain('Could not search: Openverse: HTTP 429')
  expect(foundText([], [])).toMatch(/^Nothing usable/)
  expect(savedText([{ file: 'imagens/fig.jpg', credit: 'Fig, The Met', page: 'https://met/1', license: 'pd', width: 800, height: 600 }], 'markup')).toBe(
    'Saved imagens/fig.jpg (800x600). Credit (added to CREDITOS.md): Fig, The Met\n\nmarkup',
  )
})
