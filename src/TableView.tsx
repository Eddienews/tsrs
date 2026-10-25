import { MessageSquarePlus, Pencil, Play, Plus, Square, Trash2, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { agentParams } from './agents'
import { MAX_ROUNDS, newTable, runTable, seated, tableMarkdown, type TableTurn } from './agentTable'
import { t } from './i18n'
import Markdown from './Markdown'
import PageHeader from './PageHeader'
import { openProject, projectsRoot, saveFiles } from './projects'
import { connection, getProvider } from './providers'
import { streamChat } from './stream'
import type { AgentTable, ChatProject, Persona, Settings } from './types'
import { formatTokens } from './usage'

interface Props {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
  // Keeps a finished run as a conversation and opens it.
  onSaveChat: (run: { table: AgentTable; task: string; turns: TableTurn[]; project?: ChatProject }) => void
  onBack: () => void
  showMenu: boolean
  onMenu: () => void
}

const field = 'block space-y-1 text-sm'

// The agent table: pick or set up a table, give it a task, watch the agents work.
export default function TableView({ settings, onChange, onSaveChat, onBack, showMenu, onMenu }: Props) {
  const tables = settings.tables ?? []
  const [tableId, setTableId] = useState(tables[0]?.id ?? '')
  const [editing, setEditing] = useState<AgentTable | null>(null)
  const [task, setTask] = useState('')
  const [turns, setTurns] = useState<TableTurn[]>([])
  const [running, setRunning] = useState(false)
  const [asked, setAsked] = useState('')
  const [project, setProject] = useState<ChatProject | undefined>()
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const table = tables.find((x) => x.id === tableId) ?? tables[0]
  const members = table ? seated(table, settings.personas) : []

  function saveTable(next: AgentTable) {
    onChange((s) => {
      const list = s.tables ?? []
      return { ...s, tables: list.some((x) => x.id === next.id) ? list.map((x) => (x.id === next.id ? next : x)) : [...list, next] }
    })
    setTableId(next.id)
    setEditing(null)
  }

  async function start() {
    if (!table || !task.trim() || running) return
    const stop = new AbortController()
    abort.current = stop
    setRunning(true)
    setError('')
    setTurns([])
    setAsked(task.trim())
    const runId = crypto.randomUUID()
    // The run gets a project folder, where coding agents work and the result is kept.
    let folder: ChatProject | undefined
    if (settings.projects !== false && (await projectsRoot())) {
      folder = await openProject({ name: `mesa ${table.name} ${task.trim().slice(0, 40)}` }).catch(() => undefined)
    }
    setProject(folder)
    const done: TableTurn[] = []
    try {
      const events = runTable(table, task.trim(), {
        personas: settings.personas,
        fallback: { providerId: settings.providerId, model: settings.model },
        request: (persona: Persona, providerId: string) => {
          const via = getProvider(providerId)
          const params = agentParams(undefined, persona)
          return {
            ...connection(settings, providerId),
            params: { ...params, effort: via.efforts.includes(params.effort ?? '') ? params.effort : undefined },
            signal: stop.signal,
            ...(via.format === 'cli' ? { cli: { chatId: `mesa-${runId}-${persona.id}`, ...(folder ? { cwd: folder.path } : {}) } } : {}),
          }
        },
        stream: streamChat,
        signal: stop.signal,
      })
      for await (const event of events) {
        if (event.type === 'start') {
          done.push(event.turn)
          setTurns((list) => [...list, event.turn])
        } else {
          const patch = (turn: TableTurn): TableTurn =>
            event.type === 'text'
              ? { ...turn, text: turn.text + event.text }
              : event.type === 'usage'
                ? { ...turn, usage: event.usage }
                : event.type === 'error'
                  ? { ...turn, error: event.error }
                  : turn
          const at = done.findIndex((turn) => turn.id === event.id)
          if (at >= 0) done[at] = patch(done[at])
          setTurns((list) => list.map((turn) => (turn.id === event.id ? patch(turn) : turn)))
        }
      }
      if (folder) await saveFiles(folder.path, [{ name: 'mesa.md', content: tableMarkdown(table, task.trim(), done) }])
    } catch (err) {
      if (!stop.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      abort.current = null
    }
  }

  return (
    <div className="table-view flex h-full min-w-0 flex-col bg-background">
      <PageHeader title={t('Mesa de agentes')} onBack={onBack} showMenu={showMenu} onMenu={onMenu}>
        {tables.length > 0 && (
          <select
            aria-label={t('Mesa')}
            className="select-native h-8 text-xs"
            value={table?.id ?? ''}
            disabled={running}
            onChange={(e) => setTableId(e.target.value)}
          >
            {tables.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
        {table && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" disabled={running} onClick={() => setEditing(table)}>
            <Pencil className="size-4" />
            {t('Editar mesa')}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" disabled={running} onClick={() => setEditing(newTable(t('Nova mesa')))}>
          <Plus className="size-4" />
          {t('Nova mesa')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {editing ? (
          <TableEditor
            table={editing}
            personas={settings.personas}
            onSave={saveTable}
            onDelete={
              tables.some((x) => x.id === editing.id)
                ? () => {
                    onChange((s) => ({ ...s, tables: (s.tables ?? []).filter((x) => x.id !== editing.id) }))
                    setTableId('')
                    setEditing(null)
                  }
                : undefined
            }
            onCancel={() => setEditing(null)}
          />
        ) : !table ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
            <Users className="size-8 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t('Agentes trabalhando juntos')}</h2>
            <p className="text-sm text-muted-foreground">
              {t(
                'Monte uma mesa com agentes da Biblioteca, cada um com seu papel. Eles trabalham na mesma tarefa em rodadas, lendo o que os outros escreveram, e um coordenador junta tudo no resultado.',
              )}
            </p>
            <Button className="gap-1.5" onClick={() => setEditing(newTable(t('Nova mesa')))}>
              <Plus className="size-4" />
              {t('Criar mesa')}
            </Button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 p-4">
            <div className="flex flex-wrap gap-1.5 text-xs" aria-label={t('Quem está na mesa')}>
              {members.map(({ member, persona }) => (
                <span key={member.personaId} className="rounded-full border px-2 py-0.5">
                  <span className="font-medium">{persona.name}</span>
                  {member.role && <span className="text-muted-foreground"> · {member.role}</span>}
                </span>
              ))}
              {table.coordinatorId && (
                <span className="rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-primary">
                  {t('Coordenação: {name}', { name: settings.personas.find((p) => p.id === table.coordinatorId)?.name ?? '?' })}
                </span>
              )}
              <span className="px-1 py-0.5 text-muted-foreground">
                {table.rounds === 1 ? t('1 rodada') : t('{count} rodadas', { count: table.rounds })}
              </span>
            </div>
            {members.length === 0 && (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {t('Esta mesa ainda não tem agentes. Edite a mesa e escolha agentes da Biblioteca.')}
              </p>
            )}
            <label className={field}>
              <span className="font-medium">{t('Tarefa')}</span>
              <Textarea
                rows={4}
                value={task}
                disabled={running}
                placeholder={t('Ex.: Proponha três ganchos para o próximo episódio do Seu Silva e escreva o melhor.')}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void start()
                }}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {running ? (
                <Button variant="outline" className="gap-1.5" onClick={() => abort.current?.abort()}>
                  <Square className="size-4" />
                  {t('Parar')}
                </Button>
              ) : (
                <Button className="gap-1.5" disabled={!task.trim() || members.length === 0} onClick={() => void start()}>
                  <Play className="size-4" />
                  {t('Começar')}
                </Button>
              )}
              {!running && turns.length > 0 && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => onSaveChat({ table, task: asked, turns, project })}
                >
                  <MessageSquarePlus className="size-4" />
                  {t('Salvar como conversa')}
                </Button>
              )}
              {project && !running && turns.length > 0 && (
                <span className="text-xs text-muted-foreground">{t('Registro salvo em {path}', { path: `${project.name}/mesa.md` })}</span>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <ol className="space-y-3">
              {turns.map((turn) => (
                <li
                  key={turn.id}
                  className={cn('table-turn rounded-md border bg-card p-3', turn.round === 0 && 'border-primary/50')}
                  aria-label={turn.name}
                >
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="text-sm font-medium text-foreground">{turn.name}</span>
                    <span>{turn.round ? `${turn.role || t('membro')} · ${t('rodada {number}', { number: turn.round })}` : t('resultado')}</span>
                    <span className="ml-auto font-mono">
                      {turn.model}
                      {turn.usage && ` · ${formatTokens(turn.usage.input + turn.usage.output)}`}
                    </span>
                  </div>
                  {turn.error ? (
                    <p className="text-sm text-destructive">{turn.error}</p>
                  ) : turn.text ? (
                    <Markdown content={turn.text} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('Pensando…')}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}

// Who sits at the table, in what role, who coordinates, and how many rounds.
function TableEditor(props: {
  table: AgentTable
  personas: Persona[]
  onSave: (table: AgentTable) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const [table, setTable] = useState(props.table)
  const set = (patch: Partial<AgentTable>) => setTable((x) => ({ ...x, ...patch }))
  const free = props.personas.filter((p) => !table.members.some((m) => m.personaId === p.id))
  const label = (p: Persona) => {
    const model = p.model ? ` · ${getProvider(p.providerId ?? '').name} ${p.model}` : ''
    return `${p.name || t('Sem nome')}${model}`
  }
  return (
    <div className="table-editor mx-auto max-w-2xl space-y-4 p-4">
      <label className={field}>
        <span className="font-medium">{t('Nome da mesa')}</span>
        <Input value={table.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="space-y-2">
        <div className="text-sm font-medium">{t('Agentes')}</div>
        {table.members.map((member, i) => {
          const persona = props.personas.find((p) => p.id === member.personaId)
          return (
            <div key={member.personaId} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-sm" title={persona ? label(persona) : undefined}>
                {persona?.name ?? t('Agente removido')}
              </span>
              <Input
                aria-label={t('Papel de {name}', { name: persona?.name ?? '' })}
                placeholder={t('Papel na mesa (ex.: pesquisa, roteiro, revisão)')}
                value={member.role}
                onChange={(e) =>
                  set({ members: table.members.map((m, j) => (j === i ? { ...m, role: e.target.value } : m)) })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('Tirar {name} da mesa', { name: persona?.name ?? '' })}
                onClick={() => set({ members: table.members.filter((_, j) => j !== i) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )
        })}
        {free.length > 0 ? (
          <select
            aria-label={t('Adicionar agente')}
            className="select-native w-full"
            value=""
            onChange={(e) => e.target.value && set({ members: [...table.members, { personaId: e.target.value, role: '' }] })}
          >
            <option value="">{t('Adicionar agente…')}</option>
            {free.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted-foreground">{t('Todos os agentes da Biblioteca já estão na mesa.')}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {t('Cada agente responde com o modelo dele; sem modelo próprio, com o modelo escolhido agora. Um agente com Claude Code ou Codex trabalha na pasta da mesa.')}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-medium">{t('Coordenador')}</span>
          <select
            aria-label={t('Coordenador')}
            className="select-native w-full"
            value={table.coordinatorId ?? ''}
            onChange={(e) => set({ coordinatorId: e.target.value || undefined })}
          >
            <option value="">{t('Nenhum: a última rodada é o resultado')}</option>
            {props.personas.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className="font-medium">{t('Rodadas')}</span>
          <select
            aria-label={t('Rodadas')}
            className="select-native w-full"
            value={table.rounds}
            onChange={(e) => set({ rounds: Number(e.target.value) })}
          >
            {Array.from({ length: MAX_ROUNDS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={field}>
        <span className="font-medium">{t('Como a mesa trabalha')}</span>
        <Textarea
          rows={3}
          value={table.instructions ?? ''}
          placeholder={t('Opcional. Ex.: Somos a sala de roteiro da NorthWindLab. Episódios de 90 s, humor seco.')}
          onChange={(e) => set({ instructions: e.target.value || undefined })}
        />
      </label>
      <div className="flex items-center gap-2">
        {props.onDelete && (
          <Button variant="ghost" className="text-destructive" onClick={props.onDelete}>
            {t('Excluir mesa')}
          </Button>
        )}
        <Button variant="ghost" className="ml-auto" onClick={props.onCancel}>
          {t('Cancelar')}
        </Button>
        <Button disabled={!table.name.trim()} onClick={() => props.onSave({ ...table, name: table.name.trim() })}>
          {t('Salvar')}
        </Button>
      </div>
    </div>
  )
}
