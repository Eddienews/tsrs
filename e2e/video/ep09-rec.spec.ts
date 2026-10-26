// Episode 9 of the video tutorial: web search and deep research. Run by hand:
//   SERIE_EP=9 npx playwright test e2e/video/ep09-rec.spec.ts --project video --workers 1
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { badge, composer, Episode, frameAt, hideFrame, home, LIVED_IN, point, replies, scene, seed, tr, typeIn } from './lib'

const ep = new Episode(9)

const QUESTION = 'Quais estúdios independentes de animação lançaram curtas feitos com IA neste mês?'
const RESEARCH = 'Como pequenas produtoras estão usando IA em anúncios curtos? Quero exemplos, custos e riscos.'

const RESULTS = [
  { title: 'Curtas com IA: o mês dos estúdios independentes', url: 'https://www.animationmagazine.net/curtas-ia', snippet: 'Cinco estúdios lançaram curtas feitos com ferramentas de vídeo generativo.' },
  { title: 'Festival abre categoria para animação com IA', url: 'https://www.cartoonbrew.com/festival-ia', snippet: 'A nova categoria aceita curtas de até 3 minutos.' },
  { title: 'Como um estúdio de 3 pessoas fez um curta em 10 dias', url: 'https://www.fxguide.com/estudio-tres-pessoas', snippet: 'Roteiro, imagens e som com IA, edição tradicional.' },
]

const SCRIPT: Scripted[] = [
  {
    when: /estúdios independentes/,
    tools: [{ name: 'search_web', input: { query: 'curtas de animação feitos com IA estúdios independentes outubro 2026' } }],
    text:
      'Encontrei três casos recentes:\n\n' +
      '- **Cinco estúdios independentes** lançaram curtas com vídeo generativo neste mês [1].\n' +
      '- Um **festival** abriu uma categoria só para animação com IA, com curtas de até 3 minutos [2].\n' +
      '- Um estúdio de **três pessoas** fez um curta em dez dias, com edição tradicional [3].',
    title: 'Curtas de animação com IA',
    wps: 30,
  },
  {
    when: /pequenas produtoras/,
    tools: [
      { name: 'search_web', input: { query: 'pequenas produtoras IA anúncios curtos exemplos' } },
      { name: 'read_page', input: { url: 'https://www.fxguide.com/estudio-tres-pessoas' } },
      { name: 'search_web', input: { query: 'custo produção anúncio 15 segundos IA generativa' } },
      { name: 'read_page', input: { url: 'https://www.animationmagazine.net/curtas-ia' } },
    ],
    text:
      '# Pequenas produtoras e anúncios curtos com IA\n\n' +
      '## Resumo\nEstúdios de poucas pessoas já entregam anúncios de 15 a 30 segundos combinando roteiro, imagem e som gerados, com edição tradicional no fim [1][3].\n\n' +
      '## Exemplos\n- Um estúdio de três pessoas fez um curta em dez dias [3].\n- Cinco estúdios lançaram curtas com vídeo generativo no mesmo mês [1].\n\n' +
      '## Custos\nO maior custo deixou de ser a filmagem e passou a ser a revisão: cada plano costuma ser gerado várias vezes [3].\n\n' +
      '## Riscos\nDireitos de imagem, consistência de personagens e a aprovação do cliente em cada etapa [2].',
    title: 'Pesquisa: IA em anúncios curtos',
    wps: 60,
  },
]

const SEARCH =
  "settings.ownSearch = { provider: 'brave' };" +
  "settings.mediaKeys = { ...(settings.mediaKeys || {}), 'search:brave': 'bsa-demo' };" +
  'settings.webSearch = true;'

async function fakeSearch(page: Page) {
  // The search results the page shows are video text too (translated in the English take).
  const results = RESULTS.map((r) => ({ ...r, title: tr(r.title), snippet: tr(r.snippet) }))
  await page.route('**/__tsrs/ext/search', (route) => route.fulfill({ json: { results } }))
  await page.route('**/__tsrs/ext/read', (route) => {
    const url = JSON.parse(route.request().postData() ?? '{}').url ?? RESULTS[2].url
    const hit = RESULTS.find((r) => r.url === url) ?? RESULTS[2]
    return route.fulfill({ json: { url, title: tr(hit.title), text: tr(hit.snippet) + tr(' O texto completo da reportagem segue com entrevistas e números.') } })
  })
}

test('records the screen of episode 9', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const dir = join(ep.dir, 'screen')
  const clean = join(dir, 'clean.json')
  const search = join(dir, 'search.json')
  await seed(browser, clean, { mockUrl: mock.url, chats: LIVED_IN })
  await seed(browser, search, { mockUrl: mock.url, chats: LIVED_IN, tweak: SEARCH })
  const tools = (p: Page) => p.locator('.toolbar').getByRole('button', { name: 'Ferramentas' })

  // 3 — Tools: the provider's own search, just a switch.
  {
    const [ferramentas, ligar] = ep.at(3, 'ferramentas', 'ligar')
    await scene(ep, browser, clean, 3, home, [
      [ferramentas - 0.3, async (p) => { await frameAt(p, tools(p)); await point(p, tools(p)) }],
      [ferramentas + 1.2, (p) => frameAt(p, p.getByRole('switch', { name: 'Busca na web' }).locator('..'))],
      [ligar - 0.2, (p) => p.getByRole('switch', { name: 'Busca na web' }).click()],
    ])
  }

  // 4 — Own search for any model: Brave, Tavily, Google or Kagi.
  {
    const [qualquer, chave, gratuitos] = ep.at(4, 'qualquer', 'chave', 'gratuitos')
    await scene(ep, browser, clean, 4, async (p) => {
      await home(p)
      await tools(p).click()
      await p.locator('.own-search').scrollIntoViewIfNeeded()
    }, [
      [qualquer, (p) => frameAt(p, p.locator('.own-search'))],
      [chave, async (p) => {
        await p.getByLabel('Serviço de busca').selectOption('brave')
        await frameAt(p, p.getByLabel('Chave de Brave Search'))
      }],
      [gratuitos, badge('BRAVE E TAVILY: PLANOS GRATUITOS')],
    ])
  }

  // 5 — A current question: the search runs, and the sources are listed.
  {
    const [paginas] = ep.at(5, 'páginas')
    await scene(ep, browser, search, 5, async (p) => { await fakeSearch(p); await home(p) }, [
      [0.1, async (p) => {
        await typeIn(composer(p), QUESTION, 14)
        await composer(p).press('Enter')
      }],
      [paginas + 0.4, async (p) => {
        await expect(p.getByRole('button', { name: 'Enviar' })).toBeVisible({ timeout: 4000 }).catch(() => {})
        const links = replies(p).last().getByRole('link', { name: /Curtas com IA/ })
        await frameAt(p, links.locator('../..'))
      }],
    ])
  }

  // 6 — The research switch, in the message box.
  {
    const [pesquisa] = ep.at(6, 'pesquisa')
    const button = (p: Page) => p.getByRole('button', { name: 'Pesquisa', exact: true })
    await scene(ep, browser, search, 6, home, [
      [pesquisa - 0.3, async (p) => { await frameAt(p, button(p)); await point(p, button(p)) }],
      [pesquisa + 0.8, (p) => frameAt(p, p.getByPlaceholder(/O que pesquisar/))],
    ])
  }

  // 7 — Rounds of searching and reading, then the report with its sources. Sped up.
  {
    const S = 2
    const [rodadas, relatorio, minutos] = ep.at(7, 'rodadas', 'relatório', 'minutos')
    await scene(ep, browser, search, 7, async (p) => {
      await fakeSearch(p)
      await home(p)
      await p.getByRole('button', { name: 'Pesquisa', exact: true }).click()
      await p.getByPlaceholder(/O que pesquisar/).fill(tr(RESEARCH))
    }, [
      [0.1, badge('ACELERADO 2×')],
      [0.3, (p) => p.getByPlaceholder(/O que pesquisar/).press('Enter')],
      [rodadas * S, (p) => frameAt(p, replies(p).last().locator('.tool').first())],
      [relatorio * S + 2, async (p) => { await hideFrame(p); await p.mouse.move(700, 400); await p.mouse.wheel(0, 2000) }],
      [minutos * S, (p) => frameAt(p, p.locator('.message.user').last().locator('.research-label'))],
    ], undefined, S)
  }

  // 9 — /apis: thirty-eight open services, no key.
  {
    const [barra, servicos] = ep.at(9, 'barra', 'serviços')
    await scene(ep, browser, clean, 9, home, [
      [barra - 0.2, async (p) => { await composer(p).click(); await composer(p).pressSequentially('/ap', { delay: 160 }) }],
      [barra + 1, (p) => frameAt(p, p.getByRole('option', { name: /apis/ }).first())],
      [servicos + 0.4, async (p) => {
        await composer(p).press('Enter')
        await typeIn(composer(p), 'ver a cotação do dólar e o clima em São Paulo', 30)
      }],
    ])
  }

  await mock.close()
})
