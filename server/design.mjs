// Design tools for project pages, run from the copy of taste-skill in
// vendor/taste-skill (MIT, by Leonxlnx; see vendor/taste-skill/VENDORED.md):
//   - open images: searches open collections (Openverse, Wikimedia Commons,
//     the Art Institute of Chicago, the Met) with no keys, downloads the
//     chosen picture into the project and credits it in CREDITOS.md;
//   - looking at a page: renders a page of the project in Chrome or Edge at
//     three widths, measures it and photographs it, so the model can see what
//     it made;
//   - the art direction draw, for the taste-skill example skill.
// Only the vendored scripts ever run here, never anything from extensoes/.
//
// Mounted by projects.mjs under /__tsrs/projects/design:
//   POST /images/search {"query","source"?,"orientation"?,"limit"?}   {"items":[...]}
//   POST /images/get    {"path","ref","name"?}       {"saved":[...],"text","image"?}
//   POST /inspect       {"path","file","widths"?,"strict"?,"pages"?}  {"findings","text","images"}
//   POST /draw          {"path","args"}             {"text"}

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectFile, writeFiles } from './projects.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const TASTE = resolve(HERE, '..', 'vendor', 'taste-skill')
const SCRIPTS = join(TASTE, 'scripts')
export const IMAGES_FOLDER = 'imagens'
const INSPECT_OUT = '.taste-skill/inspect'
// Pictures go back to the model up to this size each.
const MAX_IMAGE = 3.5 * 1024 * 1024

// What the inspector reports that holds for any page; the rest is taste-skill's
// house style (no gradients, no eyebrow labels, enough motion...), checked only
// when asked or when the page follows a drawn direction.
export const STRUCTURAL = new Set([
  'overflow',
  'side-scroll',
  'broken-image',
  'contrast',
  'covered-text',
  'clipped-text',
  'small-text',
  'body-size',
  'measure',
  'font-fallback',
  'blend-text',
])

const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }

// Runs one of the vendored scripts with node, without a shell, in `cwd`.
// Resolves with stdout even when the script exits with 1 (the inspector does
// when it finds a FAIL); rejects when it could not run at all.
export function runScript(script, args, { cwd, timeout = 60_000, env = {} } = {}) {
  return new Promise((done, fail) => {
    execFile(
      process.execPath,
      [join(SCRIPTS, script), ...args],
      { cwd, timeout, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ...env }, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && (error.killed || typeof error.code !== 'number' || error.code > 1 || !stdout.trim())) {
          const why = error.killed ? `took longer than ${Math.round(timeout / 1000)} s` : (stderr || error.message).trim().split('\n').slice(-6).join('\n')
          return fail(new Error(`${script}: ${why}`))
        }
        done({ stdout, code: error ? error.code : 0 })
      },
    )
  })
}

// The scripts tell an agent to run `node .../draw.mjs ...`; in TSRS the model
// has tools for that instead.
export function asTools(text) {
  // node path/to/x.mjs, the path quoted when it has spaces.
  const script = (name) => `node\\s+(?:"[^"]*?${name}\\.mjs"|[^\\s"]*?${name}\\.mjs)`
  const re = (pattern) => new RegExp(pattern, 'g')
  return String(text)
    .replace(re(script('draw')), 'design_draw')
    .replace(re(`${script('assets')}\\s+--get`), 'get_image')
    .replace(re(script('assets')), 'find_images')
    .replace(re(script('(?:inspect|lint)')), 'inspect_page')
    // Named without running them: "found with scripts/assets.mjs".
    .replace(/(?:<skill>\/)?scripts\/draw\.mjs/g, 'design_draw')
    .replace(/(?:<skill>\/)?scripts\/assets\.mjs/g, 'find_images')
    .replace(/(?:<skill>\/)?scripts\/(?:inspect|lint)\.mjs/g, 'inspect_page')
}

const text = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

// A search, as a short list for the model.
export function searchArgs({ query, source, orientation, limit }) {
  const q = text(query, 120)
  if (!q || q.startsWith('-')) throw new Error('Say what to search for.')
  const args = [q, '--json', '--limit', String(Math.min(10, Math.max(1, Number(limit) || 4)))]
  if (['all', 'openverse', 'commons', 'aic', 'met', 'museums'].includes(source)) args.push('--source', source)
  if (['landscape', 'portrait', 'square'].includes(orientation)) args.push('--orientation', orientation)
  return args
}

export function searchItems(json) {
  const items = []
  for (const source of json.sources ?? []) {
    for (const it of source.items ?? []) {
      items.push({
        ref: it.ref,
        title: text(it.title, 120),
        date: it.date ? text(it.date, 30) : undefined,
        about: it.about ? text(it.about, 160) : undefined,
        width: it.imageWidth ?? it.width,
        height: it.imageHeight ?? it.height,
        source: source.name,
        license: it.licenseLabel,
        credit: it.credit,
        page: it.page,
        thumbnail: it.smaller ?? it.image,
      })
    }
  }
  const errors = (json.sources ?? []).filter((s) => s.error).map((s) => `${s.name}: ${s.error}`)
  return { items, errors }
}

export async function searchImages(job) {
  // A search writes nothing, so it runs outside any project.
  const { stdout } = await runScript('assets.mjs', searchArgs(job), { cwd: tmpdir(), timeout: 100_000 })
  return searchItems(JSON.parse(stdout))
}

async function readCredits(folder) {
  try {
    const list = JSON.parse(await readFile(join(folder, 'credits.json'), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

// One line of CREDITOS.md, as the stock video tool writes them.
export function creditLine(entry, file) {
  const credit = text(entry.credit, 400) || text(entry.title, 200)
  return `- \`${file}\`: ${credit}${entry.page ? ` ([fonte](${entry.page}))` : ''}`
}

async function pictureFor(file) {
  const mime = IMAGE_TYPES[extname(file).toLowerCase()]
  if (!mime || !existsSync(file) || (await stat(file)).size > MAX_IMAGE) return undefined
  return { mime, data: (await readFile(file)).toString('base64') }
}

export async function getImage(project, { ref, name }) {
  const wanted = text(ref, 200)
  if (!/^[a-z]+:[\w.:/%-]+$/i.test(wanted)) throw new Error('Use a ref exactly as find_images gave it, such as openverse:1234.')
  const folder = projectFile(project, IMAGES_FOLDER)
  const args = ['--get', wanted, '--to', IMAGES_FOLDER]
  const clean = text(name, 60).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (clean) args.push('--name', clean)
  const before = new Set((await readCredits(folder)).map((c) => `${c.file}|${c.ref}`))
  const { stdout } = await runScript('assets.mjs', args, { cwd: project, timeout: 120_000 })
  const fresh = (await readCredits(folder)).filter((c) => c.ref === wanted && !before.has(`${c.file}|${c.ref}`))
  const saved = fresh.map((c) => ({
    file: String(c.file).split(sep).join('/'),
    credit: c.credit,
    page: c.page,
    license: c.license,
    width: c.width,
    height: c.height,
  }))
  if (saved.length) {
    await writeFiles(project, [
      { name: 'CREDITOS.md', content: `${saved.map((s) => creditLine(s, s.file)).join('\n')}\n`, append: true },
    ])
  }
  const first = saved[0] && projectFile(project, saved[0].file)
  return {
    saved,
    text: asTools(stdout).trim(),
    image: first ? await pictureFor(first) : undefined,
  }
}

const WIDTHS = [1440, 1280, 1024, 768, 390, 375]

export async function inspectPage(project, { file, widths, strict, pages, allow }) {
  const target = projectFile(project, file)
  if (!target || !/\.html?$/i.test(target) || !existsSync(target)) throw new Error(`No page named ${file} in the project.`)
  const chosen = (Array.isArray(widths) ? widths : []).map(Number).filter((w) => WIDTHS.includes(w))
  const sizes = chosen.length ? chosen.slice(0, 3) : [1440, 768, 390]
  // A page made after a drawn direction is checked against all of taste-skill.
  const drawn = existsSync(join(project, '.taste-skill', 'direction.json'))
  const all = strict === true || (strict !== false && drawn)
  const rel = relative(project, target)
  const allowed = (Array.isArray(allow) ? allow : []).filter((id) => /^[a-z][a-z-]{1,30}$/.test(id))
  const args = [rel, '--json', '--out', INSPECT_OUT, '--widths', sizes.join(',')]
  if (allowed.length) args.push('--allow', allowed.join(','))
  const { stdout } = await runScript('inspect.mjs', args, {
    cwd: project,
    timeout: 180_000,
  })
  const report = JSON.parse(stdout)
  const findings = (report.findings ?? []).filter((f) => all || STRUCTURAL.has(f.id))
  const images = []
  for (const shot of report.images ?? []) {
    const files = [shot.fold, ...(pages ? (shot.pages ?? []).slice(0, 2) : [])]
    for (const path of files) {
      const picture = path && (await pictureFor(path))
      if (picture) images.push({ ...picture, label: relative(project, path).split(sep).join('/') })
    }
  }
  let lint = ''
  if (all) lint = asTools((await runScript('lint.mjs', [rel], { cwd: project, timeout: 30_000 })).stdout).trim()
  return { findings, text: inspectText(report, findings, all, lint), images: images.slice(0, 8) }
}

export function inspectText(report, findings, all, lint) {
  const lines = []
  const first = report.viewports?.[0]?.metrics
  if (first?.hero) lines.push(`Hero headline: "${text(first.hero.text, 70)}", ${first.hero.lines} line(s) at ${first.hero.size}px, ${first.hero.font}.`)
  if (first?.page) lines.push(`Page: ${first.page.screens} screen(s), ${first.page.words} words, ${first.page.img} image(s).`)
  for (const v of report.viewports ?? []) {
    if (v.consoleErrors?.length) lines.push(`Console errors at ${v.width}px: ${v.consoleErrors.map((e) => text(e, 160)).join(' | ')}`)
  }
  const fails = findings.filter((f) => f.level === 'FAIL')
  const warns = findings.filter((f) => f.level !== 'FAIL')
  lines.push(
    findings.length
      ? `${fails.length} problem(s) to fix and ${warns.length} warning(s)${all ? ' (all taste-skill rules)' : ' (layout and legibility only)'}:`
      : `No ${all ? '' : 'layout or legibility '}problems measured. Now look at the screenshots.`,
  )
  for (const f of [...fails, ...warns]) {
    lines.push(`- ${f.level} [${f.id}] at ${f.width}px${f.alsoAt ? ` (also ${f.alsoAt.join(', ')})` : ''}: ${text(f.message, 400)}`)
    if (f.fix) lines.push(`  fix: ${text(f.fix, 400)}`)
  }
  if (lint) lines.push('', lint)
  return lines.join('\n')
}

// The draw's options, each checked: values go to the script as arguments, so
// none may pass for another flag.
const WORD = /^[\w ,.:=&'()/-]{1,200}$/
export function drawArgs(input = {}) {
  const args = []
  const add = (flag, value) => {
    if (value === undefined || value === null || value === '') return
    const plain = text(value, 200)
    if (!WORD.test(plain) || plain.startsWith('-')) throw new Error(`Not a valid value for ${flag}: ${plain}`)
    args.push(`--${flag}`, plain)
  }
  const list = (value) => (Array.isArray(value) ? value.join(',') : value)
  switch (input.action) {
    case 'show':
      return ['--show']
    case 'list':
      add('list', input.what ?? 'directions')
      return args
    case 'site':
      add('site', input.site)
      return args
    case 'photos':
      add('photos', input.query ?? 'list')
      return args
    case 'alternatives':
      add('alternatives', input.role)
      return args
    case 'redraw':
      add('redraw', input.slot)
      if (input.seed !== undefined) add('seed', Number(input.seed))
      return args
    case 'options':
    case 'direction':
    case undefined: {
      add('sector', input.sector)
      add('brief', input.brief)
      add('sections', list(input.sections))
      add('tone', input.tone)
      add('have', list(input.have))
      add('keep', list(input.keep))
      add('avoid', list(input.avoid))
      if (input.seed !== undefined) add('seed', Number(input.seed))
      if (input.action === 'direction') add('direction', input.direction)
      else args.push('--options', '3')
      if (!args.includes('--sector') || !args.includes('--brief')) throw new Error('Give the sector and a one-line brief.')
      return args
    }
    default:
      throw new Error(`Unknown action: ${input.action}`)
  }
}

export async function drawDirection(project, input, historyFile) {
  const { stdout } = await runScript('draw.mjs', drawArgs(input), {
    cwd: project,
    timeout: 30_000,
    env: { TASTE_SKILL_HISTORY: historyFile },
  })
  const own = existsSync(join(project, 'DESIGN.md'))
    ? "This project has a DESIGN.md: its fonts, colours and rules win over the draw. Take only the composition from the sheet (draw with keep: ['palette', 'type']).\n\n"
    : ''
  return { text: own + asTools(stdout).trim() }
}
