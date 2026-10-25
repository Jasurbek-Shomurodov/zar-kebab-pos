import { supabase } from './supabase.js'
import { normalizeDailyBreakEvenSnapshot } from './dailyBreakEven.js'

// Daily break-even target history (migration 260). Each row applies from its
// Tashkent date until the next row. Since 263 the cron writes one row per
// finished day, dated that day, from its own figures. A period uses the
// average of its completed days' targets.

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

function addDays(date, days) {
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(ms) ? new Date(ms + days * 86400000).toISOString().slice(0, 10) : date
}

// Average of the daily targets over the period's completed days (before
// today); a period with no completed day yet uses today's target.
export function breakEvenTargetForPeriod(history = [], dateFrom = '', dateTo = '', today = '', fallback = 0) {
  const from = dateFrom || dateTo
  const lastCompleted = today ? addDays(today, -1) : dateTo
  const to = dateTo < lastCompleted ? dateTo : lastCompleted
  if (!from || !to || to < from) return breakEvenTargetOn(history, today || dateTo, fallback)
  let sum = 0
  let days = 0
  for (let date = from; date <= to && days < 400; date = addDays(date, 1)) {
    sum += breakEvenTargetOn(history, date, fallback)
    days += 1
  }
  return Math.round(sum / days)
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
