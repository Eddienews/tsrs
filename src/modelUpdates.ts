import type { ModelInfo, Provider, ProviderSettings, Settings } from './types'

// Model lists that keep themselves up to date: once a day TSRS asks each
// provider the user set up for its models (fine-tuned ones included, which
// OpenAI lists for the account) and points out the ones that appeared since.

export const MODELS_EVERY = 24 * 60 * 60 * 1000

// Whether a provider's list is due: one the user can call (with a key, or a
// local one whose list was loaded before), not checked in the last day.
export function modelsDue(provider: Provider, conn: ProviderSettings | undefined, now: number): boolean {
  if (!provider.modelsPath || !conn?.baseUrl) return false
  const callable = provider.keyRequired ? !!conn.apiKey : !!conn.listed
  return callable && now - (conn.modelsCheckedAt ?? 0) >= MODELS_EVERY
}

// The provider's settings with a fresh list. Models typed by hand stay; models
// the provider no longer lists go. The new ones are those not in the last
// list, so the first check flags none.
export function withFreshModels(
  provider: Provider,
  conn: ProviderSettings,
  fresh: { ids: string[]; info: Record<string, ModelInfo> },
  now: number,
): { next: ProviderSettings; added: string[] } {
  if (!fresh.ids.length) return { next: { ...conn, modelsCheckedAt: now }, added: [] }
  const before = conn.listed ?? provider.defaultModels
  const typed = conn.models.filter((m) => !fresh.ids.includes(m) && !before.includes(m))
  const added = conn.listed ? fresh.ids.filter((m) => !conn.listed!.includes(m)) : []
  const seen = new Set(fresh.ids)
  return {
    added,
    next: {
      ...conn,
      models: [...fresh.ids, ...typed],
      modelInfo: { ...conn.modelInfo, ...fresh.info },
      listed: fresh.ids,
      modelsCheckedAt: now,
      newModels: [...new Set([...(conn.newModels ?? []).filter((m) => seen.has(m)), ...added])],
    },
  }
}

// The models flagged as new, by provider, until the user has seen them.
export function newModelCount(settings: Settings): number {
  return Object.values(settings.providers).reduce((sum, p) => sum + (p.newModels?.length ?? 0), 0)
}

export function withoutNewModels(settings: Settings): Settings {
  return {
    ...settings,
    providers: Object.fromEntries(
      Object.entries(settings.providers).map(([id, p]) => [id, p.newModels?.length ? { ...p, newModels: [] } : p]),
    ),
  }
}
