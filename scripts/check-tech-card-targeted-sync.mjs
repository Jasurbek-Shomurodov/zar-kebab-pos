// Isolated PostgreSQL regression and benchmark for migration 236; no production access.
// Usage: node scripts/check-tech-card-targeted-sync.mjs [/path/to/pglite/dist/index.js]
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite')
const read = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const variant = read('156_variant_tech_cards.sql')
const prior = read('155_tech_card_real_costs.sql')
const batched = read('183_batch_tech_card_cost_sync.sql')
const targeted = read('236_targeted_tech_card_cost_sync.sql')
const functionSql = (source, name) => {
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0, name)
  return source.slice(start, source.indexOf('$$;', start) + 3)
}

// Production-sized menu: 196 dishes, 96 recipes, about 57 included-dish lines.
const DISHES = 196
const RECIPES = 96

async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function current_staff_can_access(text) returns boolean language sql as $$ select true $$;
    create function current_staff_can_write(text) returns boolean language sql as $$ select true $$;
    create table menu_items(id text primary key, deleted_at timestamptz, option_groups jsonb default '[]');
    create table menu_item_costs(menu_item_id text primary key references menu_items, cost_price integer, variant_costs jsonb default '{}', cost_source text default 'manual', updated_at timestamptz default now());
    create table menu_item_tech_cards(menu_item_id text, variant_option_id text default '', portion_count numeric, batch_output_quantity numeric, batch_output_unit text, preparation_steps text, notes text, updated_by uuid, updated_at timestamptz, primary key(menu_item_id,variant_option_id));
    create table menu_item_tech_card_ingredients(menu_item_id text, variant_option_id text default '', name text, quantity numeric, unit text, unit_price_uzs bigint, sort_order integer, updated_at timestamptz);
    create table menu_item_tech_card_components(menu_item_id text, variant_option_id text default '', component_menu_item_id text, selected_options jsonb default '{}', quantity numeric, sort_order integer, updated_at timestamptz);
    create index on menu_item_tech_card_ingredients(menu_item_id, variant_option_id);
    create index on menu_item_tech_card_components(menu_item_id, variant_option_id);
    create index on menu_item_tech_card_components(component_menu_item_id);
    create table cost_writes(id integer generated always as identity);
    create function count_cost_write() returns trigger language plpgsql as $$ begin insert into cost_writes default values; return new; end $$;
    create trigger count_cost_write after insert or update on menu_item_costs for each row execute function count_cost_write();
    insert into menu_items(id) select 'item-' || n from generate_series(1, ${DISHES}) n;
    insert into menu_items(id, option_groups) values('manual','[{"id":"size","options":[{"id":"large"}]}]');
    insert into menu_item_costs(menu_item_id,cost_price,variant_costs) values('manual',20,'{"large":50}');
  `)
  for (const name of ['calculate_menu_item_variant_tech_card_real_cost', 'enforce_menu_item_cost_source', 'sync_menu_item_tech_card_real_costs', 'save_menu_item_tech_card']) {
    await db.exec(functionSql(variant, name))
  }
  await db.exec('create trigger menu_item_costs_enforce_source before insert or update of cost_price, cost_source on menu_item_costs for each row execute function enforce_menu_item_cost_source();')
  return db
}

const scalar = async (db, sql) => (await db.query(sql)).rows[0].value
const payload = (id, price = 10, variant_option_id = '') => ({
  menu_item_id: id, variant_option_id, portion_count: 1, preparation_steps: 'Mix',
  ingredients: Array.from({ length: 4 }, (_, i) => ({ name: `Ingredient ${i}`, quantity: 1, unit: 'kg', unit_price_uzs: price })),
  components: [],
})
const componentCard = (id, children, price = 10) => ({
  ...payload(id, price),
  components: children.map(([child, quantity, selected_options = {}]) => ({ component_menu_item_id: child, quantity, selected_options })),
})
const save = (db, card) => db.query('select save_menu_item_tech_card($1::jsonb)', [JSON.stringify(card)])

// Seed recipes: the first 80 are plain; 16 include one or two earlier dishes,
// giving chains up to three levels deep like combo sets.
async function seed(db) {
  for (let i = 1; i <= 80; i++) await save(db, payload(`item-${i}`, 10 + (i % 7)))
  for (let i = 81; i <= RECIPES; i++) {
    const children = [[`item-${i - 80}`, 1], [`item-${i - 1}`, 0.5]]
    await save(db, componentCard(`item-${i}`, children, 5))
  }
  await db.exec('select sync_menu_item_tech_card_real_costs()')
}

async function installTriggers(db, migrations) {
  await db.exec(functionSql(prior, 'trigger_sync_menu_item_tech_card_real_costs'))
  const start = prior.indexOf('drop trigger if exists menu_item_costs_refresh')
  await db.exec(prior.slice(start, prior.indexOf('select public.sync_menu_item_tech_card_real_costs();', start)))
  for (const sql of migrations) await db.exec(sql)
}

async function timeSaves(db, id, count = 5) {
  const times = []
  for (let n = 0; n < count; n++) {
    const start = performance.now()
    await save(db, payload(id, 30 + n))
    times.push(performance.now() - start)
  }
  return Math.round(times.sort((a, b) => a - b)[Math.floor(count / 2)])
}

// A targeted sync must leave nothing for a full recalculation to change.
async function assertMatchesFullSync(db, label) {
  await db.exec('truncate cost_writes')
  await db.exec("select set_config('app.tech_card_cost_sync_running', 'on', false)")
  await db.exec('select sync_menu_item_tech_card_real_costs()')
  await db.exec("select set_config('app.tech_card_cost_sync_running', 'off', false)")
  assert.equal(await scalar(db, 'select count(*)::int as value from cost_writes'), 0, `${label}: full recalculation found stale costs`)
}

const before = await setup()
const after = await setup()
try {
  await seed(before)
  await seed(after)
  await installTriggers(before, [batched])
  await installTriggers(after, [batched, targeted, targeted]) // Reapplication must be safe.

  // Benchmark: a plain dish nothing includes, and a dish deep in a combo chain.
  const benchmark = {
    plainDish: { before: await timeSaves(before, 'item-40'), after: await timeSaves(after, 'item-40') },
    includedDish: { before: await timeSaves(before, 'item-1'), after: await timeSaves(after, 'item-1') },
  }
  await assertMatchesFullSync(after, 'after benchmark saves')

  // Only the saved dish and what includes it are written.
  await after.exec('truncate cost_writes')
  await save(after, payload('item-40', 99))
  assert.equal(await scalar(after, 'select count(*)::int as value from cost_writes'), 1)
  await after.exec('truncate cost_writes')
  await save(after, payload('item-40', 99)) // Unchanged recipe rewrites nothing.
  assert.equal(await scalar(after, 'select count(*)::int as value from cost_writes'), 0)
  await save(after, payload('item-1', 77))
  assert.ok(await scalar(after, "select count(*)::int as value from cost_writes") > 1, 'dependents of item-1 must be rewritten')
  await assertMatchesFullSync(after, 'dependent chain')

  // Same scenarios as the 183 check, now on the targeted path.
  await save(after, componentCard('item-150', [['manual', 0.5, { size: 'large' }]]))
  await save(after, componentCard('item-151', [['item-150', 2]]))
  await after.exec("update menu_item_costs set variant_costs='{\"large\":80}' where menu_item_id='manual'")
  assert.equal(await scalar(after, "select cost_price as value from menu_item_costs where menu_item_id='item-150'"), 80)
  assert.equal(await scalar(after, "select cost_price as value from menu_item_costs where menu_item_id='item-151'"), 200)
  await save(after, componentCard('item-152', [['manual', 2]]))
  await after.exec("update menu_item_costs set cost_price=30 where menu_item_id='manual'")
  assert.equal(await scalar(after, "select cost_price as value from menu_item_costs where menu_item_id='item-152'"), 100)
  await assertMatchesFullSync(after, 'manual base and variant costs')

  await after.exec(`update menu_items set option_groups='[{"id":"size","options":[{"id":"large"}]}]' where id='item-153'`)
  await save(after, payload('item-153', 20, 'large'))
  await save(after, componentCard('item-154', [['item-153', 0.5, { size: 'large' }]]))
  await save(after, payload('item-153', 30, 'large'))
  assert.equal(await scalar(after, "select cost_price as value from menu_item_costs where menu_item_id='item-154'"), 100)
  await assertMatchesFullSync(after, 'saved variant propagation')

  // Commit-time path: several mutations in one transaction, flushed early.
  await after.exec('begin; set constraints all immediate')
  await after.exec("update menu_item_tech_card_ingredients set unit_price_uzs=12 where menu_item_id='item-2'")
  await after.exec("update menu_item_tech_card_ingredients set unit_price_uzs=13 where menu_item_id='item-3'")
  await after.exec('commit')
  assert.equal(await scalar(after, "select cost_price as value from menu_item_costs where menu_item_id='item-2'"), 48)
  assert.equal(await scalar(after, "select cost_price as value from menu_item_costs where menu_item_id='item-3'"), 52)
  await assertMatchesFullSync(after, 'immediate constraints')

  // Deleting a recipe returns its cost to manual, like the full sync.
  await after.exec("delete from menu_item_tech_card_ingredients where menu_item_id='item-70'; delete from menu_item_tech_cards where menu_item_id='item-70'")
  assert.equal(await scalar(after, "select cost_source as value from menu_item_costs where menu_item_id='item-70'"), 'manual')

  await after.exec('begin')
  await save(after, payload('item-40', 5))
  await after.exec('rollback')
  assert.equal(await scalar(after, "select cost_price as value from menu_item_costs where menu_item_id='item-40'"), 396)

  await after.exec("insert into menu_items(id) values('missing-cost')")
  await assert.rejects(save(after, componentCard('item-160', [['missing-cost', 1]])), /Every included menu item must have a real cost/)
  assert.equal(await scalar(after, "select count(*)::int as value from menu_item_tech_card_components where menu_item_id='item-160'"), 0)
  await save(after, payload('item-40', 14)) // Failure cannot leak the transaction flags or dirty list.
  assert.equal(await scalar(after, "select cost_price as value from menu_item_costs where menu_item_id='item-40'"), 56)
  await assertMatchesFullSync(after, 'final state')

  console.log(JSON.stringify({
    menu: { dishes: DISHES, recipes: RECIPES },
    medianSaveMs: benchmark,
    verified: ['matches full recalculation', 'single write for a dish nothing includes', 'unchanged recipe writes nothing', 'dependent chains', 'manual base and variant costs', 'saved variant propagation', 'immediate constraints', 'recipe deletion', 'rollback', 'missing cost rejection', 'reapplication'],
  }, null, 2))
} finally {
  await before.close()
  await after.close()
}
