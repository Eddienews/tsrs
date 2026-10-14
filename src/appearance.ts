import type { Appearance } from './types'

// Follows the system's light or dark preference until the user picks one.
export function defaultAppearance(): Appearance {
  const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  return { theme: dark ? 'dark' : 'light', accent: 'signal', font: 'md', density: 'comfortable' }
}

export function applyAppearance({ theme, accent, font, density }: Appearance): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.dataset.accent = accent
  root.dataset.font = font
  root.dataset.density = density
}
