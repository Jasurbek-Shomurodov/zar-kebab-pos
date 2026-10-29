import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buildAttendanceCheckinMessage } from '../src/lib/attendance.js'

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

// Late first scan from 2026-10-30: under 1 h = 20 000, 1 h or more = 50 000.
test('a late QR check-in fines the employee once and queues Salary + Team delivery', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function public.current_staff_can_access(text) returns boolean language sql as 'select true';
    create table public.profiles(id uuid primary key);
    create table public.employee_salary_profiles(id uuid primary key, works_remotely boolean default false);
  `)
  await db.exec(sql('243_employee_attendance_checkins.sql'))
  await db.exec(`
    create table public.employee_salary_fines (
      id uuid primary key default gen_random_uuid(),
      salary_profile_id uuid not null,
      fine_date date not null,
      amount integer not null check (amount > 0),
      reason text not null,
      created_by uuid,
      created_by_name text not null default '',
      created_at timestamptz not null default now()
    );
    create table public.employee_salary_group_notification_deliveries (
      event_type text, event_id uuid, salary_profile_id uuid,
      status text, error_message text, attempted_at timestamptz,
      employee_status text, employee_error_message text, employee_attempted_at timestamptz,
      team_status text, team_error_message text, team_attempted_at timestamptz,
      unique (event_type, event_id)
    );
  `)
  await db.exec(sql('273_late_checkin_fines.sql'))
  await db.exec(`create trigger queue_fine after insert on public.employee_salary_fines
    for each row execute function public.queue_salary_event_telegram_delivery('fine')`)
  await db.query(`insert into employee_salary_profiles(id, works_remotely) values
    ($1,false),($2,false),($3,false),($4,false),($5,true),($6,false)`,
  [id(1), id(2), id(3), id(4), id(5), id(6)])

  const checkin = (profile, date, minutesLate, status, at = '2026-10-30T04:25:00Z') => db.query(
    `insert into employee_attendance_checkins
      (salary_profile_id, business_date, checked_in_at, scheduled_start_time, minutes_late, arrival_status)
     values ($1, $2, $3, '09:00', $4, $5) on conflict do nothing returning id`,
    [profile, date, at, minutesLate, status]
  )
  await checkin(id(1), '2026-10-30', 25, 'late')
  await checkin(id(2), '2026-10-30', 60, 'late', '2026-10-30T05:00:00Z')
  await checkin(id(3), '2026-10-30', -5, 'early')
  await checkin(id(4), '2026-10-29', 90, 'late')
  await checkin(id(5), '2026-10-30', 30, 'late')
  await checkin(id(6), '2026-10-30', 0, 'on_time')

  const fines = (await db.query(`select salary_profile_id, fine_date::text, amount, reason, created_by,
    created_by_name, source_type from employee_salary_fines order by amount`)).rows

  await t.test('only late on-site arrivals from the start date are fined, by the hour rule', () => {
    assert.deepEqual(fines, [
      {
        salary_profile_id: id(1), fine_date: '2026-10-30', amount: 20000,
        reason: 'Опоздание на 25 мин (начало смены 09:00, приход 09:25)',
        created_by: null, created_by_name: 'Система', source_type: 'late_checkin',
      },
      {
        salary_profile_id: id(2), fine_date: '2026-10-30', amount: 50000,
        reason: 'Опоздание на 1 ч (начало смены 09:00, приход 10:00)',
        created_by: null, created_by_name: 'Система', source_type: 'late_checkin',
      },
    ])
  })

  await t.test('a duplicate scan never fines twice', async () => {
    assert.equal((await checkin(id(1), '2026-10-30', 40, 'late')).rows.length, 0)
    const count = (await db.query('select count(*)::int n from employee_salary_fines')).rows[0].n
    assert.equal(count, 2)
  })

  await t.test('Salary group and Team are queued; the private notice is the check-in reply', async () => {
    const rows = (await db.query(`select status, employee_status, employee_error_message, team_status
      from employee_salary_group_notification_deliveries where event_type = 'fine'`)).rows
    assert.equal(rows.length, 2)
    for (const row of rows) {
      assert.deepEqual(row, {
        status: 'not_attempted',
        employee_status: 'skipped',
        employee_error_message: 'Late fine is included in the check-in reply',
        team_status: 'not_attempted',
      })
    }
  })

  await t.test('manual system fines without a source stay silent as before', async () => {
    await db.query(`insert into employee_salary_fines(salary_profile_id, fine_date, amount, reason)
      values ($1, '2026-10-30', 1000, 'x')`, [id(3)])
    const count = (await db.query('select count(*)::int n from employee_salary_group_notification_deliveries')).rows[0].n
    assert.equal(count, 2)
  })
})

test('the late check-in reply tells the employee about the fine', () => {
  const late = { checked_in_at: '2026-10-30T04:25:00Z', scheduled_start_time: '09:00:00', minutes_late: 25, arrival_status: 'late' }
  const ru = buildAttendanceCheckinMessage({ name: 'Ali', checkin: late, lang: 'ru', fine: { amount: 20000 } })
  assert.match(ru, /опоздание 25 мин/)
  assert.match(ru, /Штраф за опоздание: 20 000 UZS/)
  assert.match(buildAttendanceCheckinMessage({ name: 'Ali', checkin: late, lang: 'uz', fine: { amount: 50000 } }), /jarima: 50 000 UZS/)
  assert.doesNotMatch(buildAttendanceCheckinMessage({ name: 'Ali', checkin: late, alreadyCheckedIn: true, lang: 'ru', fine: { amount: 20000 } }), /Штраф/)
})

test('the webhook reads the database fine, replies, then announces it to Salary and Team', () => {
  const webhook = source('api/telegram/webhook.js')
  const handler = webhook.slice(webhook.indexOf('async function checkInEmployee'), webhook.indexOf('function languageKeyboard'))
  const load = handler.indexOf('loadLateCheckinFine(supabase, checkin.id)')
  const reply = handler.indexOf('buildAttendanceCheckinMessage(')
  const notify = handler.indexOf('notifyLateCheckinFine(supabase, fine.id)')
  assert.ok(load > 0 && load < reply && reply < notify)
  assert.match(handler, /alreadyCheckedIn \? null :/)

  const notifications = source('api/telegram/employee-notification.js')
  assert.match(notifications, /includeEmployee: !isAutomaticKpi && !isLateCheckinFine/)
  const daily = source('api/telegram/daily-salary.js')
  assert.match(daily, /retryLateCheckinFineDeliveries\(supabase, now\)/)
})
