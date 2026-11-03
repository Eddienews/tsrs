import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { launchBrowser } from '/home/claude/tsrs/render/render.mjs'
import { insertHead, motionHead } from '/home/claude/tsrs/render/motion.mjs'
const [dir, times, outDir] = process.argv.slice(2)
const code = readFileSync(`${dir}/${process.argv[5]}`, 'utf8')
writeFileSync(`${dir}/_stills.html`, insertHead(code, motionHead(code, '/__motion/')))
const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', dir], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 800))
const b = await launchBrowser()
const tab = await b.newPage({ viewport: { width: +process.argv[6], height: +process.argv[7] } })
const errs = []
tab.on('pageerror', (e) => errs.push(e.message)); tab.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await tab.goto('http://127.0.0.1:8765/_stills.html', { waitUntil: 'load' })
await tab.evaluate(() => window.NWLab.boot())
for (const t of times.split(',').map(Number)) {
  await tab.evaluate((x) => window.NWLab.seek(x), t)
  await tab.screenshot({ path: `${outDir}/t${String(t).replace('.', '_')}.jpg`, type: 'jpeg', quality: 85 })
}
console.log('errors:', errs)
await b.close(); srv.kill()
