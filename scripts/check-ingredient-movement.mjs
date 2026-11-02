// Isolated PostgreSQL verification; never connects to production.
// Usage: node scripts/check-ingredient-movement.mjs /path/to/pglite/dist/index.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite')
const db = new PGlite()
const read = file => readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
const extract = (source, name) => {
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0)
  return source.slice(start, source.indexOf('$$;', start) + 3)
}
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value
const report = async () => scalar("select get_ingredient_movement('2026-09-09', '2026-09-09') as value")
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create table profiles (id uuid, status text, role text, email text, feature_access text[]);
    insert into profiles values (auth.uid(), 'active', 'admin', '', array['ingredients']);
    create table bazaar_product_catalog (product_key text primary key, product_name text, is_catalog_managed boolean, category text);
    alter table bazaar_product_catalog enable row level security;
    create function normalize_bazaar_product_key(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    create table orders (id text primary key, payment_status text, status text, paid_at timestamptz);
    create table order_items (id uuid primary key, order_id text, status text, quantity numeric);
    create table order_item_tech_card_ingredient_snapshots (order_item_id uuid, ingredients jsonb, is_complete boolean);
    revoke all on order_item_tech_card_ingredient_snapshots from authenticated, anon;
    create table bazaar_purchases (id text primary key, purchase_date date);
    create table bazaar_purchase_items (purchase_id text, product_key text, product_name text, unit text, quantity numeric, line_total numeric);
    create table menu_item_tech_cards (menu_item_id text, variant_option_id text, portion_count numeric);
    create table menu_item_tech_card_ingredients (id int, menu_item_id text, variant_option_id text, name text, quantity numeric, unit text, unit_price_uzs numeric, sort_order int);
    create table menu_item_tech_card_components (id int, menu_item_id text, variant_option_id text, component_menu_item_id text, quantity numeric, selected_options jsonb, sort_order int);
  `)
  await db.exec(extract(read('077_four_role_feature_access.sql'), 'current_staff_can_access'))
  await db.exec(extract(read('164_order_item_tech_card_ingredient_snapshots.sql'), 'build_tech_card_ingredient_snapshot'))
  const migration = read('186_ingredients_feature_and_movement.sql')
  await db.exec(migration)
  await db.exec(migration) // Safe rerun, including snapshot function rewrite.
  await db.exec(read('187_ingredient_movement_categories.sql'))
  await db.exec(read('187_ingredient_movement_categories.sql'))
  await db.exec(read('188_managed_ingredient_movement.sql'))
  await db.exec(read('188_managed_ingredient_movement.sql'))
  assert.equal(await scalar('select current_staff_can_manage_bazaar_ingredients() as value'), true)
  await db.exec(`
    insert into bazaar_product_catalog values ('flour', 'Flour', true, 'groceries'), ('water', 'Water', true, 'drinks');
    insert into menu_item_tech_cards values ('dish', '', 2), ('side', '', 1);
    insert into menu_item_tech_card_ingredients values (1, 'dish', '', 'Flour', 400, 'g', 10, 1), (2, 'side', '', 'Water', 100, 'ml', 1, 1);
    insert into menu_item_tech_card_components values (1, 'dish', '', 'side', 0.5, '{}', 1);
    insert into orders values ('paid', 'paid', 'completed', '2026-09-08T19:00:00Z'), ('unpaid', 'unpaid', 'open', '2026-09-09T10:00:00Z'), ('outside', 'paid', 'completed', '2026-09-09T19:00:00Z'), ('cancelled', 'paid', 'cancelled', '2026-09-09T10:00:00Z');
    insert into order_items values ('10000000-0000-0000-0000-000000000001','paid','served',3), ('10000000-0000-0000-0000-000000000002','paid','cancelled',99), ('10000000-0000-0000-0000-000000000003','unpaid','served',99), ('10000000-0000-0000-0000-000000000004','outside','served',99), ('10000000-0000-0000-0000-000000000005','paid','served',1), ('10000000-0000-0000-0000-000000000006','cancelled','served',99);
    insert into order_item_tech_card_ingredient_snapshots select id, build_tech_card_ingredient_snapshot('dish'), true from order_items where id <> '10000000-0000-0000-0000-000000000005';
    insert into bazaar_purchases values ('buy', '2026-09-09'), ('older', '2026-09-08');
    insert into bazaar_purchase_items values ('buy','flour','Flour','kg',2,20000), ('buy','flour','Flour','g',500,5000), ('buy','flour','Flour','bag',1,10000), ('older','flour','Flour','kg',100,1000000);
  `)
  await db.exec(`
    insert into bazaar_product_catalog values ('imported', 'Imported only', false, 'groceries');
    insert into bazaar_purchase_items values ('buy', 'imported', 'Imported only', 'kg', 10, 12345), ('buy', 'unknown', 'Unknown purchase', 'kg', 5, 500);
    update order_item_tech_card_ingredient_snapshots
    set ingredients = ingredients || '[{"name":"Unknown recipe", "unit":"kg", "quantity_per_portion":2, "snapshot_status":"captured"}, {"name":"Imported only", "product_key":"imported", "unit":"kg", "quantity_per_portion":3, "snapshot_status":"captured"}]'::jsonb;
  `)
  let result = await report()
  assert.equal(result.rows.length, 3) // Flour kg/bag and water only.
  assert.ok(result.rows.every(row => ['flour', 'water'].includes(row.identity)))
  assert.equal(result.uncovered_items, 1)
  assert.equal(result.covered_items, 1)
  const flour = result.rows.find(row => row.identity === 'flour' && row.unit === 'kg')
  assert.equal(flour.category, 'groceries')
  assert.equal(flour.bought, 2.5)
  assert.equal(flour.used, 0.6)
  assert.equal(flour.movement, 1.9)
  assert.equal(flour.paid, 25000)
  assert.equal(result.rows.find(row => row.unit === 'bag').used, 0)
  assert.equal(result.rows.find(row => row.identity === 'water').used, 0.15)
  await db.exec(`
    insert into bazaar_product_catalog values ('salt', 'Salt', true, 'groceries');
    update order_item_tech_card_ingredient_snapshots
    set ingredients = ingredients || '[{"name":"Salt", "unit":"kg", "quantity_per_portion":1, "snapshot_status":"captured"}, {"name":"Salt", "unit":"kg", "quantity_per_portion":1, "snapshot_status":"captured"}]'::jsonb;
  `)
  const beforeDistinctLookup = await report()
  await db.exec(read('275_ingredient_movement_distinct_key_lookup.sql'))
  await db.exec(read('275_ingredient_movement_distinct_key_lookup.sql'))
  result = await report()
  assert.deepEqual(result, beforeDistinctLookup)
  assert.equal(result.rows.find(row => row.identity === 'salt').used, 6) // Keyless snapshots still resolve by name.
  await db.exec("update bazaar_product_catalog set product_name = 'Premium flour' where product_key = 'flour'; update menu_item_tech_card_ingredients set quantity = 9999;")
  result = await report()
  assert.equal(result.rows.find(row => row.unit === 'kg').used, 0.6)
  assert.equal(result.rows.find(row => row.unit === 'kg').name, 'Premium flour')
  await db.exec("update profiles set role = 'viewer'")
  assert.equal(await scalar('select current_staff_can_manage_bazaar_ingredients() as value'), false)
  await report()
  await db.exec('set role authenticated')
  await report()
  await assert.rejects(db.query('select * from order_item_tech_card_ingredient_snapshots'), /permission denied/)
  await db.exec('reset role')
  await assert.rejects(db.query("select get_ingredient_movement('2025-01-01','2026-09-09')"), /at most 366/)
  await db.exec("update profiles set feature_access = array['bazaar']")
  await assert.rejects(report(), /Ingredients access required/)
  assert.equal(await scalar('select current_staff_can_manage_bazaar_ingredients() as value'), false)
  await db.exec("update profiles set feature_access = array['ingredients'], status = 'inactive'")
  await assert.rejects(report(), /Ingredients access required/)
  console.log('Ingredient movement SQL checks passed: permissions, privacy, boundaries, conversions, nested recipes, immutable usage, renames, and migration rerun.')
} finally { await db.close() }
