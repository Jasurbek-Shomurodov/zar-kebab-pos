import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildInventoryInvestorMessage } from '../api/telegram/_lib/inventoryMessages.js'
import { buildInvestorQueueMessage, deliverIngredientNotification } from '../api/telegram/_lib/ingredientNotifications.js'

const added = {
  event_type: 'inventory_added', inventory_item_id: 'i1', name: 'Тарелки <большие>', quantity_before: null,
  quantity: 1200, image_url: 'https://media.zarkebab.uz/menu/inventory/plates.jpg',
  actor_name: '<Admin>', changed_at: '2026-11-02T10:00:00Z',
}
const counted = { ...added, event_type: 'inventory_count_changed', quantity_before: 1200, quantity: 1184, image_url: null }

function ledger(snapshot) {
  const row = { id: 'r1', status: 'queued', snapshot }
  return { row, from() {
    let patch = null
    const filters = []
    const query = {
      update(value) { patch = value; return this },
      eq(key, value) { filters.push([key, value]); return this },
      select() { return this }, maybeSingle() { return this },
      then(resolve) {
        const matches = filters.every(([key, value]) => row[key] === value)
        if (matches) Object.assign(row, patch)
        return Promise.resolve({ data: matches ? { ...row } : null, error: null }).then(resolve)
      },
    }
    return query
  } }
}

test('new items show the name, count, actor and Tashkent time, escaped', () => {
  const message = buildInventoryInvestorMessage(added)
  assert.match(message, /Добавлен инвентарь/)
  assert.match(message, /Тарелки &lt;большие&gt;/)
  assert.match(message, /Количество: <b>1\s200<\/b>/)
  assert.match(message, /&lt;Admin&gt;/)
  assert.match(message, /15:00/)
  assert.doesNotMatch(message, /<Admin>|<большие>|→/)
})

test('count changes show before, after and the signed difference through the shared queue', () => {
  assert.match(buildInvestorQueueMessage(counted), /Изменено количество инвентаря/)
  assert.match(buildInvestorQueueMessage(counted), /1\s200 → <b>1\s184<\/b> \(−16\)/)
  assert.match(buildInvestorQueueMessage({ ...counted, quantity: 1205 }), /\(\+5\)/)
  assert.throws(() => buildInventoryInvestorMessage({ ...added, event_type: 'created' }))
})

test('a new item with a photo is sent once as that photo with the message as caption', async () => {
  const db = ledger(added)
  const photos = []
  const texts = []
  const result = await deliverIngredientNotification(db, db.row, '-100',
    async (...args) => { texts.push(args); return { result: { message_id: 1 } } },
    async (...args) => { photos.push(args); return { result: { message_id: 7 } } })
  assert.equal(result.status, 'sent')
  assert.deepEqual(db.row.telegram_message_ids, [7])
  assert.equal(texts.length, 0)
  assert.equal(photos.length, 1)
  assert.equal(photos[0][1], added.image_url)
  assert.match(photos[0][2], /Добавлен инвентарь/)
})

test('a count change sends text only', async () => {
  const db = ledger(counted)
  let photoCalls = 0
  const result = await deliverIngredientNotification(db, db.row, '-100',
    async () => ({ result: { message_id: 2 } }),
    async () => { photoCalls += 1; return { result: { message_id: 8 } } })
  assert.equal(result.status, 'sent')
  assert.deepEqual(db.row.telegram_message_ids, [2])
  assert.equal(photoCalls, 0)
})

test('a photo Telegram refuses falls back to text; an unknown outcome is held, not resent', async () => {
  const refused = ledger(added)
  const sent = await deliverIngredientNotification(refused, refused.row, '-100',
    async () => ({ result: { message_id: 3 } }),
    async () => { throw Object.assign(new Error('wrong file identifier'), { telegramRejected: true }) })
  assert.equal(sent.status, 'sent')
  assert.deepEqual(refused.row.telegram_message_ids, [3])

  const unknown = ledger(added)
  let textCalls = 0
  const held = await deliverIngredientNotification(unknown, unknown.row, '-100',
    async () => { textCalls += 1; return { result: { message_id: 4 } } },
    async () => { throw new Error('network timeout') })
  assert.equal(held.needsReview, true)
  assert.equal(textCalls, 0)
  assert.equal(unknown.row.status, 'processing')
})

test('migration 277 keeps every earlier event type and queues only staff adds and count changes', () => {
  const sql = readFileSync(new URL('../migrations/277_inventory_investor_notifications.sql', import.meta.url), 'utf8')
  for (const event of ['created', 'updated', 'archived', 'restored', 'month_closed', 'month_reopened', 'menu_price_changed', 'inventory_added', 'inventory_count_changed']) {
    assert.ok(sql.includes(`'${event}'`), event)
  }
  assert.match(sql, /auth\.uid\(\) is null or new\.is_active is not true/)
  assert.match(sql, /new\.quantity is distinct from old\.quantity/)
  assert.match(sql, /after insert or update of quantity on public\.inventory_items/)
  assert.match(sql, /revoke all on function public\.queue_inventory_investor_notification\(\) from public, anon, authenticated/)
  assert.match(sql, /^commit;$/m)
})
