import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { getOrderItemCategoryId } from '../src/lib/analytics.js'

const migration = fs.readFileSync(
  new URL('../migrations/147_financial_report_history_snapshots.sql', import.meta.url),
  'utf8'
)
const reports = fs.readFileSync(new URL('../src/pages/Reports.jsx', import.meta.url), 'utf8')
const accounting = fs.readFileSync(new URL('../src/pages/Expenses.jsx', import.meta.url), 'utf8')
const accountingHistory = fs.readFileSync(new URL('../src/pages/AccountingHistory.jsx', import.meta.url), 'utf8')
const monthlyEstimate = fs.readFileSync(new URL('../src/pages/MonthlyEstimate.jsx', import.meta.url), 'utf8')
const salaries = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')

test('employee meals are immutable completed-day financial snapshots', () => {
  assert.match(migration, /create table if not exists public\.employee_daily_meal_expenses/i)
  assert.match(migration, /business_date\s+date primary key/i)
  assert.match(migration, /average_daily_amount\s+integer not null/i)
  assert.match(migration, /present_employee_count\s+integer not null/i)
  assert.match(migration, /total_amount\s+bigint not null/i)
  assert.match(migration, /total_amount = average_daily_amount::bigint \* present_employee_count::bigint/i)
  assert.match(migration, /before update or delete on public\.employee_daily_meal_expenses/i)
  assert.match(migration, /Finalized employee meal expenses are immutable/i)
  assert.match(migration, /p_business_date > v_completed_date/i)
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('daily-employee-meal:'/i)
  assert.match(migration, /on conflict \(business_date\) do nothing/i)
  assert.match(migration, /'legacy_backfill'/i)
  assert.match(migration, /grant execute on function public\.generate_employee_daily_meal_expense\(date\)[\s\S]*?to service_role/i)
  assert.match(migration, /create or replace function public\.get_pending_employee_meal_dates/i)
  assert.match(migration, /left join public\.employee_daily_meal_expenses[\s\S]*?meal\.business_date is null/i)
})

test('every financial screen reads finalized meals rather than recalculating history from settings', () => {
  for (const source of [reports, accounting, accountingHistory, monthlyEstimate]) {
    assert.match(source, /employee_daily_meal_expenses/)
    assert.match(source, /buildFinalizedEmployeeMealExpenseRows/)
  }
  assert.doesNotMatch(reports, /buildEmployeeMealExpenseRows\(/)
  assert.doesNotMatch(accounting, /buildEmployeeMealExpenseRows\(/)
  assert.doesNotMatch(accountingHistory, /buildEmployeeMealExpenseRows\(/)
  assert.match(monthlyEstimate, /allActualExpenseRows = \[\.\.\.salaryPaymentRows, \.\.\.salaryBonusRows, \.\.\.finalizedEmployeeMealRows, \.\.\.manualExpenseRows\]/)
  assert.match(monthlyEstimate, /mealForecastStart = today < monthStart[\s\S]*?: today/)
})

test('sold-item category snapshots override mutable catalog categories including uncategorized', () => {
  assert.match(migration, /add column if not exists category_id_snapshot text/i)
  assert.match(migration, /add column if not exists category_snapshot_captured boolean not null default false/i)
  assert.match(migration, /category_snapshot_captured = true/i)
  assert.match(migration, /disable trigger guard_paid_order_items/i)
  assert.match(migration, /exception[\s\S]*enable trigger guard_paid_order_items/i)
  assert.match(migration, /enable replica trigger guard_paid_order_items/i)
  assert.match(migration, /enable always trigger guard_paid_order_items/i)
  assert.match(migration, /before insert on public\.order_items[\s\S]*?snapshot_order_item_category/i)
  assert.match(migration, /Order item category snapshots are immutable/i)
  assert.equal(
    getOrderItemCategoryId({ category_id_snapshot: 'historical' }, { category_id: 'current' }),
    'historical'
  )
  assert.equal(
    getOrderItemCategoryId({ category_id_snapshot: null }, { category_id: 'current' }),
    null
  )
  assert.equal(
    getOrderItemCategoryId({ menu_item_id: 'legacy' }, { category_id: 'current' }),
    'current'
  )
})

test('KPI rules cannot enter finalized dates and old missing runs remain recoverable', () => {
  assert.match(migration, /create or replace function public\.protect_kpi_rule_finalized_period/i)
  assert.match(migration, /run\.business_date >= new\.effective_from/i)
  assert.match(migration, /before insert or update on public\.employee_kpi_rules/i)
  assert.match(migration, /create or replace function public\.get_pending_daily_kpi_dates/i)
  assert.match(migration, /left join public\.employee_daily_kpi_runs/i)
  assert.match(migration, /run\.business_date is null/i)
  // The employee dialog never offers or saves a KPI date before today.
  const employeeSettings = fs.readFileSync(new URL('../src/lib/employeeSettings.js', import.meta.url), 'utf8')
  const employeesPage = fs.readFileSync(new URL('../src/pages/Employees.jsx', import.meta.url), 'utf8')
  assert.match(employeeSettings, /form\.effective_from < today\) return \{ code: 'date' \}/)
  assert.match(employeesPage, /<DateInput value=\{kpiForm\.effective_from\} lang=\{lang\} min=\{today\}/)
})

test('Reports fails closed on incomplete expense data and buckets hours in Tashkent', () => {
  assert.match(reports, /setExpensesError\(current => current \|\| salaryError\?\.message/)
  assert.match(reports, /canViewExpenses && expensesError/)
  assert.match(reports, /value=\{expensesError \? '—' : formatCurrency\(expenseSummary\.total\)\}/)
  assert.match(reports, /const h = getRestaurantHour\(d\)/)
  assert.doesNotMatch(reports, /new Date\(d\)\.getHours\(\)/)
})
