import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIncomeMonthOptions, incomeMonthColors, hideZeroIncomeMonths, loadDashboardWeeklyIncome } from '../src/lib/weeklyIncome.js'
test('weekly loader is bounded by selected ending month and normalizes money', async () => {
  const rows = await loadDashboardWeeklyIncome('2026-02-01', { dbClient: { rpc: async (name, args) => {
    assert.equal(name, 'get_dashboard_recent_period_income')
    assert.deepEqual(args, { p_month_start: '2026-02-01' })
    return { data: [{ week_start: '2026-02-21', week_end: '2026-02-28', total_income: '800', day_count: 8, average_daily_income: '100' }] }
  } } })
  assert.deepEqual(rows, [{ weekStart: '2026-02-21', weekEnd: '2026-02-28', totalIncome: 800, dayCount: 8, averageDailyIncome: 100 }])
})
test('weekly loader rejects invalid months and propagates failures', async () => {
  await assert.rejects(loadDashboardWeeklyIncome('2026-13-01'), /Invalid month/)
  await assert.rejects(loadDashboardWeeklyIncome('2026-01-01', { dbClient: { rpc: async () => ({ error: new Error('offline') }) } }), /offline/)
})

test('hides wholly zero-income months but preserves zero periods in active months', () => {
  const rows = [
    { weekStart: '2026-05-01', totalIncome: 0 },
    { weekStart: '2026-05-11', totalIncome: 0 },
    { weekStart: '2026-06-01', totalIncome: 0 },
    { weekStart: '2026-06-11', totalIncome: 100 },
    { weekStart: '2026-06-21', totalIncome: 0 },
  ]
  assert.deepEqual(hideZeroIncomeMonths(rows), rows.slice(2))
  assert.deepEqual(hideZeroIncomeMonths(rows.slice(0, 2)), [])
  assert.deepEqual(hideZeroIncomeMonths([]), [])
  assert.equal(rows.length, 5)
})

test('month options stop at cafe opening month across year boundaries', () => {
  assert.deepEqual(buildIncomeMonthOptions('2025-11', '2026-02'), ['2026-02', '2026-01', '2025-12', '2025-11'])
  assert.deepEqual(buildIncomeMonthOptions('2026-06', '2026-06'), ['2026-06'])
})
test('month colors remain stable with distinct colors across the visible range', () => {
  const months = buildIncomeMonthOptions('2025-09', '2026-09')
  assert.equal(new Set(months.map(month => incomeMonthColors(month).border)).size, months.length)
  assert.deepEqual(incomeMonthColors('2026-09'), incomeMonthColors('2026-09'))
})

test('first order month is looked up once and then read from browser storage', async () => {
  const { loadFirstOrderMonth, FIRST_ORDER_MONTH_STORAGE_KEY } = await import('../src/lib/weeklyIncome.js')
  const store = new Map()
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  let lookups = 0
  const options = {
    loadEarliestDate: async () => { lookups += 1; return '2026-05-31T20:15:00Z' },
    toMonth: date => (date.startsWith('2026-05-31T20') ? '2026-06' : date.slice(0, 7)),
    storage,
  }
  assert.equal(await loadFirstOrderMonth(options), '2026-06')
  assert.equal(store.get(FIRST_ORDER_MONTH_STORAGE_KEY), '2026-06')
  assert.equal(await loadFirstOrderMonth(options), '2026-06')
  assert.equal(lookups, 1)

  // Garbage in storage is ignored; blocked storage still returns the month.
  store.set(FIRST_ORDER_MONTH_STORAGE_KEY, 'not-a-month')
  assert.equal(await loadFirstOrderMonth(options), '2026-06')
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(await loadFirstOrderMonth({ ...options, storage: blocked }), '2026-06')
  // No orders yet: nothing is remembered.
  const empty = new Map()
  assert.equal(await loadFirstOrderMonth({ ...options, loadEarliestDate: async () => '', storage: { getItem: key => empty.get(key) ?? null, setItem: (key, value) => empty.set(key, value) } }), '')
  assert.equal(empty.size, 0)
})
