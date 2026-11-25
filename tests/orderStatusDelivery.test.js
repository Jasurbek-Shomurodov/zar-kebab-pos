import test from 'node:test'
import assert from 'node:assert/strict'
import { sendTrackedOrderStatusMessage, retractDeletedOrderStatusMessages } from '../api/telegram/_lib/orderStatusDelivery.js'

function database(rows = []) {
  return { rows, from() {
    let predicates = [], patch, insert, single = false, remove = false
    const q = {
      select() { return q }, delete() { remove = true; return q }, maybeSingle() { single = true; return q }, order() { return q }, limit() { return q },
      eq(k, v) { predicates.push(r => r[k] === v); return q },
      is(k, v) { predicates.push(r => (r[k] ?? null) === v); return q },
      not(k) { predicates.push(r => r[k] != null); return q },
      overlaps(k, v) { predicates.push(r => r[k].some(id => v.includes(id))); return q },
      insert(v) { insert = v; return q }, update(v) { patch = v; return q },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (insert && rows.some(row => row.id === insert.id)) return { error: { code: '23505' } }
        if (insert) rows.push({ delete_requested: false, ...insert })
        const selected = rows.filter(r => predicates.every(p => p(r)))
        if (patch) selected.forEach(r => Object.assign(r, patch))
        if (remove) selected.forEach(r => rows.splice(rows.indexOf(r), 1))
        return { data: structuredClone(single ? selected[0] || null : selected) }
      }).then(resolve, reject) },
    }
    return q
  } }
}
async function telegram(run) {
  const previous = global.fetch, token = process.env.TELEGRAM_BOT_TOKEN
  process.env.TELEGRAM_BOT_TOKEN = 'test'
  const calls = []
  global.fetch = async (url, opts) => {
    calls.push({ method: url.split('/').at(-1), ...JSON.parse(opts.body) })
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) }
  }
  try { await run(calls) } finally {
    global.fetch = previous
    if (token === undefined) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = token
  }
}
test('tracks combined order IDs and marks only requested group messages removed once', async () => telegram(async calls => {
  const db = database()
  await sendTrackedOrderStatusMessage(db, ['a', 'b'], '-100', 'receipt')
  await sendTrackedOrderStatusMessage(db, ['c'], '-200', 'other')
  assert.deepEqual(db.rows[0].order_ids, ['a', 'b'])
  assert.equal(db.rows[0].message_id, '42')
  db.rows[0].delete_requested = true
  await retractDeletedOrderStatusMessages(db, ['b'])
  await retractDeletedOrderStatusMessages(db)
  assert.equal(calls.filter(c => c.method === 'deleteMessage').length, 0)
  const notices = calls.filter(c => c.reply_parameters)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].chat_id, '-100')
  assert.equal(notices[0].reply_parameters.message_id, 42)
  assert.match(notices[0].text, /Заказ удалён/)
  assert.ok(db.rows[0].deleted_at)
  assert.equal(db.rows[1].deleted_at, undefined)
}))
test('missing messages succeed but permission errors stay retryable', async () => telegram(async () => {
  const db = database([{ id: 'one', order_ids: ['a'], chat_id: '-100', message_id: '42', delete_requested: true }])
  global.fetch = async () => ({ ok: false, json: async () => ({ ok: false, description: 'not enough rights' }) })
  assert.equal((await retractDeletedOrderStatusMessages(db)).ok, false)
  assert.match(db.rows[0].error_message, /rights/)
  assert.equal(db.rows[0].deleted_at, undefined)
  global.fetch = async () => ({ ok: false, json: async () => ({ ok: false, description: 'Bad Request: message to be replied not found' }) })
  assert.equal((await retractDeletedOrderStatusMessages(db)).ok, true)
  assert.ok(db.rows[0].deleted_at)
}))
test('deletion during a send is reconciled after its message ID is saved', async () => telegram(async () => {
  const db = database()
  const fetch = global.fetch
  global.fetch = async (...args) => {
    if (args[0].endsWith('/sendMessage')) db.rows[0].delete_requested = true
    return fetch(...args)
  }
  await sendTrackedOrderStatusMessage(db, ['a'], '-100', 'receipt')
  assert.ok(db.rows[0].deleted_at)
}))
test('unknown sends retain their reservation without inventing a message ID or resending', async () => telegram(async () => {
  const db = database()
  let attempts = 0
  global.fetch = async () => { attempts++; throw new Error('timeout') }
  await assert.rejects(sendTrackedOrderStatusMessage(db, ['a'], '-100', 'receipt'), /timeout/)
  db.rows[0].delete_requested = true
  await retractDeletedOrderStatusMessages(db)
  assert.equal(attempts, 1)
  assert.equal(db.rows[0].message_id, undefined)
}))

test('salary status retry reuses confirmed messages and holds unknown sends', async () => telegram(async calls => {
  const db = database()
  await sendTrackedOrderStatusMessage(db, ['b', 'a'], '-100', 'salary order', { salarySettlement: true })
  await sendTrackedOrderStatusMessage(db, ['a', 'b'], '-100', 'salary order', { salarySettlement: true })
  assert.equal(calls.filter(call => call.method === 'sendMessage').length, 1)
  global.fetch = async () => { throw new Error('connection lost') }
  await assert.rejects(sendTrackedOrderStatusMessage(db, ['c'], '-100', 'salary order', { salarySettlement: true }), /connection lost/)
  await assert.rejects(sendTrackedOrderStatusMessage(db, ['c'], '-100', 'salary order', { salarySettlement: true }), /pending or unknown/)
  assert.equal(db.rows.length, 2)
}))

test('salary status retries a definite Telegram rejection without replaying successful sends', async () => telegram(async calls => {
  const db = database()
  const workingFetch = global.fetch
  global.fetch = async () => ({ ok: false, json: async () => ({ ok: false, description: 'Not enough rights' }) })
  await assert.rejects(sendTrackedOrderStatusMessage(db, ['a'], '-100', 'salary order', { salarySettlement: true }), /rights/)
  assert.equal(db.rows.length, 0)
  global.fetch = workingFetch
  await sendTrackedOrderStatusMessage(db, ['a'], '-100', 'salary order', { salarySettlement: true })
  assert.equal(calls.length, 1)
}))
