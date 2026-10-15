import { useEffect, useState } from 'react'
import { Play, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  describeSchedule,
  forgetKey,
  loadAgenda,
  removeTask,
  runTask,
  saveTask,
  weekdayNames,
  type AgendaState,
  type Schedule,
  type Task,
} from './agenda'
import { locale, t } from './i18n'
import { PROVIDERS } from './providers'
import type { Settings } from './types'

interface Props {
  settings: Settings
  // The model of the open conversation, offered first.
  providerId: string
  model: string
  // Keys are password-protected and not unlocked: they cannot be handed over.
  locked: boolean
  // Results were imported or a task ran: the conversations may have changed.
  onRan: () => void
}

const hint = 'text-xs text-muted-foreground'

// A local date and time for <input type="datetime-local">, an hour from now.
function soon(): string {
  const at = new Date(Date.now() + 3_600_000)
  at.setSeconds(0, 0)
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function TaskForm(p: Props & { task?: Task; hasKey: (providerId: string) => boolean; keysFile: string; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(p.task?.name ?? '')
  const [prompt, setPrompt] = useState(p.task?.prompt ?? '')
  const [target, setTarget] = useState(`${p.task?.providerId ?? p.providerId}/${p.task?.model ?? p.model}`)
  const [kind, setKind] = useState<Schedule['kind']>(p.task?.schedule.kind ?? 'daily')
  const [at, setAt] = useState(p.task?.schedule.kind === 'once' ? p.task.schedule.at.slice(0, 16) : soon())
  const [time, setTime] = useState(p.task?.schedule.kind === 'daily' ? p.task.schedule.time : '08:00')
  const [days, setDays] = useState<number[]>(p.task?.schedule.kind === 'daily' ? (p.task.schedule.days ?? []) : [])
  const [hours, setHours] = useState(p.task?.schedule.kind === 'interval' ? String(p.task.schedule.hours) : '6')
  const [keep, setKeep] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [providerId, ...rest] = target.split('/')
  const model = rest.join('/')
  const provider = PROVIDERS.find((x) => x.id === providerId)
  const conn = p.settings.providers[providerId]
  const needsKey = !!provider?.keyRequired && !p.hasKey(providerId)
  const options = PROVIDERS.flatMap((x) => {
    const c = p.settings.providers[x.id]
    const ready = !!c?.baseUrl && (!x.keyRequired || !!c.apiKey || p.hasKey(x.id))
    return ready ? c.models.map((m) => ({ value: `${x.id}/${m}`, label: `${x.name} · ${m}` })) : []
  })
  if (!options.some((o) => o.value === target)) options.unshift({ value: target, label: `${provider?.name ?? providerId} · ${model}` })

  async function submit() {
    setError('')
    if (needsKey && !keep) return setError(t('Para a tarefa rodar com a aba fechada, permita guardar a chave neste computador.'))
    if (needsKey && !conn?.apiKey) return setError(p.locked ? t('Desbloqueie as chaves primeiro.') : t('Este provedor não tem chave nas Configurações.'))
    const schedule: Schedule =
      kind === 'once'
        ? { kind, at: new Date(at).toISOString() }
        : kind === 'interval'
          ? { kind, hours: Math.max(1, Number(hours) || 1) }
          : { kind, time, ...(days.length ? { days } : {}) }
    setBusy(true)
    try {
      await saveTask(
        { id: p.task?.id, name, prompt, providerId, model, baseUrl: conn?.baseUrl, schedule, enabled: p.task?.enabled ?? true },
        needsKey ? { apiKey: conn!.apiKey } : undefined,
      )
      p.onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="task-form space-y-2 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Input aria-label={t('Nome da tarefa')} placeholder={t('Nome, como Resumo das notícias')} value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea
        aria-label={t('O que pedir ao modelo')}
        placeholder={t('O que pedir ao modelo no horário')}
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <select aria-label={t('Modelo da tarefa')} className="select-native w-full" value={target} onChange={(e) => setTarget(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('Quando')} className="select-native" value={kind} onChange={(e) => setKind(e.target.value as Schedule['kind'])}>
          <option value="daily">{t('Todo dia / dias da semana')}</option>
          <option value="interval">{t('A cada tantas horas')}</option>
          <option value="once">{t('Uma vez')}</option>
        </select>
        {kind === 'once' && <Input aria-label={t('Data e hora')} type="datetime-local" className="w-56" value={at} onChange={(e) => setAt(e.target.value)} />}
        {kind === 'daily' && <Input aria-label={t('Horário')} type="time" className="w-32" value={time} onChange={(e) => setTime(e.target.value)} />}
        {kind === 'interval' && (
          <label className="flex items-center gap-1 text-sm">
            <Input aria-label={t('Horas')} type="number" min={1} className="w-20" value={hours} onChange={(e) => setHours(e.target.value)} />
            {t('horas')}
          </label>
        )}
      </div>
      {kind === 'daily' && (
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('Dias da semana')}>
          {weekdayNames().map((label, day) => (
            <button
              key={day}
              type="button"
              aria-pressed={days.includes(day)}
              className={`rounded border px-2 py-0.5 text-xs ${days.includes(day) ? 'border-primary bg-primary text-primary-foreground' : ''}`}
              onClick={() => setDays((list) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day]))}
            >
              {label}
            </button>
          ))}
          <span className={hint}>{t('(nenhum marcado = todos)')}</span>
        </div>
      )}
      {needsKey && (
        <label className="flex items-start gap-2 rounded-md border border-warning/50 p-2 text-xs">
          <input type="checkbox" className="mt-0.5" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>
            {t(
              'Guardar a chave de {name} neste computador, em {file}, para a tarefa rodar com a aba fechada. A chave sai do navegador só para esse arquivo; dá para apagá-la aqui depois.',
              { name: provider?.name ?? providerId, file: p.keysFile },
            )}
          </span>
        </label>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={p.onCancel}>
          {t('Cancelar')}
        </Button>
        <Button type="submit" size="sm" disabled={busy || !prompt.trim() || !model}>
          {t('Salvar')}
        </Button>
      </div>
    </form>
  )
}

export default function AgendaTab(p: Props) {
  const [state, setState] = useState<AgendaState | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((n) => n + 1)
  useEffect(() => {
    loadAgenda().then(setState, (err) => setError(err instanceof Error ? err.message : String(err)))
  }, [version])

  if (error) return <p className="text-sm text-warning">{t('A agenda precisa do TSRS aberto pelo npm run dev: {error}', { error })}</p>
  if (!state) return <p className={hint}>{t('Carregando…')}</p>
  const hasKey = (id: string) => state.keys.includes(id)
  const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '—')

  return (
    <div className="space-y-3">
      <p className={hint}>
        {t(
          'O servidor do TSRS (npm run dev) manda estes pedidos ao modelo no horário, mesmo com a aba fechada; o computador precisa estar ligado. Cada resposta vira uma mensagem na conversa “Agenda: nome da tarefa” e um arquivo em extensoes/agenda/resultados.',
        )}
      </p>
      <Button size="sm" className="gap-1.5" onClick={() => setEditing('new')}>
        <Plus className="size-3.5" />
        {t('Nova tarefa')}
      </Button>
      {editing && (
        <TaskForm
          {...p}
          task={editing === 'new' ? undefined : editing}
          hasKey={hasKey}
          keysFile={state.keysFile}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
      {state.tasks.length === 0 && !editing && <p className={hint}>{t('Nenhuma tarefa agendada.')}</p>}
      {state.tasks.map((task) => (
        <div key={task.id} className="task space-y-1.5 rounded-md border p-3" data-task={task.name}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{task.name}</p>
              <p className={hint}>
                {describeSchedule(task.schedule, locale())} · {task.model}
              </p>
              <p className={hint}>
                {t('Próxima: {next} · Última: {last}', { next: task.enabled ? when(task.nextRun) : t('desligada'), last: when(task.lastRun) })}
              </p>
              {task.lastError && <p className="text-xs text-destructive">{task.lastError}</p>}
            </div>
            <Switch
              aria-label={t('Ligar a tarefa {name}', { name: task.name })}
              checked={task.enabled}
              onCheckedChange={async (enabled) => {
                await saveTask({ ...task, enabled })
                reload()
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={running === task.id}
              onClick={async () => {
                setRunning(task.id)
                try {
                  await runTask(task.id)
                  p.onRan()
                } finally {
                  setRunning(null)
                  reload()
                }
              }}
            >
              <Play className="size-3.5" />
              {running === task.id ? t('Rodando…') : t('Rodar agora')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(task)}>
              {t('Editar')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (!confirm(t('Remover a tarefa “{name}”? As respostas já recebidas continuam nas conversas e nos arquivos.', { name: task.name }))) return
                await removeTask(task.id)
                reload()
              }}
            >
              {t('Remover')}
            </Button>
          </div>
        </div>
      ))}
      {state.keys.length > 0 && (
        <div className="space-y-1 rounded-md border p-3 text-xs">
          <p className="font-medium">{t('Chaves guardadas para a agenda')}</p>
          {state.keys.map((id) => (
            <p key={id} className="flex items-center gap-2">
              {PROVIDERS.find((x) => x.id === id)?.name ?? id}
              <button
                className="text-destructive underline-offset-2 hover:underline"
                onClick={async () => {
                  await forgetKey(id)
                  reload()
                }}
              >
                {t('Apagar do computador')}
              </button>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
