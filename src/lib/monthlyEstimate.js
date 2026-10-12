import { getInclusiveCalendarDayCount, getOrderPaymentBreakdown, normalizePaymentMethod } from './analytics.js'
import { normalizeExpenseAmount } from './expenses.js'

export const MONTHLY_ESTIMATE_PAYMENT_METHODS = ['cash', 'card', 'terminal', 'loyalty_card', 'salary']

function addAmount(map, method, amount) {
  const key = normalizePaymentMethod(method)
  map[key] = (map[key] || 0) + normalizeExpenseAmount(amount)
}

export function getMonthlyEstimateMethodRows(
  paidOrders = [],
  incomeEntries = [],
  expenseEntries = [],
  orderIncomeByMethod = {}
) {
  const inflow = {}
  const outflow = {}

  // Paid-order income already summed per method by the Accounting summary RPC.
  for (const [method, amount] of Object.entries(orderIncomeByMethod || {})) {
    addAmount(inflow, method, amount)
  }
  for (const order of paidOrders || []) {
    for (const payment of getOrderPaymentBreakdown(order)) {
      addAmount(inflow, payment.method, payment.amount)
    }
  }
  for (const income of incomeEntries || []) {
    addAmount(inflow, income?.payment_method || 'cash', income?.amount)
  }
  for (const expense of expenseEntries || []) {
    addAmount(outflow, expense?.payment_method || 'cash', expense?.amount)
  }

  return MONTHLY_ESTIMATE_PAYMENT_METHODS
    .map(method => ({
      method,
      inflow: inflow[method] || 0,
      outflow: outflow[method] || 0,
    }))
    .filter(row => row.inflow > 0 || row.outflow > 0)
}

function countDays(from, to) {
  return getInclusiveCalendarDayCount(from, to)
}

function previousDay(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day - 1))
  return date.toISOString().slice(0, 10)
}

function money(value) {
  return Math.max(0, Math.round(Number(value) || 0))
}

// Completed days are over; today is still in progress, so it counts as remaining.
export function getEstimateMonthDays(monthStart, monthEnd, today) {
  if (today > monthEnd) return { status: 'closed', completedDays: countDays(monthStart, monthEnd), remainingDays: 0 }
  if (today < monthStart) return { status: 'future', completedDays: 0, remainingDays: countDays(monthStart, monthEnd) }
  return {
    status: 'open',
    completedDays: today > monthStart ? countDays(monthStart, previousDay(today)) : 0,
    remainingDays: countDays(today, monthEnd),
  }
}

// Remaining amount at the average pace of completed days, minus what today already added.
export function projectRemainingAtPace({ soFar = 0, completedSoFar = 0, days }) {
  if (!days || days.status === 'closed' || days.completedDays <= 0) return { averageDaily: days?.status === 'closed' && days.completedDays > 0 ? Math.round(money(soFar) / days.completedDays) : null, remaining: 0 }
  const averageDaily = Math.round(money(completedSoFar) / days.completedDays)
  const today = days.status === 'open' ? Math.max(0, money(soFar) - money(completedSoFar)) : 0
  return { averageDaily, remaining: Math.max(0, averageDaily * days.remainingDays - today) }
}

// Month outlook: actuals so far plus a sales projection from the average of completed days.
export function getMonthlyEstimateOutlook({
  monthStart,
  monthEnd,
  today,
  salesRevenue = 0,
  completedSalesRevenue = 0,
  otherIncome = 0,
  actualOut = 0,
  expectedOut = 0,
}) {
  const sales = money(salesRevenue)
  const inSoFar = sales + money(otherIncome)
  const outSoFar = money(actualOut)
  const expected = Math.max(outSoFar, Math.round(Number(expectedOut) || 0))
  const days = getEstimateMonthDays(monthStart, monthEnd, today)
  const pace = projectRemainingAtPace({ soFar: sales, completedSoFar: completedSalesRevenue, days })
  const projectedIncome = inSoFar + pace.remaining
  const shortfall = Math.max(0, expected - inSoFar)

  return {
    status: days.status,
    completedDays: days.completedDays,
    remainingDays: days.remainingDays,
    inSoFar,
    outSoFar,
    currentLeft: inSoFar - outSoFar,
    stillDue: expected - outSoFar,
    expectedOut: expected,
    averageDailySales: pace.averageDaily,
    projectedRemainingSales: pace.remaining,
    projectedIncome,
    hasProjection: days.status === 'closed' || pace.averageDaily != null,
    projectedLeft: projectedIncome - expected,
    requiredDailySales: days.remainingDays > 0 ? Math.ceil(shortfall / days.remainingDays) : null,
  }
}

export const MONTH_COMPARISON_KEYS = ['cafeIncome', 'otherIncome', 'payroll', 'products', 'meals', 'rent', 'utilities', 'other', 'expectedOut', 'left']

// A finished month's actuals on the same basis as the estimate: salary is the
// month's operating cost (not cash paid, which can include advances or arrears).
export function summarizeEstimateMonthActuals({
  salesRevenue = 0,
  incomeTotal = 0,
  salaryOperatingCost = 0,
  salaryBonusTotal = 0,
  byCategory = {},
  employeeMealTotal = 0,
  manualExpenseTotal = 0,
}) {
  const products = money(byCategory.products_bazaar)
  const rent = money(byCategory.rent)
  const utilities = money(byCategory.utilities)
  const other = Math.max(0, money(manualExpenseTotal) - products - rent - utilities)
  const payroll = money(salaryOperatingCost) + money(salaryBonusTotal)
  const meals = money(employeeMealTotal)
  const expectedOut = payroll + products + meals + rent + utilities + other
  const cafeIncome = money(salesRevenue)
  const otherIncome = money(incomeTotal)
  return { cafeIncome, otherIncome, payroll, products, meals, rent, utilities, other, expectedOut, left: cafeIncome + otherIncome - expectedOut }
}

export function buildMonthComparisonRows(current = {}, previous = {}) {
  return MONTH_COMPARISON_KEYS.map(key => {
    const now = Math.round(Number(current[key]) || 0)
    const before = Math.round(Number(previous[key]) || 0)
    return {
      key,
      current: now,
      previous: before,
      change: now - before,
      changePct: before === 0 ? (now === 0 ? 0 : null) : Math.round(((now - before) / Math.abs(before)) * 1000) / 10,
    }
  })
}
