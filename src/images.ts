import { PROVIDERS } from './providers'
import type { Settings } from './types'

function usable(settings: Settings, id: string): boolean {
  const provider = PROVIDERS.find((p) => p.id === id)
  const conn = settings.providers[id]
  return !!provider?.image && !!conn?.baseUrl && (!!conn.apiKey || !provider.keyRequired)
}

// The provider that draws images and the model it uses, or null when no
// provider with an image model has a key.
export function imageSource(
  settings: Settings,
  locked: boolean,
): { providerId: string; model: string } | null {
  if (locked) return null
  const id =
    settings.imageProvider === 'auto'
      ? PROVIDERS.find((p) => usable(settings, p.id))?.id
      : usable(settings, settings.imageProvider)
        ? settings.imageProvider
        : undefined
  if (!id) return null
  // A model typed in applies only to the provider chosen by hand.
  const chosen = settings.imageProvider === 'auto' ? '' : settings.imageModel.trim()
  const model = chosen || PROVIDERS.find((p) => p.id === id)!.image!
  return { providerId: id, model }
}
