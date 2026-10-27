import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { MISSING_CHECKIN_ABSENCE_START_DATE, recordMissingCheckinAbsences } from '../api/telegram/daily-salary.js'
import { getSalaryAccruedAmount } from '../src/lib/expenses.js'

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

// No QR check-in on a closed day = absence, so every salary reader drops that day's pay.
test('a closed day without a QR check-in becomes a silent absence', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create or replace function pg_catalog.now() returns timestamptz language sql stable as
      $$select current_setting('test.now')::timestamptz$$;
    select set_config('test.now','2026-10-27T22:59:00Z',false);
    create table employee_salary_profiles(id uuid primary key,joined_at date,ended_at date,deleted_at timestamptz,is_active boolean default true,works_remotely boolean default false);
    create table employee_salary_absences(id uuid primary key default gen_random_uuid(),salary_profile_id uuid not null,absence_date date not null,note text not null default '',created_by uuid,created_by_name text not null default '',created_at timestamptz default now());
    create unique index on employee_salary_absences(salary_profile_id,absence_date);
    create table employee_attendance_checkins(salary_profile_id uuid,business_date date);
  `)
  await db.exec(sql('269_missing_checkin_absences.sql'))
  await db.query(`insert into employee_salary_profiles(id,joined_at,ended_at,deleted_at,is_active,works_remotely) values
    ($1,'2026-09-01',null,null,true,false),   -- checked in
    ($2,'2026-09-01',null,null,true,false),   -- no check-in
    ($3,'2026-09-01',null,null,true,true),    -- remote
    ($4,'2026-09-01',null,null,true,false),   -- already absent
    ($5,'2026-10-28',null,null,true,false),   -- not hired yet
    ($6,'2026-09-01','2026-10-20',null,false,false), -- ended
    ($7,'2026-09-01',null,null,false,false)   -- inactive without end date`,
  [id(1), id(2), id(3), id(4), id(5), id(6), id(7)])
  await db.query("insert into employee_attendance_checkins values($1,'2026-10-27')", [id(1)])
  await db.query("insert into employee_salary_absences(salary_profile_id,absence_date,note,created_by) values($1,'2026-10-27','Sick',$2)", [id(4), id(99)])
  const run = async date => (await db.query('select * from record_missing_checkin_absences($1)', [date])).rows

  await t.test('waits until the shift closes at 04:00 the next day', async () => {
    assert.deepEqual(await run('2026-10-27'), [])
    await db.query("select set_config('test.now','2026-10-27T23:00:00Z',false)")
  })

  await t.test('records only on-site employees without a check-in or absence', async () => {
    const rows = await run('2026-10-27')
    assert.deepEqual(rows.map(row => row.salary_profile_id), [id(2)])
    const absence = (await db.query('select note, created_by from employee_salary_absences where salary_profile_id=$1', [id(2)])).rows[0]
    assert.deepEqual(absence, { note: 'No QR check-in', created_by: null })
    const sick = (await db.query('select note from employee_salary_absences where salary_profile_id=$1', [id(4)])).rows
    assert.deepEqual(sick, [{ note: 'Sick' }])
  })

  await t.test('is idempotent and ignores days before attendance started', async () => {
    assert.deepEqual(await run('2026-10-27'), [])
    assert.deepEqual(await run('2026-10-14'), [])
  })

  await t.test('only service_role can run it', async () => {
    const grants = (await db.query(`select grantee from information_schema.routine_privileges
      where routine_name='record_missing_checkin_absences' order by grantee`)).rows.map(row => row.grantee)
    assert.ok(grants.includes('service_role'))
    assert.ok(!grants.includes('anon') && !grants.includes('authenticated'))
  })
})

test('the cron records missing check-ins only from the rule start date', async () => {
  const calls = []
  const supabase = { rpc: async (name, args) => { calls.push([name, args]); return { data: [{ salary_profile_id: id(2) }], error: null } } }
  assert.deepEqual(await recordMissingCheckinAbsences(supabase, '2026-10-14'), [])
  assert.equal(calls.length, 0)
  assert.equal((await recordMissingCheckinAbsences(supabase, MISSING_CHECKIN_ABSENCE_START_DATE)).length, 1)
  assert.deepEqual(calls, [['record_missing_checkin_absences', { p_business_date: MISSING_CHECKIN_ABSENCE_START_DATE }]])

  const missing = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) }
  assert.deepEqual(await recordMissingCheckinAbsences(missing, '2026-10-28'), [])
  const failing = { rpc: async () => ({ data: null, error: { code: '57014', message: 'timeout' } }) }
  await assert.rejects(recordMissingCheckinAbsences(failing, '2026-10-28'), { code: '57014' })
})

test('a missing-check-in absence removes that day from the shared salary ledger', () => {
  const profile = { joined_at: '2026-10-01', rates: [{ effective_from: '2026-10-01', amount: 70000, rate_unit: 'day' }] }
  const before = getSalaryAccruedAmount(profile, '2026-10-26', '2026-10-27')
  const after = getSalaryAccruedAmount({ ...profile, absences: [{ absence_date: '2026-10-27', note: 'No QR check-in' }] }, '2026-10-26', '2026-10-27')
  assert.equal(before - after, 70000)
})
