import { describe, expect, it } from 'vitest'
import { silenceTracker } from './dictation'
import { voiceStep, type VoiceState } from './voiceLoop'

const base: VoiceState = { phase: 'listen', dictation: 'idle', streaming: false, speaking: false, draft: '' }

describe('voice loop', () => {
  it('listens, sends what was said, reads the reply and listens again', () => {
    expect(voiceStep(base)).toBe('listen')
    expect(voiceStep({ ...base, dictation: 'recording' })).toBeNull()
    expect(voiceStep({ ...base, dictation: 'transcribing' })).toBeNull()
    expect(voiceStep({ ...base, draft: 'qual é o próximo episódio?' })).toBe('send')
    expect(voiceStep({ ...base, phase: 'wait', streaming: true })).toBeNull()
    expect(voiceStep({ ...base, phase: 'wait' })).toBe('speak')
    expect(voiceStep({ ...base, phase: 'speak', speaking: true })).toBeNull()
    expect(voiceStep({ ...base, phase: 'speak' })).toBe('next')
  })

  it('does not open the microphone while a reply is written or read', () => {
    expect(voiceStep({ ...base, streaming: true })).toBeNull()
    expect(voiceStep({ ...base, speaking: true })).toBeNull()
  })
})

describe('silenceTracker', () => {
  it('stops after a pause that follows speech', () => {
    const tracker = silenceTracker(0, 1500, 15_000, 0.02)
    expect(tracker.push(0.001, 500)).toBeNull()
    expect(tracker.push(0.1, 1000)).toBeNull()
    expect(tracker.heard).toBe(true)
    expect(tracker.push(0.001, 2000)).toBeNull()
    // Speech again resets the pause.
    expect(tracker.push(0.05, 2400)).toBeNull()
    expect(tracker.push(0.001, 3800)).toBeNull()
    expect(tracker.push(0.001, 3900)).toBe('stop')
  })

  it('ends a turn that never goes quiet', () => {
    const tracker = silenceTracker(0, 1500, 15_000, 0.02, 120_000)
    expect(tracker.push(0.5, 119_000)).toBeNull()
    expect(tracker.push(0.5, 120_000)).toBe('stop')
  })

  it('gives up when nothing is said', () => {
    const tracker = silenceTracker(0, 1500, 15_000, 0.02)
    expect(tracker.push(0.001, 14_000)).toBeNull()
    expect(tracker.push(0.001, 15_000)).toBe('stop')
    expect(tracker.heard).toBe(false)
  })
})
