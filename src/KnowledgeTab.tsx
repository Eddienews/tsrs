import { FileText, Loader2, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from './i18n'
import { search } from './knowledge'
import type { KnowledgeBase, KnowledgeDoc, Settings } from './types'
import { formatTokens } from './usage'

export interface KnowledgeProps {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
  docs: KnowledgeDoc[]
  // Resolves to the problems met, one per file that could not be added.
  onAddDocs: (baseId: string, files: File[]) => Promise<string[]>
  onDeleteDoc: (id: string) => void
  onDeleteBase: (base: KnowledgeBase) => void
}

const hint = 'text-xs text-muted-foreground'

function BaseCard(props: KnowledgeProps & { base: KnowledgeBase }) {
  const { base, docs: all } = props
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const docs = all.filter((d) => d.baseId === base.id)
  const hits = query.trim() ? search(docs, query, 3) : []

  async function add(files: File[]) {
    if (!files.length) return
    setBusy(true)
    setProblems(await props.onAddDocs(base.id, files))
    setBusy(false)
  }

  return (
    <div className="knowledge-base space-y-3 rounded-md border p-3" data-base={base.id}>
      <div className="flex items-center gap-2">
        <Input
          aria-label={t('Nome da base')}
          placeholder={t('Nome da base')}
          value={base.name}
          onChange={(e) =>
            props.onChange((s) => ({
              ...s,
              knowledgeBases: s.knowledgeBases.map((b) =>
                b.id === base.id ? { ...b, name: e.target.value } : b,
              ),
            }))
          }
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={t('Excluir a base')}
          title={t('Excluir a base')}
          onClick={() => props.onDeleteBase(base)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center gap-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{doc.name}</span>
          <span className={hint}>
            {t('{count} trechos', { count: formatTokens(doc.chunks.length) })}
          </span>
          <button
            aria-label={t('Remover {name}', { name: doc.name })}
            title={t('Remover')}
            className="rounded p-0.5 hover:bg-accent"
            onClick={() => props.onDeleteDoc(doc.id)}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      {!docs.length && <p className={hint}>{t('Nenhum documento ainda.')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {busy ? t('Lendo os arquivos…') : t('Adicionar documentos')}
        </Button>
        <span className={hint}>{t('PDF, texto, Markdown, HTML, CSV, código…')}</span>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          aria-label={t('Adicionar documentos')}
          onChange={(e) => {
            add([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>
      {problems.map((problem) => (
        <p key={problem} role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      ))}
      {docs.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              aria-label={t('Testar uma busca')}
              placeholder={t('Testar uma busca')}
              className="h-8 pl-8 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {hits.map((hit, i) => (
            <div key={i} className="search-hit rounded border bg-card p-2 text-xs">
              <div className="mb-1 font-medium">{hit.name}</div>
              <p className="line-clamp-3 text-muted-foreground">{hit.text}</p>
            </div>
          ))}
          {query.trim() && !hits.length && <p className={hint}>{t('Nenhum trecho encontrado.')}</p>}
        </div>
      )}
    </div>
  )
}

export default function KnowledgeTab(props: KnowledgeProps) {
  return (
    <div className="space-y-3">
      <p className={hint}>
        {t(
          'Documentos guardados neste navegador e buscados por palavras, sem API. Ligue uma base numa conversa (em Parâmetros) ou numa persona, e os trechos que mais combinam com cada pergunta vão junto com ela.',
        )}
      </p>
      {props.settings.knowledgeBases.map((base) => (
        <BaseCard key={base.id} {...props} base={base} />
      ))}
      <Button
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={() =>
          props.onChange((s) => ({
            ...s,
            knowledgeBases: [...s.knowledgeBases, { id: crypto.randomUUID(), name: '' }],
          }))
        }
      >
        <Plus className="size-3.5" />
        {t('Nova base')}
      </Button>
    </div>
  )
}
