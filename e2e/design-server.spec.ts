import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, test } from '@playwright/test'
import {
  asTools,
  creditLine,
  drawArgs,
  drawDirection,
  getImage,
  inspectPage,
  searchArgs,
  searchItems,
  STRUCTURAL,
} from '../server/design.mjs'
import { findChrome } from '../vendor/taste-skill/scripts/lib/cdp.mjs'

// The inspector finds Chrome or Edge by itself; only where neither is
// installed does Playwright's own Chromium stand in.
if (!findChrome() && existsSync(chromium.executablePath())) process.env.CHROME_PATH = chromium.executablePath()

const project = () => mkdtemp(join(tmpdir(), 'tsrs-design-'))

test('the script commands in the texts become the tools the model has', () => {
  expect(asTools('Then: node /x/taste/scripts/draw.mjs --redraw section:pricing=<id>')).toBe('Then: design_draw --redraw section:pricing=<id>')
  expect(asTools('node "C:/a b/scripts/assets.mjs" --get <ref>')).toBe('get_image <ref>')
  expect(asTools('node /x/scripts/assets.mjs --credits')).toBe('find_images --credits')
  expect(asTools('run node /x/scripts/inspect.mjs page.html')).toBe('run inspect_page page.html')
  expect(asTools('a real picture found with scripts/assets.mjs, or a drawing')).toBe('a real picture found with find_images, or a drawing')
})

test('only plain values reach the draw, never another flag', () => {
  expect(drawArgs({ action: 'options', sector: 'restaurant', brief: 'a bakery in Porto', sections: ['hero', 'list', 'footer'] })).toEqual([
    '--sector', 'restaurant', '--brief', 'a bakery in Porto', '--sections', 'hero,list,footer', '--options', '3',
  ])
  expect(drawArgs({ action: 'direction', sector: 'saas', brief: 'b', direction: 'swiss-grid' }).slice(-2)).toEqual(['--direction', 'swiss-grid'])
  expect(drawArgs({ action: 'redraw', slot: 'section:pricing=tiers-3' })).toEqual(['--redraw', 'section:pricing=tiers-3'])
  expect(drawArgs({ action: 'show' })).toEqual(['--show'])
  expect(() => drawArgs({ action: 'options', sector: 'saas', brief: '--out /etc' })).toThrow(/Not a valid value/)
  expect(() => drawArgs({ action: 'options', sector: 'saas', brief: 'x; rm -rf ~' })).toThrow(/Not a valid value/)
  expect(() => drawArgs({ action: 'options', brief: 'x' })).toThrow(/sector/)
  expect(() => drawArgs({ action: 'nope' })).toThrow(/Unknown action/)
})

test('a search becomes a short list, with every credit', () => {
  expect(searchArgs({ query: 'porto azulejo', orientation: 'landscape', limit: 30 })).toEqual([
    'porto azulejo', '--json', '--limit', '10', '--orientation', 'landscape',
  ])
  expect(() => searchArgs({ query: '--get openverse:1' })).toThrow()
  const { items, errors } = searchItems({
    sources: [
      {
        source: 'openverse',
        name: 'Openverse',
        items: [
          {
            ref: 'openverse:abc',
            title: 'Azulejos  na\nRibeira',
            imageWidth: 2000,
            imageHeight: 1300,
            licenseLabel: 'CC BY 2.0',
            credit: '"Azulejos" by Ana, CC BY 2.0',
            page: 'https://flickr.com/x',
            image: 'https://live.staticflickr.com/x.jpg',
          },
        ],
      },
      { source: 'met', name: 'The Met', items: [], error: 'HTTP 503' },
    ],
  })
  expect(items).toEqual([
    expect.objectContaining({ ref: 'openverse:abc', title: 'Azulejos na Ribeira', width: 2000, source: 'Openverse', credit: '"Azulejos" by Ana, CC BY 2.0' }),
  ])
  expect(errors).toEqual(['The Met: HTTP 503'])
  expect(creditLine({ credit: '"Azulejos" by Ana, CC BY 2.0', page: 'https://flickr.com/x' }, 'imagens/azulejos.jpg')).toBe(
    '- `imagens/azulejos.jpg`: "Azulejos" by Ana, CC BY 2.0 ([fonte](https://flickr.com/x))',
  )
})

test('a picture is only fetched by a ref as the search gave it', async () => {
  const folder = await project()
  await expect(getImage(folder, { ref: '--credits' })).rejects.toThrow(/ref exactly/)
  await expect(getImage(folder, { ref: 'openverse:1 --to /tmp' })).rejects.toThrow(/ref exactly/)
})

test('the draw deals directions into the project and keeps its history in TSRS', async () => {
  const folder = await project()
  const history = join(folder, 'history.json')
  const options = await drawDirection(folder, { action: 'options', sector: 'restaurant', brief: 'a bakery in Porto', seed: 7 }, history)
  expect(options.text).toContain('directions dealt')
  expect(options.text).not.toContain('draw.mjs')
  const id = /## `([\w-]+)`/.exec(options.text)![1]
  const sheet = await drawDirection(folder, { action: 'direction', sector: 'restaurant', brief: 'a bakery in Porto', direction: id, seed: 7 }, history)
  expect(sheet.text.length).toBeGreaterThan(500)
  expect(JSON.parse(await readFile(join(folder, '.taste-skill', 'direction.json'), 'utf8')).direction?.id ?? id).toBe(id)
  expect(existsSync(history)).toBe(true)
})

test('looks at a page at three widths and reports what does not fit', async () => {
  test.setTimeout(120_000)
  const folder = await project()
  await mkdir(join(folder, 'site'))
  await writeFile(
    join(folder, 'site', 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Padaria</title>' +
      '<style>body{margin:0;font:18px Georgia,serif}h1{font-size:64px;margin:40px}.wide{width:1200px;height:40px;background:#234}</style></head>' +
      '<body><h1>Padaria do Bairro</h1><p style="margin:40px">Pão quente às sete.</p><div class="wide"></div><img src="falta.jpg" alt="pão"></body></html>',
  )
  const seen = await inspectPage(folder, { file: 'site/index.html' })
  expect(seen.images.map((i) => i.label)).toEqual([
    '.taste-skill/inspect/desktop-fold.jpg',
    '.taste-skill/inspect/tablet-fold.jpg',
    '.taste-skill/inspect/mobile-fold.jpg',
  ])
  expect(seen.images[0].mime).toBe('image/jpeg')
  expect(Buffer.from(seen.images[0].data, 'base64').subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  const ids = seen.findings.map((f) => f.id)
  // Without a drawn direction, only what is wrong on any page.
  expect(ids.every((id) => STRUCTURAL.has(id))).toBe(true)
  expect(ids).toContain('broken-image')
  expect(ids).toContain('overflow')
  expect(seen.text).toContain('layout and legibility only')

  const strict = await inspectPage(folder, { file: 'site/index.html', widths: [390], strict: true, pages: true })
  expect(strict.images.map((i) => i.label)).toEqual(['.taste-skill/inspect/mobile-fold.jpg', '.taste-skill/inspect/mobile-page-01.jpg'])
  expect(strict.findings.some((f) => !STRUCTURAL.has(f.id))).toBe(true)
  expect(strict.text).toContain('TASTESKILL · LINT')

  await expect(inspectPage(folder, { file: '../fora.html' })).rejects.toThrow(/No page/)
  await expect(inspectPage(folder, { file: 'site/nada.html' })).rejects.toThrow(/No page/)
})
