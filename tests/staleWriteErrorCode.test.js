import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const MIGRATION = '246_stale_write_errors_not_serialization_failure.sql'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// PostgREST re-runs a transaction that fails with 40001 until it succeeds, so a
// deterministic stale-data rejection with that code loops forever in Postgres.
test('migrations after 246 never raise SQLSTATE 40001', () => {
  const later = readdirSync(new URL('../migrations/', import.meta.url))
    .filter(name => /^\d{3}_.*\.sql$/.test(name) && name > MIGRATION)
  for (const name of later) {
    assert.doesNotMatch(read(`migrations/${name}`), /errcode\s*=\s*'40001'/, name)
  }
})

test('migration 246 rewrites stale-data RPC errors to PT409 and leaves other code intact', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create function public.update_bill_item_quantity(payload jsonb) returns jsonb language plpgsql as $f$
    begin
      if payload->>'stale' = 'yes' then
        raise exception 'Order item changed or unavailable. Refresh the bill.' using errcode = '40001';
      end if;
      if payload->>'gone' = 'yes' then
        raise exception 'Order item changed or unavailable. Refresh the bill.' using errcode='40001';
      end if;
      return jsonb_build_object('ok', true);
    end $f$;
    create function public.unrelated() returns int language sql as $f$ select 1 $f$;
  `)
  await db.exec(read(`migrations/${MIGRATION}`))

  const { rows } = await db.query(`select prosrc from pg_proc where proname = 'update_bill_item_quantity'`)
  assert.doesNotMatch(rows[0].prosrc, /40001/)
  assert.equal((rows[0].prosrc.match(/'PT409'/g) || []).length, 2)

  await assert.rejects(
    db.query(`select public.update_bill_item_quantity('{"stale":"yes"}')`),
    error => error.code === 'PT409' && /Refresh the bill/.test(error.message)
  )
  const ok = await db.query(`select public.update_bill_item_quantity('{}') as r`)
  assert.deepEqual(ok.rows[0].r, { ok: true })
})
