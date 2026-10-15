import { describe, expect, it } from 'vitest'
import {
  agentParams,
  agentPlugins,
  agentSkills,
  chainSteps,
  findMention,
  insertMention,
  mentionMatches,
  mentionQuery,
  withReply,
} from './agents'
import type { Plugin, Skill } from './extensions'
import { promptFields } from './prompts'
import type { Persona } from './types'

const persona = (id: string, name: string, fields: Partial<Persona> = {}): Persona => ({ id, name, system: '', ...fields })
const team = [persona('r', 'Redator'), persona('rt', 'Redator Técnico'), persona('v', 'Revisão'), persona('x', '')]

describe('agent parameters, skills and plugins', () => {
  it("fills in what the conversation leaves unset with the agent's values", () => {
    const agent = persona('a', 'A', { params: { temperature: 0.2, maxTokens: 500, effort: 'high' } })
    expect(agentParams({ temperature: 1 }, agent)).toEqual({ temperature: 1, maxTokens: 500, effort: 'high' })
    expect(agentParams(undefined, agent)).toEqual({ temperature: 0.2, maxTokens: 500, effort: 'high' })
    expect(agentParams({ system: 's', effort: 'low' }, undefined)).toEqual({ system: 's', effort: 'low', temperature: undefined, maxTokens: undefined })
  })

  it('keeps all skills and plugins unless the agent chose some', () => {
    const skills = [{ id: 'a' }, { id: 'p:b' }] as Skill[]
    const plugins = [{ name: 'x' }, { name: 'y' }] as Plugin[]
    expect(agentSkills(skills, undefined)).toBe(skills)
    expect(agentSkills(skills, persona('1', 'A'))).toBe(skills)
    expect(agentSkills(skills, persona('1', 'A', { skills: ['p:b'] }))).toEqual([{ id: 'p:b' }])
    expect(agentPlugins(plugins, persona('1', 'A', { plugins: [] }))).toEqual([])
    expect(agentPlugins(plugins, persona('1', 'A', { plugins: ['y'] }))).toEqual([{ name: 'y' }])
  })
})

describe('@mentions', () => {
  it('finds the agent called, by its longest name, without case or accents', () => {
    expect(findMention('@redator escreva um post', team)?.id).toBe('r')
    expect(findMention('Oi @Redator Técnico, explique', team)?.id).toBe('rt')
    expect(findMention('@revisao: confira', team)?.id).toBe('v')
    // Not a mention: inside a word, an e-mail, or a name that goes on.
    expect(findMention('mande para eu@redator.com', team)).toBeUndefined()
    expect(findMention('@Redatores', team)).toBeUndefined()
    expect(findMention('sem menção', team)).toBeUndefined()
  })

  it('suggests agents while typing after @', () => {
    expect(mentionQuery('olá @Red')).toBe('Red')
    expect(mentionQuery('@')).toBe('')
    expect(mentionQuery('eu@red')).toBeNull()
    expect(mentionQuery('sem arroba')).toBeNull()
    expect(mentionMatches('red', team).map((p) => p.id)).toEqual(['r', 'rt'])
    expect(mentionMatches('redator t', team).map((p) => p.id)).toEqual(['rt'])
    expect(mentionMatches('', team).map((p) => p.id)).toEqual(['r', 'rt', 'v'])
    // A finished mention followed by the message suggests nothing.
    expect(mentionMatches('Redator escreva', team)).toEqual([])
  })

  it('puts the chosen name in place of what was typed', () => {
    expect(insertMention('Oi @Red', 7, 'Redator Técnico')).toEqual({ text: 'Oi @Redator Técnico ', caret: 20 })
    expect(insertMention('@r texto', 2, 'Redator')).toEqual({ text: '@Redator texto', caret: 9 })
  })
})

describe('chains', () => {
  it('lists the steps and passes on the previous reply', () => {
    expect(chainSteps('Escreva um post', ['  Revise: {{resposta}} ', ''])).toEqual(['Escreva um post', 'Revise: {{resposta}}'])
    expect(chainSteps('Só um', undefined)).toEqual(['Só um'])
    expect(withReply('Revise: {{ resposta }}', ' Texto \n')).toBe('Revise: Texto')
    // {{resposta}} is not a field to fill in.
    expect(promptFields('Sobre {{tema}}: {{resposta}}')).toEqual(['tema'])
  })
})
