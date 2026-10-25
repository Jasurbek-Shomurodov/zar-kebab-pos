import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildOwnerProfitMonths,
  closeAccountingMonth,
  getMonthCloseAvailableDate,
  getMonthCloseErrorCode,
  getMonthSalaryEarned,
  normalizeOwnerProfitData,
  summarizeClosedOwnerProfit,
} from '../src/lib/ownerProfit.js'

function employee(overrides = {}) {
  return {
    id: 'salary-1',
    employee_name: 'Aziz',
    joined_at: '2026-01-01',
    rates: [{ effective_from: '2026-01-01', rate_unit: 'monthly', amount: 3_000_000 }],
    payments: [],
    bonuses: [],
    fines: [],
    absences: [],
    ...overrides,
  }
}

function components(monthStart, overrides = {}) {
  return {
    monthStart,
    cafeIncome: 0,
    otherIncome: 0,
    investorSupport: 0,
    recordedExpenses: 0,
    legacyPaidBonuses: 0,
    employeeMeals: 0,
    ...overrides,
  }
}

test('salary counts in the month it was earned, not when it was paid', () => {
  const profile = employee({
    payments: [{ paid_date: '2026-10-05', amount: 3_000_000 }],
    bonuses: [
      { bonus_date: '2026-09-12', amount: 200_000, accrues_to_salary: true },
      { bonus_date: '2026-10-01', amount: 999_000, accrues_to_salary: true },
      { bonus_date: '2026-09-15', amount: 50_000, accrues_to_salary: false },
    ],
    fines: [{ fine_date: '2026-09-20', amount: 100_000 }],
  })
  const september = getMonthSalaryEarned([profile], '2026-09-01')
  assert.equal(september.total, 3_000_000 + 200_000 - 100_000)
  assert.deepEqual(september.breakdown, [{
    salary_profile_id: 'salary-1', employee_name: 'Aziz', base: 3_000_000, bonuses: 200_000, fines: 100_000, earned: 3_100_000,
  }])
})

test('absent days, late joiners and leavers earn only the days they worked', () => {
  const absent = employee({ id: 'a', rates: [{ effective_from: '2026-01-01', rate_unit: 'daily', amount: 100_000 }], absences: [{ absence_date: '2026-09-03' }] })
  const joined = employee({ id: 'b', joined_at: '2026-09-21', rates: [{ effective_from: '2026-09-21', rate_unit: 'daily', amount: 100_000 }] })
  const left = employee({ id: 'c', ended_at: '2026-09-05', rates: [{ effective_from: '2026-01-01', rate_unit: 'daily', amount: 100_000 }] })
  const { breakdown } = getMonthSalaryEarned([absent, joined, left], '2026-09-01')
  assert.deepEqual(Object.fromEntries(breakdown.map(row => [row.salary_profile_id, row.earned])), { a: 2_900_000, b: 1_000_000, c: 500_000 })
})

test('a month can be closed once the three-day back-date window has passed', () => {
  assert.equal(getMonthCloseAvailableDate('2026-09-01'), '2026-10-04')
  assert.equal(getMonthCloseAvailableDate('2026-12-01'), '2027-01-04')
})

test('months start from zero and only the oldest finished open month is ready', () => {
  const profile = employee({ rates: [{ effective_from: '2026-01-01', rate_unit: 'daily', amount: 100_000 }] })
  const rows = buildOwnerProfitMonths({
    closes: [{
      ...components('2026-07-01', { cafeIncome: 10_000_000, recordedExpenses: 4_000_000, investorSupport: 1_000_000 }),
      salaryEarned: 3_100_000, salaryBreakdown: [], ownerProfit: 2_900_000, settledAmount: 3_900_000,
    }],
    openMonths: [
      components('2026-08-01', { cafeIncome: 2_000_000, recordedExpenses: 1_000_000, employeeMeals: 300_000, investorSupport: 5_000_000 }),
      components('2026-09-01', { cafeIncome: 9_000_000 }),
      components('2026-10-01', { cafeIncome: 1_000_000 }),
    ],
    salaryProfiles: [profile],
    today: '2026-10-25',
  })
  assert.deepEqual(rows.map(row => row.status), ['closed', 'ready', 'waiting', 'current'])
  const august = rows[1]
  assert.equal(august.salaryEarned, 3_100_000)
  assert.equal(august.ownerProfit, 2_000_000 - 1_000_000 - 300_000 - 3_100_000)
  assert.equal(august.settledAmount, august.ownerProfit + 5_000_000)
  assert.equal(rows[3].salaryEarned, 2_500_000, 'this month earns only through today')
})

test('a finished month waits for the back-date window before it is ready', () => {
  const rows = buildOwnerProfitMonths({ openMonths: [components('2026-09-01'), components('2026-10-01')], today: '2026-10-02' })
  assert.deepEqual(rows.map(row => [row.status, row.availableFrom]), [['waiting', '2026-10-04'], ['current', '2026-11-04']])
})

test('closed summary keeps loss months negative', () => {
  const summary = summarizeClosedOwnerProfit([
    { status: 'closed', monthStart: '2026-06-01', ownerProfit: -4_000_000 },
    { status: 'closed', monthStart: '2026-07-01', ownerProfit: 10_000_000 },
    { status: 'current', monthStart: '2026-08-01', ownerProfit: 99_000_000 },
  ])
  assert.equal(summary.count, 2)
  assert.equal(summary.total, 6_000_000)
  assert.equal(summary.average, 3_000_000)
  assert.equal(summary.best.monthStart, '2026-07-01')
  assert.equal(summary.worst.monthStart, '2026-06-01')
})

test('owner profit data normalizes closes and open months from the RPC', () => {
  const data = normalizeOwnerProfitData({
    today: '2026-10-25',
    closes: [{ month_start: '2026-08-01', cafe_income: '10', owner_profit: '-5', settled_amount: '0', salary_breakdown: null }],
    open_months: [{ month_start: '2026-09-01', cafe_income: 7 }, { month_start: 'bad' }],
  })
  assert.equal(data.closes[0].ownerProfit, -5)
  assert.deepEqual(data.closes[0].salaryBreakdown, [])
  assert.deepEqual(data.openMonths.map(row => row.monthStart), ['2026-09-01'])
})

test('close sends the stable request id and frozen salary to the RPC', async () => {
  const calls = []
  const dbClient = { rpc: async (name, args) => { calls.push([name, args]); return { data: { month_start: '2026-09-01', owner_profit: 5 }, error: null } } }
  const result = await closeAccountingMonth({ monthStart: '2026-09-01', salaryEarned: 10.4, salaryBreakdown: [{ earned: 10 }], requestId: 'req-1' }, { dbClient })
  assert.deepEqual(calls, [['close_accounting_month', { p_month_start: '2026-09-01', p_salary_earned: 10, p_salary_breakdown: [{ earned: 10 }], p_request_id: 'req-1' }]])
  assert.equal(result.ownerProfit, 5)
  assert.equal(getMonthCloseErrorCode({ message: 'earlier_month_open' }), 'earlier_month_open')
  assert.equal(getMonthCloseErrorCode({ message: 'timeout' }), 'unknown')
})

test('migration 257 keeps closes immutable, ordered, owner-only and out of the remainder', () => {
  const sql = readFileSync(new URL('../migrations/257_accounting_month_closes.sql', import.meta.url), 'utf8')
  assert.match(sql, /before update or delete on public\.accounting_month_closes/)
  assert.match(sql, /if not public\.is_owner\(\) then\s+raise exception 'owner_required'/)
  assert.match(sql, /'earlier_month_open'/)
  assert.match(sql, /where request_id = p_request_id;\s+if found then\s+return/)
  assert.match(sql, /::date \+ 3\) then\s+raise exception 'month_not_finished'/)
  assert.match(sql, /- employee_meals - owner_settled/)
  assert.doesNotMatch(sql, /insert into public\.expenses/)
})

test('a close that never answers times out as an unknown outcome', async () => {
  const dbClient = { rpc: () => new Promise(() => {}) }
  await assert.rejects(
    closeAccountingMonth({ monthStart: '2026-09-01', salaryEarned: 0, salaryBreakdown: [], requestId: 'req-2' }, { dbClient, timeoutMs: 10 }),
    error => error.code === 'POS_WRITE_TIMEOUT' && getMonthCloseErrorCode(error) === 'unknown',
  )
})

test('migration 257 locks the records a close was built from', () => {
  const sql = readFileSync(new URL('../migrations/257_accounting_month_closes.sql', import.meta.url), 'utf8')
  for (const [table, args] of [
    ['expenses', "'expense_date', 'amount', 'entry_type', 'category'"],
    ['employee_daily_meal_expenses', "'business_date', 'total_amount'"],
    ['employee_salary_bonuses', "'bonus_date', 'amount', 'accrues_to_salary', 'salary_profile_id'"],
    ['employee_salary_fines', "'fine_date', 'amount', 'salary_profile_id'"],
  ]) {
    assert.match(sql, new RegExp(`before insert or update or delete on public\\.${table}\\s+for each row execute function public\\.guard_closed_accounting_month\\(${args}\\)`), table)
  }
  // Updates that leave every money column alone (notes, actor clean-up) pass.
  assert.match(sql, /tg_op = 'UPDATE' and not exists \(\s+select 1 from unnest\(tg_argv\)/)
  // The daily cron must have finished the month, or it would write into it later.
  assert.match(sql, /raise exception 'kpi_days_pending'/)
  assert.match(sql, /raise exception 'meal_days_pending'/)
})

test('Owner profit has its own drawer row behind Financial analysis access', () => {
  const sidebar = readFileSync(new URL('../src/components/UnifiedSidebar.jsx', import.meta.url), 'utf8')
  assert.match(sidebar, /key: 'owner_profit',\s+accessKey: 'financial_analysis',[\s\S]{0,200}path: '\/admin\/financial-analysis\/owner-profit'/)
  // The more specific path is matched before Financial analysis, so only one row is highlighted.
  assert.ok(sidebar.indexOf("startsWith('/admin/financial-analysis/owner-profit')) return 'owner_profit'") < sidebar.indexOf("startsWith('/admin/financial-analysis')) return 'financial_analysis'"))
})
