import test from 'node:test'
import assert from 'node:assert/strict'
import { getGroupedOrderItems } from '../src/lib/analytics.js'
import { buildItemRows } from '../api/telegram/_lib/orderStatusMessages.js'
import { buildKitchenCheckModel, getKitchenCheckGroup } from '../src/lib/kitchenCheck.js'

const wings = { menu_item_id: 'wings', name: 'Куриные крылышки', quantity: 1, price: 25_000 }

test('Telegram and receipt grouping combine repeated dishes across rounds without changing amounts or source rows', () => {
  const items = [
    { ...wings, id: 'a', kitchen_round_id: 'one' },
    { id: 'beef-a', menu_item_id: 'beef', name: 'Шашлык из говядины', quantity: 1, price: 35_000 },
    { ...wings, id: 'b', kitchen_round_id: 'two' },
    { id: 'beef-b', menu_item_id: 'beef', name: 'Шашлык из говядины', quantity: 1, price: 35_000 },
    { ...wings, id: 'cancelled', status: 'cancelled', quantity: 9 },
  ]
  const snapshot = structuredClone(items)
  const rows = getGroupedOrderItems(items)
  assert.deepEqual(rows.map(row => [row.quantity, row.price * row.quantity]), [[2, 50_000], [2, 70_000]])
  assert.deepEqual(rows[0].source_item_ids, ['a', 'b'])
  const text = buildItemRows(items)
  assert.match(text, /Куриные крылышки\s+2\s+50 000/)
  assert.match(text, /Шашлык из говядины\s+2\s+70 000/)
  assert.equal(text.split('\n').length, 3)
  assert.deepEqual(items, snapshot)
})

test('different prices, products, variants, notes and sale units remain separate on checks', () => {
  const items = [
    wings,
    { ...wings, price: 30_000 },
    { ...wings, menu_item_id: 'other-wings' },
    { ...wings, selected_options: { sauce: 'hot' } },
    { ...wings, notes: 'Без соли' },
    { ...wings, sale_unit: 'kg' },
  ]
  assert.equal(getGroupedOrderItems(items).length, items.length)
  assert.equal(buildItemRows(items).split('\n').length, items.length + 1)
})

test('kitchen printing combines identical rows only inside the requested round', () => {
  const order = { id: 'order', items: [
    { ...wings, id: 'a', kitchen_round_id: 'one' },
    { ...wings, id: 'b', kitchen_round_id: 'one' },
    { ...wings, id: 'c', kitchen_round_id: 'two', quantity: 3 },
  ] }
  const group = getKitchenCheckGroup(order, 'one')
  const printedRows = check => check.rows.map(row => `${row.quantity} ${row.name}`)
  assert.deepEqual(printedRows(buildKitchenCheckModel(group)), ['2 × КУРИНЫЕ КРЫЛЫШКИ'])
  assert.equal(group.items.length, 2)
  assert.deepEqual(printedRows(buildKitchenCheckModel(getKitchenCheckGroup(order, 'two'))), ['3 × КУРИНЫЕ КРЫЛЫШКИ'])
})
