import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const migration = sql('244_kpi_day_ends_0400.sql')

// From business date 2026-10-14 a KPI shift ends at 04:00 Tashkent, so bills
// paid after midnight count for the evening shift that served them.
test('KPI shifts end at 04:00 Tashkent from the 2026-10-14 cutover', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema vault; create schema extensions; create schema net; create schema cron;
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function current_staff_can_access(text) returns boolean language sql as $$select true$$;
    create function current_staff_can_write(text) returns boolean language sql as $$select true$$;
    create function current_staff_has_role(text[]) returns boolean language sql as $$select true$$;
    create function current_staff_role() returns text language sql as $$select 'owner'::text$$;
    create or replace function pg_catalog.now() returns timestamptz language sql stable as
      $$select current_setting('test.now')::timestamptz$$;
    create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql as
      $$select current_setting('test.now')::timestamptz$$;
    select set_config('test.now','2026-10-14T12:00:00Z',false);
    create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz);
    create table cron.job(jobid bigint,jobname text);
    create table cron_schedules(jobname text,schedule text);
    create function cron.schedule(text,text,text) returns bigint language sql as
      $$insert into cron_schedules values($1,$2) returning 1::bigint$$;
    create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
    create table profiles(id uuid primary key,full_name text);
    create table employee_salary_profiles(id uuid primary key,profile_id uuid,employee_name text,joined_at date,ended_at date,deleted_at timestamptz,payment_method text);
    create table employee_salary_absences(salary_profile_id uuid,absence_date date);
    create table employee_salary_bonuses(id uuid primary key,salary_profile_id uuid,bonus_date date,amount integer,payment_method text,note text,created_by uuid,created_by_name text);
    create table employee_salary_group_notification_deliveries(event_type text,event_id uuid,salary_profile_id uuid,status text,error_message text,attempted_at timestamptz,employee_status text,employee_error_message text,employee_attempted_at timestamptz,team_status text,team_error_message text,team_attempted_at timestamptz,unique(event_type,event_id));
    create table employee_salary_telegram_links(salary_profile_id uuid,chat_id text,notifications_enabled boolean);
    create table orders(id text primary key,order_number integer default 1,opened_by uuid,created_at timestamptz,paid_at timestamptz,payment_status text default 'unpaid',status text default 'completed',order_type text default 'dine_in',subtotal integer,service_fee integer default 0,total integer default 1,loyalty_discount_amount integer default 0);
  `)
  for (const file of ['129_daily_kpi_bonuses.sql','169_salary_bonus_accrual.sql','170_kpi_rule_group_notifications.sql','196_configurable_kpi_sales_basis.sql','197_employee_order_kpi_notifications.sql','198_employee_order_kpi_running_total.sql','202_current_day_order_deletion.sql','203_kpi_workday_start_time.sql','213_kpi_order_opening_cutoff.sql','226_kpi_closed_order_day.sql']) await db.exec(sql(file))
  // get_pending_daily_kpi_dates is replaced by 244; 147 needs tables this harness omits.
  await db.exec(migration)

  await db.query("insert into profiles values($1,'Waiter'),($2,'Hostess')",[id(101),id(102)])
  await db.query("insert into employee_salary_profiles values($1,$2,'Waiter','2026-01-01',null,null,'cash'),($3,$4,'Hostess','2026-01-01',null,null,'cash')",[id(1),id(101),id(2),id(102)])
  await db.query("insert into employee_salary_telegram_links values($1,'chat-1',true),($2,'chat-2',true)",[id(1),id(2)])
  await db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis,order_opener_profile_id,start_time) values
    ($1,'2026-09-17',1000,'employee_opened_orders',$2,'00:00'),($3,'2026-09-17',1000,'employee_opened_orders',$4,'14:10')`,[id(1),id(101),id(2),id(102)])

  const pay = async (orderId, opener, paidAtUtc, subtotal) => {
    await db.query("insert into orders(id,opened_by,created_at,subtotal) values($1,$2,$3,$4)",[orderId,opener,paidAtUtc,subtotal])
    await db.query("update orders set payment_status='paid', paid_at=$2 where id=$1",[orderId,paidAtUtc])
  }
  // Waiter (start 00:00). Tashkent = UTC+5.
  await pay('w-0030-14th', id(101), '2026-10-13T19:30:00Z', 1000) // 14th 00:30: cutover day keeps its midnight start
  await pay('w-2100-14th', id(101), '2026-10-14T16:00:00Z', 2000) // 14th 21:00
  await pay('w-0130-15th', id(101), '2026-10-14T20:30:00Z', 4000) // 15th 01:30 -> 14th shift
  await pay('w-0430-15th', id(101), '2026-10-14T23:30:00Z', 8000) // 15th 04:30 -> 15th shift
  await pay('w-0200-16th', id(101), '2026-10-15T21:00:00Z', 16000) // 16th 02:00 -> 15th shift
  // Hostess (start 14:10): after-midnight sales used to fall outside every day.
  await pay('h-0130-15th', id(102), '2026-10-14T20:30:00Z', 5000)
  await pay('h-1000-15th', id(102), '2026-10-15T05:00:00Z', 7000) // 15th 10:00, before her start

  await t.test('paid time maps to the KPI shift date', async () => {
    const dates = (await db.query(`select
      kpi_business_date('2026-10-13T20:30:00Z') before_cutover,
      kpi_business_date('2026-10-14T20:30:00Z') after_midnight,
      kpi_business_date('2026-10-14T22:59:59Z') last_second,
      kpi_business_date('2026-10-14T23:00:00Z') new_shift`)).rows[0]
    assert.deepEqual(Object.values(dates).map(d => d.toISOString().slice(0, 10)),
      ['2026-10-14', '2026-10-14', '2026-10-14', '2026-10-15'])
  })

  await t.test('sales bases include the 00:00-04:00 tail and skip nothing at the cutover', async () => {
    const base = async (date, opener, start) => Number((await db.query(
      "select employee_kpi_sales_base($1,'employee_opened_orders',$2,$3) v",[date,opener,start])).rows[0].v)
    assert.equal(await base('2026-10-14', id(101), '00:00'), 7000)
    assert.equal(await base('2026-10-15', id(101), '00:00'), 24000)
    assert.equal(await base('2026-10-14', id(102), '14:10'), 5000)
    assert.equal(await base('2026-10-15', id(102), '14:10'), 0)
    assert.equal(await base('2026-10-13', id(101), '00:00'), 0)
  })

  await t.test('per-order notice counts the 01:30 bill in the previous shift total', async () => {
    const notice = (await db.query("select snapshot from employee_order_kpi_notifications where order_id='w-0130-15th' and salary_profile_id=$1",[id(1)])).rows[0].snapshot
    assert.equal(notice.cut, 400)
    assert.equal(notice.daily_cut, 700)
  })

  await t.test('a shift finalizes only after 04:00 and the nightly cron runs at 04:05', async () => {
    await db.query("select set_config('test.now','2026-10-14T22:00:00Z',false)") // 15th 03:00
    await assert.rejects(db.query("select * from generate_daily_kpi_bonuses('2026-10-14')"), /completed KPI day/)
    const pending = (await db.query('select business_date from get_pending_daily_kpi_dates(31)')).rows.map(r => r.business_date.toISOString().slice(0, 10))
    assert.ok(!pending.includes('2026-10-14'))
    await db.query("select set_config('test.now','2026-10-14T23:05:00Z',false)") // 15th 04:05
    const rows = (await db.query("select * from generate_daily_kpi_bonuses('2026-10-14')")).rows
    assert.equal(rows.find(r => r.salary_profile_id === id(1)).bonus_amount, 700)
    assert.equal(rows.find(r => r.salary_profile_id === id(2)).bonus_amount, 500)
    assert.deepEqual((await db.query("select schedule from cron_schedules where jobname='zar-kebab-daily-reports'")).rows, [{ schedule: '5 23 * * *' }])
  })

  await t.test('a bill from a finalized shift cannot be deleted later the same calendar day', async () => {
    await db.query("select set_config('test.now','2026-10-15T00:00:00Z',false)") // 15th 05:00
    await assert.rejects(db.query("delete from orders where id='w-0130-15th'"), /Only orders from today/)
    await db.query("delete from orders where id='w-0430-15th'")
  })
})
