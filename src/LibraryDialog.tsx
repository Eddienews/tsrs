import { useState } from 'react'
import { t } from './i18n'
import { PROVIDERS } from './providers'
import type { Persona, SavedPrompt, Settings } from './types'

interface Props {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
  onClose: () => void
}

export default function LibraryDialog({ settings, onChange, onClose }: Props) {
  // Items created while the dialog is open start expanded, ready to fill in.
  const [fresh, setFresh] = useState<string[]>([])

  function create(): string {
    const id = crypto.randomUUID()
    setFresh((ids) => [...ids, id])
    return id
  }

  function patchPersona(id: string, fields: Partial<Persona>) {
    onChange((s) => ({
      ...s,
      personas: s.personas.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    }))
  }

  function patchPrompt(id: string, fields: Partial<SavedPrompt>) {
    onChange((s) => ({
      ...s,
      prompts: s.prompts.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    }))
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('Biblioteca')}</h2>
          <button className="icon" title={t('Fechar')} onClick={onClose}>
            ×
          </button>
        </header>

        <h3>Personas</h3>
        <p className="hint">
          {t(
            'Uma persona é um prompt de sistema com nome, opcionalmente ligado a um modelo. Escolha a persona de cada conversa na barra superior.',
          )}
        </p>
        {settings.personas.map((persona) => (
          <details key={persona.id} open={fresh.includes(persona.id)}>
            <summary>{persona.name || t('Sem nome')}</summary>
            <label>
              {t('Nome')}
              <input
                value={persona.name}
                onChange={(e) => patchPersona(persona.id, { name: e.target.value })}
              />
            </label>
            <label>
              {t('Prompt de sistema')}
              <textarea
                rows={4}
                value={persona.system}
                onChange={(e) => patchPersona(persona.id, { system: e.target.value })}
              />
            </label>
            <div className="row">
              <select
                aria-label={t('Provedor da persona')}
                value={persona.providerId ?? ''}
                onChange={(e) =>
                  patchPersona(persona.id, {
                    providerId: e.target.value || undefined,
                    model: undefined,
                  })
                }
              >
                <option value="">{t('Modelo atual da conversa')}</option>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {persona.providerId && (
                <input
                  list={`models-${persona.id}`}
                  placeholder={t('Modelo')}
                  value={persona.model ?? ''}
                  onChange={(e) => patchPersona(persona.id, { model: e.target.value.trim() })}
                />
              )}
              <datalist id={`models-${persona.id}`}>
                {(settings.providers[persona.providerId ?? '']?.models ?? []).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button
                className="danger"
                onClick={() =>
                  onChange((s) => ({
                    ...s,
                    personas: s.personas.filter((p) => p.id !== persona.id),
                  }))
                }
              >
                {t('Excluir')}
              </button>
            </div>
          </details>
        ))}
        <button
          onClick={() => {
            const id = create()
            onChange((s) => ({ ...s, personas: [...s.personas, { id, name: '', system: '' }] }))
          }}
        >
          {t('Nova persona')}
        </button>

        <h3>{t('Prompts salvos')}</h3>
        <p className="hint">{t('Textos prontos para inserir na mensagem pelo botão Prompts.')}</p>
        {settings.prompts.map((prompt) => (
          <details key={prompt.id} open={fresh.includes(prompt.id)}>
            <summary>{prompt.title || t('Sem título')}</summary>
            <label>
              {t('Título')}
              <input
                value={prompt.title}
                onChange={(e) => patchPrompt(prompt.id, { title: e.target.value })}
              />
            </label>
            <label>
              {t('Texto')}
              <textarea
                rows={4}
                value={prompt.text}
                onChange={(e) => patchPrompt(prompt.id, { text: e.target.value })}
              />
            </label>
            <button
              className="danger"
              onClick={() =>
                onChange((s) => ({ ...s, prompts: s.prompts.filter((p) => p.id !== prompt.id) }))
              }
            >
              {t('Excluir')}
            </button>
          </details>
        ))}
        <button
          onClick={() => {
            const id = create()
            onChange((s) => ({ ...s, prompts: [...s.prompts, { id, title: '', text: '' }] }))
          }}
        >
          {t('Novo prompt')}
        </button>
      </div>
    </div>
  )
}
