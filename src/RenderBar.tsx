import { Clapperboard, Download, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { base64 } from './files'
import { t } from './i18n'
import { rendererReady, renderVideo, type RenderProgress, type Track } from './videoRender'

// Audio files picked here are read into memory and only go to the local renderer.
const MAX_TRACK_BYTES = 50 * 1024 * 1024
const PICK_FILE = '__file'

interface Props {
  code: string
  name: string
  // Audio already in the conversation.
  tracks: Track[]
}

type State =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'offline' }
  | { step: 'rendering'; progress: RenderProgress | null }
  | { step: 'done'; name: string; path: string; url: string }
  | { step: 'error'; message: string }

// Picks a soundtrack and asks the local renderer (npm run render:serve) for
// the MP4 of the composition.
export default function RenderBar(p: Props) {
  const [picked, setPicked] = useState<Track[]>([])
  const tracks = [...picked, ...p.tracks]
  const [trackId, setTrackId] = useState('')
  const [state, setState] = useState<State>({ step: 'idle' })
  const input = useRef<HTMLInputElement>(null)
  const track = tracks.find((item) => item.id === trackId) ?? null

  // The download link holds the video in memory until another one replaces it.
  const url = state.step === 'done' ? state.url : null
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  async function pickFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_TRACK_BYTES) {
      setState({ step: 'error', message: t('"{name}" passa de 50 MB.', { name: file.name }) })
      return
    }
    const item: Track = {
      id: crypto.randomUUID(),
      name: file.name,
      mime: file.type || 'audio/mpeg',
      data: await base64(file),
    }
    setPicked((current) => [item, ...current])
    setTrackId(item.id)
  }

  async function start() {
    setState({ step: 'checking' })
    if (!(await rendererReady())) return setState({ step: 'offline' })
    setState({ step: 'rendering', progress: null })
    try {
      const video = await renderVideo({ html: p.code, name: p.name, track }, (progress) =>
        setState({ step: 'rendering', progress }),
      )
      setState({ step: 'done', name: video.name, path: video.path, url: URL.createObjectURL(video.blob) })
    } catch (error) {
      setState({ step: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const busy = state.step === 'checking' || state.step === 'rendering'

  return (
    <div className="flex flex-col gap-1.5 border-t px-2 py-1.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground">
          {t('Trilha')}
          <select
            aria-label={t('Trilha')}
            className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5 text-xs text-foreground"
            value={trackId}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value === PICK_FILE) input.current?.click()
              else setTrackId(e.target.value)
            }}
          >
            <option value="">{t('Sem trilha')}</option>
            {tracks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value={PICK_FILE}>{t('Escolher arquivo de áudio…')}</option>
          </select>
        </label>
        <input
          ref={input}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
          aria-label={t('Arquivo de áudio')}
          className="hidden"
          onChange={(e) => {
            void pickFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={start}>
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Clapperboard className="size-3.5" />}
          {t('Gerar MP4')}
        </Button>
      </div>

      {state.step === 'rendering' && (
        <div className="flex items-center gap-2 text-muted-foreground" role="status">
          <progress
            className="h-1.5 flex-1 accent-primary"
            max={state.progress?.frames ?? 1}
            value={state.progress?.frame ?? 0}
          />
          {state.progress
            ? t('Quadro {frame} de {frames}', {
                frame: String(state.progress.frame),
                frames: String(state.progress.frames),
              })
            : t('Preparando…')}
        </div>
      )}
      {state.step === 'offline' && (
        <p className="text-warning" role="status">
          {t('O renderizador local não está rodando. Na pasta do TSRS, rode {command} e tente de novo.', {
            command: 'npm run render:serve',
          })}
        </p>
      )}
      {state.step === 'error' && (
        <p className="whitespace-pre-wrap text-destructive" role="alert">
          {state.message}
        </p>
      )}
      {state.step === 'done' && (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <a
            href={state.url}
            download={state.name}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <Download className="size-3.5" />
            {t('Baixar {name}', { name: state.name })}
          </a>
          <span className="min-w-0 truncate text-muted-foreground" title={state.path}>
            {t('Salvo em {path}', { path: state.path })}
          </span>
        </div>
      )}
      {state.step === 'idle' && (
        <p className="text-muted-foreground">
          {t('O MP4 é feito no seu computador, quadro a quadro, pelo renderizador local ({command}).', {
            command: 'npm run render:serve',
          })}
        </p>
      )}
    </div>
  )
}
