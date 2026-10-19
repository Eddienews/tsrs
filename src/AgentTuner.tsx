import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { agentParams } from './agents'
import { t } from './i18n'
import { connection, getProvider } from './providers'
import { tuneAgent, tuneCalls, type Candidate, type TuneStep } from './tune'
import type { Persona, Settings } from './types'

interface Props {
  persona: Persona
  settings: Settings
  onAdopt: (system: string) => void
  onClose: () => void
}

const hint = 'text-xs text-muted-foreground'

function stepText(step: TuneStep): string {
  if (step.kind === 'propose') return t('Propondo versões do prompt…')
  if (step.kind === 'probe') return t('Testando a versão {n} de {total}…', { n: step.index + 1, total: step.total })
  return t('Dando notas às respostas…')
}

// Tries other versions of an agent's instructions on one task and shows the
// answers side by side with a judge's score; the person adopts one or none.
export default function AgentTuner({ persona, settings, onAdopt, onClose }: Props) {
  const providerId = persona.providerId || settings.providerId
  const model = (persona.providerId && persona.model) || settings.model
  const [task, setTask] = useState(persona.starters?.[0] ?? '')
  const [criteria, setCriteria] = useState('')
  const [count, setCount] = useState(3)
  const [step, setStep] = useState<TuneStep | null>(null)
  const [error, setError] = useState('')
  const [results, setResults] = useState<Candidate[] | null>(null)
  const [shown, setShown] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)

  async function run() {
    const controller = new AbortController()
    abort.current = controller
    setError('')
    setResults(null)
    try {
      const found = await tuneAgent(
        {
          conn: connection(settings, providerId),
          model,
          params: agentParams(undefined, persona),
          system: persona.system,
          task,
          criteria,
          count,
          signal: controller.signal,
          onStep: setStep,
        },
        t('Atual'),
      )
      setResults(found)
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStep(null)
      abort.current = null
    }
  }

  const best = results?.reduce((top, c, i) => ((c.score ?? -1) > (results[top].score ?? -1) ? i : top), 0)
  const running = step !== null

  return (
    <Dialog open onOpenChange={(open) => !open && (abort.current?.abort(), onClose())}>
      <DialogContent className="dialog max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('Afinar {name}', { name: persona.name || t('Sem nome') })}</DialogTitle>
          <DialogDescription>
            {t('O TSRS propõe versões do prompt deste agente, testa todas na mesma tarefa e dá uma nota a cada resposta. Nada muda até você adotar uma.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tune-task">{t('Tarefa de teste')}</Label>
            <Textarea
              id="tune-task"
              rows={3}
              value={task}
              placeholder={t('Um pedido típico para este agente')}
              onChange={(e) => setTask(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tune-criteria">{t('O que uma boa resposta precisa ter')}</Label>
            <Textarea
              id="tune-criteria"
              rows={2}
              value={criteria}
              placeholder={t('Ex.: em português, no máximo 5 tópicos, cita a fonte, termina com o próximo passo')}
              onChange={(e) => setCriteria(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              {t('Versões novas')}
              <select
                className="select-native"
                value={count}
                disabled={running}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {running ? (
              <Button variant="outline" size="sm" onClick={() => abort.current?.abort()}>
                {t('Parar')}
              </Button>
            ) : (
              <Button size="sm" disabled={!task.trim() || !model} onClick={run}>
                {t('Testar versões')}
              </Button>
            )}
            <span className={hint}>
              {t('{calls} chamadas a {model} ({provider}). As ferramentas do agente não rodam no teste.', {
                calls: tuneCalls(count),
                model: model || '—',
                provider: getProvider(providerId).name,
              })}
            </span>
          </div>
          {step && <p className="text-sm" role="status">{stepText(step)}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {results && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="tune-results">
            {results.map((c, i) => (
              <div
                key={i}
                className={cn('flex min-w-0 flex-col gap-2 rounded-md border p-3', i === best && 'border-primary')}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{c.label}</span>
                  <span className={cn('shrink-0 font-mono text-sm', i === best && 'font-semibold text-primary')}>
                    {c.score === undefined ? '—' : `${c.score}/10`}
                  </span>
                </div>
                {c.change && <p className={hint}>{c.change}</p>}
                {c.reason && <p className="text-xs">{c.reason}</p>}
                {c.error ? (
                  <p className="text-xs text-destructive">{c.error}</p>
                ) : (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{c.answer}</pre>
                )}
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShown(shown === i ? null : i)}>
                    {shown === i ? t('Ocultar prompt') : t('Ver prompt')}
                  </Button>
                  {i > 0 && (
                    <Button
                      size="sm"
                      variant={i === best ? 'default' : 'outline'}
                      onClick={() => {
                        onAdopt(c.system)
                        onClose()
                      }}
                    >
                      {t('Adotar')}
                    </Button>
                  )}
                </div>
                {shown === i && (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border p-2 font-mono text-xs">{c.system}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
