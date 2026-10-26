// Episode 5 of the video tutorial: the preview and the canvas. Run by hand:
//   SERIE_EP=5 npx playwright test e2e/video/ep05-rec.spec.ts --project video --workers 1
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { composer, EN, Episode, frameAt, hideFrame, home, LIVED_IN, point, replies, scene, seed, tr, typeIn } from './lib'
import { PAGE_CSS, PAGE_HTML, PAGE_REPLY } from './pages'

const ep = new Episode(5)

const BIGGER = PAGE_CSS.replace('h1 { font-size: 56px; color: #c9a35a; margin: 0; }', 'h1 { font-size: 56px; color: #e8772e; margin: 0; }\n@media (max-width: 600px) { h1 { font-size: 64px; } }')
const SCRIPT_TEXT =
  '# Seu Silva — Episódio 1: O pão de sempre\n\n' +
  '## Cena 1 — Padaria, 6h40\nSeu Silva entra, cumprimenta todo mundo pelo nome e pede "o de sempre". O atendente é novo e não sabe o que é.\n\n' +
  '## Cena 2 — O balcão\nSeu Silva explica com calma: pão na chapa, pouca manteiga, café pingado em copo americano. O atendente anota tudo num tablet. A fila cresce atrás dele, e ninguém reclama, porque todos querem saber como termina.\n\n' +
  '## Cena 3 — A mesa\nChega um croissant de pistache. Seu Silva prova, pensa e diz: "Amanhã eu quero isto."'
const SHORT_SCENE = '## Cena 2 — O balcão\nSeu Silva explica o pedido inteiro. O atendente anota num tablet, e a fila espera, curiosa.'

const SCRIPT: Scripted[] = [
  { when: /Crie a página inicial/, text: PAGE_REPLY, title: 'Página da NorthWind Lab', wps: 60 },
  {
    when: /laranja e maior/,
    text: 'Feito: o título ficou laranja e, no celular, maior.\n\n```html index.html\n' + PAGE_HTML.replace('<link rel="stylesheet" href="estilo.css">', '<style>\n' + BIGGER + '\n</style>') + '\n```',
    wps: 600,
  },
  {
    when: /canvas o roteiro/,
    tools: [{ name: 'canvas_write', input: { content: SCRIPT_TEXT, title: 'Seu Silva — Episódio 1', language: 'markdown' } }],
    text: 'Escrevi o roteiro no canvas, em três cenas. Mude o que quiser à mão.',
  },
  {
    when: /^Sobre este trecho do canvas/,
    tools: [{ name: 'canvas_edit', input: { edits: [{ find: SCRIPT_TEXT.slice(SCRIPT_TEXT.indexOf('## Cena 2'), SCRIPT_TEXT.indexOf('\n\n## Cena 3')), replace: SHORT_SCENE }] } }],
    text: 'Encurtei só a cena 2; o resto ficou igual.',
  },
]

test('records the screen of episode 5', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const state = join(ep.dir, 'screen', 'live.json')
  await seed(browser, state, { mockUrl: mock.url, chats: LIVED_IN.slice(0, 1).concat(LIVED_IN.slice(2)) })
  const panel = (p: Page) => p.locator('.preview')
  const withPage = async (p: Page) => {
    await home(p)
    await composer(p).fill(tr('Crie a página inicial da NorthWind Lab em index.html e estilo.css'))
    await composer(p).press('Enter')
    await expect(replies(p).last()).toContainText(tr('NOTAS.md'), { timeout: 30_000 })
    await p.mouse.move(1000, 600)
  }
  const withPreview = async (p: Page) => {
    await withPage(p)
    await replies(p).last().getByRole('button', { name: 'Abrir preview' }).first().click()
    await panel(p).waitFor()
    await p.waitForTimeout(800)
  }

  // 2 — Open preview: the page, working, beside the chat.
  {
    const [abrir, funcionando] = ep.at(2, 'abrir', 'funcionando')
    await scene(ep, browser, state, 2, withPage, [
      [abrir - 0.3, async (p) => {
        const button = replies(p).last().getByRole('button', { name: 'Abrir preview' }).first()
        await button.scrollIntoViewIfNeeded()
        await frameAt(p, button)
        await point(p, button)
        await hideFrame(p)
      }],
      [funcionando, (p) => frameAt(p, panel(p))],
    ])
  }

  // 3 — Phone, tablet, computer; then the code and console tabs.
  {
    const [celular, tablet, computador, codigo, console_] = ep.at(3, 'celular', 'tablet', 'computador', 'código', 'console')
    const size = (name: string) => async (p: Page) => {
      const button = panel(p).getByRole('button', { name })
      await frameAt(p, button)
      await point(p, button)
    }
    await scene(ep, browser, state, 3, withPreview, [
      [celular, size('Celular')],
      [tablet, size('Tablet')],
      [computador, size('Computador')],
      [codigo, async (p) => { const tab = panel(p).getByRole('tab', { name: 'Código' }); await frameAt(p, tab); await point(p, tab) }],
      [console_, async (p) => { const tab = panel(p).getByRole('tab', { name: /Console/ }); await frameAt(p, tab); await point(p, tab) }],
    ])
  }

  // 4 — Ask for a change and watch the preview follow.
  {
    const [veja] = ep.at(4, 'veja')
    await scene(ep, browser, state, 4, async (p) => {
      await withPreview(p)
      await panel(p).getByRole('button', { name: 'Celular' }).click()
    }, [
      [0.1, async (p) => {
        await typeIn(composer(p), 'Deixe o título laranja e maior no celular', 25)
        await composer(p).press('Enter')
      }],
      [veja + 0.4, async (p) => {
        await expect(p.getByRole('button', { name: 'Enviar' })).toBeVisible({ timeout: 3000 }).catch(() => {})
        const open = replies(p).last().getByRole('button', { name: 'Abrir preview' })
        if (await open.count()) await open.first().click()
        await frameAt(p, panel(p))
      }],
    ])
  }

  // 8 — The canvas: the model writes the script in it.
  {
    const [canvas, documento, edita] = ep.at(8, 'canvas', 'documento', 'edita')
    await scene(ep, browser, state, 8, home, [
      [canvas - 0.3, async (p) => {
        const button = p.getByRole('button', { name: 'Canvas', exact: true })
        await frameAt(p, button)
        await point(p, button)
        await hideFrame(p)
      }],
      [documento - 0.4, async (p) => {
        await typeIn(composer(p), 'Escreva no canvas o roteiro do episódio 1 do Seu Silva, em cenas', 18)
        await composer(p).press('Enter')
      }],
      [edita + 0.3, (p) => frameAt(p, p.locator('.canvas').getByLabel('Texto do canvas'))],
    ])
  }

  // 9 — Select one scene in the canvas and ask to shorten just it.
  {
    const [selecione, peca, resto] = ep.at(9, 'selecione', 'peça', 'resto')
    const text = (p: Page) => p.locator('.canvas').getByLabel('Texto do canvas')
    await scene(ep, browser, state, 9, async (p) => {
      await home(p)
      await p.getByRole('button', { name: 'Canvas', exact: true }).click()
      await composer(p).fill(tr('Escreva no canvas o roteiro do episódio 1 do Seu Silva, em cenas'))
      await composer(p).press('Enter')
      await expect(text(p)).toHaveValue(EN ? /Scene 3/ : /Cena 3/, { timeout: 30_000 })
      await expect(p.getByRole('button', { name: 'Enviar' })).toBeVisible({ timeout: 30_000 })
      await p.mouse.move(1000, 600)
    }, [
      [selecione, async (p) => {
        await text(p).focus()
        // The second scene's heading, in the language of the take.
        const [two, three] = EN ? ['## Scene 2', '\n\n## Scene 3'] : ['## Cena 2', '\n\n## Cena 3']
        await text(p).evaluate((field: HTMLTextAreaElement, [two, three]) => {
          const from = field.value.indexOf(two)
          field.setSelectionRange(from, field.value.indexOf(three))
          field.dispatchEvent(new Event('select', { bubbles: true }))
        }, [two, three])
        await frameAt(p, p.locator('.canvas').getByLabel('Pedir uma mudança'))
      }],
      [peca, async (p) => {
        const ask = p.locator('.canvas').getByLabel('Pedir uma mudança')
        await ask.fill(tr('encurte esta cena'))
        await p.waitForTimeout(300)
        await ask.press('Enter')
        await hideFrame(p)
      }],
      [resto + 0.3, (p) => frameAt(p, text(p))],
    ])
  }

  await mock.close()
})
