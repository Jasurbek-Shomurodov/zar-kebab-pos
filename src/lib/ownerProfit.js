import {
  addLocalDateDays,
  getSalaryAccruedAmount,
  getSalaryBonusAccruedAmount,
  getSalaryMonthEndDate,
  normalizeExpenseAmount,
} from './expenses.js'
import { assignCategoryColors, buildAccountingSankey, getTopExpenseCategories } from './accountingAnalysis.js'
import { supabase } from './supabase.js'
import { withReadTimeout, withWriteTimeout } from './writeTimeout.js'

// Monthly owner-profit close (migration 257). Each month starts from zero:
// its own income against its own costs, with salary counted in the month it
// was earned. Expenses may be back-dated three days, so a month can be closed
// from the 4th of the next month.
export const MONTH_CLOSE_BACKDATE_DAYS = 3

function amount(value) {
  return Math.round(Number(value) || 0)
}

function nextMonthStart(monthStart) {
  const [year, month] = monthStart.split('-').map(Number)
  const next = new Date(Date.UTC(year, month, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function getMonthCloseAvailableDate(monthStart) {
  return addLocalDateDays(nextMonthStart(monthStart), MONTH_CLOSE_BACKDATE_DAYS)
}

// Salary earned inside one month, per employee: base pay for worked days plus
// accruing bonuses, minus fines, all dated in the month. Payments never count;
// legacy immediately-paid bonuses are cash expenses the database adds itself.
export function getMonthSalaryEarned(salaryProfiles = [], monthStart, dateTo = getSalaryMonthEndDate(monthStart)) {
  const breakdown = []
  for (const salaryProfile of salaryProfiles || []) {
    if (!salaryProfile) continue
    const base = getSalaryAccruedAmount(salaryProfile, monthStart, dateTo)
    const bonuses = getSalaryBonusAccruedAmount(salaryProfile, monthStart, dateTo)
    const fines = (salaryProfile.fines || []).reduce((sum, fine) => {
      const fineDate = String(fine?.fine_date || '').slice(0, 10)
      return fineDate >= monthStart && fineDate <= dateTo ? sum + normalizeExpenseAmount(fine?.amount) : sum
    }, 0)
    if (!base && !bonuses && !fines) continue
    breakdown.push({
      salary_profile_id: salaryProfile.id,
      employee_name: salaryProfile.employee_name || salaryProfile.profile?.full_name || salaryProfile.profile?.email || '',
      base,
      bonuses,
      fines,
      earned: base + bonuses - fines,
    })
  }
  breakdown.sort((a, b) => b.earned - a.earned || a.employee_name.localeCompare(b.employee_name))
  return { total: breakdown.reduce((sum, row) => sum + row.earned, 0), breakdown }
}

function normalizeComponents(row = {}) {
  return {
    monthStart: String(row.month_start || '').slice(0, 10),
    cafeIncome: amount(row.cafe_income),
    otherIncome: amount(row.other_income),
    investorSupport: amount(row.investor_support),
    recordedExpenses: amount(row.recorded_expenses),
    legacyPaidBonuses: amount(row.legacy_paid_bonuses),
    employeeMeals: amount(row.employee_meals),
  }
}

export function normalizeMonthClose(row = {}) {
  return {
    ...normalizeComponents(row),
    id: row.id || null,
    salaryEarned: amount(row.salary_earned),
    salaryBreakdown: Array.isArray(row.salary_breakdown) ? row.salary_breakdown : [],
    ownerProfit: amount(row.owner_profit),
    settledAmount: amount(row.settled_amount),
    closedByName: row.closed_by_name || '',
    closedAt: row.closed_at || null,
  }
}

// Migration 258 adds each month's recorded expenses by category. Before it
// is applied the key is missing and the Sankey shows one Expenses node.
function normalizeExpenseCategories(rows) {
  if (!Array.isArray(rows)) return null
  const byMonth = {}
  for (const row of rows) {
    const monthStart = String(row?.month_start || '').slice(0, 10)
    const amountValue = amount(row?.amount)
    if (!/^\d{4}-\d{2}-01$/.test(monthStart) || amountValue <= 0) continue
    const category = String(row?.category || 'other')
    byMonth[monthStart] = byMonth[monthStart] || {}
    byMonth[monthStart][category] = (byMonth[monthStart][category] || 0) + amountValue
  }
  return byMonth
}

export function normalizeOwnerProfitData(data = {}) {
  return {
    today: String(data?.today || '').slice(0, 10),
    firstActiveMonth: data?.first_active_month ? String(data.first_active_month).slice(0, 10) : null,
    closes: (data?.closes || []).map(normalizeMonthClose).filter(row => /^\d{4}-\d{2}-01$/.test(row.monthStart)),
    openMonths: (data?.open_months || []).map(normalizeComponents).filter(row => /^\d{4}-\d{2}-01$/.test(row.monthStart)),
    expenseCategories: normalizeExpenseCategories(data?.expense_categories),
  }
}

export const OWNER_PROFIT_SALARY_NODE = 'salary_earned'
export const OWNER_PROFIT_LEGACY_BONUS_NODE = 'legacy_paid_bonuses'
export const OWNER_PROFIT_EXPENSES_NODE = 'recorded_expenses'

// One month as a money flow: cafe and other income into the month, out to
// expense categories, employee meals and salary earned, with owner profit as
// what is left, or a loss node on the income side when costs were higher.
// Investor support is not income here, the same as in owner profit.
// Categories are used only when they add up to the month's recorded expenses
// (always true once 257 locks a closed month); otherwise one Expenses node.
export function buildOwnerProfitSankey(row, monthCategories = null) {
  if (!row) return null
  const byCategory = {}
  const add = (key, value) => {
    const normalized = Math.max(0, amount(value))
    if (normalized > 0) byCategory[key] = (byCategory[key] || 0) + normalized
  }
  const categoryTotal = Object.values(monthCategories || {}).reduce((sum, value) => sum + value, 0)
  if (monthCategories && categoryTotal === row.recordedExpenses) {
    for (const [key, value] of Object.entries(monthCategories)) add(key, value)
  } else {
    add(OWNER_PROFIT_EXPENSES_NODE, row.recordedExpenses)
  }
  add('employee_meals', row.employeeMeals)
  add(OWNER_PROFIT_SALARY_NODE, row.salaryEarned)
  add(OWNER_PROFIT_LEGACY_BONUS_NODE, row.legacyPaidBonuses)
  const categories = getTopExpenseCategories(byCategory)
  return {
    categories,
    colors: assignCategoryColors(categories),
    sankey: buildAccountingSankey({ cafeIncome: row.cafeIncome, otherIncome: row.otherIncome, categories }),
  }
}

// One row per month, oldest first. Closed months show their frozen close.
// Open months are live: the oldest finished one is `ready` once the back-date
// window has passed, later finished ones `waiting`, this month `current`.
export function buildOwnerProfitMonths({ closes = [], openMonths = [], salaryProfiles = [], today = '' } = {}) {
  const rows = closes.map(close => ({
    ...close,
    status: 'closed',
    dateTo: getSalaryMonthEndDate(close.monthStart),
    income: close.cafeIncome + close.otherIncome,
    costs: close.recordedExpenses + close.legacyPaidBonuses + close.employeeMeals + close.salaryEarned,
  }))
  let readyAssigned = false
  for (const month of openMonths) {
    const monthEnd = getSalaryMonthEndDate(month.monthStart)
    const isCurrent = today && today <= monthEnd
    const dateTo = isCurrent ? today : monthEnd
    const salary = getMonthSalaryEarned(salaryProfiles, month.monthStart, dateTo)
    const income = month.cafeIncome + month.otherIncome
    const costs = month.recordedExpenses + month.legacyPaidBonuses + month.employeeMeals + salary.total
    const availableFrom = getMonthCloseAvailableDate(month.monthStart)
    let status = 'current'
    if (!isCurrent) {
      status = !readyAssigned && today >= availableFrom ? 'ready' : 'waiting'
      readyAssigned = true
    }
    rows.push({
      ...month,
      status,
      dateTo,
      availableFrom,
      salaryEarned: salary.total,
      salaryBreakdown: salary.breakdown,
      income,
      costs,
      ownerProfit: income - costs,
      settledAmount: income - costs + month.investorSupport,
    })
  }
  return rows.map(row => ({
    ...row,
    marginPct: row.income > 0 ? Math.round((row.ownerProfit / row.income) * 1000) / 10 : null,
  }))
}

export function summarizeClosedOwnerProfit(rows = []) {
  const closed = rows.filter(row => row.status === 'closed')
  const total = closed.reduce((sum, row) => sum + row.ownerProfit, 0)
  return {
    count: closed.length,
    total,
    average: closed.length ? Math.round(total / closed.length) : null,
    best: closed.reduce((best, row) => (!best || row.ownerProfit > best.ownerProfit ? row : best), null),
    worst: closed.reduce((worst, row) => (!worst || row.ownerProfit < worst.ownerProfit ? row : worst), null),
  }
}

// Actual owner profit for Financial analysis Overall: only closed months, whose
// figures are frozen. Finished months not closed yet are listed, never guessed,
// because their salary earned is only final at close.
export function buildOwnerProfitOverview(data = null, today = '') {
  if (!data) return null
  const closed = buildOwnerProfitMonths({ closes: data.closes || [] })
  const pending = (data.openMonths || [])
    .filter(month => getSalaryMonthEndDate(month.monthStart) < today)
    .map(month => month.monthStart)
  if (!closed.length && !pending.length) return null
  const summary = summarizeClosedOwnerProfit(closed)
  const income = closed.reduce((sum, row) => sum + row.income, 0)
  return {
    ...summary,
    marginPct: income > 0 ? Math.round((summary.total / income) * 1000) / 10 : null,
    profitableCount: closed.filter(row => row.ownerProfit > 0).length,
    months: closed.slice(-12).map(row => ({ key: row.monthStart.slice(0, 7), monthStart: row.monthStart, ownerProfit: row.ownerProfit, marginPct: row.marginPct })),
    pending,
  }
}

export const MONTH_CLOSE_ERROR_CODES = [
  'owner_required',
  'month_already_closed',
  'month_not_finished',
  'month_has_no_activity',
  'earlier_month_open',
  'salary_breakdown_mismatch',
  'kpi_days_pending',
  'meal_days_pending',
  'reopen_reason_required',
  'month_not_closed',
  'later_month_closed',
  'invalid_month_close',
]

export function getMonthCloseErrorCode(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`
  return MONTH_CLOSE_ERROR_CODES.find(code => message.includes(code)) || 'unknown'
}

export function isMissingOwnerProfitRpc(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return error?.code === 'PGRST202' || (message.includes('get_accounting_owner_profit') && (
    message.includes('could not find the function') || message.includes('schema cache') || message.includes('not found')
  ))
}

function withAbortSignal(query, signal) {
  if (signal && typeof query?.abortSignal === 'function') return query.abortSignal(signal)
  return query
}

export async function loadOwnerProfitData(options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await withReadTimeout(
    signal => withAbortSignal(dbClient.rpc('get_accounting_owner_profit'), signal),
    'OWNER_PROFIT',
  )
  if (error) throw error
  return normalizeOwnerProfitData(data)
}

// The request id must stay the same across retries of one close: a timeout is
// an unknown outcome, and the database returns the saved close for a repeat.
export async function closeAccountingMonth({ monthStart, salaryEarned, salaryBreakdown, requestId }, options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await withWriteTimeout(
    signal => withAbortSignal(dbClient.rpc('close_accounting_month', {
      p_month_start: monthStart,
      p_salary_earned: Math.round(Number(salaryEarned) || 0),
      p_salary_breakdown: salaryBreakdown || [],
      p_request_id: requestId,
    }), signal),
    'CLOSE_ACCOUNTING_MONTH',
    options.timeoutMs,
  )
  if (error) throw error
  return normalizeMonthClose(data)
}

// Owner-only (259): reopens the latest closed month with a reason and tells
// the Investor channel. Same request-id rule as a close.
export async function reopenAccountingMonth({ monthStart, reason, requestId }, options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await withWriteTimeout(
    signal => withAbortSignal(dbClient.rpc('reopen_accounting_month', {
      p_month_start: monthStart,
      p_reason: String(reason || '').trim(),
      p_request_id: requestId,
    }), signal),
    'REOPEN_ACCOUNTING_MONTH',
    options.timeoutMs,
  )
  if (error) throw error
  return data
}
