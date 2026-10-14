import { ArrowLeft, Menu } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { locale, t } from './i18n'
import { PROVIDERS } from './providers'
import { usageReport, type DayUsage } from './report'
import type { Chat } from './types'
import { formatCost, formatTokens } from './usage'

const RANGES = [7, 30, 90] as const

interface Props {
  // Reads every conversation, messages included.
  load: () => Promise<Chat[]>
  onBack: () => void
  showMenu: boolean
  onMenu: () => void
}

function dayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'short',
  })
}

function dayTitle(day: DayUsage): string {
  const parts = [
    dayLabel(day.day),
    t('{count} tokens', { count: formatTokens(day.input + day.output) }),
  ]
  if (day.cost !== undefined) parts.push(formatCost(day.cost))
  return parts.join(' · ')
}

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl">{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
    </div>
  )
}

export default function UsageView({ load, onBack, showMenu, onMenu }: Props) {
  const [chats, setChats] = useState<Chat[] | null>(null)
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)

  useEffect(() => {
    load().then(setChats)
  }, [load])

  const report = useMemo(() => chats && usageReport(chats, days), [chats, days])
  const tokens = (row: { input: number; output: number }) => row.input + row.output
  const peak = report ? Math.max(1, ...report.daily.map(tokens)) : 1
  const top = report ? Math.max(1, ...report.byModel.map(tokens)) : 1
  // Day labels under the chart: first, middle and last.
  const labelled = new Set([0, Math.floor(days / 2), days - 1])

  return (
    <div className="usage-view flex h-full min-w-0 flex-col bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
        {showMenu && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('Abrir a lista de conversas')}
            onClick={onMenu}
          >
            <Menu className="size-4" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t('Conversa')}
        </Button>
        <h1 className="text-sm font-medium">{t('Uso')}</h1>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          className="ml-auto"
          aria-label={t('Período')}
          value={String(days)}
          onValueChange={(value) => value && setDays(Number(value) as typeof days)}
        >
          {RANGES.map((range) => (
            <ToggleGroupItem key={range} value={String(range)} className="px-3 text-xs">
              {t('{count} dias', { count: range })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </header>

      {!report ? (
        <p className="p-4 text-sm text-muted-foreground">{t('Carregando…')}</p>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Card
              label={t('Tokens')}
              value={formatTokens(tokens(report.total))}
              note={t('{input} entrada · {output} saída', {
                input: formatTokens(report.total.input),
                output: formatTokens(report.total.output),
              })}
            />
            <Card
              label={t('Custo estimado')}
              value={report.total.cost !== undefined ? formatCost(report.total.cost) : '—'}
              note={
                report.unpriced
                  ? t('{count} respostas sem preço conhecido', { count: report.unpriced })
                  : undefined
              }
            />
            <Card label={t('Respostas')} value={formatTokens(report.total.replies)} />
            <Card
              label={t('Média por dia')}
              value={
                report.total.cost !== undefined
                  ? formatCost(report.total.cost / days)
                  : formatTokens(Math.round(tokens(report.total) / days))
              }
              note={report.total.cost !== undefined ? undefined : t('tokens')}
            />
          </div>

          {report.total.replies === 0 ? (
            <p className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
              {t('Nenhuma resposta neste período.')}
            </p>
          ) : (
            <>
              <section className="rounded-md border bg-card p-3">
                <h2 className="mb-3 text-sm font-medium">{t('Tokens por dia')}</h2>
                <div className="flex h-44 items-end gap-px border-b" role="list">
                  {report.daily.map((day) => (
                    <div
                      key={day.day}
                      role="listitem"
                      aria-label={dayTitle(day)}
                      title={dayTitle(day)}
                      className="flex h-full min-w-0 flex-1 items-end rounded-t-[2px] hover:bg-accent"
                    >
                      <div
                        className="w-full rounded-t-[2px] bg-chart-1"
                        style={{ height: `${(tokens(day) / peak) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                  {report.daily.map((day, index) => (
                    <span key={day.day} className="relative min-w-0 flex-1">
                      {labelled.has(index) && (
                        <span
                          className={
                            index === 0
                              ? 'absolute left-0'
                              : index === days - 1
                                ? 'absolute right-0'
                                : 'absolute left-1/2 -translate-x-1/2'
                          }
                        >
                          {dayLabel(day.day)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
                <div className="h-3" />
              </section>

              <section className="rounded-md border bg-card p-3">
                <h2 className="mb-2 text-sm font-medium">{t('Por modelo')}</h2>
                <table className="by-model w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 font-normal">{t('Modelo')}</th>
                      <th className="hidden py-1 font-normal sm:table-cell" />
                      <th className="py-1 text-right font-normal">{t('Tokens')}</th>
                      <th className="py-1 text-right font-normal">{t('Respostas')}</th>
                      <th className="py-1 text-right font-normal">{t('Custo')}</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {report.byModel.map((row) => (
                      <tr key={`${row.providerId}/${row.model}`} className="border-t">
                        <td className="max-w-48 py-1.5 pr-2">
                          <div className="truncate">{row.model}</div>
                          <div className="truncate font-sans text-[11px] text-muted-foreground">
                            {PROVIDERS.find((p) => p.id === row.providerId)?.name ?? row.providerId}
                          </div>
                        </td>
                        <td className="hidden w-1/3 py-1.5 pr-3 sm:table-cell">
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-chart-2"
                              style={{ width: `${(tokens(row) / top) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-1.5 text-right">{formatTokens(tokens(row))}</td>
                        <td className="py-1.5 text-right">{formatTokens(row.replies)}</td>
                        <td className="py-1.5 text-right">
                          {row.cost !== undefined ? formatCost(row.cost) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            {t(
              'O custo é uma estimativa feita neste navegador. Os títulos gerados automaticamente não entram na conta, e respostas apagadas deixam de ser contadas.',
            )}
            {report.undated > 0 &&
              ' ' +
                t(
                  '{count} respostas antigas, de antes de as mensagens terem data, aparecem no dia da última atividade da conversa.',
                  { count: report.undated },
                )}
          </p>
        </div>
      )}
    </div>
  )
}
