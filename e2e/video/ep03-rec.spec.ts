// Episode 3 of the video tutorial: organising the chats. Run by hand:
//   SERIE_EP=3 npx playwright test e2e/video/ep03-rec.spec.ts --project video --workers 1
import { join } from 'node:path'
import { test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import {
  card, chatRow, composer, Episode, frameAt, hideFrame, home, LIVED_IN, point, replies, scene, seed, typeIn, typeKeys,
} from './lib'

const ep = new Episode(3)

const IDEAS = 'Me dê três ideias de episódio para o Seu Silva sobre tecnologia no bairro.'
const IDEAS_REPLY =
  '1. **O caixa sem atendente** — Seu Silva enfrenta o autoatendimento do mercado e perde para a balança das bananas.\n\n' +
  '2. **O grupo da rua** — o vizinho cria um grupo de mensagens e Seu Silva responde tudo com áudio de quatro minutos.\n\n' +
  '3. **A padaria tem aplicativo** — ele tenta pedir o pão de sempre pelo celular e recebe dez pães de queijo.'

const SCRIPT: Scripted[] = [
  { when: /^Escreva a sinopse/, text: 'Seu Silva descobre que a padaria agora tem aplicativo. Determinado a pedir "o de sempre", ele enfrenta cadastro, senha e um mapa que o manda para a padaria errada.', title: 'Sinopse do episódio 14' },
  { when: /ideias de episódio/, text: IDEAS_REPLY, usage: { input: 1500, output: 140 } },
  { when: /ideias de episódio/, text: '1. **O pix do troco** — o jornaleiro não tem troco e Seu Silva aprende a fazer pix, com plateia.\n\n2. **A câmera da portaria** — ele descobre que é filmado e passa a ensaiar a entrada no prédio.\n\n3. **O relógio que conta passos** — ganha um de presente e começa a andar em círculos na sala para bater a meta.', usage: { input: 1500, output: 130 } },
  { when: /ideias de episódio/, text: '1. **Senha forte** — o banco pede uma senha com símbolo e Seu Silva escolhe "SeuSilva!" com orgulho.\n\n2. **O robô aspirador** — a vizinha compra um e ele declara guerra ao intruso.\n\n3. **Videochamada com a neta** — meia hora mostrando a própria orelha.', usage: { input: 1500, output: 120 } },
  { when: /^Sobre este trecho|About this part/, text: 'É a balança de autoatendimento: o cliente pesa a fruta e escolhe o produto na tela. A piada funciona porque ela trava sempre que alguém põe algo que não reconhece.' },
]

const FOLDER = { id: 'pasta-seu-silva', name: 'Seu Silva' }
const CONTEXT =
  'Série de humor seco sobre um aposentado no bairro. Público: adultos, 25 a 50 anos. Episódios de 60 s, três cenas, sem palavrão.'

test('records the screen of episode 3', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const dir = join(ep.dir, 'screen')
  const plain = join(dir, 'plain.json')
  const folder = join(dir, 'folder.json')
  const ideas = join(dir, 'ideas.json')
  await seed(browser, plain, { mockUrl: mock.url, chats: LIVED_IN })
  await seed(browser, folder, {
    mockUrl: mock.url,
    chats: LIVED_IN,
    tweak: `settings.folders = [${JSON.stringify({ ...FOLDER, instructions: CONTEXT })}]`,
  })
  await seed(browser, ideas, {
    mockUrl: mock.url,
    chats: [{ title: 'Ideias para o Seu Silva', ask: IDEAS, answer: IDEAS_REPLY, usage: { input: 1500, output: 140, cost: 0.0110 } }, ...LIVED_IN],
  })
  const folderRow = (p: Page) => p.locator('.sidebar [data-folder]', { hasText: 'Seu Silva' })
  const folderMenu = async (p: Page, item: string) => {
    await folderRow(p).hover()
    const options = folderRow(p).getByTitle('Opções da pasta')
    await frameAt(p, options)
    await point(p, options)
    await p.waitForTimeout(500)
    const entry = p.getByRole('menuitem', { name: item })
    await frameAt(p, entry)
    await p.waitForTimeout(500)
    await entry.click()
    await hideFrame(p)
  }
  const openIdeas = async (p: Page) => {
    await home(p)
    await chatRow(p, 'Ideias para o Seu Silva').click()
    await replies(p).first().waitFor()
    await p.mouse.move(1000, 600)
  }

  // 2 — New folder, named "Seu Silva".
  {
    const [acumulam, nova, nome, silva] = ep.at(2, 'acumulam', 'nova', 'nome', 'silva')
    await scene(ep, browser, plain, 2, home, [
      [acumulam, (p) => frameAt(p, [chatRow(p, 'Roteiro do Seu Silva #13'), chatRow(p, 'Abertura do Milo')])],
      [nova, async (p) => {
        const button = p.getByRole('button', { name: 'Nova pasta' })
        await frameAt(p, button)
        await point(p, button)
        await hideFrame(p)
      }],
      [nome, (p) => typeIn(p.getByLabel('Nome da pasta:'), 'Seu Silva', 90)],
      [silva + 0.6, async (p) => {
        await p.keyboard.press('Enter')
        await p.waitForTimeout(300)
        await frameAt(p, folderRow(p))
      }],
    ])
  }

  // 3 — The folder's context: instructions, files and an agent.
  {
    const [menu, escreva, anexar, agente] = ep.at(3, 'menu', 'escreva', 'anexar', 'agente')
    await scene(ep, browser, folder, 3, async (p) => {
      await home(p)
      await p.evaluate(async () => {
        // The folder starts without context in this scene: it is written on screen.
        const storage: any = await import('/src/storage.ts')
        const s = storage.loadSettings()
        s.folders = s.folders.map((f: any) => ({ ...f, instructions: '' }))
        localStorage.setItem(storage.SETTINGS_KEY, JSON.stringify(s))
      })
      await home(p)
    }, [
      [menu, (p) => folderMenu(p, 'Contexto da pasta…')],
      [escreva, async (p) => {
        const box = p.getByLabel('Instruções da pasta')
        await frameAt(p, box)
        await typeIn(box, CONTEXT, 38)
      }],
      [anexar, (p) => frameAt(p, p.getByLabel('Arquivos de contexto').locator('..'))],
      [agente, (p) => frameAt(p, p.getByLabel('Agente da pasta'))],
      [ep.length(3) - 0.9, async (p) => { await hideFrame(p); await p.getByRole('button', { name: 'Salvar' }).click() }],
    ])
  }

  // 4 — New chat in this folder: the note says it has the folder's context.
  {
    const [nova, sabendo] = ep.at(4, 'nova', 'sabendo')
    await scene(ep, browser, folder, 4, home, [
      [nova - 0.8, (p) => folderMenu(p, 'Nova conversa nesta pasta')],
      [sabendo - 0.4, (p) => frameAt(p, p.locator('.folder-note'))],
      [sabendo + 1.2, (p) => typeIn(composer(p), 'Escreva a sinopse do episódio 14', 45)],
    ])
  }

  // 5 — An old chat moved into the folder from its menu; then the search.
  {
    const [conversas, busca, conteudo] = ep.at(5, 'conversas', 'busca', 'conteúdo')
    const row = (p: Page) => chatRow(p, 'Roteiro do Seu Silva #13')
    await scene(ep, browser, folder, 5, home, [
      [conversas - 0.3, async (p) => {
        await row(p).hover()
        await point(p, row(p).getByTitle('Opções'))
        await p.waitForTimeout(400)
        const move = p.getByRole('menuitem', { name: /Mover para “Seu Silva”/ })
        await frameAt(p, move)
        await p.waitForTimeout(700)
        await move.click()
        await hideFrame(p)
        await p.waitForTimeout(700)
        await frameAt(p, folderRow(p))
      }],
      [busca, async (p) => {
        const search = p.getByPlaceholder('Buscar nas conversas…')
        await frameAt(p, search)
        await typeIn(search, 'padaria', 110)
      }],
      [conteudo, (p) => frameAt(p, p.locator('.sidebar .chat-item').first())],
    ])
  }

  // 6 — The chat's menu.
  {
    const [menu, renomeia, fixa, etiquetas, arquiva, exporta] = ep.at(6, 'menu', 'renomeia', 'fixa', 'etiquetas', 'arquiva', 'exporta')
    const row = (p: Page) => chatRow(p, 'Abertura do Milo')
    await scene(ep, browser, plain, 6, home, [
      [menu - 0.3, async (p) => {
        await row(p).hover()
        await point(p, row(p).getByTitle('Opções'))
      }],
      [renomeia, (p) => frameAt(p, p.getByRole('menuitem', { name: 'Renomear' }))],
      [fixa, (p) => frameAt(p, p.getByRole('menuitem', { name: 'Fixar' }))],
      [etiquetas, (p) => frameAt(p, p.getByRole('menuitem', { name: 'Etiquetas' }))],
      [arquiva, (p) => frameAt(p, p.getByRole('menuitem', { name: 'Arquivar' }))],
      [exporta, (p) => frameAt(p, [p.getByRole('menuitem', { name: 'Exportar Markdown' }), p.getByRole('menuitem', { name: 'Exportar HTML' })])],
    ])
  }

  // 7 — Compare with other models: columns side by side.
  {
    const [ferramentas, comparar, tres, lado] = ep.at(7, 'ferramentas', 'comparar', 'três', 'lado')
    await scene(ep, browser, ideas, 7, async (p) => { mock.reset(1); await openIdeas(p) }, [
      [ferramentas, card('3 ferramentas', 'comparar · ramificar · perguntar à parte')],
      [comparar - 0.3, async (p) => {
        await replies(p).last().hover()
        const button = replies(p).last().getByRole('button', { name: 'Comparar' })
        await frameAt(p, button)
        await point(p, button)
        await hideFrame(p)
      }],
      [tres - 0.6, async (p) => {
        const dialog = p.locator('.dialog.narrow')
        await point(p, dialog.getByRole('checkbox', { name: /claude-sonnet-5-5/ }).first())
        await p.waitForTimeout(250)
        await point(p, dialog.getByRole('checkbox', { name: /claude-haiku-5-5/ }).first())
      }],
      [lado - 1.2, (p) => point(p, p.locator('.dialog.narrow').getByRole('button', { name: 'Gerar' }))],
      [lado + 0.4, (p) => p.mouse.move(1000, 650, { steps: 6 })],
    ])
  }

  // 8 — Branch from a message: a new chat, the original untouched.
  {
    const [ramificar, nova, original] = ep.at(8, 'ramificar', 'nova', 'original')
    const question = (p: Page) => p.locator('.message.user').last()
    await scene(ep, browser, ideas, 8, openIdeas, [
      [ramificar, async (p) => {
        await point(p, question(p), false)
        await frameAt(p, question(p).getByRole('button', { name: 'Ramificar a partir daqui' }))
      }],
      [nova - 0.2, async (p) => {
        await question(p).getByRole('button', { name: 'Ramificar a partir daqui' }).click()
        await p.waitForTimeout(400)
        await frameAt(p, chatRow(p, 'Ideias para o Seu Silva (ramificação)'))
      }],
      [original, (p) => frameAt(p, chatRow(p, 'Ideias para o Seu Silva').last())],
    ])
  }

  // 9 — Ask about part of a reply, in a side panel.
  {
    const [selecione, pergunte, painel] = ep.at(9, 'selecione', 'pergunte', 'painel')
    await scene(ep, browser, ideas, 9, openIdeas, [
      [selecione, async (p) => {
        await replies(p).last().locator('strong', { hasText: 'O caixa sem atendente' }).selectText()
        await replies(p).last().hover()
        await p.waitForTimeout(200)
        const button = replies(p).last().getByRole('button', { name: 'Perguntar à parte' })
        await frameAt(p, button)
      }],
      [pergunte, async (p) => {
        await point(p, replies(p).last().getByRole('button', { name: 'Perguntar à parte' }))
        await hideFrame(p)
        await p.locator('.side-chat').getByRole('textbox', { name: 'Pergunta' }).fill('Como seria essa balança?')
        await p.waitForTimeout(500)
        await p.locator('.side-chat').getByRole('textbox', { name: 'Pergunta' }).press('Enter')
      }],
      [painel, (p) => frameAt(p, p.locator('.side-chat'))],
    ])
  }

  // 10 — The temporary chat, and clearing the context.
  {
    const [temporaria, limpar, borracha] = ep.at(10, 'temporária', 'limpar', 'borracha')
    // The toggle is on a new chat; the eraser on one that has messages.
    await scene(ep, browser, ideas, 10, home, [
      [temporaria - 0.3, async (p) => {
        const toggle = p.getByRole('button', { name: 'Conversa temporária' })
        await frameAt(p, toggle)
        await point(p, toggle)
      }],
      [limpar - 1.2, async (p) => {
        await hideFrame(p)
        await point(p, chatRow(p, 'Ideias para o Seu Silva'))
        await p.mouse.move(1000, 600, { steps: 6 })
      }],
      [limpar, (p) => frameAt(p, p.locator('.toolbar').getByRole('button', { name: 'Limpar o contexto' }))],
      [borracha + 0.4, async (p) => {
        await p.locator('.toolbar').getByRole('button', { name: 'Limpar o contexto' }).click()
        await p.waitForTimeout(300)
        await frameAt(p, p.locator('.context-reset'))
      }],
    ])
  }

  await mock.close()
  void typeKeys
})
