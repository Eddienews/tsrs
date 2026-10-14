import type { Message } from './types'

// A conversation is stored as its current path. Where an edit or regeneration
// replaced the rest of the conversation, the replaced part is kept on the
// message that took its place (`alts`), so every version stays reachable.

export type Branch = Pick<Message, 'alts' | 'altIndex'>

function bare({ alts: _alts, altIndex: _altIndex, ...message }: Message): Message {
  return message
}

// Every version of the conversation from `index` on, the current one included.
export function versions(thread: Message[], index: number): Message[][] {
  const [head, ...rest] = thread.slice(index)
  const all = [...(head.alts ?? [])]
  all.splice(head.altIndex ?? all.length, 0, [bare(head), ...rest])
  return all
}

// Branch fields for a message about to replace the conversation from `index`
// on. `keepCurrent` is false when what is being replaced is not worth keeping,
// such as a reply that failed before producing any text.
export function branchAt(thread: Message[], index: number, keepCurrent = true): Branch {
  const head = thread[index]
  const all = versions(thread, index)
  if (!keepCurrent) all.splice(head.altIndex ?? all.length - 1, 1)
  return all.length ? { alts: all, altIndex: all.length } : {}
}

// The thread with version `target` of the conversation from `index` on.
export function switchVersion(thread: Message[], index: number, target: number): Message[] {
  const all = versions(thread, index)
  const chosen = all[target]
  if (!chosen) return thread
  const alts = all.filter((_, i) => i !== target)
  return [...thread.slice(0, index), { ...chosen[0], alts, altIndex: target }, ...chosen.slice(1)]
}

// The thread with `patch` applied to the message `id`, wherever it is: on the
// current path or inside a version kept beside it.
export function patchMessage(
  thread: Message[],
  id: string,
  patch: (message: Message) => Message,
): Message[] {
  let found = false
  const walk = (messages: Message[]): Message[] =>
    messages.map((message) => {
      if (found) return message
      if (message.id === id) {
        found = true
        return patch(message)
      }
      if (!message.alts) return message
      const alts = message.alts.map((alt) => (found ? alt : walk(alt)))
      return found ? { ...message, alts } : message
    })
  const next = walk(thread)
  return found ? next : thread
}
