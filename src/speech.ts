import { useSyncExternalStore } from 'react'

// Reads replies aloud with the system's own voices, which work offline.

let speaking: string | null = null
const listeners = new Set<() => void>()

function set(id: string | null) {
  speaking = id
  listeners.forEach((listener) => listener())
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// Markdown turned into what should be heard: no code, symbols or link targets.
export function speakable(markdown: string): string {
  return markdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function speak(id: string, text: string, lang: string) {
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.onend = utterance.onerror = () => {
    if (speaking === id) set(null)
  }
  set(id)
  speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  speechSynthesis.cancel()
  set(null)
}

export function useSpeaking(id: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => speaking === id,
  )
}
