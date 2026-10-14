import { useState } from 'react'
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
    <div className="overlay" onClick={onClose}>
      <form
        className="dialog narrow"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h2>{t('Desbloquear chaves')}</h2>
        <p className="hint">{t('Suas chaves de API estão protegidas por senha.')}</p>
        <input
          type={visible ? 'text' : 'password'}
          autoFocus
          autoComplete="current-password"
          placeholder={t('Senha')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          {t('Mostrar senha')}
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row end">
          <button type="button" onClick={onClose}>
            {t('Agora não')}
          </button>
          <button className="primary" disabled={!password || working}>
            {working ? t('Verificando…') : t('Desbloquear')}
          </button>
        </div>
      </form>
    </div>
  )
}
