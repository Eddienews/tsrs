import { Check, Copy, PanelRightOpen } from 'lucide-react'
import {
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from 'react'
import ReactMarkdown, { type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { t } from './i18n'
import { PreviewContext, useCopy } from './Markdown'
import { previewable } from './preview'

const remarkPlugins = [remarkGfm]

// Syntax highlighting is most of the Markdown code, so it loads after the app
// opens; code blocks rendered before that get their colors when it arrives.
let rehypePlugins: Options['rehypePlugins'] = []
const highlighting = import('rehype-highlight').then(({ default: highlight }) => {
  rehypePlugins = [highlight]
})

function useRehypePlugins(): Options['rehypePlugins'] {
  const [plugins, setPlugins] = useState(rehypePlugins)
  useEffect(() => {
    if (plugins?.length) return
    let live = true
    highlighting.then(() => live && setPlugins(rehypePlugins))
    return () => {
      live = false
    }
  }, [plugins])
  return plugins
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

export default function MarkdownRenderer({ content }: { content: string }) {
  const rehypePlugins = useRehypePlugins()
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

