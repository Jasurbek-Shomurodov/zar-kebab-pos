import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSalaryHistoryCalendar,
  buildSalaryHistoryEntries,
  getSalaryHistoryWorkStatus,
  filterSalaryHistoryEntries,
  groupSalaryHistoryEntries,
  normalizeSalaryHistoryMonth,
  shiftSalaryHistoryMonth,
  summarizeSalaryHistoryMonth,
} from '../src/lib/salaryHistory.js'

test('salary history maps all record types and sorts by effective date then recorded time', () => {
  const entries = buildSalaryHistoryEntries({
    payments: [{
      id: 'payment-old',
      paid_date: '2026-08-08',
      created_at: '2026-08-08T10:06:00+05:00',
      amount: '500000',
      payment_method: 'card',
    }],
    bonuses: [{
      id: 'bonus-new',
      bonus_date: '2026-08-08',
      created_at: '2026-08-08T11:06:00+05:00',
      amount: 100000,
      note: 'Great shift',
    }],
    fines: [{
      id: 'fine',
      fine_date: '2026-08-07',
      created_at: '2026-08-09T09:00:00+05:00',
      amount: 25000,
      reason: 'Late',
    }],
    absences: [{
      id: 'absence',
      absence_date: '2026-08-06',
      created_at: '2026-08-06T08:00:00+05:00',
      note: 'Sick day',
    }],
  })

  assert.deepEqual(entries.map(entry => entry.id), ['bonus-new', 'payment-old', 'fine', 'absence'])
  assert.deepEqual(entries.map(entry => entry.entryType), ['bonus', 'payment', 'fine', 'absence'])
  assert.equal(entries[1].paymentMethod, 'card')
  assert.equal(entries[2].detail, 'Late')
  assert.equal(entries[3].amount, 0)
})

test('salary history decorates automatic KPI bonuses with their immutable formula snapshot', () => {
  const [entry] = buildSalaryHistoryEntries({
    bonuses: [{
      id: 'bonus-kpi',
      bonus_date: '2026-08-14',
      amount: 97_750,
      source_type: 'daily_kpi',
      accrues_to_salary: true,
    }],
    kpiResults: [{
      id: 'kpi-result',
      bonus_id: 'bonus-kpi',
      business_date: '2026-08-14',
      sales_base_amount: 9_775_000,
      rate_bps: 100,
      bonus_amount: 97_750,
      status: 'generated',
    }],
  })

  assert.equal(entry.automaticKpi, true)
  assert.equal(entry.accruesToSalary, true)
  assert.equal(entry.kpiResult.baseAmountUzs, 9_775_000)
  assert.equal(entry.kpiResult.rateBps, 100)
  assert.equal(entry.kpiResult.bonusAmountUzs, 97_750)
  assert.equal(summarizeSalaryHistoryMonth([entry], '2026-08').kpiBonusAmount, 97_750)
})

test('monthly bonus cards separate manually added bonuses from automatic KPI', () => {
  const entries = buildSalaryHistoryEntries({
    bonuses: [
      { id: 'manual', bonus_date: '2026-08-12', amount: 500_000 },
      { id: 'kpi', bonus_date: '2026-08-31', amount: 3_001_681, source_type: 'daily_kpi' },
      { id: 'next-month', bonus_date: '2026-09-01', amount: 100_000, source_type: 'daily_kpi' },
    ],
  })
  const summary = summarizeSalaryHistoryMonth(entries, '2026-08')
  assert.equal(summary.bonusAmount, 500_000)
  assert.equal(summary.kpiBonusAmount, 3_001_681)
  assert.equal(summary.bonusAmount + summary.kpiBonusAmount, 3_501_681)
})

test('salary history calendar is Monday-first, fixed-height, and marks activity and today', () => {
  const entries = buildSalaryHistoryEntries({
    payments: [{ id: 'payment', paid_date: '2026-08-08', amount: 500000 }],
    bonuses: [{ id: 'bonus', bonus_date: '2026-08-08', amount: 100000 }],
    absences: [{ id: 'absence', absence_date: '2026-08-10' }],
  })
  const days = buildSalaryHistoryCalendar('2026-08', entries, '2026-08-08')

  assert.equal(days.length, 42)
  assert.equal(days[0].date, '2026-07-27')
  assert.equal(days.at(-1).date, '2026-09-06')
  assert.equal(days.find(day => day.date === '2026-08-08').isToday, true)
  assert.deepEqual(days.find(day => day.date === '2026-08-08').entryTypes.sort(), ['bonus', 'payment'])
  assert.equal(days.find(day => day.date === '2026-08-10').entries.length, 1)
})

test('salary history month and day filters preserve grouped newest-first activity', () => {
  const entries = buildSalaryHistoryEntries({
    payments: [
      { id: 'aug-8', paid_date: '2026-08-08', amount: 500000 },
      { id: 'july', paid_date: '2026-07-30', amount: 200000 },
    ],
    bonuses: [{ id: 'aug-7', bonus_date: '2026-08-07', amount: 100000 }],
    fines: [{ id: 'aug-fine', fine_date: '2026-08-08', amount: 25000 }],
    absences: [{ id: 'aug-absence', absence_date: '2026-08-05' }],
  })

  const august = filterSalaryHistoryEntries(entries, { month: '2026-08' })
  const augustPayments = filterSalaryHistoryEntries(entries, { month: '2026-08', entryType: 'payment' })
  const augustEighth = filterSalaryHistoryEntries(entries, { month: '2026-08', date: '2026-08-08' })
  const groups = groupSalaryHistoryEntries(august)
  const summary = summarizeSalaryHistoryMonth(entries, '2026-08')

  assert.equal(august.length, 4)
  assert.deepEqual(augustPayments.map(entry => entry.id), ['aug-8'])
  assert.deepEqual(augustEighth.map(entry => entry.id), ['aug-fine', 'aug-8'])
  assert.deepEqual(groups.map(group => group.date), ['2026-08-08', '2026-08-07', '2026-08-05'])
  assert.deepEqual(summary, {
    paymentAmount: 500000,
    bonusAmount: 100000,
    kpiBonusAmount: 0,
    fineAmount: 25000,
    absenceCount: 1,
    entryCount: 4,
  })
})

test('salary history month navigation crosses years and rejects invalid months', () => {
  assert.equal(shiftSalaryHistoryMonth('2026-01', -1), '2025-12')
  assert.equal(shiftSalaryHistoryMonth('2026-12', 1), '2027-01')
  assert.equal(normalizeSalaryHistoryMonth('2026-13', '2026-08'), '2026-08')
  assert.equal(normalizeSalaryHistoryMonth('not-a-month', '2026-08'), '2026-08')
})

test('salary history calendar marks worked, absent and missing check-in days within employment', () => {
  const entries = buildSalaryHistoryEntries({
    absences: [{ id: 'absence-1', absence_date: '2026-10-13', created_at: '2026-10-13T10:00:00Z' }],
  })
  const checkins = new Map([['2026-10-16', { business_date: '2026-10-16', checked_in_at: '2026-10-16T04:05:00Z' }]])
  const days = buildSalaryHistoryCalendar('2026-10', entries, '2026-10-20', {
    joinedAt: '2026-10-05',
    endedAt: '',
    worksRemotely: false,
    checkins,
  })
  const status = date => days.find(day => day.date === date).workStatus

  assert.equal(status('2026-10-04'), null, 'before joining')
  assert.equal(status('2026-10-12'), 'worked', 'before attendance tracking')
  assert.equal(status('2026-10-13'), 'absent')
  assert.equal(status('2026-10-16'), 'worked', 'checked in')
  assert.equal(days.find(day => day.date === '2026-10-16').checkin, checkins.get('2026-10-16'))
  assert.equal(status('2026-10-17'), 'noCheckin')
  assert.equal(status('2026-10-20'), null, 'today without a check-in is still open')
  assert.equal(status('2026-10-21'), null, 'future')
})

test('salary history work status trusts remote employees and employment end dates', () => {
  assert.equal(getSalaryHistoryWorkStatus('2026-10-17', { today: '2026-10-20', worksRemotely: true }), 'worked')
  assert.equal(getSalaryHistoryWorkStatus('2026-10-18', { today: '2026-10-20', endedAt: '2026-10-17' }), null)
  assert.equal(getSalaryHistoryWorkStatus('2026-10-18', { today: '2026-10-20', absent: true }), 'absent')
  assert.equal(buildSalaryHistoryCalendar('2026-10', [], '2026-10-20')[5].workStatus, null)
})
