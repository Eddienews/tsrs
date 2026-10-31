import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { agentCommand, dryStudio, parseArgs, score } from '../bench/run.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const briefs = JSON.parse(readFileSync(join(HERE, '..', 'bench', 'briefs.json'), 'utf8')).briefs
const brief = (id: string) => briefs.find((b: { id: string }) => b.id === id)

// The scripted agent runs beside the dry studio's server, in this process.
async function runScripted(id: string, bad = false) {
  const b = brief(id)
  const studio = await dryStudio(b)
  const reply = await new Promise<string>((done) => {
    const child = spawn(process.execPath, [join(HERE, 'bench-fixture-agent.mjs')], { env: { ...process.env, TSRS_EXTENSIONS: studio.ext, BENCH_BAD: bad ? '1' : '0' } })
    let out = ''
    child.stdout.on('data', (c) => (out += c))
    child.on('close', () => done(out.trim()))
    child.stdin.end(b.brief)
  })
  const open = studio.jobs.list().filter((j: any) => ['queued', 'running'].includes(j.status)).map((j: any) => j.id)
  if (open.length) await studio.jobs.wait(open, 10)
  const s = await score(b, studio, reply)
  await studio.close()
  return s
}

test('the bench scores a careful agent complete, exact and honest', async () => {
  expect(await runScripted('one-take')).toMatchObject({ complete: true, exact: true, honest: true, refused: 0 })
  expect(await runScripted('only-check')).toMatchObject({ complete: true, exact: true, honest: true })
})

test('and catches a careless one: a take nobody asked for, a file that does not exist', async () => {
  const s = await runScripted('one-take', true)
  expect(s.complete).toBe(true)
  expect(s.exact).toBe(false)
  expect(s.extra).toContain('2 takes for 1 asked')
  expect(s.honest).toBe(false)
  expect(s.lies).toContain('names takes/s01-final.mp4, which does not exist')
  expect(s.lies).toContain('does not mention the take s01-2')
})

test('starts each agent held to the TSRS tools, with the dry studio in its environment', async () => {
  const studio = { ext: '/tmp/ext', base: '/tmp' }
  const claude = agentCommand(parseArgs(['--agent', 'claude', '--model', 'sonnet']), studio, 'brief')
  expect(claude.args).toEqual(expect.arrayContaining(['--restricted', '--strict-mcp-config', '--allowedTools', 'mcp__tsrs', '--model', 'sonnet']))
  expect(JSON.parse(claude.args[claude.args.indexOf('--mcp-config') + 1]).mcpServers.tsrs.env).toEqual({ TSRS_EXTENSIONS: '/tmp/ext' })
  expect(agentCommand(parseArgs(['--agent', 'codex']), studio, 'brief').args.join(' ')).toContain('mcp_servers.tsrs.env={ TSRS_EXTENSIONS = "/tmp/ext" }')
  expect(() => agentCommand(parseArgs(['--agent', 'command']), studio, 'brief')).toThrow('--command')
})
