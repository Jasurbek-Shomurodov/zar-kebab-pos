import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { MODAL_FOCUSABLE_SELECTOR, nextModalFocusIndex } from '../src/lib/modalKeyboard.js'

test('Tab wraps inside a modal and leaves the middle of the order to the browser', () => {
  assert.equal(nextModalFocusIndex({ count: 3, activeIndex: 2, shiftKey: false }), 0)
  assert.equal(nextModalFocusIndex({ count: 3, activeIndex: 0, shiftKey: true }), 2)
  assert.equal(nextModalFocusIndex({ count: 3, activeIndex: 1, shiftKey: false }), null)
  assert.equal(nextModalFocusIndex({ count: 3, activeIndex: 1, shiftKey: true }), null)
})

test('focus that escaped the modal is pulled back in, and an empty modal keeps focus on itself', () => {
  assert.equal(nextModalFocusIndex({ count: 3, activeIndex: -1, shiftKey: false }), 0)
  assert.equal(nextModalFocusIndex({ count: 3, activeIndex: -1, shiftKey: true }), 2)
  assert.equal(nextModalFocusIndex({ count: 0, activeIndex: -1, shiftKey: false }), -1)
})

test('disabled controls are never Tab stops', () => {
  assert.match(MODAL_FOCUSABLE_SELECTOR, /button:not\(\[disabled\]\)/)
  assert.match(MODAL_FOCUSABLE_SELECTOR, /\[tabindex\]:not\(\[tabindex="-1"\]\)/)
})

test('the shared dialog pins its title and actions around a scrolling body', () => {
  const component = readFileSync(new URL('../src/components/WorkspaceDialog.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/styles/workspace.css', import.meta.url), 'utf8')

  assert.match(component, /useModalKeyboard/)
  assert.match(component, /aria-modal="true"/)
  assert.match(component, /ws-dialog-header[\s\S]*ws-dialog-body[\s\S]*ws-dialog-footer/)
  assert.match(css, /\.ws-dialog-panel \{[^}]*max-height: calc\(100dvh - 24px\)[^}]*overflow: hidden/)
  assert.match(css, /\.ws-dialog-body \{[^}]*overflow-y: auto/)
  assert.match(css, /\.ws-dialog-header \{[^}]*flex-shrink: 0/)
  assert.match(css, /\.ws-dialog-footer \{[^}]*flex-shrink: 0/)
  // A landscape phone or an open keyboard gives the height back to the body.
  assert.match(css, /@media \(max-height: 480px\)/)
})

test('layers come from the named scale, never an arbitrary z-index', async () => {
  const { readdirSync, statSync } = await import('node:fs')
  const root = new URL('../src', import.meta.url).pathname
  const walk = dir => readdirSync(dir).flatMap(name => {
    const path = `${dir}/${name}`
    return statSync(path).isDirectory() ? walk(path) : /\.(jsx?|css)$/.test(name) ? [path] : []
  })
  const offenders = walk(root)
    .filter(path => !path.endsWith('/styles/dark-theme.css'))
    .flatMap(path => {
      const hits = readFileSync(path, 'utf8').match(/(?<![\w-])z-(?:\[\d+\]|50)(?![\w-])/g) || []
      return hits.map(hit => `${path.replace(root, 'src')} ${hit}`)
    })
  assert.deepEqual(offenders, [])

  const config = (await import('../tailwind.config.js')).default.theme.extend.zIndex
  assert.deepEqual(Object.keys(config), ['drawer', 'floating', 'overlay', 'dialog', 'picker', 'toast', 'critical'])
  const values = Object.values(config).map(Number)
  assert.deepEqual(values, [...values].sort((a, b) => a - b), 'each named layer sits above the previous one')
})
