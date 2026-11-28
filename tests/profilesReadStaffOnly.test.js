import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../migrations/290_profiles_read_staff_only.sql', import.meta.url), 'utf8')

const STAFF = '00000000-0000-0000-0000-000000000001'
const GUEST = '00000000-0000-0000-0000-000000000002'
const OTHER = '00000000-0000-0000-0000-000000000003'

test('pending sign-ups read only their own profile; active staff read the team (290)', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create table public.profiles (id uuid primary key, email text, role text, status text);
      alter table public.profiles enable row level security;
      create policy "Authenticated: read all profiles" on public.profiles for select using (auth.uid() is not null);
      grant select on public.profiles to authenticated;
      insert into public.profiles values
        ('${STAFF}', 'staff@x', 'admin', 'active'),
        ('${GUEST}', 'guest@x', 'guest', 'pending'),
        ('${OTHER}', 'other@x', 'viewer', 'active');
    `)
    await db.exec(migration)
    const visibleTo = async uid => {
      await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`)
      const { rows } = await db.query('select email from public.profiles order by email')
      await db.exec('reset role')
      return rows.map(row => row.email)
    }
    assert.deepEqual(await visibleTo(GUEST), ['guest@x'])
    assert.deepEqual(await visibleTo(STAFF), ['guest@x', 'other@x', 'staff@x'])
    assert.deepEqual(await visibleTo(''), [])
  } finally {
    await db.close()
  }
})
