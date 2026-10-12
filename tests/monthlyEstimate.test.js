import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMonthComparisonRows,
  getEstimateMonthDays,
  getMonthlyEstimateMethodRows,
  getMonthlyEstimateOutlook,
  projectRemainingAtPace,
  summarizeEstimateMonthActuals,
} from '../src/lib/monthlyEstimate.js'

function paidOrder(overrides = {}) {
  return {
    id: overrides.id || 'paid-order',
    status: 'paid',
    payment_status: 'paid',
    service_rate_pct: 0,
    loyalty_used_amount: 30000,
    items: [{ menu_item_id: 'kebab', quantity: 1, price: 100000, status: 'served' }],
    payments: [{ method: 'cash', amount: 70000 }],
    ...overrides,
  }
}

test('monthly estimate reconciles loyalty wallet inflow missing from stored split rows', () => {
  const rows = getMonthlyEstimateMethodRows(
    [paidOrder()],
    [{ entry_type: 'income', payment_method: 'card', amount: 20000 }],
    [{ payment_method: 'cash', amount: 10000 }]
  )

  assert.deepEqual(rows, [
    { method: 'cash', inflow: 70000, outflow: 10000 },
    { method: 'card', inflow: 20000, outflow: 0 },
    { method: 'loyalty_card', inflow: 30000, outflow: 0 },
  ])
  assert.equal(rows.reduce((sum, row) => sum + row.inflow, 0), 120000)
})

test('monthly estimate does not duplicate loyalty already present in payment rows', () => {
  const rows = getMonthlyEstimateMethodRows([
    paidOrder({
      payments: [
        { method: 'cash', amount: 70000 },
        { method: 'loyalty_card', amount: 30000 },
      ],
    }),
  ])

  assert.deepEqual(rows, [
    { method: 'cash', inflow: 70000, outflow: 0 },
    { method: 'loyalty_card', inflow: 30000, outflow: 0 },
  ])
  assert.equal(rows.reduce((sum, row) => sum + row.inflow, 0), 100000)
})

test('month outlook projects sales from completed days and counts today as remaining', () => {
  const outlook = getMonthlyEstimateOutlook({
    monthStart: '2026-10-01',
    monthEnd: '2026-10-31',
    today: '2026-10-11',
    salesRevenue: 72_000_000,
    completedSalesRevenue: 70_000_000,
    otherIncome: 5_000_000,
    actualOut: 50_000_000,
    expectedOut: 150_000_000,
  })
  assert.equal(outlook.status, 'open')
  assert.equal(outlook.completedDays, 10)
  assert.equal(outlook.remainingDays, 21)
  assert.equal(outlook.averageDailySales, 7_000_000)
  // 21 remaining days at the average, minus what today already brought in.
  assert.equal(outlook.projectedRemainingSales, 7_000_000 * 21 - 2_000_000)
  assert.equal(outlook.inSoFar, 77_000_000)
  assert.equal(outlook.stillDue, 100_000_000)
  assert.equal(outlook.projectedLeft, 77_000_000 + 145_000_000 - 150_000_000)
  assert.equal(outlook.requiredDailySales, Math.ceil((150_000_000 - 77_000_000) / 21))
})

test('month outlook has no projection on the first day or for future months, and none left for closed months', () => {
  const firstDay = getMonthlyEstimateOutlook({ monthStart: '2026-10-01', monthEnd: '2026-10-31', today: '2026-10-01', salesRevenue: 1_000, expectedOut: 31_000 })
  assert.equal(firstDay.averageDailySales, null)
  assert.equal(firstDay.hasProjection, false)
  assert.equal(firstDay.remainingDays, 31)
  assert.equal(firstDay.requiredDailySales, Math.ceil(30_000 / 31))

  const future = getMonthlyEstimateOutlook({ monthStart: '2026-11-01', monthEnd: '2026-11-30', today: '2026-10-12', expectedOut: 30_000 })
  assert.equal(future.status, 'future')
  assert.equal(future.hasProjection, false)
  assert.equal(future.requiredDailySales, 1_000)

  const closed = getMonthlyEstimateOutlook({ monthStart: '2026-09-01', monthEnd: '2026-09-30', today: '2026-10-12', salesRevenue: 90_000, actualOut: 60_000, expectedOut: 60_000 })
  assert.equal(closed.status, 'closed')
  assert.equal(closed.averageDailySales, 3_000)
  assert.equal(closed.projectedRemainingSales, 0)
  assert.equal(closed.projectedLeft, 30_000)
  assert.equal(closed.requiredDailySales, null)
})

test('bazaar spending is projected at the completed-day pace', () => {
  const days = getEstimateMonthDays('2026-10-01', '2026-10-31', '2026-10-11')
  // 10 completed days at 1.2M; today already 500k of the 21 remaining days.
  const pace = projectRemainingAtPace({ soFar: 12_500_000, completedSoFar: 12_000_000, days })
  assert.equal(pace.averageDaily, 1_200_000)
  assert.equal(pace.remaining, 1_200_000 * 21 - 500_000)
  assert.equal(projectRemainingAtPace({ soFar: 9, completedSoFar: 0, days: getEstimateMonthDays('2026-10-01', '2026-10-31', '2026-10-01') }).remaining, 0)
  assert.equal(projectRemainingAtPace({ soFar: 30, completedSoFar: 30, days: getEstimateMonthDays('2026-09-01', '2026-09-30', '2026-10-12') }).remaining, 0)
})

test('last month actuals use salary operating cost and compare row by row', () => {
  const previous = summarizeEstimateMonthActuals({
    salesRevenue: 200_000_000,
    incomeTotal: 10_000_000,
    salaryOperatingCost: 90_000_000,
    salaryBonusTotal: 5_000_000,
    byCategory: { products_bazaar: 40_000_000, rent: 15_000_000, utilities: 3_000_000 },
    employeeMealTotal: 7_000_000,
    manualExpenseTotal: 60_000_000,
  })
  assert.equal(previous.payroll, 95_000_000)
  assert.equal(previous.other, 2_000_000)
  assert.equal(previous.expectedOut, 95_000_000 + 40_000_000 + 7_000_000 + 15_000_000 + 3_000_000 + 2_000_000)
  assert.equal(previous.left, 210_000_000 - previous.expectedOut)

  const rows = buildMonthComparisonRows({ ...previous, products: 50_000_000, other: 0 }, previous)
  const byKey = Object.fromEntries(rows.map(row => [row.key, row]))
  assert.equal(byKey.products.change, 10_000_000)
  assert.equal(byKey.products.changePct, 25)
  assert.equal(byKey.other.changePct, -100)
  assert.equal(buildMonthComparisonRows({ rent: 5 }, { rent: 0 })[5].changePct, null)
})

test('method rows add paid-order income already summed per method by the summary RPC', () => {
  const rows = getMonthlyEstimateMethodRows(
    [],
    [{ payment_method: 'card', amount: 50 }],
    [{ payment_method: 'cash', amount: 30 }],
    { cash: 1_000, card: 400, terminal: 0, loyalty_card: 20, salary: 0 },
  )
  assert.deepEqual(rows, [
    { method: 'cash', inflow: 1_000, outflow: 30 },
    { method: 'card', inflow: 450, outflow: 0 },
    { method: 'loyalty_card', inflow: 20, outflow: 0 },
  ])
})
