// A stand-in for `codex exec --json` in the tests: it reads the prompt on
// stdin and answers in Codex's JSONL, echoing the last line it got.
import { randomUUID } from 'node:crypto'

const args = process.argv.slice(2)
if (args[0] === '--version') {
  console.log('codex-cli 9.9.9')
  process.exit(0)
}
let input = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) input += chunk
const at = args.indexOf('resume')
const thread = at >= 0 ? args[at + 1] : randomUUID()
const said = input.trim().split('\n').at(-1)
const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`)
out({ type: 'debug', args, stdin: input, cwd: process.cwd() })
out({ type: 'thread.started', thread_id: thread })
out({ type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Codex is ignoring 1 unrecognized configuration setting.' } })
out({ type: 'turn.started' })
out({ type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'ls', status: 'in_progress' } })
out({ type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: 'ls', aggregated_output: 'NOTAS.md\n', exit_code: 0, status: 'completed' } })
out({ type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: `eco: ${said}` } })
out({ type: 'turn.completed', usage: { input_tokens: 50, cached_input_tokens: 20, output_tokens: 6 } })
