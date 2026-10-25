import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// Claude Code answering in a conversation, through a stand-in command line
// (fixtures/fake-claude.mjs) started by the TSRS server.
const FAKE_CLAUDE = join(process.cwd(), 'e2e', 'fixtures', 'fake-claude.mjs')

const composer = (page: import('@playwright/test').Page) => page.getByPlaceholder(/Escreva sua mensagem/)
const reply = (page: import('@playwright/test').Page) => page.locator('.message.assistant')

test('answers with Claude Code from the command line, showing its tools, in the project folder', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  const section = page.locator('[data-provider=claude-code]')
  await section.getByLabel('Comando').fill(FAKE_CLAUDE)
  await section.getByRole('button', { name: 'Verificar' }).click()
  await expect(section.getByRole('status')).toHaveText('Encontrado: 9.9.9 (Claude Code)')
  await section.getByRole('radio', { name: 'Só ler' }).click()
  await page.getByTitle('Fechar').click()

  await page.getByRole('button', { name: 'Escolher modelo' }).click()
  await page.getByRole('option', { name: 'opus', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Escolher modelo' })).toContainText('opus')

  await composer(page).fill('Liste a pasta')
  await composer(page).press('Enter')
  await expect(reply(page)).toContainText('eco: Liste a pasta')
  // The agent's own tool call, with its result, and its reasoning.
  await expect(reply(page).getByText('Bash')).toBeVisible()
  await reply(page).getByRole('button', { name: 'Raciocínio' }).click()
  await expect(reply(page)).toContainText('Vou listar a pasta.')
  // Tokens are shown, but no price: the agent's own plan pays for it.
  await reply(page).hover()
  await expect(reply(page)).toContainText('115 entrada (100 do cache) · 7 saída')
  await expect(reply(page)).not.toContainText('US$')

  // The second message continues the same session: only the new text goes.
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible()
  await composer(page).fill('E o resto?')
  await composer(page).press('Enter')
  await expect(reply(page).nth(1)).toContainText('eco: E o resto?')

  // It worked in the conversation's project folder, read-only, and got the
  // whole message the first time and only the new one after.
  const button = page.locator('.toolbar .project')
  await expect(button).toHaveAttribute('title', /^Pasta do projeto: (?!ainda não criada)/)
  const folder = (await button.getAttribute('title'))!.replace(/^Pasta do projeto: /, '')
  expect(folder).toContain('tsrs-e2e-projects')
  const runs = (await readFile(join(folder, 'agente.log'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l))
  expect(runs).toHaveLength(2)
  expect(runs[0].args).toEqual(expect.arrayContaining(['--permission-mode', 'plan', '--model', 'opus']))
  expect(runs[0].stdin).toContain('Liste a pasta')
  expect(runs[0].stdin).toContain('<instructions>')
  expect(runs[1].args).toContain('--resume')
  expect(runs[1].stdin).toBe('E o resto?')

  // Usage window reported by the agent shows in its check.
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await section.getByRole('button', { name: 'Verificar' }).click()
  await expect(section.getByRole('status')).toHaveText('Encontrado: 9.9.9 (Claude Code) · 42% do limite de uso')
})

test('says why a coding agent failed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.locator('[data-provider=claude-code]').getByLabel('Comando').fill(FAKE_CLAUDE)
  await page.getByTitle('Fechar').click()
  await page.getByRole('button', { name: 'Escolher modelo' }).click()
  await page.getByRole('option', { name: 'opus', exact: true }).click()
  await composer(page).fill('fail')
  await composer(page).press('Enter')
  await expect(reply(page)).toContainText('Claude Code (CLI): Something went wrong in the agent.')
})
