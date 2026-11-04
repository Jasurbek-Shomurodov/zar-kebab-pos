import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BANK_FEE_CATEGORY,
  buildPaymentFeeEntries,
  normalizePaymentFees,
  parsePaymentFeeRate,
  savePaymentFeeRate,
} from '../src/lib/paymentFees.js'
import { normalizeCostAnomalies } from '../src/lib/costAnomalies.js'
import {
  buildAccountingPeriodEntries,
  buildLargestPayments,
  buildSalesIndicators,
  getAccountingAnalysisSummary,
  groupSalaryCategories,
  spendingGroupOfCategory,
} from '../src/lib/accountingAnalysis.js'
import { filterAccountingHistoryRows } from '../src/lib/accounting.js'

const migration = readFileSync(new URL('../migrations/278_payment_fees_and_cost_checks.sql', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/AccountingAnalysis.jsx', import.meta.url), 'utf8')

test('bank fees become calculated expense rows per day and channel', () => {
  const fees = normalizePaymentFees({
    rates: { card: '1', terminal: 1.5, history: [{ method: 'terminal', effective_from: '2026-11-01', rate_pct: 1.5 }] },
    days: [
      { date: '2026-11-01', card_income: 100000, terminal_income: 2000000, card_fee: 1000, terminal_fee: 30000 },
      { date: '2026-11-02', card_income: 0, terminal_income: 1000000, card_fee: 0, terminal_fee: 15000 },
      { date: 'bad', card_fee: 5 },
    ],
  })
  assert.deepEqual(fees.totals, { card: 1000, terminal: 45000 })
  assert.equal(fees.total, 46000)
  assert.equal(fees.rates.terminal, 1.5)
  assert.equal(fees.rates.history[0].effectiveFrom, '2026-11-01')

  const rows = buildPaymentFeeEntries(fees)
  assert.equal(rows.length, 3)
  assert.ok(rows.every(row => row.category === BANK_FEE_CATEGORY && row.is_bank_fee_estimate && row.entry_type === 'expense'))
  assert.deepEqual(rows.map(row => row.payment_method), ['terminal', 'card', 'terminal'])

  const summary = getAccountingAnalysisSummary({ cafeIncome: 3100000 }, rows, '2026-11-01', '2026-11-02')
  assert.equal(summary.expenseSummary.byCategory[BANK_FEE_CATEGORY], 46000)
  // Estimates never crowd out real payments in Largest payments.
  assert.equal(buildLargestPayments(rows, '2026-11-01', '2026-11-02').length, 0)
  assert.deepEqual(buildPaymentFeeEntries(null), [])
})

test('fee rates accept 0–20 percent with up to three decimals', () => {
  assert.equal(parsePaymentFeeRate('1,5'), 1.5)
  assert.equal(parsePaymentFeeRate('0'), 0)
  assert.equal(parsePaymentFeeRate('20'), 20)
  assert.equal(parsePaymentFeeRate('20.5'), null)
  assert.equal(parsePaymentFeeRate('-1'), null)
  assert.equal(parsePaymentFeeRate('abc'), null)
  assert.equal(parsePaymentFeeRate('1.2345'), null)
})

test('saving a fee rate sends method, rate and start date to the RPC', async () => {
  const calls = []
  const dbClient = { rpc: async (name, args) => { calls.push([name, args]); return { data: { card: 1, terminal: 0 }, error: null } } }
  const rates = await savePaymentFeeRate('card', 1, '2026-11-01', { dbClient })
  assert.deepEqual(calls, [['set_payment_fee_rate', { p_method: 'card', p_rate_pct: 1, p_effective_from: '2026-11-01' }]])
  assert.equal(rates.card, 1)
  await assert.rejects(savePaymentFeeRate('cash', 1, null, { dbClient }))
})

test('cost anomalies keep only items whose saved cost is above price', () => {
  const result = normalizeCostAnomalies({
    count: 3,
    cost_total: 34110757,
    excess_total: 33690757,
    items: [
      { id: 'a', order_id: 'o1', name: '"Zarkebab" assorti', quantity: 1, price: 420000, cost_price: 34104757, sold_on: '2026-11-01' },
      { id: 'b', order_id: 'o2', name: 'Tea', quantity: 2, price: 5000, cost_price: 3000, sold_on: '2026-11-01' },
    ],
  })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].excess, 33684757)
  assert.equal(result.count, 3)
  assert.equal(result.excessTotal, 33690757)
})

test('range sales indicators: orders, per day, average check and gross margin', () => {
  const sales = buildSalesIndicators({ cafeIncome: 1000000, costTotal: 300000, orderCount: 8 }, '2026-01-01', '2026-01-04')
  assert.equal(sales.orderCount, 8)
  assert.equal(sales.ordersPerDay, 2)
  assert.equal(sales.averageCheck, 125000)
  assert.equal(sales.costPct, 30)
  assert.equal(sales.grossProfit, 700000)
  assert.equal(sales.grossMarginPct, 70)
  assert.equal(buildSalesIndicators({}, '2026-01-01', '2026-01-01').averageCheck, null)
})

test('salary categories group into one Salaries slice and history filter', () => {
  const grouped = groupSalaryCategories({ salary_cook: 300, salary_other: 1000, salary_one_time: 50, products_bazaar: 700 })
  assert.deepEqual(grouped, { salaries: 1350, products_bazaar: 700 })
  assert.equal(spendingGroupOfCategory('salaries'), 'salaries')

  const rows = [
    { id: 1, entry_type: 'expense', category: 'salary_waiter' },
    { id: 2, entry_type: 'expense', category: 'products_bazaar' },
    { id: 3, entry_type: 'expense', category: 'salary_other', is_salary_payment: true },
  ]
  assert.deepEqual(filterAccountingHistoryRows(rows, { category: 'salaries' }).map(row => row.id), [1, 3])
  assert.equal(buildAccountingPeriodEntries({}, '2026-01-01', '2026-01-02').length, 0)
})

test('migration 278 keeps fee history dated, read-only to clients, and costs gated', () => {
  assert.match(migration, /primary key \(method, effective_from\)/)
  assert.match(migration, /revoke insert, update, delete on public\.payment_fee_rate_history from anon, authenticated/)
  assert.match(migration, /cannot start in the future/)
  assert.match(migration, /get_accounting_paid_order_summary\(day_rates\.date, day_rates\.date\)/)
  assert.match(migration, /sold_item\.cost_price > sold_item\.price/)
  for (const fn of ['set_payment_fee_rate', 'get_accounting_payment_fees', 'get_accounting_cost_anomalies']) {
    assert.match(migration, new RegExp(`function public\\.${fn}\\([\\s\\S]*?current_staff_can_access\\('expenses'\\)`))
  }
  // Never writes Accounting rows or touches saved order costs.
  assert.doesNotMatch(migration, /insert into public\.expenses|update public\.order_items/)
})

test('Financial analysis labels gross profit honestly and groups salaries', () => {
  assert.match(page, /netProfit: 'Gross profit'/)
  assert.match(page, /netProfit: 'Валовая прибыль'/)
  assert.doesNotMatch(page, /netProfit: 'Net Profit'/)
  assert.match(page, /getTopExpenseCategories\(groupSalaryCategories\(/)
  assert.match(page, /buildPaymentFeeEntries\(feesForPeriod\.current\)/)
})

test('migration 278 runs: dated fee rates, per-day fees and cost anomalies', async t => {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function public.current_staff_can_access(text) returns boolean language sql as $$ select coalesce(current_setting('test.allowed', true), 'yes') = 'yes' $$;
    create function public.current_staff_can_access_any(text[]) returns boolean language sql as $$ select true $$;
    create table public.day_income(date date primary key, card integer, terminal integer, qr integer);
    create function public.get_accounting_paid_order_summary(p_from date, p_to date) returns jsonb language sql as $$
      select jsonb_build_object('payment_method_income', jsonb_build_object(
        'card', coalesce(sum(card), 0), 'terminal', coalesce(sum(terminal), 0), 'qr', coalesce(sum(qr), 0)))
      from public.day_income where date between p_from and p_to $$;
    create table public.orders(id text primary key, status text, payment_status text, paid_at timestamptz, created_at timestamptz default now());
    create table public.order_items(id uuid primary key default gen_random_uuid(), order_id text, name text, price integer, cost_price integer, quantity numeric, status text);
  `)
  await db.exec(migration)

  const today = (await db.query("select timezone('Asia/Tashkent', now())::date::text d")).rows[0].d
  const day = offset => (new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000)).toISOString().slice(0, 10)
  await db.query('insert into public.day_income values ($1, 100000, 1000000, 0), ($2, 0, 2000000, 1000000)', [day(-2), day(-1)])

  // No rates yet: no per-day work, no fees.
  const none = (await db.query('select public.get_accounting_payment_fees($1, $2) r', [day(-2), day(0)])).rows[0].r
  assert.deepEqual(none.days, [])

  await db.query("select public.set_payment_fee_rate('terminal', 1, $1)", [day(-2)])
  await db.query("select public.set_payment_fee_rate('terminal', 2, $1)", [day(-1)])
  await db.query("select public.set_payment_fee_rate('card', 1.5, $1)", [day(-2)])
  await assert.rejects(db.query("select public.set_payment_fee_rate('terminal', 1, $1)", [day(1)]), /future/)
  await assert.rejects(db.query("select public.set_payment_fee_rate('cash', 1)"), /Unknown payment method/)
  await assert.rejects(db.query("select public.set_payment_fee_rate('card', 25)"), /between 0 and 20/)

  const fees = normalizePaymentFees((await db.query('select public.get_accounting_payment_fees($1, $2) r', [day(-2), day(0)])).rows[0].r)
  // Day -2: terminal 1% of 1M, card 1.5% of 100K. Day -1: 2% of terminal+QR 3M.
  assert.deepEqual(fees.days.map(row => [row.date, row.cardFee, row.terminalFee]), [[day(-2), 1500, 10000], [day(-1), 0, 60000]])
  assert.equal(fees.rates.terminal, 2)
  assert.equal(fees.rates.history.length, 3)

  await db.exec("set test.allowed = 'no'")
  await assert.rejects(db.query('select public.get_accounting_payment_fees($1, $2)', [day(-2), day(0)]), /access is required/)
  await assert.rejects(db.query('select public.get_accounting_cost_anomalies($1, $2)', [day(-2), day(0)]), /access is required/)
  await assert.rejects(db.query("select public.set_payment_fee_rate('card', 1)"), /access is required/)
  await db.exec("set test.allowed = 'yes'")

  await db.exec(`
    insert into public.orders(id, status, payment_status, paid_at) values ('o1', 'paid', 'paid', now()), ('o2', 'cancelled', 'paid', now());
    insert into public.order_items(order_id, name, price, cost_price, quantity, status) values
      ('o1', 'Assorti', 420000, 34104757, 1, null),
      ('o1', 'Tea', 5000, 3000, 2, null),
      ('o1', 'Gift', 0, 6000, 1, null),
      ('o1', 'Removed', 1000, 9000, 1, 'cancelled'),
      ('o2', 'Cancelled order', 1000, 9000, 1, null);
  `)
  const anomalies = normalizeCostAnomalies((await db.query('select public.get_accounting_cost_anomalies($1, $1) r', [today])).rows[0].r)
  assert.equal(anomalies.count, 1)
  assert.equal(anomalies.items[0].name, 'Assorti')
  assert.equal(anomalies.excessTotal, 34104757 - 420000)
})
