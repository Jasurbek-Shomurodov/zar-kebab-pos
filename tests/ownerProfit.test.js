import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildOwnerProfitMonths,
  buildOwnerProfitSankey,
  closeAccountingMonth,
  getMonthCloseAvailableDate,
  getMonthCloseErrorCode,
  getMonthSalaryEarned,
  normalizeOwnerProfitData,
  reopenAccountingMonth,
  summarizeClosedOwnerProfit,
  buildOwnerProfitOverview,
} from '../src/lib/ownerProfit.js'
import { buildInvestorQueueMessage } from '../api/telegram/_lib/ingredientNotifications.js'

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

test('a month Sankey splits costs by category and leaves owner profit', () => {
  const row = { cafeIncome: 10_000_000, otherIncome: 0, recordedExpenses: 3_000_000, employeeMeals: 500_000, salaryEarned: 4_000_000, legacyPaidBonuses: 0 }
  const { sankey } = buildOwnerProfitSankey(row, { products_bazaar: 2_000_000, rent: 1_000_000 })
  assert.deepEqual(sankey.sources.map(node => node.key), ['cafe'])
  assert.deepEqual(sankey.targets.map(node => [node.key, node.amount]), [
    ['salary_earned', 4_000_000], ['products_bazaar', 2_000_000], ['rent', 1_000_000], ['employee_meals', 500_000], ['__left__', 2_500_000],
  ])
})

test('a loss month adds an owner-covered source; mismatched categories fall back to one Expenses node', () => {
  const row = { cafeIncome: 1_000_000, otherIncome: 0, recordedExpenses: 2_000_000, employeeMeals: 0, salaryEarned: 0, legacyPaidBonuses: 0 }
  const { sankey } = buildOwnerProfitSankey(row, { rent: 1_500_000 })
  assert.deepEqual(sankey.targets.map(node => node.key), ['recorded_expenses'])
  assert.deepEqual(sankey.sources.map(node => [node.key, node.amount]), [['cafe', 1_000_000], ['reserves', 1_000_000]])
})

test('expense categories from migration 258 are grouped by month', () => {
  const data = normalizeOwnerProfitData({ expense_categories: [
    { month_start: '2026-09-01', category: 'rent', amount: '5' },
    { month_start: '2026-09-01', category: 'rent', amount: 2 },
    { month_start: 'bad', category: 'rent', amount: 9 },
  ] })
  assert.deepEqual(data.expenseCategories, { '2026-09-01': { rent: 7 } })
  assert.equal(normalizeOwnerProfitData({}).expenseCategories, null)
})

test('reopen sends the reason and a stable request id', async () => {
  const calls = []
  const dbClient = { rpc: async (name, args) => { calls.push([name, args]); return { data: { reopened: true }, error: null } } }
  await reopenAccountingMonth({ monthStart: '2026-06-01', reason: '  Late invoice  ', requestId: 'req-9' }, { dbClient })
  assert.deepEqual(calls, [['reopen_accounting_month', { p_month_start: '2026-06-01', p_reason: 'Late invoice', p_request_id: 'req-9' }]])
  assert.equal(getMonthCloseErrorCode({ message: 'later_month_closed' }), 'later_month_closed')
})

test('migration 259 queues Investor alerts and lets only the owner reopen the latest close', () => {
  const sql = readFileSync(new URL('../migrations/259_owner_profit_close_notifications_and_reopen.sql', import.meta.url), 'utf8')
  assert.match(sql, /after insert on public\.accounting_month_closes\s+for each row execute function public\.queue_accounting_month_closed_notification\(\)/)
  assert.match(sql, /'month_closed', 'month_reopened'/)
  assert.match(sql, /if not public\.is_owner\(\) then\s+raise exception 'owner_required'/)
  assert.match(sql, /raise exception 'later_month_closed'/)
  assert.match(sql, /raise exception 'reopen_reason_required'/)
  // The delete is allowed only for the month reopen marks, and is audited.
  assert.match(sql, /current_setting\('zar_kebab\.reopen_month', true\) = old\.month_start::text/)
  assert.match(sql, /after insert or delete on public\.accounting_month_closes\s+for each row execute function public\.capture_accounting_record_audit\(\)/)
})

test('Investor month messages come only from the frozen snapshot', () => {
  const closed = buildInvestorQueueMessage({
    event_type: 'month_closed', month_start: '2026-09-01', cafe_income: 243983014, other_income: 0,
    recorded_expenses: 140228816, legacy_paid_bonuses: 0, employee_meals: 9075000, salary_earned: 87434129,
    investor_support: 2400000, owner_profit: 7245069, settled_amount: 9645069, actor_name: '<Owner>', changed_at: '2026-10-25T10:00:00Z',
  })
  assert.match(closed, /Месяц закрыт: Сентябрь 2026/)
  assert.match(closed, /Прибыль владельца: <b>\+7\s245\s069 UZS<\/b>/)
  assert.match(closed, /&lt;Owner&gt;/)
  assert.doesNotMatch(closed, /Другой доход|Сразу выплаченные/)
  const reopened = buildInvestorQueueMessage({
    event_type: 'month_reopened', month_start: '2026-09-01', reason: 'Late <invoice>',
    previous_close: { owner_profit: -5 }, actor_name: 'Owner', changed_at: '2026-10-25T10:00:00Z',
  })
  assert.match(reopened, /Месяц снова открыт: Сентябрь 2026/)
  assert.match(reopened, /Причина: Late &lt;invoice&gt;/)
  assert.match(reopened, /−5 UZS/)
  assert.match(buildInvestorQueueMessage({ event_type: 'created', actor_name: 'A', changed_at: '2026-10-25T10:00:00Z', after: { name: 'Flour', category: 'groceries', unit: 'kg', normal_unit_price: 1, is_active: true } }), /Добавлен ингредиент/)
})

test('Owner profit opens on the overview; closing and reopening live on the Take profit tab', () => {
  const page = readFileSync(new URL('../src/pages/OwnerProfit.jsx', import.meta.url), 'utf8')
  assert.match(page, /items: \[\{ key: 'overview', label: l\.tabOverview \}, \{ key: TAKE_PROFIT_TAB, label: l\.tabTake \}\]/)
  assert.match(page, /searchParams\.get\('tab'\) === TAKE_PROFIT_TAB \? TAKE_PROFIT_TAB : 'overview'/)
  assert.match(page, /\{taking && row\.status === 'ready' && isOwner/)
  assert.match(page, /\{taking && row === latestClosed && isOwner/)
  assert.match(page, /\{taking && isConfirming && \(/)
  assert.match(page, /\{taking && isReopening && \(/)
})

test('Financial analysis owner profit counts closed months only and lists unclosed finished months', () => {
  const close = (monthStart, cafeIncome, costs) => ({ monthStart, cafeIncome, otherIncome: 0, investorSupport: 0, recordedExpenses: costs, legacyPaidBonuses: 0, employeeMeals: 0, salaryEarned: 0, ownerProfit: cafeIncome - costs })
  const overview = buildOwnerProfitOverview({
    closes: [close('2026-07-01', 100, 150), close('2026-08-01', 300, 200)],
    openMonths: [{ monthStart: '2026-09-01' }, { monthStart: '2026-10-01' }],
  }, '2026-10-25')
  assert.deepEqual([overview.count, overview.total, overview.average, overview.profitableCount, overview.marginPct], [2, 50, 25, 1, 12.5])
  assert.deepEqual(overview.months.map(row => [row.key, row.ownerProfit]), [['2026-07', -50], ['2026-08', 100]])
  assert.deepEqual(overview.pending, ['2026-09-01'])
  assert.equal(buildOwnerProfitOverview({ closes: [], openMonths: [{ monthStart: '2026-10-01' }] }, '2026-10-25'), null)
})
