import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Shows or hides a secret typed in the field beside it.
export function EyeButton(props: {
  visible: boolean
  show: string
  hide: string
  disabled?: boolean
  className?: string
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-8', props.className)}
      disabled={props.disabled}
      aria-label={props.visible ? props.hide : props.show}
      onClick={props.onToggle}
    >
      {props.visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
    </Button>
  )
}
