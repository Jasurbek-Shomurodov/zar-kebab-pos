import test from 'node:test'
import assert from 'node:assert/strict'
import { REALTIME_RECOVERY_BASE_MS, REALTIME_RECOVERY_MAX_MS, RESUME_RECOVERY_AWAY_MS, realtimeRecoveryDelay, shouldRecoverOnResume } from '../src/lib/resumeRecovery.js'

test('brief focus and tab switches keep the live connection without reloading', () => {
  for (const eventType of ['focus', 'visibilitychange']) {
    assert.equal(shouldRecoverOnResume({ eventType, awayMs: 0, realtimeHealthy: true }), false)
    assert.equal(shouldRecoverOnResume({ eventType, awayMs: RESUME_RECOVERY_AWAY_MS - 1, realtimeHealthy: true }), false)
  }
})

test('a real absence, a network return or a broken channel still recovers', () => {
  assert.equal(shouldRecoverOnResume({ eventType: 'visibilitychange', awayMs: RESUME_RECOVERY_AWAY_MS, realtimeHealthy: true }), true)
  assert.equal(shouldRecoverOnResume({ eventType: 'online', awayMs: 0, realtimeHealthy: true }), true)
  assert.equal(shouldRecoverOnResume({ eventType: 'focus', awayMs: 0, realtimeHealthy: false }), true)
})

test('realtime recovery backs off exponentially with jitter up to a minute', () => {
  const low = () => 0, high = () => 0.999999
  assert.equal(realtimeRecoveryDelay(0, low), REALTIME_RECOVERY_BASE_MS / 2)
  assert.equal(realtimeRecoveryDelay(0, high), REALTIME_RECOVERY_BASE_MS)
  assert.equal(realtimeRecoveryDelay(3, high), 8_000)
  for (const failures of [6, 7, 20, 1000]) {
    assert.ok(realtimeRecoveryDelay(failures, high) <= REALTIME_RECOVERY_MAX_MS)
    assert.ok(realtimeRecoveryDelay(failures, low) >= REALTIME_RECOVERY_MAX_MS / 2)
  }
  for (let failures = 1; failures < 8; failures++) {
    assert.ok(realtimeRecoveryDelay(failures, low) >= realtimeRecoveryDelay(failures - 1, low))
  }
})
