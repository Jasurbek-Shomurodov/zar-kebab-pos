import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDishAnalysisFromRpc } from '../src/lib/reportsRpc.js'

test('dish analysis from the reader keeps unsold menu dishes and fills sold ones', () => {
  const menuItems = [
    { id: 'm1', name_en: 'Kebab', category_id: 'c1', available: true },
    { id: 'm2', name_en: 'Salad', category_id: 'c2', available: true },
  ]
  const rpc = {
    dishes: [
      { dish_key: 'menu:m1', name: 'Kebab', menu_item_id: 'm1', category_id: 'c1', direct_quantity: 3, direct_revenue: 90000, direct_orders: 2, sale_lines: 2, first_sold_at: '2026-11-01T10:00:00Z', last_sold_at: '2026-11-02T10:00:00Z', included_quantity: 0 },
    ],
    selected: null,
  }
  const analysis = buildDishAnalysisFromRpc(rpc, menuItems, 'all')
  const kebab = analysis.dishes.find(d => d.key === 'menu:m1')
  const salad = analysis.dishes.find(d => d.key === 'menu:m2')
  assert.equal(kebab.quantity, 3)
  assert.equal(kebab.revenue, 90000)
  assert.equal(kebab.orders, 2)
  assert.equal(salad.quantity, 0)
  assert.equal(analysis.selectedDish, null)
})

test('dish analysis from the reader maps selected detail and keeps set revenue at zero', () => {
  const rpc = {
    dishes: [],
    selected: {
      key: 'menu:m1', quantity: 5, direct_quantity: 3, included_quantity: 2, revenue: 90000,
      orders: 2, sale_lines: 3, first_sold_at: null, last_sold_at: null,
      daily: [{ date: '2026-11-01', quantity: 5, revenue: 90000, orders: 2, sale_lines: 3 }],
      hourly: [{ hour: 12, quantity: 5, revenue: 90000, orders: 2, sale_lines: 3 }],
      sources: [{ key: 'menu:m1', name: 'Kebab', quantity: 3, revenue: 90000, orders: 2, sale_lines: 2, included_in_set: false }],
      sales: [{ dish_name: 'Kebab', order_id: 'o1', order_date: '2026-11-01T07:00:00Z', date: '2026-11-01', hour: 12, quantity: 3, revenue: 90000, source_key: 'menu:m1', source_name: 'Kebab', included_in_set: false }],
    },
  }
  const analysis = buildDishAnalysisFromRpc(rpc, [], 'menu:m1')
  assert.equal(analysis.totals.quantity, 5)
  assert.equal(analysis.totals.includedQuantity, 2)
  assert.equal(analysis.totals.averagePerOrder, 2.5)
  assert.equal(analysis.daily[0].date, '2026-11-01')
  assert.equal(analysis.hourly[0].hour, 12)
  assert.equal(analysis.sources[0].key, 'menu:m1')
  assert.equal(analysis.sales[0].dishName, 'Kebab')
})

test('reports page reads every figure from the reader functions, not the full order list', () => {
  const source = readFileSync(new URL('../src/pages/Reports.jsx', import.meta.url), 'utf8')
  assert.match(source, /loadReportsOverview\(reportArgs\)/)
  assert.match(source, /loadReportsOrderPage\(\{/)
  assert.match(source, /const kpiRevenue\s+= Number\(overview\.kpi\?\.revenue\)/)
  assert.doesNotMatch(source, /const kpiRevenue\s+= filteredForAnalytics/)
})

test('closeout from the overview reader keeps the getDailyCloseout shape', async () => {
  const { buildCloseoutFromOverview } = await import('../src/lib/reportsRpc.js')
  const { getDailyCloseout } = await import('../src/lib/closeout.js')
  const overview = {
    kpi: { revenue: 300000, loyalty: 5000, orders: 3 },
    cashback: 1500,
    cancelled_count: 2,
    payment_methods: [
      { method: 'cash', revenue: 200000 },
      { method: 'card', revenue: 95000 },
      { method: 'loyalty_card', revenue: 5000 },
      { method: 'unknown', revenue: 700 },
    ],
  }
  const closeout = buildCloseoutFromOverview(overview, '2026-11-01', '2026-11-17')
  const reference = getDailyCloseout([], '2026-11-01', '2026-11-17')
  assert.deepEqual(Object.keys(closeout).sort(), Object.keys(reference).sort())
  assert.deepEqual(Object.keys(closeout.totals).sort(), Object.keys(reference.totals).sort())
  assert.equal(closeout.totals.cash, 200000)
  assert.equal(closeout.totals.other, 700)
  assert.equal(closeout.loyaltyIncome, 5000)
  assert.equal(closeout.cashbackIssued, 1500)
  assert.equal(closeout.cancelledCount, 2)
  assert.equal(closeout.variance, null)
})
