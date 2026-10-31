// Motion runtime: the same contract as NWLab ForgeOS's motion pages (MR-013).
// A composition never plays in real time by itself: whoever shows it calls
// NWLab.seek(seconds), the preview's timeline for each painted frame and
// `npm run render` for each video frame, so both show the same picture at the
// same time. The page that loads this script sets window.__NWLAB__ first.
;(() => {
  const cfg = window.__NWLAB__ || {}
  const N = {
    data: cfg.data || {},
    duration: cfg.duration,
    config: cfg,
    // anime.js v4 timelines and animations, created with autoplay: false.
    timelines: [],
    seekers: [],
    time: 0,
    register(tl) {
      if (tl && typeof tl.pause === 'function') tl.pause()
      this.timelines.push(tl)
      return tl
    },
    onSeek(fn) {
      this.seekers.push(fn)
    },
    // The narration's timeline, when the video pipeline (npm run video) made
    // the page: scenes with start, dur, text and the time of each word.
    timeline: (cfg.data && cfg.data.timeline) || null,
    // A scene of the timeline, by id or position (0-based).
    scene(id) {
      const scenes = (this.timeline && this.timeline.scenes) || []
      return typeof id === 'number' ? scenes[id] : scenes.find((s) => s.id === id)
    },
    // When the narration says `word` (its nth time) in a scene, in seconds
    // from the start of the video; `shift` moves it. Case and accents do not
    // matter. Unknown words give the scene's start, and a warning.
    word(sceneId, word, nth = 1, shift = 0) {
      const s = this.scene(sceneId)
      if (!s) {
        console.warn(`NWLab.word: no scene ${sceneId}`)
        return 0
      }
      const want = fold(word)
      let n = nth
      for (const w of s.words || []) if (fold(w.w) === want && --n === 0) return w.t + shift
      console.warn(`NWLab.word: "${word}" #${nth} is not said in scene ${s.id}`)
      return s.start + shift
    },
    async boot() {
      if (window.nwlabReady) await window.nwlabReady
      if (document.fonts && document.fonts.ready) await document.fonts.ready
      await this.seek(0)
    },
    async seek(sec) {
      this.time = sec
      const ms = sec * 1000
      for (const tl of this.timelines) tl.seek(Math.max(0, ms), true)
      if (document.getAnimations)
        for (const a of document.getAnimations()) {
          a.pause()
          a.currentTime = ms
        }
      for (const fn of this.seekers) await fn(sec)
      if (typeof window.nwlabSeek === 'function') await window.nwlabSeek(sec)
      if (document.fonts && document.fonts.status !== 'loaded') await document.fonts.ready
    },
  }
  window.NWLab = N

  function fold(text) {
    return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  }

  // Captions (cfg.captions = { cues: [{ start, end, words: [{ w, t, end }] }], style }):
  // one line at a time, the word being said in the accent color.
  if (cfg.captions && cfg.captions.cues && cfg.captions.cues.length) {
    const st = Object.assign(
      { position: 'bottom', size: 0.045, color: '#ffffff', accent: '#e2c286', band: 'rgba(8,10,14,.72)', font: null, weight: 600, y: null },
      cfg.captions.style || {},
    )
    const [W, H] = cfg.viewport || [1920, 1080]
    const box = document.createElement('div')
    const px = Math.round(H * st.size)
    const top = st.y != null ? st.y : st.position === 'top' ? 0.08 : st.position === 'middle' ? 0.5 : 0.86
    box.style.cssText =
      `position:fixed;left:50%;top:${top * 100}%;transform:translate(-50%,-50%);z-index:2147483646;` +
      `width:max-content;max-width:${Math.round(W * 0.86)}px;padding:${Math.round(px * 0.28)}px ${Math.round(px * 0.6)}px;` +
      `border-radius:${Math.round(px * 0.3)}px;background:${st.band};color:${st.color};` +
      `font-size:${px}px;line-height:1.25;font-weight:${st.weight};${st.font ? `font-family:${st.font};` : ''}text-align:center;letter-spacing:.01em;opacity:0;pointer-events:none;` +
      'text-shadow:0 2px 6px rgba(0,0,0,.35);white-space:pre-wrap'
    let shown = -1
    const spans = []
    N.onSeek((t) => {
      const i = cfg.captions.cues.findIndex((c) => t >= c.start && t < c.end)
      if (i !== shown) {
        shown = i
        box.textContent = ''
        spans.length = 0
        if (i >= 0)
          for (const [k, w] of cfg.captions.cues[i].words.entries()) {
            const sp = document.createElement('span')
            sp.textContent = (k ? ' ' : '') + w.w
            box.appendChild(sp)
            spans.push([sp, w])
          }
      }
      box.style.opacity = i >= 0 ? '1' : '0'
      // One word at a time: from its start until the next word starts.
      spans.forEach(([sp, w], k) => {
        const next = k + 1 < spans.length ? spans[k + 1][1].t : w.end + 0.3
        sp.style.color = t >= w.t && t < Math.min(next, w.end + 0.3) ? st.accent : st.color
      })
    })
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box))
  }

  // A page should not move by itself between seeks.
  const style = document.createElement('style')
  style.textContent = '*{caret-color:transparent}'
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))

  // Inside the preview: answer the app's timeline. Seeks run one at a time and
  // only the latest one waiting is kept, so a fast scrub never piles up.
  if (window.parent === window) return
  let busy = false
  let next = null
  async function drain() {
    if (busy) return
    busy = true
    while (next !== null) {
      const t = next
      next = null
      try {
        await N.seek(t)
      } catch (error) {
        console.error(error)
      }
    }
    busy = false
  }
  window.addEventListener('message', (event) => {
    const data = event.data
    if (event.source !== window.parent || !data || data.source !== 'tsrs-motion') return
    if (typeof data.seek === 'number' && isFinite(data.seek)) {
      next = Math.max(0, data.seek)
      drain()
    }
  })
  window.addEventListener('load', async () => {
    try {
      await N.boot()
    } catch (error) {
      console.error(error)
    }
    parent.postMessage(
      {
        source: 'tsrs-preview',
        motion: { duration: cfg.duration, width: cfg.viewport[0], height: cfg.viewport[1], fps: cfg.fps },
      },
      '*',
    )
  })
})()
