import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { loadBreakEvenTargetHistory } from '../lib/breakEvenTarget'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate, formatLongDateTime } from '../lib/dateFormat'

const labels = {
  uz: { title: 'Kunlik maqsad tarixi', sub: 'Har kunning hisoblangan maqsadi o‘sha kunga tegishli; grafik ustunlari o‘z kunlarining o‘rtachasini oladi.', from: 'Amal qiladi', amount: 'Kunlik maqsad', change: 'O‘zgarish', start: 'Boshlang‘ich', current: 'Joriy', saved: 'Saqlandi', empty: 'Hali tarix yo‘q', failed: 'Tarixni yuklab bo‘lmadi', retry: 'Qayta urinish', close: 'Yopish' },
  ru: { title: 'История дневной цели', sub: 'Рассчитанная цель каждого дня относится к этому дню; столбцы графиков берут среднее по своим дням.', from: 'Действует с', amount: 'Дневная цель', change: 'Изменение', start: 'Начальная', current: 'Текущая', saved: 'Сохранено', empty: 'История пока пуста', failed: 'Не удалось загрузить историю', retry: 'Повторить', close: 'Закрыть' },
  en: { title: 'Daily target history', sub: 'Each day’s calculated target belongs to that day; chart bars use the average of their days.', from: 'Applies from', amount: 'Daily target', change: 'Change', start: 'Starting', current: 'Current', saved: 'Saved', empty: 'No history yet', failed: 'Could not load the history', retry: 'Retry', close: 'Close' },
}

function HistoryShimmer() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      {[0, 1, 2].map(index => (
        <div key={index} className="flex items-center justify-between rounded-xl bg-[#f6f5f3] px-4 py-3">
          <div className="space-y-1.5">
            <div className="h-3.5 w-28 rounded bg-[#e4e1de]" />
            <div className="h-3 w-40 rounded bg-[#efece9]" />
          </div>
          <div className="h-4 w-24 rounded bg-[#e4e1de]" />
        </div>
      ))}
    </div>
  )
}

export default function BreakEvenTargetHistoryDialog({ lang, onClose }) {
  const l = labels[lang] || labels.en
  const [history, setHistory] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setFailed(false)
    setHistory(null)
    loadBreakEvenTargetHistory({ signal: controller.signal })
      .then(setHistory)
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Newest first, each with its change from the target before it.
  const rows = (history || [])
    .map((row, index, all) => ({ ...row, change: index > 0 ? row.amount - all[index - 1].amount : null, isCurrent: index === all.length - 1 }))
    .reverse()

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#22201d]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="break-even-history-title" className="ws-dialog max-h-[92vh] w-full overflow-y-auto !rounded-b-none sm:max-w-lg sm:!rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e4e1de] bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="break-even-history-title" className="ws-heading">{l.title}</h2>
            <p className="ws-caption mt-1">{l.sub}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={l.close} className="ws-btn ws-btn-ghost !h-10 !w-10 !px-0">
            <X size={19} />
          </button>
        </div>
        <div className="px-5 py-5 sm:px-6" aria-busy={!history && !failed}>
          {failed ? (
            <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-3">
              <span>{l.failed}</span>
              <button type="button" onClick={() => setRetry(value => value + 1)} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>
            </div>
          ) : !history ? (
            <HistoryShimmer />
          ) : rows.length === 0 ? (
            <p className="ws-empty">{l.empty}</p>
          ) : (
            <ol className="space-y-2">
              {rows.map(row => (
                <li key={row.effectiveFrom} className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${row.isCurrent ? 'bg-[#fff1e8]' : 'bg-[#f6f5f3]'}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#22201d]">
                      {l.from} {formatLongDate(row.effectiveFrom, lang, row.effectiveFrom)}
                      {row.isCurrent && <span className="ml-2 rounded bg-[#ff5a00] px-1.5 py-0.5 text-[10px] font-semibold text-white">{l.current}</span>}
                    </p>
                    <p className="ws-caption mt-0.5">
                      {row.change == null ? l.start : `${l.change}: ${row.change > 0 ? '+' : row.change < 0 ? '−' : ''}${formatCurrency(Math.abs(row.change))}`}
                      {row.changedAt && ` · ${l.saved} ${formatLongDateTime(row.changedAt, lang, '')}`}
                    </p>
                  </div>
                  <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.amount)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}
