import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'
import { buildEmployeeProfileChangeInvestorMessage } from '../api/telegram/_lib/investorIncomeMessages.js'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const migration = read('migrations/250_employee_profile_change_investor_notifications.sql')
const remoteMigration = read('migrations/253_employee_remote_change_investor_notifications.sql')

test('profile change messages list only the changed fields as before → after', () => {
  const message = buildEmployeeProfileChangeInvestorMessage({
    name_before: 'Шахноза',
    name_after: 'Шахноза <Хисобчи>',
    job_function_before: 'cashier',
    job_function_after: 'accountant',
    work_start_before: null,
    work_start_after: '09:00:00',
    actor_name: 'Owner & Co',
  }, 'ru')
  assert.match(message, /Данные сотрудника изменены/)
  assert.match(message, /Имя: Шахноза → <b>Шахноза &lt;Хисобчи&gt;<\/b>/)
  assert.match(message, /Должность: Кассир → <b>Бухгалтер<\/b>/)
  assert.match(message, /Начало работы: не задано → <b>09:00<\/b>/)
  assert.match(message, /Изменил\(а\): Owner &amp; Co/)

  const roleOnly = buildEmployeeProfileChangeInvestorMessage({
    name_before: 'Asil', name_after: 'Asil', job_function_before: 'waiter', job_function_after: 'runner',
    work_start_before: '10:00:00', work_start_after: '10:00:00',
  }, 'ru')
  assert.doesNotMatch(roleOnly, /Имя:|Начало работы:/)
  assert.match(roleOnly, /Должность: Официант → <b>Раннер<\/b>/)
})

test('the trigger records one snapshot per real staff change and ignores service writes', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const profileId = '00000000-0000-0000-0000-000000000001'
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table app_actor(id uuid);
    insert into app_actor values('00000000-0000-0000-0000-000000000101');
    create function auth.uid() returns uuid language sql stable as $$ select id from app_actor $$;
    create table profiles(id uuid primary key, full_name text, email text);
    create table employee_salary_profiles(
      id uuid primary key, employee_name text, job_function text, work_start_time time,
      is_active boolean not null default true, deleted_at timestamptz
    );
    insert into profiles values('00000000-0000-0000-0000-000000000101', 'Диля', 'owner@example.test');
  `)
  await db.exec(migration)
  await db.query(`insert into employee_salary_profiles(id, employee_name, job_function) values($1, 'Шахноза', 'cashier')`, [profileId])
  const events = async () => (await db.query(
    `select name_before, name_after, job_function_before, job_function_after, work_start_after::text, actor_name, status
       from employee_profile_change_investor_notification_deliveries order by created_at`
  )).rows

  // A save that rewrites identical values, or touches other columns, is not a change.
  await db.query(`update employee_salary_profiles set employee_name = 'Шахноза', job_function = 'cashier', work_start_time = null where id = $1`, [profileId])
  await db.query(`update employee_salary_profiles set is_active = false where id = $1`, [profileId])
  assert.deepEqual(await events(), [])

  // One combined save is one event with before/after snapshots.
  await db.query(`update employee_salary_profiles set employee_name = 'Шахноза Хисобчи', job_function = 'accountant', work_start_time = '09:00' where id = $1`, [profileId])
  assert.deepEqual(await events(), [{
    name_before: 'Шахноза', name_after: 'Шахноза Хисобчи', job_function_before: 'cashier', job_function_after: 'accountant',
    work_start_after: '09:00:00', actor_name: 'Диля', status: 'not_attempted',
  }])

  // Service-role and migration writes have no staff identity and stay silent.
  await db.exec('delete from app_actor')
  await db.query(`update employee_salary_profiles set job_function = 'manager' where id = $1`, [profileId])
  assert.equal((await events()).length, 1)
})

test('switching Remote lists the work mode change, and older events without the flags stay silent', () => {
  const unchanged = { name_before: 'Шахноза', name_after: 'Шахноза', job_function_before: 'accountant', job_function_after: 'accountant' }
  const toRemote = buildEmployeeProfileChangeInvestorMessage({ ...unchanged, works_remotely_before: false, works_remotely_after: true }, 'ru')
  assert.match(toRemote, /Формат работы: На месте → <b>Удалённо<\/b>/)
  assert.doesNotMatch(toRemote, /Имя:|Должность:|Начало работы:/)

  const toOnSite = buildEmployeeProfileChangeInvestorMessage({ ...unchanged, works_remotely_before: true, works_remotely_after: false }, 'en')
  assert.match(toOnSite, /Work mode: Remote → <b>On site<\/b>/)

  assert.doesNotMatch(buildEmployeeProfileChangeInvestorMessage({ ...unchanged, works_remotely_before: true, works_remotely_after: true }, 'ru'), /Формат работы/)
  assert.doesNotMatch(buildEmployeeProfileChangeInvestorMessage(unchanged, 'ru'), /Формат работы/)
})

test('after migration 253 a Remote-only save records one Investor event with the flag snapshot', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const profileId = '00000000-0000-0000-0000-000000000002'
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table app_actor(id uuid);
    insert into app_actor values('00000000-0000-0000-0000-000000000101');
    create function auth.uid() returns uuid language sql stable as $$ select id from app_actor $$;
    create table profiles(id uuid primary key, full_name text, email text);
    create table employee_salary_profiles(
      id uuid primary key, employee_name text, job_function text, work_start_time time,
      works_remotely boolean not null default false,
      is_active boolean not null default true, deleted_at timestamptz
    );
    insert into profiles values('00000000-0000-0000-0000-000000000101', 'Диля', 'owner@example.test');
  `)
  await db.exec(migration)
  await db.exec(remoteMigration)
  await db.query(`insert into employee_salary_profiles(id, employee_name, job_function) values($1, 'Шахноза Хисобчи', 'accountant')`, [profileId])
  const events = async () => (await db.query(
    `select name_before, name_after, works_remotely_before, works_remotely_after, actor_name, status
       from employee_profile_change_investor_notification_deliveries order by created_at`
  )).rows

  // The dialog rewrites every field on save; unchanged Remote is still no event.
  await db.query(`update employee_salary_profiles set employee_name = 'Шахноза Хисобчи', job_function = 'accountant', work_start_time = null, works_remotely = false where id = $1`, [profileId])
  assert.deepEqual(await events(), [])

  await db.query(`update employee_salary_profiles set employee_name = 'Шахноза Хисобчи', job_function = 'accountant', work_start_time = null, works_remotely = true where id = $1`, [profileId])
  const [event] = await events()
  assert.deepEqual(await events(), [{
    name_before: 'Шахноза Хисобчи', name_after: 'Шахноза Хисобчи', works_remotely_before: false, works_remotely_after: true,
    actor_name: 'Диля', status: 'not_attempted',
  }])
  assert.match(buildEmployeeProfileChangeInvestorMessage(event, 'ru'), /Формат работы: На месте → <b>Удалённо<\/b>/)

  // Service writes stay silent for Remote as well.
  await db.exec('delete from app_actor')
  await db.query(`update employee_salary_profiles set works_remotely = false where id = $1`, [profileId])
  assert.equal((await events()).length, 1)
})

test('the endpoint, client and Employees dialog deliver profile changes to the Investor group', () => {
  const endpoint = read('api/telegram/employee-notification.js')
  const client = read('src/lib/telegramNotifications.js')
  const employees = read('src/pages/Employees.jsx')
  const handler = endpoint.slice(endpoint.indexOf('async function notifyEmployeeProfileChange'), endpoint.indexOf('async function notifyInvestorIncome'))

  assert.match(migration, /revoke all on table public\.employee_profile_change_investor_notification_deliveries from public, anon, authenticated/i)
  assert.match(migration, /after update of employee_name, job_function, work_start_time on public\.employee_salary_profiles/i)
  assert.match(remoteMigration, /after update of employee_name, job_function, work_start_time, works_remotely on public\.employee_salary_profiles/i)
  assert.match(remoteMigration, /revoke all on function public\.queue_employee_profile_change_investor_notification\(\)\s+from public, anon, authenticated/i)
  assert.match(handler, /\.eq\('actor_id', user\.id\)/)
  assert.match(handler, /if \(!canRetryInvestorExpenseDelivery\(existing\)\)/)
  assert.match(handler, /await loadSalaryGroupTarget\(supabase\)/)
  assert.match(handler, /buildEmployeeProfileChangeInvestorMessage\(claimed\.data, 'ru'\)/)
  assert.match(endpoint, /notificationType === 'employee_profile_change'[\s\S]*?notifyEmployeeProfileChange\(supabase, user, salaryProfileId\)/)
  assert.match(client, /type: 'employee_profile_change', salaryProfileId/)
  assert.match(employees, /void notifyTelegramEmployeeProfileChange\(employee\.id\)/)
  assert.equal(employees.split('profileTelegramFailed:').length - 1, 3)
})
