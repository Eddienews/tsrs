import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { t } from './i18n'
import type { ChatParams, KnowledgeBase, Provider } from './types'

interface Props {
  provider: Provider
  bases: KnowledgeBase[]
  params: ChatParams
  onChange: (params: ChatParams) => void
  onClose: () => void
}

function number(value: string): number | undefined {
  return value === '' || Number.isNaN(Number(value)) ? undefined : Number(value)
}

export default function ParamsPanel({ provider, bases, params, onChange, onClose }: Props) {
  const set = (patch: ChatParams) => onChange({ ...params, ...patch })
  const knowledge = params.knowledge ?? []

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="params w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{t('Parâmetros')}</SheetTitle>
          <SheetDescription>{t('Valem apenas para esta conversa.')}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="params-system">{t('Prompt de sistema desta conversa')}</Label>
            <Textarea
              id="params-system"
              rows={6}
              className="font-mono text-xs"
              placeholder={t('Vazio usa o prompt de sistema global.')}
              value={params.system ?? ''}
              onChange={(e) => set({ system: e.target.value || undefined })}
            />
          </div>
          {provider.temperature && (
            <div className="space-y-2">
              <Label htmlFor="params-temperature">{t('Temperatura')}</Label>
              <Input
                id="params-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                placeholder={t('padrão')}
                className="font-mono text-xs"
                value={params.temperature ?? ''}
                onChange={(e) => set({ temperature: number(e.target.value) })}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="params-max-tokens">{t('Máximo de tokens')}</Label>
            <Input
              id="params-max-tokens"
              type="number"
              min={1}
              step={1}
              placeholder={t('padrão')}
              className="font-mono text-xs"
              value={params.maxTokens ?? ''}
              onChange={(e) => set({ maxTokens: number(e.target.value) })}
            />
          </div>
          {provider.efforts.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="params-effort">{t('Nível de raciocínio')}</Label>
              <select
                id="params-effort"
                className="select-native w-full"
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
            </div>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t('Bases de conhecimento')}</legend>
            {bases.map((base) => (
              <label key={base.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={knowledge.includes(base.id)}
                  onChange={(e) =>
                    set({
                      knowledge: e.target.checked
                        ? [...knowledge, base.id]
                        : knowledge.filter((id) => id !== base.id),
                    })
                  }
                />
                {base.name || t('Sem nome')}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              {bases.length
                ? t('Os trechos que mais combinam com cada pergunta vão junto com ela.')
                : t('Crie bases de conhecimento na Biblioteca.')}
            </p>
          </fieldset>
          {!provider.temperature && (
            <p className="text-xs text-muted-foreground">
              {t(
                'Os modelos atuais de {provider} não aceitam temperatura; use o nível de raciocínio.',
                { provider: provider.name },
              )}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
