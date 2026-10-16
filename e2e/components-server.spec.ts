import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { addComponent, matching, placeFile, registryUrl, searchComponents } from '../server/components.mjs'

// A stand-in for cult/ui's and shadcn's registries.
const items: Record<string, unknown> = {
  'cult/registry.json': {
    items: [
      { name: 'dock', type: 'registry:ui', description: 'macOS-style dock with hover effects', dependencies: ['motion'] },
      { name: 'dock-demo', type: 'registry:example', description: 'demo' },
      { name: 'texture-button', type: 'registry:ui', description: 'Tactile button with texture', dependencies: [] },
    ],
  },
  'cult/dock.json': {
    name: 'dock',
    dependencies: ['motion'],
    registryDependencies: ['button'],
    files: [{ path: 'registry/default/ui/dock.tsx', type: 'registry:ui', content: 'import { cn } from "@/lib/utils"\nimport { Button } from "@/components/ui/button"\nimport { useTheme } from "@/hooks/use-theme"\nexport function Dock() {}\n' }],
  },
  'cult/dock-demo.json': {
    name: 'dock-demo',
    files: [{ path: 'registry/default/example/dock-demo.tsx', type: 'registry:example', content: 'export default function DockDemo() {}\n' }],
  },
  'shadcn/button.json': {
    name: 'button',
    dependencies: ['@radix-ui/react-slot', 'class-variance-authority'],
    files: [{ path: 'registry/new-york-v4/ui/button.tsx', type: 'registry:ui', content: 'export function Button() {}\n' }],
  },
}

let server: Server
const asked: string[] = []
test.beforeAll(async () => {
  server = createServer((req, res) => {
    asked.push(req.url!)
    const body = items[req.url!.slice(1)]
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify(body ?? {}))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  process.env.TSRS_UI_REGISTRY = `http://127.0.0.1:${port}/cult`
  process.env.TSRS_SHADCN_REGISTRY = `http://127.0.0.1:${port}/shadcn`
})
test.afterAll(() => server.close())

test('reads only the registries it knows', () => {
  expect(registryUrl('https://www.cult-ui.com/r/dock.json')).toBe(true)
  expect(registryUrl('https://ui.shadcn.com/r/styles/new-york-v4/button.json')).toBe(true)
  expect(registryUrl('http://www.cult-ui.com/r/dock.json')).toBe(false)
  expect(registryUrl('https://evil.example/r/dock.json')).toBe(false)
  expect(registryUrl('http://127.0.0.1:9/elsewhere.json')).toBe(false)
})

test('files go where a shadcn project keeps them', () => {
  expect(placeFile({ path: 'registry/default/ui/dock.tsx', type: 'registry:ui' }, false)).toBe('components/ui/dock.tsx')
  expect(placeFile({ path: 'registry/default/example/dock-demo.tsx', type: 'registry:example' }, true)).toBe('components/examples/dock-demo.tsx')
  expect(placeFile({ path: 'registry/default/lib/x.ts', type: 'registry:lib' }, false)).toBe('lib/x.ts')
  expect(placeFile({ path: 'a/use-x.ts', type: 'registry:hook' }, false)).toBe('hooks/use-x.ts')
  expect(placeFile({ path: 'a/b.tsx', type: 'registry:component', target: '~/app/b.tsx' }, false)).toBe('app/b.tsx')
})

test('searches the components, demos left out', async () => {
  const all = await searchComponents({})
  expect(all.items.map((i) => i.name)).toEqual(['dock', 'texture-button'])
  expect((await searchComponents({ query: 'button with texture' })).items[0].name).toBe('texture-button')
  expect(matching(all.items, 'nothing here')).toEqual([])
})

test('adds a component with what it builds on, credits it and keeps existing files', async () => {
  const project = await mkdtemp(join(tmpdir(), 'tsrs-ui-'))
  await expect(addComponent(project, { name: '../x' })).rejects.toThrow(/component name/)
  await expect(addComponent(project, { name: 'nope' })).rejects.toThrow(/No component/)

  const added = await addComponent(project, { name: 'dock', example: true })
  expect(added.written.sort()).toEqual(['components/examples/dock-demo.tsx', 'components/ui/button.tsx', 'components/ui/dock.tsx', 'lib/utils.ts'])
  expect(added.dependencies).toEqual(['@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'motion', 'tailwind-merge'])
  // What the registry did not bring is named, for the project to provide.
  expect(added.needs).toEqual(['@/hooks/use-theme'])
  expect(await readFile(join(project, 'lib', 'utils.ts'), 'utf8')).toContain('twMerge(clsx(inputs))')
  const credits = await readFile(join(project, 'CREDITOS.md'), 'utf8')
  expect(credits).toContain('- `components/ui/dock.tsx`: componente `dock` de [cult/ui](https://www.cult-ui.com) (MIT)')
  expect(credits).toContain('- `components/ui/button.tsx`: componente `button` de [shadcn/ui](https://ui.shadcn.com) (MIT)')

  // The user's own version of a file stays.
  await writeFile(join(project, 'components', 'ui', 'dock.tsx'), 'meu dock')
  const again = await addComponent(project, { name: 'dock' })
  expect(again.written).toEqual([])
  expect(again.skipped.sort()).toEqual(['components/ui/button.tsx', 'components/ui/dock.tsx'])
  expect(await readFile(join(project, 'components', 'ui', 'dock.tsx'), 'utf8')).toBe('meu dock')
  const replaced = await addComponent(project, { name: 'dock', overwrite: true })
  expect(replaced.written).toContain('components/ui/dock.tsx')

  // A project with its own utils keeps it.
  const other = await mkdtemp(join(tmpdir(), 'tsrs-ui-'))
  await mkdir(join(other, 'src', 'lib'), { recursive: true })
  await writeFile(join(other, 'src', 'lib', 'utils.ts'), 'export const cn = () => ""')
  expect((await addComponent(other, { name: 'dock' })).written).not.toContain('lib/utils.ts')
})
