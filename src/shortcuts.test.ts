import { describe, expect, it } from 'vitest'
import { comboOf, shortcutLabel, shortcutsOf } from './shortcuts'

const press = (key: string, code: string, mods: Partial<Record<'ctrl' | 'meta' | 'alt' | 'shift', boolean>> = {}) => ({
  key,
  code,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
})

describe('comboOf', () => {
  it('writes modifiers in order, Ctrl and ⌘ alike', () => {
    expect(comboOf(press('k', 'KeyK', { ctrl: true }))).toBe('Mod+K')
    expect(comboOf(press('K', 'KeyK', { meta: true, shift: true }))).toBe('Mod+Shift+K')
    expect(comboOf(press('.', 'Period', { ctrl: true }))).toBe('Mod+.')
  })

  it('reads letters by position, so Alt on a Mac still matches', () => {
    expect(comboOf(press('Dead', 'KeyN', { alt: true }))).toBe('Alt+N')
    expect(comboOf(press('˜', 'KeyN', { alt: true }))).toBe('Alt+N')
  })

  it('refuses presses that would steal typing', () => {
    expect(comboOf(press('a', 'KeyA'))).toBe('')
    expect(comboOf(press('A', 'KeyA', { shift: true }))).toBe('')
    expect(comboOf(press('Control', 'ControlLeft', { ctrl: true }))).toBe('')
    expect(comboOf(press('F2', 'F2'))).toBe('F2')
  })
})

describe('shortcuts', () => {
  it('fill in the defaults and show the keys of the platform', () => {
    expect(shortcutsOf({ new: 'Mod+Shift+O' })).toMatchObject({ palette: 'Mod+K', new: 'Mod+Shift+O' })
    expect(shortcutLabel('Mod+Shift+O', false)).toBe('Ctrl+Shift+O')
    expect(shortcutLabel('Alt+N', true)).toBe('⌥+N')
  })
})
