import {
  Download,
  ExternalLink,
  Monitor,
  PanelRightOpen,
  RotateCw,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { download } from './files'
import { t } from './i18n'
import Markdown from './Markdown'
import MotionStage from './MotionStage'
import {
  PREVIEW_SOURCE,
  fenced,
  isMarkdown,
  isMotion,
  isScript,
  motionSettings,
  normalizeUrl,
  previewDocument,
  urlSandbox,
  type Artifact,
  type ConsoleEntry,
} from './preview'

const MAX_LOG_ENTRIES = 500

const VIEWPORTS = {
  mobile: { width: 390, height: 844, icon: Smartphone, label: () => t('Celular') },
  tablet: { width: 820, height: 1180, icon: Tablet, label: () => t('Tablet') },
  desktop: { width: 1440, height: 900, icon: Monitor, label: () => t('Computador') },
}
type Viewport = keyof typeof VIEWPORTS
type Tab = 'preview' | 'code' | 'console'

interface Props {
  artifacts: Artifact[]
  activeId: string | null
  onActivate: (id: string) => void
  onCloseTab: (id: string) => void
  // Opens a page by address in a new tab of the panel.
  onOpenUrl: (url: string) => void
  onClose: () => void
}

// A fence longer than any run of backticks in the code, so it cannot end early.
// Generated code must never run with this app's origin, where the API keys
// live: the new tab only hosts a sandboxed frame.
function openSandboxed(title: string, html: string) {
  const tab = window.open('', '_blank')
  if (!tab) return
  tab.document.title = title
  const frame = tab.document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.srcdoc = html
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'
  tab.document.body.style.margin = '0'
  tab.document.body.append(frame)
}

export default function PreviewPanel(p: Props) {
  const artifact = p.artifacts.find((a) => a.id === p.activeId)
  const [tab, setTab] = useState<Tab>('preview')
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [address, setAddress] = useState('')
  const [badAddress, setBadAddress] = useState(false)
  // Bumped to load the frame again.
  const [reloads, setReloads] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const frameKey = `${artifact?.id}:${reloads}`
  // Console output of the frame identified by `key`.
  const [log, setLog] = useState<{ key: string; entries: ConsoleEntry[] }>({ key: '', entries: [] })
  const entries = log.key === frameKey ? log.entries : []
  const errors = entries.filter((entry) => entry.level === 'error').length

  const isUrl = artifact?.lang === 'url'
  const markdown = !!artifact && isMarkdown(artifact.lang)
  const motion = !!artifact && isMotion(artifact.lang)
  const html = artifact && !isUrl ? previewDocument(artifact.lang, artifact.code) : null

  useEffect(() => {
    setTab(artifact && isScript(artifact.lang) ? 'console' : 'preview')
    setAddress(artifact ? (artifact.lang === 'url' ? artifact.code : `artifact://${artifact.name}`) : '')
    setBadAddress(false)
  }, [artifact?.id])

  useEffect(() => {
    function receive(event: MessageEvent) {
      const data = event.data as {
        source?: string
        level?: ConsoleEntry['level']
        text?: string
        motion?: unknown
      }
      if (event.source !== frameRef.current?.contentWindow || data?.source !== PREVIEW_SOURCE) return
      // A composition saying it is ready is for the timeline, not the console.
      if (data.motion) return
      const entry: ConsoleEntry = { level: data.level ?? 'log', text: String(data.text ?? '') }
      setLog((current) => ({
        key: frameKey,
        entries: [...(current.key === frameKey ? current.entries : []), entry].slice(-MAX_LOG_ENTRIES),
      }))
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [frameKey])

  function openInTab() {
    if (!artifact) return
    if (isUrl) window.open(artifact.code, '_blank', 'noopener')
    else if (html) openSandboxed(artifact.name, html)
    else {
      const url = URL.createObjectURL(new Blob([artifact.code], { type: 'text/plain;charset=utf-8' }))
      window.open(url, '_blank', 'noopener')
    }
  }

  const size = VIEWPORTS[viewport]

  return (
    <section aria-label={t('Preview')} className="preview flex h-full flex-col bg-surface">
      <div className="flex items-center border-b">
        <div className="flex min-w-0 flex-1 overflow-x-auto" role="tablist">
          {p.artifacts.map((a) => (
            <div
              key={a.id}
              className={cn(
                'flex shrink-0 items-center border-r',
                a.id === p.activeId ? 'bg-background' : 'text-muted-foreground',
              )}
            >
              <button
                role="tab"
                aria-selected={a.id === p.activeId}
                className="max-w-40 truncate py-2 pl-3 pr-1 font-mono text-xs"
                onClick={() => p.onActivate(a.id)}
              >
                {a.name}
              </button>
              <button
                aria-label={t('Fechar {name}', { name: a.name })}
                className="mr-1 rounded p-0.5 hover:bg-accent"
                onClick={() => p.onCloseTab(a.id)}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={t('Fechar o preview')}
          title={t('Fechar o preview')}
          onClick={p.onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <form
        className="flex items-center gap-1 border-b px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          const url = normalizeUrl(address)
          setBadAddress(!url)
          if (url) p.onOpenUrl(url)
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t('Recarregar')}
          title={t('Recarregar')}
          disabled={!artifact}
          onClick={() => setReloads((n) => n + 1)}
        >
          <RotateCw className="size-3.5" />
        </Button>
        <input
          value={address}
          aria-label={t('Endereço')}
          aria-invalid={badAddress}
          placeholder={t('Digite um endereço, como localhost:3000')}
          spellCheck={false}
          className={cn(
            'mx-1 h-7 min-w-0 flex-1 rounded border bg-background px-2 font-mono text-xs text-muted-foreground outline-none focus:border-ring focus:text-foreground',
            badAddress && 'border-destructive',
          )}
          onChange={(e) => {
            setAddress(e.target.value)
            setBadAddress(false)
          }}
          onFocus={(e) => e.target.select()}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t('Abrir em nova aba')}
          title={t('Abrir em nova aba')}
          disabled={!artifact}
          onClick={openInTab}
        >
          <ExternalLink className="size-3.5" />
        </Button>
        {!isUrl && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t('Baixar')}
            title={t('Baixar')}
            disabled={!artifact}
            onClick={() =>
              artifact && download(artifact.name, artifact.code, motion ? 'text/html' : 'text/plain')
            }
          >
            <Download className="size-3.5" />
          </Button>
        )}
      </form>

      {!artifact ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
          <PanelRightOpen className="size-6" />
          <p className="text-sm font-medium text-foreground">{t('Nada para mostrar ainda')}</p>
          <p className="max-w-64 text-xs">
            {t(
              'Use “Abrir preview” em um bloco de código HTML, SVG, JavaScript, Markdown ou motion, ou digite um endereço acima.',
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
            {isUrl ? (
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {t('Se a página ficar em branco, o site não permite ser exibido dentro de outros aplicativos.')}
              </p>
            ) : (
              <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
                <TabsList className="h-7">
                  <TabsTrigger value="preview" className="text-xs">
                    {t('Preview')}
                  </TabsTrigger>
                  <TabsTrigger value="code" className="text-xs">
                    {t('Código')}
                  </TabsTrigger>
                  {html && (
                    <TabsTrigger value="console" className="gap-1 text-xs">
                      {t('Console')}
                      {errors > 0 && (
                        <span className="rounded bg-destructive px-1 font-mono text-[10px] text-destructive-foreground">
                          {errors}
                        </span>
                      )}
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            )}
            {motion ? (
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {(() => {
                  const m = motionSettings(artifact.code)
                  return `${m.width}×${m.height} · ${m.fps} fps`
                })()}
              </span>
            ) : (
              <div className="ml-auto flex items-center gap-1">
                {(Object.keys(VIEWPORTS) as Viewport[]).map((key) => {
                  const Icon = VIEWPORTS[key].icon
                  return (
                    <Button
                      key={key}
                      variant={viewport === key ? 'secondary' : 'ghost'}
                      size="icon"
                      className="size-7"
                      aria-label={VIEWPORTS[key].label()}
                      title={VIEWPORTS[key].label()}
                      aria-pressed={viewport === key}
                      onClick={() => setViewport(key)}
                    >
                      <Icon className="size-3.5" />
                    </Button>
                  )
                })}
                <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                  {size.width}×{size.height}
                </span>
              </div>
            )}
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto">
            {tab === 'code' && !isUrl && (
              <div className="px-3">
                <Markdown content={fenced(motion ? 'html' : artifact.lang, artifact.code)} />
              </div>
            )}
            {tab === 'console' && (
              <div className="font-mono text-xs">
                {entries.length === 0 && (
                  <p className="p-3 text-muted-foreground">{t('O console está vazio.')}</p>
                )}
                {entries.map((entry, index) => (
                  <div
                    key={index}
                    className={cn(
                      'whitespace-pre-wrap border-b px-3 py-1.5',
                      entry.level === 'error' && 'bg-destructive/5 text-destructive',
                      entry.level === 'warn' && 'bg-warning/5 text-warning',
                    )}
                  >
                    {entry.text}
                  </div>
                ))}
              </div>
            )}
            {/* The frame stays mounted behind the other tabs so its page keeps running. */}
            {motion && html ? (
              <div className={cn('h-full', tab !== 'preview' && 'hidden')}>
                <MotionStage
                  html={html}
                  code={artifact.code}
                  name={artifact.name}
                  frameKey={frameKey}
                  frameRef={frameRef}
                />
              </div>
            ) : (
              <div
                className={cn('flex h-full items-start justify-center p-3', tab !== 'preview' && 'hidden')}
              >
                <div
                  className="h-full overflow-auto rounded border bg-background"
                  style={
                    viewport === 'desktop'
                      ? { width: '100%' }
                      : { width: size.width, maxWidth: '100%', maxHeight: size.height }
                  }
                >
                  {markdown ? (
                    <div className="p-4">
                      <Markdown content={artifact.code} />
                    </div>
                  ) : isUrl ? (
                    <iframe
                      key={frameKey}
                      title={artifact.name}
                      src={artifact.code}
                      sandbox={urlSandbox(artifact.code, location.origin)}
                      referrerPolicy="no-referrer"
                      className="size-full border-0 bg-white"
                    />
                  ) : (
                    <iframe
                      key={frameKey}
                      ref={frameRef}
                      title={artifact.name}
                      // No allow-same-origin: generated code cannot reach this app's storage.
                      sandbox="allow-scripts"
                      srcDoc={html ?? ''}
                      className="size-full border-0 bg-white"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
