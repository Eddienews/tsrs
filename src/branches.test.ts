import { describe, expect, it } from 'vitest'
import { branchAt, patchMessage, switchVersion, versions } from './branches'
import type { Message } from './types'

const msg = (id: string, role: Message['role'] = 'assistant'): Message => ({
  id,
  role,
  content: id,
})
const ids = (thread: Message[]) => thread.map((m) => m.id)

describe('branches', () => {
  const thread = [msg('q1', 'user'), msg('a1'), msg('q2', 'user'), msg('a2')]

  it('keeps the replaced part of the conversation as a version', () => {
    const next = [...thread.slice(0, 1), { ...msg('b1'), ...branchAt(thread, 1) }]
    expect(versions(next, 1).map(ids)).toEqual([['a1', 'q2', 'a2'], ['b1']])
    expect(next[1].altIndex).toBe(1)
  })

  it('switches between versions without losing any', () => {
    const forked = [...thread.slice(0, 1), { ...msg('b1'), ...branchAt(thread, 1) }]
    const back = switchVersion(forked, 1, 0)
    expect(ids(back)).toEqual(['q1', 'a1', 'q2', 'a2'])
    expect(back[1].altIndex).toBe(0)
    expect(ids(switchVersion(back, 1, 1))).toEqual(['q1', 'b1'])
    expect(switchVersion(back, 1, 5)).toBe(back)
  })

  it('keeps the order of versions when forking from an older one', () => {
    let current = [...thread.slice(0, 1), { ...msg('b1'), ...branchAt(thread, 1) }]
    current = switchVersion(current, 1, 0)
    current = [...current.slice(0, 1), { ...msg('c1'), ...branchAt(current, 1) }]
    expect(versions(current, 1).map((v) => v[0].id)).toEqual(['a1', 'b1', 'c1'])
  })

  it('preserves branches nested inside a version', () => {
    const inner = [...thread.slice(0, 3), { ...msg('a2b'), ...branchAt(thread, 3) }]
    const outer = [...inner.slice(0, 1), { ...msg('b1'), ...branchAt(inner, 1) }]
    const back = switchVersion(outer, 1, 0)
    expect(ids(back)).toEqual(['q1', 'a1', 'q2', 'a2b'])
    expect(ids(switchVersion(back, 3, 0))).toEqual(['q1', 'a1', 'q2', 'a2'])
  })

  it('drops a version that is not worth keeping', () => {
    expect(branchAt(thread, 3, false)).toEqual({})
    const forked = [...thread.slice(0, 3), { ...msg('failed'), ...branchAt(thread, 3) }]
    const retry = branchAt(forked, 3, false)
    expect(retry.alts?.map(ids)).toEqual([['a2']])
    expect(retry.altIndex).toBe(1)
  })

  it('patches a message on the current path or inside a kept version', () => {
    const forked = [...thread.slice(0, 3), { ...msg('a2b'), ...branchAt(thread, 3) }]
    const outer = [...forked.slice(0, 1), { ...msg('b1'), ...branchAt(forked, 1) }]
    const shout = (m: Message) => ({ ...m, content: m.content.toUpperCase() })
    const patched = patchMessage(outer, 'a2', shout)
    expect(versions(patched, 1)[0].at(-1)!.alts![0][0].content).toBe('A2')
    expect(patchMessage(outer, 'b1', shout)[1].content).toBe('B1')
    expect(patchMessage(outer, 'missing', shout)).toBe(outer)
  })
})
