import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  allowed,
  copyProject,
  encodePath,
  listFiles,
  openProject,
  projectFile,
  editText,
  readText,
  slug,
  writeFiles,
} from '../server/projects.mjs'

test('project folders are named, kept apart and never left', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsrs-root-'))
  expect(slug('Página do NWLab: versão 2!')).toBe('pagina-do-nwlab-versao-2')
  expect(slug('')).toBe('projeto')

  const first = await openProject(root, { name: 'Site do NWLab', notes: '# Site\n' })
  const second = await openProject(root, { name: 'Site do NWLab' })
  expect(first.name).toBe('site-do-nwlab')
  expect(second.name).toBe('site-do-nwlab-2')
  expect(await readFile(join(first.path, 'NOTAS.md'), 'utf8')).toBe('# Site\n')

  // Names that would leave the folder or touch git are refused.
  for (const name of ['../fora.txt', 'a/../../fora.txt', 'C:/Windows/x.txt', '.git/config', ''])
    expect(projectFile(first.path, name)).toBeNull()
  // A leading slash means the project's own top folder.
  expect(projectFile(first.path, '/etc/passwd')).toBe(join(first.path, 'etc', 'passwd'))
  await expect(writeFiles(first.path, [{ name: '../fora.txt', content: 'x' }])).rejects.toThrow('inside the project')

  await writeFiles(first.path, [
    { name: 'index.html', content: '<h1>oi</h1>' },
    { name: 'css/site.css', content: 'h1{}' },
    { name: 'NOTAS.md', content: '- salvo\n', append: true },
  ])
  expect((await listFiles(first.path)).map((f) => f.name)).toEqual(['css/site.css', 'index.html', 'NOTAS.md'])
  expect(await readText(first.path, 'css/site.css')).toBe('h1{}')
  expect(await readFile(join(first.path, 'NOTAS.md'), 'utf8')).toBe('# Site\n- salvo\n')

  // A folder the user chose elsewhere is allowed from then on; others are not.
  const chosen = join(await mkdtemp(join(tmpdir(), 'tsrs-chosen-')), 'meu site')
  expect(await allowed(root, chosen)).toBe(false)
  await openProject(root, { path: chosen })
  expect(await allowed(root, chosen)).toBe(true)
  expect(await allowed(root, tmpdir())).toBe(false)
  expect(await allowed(root, 'relativo/pasta')).toBe(false)
  expect(await copyProject(first.path, chosen)).toEqual(['css/site.css', 'index.html', 'NOTAS.md'])
})

test('only TSRS itself may use the project folders', async ({ request }) => {
  const evil = await request.post('/__tsrs/projects/open', {
    headers: { Origin: 'https://evil.example' },
    data: { name: 'invasao' },
  })
  expect(evil.status()).toBe(403)
  const self = { Origin: 'http://localhost:5174' }
  // A folder that is not a project cannot be written or read, even by TSRS.
  const outside = await request.post('/__tsrs/projects/write', {
    headers: self,
    data: { path: tmpdir(), files: [{ name: 'x.txt', content: 'x' }] },
  })
  expect(outside.status()).toBe(403)
  const raw = await request.get(`/__tsrs/projects/raw/${encodePath(tmpdir())}/x.txt`)
  expect(raw.status()).toBe(404)
  const health = await request.get('/__tsrs/projects/health')
  expect((await health.json()).root).toContain('tsrs-e2e-projects')
})

test('a piece of a file is replaced only where it is, and only once', async () => {
  const project = await mkdtemp(join(tmpdir(), 'tsrs-edit-'))
  await writeFiles(project, [{ name: 'motion.html', content: '<h1>CTA</h1>\n<p>a</p>\n<p>a</p>\n' }])
  expect(await editText(project, 'motion.html', '<h1>CTA</h1>', '<h1>Comece já</h1>')).toEqual({ replaced: 1, size: 38 })
  expect(await readText(project, 'motion.html')).toBe('<h1>Comece já</h1>\n<p>a</p>\n<p>a</p>\n')
  await expect(editText(project, 'motion.html', '<p>a</p>', '<p>b</p>')).rejects.toThrow('appears 2 times')
  expect((await editText(project, 'motion.html', '<p>a</p>', '<p>b</p>', true)).replaced).toBe(2)
  await expect(editText(project, 'motion.html', '<h1>CTA</h1>', 'x')).rejects.toThrow('not in motion.html')
  await expect(editText(project, '../fora.html', 'a', 'b')).rejects.toThrow('No file named')
  // A file saved with Windows line ends still takes an edit written with \n.
  await writeFiles(project, [{ name: 'win.html', content: '<a>\r\n<b>\r\n' }])
  await editText(project, 'win.html', '<a>\n<b>', '<a>\n<c>')
  expect(await readText(project, 'win.html')).toBe('<a>\r\n<c>\r\n')
  // $ in the new text is written as it is.
  await editText(project, 'win.html', '<c>', '$&$1')
  expect(await readText(project, 'win.html')).toBe('<a>\r\n$&$1\r\n')
})
