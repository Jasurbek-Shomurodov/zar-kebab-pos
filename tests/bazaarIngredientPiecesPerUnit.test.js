import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { bazaarPricePerPiece, normalizeBazaarPiecesPerUnit } from '../src/lib/bazaar.js'
import { getBazaarIngredientTechCardPatch } from '../src/lib/techCards.js'
import { bazaarIngredientMatches } from '../src/lib/bazaarIngredientWrites.js'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function functionSource(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  assert.notEqual(start, -1, name)
  const end = sql.indexOf('\n$$;', start)
  return sql.slice(start, end + 4)
}

test('a box of 30 eggs prices one Tech Card piece at a thirtieth of the box', () => {
  assert.equal(normalizeBazaarPiecesPerUnit('box', '30'), 30)
  assert.equal(normalizeBazaarPiecesPerUnit('kg', '30'), null)
  assert.equal(normalizeBazaarPiecesPerUnit('box', '2.5'), null)
  assert.equal(normalizeBazaarPiecesPerUnit('box', ''), null)
  assert.equal(bazaarPricePerPiece(60_000, 12), 5_000)
  assert.deepEqual(getBazaarIngredientTechCardPatch({ name: 'tuxum', unit: 'box', normalUnitPrice: 50_000, piecesPerUnit: 30 }), {
    name: 'tuxum', unit: 'piece', unit_price_uzs: '1666.6667',
  })
  // Without a piece count a box still counts as one piece.
  assert.equal(getBazaarIngredientTechCardPatch({ name: 'box', unit: 'box', normal_unit_price: 50_000 }).unit_price_uzs, '50000')
  assert.equal(bazaarIngredientMatches({ pieces_per_unit: null }, { pieces_per_unit: '' }), true)
  assert.equal(bazaarIngredientMatches({ pieces_per_unit: 12 }, { pieces_per_unit: '30' }), false)
})

test('migration 239 stores pieces per unit and reprices piece recipe rows', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create function public.current_staff_can_manage_bazaar_ingredients() returns boolean language sql as $$ select true $$;
    create table public.bazaar_product_catalog (
      product_key text primary key, product_name text not null, category text not null, unit text not null,
      normal_unit_price integer, is_active boolean, last_purchase_date date, created_at timestamptz, updated_at timestamptz
    );
    create table public.menu_item_tech_card_ingredients (
      id serial primary key, name text, unit text, unit_price_uzs numeric(14,4), updated_at timestamptz
    );
  `)
  await db.exec(functionSource(read('migrations/097_daily_bazaar.sql'), 'normalize_bazaar_product_key'))
  await db.exec(functionSource(read('migrations/182_rename_bazaar_ingredients.sql'), 'save_bazaar_ingredient'))
  await db.exec(functionSource(read('migrations/228_tech_card_ingredient_unit_conversion.sql'), 'tech_card_unit_price_from_bazaar'))
  const migration = read('migrations/239_bazaar_ingredient_pieces_per_unit.sql')
  await db.exec(migration)
  await db.exec(migration)

  const save = payload => db.query('select (public.save_bazaar_ingredient($1::jsonb)).pieces_per_unit as pieces', [JSON.stringify(payload)])
  const egg = { product_name: 'tuxum', category: 'poultry', unit: 'box', normal_unit_price: '50000' }
  assert.equal((await save({ ...egg, pieces_per_unit: '30' })).rows[0].pieces, 30)
  await db.exec(`insert into public.menu_item_tech_card_ingredients (name, unit, unit_price_uzs) values ('tuxum', 'piece', 50000)`)
  await save({ ...egg, product_key: 'tuxum', pieces_per_unit: '25' })
  assert.equal(Number((await db.query('select unit_price_uzs from public.menu_item_tech_card_ingredients')).rows[0].unit_price_uzs), 2000)
  // Measured units drop the piece count; invalid counts are rejected.
  assert.equal((await save({ ...egg, product_key: 'tuxum', unit: 'kg', pieces_per_unit: '30' })).rows[0].pieces, null)
  await assert.rejects(save({ ...egg, product_key: 'tuxum', pieces_per_unit: '0' }), /out of range/)
  assert.doesNotMatch(migration, /(?:update|delete from|insert into) public\.(?:order_items|orders|order_item_tech_card_ingredient_snapshots|menu_item_costs)/)
})
