import React from 'react'
import { CalendarClock, Clock3, QrCode, WifiOff } from 'lucide-react'
import { Shimmer } from '../components/PageShimmer'
import CheckinCountdownBar from '../components/CheckinCountdownBar'
import AppShell from '../components/AppShell'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatAttendanceQrWindow } from '../lib/attendance'
import { useAttendanceQrAccess } from '../lib/attendanceQrAccess'
import { useRotatingCheckinQr, useScreenWakeLock } from '../lib/useRotatingCheckinQr'

// Drawer page for accounts selected in Settings (migration 247). The database
// refuses codes outside the account's window, whatever this device's clock says.
const L = {
  uz: {
    title: 'Kelish QR kodi',
    scan: 'Ishga keldingizmi? Skanerlang',
    how: 'Telefon kamerasi → Telegram → «Start». Kod har 15 soniyada o‘zgaradi.',
    notSelected: 'Bu akkaunt uchun kelish QR kodi yoqilmagan. Uni Sozlamalarda yoqish mumkin.',
    closed: 'QR kod faqat shu vaqtda ko‘rsatiladi:',
    offline: 'Aloqa yo‘q. Qayta ulanguncha kod yashirildi.',
    noBot: 'VITE_TELEGRAM_BOT_USERNAME sozlanmagan.',
    unavailable: 'Kelish QR kodi hali sozlanmagan (247-migratsiya).',
    notStarted: 'Ishga kelishni belgilash 15-oktabrdan boshlanadi.',
  },
  ru: {
    title: 'QR для отметки',
    scan: 'Пришли на работу? Отсканируйте',
    how: 'Камера телефона → Telegram → «Start». Код меняется каждые 15 секунд.',
    notSelected: 'Для этого аккаунта QR отметки не включён. Его можно включить в Настройках.',
    closed: 'QR показывается только в это время:',
    offline: 'Нет связи. Код скрыт, пока связь не восстановится.',
    noBot: 'Не настроен VITE_TELEGRAM_BOT_USERNAME.',
    unavailable: 'QR отметки ещё не настроен (миграция 247).',
    notStarted: 'Отметка прихода начнётся 15 октября.',
  },
  en: {
    title: 'Check-in QR',
    scan: 'Arrived at work? Scan to check in',
    how: 'Phone camera → Telegram → “Start”. The code changes every 15 seconds.',
    notSelected: 'The check-in QR is not enabled for this account. It can be enabled in Settings.',
    closed: 'The QR is shown only during:',
    offline: 'No connection. The code is hidden until it reconnects.',
    noBot: 'VITE_TELEGRAM_BOT_USERNAME is not configured.',
    unavailable: 'The check-in QR is not set up yet (migration 247).',
    notStarted: 'Attendance check-in starts on 15 October.',
  },
}

export default function CheckinQr() {
  const { state } = useApp()
  const { profile } = useAuth()
  const l = L[state.lang] || L.en
  const { loading, access, openNow } = useAttendanceQrAccess(profile?.id)
  const { status, dataUrl, slotEndsAt } = useRotatingCheckinQr(
    signal => supabase.rpc('get_attendance_qr_token').abortSignal(signal),
    { source: 'staff', enabled: openNow },
  )
  useScreenWakeLock(Boolean(dataUrl))

  // Loading shimmers in the QR's own shape; messages are for settled states.
  let message = null
  if (loading) message = null
  else if (!access) message = { icon: <QrCode size={36} />, text: l.notSelected }
  else if (status === 'not-started') message = { icon: <CalendarClock size={36} />, text: l.notStarted }
  else if (!openNow || status === 'disabled') {
    message = { icon: <Clock3 size={36} />, text: l.closed, detail: formatAttendanceQrWindow(access.start_time, access.end_time, state.lang) }
  } else if (status === 'no-bot') message = { icon: <QrCode size={36} />, text: l.noBot }
  else if (status === 'unavailable') message = { icon: <QrCode size={36} />, text: l.unavailable }
  else if (status === 'offline') message = { icon: <WifiOff size={36} />, text: l.offline }

  return (
    <AppShell title={l.title}>
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-[#f6f5f3] px-4 py-6 text-center">
        {message ? (
          <div role="status" className="flex max-w-md flex-col items-center gap-3 text-[#68655f]">
            {message.icon}
            <p className="text-lg font-semibold text-[#22201d]">{message.text}</p>
            {message.detail && <p className="text-3xl font-bold tabular-nums text-[#22201d]">{message.detail}</p>}
          </div>
        ) : (
          <>
            <h1 aria-busy={!dataUrl} className="text-[clamp(22px,min(4vw,5dvh),40px)] font-black leading-tight text-[#141414]">{l.scan}</h1>
            <div className="rounded-3xl bg-white p-3 shadow-xl ring-1 ring-black/5">
              {dataUrl
                ? <img src={dataUrl} alt={l.title} className="block size-[min(80vw,calc(100dvh-260px))] min-h-[220px] min-w-[220px]" />
                : <Shimmer className="size-[min(80vw,calc(100dvh-260px))] min-h-[220px] min-w-[220px] rounded-2xl" />}
            </div>
            <div className="w-[min(80vw,520px)]">
              <CheckinCountdownBar key={slotEndsAt} slotEndsAt={slotEndsAt} />
              <p className="ws-caption mt-3 !text-[14px]">{l.how}</p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
