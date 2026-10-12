import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const migration = readFileSync(new URL('../migrations/227_dynamic_tech_card_ingredient_prices.sql', import.meta.url), 'utf8')

test('catalog price and name changes flow into Tech Card ingredient rows', () => {
  assert.match(migration, /after update of normal_unit_price, product_name on public\.bazaar_product_catalog/)
  assert.match(migration, /update public\.menu_item_tech_card_ingredients ingredient\s+set unit_price_uzs = new\.normal_unit_price/)
  // Ambiguous catalog names never overwrite a recipe price.
  assert.match(migration, /other\.product_key <> new\.product_key/)
  // Existing stale recipes are brought to today's catalog price once.
  assert.match(migration, /set unit_price_uzs = catalog\.normal_unit_price/)
})

test('dynamic prices never rewrite paid history or widen access', () => {
  assert.doesNotMatch(migration, /(?:update|delete from|insert into) public\.(?:order_items|orders|order_item_tech_card_ingredient_snapshots|menu_item_costs)/)
  assert.doesNotMatch(migration, /drop policy|disable trigger|grant /)
  assert.match(migration, /revoke all on function public\.sync_tech_card_ingredients_from_bazaar_catalog\(\) from public, anon, authenticated/)
})

const conversion = readFileSync(new URL('../migrations/228_tech_card_ingredient_unit_conversion.sql', import.meta.url), 'utf8')

test('catalog prices convert into each recipe row unit with decimal precision', () => {
  assert.match(conversion, /alter column unit_price_uzs type numeric\(14,4\)/)
  assert.match(conversion, /\('g', 'mass', 1::numeric\), \('kg', 'mass', 1000\), \('ml', 'volume', 1\), \('l', 'volume', 1000\)/)
  assert.match(conversion, /after update of normal_unit_price, product_name, unit on public\.bazaar_product_catalog/)
  // Incompatible units keep their current price instead of a wrong one.
  assert.match(conversion, /coalesce\(\s+public\.tech_card_unit_price_from_bazaar\(new\.unit, new\.normal_unit_price, ingredient\.unit\),\s+ingredient\.unit_price_uzs/)
  assert.match(conversion, /'unit_price_uzs''\)::numeric/)
  assert.doesNotMatch(conversion, /(?:update|delete from|insert into) public\.(?:order_items|orders|order_item_tech_card_ingredient_snapshots|menu_item_costs)/)
  assert.doesNotMatch(conversion, /drop policy|disable trigger|grant /)
})
