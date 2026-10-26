// Episode 1 of the video tutorial: installing, and getting to know the screen. Run by hand:
//   SERIE_EP=1 npx playwright test e2e/video/ep01-rec.spec.ts --project video --workers 1
// (SERIE_LANG=en for the English take.)
import { join } from 'node:path'
import { test, type Locator, type Page } from '@playwright/test'
import { card, Episode, frameAt, hideFrame, home, keys, LIVED_IN, scene, seed, typeKeys } from './lib'

const ep = new Episode(1)

test('records the screen of episode 1', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  const state = join(ep.dir, 'screen', 'state.json')
  await seed(browser, state, { chats: LIVED_IN, demoKey: true })
  const sidebar = (p: Page) => p.locator('aside.sidebar')

  // 2 — the model picker open, with three cards.
  {
    const [claude, chaves, arquivos] = ep.at(2, 'claude', 'chaves', 'arquivos')
    await scene(ep, browser, state, 2, home, [
      [0.4, (p) => p.getByRole('button', { name: 'Escolher modelo' }).click()],
      [claude, card('Todos os modelos', 'Claude, GPT, Gemini, locais')],
      [chaves, card('Suas chaves', 'você paga só o que usa')],
      [arquivos, card('Seus dados', 'nada sai do seu computador')],
    ])
  }

  // 7 — the address typed over a dark screen, which fades to reveal TSRS already loaded.
  await scene(ep, browser, state, 7, async (page) => {
    await home(page)
    await page.evaluate(() => {
      const cover = document.createElement('div')
      cover.id = '__cover'
      cover.style.cssText = 'position:fixed;inset:0;z-index:2147482000;background:#0b0d11;transition:opacity .8s ease;display:flex;align-items:center;justify-content:center'
      const pill = document.createElement('div')
      pill.id = '__typed'
      pill.style.cssText = 'padding:15px 29px;border-radius:999px;background:#12151b;border:1px solid #3a404b;color:#efe6d2;font:500 29px monospace;min-width:27px;min-height:27px'
      cover.append(pill)
      document.documentElement.append(cover)
    })
  }, [
    [0.2, (p) => p.evaluate(() => {
      const pill = document.getElementById('__typed')!
      const text = 'localhost:5173'
      let i = 0
      const timer = setInterval(() => { pill.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(timer) }, 110)
    })],
    [ep.seconds(7) * 0.56, (p) => p.evaluate(() => {
      document.getElementById('__cover')!.style.opacity = '0'
      const pill = document.createElement('div')
      pill.textContent = 'localhost:5173'
      pill.style.cssText = 'position:fixed;z-index:2147483000;left:50%;bottom:100px;transform:translateX(-50%);padding:9px 23px;border-radius:999px;background:rgba(14,17,22,.95);border:1px solid rgba(232,119,46,.6);color:#efe6d2;font:500 20px monospace;box-shadow:0 13px 40px rgba(0,0,0,.5);opacity:0;transition:opacity .6s ease .5s'
      document.documentElement.append(pill)
      requestAnimationFrame(() => requestAnimationFrame(() => (pill.style.opacity = '1')))
    })],
  ])

  // 8 — the sidebar, item by item.
  {
    const words = ['nova', 'painel', 'quadro', 'mesa', 'busca', 'conversas', 'biblioteca', 'ferramentas', 'extensões', 'uso', 'configurações']
    const times = ep.at(8, ...words)
    const nav = (p: Page) => p.getByRole('navigation', { name: 'Estúdio' })
    const targets: ((p: Page) => Locator | Locator[])[] = [
      (p) => sidebar(p).getByRole('button', { name: 'Nova conversa' }),
      (p) => nav(p).getByRole('button', { name: 'Painel do dia' }),
      (p) => nav(p).getByRole('button', { name: 'Quadro de produção' }),
      (p) => nav(p).getByRole('button', { name: 'Mesa de agentes' }),
      (p) => sidebar(p).getByPlaceholder('Buscar nas conversas…'),
      (p) => [sidebar(p).locator('.chat-item').first(), sidebar(p).locator('.chat-item').last()],
      (p) => sidebar(p).getByRole('button', { name: 'Biblioteca' }),
      (p) => sidebar(p).getByRole('button', { name: 'Ferramentas' }),
      (p) => sidebar(p).getByRole('button', { name: 'Extensões' }),
      (p) => sidebar(p).getByRole('button', { name: 'Uso', exact: true }),
      (p) => sidebar(p).getByRole('button', { name: 'Configurações' }),
    ]
    await scene(ep, browser, state, 8, home, [
      [0.3, (p) => frameAt(p, sidebar(p), 0)],
      ...times.map((at, i) => [at, (p: Page) => frameAt(p, targets[i](p))] as [number, (p: Page) => Promise<unknown>]),
      [ep.seconds(8) + 0.2, hideFrame],
    ])
  }

  // 9 — the top bar and the message box, in a chat that has a cost.
  {
    const [modelo, agente, tokens, mensagem, anexos, ditado, voz] = ep.at(9, 'modelo', 'agente', 'tokens', 'mensagem', 'anexos', 'ditado', 'voz')
    const optional = async (p: Page, l: Locator) => { if (await l.count()) await frameAt(p, l) }
    await scene(ep, browser, state, 9, async (page) => {
      await home(page)
      await page.locator('.chat-item', { hasText: LIVED_IN[0].title }).click()
      await page.locator('.toolbar .usage').waitFor()
      await page.mouse.move(1000, 400)
    }, [
      [modelo, (p) => frameAt(p, p.getByRole('button', { name: 'Escolher modelo' }))],
      [agente, (p) => frameAt(p, p.locator('.toolbar').getByTitle('Persona desta conversa'))],
      [tokens, (p) => frameAt(p, p.locator('.toolbar .usage'))],
      [mensagem, (p) => frameAt(p, p.getByPlaceholder(/Escreva sua mensagem/))],
      [anexos, (p) => frameAt(p, p.getByRole('button', { name: 'Anexar' }))],
      [ditado, (p) => optional(p, p.getByRole('button', { name: 'Ditar', exact: true }))],
      [voz, (p) => optional(p, p.getByRole('button', { name: 'Conversa por voz', exact: true }))],
      [ep.seconds(9) + 0.2, hideFrame],
    ])
  }

  // 10 — Ctrl+K and a search for the board.
  {
    const [ctrl] = ep.at(10, 'ctrl')
    await scene(ep, browser, state, 10, async (page) => {
      await home(page)
      await page.locator('.chat-item', { hasText: LIVED_IN[0].title }).click()
      await page.mouse.move(1000, 400)
    }, [
      [ctrl, keys('Ctrl', 'K')],
      [ctrl + 0.5, (p) => p.keyboard.press('Control+k')],
      [ctrl + 1.6, (p) => typeKeys(p, 'quadro', 140)],
    ])
  }

  // 11 — the version under the name, zoomed in; the "next episode" card follows in the edit.
  {
    const [proximo] = ep.at(11, 'próximo')
    await scene(ep, browser, state, 11, home, [
      [0.3, (p) => frameAt(p, p.getByTestId('version'), 5)],
      [0.9, (p) => p.evaluate(() => {
        const v = document.querySelector('[data-testid=version]')!.getBoundingClientRect()
        const body = document.body
        body.style.transformOrigin = `0px ${v.top + v.height / 2}px`
        body.style.transition = 'transform 1.4s cubic-bezier(.3,.7,.2,1)'
        body.style.transform = 'scale(2.4)'
        document.getElementById('__hl')!.style.opacity = '0'
      })],
    ], proximo)
  }
})
