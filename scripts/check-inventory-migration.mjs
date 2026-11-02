// Isolated PostgreSQL verification; never connects to production.
// Usage: node scripts/check-inventory-migration.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite')
const db = new PGlite()
const migration = readFileSync(new URL('../migrations/276_inventory_items.sql', import.meta.url), 'utf8')
const notifications = readFileSync(new URL('../migrations/277_inventory_investor_notifications.sql', import.meta.url), 'utf8')
const ADMIN = '00000000-0000-0000-0000-000000000001'
const VIEWER = '00000000-0000-0000-0000-000000000002'
const OUTSIDER = '00000000-0000-0000-0000-000000000003'
const ITEM = '00000000-0000-0000-0000-00000000000a'
const asUser = async (uid, sql, params = []) => {
  await db.exec(`set session authorization default; set app.uid = '${uid}'; set role authenticated;`)
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec('reset role')
  }
}
const denied = async (uid, sql, params) => assert.rejects(() => asUser(uid, sql, params), /row-level security|permission denied/)

try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.profiles (id uuid, status text, role text, email text, full_name text, feature_access text[],
      constraint profiles_feature_access_valid check (true));
    create function public.current_staff_can_access(feature_key text) returns boolean language sql stable security definer as $$
      select coalesce((select p.status = 'active' and feature_key = any(p.feature_access) from public.profiles p where p.id = auth.uid()), false) $$;
    create function public.current_staff_can_write(feature_key text) returns boolean language sql stable security definer as $$
      select coalesce((select p.role in ('owner', 'admin') and public.current_staff_can_access(feature_key) from public.profiles p where p.id = auth.uid()), false) $$;
    insert into public.profiles values
      ('${ADMIN}', 'active', 'admin', 'a@zar.test', 'Admin One', array['inventory']),
      ('${VIEWER}', 'active', 'viewer', 'v@zar.test', 'Viewer', array['inventory']),
      ('${OUTSIDER}', 'active', 'admin', 'o@zar.test', 'Outsider', array['ingredients']);
  `)
  await db.exec(migration)
  await db.exec(`
    create table public.ingredient_investor_notifications (
      id uuid primary key default gen_random_uuid(), product_key text not null, event_type text not null,
      snapshot jsonb not null, created_at timestamptz not null default clock_timestamp()
    );
  `)
  await db.exec(notifications)

  const insert = `insert into public.inventory_items (id, name, quantity) values ($1, $2, $3)
    on conflict (id) do update set name = excluded.name, quantity = excluded.quantity returning *`

  // Only write holders may insert; viewers read, and people without the feature see nothing.
  await denied(VIEWER, insert, [ITEM, 'Plates', 10])
  await denied(OUTSIDER, insert, [ITEM, 'Plates', 10])
  const created = (await asUser(ADMIN, insert, [ITEM, 'Plates', 120])).rows[0]
  assert.equal(created.counted_by_name, 'Admin One')
  assert.equal((await asUser(VIEWER, 'select * from public.inventory_items')).rows.length, 1)
  assert.equal((await asUser(OUTSIDER, 'select * from public.inventory_items')).rows.length, 0)
  assert.equal((await asUser(VIEWER, "update public.inventory_items set quantity = 1 returning id").catch(error => ({ rows: [], error }))).rows.length, 0)

  // A retried upsert is idempotent; the count stamp moves only when the count changes.
  await db.exec(`update public.profiles set full_name = 'Admin Renamed' where id = '${ADMIN}'`)
  const retried = (await asUser(ADMIN, insert, [ITEM, 'Plates', 120])).rows[0]
  assert.equal(retried.counted_by_name, 'Admin One')
  assert.equal(new Date(retried.counted_at).getTime(), new Date(created.counted_at).getTime())
  assert.equal((await asUser(ADMIN, 'select count(*)::int as value from public.inventory_items')).rows[0].value, 1)
  const forged = (await asUser(ADMIN, "update public.inventory_items set quantity = 104, counted_by_name = 'Someone else', counted_at = '2000-01-01' where id = $1 returning *", [ITEM])).rows[0]
  assert.equal(forged.counted_by_name, 'Admin Renamed')
  assert.ok(new Date(forged.counted_at).getFullYear() > 2000)

  // Archive only: no role can physically delete, and archiving frees the active name.
  await assert.rejects(() => asUser(ADMIN, 'delete from public.inventory_items'), /permission denied/)
  await assert.rejects(() => asUser(ADMIN, insert, ['00000000-0000-0000-0000-00000000000b', 'plates', 3]), /inventory_items_active_name_key/)
  await asUser(ADMIN, 'update public.inventory_items set is_active = false where id = $1', [ITEM])
  await asUser(ADMIN, insert, ['00000000-0000-0000-0000-00000000000b', 'plates', 3])
  await assert.rejects(() => asUser(ADMIN, 'update public.inventory_items set is_active = true where id = $1', [ITEM]), /inventory_items_active_name_key/)

  // Bounds hold for direct writes, not only in the form.
  await assert.rejects(() => asUser(ADMIN, insert, ['00000000-0000-0000-0000-00000000000c', 'Forks', -1]), /check constraint/)
  await assert.rejects(() => asUser(ADMIN, insert, ['00000000-0000-0000-0000-00000000000c', ' Forks', 1]), /check constraint/)
  await assert.rejects(() => asUser(ADMIN, 'insert into public.inventory_items (name, image_url) values ($1, $2)', ['Forks', 'javascript:alert(1)']), /check constraint/)

  // Investor events: one per new item or real count change, with immutable snapshots.
  // Retries, name edits, archive, rejected writes and service writes above stay silent.
  await asUser(ADMIN, 'update public.inventory_items set note = $1 where id = $2', ['Kitchen', '00000000-0000-0000-0000-00000000000b'])
  await db.exec(`set app.uid = ''`)
  await db.exec(`update public.inventory_items set quantity = 500 where id = '00000000-0000-0000-0000-00000000000b'`)
  const events = (await db.query('select * from public.ingredient_investor_notifications order by created_at')).rows
  assert.deepEqual(events.map(row => row.event_type), ['inventory_added', 'inventory_count_changed', 'inventory_added'])
  assert.equal(events[0].snapshot.quantity, 120)
  assert.equal(events[0].snapshot.quantity_before, null)
  assert.equal(events[0].snapshot.actor_name, 'Admin One')
  assert.equal(events[1].snapshot.quantity_before, 120)
  assert.equal(events[1].snapshot.quantity, 104)
  assert.equal(events[1].snapshot.actor_name, 'Admin Renamed')
  assert.equal(events[1].product_key, `inventory:${ITEM}`)

  await db.exec('set role anon')
  await assert.rejects(() => db.query('select * from public.inventory_items'), /permission denied/)
  await db.exec('reset role')
  console.log('Inventory migration checks passed.')
} finally {
  await db.close()
}
