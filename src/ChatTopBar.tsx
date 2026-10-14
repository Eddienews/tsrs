import {
  AlertTriangle,
  ChevronDown,
  Menu,
  NotebookPen,
  PanelRight,
  SlidersHorizontal,
  UserRound,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
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
import type { Provider, Settings } from './types'
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
  onTools: () => void
  onParams: () => void
  onTogglePreview: () => void
  onToggleCanvas: () => void
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
            {context !== undefined && (
              <span className="hidden sm:inline">
                · {t('contexto {percent}%', { percent: Math.round(context * 100) })}
              </span>
            )}
          </div>
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
