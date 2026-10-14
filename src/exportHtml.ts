import { createElement, Fragment } from 'react'
import { t, locale } from './i18n'
import type { Chat } from './types'

// A self-contained page: styles inline, no scripts, readable offline and in
// light or dark mode.
const STYLE = `
:root { color-scheme: light dark; --bg: #faf8f5; --fg: #2a2723; --muted: #77716a; --border: #e2ddd5; --card: #f2efe9; --accent: #c26a1d }
@media (prefers-color-scheme: dark) { :root { --bg: #171614; --fg: #e9e5df; --muted: #9b958c; --border: #34312d; --card: #1f1d1a; --accent: #ee9240 } }
* { box-sizing: border-box }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.65 system-ui, sans-serif }
main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px }
header { border-bottom: 1px solid var(--border); margin-bottom: 24px; padding-bottom: 12px }
h1.title { font-size: 1.4rem; margin: 0 }
.meta, .role, .usage { color: var(--muted); font-size: 12px }
article { margin: 0 0 28px }
article.user .body { background: var(--card); border-radius: 8px; padding: 8px 14px; white-space: pre-wrap }
.role { font-weight: 600; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px }
pre { background: var(--card); border: 1px solid var(--border); border-radius: 6px; overflow-x: auto; padding: 12px; font-size: 13px }
code { font-family: ui-monospace, monospace; font-size: .9em }
:not(pre) > code { background: var(--card); padding: 1px 4px; border-radius: 3px }
table { border-collapse: collapse; width: 100% } th, td { border: 1px solid var(--border); padding: 4px 8px; text-align: left }
a { color: var(--accent) } blockquote { border-left: 2px solid var(--border); margin: 0; padding-left: 12px; color: var(--muted) }
.sources { font-size: 13px } .attachments { color: var(--muted); font-size: 13px }
.hljs-keyword, .hljs-built_in { color: #b4472f } .hljs-string { color: #3f7d4f } .hljs-number, .hljs-literal { color: #4359a8 }
.hljs-comment { color: var(--muted); font-style: italic } .hljs-tag, .hljs-name, .hljs-title, .hljs-attr { color: #2a72a1 }
`

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function chatToHtml(chat: Chat): Promise<string> {
  const [{ renderToStaticMarkup }, { default: Markdown }, { default: remarkGfm }, { default: rehypeHighlight }] =
    await Promise.all([
      import('react-dom/server'),
      import('react-markdown'),
      import('remark-gfm'),
      import('rehype-highlight'),
    ])
  const markdown = (text: string) =>
    renderToStaticMarkup(
      createElement(Fragment, null, createElement(Markdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHighlight] }, text)),
    )
  const date = new Date(chat.updatedAt).toLocaleString(locale())
  const articles = chat.messages
    .filter((m) => m.content || m.attachments?.length)
    .map((m) => {
      const who = m.role === 'user' ? t('Você') : (m.model ?? t('Assistente'))
      const attachments = m.attachments?.length
        ? `<p class="attachments">${escape(t('Anexos: {names}', { names: m.attachments.map((a) => a.name).join(', ') }))}</p>`
        : ''
      const body = m.role === 'user' ? escape(m.content) : markdown(m.content)
      const sources = m.sources?.length
        ? `<div class="sources"><strong>${escape(t('Fontes'))}</strong><ol>${m.sources
            .map((s) => `<li><a href="${escape(s.url)}">${escape(s.title || s.url)}</a></li>`)
            .join('')}</ol></div>`
        : ''
      return `<article class="${m.role}"><div class="role">${escape(who)}</div>${attachments}<div class="body">${body}</div>${sources}</article>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="${locale()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(chat.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header><h1 class="title">${escape(chat.title)}</h1><div class="meta">${escape(chat.model)} · ${escape(date)} · TSRS</div></header>
${articles}
</main>
</body>
</html>
`
}
