import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { startMockMcp } from './mock-mcp'
import { startMockProvider, type MockProvider } from './mock-provider'

let provider: MockProvider

test.beforeEach(async () => {
  provider = await startMockProvider()
})

test.afterEach(async () => {
  await provider.close()
})

const composer = (page: Page) => page.getByPlaceholder(/Escreva sua mensagem/)
const reply = (page: Page) => page.locator('.message.assistant')
const chatRow = (page: Page, title: string) => page.locator('.chat-item', { hasText: title })

const modelPicker = (page: Page) => page.getByRole('button', { name: 'Escolher modelo' })
const toolsButton = (page: Page) => page.locator('.toolbar').getByRole('button', { name: 'Ferramentas' })

// Opens the settings, on the given section when it is not the first one.
async function openSettings(page: Page, section?: string) {
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  if (section) await settingsSection(page, section)
}

async function settingsSection(page: Page, section: string) {
  await page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: section }).click()
}

async function closeSettings(page: Page) {
  await page.getByTitle('Fechar').click()
}

// Points the app at the mock provider through the real settings UI.
async function connect(page: Page, apiKey = '') {
  await page.goto('/')
  await openSettings(page)
  const section = page.locator('[data-provider=custom]')
  await section.getByLabel('URL base').fill(provider.url)
  if (apiKey) await section.getByLabel(/Chave de API/).fill(apiKey)
  await section.getByRole('button', { name: 'Carregar modelos' }).click()
  await expect(section.getByText('2 modelos carregados.')).toBeVisible()
  await closeSettings(page)
  await modelPicker(page).click()
  await page.getByRole('option', { name: /mock-a/ }).click()
  await expect(modelPicker(page)).toContainText('mock-a')
}

async function send(page: Page, text: string) {
  await composer(page).fill(text)
  await composer(page).press('Enter')
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible()
}

async function chatMenu(page: Page, title: string, item: string | RegExp) {
  await chatRow(page, title).getByTitle('Opções').click()
  await page.getByRole('menuitem', { name: item }).click()
}

test('streams a reply, titles the chat and reports usage', async ({ page }) => {
  await connect(page)
  await send(page, 'Olá, quem é você?')

  await expect(reply(page)).toContainText('Resposta 1. Sou um mock.')
  await expect(reply(page).locator('pre .hljs-keyword')).toHaveText('const')
  await expect(chatRow(page, 'Saudação inicial')).toBeVisible()
  await reply(page).hover()
  await expect(reply(page)).toContainText('850 entrada · 50 saída')
  await expect(page.locator('.toolbar .usage')).toContainText('900 tokens')
  // 900 of the model's 1000-token context.
  await expect(page.getByText('já ocupa 90% do contexto')).toBeVisible()
})

test('regenerates a reply and resends an edited message', async ({ page }) => {
  await connect(page)
  await send(page, 'primeira')

  await reply(page).hover()
  await page.getByRole('button', { name: 'Regenerar' }).click()
  await expect(reply(page)).toContainText('Resposta 2.')
  await expect(page.locator('.message')).toHaveCount(2)

  await page.locator('.message.user').hover()
  await page.getByRole('button', { name: 'Editar' }).click()
  await page.locator('.message.editing textarea').fill('editada')
  await page.getByRole('button', { name: 'Salvar e reenviar' }).click()
  await expect(reply(page)).toContainText('Resposta 3.')
  await expect(page.locator('.message')).toHaveCount(2)
  expect(provider.chats.at(-1)!.body.messages).toEqual([
    { role: 'system', content: expect.stringContaining('"Abrir preview" button') },
    { role: 'user', content: 'editada' },
  ])
})

test('sends per-chat parameters and attachments', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Parâmetros' }).click()
  await page.getByLabel('Prompt de sistema desta conversa').fill('seja breve')
  await page.getByLabel('Temperatura').fill('0.3')
  await page.getByLabel('Máximo de tokens').fill('100')
  await page.getByLabel('Nível de raciocínio').selectOption('high')
  await page.getByTitle('Fechar').click()
  await page.locator('.composer input[type=file]').setInputFiles([
    { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) },
    { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('conteúdo da nota') },
  ])
  await expect(page.locator('.composer .chip')).toHaveCount(2)
  await send(page, 'veja os anexos')

  const { body } = provider.chats[0]
  expect(body).toMatchObject({ temperature: 0.3, max_tokens: 100, reasoning_effort: 'high' })
  expect(body.messages[0].role).toBe('system')
  expect(body.messages[0].content).toMatch(/^seja breve\n\nThe user is reading/)
  expect(body.messages[1].content).toEqual([
    { type: 'text', text: 'veja os anexos\n\n<file name="nota.txt">\nconteúdo da nota\n</file>' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw==' } },
  ])
  await expect(page.locator('.message.user img')).toBeVisible()
})

test('keeps earlier versions after an edit and a regeneration', async ({ page }) => {
  await connect(page)
  await send(page, 'primeira pergunta')
  await expect(reply(page)).toContainText('Resposta 1.')

  await reply(page).hover()
  await reply(page).getByRole('button', { name: 'Regenerar' }).click()
  await expect(reply(page)).toContainText('Resposta 2.')
  await expect(reply(page)).toContainText('2/2')
  await reply(page).getByTitle('Versão anterior').click()
  await expect(reply(page)).toContainText('Resposta 1.')
  await expect(reply(page)).toContainText('1/2')

  const question = page.locator('.message.user')
  await question.hover()
  await question.getByRole('button', { name: 'Editar' }).click()
  await page.locator('.message.editing textarea').fill('pergunta editada')
  await page.getByRole('button', { name: 'Salvar e reenviar' }).click()
  await expect(reply(page)).toContainText('Resposta 3.')
  await expect(question).toContainText('pergunta editada')

  // The original question comes back with both of its replies.
  await page.reload()
  await chatRow(page, 'Saudação inicial').click()
  await question.hover()
  await question.getByTitle('Versão anterior').click()
  await expect(question).toContainText('primeira pergunta')
  await expect(reply(page)).toContainText('Resposta 1.')
  await expect(reply(page)).toContainText('1/2')
})

test('compares a reply with another model side by side', async ({ page }) => {
  await connect(page)
  await send(page, 'qual é melhor?')
  await reply(page).hover()
  await reply(page).getByRole('button', { name: 'Comparar' }).click()
  const dialog = page.locator('.dialog.narrow')
  await dialog.getByPlaceholder('Modelo').fill('mock-b')
  await dialog.getByRole('button', { name: 'Gerar' }).click()

  const columns = page.locator('.versions > section')
  await expect(columns).toHaveCount(2)
  await expect(columns.nth(0)).toContainText('mock-a')
  await expect(columns.nth(0)).toContainText('Resposta 1.')
  await expect(columns.nth(1)).toContainText('mock-b')
  await expect(columns.nth(1)).toContainText('Resposta 2.')
  expect(provider.chats.map((c) => c.body.model)).toEqual(['mock-a', 'mock-b'])
  // The conversation keeps its own model.
  await expect(modelPicker(page)).toContainText('mock-a')

  await columns.nth(0).getByRole('button', { name: 'Usar esta' }).click()
  await expect(columns.nth(0)).toHaveClass(/\bcurrent\b/)
})

test('applies a persona and inserts a saved prompt', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('button', { name: 'Nova persona' }).click()
  await page.getByLabel('Nome').fill('Pirata')
  await page.getByLabel('Prompt de sistema').pressSequentially('Fale como um pirata.')
  await page.getByRole('tab', { name: 'Prompts salvos' }).click()
  await page.getByRole('button', { name: 'Novo prompt' }).click()
  await page.getByLabel('Título').fill('Resumo')
  await page.getByLabel('Texto').pressSequentially('Resuma em uma frase:')
  await page.getByTitle('Fechar').click()

  await page.getByTitle('Persona desta conversa').click()
  await page.getByRole('menuitemradio', { name: 'Pirata' }).click()
  await page.getByRole('button', { name: 'Prompts', exact: true }).click()
  await page.locator('.menu').getByRole('button', { name: 'Resumo' }).click()
  await expect(composer(page)).toHaveValue('Resuma em uma frase:')
  await composer(page).press('Enter')
  await expect(reply(page)).toContainText('Resposta 1.')

  const { messages } = provider.chats[0].body
  expect(messages[0].content).toMatch(/^Fale como um pirata\.\n\nThe user is reading/)
  expect(messages[1].content).toBe('Resuma em uma frase:')
  // The title arrives in a request after the reply; reloading earlier loses it.
  await expect(chatRow(page, 'Saudação inicial')).toBeVisible()
  await page.reload()
  await chatRow(page, 'Saudação inicial').click()
  await expect(page.getByTitle('Persona desta conversa')).toContainText('Pirata')
})

test('calls an MCP tool after the user allows it', async ({ page }) => {
  const mcp = await startMockMcp()
  await connect(page)
  await toolsButton(page).click()
  await page.getByRole('button', { name: 'Novo servidor' }).click()
  await page.getByLabel('Nome').pressSequentially('Eco')
  await page.getByLabel('URL').fill(mcp.url)
  await page.getByLabel('Token (opcional)').fill('segredo')
  await page.getByRole('button', { name: 'Testar conexão' }).click()
  await expect(page.getByText('1 ferramentas: echo')).toBeVisible()
  await page.getByTitle('Fechar').click()

  await composer(page).fill('use a ferramenta')
  await composer(page).press('Enter')
  const tool = reply(page).locator('.tool')
  await expect(tool).toContainText('Eco · echo')
  await expect(tool).toContainText('aguardando permissão')
  expect(mcp.calls).toEqual([])
  await tool.getByRole('button', { name: 'Permitir' }).click()
  await expect(reply(page)).toContainText('A ferramenta respondeu: eco: olá')
  await expect(tool).toContainText('concluída')
  expect(mcp.calls).toEqual(['olá'])
  expect(mcp.tokens.at(-1)).toBe('Bearer segredo')

  const [first, second] = provider.chats.map((c) => c.body)
  expect(first.tools[0].function.name).toBe('Eco__echo')
  expect(second.messages.at(-1)).toMatchObject({ role: 'tool', content: 'eco: olá' })

  // A later turn carries the earlier call, and a denied call is not run.
  await composer(page).fill('use a ferramenta de novo')
  await composer(page).press('Enter')
  await reply(page).last().getByRole('button', { name: 'Negar' }).click()
  await expect(reply(page).last()).toContainText('A ferramenta respondeu: The user declined')
  expect(mcp.calls).toEqual(['olá'])
  const roles = provider.chats[2].body.messages.map((m: { role: string }) => m.role)
  expect(roles).toEqual(['system', 'user', 'assistant', 'tool', 'assistant', 'user'])
  await mcp.close()
})

test('previews generated code in a sandboxed frame', async ({ page }) => {
  await connect(page)
  await send(page, 'crie uma página')
  await reply(page).getByRole('button', { name: 'Abrir preview' }).click()

  const panel = page.locator('.preview')
  await expect(panel.getByRole('tab', { name: 'preview-1.html' })).toBeVisible()
  const frame = panel.frameLocator('iframe')
  await expect(frame.getByRole('heading', { name: 'Olá do preview' })).toBeVisible()
  // The generated page runs without access to the app's storage, where the keys are.
  await expect(frame.locator('body')).toHaveAttribute('data-storage', 'blocked')
  await expect(panel.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts')

  await panel.getByRole('tab', { name: /Console/ }).click()
  await expect(panel).toContainText('log do preview {"n":1}')
  await expect(panel).toContainText('erro do preview')
  await panel.getByRole('tab', { name: 'Código' }).click()
  await expect(panel.locator('pre')).toContainText('<h1>Olá do preview</h1>')

  // Opening the same block again reuses its tab.
  await reply(page).getByRole('button', { name: 'Abrir preview' }).click()
  await expect(panel.getByRole('tab', { name: /^preview-/ })).toHaveCount(1)
  await panel.getByLabel('Endereço').fill('javascript:alert(1)')
  await page.keyboard.press('Enter')
  await expect(panel.getByLabel('Endereço')).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: 'Fechar o preview' }).click()
  await expect(panel).toHaveCount(0)

  // With nothing open, the toolbar button shows the conversation's latest block.
  await panel.page().reload()
  await chatRow(page, 'Saudação inicial').click()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(panel.frameLocator('iframe').getByRole('heading')).toHaveText('Olá do preview')
})

test('fills the fields of a saved prompt and switches the theme', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('tab', { name: 'Prompts salvos' }).click()
  await page.getByRole('button', { name: 'Novo prompt' }).click()
  await page.getByLabel('Título').fill('Traduzir')
  await page.getByLabel('Texto').pressSequentially('Traduza para {{idioma}}: {{texto}}')
  await page.getByTitle('Fechar').click()

  await page.getByRole('button', { name: 'Prompts', exact: true }).click()
  await page.locator('.menu').getByRole('button', { name: 'Traduzir' }).click()
  await page.locator('.menu').getByLabel('idioma').fill('inglês')
  await page.locator('.menu').getByRole('button', { name: 'Inserir prompt' }).click()
  await expect(composer(page)).toHaveValue('Traduza para inglês: {{texto}}')

  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.getByRole('button', { name: 'Alternar tema' }).click()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(!dark)
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(!dark)

  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Buscar conversas, modelos e ações…').fill('config')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible()
})

test('the note about the preview can be turned off', async ({ page }) => {
  await connect(page)
  await openSettings(page, 'Geral')
  await page.getByRole('switch', { name: 'Avisar o modelo sobre o preview' }).click()
  await closeSettings(page)
  await send(page, 'sem nota')
  expect(provider.chats[0].body.messages).toEqual([{ role: 'user', content: 'sem nota' }])
})

test('sums up usage per day and per model', async ({ page }) => {
  await connect(page)
  await send(page, 'primeira')
  await reply(page).hover()
  await page.getByRole('button', { name: 'Regenerar' }).click()
  await expect(reply(page)).toContainText('Resposta 2.')

  await page.getByRole('button', { name: 'Uso', exact: true }).click()
  const view = page.locator('.usage-view')
  // Both versions of the reply were paid for: 2 × (850 + 50).
  await expect(view).toContainText('1.800')
  await expect(view.locator('.by-model')).toContainText('mock-a')
  await expect(view.locator('.by-model')).toContainText('Custom')
  await expect(view).toContainText('2 respostas sem preço conhecido')
  await view.getByRole('radio', { name: '7 dias' }).click()
  await expect(view.getByRole('listitem')).toHaveCount(7)

  await page.getByRole('button', { name: 'Conversa', exact: true }).click()
  await expect(view).toHaveCount(0)
  await expect(composer(page)).toBeVisible()
})

test('explains a failure and retries', async ({ page }) => {
  await connect(page)
  provider.failNext(429, { 'retry-after': '7', 'Access-Control-Expose-Headers': 'retry-after' })
  await send(page, 'vai falhar')

  await expect(reply(page)).toContainText('Limite de uso atingido; tente de novo em 7 s')
  await reply(page).hover()
  await page.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(reply(page)).toContainText('Resposta 1.')
  await expect(reply(page).locator('.error')).toHaveCount(0)
})

test('organizes chats with folders, pins, rename and content search', async ({ page }) => {
  await connect(page)
  await send(page, 'conversa sobre abacaxi')
  await expect(chatRow(page, 'Saudação inicial')).toBeVisible()

  await chatMenu(page, 'Saudação inicial', 'Renomear')
  await page.getByLabel('Novo título da conversa:').fill('Frutas')
  await page.keyboard.press('Enter')
  await expect(chatRow(page, 'Frutas')).toBeVisible()

  await page.getByRole('button', { name: 'Nova pasta' }).click()
  await page.getByLabel('Nome da pasta:').fill('Trabalho')
  await page.keyboard.press('Enter')
  await chatMenu(page, 'Frutas', /Mover para/)
  await expect(page.locator('.sidebar [data-folder] .chat-item')).toHaveText(/Frutas/)

  await chatMenu(page, 'Frutas', 'Fixar')
  await expect(page.locator('.sidebar h4').first()).toHaveText('Fixadas')

  // After a reload no message is in memory, so this hits the stored threads.
  await page.reload()
  await page.getByPlaceholder('Buscar nas conversas…').fill('abacaxi')
  await expect(page.locator('.sidebar h4')).toHaveText('1 resultado')
  await page.getByPlaceholder('Buscar nas conversas…').fill('inexistente')
  await expect(page.locator('.sidebar h4')).toHaveText('0 resultados')
})

test('exports, deletes and restores a backup; chats survive a reload', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await connect(page, 'sk-secret')
  await send(page, 'guarde isto')
  await expect(chatRow(page, 'Saudação inicial')).toBeVisible()

  const markdown = page.waitForEvent('download')
  await chatMenu(page, 'Saudação inicial', 'Exportar Markdown')
  expect((await markdown).suggestedFilename()).toBe('Saudação-inicial.md')

  await openSettings(page, 'Dados')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar backup' }).click()
  const backupPath = await (await download).path()
  const backup = await readFile(backupPath, 'utf8')
  expect(JSON.parse(backup).chats).toHaveLength(1)
  expect(backup).not.toContain('sk-secret')
  await closeSettings(page)

  await chatMenu(page, 'Saudação inicial', 'Excluir')
  await expect(page.locator('.chat-item')).toHaveCount(0)

  await openSettings(page, 'Dados')
  await page.locator('.dialog input[type=file]').setInputFiles(backupPath)
  await expect(page.getByText('1 de 1 conversas importadas.')).toBeVisible()
  await closeSettings(page)

  await page.reload()
  await chatRow(page, 'Saudação inicial').click()
  await expect(page.locator('.message.user')).toHaveText(/guarde isto/)
  await expect(reply(page)).toContainText('Resposta 1.')
})

test('keeps API keys encrypted behind a password', async ({ page }) => {
  await connect(page, 'sk-secret')
  await toolsButton(page).click()
  await page.getByRole('button', { name: 'Novo servidor' }).click()
  await page.getByLabel('Token (opcional)').fill('tok-mcp')
  await page.getByTitle('Fechar').click()
  await openSettings(page, 'Segurança')
  await page.getByPlaceholder('Senha', { exact: true }).fill('correta')
  await page.getByPlaceholder('Repita a senha').fill('correta')
  await page.getByRole('button', { name: 'Proteger' }).click()
  await expect(page.getByText('protegidas por senha e desbloqueadas')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('tsrs:settings')))
    .not.toMatch(/sk-secret|tok-mcp/)

  await page.reload()
  const unlock = page.locator('.dialog.narrow')
  await unlock.getByPlaceholder('Senha').fill('errada')
  await unlock.getByRole('button', { name: 'Desbloquear' }).click()
  await expect(unlock.getByText('Senha incorreta.')).toBeVisible()
  await unlock.getByPlaceholder('Senha').fill('correta')
  await unlock.getByRole('button', { name: 'Desbloquear' }).click()
  await expect(unlock).toBeHidden()

  await send(page, 'com a chave')
  await expect(reply(page)).toContainText('Resposta 1.')
  expect(provider.chats[0].headers.authorization).toBe('Bearer sk-secret')
  await toolsButton(page).click()
  await page.getByRole('button', { name: 'Mostrar detalhes' }).click()
  await expect(page.getByLabel('Token (opcional)')).toHaveValue('tok-mcp')
})

test('a second tab does not undo the password protection', async ({ page, context }) => {
  await connect(page, 'sk-secret')
  const other = await context.newPage()
  await other.goto('/')

  await openSettings(page, 'Segurança')
  await page.getByPlaceholder('Senha', { exact: true }).fill('correta')
  await page.getByPlaceholder('Repita a senha').fill('correta')
  await page.getByRole('button', { name: 'Proteger' }).click()
  await expect(page.getByText('protegidas por senha e desbloqueadas')).toBeVisible()

  // The other tab loaded the unprotected settings; a change there used to
  // write them back with the key in plain text.
  await openSettings(other, 'Segurança')
  await expect(other.getByText('protegidas por senha e bloqueadas')).toBeVisible()
  await settingsSection(other, 'Geral')
  await other.getByLabel('Prompt de sistema global').fill('Seja breve.')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('tsrs:settings')))
    .toContain('Seja breve.')
  const stored = await page.evaluate(() => localStorage.getItem('tsrs:settings')!)
  expect(stored).not.toContain('sk-secret')
  expect(JSON.parse(stored).vault).toBeTruthy()

  // The first tab stays unlocked and keeps its key.
  await expect(page.getByText('protegidas por senha e desbloqueadas')).toBeVisible()
  await settingsSection(page, 'Provedores')
  await expect(page.locator('[data-provider=custom]').getByLabel(/Chave de API/)).toHaveValue(
    'sk-secret',
  )
})

test('migrates conversations stored by the first version', async ({ page }) => {
  await page.route('**/blank', (route) => route.fulfill({ contentType: 'text/html', body: '' }))
  await page.goto('/blank')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('tsrs', 1)
        open.onupgradeneeded = () => open.result.createObjectStore('chats', { keyPath: 'id' })
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('chats', 'readwrite')
          tx.objectStore('chats').put({
            id: 'old',
            title: 'Conversa antiga',
            createdAt: 1,
            updatedAt: 1,
            providerId: 'custom',
            model: 'mock-a',
            messages: [
              { id: 'u', role: 'user', content: 'pergunta antiga' },
              { id: 'a', role: 'assistant', content: 'resposta antiga' },
            ],
          })
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
        }
      }),
  )

  await page.goto('/')
  await chatRow(page, 'Conversa antiga').click()
  await expect(page.locator('.message.user')).toHaveText(/pergunta antiga/)
  await expect(reply(page)).toContainText('resposta antiga')
})

test.describe('English interface', () => {
  test.use({ locale: 'en-US' })

  test('follows the browser language and switches in the settings', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New chat' })).toBeVisible()
    await expect(page.getByPlaceholder(/Write your message/)).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Security' }).click()
    await expect(page.getByRole('heading', { name: 'Key security' })).toBeVisible()
    await page.getByRole('button', { name: 'General' }).click()
    await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'Português' }).click()
    await settingsSection(page, 'Segurança')
    await expect(page.getByRole('heading', { name: 'Segurança das chaves' })).toBeVisible()
    await closeSettings(page)

    await expect(page.getByRole('button', { name: 'Configurações', exact: true })).toBeVisible()
    await expect(composer(page)).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  })
})
