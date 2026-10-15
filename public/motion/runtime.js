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
