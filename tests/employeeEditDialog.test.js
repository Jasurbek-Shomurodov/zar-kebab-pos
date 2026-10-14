import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildEmployeeKpiForm,
  buildEmployeeKpiRulePayload,
  buildEmployeeSalaryForm,
  getEmployeeKpiFormError,
  isEmployeeKpiChanged,
  isEmployeeSalaryChanged,
  isKpiRulePayloadChanged,
} from '../src/lib/employeeSettings.js'
import { getKpiAccountLinks } from '../src/lib/dailyKpi.js'

const today = '2026-10-14'
const employee = {
  id: 'e1',
  profile_id: 'acc1',
  rates: [{ id: 'r1', effective_from: '2026-09-01', amount: 1500000, rate_unit: 'monthly', created_at: '2026-09-01' }],
}
const rule = { id: 'k1', salary_profile_id: 'e1', effective_from: '2026-09-16', rate_bps: 300, is_enabled: true, sales_basis: 'employee_opened_orders', order_opener_profile_id: 'acc1', start_time: '13:00:00' }
const employees = page => fs.readFileSync(new URL(`../src/pages/${page}.jsx`, import.meta.url), 'utf8')

test('salary form starts from the current rate and only writes real changes once', () => {
  const form = buildEmployeeSalaryForm(employee, today)
  assert.deepEqual(form, { effective_from: today, salary_amount: '1500000', salary_unit: 'monthly' })
  assert.equal(isEmployeeSalaryChanged(employee, form, today), false)
  assert.equal(isEmployeeSalaryChanged(employee, { ...form, salary_unit: 'daily' }, today), true)
  const next = { ...form, salary_amount: '1800000' }
  assert.equal(isEmployeeSalaryChanged(employee, next, today), true)
  // A retry after an unknown outcome must not insert the same rate twice.
  const saved = { ...employee, rates: [...employee.rates, { effective_from: today, amount: 1800000, rate_unit: 'monthly' }] }
  assert.equal(isEmployeeSalaryChanged(saved, next, '2026-10-13'), false)
})

test('KPI form mirrors the effective rule and validates accounts', () => {
  const form = buildEmployeeKpiForm([rule], employee, today)
  assert.deepEqual(form, { effective_from: today, rate_percentage: '3', sales_basis: 'employee_opened_orders', order_opener_profile_id: 'acc1', start_time: '13:00', is_enabled: true })
  assert.equal(isEmployeeKpiChanged([rule], employee, form, today), false)
  assert.equal(isEmployeeKpiChanged([rule], employee, { ...form, rate_percentage: '4' }, today), true)
  assert.equal(isEmployeeKpiChanged([], employee, buildEmployeeKpiForm([], employee, today), today), false)

  const accounts = [{ id: 'acc1' }, { id: 'acc2' }]
  const links = getKpiAccountLinks([rule, { ...rule, id: 'k2', salary_profile_id: 'e2', order_opener_profile_id: 'acc2' }], [employee, { id: 'e2', employee_name: 'Asil' }], today)
  assert.equal(getEmployeeKpiFormError({ form, salaryProfileId: 'e1', today, kpiAccounts: accounts, kpiAccountLinks: links }), null)
  assert.equal(getEmployeeKpiFormError({ form: { ...form, order_opener_profile_id: 'acc2' }, salaryProfileId: 'e1', today, kpiAccounts: accounts, kpiAccountLinks: links }).code, 'account_taken')
  assert.equal(getEmployeeKpiFormError({ form: { ...form, order_opener_profile_id: '' }, salaryProfileId: 'e1', today, kpiAccounts: accounts, kpiAccountLinks: links }).code, 'account_required')
  assert.equal(getEmployeeKpiFormError({ form: { ...form, effective_from: '2026-10-13' }, salaryProfileId: 'e1', today, kpiAccounts: accounts, kpiAccountLinks: links }).code, 'date')
  assert.equal(getEmployeeKpiFormError({ form: { ...form, rate_percentage: '0' }, salaryProfileId: 'e1', today, kpiAccounts: accounts, kpiAccountLinks: links }).code, 'rate')

  const payload = buildEmployeeKpiRulePayload({ form: { ...form, sales_basis: 'restaurant' }, salaryProfileId: 'e1' })
  assert.equal(payload.order_opener_profile_id, null)
  assert.equal(payload.rate_bps, 300)
  assert.equal(isKpiRulePayloadChanged([rule], payload), true)
  assert.equal(isKpiRulePayloadChanged([{ ...rule, effective_from: today, sales_basis: 'restaurant', order_opener_profile_id: null }], payload), false)
})

test('tapping an employee card opens the edit dialog with audited, notifying writes', () => {
  const source = employees('Employees')
  assert.match(source, /openEmployeeEditor\(employee\)/)
  assert.match(source, /event\.target\.closest\('button, a, input, select, textarea, label'\)/)
  assert.match(source, /<EmployeeEditDialog/)
  assert.match(source, /\.insert\(buildSalaryRatePayload\(/)
  assert.match(source, /\.upsert\(payload, \{ onConflict: 'salary_profile_id,effective_from' \}\)/)
  assert.match(source, /notifySalaryChangeInBackground\(notifyTelegramEmployeeRate/)
  assert.match(source, /configurationChanged\) \{\s*notifySalaryChangeInBackground\(notifyTelegramKpiRuleChange/)
  assert.doesNotMatch(source, /window\.confirm\(|alert\(/)
  assert.match(employees('Salaries'), /import \{ buildSalaryRatePayload \} from '\.\.\/lib\/employeeSettings'/)
})
