import { readerSource, type MediaTarget } from './media'
import type { ShortFormat, ShortPlan, ShortResult } from './shortVideo'
import { stockServices } from './stock'
import type { ToolCall, ToolDef, ToolResult } from './stream'
import { localTools, type ToolSet } from './tools'
import type { ChatProject, Settings } from './types'

// The short video tool, offered to the model; the work itself (shortVideo.ts,
// with its font and the narration) loads when the tool is first used.

// The voice that narrates: the one chosen to read replies aloud, else the
// audio service when it makes speech.
export function narrator(settings: Settings, locked: boolean, audioTarget: MediaTarget | null): MediaTarget | null {
  const reader = readerSource(settings, locked)
  if (reader) return reader
  if (audioTarget && !['music', 'sound-effects'].includes(audioTarget.model)) return audioTarget
  return null
}

export const SHORT_TOOL: ToolDef = {
  name: 'make_short_video',
  description:
    'Make a short narrated video (for Reels, TikTok, Shorts, or 16:9) in the project folder: ' +
    'TSRS narrates the scenes with the chosen voice, finds a free stock clip for each scene, ' +
    'cuts them to the narration, adds word-by-word captions, the title, an end card and ' +
    'optional music. Write the narration in the language of the conversation, short spoken ' +
    'sentences; about 2.5 words per second (a 30 s video is about 75 words, 4 to 7 scenes). ' +
    'For each scene give a concrete visual search in English. It takes a few minutes.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short title, shown at the start and on the end card.' },
      format: { type: 'string', enum: ['9:16', '16:9', '1:1'], description: '9:16 (default) for Reels/TikTok/Shorts.' },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'What the narrator says in this scene.' },
            search: { type: 'string', description: 'Stock video search in English, concrete and visual.' },
          },
          required: ['text', 'search'],
        },
      },
      cta: { type: 'string', description: 'End card line, such as a handle or a call to action.' },
      music: { type: 'string', description: "'generate' for new music, 'none', or a music file of the project (such as midia/trilha.mp3)." },
      music_style: { type: 'string', description: 'What the generated music should be like.' },
    },
    required: ['title', 'scenes'],
  },
}

// The tool, when the conversation has a project folder, stock keys and a voice.
export function shortToolSet(opts: {
  settings: Settings
  project: () => ChatProject | undefined
  voice: MediaTarget | null
  musicTarget: MediaTarget | null
  onStep: (callId: string, text: string) => void
  onDone: (result: ShortResult) => void
}): ToolSet | null {
  if (!opts.voice || !stockServices(opts.settings).length) return null
  return localTools([SHORT_TOOL], 'Vídeo curto', async (call: ToolCall, signal): Promise<ToolResult> => {
    const project = opts.project()
    if (!project) return { content: 'This conversation has no project folder.', isError: true }
    const input = (call.input ?? {}) as Record<string, any>
    const format: ShortFormat = ['9:16', '16:9', '1:1'].includes(input.format) ? input.format : '9:16'
    const plan: ShortPlan = {
      title: String(input.title ?? '').trim() || 'Vídeo',
      format,
      scenes: (Array.isArray(input.scenes) ? input.scenes : []).map((s: any) => ({ text: String(s?.text ?? ''), search: String(s?.search ?? '') })),
      cta: input.cta ? String(input.cta) : undefined,
      music: input.music ? String(input.music) : 'none',
      musicStyle: input.music_style ? String(input.music_style) : undefined,
    }
    try {
      const { makeShortVideo } = await import('./shortVideo')
      const result = await makeShortVideo({
        settings: opts.settings,
        project,
        plan,
        voice: opts.voice!,
        musicTarget: opts.musicTarget,
        signal,
        onStep: (text) => opts.onStep(call.id, text),
      })
      opts.onDone(result)
      return {
        content: `Saved ${result.file} (${result.seconds} s, ${result.scenes} scenes, captions timed by ${result.timing}). Credits are in CREDITOS.md.`,
        isError: false,
      }
    } catch (error) {
      return { content: error instanceof Error ? error.message : String(error), isError: true }
    }
  })
}
