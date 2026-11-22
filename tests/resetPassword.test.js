import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/ResetPassword.jsx', import.meta.url), 'utf8')

test('nothing in the reset page shadows the translation function', () => {
  // A local `const t = setTimeout(...)` once replaced the imported `t`, so the
  // "link is invalid or expired" message threw instead of rendering.
  assert.match(source, /import \{[^}]*\bt\b[^}]*\} from '\.\.\/lib\/i18n'/)
  assert.doesNotMatch(source, /\b(?:const|let|var)\s+t\s*=/)
  // The message is stored as a dictionary key and worded at render through `t`.
  assert.match(source, /setError\('resetPasswordInvalidLink'\)/)
  assert.match(source, /const errorText = error \? \(l\[error\] \|\| t\(lang, error\)\) : ''/)
})

test('the reset page shows a form-shaped shimmer, labelled fields and no raw backend text', () => {
  assert.match(source, /role="status" aria-busy="true"[\s\S]{0,200}<Shimmer/)
  assert.doesNotMatch(source, /checking \? \([\s\S]{0,200}animate-spin/)
  assert.match(source, /<label htmlFor="reset-new-password"/)
  assert.match(source, /<label htmlFor="reset-repeat-password"/)
  assert.equal((source.match(/autoComplete="new-password"/g) || []).length, 2)
  assert.doesNotMatch(source, /setError\(error\.message\)/)
  for (const code of ['uz', 'ru', 'en']) assert.match(source, new RegExp(`${code}: \\{ updateFailed: '`))
  assert.doesNotMatch(source, /text-gray-400/)
})
