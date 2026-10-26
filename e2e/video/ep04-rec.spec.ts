// Episode 4 of the video tutorial: files and the project folder. Run by hand:
//   SERIE_EP=4 npx playwright test e2e/video/ep04-rec.spec.ts --project video --workers 1
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { PAGE_CSS, PAGE_REPLY } from './pages'
import { composer, EN, Episode, frameAt, hideFrame, home, LIVED_IN, point, replies, scene, seed, SERIE, tr, typeIn } from './lib'

const ep = new Episode(4)

const PDF = join(SERIE, 'assets', 'briefing-cafe-aurora.pdf')
const SUMMARY =
  '1. **Cliente:** Café Aurora, cafeteria de bairro em São Paulo.\n' +
  '2. **Peça:** anúncio de 15 segundos, vertical, para Reels e Shorts.\n' +
  '3. **Público:** adultos de 25 a 45 anos que trabalham perto da loja.\n' +
  '4. **Tom:** acolhedor, manhã tranquila; cores creme, café e laranja.\n' +
  '5. **Mensagem e prazo:** "O primeiro gole do seu dia", entrega na sexta.'

const ORANGE = PAGE_CSS.replace('h1 { font-size: 56px; color: #c9a35a;', 'h1 { font-size: 56px; color: #e8772e;')

const SCRIPT: Scripted[] = [
  { when: /Resuma este documento/, text: SUMMARY, title: 'Resumo do briefing', wps: 30, usage: { input: 2400, output: 120 } },
  { when: /Crie a página inicial/, text: PAGE_REPLY, title: 'Página da NorthWind Lab', wps: 40, usage: { input: 2100, output: 900 } },
  {
    when: /Deixe o título laranja/,
    tools: [{ name: 'project_read_file', input: { file: 'estilo.css' } }],
    text: 'Li o `estilo.css` atual e mudei só a cor do título.\n\n```css estilo.css\n' + ORANGE + '\n```',
    wps: 30,
    usage: { input: 3200, output: 260 },
  },
]

test('records the screen of episode 4', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const state = join(ep.dir, 'screen', 'live.json')
  await seed(browser, state, { mockUrl: mock.url, chats: LIVED_IN.slice(0, 1).concat(LIVED_IN.slice(2)) })
  const fileInput = (p: Page) => p.locator('.composer input[type=file]')
  // A chat that already made the page, built before the clip starts.
  const withPage = async (p: Page) => {
    await home(p)
    await composer(p).fill(tr('Crie a página inicial da NorthWind Lab em index.html e estilo.css'))
    await composer(p).press('Enter')
    await expect(replies(p).last()).toContainText(tr('NOTAS.md'), { timeout: 30_000 })
    await expect(folderButton(p)).toHaveAttribute('title', EN ? /^Project folder: (?!not made yet)/ : /^Pasta do projeto: (?!ainda não criada)/, { timeout: 15_000 })
    await p.mouse.move(1000, 600)
  }
  const folderButton = (p: Page) => p.locator(EN ? '[title^="Project folder"]' : '[title^="Pasta do projeto"]').first()

  // 2 — Attach, or drop on the message box: the PDF becomes a chip.
  {
    const [anexar, arraste] = ep.at(2, 'anexar', 'arraste')
    await scene(ep, browser, state, 2, home, [
      [anexar - 0.3, (p) => frameAt(p, p.getByRole('button', { name: 'Anexar' }))],
      [arraste, async (p) => {
        await frameAt(p, p.locator('.composer'))
        await fileInput(p).setInputFiles(PDF)
      }],
    ])
  }

  // 4 — Summarise the PDF in five points.
  {
    await scene(ep, browser, state, 4, async (p) => {
      await home(p)
      await fileInput(p).setInputFiles(PDF)
      await p.waitForTimeout(500)
    }, [
      [0.05, async (p) => {
        await typeIn(composer(p), 'Resuma este documento em cinco pontos', 14)
        await composer(p).press('Enter')
      }],
    ])
  }

  // 5 — The model writes the page: the files go to a real folder.
  {
    const [cria, grava] = ep.at(5, 'cria', 'grava')
    await scene(ep, browser, state, 5, home, [
      [0.2, (p) => typeIn(composer(p), 'Crie a página inicial da NorthWind Lab em index.html e estilo.css', 22)],
      [cria + 0.2, (p) => composer(p).press('Enter')],
      [grava + 0.6, (p) => frameAt(p, folderButton(p))],
    ])
  }

  // 6 — The folder button: the path, copy it, use another folder.
  {
    const [botao, caminho, copiar, mudar] = ep.at(6, 'botão', 'caminho', 'copiar', 'mudar')
    await scene(ep, browser, state, 6, withPage, [
      [botao - 0.2, async (p) => { await frameAt(p, folderButton(p)); await point(p, folderButton(p)); await hideFrame(p) }],
      [caminho, (p) => frameAt(p, p.getByText('Pasta do projeto', { exact: true }).locator('..'))],
      [copiar, (p) => frameAt(p, p.getByRole('button', { name: 'Copiar o caminho' }))],
      [mudar, (p) => frameAt(p, p.getByText('Usar outra pasta').locator('..'))],
    ])
  }

  // 8 — "Make the title orange": the model reads the file before changing it.
  {
    const [continuar, antes] = ep.at(8, 'continuar', 'antes')
    await scene(ep, browser, state, 8, withPage, [
      [continuar - 1, (p) => typeIn(composer(p), 'Deixe o título laranja', 40)],
      [antes - 0.4, (p) => composer(p).press('Enter')],
      [antes + 1.6, (p) => frameAt(p, replies(p).last().locator('.tool, [data-tool], details').first())],
    ])
  }

  await mock.close()
})
