// Episode 13 of the video tutorial: costs, security, backup and Obsidian. Run by hand:
//   SERIE_EP=13 npx playwright test e2e/video/ep13-rec.spec.ts --project video --workers 1
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, type Page } from '@playwright/test'
import { card, chatRow, Episode, frameAt, hideFrame, home, LIVED_IN, openSettings, point, replies, scene, seed, typeIn, type SeedChat } from './lib'

const ep = new Episode(13)

const VAULT = '/home/claude/serie/assets/Cofre NorthWind'

// Two weeks of work, so the usage chart has days to show.
const HISTORY: SeedChat[] = Array.from({ length: 14 }, (_, i) => ({
  title: ['Roteiro do Milo #' + (i + 1), 'Legendas do Seu Silva', 'Ideias de anúncio', 'Revisão de texto'][i % 4],
  ask: 'Trabalho do dia',
  answer: 'Feito.',
  usage: { input: 3000 + ((i * 1700) % 9000), output: 400 + ((i * 230) % 1500), cost: Number((0.02 + ((i * 37) % 90) / 1000).toFixed(4)) },
  hoursAgo: 20 + i * 22,
}))

test('records the screen of episode 13', async ({ browser }) => {
  test.setTimeout(15 * 60_000)
  mkdirSync(VAULT, { recursive: true })
  const dir = join(ep.dir, 'screen')
  const state = join(dir, 'clean.json')
  await seed(browser, state, { chats: [...LIVED_IN, ...HISTORY], demoKey: true })
  const section = (p: Page, name: string) => p.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name })

  // 2 — The cost under each reply and in the top bar; then Usage over 7, 30 or 90 days.
  {
    const [tokens, barra, uso, dias] = ep.at(2, 'tokens', 'barra', 'uso', 'dias')
    await scene(ep, browser, state, 2, async (p) => {
      await home(p)
      await chatRow(p, 'Roteiro do Seu Silva #13').click()
      await replies(p).first().waitFor()
      await p.mouse.move(1000, 600)
    }, [
      [tokens - 0.3, async (p) => { await replies(p).last().hover(); await frameAt(p, replies(p).last().getByText(/entrada ·/)) }],
      [barra, (p) => frameAt(p, p.locator('.toolbar .usage'))],
      [uso - 0.3, async (p) => {
        await hideFrame(p)
        await point(p, p.getByRole('button', { name: 'Uso', exact: true }).first())
      }],
      [dias - 0.6, async (p) => {
        const period = p.getByLabel('Período')
        await frameAt(p, period)
        await period.selectOption({ index: 1 }).catch(() => {})
      }],
    ])
  }

  // 4 — Security: a password, and Lock now.
  {
    const [seguranca, senha, bloquear] = ep.at(4, 'segurança', 'senha', 'bloquear')
    await scene(ep, browser, state, 4, home, [
      [seguranca - 0.3, (p) => openSettings(p, 'Segurança')],
      [senha, async (p) => {
        const f = p.getByLabel('Senha', { exact: true }).first()
        await frameAt(p, f)
        await typeIn(f, 'senha-do-estudio', 50)
        const again = p.getByLabel(/Repita|Confirme/).first()
        if (await again.count()) await typeIn(again, 'senha-do-estudio', 30)
        await p.getByRole('button', { name: 'Proteger' }).click().catch(() => {})
      }],
      [bloquear - 0.2, (p) => frameAt(p, p.getByRole('button', { name: 'Bloquear agora' }))],
    ])
  }

  // 5 — Profiles: personal and work, each with its own keys, chats and backup.
  {
    const [perfil, chaves] = ep.at(5, 'perfil', 'chaves')
    await scene(ep, browser, state, 5, async (p) => { await home(p); await openSettings(p) }, [
      [perfil - 0.6, async (p) => { await section(p, 'Perfis').click(); await frameAt(p, p.getByRole('dialog').locator('h3, .text-sm.font-medium').first()) }],
      [chaves, card('Cada perfil tem', 'as próprias chaves, conversas e backup')],
    ])
  }

  // 7 — Sync through a folder (Dropbox, Drive, OneDrive) or a server; keys never go.
  {
    const [sincronize, servidor, nunca] = ep.at(7, 'sincronize', 'servidor', 'nunca')
    await scene(ep, browser, state, 7, async (p) => { await home(p); await openSettings(p) }, [
      [sincronize - 0.3, async (p) => { await section(p, 'Sincronização').click(); await frameAt(p, p.getByRole('button', { name: 'Escolher pasta' })) }],
      [servidor, (p) => frameAt(p, p.getByText('WebDAV', { exact: true }).first())],
      [nunca - 0.3, card('As chaves nunca vão junto', 'cada computador guarda as suas')],
    ])
  }

  // 8 — Obsidian: the vault folder; then Save to Obsidian in a chat's menu.
  {
    const [cofre, conversa, menu] = ep.at(8, 'cofre', 'conversa', 'menu')
    await scene(ep, browser, state, 8, async (p) => {
      await home(p)
      await openSettings(p, 'Geral')
      await p.locator('#obsidian-vault').scrollIntoViewIfNeeded()
    }, [
      [cofre - 0.4, async (p) => { await frameAt(p, p.locator('#obsidian-vault')); await typeIn(p.locator('#obsidian-vault'), 'C:\\Users\\eddie\\Documents\\Cofre NorthWind', 25) }],
      [conversa, (p) => frameAt(p, p.getByLabel('Atualizar a nota a cada resposta').locator('..'))],
      [menu - 0.4, async (p) => {
        await hideFrame(p)
        await p.getByTitle('Fechar').click()
        const row = chatRow(p, 'Roteiro do Seu Silva #13')
        await row.hover()
        await point(p, row.getByTitle('Opções'))
        await p.waitForTimeout(400)
        await frameAt(p, p.getByRole('menuitem', { name: 'Salvar no Obsidian' }))
      }],
    ])
  }
})
