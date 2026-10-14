import React, { useEffect, useState } from 'react'
import { ChevronRight, Loader2, Power, QrCode, X } from 'lucide-react'
import TimePicker24 from './TimePicker24'
import { supabase } from '../lib/supabase'
import { formatAttendanceQrWindow, normalizeWorkStartTime } from '../lib/attendance'
import { invalidateAttendanceQrAccess } from '../lib/attendanceQrAccess'
import { Shimmer } from './PageShimmer'
import { normalizeRole } from '../lib/permissions'

// Settings → which accounts get the drawer Check-in QR, and when (migration 247).
const L = {
  uz: {
    title: 'Kelish QR kodi',
    sub: 'Tanlangan akkauntlar menyuda «Kelish QR kodi» bo‘limini faqat belgilangan vaqtda ko‘radi (Toshkent vaqti). Boshlanish va tugash bir xil bo‘lsa — kun bo‘yi.',
    account: 'Akkaunt', role: 'Rol', email: 'Email', hours: 'Vaqt', notShown: 'Ko‘rsatilmaydi', cancel: 'Bekor qilish',
    from: 'Dan', to: 'Gacha', hour: 'Soat', minute: 'Daqiqa', done: 'Tayyor',
    save: 'Saqlash', turnOff: 'O‘chirish', confirm: 'Tasdiqlash', allDayHint: 'Boshlanish va tugash bir xil bo‘lsa — kun bo‘yi. Tugash boshlanishdan oldin bo‘lsa — yarim tundan o‘tadi.', turnOffHint: 'Bu akkaunt menyuda QR kodni ko‘rmaydi.',
    loadFailed: 'Ro‘yxatni yuklab bo‘lmadi.', retry: 'Qayta urinish',
    unavailable: 'Avval 247-migratsiyani qo‘llang.',
  },
  ru: {
    title: 'QR для отметки',
    sub: 'Выбранные аккаунты видят пункт «QR для отметки» в меню только в заданное время (по Ташкенту). Одинаковое начало и конец — весь день.',
    account: 'Аккаунт', role: 'Роль', email: 'Email', hours: 'Время', notShown: 'Не показывается', cancel: 'Отмена',
    from: 'С', to: 'До', hour: 'Час', minute: 'Минута', done: 'Готово',
    save: 'Сохранить', turnOff: 'Отключить', confirm: 'Подтвердить', allDayHint: 'Одинаковое начало и конец — весь день. Если конец раньше начала, время переходит через полночь.', turnOffHint: 'Этот аккаунт перестанет видеть QR в меню.',
    loadFailed: 'Не удалось загрузить список.', retry: 'Повторить',
    unavailable: 'Сначала примените миграцию 247.',
  },
  en: {
    title: 'Check-in QR',
    sub: 'Selected accounts see “Check-in QR” in the menu only during their hours (Tashkent time). The same start and end means all day.',
    account: 'Account', role: 'Role', email: 'Email', hours: 'Hours', notShown: 'Not shown', cancel: 'Cancel',
    from: 'From', to: 'To', hour: 'Hour', minute: 'Minute', done: 'Done',
    save: 'Save', turnOff: 'Turn off', confirm: 'Confirm', allDayHint: 'The same start and end means all day. An end before the start runs past midnight.', turnOffHint: 'This account will no longer see the QR in the menu.',
    loadFailed: 'Could not load the list.', retry: 'Retry',
    unavailable: 'Apply migration 247 first.',
  },
}

const DEFAULT_WINDOW = { start: '08:00', end: '11:00' }

// Same account-role labels as Team (owner/admin/viewer/guest).
const ROLE_LABELS = {
  owner:  { uz: 'Egasi',     ru: 'Владелец', en: 'Owner' },
  admin:  { uz: 'Admin',     ru: 'Админ',    en: 'Admin' },
  viewer: { uz: 'Ko‘ruvchi', ru: 'Просмотр', en: 'Viewer' },
  guest:  { uz: 'Mehmon',    ru: 'Гость',    en: 'Guest' },
}

function accountName(row) {
  return row.full_name || row.email || row.profile_id
}

function roleLabel(row, lang) {
  const labels = ROLE_LABELS[normalizeRole(row.role)]
  return labels ? labels[lang] || labels.en : row.role || ''
}

function savedWindow(row) {
  return row.selected
    ? { start: normalizeWorkStartTime(row.start_time), end: normalizeWorkStartTime(row.end_time) }
    : null
}

export default function AttendanceQrAccessSettings({ lang, canManage }) {
  const l = L[lang] || L.en
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  // Tapping a row opens this dialog: { row, start, end }.
  const [editing, setEditing] = useState(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const [busy, setBusy] = useState('')
  const [dialogError, setDialogError] = useState('')

  async function load() {
    setLoadError('')
    const { data, error } = await supabase.rpc('get_attendance_qr_access_settings')
    if (error) {
      setLoadError(['PGRST202', '42883'].includes(error.code) ? 'unavailable' : 'failed')
      setRows([])
      return
    }
    setRows(data || [])
  }

  useEffect(() => { load() }, [])

  function openRow(row) {
    if (!canManage) return
    setEditing({ row, ...(savedWindow(row) || DEFAULT_WINDOW) })
    setConfirmOff(false)
    setDialogError('')
  }

  function closeDialog() {
    if (busy) return
    setEditing(null)
    setConfirmOff(false)
  }

  async function run(key, call) {
    setBusy(key)
    setDialogError('')
    const { error } = await call()
    setBusy('')
    if (error) {
      setDialogError(error.message)
      return
    }
    invalidateAttendanceQrAccess()
    setEditing(null)
    setConfirmOff(false)
    await load()
  }

  function save() {
    run('save', () => supabase.rpc('set_attendance_qr_access', {
      p_profile_id: editing.row.profile_id, p_start_time: editing.start, p_end_time: editing.end,
    }))
  }

  function turnOff() {
    if (!confirmOff) {
      setConfirmOff(true)
      return
    }
    run('off', () => supabase.rpc('remove_attendance_qr_access', { p_profile_id: editing.row.profile_id }))
  }

  const saved = editing ? savedWindow(editing.row) : null
  const unchanged = Boolean(saved) && saved.start === editing.start && saved.end === editing.end

  return (
    <section className="ws-panel ws-panel-flush">
      <div className="border-b border-[#e4e1de] px-5 py-4">
        <h2 className="ws-heading flex items-center gap-2"><QrCode size={16} />{l.title}</h2>
        <p className="ws-caption mt-1">{l.sub}</p>
      </div>
      {rows === null ? (
        <div aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-6 border-b border-[#e4e1de]/70 px-4 py-3.5 last:border-0 sm:px-5">
              <Shimmer className={`h-3.5 ${index % 2 ? 'w-28' : 'w-36'}`} />
              <Shimmer className="h-3 w-12" />
              <Shimmer className={`h-3 ${index % 3 ? 'w-40' : 'w-52'}`} />
              <Shimmer className="ml-auto h-3 w-24" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="px-4 py-4 sm:px-5">
          <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-2">
            <span>{loadError === 'unavailable' ? l.unavailable : l.loadFailed}</span>
            {loadError === 'failed' && <button type="button" onClick={load} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e4e1de] text-xs text-[#68655f]">
                <th scope="col" className="py-2.5 pl-4 pr-3 font-semibold sm:pl-5">{l.account}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{l.role}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{l.email}</th>
                <th scope="col" className="py-2.5 pl-3 pr-4 font-semibold sm:pr-5">{l.hours}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.profile_id}
                  {...(canManage ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-haspopup': 'dialog',
                    onClick: () => openRow(row),
                    onKeyDown: event => {
                      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRow(row) }
                    },
                  } : {})}
                  className={`border-b border-[#e4e1de]/70 last:border-0 ${canManage ? 'cursor-pointer transition-colors hover:bg-[#f6f5f3] focus-visible:bg-[#f6f5f3] focus-visible:outline-none' : ''}`}>
                  <td className="max-w-[260px] truncate py-3 pl-4 pr-3 font-semibold text-[#22201d] sm:pl-5">{accountName(row)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-[#68655f]">{roleLabel(row, lang)}</td>
                  <td className="max-w-[320px] truncate px-3 py-3 text-[#68655f]">{row.email}</td>
                  <td className="py-3 pl-3 pr-4 sm:pr-5">
                    <span className="flex items-center justify-between gap-3">
                      {row.selected
                        ? <span className="ws-status ws-tone-positive tabular-nums">{formatAttendanceQrWindow(row.start_time, row.end_time, lang)}</span>
                        : <span className="text-[#9b978f]">{l.notShown}</span>}
                      {canManage && <ChevronRight size={16} aria-hidden="true" className="flex-shrink-0 text-[#9b978f]" />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <button type="button" aria-label={l.cancel} onClick={closeDialog}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm" />
          <div role="dialog" aria-modal="true" aria-labelledby="checkin-qr-access-title"
            onKeyDown={event => { if (event.key === 'Escape') closeDialog() }}
            className="ws-dialog relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="checkin-qr-access-title" className="ws-display truncate !text-[22px]">{accountName(editing.row)}</h2>
                <p className="ws-caption mt-1 truncate">{[roleLabel(editing.row, lang), editing.row.email].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" onClick={closeDialog} disabled={Boolean(busy)} aria-label={l.cancel} autoFocus
                className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"><X size={16} /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TimePicker24 value={editing.start} label={l.from} hourLabel={l.hour} minuteLabel={l.minute} doneLabel={l.done}
                className="ws-input" disabled={Boolean(busy)} onChange={value => setEditing(current => ({ ...current, start: value }))} />
              <TimePicker24 value={editing.end} label={l.to} hourLabel={l.hour} minuteLabel={l.minute} doneLabel={l.done}
                className="ws-input" disabled={Boolean(busy)} onChange={value => setEditing(current => ({ ...current, end: value }))} />
            </div>
            <p className="ws-caption mt-2">
              {formatAttendanceQrWindow(editing.start, editing.end, lang)} · {l.allDayHint}
            </p>

            {confirmOff && <p role="alert" className="ws-notice ws-tone-caution mt-4 text-[13px]">{l.turnOffHint}</p>}
            {dialogError && <p role="alert" className="ws-notice ws-tone-negative mt-4">{dialogError}</p>}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {saved && (
                <button type="button" onClick={turnOff} disabled={Boolean(busy)}
                  className={`ws-btn ${confirmOff ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'}`}>
                  {busy === 'off' ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                  {confirmOff ? l.confirm : l.turnOff}
                </button>
              )}
              <button type="button" onClick={closeDialog} disabled={Boolean(busy)} className="ws-btn ws-btn-outline ml-auto">{l.cancel}</button>
              <button type="button" onClick={save} disabled={Boolean(busy) || unchanged} className="ws-btn ws-btn-primary disabled:opacity-50">
                {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : null}{l.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
