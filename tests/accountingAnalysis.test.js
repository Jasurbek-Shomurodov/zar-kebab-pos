import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ANALYSIS_MAX_CATEGORIES,
  ANALYSIS_OTHER_COLOR,
  assignCategoryColors,
  buildAccountingIndicators,
  buildAccountingProfitAndLoss,
  buildAccountingSankey,
  buildAccountingTrend,
  buildTrendBuckets,
  getTrendIntervals,
  buildCategoryComparison,
  buildDailySpending,
  buildGrowthOverview,
  buildLargestPayments,
  buildMonthlyProfitRows,
  buildPaybackSummary,
  getPercentChange,
  getPreviousAccountingPeriod,
  getTopExpenseCategories,
} from '../src/lib/accountingAnalysis.js'

test('previous period has the same length and ends before the selected period', () => {
  assert.deepEqual(getPreviousAccountingPeriod('2026-10-01', '2026-10-12'), { dateFrom: '2026-09-19', dateTo: '2026-09-30' })
  assert.deepEqual(getPreviousAccountingPeriod('2026-03-01', '2026-03-01'), { dateFrom: '2026-02-28', dateTo: '2026-02-28' })
})

test('long-tail categories fold into one Other slot with a neutral colour', () => {
  const byCategory = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`c${index}`, (index + 1) * 100]))
  const top = getTopExpenseCategories(byCategory)
  assert.equal(top.length, ANALYSIS_MAX_CATEGORIES)
  assert.equal(top[0].key, 'c9')
  const other = top.at(-1)
  assert.equal(other.isOther, true)
  assert.equal(other.amount, 100 + 200 + 300 + 400)
  assert.equal(top.reduce((sum, row) => sum + row.amount, 0), 5500)
  assert.equal(assignCategoryColors(top)[other.key], ANALYSIS_OTHER_COLOR)
})

test('sankey balances income and spending with a Left or reserves node', () => {
  const surplus = buildAccountingSankey({ cafeIncome: 1000, investorSupport: 200, categories: [{ key: 'rent', amount: 700 }] })
  assert.equal(surplus.total, 1200)
  assert.deepEqual(surplus.targets.at(-1), { key: '__left__', amount: 500, isLeft: true })

  const deficit = buildAccountingSankey({ cafeIncome: 300, categories: [{ key: 'rent', amount: 700 }] })
  assert.equal(deficit.total, 700)
  assert.deepEqual(deficit.sources.at(-1), { key: 'reserves', amount: 400, isReserve: true })
  assert.equal(deficit.sources.reduce((sum, node) => sum + node.amount, 0), deficit.targets.reduce((sum, node) => sum + node.amount, 0))
})

test('daily spending groups expenses per calendar day and ignores income', () => {
  const days = buildDailySpending([
    { entry_type: 'expense', expense_date: '2026-10-01', category: 'salary_cook', amount: 100 },
    { entry_type: 'expense', expense_date: '2026-10-01', category: 'products_bazaar', amount: 50 },
    { entry_type: 'expense', expense_date: '2026-10-02', category: 'rent', amount: 30 },
    { entry_type: 'income', expense_date: '2026-10-02', category: 'investor_support', amount: 999 },
    { entry_type: 'expense', expense_date: '2026-11-01', category: 'rent', amount: 999 },
  ], '2026-10-01', '2026-10-03')
  assert.deepEqual(days.map(day => day.total), [150, 30, 0])
  assert.equal(days[0].salaries, 100)
  assert.equal(days[0].bazaar, 50)
  assert.equal(days[1].other, 30)
})

test('indicators derive ratios from the shared accounting summary', () => {
  const indicators = buildAccountingIndicators({
    cafeIncome: 1000,
    incomeSummary: { total: 0 },
    expenseSummary: { total: 600 },
    productBazaarExpensesTotal: 250,
    salaryExpensesTotal: 300,
    investorSupportTotal: 0,
  }, { dayCount: 10, allTimeBalance: 1200 })
  assert.equal(indicators.left, 400)
  assert.equal(indicators.savingsRatePct, 40)
  assert.equal(indicators.avgDailySpend, 60)
  assert.equal(indicators.runwayDays, 20)
  assert.equal(indicators.foodCostPct, 25)
  assert.equal(indicators.payrollSharePct, 50)
  assert.equal(buildAccountingIndicators({}, {}).savingsRatePct, null)
})

test('category comparison reports change and marks new categories', () => {
  const rows = buildCategoryComparison({ rent: 200, gas: 50 }, { rent: 100, water: 40 })
  assert.deepEqual(rows.map(row => row.key), ['rent', 'gas', 'water'])
  assert.equal(rows[0].changePct, 100)
  assert.equal(rows[1].changePct, null)
  assert.equal(rows[2].changePct, -100)
  assert.equal(getPercentChange(0, 0), 0)
})

test('Financial analysis is its own drawer tab behind its own Team access', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../src/components/UnifiedSidebar.jsx', import.meta.url), 'utf8')
  const accounting = readFileSync(new URL('../src/pages/Expenses.jsx', import.meta.url), 'utf8')
  const analysis = readFileSync(new URL('../src/pages/AccountingAnalysis.jsx', import.meta.url), 'utf8')
  assert.match(app, /path="\/admin\/financial-analysis"[\s\S]*?page="financial_analysis"><AccountingAnalysis \/>/)
  assert.match(app, /path="\/admin\/financial-analysis\/estimate"[\s\S]*?page="financial_analysis"><MonthlyEstimate \/>/)
  assert.match(app, /path="\/admin\/accounting\/analysis" element=\{<Navigate to="\/admin\/financial-analysis" replace \/>\}/)
  assert.match(sidebar, /key: 'financial_analysis',\s+accessKey: 'financial_analysis',[\s\S]{0,200}path: '\/admin\/financial-analysis'/)
  assert.match(sidebar, /canViewPage\(profile \|\| \{ role \}, item\.accessKey \|\| item\.key\)/)
  assert.match(sidebar, /startsWith\('\/admin\/financial-analysis'\)\) return 'financial_analysis'/)
  // Accounting is for recording; income/profit and charts live on Financial analysis.
  assert.doesNotMatch(accounting, /accounting-income-heading|ExpenseCategoryChart|l\.netProfit|accounting\/analysis/)
  assert.match(analysis, /getAccountingAnalysisSummary\(/)
  assert.doesNotMatch(analysis, /\balert\(|window\.confirm/)
})

test('profit and loss lists every category, groups them, and nets to the Sankey remainder', () => {
  const pnl = buildAccountingProfitAndLoss({
    cafeIncome: 1000,
    salesCost: 350,
    incomeByCategory: { investor_support: 200 },
    expenseByCategory: { salary_cook: 300, salary_waiter: 100, products_bazaar: 250, employee_meals: 50, utilities: 40, rent: 0 },
  })
  assert.deepEqual(pnl.incomeLines.map(line => line.key), ['__cafe__', 'investor_support'])
  assert.equal(pnl.incomeTotal, 1200)
  assert.equal(pnl.expenseLines.length, 5)
  assert.equal(pnl.expenseTotal, 740)
  assert.deepEqual(pnl.groups.map(group => [group.key, group.amount]), [['salaries', 400], ['bazaar', 250], ['meals', 50], ['other', 40]])
  assert.equal(pnl.net, 460)
  assert.deepEqual(pnl.gross, { sales: 1000, cost: 350, profit: 650, marginPct: 65 })
  assert.equal(buildAccountingProfitAndLoss({ incomeByCategory: { investor_support: 5 } }).gross, null)
  const sankey = buildAccountingSankey({ cafeIncome: 1000, investorSupport: 200, categories: pnl.expenseLines })
  assert.equal(sankey.targets.find(target => target.isLeft).amount, pnl.net)
})

test('trend buckets are Monday weeks and calendar months clipped to the range', () => {
  assert.deepEqual(buildTrendBuckets('2026-10-01', '2026-10-12', 'week'), [
    { key: '2026-09-28', dateFrom: '2026-10-01', dateTo: '2026-10-04' },
    { key: '2026-10-05', dateFrom: '2026-10-05', dateTo: '2026-10-11' },
    { key: '2026-10-12', dateFrom: '2026-10-12', dateTo: '2026-10-12' },
  ])
  assert.deepEqual(buildTrendBuckets('2026-08-20', '2026-10-03', 'month').map(bucket => [bucket.key, bucket.dateFrom, bucket.dateTo]), [
    ['2026-08', '2026-08-20', '2026-08-31'], ['2026-09', '2026-09-01', '2026-09-30'], ['2026-10', '2026-10-01', '2026-10-03'],
  ])
  assert.equal(buildTrendBuckets('2026-10-01', '2026-10-12', 'day').length, 12)
  assert.deepEqual(buildTrendBuckets('2026-08-05', '2026-09-09', 'decade').map(bucket => [bucket.dateFrom, bucket.dateTo]), [
    ['2026-08-05', '2026-08-10'], ['2026-08-11', '2026-08-20'], ['2026-08-21', '2026-08-31'], ['2026-09-01', '2026-09-09'],
  ])
})

test('trend intervals cap the bucket count and default to a readable one', () => {
  assert.deepEqual(getTrendIntervals('2026-10-01', '2026-10-12'), { available: ['day', 'week', 'decade', 'month'], preferred: 'day' })
  assert.deepEqual(getTrendIntervals('2026-09-01', '2026-10-12'), { available: ['week', 'decade', 'month'], preferred: 'week' })
  assert.deepEqual(getTrendIntervals('2025-01-01', '2026-10-12').available, ['month'])
})

test('trend rows add bucket cafe income to recorded income and group spending', () => {
  const buckets = buildTrendBuckets('2026-10-01', '2026-10-12', 'week')
  const rows = buildAccountingTrend(buckets, { '2026-09-28': 500, '2026-10-05': 900 }, [
    { entry_type: 'expense', expense_date: '2026-10-02', category: 'products_bazaar', amount: 120 },
    { entry_type: 'expense', expense_date: '2026-10-06', category: 'salary_cook', amount: 400, is_salary_payment: true },
    { entry_type: 'expense', expense_date: '2026-10-06', category: 'utilities', amount: 30 },
    { entry_type: 'income', expense_date: '2026-10-12', category: 'investor_support', amount: 70 },
    { entry_type: 'expense', expense_date: '2026-11-01', category: 'utilities', amount: 999 },
  ])
  assert.deepEqual(rows.map(row => [row.income, row.spent, row.left]), [[500, 120, 380], [900, 430, 470], [70, 0, 70]])
  assert.equal(rows[0].bazaar, 120)
  assert.equal(rows[1].salaries, 400)
  assert.equal(rows[1].other, 30)
})

test('trend rows carry the sales sheet columns: average per day, its change and growth, and average check', () => {
  const buckets = buildTrendBuckets('2026-08-01', '2026-08-30', 'decade')
  const rows = buildAccountingTrend(buckets, {
    '2026-08-d1': { cafeIncome: 42900626, orderCount: 400, costTotal: 1 },
    '2026-08-d2': { cafeIncome: 53598913, orderCount: 0 },
    '2026-08-d3': { cafeIncome: 72812100, orderCount: 600 },
  }, [])
  assert.deepEqual(rows.map(row => row.days), [10, 10, 10])
  assert.deepEqual(rows.map(row => row.averageDaily), [4290063, 5359891, 7281210])
  assert.deepEqual(rows.map(row => row.averageDailyChange), [null, 1069828, 1921319])
  assert.deepEqual(rows.map(row => row.growthPct), [null, 24.9, 35.8])
  assert.deepEqual(rows.map(row => row.averageCheck), [107252, null, 121354])
})

test('largest payments skip salaries, staff meals, income, and dates outside the range', () => {
  const rows = buildLargestPayments([
    { id: 1, entry_type: 'expense', expense_date: '2026-10-02', category: 'rent', amount: 23600000, vendor: 'Landlord' },
    { id: 2, entry_type: 'expense', expense_date: '2026-10-03', category: 'salary_cook', amount: 90000000, is_salary_payment: true },
    { id: 3, entry_type: 'expense', expense_date: '2026-10-03', category: 'employee_meals', amount: 9000000 },
    { id: 4, entry_type: 'income', expense_date: '2026-10-03', category: 'investor_support', amount: 50000000 },
    { id: 5, entry_type: 'expense', expense_date: '2026-09-30', category: 'rent', amount: 99000000 },
    { id: 6, entry_type: 'expense', expense_date: '2026-10-05', category: 'utilities', amount: 3000000, payment_method: 'card' },
  ], '2026-10-01', '2026-10-12')
  assert.deepEqual(rows.map(row => [row.id, row.amount, row.method]), [[1, 23600000, 'cash'], [6, 3000000, 'card']])
  assert.equal(rows[0].vendor, 'Landlord')
})

const month = (monthStart, totalIncome, dayCount, orderCount, isFinalized = true) => ({ monthStart, totalIncome, dayCount, averageDailyIncome: 0, orderCount, isFinalized })

test('growth overview compares average sales per day and finds records from completed months', () => {
  const overview = buildGrowthOverview([
    month('2026-05-01', 0, 31, 0),
    month('2026-06-01', 47880000, 20, 1000),
    month('2026-07-01', 118978210, 31, 2400),
    month('2026-08-01', 175449689, 31, 3100),
    month('2026-09-01', 201000000, 30, 3300),
    month('2026-10-01', 62000000, 11, 1100, false),
  ], [{ averageDailyIncome: 7281210, dayCount: 10 }, { averageDailyIncome: 6705435, dayCount: 10 }])
  assert.equal(overview.months[0].monthStart, '2026-06-01')
  assert.equal(overview.latest.monthStart, '2026-10-01')
  assert.equal(overview.latestIsCurrent, true)
  assert.equal(overview.latest.averageDailyIncome, 5636364)
  assert.equal(overview.previous.monthStart, '2026-09-01')
  assert.equal(overview.vsPreviousPct, -15.9)
  assert.equal(overview.threeAgo.monthStart, '2026-07-01')
  assert.equal(overview.monthlyGrowthSpan, 4)
  assert.equal(overview.monthlyGrowthPct, 40.9)
  assert.equal(overview.best.monthStart, '2026-09-01')
  assert.equal(overview.latestOfBestPct, 84.1)
  assert.equal(overview.bestTenDay.averageDailyIncome, 7281210)
  assert.equal(overview.latest.averageCheck, 56364)
})

test('growth overview falls back to the last completed month before the current month has sales', () => {
  const overview = buildGrowthOverview([month('2026-08-01', 100, 31, 1), month('2026-09-01', 300, 30, 3), month('2026-10-01', 0, 0, 0, false)])
  assert.equal(overview.latest.monthStart, '2026-09-01')
  assert.equal(overview.latestIsCurrent, false)
  assert.equal(buildGrowthOverview([month('2026-10-01', 0, 0, 0, false)]), null)
})

test('monthly profit rows exclude investor support and payback uses the last three completed months', () => {
  const rows = buildMonthlyProfitRows([
    { monthStart: '2026-06-01', cafeIncome: 0, otherIncome: 0, spent: 0, salesCost: 0, orderCount: 0, investorSupport: 0 },
    { monthStart: '2026-07-01', cafeIncome: 100, otherIncome: 0, spent: 150, salesCost: 40, orderCount: 2, investorSupport: 500 },
    { monthStart: '2026-08-01', cafeIncome: 200, otherIncome: 10, spent: 150, salesCost: 80, orderCount: 4, investorSupport: 0 },
    { monthStart: '2026-09-01', cafeIncome: 300, otherIncome: 0, spent: 180, salesCost: 90, orderCount: 5, investorSupport: 0 },
    { monthStart: '2026-10-01', cafeIncome: 120, otherIncome: 0, spent: 40, salesCost: 30, orderCount: 2, investorSupport: 0 },
  ], '2026-10-12')
  assert.deepEqual(rows.map(row => [row.key, row.income, row.left, row.days]), [
    ['2026-07', 100, -50, 31], ['2026-08', 210, 60, 31], ['2026-09', 300, 120, 30], ['2026-10', 120, 80, 12],
  ])
  assert.equal(rows[0].grossMarginPct, 60)
  const payback = buildPaybackSummary({ investorSupport: 500, operatingCash: 210 }, rows)
  assert.deepEqual(payback, { invested: 500, generated: 210, paidBackPct: 42, remaining: 290, monthlyPace: 43, monthsLeft: 7 })
  assert.equal(buildPaybackSummary({ investorSupport: 0, operatingCash: 10 }, rows), null)
  assert.equal(buildPaybackSummary({ investorSupport: 100, operatingCash: 150 }, rows).monthsLeft, 0)
})
