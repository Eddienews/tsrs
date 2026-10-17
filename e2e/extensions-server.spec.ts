import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  frontMatter,
  httpRequest,
  installExtension,
  installPlugin,
  installSkill,
  listSkills,
  removeSkill,
  rootedAt,
  saveTool,
  withEnv,
} from '../server/extensions.mjs'

const text = (name: string, data: string) => ({ name, data, encoding: 'text' as const })

test('reads the front matter of skills, as Claude writes it', () => {
  expect(frontMatter('---\nname: pdf\ndescription: "Ler: e escrever PDFs"\n---\n\nCorpo')).toEqual({
    meta: { name: 'pdf', description: 'Ler: e escrever PDFs' },
    body: '\nCorpo',
  })
  const folded = frontMatter('---\nname: x\ndescription: >\n  uma linha\n  e outra\nlicense: MIT\n---\nB')
  expect(folded.meta).toEqual({ name: 'x', description: 'uma linha e outra', license: 'MIT' })
  expect(frontMatter('sem cabeçalho').meta).toEqual({})
})

test('finds the skill or plugin inside an archive, wherever it sits', () => {
  const files = [
    text('pacote/minha-skill/SKILL.md', 'x'),
    text('pacote/minha-skill/ref/a.md', 'y'),
    text('__MACOSX/pacote/._SKILL.md', 'z'),
    text('outra.txt', 'w'),
  ]
  expect(rootedAt(files, 'SKILL.md')?.map((f) => f.name)).toEqual(['SKILL.md', 'ref/a.md'])
  expect(rootedAt(files, '.claude-plugin/plugin.json')).toBeNull()
})

test('installs skills and plugins on disk and keeps what is replaced or removed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-ext-'))
  await expect(installSkill(root, [text('SKILL.md', 'sem nome')])).rejects.toThrow('no name')
  await expect(installSkill(root, [text('a.txt', 'x')])).rejects.toThrow('no SKILL.md')
  await expect(installSkill(root, [text('s/SKILL.md', '---\nname: s\n---\n'), text('s/../../fora.txt', 'x')])).rejects.toThrow()

  const skill = await installSkill(root, [text('SKILL.md', '---\nname: Revisão de Texto\ndescription: d\n---\nB')])
  expect(skill.folder).toBe(join(root, 'skills', 'revisao-de-texto'))
  await installSkill(root, [text('SKILL.md', '---\nname: Revisão de Texto\ndescription: nova\n---\nB2')])
  expect((await listSkills(root)).map((s) => s.description)).toEqual(['nova'])
  await removeSkill(root, 'Revisão de Texto')
  expect(await listSkills(root)).toEqual([])
  // Nothing is deleted: both versions are kept aside.
  const { readdir } = await import('node:fs/promises')
  expect((await readdir(join(root, '_removidas'))).length).toBe(2)

  const plugin = await installPlugin(root, [
    text('kit/.claude-plugin/plugin.json', '{"name":"kit"}'),
    text('kit/skills/marca/SKILL.md', '---\nname: marca\ndescription: Marca\n---\n'),
  ])
  expect(plugin?.skills).toEqual(['marca'])
  await expect(removeSkill(root, 'kit:marca')).rejects.toThrow('remove the plugin')
  await expect(installPlugin(root, [text('kit/plugin.json', 'não é json')])).rejects.toThrow('not valid JSON')
})

test('installs a plugin zip whole, whichever button sent it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-ext-'))
  const kit = [
    text('kit/.claude-plugin/plugin.json', '{"name":"kit","version":"0.1.0"}'),
    text('kit/skills/pulso/SKILL.md', '---\nname: pulso\ndescription: d\n---\n'),
    text('kit/skills/pulso/beatmap.json', '{}'),
    text('kit/commands/pulso.md', '---\ndescription: c\n---\nUse a skill.'),
    text('kit/midia/trilha.md', 'ficha'),
  ]
  const made = await installExtension(root, kit)
  expect(made.kind).toBe('plugin')
  expect(made.commands.map((c: { name: string }) => c.name)).toEqual(['pulso'])
  // Nothing of the kit is dropped, and no bare copy of its skill is made.
  expect(await readFile(join(root, 'plugins', 'kit', 'midia', 'trilha.md'), 'utf8')).toBe('ficha')
  expect((await listSkills(root)).map((s) => s.id)).toEqual(['kit:pulso'])

  const skill = await installExtension(root, [text('s/SKILL.md', '---\nname: solta\ndescription: d\n---\n')])
  expect(skill.kind).toBe('skill')
  await expect(installExtension(root, [text('a.txt', 'x')])).rejects.toThrow('SKILL.md or plugin.json')
})

test('own tools: valid names, and HTTP calls with secrets kept out of the files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-ext-'))
  await expect(saveTool(root, { name: 'com espaço' })).rejects.toThrow('letters, digits')
  await saveTool(root, { name: 'clima', description: 'd', http: { url: 'https://api.x/{cidade}', method: 'GET' } })
  const saved = JSON.parse(await readFile(join(root, 'plugins', 'minhas-ferramentas', 'tools', 'clima.json'), 'utf8'))
  expect(saved.http).toEqual({ url: 'https://api.x/{cidade}', method: 'GET' })

  expect(withEnv('Bearer ${env:TSRS_TEST_KEY}', { TSRS_TEST_KEY: 'segredo' })).toBe('Bearer segredo')
  const get = httpRequest({ url: 'https://api.x/clima/{cidade}', method: 'GET' }, { cidade: 'São Paulo', dias: 3 })
  expect(get.url).toBe('https://api.x/clima/S%C3%A3o%20Paulo?dias=3')
  const postReq = httpRequest(
    { url: 'https://api.x/enviar', headers: { Authorization: 'Bearer ${env:TSRS_TEST_KEY}' } },
    { texto: 'oi' },
  )
  expect(postReq.init.method).toBe('POST')
  expect(postReq.init.body).toBe('{"texto":"oi"}')
})
