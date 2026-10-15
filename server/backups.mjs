// Automatic backups on disk: the browser keeps conversations and settings in
// its own storage, which a cleanup can wipe (Chrome's "delete data when you
// close all windows" did, after a restart). TSRS writes a copy to a folder on
// this computer a few seconds after every change, so nothing depends on the
// browser alone.
//
// backups/ in the TSRS folder (TSRS_BACKUPS to change it) holds:
//   atual.json            the latest backup
//   atual.meta.json       when it was saved, how many conversations, whether
//                         the API keys are in it (only ever sealed with the
//                         user's password)
//   tsrs-YYYY-MM-DD.json  how things stood at the end of each earlier day,
//                         kept for KEEP_DAYS days
//   tsrs-YYYY-MM-DD-HHMMSS-antes.json   the backup before one that has fewer
//                         conversations, so an emptied browser cannot replace
//                         a full backup without a trace
//
// Mounted inside the TSRS dev server at /__tsrs/backups (backups-plugin.mjs):
//   GET  /status   {"dir","latest": meta | null}, or {"off":true}
//   POST /save     the backup JSON                 meta
//   GET  /latest   atual.json itself

import { createReadStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const KEEP_DAYS = 14
const MAX_BODY = 1024 * 1024 * 1024
const LATEST = 'atual.json'
const LATEST_META = 'atual.meta.json'

// TSRS_BACKUPS=off turns them off (the tests do, since every test starts
// with an empty browser and would be offered the others' backups).
export function backupsRoot() {
  if (process.env.TSRS_BACKUPS === 'off') return null
  return process.env.TSRS_BACKUPS ? resolve(process.env.TSRS_BACKUPS) : resolve(HERE, '..', 'backups')
}

const pad = (n) => String(n).padStart(2, '0')
export function dayOf(time) {
  const d = new Date(time)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const clockOf = (time) => {
  const d = new Date(time)
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// What the backup says about itself, checked before anything is replaced.
export function backupMeta(text, now) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('The backup is not valid JSON.')
  }
  if (data?.app !== 'tsrs' || !Array.isArray(data.chats)) throw new Error('This is not a TSRS backup.')
  return {
    savedAt: now,
    day: dayOf(now),
    chats: data.chats.length,
    keys: data.settings?.vault ? 'sealed' : 'none',
    size: Buffer.byteLength(text),
  }
}

async function readMeta(root) {
  try {
    return JSON.parse(await readFile(join(root, LATEST_META), 'utf8'))
  } catch {
    return null
  }
}

// Daily copies older than KEEP_DAYS days go; the latest backup always stays.
export async function prune(root, now) {
  const limit = dayOf(now - KEEP_DAYS * 86_400_000)
  for (const name of await readdir(root)) {
    const day = /^tsrs-(\d{4}-\d{2}-\d{2})/.exec(name)?.[1]
    if (day && day < limit && name.endsWith('.json')) await unlink(join(root, name)).catch(() => {})
  }
}

export async function saveBackup(root, text, now = Date.now()) {
  const meta = backupMeta(text, now)
  await mkdir(root, { recursive: true })
  const latest = join(root, LATEST)
  const previous = existsSync(latest) ? await readMeta(root) : null
  if (previous) {
    // The first save of a day keeps the last one of the day before.
    if (previous.day !== meta.day) {
      const daily = join(root, `tsrs-${previous.day}.json`)
      if (!existsSync(daily)) await copyFile(latest, daily)
    } else if (meta.chats < previous.chats) {
      await copyFile(latest, join(root, `tsrs-${previous.day}-${clockOf(previous.savedAt)}-antes.json`))
    }
  }
  // Written aside and moved into place, so a crash mid-write leaves the old one.
  const temp = join(root, `${LATEST}.${process.pid}.tmp`)
  await writeFile(temp, text)
  await rename(temp, latest)
  await writeFile(join(root, LATEST_META), JSON.stringify(meta, null, 2))
  await prune(root, now)
  return meta
}

function readBody(req) {
  return new Promise((done, fail) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        fail(new Error('The backup is too large.'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')))
    req.on('error', fail)
  })
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

// Handles a request below the mount point; false when the path is not ours.
export function backupsHandler(root) {
  return async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (!root) return send(res, 200, { off: true }), true
    if (req.method === 'GET' && path === '/status') {
      return send(res, 200, { dir: root, latest: existsSync(join(root, LATEST)) ? await readMeta(root) : null }), true
    }
    if (req.method === 'POST' && path === '/save') {
      try {
        return send(res, 200, await saveBackup(root, await readBody(req))), true
      } catch (error) {
        return send(res, 400, { error: error instanceof Error ? error.message : String(error) }), true
      }
    }
    if (req.method === 'GET' && path === '/latest') {
      const file = join(root, LATEST)
      if (!existsSync(file)) return send(res, 404, { error: 'No backup yet.' }), true
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': (await stat(file)).size })
      createReadStream(file).pipe(res)
      return true
    }
    return false
  }
}
