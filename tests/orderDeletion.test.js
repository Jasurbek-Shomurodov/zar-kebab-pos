import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { canDeleteOrderToday, canChangeCompletedOrderPaymentMethod } from '../src/lib/permissions.js'

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const now = new Date('2026-09-18T19:00:00Z') // September 19 in Tashkent

test('delete permission requires today for every role, including owners, using the payment date', () => {
  const today = { id: 'today', paid_at: '2026-09-18T19:00:00Z', created_at: '2026-09-17T00:00:00Z' }
  const old = { ...today, paid_at: '2026-09-18T18:59:59Z' }
  for (const role of ['owner', 'admin', 'viewer', 'guest']) {
    const profile = { role, feature_access: ['reports', 'cashier', 'delete_paid_orders'] }
    assert.equal(canDeleteOrderToday(profile, old, now), false, role)
    assert.equal(canDeleteOrderToday(profile, today, now), ['owner', 'admin'].includes(role), role)
    assert.equal(canDeleteOrderToday(profile, {...today,paid_at:'2026-09-20T00:00:00Z'}, now), false)
    assert.equal(canDeleteOrderToday(profile, {id:'missing'}, now), false)
  }
  assert.equal(canDeleteOrderToday('owner', {id:'unpaid',created_at:'2026-09-19T00:00:00+05:00'}, now), true)
  // Owners may also delete older unpaid open bills (232); other roles and paid history stay locked.
  const oldUnpaid = {id:'old-unpaid',created_at:'2026-09-18T18:59:59Z',payment_status:'unpaid',status:'needs_bill'}
  assert.equal(canDeleteOrderToday('owner', oldUnpaid, now), true)
  assert.equal(canDeleteOrderToday({role:'admin',feature_access:['reports','cashier','delete_paid_orders']}, oldUnpaid, now), false)
  assert.equal(canDeleteOrderToday('owner', {...oldUnpaid,status:'cancelled'}, now), false)
  assert.equal(canDeleteOrderToday('owner', {...oldUnpaid,payment_status:'paid'}, now), false)
  assert.equal(canDeleteOrderToday('owner', {...oldUnpaid,created_at:'2026-09-20T00:00:00Z'}, now), false)
  assert.equal(canDeleteOrderToday('owner', {id:'invalid',paid_at:'bad-date',created_at:now}, now), false)
  assert.equal(canDeleteOrderToday({role:'admin',feature_access:['reports']}, today, now), false)
  assert.equal(canChangeCompletedOrderPaymentMethod('owner'), true)
  assert.equal(canDeleteOrderToday('owner', today, new Date('2026-09-19T19:00:00Z')), false)
})

test('Reports and both cashier entry points hide historical delete controls and recheck click time', () => {
  const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  for (const page of ['Reports', 'CashierBill', 'CashierTables']) {
    const source = read(`pages/${page}.jsx`)
    assert.match(source, /const deletionDate = useOrderDeletionDate\(\)/)
    assert.match(source, /canDeleteOrderToday\(profile \|\| \{ role: state.user\?\.role \}, candidate, deletionDate\)/)
    const clickTarget = page === 'CashierBill' ? 'candidate' : 'order'
    assert.ok(source.includes(`if (!canDeleteOrderToday(profile || { role: state.user?.role }, ${clickTarget})`))
  }
  assert.match(read('pages/Reports.jsx'), /canDeleteOrder=\{canDeleteOrder\(selectedOrder\)\}/)
  assert.match(read('pages/CashierTables.jsx'), /canDelete=\{canDeleteOrder\(order\)\}/)
  assert.match(read('pages/CashierBill.jsx'), /\{canDeleteOrder\(order\) &&/)
  const clock = read('store/useOrderDeletionDate.js')
  assert.match(clock, /setInterval\(refresh, 1000\)/)
  assert.match(clock, /addEventListener\('visibilitychange', refresh\)/)
  assert.match(clock, /clearInterval\(timer\)/)
})

test('deletion and KPI finalization serialize on the same date lock before reading financial state', () => {
  const deletion = sql('202_current_day_order_deletion.sql')
  const finalizer = sql('196_configurable_kpi_sales_basis.sql')
  assert.match(deletion, /pg_advisory_xact_lock\(hashtext\('daily-kpi:' \|\| v_business_date::text\)\)/)
  assert.match(finalizer, /pg_advisory_xact_lock\(hashtext\('daily-kpi:' \|\| p_business_date::text\)\)/)
  assert.ok(deletion.indexOf('pg_advisory_xact_lock') < deletion.indexOf('clock_timestamp()'))
  assert.ok(finalizer.indexOf('pg_advisory_xact_lock') < finalizer.indexOf('from public.orders paid_order'))
})

test('production deletion RPC and direct SQL enforce the date boundary and queue KPI cleanup atomically', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema vault; create schema extensions; create schema net; create schema cron;
    create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz);
    create table cron.job(jobid bigint,jobname text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create function cron.unschedule(bigint) returns boolean language sql as $$ select true $$;
    create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 7::bigint$$;
    create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql as
      $$ select coalesce(nullif(current_setting('test.now',true),''),'2026-09-18T19:00:00Z')::timestamptz $$;
    create function current_staff_can_access(text) returns boolean language sql as
      $$ select coalesce(current_setting('test.staff_role',true),'') in ('owner','admin') $$;
    create table employee_salary_profiles(id uuid,profile_id uuid,joined_at date,ended_at date,deleted_at timestamptz);
    create table employee_kpi_rules(id uuid,salary_profile_id uuid,effective_from date,created_at timestamptz,order_opener_profile_id uuid,rate_bps integer,is_enabled boolean,sales_basis text);
    create table employee_salary_telegram_links(salary_profile_id uuid,chat_id text,notifications_enabled boolean);
    create table employee_salary_absences(salary_profile_id uuid,absence_date date);
    create table employee_daily_kpi_runs(business_date date primary key);
    create table orders(id text primary key,table_id uuid,order_number integer,opened_by uuid,paid_at timestamptz,created_at timestamptz,payment_status text,status text,order_type text,subtotal integer,service_fee integer,total integer);
    create table order_items(id text,order_id text references orders on delete cascade);
    create table order_item_cancellations(order_id text);
    create table loyalty_transactions(id uuid,order_id text,loyalty_card_id uuid,balance_before integer,balance_after integer,amount integer,type text,created_at timestamptz);
    create table loyalty_cards(id uuid,balance integer,total_earned integer,total_redeemed integer,updated_at timestamptz);
    create table restaurant_tables(id uuid,status text,reserved_for_name text,reserved_for_phone text,reserved_at timestamptz,reserved_until timestamptz,reservation_notes text,updated_at timestamptz);
    create table order_change_investor_notification_deliveries(id uuid);
    create function delete_order_owner(text) returns jsonb language sql as $$select '{}'::jsonb$$;
  `)
  await db.exec(sql('184_order_deletion_reason.sql'))
  await db.exec(sql('197_employee_order_kpi_notifications.sql'))
  await db.exec(sql('198_employee_order_kpi_running_total.sql'))
  const employee = '00000000-0000-0000-0000-000000000001'
  const opener = '00000000-0000-0000-0000-000000000002'
  await db.exec(`
    insert into employee_salary_profiles values('${employee}','${opener}','2026-01-01',null,null);
    insert into employee_kpi_rules values(gen_random_uuid(),'${employee}','2026-09-16',now(),null,300,true,'employee_opened_orders');
    insert into employee_salary_telegram_links values('${employee}','private',true);
    insert into employee_order_kpi_notifications(order_id,salary_profile_id,chat_id,snapshot)
      values('orphan','${employee}','private','{}'),('orphan-sent','${employee}','private','{}');
    update employee_order_kpi_notifications set status='sent',telegram_message_id=123 where order_id='orphan-sent';
  `)
  await db.exec(sql('202_current_day_order_deletion.sql'))
  let notices = (await db.query('select * from employee_order_kpi_notifications order by order_id')).rows
  assert.equal(notices[0].status,'cancelled')
  assert.equal(notices[1].status,'sent')
  assert.ok(notices.every(n=>n.delete_requested))
  assert.equal(notices[1].telegram_message_id,123)
  // Verify cron wakes for cleanup alone, without any queued sends.
  await db.exec("insert into vault.decrypted_secrets values('zar_kebab_daily_report_cron_secret','test',now())")
  assert.equal((await db.query('select invoke_employee_order_kpi_notifications() as request')).rows[0].request,7)
  const order = async (id, paidAt, createdAt = paidAt) => {
    await db.query(`insert into orders(id,order_number,opened_by,paid_at,created_at,payment_status,status,order_type,subtotal,service_fee,total)
      values($1,42,$2,$3,$4,'unpaid','completed','dine_in',100000,15000,115000)`,[id,opener,paidAt,createdAt])
    await db.query("update orders set payment_status='paid' where id=$1",[id])
  }
  await order('old','2026-09-18T18:59:59Z')
  await db.exec("insert into order_items values('old-item','old'); insert into order_item_cancellations values('old')")
  for (const role of ['owner','admin','viewer','guest']) {
    await db.query("select set_config('test.staff_role',$1,false)",[role])
    // Exercise the production SECURITY DEFINER RPC as an authenticated caller.
    await db.exec('set role authenticated')
    await assert.rejects(db.query("select delete_order_owner('old','test reason')"), role==='owner'||role==='admin' ? /Only orders from today/ : /access is required/)
    await db.exec('reset role')
    assert.equal((await db.query("select * from order_item_cancellations where order_id='old'")).rows.length,1)
  }
  await assert.rejects(db.exec("delete from orders where id='old'"),/Only orders from today/)
  // Service-role direct access also cannot bypass the table trigger.
  await db.exec('grant select,delete on orders to service_role; set role service_role')
  await assert.rejects(db.exec("delete from orders where id='old'"),/Only orders from today/)
  await db.exec('reset role')
  await order('future','2026-09-19T19:00:00Z')
  await assert.rejects(db.exec("delete from orders where id='future'"),/Only orders from today/)
  await db.exec("insert into orders(id) values('undated')")
  await assert.rejects(db.exec("delete from orders where id='undated'"),/Only orders from today/)
  await db.query("select set_config('test.staff_role','owner',false)")
  await order('today','2026-09-18T19:00:00Z','2026-09-17T10:00:00Z')
  await db.exec("insert into order_items values('today-item','today')")
  await assert.rejects(db.query("select delete_order_owner('today','')"),/deletion reason/)
  await db.query("select delete_order_owner('today','duplicate order')")
  assert.equal((await db.query("select * from orders where id='today'")).rows.length,0)
  assert.equal((await db.query("select * from order_items where order_id='today'")).rows.length,0)
  assert.equal((await db.query("select status from employee_order_kpi_notifications where order_id='today'")).rows[0].status,'cancelled')
  // A later paid order's running KPI excludes the deleted sale.
  await order('next','2026-09-18T19:01:00Z')
  assert.equal((await db.query("select snapshot from employee_order_kpi_notifications where order_id='next'")).rows[0].snapshot.daily_cut,3450)
  await db.exec("update employee_order_kpi_notifications set status='processing' where order_id='next'")
  await db.exec("delete from orders where id='next'")
  notices = (await db.query("select * from employee_order_kpi_notifications where order_id='next'")).rows
  assert.equal(notices[0].status,'processing')
  assert.equal(notices[0].delete_requested,true)
  // A send's receipt arriving after deletion remains eligible for cleanup.
  await db.exec("update employee_order_kpi_notifications set status='sent',telegram_message_id=456 where order_id='next'")
  assert.equal((await db.query("select telegram_message_id from employee_order_kpi_notifications where delete_requested and deleted_at is null and order_id='next'")).rows[0].telegram_message_id,456)
  await order('midnight','2026-09-18T19:00:00Z')
  await db.exec("insert into employee_daily_kpi_runs values('2026-09-19')")
  await assert.rejects(db.exec("delete from orders where id='midnight'"),/Only orders from today/)
  await db.exec("delete from employee_daily_kpi_runs")
  await db.exec("begin; select set_config('test.now','2026-09-19T19:00:00Z',true)")
  await assert.rejects(db.exec("delete from orders where id='midnight'"),/Only orders from today/)
  await db.exec('rollback')
})


test('cashier empty-state deletion refreshes the candidate and retains normal permission/reason flow', () => {
  const source = readFileSync(new URL('../src/pages/CashierBill.jsx', import.meta.url), 'utf8')
  const handler = source.slice(source.indexOf('  async function handleDeleteOrder'), source.indexOf('  function addQuickItem'))
  assert.match(handler, /const freshOrders = await refreshCurrentBill\(\)/)
  assert.match(handler, /getEmptyCashierOrders\(freshOrders, \{ tableId, orderId \}\)\.some\(row => row.id === candidate.id\)/)
  assert.match(handler, /type: 'DELETE_ORDER',[\s\S]*orderId: candidate.id/)
  assert.match(handler, /if \(result\?\.cancelled\) return/)
  const emptyState = source.slice(source.indexOf('  // ── Empty state'), source.indexOf('  const totalItems'))
  assert.match(emptyState, /!isRefreshingBill && !paymentRefreshMessage && emptyOrders.map/)
  assert.match(emptyState, /canDeleteOrder\(candidate\)/)
  assert.match(emptyState, /onClick=\{\(\) => handleDeleteOrder\(candidate\)\}/)
  assert.match(emptyState, /formatWriteError\(deleteOrderError, lang, 'DELETE_ORDER'\)/)
})

test('owners can delete older unpaid open orders, but paid and cancelled history stays locked', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql as
      $$ select '2026-10-12T07:00:00Z'::timestamptz $$;
    create function current_staff_role() returns text language sql as
      $$ select coalesce(current_setting('test.staff_role',true),'') $$;
    create table employee_daily_kpi_runs(business_date date primary key);
    insert into employee_daily_kpi_runs values('2026-10-04');
    create schema vault; create schema net;
    create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz);
    create table employee_order_kpi_notifications(order_id text, telegram_message_id bigint,
      status text constraint employee_order_kpi_notifications_status_check check (status in ('queued','processing','sent')));
    create table orders(id text primary key, paid_at timestamptz, created_at timestamptz, payment_status text, status text);
    insert into orders values
      ('stale-open', null, '2026-10-04T10:49:00Z', 'unpaid', 'needs_bill'),
      ('stale-paid', '2026-10-04T11:00:00Z', '2026-10-04T10:00:00Z', 'paid', 'completed'),
      ('stale-cancelled', null, '2026-10-04T10:00:00Z', 'cancelled', 'cancelled'),
      ('future-open', null, '2026-10-13T10:00:00Z', 'unpaid', 'needs_bill');
  `)
  await db.exec(sql('202_current_day_order_deletion.sql'))
  await db.exec(sql('232_owner_old_unpaid_order_deletion.sql'))
  const asRole = async (role, id) => {
    await db.query("select set_config('test.staff_role',$1,false)", [role])
    return db.query('delete from orders where id=$1', [id])
  }
  for (const role of ['admin', 'viewer', '']) {
    await assert.rejects(asRole(role, 'stale-open'), /Only orders from today/, role)
  }
  for (const id of ['stale-paid', 'stale-cancelled', 'future-open']) {
    await assert.rejects(asRole('owner', id), /Only orders from today/, id)
  }
  await asRole('owner', 'stale-open')
  assert.deepEqual((await db.query('select id from orders order by id')).rows.map(row => row.id),
    ['future-open', 'stale-cancelled', 'stale-paid'])
})
