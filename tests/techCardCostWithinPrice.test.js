import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TECH_CARD_COST_OVERRUN_HINT,
  isTechCardCostOverPrice,
  parseTechCardCostOverruns,
  techCardEditorPath,
} from '../src/lib/techCards.js'

const migration = readFileSync(new URL('../migrations/280_tech_card_cost_within_price.sql', import.meta.url), 'utf8')
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('a portion cost above the selling price is flagged; equal or unknown is not', () => {
  assert.equal(isTechCardCostOverPrice(13_901_000, 45_000), true)
  assert.equal(isTechCardCostOverPrice(45_000, 45_000), false)
  assert.equal(isTechCardCostOverPrice(45_000.4, 45_000), false)
  assert.equal(isTechCardCostOverPrice(null, 45_000), false)
  // Unpriced rows (price 0) are not judged.
  assert.equal(isTechCardCostOverPrice(5_000, 0), false)
})

test('only the marked DB refusal is parsed into dishes to fix', () => {
  const error = {
    message: 'Tech card cost is higher than the selling price',
    hint: TECH_CARD_COST_OVERRUN_HINT,
    details: JSON.stringify([
      { menu_item_id: 'i1', variant_option_id: '', cost: 13901000, price: 45000 },
      { menu_item_id: 'i2', variant_option_id: 'option_1', cost: 90000, price: 80000 },
    ]),
  }
  assert.deepEqual(parseTechCardCostOverruns(error), [
    { menuItemId: 'i1', variantOptionId: '', cost: 13901000, price: 45000 },
    { menuItemId: 'i2', variantOptionId: 'option_1', cost: 90000, price: 80000 },
  ])
  assert.equal(parseTechCardCostOverruns({ message: 'other' }), null)
  assert.equal(parseTechCardCostOverruns(null), null)
  assert.deepEqual(parseTechCardCostOverruns({ hint: TECH_CARD_COST_OVERRUN_HINT, details: 'not json' }), [])
})

test('overrun rows link to the exact base or variant Tech Card', () => {
  assert.equal(techCardEditorPath('i1'), '/admin/tech-cards/i1')
  assert.equal(techCardEditorPath('i 2', 'option_1', 'Limon'), '/admin/tech-cards/i%202?variant=option_1&ingredient=Limon')
})

test('the cost sync refuses any change that leaves a Tech Card above its price', () => {
  // Checked after costs converge, over every affected dish and its includers.
  assert.match(migration, /exit when changed_count = 0;[\s\S]*perform public\.raise_tech_card_cost_overruns\(affected\);/)
  assert.match(migration, /hint = 'TECH_CARD_COST_EXCEEDS_PRICE'/)
  assert.match(migration, /detail = overruns::text/)
  assert.match(migration, /calculated\.cost > sale\.price/)
  // Variant price matches getSelectedMenuBasePrice: own price, else base + delta.
  assert.match(migration, /option_value ->> 'price_delta'/)
})

test('lowering a selling price is guarded without ever blocking a sale', () => {
  assert.match(migration, /after update of price, option_groups on public\.menu_items/)
  // Payment rewrites option_groups for variant stock; only prices are compared.
  assert.match(migration, /menu_item_option_price_signature\(old\.option_groups\)\s+is distinct from public\.menu_item_option_price_signature\(new\.option_groups\)/)
  assert.doesNotMatch(migration, /\(old\.price, old\.option_groups\) is distinct from/)
})

test('the guard never rewrites history or widens access', () => {
  assert.doesNotMatch(migration, /(?:update|delete from|insert into) public\.(?:order_items|orders|order_item_tech_card_ingredient_snapshots)/)
  assert.doesNotMatch(migration, /grant execute .* to (?:anon|authenticated)/)
  for (const fn of ['tech_card_selling_price(text, text)', 'tech_card_cost_overruns(text[])', 'raise_tech_card_cost_overruns(text[])']) {
    assert.ok(migration.includes(`revoke all on function public.${fn} from public, anon, authenticated`), fn)
  }
})

test('Tech Cards, Ingredients and Admin Menu show the dishes to fix with links', () => {
  const techCards = read('src/pages/TechCards.jsx')
  assert.match(techCards, /const saveDisabled = saving \|\| !dirty \|\| !!validationError \|\| !!costWarning/)
  assert.match(techCards, /parseTechCardCostOverruns\(error\)/)
  assert.match(techCards, /<TechCardCostOverrunList[^>]*onOpen=\{openOverrunTechCard\}/)
  const ingredients = read('src/pages/BazaarIngredients.jsx')
  assert.match(ingredients, /parseTechCardCostOverruns\(saveError\)/)
  assert.match(ingredients, /<TechCardCostOverrunList[^>]*canOpen=\{canOpenTechCards\}/)
  const adminMenu = read('src/pages/AdminMenu.jsx')
  assert.match(adminMenu, /parseTechCardCostOverruns\(result\.error\)/)
  assert.match(adminMenu, /<TechCardCostOverrunList[^>]*canOpen=\{canViewTechCards\}/)
})
