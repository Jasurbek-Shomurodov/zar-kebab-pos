import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

import {
  ORDER_ITEM_COLUMNS,
  collectOrderIds,
  loadOrderItemCosts,
  withOrderItemCosts,
} from '../src/lib/orderItemColumns.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : sourceFiles(path)
    return /\.(js|jsx)$/.test(name) ? [path] : []
  })
}

test('staff payloads never ask for order item cost snapshots', () => {
  assert.doesNotMatch(ORDER_ITEM_COLUMNS, /cost/)
  const offenders = []
  for (const file of sourceFiles(new URL('../src', import.meta.url).pathname)) {
    const source = readFileSync(file, 'utf8')
    if (/order_items\(\*\)/.test(source)) offenders.push(`${file}: order_items(*)`)
    if (/from\('order_items'\)[\s\S]{0,120}?\.select\('\*'\)/.test(source)) offenders.push(`${file}: order_items select *`)
  }
  assert.deepEqual(offenders, [])
})

test('cost columns match the live column grant in 292', () => {
  const grant = read('migrations/292_hide_order_item_costs_from_staff.sql').match(/grant select \(([\s\S]*?)\) on public\.order_items/)[1]
  const granted = grant.split(',').map(column => column.trim()).filter(Boolean).sort()
  assert.deepEqual(ORDER_ITEM_COLUMNS.split(',').map(column => column.trim()).sort(), granted)
  assert.ok(!granted.includes('cost_price'))
})

test('costs are attached to raw order items and batched through the RPC', async () => {
  const calls = []
  const dbClient = {
    rpc: async (name, args) => {
      calls.push([name, args.p_order_ids.length])
      return { data: args.p_order_ids.map(orderId => ({ id: `item-${orderId}`, cost_price: orderId === 'o2' ? null : 100 })), error: null }
    },
  }
  const ids = ['o1', 'o2', ...Array.from({ length: 250 }, (_, index) => `x${index}`)]
  const costs = await loadOrderItemCosts([...ids, 'o1', ''], { dbClient })
  assert.deepEqual(calls, [['get_order_item_costs', 200], ['get_order_item_costs', 52]])
  assert.equal(costs.get('item-o1'), 100)
  assert.equal(costs.get('item-o2'), null)

  const orders = [{ id: 'o1', items: [{ id: 'item-o1', price: 500 }, { id: 'other', price: 1 }] }, { id: 'o3' }]
  const [withCost, untouched] = withOrderItemCosts(orders, costs)
  assert.equal(withCost.items[0].cost_price, 100)
  assert.equal('cost_price' in withCost.items[1], false)
  assert.equal(untouched, orders[1])
  assert.deepEqual(collectOrderIds([{ id: 'a', _orders: [{ id: 'b' }] }, { id: 'c' }]), ['a', 'b', 'c'])
})

test('before 291 the cost loader falls back to the readable column', async () => {
  const dbClient = {
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function get_order_item_costs' } }),
    from: table => ({ select: columns => ({ in: async (column, values) => {
      assert.equal(table, 'order_items')
      assert.equal(columns, 'id, cost_price')
      assert.deepEqual(values, ['o1'])
      return { data: [{ id: 'i1', cost_price: 7 }], error: null }
    } }) }),
  }
  assert.equal((await loadOrderItemCosts(['o1'], { dbClient })).get('i1'), 7)
  const denied = { rpc: async () => ({ data: null, error: { code: '42501', message: 'Cost access is required' } }) }
  await assert.rejects(loadOrderItemCosts(['o1'], { dbClient: denied }), error => error?.code === '42501')
})

test('291/292: staff read items without costs; only cost features get them via the RPC', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create function public.current_staff_can_access_any(keys text[]) returns boolean language sql stable
        as $$ select current_setting('test.cost_access', true) = 'yes' $$;
      grant execute on function public.current_staff_can_access_any(text[]) to authenticated;
      create table public.order_items (
        id uuid primary key, order_id text, menu_item_id text, name text, price integer, quantity numeric,
        notes text, status text, created_at timestamptz default now(), order_type text, item_type text,
        is_counter_item boolean, kitchen_round_id text, submitted_at timestamptz, base_price integer,
        unit_price integer, price_mode text, selected_options jsonb, cost_price integer, sale_unit text,
        category_id_snapshot text, category_snapshot_captured boolean, tech_card_component_snapshot jsonb
      );
      grant select, insert, update, delete on public.order_items to anon, authenticated;
      insert into public.order_items (id, order_id, name, price, quantity, cost_price)
        values ('00000000-0000-0000-0000-0000000000a1', 'o1', 'Kebab', 50000, 1, 21000);
    `)
    await db.exec(read('migrations/291_order_item_costs_rpc.sql'))
    await db.exec(read('migrations/292_hide_order_item_costs_from_staff.sql'))
    await db.exec(`select set_config('test.uid', '00000000-0000-0000-0000-000000000001', false); set role authenticated;`)
    const visible = await db.query(`select ${ORDER_ITEM_COLUMNS} from public.order_items`)
    assert.equal(visible.rows.length, 1)
    await assert.rejects(db.query('select cost_price from public.order_items'), /permission denied/)
    await assert.rejects(db.query('select * from public.order_items'), /permission denied/)
    await db.exec(`update public.order_items set status = 'served' where order_id = 'o1'`)
    await assert.rejects(db.query(`select * from public.get_order_item_costs(array['o1'])`), /Cost access is required/)
    await db.exec(`select set_config('test.cost_access', 'yes', false)`)
    const costs = await db.query(`select * from public.get_order_item_costs(array['o1'])`)
    assert.deepEqual(costs.rows, [{ id: '00000000-0000-0000-0000-0000000000a1', cost_price: 21000 }])
  } finally {
    await db.close()
  }
})
