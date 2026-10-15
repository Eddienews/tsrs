// Project folders: the files a conversation makes (a page, its styles, a
// motion video) are written to a real folder on this computer, so a browser
// crash loses nothing and Claude Code, Codex or any editor can carry on from
// the same files. By default each project gets its own folder under
// projetos/ in the TSRS folder (TSRS_PROJECTS to change it); the user may
// point a conversation at any other folder instead.
//
// Mounted inside the TSRS dev server at /__tsrs/projects (projects-plugin.mjs):
//   GET  /health                       {"ok":true,"root"}
//   POST /open   {"name","path"?,"notes"?}   {"path","name"}
//   POST /write  {"path","files":[{"name","content","append"?}]}   {"written":[...]}
//   POST /copy   {"from","to"}          {"copied":[...]}
//   POST /stock/search   {"provider","key","query","orientation"?,"count"?}   {"clips":[...]}
//   POST /stock/download {"path","url","name"}   {"name","size"}
//   GET  /list?path=                    {"files":[{"name","size","modified"}]}
//   GET  /read?path=&file=              {"content"}
//   GET  /raw/<base64url path>/<file>   the file itself, for the preview

import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, stat, writeFile, appendFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadStock, searchStock } from './stock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REGISTRY = '.tsrs-projects.json'
const SKIP = new Set(['node_modules', '.git', 'dist', '.next', '.venv', '__pycache__'])
const MAX_LIST = 1000
const MAX_READ = 512 * 1024
const MAX_BODY = 20 * 1024 * 1024

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

export function projectsRoot() {
  return process.env.TSRS_PROJECTS ? resolve(process.env.TSRS_PROJECTS) : resolve(HERE, '..', 'projetos')
}

// A folder name from a title: letters, digits and dashes, on any system.
export function slug(title) {
  const plain = String(title ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return plain || 'projeto'
}

function within(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

// A file inside the project, from a relative name the model or the app gave;
// null for anything that would leave it or touch git's own files.
export function projectFile(project, name) {
  const clean = String(name ?? '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!clean || clean.split('/').some((part) => part === '..' || part === '.git')) return null
  if (/^[a-zA-Z]:/.test(clean)) return null
  const file = resolve(project, clean)
  return within(project, file) && file !== project ? file : null
}

async function registry(root) {
  try {
    const data = JSON.parse(await readFile(join(root, REGISTRY), 'utf8'))
    return Array.isArray(data.external) ? data.external : []
  } catch {
    return []
  }
}

// A folder may be used when it is under the projects root or the user chose it.
export async function allowed(root, path) {
  if (typeof path !== 'string' || !isAbsolute(path)) return false
  const folder = resolve(path)
  if (within(root, folder)) return true
  return (await registry(root)).some((known) => resolve(known) === folder)
}

async function register(root, path) {
  const list = await registry(root)
  if (list.some((known) => resolve(known) === resolve(path))) return
  await mkdir(root, { recursive: true })
  await writeFile(join(root, REGISTRY), JSON.stringify({ external: [...list, resolve(path)] }, null, 2))
}

// Opens the folder a conversation saves into: a new one under the root named
// after it, or the folder the user chose, created if missing.
export async function openProject(root, { name, path, notes }) {
  let folder
  if (path) {
    if (!isAbsolute(path)) throw new Error('Use the full path of the folder.')
    folder = resolve(path)
    await mkdir(folder, { recursive: true })
    if (!within(root, folder)) await register(root, folder)
  } else {
    await mkdir(root, { recursive: true })
    const base = slug(name)
    folder = join(root, base)
    for (let n = 2; existsSync(folder); n++) folder = join(root, `${base}-${n}`)
    await mkdir(folder, { recursive: true })
  }
  if (notes && !existsSync(join(folder, 'NOTAS.md'))) await writeFile(join(folder, 'NOTAS.md'), notes)
  return { path: folder, name: basename(folder) }
}

export async function writeFiles(project, files) {
  const written = []
  for (const file of files ?? []) {
    const target = projectFile(project, file.name)
    if (!target) throw new Error(`Not a file name inside the project: ${file.name}`)
    await mkdir(dirname(target), { recursive: true })
    const content = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : String(file.content ?? '')
    if (file.append) await appendFile(target, content)
    else await writeFile(target, content)
    written.push(relative(project, target).split(sep).join('/'))
  }
  return written
}

export async function listFiles(project) {
  const files = []
  async function walk(folder, depth) {
    if (depth > 6 || files.length >= MAX_LIST) return
    let entries = []
    try {
      entries = await readdir(folder, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (files.length >= MAX_LIST) return
      const full = join(folder, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) await walk(full, depth + 1)
      } else if (entry.isFile()) {
        const info = await stat(full)
        files.push({
          name: relative(project, full).split(sep).join('/'),
          size: info.size,
          modified: Math.round(info.mtimeMs),
        })
      }
    }
  }
  await walk(project, 0)
  return files
}

export async function readText(project, name) {
  const file = projectFile(project, name)
  if (!file || !existsSync(file)) throw new Error(`No file named ${name} in the project.`)
  const info = await stat(file)
  if (info.size > MAX_READ) throw new Error(`${name} has ${info.size} bytes; only files up to 512 KB are read.`)
  const bytes = await readFile(file)
  if (bytes.includes(0)) throw new Error(`${name} is not a text file.`)
  return bytes.toString('utf8')
}

export async function copyProject(from, to) {
  const copied = []
  for (const file of await listFiles(from)) {
    const target = projectFile(to, file.name)
    if (!target) continue
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(from, file.name), target)
    copied.push(file.name)
  }
  return copied
}

export const encodePath = (path) => Buffer.from(path, 'utf8').toString('base64url')
const decodePath = (token) => Buffer.from(token, 'base64url').toString('utf8')

async function body(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('The files pass 20 MB.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

// Answers the paths above, relative to where it is mounted; false for others.
export function projectsHandler(root = projectsRoot()) {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://tsrs.local')
    const path = url.pathname
    try {
      if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, root }), true

      const raw = /^\/raw\/([\w-]+)\/(.+)$/.exec(path)
      if (req.method === 'GET' && raw) {
        const project = decodePath(raw[1])
        const file = (await allowed(root, project)) && projectFile(project, decodeURIComponent(raw[2]))
        if (!file || !existsSync(file) || !(await stat(file)).isFile()) {
          res.writeHead(404).end()
          return true
        }
        res.writeHead(200, {
          'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        res.end(await readFile(file))
        return true
      }

      if (req.method === 'GET' && (path === '/list' || path === '/read')) {
        const project = url.searchParams.get('path') ?? ''
        if (!(await allowed(root, project))) return send(res, 403, { error: 'Not a project folder.' }), true
        if (path === '/list') return send(res, 200, { files: await listFiles(project) }), true
        return send(res, 200, { content: await readText(project, url.searchParams.get('file')) }), true
      }

      if (req.method !== 'POST') return false
      const job = await body(req)
      if (path === '/open') return send(res, 200, await openProject(root, job)), true
      if (path === '/write') {
        if (!(await allowed(root, job.path))) return send(res, 403, { error: 'Not a project folder.' }), true
        return send(res, 200, { written: await writeFiles(job.path, job.files) }), true
      }
      // Stock video for short videos: searched with the user's key, saved in midia/stock/.
      if (path === '/stock/search') return send(res, 200, { clips: await searchStock(job) }), true
      if (path === '/stock/download') {
        if (!(await allowed(root, job.path))) return send(res, 403, { error: 'Not a project folder.' }), true
        const name = `midia/stock/${String(job.name ?? '').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'clip'}.mp4`
        const file = projectFile(job.path, name)
        if (!file) return send(res, 400, { error: 'Bad file name.' }), true
        // The same clip is downloaded once per project.
        if (existsSync(file)) return send(res, 200, { name, size: (await stat(file)).size, cached: true }), true
        const { size } = await downloadStock(String(job.url ?? ''), file)
        return send(res, 200, { name, size }), true
      }
      if (path === '/copy') {
        if (!(await allowed(root, job.from)) || !(await allowed(root, job.to)))
          return send(res, 403, { error: 'Not a project folder.' }), true
        return send(res, 200, { copied: await copyProject(job.from, job.to) }), true
      }
      return false
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : String(error) }), true
    }
  }
}
