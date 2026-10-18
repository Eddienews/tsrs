import { expect, test } from 'vitest'
import { composerCommands, slashMatches, slashQuery } from './commands'

const sources = {
  skills: [{ id: 'nwl:launch-pulse', name: 'launch-pulse', description: 'A 15 s launch film' }],
  pluginPrompts: [{ id: 'plugin:kit:render', title: '/render · kit', text: 'Render {{argumentos}}' }],
  prompts: [{ id: 'p1', title: 'Revisar texto', text: 'Revise este texto:' }],
  mcpServers: [{ id: 'm1', name: 'Google Drive' }],
  projects: true,
}

test('a slash only at the start of the message opens the commands', () => {
  expect(slashQuery('/')).toBe('')
  expect(slashQuery('/lau')).toBe('lau')
  expect(slashQuery('veja /lau')).toBeNull()
  expect(slashQuery('/lau nch')).toBeNull()
  expect(slashQuery('a/b')).toBeNull()
})

test('skills, plugin commands, tools, MCP servers and prompts are all commands', () => {
  const all = composerCommands(sources)
  expect(all.map((c) => `${c.group}:${c.name}`)).toEqual(
    expect.arrayContaining(['skill:launch-pulse', 'plugin:render', 'tool:apis', 'tool:motion', 'mcp:google-drive', 'prompt:revisar-texto']),
  )
  expect(all.find((c) => c.name === 'launch-pulse')!.text).toBe('Use a skill launch-pulse: ')
  expect(all.find((c) => c.name === 'render')!.prompt?.text).toBe('Render {{argumentos}}')
  // Without project folders, the folder tools are not offered.
  expect(composerCommands({ ...sources, projects: false }).some((c) => c.group === 'tool')).toBe(false)
})

test('what was typed matches names first, then descriptions', () => {
  const all = composerCommands(sources)
  expect(slashMatches('lau', all)[0].name).toBe('launch-pulse')
  expect(slashMatches('clima', all).map((c) => c.name)).toEqual(['apis'])
  expect(slashMatches('', all)).toHaveLength(all.length)
})
