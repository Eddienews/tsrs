import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cliArgs, cliStatus, runCli } from '../server/cli.mjs'

const CLAUDE = join(process.cwd(), 'e2e', 'fixtures', 'fake-claude.mjs')
const CODEX = join(process.cwd(), 'e2e', 'fixtures', 'fake-codex.mjs')

// Runs one turn and returns what the fake agent reported seeing, and its lines.
async function turn(root: string, job: Record<string, unknown>) {
  const lines: any[] = []
  const ended = await runCli(job, (line: string) => lines.push(JSON.parse(line)), { root })
  return { ended, lines, seen: lines.find((l) => l.type === 'debug') }
}

test('maps what the agent may do to each command line', () => {
  expect(cliArgs({ agent: 'claude', model: 'opus', effort: 'high', access: 'read' })).toEqual([
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-mode', 'plan', '--model', 'opus', '--effort', 'high',
  ])
  expect(cliArgs({ agent: 'claude', model: 'default', access: 'full', session: 's1' })).toEqual([
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-mode', 'bypassPermissions', '--dangerously-skip-permissions', '--resume', 's1',
  ])
  expect(cliArgs({ agent: 'codex', model: 'default' })).toEqual([
    'exec', '--json', '--skip-git-repo-check', '-c', 'sandbox_mode=workspace-write', '-',
  ])
  expect(cliArgs({ agent: 'codex', model: 'gpt-6', effort: 'low', access: 'full', session: 't1' })).toEqual([
    'exec', '--json', '--skip-git-repo-check', 'resume', 't1', '--dangerously-bypass-approvals-and-sandbox',
    '-m', 'gpt-6', '-c', 'model_reasoning_effort=low', '-',
  ])
  expect(() => cliArgs({ agent: 'claude', access: 'root' })).toThrow('Unknown access')
  expect(() => cliArgs({ agent: 'gemini' })).toThrow('Unknown agent')
})

test('continues the same Claude Code session turn after turn, and starts over after an edit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-cli-'))
  const cwd = join(root, 'meu-projeto')
  const base = { agent: 'claude', command: CLAUDE, chatId: 'c1', cwd }

  const first = await turn(root, { ...base, turn: 1, prompt: 'Oi', transcript: 'Oi' })
  expect(first.ended).toMatchObject({ code: 0, resumed: false, cwd })
  expect(first.seen.args).not.toContain('--resume')
  expect(first.seen.cwd).toBe(cwd)
  const session = first.lines.find((l) => l.subtype === 'init').session_id

  // The next turn sends only the new message, in the same session.
  const second = await turn(root, { ...base, turn: 2, prompt: 'E agora?', transcript: 'TUDO\nE agora?' })
  expect(second.ended.resumed).toBe(true)
  expect(second.seen.args).toEqual(expect.arrayContaining(['--resume', session]))
  expect(second.seen.stdin).toBe('E agora?')

  // Regenerating turn 2 cannot resume after it: the whole conversation goes again.
  const again = await turn(root, { ...base, turn: 2, prompt: 'E agora?', transcript: 'TUDO\nE agora?' })
  expect(again.ended.resumed).toBe(false)
  expect(again.seen.stdin).toBe('TUDO\nE agora?')

  const saved = JSON.parse(await readFile(join(root, '.tsrs-cli-sessions.json'), 'utf8'))
  expect(Object.keys(saved)).toEqual([`c1|claude|${cwd}`])
})

test('runs Codex with its thread, and says why a turn failed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-cli-'))
  const base = { agent: 'codex', command: CODEX, chatId: 'c2' }
  const first = await turn(root, { ...base, turn: 1, prompt: 'Oi', transcript: 'Oi' })
  // Without a project folder the agent works in a shared one.
  expect(first.seen.cwd).toBe(join(root, '_cli'))
  const thread = first.lines.find((l) => l.type === 'thread.started').thread_id
  const second = await turn(root, { ...base, turn: 2, prompt: 'Mais', transcript: 'Oi\nMais' })
  expect(second.seen.args.slice(0, 5)).toEqual(['exec', '--json', '--skip-git-repo-check', 'resume', thread])

  const failed = await turn(root, { agent: 'claude', command: CLAUDE, chatId: 'c3', turn: 1, prompt: 'fail', transcript: 'fail' })
  expect(failed.ended.code).toBe(3)
  expect(failed.ended.stderr).toBe('Something went wrong in the agent.')
})

test('says which version answers, or that the command is missing', async () => {
  expect(await cliStatus('claude', CLAUDE)).toEqual({ agent: 'claude', ok: true, version: '9.9.9 (Claude Code)' })
  const missing = await cliStatus('codex', 'tsrs-no-such-command-xyz')
  expect(missing.ok).toBe(false)
  expect(missing.error).toMatch(/not found|não|not recognized/i)
})

test('stops the agent when the request is stopped', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-cli-'))
  const stop = new AbortController()
  setTimeout(() => stop.abort(), 500)
  const started = Date.now()
  const ended = await runCli(
    { agent: 'claude', command: CLAUDE, chatId: 'c4', turn: 1, prompt: 'slow', transcript: 'slow' },
    () => {},
    { root, signal: stop.signal },
  )
  expect(Date.now() - started).toBeLessThan(10_000)
  expect(ended.code).not.toBe(0)
})
