import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { t } from './i18n'
import { PROVIDERS } from './providers'
import type { Persona, SavedPrompt, Settings } from './types'

interface Props {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
  onClose: () => void
}

const hint = 'text-xs text-muted-foreground'

// A collapsible card whose header button shows the item name.
function Card(props: {
  name: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-md border">
      <button
        type="button"
        aria-expanded={props.expanded}
        onClick={props.onToggle}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        {props.expanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate">{props.name}</span>
      </button>
      {props.expanded && <div className="space-y-3 border-t p-3">{props.children}</div>}
    </div>
  )
}

export default function LibraryDialog({ settings, onChange, onClose }: Props) {
  // Items created while the dialog is open start expanded, ready to fill in.
  const [fresh, setFresh] = useState<string[]>([])
  // Items whose card was toggled by hand, which overrides the initial state.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  function create(): string {
    const id = crypto.randomUUID()
    setFresh((ids) => [...ids, id])
    return id
  }

  const isExpanded = (id: string) => toggled[id] ?? fresh.includes(id)
  const toggle = (id: string) => setToggled((s) => ({ ...s, [id]: !isExpanded(id) }))

  function patchPersona(id: string, fields: Partial<Persona>) {
    onChange((s) => ({
      ...s,
      personas: s.personas.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    }))
  }

  function patchPrompt(id: string, fields: Partial<SavedPrompt>) {
    onChange((s) => ({
      ...s,
      prompts: s.prompts.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    }))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Biblioteca')}</DialogTitle>
          <DialogDescription>{t('Personas e prompts reutilizáveis.')}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="personas" className="min-w-0">
          <TabsList>
            <TabsTrigger value="personas">Personas</TabsTrigger>
            <TabsTrigger value="prompts">{t('Prompts salvos')}</TabsTrigger>
          </TabsList>

          <TabsContent value="personas" className="space-y-3">
            <p className={hint}>
              {t(
                'Uma persona é um prompt de sistema com nome, opcionalmente ligado a um modelo. Escolha a persona de cada conversa na barra superior.',
              )}
            </p>
            {settings.personas.map((persona) => (
              <Card
                key={persona.id}
                name={persona.name || t('Sem nome')}
                expanded={isExpanded(persona.id)}
                onToggle={() => toggle(persona.id)}
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`name-${persona.id}`}>{t('Nome')}</Label>
                  <Input
                    id={`name-${persona.id}`}
                    value={persona.name}
                    onChange={(e) => patchPersona(persona.id, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`system-${persona.id}`}>{t('Prompt de sistema')}</Label>
                  <Textarea
                    id={`system-${persona.id}`}
                    rows={4}
                    className="font-mono text-xs"
                    value={persona.system}
                    onChange={(e) => patchPersona(persona.id, { system: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="select-native"
                    aria-label={t('Provedor da persona')}
                    value={persona.providerId ?? ''}
                    onChange={(e) =>
                      patchPersona(persona.id, {
                        providerId: e.target.value || undefined,
                        model: undefined,
                      })
                    }
                  >
                    <option value="">{t('Modelo atual da conversa')}</option>
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {persona.providerId && (
                    <Input
                      list={`models-${persona.id}`}
                      placeholder={t('Modelo')}
                      aria-label={t('Modelo')}
                      className="h-8 min-w-40 flex-1 font-mono text-xs"
                      value={persona.model ?? ''}
                      onChange={(e) => patchPersona(persona.id, { model: e.target.value.trim() })}
                    />
                  )}
                  <datalist id={`models-${persona.id}`}>
                    {(settings.providers[persona.providerId ?? '']?.models ?? []).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="ml-auto"
                    onClick={() =>
                      onChange((s) => ({
                        ...s,
                        personas: s.personas.filter((p) => p.id !== persona.id),
                      }))
                    }
                  >
                    {t('Excluir')}
                  </Button>
                </div>
              </Card>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                const id = create()
                onChange((s) => ({ ...s, personas: [...s.personas, { id, name: '', system: '' }] }))
              }}
            >
              <Plus className="size-3.5" />
              {t('Nova persona')}
            </Button>
          </TabsContent>

          <TabsContent value="prompts" className="space-y-3">
            <p className={hint}>
              {t('Textos prontos para inserir na mensagem pelo botão Prompts.')}{' '}
              {t('Use {{variável}} para campos preenchidos ao inserir o prompt.')}
            </p>
            {settings.prompts.map((prompt) => (
              <Card
                key={prompt.id}
                name={prompt.title || t('Sem título')}
                expanded={isExpanded(prompt.id)}
                onToggle={() => toggle(prompt.id)}
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`title-${prompt.id}`}>{t('Título')}</Label>
                  <Input
                    id={`title-${prompt.id}`}
                    value={prompt.title}
                    onChange={(e) => patchPrompt(prompt.id, { title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`text-${prompt.id}`}>{t('Texto')}</Label>
                  <Textarea
                    id={`text-${prompt.id}`}
                    rows={4}
                    className="font-mono text-xs"
                    value={prompt.text}
                    onChange={(e) => patchPrompt(prompt.id, { text: e.target.value })}
                  />
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    onChange((s) => ({
                      ...s,
                      prompts: s.prompts.filter((p) => p.id !== prompt.id),
                    }))
                  }
                >
                  {t('Excluir')}
                </Button>
              </Card>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                const id = create()
                onChange((s) => ({ ...s, prompts: [...s.prompts, { id, title: '', text: '' }] }))
              }}
            >
              <Plus className="size-3.5" />
              {t('Novo prompt')}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
