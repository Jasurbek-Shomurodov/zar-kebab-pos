import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildInvestorOrderChangeMessage } from '../api/telegram/_lib/investorIncomeMessages.js'

const migration = readFileSync(new URL('../migrations/175_order_change_investor_notifications.sql', import.meta.url), 'utf8')
const repairMigration = readFileSync(new URL('../migrations/176_repair_order_change_investor_trigger.sql', import.meta.url), 'utf8')
const endpoint = readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8')

test('order deletion and tender correction are queued transactionally for Investor', () => {
  assert.match(migration, /before delete on public\.orders/i)
  assert.match(migration, /after update of method on public\.order_payments/i)
  assert.match(migration, /unique \(event_type, order_id, transaction_id\)/i)
  assert.match(migration, /old_payment_methods[\s\S]*new_payment_methods/)
  assert.match(migration, /target_key\s+text not null default 'salary_events'/i)
  assert.match(migration, /on conflict \(event_type, order_id, transaction_id\) do update/i)
})

test('order payment notification trigger reads table-specific records safely', () => {
  for (const sql of [migration, repairMigration]) {
    const triggerFunction = sql.slice(
      sql.indexOf('create or replace function public.queue_order_change_investor_notification()'),
      sql.indexOf('revoke all on function public.queue_order_change_investor_notification()'),
    )
    assert.match(triggerFunction, /v_old jsonb := to_jsonb\(old\)/i)
    assert.match(triggerFunction, /v_new jsonb := to_jsonb\(new\)/i)
    assert.match(triggerFunction, /v_old->>'payment_method'/i)
    assert.match(triggerFunction, /v_old->>'method'/i)
    assert.doesNotMatch(triggerFunction, /old\.payment_method|new\.payment_method|old\.method|new\.method/i)
  }
})

test('successful order mutations request duplicate-safe Investor delivery', () => {
  assert.match(db, /case 'CHANGE_PAID_ORDER_PAYMENT_METHOD':[\s\S]*notifyTelegramInvestorOrderChange\(orderIds\)/)
  assert.match(db, /case 'CHANGE_PAID_ORDER_PAYMENT_METHODS':[\s\S]*data\?\.orderIds[\s\S]*case 'DELETE_ORDER'/)
  assert.match(db, /case 'DELETE_ORDER':[\s\S]*notifyTelegramInvestorOrderChange\(orderId\)/)
  assert.match(endpoint, /notificationType === 'order_change'/)
  assert.match(endpoint, /notifyInvestorOrderChanges\(supabase, user, orderIds\)/)
  assert.match(endpoint, /canRetryInvestorExpenseDelivery\(delivery\)/)
  assert.match(endpoint, /buildInvestorOrderChangeMessage\(claimed\.data, target\.language\)/)
})

test('Investor order-change message contains immutable audit details', () => {
  const message = buildInvestorOrderChangeMessage({
    event_type: 'payment_method_changed', order_id: 'abc', order_number: '1042',
    table_name: 'A-4', total: 125000, actor_name: 'Owner <One>',
    old_payment_methods: [{ method: 'cash', amount: 125000 }],
    new_payment_methods: [{ method: 'card', amount: 125000 }],
  }, 'en')
  assert.match(message, /Payment method changed/)
  assert.match(message, /#1042/)
  assert.match(message, /A-4/)
  assert.match(message, /Cash — 125\D000 UZS/)
  assert.match(message, /Card — 125\D000 UZS/)
  assert.match(message, /Owner &lt;One&gt;/)
})

test('deleted-order alert is compact and omits unavailable payment history', () => {
  const message = buildInvestorOrderChangeMessage({
    event_type: 'order_deleted', order_number: 'DL-0109', table_name: 'Delivery',
    total: 185000, actor_name: 'Javoxirbek Shomurodov', old_payment_methods: [],
  }, 'ru')
  assert.match(message, /🗑 <b>Удалён заказ #DL-0109<\/b> · Доставка · <b>185\D000 UZS<\/b>/)
  assert.match(message, /👤 Javoxirbek Shomurodov/)
  assert.doesNotMatch(message, /Было|—/)
  assert.equal(message.split('\n').length, 2)
})


test('deletion reason is included and HTML-escaped in Investor alerts', () => {
  for (const [lang, label] of [['ru', 'Причина'], ['uz', 'Sabab'], ['en', 'Reason']]) {
    const message = buildInvestorOrderChangeMessage({ event_type: 'order_deleted', deletion_reason: '<wrong> & duplicate' }, lang)
    assert.ok(message.includes(`${label}: &lt;wrong&gt; &amp; duplicate`))
  }
})

test('all deletion entry points share a required reason dialog and database enforcement', () => {
  const hook = readFileSync(new URL('../src/store/useOrderDeletion.jsx', import.meta.url), 'utf8')
  const sql = readFileSync(new URL('../migrations/184_order_deletion_reason.sql', import.meta.url), 'utf8')
  assert.match(hook, /action.type !== 'DELETE_ORDER'/)
  assert.match(hook, /role="dialog" aria-modal="true"/)
  assert.match(hook, /!reason.trim\(\) \|\| busy/)
  assert.match(hook, /reason: reason.trim\(\)/)
  assert.match(db, /p_reason: reason/)
  assert.match(sql, /drop function public.delete_order_owner\(text\)/)
  assert.match(sql, /nullif\(btrim\(p_reason\), ''\) is null/)
  assert.match(sql, /set_config\('app.order_deletion_reason', btrim\(p_reason\), true\)/)
  assert.match(sql, /alter column deletion_reason set default nullif\(current_setting/)
})

test('checkout never queues a payment-method change; corrections to paid orders still do (289)', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const original = read('migrations/175_order_change_investor_notifications.sql')
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table public.profiles (id uuid primary key, full_name text, email text);
      create table public.orders (id text primary key, order_number text, table_name text, total bigint,
        payment_method text, payment_status text not null default 'unpaid');
      create table public.order_payments (id uuid primary key default gen_random_uuid(), order_id text, method text,
        amount bigint, created_at timestamptz default now());
    `)
    await db.exec(original.slice(
      original.indexOf('create table if not exists public.order_change_investor_notification_deliveries'),
      original.indexOf('create or replace function public.queue_order_change_investor_notification()'),
    ).replace(/alter table[\s\S]*$/i, ''))
    await db.exec(`insert into order_change_investor_notification_deliveries
      (event_type, order_id, transaction_id, actor_name, old_payment_methods, new_payment_methods)
      values ('payment_method_changed', 'old-checkout', 1, 'X', '[{"method":null,"amount":5}]', '[{"method":"cash","amount":5}]'),
             ('payment_method_changed', 'real-fix', 2, 'X', '[{"method":"cash","amount":5}]', '[{"method":"card","amount":5}]')`)
    await db.exec(read('migrations/289_skip_checkout_as_payment_change.sql'))
    await db.exec(original.slice(original.indexOf('drop trigger if exists queue_order_deletion_investor_notification'), original.lastIndexOf('commit;')))
    const statuses = (await db.query("select order_id, status from order_change_investor_notification_deliveries order by order_id")).rows
    assert.deepEqual(statuses, [{ order_id: 'old-checkout', status: 'skipped' }, { order_id: 'real-fix', status: 'not_attempted' }])

    await db.exec("delete from order_change_investor_notification_deliveries")
    await db.exec("insert into orders (id, total) values ('o1', 100)")
    await db.exec("update orders set payment_status = 'paid', payment_method = 'cash' where id = 'o1'")
    assert.equal((await db.query('select count(*)::int as n from order_change_investor_notification_deliveries')).rows[0].n, 0)
    await db.exec("update orders set payment_method = 'card' where id = 'o1'")
    const rows = (await db.query('select event_type, old_payment_methods, new_payment_methods from order_change_investor_notification_deliveries')).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].event_type, 'payment_method_changed')
    assert.equal(rows[0].old_payment_methods[0].method, 'cash')
    assert.equal(rows[0].new_payment_methods[0].method, 'card')
  } finally {
    await db.close()
  }
})
