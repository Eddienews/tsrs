import { t } from './i18n'
import { decodeXml } from './xml'

// Excel workbooks (.xlsx) read in the browser and turned into text: one CSV
// block per sheet, with the values as Excel shows them (dates as dates, the
// results of formulas). An .xlsx file is a zip of XML parts; fflate opens it
// and the few parts needed are read here, so no spreadsheet library ships.

// Rows sent per sheet; past this the text is cut and says so.
export const MAX_ROWS = 5000
// Excel's last column, XFD.
const MAX_COLUMNS = 16384
// What the XML parts may add up to once unzipped. A zip can claim any size;
// fflate stops at the claimed one, so capping the claims caps the memory.
export const MAX_UNZIPPED = 200 * 1024 * 1024

export function isSpreadsheet(file: { name: string; type: string }): boolean {
  return (
    /\.xls[xm]$/i.test(file.name) ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

// Older or other spreadsheet formats, refused with a hint instead of being
// read as garbled text.
export function isOtherSpreadsheet(name: string): boolean {
  return /\.(xls|xlsb|ods|numbers)$/i.test(name)
}

export function otherSpreadsheet(name: string): string {
  return t('"{name}" é uma planilha num formato que o TSRS não lê. Salve como .xlsx ou CSV.', { name })
}

export interface Sheet {
  name: string
  rows: string[][]
  // Rows the sheet has, when more than were kept.
  total?: number
}


function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return match ? decodeXml(match[1]) : undefined
}

// The text of a string item: its <t> runs, leaving out phonetic guides.
function textOf(xml: string): string {
  const visible = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let text = ''
  for (const [, inner] of visible.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += decodeXml(inner)
  return text
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => textOf(m[1] ?? ''))
}

// Built-in number formats that show a date or a time.
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

// For each cell style, whether it shows the number as a date or time.
function dateStyles(xml: string | undefined): boolean[] {
  if (!xml) return []
  const custom = new Map<number, string>()
  for (const [tag] of xml.matchAll(/<numFmt\s[^>]*>/g)) {
    custom.set(Number(attr(tag, 'numFmtId')), attr(tag, 'formatCode') ?? '')
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? ''
  return [...cellXfs.matchAll(/<xf\s[^>]*>/g)].map(([tag]) => {
    const id = Number(attr(tag, 'numFmtId') ?? 0)
    if (DATE_FORMATS.has(id)) return true
    const code = custom.get(id)
    if (!code) return false
    // Quoted text and [colors] or [$-locale] say nothing about dates.
    const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
    return /[dmyhs]/i.test(bare)
  })
}

// Excel counts days from 1899-12-30; whole days are shown as a date, the
// rest with the time too.
function excelDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000)
  const iso = new Date(ms).toISOString()
  return serial % 1 === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

// A broken or hostile file, refused with one message.
function invalid(): Error {
  return new Error(t('O arquivo não é uma planilha .xlsx válida.'))
}

// The column of a reference such as AB12, counted from 0.
function column(ref: string): number {
  const letters = /^([A-Z]{1,3})\d*$/.exec(ref)?.[1]
  if (!letters) throw invalid()
  let n = 0
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64
  if (n > MAX_COLUMNS) throw invalid()
  return n - 1
}

function readSheet(xml: string, strings: string[], dates: boolean[]): { rows: string[][]; total: number } {
  const rows: string[][] = []
  let total = 0
  for (const [, rowTag, body] of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    if (body === undefined) continue
    const index = Number(attr(rowTag ?? '', 'r') ?? rows.length + 1) - 1
    if (!Number.isInteger(index) || index < 0) throw invalid()
    total = Math.max(total, index + 1)
    if (index >= MAX_ROWS) continue
    const cells: string[] = []
    let next = 0
    for (const [, cellTag, inner = ''] of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cellTag, 'r')
      const at = ref ? column(ref) : next
      if (at >= MAX_COLUMNS) throw invalid()
      next = at + 1
      const type = attr(cellTag, 't')
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      let value = ''
      if (type === 's') value = strings[Number(raw)] ?? ''
      else if (type === 'inlineStr') value = textOf(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '')
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
      else if (raw !== undefined) {
        const text = decodeXml(raw)
        const number = Number(text)
        if (type === 'str' || type === 'e' || text === '' || Number.isNaN(number)) value = text
        else if (dates[Number(attr(cellTag, 's') ?? 0)]) value = excelDate(number)
        // Fifteen digits, as Excel shows them: 0.1 + 0.2 reads 0.3.
        else value = String(Number(number.toPrecision(15)))
      }
      cells[at] = value
    }
    rows[index] = Array.from(cells, (v) => v ?? '')
  }
  // Rows left empty in the middle stay, as blank lines; trailing ones go.
  const kept = Array.from(rows, (r) => r ?? [])
  while (kept.length && kept.at(-1)!.every((v) => !v)) kept.pop()
  return { rows: kept, total }
}

// Where each sheet's XML is, in the workbook's order.
function sheetParts(files: Record<string, string>): { name: string; path: string }[] {
  const workbook = files['xl/workbook.xml'] ?? ''
  const rels = files['xl/_rels/workbook.xml.rels'] ?? ''
  const targets = new Map<string, string>()
  for (const [tag] of rels.matchAll(/<Relationship\s[^>]*>/g)) {
    const target = attr(tag, 'Target') ?? ''
    targets.set(attr(tag, 'Id') ?? '', target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }
  return [...workbook.matchAll(/<sheet\s[^>]*>/g)].map(([tag]) => ({
    name: attr(tag, 'name') ?? '',
    path: targets.get(attr(tag, 'r:id') ?? '') ?? '',
  }))
}

export async function readWorkbook(bytes: Uint8Array): Promise<Sheet[]> {
  const { strFromU8, unzipSync } = await import('fflate')
  let zip: Record<string, Uint8Array>
  let unzipped = 0
  try {
    zip = unzipSync(bytes, {
      filter: (file) => {
        if (!file.name.endsWith('.xml') && !file.name.endsWith('.rels')) return false
        unzipped += file.originalSize
        if (unzipped > MAX_UNZIPPED) throw invalid()
        return true
      },
    })
  } catch {
    throw invalid()
  }
  const files: Record<string, string> = {}
  for (const [name, data] of Object.entries(zip)) files[name] = strFromU8(data)
  if (!files['xl/workbook.xml']) throw invalid()
  const strings = sharedStrings(files['xl/sharedStrings.xml'])
  const dates = dateStyles(files['xl/styles.xml'])
  return sheetParts(files)
    .filter((part) => files[part.path])
    .map((part) => {
      const { rows, total } = readSheet(files[part.path], strings, dates)
      return { name: part.name, rows, ...(total > MAX_ROWS ? { total } : {}) }
    })
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

// The workbook as text for the model: each sheet named, then its rows as CSV.
export function workbookText(sheets: Sheet[]): string {
  return sheets
    .filter((sheet) => sheet.rows.length)
    .map((sheet) => {
      const kept = sheet.total
        ? `first ${MAX_ROWS} of ${sheet.total} rows`
        : `${sheet.rows.length} rows`
      const csv = sheet.rows.map((row) => row.map(csvCell).join(',')).join('\n')
      return `Sheet "${sheet.name}" (${kept}):\n${csv}`
    })
    .join('\n\n')
}

// The text of a workbook file, or an error a person can act on.
export async function spreadsheetText(file: File): Promise<string> {
  const text = workbookText(await readWorkbook(new Uint8Array(await file.arrayBuffer())))
  if (!text) throw new Error(t('"{name}" não tem nenhuma célula preenchida.', { name: file.name }))
  return text
}
