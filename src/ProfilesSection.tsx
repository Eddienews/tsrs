import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from './i18n'
import { createProfile, deleteProfile, profileName, renameProfile, switchProfile } from './profiles'
import { ACTIVE_PROFILE, DEFAULT_PROFILE, loadProfiles } from './storage'

const hint = 'text-xs text-muted-foreground'

// Profiles in the settings: each has its own keys, conversations, library,
// sync and automatic backup.
export default function ProfilesSection() {
  const [profiles, setProfiles] = useState(loadProfiles)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const refresh = () => setProfiles(loadProfiles())

  async function remove(id: string, label: string) {
    if (!confirm(t('Apagar o perfil "{name}" com as conversas, chaves e configurações dele? Não pode ser desfeito.', { name: label }))) return
    try {
      await deleteProfile(id)
      refresh()
    } catch (err) {
      setError(t('Falhou: {message}', { message: err instanceof Error ? err.message : String(err) }))
    }
  }

  return (
    <div className="space-y-4">
      <p className={hint}>
        {t(
          'Cada perfil tem as suas próprias chaves, conversas, biblioteca, senha, sincronização e backup automático, como dois TSRS no mesmo navegador. Trocar de perfil recarrega a página. As pastas de projeto, as extensões e a agenda são do computador e valem para todos.',
        )}
      </p>
      <ul className="space-y-2" aria-label={t('Perfis')}>
        {profiles.list.map((profile) => {
          const label = profileName(profile)
          const active = profile.id === ACTIVE_PROFILE
          return (
            <li key={profile.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm" data-profile={profile.id}>
              {editing === profile.id ? (
                <form
                  className="flex flex-1 gap-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    renameProfile(profile.id, draft)
                    setEditing(null)
                    refresh()
                  }}
                >
                  <Input
                    aria-label={t('Novo nome do perfil')}
                    className="h-8"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <Button type="submit" size="sm" className="h-8">
                    {t('Salvar')}
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex flex-1 items-center gap-1.5 font-medium">
                    {active && <Check className="size-4 text-primary" aria-hidden />}
                    {label}
                    {active && <span className={hint}>{t('(em uso)')}</span>}
                  </span>
                  {!active && (
                    <Button variant="outline" size="sm" className="h-8" onClick={() => switchProfile(profile.id)}>
                      {t('Usar este')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={t('Renomear {name}', { name: label })}
                    onClick={() => {
                      setEditing(profile.id)
                      setDraft(profile.name || label)
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  {!active && profile.id !== DEFAULT_PROFILE && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      aria-label={t('Apagar {name}', { name: label })}
                      onClick={() => remove(profile.id, label)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) createProfile(name)
        }}
      >
        <Input
          aria-label={t('Nome do novo perfil')}
          placeholder={t('Ex.: Trabalho')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" className="gap-1.5" disabled={!name.trim()}>
          <Plus className="size-4" />
          {t('Criar e abrir')}
        </Button>
      </form>
      <p className={hint}>{t('Um perfil novo começa vazio, como uma instalação nova: cole as chaves dele nas configurações.')}</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
