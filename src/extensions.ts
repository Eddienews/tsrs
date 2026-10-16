import type { ToolCall, ToolDef, ToolResult } from './stream'
import { localTools, type ToolSet } from './tools'
import type { Settings } from './types'

// Skills and plugins kept on disk by the TSRS server (server/extensions.mjs).
export const EXTENSIONS = '/__tsrs/ext'

export interface Skill {
  // The name, or plugin:name for a skill that came with a plugin.
  id: string
  name: string
  description: string
  // 'user', or the plugin's name.
  source: string
  folder: string
  files: string[]
}

export interface PluginItem {
  name: string
  description: string
  body: string
}

export interface PluginTool {
  name: string
  description: string
  parameters: unknown
  kind: 'http' | 'js' | 'none'
  http?: { url: string; method: string }
  js?: string
  file: string
}

export interface McpEntry {
  name: string
  type: string
  url: string
  headers?: Record<string, string>
  command?: string
}

export interface Plugin {
  id: string
  name: string
  description: string
  version: string
  author: string
  folder: string
  skills: string[]
  commands: PluginItem[]
  agents: PluginItem[]
  mcp: McpEntry[]
  tools: PluginTool[]
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${EXTENSIONS}${path}`, init)
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    // A TSRS served without the extensions answers with its page.
  }
  if (!res.ok || !json) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json as T
}

export const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const get = <T>(path: string) => call<T>(path)

// Where extensions are kept, or null when this TSRS cannot keep them.
export async function extensionsRoot(): Promise<string | null> {
  try {
    return (await get<{ root: string }>('/health')).root
  } catch {
    return null
  }
}

export async function listSkills(): Promise<Skill[]> {
  return (await get<{ skills: Skill[] }>('/skills')).skills
}

export async function listPlugins(): Promise<Plugin[]> {
  return (await get<{ plugins: Plugin[] }>('/plugins')).plugins
}

// The skills and plugins that come with TSRS (exemplos/), to install as copies.
export interface Example {
  id: string
  name: string
  description: string
  installed: boolean
}

export function listExamples() {
  return get<{ skills: Example[]; plugins: Example[] }>('/examples')
}

export function installExample(kind: 'skill' | 'plugin', id: string) {
  return post<unknown>('/examples/install', { kind, id })
}

export function readSkill(id: string) {
  return get<Skill & { text: string; body: string }>(`/skill?${new URLSearchParams({ id })}`)
}

export async function readSkillFile(id: string, file: string): Promise<string> {
  return (await get<{ content: string }>(`/skill-file?${new URLSearchParams({ id, file })}`)).content
}

// An archive's or folder's files, as the server takes them.
export interface UploadFile {
  name: string
  data: string
  encoding?: 'base64' | 'text'
}

// Reads what the user picked: a .zip or .skill (a zip), a single SKILL.md, or
// the files of a folder (with their paths inside it).
export async function filesToUpload(picked: File[]): Promise<UploadFile[]> {
  const out: UploadFile[] = []
  for (const file of picked) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (/\.(zip|skill|plugin)$/i.test(file.name)) {
      const { unzipSync } = await import('fflate')
      // Archives of a few files: the sizes are checked before anything is unpacked.
      let total = 0
      const files = unzipSync(bytes, {
        filter: (entry) => {
          total += entry.originalSize
          if (total > 50 * 1024 * 1024) throw new Error(`${file.name} unpacks to more than 50 MB.`)
          return !entry.name.endsWith('/')
        },
      })
      for (const [name, data] of Object.entries(files)) out.push({ name, data: toBase64(data) })
    } else {
      const name = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      out.push({ name, data: toBase64(bytes) })
    }
  }
  return out
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// --- What the model gets -------------------------------------------------

export function enabledSkills(skills: Skill[], settings: Settings): Skill[] {
  const off = new Set(settings.disabledSkills ?? [])
  const offPlugins = new Set(settings.disabledPlugins ?? [])
  return skills.filter((s) => !off.has(s.id) && (s.source === 'user' || !offPlugins.has(s.source)))
}

export function enabledPlugins(plugins: Plugin[], settings: Settings): Plugin[] {
  const off = new Set(settings.disabledPlugins ?? [])
  return plugins.filter((p) => !off.has(p.name))
}

// Told to the model when it has skills: only names and descriptions; it loads
// one when a task needs it, as Claude does.
export function skillsNote(skills: Skill[]): string {
  return (
    'You have skills: folders of instructions for particular kinds of tasks. Before starting ' +
    'a task that one of them covers, call skill_load with its name and follow its ' +
    'instructions; they may mention files you can read with skill_read_file. Skills:\n' +
    skills.map((s) => `- ${s.id}: ${s.description || '(no description)'}`).join('\n')
  )
}

export const SKILL_TOOLS: ToolDef[] = [
  {
    name: 'skill_load',
    description: "Read a skill's instructions (its SKILL.md) and the list of its files.",
    schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The skill, as listed.' } },
      required: ['name'],
    },
  },
  {
    name: 'skill_read_file',
    description: 'Read a file that comes with a skill, such as a template or a reference.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The skill, as listed.' },
        file: { type: 'string', description: "The file's path inside the skill." },
      },
      required: ['name', 'file'],
    },
  },
]

export function skillTools(): ToolSet {
  return localTools(SKILL_TOOLS, 'Skill', async (call: ToolCall): Promise<ToolResult> => {
    const input = (call.input ?? {}) as { name?: string; file?: string }
    try {
      if (!input.name) return { content: 'Say which skill.', isError: true }
      if (call.name === 'skill_load') {
        const skill = await readSkill(input.name)
        const files = skill.files.length ? `\n\nFiles of this skill:\n${skill.files.map((f) => `- ${f}`).join('\n')}` : ''
        return { content: skill.body + files, isError: false }
      }
      if (!input.file) return { content: 'Say which file.', isError: true }
      return { content: await readSkillFile(input.name, input.file), isError: false }
    } catch (error) {
      return { content: error instanceof Error ? error.message : String(error), isError: true }
    }
  })
}

// Tool names providers accept, up to 64 characters, unique in the request.
export function toolName(plugin: string, tool: string, taken: Set<string>): string {
  const clean = (text: string) => text.replace(/[^a-zA-Z0-9_-]+/g, '_')
  const base = clean(tool).slice(0, 64)
  let name = taken.has(base) ? `${clean(plugin)}__${clean(tool)}`.slice(0, 60) : base
  for (let n = 2; taken.has(name); n++) name = `${base.slice(0, 58)}_${n}`
  taken.add(name)
  return name
}

// Runs JavaScript from a plugin in a sandboxed frame: no access to TSRS, its
// storage or its keys, and stopped after 15 seconds.
export function runSandboxed(code: string, input: unknown, timeout = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.style.display = 'none'
    const id = crypto.randomUUID()
    const done = (fn: () => void) => {
      clearTimeout(timer)
      window.removeEventListener('message', receive)
      frame.remove()
      fn()
    }
    const timer = setTimeout(() => done(() => reject(new Error('The tool took longer than 15 seconds.'))), timeout)
    function receive(event: MessageEvent) {
      const data = event.data as { tsrsTool?: string; ok?: boolean; value?: string }
      if (event.source !== frame.contentWindow || data?.tsrsTool !== id) return
      done(() => (data.ok ? resolve(String(data.value)) : reject(new Error(String(data.value)))))
    }
    window.addEventListener('message', receive)
    const script =
      `<script>window.addEventListener('message', async (e) => {` +
      `const { id, code, input } = e.data;` +
      `try { const run = new (Object.getPrototypeOf(async function () {}).constructor)('input', code);` +
      `const value = await run(input);` +
      `parent.postMessage({ tsrsTool: id, ok: true, value: typeof value === 'string' ? value : JSON.stringify(value) }, '*') }` +
      `catch (error) { parent.postMessage({ tsrsTool: id, ok: false, value: String(error && error.message || error) }, '*') } })<\/script>`
    frame.srcdoc = script
    frame.onload = () => frame.contentWindow?.postMessage({ id, code, input }, '*')
    document.body.append(frame)
  })
}

// The tools of the enabled plugins, run by the server (HTTP) or in a sandbox (JS).
export function pluginToolSet(plugins: Plugin[]): ToolSet | null {
  const taken = new Set<string>()
  const routes = new Map<string, { plugin: Plugin; tool: PluginTool }>()
  const defs: ToolDef[] = []
  for (const plugin of plugins) {
    for (const tool of plugin.tools) {
      if (tool.kind === 'none') continue
      const name = toolName(plugin.name, tool.name, taken)
      routes.set(name, { plugin, tool })
      defs.push({ name, description: tool.description, schema: tool.parameters })
    }
  }
  if (!defs.length) return null
  return {
    defs,
    problems: [],
    label: (name) => {
      const route = routes.get(name)
      return route ? `${route.tool.name} (${route.plugin.name})` : name
    },
    autoApprove: (name) => routes.has(name),
    async run(call) {
      const route = routes.get(call.name)
      if (!route) return { content: `No tool named ${call.name}.`, isError: true }
      try {
        if (route.tool.kind === 'js' && route.tool.js) {
          return { content: await runSandboxed(route.tool.js, call.input ?? {}), isError: false }
        }
        const result = await post<{ status: number; ok: boolean; body: string }>('/tools/http', {
          plugin: route.plugin.id,
          tool: route.tool.name,
          input: call.input ?? {},
        })
        return { content: result.ok ? result.body : `HTTP ${result.status}: ${result.body}`, isError: !result.ok }
      } catch (error) {
        return { content: error instanceof Error ? error.message : String(error), isError: true }
      }
    },
  }
}

// A plugin's commands as saved prompts: /name, with Claude's $ARGUMENTS
// turned into a field the prompt list asks for.
export function commandPrompts(plugins: Plugin[]): { id: string; title: string; text: string }[] {
  return plugins.flatMap((plugin) =>
    plugin.commands.map((command) => ({
      id: `plugin:${plugin.name}:${command.name}`,
      title: `/${command.name} · ${plugin.name}`,
      text: command.body.replace(/\$ARGUMENTS/g, '{{argumentos}}'),
    })),
  )
}
