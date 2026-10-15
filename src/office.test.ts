import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import apresentacao from '../e2e/fixtures/apresentacao.pptx?inline'
import relatorio from '../e2e/fixtures/relatorio.docx?inline'
import { extractText } from './extract'
import { readAttachment } from './files'
import { isOffice, readPowerPoint, readWord } from './office'
import { MAX_UNZIPPED } from './spreadsheet'

// The sample files' bytes, imported by Vite as data URLs. They were written
// by python-docx and python-pptx, which start from Office's own templates.
function bytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0))
}

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
}

const W = 'xmlns:w="w"'
function word(body: string, extra: Record<string, string> = {}): Uint8Array {
  return zip({ 'word/document.xml': `<w:document ${W}><w:body>${body}</w:body></w:document>`, ...extra })
}

describe('readWord', () => {
  it('reads a real document as Markdown: headings, lists and tables', async () => {
    expect(await readWord(bytes(relatorio))).toBe(
      [
        '# Relatório de vendas',
        '# Resumo',
        'O trimestre fechou com R$ 9,30 em vendas & "promoções".',
        '- Café torrado\n- Pão francês',
        '## Detalhes',
        '| Produto | Total |\n| --- | --- |\n| Café | 0,30 |\n| Pão \\| francês | 9,00 |',
        'Fim do relatório.',
      ].join('\n\n'),
    )
  })

  it('knows Portuguese style names, nested lists, breaks and tracked deletions', async () => {
    const text = await readWord(
      word(
        '<w:p><w:pPr><w:pStyle w:val="Ttulo2"/></w:pPr><w:r><w:t>Seção</w:t></w:r></w:p>' +
          '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>um</w:t></w:r></w:p>' +
          '<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr><w:r><w:t>dois</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t xml:space="preserve">linha </w:t><w:br/><w:t>nova</w:t><w:tab/><w:t>fim</w:t></w:r>' +
          '<w:del><w:r><w:delText>apagado</w:delText></w:r></w:del></w:p>' +
          '<w:p/>',
      ),
    )
    expect(text).toBe('## Seção\n\n- um\n  - dois\n\nlinha\nnova\tfim')
  })

  it('adds footnotes at the end, without Word separators', async () => {
    const notes =
      `<w:footnotes ${W}><w:footnote w:id="-1"><w:p><w:r><w:t>sep</w:t></w:r></w:p></w:footnote>` +
      '<w:footnote w:id="1"><w:p><w:r><w:t>Fonte: IBGE.</w:t></w:r></w:p></w:footnote></w:footnotes>'
    const text = await readWord(word('<w:p><w:r><w:t>Texto</w:t></w:r></w:p>', { 'word/footnotes.xml': notes }))
    expect(text).toBe('Texto\n\n---\n[1] Fonte: IBGE.')
  })

  it('refuses a zip that is not a Word file or claims too much', async () => {
    await expect(readWord(zip({ 'a.txt': 'x' }), 'x.docx')).rejects.toThrow('não é um arquivo do Office')
    await expect(readWord(new Uint8Array([1, 2, 3]), 'x.docx')).rejects.toThrow('corrompido')
    const huge = word('<w:p/>')
    // Claim a size past the cap in the central directory entry.
    const view = new DataView(huge.buffer)
    for (let i = huge.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, MAX_UNZIPPED + 1, true)
        break
      }
    }
    await expect(readWord(huge, 'x.docx')).rejects.toThrow('corrompido')
  })
})

describe('readPowerPoint', () => {
  it('reads a real presentation slide by slide, with the notes', async () => {
    expect(await readPowerPoint(bytes(apresentacao))).toBe(
      '## Slide 1\n\nLançamento do TSRS\nOutubro de 2026\n\n' +
        '## Slide 2\n\nVantagens\nTodos os modelos\nSeus dados no seu computador\n\nNotas: Falar do open source.',
    )
  })

  it('follows the order of the presentation, not the file names', async () => {
    const slide = (text: string) => `<p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`
    const text = await readPowerPoint(
      zip({
        'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="1" r:id="rB"/><p:sldId id="2" r:id="rA"/></p:sldIdLst></p:presentation>',
        'ppt/_rels/presentation.xml.rels':
          '<Relationships><Relationship Id="rA" Target="slides/slide1.xml"/><Relationship Id="rB" Target="/ppt/slides/slide2.xml"/></Relationships>',
        'ppt/slides/slide1.xml': slide('primeiro arquivo'),
        'ppt/slides/slide2.xml': slide('mostrado antes &amp; depois'),
      }),
    )
    expect(text).toBe('## Slide 1\n\nmostrado antes & depois\n\n## Slide 2\n\nprimeiro arquivo')
  })
})

describe('Office files as attachments and knowledge', () => {
  it('attaches Word and PowerPoint as Markdown text', async () => {
    const doc = await readAttachment(new File([bytes(relatorio)], 'relatorio.docx'))
    expect(doc).toMatchObject({ kind: 'text', mime: 'text/markdown', name: 'relatorio.docx' })
    expect(doc.data).toContain('# Resumo')
    const deck = await readAttachment(new File([bytes(apresentacao)], 'apresentacao.pptx'))
    expect(deck.data).toContain('## Slide 2')
  })

  it('adds them to a knowledge base and refuses the old formats with a hint', async () => {
    expect(await extractText(new File([bytes(relatorio)], 'relatorio.docx'))).toContain('Fim do relatório.')
    await expect(readAttachment(new File(['x'], 'antigo.doc'))).rejects.toThrow('Salve como .docx ou PDF')
    await expect(readAttachment(new File(['x'], 'antiga.ppt'))).rejects.toThrow('Salve como .pptx ou PDF')
    await expect(extractText(new File(['x'], 'texto.odt'))).rejects.toThrow('Salve como .docx ou PDF')
  })

  it('recognizes the files by name or type', () => {
    expect(isOffice({ name: 'a.DOCX', type: '' })).toBe(true)
    expect(isOffice({ name: 'a.pptx', type: '' })).toBe(true)
    expect(isOffice({ name: 'sem-nome', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(true)
    expect(isOffice({ name: 'a.txt', type: 'text/plain' })).toBe(false)
  })
})
