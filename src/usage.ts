import { locale } from './i18n'
import { getProvider, knownModel } from './providers'
import type { Message, ModelInfo, Settings, Usage } from './types'

// Share of the context window above which the user is warned.
export const CONTEXT_WARNING = 0.8

function cacheReadPrice(providerId: string, reported: ModelInfo, known: ModelInfo) {
  const share = getProvider(providerId).cacheReadShare
  if (reported.inputPrice !== undefined) return share && reported.inputPrice * share
  return known.cacheReadPrice ?? (share && known.inputPrice && known.inputPrice * share)
}

export function priceKey(providerId: string, model: string): string {
  return `${providerId}/${model}`
}

export function modelInfo(settings: Settings, providerId: string, model: string): ModelInfo {
  // A price the user typed counts as one the provider reported.
  const typed = settings.modelPrices?.[priceKey(providerId, model)]
  const reported = { ...settings.providers[providerId]?.modelInfo?.[model], ...typed }
  const known = knownModel(model)
  return {
    context: reported.context ?? known.context,
    inputPrice: reported.inputPrice ?? known.inputPrice,
    outputPrice: reported.outputPrice ?? known.outputPrice,
    cacheReadPrice: cacheReadPrice(providerId, reported, known),
    // Only applies to the built-in prices it was listed with.
    longPrompt:
      reported.inputPrice === undefined && reported.outputPrice === undefined
        ? known.longPrompt
        : undefined,
  }
}

export function costOf(usage: Usage, info: ModelInfo): number | undefined {
  if (usage.cost !== undefined) return usage.cost
  if (info.inputPrice === undefined || info.outputPrice === undefined) return undefined
  const long = info.longPrompt && usage.input > info.longPrompt.above ? info.longPrompt : undefined
  const inputPrice = long?.inputPrice ?? info.inputPrice
  const outputPrice = long?.outputPrice ?? info.outputPrice
  // Writing to the cache costs a quarter more than plain input; reading from
  // it costs the model's or provider's cache rate, or the full price if unknown.
  const read = usage.cacheRead ?? 0
  const write = usage.cacheWrite ?? 0
  const readPrice = (!long && info.cacheReadPrice) || inputPrice
  const input = (usage.input - read - write) * inputPrice + write * inputPrice * 1.25 + read * readPrice
  return (input + usage.output * outputPrice) / 1_000_000
}

export interface Totals {
  tokens: number
  // Undefined when no message in the conversation has a known cost.
  cost?: number
}

// `info` prices replies that were written before their model's price was
// known, such as one the user typed afterwards.
export function totals(
  messages: Message[],
  info?: (providerId: string, model: string) => ModelInfo,
): Totals {
  let tokens = 0
  let cost: number | undefined
  for (const { usage, providerId, model } of messages) {
    if (!usage) continue
    tokens += usage.input + usage.output
    const priced =
      usage.cost ?? (info && providerId && model ? costOf(usage, info(providerId, model)) : undefined)
    if (priced !== undefined) cost = (cost ?? 0) + priced
  }
  return { tokens, cost }
}

// Fraction of the context window the next request will start from, judged by
// the latest reply; undefined when either number is unknown.
export function contextUse(messages: Message[], info: ModelInfo): number | undefined {
  // After a cleared context, nothing before the mark counts.
  const last = messages.findLast((m) => m.usage || m.contextReset)?.usage
  if (!last || !info.context) return undefined
  return (last.context ?? last.input + last.output) / info.context
}

export function formatTokens(count: number): string {
  return count.toLocaleString(locale())
}

export function formatCost(cost: number): string {
  return cost.toLocaleString(locale(), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cost < 1 ? 4 : 2,
    maximumFractionDigits: cost < 1 ? 4 : 2,
  })
}
