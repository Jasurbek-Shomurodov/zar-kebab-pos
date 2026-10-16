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
  assert.deepEqual(form, { effective_from: today, rate_percentage: '3', sales_basis: 'employee_opened_orders', order_opener_profile_id: 'acc1', is_enabled: true })
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
  // Salary changes live only here now; Salaries no longer writes rates.
  assert.doesNotMatch(employees('Salaries'), /from\('employee_salary_rates'\)\s*\.insert/)
})

test('employee cards show Telegram link status and hide it when links cannot be read', () => {
  const source = employees('Employees')
  assert.match(source, /\.from\('employee_salary_telegram_links'\)\.select\('salary_profile_id, notifications_enabled'\)/)
  assert.match(source, /setTelegramLinks\(telegramLinkRes\.error \? null : new Map\(/)
  assert.match(source, /\{telegramLinks && \(\s*<Fact label=\{l\.telegram\}/)
  assert.equal(source.split('telegramNotLinked:').length - 1, 3)
})

test('the edit dialog links Telegram with the existing one-time link and waits for Start', () => {
  const source = employees('Employees')
  assert.match(source, /supabase\.rpc\('create_employee_salary_telegram_link', \{\s*target_salary_profile_id: employee\.id,/)
  assert.match(source, /`https:\/\/t\.me\/\$\{botUsername\}\?start=employee_\$\{token\}`/)
  assert.match(source, /import\('qrcode'\)/)
  assert.match(source, /\.eq\('salary_profile_id', pendingTelegramEmployeeId\)/)
  assert.equal(source.split('telegramWaiting:').length - 1, 3)
})

test('every employee change made outside Salaries still reaches the Investor (salary_events) group', () => {
  const page = employees('Employees')
  const dialog = fs.readFileSync(new URL('../src/components/NewEmployeeDialog.jsx', import.meta.url), 'utf8')
  const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const fnBody = (source, name) => source.slice(source.indexOf(`async function ${name}`), source.indexOf('\n  }\n', source.indexOf(`async function ${name}`)))

  // Hiring, (de)activation and absence undo use the lifecycle/undo endpoints as before.
  assert.match(dialog, /const notification = await notifyTelegramEmployeeLifecycle\(salaryProfileId, 'created'\)/)
  assert.match(page, /nextActive \? 'activated' : 'deactivated'/)
  assert.match(page, /notifyTelegramAbsenceUndo\(absence\.id\)/)
  // Rate and KPI edits send the same events Salaries used to send.
  assert.match(fnBody(page, 'saveEmployeeSalary'), /if \(!isInitialRate\) notifySalaryChangeInBackground\(notifyTelegramEmployeeRate, savedRate\?\.id/)
  assert.match(fnBody(page, 'saveEmployeeKpi'), /notifySalaryChangeInBackground\(notifyTelegramKpiRuleChange, savedRule\?\.last_change_event_id/)
  // A failed delivery is shown, never silently dropped.
  assert.match(fnBody(page, 'saveEmployeeSalary') + page, /\.catch\(\(\) => setError\(failureMessage\)\)/)

  // All of these resolve to the one salary_events target, labelled as the ZarKebab Investor group.
  assert.match(endpoint, /async function loadSalaryGroupTarget[\s\S]*?\.eq\('target_key', 'salary_events'\)/)
  const lifecycle = endpoint.slice(endpoint.indexOf('async function notifyEmployeeLifecycle'), endpoint.indexOf('async function notifyInvestorIncome'))
  assert.match(lifecycle, /await loadSalaryGroupTarget\(supabase\)/)
  assert.match(lifecycle, /ZarKebab Investor Telegram group is not configured/)
  assert.match(endpoint, /deliverSalaryGroupEvent\(supabase, 'kpi_rule', event, 0\)/)
})
