import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { t } from './i18n'
import type { Settings, SidebarSection } from './types'

const hint = 'text-xs text-muted-foreground'

export function sectionNames(): [SidebarSection, string][] {
  return [
    ['mission', t('Painel do dia')],
    ['board', t('Quadro de produção')],
    ['table', t('Mesa de agentes')],
    ['library', t('Biblioteca')],
    ['tools', t('Ferramentas')],
    ['extensions', t('Extensões')],
    ['usage', t('Uso')],
  ]
}

type Change = (update: (s: Settings) => Settings) => void

// Which sections the sidebar shows, and where TSRS opens.
export function SectionsFields({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const hidden = settings.hiddenSections ?? []
  const show = (section: SidebarSection, on: boolean) =>
    onChange((s) => {
      const rest = (s.hiddenSections ?? []).filter((x) => x !== section)
      return { ...s, hiddenSections: on ? rest : [...rest, section] }
    })
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{t('Seções da barra lateral')}</div>
      <p className={hint}>{t('Esconda o que você não usa; tudo continua na paleta de comandos (Ctrl/⌘+K).')}</p>
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {sectionNames().map(([id, name]) => (
          <label key={id} className="flex items-center justify-between gap-4 text-sm">
            {name}
            <Switch
              aria-label={t('Mostrar {name}', { name })}
              checked={!hidden.includes(id)}
              onCheckedChange={(on) => show(id, on)}
            />
          </label>
        ))}
      </div>
      <label className="mt-2 flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
        {t('Abrir o TSRS no Painel do dia')}
        <Switch
          aria-label={t('Abrir o TSRS no Painel do dia')}
          checked={settings.startPage === 'mission'}
          onCheckedChange={(on) => onChange((s) => ({ ...s, startPage: on ? 'mission' : undefined }))}
        />
      </label>
    </div>
  )
}

// Conversations kept as notes in an Obsidian vault.
export function ObsidianFields({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const obsidian = settings.obsidian ?? { vault: '', folder: 'TSRS', auto: false }
  const set = (patch: Partial<typeof obsidian>) => onChange((s) => ({ ...s, obsidian: { ...obsidian, ...s.obsidian, ...patch } }))
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-sm font-medium">{t('Obsidian')}</div>
      <p className={hint}>
        {t('Guarda cada conversa como uma nota no seu cofre do Obsidian, com modelo, datas e etiquetas nas propriedades. Precisa do TSRS servido por npm run dev.')}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="obsidian-vault">{t('Pasta do cofre')}</Label>
        <Input
          id="obsidian-vault"
          className="font-mono text-xs"
          placeholder="C:\Users\…\Documents\Cofre"
          value={obsidian.vault}
          onChange={(e) => set({ vault: e.target.value.trim() })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="obsidian-folder">{t('Pasta das notas, dentro do cofre')}</Label>
        <Input
          id="obsidian-folder"
          className="font-mono text-xs"
          value={obsidian.folder}
          onChange={(e) => set({ folder: e.target.value })}
        />
      </div>
      <label className="flex items-center justify-between gap-4 text-sm">
        {t('Atualizar a nota a cada resposta')}
        <Switch
          aria-label={t('Atualizar a nota a cada resposta')}
          checked={obsidian.auto}
          disabled={!obsidian.vault}
          onCheckedChange={(auto) => set({ auto })}
        />
      </label>
      <p className={hint}>{t('Sem isso, salve uma conversa pelo menu dela: Salvar no Obsidian.')}</p>
    </div>
  )
}
