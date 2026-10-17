import { createContext, lazy, memo, Suspense, useState } from 'react'

// Opens a code block in the preview panel; absent where there is no panel.
export const PreviewContext = createContext<((code: string, lang: string) => void) | null>(null)

// Opens a page or drawing of the conversation's project folder in the preview,
// by its path there; absent when the conversation has no folder.
export const FileContext = createContext<((file: string) => void) | null>(null)

// A path inside the project that the preview shows: a page or a drawing.
export const PREVIEW_FILE = /^(?:\.\/)?[\w-]+(?:\/[\w.-]+)*\.(?:html?|svg)$/i

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return [copied, copy]
}

// The Markdown parser is a large part of the app, and the first screen shows
// none; it starts loading at once and replies shown before it arrives appear
// as plain text for that moment.
const loading = import('./MarkdownRenderer')
const Renderer = lazy(() => loading)

function Markdown({ content }: { content: string }) {
  return (
    <Suspense
      fallback={<div className="prose-tsrs whitespace-pre-wrap text-[0.95rem]">{content}</div>}
    >
      <Renderer content={content} />
    </Suspense>
  )
}

export default memo(Markdown)
