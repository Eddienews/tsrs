import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// The board file of the e2e server (TSRS_PROJECTS in playwright.config.ts).
const BOARD_FILE = join(tmpdir(), 'tsrs-e2e-projects', '_producao', 'quadro.json')

test('plans work on the production board, moves it along and keeps it on disk', async ({ page }) => {
  const title = `Milo #${Date.now()}`
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Estúdio' }).getByRole('button', { name: 'Quadro de produção' }).click()
  await expect(page.getByRole('heading', { name: 'Quadro de produção' })).toBeVisible()

  await page.getByRole('button', { name: 'Novo card' }).click()
  await page.getByRole('dialog').getByLabel('Título').fill(title)
  await page.getByRole('dialog').getByLabel('Série ou cliente').fill('Milo')
  await page.getByRole('dialog').getByLabel('Idioma ou versão').fill('PT')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()

  const card = page.locator(`[data-card="${title}"]`)
  await expect(page.getByRole('region', { name: 'Roteiro' }).locator(card)).toBeVisible()
  await expect(card).toContainText('Episódio')
  await expect(card).toContainText('Milo')

  // Moved without dragging, to the next stage.
  await card.getByRole('button', { name: 'Mover para a próxima coluna' }).click()
  await expect(page.getByRole('region', { name: 'Takes' }).locator(card)).toBeVisible()
  await expect.poll(async () => {
    const saved = JSON.parse(await readFile(BOARD_FILE, 'utf8').catch(() => '{"cards":[]}'))
    return saved.cards.find((c: { title: string }) => c.title === title)?.column
  }).toBe('takes')

  // Dragged to the review column.
  await card.dragTo(page.getByRole('region', { name: 'Revisão' }), { sourcePosition: { x: 30, y: 14 } })
  await expect(page.getByRole('region', { name: 'Revisão' }).locator(card)).toBeVisible()

  // The board is still there after a reload, and a removed card can come back.
  await page.reload()
  await page.getByRole('navigation', { name: 'Estúdio' }).getByRole('button', { name: 'Quadro de produção' }).click()
  await expect(page.getByRole('region', { name: 'Revisão' }).locator(card)).toBeVisible()
  await card.getByRole('button', { name: title }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remover card' }).click()
  await expect(card).toHaveCount(0)
  await page.getByText(/Cards removidos/).click()
  await page.locator('li', { hasText: title }).getByRole('button', { name: 'Trazer de volta' }).click()
  await expect(page.getByRole('region', { name: 'Revisão' }).locator(card)).toBeVisible()
})
