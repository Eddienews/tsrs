import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import vendas from '../e2e/fixtures/vendas.xlsx?inline'
import { MAX_ROWS, readWorkbook, workbookText } from './spreadsheet'

// The sample workbook's bytes, imported by Vite as a data URL.
function fixture(): Uint8Array<ArrayBuffer> {
  const binary = atob(vendas.split(',')[1])
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

// A workbook made by LibreOffice: dates, formulas, quotes and commas. Its
// "Pago" column was saved as the numbers 1 and 0, as Excel would show it.
const real = fixture()

// A minimal workbook written by hand, for what LibreOffice does not produce.
function workbook(sheet: string, extra: Record<string, string> = {}): Uint8Array {
  const files: Record<string, string> = {
    'xl/workbook.xml':
      '<workbook xmlns:r="r"><sheets><sheet name="Dados &amp; mais" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${sheet}</sheetData></worksheet>`,
    ...extra,
  }
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
}

describe('readWorkbook', () => {
  it('reads a real workbook as Excel shows it', async () => {
    const sheets = await readWorkbook(real)
    expect(sheets.map((s) => s.name)).toEqual(['Vendas', 'Resumo'])
    expect(sheets[0].rows).toEqual([
      ['Produto', 'Data', 'Qtd', 'Preço', 'Total', 'Pago'],
      ['Café, torrado', '2026-10-14', '3', '0.1', '0.3', '1'],
      ['Pão "francês"', '2026-01-02', '12', '0.75', '9', '0'],
    ])
    expect(sheets[1].rows).toEqual([['Total geral', '9.3']])
  })

  it('places cells by reference and keeps inline and rich text', async () => {
    const sheets = await readWorkbook(
      workbook(
        '<row r="1"><c r="B1" t="inlineStr"><is><t>só B</t></is></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>0</v></c><c r="C3" t="str"><v>x</v></c><c r="D3" t="b"><v>1</v></c></row>' +
          '<row r="4"/>',
        {
          'xl/sharedStrings.xml':
            '<sst><si><r><t>ri</t></r><r><t xml:space="preserve">co </t></r><rPh><t>ignore</t></rPh></si></sst>',
        },
      ),
    )
    expect(sheets[0].name).toBe('Dados & mais')
    expect(sheets[0].rows).toEqual([['', 'só B'], [], ['rico ', '', 'x', 'TRUE']])
  })

  it('reads custom date and time formats', async () => {
    const styles =
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/>' +
      '<numFmt numFmtId="165" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts>' +
      '<cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>'
    const sheets = await readWorkbook(
      workbook('<row r="1"><c r="A1" s="1"><v>46309.5</v></c><c r="B1" s="2"><v>1234.5</v></c></row>', {
        'xl/styles.xml': styles,
      }),
    )
    expect(sheets[0].rows).toEqual([['2026-10-14 12:00', '1234.5']])
  })

  it('keeps the first rows of a very long sheet and says how many there are', async () => {
    const rows = Array.from({ length: MAX_ROWS + 10 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`)
    const [sheet] = await readWorkbook(workbook(rows.join('')))
    expect(sheet.rows).toHaveLength(MAX_ROWS)
    expect(workbookText([sheet])).toMatch(new RegExp(`^Sheet "Dados & mais" \\(first ${MAX_ROWS} of ${MAX_ROWS + 10} rows\\):\\n0\\n1\\n`))
  })

  it('refuses files that are not workbooks', async () => {
    await expect(readWorkbook(new Uint8Array([1, 2, 3]))).rejects.toThrow('planilha .xlsx válida')
  })
})

describe('workbookText', () => {
  it('writes each sheet as CSV, quoting where needed', async () => {
    expect(workbookText(await readWorkbook(real))).toBe(
      'Sheet "Vendas" (3 rows):\n' +
        'Produto,Data,Qtd,Preço,Total,Pago\n' +
        '"Café, torrado",2026-10-14,3,0.1,0.3,1\n' +
        '"Pão ""francês""",2026-01-02,12,0.75,9,0\n\n' +
        'Sheet "Resumo" (1 rows):\nTotal geral,9.3',
    )
  })
})
