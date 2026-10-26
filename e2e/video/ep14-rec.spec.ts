// Episode 14 of the video tutorial: a whole ad, from the board to the MP4. Run by hand,
// with the TSRS server started with e2e/video/bin first on PATH:
//   SERIE_EP=14 npx playwright test e2e/video/ep14-rec.spec.ts --project video --workers 1
// The image, the video shot and the soundtrack were really made by Runware
// (runware_demo.py, runware_musica.py), and the ad by TSRS's renderer.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { badge, card, composer, EN, Episode, frameAt, hideFrame, home, LIVED_IN, point, replies, scene, seed, SERIE, tr, typeIn } from './lib'

const ep = new Episode(14)

const PROJECTS = process.env.TSRS_PROJECTS ?? '/home/claude/tsrs/projetos'
const DEMO = join(SERIE, 'assets', 'demo')
const AD = join(SERIE, 'ad2')
// The composition shown in the preview: the English ad in the English take (saved under the same name).
const AD_PAGE = join(AD, EN ? 'cafe-aurora-en.html' : 'cafe-aurora.html')
// The soundtrack's name in the project folder.
const TRILHA = EN ? 'aurora-soundtrack.mp3' : 'trilha-aurora.mp3'
// The project button's title once the folder exists.
const READY = EN ? /^Project folder: (?!not made yet)/ : /^Pasta do projeto: (?!ainda não criada)/
// What Runware charged for the real files (absent outside the recording machine).
const COSTS = existsSync(join(DEMO, 'custos.json')) ? JSON.parse(readFileSync(join(DEMO, 'custos.json'), 'utf8')) : {}

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const friday = () => {
  const d = new Date()
  return day((5 - d.getDay() + 7) % 7 || 7)
}

function board(column: string) {
  const now = Date.now()
  // tr(): the English take writes the cards in English.
  const c = (id: string, title: string, col: string, extra: { series?: string; language?: string; kind?: string; due?: string } = {}) => ({
    id, title: tr(title), column: col, kind: 'episodio', createdAt: now, updatedAt: now, ...extra,
    ...(extra.series ? { series: tr(extra.series) } : {}), ...(extra.language ? { language: tr(extra.language) } : {}),
  })
  mkdirSync(join(PROJECTS, '_producao'), { recursive: true })
  writeFileSync(join(PROJECTS, '_producao', 'quadro.json'), JSON.stringify({
    version: 1,
    columns: [
      { id: 'roteiro', name: 'Roteiro' }, { id: 'takes', name: 'Takes' }, { id: 'montagem', name: 'Montagem' },
      { id: 'render', name: 'Render' }, { id: 'revisao', name: 'Revisão' }, { id: 'publicado', name: 'Publicado' },
    ],
    cards: [
      c('milo-4', 'Milo #4', 'roteiro', { series: 'Milo', language: 'PT' }),
      c('silva-13', 'Seu Silva #13', 'takes', { series: 'Seu Silva', language: 'PT' }),
      ...(column ? [c('aurora', 'AD Café Aurora', column, { kind: 'ad', series: 'Café Aurora', due: friday() })] : []),
      c('silva-12', 'Seu Silva #12', 'publicado', { series: 'Seu Silva', language: 'PT' }),
    ],
    removed: [],
  }, null, 2))
}

const PEOPLE = [
  { id: 'p-pesquisa', name: 'Pesquisador', system: 'Você traz referências reais e curtas.' },
  { id: 'p-roteiro', name: 'Roteirista', system: 'Você escreve roteiros curtos.' },
  { id: 'p-direcao', name: 'Diretor de criação', system: 'Você decide e escreve a versão final.' },
]
const TABLE = {
  id: 'mesa-aurora', name: 'Criação Aurora', rounds: 1, coordinatorId: 'p-direcao',
  members: [{ personaId: 'p-pesquisa', role: 'pesquisa' }, { personaId: 'p-roteiro', role: 'roteiro' }, { personaId: 'starter-reviewer', role: 'revisão' }],
}
const TASK = 'Crie três conceitos para um anúncio de 15 s do Café Aurora e escreva o melhor em cenas.'
const SETUP =
  `settings.personas = [...${JSON.stringify(PEOPLE)}, ...settings.personas];` +
  `settings.tables = [${JSON.stringify(TABLE)}];` +
  "settings.mediaKeys = { ...(settings.mediaKeys || {}), runware: 'rw-demo', 'search:brave': 'bsa-demo' };" +
  "settings.ownSearch = { provider: 'brave' }; settings.webSearch = true;" +
  "settings.media.image = { source: 'runware', model: '', options: '' };"

const RESULTS = [
  { title: 'Por que anúncios de café apostam na luz da manhã', url: 'https://www.adsoftheworld.com/cafe-manha', snippet: 'Vapor, janela e o primeiro gole: os três clichês que funcionam.' },
  { title: 'Reels de 15 segundos: o texto precisa caber em 3', url: 'https://www.socialmediatoday.com/reels-15s', snippet: 'Nos primeiros três segundos se decide se a pessoa fica.' },
]

const SCRIPT: Scripted[] = [
  { when: /<task>/, system: /Your role here: pesquisa/, text: 'Referências: a luz de janela pela manhã, o vapor da xícara e o "primeiro gole" como ritual.', wps: 40 },
  { when: /<task>/, system: /Your role here: roteiro/, text: 'Conceitos: 1) O primeiro gole. 2) A cidade acordando. 3) O balcão de sempre. Fico com o 1: xícara na janela, o vapor, e o fecho com o nome.', wps: 40 },
  { when: /<task>/, system: /Your role here: revisão/, text: 'O 1 é o mais forte. Texto curto, duas linhas, e o endereço só no fecho.', wps: 40 },
  { when: /<table>\n/, text: '**AD Café Aurora — 15 s, vertical**\n\n- **0–6 s:** xícara na janela ao amanhecer, vapor subindo. Texto: "O primeiro gole".\n- **6–11 s:** a mesma luz, mais perto. Texto: "do seu dia."\n- **11–15 s:** fecho creme, o nome Café Aurora e "Abre às 6h".', wps: 40 },
  {
    when: /animação na vertical/,
    text: 'A animação, 1080×1920, 15 s, com o plano da Runware quadro a quadro, a imagem e o fecho:\n\n```motion cafe-aurora.html\n' +
      (existsSync(AD_PAGE) ? readFileSync(AD_PAGE, 'utf8') : '') + '\n```',
    wps: 400,
  },
  {
    when: /Confira as referências/,
    tools: [{ name: 'search_web', input: { query: 'anúncio café luz da manhã primeiro gole reels 15 segundos' } }],
    text: 'As duas referências se confirmam: a luz da manhã e o vapor são o padrão do gênero [1], e o texto precisa aparecer nos três primeiros segundos [2].',
    wps: 40,
  },
]

async function fakeServices(page: Page) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
  const image = readFileSync(join(DEMO, 'cafe.jpg')).toString('base64')
  await page.route('https://api.runware.ai/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const [task] = JSON.parse(route.request().postData() ?? '[]')
    await new Promise((r) => setTimeout(r, 900))
    await route.fulfill({ json: { data: [{ taskType: task.taskType, taskUUID: task.taskUUID, imageBase64Data: image, cost: COSTS.imagem, status: 'success' }] }, headers: cors })
  })
  await page.route('**/__tsrs/ext/search', (route) =>
    route.fulfill({ json: { results: RESULTS.map((r) => ({ ...r, title: tr(r.title), snippet: tr(r.snippet) })) } }),
  )
}

const projectOf = async (p: Page) => {
  const title = await p.locator('.toolbar .project').getAttribute('title')
  return title!.replace(/^(Pasta do projeto|Project folder): /, '')
}

// The project gets the real files: the shot, the soundtrack, the composition and its frames.
function fillProject(folder: string) {
  mkdirSync(join(folder, 'midia'), { recursive: true })
  cpSync(join(DEMO, 'cafe.mp4'), join(folder, 'midia', 'plano-cafe.mp4'))
  cpSync(join(DEMO, 'trilha_aurora.mp3'), join(folder, 'midia', TRILHA))
}
function fillComposition(folder: string) {
  fillProject(folder)
  cpSync(join(AD, 'midia', 'plano'), join(folder, 'midia', 'plano'), { recursive: true })
  cpSync(join(AD, 'fonts'), join(folder, 'fonts'), { recursive: true })
  cpSync(AD_PAGE, join(folder, 'cafe-aurora.html'))
}

test('records the screen of episode 14', async ({ browser }) => {
  test.setTimeout(30 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const dir = join(ep.dir, 'screen')
  const state = join(dir, 'aurora.json')
  await seed(browser, state, { mockUrl: mock.url, chats: LIVED_IN, tweak: SETUP })
  const nav = (p: Page, name: string) => p.getByRole('navigation', { name: 'Estúdio' }).getByRole('button', { name })
  const folderButton = (p: Page) => p.locator('.toolbar .project')
  // A chat in the project, with the image made: the start of scenes 8 and 9.
  const imageChat = async (p: Page) => {
    await fakeServices(p)
    await home(p)
    await p.getByRole('button', { name: 'Imagem', exact: true }).click()
    await p.getByPlaceholder(/Descreva a imagem/).fill(tr('Uma xícara de café na janela, ao amanhecer, vapor subindo'))
    await p.getByPlaceholder(/Descreva a imagem/).press('Enter')
    await expect(folderButton(p)).toHaveAttribute('title', READY, { timeout: 30_000 })
  }

  // 3 — The card: AD Café Aurora, an ad, due Friday.
  {
    const [card_, tipo, prazo] = ep.at(3, 'card', 'tipo', 'prazo')
    const dialog = (p: Page) => p.getByRole('dialog')
    await scene(ep, browser, state, 3, async (p) => { board(''); await home(p); await nav(p, 'Quadro de produção').click() }, [
      [card_ - 0.4, async (p) => {
        await point(p, p.getByRole('button', { name: 'Novo card' }))
        await typeIn(dialog(p).getByLabel('Título'), 'AD Café Aurora', 30)
      }],
      [tipo, async (p) => {
        const kind = dialog(p).getByLabel('Tipo')
        await frameAt(p, kind)
        await kind.selectOption('ad')
      }],
      [prazo, async (p) => { const f = dialog(p).getByLabel(/Prazo/); await frameAt(p, f); await f.fill(friday()) }],
      [ep.length(3) - 0.8, async (p) => { await hideFrame(p); await dialog(p).getByRole('button', { name: 'Salvar' }).click() }],
    ])
  }

  // 4 — The Aurora folder, with the client's context.
  {
    const [pasta, contexto] = ep.at(4, 'pasta', 'contexto')
    await scene(ep, browser, state, 4, home, [
      [pasta - 0.4, async (p) => {
        await point(p, p.getByRole('button', { name: 'Nova pasta' }))
        await typeIn(p.getByLabel('Nome da pasta:'), 'Aurora', 50)
        await p.keyboard.press('Enter')
      }],
      [contexto - 0.2, async (p) => {
        const row = p.locator('.sidebar [data-folder]', { hasText: 'Aurora' })
        await row.hover()
        await row.getByTitle('Opções da pasta').click()
        await p.getByRole('menuitem', { name: 'Contexto da pasta…' }).click()
        const box = p.getByLabel('Instruções da pasta')
        await frameAt(p, box)
        await typeIn(box, 'Café Aurora, cafeteria de bairro. Público: 25 a 45 anos. Tom acolhedor. Cores: creme, café e laranja.', 18)
        await frameAt(p, p.getByLabel('Arquivos de contexto').locator('..'))
      }],
    ])
  }

  // 5 — The agent table: research, script and review; the coordinator writes the scenes.
  {
    const [mesa, criam, cenas] = ep.at(5, 'mesa', 'criam', 'cenas')
    await scene(ep, browser, state, 5, async (p) => { await home(p); await nav(p, 'Mesa de agentes').click(); await p.getByLabel('Tarefa').waitFor() }, [
      [mesa, async (p) => { await p.getByLabel('Tarefa').fill(tr(TASK)); await frameAt(p, p.getByLabel('Quem está na mesa')) }],
      [criam - 0.6, async (p) => { await hideFrame(p); await point(p, p.getByRole('button', { name: 'Começar' })) }],
      [cenas, (p) => frameAt(p, p.locator('.table-turn').last())],
    ])
  }

  // 6 — A web search checks the references.
  {
    await scene(ep, browser, state, 6, async (p) => { await fakeServices(p); await home(p) }, [
      [0.05, async (p) => {
        await composer(p).fill(tr('Confira as referências da mesa: luz da manhã em anúncios de café e texto nos 3 primeiros segundos'))
        await composer(p).press('Enter')
      }],
      [ep.seconds(6) - 0.2, (p) => frameAt(p, replies(p).last().getByRole('link').first().locator('../..'))],
    ])
  }

  // 7 — The image, the video shot and the soundtrack: all three in midia/.
  {
    const [video, trilha] = ep.at(7, 'vídeo', 'trilha')
    await scene(ep, browser, state, 7, async (p) => { await fakeServices(p); await home(p) }, [
      [0.1, async (p) => {
        await p.getByRole('button', { name: 'Imagem', exact: true }).click()
        await typeIn(p.getByPlaceholder(/Descreva a imagem/), 'Uma xícara de café na janela, ao amanhecer', 15)
        await p.getByPlaceholder(/Descreva a imagem/).press('Enter')
      }],
      [video, async (p) => {
        await expect(folderButton(p)).toHaveAttribute('title', READY, { timeout: 10_000 })
        fillProject(await projectOf(p))
        await card('Runware', `imagem US$ ${COSTS.imagem} · vídeo de 6 s US$ ${COSTS.video}`)(p)
      }],
      [trilha, async (p) => {
        await card('Trilha de 15 s', `Runware ACE-Step · US$ ${COSTS.musica}`)(p)
        await point(p, folderButton(p))
        await p.waitForTimeout(600)
        await frameAt(p, p.getByText(TRILHA).first().locator('../..'))
      }],
    ])
  }

  // 8 — The vertical animation in the preview; Gerar MP4 (sped up); the card goes to Render.
  {
    const S = 12
    const [animacao, gerar, render] = ep.at(8, 'animação', 'gerar', 'render')
    const panel = (p: Page) => p.locator('.preview')
    await scene(ep, browser, state, 8, async (p) => {
      await imageChat(p)
      fillComposition(await projectOf(p))
      await composer(p).fill(tr('Agora a animação na vertical, 15 s, com o plano, a imagem, o texto final e a trilha'))
      await composer(p).press('Enter')
      await expect(p.getByRole('button', { name: 'Enviar' })).toBeVisible({ timeout: 60_000 })
      await replies(p).last().getByRole('button', { name: 'Abrir preview' }).first().click()
      await expect(panel(p).getByTestId('motion-time')).toBeVisible({ timeout: 20_000 })
      await panel(p).getByRole('slider', { name: 'Tempo' }).fill('3')
      await p.mouse.move(700, 500)
    }, [
      [0.1, badge('ACELERADO 12×')],
      [animacao * S, (p) => frameAt(p, panel(p))],
      [gerar * S, async (p) => {
        await panel(p).getByRole('combobox', { name: 'Trilha' }).selectOption({ label: TRILHA }).catch(() => {})
        const b = panel(p).getByRole('button', { name: 'Gerar MP4' })
        await frameAt(p, b)
        await point(p, b)
      }],
      [render * S, card('Card → Render', 'AD Café Aurora')],
    ], undefined, S)
  }

  // 9 — Claude Code, read only, reviews the composition's code.
  {
    const [revisa] = ep.at(9, 'revisa')
    await scene(ep, browser, state, 9, async (p) => {
      await imageChat(p)
      fillComposition(await projectOf(p))
      await p.getByRole('button', { name: 'Escolher modelo' }).click()
      await p.getByRole('option', { name: 'opus', exact: true }).click()
      await p.mouse.move(1000, 600)
    }, [
      [0.1, badge('CLAUDE CODE · SÓ LER')],
      [0.3, async (p) => {
        await typeIn(composer(p), 'Revise o código da composição cafe-aurora.html, sem mudar nada', 15)
        await composer(p).press('Enter')
      }],
      [revisa + 2.5, (p) => frameAt(p, replies(p).last().locator('.tool').first())],
    ])
  }

  // 11 — The card in Published; then Mission Control with the day's cost.
  {
    const [publicado, painel] = ep.at(11, 'publicado', 'painel')
    await scene(ep, browser, state, 11, async (p) => { board('publicado'); await home(p); await nav(p, 'Quadro de produção').click() }, [
      [publicado - 0.3, (p) => frameAt(p, p.locator(`[data-card="${tr('AD Café Aurora')}"]`))],
      [publicado + 1.2, card('Salvo no Obsidian', 'Cofre NorthWind / TSRS / AD Café Aurora.md')],
      [painel - 0.3, async (p) => {
        await hideFrame(p)
        await nav(p, 'Painel do dia').click()
        await p.waitForTimeout(600)
        await frameAt(p, p.getByText(/Custo/).first().locator('..'))
      }],
    ])
  }

  await mock.close()
})
