import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { t } from './i18n'
import { PROVIDERS } from './providers'
import type { Settings } from './types'

interface Props {
  settings: Settings
  onCompare: (target: { providerId: string; model: string }) => void
  onClose: () => void
}

// Picks the model that will write another version of a reply.
export default function CompareDialog({ settings, onCompare, onClose }: Props) {
  const [providerId, setProviderId] = useState(settings.providerId)
  const [model, setModel] = useState('')
  const models = settings.providers[providerId].models

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog narrow sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Comparar com outro modelo')}</DialogTitle>
          <DialogDescription>
            {t(
              'O modelo escolhido responde à mesma pergunta. As versões ficam lado a lado e o modelo da conversa não muda.',
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            onCompare({ providerId, model: model.trim() })
          }}
        >
          <select
            className="select-native w-full"
            aria-label={t('Provedor')}
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value)
              setModel('')
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Input
            autoFocus
            list="compare-models"
            placeholder={t('Modelo')}
            aria-label={t('Modelo')}
            className="font-mono text-xs"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id="compare-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <DialogFooter className="gap-2 pt-1 sm:space-x-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('Cancelar')}
            </Button>
            <Button type="submit" disabled={!model.trim()}>
              {t('Gerar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
