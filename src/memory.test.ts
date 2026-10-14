import { describe, expect, it } from 'vitest'
import { runMemoryTool, withMemories } from './memory'
import type { Memory } from './types'

const saved: Memory[] = [{ id: '1', text: 'Mora em Recife', createdAt: 1 }]

describe('memory tools', () => {
  it('saves a new fact and ignores a repeated one', () => {
    const added = runMemoryTool(saved, { id: 'c', name: 'memory_save', input: { fact: ' Usa Linux ' } })
    expect(added.memories.map((m) => m.text)).toEqual(['Mora em Recife', 'Usa Linux'])
    const again = runMemoryTool(saved, { id: 'c', name: 'memory_save', input: { fact: 'mora em recife' } })
    expect(again.memories).toBe(saved)
    expect(again.result.isError).toBe(false)
  })

  it('deletes by text and reports a miss', () => {
    expect(runMemoryTool(saved, { id: 'c', name: 'memory_delete', input: { fact: 'mora em recife' } }).memories).toEqual([])
    const miss = runMemoryTool(saved, { id: 'c', name: 'memory_delete', input: { fact: 'outra' } })
    expect(miss.memories).toBe(saved)
    expect(miss.result.isError).toBe(true)
  })

  it('rejects an empty fact', () => {
    expect(runMemoryTool(saved, { id: 'c', name: 'memory_save', input: {} }).result.isError).toBe(true)
  })

  it('lists the facts after the system prompt', () => {
    expect(withMemories('Seja breve.', saved)).toMatch(/^Seja breve\.\n\n.*\n- Mora em Recife$/s)
    expect(withMemories('', [])).toContain('(none yet)')
  })
})
