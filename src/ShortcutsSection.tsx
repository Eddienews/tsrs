import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { t } from './i18n'
import {
  actionName,
  comboOf,
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  shortcutLabel,
  shortcutsOf,
  type ShortcutAction,
} from './shortcuts'
import type { Settings } from './types'

interface Props {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
}

const kbd = 'rounded border bg-muted px-1.5 py-0.5 font-mono text-xs'

// The shortcuts, each changed by clicking it and pressing the new keys.
export default function ShortcutsSection({ settings, onChange }: Props) {
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [note, setNote] = useState('')
  const keys = shortcutsOf(settings.shortcuts)

  function assign(action: ShortcutAction, combo: string) {
    // A shortcut does one thing: the action that had it loses it.
    const taken = SHORTCUT_ACTIONS.find((a) => a !== action && combo && keys[a] === combo)
    onChange((s) => ({
      ...s,
      shortcuts: { ...s.shortcuts, [action]: combo, ...(taken ? { [taken]: '' } : {}) },
    }))
    setNote(
      taken
        ? t('{keys} deixou de abrir "{action}".', {
            keys: shortcutLabel(combo),
            action: actionName(taken),
          })
        : '',
    )
    setRecording(null)
  }

  function record(action: ShortcutAction, event: React.KeyboardEvent) {
    // Kept from the app's own shortcuts while one is being chosen.
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') return setRecording(null)
    if (event.key === 'Backspace' || event.key === 'Delete') return assign(action, '')
    const combo = comboOf(event)
    if (combo) assign(action, combo)
  }

  return (
    <div className="shortcuts space-y-3">
      <p className="text-xs text-muted-foreground">
        {t(
          'Clique num atalho e pressione as teclas novas, com Ctrl, ⌘ ou Alt. Backspace tira o atalho; Esc cancela.',
        )}
      </p>
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUT_ACTIONS.map((action) => (
            <tr key={action} className="border-b">
              <td className="py-2">{actionName(action)}</td>
              <td className="py-2 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('h-7 min-w-24 font-mono text-xs', recording === action && 'border-primary')}
                  aria-label={t('Atalho de {action}', { action: actionName(action) })}
                  onClick={() => setRecording(recording === action ? null : action)}
                  onKeyDown={(event) => recording === action && record(action, event)}
                  onBlur={() => recording === action && setRecording(null)}
                >
                  {recording === action ? t('Pressione as teclas…') : shortcutLabel(keys[action])}
                </Button>
              </td>
            </tr>
          ))}
          <tr className="border-b">
            <td className="py-2">{t('Enviar mensagem')}</td>
            <td className="py-2 text-right">
              <kbd className={kbd}>Enter</kbd>
            </td>
          </tr>
          <tr className="border-b">
            <td className="py-2">{t('Quebrar a linha')}</td>
            <td className="py-2 text-right">
              <kbd className={kbd}>Shift+Enter</kbd>
            </td>
          </tr>
        </tbody>
      </table>
      {note && (
        <p role="status" className="text-xs text-warning">
          {note}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={SHORTCUT_ACTIONS.every((a) => keys[a] === DEFAULT_SHORTCUTS[a])}
        onClick={() => {
          onChange((s) => ({ ...s, shortcuts: {} }))
          setNote('')
        }}
      >
        {t('Voltar aos atalhos padrão')}
      </Button>
    </div>
  )
}
