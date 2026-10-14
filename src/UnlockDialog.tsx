import { useState } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
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

interface Props {
  // Rejects when the password is wrong.
  onUnlock: (password: string) => Promise<void>
  onClose: () => void
}

export default function UnlockDialog({ onUnlock, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [visible, setVisible] = useState(false)

  async function submit() {
    setWorking(true)
    setError('')
    try {
      await onUnlock(password)
      onClose()
    } catch {
      setError(
        t('Senha incorreta. Se o navegador preencheu o campo sozinho, apague-o antes de digitar.'),
      )
      setWorking(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog narrow sm:max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-1 flex size-9 items-center justify-center rounded-md border sm:mx-0">
            <Lock className="size-4" />
          </div>
          <DialogTitle>{t('Desbloquear chaves')}</DialogTitle>
          <DialogDescription>
            {t('Suas chaves de API estão protegidas por senha.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="relative">
            <Input
              type={visible ? 'text' : 'password'}
              autoFocus
              autoComplete="current-password"
              placeholder={t('Senha')}
              aria-label={t('Senha')}
              aria-invalid={!!error}
              className="pr-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0.5 right-0.5 size-8"
              aria-label={visible ? t('Ocultar senha') : t('Mostrar senha')}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 pt-1 sm:space-x-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('Agora não')}
            </Button>
            <Button type="submit" disabled={!password || working}>
              {working ? t('Verificando…') : t('Desbloquear')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
