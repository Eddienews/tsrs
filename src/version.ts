import info from 'virtual:tsrs-version'
import { t } from './i18n'

export type { VersionInfo } from '../render/version-plugin.mjs'
export const VERSION = info

// "v0.1.0 · 16e03fe", with a mark when files were changed after that commit:
// short enough for the sidebar, exact enough to know which code is running.
export function versionLabel(v = VERSION): string {
  const parts = [`v${v.version}`]
  if (v.commit) parts.push(v.commit + (v.dirty ? '*' : ''))
  return parts.join(' · ')
}

// The same, with the branch, the commit date and how it is being served.
export function versionDetails(v = VERSION): string {
  const lines = [`TSRS ${versionLabel(v)}`]
  if (v.branch && v.branch !== 'HEAD') lines.push(t('Branch: {branch}', { branch: v.branch }))
  if (v.date) lines.push(t('Commit de {date}', { date: v.date.slice(0, 16).replace('T', ' ') }))
  if (v.dirty) lines.push(t('* com alterações ainda não registradas no git'))
  if (!v.commit) lines.push(t('Sem informação do git (pasta baixada sem o histórico)'))
  lines.push(v.dev ? t('Rodando pelo npm run dev') : t('Build de produção'))
  return lines.join('\n')
}
