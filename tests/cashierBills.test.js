import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCashierBillableItems,
  isCashierVisibleBill,
  isTakeAwayBill,
} from '../src/lib/cashierBills.js'

const item = (overrides = {}) => ({
  id: overrides.id || 'i1',
  menu_item_id: overrides.menu_item_id || 'm1',
  name: overrides.name || 'Shashlik',
  quantity: overrides.quantity ?? 1,
  price: overrides.price ?? 25000,
  status: overrides.status || 'new',
  ...overrides,
})

const order = (overrides = {}) => ({
  id: overrides.id || 'o1',
  order_type: overrides.order_type || 'take_away',
  order_number: overrides.order_number || 'TA-6157',
  table_id: overrides.table_id ?? null,
  table_name: overrides.table_name || 'Take Away',
  status: overrides.status || 'sent_to_kitchen',
  payment_status: overrides.payment_status || 'unpaid',
  service_rate_pct: overrides.service_rate_pct ?? 0,
  subtotal: overrides.subtotal ?? 0,
  total: overrides.total ?? 0,
  items: overrides.items ?? [],
  created_at: overrides.created_at || new Date().toISOString(),
})

test('cashier hides empty zero-total take-away shells', () => {
  assert.equal(isTakeAwayBill(order()), true)
  assert.equal(isCashierVisibleBill(order({ items: [], total: 0 })), false)
})

test('cashier hides empty active orders even when stale stored totals exist', () => {
  assert.equal(isCashierVisibleBill(order({ items: [], subtotal: 62000, total: 62000 })), false)
})

test('cashier hides orders where every item was cancelled', () => {
  const emptyBill = order({
    items: [
      item({ id: 'i1', status: 'cancelled', price: 18000 }),
      item({ id: 'i2', status: 'cancelled', price: 22000 }),
    ],
    subtotal: 40000,
    total: 40000,
  })

  assert.deepEqual(getCashierBillableItems(emptyBill), [])
  assert.equal(isCashierVisibleBill(emptyBill), false)
})

test('cashier shows valid unpaid take-away orders immediately', () => {
  assert.equal(isCashierVisibleBill(order({ items: [item({ price: 18000 })] })), true)
})

test('cashier shows dine-in table orders only after bill is requested', () => {
  const dineIn = {
    order_type: 'dine_in',
    table_id: 't1',
    table_name: 'Table 1',
    items: [item({ status: 'served', price: 18000 })],
  }

  assert.equal(isCashierVisibleBill(order({ ...dineIn, status: 'delivered' })), false)
  assert.equal(isCashierVisibleBill(order({ ...dineIn, status: 'needs_bill' })), true)
})

test('cashier hides paid or cancelled orders even with billable items', () => {
  assert.equal(isCashierVisibleBill(order({ payment_status: 'paid', items: [item()] })), false)
  assert.equal(isCashierVisibleBill(order({ status: 'cancelled', items: [item()] })), false)
})

test('empty-order recovery includes only loaded unpaid shells for the requested bill', async () => {
  const { getEmptyCashierOrders } = await import('../src/lib/cashierBills.js')
  const base = { id: 'empty', table_id: 't4', status: 'needs_bill', payment_status: 'unpaid', total: 41400, items: [] }
  const rows = [base,
    { ...base, id: 'cancelled-items', items: [{ status: 'cancelled', quantity: 1, price: 100 }] },
    { ...base, id: 'paid', payment_status: 'paid' },
    { ...base, id: 'paid-at', paid_at: '2026-09-25T10:00:00Z' },
    { ...base, id: 'completed', status: 'completed' },
    { ...base, id: 'cancelled', status: 'cancelled' },
    { ...base, id: 'cancelled-payment', payment_status: 'cancelled' },
    { ...base, id: 'unloaded', items: undefined },
    { ...base, id: 'live', items: [{ quantity: 1, price: 100 }] },
    { ...base, id: 'other', table_id: 't5' },
  ]
  assert.deepEqual(getEmptyCashierOrders(rows, { tableId: 't4' }).map(o => o.id), ['empty', 'cancelled-items'])
  assert.deepEqual(getEmptyCashierOrders(rows, { orderId: 'empty' }), [base])
  assert.deepEqual(getEmptyCashierOrders(rows), [])
  assert.equal(isCashierVisibleBill(base), false)
})

// ── Tile total == bill total (audit B8) ─────────────────────────────────────
// The Cashier list tile and the bill page it opens must print the same amount.
async function tileAndBillTotals({ orders, menuItems = [], settings = {} }, bill) {
  const { getCashierBillTotal, getCashierBillTarget } = await import('../src/lib/cashierBills.js')
  const { getFreshCashierPaymentQuote, applyLoyaltyToCashierPaymentQuote } = await import('../src/lib/cashierCheckout.js')
  const { getOrderTotal } = await import('../src/lib/analytics.js')
  const { getConfiguredServiceRatePct } = await import('../src/lib/serviceRates.js')
  const target = getCashierBillTarget(bill)
  // Exactly what CashierBill.jsx renders before a loyalty amount is typed.
  const pageQuote = getFreshCashierPaymentQuote({ orders, menuItems, settings, ...target })
  const billTotal = applyLoyaltyToCashierPaymentQuote(pageQuote, 0).total
  const tileTotal = getCashierBillTotal(bill, { orders, menuItems, settings })
  // What the tile printed before the fix: per-order getOrderTotal over cashier-visible orders.
  const oldTileTotal = orders
    .filter(isCashierVisibleBill)
    .filter(candidate => target.orderId ? candidate.id === target.orderId : candidate.table_id === target.tableId)
    .reduce((sum, candidate) => sum + getOrderTotal(candidate, getConfiguredServiceRatePct(settings, candidate.price_mode)), 0)
  return { tileTotal, billTotal, oldTileTotal }
}

// order() keeps a fixed set of columns; extra ones (price_mode, loyalty_used_amount) are spread on top.
const dineIn = overrides => ({ ...order({ order_type: 'dine_in', table_id: 't1', table_name: 'T1', status: 'needs_bill', ...overrides }), ...overrides })

test('tile total equals bill total for rounds saved with different service rates', async () => {
  const orders = [
    dineIn({ id: 'regular', service_rate_pct: 15, items: [item({ id: 'a', price: 33_333 })] }),
    dineIn({ id: 'tourist', service_rate_pct: 20, price_mode: 'tourist', items: [item({ id: 'b', price: 41_000, quantity: 0.7 })] }),
  ]
  const { tileTotal, billTotal } = await tileAndBillTotals({ orders }, orders[0])
  // 33 333 + 5 000 service, plus 28 700 (41 000 x 0.7) + 5 740 service.
  assert.equal(billTotal, 72_773)
  assert.equal(tileTotal, billTotal)
  assert.equal(Number.isInteger(tileTotal), true)
})

test('tile total equals bill total when an unpaid order still stores a loyalty amount', async () => {
  const orders = [
    dineIn({ id: 'o1', service_rate_pct: 10, loyalty_used_amount: 20_000, items: [item({ price: 100_000 })] }),
  ]
  const { tileTotal, billTotal, oldTileTotal } = await tileAndBillTotals({ orders }, orders[0])
  // The bill page ignores a loyalty amount left on an unpaid order (it is re-entered at checkout).
  assert.equal(billTotal, 110_000)
  assert.equal(tileTotal, billTotal)
  assert.equal(oldTileTotal, 90_000)
})

test('tile total equals bill total for a quick counter item, which carries no service fee', async () => {
  const menuItems = [
    { id: 'm1', show_in_cashier_quick_items: false },
    { id: 'box', show_in_cashier_quick_items: true },
  ]
  const orders = [
    dineIn({ id: 'o1', service_rate_pct: 15, items: [
      item({ id: 'food', menu_item_id: 'm1', price: 80_000 }),
      // Sent by a waiter: the row itself is not flagged as a counter item, the menu item is.
      item({ id: 'box', menu_item_id: 'box', price: 3_000, quantity: 2 }),
    ] }),
  ]
  const { tileTotal, billTotal, oldTileTotal } = await tileAndBillTotals({ orders, menuItems }, orders[0])
  assert.equal(billTotal, 80_000 + 12_000 + 6_000)
  assert.equal(tileTotal, billTotal)
  assert.equal(oldTileTotal, 98_900)
})

test('tile total covers every open round of the table, as the bill page does', async () => {
  const orders = [
    dineIn({ id: 'billed', service_rate_pct: 0, items: [item({ id: 'a', price: 50_000 })] }),
    dineIn({ id: 'later', status: 'sent_to_kitchen', service_rate_pct: 0, items: [item({ id: 'b', price: 10_000 })] }),
    dineIn({ id: 'other-table', table_id: 't2', service_rate_pct: 0, items: [item({ id: 'c', price: 7_000 })] }),
    dineIn({ id: 'paid', payment_status: 'paid', service_rate_pct: 0, items: [item({ id: 'd', price: 9_000 })] }),
  ]
  const { tileTotal, billTotal, oldTileTotal } = await tileAndBillTotals({ orders }, orders[0])
  assert.equal(billTotal, 60_000)
  assert.equal(tileTotal, billTotal)
  assert.equal(oldTileTotal, 50_000)
})

test('an off-premise tile is quoted by order, never by a shared table id', async () => {
  const { getCashierBillTarget } = await import('../src/lib/cashierBills.js')
  const orders = [
    order({ id: 'ta-1', table_id: 'counter', items: [item({ id: 'a', price: 20_000 })] }),
    order({ id: 'ta-2', table_id: 'counter', items: [item({ id: 'b', price: 30_000 })] }),
  ]
  assert.deepEqual(getCashierBillTarget(orders[1]), { tableId: null, orderId: 'ta-2' })
  assert.deepEqual(getCashierBillTarget(dineIn({ id: 'x' })), { tableId: 't1', orderId: null })
  const { tileTotal, billTotal } = await tileAndBillTotals({ orders }, orders[1])
  assert.equal(tileTotal, 30_000)
  assert.equal(tileTotal, billTotal)
})

test('a bill line total is whole UZS for a weight line', async () => {
  const { getOrderItemLineTotal } = await import('../src/lib/analytics.js')
  assert.equal(84_500 * 0.355, 29_997.5)
  assert.equal(getOrderItemLineTotal({ unit_price: 84_500, quantity: 0.355 }), 29_998)
  assert.equal(getOrderItemLineTotal({ unit_price: 42_000, quantity: 0.7 }), 29_400)
  assert.equal(getOrderItemLineTotal({ price: 25_000, quantity: 3 }), 75_000)
  // Same quantity fallback as the bill summary: a missing quantity is one portion.
  assert.equal(getOrderItemLineTotal({ price: 25_000 }), 25_000)
  assert.equal(getOrderItemLineTotal(null), 0)
})
