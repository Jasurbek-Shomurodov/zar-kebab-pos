import React, { useEffect, useState } from 'react'
import { loadBreakEvenTargetHistory } from '../lib/breakEvenTarget'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate, formatLongDateTime } from '../lib/dateFormat'
import WorkspaceDialog from './WorkspaceDialog'

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

  // Newest first, each with its change from the target before it.
  const rows = (history || [])
    .map((row, index, all) => ({ ...row, change: index > 0 ? row.amount - all[index - 1].amount : null, isCurrent: index === all.length - 1 }))
    .reverse()

  return (
    <WorkspaceDialog title={l.title} description={l.sub} onClose={onClose} closeLabel={l.close} variant="sheet" size="lg">
      <div aria-busy={!history && !failed}>
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
              <li key={row.effectiveFrom} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-4 py-3 ${row.isCurrent ? 'bg-[#fff1e8]' : 'bg-[#f6f5f3]'}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#22201d]">
                    {l.from} {formatLongDate(row.effectiveFrom, lang, row.effectiveFrom)}
                    {row.isCurrent && <span className="ws-badge ws-tone-accent ml-2">{l.current}</span>}
                  </p>
                  <p className="ws-caption mt-0.5">
                    {row.change == null ? l.start : <>{l.change}: <span className="whitespace-nowrap tabular-nums">{row.change > 0 ? '+' : row.change < 0 ? '−' : ''}{formatCurrency(Math.abs(row.change))}</span></>}
                    {row.changedAt && ` · ${l.saved} ${formatLongDateTime(row.changedAt, lang, '')}`}
                  </p>
                </div>
                <p className="flex-shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.amount)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </WorkspaceDialog>
  )
}
