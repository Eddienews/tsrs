import { expect, test } from 'vitest'
import { commandPrompts, enabledPlugins, enabledSkills, skillsNote, toolName, type Plugin, type Skill } from './extensions'
import { defaultSettings } from './storage'

const skill = (id: string, source = 'user'): Skill => ({ id, name: id.split(':').pop()!, description: `faz ${id}`, source, folder: '', files: [] })
const plugin = (name: string): Plugin => ({
  id: name,
  name,
  description: '',
  version: '',
  author: '',
  folder: '',
  skills: [],
  commands: [{ name: 'resumo', description: 'd', body: 'Resuma: $ARGUMENTS' }],
  agents: [],
  mcp: [],
  tools: [],
})

test('skills and plugins switched off are left out, with a plugin taking its skills along', () => {
  const settings = { ...defaultSettings(), disabledSkills: ['b'], disabledPlugins: ['kit'] }
  const skills = [skill('a'), skill('b'), skill('kit:marca', 'kit'), skill('outro:x', 'outro')]
  expect(enabledSkills(skills, settings).map((s) => s.id)).toEqual(['a', 'outro:x'])
  expect(enabledPlugins([plugin('kit'), plugin('outro')], settings).map((p) => p.name)).toEqual(['outro'])
})

test('the model sees only names and descriptions of the skills', () => {
  const note = skillsNote([skill('a'), skill('kit:marca', 'kit')])
  expect(note).toContain('call skill_load')
  expect(note).toContain('- a: faz a\n- kit:marca: faz kit:marca')
})

test('tool names fit what providers accept and never clash', () => {
  const taken = new Set<string>(['memory_save'])
  expect(toolName('kit', 'previsão do tempo', taken)).toBe('previs_o_do_tempo')
  expect(toolName('kit', 'memory_save', taken)).toBe('kit__memory_save')
  expect(toolName('outro', 'previsão do tempo', taken)).toBe('outro__previs_o_do_tempo')
  expect(toolName('x', 'a'.repeat(80), taken)).toHaveLength(64)
})

test("a plugin's commands become prompts with a field for the arguments", () => {
  expect(commandPrompts([plugin('kit')])).toEqual([
    { id: 'plugin:kit:resumo', title: '/resumo · kit', text: 'Resuma: {{argumentos}}' },
  ])
})
