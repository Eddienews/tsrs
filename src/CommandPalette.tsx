import {
  Cpu,
  Library,
  Lock,
  MessageSquare,
  PanelRight,
  Plus,
  Settings as SettingsIcon,
  SunMoon,
  Wrench,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { t } from './i18n'
import { PROVIDERS } from './providers'
import type { ChatMeta, Settings } from './types'

export type PaletteAction =
  | 'new'
  | 'preview'
  | 'tools'
  | 'library'
  | 'settings'
  | 'theme'
  | 'lock'

interface Props {
  chats: ChatMeta[]
  settings: Settings
  // Whether there are unlocked, password-protected keys to lock.
  canLock: boolean
  onChat: (id: string) => void
  onModel: (providerId: string, model: string) => void
  onAction: (action: PaletteAction) => void
  onClose: () => void
}

export default function CommandPalette(p: Props) {
  const run = (action: () => void) => {
    p.onClose()
    action()
  }
  const actions: [PaletteAction, string, typeof Plus][] = [
    ['new', t('Nova conversa'), Plus],
    ['preview', t('Abrir ou fechar o preview'), PanelRight],
    ['tools', t('Ferramentas'), Wrench],
    ['library', t('Biblioteca'), Library],
    ['settings', t('Configurações'), SettingsIcon],
    ['theme', t('Alternar tema'), SunMoon],
  ]
  if (p.canLock) actions.push(['lock', t('Bloquear agora'), Lock])

  return (
    <CommandDialog open onOpenChange={(open) => !open && p.onClose()}>
      <CommandInput placeholder={t('Buscar conversas, modelos e ações…')} />
      <CommandList>
        <CommandEmpty>{t('Nada encontrado.')}</CommandEmpty>
        <CommandGroup heading={t('Ações')}>
          {actions.map(([action, label, Icon]) => (
            <CommandItem key={action} onSelect={() => run(() => p.onAction(action))}>
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        {p.chats.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('Conversas')}>
              {p.chats.map((chat) => (
                <CommandItem
                  key={chat.id}
                  value={`${chat.title} ${chat.id}`}
                  onSelect={() => run(() => p.onChat(chat.id))}
                >
                  <MessageSquare />
                  <span className="truncate">{chat.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading={t('Trocar de modelo')}>
          {PROVIDERS.flatMap((provider) =>
            p.settings.providers[provider.id].models.map((model) => (
              <CommandItem
                key={`${provider.id}/${model}`}
                value={`${provider.name} ${model}`}
                onSelect={() => run(() => p.onModel(provider.id, model))}
              >
                <Cpu />
                <span className="truncate font-mono text-xs">{model}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {provider.name}
                </span>
              </CommandItem>
            )),
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
