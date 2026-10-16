// Charts asked for by code in the interpreter, drawn here as SVG from a plain
// description. The description comes from code that could be anything, so it
// is checked and every text is escaped: the SVG is made by TSRS, not by it.

export interface ChartSpec {
  type?: string
  title?: string
  labels?: unknown[]
  series?: { name?: unknown; values?: unknown[]; points?: unknown[] }[]
  x?: string
  y?: string
}

const W = 720
const H = 420
const PAD = { top: 48, right: 24, bottom: 64, left: 64 }
// Distinct in light and dark, and for most kinds of color blindness.
const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f59f00', '#0ca678', '#d6336c', '#495057']
const MAX_SERIES = 8
const MAX_POINTS = 2000

const esc = (value: unknown) =>
  String(value ?? '')
    .slice(0, 120)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value))
const finite = (value: unknown) => Number.isFinite(num(value))

// Round steps for an axis from lo to hi.
export function ticks(lo: number, hi: number, count = 5): number[] {
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1]
  const raw = (hi - lo) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw
  const out: number[] = []
  const end = Math.ceil(hi / step - 1e-9) * step
  for (let v = Math.floor(lo / step) * step; v <= end + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

function short(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${+(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${+(value / 1e6).toFixed(1)}M`
  if (abs >= 1e4) return `${+(value / 1e3).toFixed(1)}k`
  return String(+value.toFixed(2))
}

function frame(spec: ChartSpec, body: string, legend: string[]): string {
  const keys = legend
    .map((name, i) => {
      const x = PAD.left + i * 130
      return `<rect x="${x}" y="${H - 22}" width="10" height="10" fill="${COLORS[i % COLORS.length]}"/><text x="${x + 14}" y="${H - 13}" class="t">${esc(name)}</text>`
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif">` +
    `<style>.t{font-size:12px;fill:#495057}.h{font-size:16px;font-weight:600;fill:#212529}.g{stroke:#dee2e6}</style>` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    (spec.title ? `<text x="${PAD.left}" y="28" class="h">${esc(spec.title)}</text>` : '') +
    body +
    (spec.y ? `<text transform="translate(16 ${H / 2}) rotate(-90)" text-anchor="middle" class="t">${esc(spec.y)}</text>` : '') +
    (spec.x ? `<text x="${(PAD.left + W - PAD.right) / 2}" y="${H - 34}" text-anchor="middle" class="t">${esc(spec.x)}</text>` : '') +
    (legend.length > 1 ? keys : '') +
    `</svg>`
  )
}

function axes(lo: number, hi: number, y: (v: number) => number): string {
  return ticks(lo, hi)
    .filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9)
    .map(
      (v) =>
        `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}" class="g"/>` +
        `<text x="${PAD.left - 8}" y="${y(v) + 4}" text-anchor="end" class="t">${short(v)}</text>`,
    )
    .join('')
}

export function chartSvg(spec: ChartSpec): string {
  const type = ['bar', 'line', 'pie', 'scatter'].includes(String(spec.type)) ? String(spec.type) : 'bar'
  const series = (Array.isArray(spec.series) ? spec.series : []).slice(0, MAX_SERIES)
  const names = series.map((s, i) => String(s?.name ?? `#${i + 1}`))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  if (type === 'scatter') {
    const sets = series.map((s) =>
      (Array.isArray(s?.points) ? s.points : [])
        .slice(0, MAX_POINTS)
        .filter((p): p is unknown[] => Array.isArray(p) && finite(p[0]) && finite(p[1]))
        .map((p) => [num(p[0]), num(p[1])] as const),
    )
    const all = sets.flat()
    if (!all.length) return frame(spec, '', [])
    const [x0, x1] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))]
    const yTicks = ticks(Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1])))
    const [y0, y1] = [yTicks[0], yTicks.at(-1)!]
    const px = (v: number) => PAD.left + ((v - x0) / (x1 - x0 || 1)) * plotW
    const py = (v: number) => PAD.top + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH
    const dots = sets
      .map((set, i) => set.map(([x, y]) => `<circle cx="${px(x)}" cy="${py(y)}" r="3.5" fill="${COLORS[i % COLORS.length]}" fill-opacity="0.8"/>`).join(''))
      .join('')
    const xTicks = ticks(x0, x1).filter((v) => v >= x0 && v <= x1)
    const xs = xTicks.map((v) => `<text x="${px(v)}" y="${PAD.top + plotH + 18}" text-anchor="middle" class="t">${short(v)}</text>`).join('')
    return frame(spec, axes(y0, y1, py) + xs + dots, names)
  }

  const labels = (Array.isArray(spec.labels) ? spec.labels : []).slice(0, 200).map((l) => String(l ?? ''))
  const values = series.map((s) => (Array.isArray(s?.values) ? s.values : []).slice(0, MAX_POINTS).map((v) => (finite(v) ? num(v) : 0)))
  const count = Math.max(labels.length, ...values.map((v) => v.length), 0)
  if (!count) return frame(spec, '', [])

  if (type === 'pie') {
    const data = values[0] ?? []
    const total = data.reduce((a, b) => a + Math.max(0, b), 0) || 1
    const [cx, cy, r] = [PAD.left + plotH / 2, PAD.top + plotH / 2, plotH / 2]
    let angle = -Math.PI / 2
    const slices = data
      .map((v, i) => {
        const share = Math.max(0, v) / total
        const end = angle + share * Math.PI * 2
        const large = share > 0.5 ? 1 : 0
        const [x1, y1, x2, y2] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle), cx + r * Math.cos(end), cy + r * Math.sin(end)]
        const path =
          share >= 0.9999
            ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS[i % COLORS.length]}"/>`
            : `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z" fill="${COLORS[i % COLORS.length]}"/>`
        angle = end
        const keyY = PAD.top + 10 + i * 22
        const key = `<rect x="${cx + r + 40}" y="${keyY - 10}" width="12" height="12" fill="${COLORS[i % COLORS.length]}"/><text x="${cx + r + 58}" y="${keyY}" class="t">${esc(labels[i] ?? i + 1)} — ${(share * 100).toFixed(1)}%</text>`
        return path + (i < 14 ? key : '')
      })
      .join('')
    return frame(spec, slices, [])
  }

  const flat = values.flat()
  const yTicks = ticks(Math.min(0, ...flat), Math.max(0, ...flat))
  const [y0, y1] = [yTicks[0], yTicks.at(-1)!]
  const py = (v: number) => PAD.top + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH
  const slot = plotW / count
  const every = Math.ceil(count / 16)
  const xs = labels
    .map((l, i) =>
      i % every === 0
        ? `<text x="${PAD.left + slot * (i + 0.5)}" y="${PAD.top + plotH + 18}" text-anchor="middle" class="t">${esc(l.slice(0, 14))}</text>`
        : '',
    )
    .join('')
  let marks = ''
  if (type === 'line') {
    marks = values
      .map((set, s) => {
        const pts = set.map((v, i) => `${PAD.left + slot * (i + 0.5)},${py(v)}`).join(' ')
        return `<polyline points="${pts}" fill="none" stroke="${COLORS[s % COLORS.length]}" stroke-width="2.5" stroke-linejoin="round"/>`
      })
      .join('')
  } else {
    const width = (slot * 0.8) / Math.max(1, values.length)
    marks = values
      .map((set, s) =>
        set
          .map((v, i) => {
            const x = PAD.left + slot * i + slot * 0.1 + width * s
            const [top, bottom] = [py(Math.max(0, v)), py(Math.min(0, v))]
            return `<rect x="${x}" y="${top}" width="${Math.max(1, width - 2)}" height="${Math.max(0, bottom - top)}" rx="2" fill="${COLORS[s % COLORS.length]}"/>`
          })
          .join(''),
      )
      .join('')
  }
  return frame(spec, axes(y0, y1, py) + xs + marks, names)
}
