// Episode 12 of the video tutorial: the studio (board, agent table, Mission Control). Run by hand:
//   SERIE_EP=12 npx playwright test e2e/video/ep12-rec.spec.ts --project video --workers 1
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { card, Episode, frameAt, hideFrame, home, LIVED_IN, openSettings, point, scene, seed, typeIn } from './lib'

const ep = new Episode(12)

// The board and the takes live in the projects folder of the TSRS that serves the recording.
const PROJECTS = process.env.TSRS_PROJECTS ?? '/home/claude/tsrs/projetos'
const TAKES = join(PROJECTS, 'seu-silva-13')

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function resetBoard() {
  const now = Date.now()
  const c = (id: string, title: string, column: string, extra: object = {}) => ({ id, title, column, kind: 'episodio', createdAt: now, updatedAt: now, ...extra })
  const board = {
    version: 1,
    columns: [
      { id: 'roteiro', name: 'Roteiro' }, { id: 'takes', name: 'Takes' }, { id: 'montagem', name: 'Montagem' },
      { id: 'render', name: 'Render' }, { id: 'revisao', name: 'Revisão' }, { id: 'publicado', name: 'Publicado' },
    ],
    cards: [
      c('milo-4', 'Milo #4', 'roteiro', { series: 'Milo', language: 'PT', due: day(3) }),
      c('silva-13', 'Seu Silva #13', 'takes', { series: 'Seu Silva', language: 'PT', due: day(2), projectPath: TAKES }),
      c('ad-relogio', 'AD relógio', 'montagem', { kind: 'ad', series: 'Relojoaria Tempo', due: day(1) }),
      c('milo-3', 'Milo #3', 'revisao', { series: 'Milo', language: 'EN' }),
      c('silva-12', 'Seu Silva #12', 'publicado', { series: 'Seu Silva', language: 'PT' }),
    ],
    removed: [],
  }
  mkdirSync(join(PROJECTS, '_producao'), { recursive: true })
  writeFileSync(join(PROJECTS, '_producao', 'quadro.json'), JSON.stringify(board, null, 2))
  mkdirSync(join(TAKES, 'takes'), { recursive: true })
  const statuses = ['approved', 'approved', 'approved', 'approved', 'redo', 'pending']
  statuses.forEach((status, i) =>
    writeFileSync(join(TAKES, 'takes', `take-${i + 1}.json`), JSON.stringify({ line: i + 1, shot: `plano ${i + 1}`, status }, null, 2)),
  )
}

const PEOPLE = [
  { id: 'p-pesquisa', name: 'Pesquisador', system: 'Você traz referências reais e curtas.' },
  { id: 'p-roteiro', name: 'Roteirista do Seu Silva', system: 'Você escreve o Seu Silva: humor seco, cenas curtas.' },
  { id: 'p-direcao', name: 'Diretor de criação', system: 'Você decide e escreve a versão final.' },
]
const TABLE = {
  id: 'mesa-roteiro',
  name: 'Sala de roteiro',
  members: [
    { personaId: 'p-pesquisa', role: 'traz referências' },
    { personaId: 'p-roteiro', role: 'escreve' },
    { personaId: 'starter-reviewer', role: 'revisa' },
  ],
  coordinatorId: 'p-direcao',
  rounds: 1,
}
const TASK = 'Escreva a sinopse do Seu Silva #14: ele descobre o aplicativo da padaria.'
const STUDIO =
  `settings.personas = [...${JSON.stringify(PEOPLE)}, ...settings.personas];` +
  `settings.tables = [${JSON.stringify(TABLE)}];` +
  `settings.focus = [{ id: 'f1', text: 'Gravar o Milo #4', done: true, day: '${day(0)}' }, { id: 'f2', text: 'Revisar o AD do relógio', done: false, day: '${day(0)}' }, { id: 'f3', text: 'Fechar a sinopse do Seu Silva #14', done: false, day: '${day(0)}' }];`

const SCRIPT: Scripted[] = [
  { when: /<task>/, system: /traz referências/, text: 'Referências: o caixa de autoatendimento que trava, o "pedido feito" que nunca chega, e o vizinho que só paga em dinheiro.', wps: 40 },
  { when: /<task>/, system: /Your role here: escreve/, text: 'Seu Silva baixa o aplicativo da padaria para pedir "o de sempre". O cadastro pede CPF, e-mail e uma foto. Ele manda a foto do pão.', wps: 40 },
  { when: /<task>/, system: /Your role here: revisa/, text: 'Funciona. Sugiro cortar o e-mail do cadastro e terminar com o atendente imprimindo o pedido em papel.', wps: 40 },
  { when: /<table>\n/, text: '**Seu Silva #14 — O pão por aplicativo**\n\nSeu Silva baixa o aplicativo da padaria para pedir "o de sempre". O cadastro pede CPF e uma foto; ele manda a foto do pão. O pedido nunca chega. No balcão, o atendente imprime o pedido em papel e entrega o pão na mão. Seu Silva: "Tecnologia."', wps: 40 },
]

test('records the screen of episode 12', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const dir = join(ep.dir, 'screen')
  const state = join(dir, 'studio.json')
  await seed(browser, state, { mockUrl: mock.url, chats: LIVED_IN, tweak: STUDIO })
  const nav = (p: Page, name: string) => p.getByRole('navigation', { name: 'Estúdio' }).getByRole('button', { name })
  const boardHome = async (p: Page) => { resetBoard(); await home(p); await nav(p, 'Quadro de produção').click(); await p.getByRole('heading', { name: 'Quadro de produção' }).waitFor() }
  const silva = (p: Page) => p.locator('[data-card="Seu Silva #13"]')

  // 2 — The studio: three pages under New chat.
  {
    const [tres, quadro, mesa, painel] = ep.at(2, 'três', 'quadro', 'mesa', 'painel')
    await scene(ep, browser, state, 2, async (p) => { resetBoard(); await home(p) }, [
      [tres, (p) => frameAt(p, p.getByRole('navigation', { name: 'Estúdio' }))],
      [quadro, (p) => frameAt(p, nav(p, 'Quadro de produção'))],
      [mesa, (p) => frameAt(p, nav(p, 'Mesa de agentes'))],
      [painel, (p) => frameAt(p, nav(p, 'Painel do dia'))],
    ])
  }

  // 3 — A new card: title, series, language, due date, the chat.
  {
    const [novo, titulo, serie, idioma, prazo, conversa] = ep.at(3, 'novo', 'título', 'série', 'idioma', 'prazo', 'conversa')
    const dialog = (p: Page) => p.getByRole('dialog')
    await scene(ep, browser, state, 3, boardHome, [
      [novo - 0.3, async (p) => { const b = p.getByRole('button', { name: 'Novo card' }); await frameAt(p, b); await point(p, b) }],
      [titulo, async (p) => { await frameAt(p, dialog(p).getByLabel('Título')); await typeIn(dialog(p).getByLabel('Título'), 'Seu Silva #14', 50) }],
      [serie, async (p) => { await frameAt(p, dialog(p).getByLabel('Série ou cliente')); await typeIn(dialog(p).getByLabel('Série ou cliente'), 'Seu Silva', 50) }],
      [idioma, async (p) => { await frameAt(p, dialog(p).getByLabel('Idioma ou versão')); await typeIn(dialog(p).getByLabel('Idioma ou versão'), 'PT', 80) }],
      [prazo, async (p) => { const f = dialog(p).getByLabel(/Prazo/); await frameAt(p, f); await f.fill(day(5)) }],
      [conversa, async (p) => {
        const f = dialog(p).getByLabel('Conversa do card')
        await frameAt(p, f)
        await f.selectOption({ label: 'Roteiro do Seu Silva #13' }).catch(() => {})
      }],
      [ep.length(3) - 0.9, async (p) => { await hideFrame(p); await dialog(p).getByRole('button', { name: 'Salvar' }).click() }],
    ])
  }

  // 4 — Moving a card: dragging, the arrows; the columns can be renamed.
  {
    const [arrastando, setas, colunas] = ep.at(4, 'arrastando', 'setas', 'colunas')
    const milo = (p: Page) => p.locator('[data-card="Milo #4"]')
    await scene(ep, browser, state, 4, boardHome, [
      [arrastando - 0.6, async (p) => {
        const from = (await milo(p).boundingBox())!
        const to = (await p.getByRole('region', { name: 'Takes' }).boundingBox())!
        await p.mouse.move(from.x + 30, from.y + 14, { steps: 6 })
        await p.mouse.down()
        await p.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 25 })
        await p.mouse.up()
      }],
      [setas, async (p) => {
        const b = milo(p).getByRole('button', { name: 'Mover para a próxima coluna' })
        await milo(p).hover()
        await frameAt(p, b)
        await point(p, b)
      }],
      [colunas, (p) => frameAt(p, p.getByRole('region', { name: 'Roteiro' }).locator('h2, h3, header').first())],
    ])
  }

  // 5 — Takes: the card counts them from the project's takes/ folder.
  {
    const [takes, aprovados] = ep.at(5, 'takes', 'aprovados')
    await scene(ep, browser, state, 5, boardHome, [
      [takes, (p) => frameAt(p, silva(p))],
      [aprovados, async (p) => { await frameAt(p, silva(p).getByText(/takes/)); await card('takes/take-5.json', '{ "shot": "plano 5", "status": "redo" }')(p) }],
    ])
  }

  // 6 — The agent table: agents from the library, each with a role, and a coordinator.
  {
    const [mesa, papel, referencias, escreve, revisa, coordenador] = ep.at(6, 'mesa', 'papel', 'referências', 'escreve', 'revisa', 'coordenador')
    await scene(ep, browser, state, 6, async (p) => {
      await home(p)
      await p.evaluate(async () => {
        const storage: any = await import('/src/storage.ts')
        const s = storage.loadSettings()
        s.tables = []
        localStorage.setItem(storage.SETTINGS_KEY, JSON.stringify(s))
      })
      await home(p)
    }, [
      [mesa, (p) => nav(p, 'Mesa de agentes').click()],
      [papel - 0.8, async (p) => {
        await point(p, p.getByRole('button', { name: 'Criar mesa' }))
        await p.getByLabel('Nome da mesa').fill('Sala de roteiro')
      }],
      [referencias - 0.3, async (p) => {
        await p.getByLabel('Adicionar agente', { exact: true }).selectOption({ label: 'Pesquisador' })
        await typeIn(p.getByLabel('Papel de Pesquisador'), 'traz referências', 40)
        await frameAt(p, p.getByLabel('Papel de Pesquisador'))
      }],
      [escreve - 0.3, async (p) => {
        await p.getByLabel('Adicionar agente', { exact: true }).selectOption({ label: 'Roteirista do Seu Silva' })
        await typeIn(p.getByLabel('Papel de Roteirista do Seu Silva'), 'escreve', 50)
        await frameAt(p, p.getByLabel('Papel de Roteirista do Seu Silva'))
      }],
      [revisa - 0.3, async (p) => {
        await p.getByLabel('Adicionar agente', { exact: true }).selectOption({ label: 'Revisor de texto' })
        await typeIn(p.getByLabel('Papel de Revisor de texto'), 'revisa', 50)
        await frameAt(p, p.getByLabel('Papel de Revisor de texto'))
      }],
      [coordenador, async (p) => {
        await p.getByLabel('Coordenador').selectOption({ label: 'Diretor de criação' })
        await frameAt(p, p.getByLabel('Coordenador'))
      }],
    ])
  }

  // 7 — The task, Start: turns in order, then the coordinator's result.
  {
    const [comecar, coordenador] = ep.at(7, 'começar', 'coordenador')
    const openTable = async (p: Page) => { await home(p); await nav(p, 'Mesa de agentes').click(); await p.getByLabel('Tarefa').waitFor() }
    await scene(ep, browser, state, 7, openTable, [
      [0.1, (p) => typeIn(p.getByLabel('Tarefa'), TASK, 18)],
      [comecar - 0.2, async (p) => { const b = p.getByRole('button', { name: 'Começar' }); await frameAt(p, b); await point(p, b); await hideFrame(p) }],
      [coordenador + 0.3, (p) => frameAt(p, p.locator('.table-turn').last())],
    ])
  }

  // 8 — Save as chat: the chat goes on from the result.
  {
    const [salvar, registro] = ep.at(8, 'salvar', 'registro')
    await scene(ep, browser, state, 8, async (p) => {
      await home(p)
      await nav(p, 'Mesa de agentes').click()
      await p.getByLabel('Tarefa').fill(TASK)
      await p.getByRole('button', { name: 'Começar' }).click()
      await expect(p.getByRole('button', { name: 'Salvar como conversa' })).toBeVisible({ timeout: 60_000 })
    }, [
      [salvar - 0.2, async (p) => { const b = p.getByRole('button', { name: 'Salvar como conversa' }); await frameAt(p, b); await point(p, b) }],
      [salvar + 1.6, (p) => frameAt(p, p.locator('.chat-item', { hasText: 'Sala de roteiro' }).first())],
      [registro, card('Registro completo', 'na pasta da mesa, em projetos/')],
    ])
  }

  // 9 — Mission Control: today's focus, usage, schedule, production, agents.
  {
    const [foco, uso, agenda, producao, agentes] = ep.at(9, 'foco', 'uso', 'agenda', 'produção', 'agentes')
    const region = (p: Page, name: string) => p.getByRole('region', { name })
    await scene(ep, browser, state, 9, async (p) => { resetBoard(); await home(p); await nav(p, 'Painel do dia').click() }, [
      [foco, (p) => frameAt(p, region(p, 'Foco de hoje'))],
      [foco + 0.8, (p) => region(p, 'Foco de hoje').getByRole('checkbox', { name: 'Revisar o AD do relógio' }).click()],
      [uso, (p) => frameAt(p, p.getByText('Respostas hoje').locator('../..'))],
      [agenda, (p) => frameAt(p, region(p, 'Agenda de hoje'))],
      [producao, (p) => frameAt(p, region(p, 'Produção'))],
      [agentes, (p) => frameAt(p, region(p, 'Agentes de linha de comando'))],
    ])
  }

  // 10 — Appearance: always open TSRS here.
  {
    const [aparencia, abrir] = ep.at(10, 'aparência', 'abrir')
    await scene(ep, browser, state, 10, home, [
      [aparencia - 0.3, (p) => openSettings(p, 'Aparência')],
      [abrir - 0.4, async (p) => {
        const sw = p.getByLabel('Abrir o TSRS no Painel do dia')
        await sw.scrollIntoViewIfNeeded()
        await frameAt(p, sw.locator('..'))
        await sw.click()
      }],
    ])
  }

  await mock.close()
})
