import type { ToolCall, ToolDef, ToolResult } from './stream'
import type { Memory } from './types'

// The model keeps facts about the user through two tools, and reads the facts
// already kept at the end of the system prompt.

export const MEMORY_TOOLS: ToolDef[] = [
  {
    name: 'memory_save',
    description:
      'Save a lasting fact about the user (preferences, background, ongoing projects) so it is ' +
      'available in future conversations. Use it when the user asks you to remember something or ' +
      'shares something clearly useful later. Write one short fact per call, in the language of ' +
      'the conversation. Never save secrets such as passwords or keys.',
    schema: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'The fact, in one sentence.' } },
      required: ['fact'],
    },
  },
  {
    name: 'memory_delete',
    description:
      'Delete a saved fact that is wrong, outdated, or that the user asked you to forget. Pass ' +
      'the fact exactly as it appears in the list of saved facts.',
    schema: {
      type: 'object',
      properties: { fact: { type: 'string' } },
      required: ['fact'],
    },
  },
]

export function isMemoryTool(name: string): boolean {
  return MEMORY_TOOLS.some((tool) => tool.name === name)
}

export function withMemories(system: string, memories: Memory[]): string {
  const facts = memories.length
    ? memories.map((m) => `- ${m.text}`).join('\n')
    : '(none yet)'
  const note =
    'Facts you saved about the user in earlier conversations, with the memory_save tool; ' +
    'use them when relevant, without mentioning this list unless asked:\n' +
    facts
  return system ? `${system}\n\n${note}` : note
}

// Runs a memory tool call against the list, returning the new list (unchanged
// on failure) and the result for the model.
export function runMemoryTool(
  memories: Memory[],
  call: ToolCall,
): { memories: Memory[]; result: ToolResult } {
  const fact = String((call.input as { fact?: unknown })?.fact ?? '').trim()
  if (!fact) return { memories, result: { content: 'The fact is empty.', isError: true } }
  if (call.name === 'memory_save') {
    if (memories.some((m) => m.text.toLowerCase() === fact.toLowerCase())) {
      return { memories, result: { content: 'Already saved.', isError: false } }
    }
    const memory = { id: crypto.randomUUID(), text: fact, createdAt: Date.now() }
    return { memories: [...memories, memory], result: { content: 'Saved.', isError: false } }
  }
  const rest = memories.filter((m) => m.text.trim().toLowerCase() !== fact.toLowerCase())
  return rest.length === memories.length
    ? { memories, result: { content: 'No saved fact matches that text.', isError: true } }
    : { memories: rest, result: { content: 'Deleted.', isError: false } }
}
