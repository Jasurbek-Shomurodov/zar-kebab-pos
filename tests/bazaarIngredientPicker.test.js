import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const picker = readFileSync(new URL('../src/components/BazaarIngredientPicker.jsx', import.meta.url), 'utf8')

test('Bazaar ingredient picker preserves a legacy Tech Card ingredient name until replacement', () => {
  assert.match(picker, /fallbackLabel = ''/)
  assert.match(picker, /selected\?\.name \|\| fallbackLabel \|\| l\.select/)
  assert.match(picker, /selected \|\| fallbackLabel \? 'text-\[#22201d\]'/)
})
