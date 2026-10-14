import React, { useEffect, useState } from 'react'
import { Maximize2, ScanLine, WifiOff, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useRotatingCheckinQr } from '../lib/useRotatingCheckinQr'

// Dashboard check-in QR for salary managers (migration 245). Rendered only for
// Accounting writers; the RPC enforces the same rule.
const labels = {
  en: { title: 'Check-in QR', sub: 'Employees scan with the phone camera, then tap “Start”. Changes every 30 s.', fullscreen: 'Full screen', close: 'Close', offline: 'No connection — the code is hidden until the Dashboard reconnects.', loading: 'Loading…', scan: 'Arrived at work? Scan to check in' },
  ru: { title: 'QR для отметки', sub: 'Сотрудник сканирует камерой телефона и нажимает «Start». Меняется каждые 30 с.', fullscreen: 'На весь экран', close: 'Закрыть', offline: 'Нет связи — код скрыт, пока Dashboard не подключится.', loading: 'Загрузка…', scan: 'Пришли на работу? Отсканируйте' },
  uz: { title: 'Kelish QR kodi', sub: 'Xodim telefon kamerasi bilan skanerlaydi va «Start» ni bosadi. Har 30 soniyada o‘zgaradi.', fullscreen: 'To‘liq ekran', close: 'Yopish', offline: 'Aloqa yo‘q — Dashboard qayta ulanguncha kod yashirildi.', loading: 'Yuklanmoqda…', scan: 'Ishga keldingizmi? Skanerlang' },
}

export default function CheckinQrCard({ lang, className = '', onHiddenChange }) {
  const l = labels[lang] || labels.en
  const [expanded, setExpanded] = useState(false)
  const { status, dataUrl, secondsLeft } = useRotatingCheckinQr(
    signal => supabase.rpc('get_attendance_dashboard_token').abortSignal(signal),
    { source: 'dashboard' },
  )

  useEffect(() => {
    if (!expanded) return undefined
    const onKey = event => { if (event.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  // Not set up (migration, bot name) or not permitted: stay out of the way and
  // let the Dashboard give the row back to its other cards.
  const hidden = ['unavailable', 'disabled', 'no-bot', 'idle'].includes(status)
  useEffect(() => { onHiddenChange?.(hidden) }, [hidden, onHiddenChange])
  if (hidden) return null

  const progress = (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#efece9]">
      <div className="h-full rounded-full bg-[#ff5a00] transition-[width] duration-1000 ease-linear"
        style={{ width: `${Math.min(100, (secondsLeft / 30) * 100)}%` }} />
    </div>
  )

  return (
    <section aria-busy={status === 'loading'} className={`ws-panel flex min-w-0 flex-col ${className}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="ws-heading flex items-center gap-1.5"><ScanLine size={16} />{l.title}</h3>
        {dataUrl && (
          <button type="button" onClick={() => setExpanded(true)} title={l.fullscreen} aria-label={l.fullscreen}
            className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon">
            <Maximize2 size={15} />
          </button>
        )}
      </div>
      <p className="ws-caption mb-3">{l.sub}</p>
      <div className="mx-auto flex w-full max-w-[220px] flex-1 flex-col items-center justify-center gap-3">
        {dataUrl ? (
          <>
            <button type="button" onClick={() => setExpanded(true)} aria-label={l.fullscreen}
              className="block w-full rounded-xl bg-white p-1.5 ring-1 ring-black/5">
              <img src={dataUrl} alt={l.title} className="block aspect-square w-full" />
            </button>
            {progress}
          </>
        ) : status === 'offline' ? (
          <p role="status" className="ws-notice ws-tone-negative flex items-start gap-2 text-[13px]"><WifiOff size={16} className="mt-0.5 flex-shrink-0" />{l.offline}</p>
        ) : (
          <p role="status" className="ws-empty">{l.loading}</p>
        )}
      </div>

      {expanded && dataUrl && (
        <div role="dialog" aria-modal="true" aria-label={l.title}
          className="fixed inset-0 z-[130] flex flex-col items-center justify-center gap-4 bg-[#faf9f7] p-4 text-center">
          <button type="button" onClick={() => setExpanded(false)} aria-label={l.close} autoFocus
            className="ws-btn ws-btn-outline absolute right-4 top-4"><X size={16} />{l.close}</button>
          <p className="text-[clamp(22px,min(4vw,5dvh),40px)] font-black leading-tight text-[#141414]">{l.scan}</p>
          <div className="rounded-3xl bg-white p-3 shadow-xl ring-1 ring-black/5">
            <img src={dataUrl} alt={l.title} className="block size-[min(80vw,calc(100dvh-220px))] min-h-[220px] min-w-[220px]" />
          </div>
          <div className="w-[min(80vw,520px)]">{progress}</div>
        </div>
      )}
    </section>
  )
}
