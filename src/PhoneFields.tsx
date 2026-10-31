import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { t } from './i18n'
import { enablePush, pushState, testPush, type PushState } from './push'

const hint = 'text-xs text-muted-foreground'

// TSRS on a phone over Tailscale, and notifications on this device.
export default function PhoneFields() {
  const [state, setState] = useState<PushState | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => {
    pushState().then(setState, () => setState('unsupported'))
  }, [])
  const enable = async () => {
    try {
      const devices = await enablePush(navigator.userAgent.slice(0, 80))
      setState('on')
      setNote(t('Avisos ligados neste aparelho ({devices} no total).', { devices }))
    } catch (error) {
      setNote(error instanceof Error && error.message === 'denied' ? t('O navegador não deixou mostrar avisos.') : t('Não deu: {error}', { error: String(error) }))
      setState(await pushState())
    }
  }
  const test = async () => {
    try {
      const sent = await testPush()
      setNote(t('Aviso de teste enviado para {sent} aparelho(s).', { sent }))
    } catch (error) {
      setNote(t('Não deu: {error}', { error: String(error) }))
    }
  }
  return (
    <div className="space-y-2 rounded-md border p-3">
      <h3 className="text-sm font-medium">{t('Celular e avisos')}</h3>
      <p className={hint}>
        {t(
          'Para abrir o TSRS no celular pelo Tailscale, rode tsrs access neste computador: ele mostra a linha do tailscale serve e o link com a chave, que o celular pede uma vez. Os avisos dizem quando o turno da noite termina.',
        )}
      </p>
      {state === 'unsupported' && <p className={hint}>{t('Este navegador não recebe avisos.')}</p>}
      {state === 'insecure' && <p className={hint}>{t('Os avisos precisam de https (pelo Tailscale) ou do localhost.')}</p>}
      {state === 'denied' && <p className={hint}>{t('Os avisos estão bloqueados nas configurações do navegador.')}</p>}
      <div className="flex flex-wrap gap-2">
        {(state === 'off' || state === 'on') && (
          <Button size="sm" variant={state === 'on' ? 'outline' : 'default'} onClick={enable}>
            {state === 'on' ? t('Avisos ligados') : t('Avisar neste aparelho')}
          </Button>
        )}
        {state === 'on' && (
          <Button size="sm" variant="outline" onClick={test}>
            {t('Testar aviso')}
          </Button>
        )}
      </div>
      {note && (
        <p role="status" className={hint}>
          {note}
        </p>
      )}
    </div>
  )
}
