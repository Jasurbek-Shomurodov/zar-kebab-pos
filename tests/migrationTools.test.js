import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { createHash } from 'node:crypto'
import { migrationFiles, migrationStatus, trackedMigrationSql, sqlStatements, migrationBody, migrationHealthIssues, recentFunctionFingerprints } from '../scripts/migrationTools.js'
const fixture = (filename, sql) => ({ filename, sql, sha256: createHash('sha256').update(sql).digest('hex') })

test('full filenames distinguish historical duplicate numbers without claiming unknown history', () => {
  const files = migrationFiles()
  assert.equal(files.filter(f => f.filename.startsWith('073')).length, 2)
  const rows = migrationStatus(files, [{ filename: files[0].filename, sha256: files[0].sha256 }])
  assert.equal(rows[0].status, 'applied')
  assert.equal(rows[1].status, 'legacy-untracked')
  assert.equal(rows.find(r => r.filename.startsWith('199')).status, 'PENDING')
  assert.equal(migrationStatus([files[0]], [{ filename: files[0].filename, sha256: 'bad' }])[0].status, 'CHANGED')
})

test('SQL boundaries preserve procedural bodies and reject internal commits', () => {
  assert.equal(sqlStatements("select ';'; do $x$ begin perform 1; end; $x$;").length, 2)
  assert.match(migrationBody('/* header */ begin; do $$ begin perform 1; end; $$; commit;'), /do \$\$/)
  assert.throws(() => migrationBody('begin; select 1; commit; select 2; commit;'), /transaction/)
  assert.throws(() => migrationBody('begin; select 1;'), /COMMIT/)
  assert.throws(() => trackedMigrationSql(fixture('../unsafe.sql', 'select 1;')), /identity/)
})

test('tracked SQL executes once, rejects edits and rolls failures back with their receipts', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema cron; create table cron.job(jobname text, schedule text, active boolean);`)
    const tracking = migrationFiles().find(f => f.filename.startsWith('199_'))
    await db.exec(trackedMigrationSql(tracking))
    await db.exec(trackedMigrationSql(tracking))
    const m = fixture('200_test.sql', 'begin; create table test_values(n int); insert into test_values values(1); commit;')
    await db.exec(trackedMigrationSql(m))
    await db.exec(trackedMigrationSql(m))
    assert.equal((await db.query('select count(*)::int as n from test_values')).rows[0].n, 1)
    await assert.rejects(db.exec(trackedMigrationSql(fixture(m.filename, 'select 2;'))), /checksum mismatch/)
    await db.exec('rollback')
    await assert.rejects(db.exec(trackedMigrationSql(fixture('201_fail.sql', 'insert into test_values values(2); select 1/0;'))), /division by zero/)
    await db.exec('rollback')
    assert.equal((await db.query('select count(*)::int as n from test_values')).rows[0].n, 1)
    assert.equal((await db.query("select count(*)::int as n from app_schema_migrations where filename='201_fail.sql'")).rows[0].n, 0)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from app_schema_migrations'), /permission denied/)
    await assert.rejects(db.query('select get_database_migration_health()'), /permission denied/)
  } finally { await db.close() }
})

test('health catches old definitions even when the RPC exists and catches missing notification schedule', () => {
  const issues = migrationHealthIssues({ functions: [{name:'save_bazaar_ingredient',md5:'old'}], triggers:[], jobs:[] }, [{name:'save_bazaar_ingredient',md5:'new',filename:'182.sql'}])
  assert.ok(issues.some(s => s.includes('definition differs')))
  assert.ok(issues.some(s => s.includes('zar-kebab-ingredient-investor')))
})

test('ingredient rename repair preserves identity and historical purchase names', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table bazaar_product_catalog (
      product_key text primary key, product_name text, category text, unit text, normal_unit_price integer,
      is_active boolean, last_purchase_date date, created_at timestamptz, updated_at timestamptz);
      create table purchase_snapshot(product_key text, product_name text);
      insert into bazaar_product_catalog values('flour','Flour','grocery','kg',100,true,current_date,now(),now());
      insert into purchase_snapshot values('flour','Flour');
      create function current_staff_can_manage_bazaar_ingredients() returns boolean language sql as $$ select current_setting('test.can_manage',true) = 'yes' $$;
      create function normalize_bazaar_product_key(text) returns text language sql as $$ select lower($1) $$;
      create function save_bazaar_purchase(payload jsonb) returns text language plpgsql as $$
      declare product_name_value text := payload->>'product_name'; item_value jsonb := payload;
      begin return public.normalize_bazaar_product_key(product_name_value); end; $$;
      set test.can_manage='yes';`)
    const migration = migrationFiles().find(f => f.filename.startsWith('182_'))
    await db.exec(migration.sql)
    const payload = JSON.stringify({product_key:'flour',product_name:'Premium flour',category:'grocery',unit:'kg',normal_unit_price:150})
    await db.query('select save_bazaar_ingredient($1::jsonb)',[payload])
    assert.deepEqual((await db.query('select product_key, product_name from bazaar_product_catalog')).rows, [{product_key:'flour',product_name:'Premium flour'}])
    assert.equal((await db.query('select product_name from purchase_snapshot')).rows[0].product_name,'Flour')
    assert.equal((await db.query('select save_bazaar_purchase($1::jsonb) as key',[payload])).rows[0].key,'flour')
    await db.exec("set test.can_manage='no'")
    await assert.rejects(db.query('select save_bazaar_ingredient($1::jsonb)',[payload]), /Only an owner/)
  } finally { await db.close() }
})

test('ten-day repair returns calendar periods and excludes cancelled sales', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create function current_staff_can_access(text) returns boolean language sql as $$ select true $$;
      create table orders(paid_at timestamptz, created_at timestamptz, status text, payment_status text, total numeric);
      insert into orders values
        ('2020-02-05T12:00:00+05','2020-02-05T12:00:00+05','completed','paid',100),
        ('2020-02-15T12:00:00+05','2020-02-15T12:00:00+05','completed','paid',200),
        (null,'2020-02-29T12:00:00+05','completed','paid',300),
        ('2020-02-05T12:00:00+05','2020-02-05T12:00:00+05','cancelled','paid',999);`)
    await db.exec(migrationFiles().find(f => f.filename.startsWith('190_')).sql)
    const {rows} = await db.query("select week_start::text, week_end::text, day_count, total_income::int from get_dashboard_weekly_average_income('2020-02-01')")
    assert.deepEqual(rows, [
      {week_start:'2020-02-01',week_end:'2020-02-10',day_count:10,total_income:100},
      {week_start:'2020-02-11',week_end:'2020-02-20',day_count:10,total_income:200},
      {week_start:'2020-02-21',week_end:'2020-02-29',day_count:9,total_income:300},
    ])
  } finally { await db.close() }
})

test('function fingerprints mirror migration 246 in-place PT409 rewrite', () => {
  const md5 = text => createHash('md5').update(text).digest('hex')
  const file = (filename, sql) => ({ filename, sql, sha256: '' })
  const older = file('220_bill.sql', "create or replace function public.update_bill_item_quantity(payload jsonb) returns jsonb language plpgsql as $$ begin raise exception 'x' using errcode='40001'; end $$;")
  const rewrite = file('246_stale_write_errors_not_serialization_failure.sql', 'do $$ begin end $$;')
  const [before] = recentFunctionFingerprints([older])
  const [after] = recentFunctionFingerprints([older, rewrite])
  assert.equal(before.md5, md5(" begin raise exception 'x' using errcode='40001'; end "))
  assert.equal(after.md5, md5(" begin raise exception 'x' using errcode = 'PT409'; end "))
  assert.equal(after.filename, '220_bill.sql')
})
