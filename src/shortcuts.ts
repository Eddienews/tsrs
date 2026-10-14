import { t } from './i18n'

// Keyboard shortcuts the user can change. A shortcut is written as its
// modifiers, in a fixed order, and a key: 'Mod+K', 'Alt+Shift+N'. Mod is Ctrl,
// or ⌘ on a Mac. An empty string turns the action off.

export type ShortcutAction = 'palette' | 'preview' | 'new' | 'temporary'

export const SHORTCUT_ACTIONS: ShortcutAction[] = ['palette', 'preview', 'new', 'temporary']

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  palette: 'Mod+K',
  preview: 'Mod+.',
  new: 'Alt+N',
  temporary: '',
}

// Looked up when shown, so the names follow the interface language.
export function actionName(action: ShortcutAction): string {
  switch (action) {
    case 'palette':
      return t('Paleta de comandos')
    case 'preview':
      return t('Abrir ou fechar o preview')
    case 'new':
      return t('Nova conversa')
    case 'temporary':
      return t('Nova conversa temporária')
  }
}

export function shortcutsOf(saved: Partial<Record<ShortcutAction, string>> | undefined) {
  return { ...DEFAULT_SHORTCUTS, ...saved }
}

interface KeyInput {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

// The key itself, read from its position for letters and digits so that Alt
// on a Mac, which turns N into a dead key, and other layouts still match.
function keyName({ key, code }: KeyInput): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (code === 'Period') return '.'
  if (code === 'Comma') return ','
  if (code === 'Slash') return '/'
  if (key === ' ') return 'Space'
  return key.length === 1 ? key.toUpperCase() : key
}

// The shortcut a key press makes, or '' for a press that cannot be one: a
// modifier alone, or a plain key that would steal typing.
export function comboOf(event: KeyInput): string {
  if (['Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'CapsLock'].includes(event.key)) return ''
  const key = keyName(event)
  const mods = [
    (event.ctrlKey || event.metaKey) && 'Mod',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
  ].filter(Boolean)
  const functionKey = /^F([1-9]|1[0-2])$/.test(key)
  if (!functionKey && !mods.some((m) => m === 'Mod' || m === 'Alt')) return ''
  return [...mods, key].join('+')
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

// How a shortcut is shown: Ctrl+K, or ⌘+K on a Mac.
export function shortcutLabel(combo: string, mac = isMac()): string {
  if (!combo) return t('Nenhum')
  return combo
    .split('+')
    .map((part) => (part === 'Mod' ? (mac ? '⌘' : 'Ctrl') : part === 'Alt' && mac ? '⌥' : part))
    .join('+')
}
