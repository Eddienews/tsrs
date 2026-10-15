import { describe, expect, it } from 'vitest'
import type { Word } from './narration'
import { narrator, shortToolSet } from './shortTool'
import { TAIL, captionGroups, chooseClip, shortOverlay } from './shortVideo'
import type { StockClip } from './stock'
import type { Settings } from './types'

const words = (text: string, step = 0.4): Word[] => text.split(' ').map((w, i) => ({ text: w, start: i * step, end: i * step + step - 0.05 }))

describe('short video captions', () => {
  it('shows a few words at a time, breaking after punctuation', () => {
    const groups = captionGroups(words('O TSRS chegou. Todos os modelos numa tela só, com as suas chaves'))
    expect(groups.map((g) => g.words.map((w) => w.text).join(' '))).toEqual([
      'O TSRS chegou.',
      'Todos os modelos numa',
      'tela só,',
      'com as suas chaves',
    ])
    // A group stays until the next starts, so there is no flicker between them.
    expect(groups[0].end).toBe(groups[1].start)
    expect(captionGroups([])).toEqual([])
  })

  it('writes an overlay composition with the narration and the end card', () => {
    const html = shortOverlay({ title: 'Café & <código>', format: '9:16', cta: 'Siga @nwlab' }, words('Oi pessoal'), 2)
    expect(html).toContain(`<meta name="nwlab:duration" content="${(2 + TAIL).toFixed(3)}">`)
    expect(html).toContain('<meta name="nwlab:size" content="1080x1920">')
    expect(html).toContain('Café &amp; &lt;código&gt;')
    expect(html).toContain('Siga @nwlab')
    expect(html).toContain('background: transparent')
    expect(html).toContain('"groups":[{"s":0,"e":0.75')
    expect(html).toMatch(/src: url\(data:font\/woff2;base64,/)
    expect(shortOverlay({ title: 'x', format: '16:9' }, [], 1)).toContain('content="1920x1080"')
  })
})

describe('short video parts', () => {
  const clip = (id: string, duration: number) => ({ provider: 'pexels', id, duration }) as StockClip

  it('picks a clip that lasts the scene, never the same twice', () => {
    const used = new Set(['pexels-1'])
    expect(chooseClip([clip('1', 9), clip('2', 2), clip('3', 6)], 5, used)?.id).toBe('3')
    expect(chooseClip([clip('2', 2)], 5, used)?.id).toBe('2')
    expect(chooseClip([clip('1', 9)], 5, used)).toBeUndefined()
  })

  it('narrates with the reading voice, or the audio service when it speaks', () => {
    const settings = { readAloud: { source: 'browser', model: '', options: '' }, mediaKeys: {} } as unknown as Settings
    const eleven = { source: 'elevenlabs', model: 'voz', options: '' }
    expect(narrator(settings, false, eleven)).toEqual(eleven)
    expect(narrator(settings, false, { ...eleven, model: 'music' })).toBeNull()
    expect(narrator(settings, false, null)).toBeNull()
    // No voice or no stock key: no tool.
    expect(shortToolSet({ settings, project: () => undefined, voice: null, musicTarget: null, onStep: () => {}, onDone: () => {} })).toBeNull()
    expect(shortToolSet({ settings, project: () => undefined, voice: eleven, musicTarget: null, onStep: () => {}, onDone: () => {} })).toBeNull()
  })
})
