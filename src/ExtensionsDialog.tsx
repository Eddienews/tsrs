import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, FolderUp, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  extensionsRoot,
  filesToUpload,
  installExample,
  listExamples,
  listPlugins,
  listSkills,
  post,
  readSkill,
  type Example,
  type Plugin,
  type Skill,
} from './extensions'
import { t } from './i18n'
import type { McpServer, Persona, Settings } from './types'

export type ExtensionsTab = 'skills' | 'plugins' | 'examples' | 'agenda'

interface Props {
  settings: Settings
  onChange: (update: (s: Settings) => Settings) => void
  onClose: () => void
  // Called after anything is installed, changed or removed.
  onChanged: () => void
  // The schedule's tab, which lives in its own module.
  agenda?: ReactNode
  initialTab?: ExtensionsTab
}

const hint = 'text-xs text-muted-foreground'

function toggleIn(list: string[] | undefined, value: string, on: boolean): string[] {
  const rest = (list ?? []).filter((v) => v !== value)
  return on ? rest : [...rest, value]
}

// Buttons that send a .zip/.skill/.md, or a whole folder, to be installed.
function InstallButtons(p: { label: string; accept: string; onFiles: (files: File[]) => void; busy: boolean }) {
  const file = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  useEffect(() => {
    folder.current?.setAttribute('webkitdirectory', '')
  }, [])
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" className="gap-1.5" disabled={p.busy} onClick={() => file.current?.click()}>
        <Upload className="size-3.5" />
        {p.label}
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" disabled={p.busy} onClick={() => folder.current?.click()}>
        <FolderUp className="size-3.5" />
        {t('Instalar uma pasta')}
      </Button>
      <input
        ref={file}
        type="file"
        hidden
        accept={p.accept}
        aria-label={p.label}
        onChange={(e) => {
          p.onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <input
        ref={folder}
        type="file"
        hidden
        multiple
        aria-label={t('Instalar uma pasta')}
        onChange={(e) => {
          p.onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}

function SkillEditor(p: { skill?: Skill & { body: string }; onSave: (s: { name: string; description: string; body: string }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(p.skill?.name ?? '')
  const [description, setDescription] = useState(p.skill?.description ?? '')
  const [body, setBody] = useState(p.skill?.body ?? '')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="skill-editor space-y-2 rounded-md border p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await p.onSave({ name, description, body })
        } finally {
          setBusy(false)
        }
      }}
    >
      <Input aria-label={t('Nome da skill')} placeholder={t('Nome, como relatorio-mensal')} value={name} onChange={(e) => setName(e.target.value)} />
      <Input
        aria-label={t('Quando usar')}
        placeholder={t('Quando usar: o modelo decide por esta descrição')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Textarea
        aria-label={t('Instruções da skill')}
        placeholder={t('As instruções, em Markdown: passos, regras, exemplos.')}
        rows={8}
        className="font-mono text-xs"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={p.onCancel}>
          {t('Cancelar')}
        </Button>
        <Button type="submit" size="sm" disabled={busy || !name.trim() || !description.trim()}>
          {t('Salvar')}
        </Button>
      </div>
    </form>
  )
}

function SkillsTab(p: Props & { skills: Skill[]; reload: () => void; setNote: (note: string) => void }) {
  const [editing, setEditing] = useState<(Skill & { body: string }) | 'new' | null>(null)
  const [open, setOpen] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const off = new Set(p.settings.disabledSkills ?? [])

  async function install(files: File[]) {
    if (!files.length) return
    setBusy(true)
    try {
      const skill = await post<Skill>('/skills/install', { files: await filesToUpload(files) })
      p.setNote(t('Skill “{name}” instalada.', { name: skill.name }))
      p.reload()
    } catch (err) {
      p.setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function show(skill: Skill) {
    if (open[skill.id] !== undefined) return setOpen(({ [skill.id]: _, ...rest }) => rest)
    const full = await readSkill(skill.id)
    setOpen((o) => ({ ...o, [skill.id]: full.text }))
  }

  return (
    <div className="space-y-3">
      <p className={hint}>
        {t(
          'Skills são pastas com um SKILL.md: um nome, quando usar e as instruções, no mesmo formato das skills do Claude. O modelo vê só os nomes e as descrições e carrega a skill quando uma tarefa precisa dela.',
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <InstallButtons label={t('Instalar .zip, .skill ou SKILL.md')} accept=".zip,.skill,.md" onFiles={install} busy={busy} />
        <Button size="sm" className="gap-1.5" onClick={() => setEditing('new')}>
          <Plus className="size-3.5" />
          {t('Nova skill')}
        </Button>
      </div>
      {editing && (
        <SkillEditor
          skill={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSave={async (fields) => {
            await post('/skills/save', { ...fields, previous: editing === 'new' ? undefined : editing.name })
            setEditing(null)
            p.setNote(t('Skill “{name}” salva.', { name: fields.name }))
            p.reload()
          }}
        />
      )}
      {p.skills.length === 0 && <p className={hint}>{t('Nenhuma skill ainda.')}</p>}
      {p.skills.map((skill) => (
        <div key={skill.id} className="skill space-y-1.5 rounded-md border p-3" data-skill={skill.id}>
          <div className="flex items-start gap-2">
            <button className="mt-0.5" aria-label={t('Ver {name}', { name: skill.name })} onClick={() => show(skill)}>
              {open[skill.id] !== undefined ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {skill.name}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                  {skill.source === 'user' ? t('minha') : t('plugin {name}', { name: skill.source })}
                </span>
              </p>
              <p className={hint}>{skill.description || t('(sem descrição)')}</p>
              {skill.files.length > 0 && (
                <p className={hint}>{t('{count} arquivos de apoio', { count: skill.files.length })}</p>
              )}
            </div>
            <Switch
              aria-label={t('Usar a skill {name}', { name: skill.name })}
              checked={!off.has(skill.id)}
              onCheckedChange={(on) => p.onChange((s) => ({ ...s, disabledSkills: toggleIn(s.disabledSkills, skill.id, on) }))}
            />
          </div>
          {open[skill.id] !== undefined && (
            <>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-code p-2 font-mono text-[11px]">{open[skill.id]}</pre>
              {skill.source === 'user' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => setEditing(await readSkill(skill.id))}
                  >
                    {t('Editar')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      if (!confirm(t('Remover a skill “{name}”? Ela vai para extensoes/_removidas.', { name: skill.name }))) return
                      await post('/skills/remove', { id: skill.id })
                      p.reload()
                    }}
                  >
                    {t('Remover')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

const TOOL_EXAMPLE = '{\n  "type": "object",\n  "properties": {\n    "cidade": { "type": "string" }\n  },\n  "required": ["cidade"]\n}'

function ToolEditor(p: { onSaved: () => void; onCancel: () => void; setNote: (note: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parameters, setParameters] = useState(TOOL_EXAMPLE)
  const [kind, setKind] = useState<'http' | 'js'>('http')
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState('GET')
  const [js, setJs] = useState("// 'input' tem os argumentos; devolva o resultado.\nreturn `Olá, ${input.cidade}`")
  let schema: unknown = null
  try {
    schema = JSON.parse(parameters)
  } catch {
    schema = null
  }
  return (
    <form
      className="tool-editor space-y-2 rounded-md border p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await post('/tools/save', {
            tool: { name, description, parameters: schema, ...(kind === 'http' ? { http: { url, method } } : { js }) },
          })
          p.setNote(t('Ferramenta “{name}” salva no plugin minhas-ferramentas.', { name }))
          p.onSaved()
        } catch (err) {
          p.setNote(err instanceof Error ? err.message : String(err))
        }
      }}
    >
      <Input aria-label={t('Nome da ferramenta')} placeholder={t('Nome, como previsao_do_tempo')} value={name} onChange={(e) => setName(e.target.value)} />
      <Input aria-label={t('O que a ferramenta faz')} placeholder={t('O que faz: o modelo decide por esta descrição')} value={description} onChange={(e) => setDescription(e.target.value)} />
      <Textarea aria-label={t('Parâmetros (JSON Schema)')} rows={5} className="font-mono text-xs" value={parameters} onChange={(e) => setParameters(e.target.value)} />
      {!schema && <p className="text-xs text-destructive">{t('Não é um objeto JSON válido.')}</p>}
      <div className="flex gap-2">
        <select aria-label={t('Tipo da ferramenta')} className="select-native" value={kind} onChange={(e) => setKind(e.target.value as 'http' | 'js')}>
          <option value="http">HTTP</option>
          <option value="js">JavaScript</option>
        </select>
        {kind === 'http' && (
          <>
            <select aria-label={t('Método')} className="select-native" value={method} onChange={(e) => setMethod(e.target.value)}>
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <Input aria-label="URL" placeholder="https://api.exemplo.com/clima/{cidade}" className="font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} />
          </>
        )}
      </div>
      {kind === 'http' ? (
        <p className={hint}>
          {t(
            '{param} na URL usa o argumento com esse nome; os outros vão na query (GET) ou no corpo JSON. ${env:NOME} usa uma variável de ambiente do computador, para a chave não ficar no arquivo. O servidor do TSRS faz a chamada.',
          )}
        </p>
      ) : (
        <>
          <Textarea aria-label={t('Código JavaScript')} rows={6} className="font-mono text-xs" value={js} onChange={(e) => setJs(e.target.value)} />
          <p className={hint}>{t('Roda isolado do TSRS (sem acesso às chaves e às conversas), por até 15 segundos.')}</p>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={p.onCancel}>
          {t('Cancelar')}
        </Button>
        <Button type="submit" size="sm" disabled={!name.trim() || !description.trim() || !schema || (kind === 'http' ? !url.trim() : !js.trim())}>
          {t('Salvar')}
        </Button>
      </div>
    </form>
  )
}

function PluginsTab(p: Props & { plugins: Plugin[]; reload: () => void; setNote: (note: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [tool, setTool] = useState(false)
  const off = new Set(p.settings.disabledPlugins ?? [])

  async function install(files: File[]) {
    if (!files.length) return
    setBusy(true)
    try {
      const plugin = await post<Plugin>('/plugins/install', { files: await filesToUpload(files) })
      p.setNote(t('Plugin “{name}” instalado.', { name: plugin.name }))
      p.reload()
    } catch (err) {
      p.setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function addAgent(plugin: Plugin, agent: Plugin['agents'][number]) {
    const persona: Persona = { id: crypto.randomUUID(), name: agent.name, system: agent.body }
    p.onChange((s) => ({ ...s, personas: [...s.personas, persona] }))
    p.setNote(t('Agente “{name}” adicionado à biblioteca.', { name: `${agent.name} (${plugin.name})` }))
  }

  function addMcp(server: Plugin['mcp'][number]) {
    const auth = server.headers?.Authorization ?? server.headers?.authorization ?? ''
    const entry: McpServer = {
      id: crypto.randomUUID(),
      name: server.name,
      url: server.url,
      token: auth.replace(/^Bearer\s+/i, ''),
      enabled: true,
      autoApprove: false,
    }
    p.onChange((s) => ({ ...s, mcpServers: [...s.mcpServers, entry] }))
    p.setNote(t('Servidor MCP “{name}” adicionado às Ferramentas.', { name: server.name }))
  }

  return (
    <div className="space-y-3">
      <p className={hint}>
        {t(
          'Um plugin junta skills, comandos (aparecem em Prompts), agentes, servidores MCP e ferramentas próprias, no formato dos plugins do Claude (.claude-plugin/plugin.json). Instale só plugins de quem você confia: as ferramentas recebem o que o modelo enviar.',
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <InstallButtons label={t('Instalar plugin .zip')} accept=".zip,.plugin" onFiles={install} busy={busy} />
        <Button size="sm" className="gap-1.5" onClick={() => setTool(true)}>
          <Plus className="size-3.5" />
          {t('Nova ferramenta')}
        </Button>
      </div>
      {tool && (
        <ToolEditor
          setNote={p.setNote}
          onCancel={() => setTool(false)}
          onSaved={() => {
            setTool(false)
            p.reload()
          }}
        />
      )}
      {p.plugins.length === 0 && <p className={hint}>{t('Nenhum plugin ainda.')}</p>}
      {p.plugins.map((plugin) => (
        <div key={plugin.id} className="plugin space-y-2 rounded-md border p-3" data-plugin={plugin.name}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {plugin.name}
                {plugin.version && <span className="ml-2 text-xs font-normal text-muted-foreground">v{plugin.version}</span>}
                {plugin.author && <span className="ml-2 text-xs font-normal text-muted-foreground">{plugin.author}</span>}
              </p>
              {plugin.description && <p className={hint}>{plugin.description}</p>}
            </div>
            <Switch
              aria-label={t('Usar o plugin {name}', { name: plugin.name })}
              checked={!off.has(plugin.name)}
              onCheckedChange={(on) => p.onChange((s) => ({ ...s, disabledPlugins: toggleIn(s.disabledPlugins, plugin.name, on) }))}
            />
          </div>
          <ul className="space-y-1 text-xs">
            {plugin.skills.length > 0 && (
              <li>
                <b>{t('Skills')}:</b> {plugin.skills.join(', ')}
              </li>
            )}
            {plugin.commands.length > 0 && (
              <li>
                <b>{t('Comandos')}:</b> {plugin.commands.map((c) => `/${c.name}`).join(', ')}{' '}
                <span className="text-muted-foreground">{t('(em Prompts)')}</span>
              </li>
            )}
            {plugin.tools.map((tl) => (
              <li key={tl.name}>
                <b>{t('Ferramenta')}:</b> {tl.name} <span className="text-muted-foreground">({tl.kind === 'none' ? t('sem HTTP nem código') : tl.kind.toUpperCase()})</span> {tl.description}
              </li>
            ))}
            {plugin.agents.map((agent) => (
              <li key={agent.name} className="flex flex-wrap items-center gap-2">
                <span>
                  <b>{t('Agente')}:</b> {agent.name}
                </span>
                <button className="text-primary underline-offset-2 hover:underline" onClick={() => addAgent(plugin, agent)}>
                  {t('Adicionar aos agentes')}
                </button>
              </li>
            ))}
            {plugin.mcp.map((server) => (
              <li key={server.name} className="flex flex-wrap items-center gap-2">
                <span>
                  <b>MCP:</b> {server.name}
                </span>
                {server.url ? (
                  p.settings.mcpServers.some((m) => m.url === server.url) ? (
                    <span className="text-muted-foreground">{t('já está nas Ferramentas')}</span>
                  ) : (
                    <button className="text-primary underline-offset-2 hover:underline" onClick={() => addMcp(server)}>
                      {t('Adicionar às Ferramentas')}
                    </button>
                  )
                ) : (
                  <span className="text-muted-foreground">
                    {t('roda um programa no computador ({command}); o TSRS usa só servidores MCP remotos', { command: server.command ?? server.type })}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (!confirm(t('Remover o plugin “{name}”? Ele vai para extensoes/_removidas.', { name: plugin.name }))) return
              await post('/plugins/remove', { id: plugin.id })
              p.reload()
            }}
          >
            {t('Remover')}
          </Button>
        </div>
      ))}
    </div>
  )
}

export default function ExtensionsDialog(p: Props) {
  const [tab, setTab] = useState<ExtensionsTab>(p.initialTab ?? 'skills')
  const [root, setRoot] = useState<string | null | undefined>(undefined)
  const [skills, setSkills] = useState<Skill[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [note, setNote] = useState('')
  const [version, setVersion] = useState(0)
  const reload = () => {
    setVersion((n) => n + 1)
    p.onChanged()
  }
  useEffect(() => {
    let stale = false
    extensionsRoot().then((found) => {
      if (stale) return
      setRoot(found)
      if (!found) return
      listSkills().then((list) => !stale && setSkills(list))
      listPlugins().then((list) => !stale && setPlugins(list))
    })
    return () => {
      stale = true
    }
  }, [version])

  return (
    <Dialog open onOpenChange={(open) => !open && p.onClose()}>
      <DialogContent className="dialog extensions max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Extensões')}</DialogTitle>
          <DialogDescription>
            {root ? t('Guardadas em {root}', { root }) : t('Skills, plugins e tarefas agendadas.')}
          </DialogDescription>
        </DialogHeader>
        {root === null ? (
          <p className="text-sm text-warning">
            {t('Este TSRS não está rodando pelo npm run dev, então não consegue guardar extensões no computador.')}
          </p>
        ) : (
          <>
            <Tabs value={tab} onValueChange={(value) => setTab(value as ExtensionsTab)}>
              <TabsList>
                <TabsTrigger value="skills">{t('Skills')}</TabsTrigger>
                <TabsTrigger value="plugins">{t('Plugins')}</TabsTrigger>
                <TabsTrigger value="examples">{t('Exemplos')}</TabsTrigger>
                <TabsTrigger value="agenda">{t('Agenda')}</TabsTrigger>
              </TabsList>
            </Tabs>
            {note && (
              <p role="status" className="rounded-md border px-3 py-2 text-xs">
                {note}
              </p>
            )}
            {tab === 'skills' && <SkillsTab {...p} skills={skills} reload={reload} setNote={setNote} />}
            {tab === 'plugins' && <PluginsTab {...p} plugins={plugins} reload={reload} setNote={setNote} />}
            {tab === 'examples' && <ExamplesTab version={version} reload={reload} setNote={setNote} />}
            {tab === 'agenda' && p.agenda}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// The skills and plugins that come with TSRS, installed with one click.
function ExamplesTab(props: { version: number; reload: () => void; setNote: (note: string) => void }) {
  const [examples, setExamples] = useState<{ skills: Example[]; plugins: Example[] } | null>(null)
  const [busy, setBusy] = useState('')
  useEffect(() => {
    let stale = false
    listExamples()
      .then((list) => !stale && setExamples(list))
      .catch((err) => !stale && props.setNote(t('Falhou: {message}', { message: err instanceof Error ? err.message : String(err) })))
    return () => {
      stale = true
    }
  }, [props.version])

  async function install(kind: 'skill' | 'plugin', example: Example) {
    setBusy(example.id)
    try {
      await installExample(kind, example.id)
      props.setNote(t('"{name}" instalado. Você pode editar a cópia na aba {tab}.', { name: example.name, tab: kind === 'skill' ? t('Skills') : t('Plugins') }))
      props.reload()
    } catch (err) {
      props.setNote(t('Falhou: {message}', { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy('')
    }
  }

  const row = (kind: 'skill' | 'plugin', example: Example) => (
    <li key={example.id} className="flex items-start gap-2 rounded-md border p-2" data-example={example.id}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{example.name}</p>
        <p className="text-xs text-muted-foreground">{example.description}</p>
      </div>
      <Button
        variant={example.installed ? 'ghost' : 'outline'}
        size="sm"
        className="h-7 shrink-0 text-xs"
        disabled={busy === example.id}
        aria-label={example.installed ? t('Reinstalar {name}', { name: example.name }) : t('Instalar {name}', { name: example.name })}
        onClick={() => install(kind, example)}
      >
        {example.installed ? t('Reinstalar') : t('Instalar')}
      </Button>
    </li>
  )

  if (!examples) return <p className="text-xs text-muted-foreground">{t('Carregando…')}</p>
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t('Extensões de exemplo que vêm com o TSRS, para usar e para copiar. Instalar põe uma cópia em extensoes/; reinstalar guarda a versão anterior em extensoes/_removidas/.')}
      </p>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('Skills')}</h3>
        <ul className="space-y-1.5">{examples.skills.map((e) => row('skill', e))}</ul>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('Plugins')}</h3>
        <ul className="space-y-1.5">{examples.plugins.map((e) => row('plugin', e))}</ul>
      </section>
    </div>
  )
}
