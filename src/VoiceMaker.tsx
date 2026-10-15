import { Loader2, Mic, Pause, Play, Sparkles, Square, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { t } from './i18n'
import { cloneVoice, designVoice, saveDesignedVoice, type DesignedPreview } from './mediaJobs'

// Makes a voice in the user's ElevenLabs account: designed from a
// description (three versions to choose from) or cloned from recordings of a
// person who agreed to it. The new voice is then picked to read aloud.

type Mode = 'design' | 'clone'

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Plays one sound at a time.
function usePlayer() {
  const [playing, setPlaying] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => audio.current?.pause(), [])
  function toggle(id: string, source: string) {
    audio.current?.pause()
    if (playing === id) return setPlaying(null)
    const next = new Audio(source)
    audio.current = next
    next.onended = next.onerror = () => setPlaying(null)
    setPlaying(id)
    next.play().catch(() => setPlaying(null))
  }
  return { playing, toggle }
}

export default function VoiceMaker(props: { apiKey: string; onCreated: (voiceId: string, note?: string) => void; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('design')
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="dialog max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Criar voz na ElevenLabs')}</DialogTitle>
          <DialogDescription>
            {t('A voz fica na sua conta da ElevenLabs e passa a ler as respostas. A ElevenLabs cobra créditos por isso, conforme o seu plano.')}
          </DialogDescription>
        </DialogHeader>
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(value) => value && setMode(value as Mode)}
          className="w-full"
        >
          <ToggleGroupItem value="design" className="flex-1 gap-1.5">
            <Sparkles className="size-3.5" />
            {t('Descrever')}
          </ToggleGroupItem>
          <ToggleGroupItem value="clone" className="flex-1 gap-1.5">
            <Mic className="size-3.5" />
            {t('Clonar de um áudio')}
          </ToggleGroupItem>
        </ToggleGroup>
        {mode === 'design' ? <Design {...props} /> : <Clone {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function Design(props: { apiKey: string; onCreated: (voiceId: string, note?: string) => void }) {
  const [description, setDescription] = useState('')
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [previews, setPreviews] = useState<DesignedPreview[]>([])
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState<'' | 'design' | 'save'>('')
  const [error, setError] = useState('')
  const player = usePlayer()
  const shortText = text.trim().length > 0 && text.trim().length < 100

  async function design() {
    setBusy('design')
    setError('')
    try {
      const made = await designVoice(props.apiKey, { description, text })
      setPreviews(made.previews)
      setChosen(made.previews[0]?.id ?? '')
      if (!text.trim()) setText(made.text)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy('')
    }
  }

  async function save() {
    setBusy('save')
    setError('')
    try {
      props.onCreated(await saveDesignedVoice(props.apiKey, { name, description, previewId: chosen }))
    } catch (err) {
      setError(message(err))
      setBusy('')
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="voice-description">{t('Como é a voz')}</Label>
        <Textarea
          id="voice-description"
          rows={3}
          placeholder={t('Ex.: locutor brasileiro de uns 40 anos, voz grave e calma, sotaque paulista, ritmo de podcast')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="voice-text">{t('Texto da amostra (opcional)')}</Label>
        <Textarea
          id="voice-text"
          rows={2}
          placeholder={t('De 100 a 1.000 caracteres. Em branco, a ElevenLabs escreve um que combina com a voz.')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {shortText && <p className="text-xs text-muted-foreground">{t('Com menos de 100 caracteres, a ElevenLabs escreve o texto.')}</p>}
      </div>
      <Button className="gap-1.5" disabled={description.trim().length < 20 || !!busy} onClick={design}>
        {busy === 'design' ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {previews.length ? t('Gerar outras versões') : t('Gerar versões')}
      </Button>
      {description.trim().length > 0 && description.trim().length < 20 && (
        <p className="text-xs text-muted-foreground">{t('Descreva com pelo menos 20 caracteres.')}</p>
      )}
      {previews.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">{t('Escolha uma versão')}</legend>
          {previews.map((preview, i) => (
            <label key={preview.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <input
                type="radio"
                name="voice-preview"
                checked={chosen === preview.id}
                onChange={() => setChosen(preview.id)}
              />
              <span className="flex-1">{t('Versão {n}', { n: i + 1 })}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={player.playing === preview.id ? t('Parar a versão {n}', { n: i + 1 }) : t('Ouvir a versão {n}', { n: i + 1 })}
                onClick={(e) => {
                  e.preventDefault()
                  player.toggle(preview.id, preview.audio)
                }}
              >
                {player.playing === preview.id ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </Button>
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <Input aria-label={t('Nome da voz')} placeholder={t('Nome da voz')} value={name} onChange={(e) => setName(e.target.value)} />
            <Button disabled={!name.trim() || !chosen || !!busy} onClick={save} className="gap-1.5">
              {busy === 'save' && <Loader2 className="size-4 animate-spin" />}
              {t('Salvar voz')}
            </Button>
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {t('Falhou: {message}', { message: error })}
        </p>
      )}
    </div>
  )
}

// Records from the microphone until stopped, for a cloning sample.
function useRecorder(onDone: (file: File) => void) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  async function start() {
    setError('')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return setError(t('O navegador não permitiu usar o microfone.'))
    }
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    const began = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - began) / 1000)), 500)
    recorder.ondataavailable = (event) => chunks.push(event.data)
    recorder.onstop = () => {
      window.clearInterval(timer)
      stream.getTracks().forEach((track) => track.stop())
      setRecording(false)
      const type = recorder.mimeType || 'audio/webm'
      const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
      onDone(new File(chunks, `gravacao-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${ext}`, { type }))
    }
    recorder.start()
    stop.current = () => recorder.state !== 'inactive' && recorder.stop()
    setSeconds(0)
    setRecording(true)
  }

  return { recording, seconds, error, start, stop: () => stop.current?.() }
}

function Clone(props: { apiKey: string; onCreated: (voiceId: string, note?: string) => void }) {
  const [name, setName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [removeNoise, setRemoveNoise] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const recorder = useRecorder((file) => setFiles((list) => [...list, file]))
  const player = usePlayer()
  const urls = useRef(new Map<File, string>())
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), [])
  const urlOf = (file: File) => {
    let url = urls.current.get(file)
    if (!url) {
      url = URL.createObjectURL(file)
      urls.current.set(file, url)
    }
    return url
  }

  async function create() {
    setBusy(true)
    setError('')
    try {
      const made = await cloneVoice(props.apiKey, { name, files, removeNoise })
      props.onCreated(made.id, made.verify ? t('A ElevenLabs pede para verificar esta voz no site antes de usá-la.') : undefined)
    } catch (err) {
      setError(message(err))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('Use de 1 a 5 minutos de fala limpa da mesma pessoa, sem música nem outras vozes. Grave aqui ou envie arquivos de áudio.')}
      </p>
      <div className="flex flex-wrap gap-2">
        {recorder.recording ? (
          <Button variant="destructive" className="gap-1.5" onClick={recorder.stop}>
            <Square className="size-3.5" />
            {t('Parar ({seconds} s)', { seconds: recorder.seconds })}
          </Button>
        ) : (
          <Button variant="outline" className="gap-1.5" onClick={recorder.start}>
            <Mic className="size-4" />
            {t('Gravar')}
          </Button>
        )}
        <Button variant="outline" className="gap-1.5" onClick={() => input.current?.click()}>
          <Upload className="size-4" />
          {t('Enviar áudio')}
        </Button>
        <input
          ref={input}
          type="file"
          accept="audio/*,video/*"
          multiple
          hidden
          aria-label={t('Arquivos de áudio para clonar')}
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])]
            setFiles((list) => [...list, ...picked])
            e.target.value = ''
          }}
        />
      </div>
      {recorder.error && <p className="text-xs text-destructive">{recorder.error}</p>}
      {files.length > 0 && (
        <ul className="space-y-1" aria-label={t('Amostras')}>
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('Ouvir {name}', { name: file.name })}
                onClick={() => player.toggle(file.name + i, urlOf(file))}
              >
                {player.playing === file.name + i ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </Button>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}
              >
                {t('Tirar')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex items-center justify-between gap-4 text-sm">
        {t('Remover ruído de fundo')}
        <Switch aria-label={t('Remover ruído de fundo')} checked={removeNoise} onCheckedChange={setRemoveNoise} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t('A voz é minha ou tenho autorização da pessoa para cloná-la.')}</span>
      </label>
      <div className="flex gap-2">
        <Input aria-label={t('Nome da voz')} placeholder={t('Nome da voz')} value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!name.trim() || !files.length || !consent || busy || recorder.recording} onClick={create} className="gap-1.5">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t('Clonar voz')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {t('Falhou: {message}', { message: error })}
        </p>
      )}
    </div>
  )
}
