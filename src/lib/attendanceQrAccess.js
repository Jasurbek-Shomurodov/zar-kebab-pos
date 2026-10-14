import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { formatTime } from './dateFormat'
import { isAttendanceQrWindowOpen } from './attendance'

// The signed-in account's drawer QR window (migration 247). The drawer
// remounts with every page, so the lookup is cached briefly per account.
const CACHE_MS = 60_000
let cache = { profileId: '', at: 0, promise: null }

export function invalidateAttendanceQrAccess() {
  cache = { profileId: '', at: 0, promise: null }
}

function loadAccess(profileId) {
  if (cache.profileId === profileId && cache.promise && Date.now() - cache.at < CACHE_MS) return cache.promise
  // A missing migration or failed read hides the tab; it is cached like a
  // success so every open page does not retry every 15 s.
  const promise = supabase.rpc('get_my_attendance_qr_access')
    .then(({ data, error }) => (error ? null : data?.[0] || null))
    .catch(() => null)
  cache = { profileId, at: Date.now(), promise }
  return promise
}

// { loading, access: { start_time, end_time } | null, openNow }
export function useAttendanceQrAccess(profileId) {
  const [access, setAccess] = useState(null)
  const [loading, setLoading] = useState(Boolean(profileId))
  const [clock, setClock] = useState(() => formatTime(new Date()))

  useEffect(() => {
    if (!profileId) {
      setAccess(null)
      setLoading(false)
      return undefined
    }
    let cancelled = false
    const refresh = () => loadAccess(profileId)
      .then(row => {
        if (cancelled) return
        setAccess(row)
        setLoading(false)
      })
    refresh()
    // Pick up Settings changes and the window opening or closing.
    const timer = window.setInterval(() => {
      setClock(formatTime(new Date()))
      refresh()
    }, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [profileId])

  return {
    loading,
    access,
    openNow: Boolean(access) && isAttendanceQrWindowOpen(access.start_time, access.end_time, clock),
  }
}
