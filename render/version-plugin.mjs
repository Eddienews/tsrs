// Which TSRS is running: the version in package.json and the git commit it was
// served or built from, as the module `virtual:tsrs-version`. The interface
// shows it, so a screenshot says which code was on screen. Under npm run dev it
// follows the folder: after a git pull or a commit, the page reloads with the
// new number instead of keeping the one from when the server started.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ID = 'virtual:tsrs-version'
const RESOLVED = '\0' + ID

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

// What the module exports: no clock and nothing secret, only names and dates
// git already knows.
export function versionInfo(dev) {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
  return {
    version: String(pkg.version ?? '0.0.0'),
    commit: git(['rev-parse', '--short=7', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    // Tracked files changed since that commit.
    dirty: git(['status', '--porcelain', '--untracked-files=no']) !== '',
    // When that commit was made.
    date: git(['log', '-1', '--format=%cI']),
    dev,
  }
}

export function tsrsVersion() {
  let dev = false
  return {
    name: 'tsrs-version',
    configResolved(config) {
      dev = config.command === 'serve' && !config.isProduction
    },
    resolveId: (id) => (id === ID ? RESOLVED : null),
    load: (id) => (id === RESOLVED ? `export default ${JSON.stringify(versionInfo(dev))}` : null),
    configureServer(server) {
      let last = JSON.stringify(versionInfo(true))
      const timer = setInterval(() => {
        const now = JSON.stringify(versionInfo(true))
        if (now === last) return
        last = now
        const module = server.moduleGraph.getModuleById(RESOLVED)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      }, 5000)
      timer.unref?.()
      server.httpServer?.once('close', () => clearInterval(timer))
    },
  }
}
