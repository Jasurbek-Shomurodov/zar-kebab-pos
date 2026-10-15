export const MAX_RANGE_DAYS = 366
// Datasets built from individual paid orders stay short so one answer never
// pages through a year of orders.
export const MAX_ORDER_RANGE_DAYS = 92
export const MAX_TREND_MONTHS = 24

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function dayDiff(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * Resolves a requested period against the Tashkent business date. Missing
 * bounds default to the current month; the end never passes today.
 * Returns { from, to } or { error }.
 */
export function resolveRange(from, to, today, maxDays = MAX_RANGE_DAYS) {
  const start = from ?? `${today.slice(0, 7)}-01`
  let end = to ?? today
  if (!isRealIsoDate(start) || !isRealIsoDate(end)) return { error: 'Dates must be real YYYY-MM-DD dates.' }
  if (end > today) end = today
  if (start > end) return { error: `The period starts after its end (today is ${today}).` }
  if (dayDiff(start, end) + 1 > maxDays) {
    return { error: `This dataset allows at most ${maxDays} days. Use the monthly dataset or a shorter period.` }
  }
  return { from: start, to: end }
}

export function clampMonths(value) {
  if (value === undefined || value === null || !Number.isFinite(value)) return 12
  return Math.min(MAX_TREND_MONTHS, Math.max(1, Math.round(value)))
}
