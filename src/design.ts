import { PROJECTS } from './projects'
import type { ToolCall, ToolDef, ToolImage, ToolResult } from './stream'
import { localTools, type ToolSet } from './tools'
import type { ChatProject } from './types'

// Design tools for the pages a conversation makes (server/design.mjs, which
// runs the vendored copy of taste-skill by Leonxlnx, MIT): open images with
// their credits, a look at the page in a real browser, and taste-skill's art
// direction draw when its example skill is on.

// The example skill that brings the draw along (or the original, installed
// from its own repository under its own name).
export const TASTE_SKILLS = ['taste-skill', 'design-taste-frontend']
export const isTasteSkill = (skill: { name: string }) => TASTE_SKILLS.includes(skill.name)

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${PROJECTS}/design${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    // A TSRS without its server answers with its page.
  }
  if (!res.ok || !json) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json as T
}

export interface FoundImage {
  ref: string
  title: string
  date?: string
  about?: string
  width?: number
  height?: number
  source: string
  license: string
  credit: string
  page: string
  thumbnail: string
}

export interface SavedImage {
  file: string
  credit: string
  page: string
  license: string
  width?: number
  height?: number
}

export const DESIGN_TOOLS: ToolDef[] = [
  {
    name: 'find_images',
    description:
      'Search open collections (Openverse, Wikimedia Commons, the Art Institute of Chicago, the ' +
      'Met) for real, openly licensed pictures of the subject: its place, materials, history, ' +
      'museum objects. No key needed; only licences safe for commercial use (CC0, public domain, ' +
      'CC BY, CC BY-SA). Search in the subject\'s own words and a medium ("lisbon azulejo", ' +
      '"porto old map", "botanical engraving fig"); museums match one or two words best. Returns ' +
      'refs to pass to get_image. These pictures show the subject\'s world: never present one as ' +
      'the client\'s own product, place or people.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, in the words a caption would use (English works best).' },
        orientation: { type: 'string', enum: ['landscape', 'portrait', 'square'] },
        source: { type: 'string', enum: ['all', 'openverse', 'commons', 'aic', 'met', 'museums'], description: 'Default all.' },
        limit: { type: 'number', description: 'Results per source, 1 to 10 (default 4).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_image',
    description:
      'Download a picture found with find_images into the project folder (imagens/), and add its ' +
      'credit to CREDITOS.md. Returns the file to use in the page, its size and the credit, and ' +
      'shows you the picture: look at it before using it. Credit every picture on the page.',
    schema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'The ref exactly as find_images gave it, such as openverse:1a2b3c.' },
        name: { type: 'string', description: 'A short file name without extension, such as hero-harbour.' },
      },
      required: ['ref'],
    },
  },
  {
    name: 'inspect_page',
    description:
      'Look at a page of the project: renders it in a real browser at desktop, tablet and phone ' +
      'widths, measures it (text overflowing the screen, broken images, low contrast, text cut ' +
      'off or covered, text too small) and returns a screenshot of the first screen at each width. ' +
      'Use it after making or changing a page, fix what it finds, and look again.',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'The page inside the project, such as index.html.' },
        widths: { type: 'array', items: { type: 'number', enum: [1440, 1280, 1024, 768, 390, 375] }, description: 'Up to 3 widths (default 1440, 768, 390).' },
        pages: { type: 'boolean', description: 'Also return sheets of the whole page scrolled through, not just the first screen.' },
        strict: { type: 'boolean', description: "Check all of taste-skill's house style too (no gradients, labels, icon cards; enough pictures and motion). On by default once a direction was drawn." },
        allow: { type: 'array', items: { type: 'string' }, description: 'Rule ids not to check, only when the brand itself requires what they flag (its logo sits in a gradient, say).' },
      },
      required: ['file'],
    },
  },
]

export const DRAW_TOOL: ToolDef = {
  name: 'design_draw',
  description:
    "taste-skill's art direction draw (scripts/draw.mjs): deals directions for a page from a library " +
    'studied from 247 sites, so the look is decided rather than the average default. First action ' +
    "'options' with sector and brief (three directions to choose from), then 'direction' with the " +
    "chosen id (the full sheet: type, palette, hero, sections; saved in .taste-skill/direction.json). " +
    "'show' reprints it; 'redraw' re-deals one slot (hero, type, palette, photos, section:<role>, " +
    "direction); 'alternatives' lists the other blueprints for a section role; 'list' lists sectors, directions, roles or tones; 'site' prints one studied site; " +
    "'photos' searches the library's photographs. Where the sheet names a script, use these tools instead.",
  schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['options', 'direction', 'show', 'redraw', 'alternatives', 'list', 'site', 'photos'] },
      sector: { type: 'string', description: "For options and direction: the closest sector (action 'list' with what 'sectors')." },
      brief: { type: 'string', description: 'One line about the subject, in English.' },
      direction: { type: 'string', description: 'The id chosen among the options.' },
      sections: { type: 'array', items: { type: 'string' }, description: 'The sections the page needs, such as hero, showcase, pricing, footer.' },
      tone: { type: 'string', enum: ['quiet', 'bold', 'warm', 'technical', 'playful', 'luxury', 'editorial'] },
      have: { type: 'array', items: { type: 'string' }, description: 'Assets the client really has: photography, product-photo, product-ui, illustration, video.' },
      keep: { type: 'array', items: { type: 'string' }, description: 'What the brand already fixes, such as palette, type.' },
      avoid: { type: 'array', items: { type: 'string' }, description: 'Direction ids not to deal.' },
      role: { type: 'string', description: 'For alternatives: the section role whose other blueprints to list.' },
      slot: { type: 'string', description: 'For redraw: hero, type, palette, photos, direction or section:<role>, or section:<role>=<id>.' },
      what: { type: 'string', enum: ['sectors', 'directions', 'roles', 'tones'], description: 'For list.' },
      site: { type: 'string', description: 'For site: the id of a studied site.' },
      query: { type: 'string', description: 'For photos: words to search, or list.' },
      seed: { type: 'number' },
    },
    required: ['action'],
  },
}

export function foundText(items: FoundImage[], errors: string[]): string {
  const lines = items.map((it) =>
    [
      `${it.ref}  ${it.title}${it.date ? ` (${it.date})` : ''}`,
      it.about ? `  about: ${it.about}` : '',
      `  ${it.width && it.height ? `${it.width}x${it.height}, ` : ''}${it.source}, ${it.license}`,
      `  credit: ${it.credit}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )
  if (errors.length) lines.push(`Could not search: ${errors.join('; ')}`)
  if (!items.length) {
    lines.unshift(
      'Nothing usable came back. Try fewer words, the place\'s own name for things, the place and a ' +
        'medium ("ghent postcard", "ghent old map"), a decade, or another source. If nothing honest ' +
        'exists, draw the picture instead.',
    )
  } else lines.push('', 'Download the ones you want with get_image and look at each before using it.')
  return lines.join('\n')
}

export function savedText(saved: SavedImage[], text: string): string {
  if (!saved.length) return text || 'Nothing was saved.'
  const head = saved.map(
    (s) => `Saved ${s.file}${s.width ? ` (${s.width}x${s.height})` : ''}. Credit (added to CREDITOS.md): ${s.credit}`,
  )
  return [...head, '', text].join('\n').trim()
}

export interface DesignOptions {
  // The folder, made the first time a tool needs one.
  project: () => ChatProject | null | undefined | Promise<ChatProject | null | undefined>
  // Whether taste-skill's example skill is on, which brings the draw.
  taste: boolean
  // A picture was saved in the project, with its credit line.
  onSaved?: (files: string[]) => void
}

export function designToolSet({ project, taste, onSaved }: DesignOptions): ToolSet {
  const defs = taste ? [...DESIGN_TOOLS, DRAW_TOOL] : DESIGN_TOOLS
  return localTools(defs, 'Design', async (call: ToolCall, signal): Promise<ToolResult> => {
    const where = await project()
    if (!where) return { content: 'This conversation has no project folder.', isError: true }
    const input = (call.input ?? {}) as Record<string, any>
    try {
      if (call.name === 'find_images') {
        const { items, errors } = await post<{ items: FoundImage[]; errors: string[] }>('/images/search', input, signal)
        return {
          content: foundText(items, errors),
          isError: false,
          sources: items.map((it) => ({ url: it.page, title: `${it.title} (${it.source})` })),
        }
      }
      if (call.name === 'get_image') {
        const got = await post<{ saved: SavedImage[]; text: string; image?: ToolImage }>(
          '/images/get',
          { path: where.path, ref: input.ref, name: input.name },
          signal,
        )
        if (got.saved.length) onSaved?.(got.saved.map((s) => s.file))
        return {
          content: savedText(got.saved, got.text),
          isError: !got.saved.length,
          ...(got.image ? { images: [got.image] } : {}),
          sources: got.saved.map((s) => ({ url: s.page, title: s.credit })),
        }
      }
      if (call.name === 'inspect_page') {
        const seen = await post<{ text: string; images: (ToolImage & { label: string })[] }>(
          '/inspect',
          { path: where.path, file: input.file, widths: input.widths, pages: input.pages, strict: input.strict, allow: input.allow },
          signal,
        )
        const shots = seen.images.map((i) => i.label).join(', ')
        return {
          content: `${seen.text}${shots ? `\n\nScreenshots (saved in the project): ${shots}` : ''}`,
          isError: false,
          images: seen.images.map(({ mime, data }) => ({ mime, data })),
        }
      }
      if (call.name === 'design_draw') {
        const drawn = await post<{ text: string }>('/draw', { path: where.path, args: input }, signal)
        return { content: drawn.text, isError: false }
      }
      return { content: `No tool named ${call.name}.`, isError: true }
    } catch (error) {
      if (signal?.aborted) throw error
      return { content: error instanceof Error ? error.message : String(error), isError: true }
    }
  })
}
