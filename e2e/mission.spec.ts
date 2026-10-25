import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const FAKE_CLAUDE = join(process.cwd(), 'e2e', 'fixtures', 'fake-claude.mjs')

test('shows the day at a glance and keeps a list of what to do today', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.locator('[data-provider=claude-code]').getByLabel('Comando').fill(FAKE_CLAUDE)
  await page.getByTitle('Fechar').click()

  await page.getByRole('navigation', { name: 'Estúdio' }).getByRole('button', { name: 'Painel do dia' }).click()
  await expect(page.getByRole('heading', { name: /^(Bom dia|Boa tarde|Boa noite)\.$/ })).toBeVisible()
  await expect(page.getByText('Respostas hoje')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Agentes de linha de comando' })).toContainText('Claude Code (CLI)9.9.9 (Claude Code)')
  await expect(page.getByRole('region', { name: 'Produção' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Agenda de hoje' })).toBeVisible()

  const focus = page.getByRole('region', { name: 'Foco de hoje' })
  await focus.getByLabel('Adicionar ao foco de hoje').fill('Gravar o Milo #4')
  await focus.getByLabel('Adicionar ao foco de hoje').press('Enter')
  await focus.getByLabel('Adicionar ao foco de hoje').fill('Revisar o AD do relógio')
  await focus.getByLabel('Adicionar ao foco de hoje').press('Enter')
  await focus.getByRole('checkbox', { name: 'Gravar o Milo #4' }).click()
  await expect(focus.getByRole('checkbox', { name: 'Gravar o Milo #4' })).toHaveAttribute('aria-checked', 'true')

  // The list is kept with the settings, and the board opens from the page.
  await page.reload()
  await page.getByRole('navigation', { name: 'Estúdio' }).getByRole('button', { name: 'Painel do dia' }).click()
  await expect(focus.getByRole('checkbox', { name: 'Gravar o Milo #4' })).toHaveAttribute('aria-checked', 'true')
  await expect(focus.getByRole('checkbox', { name: 'Revisar o AD do relógio' })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('button', { name: 'Abrir o quadro' }).click()
  await expect(page.getByRole('heading', { name: 'Quadro de produção' })).toBeVisible()
})
