import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, FileText, Paperclip, Plus, Sparkles, Trash2, X } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { readAttachment } from './files'
import KnowledgeTab, { type KnowledgeProps } from './KnowledgeTab'
import { t } from './i18n'
import { listPlugins, listSkills, type Plugin, type Skill } from './extensions'
import { PROVIDERS, getProvider } from './providers'
import { missingStarters } from './starters'
import CommunityGallery from './CommunityGallery'
import type { AgentParams, Memory, Persona, PersonaTools, SavedPrompt, Settings } from './types'

// Settings live in localStorage, which holds a few megabytes at most.
const MAX_AGENT_FILES = 2_000_000

type Props = KnowledgeProps & {
  onClose: () => void
}

const hint = 'text-xs text-muted-foreground'

function Check(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  )
}

const number = (value: string) => (value.trim() === '' ? undefined : Number(value))

// Temperature, output limit and reasoning effort of an agent; empty means the
// default, and a conversation's own values win.
function AgentParamsFields({
  persona,
  settings,
  onPatch,
}: {
  persona: Persona
  settings: Settings
  onPatch: (fields: Partial<Persona>) => void
}) {
  const params = persona.params ?? {}
  const provider = getProvider(persona.providerId ?? settings.providerId)
  const set = (fields: Partial<AgentParams>) => {
    const next = { ...params, ...fields }
    const empty = next.temperature === undefined && next.maxTokens === undefined && !next.effort
    onPatch({ params: empty ? undefined : next })
  }
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{t('Parâmetros do agente')}</div>
      <div className="flex flex-wrap gap-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t('Temperatura')}</span>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            aria-label={t('Temperatura do agente')}
            placeholder={t('padrão')}
            className="h-8 w-24 font-mono text-xs"
            value={params.temperature ?? ''}
            onChange={(e) => set({ temperature: number(e.target.value) })}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t('Máximo de tokens')}</span>
          <Input
            type="number"
            min={1}
            step={1}
            aria-label={t('Máximo de tokens do agente')}
            placeholder={t('padrão')}
            className="h-8 w-28 font-mono text-xs"
            value={params.maxTokens ?? ''}
            onChange={(e) => set({ maxTokens: number(e.target.value) })}
          />
        </label>
        {provider.efforts.length > 0 && (
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t('Nível de raciocínio')}</span>
            <select
              aria-label={t('Nível de raciocínio do agente')}
              className="select-native block h-8"
              value={params.effort ?? ''}
              onChange={(e) => set({ effort: e.target.value || undefined })}
            >
              <option value="">{t('padrão')}</option>
              {provider.efforts.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className={hint}>{t('Valem nas conversas do agente que não definiram os próprios parâmetros.')}</p>
    </div>
  )
}

// The skills and plugins an agent uses: all that are on, or a chosen few.
function AgentExtensions({ persona, onPatch }: { persona: Persona; onPatch: (fields: Partial<Persona>) => void }) {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [plugins, setPlugins] = useState<Plugin[]>([])
  useEffect(() => {
    Promise.all([listSkills().catch(() => []), listPlugins().catch(() => [] as Plugin[])]).then(([s, p]) => {
      setSkills(s)
      setPlugins(p)
    })
  }, [])
  // A TSRS without its server has no extensions to choose from.
  if (!skills || (!skills.length && !plugins.length)) return null
  const choosing = !!persona.skills || !!persona.plugins
  const toggle = <K extends 'skills' | 'plugins'>(key: K, id: string, on: boolean) => {
    const list = persona[key] ?? []
    onPatch({ [key]: on ? [...list, id] : list.filter((x) => x !== id) } as Partial<Persona>)
  }
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-4 text-sm font-medium">
        {t('Escolher skills e plugins')}
        <Switch
          aria-label={t('Escolher skills e plugins')}
          checked={choosing}
          onCheckedChange={(on) => onPatch(on ? { skills: [], plugins: [] } : { skills: undefined, plugins: undefined })}
        />
      </label>
      {choosing ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {skills.map((skill) => (
            <Check
              key={skill.id}
              label={`${t('Skill')}: ${skill.name}`}
              checked={!!persona.skills?.includes(skill.id)}
              onChange={(on) => toggle('skills', skill.id, on)}
            />
          ))}
          {plugins.map((plugin) => (
            <Check
              key={plugin.name}
              label={`${t('Plugin')}: ${plugin.name}`}
              checked={!!persona.plugins?.includes(plugin.name)}
              onChange={(on) => toggle('plugins', plugin.name, on)}
            />
          ))}
        </div>
      ) : (
        <p className={hint}>{t('Desligado, o agente usa todas as skills e plugins ligados em Extensões.')}</p>
      )}
    </div>
  )
}

// What turns a persona into an agent: its own tools, files and starters.
function AgentFields({
  persona,
  settings,
  onPatch,
}: {
  persona: Persona
  settings: Settings
  onPatch: (fields: Partial<Persona>) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const tools = persona.tools
  const files = persona.files ?? []
  const setTools = (fields: Partial<PersonaTools>) =>
    tools && onPatch({ tools: { ...tools, ...fields } })

  async function attach(list: File[]) {
    setError('')
    let added = [...files]
    for (const file of list) {
      try {
        const attachment = await readAttachment(file)
        const size = [...added, attachment].reduce((sum, a) => sum + a.data.length, 0)
        if (size > MAX_AGENT_FILES) {
          throw new Error(t('Os arquivos de uma persona somam no máximo cerca de 1,5 MB.'))
        }
        added = [...added, attachment]
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    onPatch({ files: added })
  }

  return (
    <>
      <AgentParamsFields persona={persona} settings={settings} onPatch={onPatch} />
      <AgentExtensions persona={persona} onPatch={onPatch} />
      <div className="space-y-2">
        <label className="flex items-center justify-between gap-4 text-sm font-medium">
          {t('Ferramentas próprias')}
          <Switch
            aria-label={t('Ferramentas próprias')}
            checked={!!tools}
            onCheckedChange={(on) =>
              onPatch({
                tools: on
                  ? {
                      webSearch: settings.webSearch,
                      webFetch: settings.webFetch,
                      mcpServers: settings.mcpServers.filter((s) => s.enabled).map((s) => s.id),
                    }
                  : undefined,
              })
            }
          />
        </label>
        {tools ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <Check
              label={t('Busca na web')}
              checked={tools.webSearch}
              onChange={(webSearch) => setTools({ webSearch })}
            />
            <Check
              label={t('Leitura de página')}
              checked={tools.webFetch}
              onChange={(webFetch) => setTools({ webFetch })}
            />
            {settings.mcpServers.map((server) => (
              <Check
                key={server.id}
                label={server.name || server.url}
                checked={tools.mcpServers.includes(server.id)}
                onChange={(on) =>
                  setTools({
                    mcpServers: on
                      ? [...tools.mcpServers, server.id]
                      : tools.mcpServers.filter((id) => id !== server.id),
                  })
                }
              />
            ))}
          </div>
        ) : (
          <p className={hint}>
            {t('Desligado, a persona usa as ferramentas ligadas para todas as conversas.')}
          </p>
        )}
      </div>

      {settings.knowledgeBases.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-medium">{t('Bases de conhecimento')}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {settings.knowledgeBases.map((base) => (
              <Check
                key={base.id}
                label={base.name || t('Sem nome')}
                checked={!!persona.knowledge?.includes(base.id)}
                onChange={(on) =>
                  onPatch({
                    knowledge: on
                      ? [...(persona.knowledge ?? []), base.id]
                      : persona.knowledge?.filter((id) => id !== base.id),
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="text-sm font-medium">{t('Arquivos')}</div>
        <p className={hint}>{t('Enviados com a primeira mensagem de cada pedido, como contexto.')}</p>
        {files.map((file) => (
          <div key={file.id} className="flex items-center gap-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button
              aria-label={t('Remover anexo')}
              title={t('Remover anexo')}
              className="rounded p-0.5 hover:bg-accent"
              onClick={() => onPatch({ files: files.filter((f) => f.id !== file.id) })}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip className="size-3.5" />
          {t('Anexar arquivos')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            attach([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`starters-${persona.id}`}>{t('Sugestões iniciais (uma por linha)')}</Label>
        <Textarea
          id={`starters-${persona.id}`}
          rows={3}
          className="text-sm"
          value={(persona.starters ?? []).join('\n')}
          onChange={(e) => onPatch({ starters: e.target.value.split('\n') })}
        />
      </div>
    </>
  )
}

function MemoryTab({ settings, onChange }: Pick<Props, 'settings' | 'onChange'>) {
  const patch = (id: string, text: string) =>
    onChange((s) => ({ ...s, memories: s.memories.map((m) => (m.id === id ? { ...m, text } : m)) }))
  const remove = (id: string) =>
    onChange((s) => ({ ...s, memories: s.memories.filter((m) => m.id !== id) }))
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
        {t('Usar memória')}
        <Switch
          aria-label={t('Usar memória')}
          checked={settings.memory}
          onCheckedChange={(memory) => onChange((s) => ({ ...s, memory }))}
        />
      </label>
      <p className={hint}>
        {t(
          'Ligada, o modelo recebe esta lista em toda conversa e pode acrescentar ou apagar fatos sozinho quando você pedir ou quando achar útil. Precisa de um modelo que use ferramentas.',
        )}
      </p>
      {settings.memories.map((memory: Memory) => (
        <div key={memory.id} className="flex items-center gap-2">
          <Input
            aria-label={t('Fato')}
            value={memory.text}
            onChange={(e) => patch(memory.id, e.target.value)}
            onBlur={(e) => !e.target.value.trim() && remove(memory.id)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={t('Esquecer')}
            title={t('Esquecer')}
            onClick={() => remove(memory.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      {!settings.memories.length && <p className={hint}>{t('Nenhum fato guardado ainda.')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() =>
            onChange((s) => ({
              ...s,
              memories: [...s.memories, { id: crypto.randomUUID(), text: '', createdAt: Date.now() }],
            }))
          }
        >
          <Plus className="size-3.5" />
          {t('Novo fato')}
        </Button>
        {settings.memories.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() =>
              confirm(t('Esquecer todos os fatos?')) && onChange((s) => ({ ...s, memories: [] }))
            }
          >
            {t('Esquecer tudo')}
          </Button>
        )}
      </div>
    </div>
  )
}

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

export default function LibraryDialog(props: Props) {
  const { settings, onChange, onClose } = props
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

  const missing = missingStarters(settings, settings.language)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Biblioteca')}</DialogTitle>
          <DialogDescription>{t('Personas, prompts, memória e conhecimento.')}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="personas" className="min-w-0">
          <TabsList>
            <TabsTrigger value="personas">Personas</TabsTrigger>
            <TabsTrigger value="prompts">{t('Prompts salvos')}</TabsTrigger>
            <TabsTrigger value="memory">{t('Memória')}</TabsTrigger>
            <TabsTrigger value="knowledge">{t('Conhecimento')}</TabsTrigger>
          </TabsList>

          <TabsContent value="knowledge">
            <KnowledgeTab {...props} />
          </TabsContent>

          <TabsContent value="memory">
            <MemoryTab settings={settings} onChange={onChange} />
          </TabsContent>

          <TabsContent value="personas" className="space-y-3">
            <p className={hint}>
              {t(
                'Uma persona é um prompt de sistema com nome, opcionalmente ligado a um modelo. Com ferramentas, arquivos e sugestões próprias, vira um agente. Escolha a persona de cada conversa na barra superior.',
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
                </div>
                <AgentFields
                  persona={persona}
                  settings={settings}
                  onPatch={(fields) => patchPersona(persona.id, fields)}
                />
                <div className="flex justify-end">
                  <Button
                    variant="destructive"
                    size="sm"
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
            {missing.personas.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 gap-1"
                onClick={() => onChange((s) => ({ ...s, personas: [...s.personas, ...missing.personas] }))}
              >
                <Sparkles className="size-3.5" />
                {t('Adicionar as personas prontas ({count})', { count: missing.personas.length })}
              </Button>
            )}
          </TabsContent>

          <TabsContent value="prompts" className="space-y-3">
            <p className={hint}>
              {t('Textos prontos para inserir na mensagem pelo botão Prompts.')}{' '}
              {t('Use {{variável}} para campos preenchidos ao inserir o prompt.')}{' '}
              {t('Com etapas, o prompt vira um encadeamento: cada etapa é enviada quando a resposta anterior termina, e {{resposta}} traz essa resposta.')}
            </p>
            <CommunityGallery
              language={settings.language}
              prompts={settings.prompts}
              onAdd={(added) =>
                onChange((s) => ({ ...s, prompts: [...s.prompts, ...added.filter((p) => !s.prompts.some((x) => x.id === p.id))] }))
              }
            />
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
                {(prompt.steps ?? []).map((step, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`step-${prompt.id}-${i}`}>{t('Etapa {n}', { n: i + 2 })}</Label>
                      <button
                        aria-label={t('Remover a etapa {n}', { n: i + 2 })}
                        title={t('Remover a etapa {n}', { n: i + 2 })}
                        className="rounded p-0.5 hover:bg-accent"
                        onClick={() => patchPrompt(prompt.id, { steps: prompt.steps?.filter((_, j) => j !== i) })}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <Textarea
                      id={`step-${prompt.id}-${i}`}
                      rows={3}
                      className="font-mono text-xs"
                      placeholder={t('Ex.: Revise {{resposta}} e deixe mais curto.')}
                      value={step}
                      onChange={(e) =>
                        patchPrompt(prompt.id, { steps: prompt.steps?.map((s, j) => (j === i ? e.target.value : s)) })
                      }
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => patchPrompt(prompt.id, { steps: [...(prompt.steps ?? []), ''] })}
                >
                  <Plus className="size-3.5" />
                  {t('Adicionar etapa')}
                </Button>
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
            {missing.prompts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 gap-1"
                onClick={() => onChange((s) => ({ ...s, prompts: [...s.prompts, ...missing.prompts] }))}
              >
                <Sparkles className="size-3.5" />
                {t('Adicionar os prompts prontos ({count})', { count: missing.prompts.length })}
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
