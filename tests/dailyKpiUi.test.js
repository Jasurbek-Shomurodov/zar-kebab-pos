import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const salaries = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
const employees = fs.readFileSync(new URL('../src/pages/Employees.jsx', import.meta.url), 'utf8')
const employeeSettings = fs.readFileSync(new URL('../src/lib/employeeSettings.js', import.meta.url), 'utf8')
const employeeHistory = fs.readFileSync(new URL('../src/pages/EmployeeSalaryHistory.jsx', import.meta.url), 'utf8')

test('the employee dialog configures effective-dated KPI rules behind Accounting write access', () => {
  assert.match(employees, /const canManage = canEditFeature\(profile \|\| \{ role: state\.user\?\.role \}, 'expenses'\)/)
  assert.match(employees, /function openEmployeeEditor\(employee\) \{\s*if \(!canManage \|\| !employee\?\.id\) return/)
  assert.match(employees, /\.from\('employee_kpi_rules'\)\s*\.upsert\(payload, \{ onConflict: 'salary_profile_id,effective_from' \}\)/)
  assert.match(employeeSettings, /rate_bps: parseKpiPercentToBps\(form\.rate_percentage\)/)
  assert.match(employeeSettings, /is_enabled: Boolean\(form\.is_enabled\)/)
})

test('KPI rule additions and changes trigger retryable Salary-group delivery', () => {
  assert.match(employees, /\.select\('id, last_change_event_id'\)\s*\.single\(\)/)
  assert.match(employees, /configurationChanged\) \{\s*notifySalaryChangeInBackground\(notifyTelegramKpiRuleChange, savedRule\?\.last_change_event_id/)
  assert.match(salaries, /kpi_rule:\s*notifyTelegramKpiRuleChange/)
  assert.match(salaries, /\.from\('employee_kpi_rule_change_events'\)/)
  assert.match(salaries, /delivery\.event_type === 'kpi_rule'[\s\S]*?showEmployeeDelivery: delivery\.event_type !== 'kpi_rule'/)
})

test('KPI result history stays on employee history, not on Salaries or Employees', () => {
  for (const source of [salaries, employees]) {
    assert.doesNotMatch(source, /\.from\('employee_daily_kpi_results'\)/)
    assert.doesNotMatch(source, /generate_daily_kpi_bonuses/)
  }
  assert.doesNotMatch(salaries, /\.from\('employee_kpi_rules'\)\s*\.upsert/)
})

test('the KPI editor keeps intrinsic widths inside the dialog', () => {
  assert.match(salaries, /const FIELD = '[^']*min-w-0 max-w-full/)
  assert.match(employees, /const DIALOG_FIELD = 'ws-input !h-11 min-w-0 w-full/)
  assert.match(employees, /max-h-\[calc\(100dvh-2rem\)\] w-full max-w-xl flex-col overflow-hidden/)
})

test('automatic KPI bonuses are identified and show their immutable formula in employee history', () => {
  assert.match(employeeHistory, /employee_daily_kpi_results/)
  assert.match(employeeHistory, /entry\.automaticKpi/)
  assert.match(employeeHistory, /entry\.kpiResult\.baseAmountUzs/)
  assert.match(employeeHistory, /formatKpiRatePercent\(entry\.kpiResult\.rateBps, lang\)/)
  assert.match(employeeHistory, /entry\.kpiResult\.bonusAmountUzs/)
  assert.match(employeeHistory, /label=\{l\.kpiBonusTotal\}[\s\S]*monthSummary\.kpiBonusAmount/)
})

test('manual and KPI bonuses are presented as salary accruals instead of immediate payments', () => {
  assert.match(salaries, /employee_salary_bonuses[\s\S]*?accrues_to_salary: true/)
  assert.match(salaries, /transactionForm\.entry_type === 'payment' && \([\s\S]*?<Field label=\{l\.method\}>/)
  assert.doesNotMatch(salaries, /kpiPaidImmediately/)
  assert.match(employeeHistory, /entry\.entryType === 'bonus' && entry\.accruesToSalary && \([\s\S]*?labels\.accruedToSalary/)
  assert.match(employeeHistory, /setEmployee\(\{[\s\S]*?bonuses: bonusRes\.data \|\| \[\][\s\S]*?\}\)/)
})

test('employee cards show the current effective KPI percentage and enabled state', () => {
  assert.match(employees, /\.from\('employee_salary_bonuses'\)\.select\('\*'\)/)
  assert.match(employees, /bonuses: bonuses\.filter\(bonus => bonus\.salary_profile_id === row\.id\)/)
  assert.match(employees, /\.from\('employee_kpi_rules'\)[\s\S]*?\.lte\('effective_from', today\)/)
  assert.match(employees, /getEffectiveKpiRule\(kpiRules, employee\.id, today\)/)
  assert.match(employees, /<EmployeeKpiRow[\s\S]*?rule=\{effectiveKpiRule\}/)

  const cardRow = employees.slice(
    employees.indexOf('function EmployeeKpiRow'),
    employees.indexOf('function DateInput')
  )
  assert.match(cardRow, /rule\.is_enabled !== false/)
  assert.match(cardRow, /formatKpiRatePercent\(rule\.rate_bps, lang\)/)
  assert.match(cardRow, /enabledLabel/)
  assert.match(cardRow, /disabledLabel/)
  assert.match(cardRow, /notConfiguredLabel/)
})

test('KPI configuration saves the basis and requires an account only for own orders', () => {
  assert.match(employees, /value="employee_opened_orders"/)
  assert.match(employees, /value="restaurant"/)
  assert.match(employeeSettings, /sales_basis: form\.sales_basis/)
  assert.match(employeeSettings, /order_opener_profile_id: kpiOpenerId\(form\)/)
  assert.match(employeeSettings, /form\.sales_basis === 'employee_opened_orders' \? form\.order_opener_profile_id \|\| null : null/)
  assert.match(employeeSettings, /form\.is_enabled && form\.sales_basis === 'employee_opened_orders'[\s\S]*?!kpiAccounts\.some\(account => account\.id === form\.order_opener_profile_id\)/)
  assert.match(employeeSettings, /existing\.sales_basis !== payload\.sales_basis/)
  assert.match(employeeSettings, /\(existing\.order_opener_profile_id \|\| null\) !== payload\.order_opener_profile_id/)
  assert.match(employees, /formatKpiSalesBasis\(rule.sales_basis, lang\)/)
})

test('the KPI account picker shows only for own-order KPI and keeps an unavailable saved account visible', () => {
  const dialog = employees.slice(employees.indexOf('function EmployeeEditDialog('))
  assert.match(dialog, /\{ownOrders && \(\s*<DialogField label=\{l\.kpiAccount\}>/)
  assert.match(dialog, /!kpiAccounts\.some\(account => account\.id === kpiForm\.order_opener_profile_id\)[\s\S]*?l\.kpiAccountUnavailable/)
})

test('saving own-order KPI is blocked when the account already credits another employee', () => {
  assert.match(employeeSettings, /getKpiAccountConflicts\(kpiAccountLinks, form\.order_opener_profile_id, salaryProfileId\)/)
  assert.match(employees, /kpiAccountLinks: getKpiAccountLinks\(kpiRules, activeEmployees, today\)/)
  assert.match(employees, /formError\.code === 'account_taken'\s*\? `\$\{l\.kpiAccountTaken\}/)
  assert.equal((employees.match(/kpiAccountTaken:/g) || []).length, 3)
})
