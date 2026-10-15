// Word (.docx) and PowerPoint (.pptx) files written in the browser, for the
// project folder. Both formats are zips of XML parts; fflate writes the zip
// and the parts are built here, so no Office library ships. The documents use
// Office's built-in style names (Title, Heading1…, ListParagraph) so Word,
// LibreOffice and Google Docs show them as headings, lists and tables.

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters other than tab and line breaks are not allowed in XML.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

async function zip(files: Record<string, string>): Promise<Uint8Array> {
  const { strToU8, zipSync } = await import('fflate')
  // [Content_Types].xml goes first, as Office writes it.
  const entries = Object.entries(files).sort(([a], [b]) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0))
  return zipSync(Object.fromEntries(entries.map(([path, text]) => [path, strToU8(text)])), { level: 6 })
}

function coreProps(title: string, date: Date): string {
  const when = date.toISOString().replace(/\.\d+Z$/, 'Z')
  return (
    XML +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title><dc:creator>TSRS</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified>` +
    '</cp:coreProperties>'
  )
}

const PACKAGE_RELS = (main: string) =>
  XML +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/>` +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '</Relationships>'

// --- Markdown -----------------------------------------------------------------

// Inline text: **bold**, *italic* or _italic_, `code`, [text](url) as
// "text (url)". Anything unmatched stays as it is.
export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
}

export function spans(text: string): Span[] {
  const out: Span[] = []
  const re = /\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    if (m[1] ?? m[2]) out.push(...spans(m[1] ?? m[2]).map((s) => ({ ...s, bold: true })))
    else if (m[3] ?? m[4]) out.push(...spans(m[3] ?? m[4]).map((s) => ({ ...s, italic: true })))
    else if (m[5]) out.push({ text: m[5], code: true })
    else out.push({ text: m[6] === m[7] ? m[6] : `${m[6]} (${m[7]})` })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out.filter((s) => s.text)
}

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'item'; ordered: boolean; depth: number; text: string; list: number }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'break' }

function tableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
}

// Markdown read as blocks. Each list gets a number, so numbered lists restart.
export function markdownBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list = 0
  let inList = false
  let topOrdered = false
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      flush()
      const code: string[] = []
      while (++i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i])
      blocks.push({ kind: 'code', text: code.join('\n') })
      inList = false
      continue
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      inList = false
      continue
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (item) {
      flush()
      const ordered = /\d/.test(item[2])
      const depth = Math.min(Math.floor(item[1].replace(/\t/g, '    ').length / 2), 4)
      // A top-level item of the other kind (bullets after numbers) starts a new list.
      if (!inList || (depth === 0 && topOrdered !== ordered)) list++
      if (depth === 0) topOrdered = ordered
      inList = true
      blocks.push({ kind: 'item', ordered, depth, text: item[3], list })
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      flush()
      const rows = [tableRow(line)]
      i++
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(tableRow(lines[++i]))
      blocks.push({ kind: 'table', rows })
      inList = false
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      blocks.push({ kind: 'break' })
      inList = false
      continue
    }
    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote) {
      flush()
      blocks.push({ kind: 'quote', text: quote[1] })
      inList = false
      continue
    }
    if (!line.trim()) {
      flush()
      // A blank line between items keeps the list going; anything else ends it.
      if (inList && !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i + 1] ?? '')) inList = false
      continue
    }
    if (inList && /^\s{2,}\S/.test(line) && blocks.at(-1)?.kind === 'item') {
      const last = blocks.at(-1) as Extract<Block, { kind: 'item' }>
      last.text += ` ${line.trim()}`
      continue
    }
    inList = false
    paragraph.push(line.trim())
  }
  flush()
  return blocks
}

// --- Word -------------------------------------------------------------------

const WORD_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

function wordRuns(text: string, base: { bold?: boolean } = {}): string {
  return spans(text)
    .map((s) => {
      // In the order the schema wants them: fonts, bold, italic, shading.
      const props = [
        s.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '',
        s.bold || base.bold ? '<w:b/>' : '',
        s.italic ? '<w:i/>' : '',
        s.code ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '',
      ].join('')
      return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(s.text)}</w:t></w:r>`
    })
    .join('')
}

function wordParagraph(style: string, runs: string, extra = ''): string {
  return `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${runs}</w:p>`
}

function wordTable(rows: string[][]): string {
  const width = Math.max(...rows.map((r) => r.length))
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`
  const grid = Array(width).fill(`<w:gridCol w:w="${Math.floor(9000 / width)}"/>`).join('')
  const body = rows
    .map((row, r) => {
      const cells = [...row, ...Array(width - row.length).fill('')]
        .map(
          (text) =>
            '<w:tc><w:tcPr>' +
            (r === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '') +
            `</w:tcPr>${wordParagraph('TableText', wordRuns(text, { bold: r === 0 }))}</w:tc>`,
        )
        .join('')
      return `<w:tr>${r === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`
    })
    .join('')
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('') +
    '</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    `<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`
  )
}

function wordStyles(): string {
  const heading = (n: number, size: number, color: string) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/>` +
    `<w:spacing w:before="${n === 1 ? 360 : 240}" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`
  return (
    XML +
    `<w:styles ${WORD_NS}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:uiPriority w:val="10"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr>' +
    '<w:rPr><w:b/><w:color w:val="1F2937"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>' +
    heading(1, 36, '1F3864') +
    heading(2, 30, '2F5496') +
    heading(3, 26, '2F5496') +
    heading(4, 24, '404040') +
    heading(5, 22, '404040') +
    heading(6, 22, '595959') +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>' +
    '<w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BFBFBF"/></w:pBdr><w:ind w:left="567"/></w:pPr>' +
    '<w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr></w:style>' +
    '</w:styles>'
  )
}

function wordNumbering(lists: { id: number; ordered: boolean }[]): string {
  const bullets = ['•', '◦', '▪', '•', '◦']
  const level = (ordered: boolean, ilvl: number) =>
    `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/>` +
    (ordered
      ? `<w:numFmt w:val="${['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter'][ilvl]}"/><w:lvlText w:val="%${ilvl + 1}."/>`
      : `<w:numFmt w:val="bullet"/><w:lvlText w:val="${bullets[ilvl]}"/>`) +
    `<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + ilvl * 360}" w:hanging="360"/></w:pPr>` +
    (ordered ? '' : '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>') +
    '</w:lvl>'
  const abstract = (id: number, ordered: boolean) =>
    `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>` +
    [0, 1, 2, 3, 4].map((i) => level(ordered, i)).join('') +
    '</w:abstractNum>'
  // One numbering instance per list, so each numbered list starts at 1.
  const nums = lists
    .map(
      ({ id, ordered }) =>
        `<w:num w:numId="${id}"><w:abstractNumId w:val="${ordered ? 1 : 0}"/>` +
        (ordered ? '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>' : '') +
        '</w:num>',
    )
    .join('')
  return XML + `<w:numbering ${WORD_NS}>${abstract(0, false)}${abstract(1, true)}${nums}</w:numbering>`
}

export interface WordInput {
  title?: string
  markdown: string
}

export async function wordFile(input: WordInput, date = new Date()): Promise<Uint8Array> {
  const blocks = markdownBlocks(input.markdown)
  // One numbering instance per list and kind: bullets nested in a numbered
  // list keep their bullets.
  const lists = new Map<string, { id: number; ordered: boolean }>()
  const body: string[] = []
  const title = input.title?.trim()
  // A title given apart opens the document, unless the text starts with it.
  const first = blocks[0]
  if (title && !(first?.kind === 'heading' && first.level === 1 && first.text.trim() === title)) {
    body.push(wordParagraph('Title', wordRuns(title)))
  }
  for (const block of blocks) {
    if (block.kind === 'heading') {
      // A single top heading at the start is the document title.
      const asTitle = block === blocks[0] && block.level === 1 && !title
      body.push(wordParagraph(asTitle ? 'Title' : `Heading${block.level}`, wordRuns(block.text)))
    } else if (block.kind === 'paragraph') body.push(wordParagraph('', wordRuns(block.text)))
    else if (block.kind === 'quote') body.push(wordParagraph('Quote', wordRuns(block.text)))
    else if (block.kind === 'item') {
      const key = `${block.list}:${block.ordered}`
      if (!lists.has(key)) lists.set(key, { id: lists.size + 1, ordered: block.ordered })
      body.push(
        wordParagraph(
          'ListParagraph',
          wordRuns(block.text),
          `<w:numPr><w:ilvl w:val="${block.depth}"/><w:numId w:val="${lists.get(key)!.id}"/></w:numPr>`,
        ),
      )
    } else if (block.kind === 'table') {
      body.push(wordTable(block.rows), '<w:p/>')
    } else if (block.kind === 'code') {
      for (const line of block.text.split('\n')) {
        body.push(wordParagraph('Code', `<w:r><w:t xml:space="preserve">${escapeXml(line) || ' '}</w:t></w:r>`))
      }
      body.push('<w:p/>')
    } else {
      body.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr></w:pPr></w:p>')
    }
  }
  if (!body.length) body.push('<w:p/>')
  const document =
    XML +
    `<w:document ${WORD_NS}><w:body>${body.join('')}` +
    // A4 with 2.5 cm margins.
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" ' +
    'w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>'
  const numbering = [...lists.values()]
  return zip({
    '[Content_Types].xml':
      XML +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>',
    '_rels/.rels': PACKAGE_RELS('word/document.xml'),
    'docProps/core.xml': coreProps(title || (first?.kind === 'heading' ? first.text : ''), date),
    'word/_rels/document.xml.rels':
      XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      '</Relationships>',
    'word/document.xml': document,
    'word/styles.xml': wordStyles(),
    'word/numbering.xml': wordNumbering(numbering),
  })
}

// --- PowerPoint ---------------------------------------------------------------

export interface SlideInput {
  title: string
  // One line per bullet; leading spaces (two per level) make sub-bullets.
  bullets?: string[]
  notes?: string
}

export interface PowerPointInput {
  title?: string
  subtitle?: string
  slides: SlideInput[]
  theme?: 'light' | 'dark'
}

const P_NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
// 16:9, in EMU.
const W = 12192000
const H = 6858000

const THEMES = {
  light: { bg: 'FFFFFF', text: '1F2937', muted: '6B7280', accent: 'FF6A13' },
  dark: { bg: '0B0F17', text: 'F5EFE6', muted: 'A7A9B0', accent: 'FF6A13' },
}

function theme(colors: (typeof THEMES)['light'], name: string): string {
  const fill = (alpha = '') => `<a:solidFill><a:schemeClr val="phClr">${alpha}</a:schemeClr></a:solidFill>`
  const line = (w: number) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>`
  return (
    XML +
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${name}"><a:themeElements>` +
    `<a:clrScheme name="${name}">` +
    `<a:dk1><a:srgbClr val="${colors.text === 'F5EFE6' ? '000000' : colors.text}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>` +
    '<a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2>' +
    `<a:accent1><a:srgbClr val="${colors.accent}"/></a:accent1><a:accent2><a:srgbClr val="2F5496"/></a:accent2>` +
    '<a:accent3><a:srgbClr val="16A34A"/></a:accent3><a:accent4><a:srgbClr val="CA8A04"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="7C3AED"/></a:accent5><a:accent6><a:srgbClr val="0891B2"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme>' +
    `<a:fontScheme name="${name}"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    `<a:fmtScheme name="${name}"><a:fillStyleLst>${fill()}${fill('<a:tint val="50000"/>')}${fill('<a:shade val="80000"/>')}</a:fillStyleLst>` +
    `<a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>` +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    `<a:bgFillStyleLst>${fill()}${fill('<a:tint val="95000"/>')}${fill('<a:shade val="90000"/>')}</a:bgFillStyleLst>` +
    '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'
  )
}

const CLR_MAP =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" ' +
  'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'

const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

function shape(id: number, name: string, ph: string, box: [number, number, number, number] | null, body: string): string {
  const xfrm = box ? `<a:xfrm><a:off x="${box[0]}" y="${box[1]}"/><a:ext cx="${box[2]}" cy="${box[3]}"/></a:xfrm>` : ''
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrm}</p:spPr>${body}</p:sp>`
  )
}

function runs(text: string, size?: number): string {
  return spans(text)
    .map((s) => {
      const attrs = [size ? ` sz="${size}"` : '', s.bold ? ' b="1"' : '', s.italic ? ' i="1"' : ''].join('')
      const font = s.code ? '<a:latin typeface="Consolas"/>' : ''
      return `<a:r><a:rPr lang="pt-BR" dirty="0"${attrs}>${font}</a:rPr><a:t>${escapeXml(s.text)}</a:t></a:r>`
    })
    .join('')
}

function textBody(paragraphs: string, anchor = ''): string {
  return `<p:txBody><a:bodyPr${anchor}><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody>`
}

function bulletParagraphs(lines: string[]): string {
  const items = lines.map((line) => {
    const indent = /^\s*/.exec(line)?.[0].replace(/\t/g, '  ').length ?? 0
    return { level: Math.min(Math.floor(indent / 2), 4), text: line.trim().replace(/^([-*+•]|\d+[.)])\s+/, '') }
  })
  const paragraphs = items.filter((i) => i.text).map((i) => `<a:p>${i.level ? `<a:pPr lvl="${i.level}"/>` : ''}${runs(i.text)}</a:p>`)
  return paragraphs.join('') || '<a:p><a:endParaRPr lang="pt-BR"/></a:p>'
}

function master(colors: (typeof THEMES)['light']): string {
  const level = (n: number, size: number) =>
    `<a:lvl${n}pPr marL="${228600 + (n - 1) * 342900}" indent="-228600"><a:spcBef><a:spcPts val="${n === 1 ? 900 : 400}"/></a:spcBef>` +
    `<a:buClr><a:srgbClr val="${colors.accent}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${n === 1 ? '•' : '–'}"/>` +
    `<a:defRPr sz="${size}"><a:solidFill><a:srgbClr val="${n === 1 ? colors.text : colors.muted}"/></a:solidFill></a:defRPr></a:lvl${n}pPr>`
  return (
    XML +
    `<p:sldMaster ${P_NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${colors.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
    `<p:spTree>${GROUP}` +
    shape(2, 'Title', '<p:ph type="title"/>', [609600, 457200, W - 1219200, 1143000], textBody('<a:p><a:endParaRPr lang="pt-BR"/></a:p>', ' anchor="b"')) +
    shape(3, 'Text', '<p:ph type="body" idx="1"/>', [609600, 1828800, W - 1219200, H - 2514600], textBody('<a:p><a:endParaRPr lang="pt-BR"/></a:p>')) +
    // The accent line under the title, on every content slide.
    `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="4" name="Accent"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>` +
    `<a:xfrm><a:off x="609600" y="1645920"/><a:ext cx="914400" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom>` +
    `<a:ln w="38100"><a:solidFill><a:srgbClr val="${colors.accent}"/></a:solidFill></a:ln></p:spPr></p:cxnSp>` +
    `</p:spTree></p:cSld>${CLR_MAP}` +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/></p:sldLayoutIdLst>' +
    '<p:txStyles>' +
    `<p:titleStyle><a:lvl1pPr algn="l"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="3600" b="1">` +
    `<a:solidFill><a:srgbClr val="${colors.text}"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>` +
    `<p:bodyStyle>${level(1, 2400)}${level(2, 2000)}${level(3, 1800)}${level(4, 1600)}${level(5, 1600)}</p:bodyStyle>` +
    `<p:otherStyle><a:defPPr><a:defRPr lang="pt-BR"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>`
  )
}

function layout(type: 'title' | 'obj', name: string, colors: (typeof THEMES)['light']): string {
  const shapes =
    type === 'title'
      ? shape(2, 'Title', '<p:ph type="ctrTitle"/>', [914400, 2133600, W - 1828800, 1371600],
          textBody(`<a:p><a:pPr algn="l"/><a:endParaRPr lang="pt-BR" sz="4800"/></a:p>`, ' anchor="b"')) +
        shape(3, 'Subtitle', '<p:ph type="subTitle" idx="1"/>', [914400, 3657600, W - 1828800, 914400],
          '<p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle><a:lvl1pPr marL="0" indent="0" algn="l"><a:buNone/>' +
          `<a:defRPr sz="2400"><a:solidFill><a:srgbClr val="${colors.muted}"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>` +
          '<a:p><a:endParaRPr lang="pt-BR"/></a:p></p:txBody>')
      : shape(2, 'Title', '<p:ph type="title"/>', null, textBody('<a:p><a:endParaRPr lang="pt-BR"/></a:p>')) +
        shape(3, 'Content', '<p:ph idx="1"/>', null, textBody('<a:p><a:endParaRPr lang="pt-BR"/></a:p>'))
  // The title slide hides the master's accent line.
  return (
    XML +
    `<p:sldLayout ${P_NS} type="${type}" preserve="1"${type === 'title' ? ' showMasterSp="0"' : ''}>` +
    `<p:cSld name="${name}"><p:spTree>${GROUP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  )
}

function notesMaster(): string {
  return (
    XML +
    `<p:notesMaster ${P_NS}><p:cSld><p:spTree>${GROUP}` +
    shape(2, 'Slide Image', '<p:ph type="sldImg" idx="2"/>', [381000, 685800, 6096000, 3429000], '') +
    shape(3, 'Notes', '<p:ph type="body" idx="1"/>', [685800, 4343400, 5486400, 4114800], textBody('<a:p><a:endParaRPr lang="pt-BR"/></a:p>')) +
    `</p:spTree></p:cSld>${CLR_MAP}<p:notesStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle></p:notesMaster>`
  )
}

function rels(list: [string, string][]): string {
  return (
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    list.map(([type, target], i) => `<Relationship Id="rId${i + 1}" Type="${REL}/${type}" Target="${target}"/>`).join('') +
    '</Relationships>'
  )
}

export async function powerPointFile(input: PowerPointInput, date = new Date()): Promise<Uint8Array> {
  const colors = THEMES[input.theme === 'dark' ? 'dark' : 'light']
  const slides: { xml: string; notes?: string }[] = []
  const title = input.title?.trim()
  if (title) {
    slides.push({
      xml:
        shape(2, 'Title', '<p:ph type="ctrTitle"/>', null, textBody(`<a:p>${runs(title)}</a:p>`)) +
        shape(3, 'Subtitle', '<p:ph type="subTitle" idx="1"/>', null, textBody(`<a:p>${input.subtitle?.trim() ? runs(input.subtitle.trim()) : '<a:endParaRPr lang="pt-BR"/>'}</a:p>`)),
    })
  }
  for (const slide of input.slides) {
    slides.push({
      xml:
        shape(2, 'Title', '<p:ph type="title"/>', null, textBody(`<a:p>${runs(slide.title || ' ')}</a:p>`)) +
        shape(3, 'Content', '<p:ph idx="1"/>', null, textBody(bulletParagraphs(slide.bullets ?? []))),
      notes: slide.notes?.trim() || undefined,
    })
  }
  if (!slides.length) throw new Error('A presentation needs at least one slide.')

  const files: Record<string, string> = {}
  const overrides: string[] = []
  const override = (part: string, type: string) =>
    overrides.push(`<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.${type}+xml"/>`)

  slides.forEach((slide, i) => {
    const n = i + 1
    const isTitle = !!title && i === 0
    files[`ppt/slides/slide${n}.xml`] =
      XML + `<p:sld ${P_NS}><p:cSld><p:spTree>${GROUP}${slide.xml}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
    override(`ppt/slides/slide${n}.xml`, 'slide')
    const slideRels: [string, string][] = [['slideLayout', `../slideLayouts/slideLayout${isTitle ? 1 : 2}.xml`]]
    if (slide.notes) {
      slideRels.push(['notesSlide', `../notesSlides/notesSlide${n}.xml`])
      const paragraphs = slide.notes.split(/\n+/).map((line) => `<a:p>${runs(line)}</a:p>`).join('')
      files[`ppt/notesSlides/notesSlide${n}.xml`] =
        XML +
        `<p:notes ${P_NS}><p:cSld><p:spTree>${GROUP}` +
        shape(2, 'Slide Image', '<p:ph type="sldImg"/>', null, '') +
        shape(3, 'Notes', '<p:ph type="body" idx="1"/>', null, textBody(paragraphs)) +
        '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
      files[`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`] = rels([
        ['notesMaster', '../notesMasters/notesMaster1.xml'],
        ['slide', `../slides/slide${n}.xml`],
      ])
      override(`ppt/notesSlides/notesSlide${n}.xml`, 'notesSlide')
    }
    files[`ppt/slides/_rels/slide${n}.xml.rels`] = rels(slideRels)
  })

  const presentationRels: [string, string][] = [
    ['slideMaster', 'slideMasters/slideMaster1.xml'],
    ['theme', 'theme/theme1.xml'],
    ['notesMaster', 'notesMasters/notesMaster1.xml'],
    ...slides.map((_, i): [string, string] => ['slide', `slides/slide${i + 1}.xml`]),
  ]
  files['ppt/presentation.xml'] =
    XML +
    `<p:presentation ${P_NS} saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    '<p:notesMasterIdLst><p:notesMasterId r:id="rId3"/></p:notesMasterIdLst>' +
    `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${4 + i}"/>`).join('')}</p:sldIdLst>` +
    `<p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/>` +
    '<p:defaultTextStyle><a:defPPr><a:defRPr lang="pt-BR"/></a:defPPr></p:defaultTextStyle></p:presentation>'
  files['ppt/_rels/presentation.xml.rels'] = rels(presentationRels)
  files['ppt/slideMasters/slideMaster1.xml'] = master(colors)
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = rels([
    ['slideLayout', '../slideLayouts/slideLayout1.xml'],
    ['slideLayout', '../slideLayouts/slideLayout2.xml'],
    ['theme', '../theme/theme1.xml'],
  ])
  files['ppt/slideLayouts/slideLayout1.xml'] = layout('title', 'Title Slide', colors)
  files['ppt/slideLayouts/slideLayout2.xml'] = layout('obj', 'Title and Content', colors)
  files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = rels([['slideMaster', '../slideMasters/slideMaster1.xml']])
  files['ppt/slideLayouts/_rels/slideLayout2.xml.rels'] = rels([['slideMaster', '../slideMasters/slideMaster1.xml']])
  files['ppt/theme/theme1.xml'] = theme(colors, 'TSRS')
  files['ppt/theme/theme2.xml'] = theme(THEMES.light, 'TSRS Notes')
  files['ppt/notesMasters/notesMaster1.xml'] = notesMaster()
  files['ppt/notesMasters/_rels/notesMaster1.xml.rels'] = rels([['theme', '../theme/theme2.xml']])
  files['docProps/core.xml'] = coreProps(title || input.slides[0]?.title || '', date)
  files['_rels/.rels'] = PACKAGE_RELS('ppt/presentation.xml')

  override('ppt/presentation.xml', 'presentation.main')
  override('ppt/slideMasters/slideMaster1.xml', 'slideMaster')
  override('ppt/slideLayouts/slideLayout1.xml', 'slideLayout')
  override('ppt/slideLayouts/slideLayout2.xml', 'slideLayout')
  override('ppt/notesMasters/notesMaster1.xml', 'notesMaster')
  overrides.push(
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
  )
  files['[Content_Types].xml'] =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    `<Default Extension="xml" ContentType="application/xml"/>${overrides.join('')}</Types>`
  return zip(files)
}
