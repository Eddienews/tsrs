import { describe, expect, it } from 'vitest'
import { noteContent, noteName, vaultFolder } from './obsidian'

describe('Obsidian notes', () => {
  it('puts the notes in a folder of the vault, with its own separators', () => {
    expect(vaultFolder('C:\\Users\\eddie\\Cofre\\', 'TSRS')).toBe('C:\\Users\\eddie\\Cofre\\TSRS')
    expect(vaultFolder('/home/eddie/Cofre', '/IA/TSRS/')).toBe('/home/eddie/Cofre/IA/TSRS')
    expect(vaultFolder('/home/eddie/Cofre', '')).toBe('/home/eddie/Cofre')
  })

  it('names the note after the conversation, without characters that break links', () => {
    expect(noteName('Roteiro: Milo #4 [final]?')).toBe('Roteiro Milo 4 final.md')
    expect(noteName('...')).toBe('TSRS.md')
  })

  it('writes the details as properties above the conversation', () => {
    const note = noteContent({
      id: 'c1',
      title: 'Sinopse',
      createdAt: Date.UTC(2026, 9, 25, 5),
      updatedAt: Date.UTC(2026, 9, 25, 6),
      providerId: 'anthropic',
      model: 'claude-opus-5-5',
      tags: ['milo', 'roteiro final'],
      messages: [{ id: 'm', role: 'user', content: 'Oi' }],
    })
    expect(note.startsWith(
      '---\ntsrs: "c1"\ncreated: 2026-10-25T05:00:00.000Z\nupdated: 2026-10-25T06:00:00.000Z\n' +
        'model: "claude-opus-5-5"\ntags: ["tsrs", "milo", "roteiro-final"]\n---\n\n# Sinopse',
    )).toBe(true)
    expect(note).toContain('Oi')
  })
})
