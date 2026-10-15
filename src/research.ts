import type { Source } from './types'

// Told to the model for a deep research request: several rounds of searching
// and reading, then a report with its sources.
export const RESEARCH_NOTE =
  'This is a deep research request. Work in rounds before answering: break the question into ' +
  'sub-questions, run focused web searches for each (usually 5 to 15 searches in all), read the ' +
  'most relevant pages in full (at least 5 different sources when they exist), compare what ' +
  'they say and search again where they disagree or leave gaps. Prefer primary and recent ' +
  'sources and note their dates. Then write the report in the language of the request: a short ' +
  'summary first, then the findings in sections with each claim cited as [n], what is ' +
  'uncertain or disputed, and a numbered "Sources" list with titles and addresses. Never ' +
  'present a figure, date or quote you did not find in a source.'

// How many rounds of tool calls a research reply may take.
export const RESEARCH_ROUNDS = 40

// A file name for the report, from the question.
export function reportName(question: string, date: Date): string {
  const slug = question
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
  const day = date.toISOString().slice(0, 10)
  return `pesquisas/${day}-${slug || 'pesquisa'}.md`
}

// The report as a Markdown file: the question, the answer and every page the
// research found or read, even those the text does not cite.
export function reportFile(question: string, report: string, sources: Source[], model: string, date: Date): string {
  const list = sources.map((s, i) => `${i + 1}. [${s.title || s.url}](${s.url})`).join('\n')
  return [
    `# ${question.split('\n')[0].slice(0, 120)}`,
    '',
    `Pesquisa profunda feita pelo TSRS em ${date.toLocaleString('pt-BR')} com ${model}.`,
    '',
    '## Pergunta',
    '',
    question.trim(),
    '',
    '## Relatório',
    '',
    report.trim(),
    '',
    ...(list ? ['## Páginas consultadas', '', list, ''] : []),
  ].join('\n')
}
