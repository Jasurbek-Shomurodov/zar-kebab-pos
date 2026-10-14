// A brief tab or window switch keeps the realtime socket open, so a full
// session refresh, reload and resubscribe on every focus only repeats requests.
// Recover after a real absence, a network return or a broken realtime channel.
export const RESUME_RECOVERY_AWAY_MS = 60_000

export function shouldRecoverOnResume({ eventType, awayMs, realtimeHealthy }) {
  if (eventType === 'online') return true
  if (!realtimeHealthy) return true
  return awayMs >= RESUME_RECOVERY_AWAY_MS
}

// A broken channel triggers a session refresh, full hydration and resubscribe.
// Every open device does this at once when the database is overloaded, so
// back off exponentially with jitter instead of retrying every second.
export const REALTIME_RECOVERY_BASE_MS = 1_000
export const REALTIME_RECOVERY_MAX_MS = 60_000
// A channel must stay subscribed this long before failures stop counting.
export const REALTIME_STABLE_MS = 30_000

export function realtimeRecoveryDelay(failures, random = Math.random) {
  const ceiling = Math.min(REALTIME_RECOVERY_MAX_MS, REALTIME_RECOVERY_BASE_MS * 2 ** Math.max(0, failures))
  return Math.round(ceiling / 2 + random() * (ceiling / 2))
}
