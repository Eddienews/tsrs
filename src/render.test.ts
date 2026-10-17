import { expect, test } from 'vitest'
import { freeName, insideRoot, parseArgs } from '../render/render.mjs'
import { audioExtension, bringProjectFiles, safeStem, serveOptions } from '../render/serve.mjs'
import { sameOrigin } from '../render/vite-plugin.mjs'

test('reads the render options', () => {
  expect(parseArgs(['motion-1.html', '--audio', 'a.wav', '--fps', '240', '-o', 'v.mp4', '--online'])).toEqual({
    input: 'motion-1.html',
    out: 'v.mp4',
    audio: 'a.wav',
    fps: 60,
    crf: 18,
    lufs: -14,
    online: true,
  })
  expect(() => parseArgs(['a.html', '--fps'])).toThrow('--fps needs a value')
  expect(() => parseArgs(['a.html', '--crf', 'x'])).toThrow('--crf needs a number')
  expect(() => parseArgs(['a.html', '--loop'])).toThrow('unknown option --loop')
})

test('never overwrites a video that is already there', () => {
  const taken = new Set(['/v/motion-1.mp4', '/v/motion-1-2.mp4'])
  expect(freeName('/v/motion-1.mp4', (path) => taken.has(path))).toBe('/v/motion-1-3.mp4')
  expect(freeName('/v/outro.mp4', (path) => taken.has(path))).toBe('/v/outro.mp4')
})

test('serves only files inside the composition folder', () => {
  const root = '/compositions/intro'
  expect(insideRoot(root, '/logo.png')).toMatch(/intro[\\/]logo\.png$/)
  expect(insideRoot(root, '/fonts/a%20b.woff2?v=1')).toMatch(/intro[\\/]fonts[\\/]a b\.woff2$/)
  expect(insideRoot(root, '/../secret.txt')).toBeNull()
  expect(insideRoot(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull()
  expect(insideRoot(root, '/..%5c..%5ckeys.env')).toBeNull()
  expect(insideRoot(root, '/%E0%A4%A')).toBeNull()
  expect(insideRoot(root, '/')).toBeNull()
})

test('the local renderer keeps names safe and accepts only audio', () => {
  expect(safeStem('motion-1.html')).toBe('motion-1')
  expect(safeStem('../../Abertura: NWLab?.html')).toBe('Abertura- NWLab')
  expect(safeStem('')).toBe('motion')
  expect(audioExtension('trilha.MP3')).toBe('.mp3')
  expect(audioExtension('voz.wav')).toBe('.wav')
  expect(audioExtension('script.js')).toBeNull()
  const options = serveOptions(['--port', '9000', '--origin', 'http://localhost:3000/'])
  expect(options.port).toBe(9000)
  expect(options.origins).toEqual(['http://localhost:3000'])
  expect(options.folder).toMatch(/renders$/)
  expect(serveOptions([]).origins).toEqual(['http://localhost:5173', 'http://localhost:4173'])
})

test('inside the TSRS server, only TSRS itself may start a render', () => {
  const req = (method: string, origin?: string) => ({
    method,
    headers: { host: 'localhost:5173', ...(origin ? { origin } : {}) },
  })
  expect(sameOrigin(req('POST', 'http://localhost:5173'))).toBe(true)
  expect(sameOrigin(req('GET'))).toBe(true)
  // Another site, a sandboxed preview frame, or a POST that hides where it comes from.
  expect(sameOrigin(req('POST', 'https://evil.example'))).toBe(false)
  expect(sameOrigin(req('POST', 'null'))).toBe(false)
  expect(sameOrigin(req('POST'))).toBe(false)
  expect(sameOrigin(req('GET', 'http://localhost:5174'))).toBe(false)
})

test('a page made in a project takes the files it names to the offline render', async () => {
  const { mkdtemp, mkdir, writeFile, readFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const project = await mkdtemp(join(tmpdir(), 'tsrs-proj-'))
  const into = await mkdtemp(join(tmpdir(), 'tsrs-work-'))
  await mkdir(join(project, 'midia'), { recursive: true })
  await mkdir(join(project, 'videos'), { recursive: true })
  await writeFile(join(project, 'midia', 'logo.png'), 'png')
  await writeFile(join(project, 'midia', 'nao-usado.png'), 'x')
  await writeFile(join(project, 'videos', 'midia-antigo.mp4'), 'x')
  await writeFile(join(project, 'fonte.woff2'), 'f')
  await writeFile(join(project, 'logo'), 'palavra')
  const html = '<img src="midia/logo.png"><style>@font-face{src:url("fonte.woff2")}</style><p>logo</p>'
  expect((await bringProjectFiles(html, project, into)).sort()).toEqual(['fonte.woff2', 'midia/logo.png'])
  expect(await readFile(join(into, 'midia', 'logo.png'), 'utf8')).toBe('png')
})
