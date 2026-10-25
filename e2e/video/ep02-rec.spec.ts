// Episode 2 of the video tutorial: the first chat. Run by hand:
//   SERIE_EP=2 npx playwright test e2e/video/ep02-rec.spec.ts --project video --workers 1
import { join } from 'node:path'
import { test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import {
  card, chatRow, clearCards, closeTerminal, composer, Episode, frameAt, hideFrame, hideKeys, home, keys, LIVED_IN, openSettings,
  point, replies, scene, seed, terminal, typeIn, typeKeys,
} from './lib'

const ep = new Episode(2)

const ASK = 'Explique em três frases o que é um storyboard'
const V1 =
  'Um **storyboard** é a sequência de desenhos que mostra, quadro a quadro, como um vídeo vai ficar antes de ser filmado. ' +
  'Cada quadro indica o enquadramento, a ação e, muitas vezes, o diálogo ou o som da cena. ' +
  'Ele ajuda a equipe a planejar os planos, prever problemas e economizar tempo na gravação.'
const V2 =
  'Pense no storyboard como uma história em quadrinhos do seu vídeo. ' +
  'Cada quadro desenha um plano: quem aparece, onde está a câmera e o que acontece. ' +
  'Assim, todo mundo vê o filme pronto antes do primeiro dia de gravação.'
const EDITED = 'Explique em três frases o que é um storyboard, com um exemplo de anúncio'
const V3 =
  'Um storyboard é o roteiro em imagens: cada quadro mostra um plano do vídeo. ' +
  'Num anúncio de café de 15 segundos, seriam uns quatro quadros: a xícara fumegando, a mão que a pega, o primeiro gole e o logo no fim. ' +
  'Com isso, a equipe sabe exatamente o que filmar e em que ordem.'

const SCRIPT: Scripted[] = [
  { when: /com um exemplo/, text: V3, title: 'Storyboard com exemplo', usage: { input: 1420, output: 96 } },
  { when: /storyboard/, text: V1, title: 'O que é um storyboard', usage: { input: 1380, output: 82 } },
  { when: /storyboard/, text: V2, usage: { input: 1380, output: 64 } },
]

// Ollama is not running here: its model list comes from a stand-in.
async function fakeOllama(page: Page) {
  await page.route(/11434.*(models|tags)/, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'qwen3:8b' }, { id: 'gemma4:12b' }, { id: 'llama4:scout' }] }) }),
  )
}

const provider = (p: Page, id: string) => p.locator(`[data-provider=${id}]`)

test('records the screen of episode 2', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const dir = join(ep.dir, 'screen')
  const clean = join(dir, 'clean.json')
  const live = join(dir, 'live.json')
  const story = join(dir, 'story.json')
  await seed(browser, clean, { chats: LIVED_IN })
  await seed(browser, live, { mockUrl: mock.url, chats: LIVED_IN, tweak: "settings.model = 'claude-sonnet-5-5'" })
  await seed(browser, story, {
    mockUrl: mock.url,
    chats: [{ title: 'O que é um storyboard', ask: ASK, answer: V1, usage: { input: 1380, output: 82, cost: 0.0089 } }, ...LIVED_IN],
  })
  const openStory = async (p: Page) => {
    await home(p)
    await chatRow(p, 'O que é um storyboard').click()
    await replies(p).first().waitFor()
    await p.mouse.move(1000, 200)
  }

  // 3 — ollama pull in a terminal, then Settings → Providers → Ollama → Load models.
  {
    const [depois, configuracoes, provedores, ollama, carregar] = ep.at(3, 'depois', 'configurações', 'provedores', 'ollama', 'carregar')
    await scene(ep, browser, clean, 3, async (p) => { await fakeOllama(p); await home(p) }, [
      [0.1, terminal('Windows PowerShell', [
        ['cmd', 'ollama pull qwen3', 200],
        ['out', 'pulling manifest', 500],
        ['out', 'pulling 9a5f…  100% ▕████████████████▏ 5.2 GB', 500],
        ['ok', 'success', 700],
      ])],
      [depois - 0.2, closeTerminal],
      [configuracoes, (p) => openSettings(p)],
      [provedores, async (p) => {
        await p.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: 'Provedores' }).click()
      }],
      [ollama - 0.3, async (p) => {
        await provider(p, 'ollama').scrollIntoViewIfNeeded()
        await frameAt(p, provider(p, 'ollama'))
      }],
      [carregar, async (p) => {
        const button = provider(p, 'ollama').getByRole('button', { name: 'Carregar modelos' })
        await frameAt(p, button)
        await point(p, button)
      }],
      [carregar + 1.6, (p) => frameAt(p, provider(p, 'ollama').getByText(/modelos/).last())],
    ])
  }

  // 4 — the key field of Anthropic, then OpenRouter: empty, no real key.
  {
    const [anthropic, openai, openrouter, cole, carregue, openrouter2] =
      ep.at(4, 'anthropic', 'openai', 'openrouter', 'cole', 'carregue', 'openrouter')
    await scene(ep, browser, clean, 4, async (p) => {
      await home(p)
      await openSettings(p, 'Provedores')
    }, [
      [anthropic, (p) => frameAt(p, provider(p, 'anthropic').locator('span').first())],
      [openai, async (p) => {
        await provider(p, 'openai').scrollIntoViewIfNeeded()
        await frameAt(p, provider(p, 'openai').locator('span').first())
      }],
      [openrouter, async (p) => {
        await provider(p, 'openrouter').scrollIntoViewIfNeeded()
        await frameAt(p, provider(p, 'openrouter').locator('span').first())
      }],
      [cole - 1.2, async (p) => {
        await provider(p, 'anthropic').scrollIntoViewIfNeeded()
        await frameAt(p, provider(p, 'anthropic'))
      }],
      [cole, (p) => frameAt(p, p.locator('#key-anthropic'))],
      [carregue, (p) => frameAt(p, provider(p, 'anthropic').getByRole('button', { name: 'Carregar modelos' }))],
      [openrouter2 - 0.2, async (p) => {
        await provider(p, 'openrouter').scrollIntoViewIfNeeded()
        await frameAt(p, p.locator('#key-openrouter'))
        await card('OpenRouter', 'uma chave, centenas de modelos')(p)
      }],
    ])
  }

  // 5 — the model picker: the list, then typing a name.
  {
    const [escolher, lista, digitar] = ep.at(5, 'escolher', 'lista', 'digitar')
    const picker = (p: Page) => p.getByRole('button', { name: 'Escolher modelo' })
    await scene(ep, browser, live, 5, home, [
      [escolher, async (p) => { await frameAt(p, picker(p)); await point(p, picker(p)) }],
      [lista, async (p) => { await hideFrame(p); await p.getByRole('option', { name: /claude-haiku-5-5/ }).first().hover() }],
      [digitar - 0.3, (p) => typeIn(p.getByPlaceholder('Buscar ou digitar um modelo…'), 'opus', 90)],
      [digitar + 0.8, async (p) => {
        await p.getByRole('option', { name: /claude-opus-5-5/ }).first().click()
        await frameAt(p, picker(p))
      }],
    ])
  }

  // 6 — the first message, sent with Enter; the reply streams in.
  {
    const [enter, shift, resposta] = ep.at(6, 'enter', 'shift', 'resposta')
    await scene(ep, browser, live, 6, async (p) => {
      mock.reset(0)
      await home(p)
      await p.evaluate(async () => {
        const storage: any = await import('/src/storage.ts')
        const s = storage.loadSettings()
        s.model = 'claude-opus-5-5'
        localStorage.setItem(storage.SETTINGS_KEY, JSON.stringify(s))
      })
      await home(p)
    }, [
      [0.1, (p) => typeIn(composer(p), ASK, 30)],
      [enter, keys('Enter')],
      [shift, keys('Shift', 'Enter')],
      [resposta - 0.3, async (p) => { await hideKeys(p); await composer(p).press('Enter') }],
      [resposta + 1, (p) => p.mouse.move(1000, 200)],
    ])
  }

  // 7 — regenerate, then the arrows between versions.
  {
    const [passe, regenerar, setas, alternam, perde] = ep.at(7, 'passe', 'regenerar', 'setas', 'alternam', 'perde')
    await scene(ep, browser, story, 7, async (p) => { mock.reset(1); await openStory(p) }, [
      [passe, (p) => point(p, replies(p).last(), false)],
      [regenerar - 0.4, (p) => frameAt(p, replies(p).last().getByRole('button', { name: 'Regenerar' }))],
      [regenerar, async (p) => {
        await point(p, replies(p).last().getByRole('button', { name: 'Regenerar' }))
        await hideFrame(p)
        await p.mouse.move(1000, 600, { steps: 8 })
      }],
      [setas, async (p) => {
        await replies(p).last().hover()
        await frameAt(p, [replies(p).last().getByTitle('Versão anterior'), replies(p).last().getByTitle('Próxima versão')])
      }],
      [alternam, (p) => point(p, replies(p).last().getByTitle('Versão anterior'))],
      [perde, (p) => point(p, replies(p).last().getByTitle('Próxima versão'))],
    ])
  }

  // 8 — edit the question and resend.
  {
    const [editar, troque, salvar] = ep.at(8, 'editar', 'troque', 'salvar')
    const question = (p: Page) => p.locator('.message.user').last()
    await scene(ep, browser, story, 8, openStory, [
      [editar - 0.6, (p) => point(p, question(p), false)],
      [editar, async (p) => {
        await frameAt(p, question(p).getByRole('button', { name: 'Editar' }))
        await question(p).getByRole('button', { name: 'Editar' }).click()
      }],
      [troque, async (p) => {
        const box = p.locator('.message.editing textarea')
        await frameAt(p, box)
        await box.press('End')
        await typeKeys(p, ', com um exemplo de anúncio', 45, box)
      }],
      [salvar, async (p) => {
        const button = p.getByRole('button', { name: 'Salvar e reenviar' })
        await frameAt(p, button)
        await point(p, button)
        await hideFrame(p)
      }],
    ])
  }

  // 9 — the chat's parameters.
  {
    const [parametros, sistema, temperatura, raciocinio] = ep.at(9, 'parâmetros', 'sistema', 'temperatura', 'raciocínio')
    await scene(ep, browser, story, 9, openStory, [
      [parametros - 0.3, async (p) => {
        const button = p.locator('.toolbar').getByRole('button', { name: 'Parâmetros' })
        await frameAt(p, button)
        await point(p, button)
        await hideFrame(p)
      }],
      [sistema, async (p) => {
        const field = p.getByLabel('Prompt de sistema desta conversa')
        await frameAt(p, field)
        await typeIn(field, 'Responda de forma breve.', 40)
      }],
      // Claude takes no temperature: the dialog says so, and the reasoning level stands in.
      [temperatura, (p) => frameAt(p, p.getByText(/não aceitam temperatura/))],
      [raciocinio - 0.6, (p) => frameAt(p, [p.getByText('Nível de raciocínio', { exact: true }), p.locator('#params-effort')])],
    ])
  }

  // 10 — tokens and cost under the reply; the title in the sidebar.
  {
    const [embaixo, titulo] = ep.at(10, 'embaixo', 'título')
    await scene(ep, browser, story, 10, openStory, [
      [embaixo, async (p) => {
        await replies(p).last().hover()
        await frameAt(p, replies(p).last().getByText(/entrada ·/))
      }],
      [titulo, async (p) => {
        await p.mouse.move(1000, 650)
        await frameAt(p, chatRow(p, 'O que é um storyboard'))
      }],
    ])
  }

  // 11 — Settings → Security: the password field.
  {
    const [configuracoes, seguranca, defina, chaves] = ep.at(11, 'configurações', 'segurança', 'defina', 'chaves')
    await scene(ep, browser, clean, 11, home, [
      [configuracoes, (p) => openSettings(p)],
      [seguranca, (p) => p.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: 'Segurança' }).click()],
      [defina, async (p) => {
        const field = p.getByLabel('Senha', { exact: true }).first()
        await frameAt(p, field)
        await typeIn(field, 'senha-do-estudio', 70)
      }],
      [chaves, card('Chaves criptografadas', 'a senha protege as chaves neste navegador')],
    ])
  }

  await mock.close()
  void clearCards
})
