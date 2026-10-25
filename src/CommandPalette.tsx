import {
  Columns3,
  Eraser,
  Gauge,
  Users,
  BarChart3,
  Cpu,
  Library,
  Lock,
  MessageSquare,
  MessageSquareDashed,
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
  | 'temporary'
  | 'preview'
  | 'tools'
  | 'library'
  | 'settings'
  | 'usage'
  | 'mission'
  | 'board'
  | 'table'
  | 'theme'
  | 'lock'
  | 'clear'

interface Props {
  chats: ChatMeta[]
  settings: Settings
  // Whether there are unlocked, password-protected keys to lock.
  canLock: boolean
  // Whether the open conversation has messages whose context can be cleared.
  canClear?: boolean
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
    ['temporary', t('Nova conversa temporária'), MessageSquareDashed],
    ['preview', t('Abrir ou fechar o preview'), PanelRight],
    ['tools', t('Ferramentas'), Wrench],
    ['library', t('Biblioteca'), Library],
    ['usage', t('Uso'), BarChart3],
    ['mission', t('Painel do dia'), Gauge],
    ['board', t('Quadro de produção'), Columns3],
    ['table', t('Mesa de agentes'), Users],
    ['settings', t('Configurações'), SettingsIcon],
    ['theme', t('Alternar tema'), SunMoon],
  ]
  if (p.canClear) actions.push(['clear', t('Limpar o contexto da conversa'), Eraser])
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
