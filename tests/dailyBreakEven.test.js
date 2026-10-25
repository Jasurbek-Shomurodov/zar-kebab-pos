import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDailyBreakEvenSnapshotRow, calculateDailyBreakEven, normalizeDailyBreakEvenSnapshot } from '../src/lib/dailyBreakEven.js'

// Figures from the 24 October 2026 Investor daily report.
const summary = {
  cafeIncomeTotal: 8_450_450,
  cafeNetProfit: 5_575_159,
  salaryTotal: 3_091_613,
  kpiBonusTotal: 287_497,
  rentTotal: 774_193,
  utilitiesTotal: 483_871,
  presentEmployeeCount: 15,
  employeeMealPerEmployeeTotal: 25_000,
  employeeMealTotal: 375_000,
  estimatedTaxRatePercent: 4,
  estimatedTaxTotal: 338_018,
  netProfit: 224_967,
}

test('break-even is fixed costs over what is left of each sum after cost of goods and soliq', () => {
  const row = buildDailyBreakEvenSnapshotRow(summary, '2026-10-24')
  assert.equal(row.cost_of_goods_uzs, 2_875_291)
  assert.equal(row.fixed_costs_uzs, 5_012_174)
  const costRate = 2_875_291 / 8_450_450
  assert.equal(row.break_even_income_uzs, Math.round(5_012_174 / (1 - costRate - 0.04)))
  // At that income net profit is zero; yesterday's income was above it, as its positive profit shows.
  assert.ok(row.break_even_income_uzs < 8_450_450)
  const day = normalizeDailyBreakEvenSnapshot({ ...row, calculated_at: '2026-10-25T03:00:00Z' })
  assert.equal(day.businessDate, '2026-10-24')
  assert.equal(day.breakEven, row.break_even_income_uzs)
  assert.equal(day.employeeMealCount, 15)
})

test('break-even is unknown without cost of goods or income', () => {
  assert.equal(buildDailyBreakEvenSnapshotRow({ ...summary, cafeNetProfit: null }, '2026-10-24').break_even_income_uzs, null)
  assert.equal(calculateDailyBreakEven({ cafeIncome: 0, costOfGoods: 0, salary: 100 }).breakEven, null)
  assert.equal(calculateDailyBreakEven({ cafeIncome: 100, costOfGoods: 99, salary: 100 }).breakEven, null)
})

test('the daily cron records the snapshot and keeps it immutable', () => {
  const cron = readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../migrations/263_daily_break_even_snapshots.sql', import.meta.url), 'utf8')
  assert.match(cron, /upsert\(row, \{ onConflict: 'business_date', ignoreDuplicates: true \}\)/)
  assert.match(cron, /await recordDailyBreakEvenSafely\(supabase, businessDate, summary\)/)
  assert.match(cron, /ensureDailyBreakEven\(supabase, notificationDate\)/)
  assert.match(cron, /rpc\('apply_daily_break_even', \{ p_business_date: businessDate \}\)/)
  // Each day's target is dated on that day, not on the morning it was calculated.
  assert.match(migration, /values \(p_business_date, v_amount, null, now\(\)\)/)
  assert.match(migration, /current_setting\('zar\.break_even_from_snapshot', true\)/)
  assert.match(migration, /grant execute on function public\.apply_daily_break_even\(date\) to service_role/)
  assert.match(migration, /revoke insert, update, delete on public\.daily_break_even_snapshots from authenticated/)
})
