import { expect, test } from 'vitest'
import { chatToHtml } from './exportHtml'

test('exports a conversation as a self-contained page', async () => {
  const html = await chatToHtml({
    id: 'c',
    title: 'Plano <b>',
    createdAt: 0,
    updatedAt: 0,
    providerId: 'anthropic',
    model: 'claude-haiku-5-5',
    messages: [
      { id: 'u', role: 'user', content: 'Oi <script>' },
      {
        id: 'a',
        role: 'assistant',
        content: '**Olá**\n\n```js\nconst x = 1\n```',
        model: 'claude-haiku-5-5',
        sources: [{ url: 'https://a.test', title: 'A' }],
      },
    ],
  })
  expect(html).toContain('<title>Plano &lt;b&gt;</title>')
  expect(html).toContain('Oi &lt;script&gt;')
  expect(html).toContain('<strong>Olá</strong>')
  expect(html).toContain('<span class="hljs-keyword">const</span>')
  expect(html).toContain('<a href="https://a.test">A</a>')
  expect(html).not.toMatch(/<script/i)
})
