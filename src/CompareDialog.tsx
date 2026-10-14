import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { t } from './i18n'
import { PROVIDERS, getProvider } from './providers'
import type { Settings } from './types'

// Columns beside the current reply.
export const MAX_COMPARED = 3
// Rows listed at once; the search narrows a long list.
const MAX_ROWS = 50

interface Target {
  providerId: string
  model: string
}

interface Props {
  settings: Settings
  onCompare: (targets: Target[]) => void
  onClose: () => void
}

const same = (a: Target, b: Target) => a.providerId === b.providerId && a.model === b.model

// Picks the models that will write other versions of a reply, all at once.
export default function CompareDialog({ settings, onCompare, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<Target[]>([])
  const needle = query.trim().toLowerCase()
  const known: Target[] = PROVIDERS.flatMap((p) =>
    settings.providers[p.id].models.map((model) => ({ providerId: p.id, model })),
  )
  const matches = known.filter(
    (target) =>
      !needle ||
      target.model.toLowerCase().includes(needle) ||
      getProvider(target.providerId).name.toLowerCase().includes(needle),
  )
  // A model missing from the lists is used with the conversation's provider.
  const typed = query.trim()
  const custom =
    typed && !known.some((target) => target.model === typed)
      ? { providerId: settings.providerId, model: typed }
      : null
  const full = chosen.length >= MAX_COMPARED

  function toggle(target: Target) {
    if (chosen.some((c) => same(c, target))) setChosen(chosen.filter((c) => !same(c, target)))
    else if (!full) setChosen([...chosen, target])
  }

  function row(target: Target, label?: string) {
    const selected = chosen.some((c) => same(c, target))
    return (
      <button
        key={`${target.providerId}/${target.model}`}
        type="button"
        role="checkbox"
        aria-checked={selected}
        disabled={!selected && full}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
        onClick={() => toggle(target)}
      >
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-sm border',
            selected && 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {selected && <Check className="size-3" />}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{label ?? target.model}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {getProvider(target.providerId).name}
        </span>
      </button>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog narrow sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Comparar com outros modelos')}</DialogTitle>
          <DialogDescription>
            {t(
              'Até {count} modelos respondem à mesma pergunta ao mesmo tempo. As respostas ficam lado a lado e o modelo da conversa não muda.',
              { count: MAX_COMPARED },
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (chosen.length) onCompare(chosen)
            else if (custom) onCompare([custom])
          }}
        >
          <Input
            autoFocus
            placeholder={t('Buscar ou digitar um modelo…')}
            aria-label={t('Modelo')}
            className="font-mono text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {chosen.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chosen.map((target) => (
                <span
                  key={`${target.providerId}/${target.model}`}
                  className="flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {target.model}
                  <button
                    type="button"
                    aria-label={t('Remover {model}', { model: target.model })}
                    className="rounded hover:bg-accent"
                    onClick={() => toggle(target)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {custom &&
              row(
                custom,
                t('Usar “{model}”', { model: custom.model }),
              )}
            {matches.slice(0, MAX_ROWS).map((target) => row(target))}
            {!custom && matches.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {t('Nenhum modelo encontrado.')}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 pt-1 sm:space-x-0">
            <span className="mr-auto self-center font-mono text-xs text-muted-foreground">
              {t('{count} colunas', { count: chosen.length + 1 })}
            </span>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('Cancelar')}
            </Button>
            <Button type="submit" disabled={!chosen.length && !custom}>
              {t('Gerar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
