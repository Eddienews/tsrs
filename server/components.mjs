// React components from a shadcn registry, for projects that will be built
// with React or Next.js: the model searches cult/ui (github.com/nolly-studio/
// cult-ui, MIT) and copies a real component into the project folder, with the
// shadcn components it builds on, instead of writing one from memory. Each
// is credited in CREDITOS.md; files already in the project are never
// replaced unless asked.
//
// Mounted by projects.mjs under /__tsrs/projects/ui:
//   POST /search {"query"?}                         {"items":[{name,description,dependencies}]}
//   POST /add    {"path","name","example"?,"overwrite"?}   {"written","skipped","dependencies","needs"}

import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { projectFile, writeFiles } from './projects.mjs'

const DAY = 24 * 3_600_000
const MAX_ITEMS = 20
const MAX_BYTES = 2 * 1024 * 1024

// cult/ui's own registry, and shadcn's for the base components theirs import.
// The tests point both at a stand-in (TSRS_UI_REGISTRY, TSRS_SHADCN_REGISTRY).
const cultBase = () => (process.env.TSRS_UI_REGISTRY || 'https://www.cult-ui.com/r').replace(/\/+$/, '')
const shadcnBase = () => (process.env.TSRS_SHADCN_REGISTRY || 'https://ui.shadcn.com/r/styles/new-york-v4').replace(/\/+$/, '')
const HOSTS = ['www.cult-ui.com', 'cult-ui.com', 'ui.shadcn.com']

export const CREDITS = {
  cult: '[cult/ui](https://www.cult-ui.com) (MIT)',
  shadcn: '[shadcn/ui](https://ui.shadcn.com) (MIT)',
}

const NAME = /^[a-z0-9][a-z0-9-]{0,60}$/

export function registryUrl(url) {
  try {
    const parsed = new URL(url)
    const ours = [cultBase(), shadcnBase()].some((base) => url.startsWith(`${base}/`))
    return ours || (parsed.protocol === 'https:' && HOSTS.includes(parsed.hostname))
  } catch {
    return false
  }
}

async function fetchJson(url, fetchImpl) {
  if (!registryUrl(url)) throw new Error(`Not a registry this tool reads: ${url}`)
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } })
  if (res.status === 404) throw new Error(`No component at ${url}.`)
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered HTTP ${res.status}.`)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new Error(`${url} is too large.`)
  return JSON.parse(text)
}

let index = null
// The registry's list of components, kept for a day.
export async function registryIndex(fetchImpl = fetch, now = Date.now()) {
  if (index && index.base === cultBase() && now - index.at < DAY) return index.items
  const data = await fetchJson(`${cultBase()}/registry.json`, fetchImpl)
  const items = (data.items ?? [])
    .filter((i) => NAME.test(i.name ?? '') && !i.name.endsWith('-demo') && i.type !== 'registry:example')
    .map((i) => ({ name: i.name, description: String(i.description ?? '').slice(0, 200), dependencies: i.dependencies ?? [] }))
  index = { base: cultBase(), at: now, items }
  return items
}

export function matching(items, query) {
  const words = String(query ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (!words.length) return items
  const score = (item) => {
    const text = `${item.name} ${item.description}`.toLowerCase()
    return words.filter((w) => text.includes(w)).length + (words.some((w) => item.name.includes(w)) ? 1 : 0)
  }
  return items
    .map((item) => ({ item, score: score(item) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
}

// Where a registry file goes in a shadcn-style project.
export function placeFile(file, isExample) {
  if (file.target) return String(file.target).replace(/^~\//, '')
  const name = basename(String(file.path ?? ''))
  if (isExample) return `components/examples/${name}`
  switch (file.type) {
    case 'registry:ui':
      return `components/ui/${name}`
    case 'registry:lib':
      return `lib/${name}`
    case 'registry:hook':
      return `hooks/${name}`
    default:
      return `components/${name}`
  }
}

// The registry item a dependency names: a URL, or a bare name in shadcn's registry.
function dependencyUrl(dep) {
  if (/^https?:\/\//.test(dep)) return dep
  if (NAME.test(dep)) return `${shadcnBase()}/${dep}.json`
  return null
}

const UTILS = `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`

export async function addComponent(project, { name, example, overwrite }, fetchImpl = fetch) {
  if (!NAME.test(String(name ?? ''))) throw new Error('Use a component name as ui_components_search lists it, such as dock.')
  const queue = [{ url: `${cultBase()}/${name}.json`, example: false }]
  if (example) queue.push({ url: `${cultBase()}/${name}-demo.json`, example: true })
  const seen = new Set()
  const files = []
  const dependencies = new Set()
  const credits = []
  while (queue.length) {
    const next = queue.shift()
    if (seen.has(next.url)) continue
    if (seen.size >= MAX_ITEMS) throw new Error(`${name} needs more than ${MAX_ITEMS} components.`)
    seen.add(next.url)
    const item = await fetchJson(next.url, fetchImpl)
    const fromShadcn = next.url.startsWith(`${shadcnBase()}/`)
    for (const dep of item.dependencies ?? []) dependencies.add(dep)
    for (const dep of item.registryDependencies ?? []) {
      const url = dependencyUrl(dep)
      if (url) queue.push({ url, example: false })
    }
    for (const file of item.files ?? []) {
      if (typeof file.content !== 'string') continue
      const place = placeFile(file, next.example)
      files.push({ name: place, content: file.content, credit: fromShadcn ? CREDITS.shadcn : CREDITS.cult, item: item.name })
    }
  }
  const written = []
  const skipped = []
  const fresh = files.filter((file) => {
    const target = projectFile(project, file.name)
    if (!target) throw new Error(`Not a file name inside the project: ${file.name}`)
    if (existsSync(target) && !overwrite) {
      skipped.push(file.name)
      return false
    }
    return true
  })
  // The helper nearly every shadcn component imports, when the project has none.
  const needsUtils = files.some((f) => f.content.includes('@/lib/utils'))
  const hasUtils = ['lib/utils.ts', 'lib/utils.js', 'src/lib/utils.ts'].some((f) => existsSync(projectFile(project, f)))
  if (needsUtils && !hasUtils) {
    fresh.push({ name: 'lib/utils.ts', content: UTILS, credit: CREDITS.shadcn, item: 'utils' })
    dependencies.add('clsx')
    dependencies.add('tailwind-merge')
  }
  if (fresh.length) {
    written.push(...(await writeFiles(project, fresh.map(({ name, content }) => ({ name, content })))))
    for (const file of fresh) credits.push(`- \`${file.name}\`: componente \`${file.item}\` de ${file.credit}`)
    await writeFiles(project, [{ name: 'CREDITOS.md', content: `${credits.join('\n')}\n`, append: true }])
  }
  // What the files import that the registry did not bring: the project's own setup.
  const needs = [...new Set(files.flatMap((f) => [...f.content.matchAll(/from ["'](@\/[^"']+)["']/g)].map((m) => m[1])))]
    .filter((path) => !files.some((f) => path.replace(/^@\//, '') === f.name.replace(/\.(tsx?|jsx?)$/, '')))
    .filter((path) => path !== '@/lib/utils')
  return { written, skipped, dependencies: [...dependencies].sort(), needs }
}

export async function searchComponents({ query }, fetchImpl = fetch) {
  const items = matching(await registryIndex(fetchImpl), query)
  return { items: items.slice(0, query ? 15 : 200) }
}
