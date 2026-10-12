import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const salaries = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
const employees = fs.readFileSync(new URL('../src/pages/Employees.jsx', import.meta.url), 'utf8')
const employeeHistory = fs.readFileSync(new URL('../src/pages/EmployeeSalaryHistory.jsx', import.meta.url), 'utf8')

test('Salaries configures effective-dated KPI rules behind Accounting write access', () => {
  assert.match(salaries, /canEditFeature\(profile \|\| \{ role \}, 'expenses'\)/)
  assert.match(salaries, /\.from\('employee_kpi_rules'\)[\s\S]*\.upsert\([\s\S]*onConflict: 'salary_profile_id,effective_from'/)
  assert.match(salaries, /rate_bps: rateBps/)
  assert.match(salaries, /is_enabled: Boolean\(kpiForm\.is_enabled\)/)
  assert.match(salaries, /disabled=\{!canManage[\s\S]*labels\.kpiSave/)
})

test('KPI rule additions and changes trigger retryable Salary-group delivery', () => {
  assert.match(salaries, /\.select\('id, last_change_event_id'\)\s*\.single\(\)/)
  assert.match(salaries, /configurationChanged[\s\S]*?runTelegramNotificationInBackground\('kpi_rule', savedRule\?\.last_change_event_id/)
  assert.match(salaries, /removalResult\.action === 'disabled'[\s\S]*?runTelegramNotificationInBackground\('kpi_rule', removalResult\.rule\?\.last_change_event_id/)
  assert.match(salaries, /kpi_rule:\s*notifyTelegramKpiRuleChange/)
  assert.match(salaries, /\.from\('employee_kpi_rule_change_events'\)/)
  assert.match(salaries, /delivery\.event_type === 'kpi_rule'[\s\S]*?showEmployeeDelivery: delivery\.event_type !== 'kpi_rule'/)
})

test('only owners can remove active KPI rules and zero-row deletes are rejected', () => {
  assert.match(salaries, /const canRemoveKpiRules = role === 'owner'/)
  assert.match(salaries, /canRemoveRules=\{canRemoveKpiRules\}/)
  assert.match(salaries, /const canRemoveSelectedRule = canRemoveRules[\s\S]*?selectedRule\.is_enabled !== false/)
  assert.match(salaries, /canRemoveSelectedRule && \([\s\S]*?touch-manipulation[\s\S]*?<Trash2/)
  assert.match(salaries, /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?labels\.kpiRemoveWarning/)
  assert.match(salaries, /setKpiRuleToRemove\(\{ salaryProfile, rule, effectiveFrom: removalDate \}\)/)
  assert.match(salaries, /removeKpiRulePreservingHistory\(\{[\s\S]*?effectiveFrom,[\s\S]*?createdBy:/)
  assert.match(salaries, /labels\.kpiRemoveFrom[\s\S]*?ruleToRemove\.effectiveFrom/)
  assert.doesNotMatch(salaries, /removeKpiRulePreservingHistory\(\{[\s\S]*?effectiveFrom: today/)
  assert.match(salaries, /removalResult\.action === 'not_deleted'/)
  assert.match(salaries, /removalResult\.action === 'disabled' \? l\.kpiStopped : l\.kpiRemoved/)
  assert.doesNotMatch(salaries, /window\.confirm\(/)
})

test('Salaries keeps only KPI configuration while result history stays on employee history', () => {
  assert.match(salaries, /selectedRule=\{selectedKpiRule\}/)
  assert.doesNotMatch(salaries, /\.from\('employee_daily_kpi_results'\)/)
  assert.doesNotMatch(salaries, /labels\.kpiHistory/)
  assert.doesNotMatch(salaries, /labels\.kpiCurrent/)
  assert.doesNotMatch(salaries, /generate_daily_kpi_bonuses/)
})

test('salary setup forms share one tabbed card', () => {
  const settingsSection = salaries.slice(
    salaries.indexOf('aria-labelledby="salary-settings-heading"'),
    salaries.indexOf('function DailyKpiSection')
  )

  assert.match(settingsSection, /salarySetupMode === 'kpi' \? Percent : salarySetupMode === 'change' \? Save : Plus/)
  assert.match(settingsSection, /\{ key: 'add',[\s\S]*\{ key: 'change',[\s\S]*\{ key: 'kpi'/)
  assert.match(settingsSection, /salarySetupMode === 'add'[\s\S]*salarySetupMode === 'kpi'[\s\S]*<DailyKpiSection[\s\S]*salarySetupMode === 'change'/)
  assert.doesNotMatch(salaries, /<section className="mb-7" aria-labelledby="daily-kpi-heading">/)
})

test('salary setup keeps KPI content inside the mobile viewport', () => {
  const settingsSection = salaries.slice(
    salaries.indexOf('aria-labelledby="salary-settings-heading"'),
    salaries.indexOf('function DailyKpiSection')
  )

  assert.match(settingsSection, /grid w-full min-w-0 grid-cols-1 items-stretch gap-4/)
  assert.match(settingsSection, /ws-panel h-full w-full min-w-0 max-w-full/)
  assert.match(salaries, /embedded \? 'min-w-0 max-w-full'/)
  assert.match(salaries, /grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] gap-4 sm:grid-cols-2/)
  assert.match(salaries, /absolute left-0 top-1 h-4 w-4/)
})

test('salary KPI setup contains intrinsic widths on mobile', () => {
  const kpiSection = salaries.slice(
    salaries.indexOf('function DailyKpiSection'),
    salaries.indexOf('function SectionHeading')
  )

  assert.match(salaries, /const FIELD = '[^']*min-w-0 max-w-full/)
  assert.match(kpiSection, /grid min-w-0 grid-cols-\[minmax\(0,1fr\)\]/)
  assert.match(kpiSection, /min-w-0 break-words text-xs leading-relaxed/)
  assert.match(kpiSection, /mt-1 break-words text-sm font-semibold/)
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
  assert.match(salaries, /labels\.kpiAccruesToSalary/)
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
  assert.match(salaries, /value="employee_opened_orders"/)
  assert.match(salaries, /value="restaurant"/)
  assert.match(salaries, /sales_basis: kpiForm.sales_basis/)
  assert.match(salaries, /order_opener_profile_id: openerId/)
  assert.match(salaries, /form.is_enabled && form.sales_basis === 'employee_opened_orders' && !kpiAccounts.some/)
  assert.match(salaries, /existingRule.sales_basis !== kpiForm.sales_basis/)
  assert.match(salaries, /existingRule.order_opener_profile_id \|\| null/)
  assert.match(employees, /formatKpiSalesBasis\(rule.sales_basis, lang\)/)
})

test('KPI account remains visible but disabled for restaurant sales without a narrow card override', () => {
  const section = salaries.slice(salaries.indexOf('function DailyKpiSection('))
  assert.doesNotMatch(salaries, /maxWidth: salarySetupMode/)
  assert.doesNotMatch(section, /\{form.sales_basis === 'employee_opened_orders' && \(/)
  assert.match(section, /disabled=\{!selectedKpiProfile[^}]*form.sales_basis === 'restaurant'/)
  assert.match(section, /selectedKpiProfile && form.is_enabled && form.sales_basis === 'employee_opened_orders'/)
  assert.match(section, /form.sales_basis === 'restaurant' \? labels.kpiAccountNotNeeded : labels.kpiAccountHelp/)
})

test('saving own-order KPI is blocked when the account already credits another employee', () => {
  assert.match(salaries, /getKpiAccountConflicts\(kpiAccountLinks, kpiForm\.order_opener_profile_id, salaryProfile\.id\)/)
  assert.match(salaries, /setKpiRulesError\(`\$\{l\.kpiAccountTaken\}/)
  assert.equal((salaries.match(/kpiAccountTaken:/g) || []).length, 3)
})
