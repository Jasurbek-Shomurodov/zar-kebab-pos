import { compareSalaryTransactionsNewestFirst } from './salaryTransactions.js'
import { indexKpiResultsByBonusId } from './dailyKpi.js'
import { ATTENDANCE_START_DATE } from './attendance.js'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function normalizeEntryDate(value) {
  const date = String(value || '').slice(0, 10)
  return ISO_DATE_PATTERN.test(date) ? date : ''
}

function normalizeAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

export function normalizeSalaryHistoryMonth(value, fallback = '') {
  const match = String(value || '').match(MONTH_PATTERN)
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) return `${match[1]}-${match[2]}`
  const fallbackMatch = String(fallback || '').match(MONTH_PATTERN)
  return fallbackMatch && Number(fallbackMatch[2]) >= 1 && Number(fallbackMatch[2]) <= 12
    ? `${fallbackMatch[1]}-${fallbackMatch[2]}`
    : ''
}

export function shiftSalaryHistoryMonth(month, offset) {
  const normalized = normalizeSalaryHistoryMonth(month)
  if (!normalized) return ''
  const [year, monthNumber] = normalized.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + Number(offset || 0), 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

export function buildSalaryHistoryEntries({
  payments = [],
  bonuses = [],
  fines = [],
  absences = [],
  kpiResults = [],
} = {}) {
  const kpiResultsByBonusId = indexKpiResultsByBonusId(kpiResults)
  const entries = [
    ...payments.map(payment => ({
      id: payment.id,
      entryType: 'payment',
      date: normalizeEntryDate(payment.paid_date),
      createdAt: payment.created_at || '',
      amount: normalizeAmount(payment.amount),
      detail: payment.note || '',
      paymentMethod: payment.payment_method || '',
    })),
    ...bonuses.map(bonus => {
      const kpiResult = kpiResultsByBonusId.get(bonus.id)
      return {
        id: bonus.id,
        entryType: 'bonus',
        date: normalizeEntryDate(bonus.bonus_date),
        createdAt: bonus.created_at || '',
        amount: normalizeAmount(bonus.amount),
        detail: bonus.note || '',
        paymentMethod: bonus.payment_method || '',
        accruesToSalary: bonus.accrues_to_salary === true,
        automaticKpi: bonus.source_type === 'daily_kpi' || Boolean(kpiResult),
        kpiResult: kpiResult || null,
      }
    }),
    ...fines.map(fine => ({
      id: fine.id,
      entryType: 'fine',
      date: normalizeEntryDate(fine.fine_date),
      createdAt: fine.created_at || '',
      amount: normalizeAmount(fine.amount),
      detail: fine.reason || '',
      paymentMethod: '',
    })),
    ...absences.map(absence => ({
      id: absence.id,
      entryType: 'absence',
      date: normalizeEntryDate(absence.absence_date),
      createdAt: absence.created_at || '',
      amount: 0,
      detail: absence.note || '',
      paymentMethod: '',
    })),
  ]

  return entries
    .filter(entry => entry.id && entry.date)
    .sort(compareSalaryTransactionsNewestFirst)
}

export function filterSalaryHistoryEntries(entries = [], {
  month = '',
  date = '',
  entryType = 'all',
} = {}) {
  const normalizedMonth = normalizeSalaryHistoryMonth(month)
  const normalizedDate = normalizeEntryDate(date)
  return entries.filter(entry => (
    (!normalizedMonth || entry.date.startsWith(normalizedMonth)) &&
    (!normalizedDate || entry.date === normalizedDate) &&
    (entryType === 'all' || entry.entryType === entryType)
  ))
}

export function groupSalaryHistoryEntries(entries = []) {
  const groups = []
  const byDate = new Map()

  for (const entry of [...entries].sort(compareSalaryTransactionsNewestFirst)) {
    let group = byDate.get(entry.date)
    if (!group) {
      group = { date: entry.date, entries: [] }
      byDate.set(entry.date, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }

  return groups
}

export function summarizeSalaryHistoryMonth(entries = [], month = '') {
  const summary = {
    paymentAmount: 0,
    bonusAmount: 0,
    kpiBonusAmount: 0,
    fineAmount: 0,
    absenceCount: 0,
    entryCount: 0,
  }

  for (const entry of filterSalaryHistoryEntries(entries, { month })) {
    summary.entryCount += 1
    if (entry.entryType === 'payment') summary.paymentAmount += normalizeAmount(entry.amount)
    if (entry.entryType === 'bonus') {
      const amount = normalizeAmount(entry.amount)
      if (entry.automaticKpi) summary.kpiBonusAmount += amount
      else summary.bonusAmount += amount
    }
    if (entry.entryType === 'fine') summary.fineAmount += normalizeAmount(entry.amount)
    if (entry.entryType === 'absence') summary.absenceCount += 1
  }

  return summary
}

// Whether the employee worked a day: an absence record says no; a QR check-in
// says yes. From the attendance start date an on-site employee with neither is
// "no check-in" once the day is over. Before that, every employed day without an
// absence counts as worked. Days outside joined_at..ended_at or after today
// have no status.
export function getSalaryHistoryWorkStatus(date, {
  today = '',
  joinedAt = '',
  endedAt = '',
  absent = false,
  checkin = null,
  worksRemotely = false,
  attendanceStartDate = ATTENDANCE_START_DATE,
} = {}) {
  const day = normalizeEntryDate(date)
  if (!day) return null
  if (absent) return 'absent'
  const joined = normalizeEntryDate(joinedAt)
  const ended = normalizeEntryDate(endedAt)
  if ((today && day > today) || (joined && day < joined) || (ended && day > ended)) return null
  if (checkin) return 'worked'
  if (worksRemotely || !attendanceStartDate || day < attendanceStartDate) return 'worked'
  return day === today ? null : 'noCheckin'
}

export function buildSalaryHistoryCalendar(month, entries = [], today = '', employment = null) {
  const normalizedMonth = normalizeSalaryHistoryMonth(month)
  if (!normalizedMonth) return []
  const [year, monthNumber] = normalizedMonth.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1))
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7
  const calendarStart = new Date(Date.UTC(year, monthNumber - 1, 1 - mondayOffset))
  const entriesByDate = new Map()

  for (const entry of entries) {
    const dateEntries = entriesByDate.get(entry.date) || []
    dateEntries.push(entry)
    entriesByDate.set(entry.date, dateEntries)
  }

  return Array.from({ length: 42 }, (_, index) => {
    const dateValue = new Date(calendarStart)
    dateValue.setUTCDate(calendarStart.getUTCDate() + index)
    const date = formatUtcDate(dateValue)
    const dayEntries = entriesByDate.get(date) || []
    const checkin = employment?.checkins?.get?.(date) || null
    return {
      date,
      day: dateValue.getUTCDate(),
      inMonth: date.startsWith(normalizedMonth),
      isToday: date === today,
      entries: dayEntries,
      entryTypes: [...new Set(dayEntries.map(entry => entry.entryType))],
      checkin,
      workStatus: employment
        ? getSalaryHistoryWorkStatus(date, {
          ...employment,
          today,
          checkin,
          absent: dayEntries.some(entry => entry.entryType === 'absence'),
        })
        : null,
    }
  })
}
