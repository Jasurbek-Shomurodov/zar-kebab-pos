import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDarkThemeCss } from '../scripts/build-dark-theme.mjs'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Vite regenerates the gitignored dark theme stylesheet so new colour classes are covered', () => {
  assert.match(source('vite.config.js'), /plugins: \[darkThemePlugin\(\), react\(\)/)
  assert.match(source('.gitignore'), /^src\/styles\/dark-theme\.css$/m)
})

test('dark palette is screen-only and remaps neutral surfaces but not brand orange', () => {
  const css = buildDarkThemeCss()
  assert.match(css, /^@media screen \{/m)
  assert.match(css, /html\[data-theme="dark"\] \.bg-white \{ background-color: #181e1b; \}/)
  assert.match(css, /html\[data-theme="dark"\] \.text-\\\[\\#1F2937\\\] \{ color: #edf3ef; \}/)
  assert.doesNotMatch(css, /\.bg-\\\[\\#ff5a00\\\] \{/)
  assert.match(css, /\.text-\\\[\\#1d7a52\\\] \{ color: #4cc38a; \}/)
  assert.match(source('src/main.jsx'), /import '\.\/styles\/dark-theme\.css'/)
})

test('every staff top bar carries the light/dark toggle at the top right', () => {
  assert.match(source('src/components/AppShell.jsx'), /\{headerActions\}\s*<ThemeToggle lang=\{state\.lang\} \/>/)
  assert.match(source('src/components/WorkspaceTopBar.jsx'), /\{children\}\s*<ThemeToggle lang=\{lang\} \/>/)
  assert.match(source('src/pages/WaiterOrder.jsx'), /<ThemeToggle lang=\{lang\}/)
})

test('theme only applies while a staff screen is mounted so public menus and prints stay light', () => {
  const theme = source('src/lib/theme.js')
  assert.match(theme, /if \(scopes > 0 && current === 'dark'\) root\.setAttribute\('data-theme', 'dark'\)/)
  assert.match(theme, /useLayoutEffect/)
})
