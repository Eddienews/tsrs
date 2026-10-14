import { t } from './i18n'
import { isOtherSpreadsheet, isSpreadsheet, otherSpreadsheet, spreadsheetText } from './spreadsheet'

// Text of a file added to a knowledge base: PDFs through pdf.js, HTML without
// its markup, and anything else that reads as text.

export const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024

async function pdfText(file: File): Promise<string> {
  const [pdfjs, { default: worker }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pages: string[] = []
  try {
    const pdf = await task.promise
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent()
      let page = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        page += item.str + (item.hasEOL ? '\n' : ' ')
      }
      pages.push(page.replace(/[ \t]+\n/g, '\n').trim())
    }
  } finally {
    await task.destroy()
  }
  // A blank line between pages keeps a page's text out of the next passage.
  return pages.filter(Boolean).join('\n\n')
}

function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, noscript').forEach((node) => node.remove())
  const blocks = doc.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, pre, td, blockquote')
  // Paragraph breaks keep passages from running headings into body text.
  blocks.forEach((node) => node.append('\n\n'))
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(t('"{name}" passa de 30 MB.', { name: file.name }))
  }
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    const text = await pdfText(file)
    if (!text) {
      throw new Error(t('"{name}" não tem texto que dê para ler (talvez seja só imagem).', { name: file.name }))
    }
    return text
  }
  if (isSpreadsheet(file)) return spreadsheetText(file)
  if (isOtherSpreadsheet(file.name)) throw new Error(otherSpreadsheet(file.name))
  const text = await file.text()
  if (text.includes('\u0000')) {
    throw new Error(t('"{name}" não é PDF nem texto.', { name: file.name }))
  }
  return file.type === 'text/html' || /\.html?$/.test(name) ? htmlText(text) : text
}
