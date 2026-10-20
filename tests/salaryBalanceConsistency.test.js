import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getActiveKpiAccounts } from '../src/lib/dailyKpi.js'
import { loadSalaryRows } from '../src/lib/salaryData.js'
import { compareSalaryAbsencesNewestFirst } from '../src/lib/salaryTransactions.js'
import { buildSalaryHistoryEntries } from '../src/lib/salaryHistory.js'
import {
  getSalaryBalance, getTotalSalaryDue, getSalaryAccruedAmount,
  buildSalaryPaymentExpenseRows, buildSalaryBonusExpenseRows,
  getSelectedMonthSalaryOperatingSummary,
} from '../src/lib/expenses.js'
import { loadSalaryProfiles } from '../api/telegram/_lib/salaryProfileData.js'
import { buildDailySalaryMessage, getDailySalaryNotificationSummary, getDailyPayrollGroupSummary } from '../api/telegram/_lib/salaryMessages.js'
import { buildEmployeePaymentMessage, buildEmployeeSalaryEventMessage } from '../api/telegram/_lib/paymentMessages.js'

const today = '2026-09-06'
const employeeId = 'employee-1'
function fixture() {
  const related = rows => rows.map((row, index) => ({ id: String(index).padStart(5, '0'), salary_profile_id: employeeId, ...row }))
  return {
    employee_salary_profiles: [{ id: employeeId, employee_name: 'Test employee', joined_at: '2026-07-27', is_active: true }],
    employee_salary_rates: related([{ effective_from: '2026-07-27', amount: 100_000, rate_unit: 'daily' }]),
    employee_salary_payments: related([{ paid_date: '2026-08-31', amount: 2_650_000 }, { paid_date: '2026-09-02', amount: 900_000 }]),
    employee_salary_bonuses: related([67_824, 58_236, 58_410, 73_596, 46_651].map((amount, index) => ({
      bonus_date: `2026-09-0${index + 1}`, amount, source_type: 'daily_kpi', accrues_to_salary: true,
    }))),
    employee_salary_fines: [],
    employee_salary_absences: related([{ absence_date: today }]),
  }
}

// Simulate PostgREST's response cap and filtering, including failures on later pages.
function mockDb(tables, fail = () => false) {
  return { from(table) {
    let rows = [...(tables[table] || [])]
    let offset = 0
    let end = 999
    let single = false
    const query = {
      select() { return this },
      order() { return this },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return this },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return this },
      lte(key, value) { rows = rows.filter(row => row[key] <= value); return this },
      range(from, to) { offset = from; end = to; return this },
      maybeSingle() { single = true; return this },
      delete() { return this },
      then(resolve, reject) {
        const result = fail(table, offset)
          ? { data: null, error: new Error('Payroll page unavailable') }
          : { data: single ? rows[0] : rows.slice(offset, Math.min(end + 1, offset + 1000)), error: null }
        return Promise.resolve(result).then(resolve, reject)
      },
    }
    return query
  } }
}

// Exercise the actual page loaders/state updates without mounting protected JSX.
function pageFunction(page, name, dependencies = {}, nested = true) {
  const source = readFileSync(new URL(`../src/pages/${page}.jsx`, import.meta.url), 'utf8')
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source)
  assert.ok(match, `${name} exists`)
  const endMarker = nested ? '\n  }' : '\n}'
  const end = source.indexOf(endMarker, match.index) + endMarker.length
  return new Function(...Object.keys(dependencies), `${source.slice(match.index, end)}; return ${name}`)(...Object.values(dependencies))
}

async function loadPage(page, tables) {
  let employees = []
  let error = ''
  const dependencies = {
    supabase: mockDb(tables), employeeId, today, loadSalaryRows, buildSalaryHistoryEntries,
    setEmployees: value => { employees = value },
    setSalaryProfiles: value => { employees = value },
    setEmployee: value => { employees = [value] },
    setEntries() {}, setCheckins() {}, setLoading() {}, setError: value => { error = value },
    getActiveKpiAccounts,
    setKpiAccountsError() {}, setKpiAccounts() {}, setKpiRules() {}, setKpiRulesAvailable() {}, setTelegramLinks() {}, loadTelegramDeliveryData() {},
    isMissingSalaryMigration: () => false, l: {},
  }
  if (page !== 'EmployeeSalaryHistory') {
    const composeName = page === 'Employees' ? 'composeEmployees' : 'composeSalaryProfiles'
    dependencies[composeName] = pageFunction(page, composeName, { compareSalaryAbsencesNewestFirst }, false)
  }
  const loaderName = { Employees: 'loadEmployees', Salaries: 'loadData', EmployeeSalaryHistory: 'loadHistory' }[page]
  await pageFunction(page, loaderName, dependencies)()
  assert.equal(error, '')
  return employees[0]
}

test('all salary pages and Telegram reconcile the same opening balance, KPI and payment ledger', async () => {
  const tables = fixture()
  for (const page of ['Salaries', 'Employees', 'EmployeeSalaryHistory']) {
    const employee = await loadPage(page, tables)
    assert.equal(getSalaryBalance(employee, '2026-08-31'), 950_000, page)
    assert.equal(getSalaryAccruedAmount(employee, '2026-09-01', today), 500_000, page)
    assert.equal(getSalaryBalance(employee, today), 854_717, page)
  }
  const employee = (await loadSalaryProfiles(mockDb(tables), [employeeId])).get(employeeId)
  const summary = getDailySalaryNotificationSummary(employee, today)
  assert.equal(summary.due, 854_717)
  assert.match(buildDailySalaryMessage(employee, today, 'ru'), /К выплате:<\/b> 854 717 UZS/)
  assert.match(buildEmployeePaymentMessage({ amount: 900_000, paid_date: today }, summary.due, 'ru'), /854 717 UZS/)
  assert.match(buildEmployeeSalaryEventMessage('bonus', { amount: 46_651, bonus_date: today, accrues_to_salary: true }, summary.due, 'ru'), /854 717 UZS/)
})

test('manual bonuses, legacy paid bonuses, fines and future entries keep liability and cash reports distinct', async () => {
  const tables = fixture()
  tables.employee_salary_bonuses.push(
    { id: 'manual', salary_profile_id: employeeId, bonus_date: today, amount: 20_000, accrues_to_salary: true },
    { id: 'legacy', salary_profile_id: employeeId, bonus_date: today, amount: 50_000, accrues_to_salary: false },
    { id: 'future', salary_profile_id: employeeId, bonus_date: '2026-09-07', amount: 90_000, accrues_to_salary: true },
  )
  tables.employee_salary_fines.push({ id: 'fine', salary_profile_id: employeeId, fine_date: today, amount: 10_000 })
  const employee = (await loadSalaryProfiles(mockDb(tables), [employeeId])).get(employeeId)
  assert.equal(getSalaryBalance(employee, today), 864_717)
  const cashRows = [...buildSalaryPaymentExpenseRows([employee], '2026-09-01', today), ...buildSalaryBonusExpenseRows([employee], '2026-09-01', today)]
  assert.equal(cashRows.reduce((sum, row) => sum + row.amount, 0), 950_000)
  for (const page of ['Expenses', 'MonthlyEstimate', 'Reports', 'AccountingHistory']) {
    const compose = pageFunction(page, 'composeSalaryProfiles', {}, false)
    const args = page === 'AccountingHistory'
      ? [tables.employee_salary_profiles, employee.payments, employee.bonuses, employee.absences, []]
      : page === 'Reports'
        ? [tables.employee_salary_profiles, employee.rates, employee.payments, employee.bonuses, employee.absences, []]
        : [tables.employee_salary_profiles, employee.rates, employee.payments, employee.bonuses, employee.fines, employee.absences, []]
    const models = compose(...args)
    const rows = [...buildSalaryPaymentExpenseRows(models, '2026-09-01', today), ...buildSalaryBonusExpenseRows(models, '2026-09-01', today)]
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 950_000, page)
    if (page === 'Expenses' || page === 'MonthlyEstimate') assert.equal(getTotalSalaryDue(models, today), 864_717, page)
  }
  const estimate = getSelectedMonthSalaryOperatingSummary([employee], today)
  assert.equal(estimate.accruedBonuses, 324_717)
  assert.equal(estimate.expectedSalaryCost, 2_900_000 + 324_717 - 10_000)
  const advanceEmployee = { ...employee, payments: [{ amount: 10_000_000, paid_date: today }] }
  assert.equal(getTotalSalaryDue([employee, advanceEmployee], today), 864_717)
  const daily = getDailyPayrollGroupSummary([employee], [
    { status: 'generated', bonus_amount: 46_651 }, { status: 'voided', bonus_amount: 1_000_000 },
  ], '2026-09-05')
  assert.equal(daily.combinedTotal, 146_651)
})

test('page and Telegram loaders include more than 1000 bonus records without mixing employees', async () => {
  const tables = fixture()
  tables.employee_salary_bonuses = Array.from({ length: 1205 }, (_, index) => ({
    id: String(index).padStart(5, '0'), salary_profile_id: employeeId,
    bonus_date: '2026-09-01', amount: 10, accrues_to_salary: true,
  }))
  tables.employee_salary_bonuses.push({ id: 'other', salary_profile_id: 'other', bonus_date: today, amount: 1_000_000, accrues_to_salary: true })
  for (const page of ['Salaries', 'Employees', 'EmployeeSalaryHistory']) {
    const employee = await loadPage(page, tables)
    assert.equal(employee.bonuses.length, 1205, page)
    assert.equal(getSalaryBalance(employee, today), 562_050, page)
  }
  const employee = (await loadSalaryProfiles(mockDb(tables), [employeeId])).get(employeeId)
  assert.equal(getDailySalaryNotificationSummary(employee, today).due, 562_050)
  const failingDb = mockDb(tables, (table, offset) => table === 'employee_salary_bonuses' && offset === 500)
  const result = await loadSalaryRows(() => failingDb.from('employee_salary_bonuses').select('*'))
  assert.deepEqual(result.data, [])
  assert.ok(result.error)
  await assert.rejects(loadSalaryProfiles(failingDb, [employeeId]), /Payroll page unavailable/)
})

test('deleting a bonus immediately removes it from salary balance after successful retraction and deletion', async () => {
  let employee = (await loadSalaryProfiles(mockDb(fixture()), [employeeId])).get(employeeId)
  const entry = { id: employee.bonuses[0].id, entryType: 'bonus' }
  let retracted = false
  const deleteEntry = pageFunction('EmployeeSalaryHistory', 'deleteHistoryEntry', {
    saving: '', canDeleteHistory: true, HISTORY_TABLE_BY_TYPE: { bonus: 'employee_salary_bonuses' },
    confirmActionKey: `bonus-history-delete-${entry.id}`, employeeId, l: {},
    supabase: mockDb(fixture()), setSaving() {}, setError(value) { assert.equal(value, '') },
    setConfirmActionKey() {}, setEntries() {},
    retractTelegramSalaryEvent: async () => { retracted = true },
    setEmployee: update => { assert.ok(retracted); employee = update(employee) },
  })
  await deleteEntry(entry)
  assert.equal(getSalaryBalance(employee, today), 854_717 - 67_824)
})


test('rate deletion confirms, retracts Telegram first, checks the exact row and refreshes history', async () => {
  const entry = { id: 'rate', entryType: 'rate' }
  for (const scenario of ['confirm', 'success', 'telegram-error', 'database-error', 'missing', 'busy']) {
    const calls = []
    let refreshed = false
    let error = ''
    const query = {
      delete() { calls.push('delete'); return this },
      eq(key, value) { calls.push([key, value]); return this },
      select() { return Promise.resolve({ data: scenario === 'missing' ? [] : [{ id: 'rate' }], error: scenario === 'database-error' ? new Error('denied') : null }) },
    }
    const remove = pageFunction('EmployeeSalaryHistory', 'deleteHistoryEntry', {
      canDeleteHistory: true, saving: scenario === 'busy' ? 'pending' : '',
      employee: { rates: [{ id: 'rate' }] }, employeeId,
      HISTORY_TABLE_BY_TYPE: { rate: 'employee_salary_rates' },
      confirmActionKey: scenario === 'confirm' ? '' : 'rate-history-delete-rate',
      setConfirmActionKey(value) { calls.push(['confirm', value]) }, setSaving() {},
      setError(value) { error = value }, l: { deleteFailed: 'not deleted', telegramDeleteFailed: 'retraction failed' },
      retractTelegramSalaryEvent: async (type, id) => {
        calls.push(['retract', type, id])
        if (scenario === 'telegram-error') throw new Error('offline')
      },
      supabase: { from(table) { calls.push(table); return query } },
      loadHistory: async options => { assert.equal(options.showLoader, false); refreshed = true },
    })
    await remove(entry)
    assert.equal(refreshed, scenario === 'success')
    if (scenario === 'confirm') assert.deepEqual(calls, [['confirm', 'rate-history-delete-rate']])
    if (scenario === 'busy') assert.deepEqual(calls, [])
    if (scenario === 'success') {
      assert.deepEqual(calls.slice(0, 5), [['retract', 'rate', 'rate'], 'employee_salary_rates', 'delete', ['id', 'rate'], ['salary_profile_id', employeeId]])
    }
    if (scenario === 'telegram-error') assert.ok(!calls.includes('delete'))
    if (['telegram-error', 'database-error', 'missing'].includes(scenario)) assert.ok(error)
  }
})
