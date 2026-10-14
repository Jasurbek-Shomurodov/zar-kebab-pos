import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildEmployeeTelegramStartUrl,
  canCreateEmployee,
  employeeCreationErrorCode,
  isEmployeeTelegramLinked,
  normalizeEmployeeTelegramRegistration,
} from '../src/lib/employeeTelegramRegistration.js'
import { linkEmployeeRegistration } from '../api/telegram/_lib/employeeRegistration.js'
import { parseEmployeeStartToken } from '../api/telegram/_lib/salaryMessages.js'

const migration = readFileSync(new URL('../migrations/248_employee_creation_requires_telegram.sql', import.meta.url), 'utf8')
const salariesPage = readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
const webhook = readFileSync(new URL('../api/telegram/webhook.js', import.meta.url), 'utf8')

const TOKEN = '0f8fad5b-d9cb-469f-a165-70867728950e'
const FORM = { employee_name: 'Ali', job_function: 'cook', salary_amount: 100000 }

test('start link reuses the employee_ deep-link format the webhook parses', () => {
  const url = buildEmployeeTelegramStartUrl('@ZarKebabBot', TOKEN)
  assert.equal(url, `https://t.me/ZarKebabBot?start=employee_${TOKEN}`)
  assert.equal(parseEmployeeStartToken(`/start employee_${TOKEN}`), TOKEN)
  assert.equal(buildEmployeeTelegramStartUrl('', TOKEN), '')
  assert.equal(buildEmployeeTelegramStartUrl('bot', ''), '')
})

test('an employee can be created only once the Telegram registration is linked', () => {
  assert.equal(canCreateEmployee(FORM, null), false)
  assert.equal(canCreateEmployee(FORM, { token: TOKEN, status: 'pending' }), false)
  assert.equal(canCreateEmployee(FORM, { token: TOKEN, status: 'expired' }), false)
  assert.equal(canCreateEmployee(FORM, { token: TOKEN, status: 'consumed' }), false)
  assert.equal(canCreateEmployee(FORM, { token: '', status: 'linked' }), false)
  assert.equal(canCreateEmployee(FORM, { token: TOKEN, status: 'linked' }), true)
  assert.equal(canCreateEmployee({ ...FORM, employee_name: ' ' }, { token: TOKEN, status: 'linked' }), false)
  assert.equal(canCreateEmployee({ ...FORM, salary_amount: 0 }, { token: TOKEN, status: 'linked' }), false)
  assert.equal(isEmployeeTelegramLinked({ token: TOKEN, status: 'linked' }), true)
})

test('registration status and creation errors normalize to stable codes', () => {
  assert.deepEqual(normalizeEmployeeTelegramRegistration({ status: 'linked', username: 'ali' }), { status: 'linked', username: 'ali' })
  assert.deepEqual(normalizeEmployeeTelegramRegistration(null), { status: 'expired', username: '' })
  assert.deepEqual(normalizeEmployeeTelegramRegistration({ status: 'weird' }), { status: 'expired', username: '' })
  assert.equal(employeeCreationErrorCode({ message: 'employee_telegram_not_linked' }), 'employee_telegram_not_linked')
  assert.equal(employeeCreationErrorCode({ message: 'x', details: 'employee_telegram_already_linked' }), 'employee_telegram_already_linked')
  assert.equal(employeeCreationErrorCode({ message: 'network timeout' }), '')
})

function fakeSupabase(tables) {
  const calls = []
  return {
    calls,
    from(table) {
      const query = { table, filters: [], patch: null }
      const builder = {
        select() { return builder },
        update(patch) { query.patch = patch; return builder },
        eq(column, value) { query.filters.push(row => row[column] === value); return builder },
        is(column, value) { query.filters.push(row => (row[column] ?? null) === value); return builder },
        gt(column, value) { query.filters.push(row => row[column] > value); return builder },
        async maybeSingle() {
          calls.push(query)
          const row = (tables[table] || []).find(item => query.filters.every(filter => filter(item)))
          if (!row) return { data: null, error: null }
          if (query.patch) Object.assign(row, query.patch)
          return { data: { ...row }, error: null }
        },
      }
      return builder
    },
  }
}

const NOW = new Date('2026-10-14T08:00:00Z')
const LATER = '2026-10-14T08:30:00.000Z'
const USER = { id: 555, username: 'ali' }
const CHAT = { id: 555 }

test('webhook registration linking records the Telegram user on a live token', async () => {
  const registration = { token: TOKEN, consumed_at: null, expires_at: LATER, linked_at: null, telegram_user_id: null }
  const supabase = fakeSupabase({ employee_telegram_registrations: [registration], employee_salary_telegram_links: [] })
  assert.equal(await linkEmployeeRegistration(supabase, { token: TOKEN, user: USER, chat: CHAT, now: NOW }), 'linked')
  assert.equal(registration.telegram_user_id, '555')
  assert.equal(registration.chat_id, '555')
  assert.equal(registration.username, 'ali')
  assert.equal(registration.linked_at, NOW.toISOString())
  // Pressing Start again from the same account stays linked.
  assert.equal(await linkEmployeeRegistration(supabase, { token: TOKEN, user: USER, chat: CHAT, now: NOW }), 'linked')
})

test('webhook registration linking rejects expired, used, claimed and already-linked accounts', async () => {
  const expired = { token: TOKEN, consumed_at: null, expires_at: '2026-10-14T07:00:00.000Z', linked_at: null }
  assert.equal(await linkEmployeeRegistration(fakeSupabase({ employee_telegram_registrations: [expired] }), { token: TOKEN, user: USER, chat: CHAT, now: NOW }), 'invalid')

  const consumed = { token: TOKEN, consumed_at: '2026-10-14T07:59:00.000Z', expires_at: LATER, linked_at: null }
  assert.equal(await linkEmployeeRegistration(fakeSupabase({ employee_telegram_registrations: [consumed] }), { token: TOKEN, user: USER, chat: CHAT, now: NOW }), 'invalid')

  const claimed = { token: TOKEN, consumed_at: null, expires_at: LATER, linked_at: NOW.toISOString(), telegram_user_id: '999' }
  assert.equal(await linkEmployeeRegistration(fakeSupabase({ employee_telegram_registrations: [claimed] }), { token: TOKEN, user: USER, chat: CHAT, now: NOW }), 'invalid')
  assert.equal(claimed.telegram_user_id, '999')

  const fresh = { token: TOKEN, consumed_at: null, expires_at: LATER, linked_at: null }
  const supabase = fakeSupabase({
    employee_telegram_registrations: [fresh],
    employee_salary_telegram_links: [{ salary_profile_id: 'p1', telegram_user_id: '555', salary_profile: { deleted_at: null } }],
  })
  assert.equal(await linkEmployeeRegistration(supabase, { token: TOKEN, user: USER, chat: CHAT, now: NOW }), 'already_linked')
  assert.equal(fresh.linked_at, null)

  const archivedOwner = fakeSupabase({
    employee_telegram_registrations: [{ token: TOKEN, consumed_at: null, expires_at: LATER, linked_at: null }],
    employee_salary_telegram_links: [{ salary_profile_id: 'p1', telegram_user_id: '555', salary_profile: { deleted_at: '2026-09-01T00:00:00Z' } }],
  })
  assert.equal(await linkEmployeeRegistration(archivedOwner, { token: TOKEN, user: USER, chat: CHAT, now: NOW }), 'linked')
})

test('webhook falls back to new-employee registrations only for unknown employee links', () => {
  const linkEmployee = webhook.slice(webhook.indexOf('async function linkEmployee'), webhook.indexOf('async function checkInEmployee'))
  const fallback = linkEmployee.indexOf('linkEmployeeRegistration(')
  assert.ok(fallback > 0)
  assert.ok(fallback < linkEmployee.indexOf('loadSalaryProfiles('))
})

test('the Add employee dialog creates employees only through the Telegram-gated RPC', () => {
  const dialog = readFileSync(new URL('../src/components/NewEmployeeDialog.jsx', import.meta.url), 'utf8')
  const create = dialog.slice(dialog.indexOf('async function createSalaryProfile'), dialog.indexOf('const busy ='))
  assert.ok(create.includes('isEmployeeTelegramLinked(registration)'))
  assert.ok(create.indexOf('isEmployeeTelegramLinked(registration)') < create.indexOf("rpc('create_employee_salary_profile_with_telegram'"))
  assert.ok(!create.includes(".from('employee_salary_profiles')"))
  assert.ok(!create.includes(".from('employee_salary_rates')"))
  assert.match(dialog, /!canCreateEmployee\(\{ \.\.\.form, salary_amount: normalizeExpenseAmount\(form\.salary_amount\) \}, registration\)/)
  // Polling depends only on the pending token, never on the language.
  assert.match(dialog, /\}, \[pendingToken\]\)/)
  for (const key of ['newTelegramTitle', 'newTelegramWaiting', 'newTelegramLinked', 'newTelegramRequired', 'newTelegramAlreadyLinked']) {
    assert.equal(dialog.split(`${key}:`).length - 1, 3, key)
  }
  // Salaries no longer creates employees; the Employees top bar opens this dialog.
  assert.doesNotMatch(salariesPage, /create_employee_salary_profile_with_telegram/)
  const employeesPage = readFileSync(new URL('../src/pages/Employees.jsx', import.meta.url), 'utf8')
  assert.match(employeesPage, /headerActions=\{canManage && \([\s\S]*?setNewEmployeeOpen\(true\)/)
})

async function createDatabase() {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  await db.exec(`
    create schema if not exists auth;
    create table public.app_session (user_id uuid, can_write boolean);
    insert into public.app_session values ('11111111-1111-1111-1111-111111111111', true);
    create function auth.uid() returns uuid language sql stable as $$ select user_id from public.app_session $$;
    create function public.current_staff_can_write(feature text) returns boolean language sql stable as $$ select can_write from public.app_session $$;
    create table public.profiles (id uuid primary key);
    insert into public.profiles values ('11111111-1111-1111-1111-111111111111');
    create table public.employee_salary_profiles (
      id uuid primary key default gen_random_uuid(),
      profile_id uuid,
      employee_name text not null default '',
      job_function text,
      joined_at date not null default current_date,
      pay_schedule text not null default 'monthly',
      payment_method text not null default 'cash',
      is_active boolean not null default true,
      deleted_at timestamptz,
      created_by uuid
    );
    insert into public.employee_salary_profiles (id, employee_name) values ('22222222-2222-2222-2222-222222222222', 'Legacy without Telegram');
    create table public.employee_salary_rates (
      id uuid primary key default gen_random_uuid(),
      salary_profile_id uuid not null references public.employee_salary_profiles(id) on delete cascade,
      effective_from date not null,
      amount integer not null check (amount > 0),
      rate_unit text not null default 'daily',
      daily_amount integer,
      note text not null default '',
      created_by uuid
    );
    create table public.employee_salary_telegram_links (
      salary_profile_id uuid primary key references public.employee_salary_profiles(id) on delete cascade,
      telegram_user_id text unique,
      chat_id text unique,
      username text not null default '',
      preferred_language text not null default 'ru',
      notifications_enabled boolean not null default true,
      link_token uuid unique,
      link_token_expires_at timestamptz,
      linked_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create role anon;
    create role authenticated;
  `)
  await db.exec(migration)
  return db
}

async function newToken(db) {
  return (await db.query('select public.create_employee_telegram_registration() as token')).rows[0].token
}

async function linkToken(db, token, telegramUserId = '555') {
  await db.query(
    "update public.employee_telegram_registrations set telegram_user_id = $2, chat_id = $2, username = 'ali', linked_at = now() where token = $1",
    [token, telegramUserId],
  )
}

function createEmployee(db, token, name = 'Ali') {
  return db.query(
    "select public.create_employee_salary_profile_with_telegram($1, $2, 'cook', current_date, 'cash', 100000, 'daily', 100000) as id",
    [token, name],
  )
}

async function registrationStatus(db, token) {
  return (await db.query('select * from public.get_employee_telegram_registration($1)', [token])).rows[0]
}

test('database rejects a new employee without a linked Telegram account', async () => {
  const db = await createDatabase()
  try {
    await assert.rejects(
      db.query("insert into public.employee_salary_profiles (employee_name) values ('No Telegram')"),
      /employee_telegram_not_linked/,
    )
    // A link row without a completed Telegram link is not enough either.
    await assert.rejects(db.transaction(async tx => {
      const { rows } = await tx.query("insert into public.employee_salary_profiles (employee_name) values ('Half linked') returning id")
      await tx.query('insert into public.employee_salary_telegram_links (salary_profile_id, link_token) values ($1, gen_random_uuid())', [rows[0].id])
    }), /employee_telegram_not_linked/)
    // Existing employees are untouched by the insert-only rule.
    await db.query("update public.employee_salary_profiles set employee_name = 'Legacy renamed' where id = '22222222-2222-2222-2222-222222222222'")
    assert.equal((await db.query('select count(*)::int as n from public.employee_salary_profiles')).rows[0].n, 1)
  } finally {
    await db.close()
  }
})

test('the creation RPC requires a linked registration and is idempotent per token', async () => {
  const db = await createDatabase()
  try {
    const token = await newToken(db)
    assert.equal((await registrationStatus(db, token)).status, 'pending')
    await assert.rejects(createEmployee(db, token), /employee_telegram_not_linked/)
    await assert.rejects(createEmployee(db, '0f8fad5b-d9cb-469f-a165-70867728950e'), /employee_telegram_registration_not_found/)

    await linkToken(db, token)
    const status = await registrationStatus(db, token)
    assert.equal(status.status, 'linked')
    assert.equal(status.username, 'ali')

    const id = (await createEmployee(db, token)).rows[0].id
    const profile = (await db.query('select employee_name, job_function, created_by from public.employee_salary_profiles where id = $1', [id])).rows[0]
    assert.deepEqual(profile, { employee_name: 'Ali', job_function: 'cook', created_by: '11111111-1111-1111-1111-111111111111' })
    const rate = (await db.query('select amount, rate_unit, daily_amount from public.employee_salary_rates where salary_profile_id = $1', [id])).rows
    assert.deepEqual(rate, [{ amount: 100000, rate_unit: 'daily', daily_amount: 100000 }])
    const link = (await db.query('select telegram_user_id, chat_id, username, linked_at is not null as linked from public.employee_salary_telegram_links where salary_profile_id = $1', [id])).rows[0]
    assert.deepEqual(link, { telegram_user_id: '555', chat_id: '555', username: 'ali', linked: true })

    // Replaying after an unknown outcome returns the same employee.
    assert.equal((await createEmployee(db, token)).rows[0].id, id)
    assert.equal((await db.query('select count(*)::int as n from public.employee_salary_profiles')).rows[0].n, 2)
    const consumed = await registrationStatus(db, token)
    assert.equal(consumed.status, 'consumed')
    assert.equal(consumed.salary_profile_id, id)
  } finally {
    await db.close()
  }
})

test('the creation RPC rejects a Telegram account already linked to an active employee', async () => {
  const db = await createDatabase()
  try {
    const first = await newToken(db)
    await linkToken(db, first)
    const firstId = (await createEmployee(db, first)).rows[0].id

    const second = await newToken(db)
    await linkToken(db, second)
    await assert.rejects(createEmployee(db, second, 'Duplicate'), /employee_telegram_already_linked/)
    assert.equal((await db.query('select count(*)::int as n from public.employee_salary_profiles')).rows[0].n, 2)

    // Once the first employee is archived the account may join a new profile.
    await db.query('update public.employee_salary_profiles set deleted_at = now() where id = $1', [firstId])
    const rehiredId = (await createEmployee(db, second, 'Rehired')).rows[0].id
    assert.notEqual(rehiredId, firstId)
  } finally {
    await db.close()
  }
})

test('registration RPCs require Accounting write access', async () => {
  const db = await createDatabase()
  try {
    const token = await newToken(db)
    await linkToken(db, token)
    await db.query('update public.app_session set can_write = false')
    await assert.rejects(db.query('select public.create_employee_telegram_registration()'), /Forbidden/)
    await assert.rejects(registrationStatus(db, token), /Forbidden/)
    await assert.rejects(createEmployee(db, token), /Forbidden/)
  } finally {
    await db.close()
  }
})

test('expired registrations report expired and cannot be linked into an employee', async () => {
  const db = await createDatabase()
  try {
    const token = await newToken(db)
    await db.query("update public.employee_telegram_registrations set expires_at = now() - interval '1 minute' where token = $1", [token])
    assert.equal((await registrationStatus(db, token)).status, 'expired')
    await assert.rejects(createEmployee(db, token), /employee_telegram_not_linked/)
  } finally {
    await db.close()
  }
})
