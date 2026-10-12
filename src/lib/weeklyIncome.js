import { supabase } from './supabase.js'

export async function loadDashboardWeeklyIncome(monthStart, { signal, dbClient = supabase } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(monthStart)) throw new Error('Invalid month')
  let request = dbClient.rpc('get_dashboard_recent_period_income', { p_month_start: monthStart })
  if (signal && typeof request.abortSignal === 'function') request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw error
  return normalizeDashboardWeeklyIncomeRows(data)
}

export function normalizeDashboardWeeklyIncomeRows(rows = []) {
  return (rows || []).map(row => ({
    weekStart: row.week_start,
    weekEnd: row.week_end,
    totalIncome: Number(row.total_income) || 0,
    dayCount: Number(row.day_count) || 0,
    averageDailyIncome: Number(row.average_daily_income) || 0,
  }))
}

// Presentation only: preserve zero-sale periods within an income-producing month.
export function hideZeroIncomeMonths(rows = []) {
  const activeMonths = new Set(rows.filter(row => row.totalIncome > 0).map(row => row.weekStart.slice(0, 7)))
  return rows.filter(row => activeMonths.has(row.weekStart.slice(0, 7)))
}

export function buildIncomeMonthOptions(firstMonth, currentMonth) {
  const result = []
  const [firstYear, firstNumber] = firstMonth.split('-').map(Number)
  const [year, number] = currentMonth.split('-').map(Number)
  for (let index = year * 12 + number - 1; index >= firstYear * 12 + firstNumber - 1; index -= 1) {
    result.push(Math.floor(index / 12) + '-' + String(index % 12 + 1).padStart(2, '0'))
  }
  return result
}

export function incomeMonthColors(month) {
  const [year, number] = month.split('-').map(Number)
  const hue = Math.round(((year * 12 + number - 1) * 137.508) % 360)
  return { background: 'hsl(' + hue + ' 65% 96%)', border: 'hsl(' + hue + ' 65% 32%)' }
}

export const FIRST_ORDER_MONTH_STORAGE_KEY = 'zar-first-order-month'

function readStoredMonth(storage) {
  try {
    const value = storage?.getItem(FIRST_ORDER_MONTH_STORAGE_KEY)
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '') ? value : null
  } catch {
    return null
  }
}

// The first order's month only starts the month picker, and it does not move
// forward, so it is remembered per browser after the first lookup. A deleted
// first order can leave one extra empty month at the start, which is harmless.
export async function loadFirstOrderMonth({ loadEarliestDate, toMonth, storage = globalThis.localStorage } = {}) {
  const stored = readStoredMonth(storage)
  if (stored) return stored
  const date = await loadEarliestDate()
  const month = date ? toMonth(date) : ''
  if (month) {
    try { storage?.setItem(FIRST_ORDER_MONTH_STORAGE_KEY, month) } catch { /* private mode or blocked storage */ }
  }
  return month
}
