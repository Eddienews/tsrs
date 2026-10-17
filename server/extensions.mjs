// Extensions kept on disk, in extensoes/ in the TSRS folder (TSRS_EXTENSIONS
// to change it), so they survive the browser and can be shared:
//
//   extensoes/skills/<name>/SKILL.md          skills in Claude's format
//   extensoes/plugins/<name>/...              plugins (see plugins below)
//   extensoes/_removidas/                     what was removed, never deleted
//
// A skill is a folder with a SKILL.md: YAML front matter with `name` and
// `description`, then the instructions, plus any files they mention. The model
// sees only the names and descriptions and loads a skill when a task needs it,
// as Claude does.

import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectFile, slug } from './projects.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAX_FILE = 512 * 1024

export function extensionsRoot() {
  return process.env.TSRS_EXTENSIONS ? resolve(process.env.TSRS_EXTENSIONS) : resolve(HERE, '..', 'extensoes')
}

// The YAML front matter of a Markdown file, as flat keys, and the text after
// it. Enough YAML for skills: `key: value`, quoted values, and folded (>) or
// literal (|) blocks.
export function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { meta: {}, body: text }
  const meta = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const field = /^([\w-]+):\s*(.*)$/.exec(lines[i])
    if (!field) continue
    let value = field[2].trim()
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const block = []
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
        block.push(lines[++i].trim())
      }
      value = value.startsWith('>') ? block.filter(Boolean).join(' ') : block.join('\n').trim()
    } else if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1)
    }
    meta[field[1]] = value
  }
  return { meta, body: text.slice(match[0].length) }
}

async function filesIn(folder) {
  const out = []
  async function walk(dir, depth) {
    if (depth > 5 || out.length > 300) return
    let entries = []
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') && entry.name !== '.claude-plugin' && entry.name !== '.mcp.json') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full, depth + 1)
      else if (entry.isFile()) out.push(relative(folder, full).split(sep).join('/'))
    }
  }
  await walk(folder, 0)
  return out
}

async function skillAt(folder, source) {
  const file = join(folder, 'SKILL.md')
  if (!existsSync(file)) return null
  const { meta } = frontMatter(await readFile(file, 'utf8'))
  const name = String(meta.name || folder.split(sep).pop())
  return {
    id: source === 'user' ? name : `${source}:${name}`,
    name,
    description: String(meta.description ?? ''),
    source,
    folder,
    files: (await filesIn(folder)).filter((f) => f !== 'SKILL.md'),
  }
}

async function subfolders(folder) {
  try {
    return (await readdir(folder, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
      .map((e) => join(folder, e.name))
  } catch {
    return []
  }
}

// Every skill: the user's own and those that came with plugins.
export async function listSkills(root = extensionsRoot()) {
  const skills = []
  for (const folder of await subfolders(join(root, 'skills'))) {
    const skill = await skillAt(folder, 'user')
    if (skill) skills.push(skill)
  }
  for (const plugin of await subfolders(join(root, 'plugins'))) {
    const name = (await pluginManifest(plugin)).name
    for (const folder of await subfolders(join(plugin, 'skills'))) {
      const skill = await skillAt(folder, name)
      if (skill) skills.push(skill)
    }
  }
  return skills
}

async function findSkill(root, id) {
  const skill = (await listSkills(root)).find((s) => s.id === id || s.name === id)
  if (!skill) throw new Error(`No skill named ${id}.`)
  return skill
}

export async function readSkill(root, id) {
  const skill = await findSkill(root, id)
  const text = await readFile(join(skill.folder, 'SKILL.md'), 'utf8')
  return { ...skill, text, body: frontMatter(text).body.trim() }
}

export async function readSkillFile(root, id, name) {
  const skill = await findSkill(root, id)
  const file = projectFile(skill.folder, name)
  if (!file || !existsSync(file)) throw new Error(`The skill ${skill.name} has no file named ${name}.`)
  if ((await stat(file)).size > MAX_FILE) throw new Error(`${name} is too big to read (over 512 KB).`)
  const bytes = await readFile(file)
  if (bytes.includes(0)) throw new Error(`${name} is not a text file.`)
  return bytes.toString('utf8')
}

// Files of an archive or folder, as { name, data (base64) }, trimmed to the
// folder that holds `marker` (SKILL.md, .claude-plugin/plugin.json…).
export function rootedAt(files, marker) {
  const found = files
    .map((f) => f.name.replace(/\\/g, '/'))
    .filter((name) => name === marker || name.endsWith(`/${marker}`))
    .sort((a, b) => a.length - b.length)[0]
  if (!found) return null
  const base = found.slice(0, found.length - marker.length)
  return files
    .map((f) => ({ ...f, name: f.name.replace(/\\/g, '/') }))
    .filter((f) => f.name.startsWith(base) && !f.name.startsWith('__MACOSX/'))
    .map((f) => ({ ...f, name: f.name.slice(base.length) }))
    .filter((f) => f.name && !f.name.endsWith('/'))
}

async function writeTree(folder, files) {
  // Every name is checked before anything is written.
  for (const file of files) {
    if (!projectFile(folder, file.name)) throw new Error(`Not a file name inside the folder: ${file.name}`)
  }
  for (const file of files) {
    const target = projectFile(folder, file.name)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.encoding === 'text' ? file.data : Buffer.from(file.data, 'base64'))
  }
}

// Moves a folder aside instead of deleting it.
async function setAside(root, folder) {
  const shelf = join(root, '_removidas')
  await mkdir(shelf, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await rename(folder, join(shelf, `${folder.split(sep).pop()}-${stamp}`))
}

// Installs a skill from the files of a .zip, a .skill or a folder; replaces
// an installed skill of the same name, keeping the old one aside.
export async function installSkill(root, files) {
  const tree = rootedAt(files, 'SKILL.md')
  if (!tree) throw new Error('There is no SKILL.md in what was sent.')
  const skillFile = tree.find((f) => f.name === 'SKILL.md')
  const text = skillFile.encoding === 'text' ? skillFile.data : Buffer.from(skillFile.data, 'base64').toString('utf8')
  const { meta } = frontMatter(text)
  if (!meta.name) throw new Error('SKILL.md has no name in its front matter (name: …).')
  const folder = join(root, 'skills', slug(meta.name))
  for (const file of tree) if (!projectFile(folder, file.name)) throw new Error(`Not a file name inside the folder: ${file.name}`)
  if (existsSync(folder)) await setAside(root, folder)
  await writeTree(folder, tree)
  return skillAt(folder, 'user')
}

function yamlValue(text) {
  return /[:#\n"']|^\s|\s$/.test(text) ? JSON.stringify(text) : text
}

// Writes a skill made in the app: its SKILL.md only.
export async function saveSkill(root, { name, description, body, previous }) {
  if (!String(name ?? '').trim()) throw new Error('A skill needs a name.')
  const folder = join(root, 'skills', slug(name))
  if (previous && previous !== name) {
    const old = join(root, 'skills', slug(previous))
    if (existsSync(old) && old !== folder) await rename(old, folder)
  }
  await mkdir(folder, { recursive: true })
  const text = `---\nname: ${yamlValue(name.trim())}\ndescription: ${yamlValue(String(description ?? '').trim())}\n---\n\n${String(body ?? '').trim()}\n`
  await writeFile(join(folder, 'SKILL.md'), text)
  return skillAt(folder, 'user')
}

export async function removeSkill(root, id) {
  const skill = await findSkill(root, id)
  if (skill.source !== 'user') throw new Error('This skill came with a plugin; remove the plugin instead.')
  await setAside(root, skill.folder)
}

// --- Plugins ---------------------------------------------------------------

// A plugin's manifest: .claude-plugin/plugin.json (Claude's format) or
// plugin.json; the folder's name when it has neither.
export async function pluginManifest(folder) {
  for (const name of ['.claude-plugin/plugin.json', 'plugin.json']) {
    try {
      const json = JSON.parse(await readFile(join(folder, name), 'utf8'))
      return { name: String(json.name || folder.split(sep).pop()), description: String(json.description ?? ''), version: String(json.version ?? ''), author: typeof json.author === 'object' ? String(json.author?.name ?? '') : String(json.author ?? '') }
    } catch {
      // Try the next place.
    }
  }
  return { name: folder.split(sep).pop(), description: '', version: '', author: '' }
}

// A plugin, in Claude's layout plus TSRS's own tools:
//   .claude-plugin/plugin.json   name, description, version, author
//   skills/<name>/SKILL.md       skills
//   commands/<name>.md           prompts, used as /name (description in the front matter)
//   agents/<name>.md             agents: the body is the system prompt
//   .mcp.json                    MCP servers; remote ones (http, sse) work in TSRS
//   tools/<name>.json            TSRS tools the model can call: by HTTP, or JavaScript
async function markdownItems(folder) {
  const items = []
  let entries = []
  try {
    entries = await readdir(folder)
  } catch {
    return items
  }
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md')) continue
    const { meta, body } = frontMatter(await readFile(join(folder, entry), 'utf8'))
    items.push({
      name: String(meta.name || entry.replace(/\.md$/, '')),
      description: String(meta.description ?? ''),
      body: body.trim(),
    })
  }
  return items
}

async function mcpServers(folder) {
  try {
    const json = JSON.parse(await readFile(join(folder, '.mcp.json'), 'utf8'))
    return Object.entries(json.mcpServers ?? json).map(([name, server]) => ({
      name,
      type: String(server.type ?? (server.url ? 'http' : 'stdio')),
      url: server.url ? String(server.url) : '',
      headers: server.headers && typeof server.headers === 'object' ? server.headers : undefined,
      command: server.command ? [server.command, ...(server.args ?? [])].join(' ') : undefined,
    }))
  } catch {
    return []
  }
}

async function pluginTools(folder) {
  const tools = []
  let entries = []
  try {
    entries = await readdir(join(folder, 'tools'))
  } catch {
    return tools
  }
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json')) continue
    try {
      const def = JSON.parse(await readFile(join(folder, 'tools', entry), 'utf8'))
      if (!def.name) continue
      let js = typeof def.js === 'string' ? def.js : undefined
      // The code may live in its own file beside the definition.
      if (!js && typeof def.script === 'string') {
        const file = projectFile(join(folder, 'tools'), def.script)
        if (file && existsSync(file)) js = await readFile(file, 'utf8')
      }
      tools.push({
        name: String(def.name),
        description: String(def.description ?? ''),
        parameters: def.parameters ?? { type: 'object', properties: {} },
        kind: def.http ? 'http' : js ? 'js' : 'none',
        ...(def.http ? { http: { url: String(def.http.url ?? ''), method: String(def.http.method ?? 'POST').toUpperCase() } } : {}),
        ...(js ? { js } : {}),
        file: `tools/${entry}`,
      })
    } catch {
      // A broken definition is skipped; the plugin still loads.
    }
  }
  return tools
}

export async function listPlugins(root = extensionsRoot()) {
  const plugins = []
  for (const folder of await subfolders(join(root, 'plugins'))) {
    const manifest = await pluginManifest(folder)
    plugins.push({
      ...manifest,
      id: folder.split(sep).pop(),
      folder,
      skills: (await subfolders(join(folder, 'skills'))).map((s) => s.split(sep).pop()),
      commands: await markdownItems(join(folder, 'commands')),
      agents: await markdownItems(join(folder, 'agents')),
      mcp: await mcpServers(folder),
      tools: await pluginTools(folder),
    })
  }
  return plugins
}

// Installs a plugin from the files of a .zip or folder; a plugin of the same
// name is replaced, the old one kept aside.
export async function installPlugin(root, files) {
  const tree = rootedAt(files, '.claude-plugin/plugin.json') ?? rootedAt(files, 'plugin.json')
  if (!tree) throw new Error('There is no .claude-plugin/plugin.json or plugin.json in what was sent.')
  const manifestFile = tree.find((f) => f.name === '.claude-plugin/plugin.json' || f.name === 'plugin.json')
  const text = manifestFile.encoding === 'text' ? manifestFile.data : Buffer.from(manifestFile.data, 'base64').toString('utf8')
  let manifest
  try {
    manifest = JSON.parse(text)
  } catch {
    throw new Error('plugin.json is not valid JSON.')
  }
  if (!manifest.name) throw new Error('plugin.json has no name.')
  const folder = join(root, 'plugins', slug(manifest.name))
  for (const file of tree) if (!projectFile(folder, file.name)) throw new Error(`Not a file name inside the folder: ${file.name}`)
  if (existsSync(folder)) await setAside(root, folder)
  await writeTree(folder, tree)
  return (await listPlugins(root)).find((p) => p.folder === folder)
}

// A plugin's midia/ holds its kit files (a soundtrack, a brief, fonts). When
// one of its skills is used in a conversation with a folder, they are copied
// into that folder's midia/, where the skill expects them; a file already
// there is the user's and is never replaced.
export async function copyPluginMedia(root, pluginName, project) {
  const plugin = (await listPlugins(root)).find((p) => p.name === pluginName || p.id === pluginName)
  if (!plugin) throw new Error(`No plugin named ${pluginName}.`)
  const from = join(plugin.folder, 'midia')
  const copied = []
  const kept = []
  if (!existsSync(from)) return { copied, kept }
  for (const name of await filesIn(from)) {
    const target = projectFile(join(project, 'midia'), name)
    if (!target) continue
    if (existsSync(target)) {
      kept.push(`midia/${name}`)
      continue
    }
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(from, name), target)
    copied.push(`midia/${name}`)
  }
  return { copied, kept }
}

// Installs what was sent as what it is, whichever button sent it: a plugin
// zip carries skills too, and installing it as a bare skill would drop its
// commands, agents, tools and files. `kind` says which it was.
export async function installExtension(root, files) {
  if (rootedAt(files, '.claude-plugin/plugin.json') ?? rootedAt(files, 'plugin.json')) {
    return { kind: 'plugin', ...(await installPlugin(root, files)) }
  }
  if (rootedAt(files, 'SKILL.md')) return { kind: 'skill', ...(await installSkill(root, files)) }
  throw new Error('There is no SKILL.md or plugin.json in what was sent.')
}

export async function removePlugin(root, id) {
  const folder = join(root, 'plugins', id)
  if (!id || id.includes('/') || id.includes('\\') || id.startsWith('.') || !existsSync(folder))
    throw new Error(`No plugin named ${id}.`)
  await setAside(root, folder)
}

// The user's own tools, made in the app, live in a plugin of their own.
export const OWN_PLUGIN = 'minhas-ferramentas'

export async function saveTool(root, tool) {
  const name = String(tool.name ?? '').trim()
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error('A tool name uses only letters, digits, _ and -, up to 64.')
  const folder = join(root, 'plugins', OWN_PLUGIN)
  await mkdir(join(folder, '.claude-plugin'), { recursive: true })
  if (!existsSync(join(folder, '.claude-plugin', 'plugin.json'))) {
    const manifest = { name: OWN_PLUGIN, description: 'Ferramentas criadas no TSRS.', version: '1.0.0' }
    await writeFile(join(folder, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2))
  }
  await mkdir(join(folder, 'tools'), { recursive: true })
  const def = {
    name,
    description: String(tool.description ?? ''),
    parameters: tool.parameters ?? { type: 'object', properties: {} },
    ...(tool.http?.url ? { http: { url: tool.http.url, method: tool.http.method ?? 'POST', ...(tool.http.headers ? { headers: tool.http.headers } : {}) } } : {}),
    ...(tool.js ? { js: tool.js } : {}),
  }
  await writeFile(join(folder, 'tools', `${name}.json`), JSON.stringify(def, null, 2))
  return def
}

// ${env:NAME} in a URL or header is replaced by that environment variable, so
// a secret can stay out of the plugin's files.
export function withEnv(text, env = process.env) {
  return String(text).replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => env[name] ?? '')
}

// {param} in the URL takes the argument of that name, which then is not sent
// again in the body or the query.
export function httpRequest(def, input) {
  const args = { ...(input ?? {}) }
  const url = new URL(
    withEnv(def.url).replace(/\{(\w+)\}/g, (_, key) => {
      const value = args[key]
      delete args[key]
      return encodeURIComponent(value ?? '')
    }),
  )
  const method = String(def.method ?? 'POST').toUpperCase()
  const headers = Object.fromEntries(Object.entries(def.headers ?? {}).map(([k, v]) => [k, withEnv(v)]))
  if (method === 'GET' || method === 'DELETE') {
    for (const [key, value] of Object.entries(args))
      url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    return { url: url.href, init: { method, headers } }
  }
  return {
    url: url.href,
    init: { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(args) },
  }
}

// Calls a plugin's HTTP tool from here, where no browser rule (CORS) applies.
export async function runHttpTool(root, pluginId, toolName, input) {
  const folder = join(root, 'plugins', pluginId)
  if (!existsSync(folder)) throw new Error(`No plugin named ${pluginId}.`)
  const file = join(folder, 'tools', `${toolName}.json`)
  const defs = await pluginTools(folder)
  const tool = defs.find((t) => t.name === toolName)
  if (!tool?.http) throw new Error(`The plugin ${pluginId} has no HTTP tool named ${toolName}.`)
  const raw = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null
  const def = raw?.http ?? tool.http
  const { url, init } = httpRequest(def, input)
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  const text = await res.text()
  const body = text.length > 50_000 ? `${text.slice(0, 50_000)}\n[cut at 50,000 characters]` : text
  return { status: res.status, ok: res.ok, body }
}

// --- Examples ----------------------------------------------------------------

// Skills and plugins that come with TSRS, in exemplos/, installed as copies.
export function examplesRoot() {
  return process.env.TSRS_EXAMPLES ? resolve(process.env.TSRS_EXAMPLES) : resolve(HERE, '..', 'exemplos')
}

export async function listExamples(root = extensionsRoot(), examples = examplesRoot()) {
  const installedSkills = new Set((await listSkills(root)).filter((s) => s.source === 'user').map((s) => s.name))
  const installedPlugins = new Set((await listPlugins(root)).map((p) => p.name))
  const skills = []
  for (const folder of await subfolders(join(examples, 'skills'))) {
    const skill = await skillAt(folder, 'user')
    if (skill) skills.push({ id: folder.split(sep).pop(), name: skill.name, description: skill.description, installed: installedSkills.has(skill.name) })
  }
  const plugins = []
  for (const folder of await subfolders(join(examples, 'plugins'))) {
    const manifest = await pluginManifest(folder)
    plugins.push({ id: folder.split(sep).pop(), name: manifest.name, description: manifest.description ?? '', installed: installedPlugins.has(manifest.name) })
  }
  return { skills, plugins }
}

export async function installExample(root, examples, kind, id) {
  if (kind !== 'skill' && kind !== 'plugin') throw new Error('Unknown kind of example.')
  if (!/^[\w-]+$/.test(String(id))) throw new Error('Unknown example.')
  const folder = join(examples, `${kind}s`, id)
  if (!existsSync(folder)) throw new Error('Unknown example.')
  const files = []
  for (const name of await filesIn(folder)) {
    files.push({ name: `${id}/${name}`, data: (await readFile(join(folder, name))).toString('base64') })
  }
  return kind === 'skill' ? installSkill(root, files) : installPlugin(root, files)
}
