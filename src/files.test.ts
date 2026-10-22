import { describe, expect, it } from 'vitest'
import vendas from '../e2e/fixtures/vendas.xlsx?inline'
import { buildBackup, chatToMarkdown, fileName, MAX_ATTACHMENT_BYTES, parseBackup, readAttachment } from './files'
import type { Chat } from './types'

// The sample workbook's bytes, imported by Vite as a data URL.
function fixture(): Uint8Array<ArrayBuffer> {
  const binary = atob(vendas.split(',')[1])
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

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
  it('round-trips chats, the library and knowledge documents', () => {
    const backup = {
      chats: [chat],
      folders: [{ id: 'f1', name: 'Trabalho' }],
      personas: [{ id: 'p', name: 'Revisor', system: 'Revise.' }],
      prompts: [{ id: 's', title: 'Resumo', text: 'Resuma:' }],
      memories: [{ id: 'm', text: 'Usa Linux', createdAt: 1 }],
      knowledgeBases: [{ id: 'k', name: 'Manuais' }],
      docs: [{ id: 'd', baseId: 'k', name: 'a.md', addedAt: 1, size: 5, chunks: ['Texto'] }],
    }
    expect(parseBackup(buildBackup(backup))).toEqual(backup)
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
      knowledgeBases: [],
      docs: [],
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

  it('reads Excel workbooks as CSV and refuses older spreadsheet formats', async () => {
    const xlsx = new File([fixture()], 'vendas.xlsx')
    const sheet = await readAttachment(xlsx)
    expect(sheet).toMatchObject({ kind: 'text', mime: 'text/csv', name: 'vendas.xlsx' })
    expect(sheet.data).toContain('"Café, torrado",2026-10-14,3,0.1,0.3,1')
    await expect(readAttachment(new File(['x'], 'antiga.xls'))).rejects.toThrow('Salve como .xlsx ou CSV')
  })

  it('rejects other binary files', async () => {
    const binary = new File([new Uint8Array([0, 1, 0])], 'a.bin')
    await expect(readAttachment(binary)).rejects.toThrow('não é imagem')
  })

  it('makes a photo past 10 MB smaller instead of refusing it', async () => {
    const big = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'folha.personagem.png', { type: 'image/png' })
    const sides: number[] = []
    // 3072 px is still too large; 2048 px fits.
    const resize = async (_: Blob, side: number) => {
      sides.push(side)
      return new Blob([new Uint8Array(side === 3072 ? MAX_ATTACHMENT_BYTES + 1 : 3)], { type: 'image/jpeg' })
    }
    const image = await readAttachment(big, resize)
    expect(sides).toEqual([3072, 2048])
    expect(image).toMatchObject({ name: 'folha.personagem.jpg', mime: 'image/jpeg', kind: 'image', data: 'AAAA' })
    // Never small enough, a resize that fails, a GIF and a PDF: refused as before.
    const huge = async () => new Blob([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], { type: 'image/jpeg' })
    await expect(readAttachment(big, huge)).rejects.toThrow('passa de 10 MB')
    await expect(readAttachment(big, () => Promise.reject(new Error('decode')))).rejects.toThrow('passa de 10 MB')
    const gif = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'a.gif', { type: 'image/gif' })
    await expect(readAttachment(gif, resize)).rejects.toThrow('passa de 10 MB')
    const pdf = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'a.pdf', { type: 'application/pdf' })
    await expect(readAttachment(pdf, resize)).rejects.toThrow('passa de 10 MB')
  })
})
