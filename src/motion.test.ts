import { expect, test } from 'vitest'
import { MOTION_DEFAULTS, insertHead } from '../render/motion.mjs'
import {
  artifactName,
  isMotion,
  lastPreviewable,
  motionDocument,
  motionSettings,
  previewDocument,
  previewable,
  withPreviewHint,
} from './preview'

const COMPOSITION = `<!doctype html>
<html><head>
<meta name="nwlab:duration" content="8.5">
<meta content='1920x1080' name='nwlab:size'>
<meta name="nwlab:fps" content="25">
</head><body><h1 id="t">Oi</h1>
<script>NWLab.register(anime.createTimeline({ autoplay: false }).add('#t', { opacity: [0, 1] }))</script>
</body></html>`

test('motion blocks are previewable and download as HTML', () => {
  expect(previewable('motion')).toBe(true)
  expect(isMotion('Motion')).toBe(true)
  expect(isMotion('html')).toBe(false)
  expect(artifactName('motion', 3)).toBe('motion-3.html')
})

test('reads duration, size and frame rate from the meta tags', () => {
  expect(motionSettings(COMPOSITION)).toEqual({ duration: 8.5, width: 1920, height: 1080, fps: 25 })
  expect(motionSettings('<h1>sem meta</h1>')).toEqual(MOTION_DEFAULTS)
})

test('keeps the settings inside what a video can be', () => {
  const settings = motionSettings(
    '<meta name="nwlab:duration" content="99999"><meta name="nwlab:size" content="1081×9"><meta name="nwlab:fps" content="240">',
  )
  // Even sides, a minimum size, at most ten minutes and 60 fps.
  expect(settings).toEqual({ duration: 600, width: 1082, height: 16, fps: 60 })
  expect(motionSettings('<meta name="nwlab:duration" content="abc">').duration).toBe(MOTION_DEFAULTS.duration)
})

test('puts the bridge, the configuration and the runtime before the composition scripts', () => {
  const html = motionDocument(COMPOSITION, 'http://app.test/motion/')
  const bridge = html.indexOf('tsrs-preview')
  const config = html.indexOf('window.__NWLAB__=')
  const runtime = html.indexOf('<script src="http://app.test/motion/runtime.js">')
  const anime = html.indexOf('<script src="http://app.test/motion/anime.umd.min.js">')
  const own = html.indexOf('NWLab.register')
  expect(bridge).toBeGreaterThan(-1)
  expect(bridge).toBeLessThan(config)
  expect(config).toBeLessThan(runtime)
  expect(runtime).toBeLessThan(anime)
  expect(anime).toBeLessThan(own)
  expect(html).toContain('"viewport":[1920,1080]')
  expect(html).toContain('html,body{margin:0;width:1920px;height:1080px;overflow:hidden}')
  // Lottie is loaded only by compositions that use it.
  expect(html).not.toContain('lottie_svg')
  expect(motionDocument('<script>lottie.loadAnimation({})</script>', '/m/')).toContain(
    '<script src="/m/lottie_svg.min.js">',
  )
  // The doctype stays first and the line count does not change.
  expect(html.startsWith('<!doctype html>\n<html><head><script>')).toBe(true)
  expect(html.split('\n')).toHaveLength(COMPOSITION.split('\n').length)
})

test('a composition without a head still gets the runtime first', () => {
  expect(insertHead('<p>x</p>', '<i>')).toBe('<i><p>x</p>')
  const html = previewDocument('motion', '<p>x</p>')!
  expect(html.startsWith('<script>(function(){')).toBe(true)
  expect(html).toMatch(/motion\/runtime\.js"><\/script><p>x<\/p>$/)
})

test('the preview note explains the motion contract', () => {
  const hint = withPreviewHint('', 'Abrir preview')
  expect(hint).toContain('tagged motion')
  expect(hint).toContain('NWLab.register(tl)')
  expect(hint).toContain('nwlab:duration')
  expect(lastPreviewable('```motion\n<h1>x</h1>\n```', ['motion'])).toEqual({
    lang: 'motion',
    code: '<h1>x</h1>',
  })
})

test('a composition in a project finds its own files', () => {
  const html = motionDocument('<!doctype html><html><head></head><body><img src="midia/a.jpg"></body></html>', 'http://app.test/motion/', 'http://app.test/__tsrs/projects/raw/p/')
  expect(html).toContain('<base href="http://app.test/__tsrs/projects/raw/p/">')
  expect(html).toContain('src="http://app.test/motion/runtime.js"')
})

