#!/usr/bin/env node
// tsrs: use the running TSRS from a terminal or an agent (Claude Code, Codex,
// a bot). `tsrs --help` lists the commands; `tsrs mcp` offers the same ones
// as an MCP server on stdio. No dependencies: Node 20 or later.
//
// It finds TSRS through the agent file the server writes when it starts
// (<extensions folder>/.tsrs-agent.json: its address and a token), so it only
// works on the computer, and for the user, running TSRS.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMMANDS, checkArgs, findCommand, helpText, needsYes, parseWords } from '../server/agent-commands.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EXIT = { ok: 0, invalid: 2, confirm: 3, offline: 4, failed: 5 }

export function agentFilePath(env = process.env) {
  const root = env.TSRS_EXTENSIONS ? resolve(env.TSRS_EXTENSIONS) : resolve(HERE, '..', 'extensoes')
  return resolve(root, '.tsrs-agent.json')
}

const offline = (why) =>
  Object.assign(new Error(`TSRS is not running${why ? ` (${why})` : ''}. Start it in the TSRS folder with: npm run dev`), { code: 'offline' })

function agentInfo() {
  try {
    const info = JSON.parse(readFileSync(agentFilePath(), 'utf8'))
    if (!info.url || !info.token) throw new Error('incomplete')
    return info
  } catch {
    throw offline()
  }
}

// What the CLI does before sending: a file given with --from goes as base64.
export function prepare(name, args) {
  if (name !== 'projects write' || args.from === undefined) return args
  if (args.text !== undefined) throw Object.assign(new Error('Give --from or --text, not both.'), { code: 'invalid' })
  let data
  try {
    data = readFileSync(resolve(String(args.from)))
  } catch (error) {
    throw Object.assign(new Error(`Cannot read ${args.from}: ${error.code ?? error.message}`), { code: 'invalid' })
  }
  const { from: _from, ...rest } = args
  return { ...rest, base64: data.toString('base64') }
}

// Sends one command to TSRS. Resolves with the answer { ok, text, result } or
// { ok: false, code, error }; `progress` gets { frame, frames } during a render.
export async function send(name, args, yes, progress = () => {}) {
  const { url, token } = agentInfo()
  let res
  try {
    res = await fetch(`${url}/__tsrs/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ command: name, args, yes }),
    })
  } catch (error) {
    throw offline(error.cause?.code === 'ECONNREFUSED' ? `nothing answers at ${url}` : error.cause?.code ?? error.message)
  }
  if (res.status === 401 || res.status === 403) {
    const answer = await res.json().catch(() => ({}))
    throw offline(answer.error ?? `refused, ${res.status}`)
  }
  if (res.status === 404) throw offline(`${url} is not a TSRS with the agent commands; update it`)
  if (!(res.headers.get('content-type') ?? '').includes('ndjson')) return res.json()
  // A render: one line of JSON per frame update, then the answer.
  let rest = ''
  let last = null
  const decoder = new TextDecoder()
  for await (const chunk of res.body) {
    rest += decoder.decode(chunk, { stream: true })
    const lines = rest.split('\n')
    rest = lines.pop()
    for (const line of lines.filter(Boolean)) {
      const value = JSON.parse(line)
      if ('ok' in value) last = value
      else progress(value)
    }
  }
  if (rest.trim()) last = JSON.parse(rest)
  return last ?? { ok: false, code: 'failed', error: 'TSRS stopped answering during the render.' }
}

const codeOf = (error) => (error?.code in EXIT ? error.code : 'failed')

async function cli(argv) {
  const out = (line) => process.stdout.write(`${line}\n`)
  const err = (line) => process.stderr.write(`${line}\n`)
  let parsed
  try {
    parsed = parseWords(argv)
  } catch (error) {
    err(`tsrs: ${error.message}`)
    return EXIT.invalid
  }
  if (!parsed.command) {
    if (parsed.words.length && !parsed.help) {
      err(`tsrs: no command "${parsed.words.join(' ')}".\n`)
      err(helpText())
      return EXIT.invalid
    }
    out(helpText())
    return EXIT.ok
  }
  const { command, json, yes } = parsed
  if (parsed.help) {
    out(helpText(command))
    return EXIT.ok
  }
  let answer
  try {
    checkArgs(command, parsed.args)
    let shown = -1
    answer = await send(command.name, prepare(command.name, parsed.args), yes, ({ frame, frames }) => {
      const tenth = Math.floor((frame / frames) * 10)
      if (!json && tenth > shown && process.stderr.isTTY) {
        shown = tenth
        err(`rendering: frame ${frame} of ${frames}`)
      }
    })
  } catch (error) {
    answer = { ok: false, code: codeOf(error), error: error.message }
  }
  const code = answer.ok ? 'ok' : answer.code === 'busy' ? 'failed' : codeOf(answer)
  if (json) out(JSON.stringify(answer, null, 2))
  else if (answer.ok) out(answer.text)
  else err(`tsrs: ${answer.error}`)
  return EXIT[code]
}

// ---- tsrs mcp: the same commands as MCP tools, over stdio ----------------

export const toolName = (name) => name.replace(/ /g, '_')

export function mcpTools() {
  return COMMANDS.map((command) => {
    const properties = {}
    for (const arg of command.args) {
      properties[arg.name] =
        arg.type === 'number'
          ? { type: 'number', description: arg.help }
          : arg.type === 'list'
            ? { type: 'array', items: { type: 'string' }, description: arg.help }
            : { type: 'string', description: arg.help }
    }
    if (needsYes(command)) {
      properties.yes = {
        type: 'boolean',
        description: 'true to really do it. Without it the tool only says what it would do: ask the user first, then call again with yes.',
      }
    }
    return {
      name: toolName(command.name),
      title: `tsrs ${command.name}`,
      description: `${command.summary} [${command.kind}]`,
      inputSchema: { type: 'object', properties, required: command.args.filter((a) => a.required).map((a) => a.name) },
      annotations: {
        readOnlyHint: command.kind === 'read',
        destructiveHint: command.kind === 'destructive',
        openWorldHint: command.kind === 'cost',
      },
    }
  })
}

// Answers one JSON-RPC message; null for notifications.
export async function mcpAnswer(message, run = send) {
  const reply = (result) => ({ jsonrpc: '2.0', id: message.id, result })
  const fail = (code, text) => ({ jsonrpc: '2.0', id: message.id, error: { code, message: text } })
  if (message.id === undefined) return null
  switch (message.method) {
    case 'initialize':
      return reply({
        protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'tsrs', version: JSON.parse(readFileSync(resolve(HERE, '..', 'package.json'), 'utf8')).version },
        instructions:
          'Drives the TSRS running on this computer: project folders, motion renders, the design check, the production board, the schedule and local images. Tools marked destructive or cost (and replacing a file) only say what they would do until called with yes: true; ask the user before that.',
      })
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: mcpTools() })
    case 'tools/call': {
      const command = COMMANDS.find((c) => toolName(c.name) === message.params?.name)
      if (!command) return fail(-32602, `No tool ${message.params?.name}`)
      const { yes, ...args } = message.params?.arguments ?? {}
      let answer
      try {
        checkArgs(command, args)
        answer = await run(command.name, prepare(command.name, args), yes === true)
      } catch (error) {
        answer = { ok: false, code: codeOf(error), error: error.message }
      }
      const text = answer.ok ? answer.text : answer.code === 'confirm' ? `${answer.error.replace(/ Add --yes[^.]*\./, '')} Not done: call again with yes: true once the user agrees.` : answer.error
      return reply({
        content: [{ type: 'text', text }],
        ...(answer.ok && answer.result !== undefined ? { structuredContent: { result: answer.result } } : {}),
        isError: !answer.ok,
      })
    }
    default:
      return fail(-32601, `Unknown method ${message.method}`)
  }
}

async function mcp() {
  let rest = ''
  const write = (value) => value && process.stdout.write(`${JSON.stringify(value)}\n`)
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    rest += chunk
    const lines = rest.split('\n')
    rest = lines.pop()
    for (const line of lines.filter((l) => l.trim())) {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
        continue
      }
      // Calls run side by side; a render does not hold up a status.
      mcpAnswer(message).then(write, (error) => write({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } }))
    }
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const argv = process.argv.slice(2)
  if (argv[0] === 'mcp') mcp()
  else cli(argv).then((code) => process.exit(code))
}
