import {
  Check,
  Copy,
  Download,
  Eye,
  PanelRightOpen,
  Pencil,
  SendHorizontal,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { download, fileName } from './files'
import { t } from './i18n'
import Markdown, { useCopy } from './Markdown'
import { fenced, previewable } from './preview'
import type { Canvas } from './types'

const LANGUAGES = [
  'markdown',
  'text',
  'html',
  'css',
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'json',
  'sql',
  'bash',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
]

const EXTENSIONS: Record<string, string> = {
  markdown: 'md',
  text: 'txt',
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  bash: 'sh',
  rust: 'rs',
}

interface Props {
  canvas: Canvas
  // True while a reply streams; the text is read-only meanwhile, since the
  // model may be changing it.
  busy: boolean
  // Why a request cannot be sent now, if it cannot.
  blocked?: string
  onChange: (canvas: Canvas) => void
  onUndo: () => void
  // Sends a request about the canvas to the chat; `selection` is the part
  // of the text it is about, if any.
  onAsk: (request: string, selection: string) => void
  onPreview: (lang: string, code: string) => void
  onDiscard: () => void
  onClose: () => void
}

export default function CanvasPanel(p: Props) {
  const { canvas } = p
  const [mode, setMode] = useState<'edit' | 'view'>('edit')
  const [request, setRequest] = useState('')
  const [copied, copy] = useCopy()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const languages = LANGUAGES.includes(canvas.lang) ? LANGUAGES : [...LANGUAGES, canvas.lang]
  const icon = 'size-7'

  function ask() {
    const text = request.trim()
    if (!text || p.busy || p.blocked) return
    const field = fieldRef.current
    const selection =
      mode === 'edit' && field ? field.value.slice(field.selectionStart, field.selectionEnd).trim() : ''
    p.onAsk(text, selection)
    setRequest('')
  }

  return (
    <section aria-label={t('Canvas')} className="canvas flex h-full flex-col bg-surface">
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <input
          aria-label={t('Título do canvas')}
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm font-medium outline-none"
          value={canvas.title}
          onChange={(e) => p.onChange({ ...canvas, title: e.target.value })}
        />
        <select
          aria-label={t('Linguagem')}
          className="select-native h-7 text-xs"
          value={canvas.lang}
          onChange={(e) => p.onChange({ ...canvas, lang: e.target.value })}
        >
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang === 'markdown' ? t('Documento') : lang}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="icon"
          className={icon}
          aria-label={mode === 'edit' ? t('Ver formatado') : t('Editar')}
          title={mode === 'edit' ? t('Ver formatado') : t('Editar')}
          onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
        >
          {mode === 'edit' ? <Eye className="size-3.5" /> : <Pencil className="size-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={icon}
          aria-label={t('Desfazer a última mudança')}
          title={t('Desfazer a última mudança')}
          disabled={p.busy || !canvas.previous?.length}
          onClick={p.onUndo}
        >
          <Undo2 className="size-3.5" />
        </Button>
        {previewable(canvas.lang) && canvas.lang !== 'markdown' && (
          <Button
            variant="ghost"
            size="icon"
            className={icon}
            aria-label={t('Abrir preview')}
            title={t('Abrir preview')}
            onClick={() => p.onPreview(canvas.lang, canvas.content)}
          >
            <PanelRightOpen className="size-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={icon}
          aria-label={copied ? t('Copiado') : t('Copiar')}
          title={copied ? t('Copiado') : t('Copiar')}
          onClick={() => copy(canvas.content)}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={icon}
          aria-label={t('Baixar')}
          title={t('Baixar')}
          onClick={() =>
            download(
              fileName(canvas.title, EXTENSIONS[canvas.lang] ?? canvas.lang),
              canvas.content,
              'text/plain',
            )
          }
        >
          <Download className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={icon}
          aria-label={t('Descartar o canvas')}
          title={t('Descartar o canvas')}
          disabled={p.busy}
          onClick={p.onDiscard}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={t('Fechar o canvas')}
          title={t('Fechar o canvas')}
          onClick={p.onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'edit' ? (
          <textarea
            ref={fieldRef}
            aria-label={t('Texto do canvas')}
            readOnly={p.busy}
            spellCheck={canvas.lang === 'markdown' || canvas.lang === 'text'}
            placeholder={t('Escreva aqui, ou peça ao modelo para escrever.')}
            className={
              'block h-full w-full resize-none bg-background p-4 outline-none ' +
              (canvas.lang === 'markdown' || canvas.lang === 'text'
                ? 'text-[0.95rem] leading-relaxed'
                : 'font-mono text-[12.5px] leading-relaxed')
            }
            value={canvas.content}
            onChange={(e) => p.onChange({ ...canvas, content: e.target.value })}
          />
        ) : (
          <div className="px-4 py-2">
            <Markdown
              content={
                canvas.lang === 'markdown' ? canvas.content : fenced(canvas.lang, canvas.content)
              }
            />
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-1 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault()
          ask()
        }}
      >
        <input
          aria-label={t('Pedir uma mudança')}
          placeholder={
            p.blocked ??
            t('Peça uma mudança (selecione um trecho para mudar só ele)')
          }
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:border-ring"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        />
        <Button
          size="icon"
          className="size-8"
          aria-label={t('Pedir')}
          title={t('Pedir')}
          disabled={!request.trim() || p.busy || !!p.blocked}
        >
          <SendHorizontal className="size-3.5" />
        </Button>
      </form>
    </section>
  )
}
