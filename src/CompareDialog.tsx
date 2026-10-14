import { useState } from 'react'
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
    <div className="overlay" onClick={onClose}>
      <form
        className="dialog narrow"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onCompare({ providerId, model: model.trim() })
        }}
      >
        <h2>{t('Comparar com outro modelo')}</h2>
        <p className="hint">
          {t(
            'O modelo escolhido responde à mesma pergunta. As versões ficam lado a lado e o modelo da conversa não muda.',
          )}
        </p>
        <select
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
        <input
          autoFocus
          list="compare-models"
          placeholder={t('Modelo')}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <datalist id="compare-models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <div className="row end">
          <button type="button" onClick={onClose}>
            {t('Cancelar')}
          </button>
          <button className="primary" disabled={!model.trim()}>
            {t('Gerar')}
          </button>
        </div>
      </form>
    </div>
  )
}
