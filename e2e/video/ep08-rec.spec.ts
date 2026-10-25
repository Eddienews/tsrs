// Episode 8 of the video tutorial: the library. Run by hand:
//   SERIE_EP=8 npx playwright test e2e/video/ep08-rec.spec.ts --project video --workers 1
import { join } from 'node:path'
import { test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { card, composer, Episode, frameAt, hideFrame, home, LIVED_IN, point, replies, scene, seed, SERIE, typeIn } from './lib'

const ep = new Episode(8)

const WRITER = {
  id: 'p-roteirista',
  name: 'Roteirista do Seu Silva',
  system: 'Você escreve o Seu Silva: humor seco, cenas curtas, um aposentado no bairro. Nunca explique a piada.',
  params: { temperature: 0.9, effort: 'medium' },
  knowledge: ['kb-silva'],
}
const SETUP =
  `settings.personas = [${JSON.stringify(WRITER)}, ...settings.personas];` +
  "settings.knowledgeBases = [{ id: 'kb-silva', name: 'Bíblia do Seu Silva' }];" +
  'settings.memory = true;' +
  'settings.memories = [' +
  "{ id: 'm1', text: 'Escreve a série Seu Silva e o Milo', createdAt: Date.now() }," +
  "{ id: 'm2', text: 'Prefere roteiros com três cenas', createdAt: Date.now() }," +
  "{ id: 'm3', text: 'A produtora se chama NorthWind Lab', createdAt: Date.now() }];" +
  "settings.prompts = [{ id: 'pr-post', title: 'Post para rede social', text: 'Escreva um post para {{rede}} sobre {{assunto}}, num tom {{tom}}.' }, ...(settings.prompts || [])];"

const SCRIPT: Scripted[] = [
  { when: /^Escreva um post para Instagram/, text: 'Seu Silva descobriu o aplicativo da padaria. A padaria ainda está se recuperando. ☕ Episódio novo hoje, às 19h.', wps: 20 },
  { when: /^Agora encurte/, text: 'Seu Silva vs. aplicativo da padaria. Hoje, 19h.', wps: 20 },
  { when: /^Traduza para o inglês/, text: 'Seu Silva vs. the bakery app. Tonight, 7 pm.', wps: 20 },
]

test('records the screen of episode 8', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const dir = join(ep.dir, 'screen')
  const plain = join(dir, 'plain.json')
  const library = join(dir, 'library.json')
  await seed(browser, plain, { mockUrl: mock.url, chats: LIVED_IN })
  await seed(browser, library, { mockUrl: mock.url, chats: LIVED_IN, tweak: SETUP })
  const openLibrary = async (p: Page, tab?: string) => {
    await p.getByRole('button', { name: 'Biblioteca' }).first().click()
    if (tab) await p.getByRole('tab', { name: tab }).click()
  }
  const writerCard = (p: Page) => p.locator('.dialog').getByLabel('Nome').first()
  // Library cards open on a click on their name.
  const expand = (p: Page, name: string) => p.locator('button[aria-expanded]', { hasText: name }).first().click()

  // 2 — The library: a new agent, the Seu Silva writer.
  {
    const [biblioteca, instrucoes, modelo, ferramentas, arquivos, criar] =
      ep.at(2, 'biblioteca', 'instruções', 'modelo', 'ferramentas', 'arquivos', 'criar')
    await scene(ep, browser, plain, 2, home, [
      [biblioteca, (p) => openLibrary(p)],
      [instrucoes - 0.8, async (p) => {
        const b = p.getByRole('button', { name: 'Nova persona' })
        await frameAt(p, b)
        await point(p, b)
      }],
      [instrucoes, (p) => frameAt(p, p.getByLabel('Prompt de sistema').first())],
      [modelo, (p) => frameAt(p, p.getByLabel('Provedor da persona').first().locator('..'))],
      [ferramentas, (p) => frameAt(p, p.getByRole('switch', { name: 'Ferramentas próprias' }).first())],
      [arquivos, (p) => frameAt(p, p.locator('.dialog input[type=file]').first().locator('..'))],
      [criar, async (p) => {
        await hideFrame(p)
        await typeIn(p.getByLabel('Nome').first(), 'Roteirista do Seu Silva', 45)
        await typeIn(p.getByLabel('Prompt de sistema').first(), 'Você escreve o Seu Silva: humor seco, cenas curtas.', 30)
      }],
    ])
  }

  // 3 — Its own temperature and reasoning, and the skills and plugins it may use.
  {
    const [temperatura, raciocinio, skills] = ep.at(3, 'temperatura', 'raciocínio', 'skills')
    await scene(ep, browser, library, 3, async (p) => { await home(p); await openLibrary(p); await expand(p, 'Roteirista do Seu Silva'); await writerCard(p).waitFor() }, [
      [temperatura - 0.3, async (p) => {
        const f = p.getByLabel('Temperatura do agente').first()
        await f.scrollIntoViewIfNeeded()
        await frameAt(p, f)
      }],
      [raciocinio, (p) => frameAt(p, p.getByLabel('Nível de raciocínio do agente').first())],
      [skills, (p) => frameAt(p, p.getByLabel('Escolher skills e plugins').first())],
    ])
  }

  // 4 — The agent for a whole chat (persona), or for one message with @.
  {
    const [persona, arroba] = ep.at(4, 'persona', 'arroba')
    await scene(ep, browser, library, 4, home, [
      [persona - 0.4, async (p) => {
        const b = p.getByTitle('Persona desta conversa')
        await frameAt(p, b)
        await point(p, b)
        await p.waitForTimeout(500)
        await frameAt(p, p.getByRole('menuitemradio', { name: 'Roteirista do Seu Silva' }))
      }],
      [arroba - 0.4, async (p) => {
        await p.keyboard.press('Escape')
        await hideFrame(p)
        await composer(p).click()
        await composer(p).pressSequentially('@rot', { delay: 140 })
        await p.waitForTimeout(300)
        await frameAt(p, p.getByRole('listbox', { name: 'Agentes' }))
      }],
    ])
  }

  // 5 — A prompt with fields in braces; using it asks for each one.
  {
    const [campos, usar, pergunta] = ep.at(5, 'campos', 'usar', 'pergunta')
    await scene(ep, browser, library, 5, async (p) => {
      await home(p)
      await openLibrary(p, 'Prompts salvos')
      await expand(p, 'Post para rede social')
    }, [
      [campos - 0.3, (p) => frameAt(p, p.getByLabel('Texto').first())],
      [usar - 0.3, async (p) => {
        await hideFrame(p)
        await p.getByTitle('Fechar').click()
        const b = p.getByRole('button', { name: 'Prompts', exact: true })
        await frameAt(p, b)
        await point(p, b)
        await p.waitForTimeout(400)
        await point(p, p.locator('.menu').getByRole('button', { name: /Post para rede social/ }))
      }],
      [pergunta, async (p) => {
        const menu = p.locator('.menu')
        await frameAt(p, menu)
        await typeIn(menu.getByLabel('rede'), 'Instagram', 60)
        await typeIn(menu.getByLabel('assunto'), 'o episódio novo', 50)
      }],
    ])
  }

  // 6 — Add step: the prompt becomes a chain, sent one step at a time.
  {
    const [adicionar, primeira, proxima] = ep.at(6, 'adicionar', 'primeira', 'próxima')
    await scene(ep, browser, library, 6, async (p) => {
      await home(p)
      await openLibrary(p, 'Prompts salvos')
      await expand(p, 'Post para rede social')
    }, [
      [adicionar - 0.3, async (p) => {
        const b = p.getByRole('button', { name: 'Adicionar etapa' }).first()
        await frameAt(p, b)
        await point(p, b)
        await typeIn(p.getByRole('textbox', { name: 'Etapa 2' }), 'Agora encurte para uma linha: {{resposta}}', 25)
      }],
      [primeira - 0.2, async (p) => {
        await hideFrame(p)
        await p.getByTitle('Fechar').click()
        await p.getByRole('button', { name: 'Prompts', exact: true }).click()
        await p.locator('.menu').getByRole('button', { name: /Post para rede social/ }).click()
        await p.locator('.menu').getByLabel('rede').fill('Instagram')
        await p.locator('.menu').getByLabel('assunto').fill('o episódio novo')
        await p.locator('.menu').getByLabel('tom').fill('seco')
        await point(p, p.locator('.menu').getByRole('button', { name: 'Executar o encadeamento' }))
      }],
      [proxima + 0.6, (p) => frameAt(p, p.locator('.message.user').last())],
    ])
  }

  // 7 — The community gallery.
  {
    const [galeria] = ep.at(7, 'galeria')
    await scene(ep, browser, library, 7, async (p) => { await home(p); await openLibrary(p, 'Prompts salvos') }, [
      [galeria - 0.2, async (p) => {
        const b = p.getByRole('button', { name: /Galeria da comunidade \(\d+ prompts\)/ })
        await frameAt(p, b)
        await point(p, b)
        await hideFrame(p)
      }],
      [galeria + 1.6, (p) => p.getByRole('region', { name: 'Galeria da comunidade' }).hover().then(() => p.mouse.wheel(0, 300))],
    ])
  }

  // 8 — Memory: the list of facts, to see, edit and delete.
  {
    const [memoria, lista, apaga] = ep.at(8, 'memória', 'lista', 'apaga')
    await scene(ep, browser, library, 8, home, [
      [memoria - 0.3, (p) => openLibrary(p, 'Memória')],
      [memoria + 0.3, (p) => frameAt(p, p.getByLabel('Usar memória'))],
      [lista, (p) => frameAt(p, p.getByLabel('Fato').first().locator('../..'))],
      [apaga, (p) => frameAt(p, p.getByLabel('Esquecer').first())],
    ])
  }

  // 9 — A knowledge base, linked to the agent.
  {
    const [conhecimento, documentos, ligada] = ep.at(9, 'conhecimento', 'documentos', 'ligada')
    await scene(ep, browser, library, 9, home, [
      [conhecimento - 0.3, (p) => openLibrary(p, 'Conhecimento')],
      [documentos, async (p) => {
        await frameAt(p, p.locator('.dialog').getByText('Bíblia do Seu Silva').first())
        await card('Bíblia do Seu Silva', 'personagens, regras e episódios')(p)
      }],
      [ligada - 0.3, async (p) => {
        await p.getByRole('tab', { name: 'Personas' }).click()
        await expand(p, 'Roteirista do Seu Silva')
        const box = p.getByText('Bases de conhecimento').first().locator('..')
        await box.scrollIntoViewIfNeeded()
        await frameAt(p, box)
      }],
    ])
  }

  await mock.close()
  void replies
  void SERIE
})
