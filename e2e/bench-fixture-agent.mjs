// A scripted stand-in for an agent, for the bench's own test: does what a good
// agent would for two briefs, or (BENCH_BAD=1) what a careless one would.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const tsrs = (...args) => JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, '..', 'bin', 'tsrs.mjs'), ...args, '--json'], { encoding: 'utf8' }).toString() || '{}')
const prompt = readFileSync(0, 'utf8')
const bad = process.env.BENCH_BAD === '1'
if (prompt.includes('cafe-aurora')) {
  const shot = { scene: 'A cup of coffee on a wooden table by a window at dawn, steam rising', movement: 'push-in', seconds: 5 }
  tsrs('projects', 'write', 'cafe-aurora', 'shots/s01.json', '--text', JSON.stringify(shot))
  const job = tsrs('take', 'cafe-aurora', 'shots/s01.json').result
  if (bad) tsrs('take', 'cafe-aurora', 'shots/s01.json')
  tsrs('jobs', 'wait', job.id, '--seconds', '20')
  console.log(bad ? 'Done: takes/s01.mp4 and takes/s01-final.mp4.' : `Made takes/s01.mp4 (take s01, job ${job.id}).`)
} else if (prompt.includes('milo-ep05')) {
  const r = tsrs('film', 'check', 'milo-ep05')
  console.log(r.result?.ok ? 'O film.json está pronto: 1 shot, sem erros.' : 'Há erros.')
}
