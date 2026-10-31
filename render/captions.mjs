// Captions from the narration's words: one line at a time, cut at the end of
// a sentence, at a pause, or when the line would be too long. The runtime
// (public/motion/runtime.js) draws them over the frame, the word being said in
// the accent color, so they are part of the render and need no libass.

const END = /[.!?…:;]$/

// words: [{ w, t, end }] in seconds from the start of the video, in order.
export function buildCues(words, { maxChars = 42, maxGap = 0.5, maxSeconds = 4.5 } = {}) {
  const cues = []
  let line = []
  const flush = () => {
    if (!line.length) return
    cues.push({ start: line[0].t, end: line.at(-1).end, words: line })
    line = []
  }
  for (const w of words) {
    if (line.length) {
      const prev = line.at(-1)
      const chars = line.reduce((a, x) => a + x.w.length + 1, 0) + w.w.length
      if (END.test(prev.w) || w.t - prev.end > maxGap || chars > maxChars || w.end - line[0].t > maxSeconds) flush()
    }
    line.push(w)
  }
  flush()
  // A line stays until the next begins, if that is soon; never past it.
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1]?.start ?? Infinity
    cues[i].end = Math.round(Math.min(next, cues[i].end + 0.35) * 1000) / 1000
  }
  return cues
}

// Sizes that read well: about 4.5% of the height on a wide frame, 3.4% on a tall one.
export function captionStyle(width, height, style = {}) {
  const tall = height > width
  return { size: tall ? 0.034 : 0.045, position: 'bottom', ...style }
}

// Line length for a frame: shorter lines on a tall one.
export function captionChars(width, height) {
  return height > width ? 26 : 42
}
