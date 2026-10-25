import { ArrowLeft, Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { t } from './i18n'

// The top of a page that takes the conversation's place (board, agent table,
// Mission Control): back to the conversation, its title and its own actions.
export default function PageHeader(props: {
  title: string
  onBack: () => void
  showMenu: boolean
  onMenu: () => void
  children?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
      {props.showMenu && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('Abrir a lista de conversas')}
          onClick={props.onMenu}
        >
          <Menu className="size-4" />
        </Button>
      )}
      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={props.onBack}>
        <ArrowLeft className="size-4" />
        {t('Conversa')}
      </Button>
      <h1 className="text-sm font-medium">{props.title}</h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">{props.children}</div>
    </header>
  )
}
