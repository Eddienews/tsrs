import { t } from './i18n'
import type { ChatParams, Provider } from './types'

interface Props {
  provider: Provider
  params: ChatParams
  onChange: (params: ChatParams) => void
}

function number(value: string): number | undefined {
  return value === '' || Number.isNaN(Number(value)) ? undefined : Number(value)
}

export default function ParamsPanel({ provider, params, onChange }: Props) {
  const set = (patch: ChatParams) => onChange({ ...params, ...patch })

  return (
    <div className="params">
      <label className="wide">
        {t('Prompt de sistema desta conversa')}
        <textarea
          rows={3}
          placeholder={t('Vazio usa o prompt de sistema global.')}
          value={params.system ?? ''}
          onChange={(e) => set({ system: e.target.value || undefined })}
        />
      </label>
      {provider.temperature && (
        <label>
          {t('Temperatura')}
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            placeholder={t('padrão')}
            value={params.temperature ?? ''}
            onChange={(e) => set({ temperature: number(e.target.value) })}
          />
        </label>
      )}
      <label>
        {t('Máximo de tokens')}
        <input
          type="number"
          min={1}
          step={1}
          placeholder={t('padrão')}
          value={params.maxTokens ?? ''}
          onChange={(e) => set({ maxTokens: number(e.target.value) })}
        />
      </label>
      {provider.efforts.length > 0 && (
        <label>
          {t('Nível de raciocínio')}
          <select
            value={params.effort ?? ''}
            onChange={(e) => set({ effort: e.target.value || undefined })}
          >
            <option value="">{t('padrão')}</option>
            {provider.efforts.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
      )}
      {!provider.temperature && (
        <p className="hint wide">
          {t(
            'Os modelos atuais de {provider} não aceitam temperatura; use o nível de raciocínio.',
            { provider: provider.name },
          )}
        </p>
      )}
    </div>
  )
}
