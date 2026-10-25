import { getAccountingPageSummaryFromOrderSummary } from './accounting.js'
import {
  buildFinalizedEmployeeMealExpenseRows,
  buildSalaryBonusExpenseRows,
  buildSalaryPaymentExpenseRows,
  normalizeExpenseAmount,
  normalizeExpenseEntryType,
} from './expenses.js'

// Fixed categorical order (identity, never rank). Anything past the visible
// slots folds into "Other" so colours never cycle.
export const ANALYSIS_SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7']
export const ANALYSIS_OTHER_COLOR = '#9CA3AF'
export const ANALYSIS_MAX_CATEGORIES = ANALYSIS_SERIES_COLORS.length

const DAY_MS = 86400000

function isoToUtc(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function utcToIso(ms) {
  const date = new Date(ms)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function listIsoDates(dateFrom, dateTo) {
  const start = isoToUtc(dateFrom)
  const end = isoToUtc(dateTo)
  if (start == null || end == null || end < start) return []
  const dates = []
  for (let ms = start; ms <= end && dates.length < 400; ms += DAY_MS) dates.push(utcToIso(ms))
  return dates
}

// The comparison window has the same number of calendar days and ends the day
// before the selected period starts.
export function getPreviousAccountingPeriod(dateFrom, dateTo) {
  const start = isoToUtc(dateFrom)
  const end = isoToUtc(dateTo)
  if (start == null || end == null || end < start) return { dateFrom, dateTo }
  const length = Math.round((end - start) / DAY_MS) + 1
  return {
    dateFrom: utcToIso(start - length * DAY_MS),
    dateTo: utcToIso(start - DAY_MS),
  }
}

export function composeSalaryProfiles(rows = [], rates = [], payments = [], bonuses = [], fines = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates.filter(rate => rate.salary_profile_id === row.id),
    payments: payments.filter(payment => payment.salary_profile_id === row.id),
    bonuses: bonuses.filter(bonus => bonus.salary_profile_id === row.id),
    fines: fines.filter(fine => fine.salary_profile_id === row.id),
    absences: absences.filter(absence => absence.salary_profile_id === row.id),
  }))
}

// Same entry set the Accounting overview uses: recorded expenses/income plus
// salary payments, salary bonuses, and finalized employee-meal snapshots.
export function buildAccountingPeriodEntries({ expenses = [], salaryProfiles = [], employeeMealSnapshots = [] }, dateFrom, dateTo) {
  return [
    ...buildSalaryPaymentExpenseRows(salaryProfiles, dateFrom, dateTo),
    ...buildSalaryBonusExpenseRows(salaryProfiles, dateFrom, dateTo),
    ...buildFinalizedEmployeeMealExpenseRows(employeeMealSnapshots),
    ...expenses,
  ]
}

export function getAccountingAnalysisSummary(paidOrderSummary, entries, dateFrom, dateTo) {
  return getAccountingPageSummaryFromOrderSummary(paidOrderSummary, entries, dateFrom, dateTo)
}

// Top categories keep their own slot; the long tail folds into "other".
export function getTopExpenseCategories(byCategory = {}, limit = ANALYSIS_MAX_CATEGORIES) {
  const sorted = Object.entries(byCategory || {})
    .map(([key, amount]) => [key, normalizeExpenseAmount(amount)])
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (sorted.length <= limit) return sorted.map(([key, amount]) => ({ key, amount, isOther: false }))
  const visible = sorted.slice(0, limit - 1).map(([key, amount]) => ({ key, amount, isOther: false }))
  const otherAmount = sorted.slice(limit - 1).reduce((sum, [, amount]) => sum + amount, 0)
  return [...visible, { key: '__other__', amount: otherAmount, isOther: true, members: sorted.slice(limit - 1).map(([key]) => key) }]
}

export function assignCategoryColors(categories = []) {
  return Object.fromEntries(categories.map((category, index) => [
    category.key,
    category.isOther ? ANALYSIS_OTHER_COLOR : ANALYSIS_SERIES_COLORS[index % ANALYSIS_SERIES_COLORS.length],
  ]))
}

// Three-column money flow: sources -> "money in" -> spending + left.
// When spending exceeds income, a "reserves" source keeps both sides balanced.
export function buildAccountingSankey({ cafeIncome = 0, investorSupport = 0, otherIncome = 0, categories = [] }) {
  const sources = [
    { key: 'cafe', amount: normalizeExpenseAmount(cafeIncome) },
    { key: 'investor', amount: normalizeExpenseAmount(investorSupport) },
    { key: 'otherIncome', amount: normalizeExpenseAmount(otherIncome) },
  ].filter(source => source.amount > 0)
  const incomeTotal = sources.reduce((sum, source) => sum + source.amount, 0)
  const targets = categories
    .filter(category => category.amount > 0)
    .map(category => ({ key: category.key, amount: category.amount, isOther: category.isOther }))
  const spendTotal = targets.reduce((sum, target) => sum + target.amount, 0)
  if (incomeTotal > spendTotal) targets.push({ key: '__left__', amount: incomeTotal - spendTotal, isLeft: true })
  if (spendTotal > incomeTotal) sources.push({ key: 'reserves', amount: spendTotal - incomeTotal, isReserve: true })
  return {
    sources,
    targets,
    total: Math.max(incomeTotal, spendTotal),
    incomeTotal,
    spendTotal,
  }
}

export function spendingGroupOfCategory(category) {
  const key = String(category || '')
  if (key.startsWith('salary_')) return 'salaries'
  if (key === 'products_bazaar') return 'bazaar'
  if (key === 'employee_meals') return 'meals'
  return 'other'
}

function spendingGroup(row) {
  if (row?.is_salary_payment || row?.is_salary_bonus || row?.is_salary_auto) return 'salaries'
  return spendingGroupOfCategory(row?.category)
}

export const SPENDING_GROUPS = ['salaries', 'bazaar', 'meals', 'other']

export function buildDailySpending(entries = [], dateFrom, dateTo) {
  const days = listIsoDates(dateFrom, dateTo).map(date => ({ date, total: 0, salaries: 0, bazaar: 0, meals: 0, other: 0 }))
  const byDate = new Map(days.map(day => [day.date, day]))
  for (const row of entries || []) {
    if (normalizeExpenseEntryType(row?.entry_type) !== 'expense') continue
    const amount = normalizeExpenseAmount(row?.amount)
    const day = byDate.get(row?.expense_date)
    if (!day || amount <= 0) continue
    day[spendingGroup(row)] += amount
    day.total += amount
  }
  return days
}

// One day of the Daily spending chart as a money flow: that day's income
// (cafe income comes from the day's paid-order summary) into its spending
// categories, plus every payment of the day, largest first.
export function buildDayMoneyFlow(paidOrderSummary, entries = [], date) {
  const dayEntries = (entries || []).filter(entry => entry?.expense_date === date)
  const summary = getAccountingAnalysisSummary(paidOrderSummary, dayEntries, date, date)
  const categories = getTopExpenseCategories(summary.expenseSummary.byCategory)
  const payments = dayEntries
    .filter(entry => normalizeExpenseEntryType(entry?.entry_type) === 'expense' && normalizeExpenseAmount(entry?.amount) > 0)
    .map(entry => ({
      id: entry.id,
      category: entry.category,
      group: spendingGroup(entry),
      vendor: entry.vendor || '',
      description: entry.description || '',
      method: entry.payment_method || 'cash',
      amount: normalizeExpenseAmount(entry.amount),
    }))
    .sort((a, b) => b.amount - a.amount || String(a.id).localeCompare(String(b.id)))
  return {
    summary,
    categories,
    colors: assignCategoryColors(categories),
    sankey: buildAccountingSankey({
      cafeIncome: summary.cafeIncome,
      investorSupport: summary.investorSupportTotal,
      otherIncome: summary.otherIncomeTotal,
      categories,
    }),
    payments,
  }
}

export function getPercentChange(current, previous) {
  const now = Number(current) || 0
  const before = Number(previous) || 0
  if (before === 0) return now === 0 ? 0 : null
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10
}

function ratioPct(part, whole) {
  const denominator = Number(whole) || 0
  if (denominator <= 0) return null
  return Math.round(((Number(part) || 0) / denominator) * 1000) / 10
}

// Personal-finance style ratios derived only from the shared Accounting summary.
export function buildAccountingIndicators(summary = {}, { dayCount = 0, allTimeBalance = null } = {}) {
  const cafeIncome = Number(summary.cafeIncome) || 0
  const externalIncome = Number(summary.incomeSummary?.total) || 0
  const moneyIn = cafeIncome + externalIncome
  const spent = Number(summary.expenseSummary?.total) || 0
  const left = moneyIn - spent
  const days = Math.max(0, Number(dayCount) || 0)
  const avgDailySpend = days > 0 ? Math.round(spent / days) : 0
  const balance = allTimeBalance == null ? null : Number(allTimeBalance) || 0
  return {
    moneyIn,
    spent,
    left,
    savingsRatePct: ratioPct(left, moneyIn),
    spendRatioPct: ratioPct(spent, moneyIn),
    avgDailySpend,
    runwayDays: balance == null || avgDailySpend <= 0 ? null : Math.max(0, Math.floor(balance / avgDailySpend)),
    foodCostPct: ratioPct(summary.productBazaarExpensesTotal, cafeIncome),
    payrollSharePct: ratioPct(summary.salaryExpensesTotal, spent),
    investorDependencePct: ratioPct(summary.investorSupportTotal, moneyIn),
  }
}

export function buildCategoryComparison(currentByCategory = {}, previousByCategory = {}) {
  const keys = new Set([...Object.keys(currentByCategory || {}), ...Object.keys(previousByCategory || {})])
  return [...keys]
    .map(key => {
      const current = normalizeExpenseAmount(currentByCategory?.[key])
      const previous = normalizeExpenseAmount(previousByCategory?.[key])
      return { key, current, previous, change: current - previous, changePct: getPercentChange(current, previous) }
    })
    .filter(row => row.current > 0 || row.previous > 0)
    .sort((a, b) => Math.max(b.current, b.previous) - Math.max(a.current, a.previous) || a.key.localeCompare(b.key))
}

function amountLines(byCategory = {}) {
  return Object.entries(byCategory || {})
    .map(([key, amount]) => ({ key, amount: normalizeExpenseAmount(amount) }))
    .filter(line => line.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key))
}

// Profit and loss for the Money flow card: cafe income plus recorded income,
// every expense category (no "Other" folding), and the same spending groups the
// daily chart uses. Net equals the Sankey's Left (or minus its reserves).
export function buildAccountingProfitAndLoss({ cafeIncome = 0, salesCost = 0, incomeByCategory = {}, expenseByCategory = {} } = {}) {
  const incomeLines = [
    ...(normalizeExpenseAmount(cafeIncome) > 0 ? [{ key: '__cafe__', amount: normalizeExpenseAmount(cafeIncome) }] : []),
    ...amountLines(incomeByCategory),
  ]
  const expenseLines = amountLines(expenseByCategory)
  const groups = SPENDING_GROUPS
    .map(key => {
      const lines = expenseLines.filter(line => spendingGroupOfCategory(line.key) === key)
      return { key, amount: lines.reduce((sum, line) => sum + line.amount, 0), lines }
    })
    .filter(group => group.lines.length)
    .sort((a, b) => b.amount - a.amount)
  const incomeTotal = incomeLines.reduce((sum, line) => sum + line.amount, 0)
  const expenseTotal = expenseLines.reduce((sum, line) => sum + line.amount, 0)
  // Sales margin uses the cost frozen on each paid order. It is shown beside the
  // cash view, never subtracted from it: Bazaar purchases already pay for that food.
  const sales = normalizeExpenseAmount(cafeIncome)
  const cost = normalizeExpenseAmount(salesCost)
  const gross = sales > 0 ? { sales, cost, profit: sales - cost, marginPct: ratioPct(sales - cost, sales) } : null
  return { gross, incomeLines, incomeTotal, expenseLines, expenseTotal, groups, net: incomeTotal - expenseTotal }
}

export const TREND_INTERVALS = ['day', 'week', 'decade', 'month']
const TREND_MAX_BUCKETS = { day: 31, week: 27, decade: 36, month: 24 }

function decadeKey(date) {
  const day = Number(date.slice(8))
  return `${date.slice(0, 7)}-d${day <= 10 ? 1 : day <= 20 ? 2 : 3}`
}

// Calendar buckets inside the range: Monday-start weeks, ten-day periods
// (1–10, 11–20, 21–end, as the owner's sales sheet uses) and calendar months,
// all clipped to the range so the first and last bucket may be partial.
export function buildTrendBuckets(dateFrom, dateTo, interval = 'week') {
  const dates = listIsoDates(dateFrom, dateTo)
  const buckets = []
  for (const date of dates) {
    let key = date
    if (interval === 'month') key = date.slice(0, 7)
    else if (interval === 'decade') key = decadeKey(date)
    else if (interval === 'week') {
      const weekday = (new Date(isoToUtc(date)).getUTCDay() + 6) % 7
      key = utcToIso(isoToUtc(date) - weekday * DAY_MS)
    }
    const last = buckets.at(-1)
    if (last && last.key === key) last.dateTo = date
    else buckets.push({ key, dateFrom: date, dateTo: date })
  }
  return buckets
}

// Intervals that stay readable (and cheap to load) for the range; the default
// is the finest one with at least a few buckets left over for a trend.
export function getTrendIntervals(dateFrom, dateTo) {
  const available = TREND_INTERVALS.filter(interval => {
    const count = buildTrendBuckets(dateFrom, dateTo, interval).length
    return count > 0 && count <= TREND_MAX_BUCKETS[interval]
  })
  const preferred = available.find(interval => buildTrendBuckets(dateFrom, dateTo, interval).length <= 14)
  return { available: available.length ? available : ['month'], preferred: preferred || available.at(-1) || 'month' }
}

// One row per bucket: the bucket's paid-order summary (cafe income, order
// count, sold cost), recorded income, spending split into the daily chart's
// groups, and the sheet-style growth of average daily sales against the
// previous bucket.
export function buildAccountingTrend(buckets = [], salesByBucket = {}, entries = []) {
  const rows = buckets.map(bucket => {
    const sales = salesByBucket?.[bucket.key]
    const summary = typeof sales === 'object' && sales ? sales : { cafeIncome: sales }
    return {
      ...bucket,
      days: listIsoDates(bucket.dateFrom, bucket.dateTo).length,
      cafeIncome: normalizeExpenseAmount(summary.cafeIncome),
      orderCount: normalizeExpenseAmount(summary.orderCount),
      salesCost: normalizeExpenseAmount(summary.costTotal),
      otherIncome: 0,
      salaries: 0,
      bazaar: 0,
      meals: 0,
      other: 0,
    }
  })
  const rowOf = date => rows.find(row => date >= row.dateFrom && date <= row.dateTo)
  for (const entry of entries || []) {
    const amount = normalizeExpenseAmount(entry?.amount)
    const row = amount > 0 ? rowOf(entry?.expense_date) : null
    if (!row) continue
    if (normalizeExpenseEntryType(entry?.entry_type) === 'income') row.otherIncome += amount
    else row[spendingGroup(entry)] += amount
  }
  let previousAverage = null
  return rows.map(row => {
    const income = row.cafeIncome + row.otherIncome
    const spent = SPENDING_GROUPS.reduce((sum, group) => sum + row[group], 0)
    const averageDaily = row.days > 0 ? Math.round(row.cafeIncome / row.days) : 0
    const result = {
      ...row,
      income,
      spent,
      left: income - spent,
      averageDaily,
      averageCheck: row.orderCount > 0 ? Math.round(row.cafeIncome / row.orderCount) : null,
      averageDailyChange: previousAverage == null ? null : averageDaily - previousAverage,
      growthPct: previousAverage == null ? null : getPercentChange(averageDaily, previousAverage),
    }
    previousAverage = averageDaily
    return result
  })
}

// The single biggest payments behind "where did the money go". Salaries and
// calculated staff meals are left out: they have their own groups and payroll
// pages, and would crowd out the rent, utility and supplier payments.
export function buildLargestPayments(entries = [], dateFrom, dateTo, limit = 10) {
  return (entries || [])
    .filter(entry => (
      normalizeExpenseEntryType(entry?.entry_type) === 'expense'
      && entry?.expense_date >= dateFrom
      && entry?.expense_date <= dateTo
      && spendingGroup(entry) !== 'salaries'
      && entry?.category !== 'employee_meals'
      && normalizeExpenseAmount(entry?.amount) > 0
    ))
    .map(entry => ({
      id: entry.id,
      date: entry.expense_date,
      category: entry.category,
      vendor: entry.vendor || '',
      description: entry.description || '',
      method: entry.payment_method || 'cash',
      amount: normalizeExpenseAmount(entry.amount),
    }))
    .sort((a, b) => b.amount - a.amount || String(b.date).localeCompare(String(a.date)))
    .slice(0, limit)
}

function monthLastDay(monthStart) {
  const [year, month] = monthStart.split('-').map(Number)
  return `${monthStart.slice(0, 8)}${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`
}

// Investor growth band from the immutable monthly income snapshots (past months)
// and the live current month, as the Dashboard's monthly chart reads them.
// Averages per day keep months of different lengths comparable.
export function buildGrowthOverview(monthRows = [], tenDayRows = []) {
  const sorted = [...(monthRows || [])]
    .filter(row => /^\d{4}-\d{2}-01$/.test(String(row?.monthStart || '')))
    .sort((a, b) => a.monthStart.localeCompare(b.monthStart))
  const firstActive = sorted.findIndex(row => row.totalIncome > 0)
  const months = (firstActive < 0 ? [] : sorted.slice(firstActive)).map(row => ({
    ...row,
    averageDailyIncome: row.dayCount > 0 ? Math.round(row.totalIncome / row.dayCount) : 0,
    ordersPerDay: row.dayCount > 0 ? Math.round((row.orderCount / row.dayCount) * 10) / 10 : 0,
    averageCheck: row.orderCount > 0 ? Math.round(row.totalIncome / row.orderCount) : null,
  }))
  if (!months.length) return null

  // The current month counts only once it has a completed day with sales.
  const lastRow = months.at(-1)
  const currentReady = !lastRow.isFinalized && lastRow.dayCount > 0 && lastRow.totalIncome > 0
  const completed = months.filter(row => row.isFinalized && row.averageDailyIncome > 0)
  const latestIndex = currentReady || lastRow.isFinalized ? months.length - 1 : months.length - 2
  const latest = latestIndex >= 0 ? months[latestIndex] : null
  const monthBefore = offset => (latestIndex - offset >= 0 ? months[latestIndex - offset] : null)
  const previous = monthBefore(1)
  const threeAgo = monthBefore(3)

  const trend = completed.slice(-12)
  const first = trend[0]
  const last = trend.at(-1)
  const monthlyGrowthPct = trend.length >= 2 && first.averageDailyIncome > 0
    ? Math.round((Math.pow(last.averageDailyIncome / first.averageDailyIncome, 1 / (trend.length - 1)) - 1) * 1000) / 10
    : null

  const best = completed.reduce((top, row) => (!top || row.averageDailyIncome > top.averageDailyIncome ? row : top), null)
  const bestTenDay = (tenDayRows || [])
    .filter(row => row.dayCount > 0 && row.averageDailyIncome > 0)
    .reduce((top, row) => (!top || row.averageDailyIncome > top.averageDailyIncome ? row : top), null)

  return {
    months,
    latest,
    latestIsCurrent: Boolean(latest && !latest.isFinalized),
    previous,
    threeAgo,
    vsPreviousPct: latest && previous ? getPercentChange(latest.averageDailyIncome, previous.averageDailyIncome) : null,
    vsThreeAgoPct: latest && threeAgo ? getPercentChange(latest.averageDailyIncome, threeAgo.averageDailyIncome) : null,
    monthlyGrowthPct,
    monthlyGrowthSpan: trend.length,
    ordersPerDayChangePct: latest && previous ? getPercentChange(latest.ordersPerDay, previous.ordersPerDay) : null,
    averageCheckChangePct: latest?.averageCheck != null && previous?.averageCheck != null ? getPercentChange(latest.averageCheck, previous.averageCheck) : null,
    best,
    latestOfBestPct: best && latest ? ratioPct(latest.averageDailyIncome, best.averageDailyIncome) : null,
    bestTenDay,
  }
}

// Monthly cash rows (migration 229) shaped like Trends rows so the same chart
// draws them. Investor support is kept out of income: profit is what the cafe
// earned, not what it was given.
export function buildMonthlyProfitRows(months = [], today = null) {
  const rows = (months || []).filter(row => /^\d{4}-\d{2}-01$/.test(String(row?.monthStart || '')))
  const firstActive = rows.findIndex(row => row.cafeIncome > 0 || row.spent > 0 || row.otherIncome > 0)
  return (firstActive < 0 ? [] : rows.slice(firstActive)).map(row => {
    const lastDay = monthLastDay(row.monthStart)
    const dateTo = today && today < lastDay && today >= row.monthStart ? today : lastDay
    const days = listIsoDates(row.monthStart, dateTo).length
    const income = row.cafeIncome + row.otherIncome
    return {
      key: row.monthStart.slice(0, 7),
      dateFrom: row.monthStart,
      dateTo,
      days,
      cafeIncome: row.cafeIncome,
      otherIncome: row.otherIncome,
      orderCount: row.orderCount,
      salesCost: row.salesCost,
      grossProfit: row.cafeIncome - row.salesCost,
      salaries: row.salaries || 0,
      income,
      spent: row.spent,
      left: income - row.spent,
      marginPct: ratioPct(income - row.spent, income),
      grossMarginPct: ratioPct(row.cafeIncome - row.salesCost, row.cafeIncome),
      averageDaily: days > 0 ? Math.round(row.cafeIncome / days) : 0,
      investorSupport: row.investorSupport,
    }
  })
}

// Payback: investor support since opening against the operating cash the cafe
// generated (sales and other income minus every cash expense). The pace is the
// average of the last three completed months, so one unusual month does not
// swing the estimate.
export function buildPaybackSummary(totals = {}, profitRows = []) {
  const invested = normalizeExpenseAmount(totals?.investorSupport)
  if (invested <= 0) return null
  const generated = Math.round(Number(totals?.operatingCash) || 0)
  const completed = (profitRows || []).slice(0, -1).slice(-3)
  const monthlyPace = completed.length ? Math.round(completed.reduce((sum, row) => sum + row.left, 0) / completed.length) : null
  const remaining = Math.max(0, invested - Math.max(0, generated))
  return {
    invested,
    generated,
    paidBackPct: Math.min(100, Math.max(0, Math.round((Math.max(0, generated) / invested) * 1000) / 10)),
    remaining,
    monthlyPace,
    monthsLeft: remaining === 0 ? 0 : monthlyPace > 0 ? Math.ceil(remaining / monthlyPace) : null,
  }
}

// Investor support at a glance: the all-time total, how much of it went in
// during the shown months, which months the cafe did not cover its own
// spending (the shortfall the support had to fill) and the latest top-up.
export function buildInvestorOverview(totals = {}, profitRows = []) {
  const invested = normalizeExpenseAmount(totals?.investorSupport)
  const rows = profitRows || []
  const months = rows.map(row => ({
    key: row.key,
    monthStart: row.dateFrom,
    amount: normalizeExpenseAmount(row.investorSupport),
    shortfall: Math.max(0, row.spent - row.income),
  }))
  const supported = months.filter(row => row.amount > 0)
  const recentTotal = supported.reduce((sum, row) => sum + row.amount, 0)
  const spent = rows.reduce((sum, row) => sum + row.spent, 0)
  const shortfall = months.reduce((sum, row) => sum + row.shortfall, 0)
  if (invested <= 0 && recentTotal <= 0) return null
  return {
    invested,
    firstMonth: totals?.firstInvestmentMonth || null,
    recentTotal,
    monthCount: months.length,
    supportedMonthCount: supported.length,
    averagePerSupportedMonth: supported.length ? Math.round(recentTotal / supported.length) : null,
    last: supported.at(-1) || null,
    thisMonth: months.at(-1)?.amount || 0,
    shareOfSpendingPct: ratioPct(recentTotal, spent),
    shortfall,
    shortfallCoveredPct: shortfall > 0 ? Math.min(100, ratioPct(recentTotal, shortfall)) : null,
    largest: supported.reduce((top, row) => (!top || row.amount > top.amount ? row : top), null),
    months,
  }
}

// Totals across the shown months (the current month counts so far). Investor
// support stays out of income, as in the profit rows.
export function buildPeriodTotals(profitRows = []) {
  const rows = profitRows || []
  if (!rows.length) return null
  const sum = key => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)
  const cafeIncome = sum('cafeIncome')
  const income = sum('income')
  const spent = sum('spent')
  const grossProfit = sum('grossProfit')
  const salaries = sum('salaries')
  const left = income - spent
  const completed = rows.slice(0, -1)
  return {
    monthCount: rows.length,
    firstMonth: rows[0].dateFrom,
    cafeIncome,
    otherIncome: sum('otherIncome'),
    income,
    orderCount: sum('orderCount'),
    averageCheck: sum('orderCount') > 0 ? Math.round(cafeIncome / sum('orderCount')) : null,
    salesCost: sum('salesCost'),
    grossProfit,
    grossMarginPct: ratioPct(grossProfit, cafeIncome),
    spent,
    averageMonthlySpent: Math.round(spent / rows.length),
    salaries,
    salaryShareOfSpendingPct: ratioPct(salaries, spent),
    left,
    leftMarginPct: ratioPct(left, income),
    investorSupport: sum('investorSupport'),
    profitableMonths: completed.filter(row => row.left > 0).length,
    completedMonths: completed.length,
    bestMonth: rows.reduce((top, row) => (!top || row.left > top.left ? row : top), null),
    worstMonth: rows.reduce((low, row) => (!low || row.left < low.left ? row : low), null),
  }
}

// Daily sales against the daily break-even target from settings. Completed
// months compare with the target that was in effect for them when given.
export function buildBreakEvenSummary(overview = null, target = 0, targetForMonth = null) {
  const goal = Math.max(0, Math.round(Number(target) || 0))
  const latest = overview?.latest
  if (!goal || !latest) return null
  const completed = (overview.months || []).filter(row => row.isFinalized && row.averageDailyIncome > 0)
  return {
    target: goal,
    latestDaily: latest.averageDailyIncome,
    latestMonth: latest.monthStart,
    coveragePct: ratioPct(latest.averageDailyIncome, goal),
    dailyGap: goal - latest.averageDailyIncome,
    monthsAbove: completed.filter(row => row.averageDailyIncome >= (targetForMonth ? targetForMonth(row.monthStart) : goal)).length,
    completedMonths: completed.length,
  }
}

// Where the money goes month after month (migration 261 rows). Salary
// categories fold into one Salaries line; the average covers completed months
// only, so the current part-month never drags it down.
export function buildMonthlySpending(rows = [], monthStarts = []) {
  const months = (monthStarts || []).map(monthStart => ({ key: monthStart.slice(0, 7), monthStart, total: 0, byCategory: {} }))
  const byMonth = new Map(months.map(month => [month.monthStart, month]))
  const totals = {}
  for (const row of rows || []) {
    const month = byMonth.get(row?.monthStart)
    const amount = normalizeExpenseAmount(row?.amount)
    if (!month || amount <= 0) continue
    const key = spendingGroupOfCategory(row.category) === 'salaries' ? 'salaries' : String(row.category || 'other')
    month.byCategory[key] = (month.byCategory[key] || 0) + amount
    month.total += amount
    totals[key] = (totals[key] || 0) + amount
  }
  const total = months.reduce((sum, month) => sum + month.total, 0)
  if (!months.length || total <= 0) return null
  const top = getTopExpenseCategories(totals)
  const colors = assignCategoryColors(top)
  const members = Object.fromEntries(top.map(category => [category.key, category.isOther ? category.members : [category.key]]))
  const completed = months.length > 1 ? months.slice(0, -1) : months
  const current = months.at(-1)
  const previous = months.length > 1 ? months.at(-2) : null
  const amountIn = (month, key) => (month ? members[key].reduce((sum, member) => sum + (month.byCategory[member] || 0), 0) : 0)
  return {
    total,
    averageMonthly: Math.round(completed.reduce((sum, month) => sum + month.total, 0) / completed.length),
    completedCount: completed.length,
    categories: top.map(category => ({
      key: category.key,
      isOther: category.isOther,
      color: colors[category.key],
      total: category.amount,
      sharePct: ratioPct(category.amount, total),
      averagePerMonth: Math.round(completed.reduce((sum, month) => sum + amountIn(month, category.key), 0) / completed.length),
      current: amountIn(current, category.key),
      previous: previous ? amountIn(previous, category.key) : null,
    })),
    months: months.map(month => ({
      key: month.key,
      monthStart: month.monthStart,
      total: month.total,
      parts: top.map(category => ({ key: category.key, amount: amountIn(month, category.key) })).filter(part => part.amount > 0),
    })),
  }
}

export const INCOME_SOURCE_KEYS = ['regular', 'tourist', 'take_away', 'delivery', 'game_club', 'other_income', 'investor_support']

// Saved price mode first: a Tourist bill is tourist income whatever its order
// type. Other Regular orders split by their saved order type.
export function incomeSourceOfOrder(orderType, priceMode) {
  if (priceMode === 'tourist') return 'tourist'
  if (orderType === 'take_away' || orderType === 'delivery' || orderType === 'game_club') return orderType
  return 'regular'
}

// How money comes in month after month: paid orders by source (migration 261)
// plus other income and investor support from the cash rows (229). Investor
// support is its own line and never part of the income share.
export function buildMonthlyIncomeSources(incomeRows = [], profitRows = []) {
  const months = (profitRows || []).map(row => {
    const values = Object.fromEntries(INCOME_SOURCE_KEYS.map(key => [key, 0]))
    values.other_income = normalizeExpenseAmount(row.otherIncome)
    values.investor_support = normalizeExpenseAmount(row.investorSupport)
    return { key: row.key, monthStart: row.dateFrom, values, orders: {} }
  })
  const byMonth = new Map(months.map(month => [month.monthStart, month]))
  for (const row of incomeRows || []) {
    const month = byMonth.get(row?.monthStart)
    if (!month) continue
    const key = incomeSourceOfOrder(row.orderType, row.priceMode)
    month.values[key] += normalizeExpenseAmount(row.amount)
    month.orders[key] = (month.orders[key] || 0) + (Number(row.orderCount) || 0)
  }
  if (!months.length) return null
  const completed = months.length > 1 ? months.slice(0, -1) : months
  const earned = month => INCOME_SOURCE_KEYS.reduce((sum, key) => sum + (key === 'investor_support' ? 0 : month.values[key]), 0)
  const earnedTotal = months.reduce((sum, month) => sum + earned(month), 0)
  const series = INCOME_SOURCE_KEYS
    .map(key => {
      const total = months.reduce((sum, month) => sum + month.values[key], 0)
      const orders = months.reduce((sum, month) => sum + (month.orders[key] || 0), 0)
      return {
        key,
        total,
        orders,
        averagePerMonth: Math.round(completed.reduce((sum, month) => sum + month.values[key], 0) / completed.length),
        sharePct: key === 'investor_support' ? null : ratioPct(total, earnedTotal),
        averageCheck: orders > 0 ? Math.round(total / orders) : null,
        current: months.at(-1).values[key],
        previous: months.length > 1 ? months.at(-2).values[key] : null,
      }
    })
    .filter(row => row.total > 0)
  if (!series.length) return null
  return {
    earnedTotal,
    averageMonthly: Math.round(completed.reduce((sum, month) => sum + earned(month), 0) / completed.length),
    completedCount: completed.length,
    series,
    months: months.map(month => ({ key: month.key, monthStart: month.monthStart, values: month.values, earned: earned(month) })),
  }
}
