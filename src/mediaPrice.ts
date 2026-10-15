import { locale, t } from './i18n'
import type { MediaTarget } from './media'
import type { MediaKind, Settings } from './types'

// What a generation will cost, shown before it is sent: from the service's
// own price data where it publishes it (fal.ai's pricing API, Runware's model
// files) and from Google's price list for Veo. Other services report the
// cost, if at all, only afterwards.

export interface PriceEstimate {
  // Such as 'about $0.80 (8 s at 720p)' or '$0.10 per second'.
  text: string
  // Where the figure comes from.
  source: string
}

// Veo 3.1 on the Gemini API, US dollars per second of video with audio, by
// resolution; https://ai.google.dev/gemini-api/docs/pricing, October 2026.
// Dollars with cents, or with as many digits as a tiny price needs.
function money(amount: number): string {
  const digits = amount >= 0.01 ? 2 : 4
  return amount.toLocaleString(locale(), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

const VEO_PRICES: Record<string, Record<string, number>> = {
  'veo-3.1-generate-preview': { '720p': 0.4, '1080p': 0.4, '4k': 0.6 },
  'veo-3.1-fast-generate-preview': { '720p': 0.1, '1080p': 0.12, '4k': 0.3 },
  'veo-3.1-lite-generate-preview': { '720p': 0.05, '1080p': 0.08 },
}

function options(target: MediaTarget): Record<string, unknown> {
  try {
    const value = JSON.parse(target.options || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function veo(target: MediaTarget): PriceEstimate | null {
  const prices = VEO_PRICES[target.model]
  if (!prices) return null
  const chosen = options(target)
  const resolution = String(chosen.resolution ?? '720p').toLowerCase()
  const seconds = Number(chosen.durationSeconds ?? 8)
  const rate = prices[resolution]
  if (!rate || !seconds) return null
  return {
    text: t('cerca de {total} ({seconds} s em {resolution}, a {rate} por segundo)', {
      total: money(rate * seconds),
      seconds,
      resolution,
      rate: money(rate),
    }),
    source: t('tabela de preços do Gemini, outubro de 2026'),
  }
}

const UNITS: Record<string, () => string> = {
  second: () => t('segundo'),
  seconds: () => t('segundo'),
  image: () => t('imagem'),
  images: () => t('imagem'),
  video: () => t('vídeo'),
  videos: () => t('vídeo'),
  request: () => t('pedido'),
}

async function fal(settings: Settings, target: MediaTarget, signal?: AbortSignal) {
  const key = settings.mediaKeys.fal?.trim()
  if (!key) return null
  const url = `https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(target.model)}`
  const res = await fetch(url, { headers: { Authorization: `Key ${key}` }, signal })
  if (!res.ok) return null
  const price = (await res.json()).prices?.[0]
  if (typeof price?.unit_price !== 'number') return null
  const unit = String(price.unit ?? '')
  const seconds = Number(options(target).duration)
  const perSecond = /^seconds?$/.test(unit)
  return {
    text:
      perSecond && seconds
        ? t('cerca de {total} ({seconds} s a {rate} por segundo)', {
            total: money(price.unit_price * seconds),
            seconds,
            rate: money(price.unit_price),
          })
        : t('{rate} por {unit}', {
            rate: money(price.unit_price),
            unit: UNITS[unit]?.() ?? unit,
          }),
    source: 'fal.ai',
  }
}

// Runware lists every model, by its AIR id, with the URL of a file that
// holds its rates; the list is read once per session.
let runwareModels: Promise<{ air: string; schema: string }[]> | null = null

async function runware(target: MediaTarget, signal?: AbortSignal) {
  runwareModels ??= fetch('https://runware.ai/docs/models/index.json', { signal })
    .then((res) => (res.ok ? res.json() : []))
    .catch(() => {
      runwareModels = null
      return []
    })
  const model = (await runwareModels).find((m) => m.air === target.model)
  if (!model?.schema) return null
  const res = await fetch(model.schema, { signal })
  if (!res.ok) return null
  const pricing = (await res.json()).info?.['x-pricing']
  const rates: { display?: string; label?: string }[] = pricing?.rates ?? []
  const measured: { configuration?: string; price?: number }[] = pricing?.measured ?? []
  const text = rates.length
    ? rates
        .slice(0, 3)
        .map((r) => (r.label ? `${r.display} (${r.label})` : r.display))
        .join('; ')
    : measured
        .slice(0, 2)
        .map((m) =>
          t('{price} em {configuration}', {
            price: money(m.price ?? 0),
            configuration: m.configuration ?? '',
          }),
        )
        .join('; ')
  return text ? { text, source: 'Runware' } : null
}

const known = new Map<string, Promise<PriceEstimate | null>>()

// The estimate for a generation, or null when the service does not say.
export function estimateCost(
  settings: Settings,
  target: MediaTarget,
  kind: MediaKind,
): Promise<PriceEstimate | null> {
  const key = JSON.stringify([target, kind])
  let estimate = known.get(key)
  if (!estimate) {
    estimate = (async () => {
      if (target.source === 'gemini' && kind === 'video') return veo(target)
      if (target.source === 'fal') return fal(settings, target)
      if (target.source === 'runware') return runware(target)
      return null
    })().catch(() => null)
    known.set(key, estimate)
  }
  return estimate
}
