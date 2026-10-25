// The NWind Lab opening the tutorial asks for in episode 6: 6 s, vertical.
// `gold` and `early` are the adjustments asked for afterwards.
export function opening({ gold = false, early = false } = {}) {
  const color = gold ? '#c9a35a' : '#efe6d2'
  const titleAt = early ? 0.8 : 1.8
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="nwlab:size" content="1080x1920"><meta name="nwlab:duration" content="6"><meta name="nwlab:fps" content="30">
<style>
  html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #07090d; font-family: system-ui, sans-serif; }
  #glow { position: absolute; left: 140px; top: 560px; width: 800px; height: 800px; border-radius: 50%;
    background: radial-gradient(circle, rgba(232,119,46,.55), rgba(232,119,46,0) 65%); opacity: 0; }
  #logo { position: absolute; left: 390px; top: 610px; width: 300px; height: 300px; opacity: 0; }
  #title { position: absolute; left: 0; right: 0; top: 1010px; text-align: center; font-size: 132px; font-weight: 700;
    letter-spacing: 4px; color: ${color}; opacity: 0; }
  #sub { position: absolute; left: 0; right: 0; top: 1180px; text-align: center; font-size: 44px; letter-spacing: 14px; color: #8b8f98; opacity: 0; }
  #fade { position: absolute; inset: 0; background: #000; opacity: 0; }
</style></head><body>
<div id="glow"></div>
<svg id="logo" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#c9a35a" stroke-width="4"/>
  <path d="M50 14 L60 50 L50 86 L40 50 Z" fill="#e8772e"/><circle cx="50" cy="50" r="5" fill="#07090d"/></svg>
<div id="title">NWind Lab</div>
<div id="sub">STUDIO</div>
<div id="fade"></div>
<script>
  const ease = (t, a, d) => { const x = Math.min(1, Math.max(0, (t - a) / d)); return 1 - Math.pow(1 - x, 3) }
  NWLab.onSeek((t) => {
    const logo = ease(t, 0.3, 0.9)
    document.getElementById('logo').style.opacity = logo
    document.getElementById('logo').style.transform = 'scale(' + (0.7 + 0.3 * logo) + ') rotate(' + (1 - logo) * -40 + 'deg)'
    document.getElementById('glow').style.opacity = ease(t, 0.6, 0.5) * (1 - 0.6 * ease(t, 1.4, 1.2))
    const title = ease(t, ${titleAt}, 0.8)
    document.getElementById('title').style.opacity = title
    document.getElementById('title').style.transform = 'translateY(' + (1 - title) * 50 + 'px)'
    document.getElementById('sub').style.opacity = ease(t, ${titleAt} + 0.6, 0.8)
    document.getElementById('fade').style.opacity = ease(t, 5.2, 0.8)
  })
</script></body></html>`
}
