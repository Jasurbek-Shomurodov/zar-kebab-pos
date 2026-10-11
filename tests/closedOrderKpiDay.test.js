import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`

// A closed (paid) order belongs to the Tashkent day it was paid. Opening time
// and same-day absence must not remove it from the opener's KPI.
test('KPI follows the paid day even when the order was opened the day before and the opener is absent', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema vault; create schema extensions; create schema net; create schema cron;
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function current_staff_can_access(text) returns boolean language sql as $$select true$$;
    create function current_staff_can_write(text) returns boolean language sql as $$select true$$;
    create function current_staff_has_role(text[]) returns boolean language sql as $$select true$$;
    create or replace function pg_catalog.now() returns timestamptz language sql stable as
      $$select current_setting('test.now')::timestamptz$$;
    create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql as
      $$select current_setting('test.now')::timestamptz$$;
    select set_config('test.now','2026-10-12T12:00:00Z',false);
    create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz);
    create table cron.job(jobid bigint,jobname text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
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

  await db.query('insert into profiles values($1,$2)',[id(101),'Opener'])
  await db.query("insert into employee_salary_profiles values($1,$2,'Employee','2026-01-01',null,null,'cash')",[id(1),id(101)])
  await db.query("insert into employee_salary_telegram_links values($1,'chat-1',true)",[id(1)])
  await db.query("insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis,order_opener_profile_id,start_time) values($1,'2026-09-17',300,'employee_opened_orders',$2,'00:00')",[id(1),id(101)])
  // Business day 2026-10-11 (Tashkent): this employee is recorded absent.
  await db.query("insert into employee_salary_absences values($1,'2026-10-11')",[id(1)])
  // Opened 2026-10-10 22:40 Tashkent, paid 2026-10-11 00:23 Tashkent.
  await db.query(`insert into orders(id,opened_by,created_at,subtotal,service_fee,total)
    values('closed-after-midnight',$1,'2026-10-10T17:40:00Z',500000,76150,576150)`,[id(101)])
  // The trigger fires on the unpaid -> paid transition, as in production.
  await db.query("update orders set payment_status='paid', paid_at='2026-10-10T19:23:00Z' where id='closed-after-midnight'")

  const notice = (await db.query("select snapshot from employee_order_kpi_notifications where order_id='closed-after-midnight'")).rows[0]?.snapshot
  await t.test('queued notice credits the order at the rule rate on its paid day', () => {
    assert.ok(notice, 'a notification row must be queued')
    assert.equal(notice.rate_bps, 300)
    assert.equal(notice.cut, 17285) // (500000 + 76150) * 3%, rounded
    assert.equal(notice.daily_cut, 17285)
  })

  await t.test('daily finalization pays the absent-marked opener for the paid day', async () => {
    const rows = (await db.query("select * from generate_daily_kpi_bonuses('2026-10-11')")).rows
    const result = rows.find(r => r.salary_profile_id === id(1))
    assert.ok(result, 'an employee KPI result must exist for the day')
    assert.notEqual(result.status, 'skipped_absent')
    assert.equal(result.bonus_amount, 17285)
  })
})
