import { useEffect, useRef, useState } from 'react'
import { buildAttendanceCheckinUrl } from './attendance'

// Shared rotation loop for the entrance screen and the Dashboard card
// (migration 245). The bot rejects codes about two minutes after their slot.
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
export function useRotatingCheckinQr(requestToken, { source, enabled = true } = {}) {
  const botUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim()
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle')
  const [dataUrl, setDataUrl] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const nextRefreshAt = useRef(0)
  const lastOkAt = useRef(0)
  const requestRef = useRef(requestToken)
  requestRef.current = requestToken

  useEffect(() => {
    if (!enabled || !botUsername) {
      setStatus('idle')
      return undefined
    }
    let cancelled = false
    let timer = 0
    let controller = null
    setStatus('loading')

    const schedule = delay => {
      window.clearTimeout(timer)
      nextRefreshAt.current = Date.now() + delay
      timer = window.setTimeout(refresh, delay)
    }

    async function refresh() {
      controller?.abort()
      controller = new AbortController()
      const abortTimer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const { data, error } = await requestRef.current(controller.signal)
        if (cancelled) return
        if (isMissingRpc(error)) {
          // Migration not applied yet; pick it up without a reload.
          setStatus('unavailable')
          schedule(60_000)
          return
        }
        if (error?.code === '42501') {
          setDataUrl('')
          setStatus('disabled')
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
        lastOkAt.current = Date.now()
        setStatus('active')
        // Refresh just after the 30 s slot turns over, judged by the server clock.
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
  }, [enabled, botUsername, source])

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
    status: botUsername ? status : 'no-bot',
    dataUrl: status === 'active' ? dataUrl : '',
    secondsLeft: Math.max(0, Math.ceil((nextRefreshAt.current - now) / 1000)),
    now,
  }
}
