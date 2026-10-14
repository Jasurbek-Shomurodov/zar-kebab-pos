import { useEffect, useRef, useState } from 'react'
import { buildAttendanceCheckinUrl, getTashkentClock, isAttendanceStarted } from './attendance'

// Shared rotation loop for the entrance screen and the Dashboard card
// (migration 245). Codes rotate every 15 s; the bot rejects them about two
// minutes after their slot.
const REQUEST_TIMEOUT_MS = 10_000
const RETRY_MS = 5_000
// Hide a QR that could not be refreshed: after this long it may be rejected.
export const STALE_AFTER_MS = 60_000

function isMissingRpc(error) {
  return ['PGRST202', '42883'].includes(error?.code)
}

// requestToken(signal) -> Supabase RPC builder resolving to { data, error }.
// source identifies the token stream; changing it restarts the loop.
// status: loading | active | offline | disabled (null token / forbidden) | unavailable (RPC missing) | idle
// | not-started (before ATTENDANCE_START_DATE; no codes are requested)
export function useRotatingCheckinQr(requestToken, { source, enabled = true } = {}) {
  const botUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim()
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle')
  const [dataUrl, setDataUrl] = useState('')
  // When the shown code's 15 s slot ends, on this device's clock.
  const [slotEndsAt, setSlotEndsAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const lastOkAt = useRef(0)
  const requestRef = useRef(requestToken)
  requestRef.current = requestToken
  // Re-evaluated every tick, so an open screen starts at Tashkent midnight.
  const started = isAttendanceStarted(getTashkentClock(new Date(now)).date)

  useEffect(() => {
    if (!enabled || !botUsername || !started) {
      setStatus('idle')
      return undefined
    }
    let cancelled = false
    let timer = 0
    let controller = null
    setStatus('loading')

    const schedule = delay => {
      window.clearTimeout(timer)
      timer = window.setTimeout(refresh, delay)
    }

    async function refresh() {
      controller?.abort()
      controller = new AbortController()
      const abortTimer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const { data, error } = await requestRef.current(controller.signal)
        const receivedAt = Date.now()
        if (cancelled) return
        if (isMissingRpc(error)) {
          // Migration not applied yet; pick it up without a reload.
          setStatus('unavailable')
          schedule(60_000)
          return
        }
        if (error?.code === '42501') {
          // Not allowed now (account removed or outside its window); re-check
          // later in case the clock or Settings disagree with this device.
          setDataUrl('')
          setStatus('disabled')
          schedule(30_000)
          return
        }
        if (error) throw error
        if (!data?.payload) {
          // Turned off or replaced by a newer screen link; it never comes back.
          setDataUrl('')
          setStatus('disabled')
          return
        }
        const url = buildAttendanceCheckinUrl(botUsername, data.payload)
        const QRCode = (await import('qrcode')).default
        const nextDataUrl = await QRCode.toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: 'M' })
        if (cancelled) return
        setDataUrl(nextDataUrl)
        setSlotEndsAt(receivedAt + Math.max(0, Number(data.ms_left) || 0))
        lastOkAt.current = Date.now()
        setStatus('active')
        // Refresh just after the 15 s slot turns over, judged by the server clock.
        schedule(Math.max(1_000, Number(data.ms_left) || 0) + 300)
      } catch {
        if (cancelled) return
        if (Date.now() - lastOkAt.current > STALE_AFTER_MS) setStatus('offline')
        schedule(RETRY_MS)
      } finally {
        window.clearTimeout(abortTimer)
      }
    }

    // Returning from sleep, a hidden tab or offline: the shown code may be stale.
    const onVisible = () => { if (document.visibilityState === 'visible') schedule(0) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    refresh()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [enabled, botUsername, source, started])

  // Countdown and stale-code guard.
  useEffect(() => {
    const tick = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (lastOkAt.current && current - lastOkAt.current > STALE_AFTER_MS) {
        setStatus(value => (value === 'active' ? 'offline' : value))
      }
    }, 1_000)
    return () => window.clearInterval(tick)
  }, [])

  return {
    status: !started ? 'not-started' : !enabled ? 'idle' : botUsername ? status : 'no-bot',
    dataUrl: status === 'active' ? dataUrl : '',
    slotEndsAt,
    now,
  }
}

export const CHECKIN_QR_SLOT_SECONDS = 15

// Keep the screen on while a code is shown; browsers drop the lock when the
// tab is hidden, so it is re-acquired on return.
export function useScreenWakeLock(active) {
  useEffect(() => {
    if (!active || !navigator.wakeLock?.request) return undefined
    let lock = null
    let released = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (released) lock.release().catch(() => {})
      } catch { /* not allowed (battery saver); the screen may dim */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [active])
}
