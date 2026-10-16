import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buildEmployeeOrderKpiMessage } from '../api/telegram/_lib/employeeOrderKpiNotifications.js'

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`

// From KPI date 2026-10-16 the window starts at the attendance QR check-in;
// no check-in means no KPI, and remote employees keep the whole shift.
test('KPI starts at the QR check-in from 2026-10-16', async t => {
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
    select set_config('test.now','2026-10-15T07:00:00Z',false);
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
  for (const file of ['129_daily_kpi_bonuses.sql','169_salary_bonus_accrual.sql','170_kpi_rule_group_notifications.sql','196_configurable_kpi_sales_basis.sql','197_employee_order_kpi_notifications.sql','198_employee_order_kpi_running_total.sql','202_current_day_order_deletion.sql','203_kpi_workday_start_time.sql','213_kpi_order_opening_cutoff.sql','226_kpi_closed_order_day.sql','244_kpi_day_ends_0400.sql','243_employee_attendance_checkins.sql','252_employee_works_remotely.sql','254_kpi_starts_at_checkin.sql']) await db.exec(sql(file))

  await db.query("insert into profiles values($1,'Waiter'),($2,'Hostess'),($3,'Remote')",[id(101),id(102),id(103)])
  await db.query(`insert into employee_salary_profiles(id,profile_id,employee_name,joined_at,payment_method,works_remotely) values
    ($1,$2,'Waiter','2026-01-01','cash',false),($3,$4,'Hostess','2026-01-01','cash',false),($5,$6,'Remote','2026-01-01','cash',true)`,
    [id(1),id(101),id(2),id(102),id(3),id(103)])
  await db.query("insert into employee_salary_telegram_links values($1,'chat-1',true),($2,'chat-2',true)",[id(1),id(2)])
  await db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis,order_opener_profile_id,start_time) values
    ($1,'2026-09-17',1000,'employee_opened_orders',$2,'13:00'),($3,'2026-09-17',1000,'employee_opened_orders',$4,'14:10'),
    ($5,'2026-09-17',1000,'restaurant',null,'13:00')`,[id(1),id(101),id(2),id(102),id(3)])

  const pay = async (orderId, opener, paidAtUtc, subtotal) => {
    await db.query("insert into orders(id,opened_by,created_at,subtotal) values($1,$2,$3,$4)",[orderId,opener,paidAtUtc,subtotal])
    await db.query("update orders set payment_status='paid', paid_at=$2 where id=$1",[orderId,paidAtUtc])
  }
  const notice = async (orderId, profile) => (await db.query(
    'select snapshot from employee_order_kpi_notifications where order_id=$1 and salary_profile_id=$2',[orderId,profile])).rows[0].snapshot

  // 15 October (before the cutover) still uses the rule's 13:00 start. Tashkent = UTC+5.
  await pay('w-1200-15th', id(101), '2026-10-15T07:00:00Z', 500)
  await pay('w-1400-15th', id(101), '2026-10-15T09:00:00Z', 800)
  // 16 October: the waiter checks in at 10:15:30, the hostess never does.
  await db.query("select set_config('test.now','2026-10-16T05:15:30Z',false)")
  await db.query("insert into employee_attendance_checkins(salary_profile_id,business_date,checked_in_at,arrival_status) values($1,'2026-10-16','2026-10-16T05:15:30Z','no_schedule')",[id(1)])
  await pay('w-0900-16th', id(101), '2026-10-16T04:00:00Z', 1000) // before check-in
  await pay('w-1200-16th', id(101), '2026-10-16T07:00:00Z', 2000)
  await pay('w-0130-17th', id(101), '2026-10-16T20:30:00Z', 4000) // after midnight: still the 16th shift
  await pay('h-1500-16th', id(102), '2026-10-16T10:00:00Z', 3000)

  await t.test('the window starts at the check-in minute, never before 04:00', async () => {
    const start = async (profile, date, rule) => (await db.query('select employee_kpi_start_time($1,$2,$3) v',[profile,date,rule])).rows[0].v
    assert.equal(await start(id(1), '2026-10-16', '13:00'), '10:15:00')
    assert.equal(await start(id(2), '2026-10-16', '14:10'), null)
    assert.equal(await start(id(3), '2026-10-16', '13:00'), '04:00:00')
    assert.equal(await start(id(2), '2026-10-15', '14:10'), '14:10:00')
  })

  await t.test('per-order notices pay nothing before check-in or without one', async () => {
    assert.equal((await notice('w-0900-16th', id(1))).cut, 0)
    const counted = await notice('w-1200-16th', id(1))
    assert.equal(counted.cut, 200)
    assert.equal(counted.daily_cut, 200)
    assert.match(buildEmployeeOrderKpiMessage(counted), /с 10:15, Ташкент/)
    const absent = await notice('h-1500-16th', id(2))
    assert.equal(absent.cut, 0)
    assert.equal(absent.daily_cut, 0)
    assert.equal(absent.checked_in, false)
    assert.match(buildEmployeeOrderKpiMessage(absent), /не отметились по QR/)
    assert.equal((await notice('w-1200-15th', id(1))).checked_in, true)
  })

  await t.test('finalization uses check-in windows and skips employees who did not check in', async () => {
    await db.query("select set_config('test.now','2026-10-16T23:05:00Z',false)") // 17th 04:05
    const day15 = new Map((await db.query("select * from generate_daily_kpi_bonuses('2026-10-15')")).rows.map(r => [r.salary_profile_id, r]))
    assert.equal(day15.get(id(1)).bonus_amount, 80)
    assert.equal(day15.get(id(3)).bonus_amount, 80) // pre-cutover: rule start 13:00
    const day16 = new Map((await db.query("select * from generate_daily_kpi_bonuses('2026-10-16')")).rows.map(r => [r.salary_profile_id, r]))
    assert.equal(day16.get(id(1)).bonus_amount, 600)
    assert.equal(day16.get(id(1)).start_time_snapshot, '10:15:00')
    assert.equal(day16.get(id(2)).status, 'skipped_absent')
    assert.equal(day16.get(id(2)).bonus_amount, 0)
    assert.equal(day16.get(id(3)).bonus_amount, 1000)
    assert.equal(day16.get(id(3)).start_time_snapshot, '04:00:00')
    const meta = (await db.query("select source_metadata from employee_salary_bonuses where id=$1",[day16.get(id(1)).bonus_id])).rows[0].source_metadata
    assert.equal(meta.start_source, 'attendance_checkin')
  })
})
