import { t } from './i18n'
import type { SavedPrompt } from './types'

// What can be called from the message field with /name, or from its Commands
// menu: installed skills, plugin commands, the tools TSRS brings, MCP servers
// and saved prompts. Picking one puts its text in the field to finish and send.
export type CommandGroup = 'skill' | 'plugin' | 'tool' | 'mcp' | 'prompt'

export interface ComposerCommand {
  id: string
  // Typed after the slash.
  name: string
  group: CommandGroup
  description: string
  // What goes into the field.
  text: string
  // A saved prompt or plugin command with {{fields}} or steps is filled first.
  prompt?: SavedPrompt
}

export const GROUPS: { id: CommandGroup; label: () => string }[] = [
  { id: 'skill', label: () => t('Skills') },
  { id: 'plugin', label: () => t('Comandos de plugins') },
  { id: 'tool', label: () => t('Ferramentas do TSRS') },
  { id: 'mcp', label: () => t('Servidores MCP') },
  { id: 'prompt', label: () => t('Prompts salvos') },
]

// The /name being typed: only a slash at the very start of the message.
export function slashQuery(beforeCaret: string): string | null {
  const match = /^\/([^\s/]{0,40})$/u.exec(beforeCaret)
  return match ? match[1] : null
}

const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// Commands whose name starts with what was typed, then those that mention it.
export function slashMatches(query: string, commands: ComposerCommand[]): ComposerCommand[] {
  const wanted = fold(query)
  if (!wanted) return commands
  const starts = commands.filter((c) => fold(c.name).startsWith(wanted))
  const contains = commands.filter(
    (c) => !starts.includes(c) && (fold(c.name).includes(wanted) || fold(c.description).includes(wanted)),
  )
  return [...starts, ...contains]
}

const slug = (text: string) =>
  fold(text)
    .replace(/[^a-z0-9:]+/g, '-')
    .replace(/^-|-$/g, '') || 'prompt'

interface Sources {
  skills: { id: string; name: string; description: string }[]
  // Plugin commands, as commandPrompts() gives them: title "/name · plugin".
  pluginPrompts: SavedPrompt[]
  prompts: SavedPrompt[]
  mcpServers: { id: string; name: string }[]
  // This TSRS can keep project folders (and so offers its folder tools).
  projects: boolean
}

// The tools TSRS brings, with a start of a request that calls them.
function toolCommands(): ComposerCommand[] {
  return [
    {
      id: 'tool:pasta',
      name: 'pasta',
      group: 'tool',
      description: t('Ler, criar e editar arquivos na pasta do projeto'),
      text: t('Leia os arquivos da pasta do projeto e '),
    },
    {
      id: 'tool:apis',
      name: 'apis',
      group: 'tool',
      description: t('Dados ao vivo de APIs abertas (clima, câmbio, países, arte, ciência…)'),
      text: t('Use as APIs abertas para '),
    },
    {
      id: 'tool:imagens',
      name: 'imagens',
      group: 'tool',
      description: t('Imagens livres com crédito e revisão da página em três telas'),
      text: t('Encontre imagens livres de '),
    },
    {
      id: 'tool:componente',
      name: 'componente',
      group: 'tool',
      description: t('Um componente React do cult/ui no projeto'),
      text: t('Adicione ao projeto um componente do cult/ui para '),
    },
    {
      id: 'tool:motion',
      name: 'motion',
      group: 'tool',
      description: t('Vídeo animado com linha do tempo e Gerar MP4'),
      text: t('Faça um vídeo motion de 10 s em 1920x1080 sobre '),
    },
    {
      id: 'tool:curto',
      name: 'video-curto',
      group: 'tool',
      description: t('Reels, TikTok ou Shorts com narração, cenas e legendas'),
      text: t('Faça um vídeo curto vertical sobre '),
    },
  ]
}

export function composerCommands(s: Sources): ComposerCommand[] {
  const prompt = (p: SavedPrompt, group: CommandGroup, name: string): ComposerCommand => ({
    id: `${group}:${p.id}`,
    name,
    group,
    description: p.title || p.text.slice(0, 80),
    text: p.text,
    prompt: p,
  })
  return [
    ...s.skills.map((skill) => ({
      id: `skill:${skill.id}`,
      name: skill.name,
      group: 'skill' as const,
      description: skill.description,
      text: t('Use a skill {name}: ', { name: skill.name }),
    })),
    ...s.pluginPrompts.map((p) => prompt(p, 'plugin', slug(p.title.replace(/^\//, '').split(' · ')[0]))),
    ...(s.projects ? toolCommands() : []),
    ...s.mcpServers.map((server) => ({
      id: `mcp:${server.id}`,
      name: slug(server.name),
      group: 'mcp' as const,
      description: t('Ferramentas do servidor {name}', { name: server.name }),
      text: t('Use as ferramentas do servidor MCP {name} para ', { name: server.name }),
    })),
    ...s.prompts.map((p) => prompt(p, 'prompt', slug(p.title || p.text.slice(0, 24)))),
  ]
}
