import { CalendarClock, CheckSquare, Clock, Columns3, Plus, Square, Terminal, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Task } from './agenda'
import { columnName, dueSoon, isLate, loadBoard, stageCounts, type Board } from './board'
import { cliStatus, type CliStatus } from './cliAgents'
import { formatWhen, locale, t } from './i18n'
import { addFocus, focusToday, greeting, recentWork, removeFocus, scheduleResults, todayTasks, toggleFocus } from './mission'
import PageHeader from './PageHeader'
import { PROVIDERS } from './providers'
import { usageReport } from './report'
import type { Chat, ChatMeta, ModelInfo, Settings, StudioPage } from './types'
import { formatCost, formatTokens } from './usage'

interface Props {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
  chats: ChatMeta[]
  // Reads every conversation, messages included, for today's usage.
  load: () => Promise<Chat[]>
  price?: (providerId: string, model: string) => ModelInfo
  onOpenChat: (id: string) => void
  onNewChat: () => void
  onOpenPage: (page: StudioPage) => void
  onBack: () => void
  showMenu: boolean
  onMenu: () => void
}

function Panel(props: { title: string; icon: typeof Clock; action?: ReactNode; children: ReactNode; className?: string }) {
  const Icon = props.icon
  return (
    <section aria-label={props.title} className={cn('mission-panel min-w-0 rounded-md border bg-card p-3', props.className)}>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {props.title}
        <span className="ml-auto normal-case tracking-normal">{props.action}</span>
      </h2>
      {props.children}
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg leading-tight">{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
    </div>
  )
}

const empty = 'text-sm text-muted-foreground'

// The day at a glance: what to do, what runs, what is in production, what the
// agents can still do, and what was worked on lately.
export default function MissionView(props: Props) {
  const { settings, onChange, chats } = props
  const [now, setNow] = useState(() => Date.now())
  const [allChats, setAllChats] = useState<Chat[] | null>(null)
  const [board, setBoard] = useState<Board | null | undefined>(undefined)
  const [tasks, setTasks] = useState<Task[] | null | undefined>(undefined)
  const [agents, setAgents] = useState<CliStatus[] | null>(null)
  const [adding, setAdding] = useState('')

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    props.load().then(setAllChats, () => setAllChats([]))
    loadBoard().then(setBoard, () => setBoard(null))
    import('./agenda')
      .then(({ loadAgenda }) => loadAgenda())
      .then((state) => setTasks(state.tasks), () => setTasks(null))
    const clis = PROVIDERS.filter((p) => p.format === 'cli' && p.cli)
    Promise.all(clis.map((p) => cliStatus(p.cli!, settings.providers[p.id]?.baseUrl).catch((err) => ({ agent: p.cli!, ok: false, error: String(err?.message ?? err) }))))
      .then(setAgents)
    // Read once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = useMemo(() => allChats && usageReport(allChats, 1, now, props.price).total, [allChats, now, props.price])
  const week = useMemo(() => allChats && usageReport(allChats, 7, now, props.price).total, [allChats, now, props.price])
  const focus = focusToday(settings.focus ?? [], now)
  const setFocus = (change: (items: NonNullable<Settings['focus']>) => NonNullable<Settings['focus']>) =>
    onChange((s) => ({ ...s, focus: change(s.focus ?? []) }))
  const runs = tasks ? todayTasks(tasks, now) : []
  const answered = scheduleResults(chats, now)
  const recent = recentWork(chats, now)
  const date = new Date(now).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })
  const time = new Date(now).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  const agentName = (agent: string) => PROVIDERS.find((p) => p.cli === agent)?.name ?? agent

  return (
    <div className="mission-view flex h-full min-w-0 flex-col bg-background">
      <PageHeader title={t('Painel do dia')} onBack={props.onBack} showMenu={props.showMenu} onMenu={props.onMenu} />
      <div className="@container min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {date} · {time}
            </div>
            <h2 className="mt-1 text-2xl font-semibold">{greeting(new Date(now).getHours())}</h2>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={props.onNewChat}>
              <Plus className="size-4" />
              {t('Nova conversa')}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => props.onOpenPage('board')}>
              <Columns3 className="size-4" />
              {t('Quadro de produção')}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => props.onOpenPage('table')}>
              <Users className="size-4" />
              {t('Mesa de agentes')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4" aria-label={t('Uso')}>
          <Stat label={t('Respostas hoje')} value={today ? String(today.replies) : '…'} />
          <Stat label={t('Tokens hoje')} value={today ? formatTokens(today.input + today.output) : '…'} />
          <Stat label={t('Custo hoje')} value={!today ? '…' : today.cost !== undefined ? formatCost(today.cost) : '—'} />
          <Stat label={t('Custo em 7 dias')} value={!week ? '…' : week.cost !== undefined ? formatCost(week.cost) : '—'} />
        </div>

        <div className="grid gap-3 @3xl:grid-cols-2">
          <Panel title={t('Foco de hoje')} icon={CheckSquare}>
            <ul className="space-y-1">
              {focus.map((item) => (
                <li key={item.id} className="group flex items-center gap-2 text-sm">
                  <button
                    role="checkbox"
                    aria-checked={item.done}
                    aria-label={item.text}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setFocus((items) => toggleFocus(items, item.id))}
                  >
                    {item.done ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                  </button>
                  <span className={cn('min-w-0 flex-1', item.done && 'text-muted-foreground line-through')}>{item.text}</span>
                  <button
                    aria-label={t('Remover {name}', { name: item.text })}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={() => setFocus((items) => removeFocus(items, item.id))}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            {focus.length === 0 && <p className={empty}>{t('Nada ainda: anote a primeira coisa do dia.')}</p>}
            <form
              className="mt-2"
              onSubmit={(e) => {
                e.preventDefault()
                setFocus((items) => addFocus(items, adding))
                setAdding('')
              }}
            >
              <Input
                className="h-8 text-sm"
                aria-label={t('Adicionar ao foco de hoje')}
                placeholder={t('Adicionar ao foco de hoje…')}
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
              />
            </form>
          </Panel>

          <Panel title={t('Agenda de hoje')} icon={Clock}>
            {tasks === null ? (
              <p className={empty}>{t('A agenda precisa do servidor local do TSRS (npm run dev).')}</p>
            ) : runs.length === 0 && answered.length === 0 ? (
              <p className={empty}>{tasks === undefined ? t('Carregando…') : t('Nenhuma tarefa agendada para hoje.')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {runs.map(({ task, at, ran }) => (
                  <li key={task.id} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                      {new Date(at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{task.name}</span>
                    <span className={cn('text-xs', ran && task.lastError ? 'text-destructive' : 'text-muted-foreground')}>
                      {ran ? (task.lastError ? t('falhou') : t('feito')) : t('a seguir')}
                    </span>
                  </li>
                ))}
                {answered.map((chat) => (
                  <li key={chat.id}>
                    <button className="truncate text-left text-xs text-primary hover:underline" onClick={() => props.onOpenChat(chat.id)}>
                      {t('Ver respostas: {title}', { title: chat.title })}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={t('Produção')}
            icon={Columns3}
            action={
              <button className="text-xs text-primary hover:underline" onClick={() => props.onOpenPage('board')}>
                {t('Abrir o quadro')}
              </button>
            }
          >
            {board === null ? (
              <p className={empty}>{t('O quadro precisa do servidor local do TSRS (npm run dev).')}</p>
            ) : !board ? (
              <p className={empty}>{t('Carregando…')}</p>
            ) : board.cards.length === 0 ? (
              <p className={empty}>{t('O quadro está vazio. Crie um card para cada episódio ou anúncio.')}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5" aria-label={t('Cards por etapa')}>
                  {stageCounts(board).map(({ column, count }) => (
                    <span key={column.id} className={cn('rounded border px-2 py-0.5 text-xs', count === 0 && 'text-muted-foreground')}>
                      {columnName(column)} <span className="font-mono font-medium">{count}</span>
                    </span>
                  ))}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {dueSoon(board, now).map((card) => (
                    <li key={card.id} className="flex items-center gap-2">
                      <CalendarClock className={cn('size-3.5 shrink-0', isLate(card, now) ? 'text-destructive' : 'text-muted-foreground')} />
                      <span className="min-w-0 flex-1 truncate">{card.title}</span>
                      <span className={cn('text-xs', isLate(card, now) ? 'text-destructive' : 'text-muted-foreground')}>
                        {new Date(`${card.due}T12:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <Panel title={t('Agentes de linha de comando')} icon={Terminal}>
            {!agents ? (
              <p className={empty}>{t('Carregando…')}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {agents.map((agent) => (
                  <li key={agent.agent} className="flex items-center gap-2">
                    <span className={cn('size-1.5 shrink-0 rounded-full', agent.ok ? 'bg-success' : 'bg-muted-foreground')} />
                    <span className="font-medium">{agentName(agent.agent)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {agent.ok ? agent.version : t('não encontrado')}
                    </span>
                    {agent.limit?.used !== undefined && (
                      <span className="text-xs text-muted-foreground" title={t('Uso do limite do plano, segundo o próprio agente')}>
                        {t('{used}% do limite', { used: Math.round(agent.limit.used * 100) })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t('Trabalho recente')} icon={Clock} className="@3xl:col-span-2">
            {recent.length === 0 ? (
              <p className={empty}>{t('Nenhuma conversa nos últimos 7 dias.')}</p>
            ) : (
              <ul className="grid gap-1 text-sm @xl:grid-cols-2">
                {recent.map((chat) => (
                  <li key={chat.id}>
                    <button
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-accent"
                      onClick={() => props.onOpenChat(chat.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                      {chat.project && <span className="truncate font-mono text-[11px] text-muted-foreground">{chat.project.name}</span>}
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatWhen(chat.updatedAt, now)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
