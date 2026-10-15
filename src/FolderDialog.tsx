import { useRef, useState } from 'react'
import { FileText, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { readAttachment } from './files'
import { t } from './i18n'
import type { Folder, Persona } from './types'

interface Props {
  folder: Folder
  personas: Persona[]
  onSave: (folder: Folder) => void
  onClose: () => void
}

// What every conversation in a folder gets: instructions, files and an agent.
export default function FolderDialog(p: Props) {
  const [instructions, setInstructions] = useState(p.folder.instructions ?? '')
  const [files, setFiles] = useState(p.folder.files ?? [])
  const [personaId, setPersonaId] = useState(p.folder.personaId ?? '')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function add(picked: File[]) {
    setError('')
    for (const file of picked) {
      try {
        const attachment = await readAttachment(file)
        if (attachment.kind === 'audio') throw new Error(t('"{name}": áudio não serve como contexto da pasta.', { name: file.name }))
        setFiles((list) => [...list, attachment])
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && p.onClose()}>
      <DialogContent className="dialog folder-dialog max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Contexto da pasta “{name}”', { name: p.folder.name })}</DialogTitle>
          <DialogDescription>
            {t('Vale para todas as conversas desta pasta, as que existem e as novas.')}
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t('Instruções')}</span>
          <Textarea
            aria-label={t('Instruções da pasta')}
            rows={6}
            placeholder={t('Ex.: Projeto do site do NWLab. Público: pequenas empresas. Tom direto, sem jargão. Cores #dc5000 e #05070a.')}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        <div className="space-y-1.5 text-sm">
          <span className="font-medium">{t('Arquivos de contexto')}</span>
          {files.map((file) => (
            <div key={file.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
              <FileText className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button aria-label={t('Remover {name}', { name: file.name })} onClick={() => setFiles((list) => list.filter((f) => f.id !== file.id))}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => input.current?.click()}>
            <Paperclip className="size-3.5" />
            {t('Adicionar arquivos')}
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            aria-label={t('Arquivos de contexto')}
            onChange={(e) => {
              void add([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">{t('Vão junto com cada pedido das conversas da pasta; textos, PDFs, imagens e planilhas.')}</p>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t('Agente da pasta')}</span>
          <select aria-label={t('Agente da pasta')} className="select-native w-full" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
            <option value="">{t('Nenhum')}</option>
            {p.personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name || t('Sem nome')}
              </option>
            ))}
          </select>
          <span className="block text-xs text-muted-foreground">
            {t('Usado nas conversas da pasta que não escolheram outro agente: o prompt, as ferramentas e os arquivos dele; numa conversa nova pela pasta, também o modelo.')}
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={p.onClose}>
            {t('Cancelar')}
          </Button>
          <Button
            onClick={() => {
              p.onSave({
                ...p.folder,
                instructions: instructions.trim() || undefined,
                files: files.length ? files : undefined,
                personaId: personaId || undefined,
              })
              p.onClose()
            }}
          >
            {t('Salvar')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
