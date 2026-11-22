import { formatCurrency } from './formatCurrency.js'

export function compareSalaryTransactionsNewestFirst(a, b) {
  const dateDifference = String(b?.date || '').localeCompare(String(a?.date || ''))
  if (dateDifference !== 0) return dateDifference

  const aCreatedAt = Date.parse(a?.createdAt || '')
  const bCreatedAt = Date.parse(b?.createdAt || '')
  const aHasTime = Number.isFinite(aCreatedAt)
  const bHasTime = Number.isFinite(bCreatedAt)
  if (aHasTime && bHasTime && aCreatedAt !== bCreatedAt) return bCreatedAt - aCreatedAt
  if (aHasTime !== bHasTime) return aHasTime ? -1 : 1

  return String(b?.id || '').localeCompare(String(a?.id || ''))
}

export function compareSalaryAbsencesNewestFirst(a, b) {
  return compareSalaryTransactionsNewestFirst(
    {
      id: a?.id,
      date: a?.absence_date,
      createdAt: a?.created_at,
    },
    {
      id: b?.id,
      date: b?.absence_date,
      createdAt: b?.created_at,
    }
  )
}

/**
 * One colour per kind of payroll entry, shared by Salaries, Employees, the salary history
 * and its calendar: a payment is the accent, a bonus (manual or KPI) is positive, a fine is
 * negative and an absence is caution. Class names are complete strings so Tailwind and the
 * dark-theme build can see them.
 */
export const SALARY_ENTRY_TONES = Object.freeze({
  payment: Object.freeze({ tone: 'accent', badge: 'ws-tone-accent', border: 'border-l-[#ff5a00]', text: 'text-[#bf4300]', dot: 'bg-[#ff5a00]' }),
  bonus: Object.freeze({ tone: 'positive', badge: 'ws-tone-positive', border: 'border-l-[#1d7a52]', text: 'text-[#1d7a52]', dot: 'bg-[#1d7a52]' }),
  kpi: Object.freeze({ tone: 'positive', badge: 'ws-tone-positive', border: 'border-l-[#1d7a52]', text: 'text-[#1d7a52]', dot: 'bg-[#1d7a52]' }),
  fine: Object.freeze({ tone: 'negative', badge: 'ws-tone-negative', border: 'border-l-[#c4262c]', text: 'text-[#c4262c]', dot: 'bg-[#c4262c]' }),
  absence: Object.freeze({ tone: 'caution', badge: 'ws-tone-caution', border: 'border-l-[#9a5a00]', text: 'text-[#9a5a00]', dot: 'bg-[#9a5a00]' }),
})

export function salaryEntryTone(entryType) {
  return SALARY_ENTRY_TONES[entryType] || SALARY_ENTRY_TONES.payment
}

const MINUS = '\u2212'

/**
 * A salary balance for display: an advance (negative balance) gets a real minus sign,
 * the same glyph the signed entry amounts use, instead of a hyphen. The number is unchanged.
 */
export function formatSalaryBalance(amount) {
  const number = Number(amount) || 0
  return number < 0 ? `${MINUS}${formatCurrency(Math.abs(number))}` : formatCurrency(number)
}

/** "+50 000 UZS" for a bonus, "\u221250 000 UZS" for a fine, unsigned for a payment or anything else. */
export function formatSalaryEntryAmount(entryType, amount) {
  const text = formatCurrency(Math.abs(Number(amount) || 0))
  if (entryType === 'fine') return `${MINUS}${text}`
  if (entryType === 'bonus' || entryType === 'kpi') return `+${text}`
  return text
}
