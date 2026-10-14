import { describe, expect, it } from 'vitest'
import { buildBackup, chatToMarkdown, fileName, parseBackup, readAttachment } from './files'
import type { Chat } from './types'

const chat: Chat = {
  id: 'c1',
  title: 'Título: teste / 1',
  createdAt: 0,
  updatedAt: 5,
  providerId: 'openai',
  model: 'm',
  messages: [
    {
      id: 'u',
      role: 'user',
      content: 'pergunta',
      attachments: [{ id: 'a', name: 'f.png', mime: 'image/png', kind: 'image', data: 'AA' }],
    },
    { id: 'r', role: 'assistant', content: 'resposta', error: 'falhou' },
  ],
}

describe('backup', () => {
  it('round-trips chats and folders', () => {
    const folders = [{ id: 'f1', name: 'Trabalho' }]
    const library = {
      folders,
      personas: [{ id: 'p', name: 'Revisor', system: 'Revise.' }],
      prompts: [{ id: 's', title: 'Resumo', text: 'Resuma:' }],
      memories: [{ id: 'm', text: 'Usa Linux', createdAt: 1 }],
    }
    expect(parseBackup(buildBackup([chat], library))).toEqual({ chats: [chat], ...library })
  })

  it('rejects files that are not a TSRS backup', () => {
    expect(() => parseBackup('nope')).toThrow('JSON válido')
    expect(() => parseBackup('{"app":"other","chats":[]}')).toThrow('backup do TSRS')
    expect(() => parseBackup('{"app":"tsrs","version":99,"chats":[]}')).toThrow('mais nova')
  })

  it('drops malformed entries', () => {
    const text = JSON.stringify({ app: 'tsrs', version: 1, chats: [chat, { id: 1 }, null] })
    expect(parseBackup(text)).toEqual({
      chats: [chat],
      folders: [],
      personas: [],
      prompts: [],
      memories: [],
    })
  })
})

describe('markdown export', () => {
  it('lists turns, attachments and errors', () => {
    const markdown = chatToMarkdown(chat)
    expect(markdown).toContain('# Título: teste / 1')
    expect(markdown).toContain('## Você\n\npergunta\n\n_Anexos: f.png_')
    expect(markdown).toContain('## Assistente\n\nresposta\n\n> Erro: falhou')
  })

  it('builds a safe file name', () => {
    expect(fileName('Título: teste / 1', 'md')).toBe('Título-teste-1.md')
    expect(fileName('///', 'md')).toBe('conversa.md')
  })
})

describe('readAttachment', () => {
  it('classifies images, PDFs and text', async () => {
    const image = await readAttachment(new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }))
    expect(image).toMatchObject({ kind: 'image', mime: 'image/png', data: 'AQID' })
    const pdf = await readAttachment(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }))
    expect(pdf.kind).toBe('pdf')
    const text = await readAttachment(new File(['olá'], 'a.md'))
    expect(text).toMatchObject({ kind: 'text', data: 'olá', mime: 'text/plain' })
  })

  it('rejects other binary files', async () => {
    const binary = new File([new Uint8Array([0, 1, 0])], 'a.bin')
    await expect(readAttachment(binary)).rejects.toThrow('não é imagem')
  })
})
