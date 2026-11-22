import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { getSalaryLedgerLoadError, isMissingSalaryMigration } from '../src/lib/salaryData.js'

const ok = { data: [], error: null }

test('a failed fines read blocks the salary balance instead of silently dropping the fines', () => {
  const timeout = { message: 'TypeError: Failed to fetch' }
  assert.equal(getSalaryLedgerLoadError([ok, ok, ok], { data: [], error: timeout }), timeout)
  assert.equal(getSalaryLedgerLoadError([ok, ok, ok], ok), null)
})

test('a database from before the fines migration still shows balances', () => {
  const missing = { code: '42P01', message: 'relation "public.employee_salary_fines" does not exist' }
  assert.equal(isMissingSalaryMigration(missing), true)
  assert.equal(getSalaryLedgerLoadError([ok, ok], { data: [], error: missing }), null)
})

test('any required ledger read failing wins over the fines result', () => {
  const paymentError = { message: 'payments read failed' }
  assert.equal(getSalaryLedgerLoadError([ok, { data: [], error: paymentError }], { data: [], error: { message: 'x' } }), paymentError)
})

test('an error that merely mentions an amount is not mistaken for a missing migration', () => {
  assert.equal(isMissingSalaryMigration({ message: 'employee_salary_payments: amount must be positive' }), false)
  assert.equal(isMissingSalaryMigration({ code: '42703', message: 'column employee_salary_profiles.kpi does not exist' }), true)
})

test('every page that shows a salary balance uses the shared ledger check', () => {
  for (const page of ['Salaries', 'Employees', 'EmployeeSalaryHistory', 'Expenses', 'MonthlyEstimate']) {
    const source = readFileSync(new URL(`../src/pages/${page}.jsx`, import.meta.url), 'utf8')
    assert.match(source, /getSalaryLedgerLoadError\(/, `${page} checks the whole ledger`)
    assert.doesNotMatch(source, /[Ff]ine(Res|Result)\.error \? \[\]/, `${page} must not compute a balance without fines`)
    assert.doesNotMatch(source, /function isMissingSalaryMigration/, `${page} uses the shared migration check`)
  }
})
