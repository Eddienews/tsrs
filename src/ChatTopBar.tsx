import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Eraser,
  FolderOpen,
  Menu,
  MessageSquareDashed,
  NotebookPen,
  PanelRight,
  SlidersHorizontal,
  UserRound,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { t } from './i18n'
import { PROVIDERS } from './providers'
import { fileUrl, listFiles } from './projects'
import type { ChatProject, Provider, Settings } from './types'
import { Input } from '@/components/ui/input'
import { CONTEXT_WARNING, formatCost, formatTokens, modelInfo, type Totals } from './usage'

interface Props {
  settings: Settings
  provider: Provider
  // Persona of the conversation, when it still exists.
  personaId: string
  // Tokens and cost of the conversation so far.
  spent: Totals
  // Share of the model's context the conversation occupies, when known.
  context?: number
  // Number of tools the model can use with the current provider.
  activeTools: number
  paramsOpen: boolean
  previewOpen: boolean
  canvasOpen: boolean
  showMenu: boolean
  onMenu: () => void
  onModel: (providerId: string, model: string) => void
  onPersona: (id: string) => void
  // Saves the price typed for a model whose price is not known; null removes it.
  onPrice: (providerId: string, model: string, price: { inputPrice: number; outputPrice: number } | null) => void
  onTools: () => void
  onParams: () => void
  onTogglePreview: () => void
  onToggleCanvas: () => void
  // The folder where the conversation saves its files, once it has one.
  project?: ChatProject
  onOpenUrl: (url: string, name: string) => void
  onMoveProject: (path: string) => Promise<void>
  // The conversation is temporary, or the next one will be.
  temporary: boolean
  // Absent once the conversation has started: it stays what it is.
  onToggleTemporary?: () => void
  // Clears the context from here on; absent when there is nothing to clear.
  onClearContext?: () => void
}

// Asks for a model's price when neither the provider nor the app knows it, so
// the conversation's cost can be shown.
function PriceButton(p: Pick<Props, 'settings' | 'provider' | 'onPrice'>) {
  const model = p.settings.model
  const typed = p.settings.modelPrices?.[`${p.provider.id}/${model}`]
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const valid = (text: string) => text.trim() !== '' && Number(text.replace(',', '.')) >= 0
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setInput(typed ? String(typed.inputPrice) : '')
          setOutput(typed ? String(typed.outputPrice) : '')
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="underline underline-offset-2 hover:text-foreground"
          title={t('Informar o preço de {model} para ver o custo', { model })}
        >
          {typed ? t('preço informado') : t('definir preço')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 text-xs">
        <p className="font-medium">{t('Preço de {model}', { model })}</p>
        <p className="text-muted-foreground">
          {t(
            'O provedor não informa o preço deste modelo. Copie da página de preços dele, em dólares por milhão de tokens; o custo da conversa passa a aparecer.',
          )}
        </p>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid(input) || !valid(output)) return
            p.onPrice(p.provider.id, model, {
              inputPrice: Number(input.replace(',', '.')),
              outputPrice: Number(output.replace(',', '.')),
            })
            setOpen(false)
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span>{t('Entrada (US$)')}</span>
              <Input inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span>{t('Saída (US$)')}</span>
              <Input inputMode="decimal" value={output} onChange={(e) => setOutput(e.target.value)} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            {typed && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  p.onPrice(p.provider.id, model, null)
                  setOpen(false)
                }}
              >
                {t('Remover')}
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!valid(input) || !valid(output)}>
              {t('Salvar')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

// The conversation's folder: where it is, what is in it, and moving it.
function ProjectButton(p: {
  project: ChatProject
  onOpenUrl: Props['onOpenUrl']
  onMoveProject: Props['onMoveProject']
}) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<{ name: string; size: number }[] | null>(null)
  const [error, setError] = useState('')
  const [path, setPath] = useState('')
  const [moving, setMoving] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!open) return
    setFiles(null)
    setError('')
    listFiles(p.project.path)
      .then(setFiles)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [open, p.project.path])
  const pages = (files ?? []).filter((f) => /\.(html?|svg)$/i.test(f.name))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="project h-8 max-w-48 gap-1.5 text-xs"
          title={t('Pasta do projeto: {path}', { path: p.project.path })}
        >
          <FolderOpen className="size-3.5 shrink-0" />
          <span className="truncate">{p.project.name}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3 text-xs">
        <div className="space-y-1">
          <p className="font-medium">{t('Pasta do projeto')}</p>
          <div className="flex items-center gap-1">
            <code className="min-w-0 flex-1 select-all break-all rounded bg-code px-2 py-1 font-mono text-[11px]">
              {p.project.path}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={t('Copiar o caminho')}
              title={copied ? t('Copiado') : t('Copiar o caminho')}
              onClick={() => {
                void navigator.clipboard.writeText(p.project.path)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <p className="text-muted-foreground">
            {t(
              'Os arquivos que a conversa cria ficam aqui. Abra esta pasta no Claude Code, no Codex ou num editor para continuar; o TSRS lê a versão atual.',
            )}
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-medium">{t('Arquivos')}</p>
          {error && <p className="text-destructive">{error}</p>}
          {!files && !error && <p className="text-muted-foreground">{t('Carregando…')}</p>}
          {files && files.length === 0 && <p className="text-muted-foreground">{t('Ainda vazia.')}</p>}
          <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-[11px]">
            {(files ?? []).map((f) => (
              <li key={f.name} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {pages.includes(f) && (
                  <button
                    className="shrink-0 text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      p.onOpenUrl(fileUrl(p.project.path, f.name), f.name)
                      setOpen(false)
                    }}
                  >
                    {t('Abrir no preview')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <form
          className="space-y-1"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!path.trim()) return
            setMoving(true)
            setError('')
            try {
              await p.onMoveProject(path.trim())
              setPath('')
              setOpen(false)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setMoving(false)
            }
          }}
        >
          <p className="font-medium">{t('Usar outra pasta')}</p>
          <div className="flex gap-1">
            <Input
              aria-label={t('Caminho da outra pasta')}
              placeholder={'C:\\Users\\voce\\Sites\\nwlab'}
              className="h-8 font-mono text-[11px]"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <Button type="submit" size="sm" className="h-8" disabled={moving || !path.trim()}>
              {t('Usar')}
            </Button>
          </div>
          <p className="text-muted-foreground">{t('Os arquivos atuais são copiados para lá.')}</p>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function ModelPicker({ settings, onModel }: Pick<Props, 'settings' | 'onModel'>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const typed = query.trim()
  const pick = (providerId: string, model: string) => {
    onModel(providerId, model)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-full gap-1.5 font-mono text-xs"
          aria-label={t('Escolher modelo')}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
          <span className="truncate">{settings.model || t('Escolher modelo')}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput
            placeholder={t('Buscar ou digitar um modelo…')}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{t('Nenhum modelo encontrado.')}</CommandEmpty>
            {PROVIDERS.map((p) => {
              const conn = settings.providers[p.id]
              const ready = !!conn.baseUrl && (!p.keyRequired || !!conn.apiKey || !!settings.vault)
              // A model the list does not have can still be used by typing its name.
              const custom = typed && !conn.models.includes(typed) ? typed : ''
              return (
                <CommandGroup
                  key={p.id}
                  heading={
                    <span className="flex items-center gap-1.5">
                      {p.name}
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          ready ? 'bg-success' : 'bg-muted-foreground',
                        )}
                      />
                    </span>
                  }
                >
                  {conn.models.map((model) => {
                    const info = modelInfo(settings, p.id, model)
                    return (
                      <CommandItem
                        key={model}
                        value={`${p.name} ${model}`}
                        onSelect={() => pick(p.id, model)}
                      >
                        <span className="truncate font-mono text-xs">{model}</span>
                        {info.context && (
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                            {formatTokens(info.context)}
                            {info.inputPrice !== undefined &&
                              ` · $${info.inputPrice}/$${info.outputPrice}`}
                          </span>
                        )}
                      </CommandItem>
                    )
                  })}
                  {custom && (
                    <CommandItem value={`${p.name} ${custom} *`} onSelect={() => pick(p.id, custom)}>
                      <span className="truncate text-xs">
                        {t('Usar “{model}”', { model: custom })}
                      </span>
                    </CommandItem>
                  )}
                  {!custom && conn.models.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {t('Digite o nome do modelo ou carregue a lista nas configurações.')}
                    </div>
                  )}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default function ChatTopBar(p: Props) {
  const { settings, spent, context } = p
  const persona = settings.personas.find((x) => x.id === p.personaId)
  const warn = context !== undefined && context >= CONTEXT_WARNING
  const info = modelInfo(settings, p.provider.id, settings.model)
  const priceUnknown =
    !!settings.model &&
    // Local models (Ollama, LM Studio) need no key and cost nothing.
    (p.provider.keyRequired || !!settings.providers[p.provider.id]?.apiKey) &&
    spent.cost === undefined &&
    (info.inputPrice === undefined || info.outputPrice === undefined)

  return (
    <header className="toolbar flex flex-wrap items-center gap-1.5 border-b px-2 py-1.5">
      {p.showMenu && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('Abrir a lista de conversas')}
          onClick={p.onMenu}
        >
          <Menu className="size-4" />
        </Button>
      )}
      <span className="hidden text-xs text-muted-foreground lg:inline">{p.provider.name}</span>
      <ModelPicker settings={settings} onModel={p.onModel} />
      {settings.personas.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              title={t('Persona desta conversa')}
            >
              <UserRound className="size-3.5" />
              {persona ? persona.name || t('Sem nome') : t('Sem persona')}
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={persona?.id ?? ''} onValueChange={p.onPersona}>
              <DropdownMenuRadioItem value="">{t('Sem persona')}</DropdownMenuRadioItem>
              {settings.personas.map((x) => (
                <DropdownMenuRadioItem key={x.id} value={x.id}>
                  {x.name || t('Sem nome')}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {p.project && (
          <ProjectButton project={p.project} onOpenUrl={p.onOpenUrl} onMoveProject={p.onMoveProject} />
        )}
        {spent.tokens > 0 && (
          <div
            className={cn(
              'usage flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] text-muted-foreground',
              warn && 'bg-warning/10 text-warning',
            )}
            title={t('Total de tokens e custo estimado desta conversa')}
          >
            {warn && <AlertTriangle className="size-3.5" />}
            <span>{formatTokens(spent.tokens)} tokens</span>
            {spent.cost !== undefined && <span>· {formatCost(spent.cost)}</span>}
            {(priceUnknown || p.settings.modelPrices?.[`${p.provider.id}/${p.settings.model}`]) && (
              <span>
                · <PriceButton settings={p.settings} provider={p.provider} onPrice={p.onPrice} />
              </span>
            )}
            {context !== undefined && (
              <span className="hidden sm:inline">
                · {t('contexto {percent}%', { percent: Math.round(context * 100) })}
              </span>
            )}
          </div>
        )}
        {p.onClearContext && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('Limpar o contexto')}
            title={t('Limpar o contexto: o modelo deixa de ver as mensagens anteriores')}
            onClick={p.onClearContext}
          >
            <Eraser className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label={t('Ferramentas')}
          onClick={p.onTools}
        >
          <Wrench className="size-3.5" />
          <span className="hidden sm:inline">{t('Ferramentas')}</span>
          {p.activeTools > 0 && (
            <span className="rounded bg-primary px-1 font-mono text-[10px] text-primary-foreground">
              {p.activeTools}
            </span>
          )}
        </Button>
        {p.onToggleTemporary ? (
          <Button
            variant={p.temporary ? 'secondary' : 'ghost'}
            size="icon"
            className="size-8"
            aria-label={t('Conversa temporária')}
            title={t('Conversa temporária')}
            aria-pressed={p.temporary}
            onClick={p.onToggleTemporary}
          >
            <MessageSquareDashed className="size-4" />
          </Button>
        ) : (
          p.temporary && (
            <span
              className="flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground"
              title={t('Conversa temporária')}
            >
              <MessageSquareDashed className="size-3.5" />
              <span className="hidden sm:inline">{t('Temporária')}</span>
            </span>
          )
        )}
        <Button
          variant={p.paramsOpen ? 'secondary' : 'ghost'}
          size="icon"
          className="size-8"
          aria-label={t('Parâmetros')}
          title={t('Parâmetros')}
          onClick={p.onParams}
        >
          <SlidersHorizontal className="size-4" />
        </Button>
        <Button
          variant={p.canvasOpen ? 'secondary' : 'ghost'}
          size="icon"
          className="size-8"
          aria-label={t('Canvas')}
          title={t('Canvas')}
          aria-pressed={p.canvasOpen}
          onClick={p.onToggleCanvas}
        >
          <NotebookPen className="size-4" />
        </Button>
        <Button
          variant={p.previewOpen ? 'secondary' : 'ghost'}
          size="icon"
          className="size-8"
          aria-label={t('Preview')}
          title={t('Preview')}
          aria-pressed={p.previewOpen}
          onClick={p.onTogglePreview}
        >
          <PanelRight className="size-4" />
        </Button>
      </div>
    </header>
  )
}
