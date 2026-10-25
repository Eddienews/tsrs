import type { DictationState } from './dictation'

// Hands-free voice conversation: listen, send what was said, read the reply
// aloud, listen again. The app keeps the phase; this says what comes next.
export type VoicePhase = 'listen' | 'wait' | 'speak'

export type VoiceAction = 'listen' | 'send' | 'speak' | 'next' | null

export interface VoiceState {
  phase: VoicePhase
  dictation: DictationState
  streaming: boolean
  speaking: boolean
  // What was dictated and not sent yet.
  draft: string
}

export function voiceStep(s: VoiceState): VoiceAction {
  if (s.phase === 'listen') {
    if (s.dictation !== 'idle' || s.streaming || s.speaking) return null
    // The turn ended: what was said goes, or the microphone opens again.
    return s.draft.trim() ? 'send' : 'listen'
  }
  // The reply is done: it is read aloud.
  if (s.phase === 'wait') return s.streaming ? null : 'speak'
  // Done reading: listening again.
  return s.speaking ? null : 'next'
}
