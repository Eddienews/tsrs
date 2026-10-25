// Episode 11 of the video tutorial: Claude Code and Codex inside TSRS. Run by hand,
// with the TSRS server started with e2e/video/bin first on PATH (stand-in
// `claude` and `codex` commands that answer like the real ones):
//   SERIE_EP=11 npx playwright test e2e/video/ep11-rec.spec.ts --project video --workers 1
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startVideoMock, type Scripted } from './mock-anthropic'
import { PAGE_REPLY } from './pages'
import { card, composer, Episode, frameAt, hideFrame, home, LIVED_IN, openSettings, point, replies, scene, seed, typeIn } from './lib'

const ep = new Episode(11)

const SCRIPT: Scripted[] = [{ when: /Crie a página inicial/, text: PAGE_REPLY, title: 'Página da NorthWind Lab', wps: 200 }]
const ASK = 'Revise o index.html, deixe acessível e explique o que mudou'
const NEXT = 'Agora faça o mesmo no rodapé'

test('records the screen of episode 11', async ({ browser }) => {
  test.setTimeout(20 * 60_000)
  const mock = await startVideoMock(SCRIPT)
  const dir = join(ep.dir, 'screen')
  const clean = join(dir, 'clean.json')
  const live = join(dir, 'live.json')
  await seed(browser, clean, { chats: LIVED_IN, demoKey: true })
  await seed(browser, live, { mockUrl: mock.url, chats: LIVED_IN.slice(0, 1).concat(LIVED_IN.slice(2)) })
  const section = (p: Page) => p.locator('[data-provider=claude-code]')
  const picker = (p: Page) => p.getByRole('button', { name: 'Escolher modelo' })
  // The page chat, made with Claude through the API, then switched to Claude Code.
  const pageChat = async (p: Page) => {
    await home(p)
    await composer(p).fill('Crie a página inicial da NorthWind Lab em index.html e estilo.css')
    await composer(p).press('Enter')
    await expect(replies(p).last()).toContainText('NOTAS.md', { timeout: 30_000 })
    await expect(p.locator('.toolbar .project')).toHaveAttribute('title', /^Pasta do projeto: (?!ainda não criada)/, { timeout: 15_000 })
    await picker(p).click()
    await p.getByRole('option', { name: 'opus', exact: true }).click()
    await p.mouse.move(1000, 600)
  }
  const ask = async (p: Page, text: string) => {
    await composer(p).fill(text)
    await composer(p).press('Enter')
    await expect(p.getByRole('button', { name: 'Enviar' })).toBeVisible({ timeout: 60_000 })
  }

  // 3 — Settings → Providers → Claude Code: the command, and Verify.
  {
    const [configuracoes, claude, comando, verificar] = ep.at(3, 'configurações', 'claude', 'comando', 'verificar')
    await scene(ep, browser, clean, 3, home, [
      [configuracoes, (p) => openSettings(p, 'Provedores')],
      [claude - 0.2, async (p) => {
        await section(p).scrollIntoViewIfNeeded()
        await frameAt(p, section(p).locator('span').first())
      }],
      [comando, (p) => frameAt(p, section(p).getByLabel('Comando'))],
      [verificar - 0.2, async (p) => {
        const b = section(p).getByRole('button', { name: 'Verificar' })
        await frameAt(p, b)
        await point(p, b)
        await p.waitForTimeout(900)
        await frameAt(p, section(p).getByRole('status'))
      }],
    ])
  }

  // 4 — What the agent may do: read only, edit files, full access (and its warning).
  {
    const [ler, editar, total, confia] = ep.at(4, 'ler', 'editar', 'total', 'confia')
    const option = (p: Page, name: string) => section(p).getByRole('radio', { name })
    await scene(ep, browser, clean, 4, async (p) => {
      await home(p)
      await openSettings(p, 'Provedores')
      await section(p).getByText('O que o agente pode fazer').scrollIntoViewIfNeeded()
    }, [
      [ler, async (p) => { await frameAt(p, option(p, 'Só ler').locator('..')); await option(p, 'Só ler').click() }],
      [editar, async (p) => { await frameAt(p, option(p, 'Editar arquivos').locator('..')); await option(p, 'Editar arquivos').click() }],
      [total, async (p) => { await frameAt(p, option(p, 'Acesso total').locator('..')); await option(p, 'Acesso total').click() }],
      [confia - 1.5, (p) => frameAt(p, section(p).getByText(/Use só em pastas e projetos em que você confia/))],
      [ep.length(4) - 0.8, (p) => option(p, 'Editar arquivos').click()],
    ])
  }

  // 5 — The model picker: opus, sonnet or haiku; Codex's default.
  {
    const [seletor, opus, codex] = ep.at(5, 'seletor', 'opus', 'codex')
    await scene(ep, browser, clean, 5, home, [
      [seletor - 0.3, async (p) => { await frameAt(p, picker(p)); await point(p, picker(p)); await hideFrame(p) }],
      [opus - 0.5, async (p) => {
        await typeIn(p.getByPlaceholder('Buscar ou digitar um modelo…'), 'opus', 90)
        await frameAt(p, p.getByRole('option', { name: 'opus', exact: true }))
      }],
      [codex, async (p) => {
        await p.getByPlaceholder('Buscar ou digitar um modelo…').fill('default')
        await p.waitForTimeout(300)
        await frameAt(p, p.getByRole('option', { name: 'default', exact: true }))
      }],
    ])
  }

  // 6 and 7 — The request; the agent's tools in the reply; tokens without a price. One take.
  {
    const [pecas] = ep.at(6, 'peça')
    const [comandos, tokens, plano] = ep.at(7, 'comandos', 'tokens', 'plano')
    const six = ep.length(6)
    await scene(ep, browser, live, 6, pageChat, [
      [pecas, async (p) => {
        await typeIn(composer(p), ASK, 32)
        await composer(p).press('Enter')
      }],
      [six + comandos, (p) => frameAt(p, replies(p).last().locator('.tool').first())],
      [six + tokens, async (p) => {
        await expect(p.getByRole('button', { name: 'Enviar' })).toBeVisible({ timeout: 4000 }).catch(() => {})
        await replies(p).last().hover()
        await frameAt(p, replies(p).last().getByText(/entrada/).last())
      }],
      [six + plano, card('Sem preço', 'quem paga é o plano do agente')],
    ], six + ep.length(7))
    // The take is cut in two in the edit: scene 7 starts where scene 6 ends.
    const take = ep.clips.find((c) => c.cena === 6)
    if (take) {
      ep.clips = [
        ...ep.clips.filter((c) => c.cena !== 6 && c.cena !== 7),
        { ...take, length: six },
        { ...take, cena: 7, offset: take.offset + six, length: ep.length(7) },
      ].sort((a, b) => a.cena - b.cena)
      ep.save()
    }
  }

  // 8 — The next message continues the same session.
  {
    const [proxima] = ep.at(8, 'próxima')
    await scene(ep, browser, live, 8, async (p) => {
      await pageChat(p)
      await ask(p, ASK)
    }, [
      [proxima, async (p) => {
        await typeIn(composer(p), NEXT, 30)
        await composer(p).press('Enter')
      }],
      [ep.seconds(8) - 0.6, (p) => frameAt(p, replies(p).last())],
    ])
  }

  await mock.close()
})
