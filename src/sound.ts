// A short two-note chime, made on the spot so that no sound file ships with
// the app. Browsers allow it once the page has had a click or a key press,
// which sending a message always is.

let context: AudioContext | undefined

export function chime(): void {
  try {
    context ??= new AudioContext()
    const start = context.currentTime
    for (const [at, frequency] of [
      [0, 660],
      [0.12, 880],
    ]) {
      const tone = context.createOscillator()
      const volume = context.createGain()
      tone.type = 'sine'
      tone.frequency.value = frequency
      volume.gain.setValueAtTime(0.0001, start + at)
      volume.gain.exponentialRampToValueAtTime(0.15, start + at + 0.02)
      volume.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.35)
      tone.connect(volume).connect(context.destination)
      tone.start(start + at)
      tone.stop(start + at + 0.4)
    }
  } catch {
    // No audio available: the chime is only a courtesy.
  }
}
