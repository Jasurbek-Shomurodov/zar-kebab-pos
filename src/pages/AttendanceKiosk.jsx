import React, { useEffect, useState } from 'react'
import { CalendarClock, MonitorOff, ScanLine, WifiOff } from 'lucide-react'
import { Shimmer } from '../components/PageShimmer'
import CheckinCountdownBar from '../components/CheckinCountdownBar'
import { supabase } from '../lib/supabase'
import { formatLongDate, formatTime } from '../lib/dateFormat'
import {
  ATTENDANCE_KIOSK_KEY_STORAGE,
  ATTENDANCE_KIOSK_PATH,
  readAttendanceKioskKey,
} from '../lib/attendance'
import { useRotatingCheckinQr, useScreenWakeLock } from '../lib/useRotatingCheckinQr'

// Signed-out entrance screen (migration 245). It trades its screen key for a
// QR payload that rotates every 15 s; the bot rejects codes older than ~2 min.

function readStoredKey() {
  try { return localStorage.getItem(ATTENDANCE_KIOSK_KEY_STORAGE) || '' } catch { return '' }
}

function storeKey(key) {
  try { localStorage.setItem(ATTENDANCE_KIOSK_KEY_STORAGE, key) } catch { /* the hash key still works this session */ }
}

// Keep the key out of the address bar so it is not copied or photographed.
function takeKioskKey() {
  const fromHash = readAttendanceKioskKey(globalThis.location?.hash)
  if (fromHash) {
    storeKey(fromHash)
    try { globalThis.history?.replaceState(null, '', ATTENDANCE_KIOSK_PATH) } catch { /* cosmetic */ }
    return fromHash
  }
  return readStoredKey()
}

export default function AttendanceKiosk() {
  const [key] = useState(takeKioskKey)
  const { status: qrStatus, dataUrl, slotEndsAt, now } = useRotatingCheckinQr(
    signal => supabase.rpc('get_attendance_kiosk_token', { p_key: key }).abortSignal(signal),
    { source: key, enabled: Boolean(key) },
  )
  const status = key || qrStatus === 'not-started' ? qrStatus : 'no-key'

  // A new link pasted into an already-open tab only changes the hash, which
  // does not reload the page; adopt the new key with a clean reload.
  useEffect(() => {
    const onHashChange = () => {
      if (readAttendanceKioskKey(globalThis.location?.hash) && takeKioskKey()) globalThis.location.reload()
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useScreenWakeLock(status === 'active')

  const showQr = status === 'active' && dataUrl

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#faf9f7] px-4 py-5 text-center text-[#141414]">
      <div>
        <p className="text-sm font-extrabold uppercase tracking-[0.25em] text-[#ff5a00]">Zar Kebab</p>
        <p className="mt-2 text-lg font-semibold tabular-nums text-[#55524c]">
          {formatLongDate(new Date(now), 'ru')} · {formatTime(new Date(now))}
        </p>
      </div>

      {/* While the first code loads, the same layout shimmers in place of the QR. */}
      {showQr || status === 'loading' ? (
        <>
          <div>
            <h1 className="text-[clamp(24px,min(4.5vw,5dvh),44px)] font-black leading-tight">Пришли на работу? Отсканируйте</h1>
            <p className="mt-1 text-[clamp(17px,min(3vw,3.5dvh),28px)] font-bold text-[#55524c]">Ishga keldingizmi? Skanerlang</p>
          </div>
          <div className="rounded-3xl bg-white p-3 shadow-xl ring-1 ring-black/5">
            {showQr
              ? <img src={dataUrl} alt="QR" className="block size-[min(70vw,calc(100dvh-320px))] min-h-[220px] min-w-[220px]" />
              : <Shimmer className="size-[min(70vw,calc(100dvh-320px))] min-h-[220px] min-w-[220px] rounded-2xl" />}
          </div>
          <div className="w-[min(90vw,640px)]">
            <CheckinCountdownBar key={slotEndsAt} slotEndsAt={slotEndsAt} />
            <p className="mt-3 text-base font-semibold text-[#55524c]">
              <ScanLine size={18} className="mr-1.5 inline-block align-[-3px]" />
              Камера телефона → Telegram → «Start» · Telefon kamerasi → Telegram → «Start»
            </p>
          </div>
        </>
      ) : (
        <KioskState status={status} />
      )}
    </main>
  )
}

function KioskState({ status }) {
  const states = {
    'not-started': {
      icon: <CalendarClock size={40} />,
      ru: 'Отметка прихода начнётся 15 октября.',
      uz: 'Ishga kelishni belgilash 15-oktabrdan boshlanadi.',
    },
    offline: {
      icon: <WifiOff size={40} />,
      ru: 'Нет связи. Код скрыт, пока экран не подключится снова.',
      uz: 'Aloqa yo‘q. Ekran qayta ulanguncha kod yashirildi.',
    },
    disabled: {
      icon: <MonitorOff size={40} />,
      ru: 'Этот экран отключён. Откройте новую ссылку экрана со страницы «Сотрудники».',
      uz: 'Bu ekran o‘chirilgan. «Xodimlar» sahifasidan yangi ekran havolasini oching.',
    },
    'no-key': {
      icon: <MonitorOff size={40} />,
      ru: 'Откройте ссылку экрана, созданную на странице «Сотрудники».',
      uz: '«Xodimlar» sahifasida yaratilgan ekran havolasini oching.',
    },
    unavailable: {
      icon: <MonitorOff size={40} />,
      ru: 'Отметка ещё не настроена: примените миграцию 245.',
      uz: 'Belgilash hali sozlanmagan: 245-migratsiyani qo‘llang.',
    },
    'no-bot': {
      icon: <MonitorOff size={40} />,
      ru: 'Не настроен VITE_TELEGRAM_BOT_USERNAME.',
      uz: 'VITE_TELEGRAM_BOT_USERNAME sozlanmagan.',
    },
  }
  const state = states[status] || states.unavailable
  return (
    <div role="status" className="flex max-w-xl flex-col items-center gap-4 text-[#55524c]">
      {state.icon}
      <p className="text-2xl font-bold text-[#141414]">{state.ru}</p>
      <p className="text-xl font-semibold">{state.uz}</p>
    </div>
  )
}
