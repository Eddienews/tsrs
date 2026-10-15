import { Pause, Play, SkipBack, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { t } from './i18n'
import { PREVIEW_SOURCE, motionSettings, type MotionSettings } from './preview'
import RenderBar from './RenderBar'
import { fadeGain, trackBlob, type Track } from './videoRender'

// Tells the composition in the frame which time to show.
export const MOTION_SOURCE = 'tsrs-motion'

interface Props {
  html: string
  code: string
  name: string
  frameKey: string
  frameRef: RefObject<HTMLIFrameElement | null>
  // Audio in the conversation, offered as the video's soundtrack.
  tracks: Track[]
}

export function formatTime(seconds: number): string {
  return seconds.toFixed(2)
}

// A motion composition at its own frame size, scaled to fit the panel, with a
// timeline under it. The composition never plays by itself: every painted
// frame here is a seek, the same way `npm run render` makes the video.
export default function MotionStage(p: Props) {
  const declared = motionSettings(p.code)
  // What the composition reported once it loaded; the meta tags until then.
  const [reported, setReported] = useState<{ key: string; settings: MotionSettings } | null>(null)
  const settings = reported?.key === p.frameKey ? reported.settings : declared
  const ready = reported?.key === p.frameKey
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timeRef = useRef(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  // The soundtrack: chosen here, played with the timeline, sent with the render.
  const [picked, setPicked] = useState<Track[]>([])
  const tracks = [...picked, ...p.tracks]
  // Until the user picks one, the newest audio of the conversation is the
  // soundtrack: a song attached to ask for the video is meant to go with it.
  const [picking, setPicking] = useState<string | null>(null)
  const trackId = picking ?? p.tracks[0]?.id ?? ''
  const setTrackId = (id: string) => setPicking(id)
  const track = tracks.find((item) => item.id === trackId) ?? null
  const [muted, setMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!track) return setAudioUrl(null)
    const url = URL.createObjectURL(trackBlob(track))
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
    // A track's audio never changes; its id is enough.
  }, [track?.id])

  // A new composition, or the same one loaded again, starts at the beginning.
  useEffect(() => {
    setPlaying(false)
    setTime(0)
  }, [p.frameKey])

  useEffect(() => {
    function receive(event: MessageEvent) {
      const data = event.data as { source?: string; motion?: Partial<MotionSettings> }
      if (event.source !== p.frameRef.current?.contentWindow) return
      if (data?.source !== PREVIEW_SOURCE || !data.motion) return
      const m = data.motion
      setReported({
        key: p.frameKey,
        settings: {
          duration: Number(m.duration) || declared.duration,
          width: Number(m.width) || declared.width,
          height: Number(m.height) || declared.height,
          fps: Number(m.fps) || declared.fps,
        },
      })
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [p.frameKey, p.frameRef, declared.duration, declared.width, declared.height, declared.fps])

  // Every change of time is a seek in the frame.
  useEffect(() => {
    timeRef.current = time
    if (!ready) return
    p.frameRef.current?.contentWindow?.postMessage({ source: MOTION_SOURCE, seek: time }, '*')
  }, [time, ready, p.frameRef])

  // Playback advances the time and stops at the end. While the soundtrack
  // plays, its position is the clock, so picture and sound stay together.
  useEffect(() => {
    if (!playing) return
    const audio = audioRef.current
    if (audio && audioUrl) {
      audio.currentTime = timeRef.current
      audio.volume = fadeGain(timeRef.current, settings.duration)
      // A track shorter than the video simply ends; the clock goes on.
      audio.play().catch(() => {})
    }
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const sounding = audio && audioUrl && !audio.paused && !audio.ended
      const next = Math.min(
        settings.duration,
        sounding ? audio.currentTime : timeRef.current + (now - last) / 1000,
      )
      last = now
      if (audio) audio.volume = fadeGain(next, settings.duration)
      setTime(next)
      if (next >= settings.duration) setPlaying(false)
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      audio?.pause()
    }
  }, [playing, settings.duration, audioUrl])

  useLayoutEffect(() => {
    const element = boxRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const scale =
    box.width && box.height ? Math.min(box.width / settings.width, box.height / settings.height) : 0

  function togglePlay() {
    if (playing) setPlaying(false)
    else {
      if (time >= settings.duration) setTime(0)
      setPlaying(true)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#111]">
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: settings.width,
            height: settings.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          <iframe
            key={p.frameKey}
            ref={p.frameRef}
            title={p.name}
            // No allow-same-origin: generated code cannot reach this app's storage.
            sandbox="allow-scripts"
            srcDoc={p.html}
            width={settings.width}
            height={settings.height}
            className="block border-0 bg-white"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-2 py-1.5" aria-label={t('Linha do tempo')}>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t('Voltar ao início')}
          title={t('Voltar ao início')}
          disabled={!ready}
          onClick={() => {
            setPlaying(false)
            setTime(0)
          }}
        >
          <SkipBack className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={playing ? t('Pausar') : t('Reproduzir')}
          title={playing ? t('Pausar') : t('Reproduzir')}
          disabled={!ready}
          onClick={togglePlay}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </Button>
        <input
          type="range"
          aria-label={t('Tempo')}
          min={0}
          max={settings.duration}
          step={1 / settings.fps}
          value={time}
          disabled={!ready}
          className="min-w-0 flex-1 accent-primary"
          onChange={(e) => {
            setPlaying(false)
            setTime(Number(e.target.value))
          }}
        />
        <span
          className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
          data-testid="motion-time"
        >
          {formatTime(time)} / {formatTime(settings.duration)} s
        </span>
        {audioUrl && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={muted ? t('Ligar o som') : t('Tirar o som')}
            title={muted ? t('Ligar o som') : t('Tirar o som')}
            aria-pressed={muted}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </Button>
        )}
        {audioUrl && <audio ref={audioRef} src={audioUrl} muted={muted} preload="auto" data-testid="motion-audio" />}
      </div>
      <RenderBar
        code={p.code}
        name={p.name}
        tracks={tracks}
        trackId={trackId}
        onTrack={(id) => {
          setPlaying(false)
          setTrackId(id)
        }}
        onPick={(item) => {
          setPlaying(false)
          setPicked((current) => [item, ...current])
          setTrackId(item.id)
        }}
      />
    </div>
  )
}
