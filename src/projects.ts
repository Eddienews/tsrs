import { base64 } from './files'
import { language, locale, t } from './i18n'
import { readPowerPoint, readWord } from './office'
import type { ToolCall, ToolDef, ToolResult } from './stream'
import type { ChatProject } from './types'

// The project folders of the TSRS server (server/projects.mjs): the files a
// conversation makes are saved there as real files.
export const PROJECTS = '/__tsrs/projects'

export interface SavedFile {
  name: string
  content: string
  // Generated images, audio and video travel as base64.
  encoding?: 'base64'
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROJECTS}${path}`, init)
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    // A TSRS served without the project folders answers with its page.
  }
  if (!res.ok || !json) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json as T
}

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// Where projects go, or null when this TSRS cannot save files (a static build).
export async function projectsRoot(): Promise<string | null> {
  try {
    return (await call<{ ok: boolean; root: string }>('/health')).root
  } catch {
    return null
  }
}

export function openProject(job: { name?: string; path?: string; notes?: string }) {
  return post<ChatProject>('/open', job.notes ? { ...job, notesName: notesName() } : job)
}

export async function saveFiles(
  project: string,
  files: (SavedFile & { append?: boolean })[],
): Promise<string[]> {
  return (await post<{ written: string[] }>('/write', { path: project, files })).written
}

export async function copyFiles(from: string, to: string): Promise<string[]> {
  return (await post<{ copied: string[] }>('/copy', { from, to })).copied
}

export async function listFiles(project: string) {
  const query = new URLSearchParams({ path: project })
  return (await call<{ files: { name: string; size: number; modified: number }[] }>(`/list?${query}`)).files
}

// Replaces a piece of a text file, in the folder itself (server/projects.mjs editText).
export async function editFile(
  project: string,
  file: string,
  old: string,
  next: string,
  all = false,
): Promise<{ replaced: number; size: number }> {
  return post('/edit', { path: project, file, old, new: next, all })
}

export async function readFile(project: string, file: string): Promise<string> {
  const query = new URLSearchParams({ path: project, file })
  return (await call<{ content: string }>(`/read?${query}`)).content
}

function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// A file of the folder as the user's file manager writes it: Windows folders
// get backslashes throughout.
export function pathIn(folder: string, file: string): string {
  const windows = /^[A-Za-z]:[\\/]|\\/.test(folder)
  const sep = windows ? '\\' : '/'
  const parts = file.split('/').filter(Boolean)
  const base = folder.replace(/[\\/]+$/, '')
  return [windows ? base.replace(/\//g, '\\') : base, ...parts].join(sep)
}

// The address the preview opens a project file at.
export function fileUrl(project: string, file: string): string {
  const path = file.split('/').map(encodeURIComponent).join('/')
  return new URL(`${PROJECTS}/raw/${base64url(project)}/${path}`, location.href).href
}

// Code that becomes a file when there is no name for it.
const DEFAULT_NAMES: Record<string, string> = {
  html: 'index.html',
  css: 'styles.css',
  js: 'script.js',
  javascript: 'script.js',
  jsx: 'App.jsx',
  react: 'App.jsx',
  tsx: 'App.tsx',
  ts: 'main.ts',
  typescript: 'main.ts',
  svg: 'imagem.svg',
  motion: 'motion.html',
  json: 'dados.json',
}

const FENCE = /^(`{3,})([\w-]+)([^\n]*)\n([\s\S]*?)\n\1[ \t]*$/gm

// A file name written after the language: ```html index.html, or
// title="index.html", file=…, path=…
export function fenceName(info: string): string | null {
  const text = info.trim()
  if (!text) return null
  const keyed = /(?:title|file|filename|path|name)\s*=\s*"?([^"\s]+)"?/i.exec(text)
  const name = keyed?.[1] ?? text.split(/\s+/)[0]
  return /^[\w./-]+\.[A-Za-z0-9]+$/.test(name) && !name.split('/').includes('..') ? name : null
}

// The files a reply carries: blocks that name their file, and blocks of the
// kinds that are files on their own (a page, its styles, a script, a motion
// video). The last block with a name wins, as the newest version of it.
// `onlyNamed` keeps only the blocks that name their file: when the reply also
// saved files with the project tools, an unnamed block is a copy of one of
// them, not a file of its own.
export function filesFromReply(markdown: string, onlyNamed = false): SavedFile[] {
  const blocks = [...markdown.matchAll(FENCE)].map((m) => ({
    lang: m[2].toLowerCase(),
    named: fenceName(m[3]),
    code: m[4],
  }))
  // A snippet in an explanation is not a project: unnamed code becomes a file
  // only as a whole page, drawing or video, or beside one.
  const whole = (b: (typeof blocks)[number]) =>
    (b.lang === 'html' && /<html[\s>]|<!doctype/i.test(b.code)) ||
    (b.lang === 'svg' && /^\s*<svg[\s>]/i.test(b.code)) ||
    b.lang === 'motion'
  const page = blocks.some((b) => b.named || whole(b))
  const files = new Map<string, string>()
  for (const block of blocks) {
    const name = block.named ?? (!onlyNamed && (whole(block) || page) ? DEFAULT_NAMES[block.lang] : undefined)
    if (name) files.set(name, block.code)
  }
  return [...files].map(([name, content]) => ({ name, content }))
}

// The project's notes file, named in the interface language: NOTAS.md or NOTES.md.
export function notesName(): string {
  return language() === 'en' ? 'NOTES.md' : 'NOTAS.md'
}

// The notes a new project starts with, so whoever carries on (TSRS, Claude
// Code, Codex) knows what it is for.
export function projectNotes(title: string, request: string, date: Date): string {
  return [
    `# ${title}`,
    '',
    t('Projeto criado pelo TSRS em {date}.', { date: date.toLocaleString(locale()) }),
    '',
    `## ${t('Pedido')}`,
    '',
    request.trim(),
    '',
    `## ${t('Como continuar')}`,
    '',
    t('Os arquivos desta pasta são a versão atual. Pode editar aqui com qualquer ferramenta (Claude Code, Codex, um editor); o TSRS lê a versão atual ao voltar à conversa.'),
    '',
    `## ${t('Histórico')}`,
    '',
  ].join('\n')
}

export function historyLine(files: string[], who: string, date: Date): string {
  return `- ${date.toLocaleString(locale())} · ${files.join(', ')} · ${who}\n`
}

// Where a file the user attached is kept in the project: midia/<its name>,
// never over a file already there (logo.png, logo-2.png…).
export function mediaName(name: string, taken: Set<string>): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[:*?"<>|\u0000-\u001f]/g, '-').trim() || 'arquivo'
  const dot = base.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, '']
  let candidate = `midia/${base}`
  for (let n = 2; taken.has(candidate); n++) candidate = `midia/${stem}-${n}${ext}`
  return candidate
}

// Soundtracks in the folder's midia/ (a kit's track, one the user saved there),
// offered to a motion video beside the conversation's own audio.
const AUDIO_FILE = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/i
const AUDIO_MIME: Record<string, string> = { wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac' }

export function audioInMedia(files: { name: string; size: number }[]): string[] {
  return files.filter((f) => f.name.startsWith('midia/') && AUDIO_FILE.test(f.name) && f.size < 60 * 1024 * 1024).map((f) => f.name)
}

export async function projectTracks(project: string): Promise<{ id: string; name: string; mime: string; data: string }[]> {
  const names = audioInMedia(await listFiles(project))
  return Promise.all(
    names.map(async (name) => {
      const blob = await (await fetch(fileUrl(project, name))).blob()
      const ext = name.split('.').pop()!.toLowerCase()
      return { id: `project:${name}`, name: name.split('/').pop()!, mime: AUDIO_MIME[ext] ?? 'audio/mpeg', data: await base64(blob) }
    }),
  )
}

// Told to the model while the folder has media: what there is and how to use it.
export function mediaNote(files: string[]): string {
  const media = files.filter((f) => f.startsWith('midia/')).sort()
  if (!media.length) return ''
  const shown = media.slice(0, 60)
  return (
    `Files in the project's midia/ folder (images, audio and other files the user attached or a kit brought):\n` +
    shown.map((f) => `- ${f}`).join('\n') +
    (media.length > shown.length ? `\n- … and ${media.length - shown.length} more` : '') +
    '\nPages and motion compositions in this folder can use them by that relative path ' +
    '(src="midia/logo.png", url(midia/font.woff2)): the preview and the MP4 renderer find them. ' +
    'Use the real file; do not redraw a logo or an image the user gave.'
  )
}

// Told to the model while the conversation has a project folder.
export function projectNote(project: ChatProject): string {
  return (
    `This conversation has a project folder on the user's computer: ${project.path}. ` +
    'Its files are the current version of the work and may have been changed outside this ' +
    'chat (by the user, Claude Code, Codex…), so read a file with project_read_file before ' +
    'changing it. To change part of a file, use project_edit_file with the exact text to ' +
    'replace: it is far cheaper than writing the whole file again, and fails safely when the ' +
    'file changed. Write complete files with project_write_file only for new files or a ' +
    'rewrite. A page or motion composition saved in the folder opens in the preview by itself, ' +
    'and the MP4 is made from that file: after saving or editing it, do not repeat its code in ' +
    'the reply; say what changed. For a Word document or a ' +
    'PowerPoint presentation, use project_write_word or project_write_powerpoint. Code blocks you write that ' +
    'name a file after the language (```html index.html) are saved there too. Keep ' + notesName() + ' ' +
    'up to date with what the project is and the decisions taken.'
  )
}

// The project's own design language, when it has a DESIGN.md: sent with every
// request, since it overrides any skill's defaults.
export const DESIGN_FILE = 'DESIGN.md'
const MAX_DESIGN = 24_000

export function designNote(content: string): string {
  const text = content.trim()
  if (!text) return ''
  const cut = text.length > MAX_DESIGN ? `${text.slice(0, MAX_DESIGN)}\n\n[… DESIGN.md continues; read the rest with project_read_file.]` : text
  return (
    `The project has a ${DESIGN_FILE}: its design language. Its fonts, colours, tokens and rules ` +
    'override the defaults of any skill or tool (taste-skill\'s draw included); follow it in ' +
    `every page and component, and keep it up to date when the user changes the design.\n\n<design_md>\n${cut}\n</design_md>`
  )
}

export async function readDesign(project: ChatProject): Promise<string> {
  try {
    return designNote(await readFile(project.path, DESIGN_FILE))
  } catch {
    return ''
  }
}

export const PROJECT_TOOLS: ToolDef[] = [
  {
    name: 'project_list_files',
    description: "List the files in the conversation's project folder, with sizes.",
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'project_read_file',
    description:
      'Read a file of the project folder, by its path inside the folder. Word (.docx) and ' +
      'PowerPoint (.pptx) files come back as Markdown text.',
    schema: {
      type: 'object',
      properties: { file: { type: 'string', description: 'Such as index.html or css/site.css.' } },
      required: ['file'],
    },
  },
  {
    name: 'project_write_file',
    description:
      'Create or replace a file in the project folder with its complete content. Folders in ' +
      'the path are created. A long file (more than about 1,500 lines) goes in parts, since one ' +
      'reply has an output limit: write the first part, then add each of the others with ' +
      'append: true.',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path inside the project, such as index.html.' },
        content: { type: 'string', description: 'The whole file, or the next part of it with append.' },
        append: { type: 'boolean', description: 'Add content to the end of the file instead of replacing it.' },
      },
      required: ['file', 'content'],
    },
  },
  {
    name: 'project_edit_file',
    description:
      'Change part of a text file in the project folder: replaces old_text with new_text. ' +
      'old_text must be copied exactly from the file (spaces and line breaks included) and ' +
      'appear only once, unless all is true; include a line or two around the change to make ' +
      'it unique. Use this for adjustments instead of writing the whole file again.',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path inside the project, such as index.html.' },
        old_text: { type: 'string', description: 'The exact text to replace.' },
        new_text: { type: 'string', description: 'The text to put in its place (empty to delete it).' },
        all: { type: 'boolean', description: 'Replace every occurrence, not only one.' },
      },
      required: ['file', 'old_text', 'new_text'],
    },
  },
  {
    name: 'project_write_word',
    description:
      'Create or replace a Word document (.docx) in the project folder, written in Markdown: ' +
      '# headings, paragraphs, **bold**, *italic*, - and 1. lists (indent two spaces to nest), ' +
      'tables with | pipes |, > quotes and ``` code. A single # heading at the top becomes the ' +
      'document title. Opens in Word, Google Docs and LibreOffice.',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path inside the project, ending in .docx, such as proposta.docx.' },
        title: { type: 'string', description: 'Optional title, when the Markdown does not start with one.' },
        markdown: { type: 'string', description: 'The whole document.' },
      },
      required: ['file', 'markdown'],
    },
  },
  {
    name: 'project_write_powerpoint',
    description:
      'Create or replace a PowerPoint presentation (.pptx, 16:9) in the project folder: an ' +
      'optional title slide, then one slide per item with a title, short bullets (start a ' +
      'bullet with two spaces to make it a sub-bullet; **bold** works) and speaker notes. ' +
      'Keep 3 to 6 bullets per slide. Opens in PowerPoint, Keynote, Google Slides and LibreOffice.',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path inside the project, ending in .pptx, such as apresentacao.pptx.' },
        title: { type: 'string', description: 'Title of the opening slide; leave out for none.' },
        subtitle: { type: 'string', description: 'Line under the title on the opening slide.' },
        theme: { type: 'string', enum: ['light', 'dark'], description: 'Light (default) or dark slides.' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
              notes: { type: 'string', description: 'What the speaker says on this slide.' },
            },
            required: ['title'],
          },
        },
      },
      required: ['file', 'slides'],
    },
  },
]

// Office files are binary: they travel to the folder as base64 and are read
// back as text.
async function officeBytes(bytes: Uint8Array): Promise<string> {
  return base64(new Blob([bytes as Uint8Array<ArrayBuffer>]))
}

async function readOfficeFile(project: string, file: string): Promise<string> {
  const res = await fetch(fileUrl(project, file))
  if (!res.ok) throw new Error(`No file named ${file} in the project.`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  return /\.pptx$/i.test(file) ? readPowerPoint(bytes, file) : readWord(bytes, file)
}

function withExtension(file: string, extension: string): string {
  return file.toLowerCase().endsWith(extension) ? file : `${file.replace(/\.[A-Za-z0-9]+$/, '')}${extension}`
}

// Runs a project tool; `onWrite` hears about files saved.
export async function runProjectTool(
  project: ChatProject,
  call: ToolCall,
  onWrite: (files: string[]) => void,
): Promise<ToolResult> {
  const input = (call.input ?? {}) as {
    file?: string
    content?: string
    title?: string
    subtitle?: string
    markdown?: string
    theme?: 'light' | 'dark'
    slides?: { title?: string; bullets?: string[]; notes?: string }[]
    old_text?: string
    new_text?: string
    all?: boolean
    append?: boolean
  }
  try {
    if (call.name === 'project_list_files') {
      const files = await listFiles(project.path)
      return {
        content: files.length
          ? files.map((f) => `${f.name} (${f.size} bytes)`).join('\n')
          : 'The project folder is empty.',
        isError: false,
      }
    }
    if (!input.file) return { content: 'Say which file.', isError: true }
    if (call.name === 'project_read_file') {
      const content = /\.(docx|pptx)$/i.test(input.file)
        ? await readOfficeFile(project.path, input.file)
        : await readFile(project.path, input.file)
      return { content, isError: false }
    }
    if (call.name === 'project_write_word') {
      if (!input.markdown?.trim()) return { content: 'Give the document as markdown.', isError: true }
      const { wordFile } = await import('./officeWrite')
      const name = withExtension(input.file, '.docx')
      const bytes = await wordFile({ title: input.title, markdown: input.markdown })
      const written = await saveFiles(project.path, [{ name, content: await officeBytes(bytes), encoding: 'base64' }])
      onWrite(written)
      return { content: `Saved ${written.join(', ')} (${bytes.length} bytes).`, isError: false }
    }
    if (call.name === 'project_write_powerpoint') {
      const slides = (input.slides ?? []).filter((s) => s && typeof s === 'object')
      if (!slides.length && !input.title) return { content: 'Give at least one slide.', isError: true }
      const { powerPointFile } = await import('./officeWrite')
      const name = withExtension(input.file, '.pptx')
      const bytes = await powerPointFile({
        title: input.title,
        subtitle: input.subtitle,
        theme: input.theme,
        slides: slides.map((s) => ({
          title: String(s.title ?? ''),
          bullets: Array.isArray(s.bullets) ? s.bullets.map(String) : [],
          notes: s.notes ? String(s.notes) : undefined,
        })),
      })
      const written = await saveFiles(project.path, [{ name, content: await officeBytes(bytes), encoding: 'base64' }])
      onWrite(written)
      return { content: `Saved ${written.join(', ')} with ${slides.length + (input.title ? 1 : 0)} slides.`, isError: false }
    }
    if (call.name === 'project_edit_file') {
      if (/\.(docx|pptx)$/i.test(input.file)) {
        return { content: 'Word and PowerPoint files are rewritten whole, with project_write_word or project_write_powerpoint.', isError: true }
      }
      const { replaced, size } = await editFile(project.path, input.file, input.old_text ?? '', input.new_text ?? '', !!input.all)
      onWrite([input.file])
      return {
        content: `Edited ${input.file}: ${replaced === 1 ? '1 replacement' : `${replaced} replacements`}, ${size} bytes now.`,
        isError: false,
      }
    }
    if (call.name === 'project_write_file') {
      const append = !!input.append
      const written = await saveFiles(project.path, [{ name: input.file, content: input.content ?? '', append }])
      onWrite(written)
      return { content: `${append ? 'Added to' : 'Saved'} ${written.join(', ')}.`, isError: false }
    }
    return { content: `No tool named ${call.name}.`, isError: true }
  } catch (error) {
    return { content: error instanceof Error ? error.message : String(error), isError: true }
  }
}
