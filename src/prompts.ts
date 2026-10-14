// Saved prompts may contain {{name}} fields, filled in when the prompt is used.
const FIELD = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g

// Names of the fields in `text`, in order and without repeats.
export function promptFields(text: string): string[] {
  return [...new Set([...text.matchAll(FIELD)].map((match) => match[1]))]
}

// Replaces each field that has a value; the others are left as written.
export function fillPrompt(text: string, values: Record<string, string>): string {
  return text.replace(FIELD, (field, name: string) => values[name] || field)
}
