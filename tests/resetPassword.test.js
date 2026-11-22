import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/ResetPassword.jsx', import.meta.url), 'utf8')

test('nothing in the reset page shadows the translation function', () => {
  // A local `const t = setTimeout(...)` once replaced the imported `t`, so the
  // "link is invalid or expired" message threw instead of rendering.
  assert.match(source, /import \{[^}]*\bt\b[^}]*\} from '\.\.\/lib\/i18n'/)
  assert.doesNotMatch(source, /\b(?:const|let|var)\s+t\s*=/)
  assert.match(source, /setError\(t\(lang, 'resetPasswordInvalidLink'\)\)/)
})
