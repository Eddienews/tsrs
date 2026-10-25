// Episode 6 of the video tutorial: motion video, all the way to the MP4. Run by hand:
//   SERIE_EP=6 npx playwright test e2e/video/ep06-rec.spec.ts --project video --workers 1
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { opening } from './motion-nwind'
import {
  badge, card, composer, Episode, frameAt, hideFrame, home, LIVED_IN, openSettings, point, replies, scene, seed, SERIE, typeIn,
} from './lib'

const ep = new Episode(6)

const TRACK = join(SERIE, 'assets', 'trilha.mp3')
const ASK = 'Uma abertura de 6 segundos, na vertical, com o título NWind Lab, fundo escuro e o logo entrando com um brilho'
const ADJUST = 'Faça o título entrar um segundo mais cedo, na cor dourada'

const SCRIPT: Scripted[] = [
  {
    when: /Uma abertura de 6 segundos/,
    text: 'Sua abertura, 1080×1920, 6 s a 30 fps, com fade no final:\n\n```motion\n' + opening() + '\n```\n\nAbra no preview para ver a linha do tempo.',
    title: 'Abertura NWind Lab',
    wps: 90,
    usage: { input: 2600, output: 1100 },
  },
  {
    when: /um segundo mais cedo/,
    text: 'Pronto: o título entra em 0,8 s, em dourado.\n\n```motion\n' + opening({ gold: true, early: true }) + '\n```',
    wps: 90,
    usage: { input: 3900, output: 1100 },
  },
]

test('records the screen of episode 6', async ({ browser }) => {
  test.setTimeout(30 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const state = join(ep.dir, 'screen', 'live.json')
  const clean = join(ep.dir, 'screen', 'clean.json')
  await seed(browser, state, { mockUrl: mock.url, chats: LIVED_IN })
  await seed(browser, clean, { chats: LIVED_IN, demoKey: true })
  const panel = (p: Page) => p.locator('.preview')
  const fileInput = (p: Page) => p.locator('.composer input[type=file]')
  // The chat with the track attached and the composition in the reply, off camera.
  const withMotion = async (p: Page) => {
    await home(p)
    await fileInput(p).setInputFiles(TRACK)
    await composer(p).fill(ASK)
    await composer(p).press('Enter')
    await expect(p.getByRole('button', { name: 'Enviar' })).toBeVisible({ timeout: 30_000 })
    await replies(p).last().getByRole('button', { name: 'Abrir preview' }).first().click()
    await expect(panel(p).getByTestId('motion-time')).toHaveText(/0\.00 \/ 6\.00 s/, { timeout: 20_000 })
    await p.mouse.move(1000, 600)
  }
  const render = async (p: Page) => {
    await panel(p).getByRole('button', { name: 'Gerar MP4' }).click()
    await expect(panel(p).getByRole('link', { name: /^Baixar motion-1(-\d+)?\.mp4$/ })).toBeVisible({ timeout: 240_000 })
  }

  // 3 — Attach the soundtrack: a chip in the message box.
  {
    const [anexe, midia] = ep.at(3, 'anexe', 'mídia')
    await scene(ep, browser, state, 3, home, [
      [anexe - 0.2, (p) => frameAt(p, p.getByRole('button', { name: 'Anexar' }))],
      [anexe + 0.6, async (p) => { await fileInput(p).setInputFiles(TRACK); await frameAt(p, p.locator('.composer')) }],
      [midia - 0.6, card('trilha.mp3 → midia/', 'na pasta do projeto')],
    ])
  }

  // 4 — Ask for the opening; the composition streams in.
  {
    const [abertura] = ep.at(4, 'abertura')
    await scene(ep, browser, state, 4, async (p) => {
      await home(p)
      await fileInput(p).setInputFiles(TRACK)
    }, [
      [abertura - 0.6, (p) => typeIn(composer(p), ASK, 45)],
      [ep.seconds(4) - 1.4, (p) => composer(p).press('Enter')],
    ])
  }

  // 5 — The preview with its timeline: play, pause, scrub.
  {
    const [preview, play, pause, arraste] = ep.at(5, 'preview', 'play', 'pause', 'arraste')
    const slider = (p: Page) => panel(p).getByRole('slider', { name: 'Tempo' })
    await scene(ep, browser, state, 5, withMotion, [
      [preview, (p) => frameAt(p, [slider(p), panel(p).getByTestId('motion-time')])],
      [play, async (p) => { const b = panel(p).getByRole('button', { name: 'Reproduzir' }); await frameAt(p, b); await point(p, b) }],
      [pause + 0.3, async (p) => { const b = panel(p).getByRole('button', { name: 'Pausar' }); await frameAt(p, b); await point(p, b) }],
      [arraste, async (p) => {
        const box = (await slider(p).boundingBox())!
        await frameAt(p, slider(p))
        await p.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 5 })
        await p.mouse.down()
        await p.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2, { steps: 30 })
        await p.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2, { steps: 20 })
        await p.mouse.up()
      }],
    ])
  }

  // 6 — Choose the track, Gerar MP4: frame by frame, saved in the project. Sped up 10×.
  {
    const S = 10
    const [escolha, gerar, quadro, salvo] = ep.at(6, 'escolha', 'gerar', 'quadro', 'salvo')
    const track = (p: Page) => panel(p).getByRole('combobox', { name: 'Trilha' })
    // Paused at 3 s, where the title shows.
    const at3 = async (p: Page) => { await withMotion(p); await panel(p).getByRole('slider', { name: 'Tempo' }).fill('3') }
    await scene(ep, browser, state, 6, at3, [
      [0.1, badge('ACELERADO 10×')],
      [escolha * S, async (p) => { await frameAt(p, track(p)); await track(p).selectOption({ label: 'trilha.mp3' }).catch(() => {}) }],
      [gerar * S, async (p) => {
        const b = panel(p).getByRole('button', { name: 'Gerar MP4' })
        await frameAt(p, b)
        await point(p, b)
      }],
      [quadro * S, (p) => frameAt(p, panel(p).getByText(/Quadro \d+ de/))],
      [salvo * S, (p) => frameAt(p, panel(p).getByText(/^Salvo em /))],
    ], undefined, S)
  }

  // 7 — An adjustment, rendered again: a new MP4 beside the first. Sped up 16×.
  {
    const S = 16
    const [pecas, cada] = ep.at(7, 'peça', 'cada')
    await scene(ep, browser, state, 7, async (p) => {
      await withMotion(p)
      await panel(p).getByRole('slider', { name: 'Tempo' }).fill('3')
      await render(p)
    }, [
      [0.1, badge('ACELERADO 16×')],
      [pecas * S, async (p) => {
        await typeIn(composer(p), ADJUST, 40)
        await composer(p).press('Enter')
        await expect(p.getByRole('button', { name: 'Enviar' })).toBeVisible({ timeout: 30_000 })
        await replies(p).last().getByRole('button', { name: 'Abrir preview' }).first().click()
        await p.waitForTimeout(1200)
        await panel(p).getByRole('slider', { name: 'Tempo' }).fill('3')
        const b = panel(p).getByRole('button', { name: 'Gerar MP4' })
        await frameAt(p, b)
        await point(p, b)
        await hideFrame(p)
      }],
      [cada * S, (p) => frameAt(p, panel(p).getByText(/^Salvo em /))],
    ], undefined, S)
  }

  // 8 — Short video: the stock-video keys in Settings → Media, then the request.
  {
    const [curto, pexels, voz, peca] = ep.at(8, 'curto', 'pexels', 'voz', 'peça')
    await scene(ep, browser, clean, 8, home, [
      [curto - 0.5, card('Vídeo curto', 'Reels · TikTok · Shorts, 9:16')],
      [pexels - 1.2, async (p) => {
        await openSettings(p, 'Mídia')
        const field = p.getByLabel('Chave de Pexels')
        await field.scrollIntoViewIfNeeded()
        await frameAt(p, field)
      }],
      [voz, (p) => frameAt(p, p.getByLabel('Chave de Pixabay'))],
      [peca - 0.4, async (p) => {
        await hideFrame(p)
        await p.getByTitle('Fechar').click()
        await typeIn(composer(p), 'Faça um vídeo curto de 30 segundos sobre o primeiro café da manhã', 35)
      }],
    ])
  }

  await mock.close()
})
