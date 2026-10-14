import type { ToolCall, ToolDef, ToolResult } from './stream'
import type { Canvas } from './types'

// A canvas is a document or piece of code beside the chat. The model sees its
// current text with each question and changes it through two tools; the user
// edits it directly.

// Earlier versions kept to undo changes.
const MAX_PREVIOUS = 20

export const CANVAS_NOTE =
  'The user has a canvas open beside this conversation: a document or piece of code you write ' +
  'together. Its current text comes with the latest message, inside <canvas>. To change it, ' +
  'call canvas_edit for targeted changes or canvas_write to replace it all, instead of pasting ' +
  'the text into your reply; then say briefly what you changed. The user may also have edited ' +
  'it since your last turn, so work from the text you were sent.'

export const CANVAS_TOOLS: ToolDef[] = [
  {
    name: 'canvas_write',
    description:
      'Replace the whole canvas with new text. Use it to create the first version or rewrite ' +
      'most of it.',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The complete new text.' },
        title: { type: 'string', description: 'A short title, if it should change.' },
        language: {
          type: 'string',
          description: "'markdown' for a document, or the code's language (html, python…).",
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'canvas_edit',
    description:
      'Change parts of the canvas. Each edit replaces one exact passage, which must appear ' +
      'exactly once in the current text; include enough surrounding text to make it unique. ' +
      'Edits apply in order.',
    schema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string', description: 'Exact text to replace.' },
              replace: { type: 'string', description: 'The new text.' },
            },
            required: ['find', 'replace'],
          },
        },
      },
      required: ['edits'],
    },
  },
]

export function newCanvas(title: string): Canvas {
  return { title, lang: 'markdown', content: '' }
}

// The canvas after a change, with the text it replaced kept for undo.
export function changed(canvas: Canvas, fields: Partial<Canvas>): Canvas {
  const previous =
    fields.content !== undefined && fields.content !== canvas.content
      ? [...(canvas.previous ?? []), canvas.content].slice(-MAX_PREVIOUS)
      : canvas.previous
  return { ...canvas, ...fields, ...(previous ? { previous } : {}) }
}

export function undo(canvas: Canvas): Canvas {
  const previous = canvas.previous ?? []
  if (!previous.length) return canvas
  return { ...canvas, content: previous.at(-1)!, previous: previous.slice(0, -1) }
}

function count(text: string, part: string): number {
  let n = 0
  for (let at = text.indexOf(part); at >= 0; at = text.indexOf(part, at + part.length)) n++
  return n
}

export function runCanvasTool(
  canvas: Canvas,
  call: ToolCall,
): { canvas: Canvas; result: ToolResult } {
  const input = (call.input ?? {}) as Record<string, any>
  if (call.name === 'canvas_write') {
    if (typeof input.content !== 'string') {
      return { canvas, result: { content: 'content must be a string.', isError: true } }
    }
    const next = changed(canvas, {
      content: input.content,
      ...(typeof input.title === 'string' && input.title.trim() ? { title: input.title.trim() } : {}),
      ...(typeof input.language === 'string' && input.language.trim()
        ? { lang: input.language.trim().toLowerCase() }
        : {}),
    })
    return { canvas: next, result: { content: 'The canvas was replaced.', isError: false } }
  }
  const edits = Array.isArray(input.edits) ? input.edits : []
  if (!edits.length) return { canvas, result: { content: 'No edits were given.', isError: true } }
  let text = canvas.content
  for (const [i, edit] of edits.entries()) {
    const find = String(edit?.find ?? '')
    const found = find ? count(text, find) : 0
    if (found !== 1) {
      const problem = found
        ? `appears ${found} times; include more surrounding text`
        : 'was not found in the canvas'
      return {
        canvas,
        result: { content: `Edit ${i + 1}: the text to find ${problem}. Nothing was changed.`, isError: true },
      }
    }
    text = text.replace(find, () => String(edit.replace ?? ''))
  }
  return {
    canvas: changed(canvas, { content: text }),
    result: { content: `Applied ${edits.length} edit(s).`, isError: false },
  }
}

// The canvas text, to send after the latest question.
export function withCanvas(question: string, canvas: Canvas): string {
  const text = canvas.content || '(empty)'
  return `${question}\n\n<canvas title="${canvas.title}" language="${canvas.lang}">\n${text}\n</canvas>`
}
