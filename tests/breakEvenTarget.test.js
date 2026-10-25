import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { breakEvenTargetForPeriod, breakEvenTargetOn, lastDayOfMonth, loadBreakEvenTargetHistory, normalizeBreakEvenTargetHistory } from '../src/lib/breakEvenTarget.js'

const history = normalizeBreakEvenTargetHistory([
  { effective_from: '2026-10-25', amount_uzs: '7500000', changed_at: '2026-10-25T16:00:40Z' },
  { effective_from: '2026-05-21', amount_uzs: 10000000 },
])

test('each period uses the target in effect on its last day', () => {
  assert.deepEqual(history.map(row => row.effectiveFrom), ['2026-05-21', '2026-10-25'])
  assert.equal(breakEvenTargetOn(history, '2026-01-01'), 10_000_000)
  assert.equal(breakEvenTargetOn(history, '2026-10-24'), 10_000_000)
  assert.equal(breakEvenTargetOn(history, '2026-10-25'), 7_500_000)
  assert.equal(breakEvenTargetForPeriod(history, '2026-09-30', '2026-10-25'), 10_000_000)
  // An open period uses today's target, not a future day's.
  assert.equal(breakEvenTargetForPeriod(history, '2026-10-31', '2026-10-25'), 7_500_000)
  assert.equal(breakEvenTargetForPeriod(history, '2026-10-31', '2026-10-24'), 10_000_000)
})

test('without history the current settings target applies', () => {
  assert.equal(breakEvenTargetOn([], '2026-10-01', 7_500_000), 7_500_000)
  assert.equal(lastDayOfMonth('2026-02-01'), '2026-02-28')
  assert.equal(lastDayOfMonth('2026-10-01'), '2026-10-31')
})

test('history loader tolerates a missing table and propagates other errors', async () => {
  const client = error => ({ from: () => ({ select: () => ({ order: async () => ({ data: null, error }) }) }) })
  assert.deepEqual(await loadBreakEvenTargetHistory({ dbClient: client({ code: 'PGRST205', message: 'business_break_even_target_history' }) }), [])
  await assert.rejects(loadBreakEvenTargetHistory({ dbClient: client({ code: '500', message: 'boom' }) }))
})

test('migration 260 records target changes from settings with a Tashkent effective date', () => {
  const sql = readFileSync(new URL('../migrations/260_break_even_target_history.sql', import.meta.url), 'utf8')
  assert.match(sql, /after insert or update of average_daily_break_even_income_uzs on public\.business_settings/)
  assert.match(sql, /timezone\('Asia\/Tashkent', now\(\)\)::date/)
  assert.match(sql, /revoke insert, update, delete on public\.business_break_even_target_history from anon, authenticated/)
})
