import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  buildDashboardMonthlyIncomeChartRows,
  DASHBOARD_DAILY_BREAK_EVEN_INCOME,
  loadDashboardMonthlyAverageIncome,
  normalizeDashboardMonthlyIncomeRows,
} from '../src/lib/monthlyIncome.js'

const migration = fs.readFileSync(
  new URL('../migrations/157_dashboard_monthly_income_snapshots.sql', import.meta.url),
  'utf8'
)
const completedDayMigration = fs.readFileSync(
  new URL('../migrations/174_dashboard_monthly_income_completed_days.sql', import.meta.url),
  'utf8'
)
const loader = fs.readFileSync(new URL('../src/lib/monthlyIncome.js', import.meta.url), 'utf8')
const dashboard = fs.readFileSync(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8')
const analysis = fs.readFileSync(new URL('../src/pages/AccountingAnalysis.jsx', import.meta.url), 'utf8')
const monthlyChart = fs.readFileSync(new URL('../src/components/MonthlyIncomeChart.jsx', import.meta.url), 'utf8')
const settings = fs.readFileSync(new URL('../src/pages/AdminSettings.jsx', import.meta.url), 'utf8')
const db = fs.readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8')
const defaults = fs.readFileSync(new URL('../src/store/reducerHelpers.js', import.meta.url), 'utf8')
const breakEvenMigration = fs.readFileSync(
  new URL('../migrations/158_business_settings_daily_break_even_income.sql', import.meta.url),
  'utf8'
)

test('monthly income rows normalize exact-money fields and sort chronologically', () => {
  assert.deepEqual(normalizeDashboardMonthlyIncomeRows([
    {
      month_start: '2026-08-01',
      total_income: '3100000',
      day_count: 10,
      average_daily_income: '310000',
      order_count: '45',
      is_finalized: false,
    },
    {
      month_start: '2026-07-01',
      total_income: '6200000',
      day_count: 31,
      average_daily_income: '200000',
      order_count: '82',
      is_finalized: true,
    },
    { month_start: 'invalid', average_daily_income: 99 },
  ]), [
    {
      monthStart: '2026-07-01',
      totalIncome: 6200000,
      dayCount: 31,
      averageDailyIncome: 200000,
      orderCount: 82,
      isFinalized: true,
    },
    {
      monthStart: '2026-08-01',
      totalIncome: 3100000,
      dayCount: 10,
      averageDailyIncome: 310000,
      orderCount: 45,
      isFinalized: false,
    },
  ])
})

test('monthly income loader uses the bounded aggregate RPC rather than order history', async () => {
  const calls = []
  const rows = [{
    month_start: '2026-08-01',
    total_income: 100,
    day_count: 1,
    average_daily_income: 100,
    order_count: 1,
    is_finalized: false,
  }]
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({ data: rows, error: null })
    },
  }

  const result = await loadDashboardMonthlyAverageIncome({ dbClient, monthCount: 120 })

  assert.deepEqual(calls, [{
    name: 'get_dashboard_monthly_average_income',
    args: { p_month_count: 24 },
  }])
  assert.equal(result[0].averageDailyIncome, 100)
  assert.doesNotMatch(loader, /loadPaidOrdersForRange|from\(['"]orders['"]\)/)
})

test('monthly income chart keeps all 12 calendar positions in chronological order', () => {
  const rows = [
    ['2026-05-01', 0],
    ['2026-06-01', 1_600_000],
    ['2026-07-01', 3_800_000],
    ['2026-08-01', 5_600_000],
  ].map(([monthStart, averageDailyIncome]) => ({ monthStart, averageDailyIncome }))

  const chartRows = buildDashboardMonthlyIncomeChartRows(rows)

  assert.deepEqual(chartRows.map(row => row.monthStart), [
    '2026-05-01',
    '2026-06-01',
    '2026-07-01',
    '2026-08-01',
  ])
  assert.equal(chartRows[0].averageDailyIncome, 0)
})

test('daily break-even defaults to 10 million UZS and persists through business settings', () => {
  assert.equal(DASHBOARD_DAILY_BREAK_EVEN_INCOME, 10_000_000)
  assert.match(settings, /averageDailyBreakEvenIncomeUzs/)
  assert.match(settings, /formatMoneyInput\(averageDailyBreakEvenIncomeUzs\)/)
  assert.match(db, /averageDailyBreakEvenIncomeUzs: Math\.max\(0, Math\.round\(Number\(row\.average_daily_break_even_income_uzs \?\? 10_000_000\) \|\| 0\)\)/)
  assert.match(db, /average_daily_break_even_income_uzs: Math\.max\(0, Math\.round\(Number\(settings\.averageDailyBreakEvenIncomeUzs\) \|\| 0\)\)/)
  assert.match(defaults, /averageDailyBreakEvenIncomeUzs:\s*10_000_000/)
  assert.match(breakEvenMigration, /average_daily_break_even_income_uzs bigint not null default 10000000/)
  assert.doesNotMatch(loader, /loadPaidOrdersForRange|from\(['"]orders['"]\)/)
})

test('completed Dashboard months are immutable database snapshots with one-time backfill', () => {
  assert.match(migration, /create table if not exists public\.dashboard_monthly_income_snapshots/i)
  assert.match(migration, /month_start\s+date primary key/i)
  assert.match(migration, /average_daily_income\s+bigint not null/i)
  assert.match(migration, /average_daily_income = round\(total_income::numeric \/ day_count\)::bigint/i)
  assert.match(migration, /before update or delete on public\.dashboard_monthly_income_snapshots/i)
  assert.match(migration, /Finalized Dashboard monthly income snapshots are immutable/i)
  assert.match(migration, /paid_orders as materialized/i)
  assert.match(migration, /'legacy_backfill'/i)
  assert.match(migration, /on conflict \(month_start\) do nothing/i)
})

test('month-end finalization is duplicate-safe and scheduled with Tashkent boundaries', () => {
  assert.match(migration, /create or replace function public\.finalize_dashboard_monthly_income/i)
  assert.match(migration, /timezone\('Asia\/Tashkent', now\(\)\)/i)
  assert.match(migration, /Only completed Tashkent months can be finalized/i)
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('dashboard-monthly-income:'/i)
  assert.match(migration, /create or replace function public\.finalize_previous_dashboard_monthly_income/i)
  assert.match(migration, /zar-kebab-monthly-income-snapshot/i)
  assert.match(migration, /'10 20 \* \* \*'/i)
})

test('Monthly income chart reads snapshots plus only the live current month aggregate', () => {
  assert.match(migration, /create or replace function public\.get_dashboard_monthly_average_income/i)
  assert.match(migration, /left join public\.dashboard_monthly_income_snapshots snapshot/i)
  assert.match(migration, /current_paid_orders as materialized/i)
  assert.match(migration, /"order"\.paid_at >= v_from_instant/i)
  assert.match(migration, /"order"\.paid_at < v_to_instant_exclusive/i)
  assert.match(migration, /grant execute on function public\.get_dashboard_monthly_average_income\(integer\)[\s\S]*to authenticated/i)
  // The chart lives on Financial analysis, which already loads the monthly rows;
  // the Dashboard (the app's landing page) must not request them.
  assert.doesNotMatch(dashboard, /loadDashboardMonthlyAverageIncome|MonthlyIncomeChart|WeeklyIncomeChart/)
  assert.match(analysis, /loadDashboardMonthlyAverageIncome/)
  assert.match(analysis, /<MonthlyIncomeChart[\s\S]*rows=\{growth\.months\}/)
  assert.match(analysis, /DASHBOARD_DAILY_BREAK_EVEN_INCOME/)
  assert.match(analysis, /state\.settings\?\.averageDailyBreakEvenIncomeUzs/)
  // The dotted line follows the target in effect for each month (260), not today's value.
  assert.match(analysis, /<MonthlyIncomeChart[\s\S]*targetForPeriod=\{targetForPeriod\}/)
  assert.match(monthlyChart, /buildDashboardMonthlyIncomeChartRows\(rows\)/)
  assert.match(monthlyChart, /targetForPeriod\(lastDayOfMonth\(row\.monthStart\)\)/)
  assert.match(monthlyChart, /row\.target \/ monthlyIncomeScaleMax/)
  assert.match(monthlyChart, /border-dotted border-\[#c4262c\]/)
  assert.match(monthlyChart, /monthlyIncomeChartRows\.map/)
  assert.match(monthlyChart, /formatCompactIncome\(row\.averageDailyIncome, lang\)/)
  assert.match(monthlyChart, /Average Daily Income by Month/)
})

test('current Dashboard month includes completed Tashkent days only', () => {
  assert.match(completedDayMigration, /create or replace function public\.get_dashboard_monthly_average_income/i)
  assert.match(completedDayMigration, /v_to_instant_exclusive timestamptz := timezone\('Asia\/Tashkent', now\(\)\)::date::timestamp at time zone 'Asia\/Tashkent'/i)
  assert.match(completedDayMigration, /v_completed_day_count smallint := greatest\(v_today - v_current_month, 0\)::smallint/i)
  assert.match(completedDayMigration, /"order"\.paid_at < v_to_instant_exclusive/i)
  assert.match(completedDayMigration, /requested\.requested_month = v_current_month and v_completed_day_count > 0/i)
  assert.match(completedDayMigration, /round\(current_total\.income::numeric \/ v_completed_day_count\)::bigint/i)
  assert.match(completedDayMigration, /when requested\.requested_month = v_current_month then 0/i)
  assert.doesNotMatch(completedDayMigration, /v_today - v_current_month \+ 1/)
})
