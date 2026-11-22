import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('auth account deletion preserves the complete immutable accounting audit snapshot', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.profiles (id uuid primary key references auth.users(id) on delete cascade);
    `)
    const original = read('migrations/084_accounting_record_audit.sql')
    await db.exec(original.slice(0, original.indexOf('create or replace function public.capture_accounting_record_audit()')))
    await db.exec(original.slice(original.indexOf('create or replace function public.prevent_accounting_audit_mutation()'), original.indexOf('alter table public.accounting_record_audit enable row level security;')))
    const id = '00000000-0000-0000-0000-000000000001'
    await db.query('insert into auth.users values ($1)', [id])
    await db.query('insert into profiles values ($1)', [id])
    await db.query(`insert into accounting_record_audit
      (entity_type,entity_id,action,old_record,new_record,changed_by,changed_by_name)
      values ('expense','expense-1','update','{"amount":100}','{"amount":200}',$1,'Manager')`, [id])
    const before = (await db.query('select * from accounting_record_audit')).rows
    await assert.rejects(db.query('delete from auth.users where id=$1', [id]), /immutable/)
    await db.exec(read('migrations/204_preserve_audit_actor_on_account_deletion.sql'))
    await db.query('delete from auth.users where id=$1', [id])
    assert.deepEqual((await db.query('select * from profiles')).rows, [])
    assert.deepEqual((await db.query('select * from auth.users')).rows, [])
    assert.deepEqual((await db.query('select * from accounting_record_audit')).rows, before)
    await assert.rejects(db.exec('update accounting_record_audit set changed_by=null'), /immutable/)
    await assert.rejects(db.exec("update accounting_record_audit set new_record='{}'"), /immutable/)
    await assert.rejects(db.exec('delete from accounting_record_audit'), /immutable/)
    await db.exec(read('migrations/204_preserve_audit_actor_on_account_deletion.sql'))
  } finally {
    await db.close()
  }
})

test('failed account deletion shows an accessible error on the affected row', () => {
  const page = read('src/pages/AdminUsers.jsx')
  // The error is stored as a label key (translated at render) and stays tied to the affected member.
  assert.match(page, /setNotice\(\{ tone: 'error', key: 'deleteError', userId: user.id \}\)/)
  assert.match(page, /notice\?\.tone === 'error' && notice.userId === user.id && \([\s\S]*?<p role="alert"[\s\S]*?\{noticeText\(l, notice\)\}/)
})
