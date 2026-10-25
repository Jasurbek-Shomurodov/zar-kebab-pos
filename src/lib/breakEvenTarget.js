import { supabase } from './supabase.js'
import { normalizeDailyBreakEvenSnapshot } from './dailyBreakEven.js'

// Daily break-even target history (migration 260). Each row applies from its
// Tashkent date until the next row; a period uses the target in effect on its
// last day, or today while the period is still open.

function toNonNegativeInteger(value) {
  return Math.max(0, Math.round(Number(value) || 0))
}

export function normalizeBreakEvenTargetHistory(rows = []) {
  return (rows || [])
    .map(row => ({
      effectiveFrom: String(row?.effective_from || '').slice(0, 10),
      amount: toNonNegativeInteger(row?.amount_uzs),
      changedAt: row?.changed_at || '',
    }))
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.effectiveFrom))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
}

// Dates before the first row use the first row: it is the original target.
export function breakEvenTargetOn(history = [], date = '', fallback = 0) {
  if (!history.length) return toNonNegativeInteger(fallback)
  let amount = history[0].amount
  for (const row of history) {
    if (row.effectiveFrom > date) break
    amount = row.amount
  }
  return amount
}

export function breakEvenTargetForPeriod(history = [], dateTo = '', today = '', fallback = 0) {
  const date = today && dateTo > today ? today : dateTo
  return breakEvenTargetOn(history, date, fallback)
}

export function lastDayOfMonth(monthStart = '') {
  const [year, month] = monthStart.split('-').map(Number)
  if (!year || !month) return monthStart
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function isMissingHistoryTable(error) {
  const message = String(error?.message || '')
  return error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('business_break_even_target_history')
}

// Before migration 260 the charts keep the current settings value.
export async function loadBreakEvenTargetHistory(options = {}) {
  const dbClient = options.dbClient || supabase
  let request = dbClient
    .from('business_break_even_target_history')
    .select('effective_from, amount_uzs, changed_at')
    .order('effective_from', { ascending: true })
  if (options.signal && typeof request?.abortSignal === 'function') request = request.abortSignal(options.signal)
  const { data, error } = await request
  if (error) {
    if (isMissingHistoryTable(error)) return []
    throw error
  }
  return normalizeBreakEvenTargetHistory(data)
}

// The newest calculated day (migration 263); null before the first calculation.
export async function loadLatestDailyBreakEven(options = {}) {
  const dbClient = options.dbClient || supabase
  let request = dbClient
    .from('daily_break_even_snapshots')
    .select('*')
    .order('business_date', { ascending: false })
    .limit(1)
  if (options.signal && typeof request?.abortSignal === 'function') request = request.abortSignal(options.signal)
  const { data, error } = await request.maybeSingle()
  if (error) {
    if (error?.code === '42P01' || error?.code === 'PGRST205' || String(error?.message || '').includes('daily_break_even_snapshots')) return null
    throw error
  }
  return normalizeDailyBreakEvenSnapshot(data)
}
