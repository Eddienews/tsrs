import type { Message } from './types'

// A long conversation can be summarized: the summary is stored as a message,
// and later requests send it in the system prompt in place of everything
// before it.

export const SUMMARY_PROMPT =
  'Summarize the conversation so far so that it can continue without the original messages. ' +
  'Keep every decision, fact, name, number, constraint, open question and piece of code still ' +
  'relevant, and what the user is trying to achieve. Write in the language of the conversation, ' +
  'as a structured summary, without addressing the user.'

// What the model needs to see: the messages after the latest summary or
// cleared context, with the summary when that is what came last.
export function sinceSummary(messages: Message[]): { summary?: string; messages: Message[] } {
  const at = messages.findLastIndex((m) => m.summary || m.contextReset)
  if (at < 0) return { messages }
  const rest = messages.slice(at + 1)
  return messages[at].contextReset ? { messages: rest } : { summary: messages[at].content, messages: rest }
}

// The mark that clears the context from here on.
export function contextResetMark(): Message {
  return { id: crypto.randomUUID(), role: 'assistant', content: '', createdAt: Date.now(), contextReset: true }
}

export function withSummary(system: string, summary: string | undefined): string {
  if (!summary) return system
  const note = `Summary of the earlier part of this conversation, whose messages are no longer shown to you:\n\n${summary}`
  return system ? `${system}\n\n${note}` : note
}
