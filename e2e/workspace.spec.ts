import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startMockProvider, type MockProvider } from './mock-provider'

let provider: MockProvider

test.beforeEach(async () => {
  provider = await startMockProvider()
})

test.afterEach(async () => {
  await provider.close()
})

const settingsSection = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name }).click()

async function connect(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  const section = page.locator('[data-provider=custom]')
  await section.getByLabel('URL base').fill(provider.url)
  await section.getByRole('button', { name: 'Carregar modelos' }).click()
  await expect(section.getByText('2 modelos carregados.')).toBeVisible()
  await page.getByTitle('Fechar').click()
  await page.getByRole('button', { name: 'Escolher modelo' }).click()
  await page.getByRole('option', { name: /mock-a/ }).click()
}

test('hides the sidebar sections not in use and opens on Mission Control', async ({ page }) => {
  await page.goto('/')
  const studio = page.getByRole('navigation', { name: 'Estúdio' })
  await expect(studio.getByRole('button', { name: 'Mesa de agentes' })).toBeVisible()
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await settingsSection(page, 'Aparência')
  await page.getByRole('switch', { name: 'Mostrar Mesa de agentes' }).click()
  await page.getByRole('switch', { name: 'Mostrar Uso' }).click()
  await page.getByRole('switch', { name: 'Abrir o TSRS no Painel do dia' }).click()
  await page.getByTitle('Fechar').click()
  await expect(studio.getByRole('button', { name: 'Mesa de agentes' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Uso', exact: true })).toHaveCount(0)
  await expect(studio.getByRole('button', { name: 'Quadro de produção' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Painel do dia' })).toBeVisible()
  await expect(studio.getByRole('button', { name: 'Painel do dia' })).toHaveAttribute('aria-current', 'page')
})

test('keeps conversations as notes in the Obsidian vault, updated with every reply', async ({ page }) => {
  const vault = await mkdtemp(join(tmpdir(), 'tsrs-cofre-'))
  await connect(page)
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await settingsSection(page, 'Geral')
  await page.getByLabel('Pasta do cofre').fill(vault)
  await page.getByLabel('Pasta das notas, dentro do cofre').fill('IA/TSRS')
  await page.getByRole('switch', { name: 'Atualizar a nota a cada resposta' }).click()
  await page.getByTitle('Fechar').click()

  const composer = page.getByPlaceholder(/Escreva sua mensagem/)
  await composer.fill('Olá, quem é você?')
  await composer.press('Enter')
  await expect(page.locator('.message.assistant')).toContainText('Resposta 1.')
  // The first note waits for the conversation's title, and keeps that name.
  const note = join(vault, 'IA', 'TSRS', 'Saudação inicial.md')
  await expect.poll(() => readFile(note, 'utf8').catch(() => '')).toContain('Resposta 1.')
  const first = await readFile(note, 'utf8')
  expect(first).toMatch(/^---\ntsrs: ".+"\ncreated: .+\nupdated: .+\nmodel: "mock-a"\ntags: \["tsrs"\]\n---\n\n# Saudação inicial/)

  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible()
  await composer.fill('E agora?')
  await composer.press('Enter')
  await expect(page.locator('.message.assistant').nth(1)).toContainText('Resposta 2.')
  await expect.poll(() => readFile(note, 'utf8')).toContain('Resposta 2.')

  // Saved by hand from the conversation's menu too.
  await page.locator('.chat-item', { hasText: 'Saudação inicial' }).getByTitle('Opções').click()
  await expect(page.getByRole('menuitem', { name: 'Salvar no Obsidian' })).toBeVisible()
})

test('starts a hands-free voice conversation from the composer and leaves it', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  const openai = page.locator('[data-provider=openai]')
  await openai.getByLabel('URL base').fill(provider.url)
  await openai.getByLabel(/Chave de API/).fill('sk-audio')
  await page.getByTitle('Fechar').click()

  await page.getByRole('button', { name: 'Conversa por voz', exact: true }).click()
  // The microphone opens by itself, and closes when the voice mode ends.
  await expect(page.getByRole('button', { name: 'Parar o ditado' })).toBeVisible()
  await page.getByRole('button', { name: 'Sair da conversa por voz' }).click()
  await expect(page.getByRole('button', { name: 'Conversa por voz', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Ditar' })).toBeVisible()
})
