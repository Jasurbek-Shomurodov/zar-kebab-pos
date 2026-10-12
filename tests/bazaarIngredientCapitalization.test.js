import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { capitalizeBazaarIngredientName, normalizeBazaarProductKey } from '../src/lib/bazaar.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('ingredient names are saved with a capital first letter and an unchanged key', () => {
  assert.equal(capitalizeBazaarIngredientName('  anchous '), 'Anchous')
  assert.equal(capitalizeBazaarIngredientName("o'rik qoqi"), "O'rik qoqi")
  assert.equal(capitalizeBazaarIngredientName('яйцо'), 'Яйцо')
  assert.equal(capitalizeBazaarIngredientName('Already Fine'), 'Already Fine')
  assert.equal(capitalizeBazaarIngredientName(''), '')
  assert.equal(normalizeBazaarProductKey(capitalizeBazaarIngredientName('anchous')), normalizeBazaarProductKey('anchous'))
  assert.match(read('src/pages/BazaarIngredients.jsx'), /product_name: capitalizeBazaarIngredientName\(form\.product_name\)/)
})

test('migration 240 enforces capitalized catalog names and backfills without touching purchases', () => {
  const migration = read('migrations/240_capitalize_bazaar_ingredient_names.sql')
  assert.match(migration, /before insert or update of product_name on public\.bazaar_product_catalog/)
  assert.match(migration, /update public\.bazaar_product_catalog\s+set product_name = public\.capitalize_bazaar_ingredient_name\(product_name\)/)
  assert.doesNotMatch(migration, /bazaar_purchase|product_key\s*=/)
})
