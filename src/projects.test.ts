import { expect, test, vi } from 'vitest'
import { setLanguage } from './i18n'
import {
  fenceName,
  filesFromReply,
  historyLine,
  notesName,
  mediaName,
  mediaNote,
  pathIn,
  projectNote,
  projectNotes,
  runProjectTool,
} from './projects'

const fence = (info: string, code: string) => '```' + info + '\n' + code + '\n```'

test('code blocks that name a file are saved under that name', () => {
  expect(fenceName(' index.html')).toBe('index.html')
  expect(fenceName(' title="css/site.css"')).toBe('css/site.css')
  expect(fenceName(' file=app.js extra')).toBe('app.js')
  expect(fenceName(' ../fora.html')).toBeNull()
  expect(fenceName(' {highlight: 2}')).toBeNull()
  const reply = [
    'O site:',
    fence('html index.html', '<!doctype html><h1>v1</h1>'),
    fence('css styles.css', 'h1{}'),
    'Melhor assim:',
    fence('html index.html', '<!doctype html><h1>v2</h1>'),
  ].join('\n\n')
  expect(filesFromReply(reply)).toEqual([
    { name: 'index.html', content: '<!doctype html><h1>v2</h1>' },
    { name: 'styles.css', content: 'h1{}' },
  ])
})

test('a whole page, drawing or video is a file even without a name', () => {
  expect(filesFromReply(fence('html', '<!DOCTYPE html>\n<html><body>oi</body></html>'))).toEqual([
    { name: 'index.html', content: '<!DOCTYPE html>\n<html><body>oi</body></html>' },
  ])
  expect(filesFromReply(fence('motion', '<h1>x</h1>'))[0].name).toBe('motion.html')
  expect(filesFromReply(fence('svg', '<svg viewBox="0 0 1 1"></svg>'))[0].name).toBe('imagem.svg')
  // Beside a page, its styles and script come along.
  const page = [fence('html', '<html><body></body></html>'), fence('css', 'body{}'), fence('js', 'go()')].join('\n')
  expect(filesFromReply(page).map((f) => f.name)).toEqual(['index.html', 'styles.css', 'script.js'])
})

test('when the model saved files itself, an unnamed block is not saved again', () => {
  const reply = [fence('motion', '<h1>x</h1>'), fence('css site.css', 'h1{}')].join('\n')
  expect(filesFromReply(reply).map((f) => f.name)).toEqual(['motion.html', 'site.css'])
  expect(filesFromReply(reply, true).map((f) => f.name)).toEqual(['site.css'])
})

test('a snippet in an explanation is not a project', () => {
  expect(filesFromReply(fence('html', '<button>OK</button>'))).toEqual([])
  expect(filesFromReply(fence('js', 'const x = 1'))).toEqual([])
  expect(filesFromReply(fence('bash', 'npm install'))).toEqual([])
  expect(filesFromReply('Sem código nenhum.')).toEqual([])
})

test('the notes tell whoever carries on what the project is', () => {
  const date = new Date(2026, 9, 15, 0, 50)
  const notes = projectNotes('Site do NWLab', 'crie o site do NWLab', date)
  expect(notes).toContain('# Site do NWLab')
  expect(notes).toContain('## Pedido\n\ncrie o site do NWLab')
  expect(notes).toContain('Claude Code, Codex')
  expect(notes.endsWith('## Histórico\n')).toBe(true)
  expect(historyLine(['index.html', 'styles.css'], 'claude-opus-5-5', date)).toMatch(
    /^- 15\/10\/2026.*00:50.* · index\.html, styles\.css · claude-opus-5-5\n$/,
  )
  const note = projectNote({ path: 'C:\\Users\\eddie\\projetos\\site', name: 'site' })
  expect(note).toContain('C:\\Users\\eddie\\projetos\\site')
  expect(note).toContain('project_read_file')
})

test('the saved path reads like the user\'s own file manager', () => {
  expect(pathIn('C:\\Users\\eddie\\projetos\\Conversa', 'midia/video.mp4')).toBe(
    'C:\\Users\\eddie\\projetos\\Conversa\\midia\\video.mp4',
  )
  expect(pathIn('C:/Users/eddie/projetos/Conversa/', 'midia/video.mp4')).toBe(
    'C:\\Users\\eddie\\projetos\\Conversa\\midia\\video.mp4',
  )
  expect(pathIn('/home/eddie/projetos/Conversa', 'midia/video.mp4')).toBe('/home/eddie/projetos/Conversa/midia/video.mp4')
})

test('attached files go to midia/ without replacing what is there', () => {
  const taken = new Set(['midia/logo.png', 'midia/logo-2.png'])
  expect(mediaName('logo.png', taken)).toBe('midia/logo-3.png')
  expect(mediaName('C:\\fakepath\\trilha.mp3', taken)).toBe('midia/trilha.mp3')
  expect(mediaName('a:b?.png', new Set())).toBe('midia/a-b-.png')
  expect(mediaName('', new Set())).toBe('midia/arquivo')
})

test('the model is told what is in midia/ and to use the real files', () => {
  expect(mediaNote(['index.html', 'NOTAS.md'])).toBe('')
  const note = mediaNote(['midia/logo.png', 'index.html', 'midia/launch-pulse-trilha.mp3'])
  expect(note).toContain('- midia/launch-pulse-trilha.mp3\n- midia/logo.png')
  expect(note).toContain('src="midia/logo.png"')
  expect(note).toContain('do not redraw a logo')
})

test('project_write_file adds to the end of a file with append', async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const files = JSON.parse(init.body as string).files
    return new Response(JSON.stringify({ written: files.map((f: { name: string }) => f.name) }))
  })
  vi.stubGlobal('fetch', fetch)
  const project = { name: 'p', path: '/p' } as Parameters<typeof runProjectTool>[0]
  const call = (input: object) => ({ id: 'w', name: 'project_write_file', input })
  const first = await runProjectTool(project, call({ file: 'a.html', content: '<html>' }), () => {})
  const next = await runProjectTool(project, call({ file: 'a.html', content: '</html>', append: true }), () => {})
  vi.unstubAllGlobals()

  const sent = fetch.mock.calls.map((c) => JSON.parse(c[1].body as string).files[0])
  expect(sent).toEqual([
    { name: 'a.html', content: '<html>', append: false },
    { name: 'a.html', content: '</html>', append: true },
  ])
  expect(first.content).toBe('Saved a.html.')
  expect(next.content).toBe('Added to a.html.')
})

test('in English the notes are NOTES.md, written in English', () => {
  setLanguage('en')
  try {
    const date = new Date(2026, 9, 15, 0, 50)
    const notes = projectNotes('NWLab site', 'make the NWLab site', date)
    expect(notesName()).toBe('NOTES.md')
    expect(notes).toContain('## Request\n\nmake the NWLab site')
    expect(notes).toContain('Project created by TSRS on 10/15/2026')
    expect(notes.endsWith('## History\n')).toBe(true)
    expect(historyLine(['index.html'], 'gpt', date)).toMatch(/^- 10\/15\/2026/)
    expect(projectNote({ path: '/p', name: 'p' })).toContain('Keep NOTES.md')
  } finally {
    setLanguage('pt')
  }
  expect(notesName()).toBe('NOTAS.md')
})
