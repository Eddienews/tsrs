import { describe, expect, it } from 'vitest'
import { chartSvg, ticks } from './charts'
import { conversationFiles, resultText } from './interpreter'

describe('charts from the interpreter', () => {
  it('draws each kind, escaping every text', () => {
    const bar = chartSvg({ type: 'bar', title: '<script>alert(1)</script>', labels: ['a', 'b'], series: [{ name: 'x"y', values: [1, -2] }] })
    expect(bar).not.toContain('<script>')
    expect(bar).toContain('&lt;script&gt;')
    expect(bar.match(/<rect x=/g)).toHaveLength(2)
    expect(chartSvg({ type: 'line', labels: [1, 2, 3], series: [{ values: [1, 2, 3] }, { values: [3, 2, 1] }] }).match(/<polyline/g)).toHaveLength(2)
    expect(chartSvg({ type: 'pie', labels: ['a', 'b'], series: [{ values: [1, 3] }] })).toContain('75.0%')
    expect(chartSvg({ type: 'scatter', series: [{ points: [[1, 2], [3, 4], ['x', 1]] }] }).match(/<circle/g)).toHaveLength(2)
    // Anything else becomes an empty or a bar chart, never an error.
    expect(chartSvg({ type: 'weird', series: 'no' as never })).toMatch(/^<svg/)
    expect(chartSvg({})).toMatch(/<\/svg>$/)
  })

  it('picks round axis steps', () => {
    expect(ticks(0, 97)).toEqual([0, 20, 40, 60, 80, 100])
    expect(ticks(-3, 3)).toEqual([-4, -2, 0, 2, 4])
    expect(ticks(5, 5)).toEqual([4, 4.5, 5, 5.5, 6])
    // Values too large and too close for floating point: just the ends, at once.
    expect(ticks(1e17, 1e17 + 16)).toEqual([1e17, 1e17 + 16])
    expect(ticks(0, Infinity)).toEqual([0, 1])
    expect(chartSvg({ type: 'scatter', series: [{ points: [[0, 1e17], [1, 1e17 + 16]] }] })).toMatch(/<circle/)
    expect(chartSvg(null as never)).toMatch(/^<svg/)
  })

  it("gives the code the conversation's text files, by name, and reads back the result", () => {
    const files = conversationFiles([
      { attachments: [{ kind: 'text', name: 'vendas.csv', data: 'a,b' }, { kind: 'image', name: 'x.png', data: '...' }] },
      { attachments: [{ kind: 'text', name: 'vendas.csv', data: 'c,d' }] },
    ])
    expect(files).toEqual({ 'vendas.csv': 'a,b', 'vendas (2).csv': 'c,d' })
    expect(resultText({ ok: true, output: '4', value: '"ok"', charts: [{}] })).toBe('Output:\n4\n\nReturned:\n"ok"\n\n1 chart(s) drawn and shown to the user.')
    expect(resultText({ ok: true, output: '', value: '', charts: [] })).toBe('The code ran and printed nothing.')
  })
})
