import { describe, expect, it } from 'vitest'
import { changed, newCanvas, runCanvasTool, undo, withCanvas } from './canvas'

const canvas = { ...newCanvas('Notas'), content: 'Olá mundo. Olá de novo.' }

describe('canvas tools', () => {
  it('replaces the text, title and language', () => {
    const { canvas: next, result } = runCanvasTool(canvas, {
      id: 'c',
      name: 'canvas_write',
      input: { content: '<h1>Oi</h1>', title: 'Página', language: 'HTML' },
    })
    expect(result.isError).toBe(false)
    expect(next).toMatchObject({ title: 'Página', lang: 'html', content: '<h1>Oi</h1>' })
    expect(next.previous).toEqual([canvas.content])
  })

  it('applies edits in order', () => {
    const { canvas: next } = runCanvasTool(canvas, {
      id: 'c',
      name: 'canvas_edit',
      input: {
        edits: [
          { find: 'Olá mundo', replace: 'Oi mundo' },
          { find: 'Oi mundo.', replace: 'Oi, mundo $&.' },
        ],
      },
    })
    expect(next.content).toBe('Oi, mundo $&. Olá de novo.')
  })

  it('refuses ambiguous or missing passages and changes nothing', () => {
    const twice = runCanvasTool(canvas, {
      id: 'c',
      name: 'canvas_edit',
      input: { edits: [{ find: 'Olá', replace: 'Oi' }] },
    })
    expect(twice.result).toEqual({
      content: 'Edit 1: the text to find appears 2 times; include more surrounding text. Nothing was changed.',
      isError: true,
    })
    expect(twice.canvas).toBe(canvas)
    const missing = runCanvasTool(canvas, {
      id: 'c',
      name: 'canvas_edit',
      input: { edits: [{ find: 'mundo.', replace: 'x' }, { find: 'nada', replace: 'y' }] },
    })
    expect(missing.result.content).toMatch(/^Edit 2: the text to find was not found/)
    expect(missing.canvas).toBe(canvas)
  })

  it('undoes the last change', () => {
    const edited = changed(canvas, { content: 'B' })
    expect(undo(edited)).toMatchObject({ content: canvas.content, previous: [] })
    expect(undo(canvas)).toBe(canvas)
    // A change of title alone keeps no version.
    expect(changed(canvas, { title: 'X' }).previous).toBeUndefined()
  })

  it('sends the text after the question', () => {
    expect(withCanvas('Melhore', canvas)).toBe(
      'Melhore\n\n<canvas title="Notas" language="markdown">\nOlá mundo. Olá de novo.\n</canvas>',
    )
    expect(withCanvas('Escreva', newCanvas('Novo'))).toContain('\n(empty)\n')
  })
})
