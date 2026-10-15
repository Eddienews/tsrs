import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { startMockMcp } from './mock-mcp'
import { startMockProvider, type MockProvider } from './mock-provider'
import { startMockWebdav } from './mock-webdav'

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

test('compares a reply with other models side by side', async ({ page }) => {
  await connect(page)
  await send(page, 'qual é melhor?')
  await reply(page).hover()
  await reply(page).getByRole('button', { name: 'Comparar' }).click()
  const dialog = page.locator('.dialog.narrow')
  await dialog.getByRole('checkbox', { name: /mock-b/ }).click()
  await dialog.getByRole('checkbox', { name: /mock-a/ }).click()
  // A model that is not in the list, used with the conversation's provider.
  await dialog.getByLabel('Modelo').fill('mock-c')
  await dialog.getByRole('checkbox', { name: /Usar “mock-c”/ }).click()
  await expect(dialog).toContainText('4 colunas')
  await dialog.getByRole('button', { name: 'Gerar' }).click()

  const columns = page.locator('.versions > section')
  await expect(columns).toHaveCount(4)
  for (const [index, model] of ['mock-a', 'mock-b', 'mock-a', 'mock-c'].entries()) {
    await expect(columns.nth(index)).toContainText(model)
    await expect(columns.nth(index)).toContainText(/Resposta \d\./)
  }
  expect(provider.chats.map((c) => c.body.model).sort()).toEqual([
    'mock-a',
    'mock-a',
    'mock-b',
    'mock-c',
  ])
  // The conversation keeps its own model.
  await expect(modelPicker(page)).toContainText('mock-a')

  await columns.nth(3).getByRole('button', { name: 'Usar esta' }).click()
  await expect(columns.nth(3)).toHaveClass(/\bcurrent\b/)

  // All four versions are kept.
  await page.reload()
  await chatRow(page, 'Saudação inicial').click()
  await expect(reply(page)).toContainText('4/4')
  await reply(page).hover()
  await reply(page).getByRole('button', { name: 'Lado a lado' }).click()
  await expect(columns).toHaveCount(4)
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

test('previews React and Mermaid, and explains when the libraries cannot load', async ({
  page,
}) => {
  // The libraries come from public CDNs; here they are unreachable on purpose.
  await page.route(/esm\.sh|cdn\.jsdelivr\.net|cdn\.tailwindcss\.com/, (route) => route.abort())
  await connect(page)
  await send(page, 'um componente')
  const buttons = reply(page).getByRole('button', { name: 'Abrir preview' })
  await expect(buttons).toHaveCount(2)

  const panel = page.locator('.preview')
  await buttons.first().click()
  await expect(panel.getByRole('tab', { name: 'preview-1.tsx' })).toBeVisible()
  await expect(panel.frameLocator('iframe').locator('pre')).toContainText(
    'Não foi possível carregar as bibliotecas do preview',
  )
  await buttons.nth(1).click()
  await expect(panel.getByRole('tab', { name: 'preview-2.mmd' })).toBeVisible()
  await expect(panel.frameLocator('iframe').locator('pre').last()).toContainText(
    'Não foi possível carregar',
  )
  await panel.getByRole('tab', { name: /Console/ }).click()
  await expect(panel).toContainText('Não foi possível carregar as bibliotecas do preview')
})

test('shows a motion composition with a timeline that seeks it', async ({ page }) => {
  await connect(page)
  await send(page, 'faça uma animação')
  await reply(page).getByRole('button', { name: 'Abrir preview' }).click()

  const panel = page.locator('.preview')
  await expect(panel.getByRole('tab', { name: 'motion-1.html' })).toBeVisible()
  await expect(panel).toContainText('1280×720 · 30 fps')
  const frame = panel.frameLocator('iframe')
  await expect(panel.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts')
  // Ready at the first frame: nothing has moved.
  await expect(panel.getByTestId('motion-time')).toHaveText('0.00 / 4.00 s')
  await expect(frame.locator('#clock')).toHaveText('t=0.00')
  await expect(frame.locator('#box')).toHaveCSS('opacity', '0')
  await expect(frame.locator('#bar')).toHaveCSS('width', '0px')

  // Scrubbing seeks all three kinds of animation to the same time.
  await panel.getByRole('slider', { name: 'Tempo' }).fill('1')
  await expect(frame.locator('#clock')).toHaveText('t=1.00')
  await expect(frame.locator('#box')).toHaveCSS('opacity', '1')
  await expect(frame.locator('#bar')).toHaveCSS('width', '50px')

  // Playing runs to the end and stops there.
  await panel.getByRole('button', { name: 'Reproduzir' }).click()
  await expect(panel.getByRole('button', { name: 'Pausar' })).toBeVisible()
  await expect(panel.getByTestId('motion-time')).toHaveText('4.00 / 4.00 s', { timeout: 10_000 })
  await expect(frame.locator('#clock')).toHaveText('t=4.00')
  await expect(panel.getByRole('button', { name: 'Reproduzir' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Gerar MP4' })).toBeVisible()

  // The ready message is for the timeline; the console stays clean.
  await panel.getByRole('tab', { name: /Console/ }).click()
  await expect(panel).toContainText('O console está vazio.')
})

test('shows which version and commit are running', async ({ page }) => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  await page.goto('/')
  const label = page.getByTestId('version')
  await expect(label).toHaveText(new RegExp(`^v${pkg.version.replace(/\./g, '\\.')}( · [0-9a-f]{7}\\*?)?$`))
  await openSettings(page)
  await expect(page.getByTestId('version-details')).toContainText(`TSRS v${pkg.version}`)
  await expect(page.getByTestId('version-details')).toContainText('Rodando pelo npm run dev')
})

// Half a second of silence as a WAV file.
function silentWav(): Buffer {
  const samples = 8000
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + samples * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(16000, 24)
  wav.writeUInt32LE(32000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  return wav
}

test('attaches audio, sends its transcription and offers it as a soundtrack', async ({ page }) => {
  await connect(page)
  const audio = { name: 'nota.wav', mimeType: 'audio/wav', buffer: silentWav() }
  const fileInput = page.locator('footer input[type=file]')

  // With no provider that transcribes, the file is attached and marked as such.
  await fileInput.setInputFiles(audio)
  const chip = page.locator('.chip', { hasText: 'nota.wav' })
  await expect(chip).toContainText('sem transcrição')
  await chip.getByRole('button', { name: 'Remover anexo' }).click()

  await openSettings(page)
  const openai = page.locator('[data-provider=openai]')
  await openai.getByLabel('URL base').fill(provider.url)
  await openai.getByLabel(/Chave de API/).fill('sk-audio')
  await closeSettings(page)
  await fileInput.setInputFiles(audio)
  await expect(chip).toContainText('transcrito')
  const sent = provider.transcriptions[0]
  expect(sent).toContain('filename="nota.wav"')
  expect(sent).toContain('gpt-4o-mini-transcribe')
  // The language is left for the model to detect: a file may be in any language.
  expect(sent).not.toContain('name="language"')

  await send(page, 'Resuma o áudio')
  const question = provider.chats.at(-1)!.body.messages.at(-1)
  expect(JSON.stringify(question)).toContain('<audio name=\\"nota.wav\\" transcription=\\"automatic\\">\\nditado de teste')
  const card = page.locator('.message.user .attached-audio')
  await expect(card.locator('audio')).toHaveCount(1)
  await card.getByText('Transcrição').click()
  await expect(card).toContainText('ditado de teste')

  // The same file is a soundtrack for a motion video.
  await send(page, 'faça uma animação')
  await page.locator('.message.assistant').last().getByRole('button', { name: 'Abrir preview' }).click()
  const track = page.locator('.preview').getByRole('combobox', { name: 'Trilha' })
  await expect(track.locator('option', { hasText: 'nota.wav' })).toHaveCount(1)
  // Attached to ask for the video, it is already the soundtrack: no need to pick it.
  await expect(track.locator('option:checked')).toHaveText('nota.wav')
  await expect(page.locator('.preview').getByTestId('motion-audio')).toHaveCount(1)
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

test('shows the reasoning folded above the reply', async ({ page }) => {
  await connect(page)
  await send(page, 'pense antes de responder')
  const thinking = reply(page).locator('.thinking')
  await expect(thinking.getByRole('button', { name: 'Raciocínio' })).toBeVisible()
  await expect(thinking).not.toContainText('Primeiro')
  await thinking.getByRole('button', { name: 'Raciocínio' }).click()
  await expect(thinking).toContainText('Primeiro, o pedido. Depois, a resposta.')
  await expect(reply(page)).toContainText('Resposta 1.')
  // Kept with the conversation, but never sent back to the model.
  await send(page, 'e agora?')
  const sent = provider.chats.at(-1)!.body.messages
  expect(JSON.stringify(sent)).not.toContain('Primeiro')
})

test('branches, pins, cites sources and exports as HTML', async ({ page }) => {
  await connect(page)
  await send(page, 'primeira com fontes')
  await expect(reply(page).locator('.sources')).toContainText('Fonte A')
  await expect(reply(page).locator('.sources a')).toHaveAttribute('href', 'https://a.example/x')

  await reply(page).hover()
  await reply(page).getByRole('button', { name: 'Fixar' }).click()
  await expect(page.getByRole('navigation', { name: 'Mensagens fixadas' })).toContainText('Resposta 1.')
  await expect(reply(page)).toContainText('Fixada')

  const html = page.waitForEvent('download')
  await chatMenu(page, 'Saudação inicial', 'Exportar HTML')
  const file = await html
  expect(file.suggestedFilename()).toBe('Saudação-inicial.html')
  const exported = await readFile(await file.path(), 'utf8')
  expect(exported).toContain('primeira com fontes')
  expect(exported).toContain('<strong>mock</strong>')
  expect(exported).toContain('https://a.example/x')

  await page.locator('.message.user').hover()
  await page.locator('.message.user').getByRole('button', { name: 'Ramificar a partir daqui' }).click()
  await expect(chatRow(page, 'Saudação inicial (ramificação)')).toBeVisible()
  await expect(page.locator('.message')).toHaveCount(1)
  await send(page, 'seguindo pela ramificação')
  // The branch carries the conversation up to the chosen message.
  expect(provider.chats.at(-1)!.body.messages.map((m: { content: string }) => m.content)).toEqual([
    expect.stringContaining('The user is reading'),
    'primeira com fontes',
    'seguindo pela ramificação',
  ])
  // The original conversation is untouched.
  await chatRow(page, 'Saudação inicial').filter({ hasNotText: 'ramificação' }).click()
  await expect(page.locator('.message')).toHaveCount(2)
})

test('dictates through the provider and opens the preview by itself', async ({ page }) => {
  await connect(page)
  await openSettings(page)
  const openai = page.locator('[data-provider=openai]')
  await openai.getByLabel('URL base').fill(provider.url)
  await openai.getByLabel(/Chave de API/).fill('sk-audio')
  await settingsSection(page, 'Geral')
  await page.getByRole('switch', { name: 'Abrir o preview sozinho' }).click()
  await closeSettings(page)

  await page.getByRole('button', { name: 'Ditar' }).click()
  await expect(page.getByRole('button', { name: 'Parar o ditado' })).toBeVisible()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Parar o ditado' }).click()
  await expect(composer(page)).toHaveValue('ditado de teste')
  const sent = provider.transcriptions[0]
  expect(sent).toContain('gpt-4o-mini-transcribe')
  expect(sent).toMatch(/name="language"\r\n\r\npt/)

  await composer(page).fill('crie uma página')
  await composer(page).press('Enter')
  await expect(page.locator('.preview').getByRole('tab', { name: 'preview-1.html' })).toBeVisible()
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

test('deletes everything after confirming', async ({ page, context }) => {
  await connect(page, 'sk-secret')
  await send(page, 'apague isto')
  await expect(chatRow(page, 'Saudação inicial')).toBeVisible()
  // Another tab holds the database open; deleting must not wait for it.
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.locator('.chat-item')).toHaveCount(1)

  await openSettings(page, 'Dados')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Apagar tudo' }).click()
  await expect(page.locator('.chat-item')).toHaveCount(1)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Apagar tudo' }).click()
  await expect(page.getByText('No que vamos trabalhar?')).toBeVisible()
  await expect(page.locator('.chat-item')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('tsrs:settings') ?? '')).not.toContain(
    'sk-secret',
  )
  await other.reload()
  await expect(other.locator('.chat-item')).toHaveCount(0)
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

test('remembers facts through the memory tool and lists them in the library', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('tab', { name: 'Memória' }).click()
  await page.getByRole('switch', { name: 'Usar memória' }).click()
  await page.getByTitle('Fechar').click()

  await send(page, 'use a ferramenta para lembrar')
  await expect(reply(page)).toContainText('A ferramenta respondeu: Saved.')
  await expect(reply(page)).toContainText('Memória')
  const first = provider.chats[0].body
  expect(first.tools.map((t: any) => t.function.name)).toEqual(['memory_save', 'memory_delete'])
  expect(first.messages[0].content).toContain('(none yet)')

  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await send(page, 'oi')
  expect(provider.chats.at(-1)!.body.messages[0].content).toContain('- Gosta de café')

  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('tab', { name: 'Memória' }).click()
  await expect(page.getByLabel('Fato')).toHaveValue('Gosta de café')
  await page.getByRole('button', { name: 'Esquecer', exact: true }).click()
  await expect(page.getByText('Nenhum fato guardado ainda.')).toBeVisible()
})

test('summarizes a long chat and continues from the summary', async ({ page }) => {
  await connect(page)
  await send(page, 'primeira')
  // The mock reports 900 of the model's 1,000 tokens.
  await page.getByRole('button', { name: 'Resumir a conversa' }).click()
  await expect(page.locator('.summary')).toContainText('Conversa resumida até aqui')
  await expect(page.getByRole('button', { name: 'Resumir a conversa' })).toBeHidden()
  const asked = provider.chats.at(-1)!.body.messages
  expect(asked.at(-1).content).toMatch(/^Summarize the conversation so far/)
  expect(asked.at(-2).content).toContain('Resposta 1.')

  await send(page, 'segunda')
  const { messages } = provider.chats.at(-1)!.body
  expect(messages).toHaveLength(2)
  expect(messages[0].content).toContain('Summary of the earlier part of this conversation')
  expect(messages[0].content).toContain('Resposta 2.')
  expect(messages[1].content).toBe('segunda')
  // The summary survives a reload.
  await page.reload()
  await chatRow(page, 'Saudação inicial').click()
  await expect(page.locator('.summary')).toBeVisible()
})

test('generates an image and regenerates it', async ({ page }) => {
  await connect(page)
  await openSettings(page)
  const openai = page.locator('[data-provider=openai]')
  await openai.getByLabel('URL base').fill(provider.url)
  await openai.getByLabel(/Chave de API/).fill('sk-image')
  await closeSettings(page)

  await page.getByRole('button', { name: 'Imagem' }).click()
  await page.getByPlaceholder(/Descreva a imagem/).fill('um gato laranja')
  await page.getByPlaceholder(/Descreva a imagem/).press('Enter')
  const image = reply(page).locator('figure img')
  await expect(image).toHaveAttribute('src', /^data:image\/png;base64,iVBOR/)
  await expect(reply(page).locator('figcaption')).toHaveText('Um gato laranja, de perfil')
  expect(provider.images[0]).toEqual({ model: 'gpt-image-2', prompt: 'um gato laranja', n: 1 })
  // The image mode lasts for one message.
  await expect(composer(page)).toBeVisible()

  await reply(page).hover()
  await reply(page).getByRole('button', { name: 'Regenerar' }).click()
  await expect(reply(page)).toContainText('2/2')
  expect(provider.images).toHaveLength(2)

  // A later message sends the image as its prompt, not as a picture.
  await send(page, 'gostei')
  const { messages } = provider.chats.at(-1)!.body
  expect(messages.at(-2)).toEqual({
    role: 'assistant',
    content: '[Generated an image for the prompt: um gato laranja]',
  })
})

test('generates video and audio with media services and keeps the files', async ({ page }) => {
  // The services, simulated: a fal.ai queue that answers on the second check,
  // its file storage, and ElevenLabs.
  const sent: { url: string; method: string; headers: Record<string, string>; body: string | null }[] = []
  const cors = { 'access-control-allow-origin': '*' }
  let checks = 0
  await page.route('https://queue.fal.run/**', async (route) => {
    const request = route.request()
    sent.push({ url: request.url(), method: request.method(), headers: request.headers(), body: request.postData() })
    const url = request.url()
    const base = 'https://queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video/requests/r1'
    const body = url.endsWith('/status')
      ? ++checks === 1
        ? { status: 'IN_QUEUE', queue_position: 3 }
        : { status: 'COMPLETED' }
      : url === base
        ? { video: { url: 'https://v3.fal.media/files/v.mp4', content_type: 'video/mp4' } }
        : { request_id: 'r1', status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` }
    await route.fulfill({ json: body, headers: cors })
  })
  await page.route('https://api.fal.ai/v1/models/pricing**', (route) =>
    route.fulfill({
      json: { prices: [{ endpoint_id: 'x', unit_price: 0.084, unit: 'second', currency: 'USD' }] },
      headers: cors,
    }),
  )
  await page.route('https://v3.fal.media/**', (route) =>
    route.fulfill({ body: Buffer.from([1, 2, 3]), contentType: 'video/mp4', headers: cors }),
  )
  await page.route('https://api.elevenlabs.io/**', (route) => {
    const request = route.request()
    sent.push({ url: request.url(), method: request.method(), headers: request.headers(), body: request.postData() })
    return route.fulfill({ body: Buffer.from([4, 5, 6]), contentType: 'audio/mpeg', headers: cors })
  })

  await connect(page)
  await expect(page.getByRole('button', { name: 'Vídeo' })).toBeHidden()
  await openSettings(page, 'Mídia')
  await page.getByLabel('Chave de fal.ai').fill('fal-key')
  await page.getByLabel('Chave de ElevenLabs').fill('xi-key')
  await closeSettings(page)

  await page.getByRole('button', { name: 'Vídeo' }).click()
  // The cost is shown before anything is sent.
  await expect(page.locator('.media-price')).toHaveText(
    /^Custo estimado: US\$\s0,08 por segundo\. Fonte: fal\.ai\.$/,
  )
  await page.getByPlaceholder(/Descreva o vídeo/).fill('ondas na praia')
  await page.getByPlaceholder(/Descreva o vídeo/).press('Enter')
  await expect(reply(page)).toContainText(/Gerando vídeo…\s*\(na fila: 3\)/)
  // The queue is checked again after a few seconds, as with the real service.
  await expect(reply(page).locator('video')).toHaveAttribute('src', 'data:video/mp4;base64,AQID', {
    timeout: 15_000,
  })
  const submit = sent[0]
  expect(submit.url).toBe('https://queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video')
  expect(submit.headers.authorization).toBe('Key fal-key')
  expect(JSON.parse(submit.body!)).toEqual({ prompt: 'ondas na praia' })

  await page.getByRole('button', { name: 'Áudio' }).click()
  await page.getByPlaceholder(/texto a narrar/).fill('Olá, mundo')
  await page.getByPlaceholder(/texto a narrar/).press('Enter')
  await expect(reply(page).last().locator('audio')).toHaveAttribute('src', 'data:audio/mpeg;base64,BAUG')
  const speech = sent.at(-1)!
  expect(speech.url).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/JBFqnCBsd6RMkjVDRZzb/)
  expect(speech.headers['xi-api-key']).toBe('xi-key')

  // Later messages describe the files instead of sending them.
  await send(page, 'gostei')
  const { messages } = provider.chats.at(-1)!.body
  expect(messages.map((m: any) => m.content)).toContain('[Generated a video for the prompt: ondas na praia]')
  expect(messages.map((m: any) => m.content)).toContain('[Generated audio for the prompt: Olá, mundo]')

  // The files stay in the chat after a reload.
  await page.reload()
  await chatRow(page, 'ondas na praia').click()
  await expect(reply(page).first().locator('video')).toHaveAttribute('src', 'data:video/mp4;base64,AQID')
})

// A tenth of a second of silence, as a WAV file the browser can play.
function silence(): Buffer {
  const samples = 2400
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + samples * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(24000, 24)
  wav.writeUInt32LE(48000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  return wav
}

test('reads replies aloud with a voice service, once per text', async ({ page }) => {
  const asked: string[] = []
  let refuse = false
  await page.route('https://api.elevenlabs.io/**', (route) => {
    const headers = { 'access-control-allow-origin': '*' }
    // The settings list the account's voices and models.
    if (route.request().method() === 'GET') return route.fulfill({ json: route.request().url().endsWith('/voices') ? { voices: [] } : [], headers })
    asked.push(JSON.parse(route.request().postData() ?? '{}').text)
    return refuse
      ? route.fulfill({ status: 401, json: { detail: { message: 'invalid key' } }, headers })
      : route.fulfill({ body: silence(), contentType: 'audio/wav', headers })
  })
  await connect(page)
  await openSettings(page, 'Mídia')
  await page.getByLabel('Chave de ElevenLabs').fill('xi-key')
  await page.getByLabel('Leitura em voz alta').selectOption('elevenlabs')
  await closeSettings(page)
  await send(page, 'leia isto')

  const read = reply(page).getByRole('button', { name: 'Ler em voz alta' })
  const stop = reply(page).getByRole('button', { name: 'Parar a leitura' })
  // Reading shows the stop button until the audio ends.
  for (let time = 0; time < 2; time++) {
    await reply(page).hover()
    await read.click()
    await expect(stop).toBeVisible()
    await expect(read).toBeVisible({ timeout: 10_000 })
  }
  expect(asked).toEqual(['Resposta 1. Sou um mock .'])
  await expect(reply(page).locator('.speech-problem')).toBeHidden()

  // When the service refuses, the browser's voice reads it and the reply says why.
  refuse = true
  await send(page, 'de novo')
  await reply(page).last().hover()
  await reply(page).last().getByRole('button', { name: 'Ler em voz alta' }).click()
  await expect(reply(page).last().locator('.speech-problem')).toHaveText(
    /ElevenLabs não leu esta resposta \(ElevenLabs recusou a chave \(401\)\.\); usei a voz do navegador\./,
  )
})

test('picks an ElevenLabs voice and model, and shows what audio costs', async ({ page }) => {
  const posted: any[] = []
  const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'character-cost' }
  await page.route('https://api.elevenlabs.io/**', (route) => {
    const url = route.request().url()
    if (url.endsWith('/v1/voices'))
      return route.fulfill({
        headers,
        json: {
          voices: [
            { voice_id: 'premade-1', name: 'George', category: 'premade', labels: { accent: 'British' } },
            {
              voice_id: 'clone-1',
              name: 'Eddie',
              category: 'cloned',
              preview_url: 'https://storage.example/eddie.mp3',
              labels: { accent: 'Brazilian', gender: 'male' },
            },
          ],
        },
      })
    if (url.endsWith('/v1/models'))
      return route.fulfill({
        headers,
        json: [
          { model_id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2', can_do_text_to_speech: true },
          { model_id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5', can_do_text_to_speech: true },
          { model_id: 'eleven_english_sts_v2', name: 'Speech to speech', can_do_text_to_speech: false },
        ],
      })
    posted.push({ url, body: JSON.parse(route.request().postData() ?? '{}') })
    return route.fulfill({
      body: silence(),
      contentType: 'audio/mpeg',
      headers: { ...headers, 'character-cost': '500' },
    })
  })
  await connect(page)
  await openSettings(page, 'Mídia')
  await page.getByLabel('Chave de ElevenLabs').fill('xi-key')
  await page.locator('#media-audio').selectOption('elevenlabs')

  // The account's own voices come first, then the ones ElevenLabs gives everyone.
  const voice = page.getByLabel('Voz ou tipo de áudio')
  await expect(voice.locator('optgroup[label="Minhas vozes"] option')).toHaveText(['Eddie'])
  await expect(voice.locator('optgroup[label="Vozes da ElevenLabs"] option')).toHaveText(['George'])
  await voice.selectOption('clone-1')
  await expect(page.getByText('Brazilian, male')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ouvir uma amostra' }).first()).toBeEnabled()
  const model = page.getByLabel('Modelo da ElevenLabs')
  await expect(model.locator('option')).toHaveText([/Multilingual v2 · US\$\s0,08/, /Flash v2\.5 · US\$\s0,04/])
  await model.selectOption('eleven_flash_v2_5')
  await expect(page.getByLabel('Opções do modelo de áudio')).toHaveValue('{"model_id":"eleven_flash_v2_5"}')

  // Reading aloud has the same choices, and the browser's voices when chosen.
  await page.getByLabel('Leitura em voz alta').selectOption('browser')
  await expect(page.getByLabel('Voz do navegador')).toBeVisible()
  await page.getByLabel('Leitura em voz alta').selectOption('elevenlabs')
  await page.getByLabel('Voz da leitura').selectOption('clone-1')
  await closeSettings(page)

  // The price is shown before, with what the typed text will cost.
  await page.getByRole('button', { name: 'Áudio' }).click()
  await page.getByPlaceholder(/texto a narrar/).fill('x'.repeat(250))
  await expect(page.locator('.media-price')).toContainText('US$ 0,04 por mil caracteres'.replace(' ', '\u00a0'))
  await expect(page.locator('.media-price')).toContainText('Esta mensagem: 250 caracteres')
  await page.getByPlaceholder(/texto a narrar/).press('Enter')
  await expect(reply(page).last().locator('audio')).toBeVisible()
  expect(posted[0].url).toContain('/v1/text-to-speech/clone-1')
  expect(posted[0].body.model_id).toBe('eleven_flash_v2_5')
  // And after, from the characters ElevenLabs counted: 500 at $0.04 per thousand.
  await reply(page).last().hover()
  await expect(reply(page).last()).toContainText(/US\$\s0,0200/)
})

test('asks for the price of a model the app does not know, and shows the cost', async ({ page }) => {
  await connect(page, 'sk-paid')
  await send(page, 'primeira')
  const usage = page.locator('.toolbar .usage')
  await expect(usage).toContainText('900 tokens')
  await usage.getByRole('button', { name: 'definir preço' }).click()
  await page.getByLabel('Entrada (US$)').fill('2')
  await page.getByLabel('Saída (US$)').fill('10')
  await page.getByRole('button', { name: 'Salvar' }).click()
  // 850 tokens in at $2 and 50 out at $10 per million.
  await expect(usage).toContainText(/US\$\s0,0022/)
  await expect(usage.getByRole('button', { name: 'preço informado' })).toBeVisible()
  await send(page, 'segunda')
  await reply(page).last().hover()
  await expect(reply(page).last()).toContainText(/US\$\s0,0022/)
})

test('asks a side question about part of a reply', async ({ page }) => {
  await connect(page)
  await send(page, 'primeira')
  await reply(page).locator('strong', { hasText: 'mock' }).selectText()
  await reply(page).getByRole('button', { name: 'Perguntar à parte' }).click()
  const panel = page.locator('.side-chat')
  await expect(panel.locator('blockquote')).toHaveText('mock')
  const question = panel.getByRole('textbox', { name: 'Pergunta' })
  await question.fill('o que é isso?')
  await question.press('Enter')
  await expect(panel).toContainText('Resposta 2.')

  const { messages } = provider.chats.at(-1)!.body
  expect(messages[0].content).toContain('side question')
  expect(messages.at(-1).content).toBe('About this part of your reply:\n\n> mock\n\no que é isso?')
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  // The conversation itself is unchanged.
  await expect(page.locator('.message')).toHaveCount(2)
})

test('an agent brings its own tools, files and starters', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('button', { name: 'Nova persona' }).click()
  await page.getByLabel('Nome').fill('Revisor')
  await page.getByLabel('Prompt de sistema').fill('Revise textos.')
  await page.getByRole('switch', { name: 'Ferramentas próprias' }).click()
  await page.locator('.dialog input[type=file]').setInputFiles({
    name: 'guia.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Use voz ativa.'),
  })
  await expect(page.getByText('guia.md')).toBeVisible()
  await page.getByLabel('Sugestões iniciais (uma por linha)').fill('Revise meu e-mail\nEncurte um parágrafo')
  await page.getByTitle('Fechar').click()

  await page.getByTitle('Persona desta conversa').click()
  await page.getByRole('menuitemradio', { name: 'Revisor', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Revisor' })).toBeVisible()
  await page.getByRole('button', { name: 'Revise meu e-mail' }).click()
  await composer(page).press('Enter')
  await expect(reply(page)).toContainText('Resposta 1.')
  await send(page, 'de novo')

  const { messages } = provider.chats.at(-1)!.body
  expect(messages[0].content).toMatch(/^Revise textos\./)
  // The file goes with the first message of every request.
  expect(messages[1].content).toBe('Revise meu e-mail\n\n<file name="guia.md">\nUse voz ativa.\n</file>')
  expect(messages[3].content).toBe('de novo')
})

test('answers from a knowledge base', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('tab', { name: 'Conhecimento' }).click()
  await page.getByRole('button', { name: 'Nova base' }).click()
  await page.getByLabel('Nome da base').fill('Manual')
  await page.getByLabel('Adicionar documentos').setInputFiles([
    {
      name: 'ferias.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Férias\n\nCada pessoa tem 30 dias de férias por ano.\n\nO reembolso sai em 10 dias.'),
    },
    { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x00, 0x00]) },
    {
      name: 'prazo.pdf',
      mimeType: 'application/pdf',
      buffer: await readFile('e2e/fixtures/prazo.pdf'),
    },
  ])
  await expect(page.locator('.knowledge-base')).toContainText('ferias.md')
  await expect(page.locator('.knowledge-base')).toContainText('prazo.pdf')
  await expect(page.getByRole('alert')).toContainText('"foto.png" não é PDF nem texto.')
  await page.getByLabel('Testar uma busca').fill('quantos dias de férias')
  await expect(page.locator('.search-hit').first()).toContainText('30 dias de férias')
  await page.getByLabel('Testar uma busca').fill('prazo de entrega')
  await expect(page.locator('.search-hit').first()).toContainText('Prazo de entrega: 15 dias uteis.')
  await page.getByLabel('Testar uma busca').fill('quantos dias de férias')
  await page.getByTitle('Fechar').click()

  await page.locator('.toolbar').getByRole('button', { name: 'Parâmetros' }).click()
  await page.getByRole('checkbox', { name: 'Manual' }).check()
  await page.keyboard.press('Escape')
  await send(page, 'Quantos dias de férias eu tenho?')
  const question = provider.chats[0].body.messages.at(-1).content
  expect(question).toMatch(/^Quantos dias de férias eu tenho\?\n\n<knowledge>/)
  expect(question).toContain('document="ferias.md"')
  expect(question).toContain('30 dias de férias por ano')
  await reply(page).locator('.references button').click()
  await expect(reply(page).locator('.references')).toContainText('30 dias de férias por ano')
})

test('shows message times, chimes when a reply is done and takes new shortcuts', async ({ page }) => {
  // Counts the notes played instead of playing them.
  await page.addInitScript(() => {
    ;(window as any).notes = 0
    const Real = window.AudioContext
    window.AudioContext = class extends Real {
      createOscillator() {
        const tone = super.createOscillator()
        const start = tone.start.bind(tone)
        tone.start = (when?: number) => {
          ;(window as any).notes++
          start(when)
        }
        return tone
      }
    }
  })
  await connect(page)
  await openSettings(page, 'Geral')
  await page.getByRole('switch', { name: 'Tocar um som quando a resposta terminar' }).click()
  // Turning it on plays it once, as a sample.
  expect(await page.evaluate(() => (window as any).notes)).toBe(2)

  await settingsSection(page, 'Atalhos')
  await page.getByRole('button', { name: 'Atalho de Nova conversa', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Atalho de Nova conversa', exact: true })).toHaveText('Pressione as teclas…')
  await page.keyboard.press('Control+Shift+O')
  await expect(page.getByRole('button', { name: 'Atalho de Nova conversa', exact: true })).toHaveText('Ctrl+Shift+O')
  // A shortcut taken from another action leaves that one without it.
  await page.getByRole('button', { name: 'Atalho de Nova conversa temporária' }).click()
  await page.keyboard.press('Control+K')
  await expect(page.getByRole('status')).toHaveText('Ctrl+K deixou de abrir "Paleta de comandos".')
  await expect(page.getByRole('button', { name: 'Atalho de Paleta de comandos' })).toHaveText('Nenhum')
  await closeSettings(page)

  await send(page, 'que horas são?')
  await expect(reply(page)).toContainText('Resposta 1.')
  await expect(page.locator('.message.user .message-time')).toHaveText(/^\d{2}:\d{2}$/)
  await expect(reply(page).locator('.message-time')).toHaveText(/^\d{2}:\d{2}$/)
  expect(await page.evaluate(() => (window as any).notes)).toBe(4)

  // Alt+N no longer starts a chat; the new keys do.
  await page.keyboard.press('Alt+N')
  await expect(reply(page)).toBeVisible()
  await page.keyboard.press('Control+Shift+O')
  await expect(page.getByRole('heading', { name: 'No que vamos trabalhar?' })).toBeVisible()
  await page.keyboard.press('Control+K')
  await expect(page.locator('.temporary-note')).toBeVisible()
})

test('tags, archives and acts on several chats at once', async ({ page }) => {
  await connect(page)
  await openSettings(page, 'Geral')
  await page.getByRole('switch', { name: 'Gerar o título da conversa automaticamente' }).click()
  await closeSettings(page)
  for (const title of ['alfa', 'beta', 'gama']) {
    await page.getByRole('button', { name: 'Nova conversa' }).click()
    await send(page, title)
  }
  await expect(page.locator('.chat-item')).toHaveCount(3)

  // One chat: tags typed with or without #, and a filter for each tag.
  await chatMenu(page, 'alfa', 'Etiquetas')
  await page.getByLabel('Etiquetas, separadas por vírgula:').fill('#trabalho, Ideias, trabalho')
  await page.getByLabel('Etiquetas, separadas por vírgula:').press('Enter')
  await expect(chatRow(page, 'alfa').locator('.chat-tag')).toHaveText(['#trabalho', '#Ideias'])
  await page.locator('.tag-filter').getByRole('button', { name: '#trabalho' }).click()
  await expect(page.locator('.chat-item')).toHaveCount(1)
  await page.locator('.tag-filter').getByRole('button', { name: '#trabalho' }).click()
  await expect(page.locator('.chat-item')).toHaveCount(3)

  // Archived chats leave the list for a section of their own.
  await chatMenu(page, 'beta', 'Arquivar')
  await expect(page.locator('.chat-item')).toHaveCount(2)
  await page.getByRole('button', { name: 'Arquivadas (1)' }).click()
  await expect(chatRow(page, 'beta')).toBeVisible()
  await chatMenu(page, 'beta', 'Desarquivar')
  await expect(page.getByRole('button', { name: /Arquivadas/ })).toBeHidden()

  // Several at once: a tag, archiving, then deleting with one question.
  await page.getByRole('button', { name: 'Selecionar conversas' }).click()
  await page.getByLabel('Selecionar "beta"').check()
  await chatRow(page, 'gama').getByRole('button').first().click()
  await expect(page.locator('.bulk')).toContainText('2 selecionadas')
  await page.locator('.bulk').getByRole('button', { name: 'Etiquetar' }).click()
  await page.getByLabel('Etiqueta para acrescentar:').fill('lote')
  await page.getByLabel('Etiqueta para acrescentar:').press('Enter')
  await expect(page.locator('.chat-item .chat-tag', { hasText: '#lote' })).toHaveCount(2)
  await expect(page.locator('.bulk')).toBeHidden()

  await page.getByRole('button', { name: 'Selecionar conversas' }).click()
  await page.getByLabel('Selecionar "beta"').check()
  await page.getByLabel('Selecionar "gama"').check()
  await page.locator('.bulk').getByRole('button', { name: 'Arquivar' }).click()
  // The archived section is still open from before.
  await expect(page.locator('.archived .chat-item')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Arquivadas (2)' })).toBeVisible()

  await page.getByRole('button', { name: 'Selecionar conversas' }).click()
  await page.getByLabel('Selecionar "beta"').check()
  await page.getByLabel('Selecionar "gama"').check()
  const asked: string[] = []
  page.on('dialog', (dialog) => {
    asked.push(dialog.message())
    dialog.accept()
  })
  await page.locator('.bulk').getByRole('button', { name: 'Excluir' }).click()
  await expect(page.locator('.chat-item')).toHaveCount(1)
  expect(asked).toEqual(['Excluir 2 conversas?'])

  // Tags and archiving are kept across a reload.
  await page.reload()
  await expect(chatRow(page, 'alfa').locator('.chat-tag')).toHaveText(['#trabalho', '#Ideias'])
})

test('comes with starter personas and prompts that can be brought back', async ({ page }) => {
  await page.goto('/')
  await page.getByTitle('Persona desta conversa').click()
  await page.getByRole('menuitemradio', { name: 'Revisor de texto' }).click()
  await expect(page.getByRole('heading', { name: 'Revisor de texto' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revise este e-mail antes de eu enviar:' })).toBeVisible()

  await page.getByRole('button', { name: 'Prompts', exact: true }).click()
  await expect(page.locator('.menu')).toContainText('Ata de reunião')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('tab', { name: 'Prompts salvos' }).click()
  await expect(page.getByRole('button', { name: /Adicionar os prompts prontos/ })).toBeHidden()
  await page.getByRole('button', { name: 'Resumir' }).click()
  await page.getByRole('button', { name: 'Excluir' }).click()
  await page.getByRole('button', { name: 'Adicionar os prompts prontos (1)' }).click()
  await expect(page.getByRole('button', { name: 'Resumir' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Adicionar os prompts prontos/ })).toBeHidden()
})

test('keeps a temporary chat out of the history and drops it on leaving', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('tab', { name: 'Memória' }).click()
  await page.getByRole('switch', { name: 'Usar memória' }).click()
  await page.getByTitle('Fechar').click()
  const toggle = page.getByRole('button', { name: 'Conversa temporária' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.temporary-note')).toBeVisible()
  await send(page, 'algo que não deve ficar')
  await expect(reply(page)).toContainText('Resposta 1.')
  await expect(page.locator('.chat-item')).toHaveCount(0)
  // It neither reads nor saves memories.
  expect(provider.chats[0].body.tools).toBeUndefined()
  expect(JSON.stringify(provider.chats[0].body.messages)).not.toContain('Facts you saved')
  // Once started, it stays temporary.
  await expect(toggle).toBeHidden()
  const stored = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const open = indexedDB.open('tsrs')
          open.onsuccess = () => {
            const count = open.result.transaction('meta').objectStore('meta').count()
            count.onsuccess = () => resolve(count.result)
          }
        }),
    )
  expect(await stored()).toBe(0)

  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await expect(page.getByText('algo que não deve ficar')).toBeHidden()
  // The next chat is temporary too, until the mode is turned off.
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(page.locator('.temporary-note')).toBeHidden()
  await send(page, 'esta fica')
  await expect(chatRow(page, 'Saudação inicial')).toBeVisible()
  await expect(page.locator('.chat-item')).toHaveCount(1)
  expect(await stored()).toBe(1)
  expect(provider.chats[1].body.tools.map((t: any) => t.function.name)).toContain('memory_save')
})

test('reads Excel workbooks attached to a message or added to a base', async ({ page }) => {
  await connect(page)
  await page.locator('.composer input[type=file]').setInputFiles([
    { name: 'vendas.xlsx', mimeType: '', buffer: await readFile('e2e/fixtures/vendas.xlsx') },
    { name: 'antiga.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from([0xd0, 0xcf, 0x11]) },
  ])
  await expect(page.getByText('"antiga.xls" é uma planilha num formato que o TSRS não lê. Salve como .xlsx ou CSV.')).toBeVisible()
  await send(page, 'quanto vendi?')
  const sent = provider.chats[0].body.messages.at(-1).content
  expect(sent).toContain('<file name="vendas.xlsx">\nSheet "Vendas" (3 rows):\nProduto,Data,Qtd,Preço,Total,Pago\n')
  expect(sent).toContain('Sheet "Resumo" (1 rows):\nTotal geral,9.3')

  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('tab', { name: 'Conhecimento' }).click()
  await page.getByRole('button', { name: 'Nova base' }).click()
  await page.getByLabel('Adicionar documentos').setInputFiles('e2e/fixtures/vendas.xlsx')
  await expect(page.locator('.knowledge-base')).toContainText('vendas.xlsx')
  await page.getByLabel('Testar uma busca').fill('café torrado')
  await expect(page.locator('.search-hit').first()).toContainText('"Café, torrado",2026-10-14')
})

test('searches a knowledge base by meaning and with a tool', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('tab', { name: 'Conhecimento' }).click()
  await page.getByRole('button', { name: 'Nova base' }).click()
  await page.getByLabel('Nome da base').fill('Manual')
  await page.getByLabel('Adicionar documentos').setInputFiles([
    { name: 'ferias.md', mimeType: 'text/markdown', buffer: Buffer.from('Cada pessoa tem 30 dias de férias por ano.') },
    { name: 'reembolso.md', mimeType: 'text/markdown', buffer: Buffer.from('O reembolso de despesas sai em 10 dias.') },
  ])
  await expect(page.locator('.knowledge-base')).toContainText('reembolso.md')
  // By words alone, a question in other words finds nothing.
  await page.getByLabel('Testar uma busca').fill('descanso anual')
  await expect(page.getByText('Nenhum trecho encontrado.')).toBeVisible()

  await page.getByLabel('Busca por sentido').selectOption('custom')
  await expect(page.getByText('Informe o modelo de embeddings.')).toBeVisible()
  await page.getByLabel('Modelo de embeddings').fill('mock-embed')
  await expect(page.getByText('2 documentos ainda não foram indexados.')).toBeVisible()
  await page.getByRole('button', { name: 'Indexar por sentido' }).click()
  await expect(page.locator('.knowledge-base .indexed')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Indexar por sentido' })).toBeHidden()
  expect(provider.embedded).toContain('Cada pessoa tem 30 dias de férias por ano.')
  await expect(page.locator('.search-hit').first()).toContainText('30 dias de férias')
  await page.getByTitle('Fechar').click()

  await page.locator('.toolbar').getByRole('button', { name: 'Parâmetros' }).click()
  await page.getByRole('checkbox', { name: 'Manual' }).check()
  await page.keyboard.press('Escape')
  await send(page, 'Como funciona o descanso anual?')
  const question = provider.chats[0].body.messages.at(-1).content
  expect(question).toContain('30 dias de férias por ano')
  expect(provider.embedded).toContain('Como funciona o descanso anual?')

  // The model searches the base again with words of its own.
  await send(page, 'use a ferramenta de busca')
  const offered = provider.chats[1].body.tools.map((tool: any) => tool.function.name)
  expect(offered).toEqual(['knowledge_search'])
  const answer = provider.chats[2].body.messages.at(-1)
  expect(answer.role).toBe('tool')
  expect(answer.content).toContain('<passage index="1" document="ferias.md">')
  await expect(reply(page).last()).toContainText('Busca na base')
  await reply(page).last().locator('.references button').click()
  await expect(reply(page).last().locator('.references')).toContainText('30 dias de férias por ano')
})

test('writes in the canvas with the model and by hand', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Canvas', exact: true }).click()
  const canvas = page.locator('.canvas')
  await expect(canvas.getByLabel('Título do canvas')).toHaveValue('Sem título')
  await send(page, 'use a ferramenta para escrever um plano')
  await expect(canvas.getByLabel('Texto do canvas')).toHaveValue('# Plano\n\nPasso 1')
  await expect(canvas.getByLabel('Título do canvas')).toHaveValue('Plano')
  const first = provider.chats[0].body
  expect(first.tools[0].function.name).toBe('canvas_write')
  expect(first.messages[0].content).toContain('The user has a canvas open')
  expect(first.messages.at(-1).content).toContain('<canvas title="Sem título" language="markdown">\n(empty)\n</canvas>')

  // The user edits by hand, and the next request carries the edit.
  await canvas.getByLabel('Texto do canvas').fill('# Plano\n\nPasso 1\nPasso 2')
  await canvas.getByLabel('Texto do canvas').evaluate((field: HTMLTextAreaElement) =>
    field.setSelectionRange(field.value.indexOf('Passo 2'), field.value.length),
  )
  await canvas.getByLabel('Pedir uma mudança').fill('detalhe')
  await canvas.getByLabel('Pedir uma mudança').press('Enter')
  await expect(page.locator('.message.user').last()).toContainText('Sobre este trecho do canvas:')
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible()
  const sent = provider.chats.at(-1)!.body.messages.at(-1).content
  expect(sent).toMatch(/^Sobre este trecho do canvas:\n\n> Passo 2\n\ndetalhe\n\n<canvas title="Plano"/)
  expect(sent).toContain('Passo 1\nPasso 2\n</canvas>')

  await canvas.getByRole('button', { name: 'Desfazer a última mudança' }).click()
  await expect(canvas.getByLabel('Texto do canvas')).toHaveValue('')
  // The canvas belongs to the chat and survives a reload.
  await canvas.getByLabel('Texto do canvas').fill('Guardado')
  await page.waitForTimeout(700)
  await page.reload()
  await chatRow(page, 'Saudação inicial').click()
  await page.getByRole('button', { name: 'Canvas', exact: true }).click()
  await expect(page.locator('.canvas').getByLabel('Texto do canvas')).toHaveValue('Guardado')
})

test('syncs through a folder and restores everything after a wipe', async ({ page }) => {
  // The origin's private file system stands in for a folder picked by the user.
  await page.addInitScript(() => {
    ;(window as any).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('sync', { create: true })
  })
  await connect(page)
  await send(page, 'para sincronizar')
  await expect(chatRow(page, 'Saudação inicial')).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await page.getByRole('tab', { name: 'Prompts salvos' }).click()
  await page.getByRole('button', { name: 'Novo prompt' }).click()
  await page.getByLabel('Título').fill('Guardado na pasta')
  await page.getByTitle('Fechar').click()

  await openSettings(page, 'Sincronização')
  await page.getByLabel('Senha da sincronização (opcional)').fill('segredo')
  await page.getByRole('button', { name: 'Escolher pasta' }).click()
  await expect(page.getByText('Pasta: sync')).toBeVisible()
  await page.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(page.locator('.sync-status')).toHaveText(/0 recebidos, 0 apagados|Última sincronização/)
  const files: string[] = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('sync')
    const names: string[] = []
    for await (const entry of (dir as any).values()) names.push(entry.name)
    return names.sort()
  })
  // The starter personas and prompts go too, each as a file of its own.
  expect(files.filter((name) => !name.includes('~starter-'))).toEqual([
    expect.stringMatching(/^chat~[\w-]+~\d+\.json$/),
    expect.stringMatching(/^item~prompt~[\w-]+~\d+\.json$/),
    'tsrs-sync.json',
  ])
  expect(files.filter((name) => name.includes('~starter-'))).toHaveLength(10)
  await closeSettings(page)

  page.on('dialog', (dialog) => dialog.accept())
  await openSettings(page, 'Dados')
  await page.getByRole('button', { name: 'Apagar tudo' }).click()
  await expect(composer(page)).toBeVisible()
  await expect(page.locator('.chat-item')).toHaveCount(0)

  await openSettings(page, 'Sincronização')
  await page.getByLabel('Senha da sincronização (opcional)').fill('errada')
  await page.getByRole('button', { name: 'Escolher pasta' }).click()
  await expect(page.locator('.sync-status')).toHaveText('Senha da sincronização incorreta.')
  await page.getByLabel('Senha da sincronização (opcional)').fill('segredo')
  await page.getByRole('button', { name: 'Sincronizar agora' }).click()
  await expect(page.locator('.sync-status')).toHaveText('0 enviados, 2 recebidos, 0 apagados.')
  await closeSettings(page)
  await chatRow(page, 'Saudação inicial').click()
  await expect(reply(page)).toContainText('Resposta 1.')
  await page.getByRole('button', { name: 'Prompts', exact: true }).click()
  await expect(page.locator('.menu')).toContainText('Guardado na pasta')
})

test('syncs two devices through a WebDAV server', async ({ page, browser }) => {
  const dav = await startMockWebdav('eddie', 'certa')
  try {
    await connect(page)
    await send(page, 'para o servidor')
    await expect(chatRow(page, 'Saudação inicial')).toBeVisible()

    async function connectDav(on: Page, password: string) {
      await openSettings(on, 'Sincronização')
      await on.getByRole('radio', { name: 'WebDAV' }).click()
      await on.getByLabel('Endereço da pasta').fill(`${dav.url}/tsrs`)
      await on.getByLabel('Usuário').fill('eddie')
      await on.getByLabel('Senha ou senha de app').fill(password)
      await on.getByRole('button', { name: 'Conectar', exact: true }).click()
    }
    await connectDav(page, 'errada')
    await expect(page.getByRole('alert')).toHaveText(/recusou o acesso \(401\)/)
    await page.getByLabel('Senha ou senha de app').fill('certa')
    await page.getByRole('button', { name: 'Conectar', exact: true }).click()
    await expect(page.getByText(`WebDAV: ${dav.url}/tsrs`)).toBeVisible()
    // The chat and the ten starter personas and prompts.
    await expect(page.locator('.sync-status')).toHaveText('11 enviados, 0 recebidos, 0 apagados.')
    const names = [...dav.files.keys()].sort()
    expect(names.filter((name) => !name.includes('~starter-'))).toEqual([
      expect.stringMatching(/^\/tsrs\/chat~[\w-]+~\d+\.json$/),
      '/tsrs/tsrs-sync.json',
    ])

    // Another device, with nothing of its own.
    const other = await (await browser.newContext()).newPage()
    await other.goto('/')
    await connectDav(other, 'certa')
    await expect(other.locator('.sync-status')).toHaveText('0 enviados, 1 recebidos, 0 apagados.')
    await closeSettings(other)
    await chatRow(other, 'Saudação inicial').click()
    await expect(reply(other)).toContainText('Resposta 1.')

    // Disconnecting forgets the server.
    await openSettings(other, 'Sincronização')
    await other.getByRole('button', { name: 'Desconectar' }).click()
    await expect(other.getByRole('button', { name: 'Conectar', exact: true })).toBeVisible()
    await expect(other.getByLabel('Endereço da pasta')).toHaveValue(`${dav.url}/tsrs`)
    await other.context().close()
  } finally {
    await dav.close()
  }
})

test.describe('English interface', () => {
  test.use({ locale: 'en-US' })

  test('starts with the starter library in English', async ({ page }) => {
    await page.goto('/')
    await page.getByTitle('Persona for this chat').click()
    await expect(page.getByRole('menuitemradio', { name: 'Copy editor' })).toBeVisible()
  })

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
