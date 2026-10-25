// Episode 10 of the video tutorial: extensions, MCP and the schedule. Run by hand:
//   SERIE_EP=10 npx playwright test e2e/video/ep10-rec.spec.ts --project video --workers 1
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startMockMcp } from '../mock-mcp'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { badge, card, composer, Episode, frameAt, hideFrame, home, LIVED_IN, point, replies, scene, seed, SERIE, typeIn } from './lib'

const ep = new Episode(10)

const CHART_CODE = `const rows = csv(files['vendas.csv'])
const total = {}
for (const r of rows) { const m = r.data.slice(0, 7); total[m] = (total[m] || 0) + r.valor }
const meses = Object.keys(total).sort()
chart({ type: 'bar', title: 'Vendas por mês (R$)', labels: meses, series: [{ name: 'Total', values: meses.map((m) => total[m]) }] })
return total`

const SCRIPT: Scripted[] = [
  {
    when: /total por mês/,
    tools: [{ name: 'run_javascript', input: { code: CHART_CODE } }],
    text: 'Somei a planilha por mês: julho R$ 2.100, agosto R$ 2.150, setembro R$ 2.630 e outubro R$ 2.760. As vendas sobem todo mês, puxadas pelo café.',
    wps: 25,
  },
]

const NEWS =
  '**Notícias de IA — resumo das 7h40**\n\n' +
  '1. **Modelos:** um novo modelo de vídeo aberto gera planos de 10 segundos em 1080p.\n' +
  '2. **Ferramentas:** editores de vídeo passam a aceitar trilhas geradas com licença comercial.\n' +
  '3. **Mercado:** pequenas produtoras relatam prazos 40% menores em anúncios curtos.'

test('records the screen of episode 10', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const mcp = await startMockMcp()
  const dir = join(ep.dir, 'screen')
  const clean = join(dir, 'clean.json')
  const live = join(dir, 'live.json')
  const agenda = join(dir, 'agenda.json')
  await seed(browser, clean, { chats: LIVED_IN, demoKey: true })
  await seed(browser, live, { mockUrl: mock.url, chats: LIVED_IN, tweak: 'settings.interpreter = true;' })
  await seed(browser, agenda, {
    mockUrl: mock.url,
    chats: [
      { title: 'Agenda: Notícias de IA', ask: 'Resuma as três notícias de IA mais importantes desde ontem, para quem produz vídeo.', answer: NEWS, usage: { input: 2100, output: 160, cost: 0.0145 }, extra: { scheduleId: 'agenda-noticias' } },
      ...LIVED_IN,
    ],
  })
  const extensions = async (p: Page, tab?: string) => {
    await p.getByRole('button', { name: 'Extensões' }).first().click()
    if (tab) await p.getByRole('tab', { name: tab }).click()
  }
  const tools = (p: Page) => p.locator('.toolbar').getByRole('button', { name: 'Ferramentas' })

  // 2 — Extensions → Examples → install the free utilities plugin.
  {
    const [extensoes, exemplos, instale, cambio] = ep.at(2, 'extensões', 'exemplos', 'instale', 'câmbio')
    const example = (p: Page) => p.locator('[data-example="utilidades-livres"]')
    await scene(ep, browser, clean, 2, home, [
      [extensoes - 0.3, (p) => extensions(p)],
      [exemplos, async (p) => {
        const tab = p.getByRole('tab', { name: 'Exemplos' })
        await frameAt(p, tab)
        await point(p, tab)
        await example(p).scrollIntoViewIfNeeded()
      }],
      [instale, async (p) => {
        await frameAt(p, example(p))
        const b = example(p).getByRole('button', { name: /Instalar utilidades-livres|Reinstalar/ })
        await point(p, b)
      }],
      [cambio, card('Utilidades livres', 'câmbio · feriados · clima · Wikipédia')],
    ])
  }

  // 3 — The slash list of commands; or just ask.
  {
    const [barra, pergunte] = ep.at(3, 'barra', 'pergunte')
    await scene(ep, browser, clean, 3, home, [
      [barra, async (p) => { await composer(p).click(); await p.keyboard.type('/'); await p.waitForTimeout(400); await frameAt(p, p.getByRole('listbox').first()) }],
      [pergunte, async (p) => {
        await hideFrame(p)
        await composer(p).fill('')
        await typeIn(composer(p), 'Qual é o câmbio do dólar hoje?', 40)
      }],
    ])
  }

  // 4 — Skills: write one, or install one; Claude's skills work the same.
  {
    const [pacotes, nova, instale, claude] = ep.at(4, 'pacotes', 'nova', 'instale', 'claude')
    await scene(ep, browser, clean, 4, home, [
      [pacotes - 0.3, (p) => extensions(p, 'Skills')],
      [nova, (p) => frameAt(p, p.getByRole('button', { name: 'Nova skill' }))],
      [instale, (p) => frameAt(p, p.getByLabel('Instalar .zip, .skill ou SKILL.md').locator('..'))],
      [claude, card('Skills do Claude', 'o mesmo SKILL.md funciona aqui')],
    ])
  }

  // 6 — An MCP server in Tools; the connection is tested.
  {
    const [ferramentas, servidores, acesso, permissao] = ep.at(6, 'ferramentas', 'servidores', 'acesso', 'permissão')
    await scene(ep, browser, clean, 6, home, [
      [ferramentas - 0.3, async (p) => { await frameAt(p, tools(p)); await point(p, tools(p)); await hideFrame(p) }],
      [servidores - 0.5, async (p) => {
        const b = p.getByRole('button', { name: 'Novo servidor' })
        await b.scrollIntoViewIfNeeded()
        await point(p, b)
        await typeIn(p.getByLabel('Nome').last(), 'Arquivo da produtora', 30)
        await p.getByLabel('URL').last().fill(mcp.url)
      }],
      [acesso, async (p) => {
        const b = p.getByRole('button', { name: 'Testar conexão' })
        await point(p, b)
        await p.waitForTimeout(800)
        await frameAt(p, p.getByText(/ferramentas:/).first())
      }],
      [permissao - 0.3, card('Antes de cada uso', 'o TSRS pede a sua permissão')],
    ])
  }

  // 7 — The code interpreter: a spreadsheet, a total by month, a bar chart.
  {
    const [interpretador, grafico] = ep.at(7, 'interpretador', 'gráfico')
    await scene(ep, browser, live, 7, home, [
      [interpretador - 0.3, async (p) => {
        await tools(p).click()
        const sw = p.getByRole('switch', { name: 'Interpretador de JavaScript e gráficos' })
        await sw.scrollIntoViewIfNeeded()
        await frameAt(p, sw.locator('..'))
      }],
      [interpretador + 1.0, async (p) => {
        await hideFrame(p)
        await p.keyboard.press('Escape')
        await p.locator('.composer input[type=file]').setInputFiles(join(SERIE, 'assets', 'vendas.csv'))
        await typeIn(composer(p), 'Some o total por mês e mostre num gráfico de barras', 14)
        await composer(p).press('Enter')
      }],
      [grafico, (p) => frameAt(p, replies(p).last().locator('canvas, svg, .chart').first())],
    ])
  }

  // 8 — Extensions → Schedule → New task: every day at 7:40, AI news.
  {
    const [agendaW, pedido, modelo, horario] = ep.at(8, 'agenda', 'pedido', 'modelo', 'horário')
    await scene(ep, browser, live, 8, home, [
      [agendaW - 0.2, (p) => extensions(p, 'Agenda')],
      [pedido - 1.2, async (p) => {
        await point(p, p.getByRole('button', { name: 'Nova tarefa' }))
        await typeIn(p.getByLabel('Nome da tarefa'), 'Notícias de IA', 40)
      }],
      [pedido, async (p) => {
        const f = p.getByLabel('O que pedir ao modelo')
        await frameAt(p, f)
        await typeIn(f, 'Resuma as três notícias de IA mais importantes desde ontem, para quem produz vídeo.', 22)
      }],
      [modelo + 0.6, (p) => frameAt(p, p.getByLabel('Modelo da tarefa'))],
      [horario + 0.4, async (p) => {
        const f = p.getByLabel('Horário')
        await frameAt(p, f)
        await f.fill('07:40')
      }],
    ])
  }

  // 9 — The server runs it, even with the tab closed: the answer in a chat and in Mission Control.
  {
    const [servidor, conversa, painel] = ep.at(9, 'servidor', 'conversa', 'painel')
    await scene(ep, browser, agenda, 9, home, [
      [servidor, badge('RODA NO SERVIDOR DO TSRS · ABA FECHADA OU NÃO')],
      [conversa - 0.3, async (p) => {
        await point(p, p.locator('.chat-item', { hasText: 'Agenda: Notícias de IA' }))
        await p.mouse.move(1000, 600)
        await frameAt(p, replies(p).last())
      }],
      [painel - 0.2, async (p) => {
        await hideFrame(p)
        await p.evaluate(() => document.getElementById('__badge')?.remove())
        await point(p, p.getByRole('navigation', { name: 'Estúdio' }).getByRole('button', { name: 'Painel do dia' }))
        await p.waitForTimeout(700)
        await frameAt(p, p.getByText('Agenda: Notícias de IA').last())
      }],
    ])
  }

  await mock.close()
  await mcp.close()
  void expect
})
