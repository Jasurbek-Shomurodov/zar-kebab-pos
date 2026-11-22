import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import {
  bazaarCategoriesFor,
  bazaarCategoryLabel,
  customBazaarCategoryKey,
  isValidBazaarCategory,
  normalizeBazaarItem,
  validateBazaarPurchase,
} from '../src/lib/bazaar.js'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function functionSource(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  assert.notEqual(start, -1, name)
  const end = sql.indexOf('\n$$;', start)
  return sql.slice(start, end + 4)
}

test('custom ingredient categories keep their name as the label and list after built-ins', () => {
  const key = customBazaarCategoryKey('  Sauces   and dips ')
  assert.equal(key, 'custom:Sauces and dips')
  assert.equal(customBazaarCategoryKey('   '), '')
  assert.equal(bazaarCategoryLabel(key, 'ru'), 'Sauces and dips')
  assert.equal(bazaarCategoryLabel('meat', 'ru'), 'Мясо')
  assert.equal(isValidBazaarCategory(key), true)
  assert.equal(isValidBazaarCategory('custom: padded'), false)
  assert.equal(isValidBazaarCategory('custom:'), false)
  assert.equal(isValidBazaarCategory('other'), false)
  assert.equal(normalizeBazaarItem({ product_name: 'Mayo', category: key }).category, key)

  const categories = bazaarCategoriesFor([{ category: 'custom:Zeta' }, { category: key }, { category: 'meat' }, 'custom:Zeta'])
  assert.deepEqual(categories.slice(-2).map(category => category.key), [key, 'custom:Zeta'])
  assert.equal(categories[0].key, 'meat')

  const { errors } = validateBazaarPurchase({
    purchase_date: '2026-09-28',
    payment_method: 'cash',
    buyer_profile_id: 'buyer',
    items: [{ product_name: 'Mayo', category: key, unit: 'l', quantity: '1', line_total: '19000' }],
  })
  assert.equal(errors.some(error => error.field === 'category'), false)
})

test('ingredients page adds categories in a separate panel and only picks them in the form', () => {
  const page = read('src/pages/BazaarIngredients.jsx')
  const picker = read('src/components/BazaarCategoryPicker.jsx')
  // The add-category form is the shared dialog rendered as a <form>.
  assert.match(page, /<WorkspaceDialog\s+as="form"\s+panelProps=\{\{ onSubmit: addCategory \}\}/)
  assert.match(page, /supabase\.rpc\('add_bazaar_ingredient_category', \{ p_name: name \}\)/)
  assert.match(page, /\.from\('bazaar_ingredient_categories'\)/)
  assert.match(page, /extraCategories=\{customCategories\}/)
  assert.doesNotMatch(picker, /customBazaarCategoryKey|allowCreate/)
  assert.match(page, /<BazaarCategoryPicker value=\{form\.category\} ingredients=\{ingredients\}[\s\S]*?\/>/)
  assert.doesNotMatch(page, /BAZAAR_ENTRY_CATEGORIES\.map/)
})

test('migration 214 accepts custom categories in constraints and both catalog RPCs', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const bazaar = read('migrations/097_daily_bazaar.sql')
  const rename = read('migrations/182_rename_bazaar_ingredients.sql')
  const builtins = `'meat', 'poultry', 'vegetables', 'fruit', 'dairy', 'grocery', 'spices', 'beverages', 'bakery', 'packaging', 'cleaning', 'charcoal'`

  await db.exec(`
    create role anon; create role authenticated;
    create function public.current_staff_can_access(feature text) returns boolean language sql as $$ select true $$;
    create table public.test_manager (allowed boolean);
    insert into public.test_manager values (true);
    create function public.current_staff_can_manage_bazaar_ingredients() returns boolean language sql as $$ select allowed from public.test_manager $$;
    create table public.bazaar_product_catalog (
      category text not null,
      constraint bazaar_product_catalog_category_check check (category in (${builtins}))
    );
    create table public.bazaar_purchases (id uuid);
    create table public.bazaar_purchase_items (
      category text not null,
      constraint bazaar_purchase_items_category_check check (category in (${builtins}))
    );
  `)
  await db.exec(functionSource(rename, 'save_bazaar_ingredient'))
  await db.exec(functionSource(bazaar, 'save_bazaar_purchase'))

  const migration = read('migrations/214_custom_ingredient_categories.sql')
  await db.exec(migration)
  await db.exec(migration)

  for (const name of ['save_bazaar_ingredient', 'save_bazaar_purchase']) {
    const { rows } = await db.query(`select pg_get_functiondef('public.${name}(jsonb)'::regprocedure) as def`)
    assert.match(rows[0].def, /public\.normalize_bazaar_category\(/, name)
    assert.match(rows[0].def, /not public\.is_valid_bazaar_category\(/, name)
    assert.doesNotMatch(rows[0].def, /'spices', 'beverages'/, name)
  }

  const { rows } = await db.query(`
    select public.normalize_bazaar_category('  Custom:  Sauces   dips ') as custom,
           public.normalize_bazaar_category(' MEAT ') as builtin,
           public.is_valid_bazaar_category('custom:Sauces dips') as valid_custom,
           public.is_valid_bazaar_category('custom:') as empty_custom,
           public.is_valid_bazaar_category('other') as unknown
  `)
  assert.deepEqual(rows[0], { custom: 'custom:Sauces dips', builtin: 'meat', valid_custom: true, empty_custom: false, unknown: false })

  const added = await db.query(`select (public.add_bazaar_ingredient_category('  Sauces   dips ')).category as category`)
  assert.equal(added.rows[0].category, 'custom:Sauces dips')
  const again = await db.query(`select (public.add_bazaar_ingredient_category('SAUCES DIPS')).category as category`)
  assert.equal(again.rows[0].category, 'custom:Sauces dips')
  assert.equal((await db.query('select count(*)::int as n from public.bazaar_ingredient_categories')).rows[0].n, 1)
  await assert.rejects(db.query(`select public.add_bazaar_ingredient_category('   ')`), /Category name is required/)
  await db.exec('update public.test_manager set allowed = false')
  await assert.rejects(db.query(`select public.add_bazaar_ingredient_category('Other')`), /Only an owner/)

  await db.exec(`insert into public.bazaar_product_catalog (category) values ('custom:Sauces'), ('meat')`)
  await assert.rejects(db.exec(`insert into public.bazaar_purchase_items (category) values ('other')`))
})
