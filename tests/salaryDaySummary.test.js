import test from 'node:test'
import assert from 'node:assert/strict'
import { getSalaryDaySummary } from '../src/lib/expenses.js'

const employee = {
  id: 'e1',
  joined_at: '2026-10-10',
  is_active: true,
  rates: [{ effective_from: '2026-10-10', amount: 50000, rate_unit: 'daily' }],
  bonuses: [
    { bonus_date: '2026-10-14', amount: 12000, accrues_to_salary: true },
    { bonus_date: '2026-10-13', amount: 5000, accrues_to_salary: true },
    // Legacy immediately-paid bonuses never accrue into salary.
    { bonus_date: '2026-10-14', amount: 99000, accrues_to_salary: false },
  ],
  fines: [{ fine_date: '2026-10-14', amount: 20000 }, { fine_date: '2026-10-12', amount: 1000 }],
  payments: [{ paid_date: '2026-10-14', amount: 30000 }, { paid_date: '2026-10-11', amount: 40000 }],
  absences: [{ absence_date: '2026-10-12' }],
}

test('a day summary nets base pay, bonuses and fines dated that day', () => {
  assert.deepEqual(getSalaryDaySummary(employee, '2026-10-14'), { base: 50000, bonuses: 12000, fines: 20000, paid: 30000, earned: 42000 })
  // Absent days earn no base pay but still carry that day's fines.
  assert.deepEqual(getSalaryDaySummary(employee, '2026-10-12'), { base: 0, bonuses: 0, fines: 1000, paid: 0, earned: -1000 })
  // Before joining nothing accrues.
  assert.equal(getSalaryDaySummary(employee, '2026-10-09').earned, 0)
  assert.equal(getSalaryDaySummary({ ...employee, is_active: false, ended_at: '2026-10-13' }, '2026-10-14').base, 0)
})
