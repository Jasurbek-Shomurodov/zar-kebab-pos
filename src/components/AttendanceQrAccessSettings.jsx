import React, { useEffect, useState } from 'react'
import { ChevronRight, Loader2, Power, QrCode } from 'lucide-react'
import WorkspaceDialog from './WorkspaceDialog'
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
    save: 'Saqlash', saving: 'Saqlanmoqda…', close: 'Yopish', turnOff: 'O‘chirish', confirm: 'QR kodni o‘chirish', saveFailed: 'Saqlab bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.', allDayHint: 'Boshlanish va tugash bir xil bo‘lsa — kun bo‘yi. Tugash boshlanishdan oldin bo‘lsa — yarim tundan o‘tadi.', turnOffHint: 'Bu akkaunt menyuda QR kodni ko‘rmaydi.',
    loadFailed: 'Ro‘yxatni yuklab bo‘lmadi.', retry: 'Qayta urinish',
    unavailable: 'Avval 247-migratsiyani qo‘llang.',
  },
  ru: {
    title: 'QR для отметки',
    sub: 'Выбранные аккаунты видят пункт «QR для отметки» в меню только в заданное время (по Ташкенту). Одинаковое начало и конец — весь день.',
    account: 'Аккаунт', role: 'Роль', email: 'Email', hours: 'Время', notShown: 'Не показывается', cancel: 'Отмена',
    from: 'С', to: 'До', hour: 'Час', minute: 'Минута', done: 'Готово',
    save: 'Сохранить', saving: 'Сохранение…', close: 'Закрыть', turnOff: 'Отключить', confirm: 'Отключить QR', saveFailed: 'Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.', allDayHint: 'Одинаковое начало и конец — весь день. Если конец раньше начала, время переходит через полночь.', turnOffHint: 'Этот аккаунт перестанет видеть QR в меню.',
    loadFailed: 'Не удалось загрузить список.', retry: 'Повторить',
    unavailable: 'Сначала примените миграцию 247.',
  },
  en: {
    title: 'Check-in QR',
    sub: 'Selected accounts see “Check-in QR” in the menu only during their hours (Tashkent time). The same start and end means all day.',
    account: 'Account', role: 'Role', email: 'Email', hours: 'Hours', notShown: 'Not shown', cancel: 'Cancel',
    from: 'From', to: 'To', hour: 'Hour', minute: 'Minute', done: 'Done',
    save: 'Save', saving: 'Saving…', close: 'Close', turnOff: 'Turn off', confirm: 'Turn off the QR', saveFailed: 'Could not save. Check the connection and try again.', allDayHint: 'The same start and end means all day. An end before the start runs past midnight.', turnOffHint: 'This account will no longer see the QR in the menu.',
    loadFailed: 'Could not load the list.', retry: 'Try again',
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
      console.error('[checkin-qr] access list failed:', error)
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
      // Worded from the label object at render; the backend text stays in the console.
      console.error('[checkin-qr] access change failed:', error)
      setDialogError('saveFailed')
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
        <h2 className="ws-heading flex items-center gap-2"><QrCode size={16} aria-hidden="true" />{l.title}</h2>
        <p className="ws-caption mt-1">{l.sub}</p>
      </div>
      {rows === null ? (
        <div role="status" aria-busy="true">
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
                        : <span className="text-[#68655f]">{l.notShown}</span>}
                      {canManage && <ChevronRight size={16} aria-hidden="true" className="flex-shrink-0 text-[#68655f]" />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <WorkspaceDialog
          title={accountName(editing.row)}
          description={[roleLabel(editing.row, lang), editing.row.email].filter(Boolean).join(' · ')}
          onClose={closeDialog}
          closeLabel={l.close}
          size="md"
          busy={Boolean(busy)}
          notice={(confirmOff || dialogError) ? (
            <div className="grid gap-2">
              {confirmOff && <p role="alert" className="ws-notice ws-tone-caution">{l.turnOffHint}</p>}
              {dialogError && <p role="alert" className="ws-notice ws-tone-negative">{l[dialogError]}</p>}
            </div>
          ) : null}
          footer={(
            <>
              {saved && (
                <button type="button" onClick={turnOff} disabled={Boolean(busy)}
                  className={`ws-btn mr-auto ${confirmOff ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'}`}>
                  {busy === 'off' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Power size={16} aria-hidden="true" />}
                  {confirmOff ? l.confirm : l.turnOff}
                </button>
              )}
              <button type="button" onClick={closeDialog} disabled={Boolean(busy)} className="ws-btn ws-btn-outline">{l.cancel}</button>
              <button type="button" onClick={save} disabled={Boolean(busy) || unchanged} className="ws-btn ws-btn-primary">
                {busy === 'save' && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {busy === 'save' ? l.saving : l.save}
              </button>
            </>
          )}
        >
          <div className="grid grid-cols-2 gap-3">
            <TimePicker24 value={editing.start} label={l.from} hourLabel={l.hour} minuteLabel={l.minute} doneLabel={l.done}
              className="ws-input" disabled={Boolean(busy)} onChange={value => setEditing(current => ({ ...current, start: value }))} />
            <TimePicker24 value={editing.end} label={l.to} hourLabel={l.hour} minuteLabel={l.minute} doneLabel={l.done}
              className="ws-input" disabled={Boolean(busy)} onChange={value => setEditing(current => ({ ...current, end: value }))} />
          </div>
          <p className="ws-caption mt-2">
            <span className="tabular-nums">{formatAttendanceQrWindow(editing.start, editing.end, lang)}</span> · {l.allDayHint}
          </p>
        </WorkspaceDialog>
      )}
    </section>
  )
}
