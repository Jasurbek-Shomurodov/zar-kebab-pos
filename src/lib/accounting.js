import {
  getCafeIncomeForRange,
  getInclusiveCalendarDayCount,
  groupOrdersBySession,
  isPaidOrder,
  matchesRange,
} from './analytics.js'
import {
  expenseCategoryLabel,
  expenseMatchesRange,
  expensePaymentMethodLabel,
  normalizeExpenseEntryType,
  summarizeExpenseCashflow,
  summarizeExpenseCashflowFromIncome,
  summarizeExpenses,
  summarizeIncomeEntries,
  todayExpenseDate,
} from './expenses.js'
import { getOrdersCostTotal, getOrdersNetProfit, getSaleProfitSummary } from './profit.js'

function normalizeIsoDate(value, fallback = todayExpenseDate()) {
  const date = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback
}

function shiftIsoDate(value, days) {
  const [year, month, day] = normalizeIsoDate(value).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10)
}

function startOfAccountingWeek(value) {
  const [year, month, day] = normalizeIsoDate(value).split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day, 12))
  const mondayOffset = (parsed.getUTCDay() + 6) % 7
  return shiftIsoDate(value, -mondayOffset)
}

function accountingMonthRange(value, monthOffset = 0) {
  const [year, month] = normalizeIsoDate(value).split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 + monthOffset, 1, 12))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12))
  return {
    dateFrom: first.toISOString().slice(0, 10),
    dateTo: last.toISOString().slice(0, 10),
  }
}

export function getAccountingQuickRange(key = 'month', today = todayExpenseDate()) {
  const normalizedToday = normalizeIsoDate(today)
  if (key === 'today') return { dateFrom: normalizedToday, dateTo: normalizedToday }
  if (key === 'yesterday') {
    const yesterday = shiftIsoDate(normalizedToday, -1)
    return { dateFrom: yesterday, dateTo: yesterday }
  }
  if (key === 'week') return { dateFrom: shiftIsoDate(normalizedToday, -6), dateTo: normalizedToday }
  const currentWeekStart = startOfAccountingWeek(normalizedToday)
  if (key === 'previousWeek') return { dateFrom: shiftIsoDate(currentWeekStart, -7), dateTo: shiftIsoDate(currentWeekStart, -1) }
  if (key === 'previousCurrentWeek') return { dateFrom: shiftIsoDate(currentWeekStart, -7), dateTo: shiftIsoDate(currentWeekStart, 6) }
  if (key === 'currentWeek') return { dateFrom: currentWeekStart, dateTo: shiftIsoDate(currentWeekStart, 6) }
  if (key === 'currentNextWeek') return { dateFrom: currentWeekStart, dateTo: shiftIsoDate(currentWeekStart, 13) }
  if (key === 'nextWeek') return { dateFrom: shiftIsoDate(currentWeekStart, 7), dateTo: shiftIsoDate(currentWeekStart, 13) }
  if (key === 'previousMonth') return accountingMonthRange(normalizedToday, -1)
  if (key === 'nextMonth') return accountingMonthRange(normalizedToday, 1)
  return { dateFrom: `${normalizedToday.slice(0, 8)}01`, dateTo: normalizedToday }
}

function normalizeSummaryAmount(value) {
  return Math.max(0, Math.round(Number(value) || 0))
}

export function normalizeAccountingPaidOrderSummary(summary = {}, dateFrom, dateTo) {
  const normalizedFrom = normalizeIsoDate(dateFrom)
  const normalizedTo = normalizeIsoDate(dateTo, normalizedFrom)
  const today = todayExpenseDate()
  const effectiveTo = normalizedTo > today ? today : normalizedTo
  const cafeIncome = normalizeSummaryAmount(summary.cafeIncome ?? summary.cafe_income)
  const loyaltyIncome = normalizeSummaryAmount(summary.loyaltyIncome ?? summary.loyalty_income)
  const costTotal = normalizeSummaryAmount(summary.costTotal ?? summary.cost_total)
  const paymentMethodIncome = summary.paymentMethodIncome ?? summary.payment_method_income ?? {}
  const dayCount = getInclusiveCalendarDayCount(normalizedFrom, effectiveTo)

  return {
    cafeIncome,
    loyaltyIncome,
    costTotal,
    orderCount: normalizeSummaryAmount(summary.orderCount ?? summary.order_count),
    salesDayCount: normalizeSummaryAmount(summary.salesDayCount ?? summary.sales_day_count),
    paymentMethodIncome: {
      salary: normalizeSummaryAmount(paymentMethodIncome?.salary),
      cash: normalizeSummaryAmount(paymentMethodIncome?.cash),
      card: normalizeSummaryAmount(paymentMethodIncome?.card),
      terminal: normalizeSummaryAmount(paymentMethodIncome?.terminal) + normalizeSummaryAmount(paymentMethodIncome?.qr),
      loyalty_card: normalizeSummaryAmount(paymentMethodIncome?.loyalty_card),
    },
    cafeIncomeSummary: {
      total: cafeIncome,
      loyaltyTotal: loyaltyIncome,
      salesValueTotal: cafeIncome + loyaltyIncome,
      averageDaily: dayCount > 0 ? Math.round(cafeIncome / dayCount) : 0,
      dayCount,
      salesDayCount: normalizeSummaryAmount(summary.salesDayCount ?? summary.sales_day_count),
      from: normalizedFrom,
      to: normalizedTo,
      effectiveTo,
    },
  }
}

export function getAccountingPaidOrderSummary(orders = [], dateFrom, dateTo, menuItemMap = null) {
  const paidOrders = groupOrdersBySession(orders || [])
    .filter(order => isPaidOrder(order) && matchesRange(order, dateFrom, dateTo))
  const cafeIncomeSummary = getCafeIncomeForRange(orders, dateFrom, dateTo)
  const orderCashflow = summarizeExpenseCashflow(paidOrders, [])
  const costTotal = getOrdersCostTotal(paidOrders, menuItemMap)

  return normalizeAccountingPaidOrderSummary({
    cafeIncome: cafeIncomeSummary.total,
    loyaltyIncome: cafeIncomeSummary.loyaltyTotal,
    costTotal,
    orderCount: paidOrders.reduce((sum, order) => sum + (order?._orderCount || 1), 0),
    salesDayCount: cafeIncomeSummary.salesDayCount,
    paymentMethodIncome: Object.fromEntries(
      orderCashflow.rows.map(row => [row.method, row.income])
    ),
  }, dateFrom, dateTo)
}

export function getAccountingPageSummaryFromOrderSummary(orderSummary = {}, entries = [], dateFrom, dateTo) {
  const normalizedOrderSummary = normalizeAccountingPaidOrderSummary(orderSummary, dateFrom, dateTo)
  const rangeEntries = (entries || []).filter(entry => expenseMatchesRange(entry, dateFrom, dateTo))
  const expenseSummary = summarizeExpenses(rangeEntries)
  const expenseBreakdown = getAccountingExpenseBreakdown(rangeEntries)
  const incomeSummary = summarizeIncomeEntries(rangeEntries)
  const investorSupportTotal = incomeSummary.byCategory.investor_support || 0
  const netProfit = normalizedOrderSummary.cafeIncome - normalizedOrderSummary.costTotal
  const profitMarginPct = getSaleProfitSummary(
    normalizedOrderSummary.cafeIncome,
    normalizedOrderSummary.costTotal
  )?.marginPct ?? null

  return {
    paidOrders: [],
    cafeIncome: normalizedOrderSummary.cafeIncome,
    loyaltyIncome: normalizedOrderSummary.loyaltyIncome,
    netProfit,
    profitMarginPct,
    cafeIncomeSummary: normalizedOrderSummary.cafeIncomeSummary,
    expenseSummary,
    ...expenseBreakdown,
    incomeSummary,
    investorSupportTotal,
    otherIncomeTotal: Math.max(0, incomeSummary.total - investorSupportTotal),
    netIncome: normalizedOrderSummary.cafeIncome + incomeSummary.total - expenseSummary.total,
    cashflow: summarizeExpenseCashflowFromIncome(
      normalizedOrderSummary.paymentMethodIncome,
      rangeEntries
    ),
  }
}

export function getAccountingPageSummary(orders = [], entries = [], dateFrom, dateTo, menuItemMap = null) {
  const paidOrders = groupOrdersBySession(orders || [])
    .filter(order => isPaidOrder(order) && matchesRange(order, dateFrom, dateTo))
  return {
    ...getAccountingPageSummaryFromOrderSummary(
      getAccountingPaidOrderSummary(orders, dateFrom, dateTo, menuItemMap),
      entries,
      dateFrom,
      dateTo
    ),
    paidOrders,
    netProfit: getOrdersNetProfit(paidOrders, menuItemMap),
  }
}

export function getAccountingExpenseBreakdown(rows = []) {
  const expenseRows = (rows || []).filter(row => normalizeExpenseEntryType(row?.entry_type) === 'expense')
  const isSalaryRow = row => (
    row?.is_salary_payment ||
    row?.is_salary_bonus ||
    row?.is_salary_auto ||
    String(row?.category || '').startsWith('salary_')
  )
  const salaryRows = expenseRows.filter(isSalaryRow)
  const productBazaarRows = expenseRows.filter(row => !isSalaryRow(row) && row?.category === 'products_bazaar')
  const employeeMealRows = expenseRows.filter(row => !isSalaryRow(row) && row?.category === 'employee_meals')
  const otherRows = expenseRows.filter(row => (
    !isSalaryRow(row)
    && row?.category !== 'products_bazaar'
    && row?.category !== 'employee_meals'
  ))
  return {
    salaryExpensesTotal: summarizeExpenses(salaryRows).total,
    productBazaarExpensesTotal: summarizeExpenses(productBazaarRows).total,
    employeeMealExpensesTotal: summarizeExpenses(employeeMealRows).total,
    otherExpensesTotal: summarizeExpenses(otherRows).total,
  }
}

// Accounting keeps every linked Bazaar expense for auditability, but presents
// one concise Bazaar total per calendar day. Daily Bazaar remains the place for
// individual purchases and product lines.
export function collapseDailyBazaarExpenseRows(rows = []) {
  const otherRows = []
  const bazaarByDate = new Map()

  for (const row of rows || []) {
    const isBazaarExpense = (
      normalizeExpenseEntryType(row?.entry_type) === 'expense'
      && row?.category === 'products_bazaar'
    )
    if (!isBazaarExpense) {
      otherRows.push(row)
      continue
    }

    const date = row?.expense_date || ''
    const aggregate = bazaarByDate.get(date) || {
      ...row,
      id: `bazaar-day:${date}`,
      amount: 0,
      vendor: '',
      description: '',
      created_by_name: '',
      source_ids: [],
      entry_count: 0,
      is_bazaar_daily_total: true,
      _paymentMethods: new Set(),
    }

    aggregate.amount += Math.max(0, Number(row?.amount) || 0)
    aggregate.entry_count += 1
    if (row?.id) aggregate.source_ids.push(row.id)
    if (row?.payment_method) aggregate._paymentMethods.add(row.payment_method)
    if (String(row?.created_at || '') > String(aggregate.created_at || '')) {
      aggregate.created_at = row.created_at
    }
    bazaarByDate.set(date, aggregate)
  }

  const bazaarRows = [...bazaarByDate.values()].map(row => {
    const paymentMethods = [...row._paymentMethods]
    const { _paymentMethods, ...aggregate } = row
    return {
      ...aggregate,
      payment_method: paymentMethods.length === 1 ? paymentMethods[0] : 'mixed',
    }
  })

  return [...otherRows, ...bazaarRows].sort((a, b) => (
    String(b?.expense_date || '').localeCompare(String(a?.expense_date || ''))
    || String(b?.created_at || '').localeCompare(String(a?.created_at || ''))
    || String(a?.id || '').localeCompare(String(b?.id || ''))
  ))
}

export function filterAccountingHistoryRows(rows = [], { type = 'all', category = 'all', query = '', lang = 'en' } = {}) {
  const needle = String(query || '').trim().toLowerCase()
  return (rows || []).filter(row => {
    const entryType = normalizeExpenseEntryType(row?.entry_type)
    if (type !== 'all' && entryType !== type) return false
    if (category === 'salaries') {
      if (!(row?.is_salary_payment || row?.is_salary_bonus || String(row?.category || '').startsWith('salary_'))) return false
    } else if (category !== 'all' && row?.category !== category) return false
    if (!needle) return true
    return [
      row?.vendor,
      row?.description,
      row?.created_by_name,
      expenseCategoryLabel(row?.category, lang),
      expensePaymentMethodLabel(row?.payment_method, lang),
    ].some(value => String(value || '').toLowerCase().includes(needle))
  })
}

export function getAccountingHistoryDeleteTarget(row) {
  if (!row?.id || row.payment_method === 'salary') return null
  if (row.is_bazaar_daily_total) return null
  if (row.is_employee_meal_estimate) return null
  if (row.is_salary_payment) {
    const id = row.source_id || String(row.id).replace(/^salary-payment-/, '')
    return id ? { table: 'employee_salary_payments', id } : null
  }
  if (row.is_salary_bonus) {
    const id = row.source_id || String(row.id).replace(/^salary-bonus-/, '')
    return id ? { table: 'employee_salary_bonuses', id } : null
  }
  return { table: 'expenses', id: row.id }
}

export function getAccountingHistoryPageSummary(rows = [], orders = [], dateFrom, dateTo) {
  const incomeSummary = summarizeIncomeEntries(rows)
  return {
    expenseSummary: summarizeExpenses(rows),
    ...getAccountingExpenseBreakdown(rows),
    incomeSummary,
    investorSupportTotal: incomeSummary.byCategory.investor_support || 0,
    cafeIncomeSummary: getCafeIncomeForRange(orders, dateFrom, dateTo),
  }
}

export function groupAccountingHistoryRows(visibleRows = [], allRows = [], orders = []) {
  const groups = []
  for (const row of visibleRows || []) {
    const date = row?.expense_date || ''
    const current = groups[groups.length - 1]
    if (!current || current.date !== date) groups.push({ date, rows: [row] })
    else current.rows.push(row)
  }

  return groups.map(group => {
    const dayRows = (allRows || []).filter(row => row?.expense_date === group.date)
    const cafeIncomeSummary = getCafeIncomeForRange(orders, group.date, group.date)
    return {
      ...group,
      totalExpenses: summarizeExpenses(dayRows).total,
      cafeIncome: cafeIncomeSummary.total,
      loyaltyIncome: cafeIncomeSummary.loyaltyTotal,
      investorIncome: dayRows
        .filter(row => normalizeExpenseEntryType(row?.entry_type) === 'income' && row?.category === 'investor_support')
        .reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    }
  })
}
