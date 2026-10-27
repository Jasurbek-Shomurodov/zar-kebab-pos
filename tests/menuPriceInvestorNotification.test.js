import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMenuPriceInvestorMessage } from '../api/telegram/_lib/menuPriceMessages.js'
import { buildInvestorQueueMessage } from '../api/telegram/_lib/ingredientNotifications.js'

const snapshot = {
  event_type: 'menu_price_changed', menu_item_id: 'm1', name: 'Шашлык <люля>', category: 'Шашлыки',
  actor_name: '<Admin>', changed_at: '2026-10-27T10:00:00Z',
  before: { price: 30000, old_price: 0, variants: [
    { id: 'small', name: 'Малый', price: 30000 },
    { id: 'big', name: 'Большой', price: 45000 },
    { id: 'gone', name: 'Двойной', price: 60000 },
  ] },
  after: { price: 35000, old_price: 40000, variants: [
    { id: 'small', name: 'Малый', price: 30000 },
    { id: 'big', name: 'Большой', price: 50000 },
    { id: 'new', name: 'Семейный', price: 90000 },
  ] },
}

test('menu price changes render before/after prices, variants, actor and Tashkent time', () => {
  const message = buildMenuPriceInvestorMessage(snapshot)
  assert.match(message, /Изменена цена в меню/)
  assert.match(message, /Шашлык &lt;люля&gt;/)
  assert.match(message, /Цена: 30\s000 UZS → <b>35\s000 UZS<\/b> \(\+5\s000 UZS\)/)
  assert.match(message, /зачёркнутая\) цена: нет → <b>40\s000 UZS<\/b>/)
  assert.match(message, /Большой: 45\s000 UZS → <b>50\s000 UZS<\/b>/)
  assert.match(message, /Семейный: <b>90\s000 UZS<\/b> \(новый\)/)
  assert.match(message, /Двойной: 60\s000 UZS \(удалён\)/)
  assert.doesNotMatch(message, /Малый/)
  assert.match(message, /&lt;Admin&gt;/)
  assert.match(message, /15:00/)
  assert.doesNotMatch(message, /<Admin>|<люля>/)
})

test('price decreases show a minus sign and the shared Investor queue routes the event', () => {
  const message = buildInvestorQueueMessage({ ...snapshot, after: { ...snapshot.before, price: 28000 } })
  assert.match(message, /Цена: 30\s000 UZS → <b>28\s000 UZS<\/b> \(−2\s000 UZS\)/)
  assert.doesNotMatch(message, /Варианты|зачёркнутая/)
  assert.throws(() => buildMenuPriceInvestorMessage({ ...snapshot, before: null }))
})

test('migration 270 queues staff price changes only, without costs', () => {
  const sql = readFileSync(new URL('../migrations/270_menu_price_investor_notifications.sql', import.meta.url), 'utf8')
  assert.match(sql, /'month_closed', 'month_reopened', 'menu_price_changed'/)
  assert.match(sql, /auth\.uid\(\) is null or old\.deleted_at is not null or new\.deleted_at is not null/)
  assert.match(sql, /before_signature = after_signature/)
  assert.match(sql, /after update of price, old_price, option_groups on public\.menu_items/)
  assert.doesNotMatch(sql, /cost/i)
})
