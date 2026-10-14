import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'
import { buildEmployeeLifecycleInvestorMessage } from '../api/telegram/_lib/investorIncomeMessages.js'

const migration = fs.readFileSync(
  new URL('../migrations/178_employee_lifecycle_investor_notifications.sql', import.meta.url),
  'utf8',
)
const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
const client = fs.readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
const salaries = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
const employees = fs.readFileSync(new URL('../src/pages/Employees.jsx', import.meta.url), 'utf8')

test('employee lifecycle messages identify the event, employee, date, and actor', () => {
  const base = {
    employee_name: '<New Employee>',
    effective_date: '2026-09-04',
    actor_name: 'Owner & Manager',
  }
  const created = buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'created' }, 'en')
  const activated = buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'activated' }, 'en')
  const deactivated = buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'deactivated' }, 'en')

  assert.match(created, /New employee added/)
  assert.match(activated, /Employee activated/)
  assert.match(deactivated, /Employee deactivated/)
  assert.match(created, /&lt;New Employee&gt;/)
  assert.match(created, /Owner &amp; Manager/)
  assert.match(created, /4 September 2026/)

  assert.match(buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'created' }, 'ru'), /Добавлен новый сотрудник/)
  assert.match(buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'activated' }, 'ru'), /Сотрудник активирован/)
  assert.match(buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'deactivated' }, 'ru'), /Сотрудник деактивирован/)
})

test('employee lifecycle transitions queue immutable Investor deliveries at the database boundary', () => {
  assert.match(migration, /event_type in \('created', 'activated', 'deactivated'\)/i)
  assert.match(migration, /after insert or update of is_active on public\.employee_salary_profiles/i)
  assert.match(migration, /old\.is_active is distinct from new\.is_active/i)
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/i)
  assert.match(migration, /status in \('not_attempted', 'pending', 'sent', 'failed', 'skipped'\)/i)
  assert.match(migration, /revoke all on table public\.employee_lifecycle_investor_notification_deliveries from public, anon, authenticated/i)
})

test('both employee management screens request retry-safe lifecycle delivery', () => {
  assert.match(client, /type: 'employee_lifecycle'/)
  assert.match(endpoint, /notifyEmployeeLifecycle/)
  assert.match(endpoint, /buildEmployeeLifecycleInvestorMessage/)
  assert.match(endpoint, /const delivery = await withStartingSalary\(supabase, claimed\.data\)/)
  assert.match(endpoint, /buildEmployeeLifecycleInvestorMessage\(delivery, 'ru'\)/)
  assert.match(endpoint, /loadSalaryGroupTarget/)
  assert.match(endpoint, /\.eq\('actor_id', user\.id\)/)
  assert.match(fs.readFileSync(new URL('../src/components/NewEmployeeDialog.jsx', import.meta.url), 'utf8'), /notifyTelegramEmployeeLifecycle\(salaryProfileId, 'created'\)/)
  assert.match(salaries, /nextActive \? 'activated' : 'deactivated'/)
  assert.match(employees, /nextActive \? 'activated' : 'deactivated'/)
})

test('new employee messages show the starting base salary as a whole amount', () => {
  const created = {
    event_type: 'created',
    employee_name: 'Озода',
    effective_date: '2026-09-26',
    actor_name: 'Диля Камолова',
    salary_amount: 3500000,
    salary_unit: 'monthly',
  }
  const lines = buildEmployeeLifecycleInvestorMessage(created, 'ru').split('\n')
  assert.equal(lines[0], '👤 <b>Добавлен новый сотрудник</b>')
  assert.equal(lines[2], 'Дата: 26 сентября 2026')
  assert.equal(lines[3].replace(/\s/g, ' '), 'Базовая зарплата: <b>3 500 000 UZS</b> (месячная)')
  assert.equal(lines[4], 'Изменил(а): Диля Камолова')

  assert.match(buildEmployeeLifecycleInvestorMessage({ ...created, salary_unit: 'daily', salary_amount: 150000.4 }, 'ru'), /150\s000 UZS<\/b> \(дневная\)/u)
  assert.match(buildEmployeeLifecycleInvestorMessage(created, 'uz'), /Asosiy maosh: .*\(oylik\)/)
  assert.match(buildEmployeeLifecycleInvestorMessage(created, 'en'), /Base salary: .*\(monthly\)/)
  // Events without a saved salary and status changes keep the short message.
  assert.doesNotMatch(buildEmployeeLifecycleInvestorMessage({ ...created, salary_amount: null }, 'ru'), /Базовая зарплата/)
  assert.doesNotMatch(buildEmployeeLifecycleInvestorMessage({ ...created, event_type: 'deactivated' }, 'ru'), /Базовая зарплата/)
  assert.match(endpoint, /\.from\('employee_salary_rates'\)[\s\S]*?\.order\('effective_from', \{ ascending: true \}\)/)
})

test('the first salary rate is snapshotted once onto the unsent created event', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const profileId = '00000000-0000-0000-0000-000000000001'
  const actorId = '00000000-0000-0000-0000-000000000101'
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${actorId}'::uuid $$;
    create table profiles(id uuid primary key, full_name text, email text);
    create table employee_salary_profiles(
      id uuid primary key, employee_name text, joined_at date, ended_at date,
      deleted_at timestamptz, is_active boolean not null default true
    );
    create table employee_salary_rates(
      id uuid primary key default gen_random_uuid(), salary_profile_id uuid,
      effective_from date, amount integer, rate_unit text, created_at timestamptz default now()
    );
    insert into profiles values('${actorId}', 'Диля Камолова', 'owner@example.test');
  `)
  await db.exec(migration)
  const snapshotMigration = fs.readFileSync(
    new URL('../migrations/216_employee_created_salary_snapshot.sql', import.meta.url),
    'utf8',
  )
  await db.exec(snapshotMigration)
  await db.exec(snapshotMigration)
  const events = async () => (await db.query(
    'select event_type, salary_amount, salary_unit from employee_lifecycle_investor_notification_deliveries order by created_at, event_type'
  )).rows

  await db.query(`insert into employee_salary_profiles(id, employee_name, joined_at) values($1,'Озода','2026-09-26')`, [profileId])
  assert.deepEqual(await events(), [{ event_type: 'created', salary_amount: null, salary_unit: null }])
  await db.query(`insert into employee_salary_rates(salary_profile_id, effective_from, amount, rate_unit) values($1,'2026-09-26',3500000,'monthly')`, [profileId])
  assert.deepEqual(await events(), [{ event_type: 'created', salary_amount: 3500000, salary_unit: 'monthly' }])

  // A later raise, or a rate saved after delivery started, never rewrites the notice.
  await db.query(`insert into employee_salary_rates(salary_profile_id, effective_from, amount, rate_unit) values($1,'2026-10-01',4000000,'monthly')`, [profileId])
  assert.deepEqual(await events(), [{ event_type: 'created', salary_amount: 3500000, salary_unit: 'monthly' }])
  await db.exec(`update employee_lifecycle_investor_notification_deliveries set salary_amount = null, salary_unit = null, status = 'sent'`)
  await db.query(`insert into employee_salary_rates(salary_profile_id, effective_from, amount, rate_unit) values($1,'2026-11-01',5000000,'monthly')`, [profileId])
  assert.deepEqual(await events(), [{ event_type: 'created', salary_amount: null, salary_unit: null }])

  // Status changes are separate events and carry no salary.
  await db.exec(`update employee_salary_profiles set is_active = false`)
  assert.deepEqual((await events()).find(event => event.event_type === 'deactivated'), {
    event_type: 'deactivated', salary_amount: null, salary_unit: null,
  })
})
