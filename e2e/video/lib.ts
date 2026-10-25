// Shared pieces for the tutorial recordings (e2e/video/epNN-rec.spec.ts):
// timing from the narration, the orange frame, cards and keys drawn over the
// app, one recorded clip per scene, and the app's starting state.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'

export const SERIE = process.env.SERIE_DIR ?? '/home/claude/serie'
export const PAUSE = 0.8
export const TAIL = 2
// Recorded at 1280×720 and scaled to 1080p in the edit, so the app's text reads on a phone.
export const SIZE = { width: 1280, height: 720 }

export type Step = [number, (page: Page) => Promise<unknown>]

export class Episode {
  n: number
  dir: string
  texts: string[]
  dur: Record<number, number>
  clips: { cena: number; video: string; offset: number; length: number; speed?: number }[] = []

  constructor(n: number) {
    this.n = n
    this.dir = join(SERIE, `ep${String(n).padStart(2, '0')}`)
    const file = join(this.dir, 'duracoes.json')
    test.skip(!process.env.SERIE_EP || !existsSync(file), 'Recording only: set SERIE_EP')
    const roteiros = existsSync(join(SERIE, 'roteiros.json')) ? JSON.parse(readFileSync(join(SERIE, 'roteiros.json'), 'utf8')) : {}
    this.texts = (roteiros[n]?.cenas ?? []).map((c: any) => c.texto)
    this.dur = existsSync(file) ? Object.fromEntries(JSON.parse(readFileSync(file, 'utf8')).map((d: any) => [d.cena, d.segundos])) : {}
    // SERIE_ONLY=7,8 records just those scenes and keeps the others' clips.
    const kept = join(this.dir, 'screen', 'clips.json')
    if (this.only.length && existsSync(kept)) this.clips = JSON.parse(readFileSync(kept, 'utf8'))
  }

  only = (process.env.SERIE_ONLY ?? '').split(',').filter(Boolean).map(Number)

  skips(c: number) {
    return this.only.length > 0 && !this.only.includes(c)
  }

  seconds(c: number) {
    return this.dur[c]
  }

  // The clip's length: the scene's audio, the pause, and the tail after the last.
  length(c: number) {
    return this.dur[c] + PAUSE + (c === this.texts.length ? TAIL : 0)
  }

  // When each word is said, as a share of the scene: its place among the words.
  at(c: number, ...words: string[]): number[] {
    const all = this.texts[c - 1].toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}+]/gu, ''))
    let from = 0
    return words.map((w) => {
      const i = all.indexOf(w, from)
      if (i < 0) throw new Error(`"${w}" is not in scene ${c}: ${all.join(' ')}`)
      from = i + 1
      return (i / all.length) * this.dur[c]
    })
  }

  save() {
    writeFileSync(join(this.dir, 'screen', 'clips.json'), JSON.stringify(this.clips, null, 2))
  }
}

const STYLE = `
  #__hl { position: fixed; z-index: 2147483000; pointer-events: none; border: 2px solid #e8772e; border-radius: 8px;
    box-shadow: 0 0 0 3px rgba(232,119,46,.22), 0 0 23px rgba(232,119,46,.45); opacity: 0;
    transition: left .35s ease, top .35s ease, width .35s ease, height .35s ease, opacity .25s ease; }
  #__cards { position: fixed; z-index: 2147483000; right: 32px; bottom: 80px; display: flex; flex-direction: column; gap: 9px; pointer-events: none; }
  .__card { min-width: 253px; max-width: 413px; padding: 12px 16px; border-radius: 9px; background: rgba(14,17,22,.94); border: 1px solid rgba(232,119,46,.55);
    color: #efe6d2; font: 600 20px 'IBM Plex Sans', sans-serif; box-shadow: 0 13px 40px rgba(0,0,0,.5); transform: translateX(27px); opacity: 0;
    transition: transform .5s cubic-bezier(.2,.8,.2,1), opacity .5s ease; }
  .__card small { display: block; font-weight: 400; font-size: 13px; color: #9aa0aa; margin-top: 3px; }
  .__card.on { transform: none; opacity: 1; }
  #__keys { position: fixed; z-index: 2147483000; right: 40px; top: 60px; display: flex; gap: 8px; align-items: center; opacity: 0; transition: opacity .3s;
    font: 600 20px 'IBM Plex Sans', sans-serif; color: #9aa0aa; }
  #__keys kbd { padding: 8px 15px; border-radius: 8px; background: #1b2028; border: 1px solid #3a404b; border-bottom-width: 3px; color: #efe6d2; font: 600 21px 'IBM Plex Sans', sans-serif; }
  #__badge { position: fixed; z-index: 2147483000; left: 50%; top: 15px; transform: translateX(-50%); padding: 7px 17px; border-radius: 666px;
    background: rgba(14,17,22,.95); border: 1px solid rgba(232,119,46,.6); color: #efe6d2; font: 600 16px 'IBM Plex Sans', sans-serif; letter-spacing: .08em; }
  #__term { position: fixed; z-index: 2147482500; left: 50%; top: 50%; width: 867px; transform: translate(-50%, -50%); border-radius: 12px; overflow: hidden;
    background: #0e1116; border: 1px solid #2a303b; box-shadow: 0 27px 93px rgba(0,0,0,.7); transition: opacity .5s ease; }
  #__term .bar { height: 36px; background: #161a21; border-bottom: 1px solid #2a303b; display: flex; align-items: center; gap: 8px; padding: 0 15px;
    font: 500 15px 'IBM Plex Sans', sans-serif; color: #8b8f98; }
  #__term .bar i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  #__term pre { margin: 0; padding: 20px 24px; min-height: 173px; font: 20px/1.6 'JetBrains Mono', monospace; color: #efe6d2; white-space: pre-wrap; }
  #__term .p { color: #7aa2f7; } #__term .ok { color: #6fbf73; } #__term .o { color: #9aa0aa; }
  #__dim { position: fixed; inset: 0; z-index: 2147482400; background: rgba(5,6,8,.72); transition: opacity .5s ease; }
`

// The orange frame, the cards and the keys: drawn in the page, so the video has them.
export async function overlay(page: Page) {
  await page.evaluate((css) => {
    if (document.getElementById('__hl')) return
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    const hl = document.createElement('div')
    hl.id = '__hl'
    document.documentElement.append(hl)
  }, STYLE)
}

export async function frameAt(page: Page, targets: Locator | Locator[], pad = 6) {
  const boxes = (await Promise.all([targets].flat().map((l) => l.first().boundingBox().catch(() => null)))).filter((b) => b) as {
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

export const hideFrame = (page: Page) => page.evaluate(() => (document.getElementById('__hl')!.style.opacity = '0'))

export const card = (text: string, sub = '') => (page: Page) =>
  page.evaluate(([text, sub]) => {
    let box = document.getElementById('__cards')
    if (!box) { box = document.createElement('div'); box.id = '__cards'; document.documentElement.append(box) }
    const el = document.createElement('div')
    el.className = '__card'
    el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`
    box.append(el)
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')))
  }, [text, sub])

export const clearCards = (page: Page) => page.evaluate(() => document.getElementById('__cards')?.remove())

export const keys = (...names: string[]) => (page: Page) =>
  page.evaluate((names) => {
    document.getElementById('__keys')?.remove()
    const el = document.createElement('div')
    el.id = '__keys'
    el.innerHTML = names.map((k) => `<kbd>${k}</kbd>`).join('+')
    document.documentElement.append(el)
    requestAnimationFrame(() => (el.style.opacity = '1'))
  }, names)

export const hideKeys = (page: Page) => page.evaluate(() => { const k = document.getElementById('__keys'); if (k) k.style.opacity = '0' })

export const badge = (text: string) => (page: Page) =>
  page.evaluate((text) => {
    document.getElementById('__badge')?.remove()
    const el = document.createElement('div')
    el.id = '__badge'
    el.textContent = text
    document.documentElement.append(el)
  }, text)

// A terminal over the app, with lines typed in turn: [delay ms, kind, text].
export const terminal = (title: string, lines: ['cmd' | 'out' | 'ok', string, number?][], prompt = 'PS C:\\> ') => (page: Page) =>
  page.evaluate(([title, lines, prompt]) => {
    const dim = document.createElement('div')
    dim.id = '__dim'
    const win = document.createElement('div')
    win.id = '__term'
    win.innerHTML = `<div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span style="margin-left:14px">${title}</span></div><pre></pre>`
    document.documentElement.append(dim, win)
    const pre = win.querySelector('pre')!
    let delay = 300
    for (const [kind, text, wait] of lines as any[]) {
      delay += wait ?? 400
      const start = delay
      if (kind === 'cmd') {
        setTimeout(() => {
          const row = document.createElement('div')
          row.innerHTML = `<span class="p">${prompt}</span><span></span>`
          pre.append(row)
          let i = 0
          const timer = setInterval(() => { row.lastElementChild!.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(timer) }, 55)
        }, start)
        delay += text.length * 55
      } else {
        setTimeout(() => {
          const row = document.createElement('div')
          row.className = kind === 'ok' ? 'ok' : 'o'
          row.textContent = text
          pre.append(row)
        }, start)
      }
    }
  }, [title, lines, prompt] as const)

export const closeTerminal = (page: Page) =>
  page.evaluate(() => {
    for (const id of ['__term', '__dim']) {
      const el = document.getElementById(id)
      if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 600) }
    }
  })

// Moves the mouse there smoothly and clicks, so the viewer sees where.
export async function point(page: Page, target: Locator, click = true) {
  const box = await target.first().boundingBox()
  if (!box) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 })
  if (click) await target.first().click()
}

// Types into a field like a person, at `delay` ms a letter. The app is slow to
// take keys while the video records, so the text shown follows the clock:
// each step fills in as much as should be there by now.
export async function typeIn(target: Locator, text: string, delay = 55) {
  await target.click()
  await typeKeys(target.page(), text, delay, target)
}

export async function typeKeys(page: Page, text: string, delay = 55, target?: Locator) {
  const started = Date.now()
  const before = target ? await target.inputValue() : ''
  let shown = 0
  while (shown < text.length) {
    await page.waitForTimeout(Math.min(80, delay))
    const due = Math.min(text.length, Math.max(shown + 1, Math.floor((Date.now() - started) / delay)))
    if (target) await target.fill(before + text.slice(0, due))
    else await page.keyboard.insertText(text.slice(shown, due))
    shown = due
  }
}

// Records one scene: `setup` runs before the clip starts; `steps` are
// [seconds into the scene, action]. The clip's start in the video is saved.
export async function scene(
  ep: Episode,
  browser: Browser,
  state: string,
  n: number,
  setup: (page: Page, context: BrowserContext) => Promise<void>,
  steps: Step[],
  length = ep.length(n),
  // Records `speed` times longer; the edit plays it that much faster.
  speed = 1,
) {
  if (ep.skips(n)) return
  length = length * speed
  const context = await browser.newContext({
    storageState: state,
    viewport: SIZE,
    colorScheme: 'dark',
    locale: 'pt-BR',
    recordVideo: { dir: join(ep.dir, 'screen', `raw${n}`), size: SIZE },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const created = Date.now()
  await setup(page, context)
  await overlay(page)
  await page.waitForTimeout(500)
  const start = Date.now()
  for (const [at, run] of steps.sort((a, b) => a[0] - b[0])) {
    const wait = start + at * 1000 - Date.now()
    if (wait > 0) await page.waitForTimeout(wait)
    // A step that fails is reported, and the scene goes on: the clip is still useful to look at.
    await run(page).catch((err) => console.log(`[scene ${n} @${at.toFixed(2)}] ${String(err.message).split('\n')[0]}`))
  }
  const rest = start + length * 1000 + 300 - Date.now()
  if (rest > 0) await page.waitForTimeout(rest)
  await context.close()
  const video = await page.video()!.path()
  ep.clips = [...ep.clips.filter((c) => c.cena !== n), { cena: n, video, offset: (start - created) / 1000, length, speed }].sort((a, b) => a.cena - b.cena)
  ep.save()
}

export const home = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Nova conversa' }).first().waitFor({ timeout: 30_000 })
  await page.mouse.move(1000, 480)
}

export async function openSettings(page: Page, section?: string) {
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  if (section) await page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: section }).click()
}

export const composer = (page: Page) => page.getByPlaceholder(/Escreva sua mensagem/)
export const replies = (page: Page) => page.locator('.message.assistant')
export const chatRow = (page: Page, title: string) => page.locator('.chat-item', { hasText: title })

export interface SeedChat {
  title: string
  ask: string
  answer: string
  usage?: { input: number; output: number; cost?: number }
  folderId?: string
  // How long ago it happened, in hours (default: one hour per place in the list).
  hoursAgo?: number
  // More fields for the chat (a scheduleId, say).
  extra?: Record<string, unknown>
}

// Saves the app's starting state: Anthropic pointed at `mockUrl` (or a demo
// key, for scenes that show the settings), and the given chats.
export async function seed(
  browser: Browser,
  file: string,
  opts: { mockUrl?: string; chats?: SeedChat[]; tweak?: string; demoKey?: boolean } = {},
) {
  const context = await browser.newContext({ viewport: SIZE, colorScheme: 'dark', locale: 'pt-BR' })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Nova conversa' }).first().waitFor()
  await page.evaluate(async ({ mockUrl, chats, tweak, demoKey }) => {
    const storage: any = await import('/src/storage.ts')
    const settings = storage.loadSettings()
    // Without the stand-in, a key that only keeps the "enter your key" note away.
    settings.providers.anthropic.apiKey = mockUrl || demoKey ? 'sk-ant-video' : ''
    if (mockUrl) settings.providers.anthropic.baseUrl = mockUrl
    settings.providerId = 'anthropic'
    settings.model = 'claude-opus-5-5'
    if (tweak) new Function('settings', tweak)(settings)
    localStorage.setItem(storage.SETTINGS_KEY, JSON.stringify(settings))
    const now = Date.now()
    if (chats?.length) {
      await storage.saveChats(
        chats.map((c: any, i: number) => {
          const at = now - (c.hoursAgo ?? i + 1) * 3_600_000
          return {
            id: crypto.randomUUID(),
            title: c.title,
            createdAt: at,
            updatedAt: at,
            providerId: 'anthropic',
            model: 'claude-opus-5-5',
            ...(c.folderId ? { folderId: c.folderId } : {}),
            ...(c.extra ?? {}),
            messages: [
              { id: crypto.randomUUID(), role: 'user', content: c.ask, createdAt: at },
              { id: crypto.randomUUID(), role: 'assistant', content: c.answer, createdAt: at + 1, providerId: 'anthropic', model: 'claude-opus-5-5', usage: c.usage },
            ],
          }
        }),
      )
    }
  }, opts)
  await context.storageState({ path: file, indexedDB: true })
  await context.close()
}

// Chats seen in the sidebar of every episode, so the app looks lived in.
export const LIVED_IN: SeedChat[] = [
  {
    title: 'Roteiro do Seu Silva #13',
    ask: 'Escreva a abertura do episódio 13 do Seu Silva em três cenas curtas, com humor seco.',
    answer: '**Cena 1 — Padaria, 6h40.** Seu Silva pede "o de sempre". O atendente novo traz um café com leite de aveia. Silêncio longo.\n\n**Cena 2 — Calçada.** Ele prova, olha para a câmera e diz: "Inovação."\n\n**Cena 3 — Ponto de ônibus.** O ônibus passa direto. Seu Silva ergue o copo, como quem brinda: "Ao progresso."',
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
