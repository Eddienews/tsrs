import { expect, test, type Page } from '@playwright/test'
import { startMockProvider, type MockProvider } from './mock-provider'

let provider: MockProvider

test.beforeEach(async () => {
  provider = await startMockProvider()
})

test.afterEach(async () => {
  await provider.close()
})

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

test('seats agents at a table, runs a task in their roles and keeps it as a conversation', async ({ page }) => {
  await connect(page)
  await page.getByRole('navigation', { name: 'Estúdio' }).getByRole('button', { name: 'Mesa de agentes' }).click()
  await page.getByRole('button', { name: 'Criar mesa' }).click()

  await page.getByLabel('Nome da mesa').fill('Sala de roteiro')
  await page.getByLabel('Adicionar agente', { exact: true }).selectOption({ label: 'Revisor de texto' })
  await page.getByLabel('Papel de Revisor de texto').fill('revisa o texto')
  await page.getByLabel('Adicionar agente', { exact: true }).selectOption({ label: 'Tradutor' })
  await page.getByLabel('Papel de Tradutor').fill('traduz para o inglês')
  await page.getByLabel('Coordenador').selectOption({ label: 'Programador' })
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByLabel('Quem está na mesa')).toContainText('Revisor de texto · revisa o texto')
  await expect(page.getByLabel('Quem está na mesa')).toContainText('Coordenação: Programador')
  await page.getByLabel('Tarefa').fill('Escreva a sinopse do episódio')
  await page.getByRole('button', { name: 'Começar' }).click()

  const turns = page.locator('.table-turn')
  await expect(turns).toHaveCount(3)
  await expect(turns.nth(2)).toContainText('Programador')
  await expect(turns.nth(2)).toContainText('resultado')
  await expect(page.getByRole('button', { name: 'Salvar como conversa' })).toBeVisible()
  expect(provider.chats).toHaveLength(3)
  // Each member is told its role and reads the ones before it; the coordinator reads them all.
  const said = (i: number) => JSON.stringify(provider.chats[i].body.messages)
  expect(said(0)).toContain('Your role here: revisa o texto.')
  expect(said(1)).toContain('Revisor de texto (revisa o texto), round 1')
  expect(said(2)).toContain('You coordinate a table of agents')
  expect(said(2)).toContain('Tradutor (traduz para o inglês), round 1')

  await page.getByRole('button', { name: 'Salvar como conversa' }).click()
  await expect(page.locator('.chat-item', { hasText: 'Sala de roteiro: Escreva a sinopse' })).toBeVisible()
  await expect(page.locator('.message.user')).toContainText('Escreva a sinopse do episódio')
  await expect(page.locator('.message.assistant')).toContainText('O trabalho da mesa')
})
