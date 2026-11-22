import React, { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadSalaryRows } from '../lib/salaryData'
import { buildSalaryRateHistory } from '../lib/salaryRateHistory'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate, formatTime } from '../lib/dateFormat'
import { Shimmer } from './PageShimmer'

const LABELS = {
  en: { title: 'Salary changes', addedBy: 'Added by', changedBy: 'Changed by', deletedBy: 'Deleted by', insert: 'Rate added', update: 'Rate changed', delete: 'Rate deleted', effective: 'Effective from', daily: 'day', monthly: 'month', before: 'Before', after: 'After', unknown: 'Author unavailable', legacy: 'Saved rate · earlier edits were not audited', empty: 'No salary rate changes.', error: 'Could not load the complete change history.', retry: 'Retry', more: 'Show more', loading: 'Loading changes' },
  ru: { title: 'Изменения зарплаты', addedBy: 'Добавил(а)', changedBy: 'Изменил(а)', deletedBy: 'Удалил(а)', insert: 'Ставка добавлена', update: 'Ставка изменена', delete: 'Ставка удалена', effective: 'Действует с', daily: 'день', monthly: 'месяц', before: 'До', after: 'После', unknown: 'Автор неизвестен', legacy: 'Сохранённая ставка · прежние правки не отслеживались', empty: 'Изменений ставки нет.', error: 'Не удалось загрузить полную историю изменений.', retry: 'Повторить', more: 'Показать ещё', loading: 'Загрузка изменений' },
  uz: { title: 'Maosh o‘zgarishlari', addedBy: 'Qo‘shgan', changedBy: 'O‘zgartirgan', deletedBy: 'O‘chirgan', insert: 'Stavka qo‘shildi', update: 'Stavka o‘zgartirildi', delete: 'Stavka o‘chirildi', effective: 'Amal qilish sanasi', daily: 'kun', monthly: 'oy', before: 'Oldin', after: 'Keyin', unknown: 'Muallif noma’lum', legacy: 'Saqlangan stavka · oldingi tahrirlar kuzatilmagan', empty: 'Maosh stavkasi o‘zgarishlari yo‘q.', error: 'To‘liq o‘zgarishlar tarixini yuklab bo‘lmadi.', retry: 'Qayta urinish', more: 'Yana ko‘rsatish', loading: 'O‘zgarishlar yuklanmoqda' },
}

export default function SalaryRateHistory({ employeeId, rates, lang, canDelete, onDelete, onCancelDelete, confirmActionKey, saving, actionLabels, actionError }) {
  const l = LABELS[lang] || LABELS.en
  const [entries, setEntries] = useState([])
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [limit, setLimit] = useState(10)
  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    setEntries([])
    setLimit(10)
    async function load() {
      try {
        const audit = await loadSalaryRows(() => supabase.from('accounting_record_audit')
          .select('id,entity_id,action,old_record,new_record,changed_by,changed_by_name,changed_at')
          .eq('entity_type', 'salary_rate')
          .or(`old_record->>salary_profile_id.eq.${employeeId},new_record->>salary_profile_id.eq.${employeeId}`))
        const actorIds = [...new Set([
          ...rates.map(rate => rate.created_by),
          ...(audit.data || []).flatMap(row => [row.changed_by, row.old_record?.created_by, row.new_record?.created_by]),
        ].filter(Boolean))]
        const actors = actorIds.length
          ? await loadSalaryRows(() => supabase.from('profiles').select('id,full_name').in('id', actorIds))
          : { data: [], error: null }
        if (!active) return
        setEntries(buildSalaryRateHistory(rates, audit.data || [], actors.data || []))
        setFailed(Boolean(audit.error || actors.error))
      } catch {
        if (active) { setEntries(buildSalaryRateHistory(rates)); setFailed(true) }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [employeeId, rates, retry])

  function snapshot(rate, label, deleted) {
    if (!rate) return null
    return <div className={`mt-1 text-[13px] leading-snug ${deleted ? 'text-[#68655f] line-through' : 'text-[#22201d]'}`}>
      <p className="font-semibold">{label && <span className="mr-1 font-normal">{label}:</span>}<span className="whitespace-nowrap tabular-nums">{formatCurrency(rate.amount ?? rate.daily_amount)}</span> / {rate.rate_unit === 'monthly' ? l.monthly : l.daily}</p>
      <p className="mt-0.5 text-xs">{l.effective}: {formatLongDate(rate.effective_from, lang, '—')}</p>
      {rate.note && <p className="mt-0.5 break-words text-xs">{rate.note}</p>}
    </div>
  }

  return <aside aria-labelledby="salary-rate-history-heading" className="ws-panel min-w-0">
    <h3 id="salary-rate-history-heading" className="ws-heading">{l.title}</h3>
    {actionError && <div role="alert" className="ws-notice ws-tone-negative mt-3">{actionError}</div>}
    {failed && <div role="alert" className="ws-notice ws-tone-negative mt-3 flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 flex-1">{l.error}</span>
      <button type="button" onClick={() => setRetry(value => value + 1)} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>
    </div>}
    {loading ? <div role="status" aria-busy="true" className="mt-4 space-y-4">
      <span className="sr-only">{l.loading}</span>
      {Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-2">
        <Shimmer className="h-4 w-32 rounded-md" />
        <Shimmer className="h-3 w-44 max-w-full rounded-md" />
        <Shimmer className="h-4 w-40 max-w-full rounded-md" />
      </div>)}
    </div> : <>
      {!entries.length && !failed && <p className="ws-caption mt-4">{l.empty}</p>}
      <ol className="mt-3">
        {entries.slice(0, limit).map(entry => {
          const deleting = saving === `rate-history-delete-${entry.rateId}`
          const confirming = confirmActionKey === `rate-history-delete-${entry.rateId}`
          return <li key={entry.id} className="border-b border-[#e4e1de] py-3 first:pt-0 last:border-b-0 last:pb-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${entry.deleted ? 'text-[#68655f] line-through' : 'text-[#22201d]'}`}>{l[entry.action]}</p>
                <p className="ws-caption mt-0.5 break-words !text-xs">
                  <time dateTime={entry.recordedAt || undefined}>{formatLongDate(entry.recordedAt, lang, '—')}{formatTime(entry.recordedAt) && `, ${formatTime(entry.recordedAt)}`}</time>
                </p>
                <p className="ws-caption mt-0.5 break-words !text-xs">
                  {entry.action === 'delete' ? l.deletedBy : entry.action === 'update' ? l.changedBy : l.addedBy}: {entry.actor || l.unknown}
                </p>
                {entry.action !== 'insert' && <p className="ws-caption mt-0.5 break-words !text-xs">
                  {l.addedBy}: {entry.addedBy || l.unknown}
                  {entry.addedAt && <> · <time dateTime={entry.addedAt}>{formatLongDate(entry.addedAt, lang, '—')}, {formatTime(entry.addedAt)}</time></>}
                </p>}
                {snapshot(entry.before, entry.after ? l.before : '', entry.deleted)}
                {snapshot(entry.after, entry.before ? l.after : '', entry.deleted)}
              </div>
              {canDelete && entry.canDelete && <div className="flex shrink-0 flex-col items-end gap-2">
                <button type="button" disabled={Boolean(saving)}
                  aria-label={confirming ? actionLabels.confirm : `${actionLabels.delete}: ${l[entry.action]}`}
                  title={confirming ? actionLabels.confirm : actionLabels.delete}
                  onClick={() => onDelete({ id: entry.rateId, entryType: 'rate' })}
                  className={`ws-btn ws-btn-sm ${confirming ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger ws-btn-icon'}`}>
                  {deleting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                  {confirming && actionLabels.confirm}
                </button>
                {confirming && <button type="button" disabled={Boolean(saving)} onClick={onCancelDelete}
                  className="ws-btn ws-btn-outline ws-btn-sm">{actionLabels.cancel}</button>}
              </div>}
            </div>
          </li>
        })}
      </ol>
      {entries.slice(0, limit).some(entry => !entry.audited) && <p className="ws-caption mt-3 !text-xs">{l.legacy}</p>}
      {entries.length > limit && <button type="button" onClick={() => setLimit(value => value + 10)} className="ws-btn ws-btn-outline ws-btn-sm mt-4">{l.more}</button>}
    </>}
  </aside>
}
