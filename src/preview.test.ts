import { expect, test } from 'vitest'
import {
  artifactName,
  lastPreviewable,
  normalizeUrl,
  previewDocument,
  previewable,
  withPreviewHint,
} from './preview'

test('knows which code blocks can be previewed', () => {
  expect(previewable('HTML')).toBe(true)
  expect(previewable('svg')).toBe(true)
  expect(previewable('md')).toBe(true)
  expect(previewable('python')).toBe(false)
  expect(artifactName('javascript', 2)).toBe('preview-2.js')
})

test('adds the console bridge after the doctype and head', () => {
  const html = previewDocument('html', '<!doctype html>\n<html><head><title>x</title></head></html>')!
  expect(html.startsWith('<!doctype html>\n<html><head><script>')).toBe(true)
  expect(html).toContain('<title>x</title>')
  // One line, so line numbers in errors still match the code.
  expect(html.split('\n')).toHaveLength(2)
})

test('wraps fragments, SVG and scripts in a document', () => {
  expect(previewDocument('html', '<h1>oi</h1>')).toMatch(/^<script>.*<\/script><h1>oi<\/h1>$/)
  expect(previewDocument('svg', '<svg></svg>')).toContain('<svg></svg></body>')
  const script = previewDocument('js', 'console.log("</script>")')!
  expect(script).toContain('console.log("<\\/script>")')
  expect(previewDocument('markdown', '# título')).toBeNull()
})

test('accepts only http and https addresses', () => {
  expect(normalizeUrl('example.com/a b')).toBeNull()
  expect(normalizeUrl('example.com/docs')).toBe('https://example.com/docs')
  expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000/')
  expect(normalizeUrl('http://127.0.0.1:8080/x')).toBe('http://127.0.0.1:8080/x')
  expect(normalizeUrl('javascript://alert(1)')).toBeNull()
  expect(normalizeUrl('file:///etc/passwd')).toBeNull()
  expect(normalizeUrl('palavra')).toBeNull()
  expect(normalizeUrl('')).toBeNull()
})

test('adds the preview note after the system prompt', () => {
  expect(withPreviewHint('', 'Abrir preview')).toMatch(/^The user is reading.*"Abrir preview" button/)
  expect(withPreviewHint(' seja breve ', 'Open preview')).toMatch(
    /^seja breve\n\nThe user is reading.*"Open preview" button/,
  )
})

test('finds the last previewable block of a reply', () => {
  const text = 'a\n\n```html\n<p>1</p>\n```\n\nb\n\n```python\nprint(1)\n```\n\n```SVG\n<svg/>\n```\nfim'
  expect(lastPreviewable(text)).toEqual({ lang: 'svg', code: '<svg/>' })
  expect(lastPreviewable('```python\nprint(1)\n```')).toBeNull()
  expect(lastPreviewable('sem código')).toBeNull()
})
