import { expect, test } from 'vitest'
import { freeName, insideRoot, parseArgs } from '../render/render.mjs'

test('reads the render options', () => {
  expect(parseArgs(['motion-1.html', '--audio', 'a.wav', '--fps', '240', '-o', 'v.mp4', '--online'])).toEqual({
    input: 'motion-1.html',
    out: 'v.mp4',
    audio: 'a.wav',
    fps: 60,
    crf: 18,
    lufs: -14,
    online: true,
  })
  expect(() => parseArgs(['a.html', '--fps'])).toThrow('--fps needs a value')
  expect(() => parseArgs(['a.html', '--crf', 'x'])).toThrow('--crf needs a number')
  expect(() => parseArgs(['a.html', '--loop'])).toThrow('unknown option --loop')
})

test('never overwrites a video that is already there', () => {
  const taken = new Set(['/v/motion-1.mp4', '/v/motion-1-2.mp4'])
  expect(freeName('/v/motion-1.mp4', (path) => taken.has(path))).toBe('/v/motion-1-3.mp4')
  expect(freeName('/v/outro.mp4', (path) => taken.has(path))).toBe('/v/outro.mp4')
})

test('serves only files inside the composition folder', () => {
  const root = '/compositions/intro'
  expect(insideRoot(root, '/logo.png')).toMatch(/intro[\\/]logo\.png$/)
  expect(insideRoot(root, '/fonts/a%20b.woff2?v=1')).toMatch(/intro[\\/]fonts[\\/]a b\.woff2$/)
  expect(insideRoot(root, '/../secret.txt')).toBeNull()
  expect(insideRoot(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull()
  expect(insideRoot(root, '/..%5c..%5ckeys.env')).toBeNull()
  expect(insideRoot(root, '/%E0%A4%A')).toBeNull()
  expect(insideRoot(root, '/')).toBeNull()
})
