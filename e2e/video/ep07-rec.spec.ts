// Episode 7 of the video tutorial: image, music and voice. Run by hand:
//   SERIE_EP=7 npx playwright test e2e/video/ep07-rec.spec.ts --project video --workers 1
// The image and the video on screen were really made by Runware (runware_demo.py on
// the PC); here Runware's answers are played back from those files.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import {
  badge, card, composer, EN, Episode, frameAt, hideFrame, home, LIVED_IN, openSettings, point, replies, scene, seed, SERIE, typeIn,
} from './lib'

const ep = new Episode(7)

const DEMO = join(SERIE, 'assets', 'demo')
// What Runware charged for the real files (absent outside the recording machine).
const COSTS = existsSync(join(DEMO, 'custos.json')) ? JSON.parse(readFileSync(join(DEMO, 'custos.json'), 'utf8')) : {}
const IMAGE = join(DEMO, 'cafe.jpg')

const STORY =
  'Um **storyboard** é a sequência de desenhos que mostra, quadro a quadro, como um vídeo vai ficar antes de ser filmado. ' +
  'Cada quadro indica o enquadramento, a ação e, muitas vezes, o diálogo ou o som da cena.'

const SCRIPT: Scripted[] = [
  { when: /roteiro de 30 segundos/, text: 'Claro. Cena 1: a xícara na janela, ao amanhecer. Cena 2: a primeira mão que a pega. Cena 3: o logo do Café Aurora.' },
]

// Runware, played back: the image at once; the video after a check or two.
async function fakeRunware(page: Page) {
  let checks = 0
  const image = readFileSync(IMAGE).toString('base64')
  const video = readFileSync(join(DEMO, 'cafe.mp4')).toString('base64')
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
  await page.route('https://vm.runware.ai/**', (route) =>
    route.fulfill({ body: readFileSync(join(DEMO, 'cafe.mp4')), contentType: 'video/mp4', headers: cors }),
  )
  await page.route('https://api.runware.ai/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const [task] = JSON.parse(route.request().postData() ?? '[]')
    const id = task.taskUUID
    const data =
      task.taskType === 'imageInference'
        ? [{ taskType: task.taskType, taskUUID: id, imageBase64Data: image, cost: COSTS.imagem, status: 'success' }]
        : task.taskType === 'videoInference'
          ? [{ taskType: task.taskType, taskUUID: id, status: 'success', videoURL: 'https://vm.runware.ai/video/cafe.mp4', cost: COSTS.video }]
          : ++checks < 1
            ? [{ taskType: 'getResponse', taskUUID: id, status: 'processing', progress: 60 }]
            : [{ taskType: 'videoInference', taskUUID: id, status: 'success', videoBase64Data: video, cost: COSTS.video }]
    await new Promise((r) => setTimeout(r, task.taskType === 'imageInference' ? 1800 : 300))
    await route.fulfill({ json: { data }, headers: cors })
  })
}

test('records the screen of episode 7', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const dir = join(ep.dir, 'screen')
  const plain = join(dir, 'plain.json')
  const media = join(dir, 'media.json')
  const story = join(dir, 'story.json')
  await seed(browser, plain, { mockUrl: mock.url, chats: LIVED_IN })
  const clean = join(dir, 'clean.json')
  await seed(browser, clean, { chats: LIVED_IN })
  const runware =
    "settings.mediaKeys = { ...(settings.mediaKeys || {}), runware: 'rw-demo' };" +
    "settings.media.image = { source: 'runware', model: '', options: '' };" +
    "settings.media.video = { source: 'runware', model: 'minimax:h3@0', options: '' };"
  await seed(browser, media, { mockUrl: mock.url, chats: LIVED_IN, tweak: runware })
  await seed(browser, story, {
    mockUrl: mock.url,
    chats: [{ title: 'O que é um storyboard', ask: 'Explique em duas frases o que é um storyboard', answer: STORY, usage: { input: 1300, output: 60, cost: 0.0080 } }, ...LIVED_IN],
  })
  const section = (p: Page, title: string) => p.getByRole('heading', { name: title, exact: true }).locator('..')
  const kindSelect = (p: Page, kind: string) => p.locator(`#media-${kind}`)

  // 2 — Settings → Media: keys, and who makes each kind.
  {
    const [configuracoes, chaves, quem, imagem, video, audio] = ep.at(2, 'configurações', 'chaves', 'quem', 'imagem', 'vídeo', 'áudio')
    await scene(ep, browser, clean, 2, home, [
      [configuracoes, (p) => openSettings(p, 'Mídia')],
      [chaves, (p) => frameAt(p, section(p, 'Chaves').locator('h3'))],
      [quem - 0.3, async (p) => {
        await section(p, 'Quem gera cada tipo').scrollIntoViewIfNeeded()
        await frameAt(p, section(p, 'Quem gera cada tipo').locator('h3'))
      }],
      [imagem, (p) => frameAt(p, kindSelect(p, 'image'))],
      [video, (p) => frameAt(p, kindSelect(p, 'video'))],
      [audio, (p) => frameAt(p, kindSelect(p, 'audio'))],
    ])
  }

  // 3 — Runware for image and video; the providers' own image models; ComfyUI, optional.
  {
    const [runware, imagem, video, voz, openai, placa, escolha, graca] =
      ep.at(3, 'runware', 'imagem', 'vídeo', 'voz', 'openai', 'placa', 'escolha', 'graça')
    await scene(ep, browser, clean, 3, async (p) => {
      await home(p)
      await openSettings(p, 'Mídia')
      await p.getByLabel('Chave de Runware').scrollIntoViewIfNeeded()
    }, [
      [runware, (p) => frameAt(p, p.getByLabel('Chave de Runware'))],
      [imagem - 0.2, async (p) => {
        await kindSelect(p, 'image').scrollIntoViewIfNeeded()
        await kindSelect(p, 'image').selectOption('runware')
        await frameAt(p, kindSelect(p, 'image'))
      }],
      [video, async (p) => {
        await kindSelect(p, 'video').selectOption('runware')
        await frameAt(p, kindSelect(p, 'video').locator('..'))
        // The label is built from the kind's name ("video model" in English).
        await typeIn(p.getByLabel(EN ? 'video model' : 'Modelo de vídeo').first(), 'minimax:h3@0', 50)
      }],
      [voz, (p) => frameAt(p, kindSelect(p, 'audio'))],
      [openai, async (p) => { await hideFrame(p); await card('OpenAI · Gemini · xAI', 'geram imagem com a chave de conversa')(p) }],
      [placa, card('Tem placa de vídeo?', 'o ComfyUI é opcional')],
      [escolha, async (p) => {
        await kindSelect(p, 'image').selectOption('comfyui').catch(() => {})
        await frameAt(p, kindSelect(p, 'image'))
      }],
      [graca, badge('OPCIONAL · GRÁTIS NO SEU COMPUTADOR')],
    ])
  }

  // 4 — An image, then a video made from it (both really made by Runware).
  {
    const [gere, preco, video] = ep.at(4, 'gere', 'preço', 'vídeo')
    await scene(ep, browser, media, 4, async (p) => { await fakeRunware(p); await home(p) }, [
      [gere - 0.6, async (p) => {
        const b = p.getByRole('button', { name: 'Imagem', exact: true })
        await frameAt(p, b)
        await point(p, b)
        await hideFrame(p)
      }],
      [gere + 0.2, (p) => typeIn(p.getByPlaceholder(/Descreva a imagem/), 'Um café na janela, ao amanhecer', 30)],
      [preco - 1.2, (p) => p.getByPlaceholder(/Descreva a imagem/).press('Enter')],
      [preco, (p) => frameAt(p, replies(p).last())],
      [video - 0.4, async (p) => {
        await hideFrame(p)
        await point(p, p.getByRole('button', { name: 'Vídeo', exact: true }))
        await p.locator('.composer input[type=file]').setInputFiles(IMAGE)
        await typeIn(p.getByPlaceholder(/Descreva o vídeo/), 'Transforme esta imagem em vídeo, com a câmera se aproximando devagar', 8)
        await p.getByPlaceholder(/Descreva o vídeo/).press('Enter')
      }],
      [ep.seconds(4) - 0.3, (p) => frameAt(p, replies(p).last().locator('video'))],
    ])
  }

  // 5 — Read aloud; then the reader in Settings: browser voice, Edge, Piper.
  {
    const [passe, ler, navegador, piper] = ep.at(5, 'passe', 'ler', 'navegador', 'piper')
    await scene(ep, browser, story, 5, async (p) => {
      await home(p)
      await p.locator('.chat-item', { hasText: 'O que é um storyboard' }).click()
      await replies(p).first().waitFor()
    }, [
      [passe, (p) => point(p, replies(p).last(), false)],
      [ler, async (p) => {
        const b = replies(p).last().getByRole('button', { name: 'Ler em voz alta' })
        await frameAt(p, b)
        await point(p, b)
      }],
      [navegador - 0.5, async (p) => {
        await hideFrame(p)
        await openSettings(p, 'Mídia')
        await p.locator('#read-aloud').scrollIntoViewIfNeeded()
        await frameAt(p, p.locator('#read-aloud'))
      }],
      [navegador + 1.6, card('No Edge', 'vozes naturais em português, grátis')],
      [piper, async (p) => {
        await p.locator('#read-aloud').selectOption('piper').catch(() => {})
        await frameAt(p, p.locator('.reader'))
      }],
    ])
  }

  // 6 — Dictation: the microphone, and the words in the box.
  {
    const [microfone, fale, novo, whisper] = ep.at(6, 'microfone', 'fale', 'novo', 'whisper')
    const mic = (p: Page) => p.getByRole('button', { name: 'Ditar', exact: true })
    await scene(ep, browser, plain, 6, home, [
      // There is no microphone here: the button is shown, and the words are typed in as dictation would.
      [microfone - 0.3, async (p) => { await frameAt(p, mic(p)); await point(p, mic(p), false) }],
      [fale, badge('🎙  gravando…')],
      [novo, async (p) => {
        await p.evaluate(() => document.getElementById('__badge')?.remove())
        await hideFrame(p)
        await typeIn(composer(p), 'Crie um roteiro de 30 segundos para o Café Aurora', 30)
      }],
      [whisper, card('Whisper local', 'o áudio não sai do computador')],
    ])
  }

  // 7 — The voice conversation: the headset button opens the microphone.
  {
    const [fone, fala, pausa] = ep.at(7, 'fone', 'fala', 'pausa')
    const headset = (p: Page) => p.getByRole('button', { name: 'Conversa por voz', exact: true })
    await scene(ep, browser, plain, 7, home, [
      [fone - 0.3, async (p) => { await frameAt(p, headset(p)); await point(p, headset(p)) }],
      [fala, (p) => frameAt(p, p.locator('.composer'))],
      [pausa, card('Numa pausa…', 'a mensagem vai sozinha')],
    ])
  }

  await mock.close()
})
