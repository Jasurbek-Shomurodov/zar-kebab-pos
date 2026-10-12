import test from 'node:test'
import assert from 'node:assert/strict'
import { invalidMenuNameFields, menuNameHasValidStart } from '../src/lib/menuItemText.js'

test('menu names must start with a capital letter or a digit', () => {
  for (const ok of ['Shashlik', 'Шашлык', '7 Up', '  Osh', '', '   ', 'Ўрик']) assert.equal(menuNameHasValidStart(ok), true, ok)
  for (const bad of ['shashlik', 'шашлык', '-Osh', '(New) Lagman']) assert.equal(menuNameHasValidStart(bad), false, bad)
})

test('invalidMenuNameFields lists every name field with a bad start', () => {
  assert.deepEqual(invalidMenuNameFields({ name_uz: 'Osh', name_ru: 'плов', name_en: 'pilaf' }), ['name_ru', 'name_en'])
  assert.deepEqual(invalidMenuNameFields({ name_uz: 'Osh', name_ru: '', name_en: undefined }), [])
})
