// Records the TSRS screen for episode 1 of the tutorial, one clip per scene,
// with each action at the moment the narration names it. Not part of the test
// suite: run by hand with the scene durations in EP01_DURATIONS:
//   EP01_DURATIONS=duracoes.json npx playwright test --project video --workers 1
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, type Browser, type Locator, type Page } from '@playwright/test'

const OUT = process.env.EP01_OUT ?? '/home/claude/ep01/screen'
const DUR_FILE = process.env.EP01_DURATIONS
test.skip(!DUR_FILE, 'Recording only: set EP01_DURATIONS')
const DUR: { cena: number; segundos: number }[] = DUR_FILE ? JSON.parse(readFileSync(DUR_FILE, 'utf8')) : []
const PAUSE = 0.8
const SIZE = { width: 1920, height: 1080 }
const seconds = (n: number) => DUR.find((d) => d.cena === n)!.segundos

const TEXT: Record<number, string> = {
  2: 'Com o TSRS você conversa com o Claude, o GPT, o Gemini e modelos locais numa tela só, usando as suas próprias chaves. Você paga só o que usa, direto ao provedor. Não existe conta, assinatura nem nuvem do TSRS: as conversas, as chaves e os arquivos ficam com você.',
  8: 'À esquerda fica a barra lateral: nova conversa, o estúdio com o painel do dia, o quadro de produção e a mesa de agentes, a busca e as suas conversas. Embaixo, a biblioteca, as ferramentas, as extensões, o uso e as configurações.',
  9: 'Em cima, você escolhe o modelo e o agente, e vê os tokens e o custo. Embaixo fica a caixa de mensagem, com anexos, ditado e a conversa por voz.',
  10: 'E guarde este atalho: Ctrl mais K abre a paleta de comandos, que acha qualquer ação ou conversa.',
}

// When a word is said, as a share of the scene: its position among the words.
function wordTimes(scene: number, words: string[]): number[] {
  const all = TEXT[scene].toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}+]/gu, ''))
  let from = 0
  return words.map((w) => {
    const at = all.indexOf(w, from)
    if (at < 0) throw new Error(`"${w}" is not in scene ${scene}`)
    from = at + 1
    return (at / all.length) * seconds(scene)
  })
}

const CHATS = [
  {
    title: 'Roteiro do Seu Silva #13',
    ask: 'Escreva a abertura do episódio 13 do Seu Silva em três cenas curtas, com humor seco.',
    answer:
      '**Cena 1 — Padaria, 6h40.** Seu Silva pede "o de sempre". O atendente novo traz um café com leite de aveia. Silêncio longo.\n\n**Cena 2 — Calçada.** Ele prova, olha para a câmera e diz: "Inovação."\n\n**Cena 3 — Ponto de ônibus.** O ônibus passa direto. Seu Silva ergue o copo, como quem brinda: "Ao progresso."',
    usage: { input: 1840, output: 212, cost: 0.0127 },
  },
  {
    title: 'Página da NorthWind Lab',
    ask: 'Crie a página inicial da NorthWind Lab em index.html e estilo.css.',
    answer: 'Pronto: `index.html` e `estilo.css` estão na pasta do projeto, com a seção de serviços, os trabalhos recentes e o contato.',
    usage: { input: 2610, output: 1480, cost: 0.0401 },
  },
  {
    title: 'Abertura do Milo',
    ask: 'Uma abertura de 6 segundos em 1080x1920 para o Milo, fundo azul-noite.',
    answer: 'A composição `motion` está no preview: título entrando com um brilho, 6 s a 30 fps. Clique em **Gerar MP4** quando quiser.',
    usage: { input: 1320, output: 960, cost: 0.0245 },
  },
]

// The orange frame that points at what the narration names, and the cards
// and keys shown over the app; all drawn in the page, so the video has them.
async function overlay(page: Page) {
  await page.evaluate(() => {
    if (document.getElementById('__hl')) return
    const style = document.createElement('style')
    style.textContent = `
      #__hl { position: fixed; z-index: 2147483000; pointer-events: none; border: 3px solid #e8772e; border-radius: 12px;
        box-shadow: 0 0 0 5px rgba(232,119,46,.22), 0 0 34px rgba(232,119,46,.45); opacity: 0;
        transition: left .35s ease, top .35s ease, width .35s ease, height .35s ease, opacity .25s ease; }
      #__cards { position: fixed; z-index: 2147483000; right: 48px; bottom: 120px; display: flex; flex-direction: column; gap: 14px; pointer-events: none; }
      .__card { min-width: 380px; padding: 18px 24px; border-radius: 14px; background: rgba(14,17,22,.94); border: 1px solid rgba(232,119,46,.55);
        color: #efe6d2; font: 600 30px 'IBM Plex Sans', sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,.5); transform: translateX(40px); opacity: 0;
        transition: transform .5s cubic-bezier(.2,.8,.2,1), opacity .5s ease; }
      .__card small { display: block; font-weight: 400; font-size: 20px; color: #9aa0aa; margin-top: 4px; }
      .__card.on { transform: none; opacity: 1; }
      #__pill { position: fixed; z-index: 2147483000; left: 50%; top: 18px; transform: translateX(-50%); padding: 10px 26px; border-radius: 999px;
        background: rgba(14,17,22,.95); border: 1px solid #3a404b; color: #efe6d2; font: 500 24px 'JetBrains Mono', monospace; }
      #__keys { position: fixed; z-index: 2147483000; right: 60px; top: 90px; display: flex; gap: 12px; align-items: center; opacity: 0; transition: opacity .3s;
        font: 600 30px 'IBM Plex Sans', sans-serif; color: #9aa0aa; }
      #__keys kbd { padding: 12px 22px; border-radius: 12px; background: #1b2028; border: 1px solid #3a404b; border-bottom-width: 4px; color: #efe6d2; font: 600 32px 'IBM Plex Sans', sans-serif; }
    `
    document.head.append(style)
    const hl = document.createElement('div')
    hl.id = '__hl'
    document.documentElement.append(hl)
  })
}

async function frameAt(page: Page, targets: Locator | Locator[], pad = 6) {
  const boxes = (await Promise.all([targets].flat().map((l) => l.boundingBox()))).filter((b) => b) as {
    x: number; y: number; width: number; height: number
  }[]
  if (!boxes.length) return
  const x = Math.min(...boxes.map((b) => b.x)) - pad
  const y = Math.min(...boxes.map((b) => b.y)) - pad
  const r = Math.max(...boxes.map((b) => b.x + b.width)) + pad
  const b = Math.max(...boxes.map((b) => b.y + b.height)) + pad
  await page.evaluate(([x, y, w, h]) => {
    const el = document.getElementById('__hl')!
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, opacity: '1' })
  }, [x, y, r - x, b - y])
}

const hideFrame = (page: Page) => page.evaluate(() => (document.getElementById('__hl')!.style.opacity = '0'))

// Records one scene: `setup` runs before the clip starts; `steps` are
// [seconds into the scene, action]. The clip's start in the video is saved.
async function scene(
  browser: Browser,
  state: string,
  n: number,
  length: number,
  setup: (page: Page) => Promise<void>,
  steps: [number, (page: Page) => Promise<unknown>][],
) {
  const context = await browser.newContext({
    storageState: state,
    viewport: SIZE,
    colorScheme: 'dark',
    locale: 'pt-BR',
    recordVideo: { dir: join(OUT, `raw${n}`), size: SIZE },
  })
  const page = await context.newPage()
  const created = Date.now()
  await setup(page)
  await overlay(page)
  await page.waitForTimeout(600)
  const start = Date.now()
  for (const [at, run] of steps.sort((a, b) => a[0] - b[0])) {
    const wait = start + at * 1000 - Date.now()
    if (wait > 0) await page.waitForTimeout(wait)
    await run(page)
  }
  const rest = start + length * 1000 + 300 - Date.now()
  if (rest > 0) await page.waitForTimeout(rest)
  await context.close()
  const video = await page.video()!.path()
  return { cena: n, video, offset: (start - created) / 1000, length }
}

const home = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Nova conversa' }).first().waitFor()
  await page.mouse.move(1500, 700)
}

test('records the screen of episode 1', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  // The app's state for every scene: a demo key, so no warning shows, and three chats.
  const setupContext = await browser.newContext({ viewport: SIZE, colorScheme: 'dark', locale: 'pt-BR' })
  const setupPage = await setupContext.newPage()
  await setupPage.goto('/')
  await setupPage.getByRole('button', { name: 'Nova conversa' }).first().waitFor()
  await setupPage.evaluate(async (chats) => {
    const storage: any = await import('/src/storage.ts')
    const settings = storage.loadSettings()
    settings.providers.anthropic.apiKey = 'demo'
    settings.providerId = 'anthropic'
    settings.model = 'claude-opus-5-5'
    storage.saveSettings?.(settings)
    localStorage.setItem(storage.SETTINGS_KEY, JSON.stringify(settings))
    const now = Date.now()
    await storage.saveChats(
      chats.map((c: any, i: number) => {
        const at = now - (i + 1) * 3_600_000
        return {
          id: crypto.randomUUID(),
          title: c.title,
          createdAt: at,
          updatedAt: at,
          providerId: 'anthropic',
          model: 'claude-opus-5-5',
          messages: [
            { id: crypto.randomUUID(), role: 'user', content: c.ask, createdAt: at },
            { id: crypto.randomUUID(), role: 'assistant', content: c.answer, createdAt: at + 1, providerId: 'anthropic', model: 'claude-opus-5-5', usage: c.usage },
          ],
        }
      }),
    )
  }, CHATS)
  const state = join(OUT, 'state.json')
  await setupContext.storageState({ path: state, indexedDB: true })
  await setupContext.close()

  const clips = []
  const sidebar = (page: Page) => page.locator('aside.sidebar')

  // 2 — the model picker, scrolled slowly, with three cards.
  {
    const [claude, chaves, arquivos] = wordTimes(2, ['claude', 'chaves', 'arquivos'])
    const card = (text: string, sub: string) => (page: Page) =>
      page.evaluate(([text, sub]) => {
        let box = document.getElementById('__cards')
        if (!box) { box = document.createElement('div'); box.id = '__cards'; document.documentElement.append(box) }
        const el = document.createElement('div')
        el.className = '__card'
        el.innerHTML = `${text}<small>${sub}</small>`
        box.append(el)
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')))
      }, [text, sub])
    clips.push(await scene(browser, state, 2, seconds(2) + PAUSE, home, [
      [0.4, (p) => p.getByRole('button', { name: 'Escolher modelo' }).click()],
      [claude, card('Todos os modelos', 'Claude, GPT, Gemini, locais')],
      [chaves, card('Suas chaves', 'você paga só o que usa')],
      [arquivos, card('Seus dados', 'nada sai do seu computador')],
    ]))
  }

  // 7 — the address typed over a dark screen, which fades to reveal TSRS already loaded.
  clips.push(await scene(browser, state, 7, seconds(7) + PAUSE, async (page) => {
    await home(page)
    await page.evaluate(() => {
      const cover = document.createElement('div')
      cover.id = '__cover'
      cover.style.cssText = 'position:fixed;inset:0;z-index:2147482000;background:#0b0d11;transition:opacity .8s ease;display:flex;align-items:center;justify-content:center'
      const pill = document.createElement('div')
      pill.id = '__typed'
      pill.style.cssText = 'padding:22px 44px;border-radius:999px;background:#12151b;border:1px solid #3a404b;color:#efe6d2;font:500 44px monospace;min-width:40px;min-height:40px'
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
    [seconds(7) * 0.56, (p) => p.evaluate(() => {
      document.getElementById('__cover')!.style.opacity = '0'
      const pill = document.createElement('div')
      pill.textContent = 'localhost:5173'
      pill.style.cssText = 'position:fixed;z-index:2147483000;left:50%;bottom:150px;transform:translateX(-50%);padding:14px 34px;border-radius:999px;background:rgba(14,17,22,.95);border:1px solid rgba(232,119,46,.6);color:#efe6d2;font:500 30px monospace;box-shadow:0 20px 60px rgba(0,0,0,.5);opacity:0;transition:opacity .6s ease .5s'
      document.documentElement.append(pill)
      requestAnimationFrame(() => requestAnimationFrame(() => (pill.style.opacity = '1')))
    })],
  ]))

  // 8 — the sidebar, item by item.
  {
    const words = ['nova', 'painel', 'quadro', 'mesa', 'busca', 'conversas', 'biblioteca', 'ferramentas', 'extensões', 'uso', 'configurações']
    const times = wordTimes(8, words)
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
    clips.push(await scene(browser, state, 8, seconds(8) + PAUSE, home, [
      [0.3, (p) => frameAt(p, sidebar(p), 0)],
      ...times.map((at, i) => [at, (p: Page) => frameAt(p, targets[i](p))] as [number, (p: Page) => Promise<unknown>]),
      [seconds(8) + 0.2, hideFrame],
    ]))
  }

  // 9 — the top bar and the message box, in a chat that has a cost.
  {
    const [modelo, agente, tokens, mensagem, anexos, ditado, voz] = wordTimes(9, ['modelo', 'agente', 'tokens', 'mensagem', 'anexos', 'ditado', 'voz'])
    const optional = async (p: Page, l: Locator) => { if (await l.count()) await frameAt(p, l) }
    clips.push(await scene(browser, state, 9, seconds(9) + PAUSE, async (page) => {
      await home(page)
      await page.locator('.chat-item', { hasText: 'Roteiro do Seu Silva #13' }).click()
      await page.locator('.toolbar .usage').waitFor()
      await page.mouse.move(1500, 600)
    }, [
      [modelo, (p) => frameAt(p, p.getByRole('button', { name: 'Escolher modelo' }))],
      [agente, (p) => frameAt(p, p.locator('[title="Persona desta conversa"]'))],
      [tokens, (p) => frameAt(p, p.locator('.toolbar .usage'))],
      [mensagem, (p) => frameAt(p, p.getByPlaceholder(/Escreva sua mensagem/))],
      [anexos, (p) => frameAt(p, p.getByRole('button', { name: 'Anexar' }))],
      [ditado, (p) => optional(p, p.getByRole('button', { name: 'Ditar', exact: true }))],
      [voz, (p) => optional(p, p.getByRole('button', { name: 'Conversa por voz', exact: true }))],
      [seconds(9) + 0.2, hideFrame],
    ]))
  }

  // 10 — Ctrl+K and a search for the board.
  {
    const [ctrl] = wordTimes(10, ['ctrl'])
    clips.push(await scene(browser, state, 10, seconds(10) + PAUSE, async (page) => {
      await home(page)
      await page.locator('.chat-item', { hasText: 'Roteiro do Seu Silva #13' }).click()
      await page.mouse.move(1500, 600)
    }, [
      [ctrl, (p) => p.evaluate(() => {
        const keys = document.createElement('div')
        keys.id = '__keys'
        keys.innerHTML = '<kbd>Ctrl</kbd>+<kbd>K</kbd>'
        document.documentElement.append(keys)
        requestAnimationFrame(() => (keys.style.opacity = '1'))
      })],
      [ctrl + 0.5, (p) => p.keyboard.press('Control+k')],
      [ctrl + 1.6, (p) => p.keyboard.type('quadro', { delay: 140 })],
    ]))
  }

  // 11 — the version under the name, zoomed in; the end card follows in the edit.
  clips.push(await scene(browser, state, 11, 4.4, home, [
    [0.3, (p) => frameAt(p, p.getByTestId('version'), 5)],
    [0.9, (p) => p.evaluate(() => {
      const v = document.querySelector('[data-testid=version]')!.getBoundingClientRect()
      const body = document.body
      body.style.transformOrigin = `0px ${v.top + v.height / 2}px`
      body.style.transition = 'transform 1.4s cubic-bezier(.3,.7,.2,1)'
      body.style.transform = 'scale(2.4)'
      document.getElementById('__hl')!.style.opacity = '0'
    })],
  ]))

  writeFileSync(join(OUT, 'clips.json'), JSON.stringify(clips, null, 2))
})
