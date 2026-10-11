import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { ordersReducer } from '../src/store/ordersReducer.js'
import { buildOpenOrdersReportSvg } from '../api/telegram/_lib/dailyOperationsReportImages.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

async function migratedDb(t, seed) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create table restaurant_tables(id text primary key, status text, updated_at timestamptz);
    create table orders(id text primary key, table_id text, status text, payment_status text,
      paid_at timestamptz, subtotal numeric, service_fee numeric, total numeric,
      created_at timestamptz default now(), updated_at timestamptz);
    create table order_items(id text primary key, order_id text references orders(id) on delete cascade,
      status text, quantity numeric default 1, price numeric default 1000);
    ${seed}
  `)
  await db.exec(read('migrations/224_terminal_cancelled_orders.sql'))
  return db
}

async function order(db, id) {
  return (await db.query('select status, payment_status, total from orders where id = $1', [id])).rows[0]
}

test('224 backfill closes stale empty and half-cancelled bills and frees their tables', async t => {
  const db = await migratedDb(t, `
    insert into restaurant_tables values ('t9', 'needs_bill', now() - interval '1 day'),
      ('t5', 'occupied', now() - interval '1 day');
    insert into orders(id, table_id, status, payment_status, total, created_at) values
      ('shell', 't9', 'needs_bill', 'unpaid', 0, now() - interval '1 day'),
      ('cancelled-items', 't9', 'needs_bill', 'unpaid', 9000, now() - interval '1 day'),
      ('revived', 't9', 'needs_bill', 'cancelled', 0, now() - interval '1 day'),
      ('half', 't9', 'cancelled', 'unpaid', 0, now() - interval '1 day'),
      ('fresh', 't5', 'sent_to_kitchen', 'unpaid', 0, now()),
      ('live', 't5', 'sent_to_kitchen', 'unpaid', 5000, now() - interval '1 day');
    insert into orders(id, table_id, status, payment_status, paid_at, total, created_at) values
      ('paid', 't9', 'completed', 'paid', now(), 7000, now() - interval '1 day');
    insert into order_items(id, order_id, status) values ('c1', 'cancelled-items', 'cancelled'), ('l1', 'live', 'new');
  `)
  for (const id of ['shell', 'cancelled-items', 'revived', 'half']) {
    assert.deepEqual({ ...(await order(db, id)) }, { status: 'cancelled', payment_status: 'cancelled', total: '0' }, id)
  }
  assert.equal((await order(db, 'fresh')).status, 'sent_to_kitchen')
  assert.equal((await order(db, 'live')).status, 'sent_to_kitchen')
  assert.deepEqual({ ...(await order(db, 'paid')) }, { status: 'completed', payment_status: 'paid', total: '7000' })
  const tables = (await db.query('select id, status from restaurant_tables order by id')).rows
  assert.deepEqual(tables.map(row => ({ ...row })), [{ id: 't5', status: 'occupied' }, { id: 't9', status: 'available' }])
})

test('table-wide bill and served writes cannot reopen cancelled shells', async t => {
  const db = await migratedDb(t, `
    insert into orders(id, table_id, status, payment_status, created_at) values
      ('live', 't9', 'delivered', 'unpaid', now());
    insert into order_items(id, order_id, status) values ('l1', 'live', 'served');
  `)
  // Table payment (135) cancels empty shells with status only.
  await db.exec(`insert into orders(id, table_id, status, payment_status) values ('shell', 't9', 'needs_bill', 'unpaid');
    update orders set status = 'cancelled' where id = 'shell';`)
  assert.equal((await order(db, 'shell')).payment_status, 'cancelled')
  // Old clients filtered only on payment_status <> 'paid'.
  await db.exec(`update orders set status = 'needs_bill' where table_id = 't9' and payment_status <> 'paid'`)
  assert.equal((await order(db, 'shell')).status, 'cancelled')
  assert.equal((await order(db, 'live')).status, 'needs_bill')
})

test('removing or cancelling the last live item closes the bill atomically', async t => {
  const db = await migratedDb(t, `
    insert into orders(id, table_id, status, payment_status, total, created_at) values
      ('a', 't1', 'sent_to_kitchen', 'unpaid', 2000, now()),
      ('b', 't2', 'sent_to_kitchen', 'unpaid', 1000, now());
    insert into order_items(id, order_id, status) values ('a1', 'a', 'new'), ('a2', 'a', 'new'), ('b1', 'b', 'new');
  `)
  await db.exec(`delete from order_items where id = 'a1'`)
  assert.equal((await order(db, 'a')).status, 'sent_to_kitchen')
  await db.exec(`delete from order_items where id = 'a2'`)
  assert.deepEqual({ ...(await order(db, 'a')) }, { status: 'cancelled', payment_status: 'cancelled', total: '0' })
  await db.exec(`update order_items set status = 'cancelled' where id = 'b1'`)
  assert.equal((await order(db, 'b')).payment_status, 'cancelled')
  // Deleting an order cascades its items without errors.
  await db.exec(`delete from orders where id = 'b'`)
})

test('clients filter cancelled bills out of table-wide status writes', () => {
  const db = read('src/lib/db.js')
  assert.match(db, /const CLOSED_ORDER_STATUS_FILTER = '\(cancelled,paid,completed\)'/)
  for (const action of ['CONFIRM_ORDER_DELIVERED', 'MARK_TABLE_NEEDS_BILL']) {
    const body = db.slice(db.indexOf(`case '${action}':`), db.indexOf('break', db.indexOf(`case '${action}':`)))
    assert.match(body, /\.neq\('payment_status', 'cancelled'\)\s*\.not\('status', 'in', CLOSED_ORDER_STATUS_FILTER\)/, action)
  }
  const needsBill = db.slice(db.indexOf("case 'MARK_TABLE_NEEDS_BILL':"), db.indexOf("case 'RECALL_TABLE_FROM_CASHIER':"))
  assert.match(needsBill, /\.is\('payment_status', null\)\s*\.not\('status', 'in', CLOSED_ORDER_STATUS_FILTER\)/)

  const state = { tables: [{ id: 't9', status: 'occupied' }], orders: [
    { id: 'shell', table_id: 't9', status: 'cancelled', payment_status: 'unpaid', items: [] },
    { id: 'void', table_id: 't9', status: 'needs_bill', payment_status: 'cancelled', items: [] },
    { id: 'live', table_id: 't9', status: 'delivered', payment_status: 'unpaid', items: [{ status: 'served' }] },
  ] }
  const billed = ordersReducer(state, { type: 'MARK_TABLE_NEEDS_BILL', payload: 't9' })
  assert.deepEqual(billed.orders.map(o => o.status), ['cancelled', 'needs_bill', 'needs_bill'])
  const served = ordersReducer(state, { type: 'CONFIRM_ORDER_DELIVERED', payload: 't9' })
  assert.deepEqual(served.orders.map(o => o.status), ['cancelled', 'needs_bill', 'delivered'])
})

test('open-orders report shows the creation date so stale bills stand out', () => {
  const svg = buildOpenOrdersReportSvg([{ id: 'x', table_name: 'Стол 9', created_at: '2026-09-11T09:00:00Z',
    status: 'needs_bill', payment_status: 'unpaid', items: [{ name: 'Чай', quantity: 1, price: 5000 }] }])
  assert.match(svg, /11\.09\.2026 14:00 · Нужен счёт/)
})

test('224 triggers compose with the paid-item guard and atomic bill edits', async t => {
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${uuid(99)}'::uuid $$;
    create function current_staff_can_write(text) returns boolean language sql as $$ select true $$;
    create table restaurant_tables(id text primary key, status text, updated_at timestamptz);
    create table orders(id text primary key, table_id text, payment_status text, status text,
      paid_at timestamptz, order_type text default 'dine_in', subtotal integer default 0,
      service_rate_pct numeric default 15, service_fee integer default 0, total integer default 0,
      created_at timestamptz default now(), updated_at timestamptz);
    create table order_items(id uuid primary key, order_id text references orders(id) on delete cascade,
      sale_unit text default 'piece', price integer, unit_price integer, quantity numeric, status text default 'new',
      is_counter_item boolean default false, item_type text default 'menu');
    insert into restaurant_tables values ('t4', 'occupied', now());
  `)
  const settlement = read('migrations/083_atomic_order_payment_settlement.sql')
  await db.exec(settlement.slice(0, settlement.indexOf('create or replace function public.settle_orders_payment')))
  await db.exec(read('migrations/212_atomic_bill_item_edits.sql'))
  await db.exec(read('migrations/220_cancel_emptied_bill_orders.sql'))
  await db.exec(read('migrations/224_terminal_cancelled_orders.sql'))
  await db.exec(`insert into orders(id, table_id, payment_status, status) values ('bill', 't4', 'unpaid', 'sent_to_kitchen');
    insert into order_items(id, order_id, price, quantity) values ('${uuid(1)}', 'bill', 36000, 1);`)
  await db.query('select update_bill_item_quantity($1::jsonb)', [JSON.stringify({
    request_id: uuid(201), order_id: 'bill', table_id: 't4', order_item_id: uuid(1), source_item_ids: [], quantity: 0,
  })])
  assert.deepEqual({ ...(await order(db, 'bill')) }, { status: 'cancelled', payment_status: 'cancelled', total: 0 })
  assert.equal((await db.query("select status from restaurant_tables where id = 't4'")).rows[0].status, 'available')

  // Paid history stays locked and is never touched by the cancellation guard.
  await db.exec(`insert into orders(id, table_id, payment_status, status) values ('paid', 't4', 'unpaid', 'sent_to_kitchen');
    insert into order_items(id, order_id, price, quantity) values ('${uuid(2)}', 'paid', 1000, 1);
    update orders set payment_status = 'paid', status = 'completed', paid_at = now() where id = 'paid';`)
  await assert.rejects(db.exec(`delete from order_items where id = '${uuid(2)}'`), /locked/)
  assert.equal((await order(db, 'paid')).payment_status, 'paid')
})
