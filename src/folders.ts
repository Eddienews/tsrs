import type { Folder, Persona } from './types'

// What the model is told about the folder the conversation is in.
export function folderNote(folder: Folder): string {
  return `Instructions for every conversation in the project folder "${folder.name}":\n${(folder.instructions ?? '').trim()}`
}

// The agent a conversation uses: its own, or else its folder's.
export function agentFor(personas: Persona[], personaId: string | undefined, folder: Folder | undefined): Persona | undefined {
  return personas.find((p) => p.id === (personaId ?? folder?.personaId))
}
