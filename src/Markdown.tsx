import { Check, Copy, PanelRightOpen } from 'lucide-react'
import {
  createContext,
  isValidElement,
  memo,
  useContext,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { t } from './i18n'
import { previewable } from './preview'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

// Opens a code block in the preview panel; absent where there is no panel.
export const PreviewContext = createContext<((code: string, lang: string) => void) | null>(null)

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

function CodeBlock({ node, children, ...props }: ComponentProps<'pre'> & { node?: unknown }) {
  void node
  const ref = useRef<HTMLPreElement>(null)
  const [copied, copy] = useCopy()
  const openPreview = useContext(PreviewContext)
  const code = (Array.isArray(children) ? children[0] : children) as ReactElement<{
    className?: string
  }>
  const lang = isValidElement(code)
    ? (/language-([\w-]+)/.exec(code.props.className ?? '')?.[1] ?? '')
    : ''
  const text = () => (ref.current?.innerText ?? '').replace(/\n$/, '')

  return (
    <div className="my-3 overflow-hidden rounded-md border bg-code">
      <div className="flex items-center justify-between border-b px-3 py-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {lang || 'text'}
        </span>
        <div className="flex items-center gap-1">
          {openPreview && previewable(lang) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => openPreview(text(), lang)}
            >
              <PanelRightOpen className="size-3.5" /> {t('Abrir preview')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => copy(text())}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t('Copiado') : t('Copiar')}
          </Button>
        </div>
      </div>
      <pre
        ref={ref}
        {...props}
        className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed"
      >
        {children}
      </pre>
    </div>
  )
}

const components = { pre: CodeBlock }

function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-tsrs text-[0.95rem]">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)
