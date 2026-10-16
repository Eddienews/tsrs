import { PROJECTS } from './projects'
import type { ToolCall, ToolDef, ToolResult } from './stream'
import { localTools, type ToolSet } from './tools'
import type { ChatProject } from './types'

// React components from cult/ui (server/components.mjs), copied into the
// project with the shadcn components they build on and credited in
// CREDITOS.md: for projects that will be built with React or Next.js.

export interface RegistryItem {
  name: string
  description: string
  dependencies: string[]
}

export interface AddedComponent {
  written: string[]
  skipped: string[]
  dependencies: string[]
  needs: string[]
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${PROJECTS}/ui${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    // A TSRS without its server answers with its page.
  }
  if (!res.ok || !json) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json as T
}

export const UI_TOOLS: ToolDef[] = [
  {
    name: 'ui_components_search',
    description:
      'Search cult/ui (MIT), a library of about 150 React + Tailwind components in the shadcn ' +
      'format: animated buttons, cards, docks, carousels, text effects, shader backgrounds, ' +
      'device mockups, toasts, inputs, prompt composers. Only for projects built with React or ' +
      'Next.js and Tailwind, not for plain HTML pages. Without a query, lists them all.',
    schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What the component should be or do, in English (dock, text animation, pricing card).' } },
    },
  },
  {
    name: 'ui_component_add',
    description:
      "Copy a cult/ui component into the project (components/ui/), with the shadcn components it " +
      'imports and lib/utils.ts when missing, and credit it in CREDITOS.md. Files already in the ' +
      'project are kept unless overwrite is true. Returns the files and the npm packages to install.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The component, as ui_components_search lists it.' },
        example: { type: 'boolean', description: 'Also copy its usage example into components/examples/.' },
        overwrite: { type: 'boolean', description: 'Replace files the project already has (only when the user asked).' },
      },
      required: ['name'],
    },
  },
]

export function foundComponents(items: RegistryItem[], query?: string): string {
  if (!items.length) return `No component matches "${query}". Search with other words, or without a query to see them all.`
  return items
    .map((i) => `- ${i.name}: ${i.description}${i.dependencies.length ? ` (needs ${i.dependencies.join(', ')})` : ''}`)
    .join('\n')
}

export function addedText(name: string, added: AddedComponent): string {
  const lines = [
    added.written.length ? `Added ${name}: ${added.written.join(', ')} (credited in CREDITOS.md).` : `Nothing new was written for ${name}.`,
  ]
  if (added.skipped.length) lines.push(`Kept, already in the project: ${added.skipped.join(', ')}.`)
  if (added.dependencies.length) lines.push(`Install: npm install ${added.dependencies.join(' ')}`)
  if (added.needs.length) lines.push(`The files also import ${added.needs.join(', ')}; the project must provide them.`)
  lines.push('Imports use the @/ alias (tsconfig paths "@/*": ["./*"] or ["./src/*"]) and Tailwind CSS.')
  return lines.join('\n')
}

export function uiToolSet(
  project: () => ChatProject | null | undefined | Promise<ChatProject | null | undefined>, onAdded?: (files: string[]) => void): ToolSet {
  return localTools(UI_TOOLS, 'cult/ui', async (call: ToolCall, signal): Promise<ToolResult> => {
    const input = (call.input ?? {}) as { query?: string; name?: string; example?: boolean; overwrite?: boolean }
    try {
      if (call.name === 'ui_components_search') {
        const { items } = await post<{ items: RegistryItem[] }>('/search', { query: input.query }, signal)
        return { content: foundComponents(items, input.query), isError: false }
      }
      const where = await project()
      if (!where) return { content: 'This conversation has no project folder.', isError: true }
      const added = await post<AddedComponent>(
        '/add',
        { path: where.path, name: input.name, example: input.example, overwrite: input.overwrite },
        signal,
      )
      if (added.written.length) onAdded?.(added.written)
      return {
        content: addedText(String(input.name), added),
        isError: false,
      }
    } catch (error) {
      if (signal?.aborted) throw error
      return { content: error instanceof Error ? error.message : String(error), isError: true }
    }
  })
}
