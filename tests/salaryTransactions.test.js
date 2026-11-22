import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compareSalaryAbsencesNewestFirst,
  compareSalaryTransactionsNewestFirst,
} from '../src/lib/salaryTransactions.js'

test('salary payments bonuses and fines sort by date then newest recorded time', () => {
  const rows = [
    { id: 'payment-old', date: '2026-07-20', createdAt: '2026-07-20T08:15:00+05:00' },
    { id: 'fine-new', date: '2026-07-20', createdAt: '2026-07-20T18:45:00+05:00' },
    { id: 'bonus-previous-day', date: '2026-07-19', createdAt: '2026-07-21T09:00:00+05:00' },
  ]

  assert.deepEqual(
    rows.sort(compareSalaryTransactionsNewestFirst).map(row => row.id),
    ['fine-new', 'payment-old', 'bonus-previous-day']
  )
})

test('salary transaction ordering remains deterministic when timestamps are missing', () => {
  const rows = [
    { id: 'a', date: '2026-07-20' },
    { id: 'b', date: '2026-07-20', createdAt: '2026-07-20T10:00:00Z' },
    { id: 'c', date: '2026-07-20' },
  ]

  assert.deepEqual(
    rows.sort(compareSalaryTransactionsNewestFirst).map(row => row.id),
    ['b', 'c', 'a']
  )
})

test('salary absences sort by newest absence date regardless of database row order', () => {
  const rows = [
    { id: 'june-20', absence_date: '2026-06-20' },
    { id: 'june-28', absence_date: '2026-06-28' },
    { id: 'july-24', absence_date: '2026-07-24' },
    { id: 'july-25', absence_date: '2026-07-25' },
    { id: 'july-26', absence_date: '2026-07-26' },
  ]

  assert.deepEqual(
    rows.sort(compareSalaryAbsencesNewestFirst).map(row => row.id),
    ['july-26', 'july-25', 'july-24', 'june-28', 'june-20']
  )
})

test('every payroll entry kind has one tone shared by all salary screens', async () => {
  const { SALARY_ENTRY_TONES, salaryEntryTone } = await import('../src/lib/salaryTransactions.js')
  assert.deepEqual(
    Object.fromEntries(Object.entries(SALARY_ENTRY_TONES).map(([key, value]) => [key, value.tone])),
    { payment: 'accent', bonus: 'positive', kpi: 'positive', fine: 'negative', absence: 'caution' }
  )
  for (const tone of Object.values(SALARY_ENTRY_TONES)) {
    assert.equal(tone.badge, `ws-tone-${tone.tone}`)
    assert.match(tone.border, /^border-l-\[#[0-9a-f]{6}\]$/)
    assert.match(tone.text, /^text-\[#[0-9a-f]{6}\]$/)
    assert.match(tone.dot, /^bg-\[#[0-9a-f]{6}\]$/)
  }
  // Small orange text uses the ink colour, never the 3.1:1 brand orange.
  assert.equal(SALARY_ENTRY_TONES.payment.text, 'text-[#bf4300]')
  assert.equal(salaryEntryTone('unknown'), SALARY_ENTRY_TONES.payment)
  assert.equal(salaryEntryTone('absence'), SALARY_ENTRY_TONES.absence)
})

test('balances and signed entry amounts share one minus glyph and keep the number', async () => {
  const { formatSalaryBalance, formatSalaryEntryAmount } = await import('../src/lib/salaryTransactions.js')
  const { formatCurrency } = await import('../src/lib/formatCurrency.js')
  assert.equal(formatSalaryBalance(854717), formatCurrency(854717))
  assert.equal(formatSalaryBalance(0), formatCurrency(0))
  assert.equal(formatSalaryBalance(-1250000), `−${formatCurrency(1250000)}`)
  assert.equal(formatSalaryBalance(null), formatCurrency(0))
  assert.equal(formatSalaryEntryAmount('fine', 50000), `−${formatCurrency(50000)}`)
  assert.equal(formatSalaryEntryAmount('bonus', 50000), `+${formatCurrency(50000)}`)
  assert.equal(formatSalaryEntryAmount('kpi', 67824), `+${formatCurrency(67824)}`)
  assert.equal(formatSalaryEntryAmount('payment', 900000), formatCurrency(900000))
  // No hyphen-minus anywhere: the two glyphs must not mix on one screen.
  assert.doesNotMatch(formatSalaryBalance(-5) + formatSalaryEntryAmount('fine', -5), /-/)
})
