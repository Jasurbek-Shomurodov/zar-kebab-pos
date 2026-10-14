import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buildEmployeeOrderKpiMessage, deliverEmployeeOrderKpiNotification, retractDeletedEmployeeOrderKpiNotifications, drainEmployeeOrderKpiNotifications } from '../api/telegram/_lib/employeeOrderKpiNotifications.js'

test('compact private message escapes order numbers and distinguishes an estimate', () => {
  const text = buildEmployeeOrderKpiMessage({order_number:'<12>',total:345000,rate_bps:300,cut:10350,daily_cut:25220})
  assert.equal(text, '✅ Заказ №&lt;12&gt; оплачен — 345 000 сум\n🎉 Спасибо за вашу работу!\n💰 Бонус с заказа: ≈ 10 350 сум\n📈 Ваш KPI за смену: ≈ 25 220 сум')
})

test('production payment trigger snapshots only new paid orders and eligible linked openers', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema vault; create schema extensions; create schema net; create schema cron;
    create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz);
    create table cron.job(jobid bigint,jobname text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create function cron.unschedule(bigint) returns boolean language sql as $$ select true $$;
    create table employee_salary_profiles(id uuid,profile_id uuid,joined_at date,ended_at date,deleted_at timestamptz);
    create table employee_kpi_rules(id uuid,salary_profile_id uuid,effective_from date,created_at timestamptz,order_opener_profile_id uuid,rate_bps integer,is_enabled boolean,sales_basis text default 'employee_opened_orders');
    create table employee_salary_telegram_links(salary_profile_id uuid,chat_id text,notifications_enabled boolean);
    create table employee_salary_absences(salary_profile_id uuid,absence_date date);
    create table orders(id text,order_number integer,opened_by uuid,paid_at timestamptz,payment_status text,status text,order_type text,subtotal integer,service_fee integer,total integer);
    insert into employee_salary_profiles values('00000000-0000-0000-0000-000000000001',null,'2026-01-01',null,null);
    insert into employee_kpi_rules values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','2026-09-16',now(),'00000000-0000-0000-0000-000000000003',300,true,'employee_opened_orders');
    insert into employee_salary_telegram_links values('00000000-0000-0000-0000-000000000001','private-chat',true);
    insert into orders values('historical',1,'00000000-0000-0000-0000-000000000003','2026-09-16T12:00:00Z','paid','completed','dine_in',300000,45000,340000);
  `)
  await db.exec(readFileSync(new URL('../migrations/197_employee_order_kpi_notifications.sql',import.meta.url),'utf8'))
  await db.exec(readFileSync(new URL('../migrations/198_employee_order_kpi_running_total.sql',import.meta.url),'utf8'))
  assert.equal((await db.query('select * from employee_order_kpi_notifications')).rows.length,0)
  await db.exec(`insert into orders select 'new',2,opened_by,paid_at,'unpaid',status,order_type,subtotal,service_fee,total from orders where id='historical'; update orders set payment_status='paid' where id='new';`)
  let rows=(await db.query('select * from employee_order_kpi_notifications')).rows
  assert.equal(rows.length,1); assert.equal(rows[0].snapshot.cut,10350); assert.equal(rows[0].snapshot.total,340000)
  assert.equal(rows[0].chat_id,'private-chat')
  assert.equal(rows[0].snapshot.daily_cut,20700)
  await db.exec(`update orders set payment_status='paid'; update orders set payment_status='unpaid' where id='new'; update orders set payment_status='paid' where id='new';`)
  assert.equal((await db.query('select * from employee_order_kpi_notifications')).rows.length,1)
  await db.exec(`
    insert into orders values
      ('other',5,'00000000-0000-0000-0000-000000000099','2026-09-16T10:00:00Z','paid','completed','dine_in',200000,0,200000),
      ('yesterday',6,'00000000-0000-0000-0000-000000000003','2026-09-15T18:59:59Z','paid','completed','dine_in',900000,0,900000),
      ('cancelled',7,'00000000-0000-0000-0000-000000000003','2026-09-16T10:00:00Z','paid','cancelled','dine_in',900000,0,900000),
      ('tiny',8,'00000000-0000-0000-0000-000000000003','2026-09-16T12:01:00Z','unpaid','completed','dine_in',17,0,17);
    update orders set payment_status='paid' where id='tiny';
  `)
  const snapshot = async key => (await db.query('select snapshot from employee_order_kpi_notifications where order_id=$1',[key])).rows[0].snapshot
  assert.equal((await snapshot('tiny')).cut,1)
  assert.equal((await snapshot('tiny')).daily_cut,20701) // excludes other opener, yesterday and cancelled
  await db.exec(`
    update employee_kpi_rules set sales_basis='restaurant';
    insert into orders select 'all-sales',9,opened_by,paid_at,'unpaid',status,order_type,subtotal,service_fee,total from orders where id='tiny';
    update orders set payment_status='paid' where id='all-sales';
  `)
  assert.equal((await snapshot('all-sales')).daily_cut,26701) // rounds total once, not each order
  await db.exec(`
    insert into orders select 'takeaway',10,opened_by,paid_at,'unpaid',status,'takeaway',subtotal,service_fee,total from orders where id='historical';
    update orders set payment_status='paid' where id='takeaway';
  `)
  assert.equal((await snapshot('takeaway')).cut,0)
  assert.equal((await snapshot('takeaway')).daily_cut,26701)
  await db.exec(`insert into employee_salary_absences values('00000000-0000-0000-0000-000000000001','2026-09-16'); insert into orders select 'absent',3,opened_by,paid_at,'unpaid',status,order_type,subtotal,service_fee,total from orders where id='historical'; update orders set payment_status='paid' where id='absent';`)
  assert.equal((await db.query("select snapshot from employee_order_kpi_notifications where order_id='absent'")).rows[0].snapshot.cut,0)
  assert.equal((await db.query("select snapshot from employee_order_kpi_notifications where order_id='absent'")).rows[0].snapshot.daily_cut,0)
  await db.exec(`update employee_salary_telegram_links set notifications_enabled=false; insert into orders select 'optout',4,opened_by,paid_at,'unpaid',status,order_type,subtotal,service_fee,total from orders where id='historical'; update orders set payment_status='paid' where id='optout';`)
  assert.equal((await db.query('select * from employee_order_kpi_notifications')).rows.length,5)
})

function ledger(initial = {}) {
  let row={id:'one',status:'queued',delete_requested:false,deleted_at:null,chat_id:'private',snapshot:{order_number:1,total:100,rate_bps:300,cut:3},...initial}
  return {get row(){return row},from(){let patch,filters=[]; const matching=()=>filters.every(f=>f(row)); const q={
    update(p){patch=p;return q},eq(k,v){filters.push(r=>r[k]===v);return q},
    is(k,v){filters.push(r=>(r[k]??null)===v);return q},not(k){filters.push(r=>r[k]!=null);return q},
    select(){return q},order(){return q},limit(){return q},
    async maybeSingle(){if(!matching())return {data:null};row={...row,...patch};return {data:{...row}}},
    then(resolve,reject){return q.maybeSingle().then(result=>({...result,data:result.data?[result.data]:[]})).then(resolve,reject)}
  };return q}}
}
test('concurrent send claims once; uncertain sends stay held',async()=>{
  const db=ledger();let sends=0; const row={...db.row}
  const send=async()=>{sends++;return {result:{message_id:123}}}
  await Promise.all([deliverEmployeeOrderKpiNotification(db,row,send),deliverEmployeeOrderKpiNotification(db,row,send)])
  assert.equal(sends,1);assert.equal(db.row.status,'sent')
  const failed=ledger(); await deliverEmployeeOrderKpiNotification(failed,{...failed.row},async()=>{throw new Error('timeout')})
  assert.equal(failed.row.status,'processing')
  assert.equal((await deliverEmployeeOrderKpiNotification(failed,{...failed.row},send)).status,'duplicate')
  assert.equal(sends,1)
})


test('a stale queued notice cannot be claimed after order deletion', async () => {
  const db = ledger()
  const stale = { ...db.row }
  Object.assign(db.row, { delete_requested: true, status: 'cancelled' })
  let sends = 0
  const result = await deliverEmployeeOrderKpiNotification(db, stale, async () => { sends++ })
  assert.equal(result.status, 'duplicate')
  assert.equal(sends, 0)
  assert.equal((await drainEmployeeOrderKpiNotifications(db)).sent, 0)
})

test('deletion during Telegram send retracts the late receipt once without resending', async () => {
  const db = ledger()
  let sends = 0, deletes = 0
  const result = await deliverEmployeeOrderKpiNotification(db, { ...db.row }, async () => {
    sends++
    db.row.delete_requested = true
    return { result: { message_id: 123 } }
  }, async (chat, message) => {
    assert.equal(chat, 'private'); assert.equal(message, 123); deletes++
  })
  assert.equal(result.status, 'sent')
  assert.ok(db.row.deleted_at)
  await retractDeletedEmployeeOrderKpiNotifications(db, undefined, async () => { deletes++ })
  assert.equal(sends, 1)
  assert.equal(deletes, 1)
})

test('cleanup retries Telegram errors and accepts already missing messages', async () => {
  const db = ledger({status:'sent',delete_requested:true,telegram_message_id:123})
  const failure = await retractDeletedEmployeeOrderKpiNotifications(db, undefined, async () => { throw new Error('not enough rights') })
  assert.equal(failure.ok, false)
  assert.equal(db.row.deleted_at, null)
  assert.match(db.row.cleanup_error, /rights/)
  const success = await retractDeletedEmployeeOrderKpiNotifications(db, undefined, async () => { throw new Error('Bad Request: message to delete not found') })
  assert.equal(success.ok, true)
  assert.ok(db.row.deleted_at)
  assert.equal(db.row.cleanup_error, '')
})

test('unknown sends remain held on deletion; cleanup does not invent message identities', async () => {
  const db = ledger()
  await deliverEmployeeOrderKpiNotification(db, {...db.row}, async () => {
    db.row.delete_requested = true
    throw new Error('timeout')
  })
  let deletes = 0
  await retractDeletedEmployeeOrderKpiNotifications(db, undefined, async () => { deletes++ })
  assert.equal(db.row.status, 'processing')
  assert.equal(db.row.telegram_message_id, undefined)
  assert.equal(deletes, 0)
})

test('failed immediate cleanup preserves the sent receipt and retries only deletion', async () => {
  const db = ledger()
  let sends = 0
  const result = await deliverEmployeeOrderKpiNotification(db, {...db.row}, async () => {
    sends++
    db.row.delete_requested = true
    return {result:{message_id:123}}
  }, async () => { throw new Error('Telegram temporarily unavailable') })
  assert.deepEqual(result, {status:'sent',cleanupPending:true})
  assert.equal(db.row.telegram_message_id,123)
  assert.equal(db.row.status,'sent')
  assert.equal(db.row.deleted_at,null)
  await deliverEmployeeOrderKpiNotification(db,{...db.row},async () => { sends++ })
  await retractDeletedEmployeeOrderKpiNotifications(db,undefined,async () => {})
  assert.ok(db.row.deleted_at)
  assert.equal(sends,1)
})
