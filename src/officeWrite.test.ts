import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { readPowerPoint, readWord } from './office'
import { markdownBlocks, powerPointFile, spans, wordFile } from './officeWrite'

// Tags open and close in order and every & starts an entity: enough to know
// the XML parses, without a DOM in the tests.
function wellFormed(xml: string): boolean {
  const stack: string[] = []
  for (const [, close, name, self] of xml.replace(/^<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w:]+)(?:\s[^<>]*?)?(\/?)>/g)) {
    if (self) continue
    if (!close) stack.push(name)
    else if (stack.pop() !== name) return false
  }
  return !stack.length && !/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(xml) && !/<(?![\w/?!])/.test(xml)
}

const parts = (bytes: Uint8Array) =>
  Object.fromEntries(Object.entries(unzipSync(bytes)).map(([path, data]) => [path, strFromU8(data)]))

describe('Markdown for Office files', () => {
  it('has a checker that catches broken XML', () => {
    expect(wellFormed('<a><b/><c x="1">&amp;</c></a>')).toBe(true)
    expect(wellFormed('<a><b></a>')).toBe(false)
    expect(wellFormed('<a>R & D</a>')).toBe(false)
  })

  it('reads inline bold, italic, code and links', () => {
    expect(spans('um **dois** *três* `quatro` [site](https://x.dev) a_b_c')).toEqual([
      { text: 'um ' },
      { text: 'dois', bold: true },
      { text: ' ' },
      { text: 'três', italic: true },
      { text: ' ' },
      { text: 'quatro', code: true },
      { text: ' ' },
      { text: 'site (https://x.dev)' },
      { text: ' a_b_c' },
    ])
  })

  it('splits blocks, numbering each list apart', () => {
    const blocks = markdownBlocks('# T\n\n1. a\n2. b\n   - b1\n\n- solto\n\ntexto\ncontinua\n\n1. de novo')
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'T' },
      { kind: 'item', ordered: true, depth: 0, text: 'a', list: 1 },
      { kind: 'item', ordered: true, depth: 0, text: 'b', list: 1 },
      { kind: 'item', ordered: false, depth: 1, text: 'b1', list: 1 },
      { kind: 'item', ordered: false, depth: 0, text: 'solto', list: 2 },
      { kind: 'paragraph', text: 'texto continua' },
      { kind: 'item', ordered: true, depth: 0, text: 'de novo', list: 3 },
    ])
  })

  it('reads tables, quotes, rules and code', () => {
    expect(markdownBlocks('| A | B \\| C |\n|---|---|\n| 1 | 2 |\n\n> nota\n\n---\n\n```\nx < y\n```')).toEqual([
      { kind: 'table', rows: [['A', 'B | C'], ['1', '2']] },
      { kind: 'quote', text: 'nota' },
      { kind: 'break' },
      { kind: 'code', text: 'x < y' },
    ])
  })
})

describe('wordFile', () => {
  const markdown = '# Proposta & cia\n\nTexto com **negrito** e <tags>.\n\n## Escopo\n\n1. Site\n   - Páginas\n2. Blog\n\n| Item | Valor |\n|---|---|\n| Site | R$ 1 |'

  it('writes a document Word reads back as the same Markdown', async () => {
    const bytes = await wordFile({ markdown }, new Date('2026-10-15T12:00:00Z'))
    expect(await readWord(bytes)).toBe(
      '# Proposta & cia\n\nTexto com negrito e <tags>.\n\n## Escopo\n\n- Site\n  - Páginas\n- Blog\n\n| Item | Valor |\n| --- | --- |\n| Site | R$ 1 |',
    )
  })

  it('declares every part and keeps the XML well formed', async () => {
    const files = parts(await wordFile({ title: 'Título <1>', markdown: '1. a\n\n- b\n\n1. c' }, new Date('2026-10-15T12:00:00Z')))
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'word/_rels/document.xml.rels',
      'word/document.xml',
      'word/numbering.xml',
      'word/styles.xml',
    ])
    for (const [path, xml] of Object.entries(files)) {
      expect(wellFormed(xml), path).toBe(true)
    }
    expect(files['docProps/core.xml']).toContain('<dc:title>Título &lt;1&gt;</dc:title>')
    expect(files['word/document.xml']).toContain('<w:pStyle w:val="Title"/>')
    // Three lists, each with its own numbering; the numbered ones restart at 1.
    expect(files['word/numbering.xml'].match(/<w:num w:numId/g)).toHaveLength(3)
    expect(files['word/numbering.xml'].match(/<w:startOverride w:val="1"\/>/g)).toHaveLength(2)
  })
})

describe('powerPointFile', () => {
  const deck = {
    title: 'Lançamento',
    subtitle: 'Outubro & 2026',
    slides: [
      { title: 'Vantagens', bullets: ['Todos os modelos', '  Com as **suas** chaves'], notes: 'Falar devagar.' },
      { title: 'Próximos passos', bullets: ['- Agentes', '2. Voz local'] },
    ],
  }

  it('writes slides PowerPoint reads back in order, with notes', async () => {
    expect(await readPowerPoint(await powerPointFile(deck))).toBe(
      '## Slide 1\n\nLançamento\nOutubro & 2026\n\n' +
        '## Slide 2\n\nVantagens\nTodos os modelos\nCom as suas chaves\n\nNotas: Falar devagar.\n\n' +
        '## Slide 3\n\nPróximos passos\nAgentes\nVoz local',
    )
  })

  it('declares every part, nests sub-bullets and keeps the XML well formed', async () => {
    const files = parts(await powerPointFile({ ...deck, theme: 'dark' }))
    const types = files['[Content_Types].xml']
    for (const path of Object.keys(files).filter((p) => p.endsWith('.xml') && p !== '[Content_Types].xml' && !p.includes('_rels'))) {
      expect(types, path).toContain(`PartName="/${path}"`)
      expect(wellFormed(files[path]), path).toBe(true)
    }
    expect(files['ppt/slides/slide2.xml']).toContain('<a:pPr lvl="1"/>')
    expect(files['ppt/slides/slide2.xml']).toContain('b="1"')
    expect(files['ppt/slides/_rels/slide2.xml.rels']).toContain('notesSlide2.xml')
    expect(files['ppt/slides/_rels/slide3.xml.rels']).not.toContain('notesSlide')
    expect(files['ppt/slideMasters/slideMaster1.xml']).toContain('<a:srgbClr val="0B0F17"/>')
    expect(files['ppt/presentation.xml']).toContain('<p:sldSz cx="12192000" cy="6858000"/>')
  })

  it('needs at least one slide', async () => {
    await expect(powerPointFile({ slides: [] })).rejects.toThrow('at least one slide')
  })
})
