import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildHourlyComparison, buildMonthGlance, buildPeriodHighlights, buildTodayGlance, buildWeekdayAverages } from '../src/lib/dashboardInsights.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const accessors = { hourOf: order => order.hour, revenueOf: order => order.amount }

test('hourly comparison covers the trading day and leaves future hours empty', () => {
  const rows = buildHourlyComparison(
    [{ hour: 10, amount: 100 }, { hour: 12, amount: 300 }, { hour: 12, amount: 50 }],
    [{ hour: 9, amount: 80 }, { hour: 13, amount: 200 }, { hour: 21, amount: 40 }],
    13,
    accessors,
  )
  assert.equal(rows[0].hour, 9)
  assert.equal(rows.at(-1).hour, 21)
  assert.deepEqual(rows.find(row => row.hour === 12), { hour: 12, today: 350, yesterday: 0, isCurrent: false })
  assert.equal(rows.find(row => row.hour === 13).isCurrent, true)
  assert.equal(rows.find(row => row.hour === 14).today, null)
})

test('today is compared with yesterday up to the same hour', () => {
  const rows = buildHourlyComparison([{ hour: 10, amount: 100 }, { hour: 12, amount: 400 }], [{ hour: 11, amount: 250 }, { hour: 20, amount: 900 }], 12, accessors)
  const glance = buildTodayGlance(rows, { orderCount: 4, revenue: 500 })
  assert.equal(glance.sameTimeYesterday, 250)
  assert.equal(glance.sameTimeChangePct, 100)
  assert.equal(glance.averageCheck, 125)
  assert.deepEqual(glance.peakHour, { hour: 12, amount: 400 })
  assert.deepEqual(glance.yesterdayPeakHour, { hour: 20, amount: 900 })
  assert.equal(buildTodayGlance([], { orderCount: 0, revenue: 0 }).averageCheck, null)
})

test('weekday averages rank by average and skip weekdays with no days', () => {
  // 2026-11-02 is a Monday, 2026-11-07 a Saturday.
  const ranked = buildWeekdayAverages([
    { date: '2026-11-02', income: 100 }, { date: '2026-11-09', income: 300 },
    { date: '2026-11-07', income: 500 },
  ])
  assert.deepEqual(ranked.map(row => [row.weekday, row.average, row.days]), [[6, 500, 1], [1, 200, 2]])
})

test('the month so far uses completed days for its average and compares the same days of last month', () => {
  const dailyRows = [
    { date: '2026-10-01', cafe_income: 1000 }, { date: '2026-10-02', cafe_income: 1000 }, { date: '2026-10-15', cafe_income: 5000 },
    { date: '2026-11-01', cafe_income: 1500 }, { date: '2026-11-02', cafe_income: 900 }, { date: '2026-11-03', cafe_income: 300 },
  ]
  const spending = { categories: [
    { key: 'rent', isOther: false, color: '#1', current: 600, previous: 600 },
    { key: 'salaries', isOther: false, color: '#2', current: 900, previous: 1800 },
    { key: 'gas', isOther: false, color: '#3', current: 0, previous: 100 },
  ] }
  const glance = buildMonthGlance({ dailyRows, spending, today: '2026-11-03', targetOn: () => 1000 })
  assert.equal(glance.incomeToDate, 2700)
  assert.equal(glance.completedDays, 2)
  assert.equal(glance.averageDaily, 1200)
  assert.equal(glance.forecast, 36000)
  assert.equal(glance.previousSameIncome, 2000)
  assert.equal(glance.sameDaysChangePct, 20)
  assert.equal(glance.previousMonthIncome, 7000)
  assert.deepEqual(glance.bestDay, { date: '2026-11-01', amount: 1500 })
  assert.deepEqual(glance.weakestDay, { date: '2026-11-02', amount: 900 })
  assert.equal(glance.daysAboveTarget, 1)
  assert.equal(glance.daysWithTarget, 2)
  assert.equal(glance.targetGap, 400)
  assert.equal(glance.spentThisMonth, 1500)
  assert.equal(glance.spentLastMonth, 2500)
  assert.deepEqual(glance.categories.map(row => [row.key, row.amount, row.sharePct, row.changePct]), [['salaries', 900, 60, -50], ['rent', 600, 40, 0]])
  assert.equal(glance.left, 1200)
})

test('on the first of the month there is no average, forecast or comparison yet', () => {
  const glance = buildMonthGlance({ dailyRows: [{ date: '2026-11-01', cafe_income: 400 }], today: '2026-11-01' })
  assert.equal(glance.averageDaily, null)
  assert.equal(glance.forecast, null)
  assert.equal(glance.sameDaysChangePct, null)
  assert.equal(glance.spentThisMonth, null)
  assert.equal(glance.left, null)
  assert.deepEqual(glance.bestDay, { date: '2026-11-01', amount: 400 })
})

test('period highlights name the best and weakest days, the top category and covered days', () => {
  const incomeDays = [
    { date: '2026-11-01', total: 100 }, { date: '2026-11-02', total: 400 }, { date: '2026-11-03', total: 0 },
    { date: '2026-11-04', total: 300 }, { date: '2026-11-05', total: 500 }, { date: '2026-11-06', total: 600 },
    { date: '2026-11-07', total: 900 },
  ]
  const spendingDays = incomeDays.map(day => ({ date: day.date, total: day.date === '2026-11-04' ? 800 : 50 }))
  const highlights = buildPeriodHighlights({
    incomeDays,
    spendingDays,
    categories: [{ key: 'rent', amount: 600 }, { key: '__other__', amount: 400, isOther: true }],
    largest: [{ id: 'a', amount: 500 }],
    today: '2026-11-07',
  })
  assert.deepEqual(highlights.bestDay, { date: '2026-11-07', amount: 900, sharePct: 32 })
  assert.deepEqual(highlights.weakestDay, { date: '2026-11-01', amount: 100 })
  assert.deepEqual(highlights.biggestSpendDay, { date: '2026-11-04', amount: 800 })
  assert.deepEqual(highlights.topCategory, { key: 'rent', amount: 600, sharePct: 60 })
  assert.equal(highlights.largestPayment.id, 'a')
  assert.equal(highlights.comparableDays, 6)
  assert.equal(highlights.coveredDays, 4)
  assert.equal(highlights.momentumPct, 180)
  assert.equal(buildPeriodHighlights({ incomeDays: null, today: '2026-11-07' }).incomeReady, false)
})

test('Dashboard and Financial analysis draw their insights from the shared helpers', () => {
  const dashboard = read('src/pages/AdminDashboard.jsx')
  assert.match(dashboard, /buildHourlyComparison\(/)
  assert.match(dashboard, /buildTodayGlance\(/)
  assert.match(dashboard, /<MonthGlancePanel\b/)
  // The month panel reads Accounting totals: only for people who may open Financial analysis.
  assert.match(dashboard, /canViewPage\(profile[^)]*'financial_analysis'\)/)
  const panel = read('src/components/MonthGlancePanel.jsx')
  assert.match(panel, /buildMonthGlance\(/)
  assert.match(panel, /loadAccountingDailyIncome\(/)
  assert.match(panel, /loadAccountingMonthlyBreakdown\(2\)/)
  assert.match(panel, /<BarChart\b/)
  assert.match(panel, /<Shimmer\b/)
  const analysis = read('src/pages/AccountingAnalysis.jsx')
  assert.match(analysis, /buildPeriodHighlights\(/)
  assert.match(analysis, /<PeriodHighlights\b/)
})

test('loading placeholders use the shared shimmer, not a pulsing grey box', () => {
  for (const path of ['src/pages/Reports.jsx', 'src/components/BreakEvenTargetHistoryDialog.jsx', 'src/pages/AdminDashboard.jsx', 'src/components/MonthGlancePanel.jsx']) {
    assert.doesNotMatch(read(path), /animate-pulse/, path)
  }
})

test('drawer rows are links grouped by what the owner is doing', () => {
  const sidebar = read('src/components/UnifiedSidebar.jsx')
  assert.match(sidebar, /<a\s+href=\{item\.path\}/)
  // A modified click opens a new tab instead of being swallowed by the router.
  assert.match(sidebar, /event\.metaKey \|\| event\.ctrlKey/)
  assert.match(sidebar, /key: 'reports',[\s\S]{0,200}group: 'money'/)
  assert.match(sidebar, /key: 'financial_analysis',[\s\S]{0,300}group: 'money'/)
  assert.match(sidebar, /key: 'team',[\s\S]{0,200}group: 'admin'/)
})
