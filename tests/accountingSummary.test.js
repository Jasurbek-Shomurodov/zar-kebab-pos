import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  isMissingAccountingMonthlyCashflowRpc,
  loadAccountingAllTimeBalance,
  loadAccountingMonthlyCashflow,
  loadAccountingPaidOrderSummary,
  loadFinancialAnalysisBundle,
  loadMonthlyEstimateBundle,
  loadReportsAccountingBundle,
  isMissingAccountingMonthlyBreakdownRpc,
  loadAccountingMonthlyBreakdown,
} from '../src/lib/accountingSummary.js'

const migration = readFileSync(
  new URL('../migrations/109_accounting_paid_order_summary.sql', import.meta.url),
  'utf8'
)
const immutableSnapshotsMigration = readFileSync(
  new URL('../migrations/114_freeze_historical_order_prices_and_costs.sql', import.meta.url),
  'utf8'
)
const allTimeBalanceMigration = readFileSync(
  new URL('../migrations/177_accounting_all_time_balance.sql', import.meta.url),
  'utf8'
)

test('Accounting all-time balance loader returns one compact aggregate', async () => {
  const calls = []
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({ data: { balance: '4512450' }, error: null })
    },
  }

  assert.equal(await loadAccountingAllTimeBalance({ dbClient }), 4_512_450)
  assert.deepEqual(calls, [{ name: 'get_accounting_all_time_balance', args: undefined }])
})

test('Accounting all-time balance includes paid records and excludes salary liability', () => {
  assert.match(allTimeBalanceMigration, /current_staff_can_access\('expenses'\)/)
  assert.match(allTimeBalanceMigration, /public\.employee_salary_payments/)
  assert.match(allTimeBalanceMigration, /b\.accrues_to_salary is not true/)
  assert.match(allTimeBalanceMigration, /public\.employee_daily_meal_expenses/)
  assert.doesNotMatch(allTimeBalanceMigration, /employee_salary_rates|employee_salary_fines|getSalaryDue/)
  assert.match(allTimeBalanceMigration, /grant execute on function public\.get_accounting_all_time_balance\(\)/)
})

test('Accounting summary loader uses one RPC and returns no complete order rows', async () => {
  const calls = []
  const expected = {
    cafe_income: 1_500,
    loyalty_income: 200,
    cost_total: 400,
    payment_method_income: { cash: 800, card: 700 },
  }
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({ data: expected, error: null })
    },
    from() {
      throw new Error('Complete order fallback must not run when the RPC exists')
    },
  }

  const result = await loadAccountingPaidOrderSummary('2026-07-01', '2026-07-14', { dbClient })

  assert.deepEqual(result, expected)
  assert.deepEqual(calls, [{
    name: 'get_accounting_paid_order_summary',
    args: {
      p_date_from: '2026-07-01',
      p_date_to: '2026-07-14',
    },
  }])
})

test('Accounting summary migration aggregates protected financial fields with permission checks', () => {
  assert.match(migration, /create or replace function public\.get_accounting_paid_order_summary/)
  assert.match(migration, /current_staff_can_access\('expenses'\)/)
  assert.match(migration, /orders\.paid_at >= from_instant/)
  assert.match(migration, /orders\.paid_at < to_instant_exclusive/)
  assert.match(migration, /join paid_orders[\s\S]*sold_item\.order_id/)
  assert.match(migration, /sold_item\.cost_price::numeric/)
  assert.match(migration, /current_cost\.variant_costs/)
  assert.match(migration, /public\.order_payments/)
  assert.match(migration, /'payment_method_income'/)
  assert.match(migration, /grant execute on function public\.get_accounting_paid_order_summary\(date, date\)/)
})

test('Accounting freezes legacy costs and never joins current menu costs for historical profit', () => {
  assert.match(immutableSnapshotsMigration, /update public\.order_items as sold_item/)
  assert.match(immutableSnapshotsMigration, /where sold_item\.cost_price is null/)
  assert.match(immutableSnapshotsMigration, /disable trigger guard_paid_order_items/)
  assert.match(immutableSnapshotsMigration, /enable trigger guard_paid_order_items/)
  assert.match(immutableSnapshotsMigration, /exception[\s\S]*when others[\s\S]*enable trigger guard_paid_order_items/)
  assert.match(immutableSnapshotsMigration, /paid_order_items_guard_state[\s\S]*trigger\.tgenabled/)
  assert.match(immutableSnapshotsMigration, /paid_order_items_guard_state = 'R'[\s\S]*enable replica trigger/)
  assert.match(immutableSnapshotsMigration, /paid_order_items_guard_state = 'A'[\s\S]*enable always trigger/)
  assert.match(immutableSnapshotsMigration, /before insert on public\.order_items|snapshot_order_item_cost/)
  assert.match(immutableSnapshotsMigration, /alter column cost_price set not null/)
  assert.match(immutableSnapshotsMigration, /greatest\(0, sold_item\.cost_price::numeric\)/)
  assert.doesNotMatch(immutableSnapshotsMigration, /left join public\.menu_item_costs/)
  assert.match(immutableSnapshotsMigration, /coalesce\(orders\.total, 0\)/)
})

const monthlyCashflowMigration = readFileSync(
  new URL('../migrations/229_accounting_monthly_cashflow.sql', import.meta.url),
  'utf8'
)

test('monthly cash flow loader caps the month count and normalizes one aggregate', async () => {
  const calls = []
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({
        data: {
          months: [{ month_start: '2026-10-01', cafe_income: '120', order_count: 3, sales_cost: '40', investor_support: 0, other_income: 5, spent: '90', salaries: 50 }],
          totals: { investor_support: '1000', operating_cash: '-25', first_order_month: '2026-06-01', first_investment_month: null },
        },
        error: null,
      })
    },
  }
  const result = await loadAccountingMonthlyCashflow(99, { dbClient })
  assert.deepEqual(calls, [{ name: 'get_accounting_monthly_cashflow', args: { p_month_count: 36 } }])
  assert.deepEqual(result.months[0], { monthStart: '2026-10-01', cafeIncome: 120, orderCount: 3, salesCost: 40, investorSupport: 0, otherIncome: 5, spent: 90, salaries: 50 })
  assert.deepEqual(result.totals, { investorSupport: 1000, operatingCash: -25, firstOrderMonth: '2026-06', firstInvestmentMonth: null })
  assert.equal(isMissingAccountingMonthlyCashflowRpc({ code: 'PGRST202' }), true)
  assert.equal(isMissingAccountingMonthlyCashflowRpc({ code: '42501', message: 'Accounting access is required' }), false)
})

test('monthly cash flow aggregates in SQL with Accounting access and the balance rules', () => {
  assert.match(monthlyCashflowMigration, /current_staff_can_access\('expenses'\)/)
  assert.match(monthlyCashflowMigration, /coalesce\(o\.paid_at, o\.created_at\)/)
  assert.match(monthlyCashflowMigration, /'Asia\/Tashkent'/)
  assert.match(monthlyCashflowMigration, /b\.accrues_to_salary is not true/)
  assert.match(monthlyCashflowMigration, /public\.employee_daily_meal_expenses/)
  assert.match(monthlyCashflowMigration, /category = 'investor_support'/)
  assert.doesNotMatch(monthlyCashflowMigration, /employee_salary_rates|employee_salary_fines/)
  assert.match(monthlyCashflowMigration, /revoke all on function public\.get_accounting_monthly_cashflow\(integer\)\s+from public, anon, authenticated/)
  assert.match(monthlyCashflowMigration, /grant execute on function public\.get_accounting_monthly_cashflow\(integer\)\s+to authenticated/)
})

const financialAnalysisBundleMigration = readFileSync(
  new URL('../migrations/231_financial_analysis_bundle.sql', import.meta.url),
  'utf8'
)

test('Financial analysis loads in one round trip and falls back when the function is missing', async () => {
  const calls = []
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({
        data: {
          current: { paid_order_summary: { cafe_income: 900 }, expenses: [{ id: 1, amount: 10 }], employee_meals: [{ business_date: '2026-10-01' }] },
          previous: { paid_order_summary: { cafe_income: 700 }, expenses: [], employee_meals: [] },
          salary: { profiles: [{ id: 'p1' }], payments: [{ id: 'pay1' }], bonuses: [], team: [{ id: 'u1' }] },
          all_time_balance: '4512450.4',
          growth: { monthly_income: null, ten_day_income: [], cashflow: { months: [], totals: { investor_support: 5 } } },
        },
        error: null,
      })
    },
  }
  const bundle = await loadFinancialAnalysisBundle({ dateFrom: '2026-10-01', dateTo: '2026-10-12', previousFrom: '2026-09-19', previousTo: '2026-09-30', includeGrowth: false }, { dbClient })
  assert.deepEqual(calls, [{ name: 'get_financial_analysis', args: { p_date_from: '2026-10-01', p_date_to: '2026-10-12', p_previous_from: '2026-09-19', p_previous_to: '2026-09-30', p_include_growth: false } }])
  assert.deepEqual(bundle.current, { expenses: [{ id: 1, amount: 10 }], employeeMealSnapshots: [{ business_date: '2026-10-01' }], paidOrderSummary: { cafe_income: 900 }, error: null })
  assert.equal(bundle.previous.paidOrderSummary.cafe_income, 700)
  assert.equal(bundle.salary.payments.length, 1)
  assert.equal(bundle.allTimeBalance, 4_512_450)
  assert.equal(bundle.growth.monthlyIncome, null)
  assert.equal(bundle.growth.cashflow.totals.investorSupport, 5)

  const missing = { rpc: () => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_financial_analysis' } }) }
  assert.equal(await loadFinancialAnalysisBundle({ dateFrom: '2026-10-01', dateTo: '2026-10-12', previousFrom: '2026-09-19', previousTo: '2026-09-30' }, { dbClient: missing }), null)
  const denied = { rpc: () => Promise.resolve({ data: null, error: { code: '42501', message: 'Financial analysis access is required' } }) }
  await assert.rejects(loadFinancialAnalysisBundle({ dateFrom: '2026-10-01', dateTo: '2026-10-12', previousFrom: '2026-09-19', previousTo: '2026-09-30' }, { dbClient: denied }), error => error.code === '42501')
})

test('Financial analysis bundle reuses the existing totals and keeps payroll detail out', () => {
  const sql = financialAnalysisBundleMigration
  assert.match(sql, /current_staff_can_access\('expenses'\) and public\.current_staff_can_access\('financial_analysis'\)/)
  assert.match(sql, /public\.get_accounting_paid_order_summary\(p_date_from, p_date_to\)/)
  assert.match(sql, /public\.get_accounting_paid_order_summary\(p_previous_from, p_previous_to\)/)
  assert.match(sql, /public\.get_accounting_all_time_balance\(\)/)
  assert.match(sql, /public\.get_accounting_monthly_cashflow\(13\)/)
  assert.match(sql, /when public\.current_staff_can_access\('dashboard'\) then/)
  assert.match(sql, /p\.paid_date between v_salary_from and v_salary_to/)
  assert.match(sql, /b\.bonus_date between v_salary_from and v_salary_to/)
  assert.doesNotMatch(sql, /employee_salary_rates|employee_salary_fines|employee_salary_absences/)
  assert.match(sql, /revoke all on function public\.get_financial_analysis\(date, date, date, date, boolean\)\s+from public, anon, authenticated/)
  assert.match(sql, /grant execute on function public\.get_financial_analysis\(date, date, date, date, boolean\)\s+to authenticated/)
})

const monthlyEstimateBundleMigration = readFileSync(
  new URL('../migrations/233_monthly_estimate_bundle.sql', import.meta.url),
  'utf8'
)

test('Monthly estimate loads in one round trip and falls back when the function is missing', async () => {
  const calls = []
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({
        data: {
          current: { expenses: [{ id: 1 }], employee_meals: [], paid_order_summary: null },
          previous: { expenses: [], employee_meals: [{ business_date: '2026-09-01' }], paid_order_summary: { cafe_income: 700 } },
          salary: { profiles: [{ id: 'p1' }], rates: [{ id: 'r1' }], payments: [], bonuses: [], fines: [], absences: [{ id: 'a1' }], team: [] },
        },
        error: null,
      })
    },
  }
  const range = { monthStart: '2026-10-01', monthEnd: '2026-10-31', completedSalesTo: '2026-10-11', previousStart: '2026-09-01', previousEnd: '2026-09-30' }
  const bundle = await loadMonthlyEstimateBundle(range, { dbClient })
  assert.deepEqual(calls, [{ name: 'get_monthly_estimate', args: { p_month_start: '2026-10-01', p_month_end: '2026-10-31', p_completed_sales_to: '2026-10-11', p_previous_start: '2026-09-01', p_previous_end: '2026-09-30' } }])
  assert.deepEqual(bundle.current, { expenses: [{ id: 1 }], employeeMealSnapshots: [], paidOrderSummary: null })
  assert.equal(bundle.previous.paidOrderSummary.cafe_income, 700)
  assert.equal(bundle.salary.rates.length, 1)
  assert.equal(bundle.salary.absences.length, 1)

  const missing = { rpc: () => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_monthly_estimate' } }) }
  assert.equal(await loadMonthlyEstimateBundle(range, { dbClient: missing }), null)
  const denied = { rpc: () => Promise.resolve({ data: null, error: { code: '42501', message: 'Financial analysis access is required' } }) }
  await assert.rejects(loadMonthlyEstimateBundle(range, { dbClient: denied }), error => error.code === '42501')
})

test('Monthly estimate bundle keeps selected-month sales and the salary history the forecast needs', () => {
  const sql = monthlyEstimateBundleMigration
  assert.match(sql, /current_staff_can_access\('expenses'\) and public\.current_staff_can_access\('financial_analysis'\)/)
  assert.match(sql, /public\.get_accounting_paid_order_summary\(p_month_start, least\(p_completed_sales_to, p_month_end\)\)/)
  assert.match(sql, /public\.get_accounting_paid_order_summary\(p_previous_start, p_previous_end\)/)
  for (const table of ['employee_salary_profiles', 'employee_salary_rates', 'employee_salary_payments', 'employee_salary_bonuses', 'employee_salary_fines', 'employee_salary_absences']) {
    assert.match(sql, new RegExp(`from public\\.${table} r\\)`))
  }
  assert.doesNotMatch(sql, /ACCOUNTING_HISTORY_START_DATE|get_accounting_all_time_balance/)
  assert.match(sql, /grant execute on function public\.get_monthly_estimate\(date, date, date, date, date\)\s+to authenticated/)
})

const reportsAccountingMigration = readFileSync(
  new URL('../migrations/235_reports_accounting_bundle.sql', import.meta.url),
  'utf8'
)

test('Reports accounting loads in one round trip and falls back when the function is missing', async () => {
  const calls = []
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({
        data: { expenses: [{ id: 1 }], employee_meals: [{ business_date: '2026-10-12' }], salary: { profiles: [{ id: 'p1' }], payments: [{ id: 'pay1' }], bonuses: [], team: [] } },
        error: null,
      })
    },
  }
  const bundle = await loadReportsAccountingBundle({ dateFrom: '2026-10-12', dateTo: '2026-10-12' }, { dbClient })
  assert.deepEqual(calls, [{ name: 'get_reports_accounting', args: { p_date_from: '2026-10-12', p_date_to: '2026-10-12' } }])
  assert.deepEqual(bundle, {
    expenses: [{ id: 1 }],
    employeeMealSnapshots: [{ business_date: '2026-10-12' }],
    salary: { profiles: [{ id: 'p1' }], payments: [{ id: 'pay1' }], bonuses: [], team: [] },
  })
  const missing = { rpc: () => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_reports_accounting' } }) }
  assert.equal(await loadReportsAccountingBundle({ dateFrom: '2026-10-12', dateTo: '2026-10-12' }, { dbClient: missing }), null)
})

test('Reports accounting bundle returns only in-range salary cash rows behind Accounting access', () => {
  const sql = reportsAccountingMigration
  assert.match(sql, /if not public\.current_staff_can_access\('expenses'\) then/)
  assert.match(sql, /p\.paid_date between p_date_from and p_date_to/)
  assert.match(sql, /b\.bonus_date between p_date_from and p_date_to/)
  assert.match(sql, /e\.expense_date between p_date_from and p_date_to/)
  assert.match(sql, /m\.business_date between p_date_from and p_date_to/)
  assert.doesNotMatch(sql, /employee_salary_rates|employee_salary_absences|employee_salary_fines/)
  assert.match(sql, /grant execute on function public\.get_reports_accounting\(date, date\)\s+to authenticated/)
})

test('monthly breakdown loads income by source and spending by category in one RPC', async () => {
  const calls = []
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({
        data: {
          spending: [{ month_start: '2026-10-01', category: 'rent', amount: '900' }, { month_start: 'bad', category: 'x', amount: 1 }],
          income: [{ month_start: '2026-10-01', order_type: 'game_club', price_mode: 'regular', order_count: '3', amount: '120' }],
        },
        error: null,
      })
    },
  }
  const result = await loadAccountingMonthlyBreakdown(12, { dbClient })
  assert.deepEqual(calls, [{ name: 'get_accounting_monthly_breakdown', args: { p_month_count: 12 } }])
  assert.deepEqual(result.spending, [{ monthStart: '2026-10-01', category: 'rent', amount: 900 }])
  assert.deepEqual(result.income, [{ monthStart: '2026-10-01', orderType: 'game_club', priceMode: 'regular', orderCount: 3, amount: 120 }])
  assert.equal(isMissingAccountingMonthlyBreakdownRpc({ code: 'PGRST202' }), true)
})

test('monthly breakdown migration keeps Accounting access and the cash-flow rules', () => {
  const sql = readFileSync(new URL('../migrations/261_accounting_monthly_breakdown.sql', import.meta.url), 'utf8')
  assert.match(sql, /current_staff_can_access\('expenses'\)/)
  assert.match(sql, /coalesce\(o\.paid_at, o\.created_at\)/)
  assert.match(sql, /b\.accrues_to_salary is not true/)
  assert.match(sql, /o\.price_mode/)
  assert.match(sql, /revoke all on function public\.get_accounting_monthly_breakdown\(integer\)\s+from public, anon, authenticated/)
  assert.match(sql, /grant execute on function public\.get_accounting_monthly_breakdown\(integer\)\s+to authenticated/)
})
