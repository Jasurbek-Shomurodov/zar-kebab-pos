import React, { useEffect, useState } from 'react'
import { Check, Loader2, Plus, QrCode, X } from 'lucide-react'
import TimePicker24 from './TimePicker24'
import { supabase } from '../lib/supabase'
import { formatAttendanceQrWindow, normalizeWorkStartTime } from '../lib/attendance'
import { invalidateAttendanceQrAccess } from '../lib/attendanceQrAccess'

// Settings → which accounts get the drawer Check-in QR, and when (migration 247).
const L = {
  uz: {
    title: 'Kelish QR kodi',
    sub: 'Tanlangan akkauntlar menyuda «Kelish QR kodi» bo‘limini faqat belgilangan vaqtda ko‘radi (Toshkent vaqti). Boshlanish va tugash bir xil bo‘lsa — kun bo‘yi.',
    none: 'Hali hech kim tanlanmagan.',
    account: 'Akkaunt',
    chooseAccount: 'Akkauntni tanlang',
    from: 'Dan', to: 'Gacha', hour: 'Soat', minute: 'Daqiqa', done: 'Tayyor',
    add: 'Qo‘shish', save: 'Saqlash', remove: 'Olib tashlash', confirm: 'Tasdiqlash',
    loadFailed: 'Ro‘yxatni yuklab bo‘lmadi.', retry: 'Qayta urinish',
    unavailable: 'Avval 247-migratsiyani qo‘llang.',
  },
  ru: {
    title: 'QR для отметки',
    sub: 'Выбранные аккаунты видят пункт «QR для отметки» в меню только в заданное время (по Ташкенту). Одинаковое начало и конец — весь день.',
    none: 'Пока никто не выбран.',
    account: 'Аккаунт',
    chooseAccount: 'Выберите аккаунт',
    from: 'С', to: 'До', hour: 'Час', minute: 'Минута', done: 'Готово',
    add: 'Добавить', save: 'Сохранить', remove: 'Убрать', confirm: 'Подтвердить',
    loadFailed: 'Не удалось загрузить список.', retry: 'Повторить',
    unavailable: 'Сначала примените миграцию 247.',
  },
  en: {
    title: 'Check-in QR',
    sub: 'Selected accounts see “Check-in QR” in the menu only during their hours (Tashkent time). The same start and end means all day.',
    none: 'No accounts selected yet.',
    account: 'Account',
    chooseAccount: 'Choose an account',
    from: 'From', to: 'To', hour: 'Hour', minute: 'Minute', done: 'Done',
    add: 'Add', save: 'Save', remove: 'Remove', confirm: 'Confirm',
    loadFailed: 'Could not load the list.', retry: 'Retry',
    unavailable: 'Apply migration 247 first.',
  },
}

const DEFAULT_WINDOW = { start: '08:00', end: '11:00' }

function accountName(row) {
  return row.full_name || row.email || row.profile_id
}

export default function AttendanceQrAccessSettings({ lang, canManage }) {
  const l = L[lang] || L.en
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [drafts, setDrafts] = useState({})
  const [adding, setAdding] = useState({ profileId: '', ...DEFAULT_WINDOW })
  const [busy, setBusy] = useState('')
  const [confirmRemove, setConfirmRemove] = useState('')
  const [actionError, setActionError] = useState('')

  async function load() {
    setLoadError('')
    const { data, error } = await supabase.rpc('get_attendance_qr_access_settings')
    if (error) {
      setLoadError(['PGRST202', '42883'].includes(error.code) ? 'unavailable' : 'failed')
      setRows([])
      return
    }
    setRows(data || [])
    setDrafts({})
  }

  useEffect(() => { load() }, [])

  async function run(key, call) {
    setBusy(key)
    setActionError('')
    const { error } = await call()
    setBusy('')
    if (error) {
      setActionError(error.message)
      return false
    }
    invalidateAttendanceQrAccess()
    await load()
    return true
  }

  const selected = (rows || []).filter(row => row.selected)
  const available = (rows || []).filter(row => !row.selected)

  async function addAccount() {
    if (!adding.profileId) return
    const ok = await run('add', () => supabase.rpc('set_attendance_qr_access', {
      p_profile_id: adding.profileId, p_start_time: adding.start, p_end_time: adding.end,
    }))
    if (ok) setAdding({ profileId: '', ...DEFAULT_WINDOW })
  }

  async function saveRow(row) {
    const draft = drafts[row.profile_id]
    if (!draft) return
    await run(`save-${row.profile_id}`, () => supabase.rpc('set_attendance_qr_access', {
      p_profile_id: row.profile_id, p_start_time: draft.start, p_end_time: draft.end,
    }))
  }

  async function removeRow(row) {
    if (confirmRemove !== row.profile_id) {
      setConfirmRemove(row.profile_id)
      return
    }
    setConfirmRemove('')
    await run(`remove-${row.profile_id}`, () => supabase.rpc('remove_attendance_qr_access', { p_profile_id: row.profile_id }))
  }

  const picker = (value, label, onChange, disabled) => (
    <div className="w-[104px]">
      <TimePicker24 value={value} label={label} hourLabel={l.hour} minuteLabel={l.minute} doneLabel={l.done}
        className="ws-input !h-9 !py-0" disabled={disabled} onChange={onChange} />
    </div>
  )

  return (
    <section className="ws-panel ws-panel-flush">
      <div className="border-b border-[#e4e1de] px-5 py-4">
        <h2 className="ws-heading flex items-center gap-2"><QrCode size={16} />{l.title}</h2>
        <p className="ws-caption mt-1">{l.sub}</p>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        {rows === null ? (
          <Loader2 size={18} className="animate-spin text-[#68655f]" />
        ) : loadError ? (
          <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-2">
            <span>{loadError === 'unavailable' ? l.unavailable : l.loadFailed}</span>
            {loadError === 'failed' && <button type="button" onClick={load} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>}
          </div>
        ) : (
          <>
            {selected.length === 0 && <p className="ws-caption">{l.none}</p>}
            {selected.map(row => {
              const saved = { start: normalizeWorkStartTime(row.start_time), end: normalizeWorkStartTime(row.end_time) }
              const draft = drafts[row.profile_id] || saved
              const dirty = draft.start !== saved.start || draft.end !== saved.end
              const rowBusy = busy.endsWith(row.profile_id)
              const setDraft = patch => setDrafts(current => ({ ...current, [row.profile_id]: { ...draft, ...patch } }))
              return (
                <div key={row.profile_id} className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-[#e4e1de] px-3 py-2.5">
                  <div className="min-w-[160px] flex-1 self-center">
                    <p className="truncate text-sm font-semibold text-[#22201d]">{accountName(row)}</p>
                    <p className="ws-caption">{formatAttendanceQrWindow(draft.start, draft.end, lang)}</p>
                  </div>
                  {picker(draft.start, l.from, value => setDraft({ start: value }), !canManage || rowBusy)}
                  {picker(draft.end, l.to, value => setDraft({ end: value }), !canManage || rowBusy)}
                  {canManage && (
                    <div className="flex gap-1.5">
                      {dirty && (
                        <button type="button" onClick={() => saveRow(row)} disabled={rowBusy} className="ws-btn ws-btn-primary ws-btn-sm h-9">
                          {busy === `save-${row.profile_id}` ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{l.save}
                        </button>
                      )}
                      <button type="button" onClick={() => removeRow(row)} disabled={rowBusy}
                        className={`ws-btn ws-btn-sm h-9 ${confirmRemove === row.profile_id ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'}`}>
                        {busy === `remove-${row.profile_id}` ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                        {confirmRemove === row.profile_id ? l.confirm : l.remove}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {canManage && available.length > 0 && (
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-[#e4e1de] pt-3">
                <label className="min-w-[160px] flex-1">
                  <span className="mb-1.5 block text-xs font-bold text-[#596170]">{l.account}</span>
                  <select value={adding.profileId} onChange={event => setAdding(current => ({ ...current, profileId: event.target.value }))}
                    disabled={busy === 'add'} className="ws-input !h-9 w-full !py-0">
                    <option value="">{l.chooseAccount}</option>
                    {available.map(row => <option key={row.profile_id} value={row.profile_id}>{accountName(row)}</option>)}
                  </select>
                </label>
                {picker(adding.start, l.from, value => setAdding(current => ({ ...current, start: value })), busy === 'add')}
                {picker(adding.end, l.to, value => setAdding(current => ({ ...current, end: value })), busy === 'add')}
                <button type="button" onClick={addAccount} disabled={!adding.profileId || busy === 'add'} className="ws-btn ws-btn-outline ws-btn-sm h-9 disabled:opacity-50">
                  {busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{l.add}
                </button>
              </div>
            )}
            {actionError && <p role="alert" className="ws-notice ws-tone-negative">{actionError}</p>}
          </>
        )}
      </div>
    </section>
  )
}
