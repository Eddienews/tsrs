// A stand-in for Claude Code's command line in the tests: it reads the prompt
// on stdin and answers in stream-json, as `claude -p --output-format
// stream-json --include-partial-messages` does, echoing the last line it got.
// A debug line tells the test the arguments and the prompt.
import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
if (args[0] === '--version') {
  console.log('9.9.9 (Claude Code)')
  process.exit(0)
}
let input = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) input += chunk
const at = args.indexOf('--resume')
const session = at >= 0 ? args[at + 1] : randomUUID()
const said = input.trim().split('\n').at(-1)
const out = (event) => process.stdout.write(`${JSON.stringify({ ...event, session_id: session })}\n`)
if (said === 'slow') await new Promise((done) => setTimeout(done, 30_000))
if (said === 'fail') {
  process.stderr.write('Something went wrong in the agent.\n')
  process.exit(3)
}
out({ type: 'debug', args, stdin: input, cwd: process.cwd() })
// What it was sent, kept in its folder, so the tests see where it worked and what it got.
appendFileSync('agente.log', `${JSON.stringify({ args, stdin: input })}\n`)
out({ type: 'system', subtype: 'init', cwd: process.cwd(), tools: ['Read', 'Bash'] })
out({ type: 'stream_event', event: { type: 'message_start', message: { role: 'assistant', content: [] } }, parent_tool_use_id: null })
out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Vou listar a pasta.' } }, parent_tool_use_id: null })
out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }] }, parent_tool_use_id: null })
out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'NOTAS.md\nmidia' }] }, parent_tool_use_id: null })
out({ type: 'stream_event', event: { type: 'message_start', message: { role: 'assistant', content: [] } }, parent_tool_use_id: null })
for (const piece of ['eco: ', said]) {
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } }, parent_tool_use_id: null })
}
out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.42, resetsAt: 1793016000 } })
out({ type: 'result', subtype: 'success', is_error: false, result: `eco: ${said}`, usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 }, total_cost_usd: 0.01 })
