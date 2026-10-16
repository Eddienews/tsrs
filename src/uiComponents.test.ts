import { expect, test } from 'vitest'
import { designNote } from './projects'
import { addedText, foundComponents, uiToolSet } from './uiComponents'

test('the project DESIGN.md goes to the model, overriding skills, and long ones are cut', () => {
  expect(designNote('  ')).toBe('')
  const note = designNote('# Ledger\n\nGeist Sans only.')
  expect(note).toContain('override the defaults of any skill')
  expect(note).toContain('<design_md>\n# Ledger\n\nGeist Sans only.\n</design_md>')
  const long = designNote('x'.repeat(30_000))
  expect(long).toContain('DESIGN.md continues')
  expect(long.length).toBeLessThan(25_000)
})

test('components are listed and added with what to install', () => {
  expect(foundComponents([{ name: 'dock', description: 'macOS dock', dependencies: ['motion'] }])).toBe('- dock: macOS dock (needs motion)')
  expect(foundComponents([], 'xyz')).toMatch(/No component matches "xyz"/)
  const text = addedText('dock', { written: ['components/ui/dock.tsx'], skipped: ['lib/utils.ts'], dependencies: ['motion'], needs: ['@/hooks/x'] })
  expect(text).toContain('Added dock: components/ui/dock.tsx (credited in CREDITOS.md).')
  expect(text).toContain('Kept, already in the project: lib/utils.ts.')
  expect(text).toContain('Install: npm install motion')
  expect(text).toContain('@/hooks/x')
})

test('adding needs a project folder', async () => {
  const set = uiToolSet(() => undefined)
  expect(set.defs.map((d) => d.name)).toEqual(['ui_components_search', 'ui_component_add'])
  expect((await set.run({ id: '1', name: 'ui_component_add', input: { name: 'dock' } })).isError).toBe(true)
})
