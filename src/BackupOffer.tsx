import { HardDriveDownload } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BackupMeta } from './autoBackup'
import { locale, t } from './i18n'

// Shown when this browser has no conversations but the backup on disk has:
// the browser's storage was wiped, or this is another browser.
export default function BackupOffer(props: {
  meta: BackupMeta
  onRestore: () => Promise<string>
  onDismiss: () => void
}) {
  const { meta } = props
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const when = new Date(meta.savedAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })

  async function restore() {
    setBusy(true)
    setError('')
    try {
      await props.onRestore()
    } catch (err) {
      setError(t('Falhou: {message}', { message: err instanceof Error ? err.message : String(err) }))
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label={t('Backup encontrado')}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg"
    >
      <div className="flex gap-3">
        <HardDriveDownload className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{t('Backup encontrado')}</p>
          <p className="text-sm text-muted-foreground">
            {t('Este navegador está sem conversas, mas há um backup no disco de {when} com {count} conversas.', {
              when,
              count: meta.chats,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {meta.keys === 'sealed'
              ? t('As chaves de API voltam com a sua senha.')
              : t('As chaves de API não estão no backup; você cola de novo depois.')}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={props.onDismiss} disabled={busy}>
          {t('Agora não')}
        </Button>
        <Button size="sm" onClick={restore} disabled={busy}>
          {busy ? t('Restaurando…') : t('Restaurar')}
        </Button>
      </div>
    </div>
  )
}
