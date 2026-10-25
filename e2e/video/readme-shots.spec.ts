// Screenshots for the README, with the interface in English (Settings → Language).
// Run by hand, with the dev server on port 5174:
//   README_SHOTS=docs/screenshots npx playwright test e2e/video/readme-shots.spec.ts --project video --workers 1
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { en } from '../../src/locales/en'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { seed, type SeedChat } from './lib'
import { opening } from './motion-nwind'

const OUT = resolve(process.env.README_SHOTS ?? 'docs/screenshots')
const PROJECTS = process.env.TSRS_PROJECTS ?? '/home/claude/tsrs/projetos'
const SIZE = { width: 1440, height: 900 }
const T = (pt: string) => (en as Record<string, string>)[pt] ?? pt

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const CHATS: SeedChat[] = [
  {
    title: 'Opening scene, short film',
    ask: 'Write the opening of a three-scene short about a retired man and a bakery app. Dry humour.',
    answer: '**Scene 1 — Bakery, 6:40 am.** He orders "the usual". The new clerk brings an oat-milk latte. A long silence.\n\n**Scene 2 — Sidewalk.** He tastes it, looks at the camera: "Innovation."',
    usage: { input: 1840, output: 212, cost: 0.0127 },
  },
  {
    title: 'Research: AI in short ads',
    ask: 'What changed in short video ads made with AI this year?',
    answer: 'Three things: cheaper image-to-video, consistent characters across shots, and voices good enough for narration.',
    usage: { input: 3120, output: 640, cost: 0.0251 },
  },
  {
    title: 'Milo opening, 6 s',
    ask: 'A 6-second vertical opening for Milo, night-blue background.',
    answer: 'The `motion` composition is in the preview: 6 s at 30 fps. Click **Generate MP4** when you are ready.',
    usage: { input: 1320, output: 960, cost: 0.0245 },
  },
]

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>NorthWind Lab</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #0b0d11; color: #efe6d2; }
  header { padding: 96px 32px 72px; text-align: center; background: radial-gradient(60% 80% at 50% 0%, rgba(232,119,46,.25), transparent 70%); }
  h1 { font-size: 64px; margin: 0; color: #c9a35a; letter-spacing: -.02em; }
  header p { font-size: 20px; color: #b9b2a5; margin: 14px 0 28px; }
  a.cta { display: inline-block; background: #e8772e; color: #1a0d04; padding: 12px 22px; border-radius: 10px; font-weight: 600; text-decoration: none; }
  .services { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; padding: 24px 32px 48px; }
  article { border: 1px solid #232833; border-radius: 14px; padding: 22px; background: #11141a; }
  article h2 { margin: 0 0 6px; font-size: 20px; }
  article p { margin: 0; color: #9a948a; }
  footer { padding: 32px; text-align: center; color: #8b8f98; border-top: 1px solid #1c2029; }
</style></head>
<body>
  <header><h1>NorthWind Lab</h1><p>Ads and short films, made with AI.</p><a class="cta" href="#">See our work</a></header>
  <section class="services">
    <article><h2>Ads</h2><p>15 to 30 seconds, ready for social.</p></article>
    <article><h2>Short films</h2><p>Animated series, from script to sound.</p></article>
    <article><h2>Motion</h2><p>Openings, titles and logo reveals.</p></article>
  </section>
  <footer>contact@northwindlab.com</footer>
</body>
</html>`

const SCRIPT: Scripted[] = [
  {
    when: /landing page/,
    title: 'NorthWind Lab landing page',
    text: 'Here is the landing page, in one file.\n\n```html index.html\n' + PAGE + '\n```\n\nIt is saved in the project folder, and NOTES.md records what was done.',
    wps: 400,
  },
  { when: /tagline/, title: 'Tagline for the studio', text: '**"Stories, at the speed of light."** Short, a little poetic, and it says what the studio does: fast work that still feels crafted.', wps: 200 },
  { when: /tagline/, text: '**"Small studio. Big pictures."** It turns the size of the team into a promise about the work.', wps: 200 },
  { when: /tagline/, text: '**"Ads that feel like films."** Clear about the offer, and about the ambition behind it.', wps: 200 },
  {
    when: /vertical opening/,
    title: 'NWind Lab opening',
    text: 'Your opening, 1080×1920, 6 s at 30 fps, with a fade at the end:\n\n```motion\n' + opening({ gold: true, early: true }) + '\n```\n\nOpen it in the preview to see the timeline.',
    wps: 400,
  },
]

function writeBoard() {
  const now = Date.now()
  const c = (id: string, title: string, column: string, extra: object = {}) => ({ id, title, column, kind: 'episodio', createdAt: now, updatedAt: now, ...extra })
  const board = {
    version: 1,
    columns: [
      { id: 'script', name: 'Script' }, { id: 'takes', name: 'Takes' }, { id: 'edit', name: 'Edit' },
      { id: 'render', name: 'Render' }, { id: 'review', name: 'Review' }, { id: 'published', name: 'Published' },
    ],
    cards: [
      c('milo-4', 'Milo #4', 'script', { series: 'Milo', language: 'EN', due: day(3) }),
      c('short-13', 'The Bakery App #13', 'takes', { series: 'The Bakery App', language: 'EN', due: day(2) }),
      c('ad-watch', 'Watch shop ad', 'edit', { kind: 'ad', series: 'Time & Co.', due: day(1) }),
      c('ad-cafe', 'Café Aurora ad', 'render', { kind: 'ad', series: 'Café Aurora', due: day(0) }),
      c('milo-3', 'Milo #3', 'review', { series: 'Milo', language: 'EN' }),
      c('short-12', 'The Bakery App #12', 'published', { series: 'The Bakery App', language: 'EN' }),
    ],
    removed: [],
  }
  mkdirSync(join(PROJECTS, '_producao'), { recursive: true })
  writeFileSync(join(PROJECTS, '_producao', 'quadro.json'), JSON.stringify(board, null, 2))
}

const ENGLISH =
  "settings.language = 'en';" +
  `settings.focus = [{ id: 'f1', text: 'Record Milo #4', done: true, day: '${day(0)}' }, { id: 'f2', text: 'Review the watch shop ad', done: false, day: '${day(0)}' }, { id: 'f3', text: 'Render the Café Aurora ad', done: false, day: '${day(0)}' }];`

async function open(browser: Browser, state: string) {
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'en-US', storageState: state })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: T('Nova conversa') }).first().waitFor()
  return page
}

const composer = (p: Page) => p.locator('.composer textarea').first()
const replies = (p: Page) => p.locator('.message.assistant')
const idle = (p: Page) => expect(composer(p)).toBeEnabled({ timeout: 60_000 }).then(() => p.waitForTimeout(800))
async function send(p: Page, text: string) {
  await composer(p).fill(text)
  await composer(p).press('Enter')
  await expect(replies(p)).not.toHaveCount(0, { timeout: 30_000 })
  await p.waitForTimeout(2500)
}
const shot = async (p: Page, name: string) => {
  await p.mouse.move(SIZE.width - 4, SIZE.height - 4)
  await p.waitForTimeout(600)
  await p.screenshot({ path: join(OUT, `${name}.png`) })
}

test('README screenshots', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  mkdirSync(OUT, { recursive: true })
  const mock = await startVideoMock(SCRIPT)
  const state = join(OUT, '..', '.readme-state.json')
  await seed(browser, state, { mockUrl: mock.url, chats: CHATS, tweak: ENGLISH })
  void idle

  // 1 — A chat that made a page, with the live preview beside it.
  {
    const p = await open(browser, state)
    await send(p, 'Create a landing page for NorthWind Lab, a small studio for ads and short films, in index.html.')
    await replies(p).last().getByRole('button', { name: T('Abrir preview') }).first().click()
    await p.locator('.preview iframe').first().waitFor()
    await p.waitForTimeout(1500)
    await shot(p, 'chat-and-preview')
    await p.context().close()
  }

  // 2 — Three models side by side.
  {
    const p = await open(browser, state)
    await send(p, 'Give me one tagline for NorthWind Lab, with a line on why it works.')
    await replies(p).last().hover()
    await replies(p).last().getByRole('button', { name: /Compar/ }).click()
    const dialog = p.locator('.dialog.narrow')
    await dialog.getByRole('checkbox', { name: /claude-sonnet-5-5/ }).first().click()
    await dialog.getByRole('checkbox', { name: /claude-haiku-5-5/ }).first().click()
    await dialog.getByRole('button').filter({ hasText: /Generate|Gerar/ }).last().click()
    await p.waitForTimeout(5000)
    await shot(p, 'compare')
    await p.context().close()
  }

  // 3 — A motion composition in the preview, with its timeline.
  {
    const p = await open(browser, state)
    await send(p, 'A 6-second vertical opening for NWind Lab, with the compass logo and a warm glow.')
    await replies(p).last().getByRole('button', { name: T('Abrir preview') }).first().click()
    const panel = p.locator('.preview')
    await expect(panel.getByTestId('motion-time')).toBeVisible({ timeout: 20_000 })
    await panel.getByRole('slider').first().fill('3')
    await p.waitForTimeout(1500)
    await shot(p, 'motion')
    await p.context().close()
  }

  // 4 — The production board, and 5 — Mission Control.
  {
    writeBoard()
    const p = await open(browser, state)
    await p.getByRole('button', { name: T('Quadro de produção') }).first().click()
    await p.getByRole('heading', { name: T('Quadro de produção') }).waitFor()
    await shot(p, 'production-board')
    await p.getByRole('button', { name: T('Painel do dia') }).first().click()
    await p.waitForTimeout(1500)
    await shot(p, 'mission-control')
    await p.context().close()
  }

  await mock.close()
})
