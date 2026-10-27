import { t } from './i18n'
import type { ChatMeta, Message } from './types'

// A long conversation can be summarized: the summary is stored as a message,
// and later requests send it in the system prompt in place of everything
// before it.

export const SUMMARY_PROMPT =
  'Summarize the conversation so far so that it can continue without the original messages. ' +
  'Keep every decision, fact, name, number, constraint, open question and piece of code still ' +
  'relevant, and what the user is trying to achieve. Write it in the same language the messages are ' +
  'written in (do not translate them into English), as a structured summary, without addressing the user.'

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

// Asked of the model to carry the work on in a new conversation. Unlike a
// summary, it is written for someone starting fresh: what matters next.
export const HANDOFF_PROMPT =
  'Write a handoff so that a new conversation can carry on this work without the messages so far. ' +
  'Cover, in short sections: what the user is working on and why; the decisions made so far, with the ' +
  'facts, names, numbers and constraints they rest on; the files created or changed, with their paths, ' +
  'if any; open questions; and the next step, written so that it can be started without asking the ' +
  'user anything. Keep it under one page. Write it in the same language the messages are written in ' +
  '(do not translate them into English), without addressing the user.'

// The new conversation a handoff starts: the same model, settings, folder and
// project files, opening with the handoff in place of the old messages.
export function continuedChat(meta: ChatMeta, handoff: string, now = Date.now()): { meta: ChatMeta; first: Message } {
  const {
    obsidianNote: _note,
    scheduleId: _schedule,
    pinned: _pinned,
    archived: _archived,
    changedAt: _changed,
    ...rest
  } = meta
  const next: ChatMeta = {
    ...rest,
    id: crypto.randomUUID(),
    title: t('{title} (continuação)', { title: meta.title.replace(/ \((continuação|continued)\)$/, '') }),
    createdAt: now,
    updatedAt: now,
  }
  const first: Message = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: handoff,
    createdAt: now,
    summary: true,
    handoff: { from: meta.id },
  }
  return { meta: next, first }
}
