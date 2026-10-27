import { spawn } from 'node:child_process'
import { readFile, mkdtemp, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { COMMANDS, helpText, parseWords } from '../server/agent-commands.mjs'
import { agentHandler, createAgent, writeAgentFile } from '../server/agent.mjs'
import { mcpAnswer, mcpTools } from '../bin/tsrs.mjs'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

// The commands with stand-ins for the renderer, the schedule and the image servers.
async function agentFor(root: string) {
  const ran: string[] = []
  const tasks = [{ id: 'news-1', name: 'AI news digest', providerId: 'openrouter', model: 'some/model', schedule: { kind: 'daily', time: '08:00' }, enabled: true }]
  const run = createAgent(
    {
      agenda: { list: async () => ({ tasks, pending: 1 }), runNow: async (id: string) => void ran.push(id) },
      version: () => ({ version: '9.9.9', commit: 'abc1234' }),
      renderBusy: () => false,
      exclusiveRender: (work: () => Promise<string>) => work(),
      renderMotion: async (job: { name: string; project: string }, _folder: string, _log: unknown, onFrame: (f: number, n: number) => void) => {
        onFrame(1, 2)
        onFrame(2, 2)
        const path = join(job.project, 'videos', `${job.name}.mp4`)
        await import('node:fs/promises').then((fs) => fs.mkdir(join(job.project, 'videos'), { recursive: true }).then(() => fs.writeFile(path, 'mp4')))
        return path
      },
      renderFolder: join(root, '_videos'),
      inspectPage: async () => ({ findings: [], text: 'Nothing out of place.', images: [{ label: '.taste-skill/inspect/768.png' }] }),
      log: () => {},
      comfy: { status: async () => ({ ok: false, error: 'down' }), makeImage: async () => { throw new Error('not here') } },
      sdcpp: { status: async () => ({ ok: true }), makeImage: async () => ({ mime: 'image/png', data: PNG.toString('base64'), seed: 7, model: 'z-image' }) },
    },
    root,
  )
  return { run, ran }
}

test('reads command words into a command and its arguments, and explains each one', () => {
  const read = parseWords(['projects', 'read', 'site', 'index.html', '--lines', '1:9', '--json'])
  expect(read.command.name).toBe('projects read')
  expect(read).toMatchObject({ args: { project: 'site', file: 'index.html', lines: '1:9' }, json: true, yes: false })
  expect(parseWords(['design', 'check', 'site', 'a.html', '--widths=768,390']).args.widths).toEqual(['768', '390'])
  expect(parseWords(['image', 'local', 'a cup', '--project', 'p', '--width', '640', '-y'])).toMatchObject({ args: { width: 640 }, yes: true })
  expect(() => parseWords(['board', 'list', '--colour', 'x'])).toThrow('takes no --colour')
  expect(() => parseWords(['status', 'now'])).toThrow('Too many words')
  expect(parseWords(['nope']).command).toBeNull()

  for (const command of COMMANDS) expect(helpText(command)).toContain(command.example)
  expect(helpText(COMMANDS.find((c) => c.name === 'agenda run'))).toContain('--yes')
  expect(helpText()).toContain('3 needs --yes')
  // Every command an agent sees as an MCP tool, with yes only where it asks.
  const tools = mcpTools()
  expect(tools.map((t) => t.name)).toContain('board_move')
  expect(tools.find((t) => t.name === 'agenda_run')!.inputSchema.properties).toHaveProperty('yes')
  expect(tools.find((t) => t.name === 'board_list')!.inputSchema.properties).not.toHaveProperty('yes')
})

test('works on project folders, the board, the schedule and local images, asking before replacing or spending', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-agent-'))
  const { run, ran } = await agentFor(root)

  expect((await run('status')).text).toContain('TSRS 9.9.9 (abc1234)')
  const made = await run('projects new', { name: 'Cafe Aurora ad' })
  expect(made.text).toContain('cafe-aurora-ad')
  await expect(run('projects new', { name: 'Cafe Aurora ad' })).rejects.toMatchObject({ code: 'invalid' })
  expect((await run('projects list')).result.map((p: { name: string }) => p.name)).toEqual(['cafe-aurora-ad'])

  await run('projects write', { project: 'cafe-aurora-ad', file: 'script.md', text: 'one\ntwo\nthree' })
  await expect(run('projects write', { project: 'cafe-aurora-ad', file: 'script.md', text: 'x' })).rejects.toMatchObject({ code: 'confirm' })
  await run('projects write', { project: 'cafe-aurora-ad', file: 'midia/dot.png', base64: PNG.toString('base64') })
  expect(await readFile(join(root, 'cafe-aurora-ad', 'midia', 'dot.png'))).toEqual(PNG)
  expect((await run('projects read', { project: 'cafe-aurora-ad', file: 'script.md', lines: '2:3' })).text).toBe('two\nthree')
  await expect(run('projects read', { project: 'cafe-aurora-ad', file: '../../etc/passwd' })).rejects.toMatchObject({ code: 'invalid' })
  await expect(run('projects files', { project: '../' })).rejects.toMatchObject({ code: 'invalid' })
  const notes = await readFile(join(root, 'cafe-aurora-ad', 'NOTES.md'), 'utf8')
  expect(notes).toContain('script.md · tsrs command')
  expect(notes).toContain('midia/dot.png · tsrs command')

  await run('projects write', { project: 'cafe-aurora-ad', file: 'ad.html', text: '<p>ad</p>' })
  const frames: unknown[] = []
  const video = await run('render motion', { project: 'cafe-aurora-ad', file: 'ad.html' }, false, (f: unknown) => frames.push(f))
  expect(video.result.file).toBe('videos/ad.mp4')
  expect(frames).toEqual([{ frame: 1, frames: 2 }, { frame: 2, frames: 2 }])
  expect((await run('design check', { project: 'cafe-aurora-ad', file: 'ad.html' })).text).toContain('.taste-skill/inspect/768.png')

  const card = (await run('board add', { title: 'Cafe Aurora ad', kind: 'ad', due: '2026-11-07', project: 'cafe-aurora-ad' })).result
  expect(card).toMatchObject({ column: 'roteiro', kind: 'ad', projectPath: join(root, 'cafe-aurora-ad') })
  await expect(run('board add', { title: 'x', due: 'soon' })).rejects.toMatchObject({ code: 'invalid' })
  expect((await run('board move', { card: 'aurora', column: 'Render' })).result.column).toBe('render')
  expect((await run('board update', { card: card.id.slice(0, 8), due: '2026-11-10' })).result.due).toBe('2026-11-10')
  await run('board add', { title: 'Aurora teaser' })
  await expect(run('board move', { card: 'aurora', column: 'takes' })).rejects.toThrow('More than one card')
  await run('board remove', { card: 'Cafe Aurora ad' })
  const board = JSON.parse(await readFile(join(root, '_producao', 'quadro.json'), 'utf8'))
  expect(board.cards.map((c: { title: string }) => c.title)).toEqual(['Aurora teaser'])
  expect(board.removed[0]).toMatchObject({ title: 'Cafe Aurora ad', removedAt: expect.any(Number) })

  expect((await run('agenda list')).text).toContain('AI news digest  daily at 08:00 · openrouter/some/model')
  await expect(run('agenda run', { task: 'news digest' })).rejects.toMatchObject({ code: 'confirm', message: expect.stringContaining('a paid call') })
  expect(ran).toEqual([])
  await run('agenda run', { task: 'news digest' }, true)
  expect(ran).toEqual(['news-1'])

  const image = await run('image local', { prompt: 'A cup of coffee at dawn', project: 'cafe-aurora-ad' })
  expect(image.result).toMatchObject({ file: 'midia/a-cup-of-coffee-at-dawn.png', model: 'z-image', seed: 7 })
  expect((await run('image local', { prompt: 'A cup of coffee at dawn', project: 'cafe-aurora-ad' })).result.file).toBe('midia/a-cup-of-coffee-at-dawn-2.png')
  await expect(run('image local', { prompt: 'x', project: 'cafe-aurora-ad', engine: 'comfy' })).rejects.toThrow('not here')
  await expect(run('board add', {})).rejects.toMatchObject({ code: 'invalid' })
})

function listen(server: Server) {
  return new Promise<string>((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as { port: number }).port}`)))
}

function tsrs(args: string[], env: Record<string, string>) {
  return new Promise<{ code: number; out: string; err: string }>((done) => {
    const child = spawn(process.execPath, ['bin/tsrs.mjs', ...args], { env: { ...process.env, ...env } })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => done({ code: code ?? -1, out, err }))
  })
}

test('the tsrs command reaches only a server holding its token, and answers with exit codes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-agent-cli-'))
  const ext = await mkdtemp(join(tmpdir(), 'tsrs-agent-ext-'))
  const env = { TSRS_EXTENSIONS: ext }
  // Nothing running yet.
  expect((await tsrs(['status'], env)).code).toBe(4)

  const { run } = await agentFor(root)
  let token = ''
  const handle = agentHandler(run, () => token)
  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith('/__tsrs/agent')) return void res.writeHead(404).end()
    req.url = req.url.slice('/__tsrs/agent'.length)
    if (!(await handle(req, res))) res.writeHead(404).end()
  })
  const url = await listen(server)
  try {
    token = await writeAgentFile(url, ext)
    if (process.platform !== 'win32') expect((await stat(join(ext, '.tsrs-agent.json'))).mode & 0o777).toBe(0o600)

    const status = await tsrs(['status', '--json'], env)
    expect(status.code).toBe(0)
    expect(JSON.parse(status.out)).toMatchObject({ ok: true, result: { version: '9.9.9' } })
    expect((await tsrs(['projects', 'new', 'Site'], env)).code).toBe(0)
    const source = join(ext, 'dot.png')
    await writeFile(source, PNG)
    expect((await tsrs(['projects', 'write', 'site', 'midia/dot.png', '--from', source], env)).code).toBe(0)
    const again = await tsrs(['projects', 'write', 'site', 'midia/dot.png', '--from', source], env)
    expect(again).toMatchObject({ code: 3, err: expect.stringContaining('Add --yes') })
    expect((await tsrs(['projects', 'write', 'site', 'midia/dot.png', '--from', source, '--yes'], env)).code).toBe(0)
    expect(await readFile(join(root, 'site', 'midia', 'dot.png'))).toEqual(PNG)
    expect((await tsrs(['projects', 'write', 'site', 'a.html', '--text', '<p>a</p>'], env)).code).toBe(0)
    const video = await tsrs(['render', 'motion', 'site', 'a.html', '--json'], env)
    expect(JSON.parse(video.out)).toMatchObject({ ok: true, result: { file: 'videos/a.mp4' } })
    expect((await tsrs(['board', 'move', 'nothing', 'render'], env)).code).toBe(2)
    expect((await tsrs(['board', 'add'], env)).code).toBe(2)
    expect((await tsrs(['agenda', 'run', 'AI news digest'], env)).code).toBe(3)

    // Pages and wrong tokens are refused.
    const page = await fetch(`${url}/__tsrs/agent/run`, { method: 'POST', headers: { Origin: url, Authorization: `Bearer ${token}` }, body: '{"command":"status"}' })
    expect(page.status).toBe(403)
    const guess = await fetch(`${url}/__tsrs/agent/run`, { method: 'POST', headers: { Authorization: 'Bearer guess' }, body: '{"command":"status"}' })
    expect(guess.status).toBe(401)

    // The MCP server answers with the same commands.
    const send = async (name: string, args: Record<string, unknown>, yes: boolean) => ({ ok: true, ...(await run(name, args, yes)) })
    const list = await mcpAnswer({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, send)
    expect(list!.result.tools.length).toBe(COMMANDS.length)
    const asked = await mcpAnswer({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'agenda_run', arguments: { task: 'news' } } }, send)
    expect(asked!.result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('call again with yes: true') }] })
    const files = await mcpAnswer({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'projects_files', arguments: { project: 'site' } } }, send)
    expect(files!.result.content[0].text).toContain('midia/dot.png')
    expect(await mcpAnswer({ jsonrpc: '2.0', method: 'notifications/initialized' }, send)).toBeNull()
  } finally {
    server.close()
  }
})
