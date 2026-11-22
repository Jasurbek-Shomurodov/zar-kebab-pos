import React, { useMemo, useState } from 'react'
import { formatCurrency, formatPercent } from '../lib/formatCurrency'
import { getProductContributionSummary } from '../lib/dashboardAnalytics'

const labels = {
  en: { title: 'Product contribution', summaryScope: 'Totals of the listed top products, from item prices', top: 'Top products', revenue: 'Revenue', profit: 'Profit', margin: 'Margin', qty: 'Sold', sortBy: 'Sort products by', share: 'of sales', sold: 'sold', missingCost: 'Cost unavailable', partialCost: 'Some products have no cost', none: 'No sales data yet' },
  uz: { title: 'Mahsulot hissasi', summaryScope: 'Ro‘yxatdagi top mahsulotlar jami, taom narxlari bo‘yicha', top: 'Top mahsulotlar', revenue: 'Daromad', profit: 'Foyda', margin: 'Marja', qty: 'Soni', sortBy: 'Saralash', share: 'savdodan', sold: 'sotildi', missingCost: 'Tannarx mavjud emas', partialCost: 'Ayrim mahsulotlarda tannarx yo‘q', none: "Savdo ma’lumotlari yo‘q" },
  ru: { title: 'Вклад продуктов', summaryScope: 'Итоги по перечисленным топ-продуктам, по ценам блюд', top: 'Топ продуктов', revenue: 'Выручка', profit: 'Прибыль', margin: 'Маржа', qty: 'Кол-во', sortBy: 'Сортировка', share: 'продаж', sold: 'продано', missingCost: 'Себестоимость недоступна', partialCost: 'У части продуктов нет себестоимости', none: 'Нет данных о продажах' },
}

const SORTS = [
  { key: 'revenue', value: row => row.revenue },
  { key: 'profit', value: row => row.profit },
  { key: 'margin', value: row => row.marginPct },
  { key: 'qty', value: row => row.quantity },
]

function marginTone(pct) {
  if (pct === null) return 'bg-[#fdf3e3] text-[#9a5a00]'
  if (pct < 0) return 'bg-[#fdeaea] text-[#c4262c]'
  if (pct < 30) return 'bg-[#fdf3e3] text-[#9a5a00]'
  return 'bg-[#e8f5ee] text-[#1d7a52]'
}

function Thumb({ row }) {
  const [broken, setBroken] = useState(false)
  if (row.imageUrl && !broken) {
    return <img src={row.imageUrl} alt="" loading="lazy" onError={() => setBroken(true)} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
  }
  return <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#efece9] text-sm font-semibold text-[#68655f]">
    {String(row.name || '?').trim().charAt(0).toUpperCase()}
  </div>
}

export default function ProductContributionCard({ rows, lang, periodLabel }) {
  const l = labels[lang] || labels.en
  const [sortKey, setSortKey] = useState('revenue')
  const sort = SORTS.find(option => option.key === sortKey) || SORTS[0]

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = sort.value(a)
    const bv = sort.value(b)
    if (av === null && bv === null) return b.revenue - a.revenue
    if (av === null) return 1
    if (bv === null) return -1
    return bv - av || b.revenue - a.revenue
  }), [rows, sort])

  // The summary adds up the listed rows only (the top ten), and says so: it is not the day's revenue KPI.
  const summary = useMemo(() => getProductContributionSummary(rows), [rows])

  const leader = Math.max(0, ...sorted.map(row => Math.abs(sort.value(row) ?? 0)))

  return <section className="ws-panel col-span-12 xl:col-span-4 flex min-h-0 min-w-0 flex-col">
    <h3 className="ws-heading mb-3">{l.title} · {periodLabel}</h3>
    {rows.length === 0 ? <p className="ws-empty !py-6">{l.none}</p> : <>
      <div className="mb-3 rounded-[10px] bg-[#efece9] p-3">
        <p className="ws-caption mb-2">{l.summaryScope} · <span className="tabular-nums">{summary.count}</span></p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <div>
            <p className="ws-caption">{l.revenue}</p>
            <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(summary.revenue)}</p>
          </div>
          <div>
            <p className="ws-caption">{l.profit}</p>
            <p className={`mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums ${summary.profit === null ? 'text-[#9a5a00]' : summary.profit < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'}`}>
              {summary.profit === null ? '—' : formatCurrency(summary.profit)}
            </p>
          </div>
          <div>
            <p className="ws-caption">{l.margin}</p>
            <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums text-[#22201d]">{summary.marginPct === null ? '—' : formatPercent(summary.marginPct, lang)}</p>
          </div>
        </div>
        {summary.partial && <p className="mt-2 text-xs text-[#9a5a00]">{l.partialCost}</p>}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="ws-caption shrink-0">{l.top} · <span className="tabular-nums">{rows.length}</span></p>
        <div role="group" aria-label={l.sortBy} className="ws-segmented">
          {SORTS.map(option => <button key={option.key} type="button" aria-pressed={sortKey === option.key}
            onClick={() => setSortKey(option.key)}>
            {l[option.key]}
          </button>)}
        </div>
      </div>

      <ol className="max-h-[520px] min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {sorted.map((row, index) => {
          const metric = sort.value(row)
          const width = leader > 0 && metric !== null ? Math.max(2, Math.abs(metric) / leader * 100) : 0
          return <li key={row.menuItemId || row.name} className="rounded-[10px] px-2 py-2 transition-colors hover:bg-[#f6f5f3]">
            <div className="flex items-center gap-2.5">
              <span className={`w-5 shrink-0 text-center text-xs font-semibold tabular-nums ${index < 3 ? 'text-[#bf4300]' : 'text-[#68655f]'}`}>{index + 1}</span>
              <Thumb row={row} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-[#22201d]" title={row.name}>{row.name}</p>
                  <p className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.revenue)}</p>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs tabular-nums text-[#68655f]">
                  <p className="min-w-0">{row.quantity} {l.sold} · {formatPercent(row.revenueSharePct, lang)} {l.share}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {row.profit !== null && <span className={`whitespace-nowrap ${row.profit < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'}`}>{row.profit > 0 ? '+' : ''}{formatCurrency(row.profit)}</span>}
                    <span title={row.marginPct === null ? l.missingCost : undefined}
                      className={`rounded-full px-1.5 py-px text-xs font-semibold ${marginTone(row.marginPct)}`}>
                      {row.marginPct === null ? l.missingCost : formatPercent(row.marginPct, lang)}
                    </span>
                  </div>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#efece9]">
                  <div className={`h-full rounded-full ${metric !== null && metric < 0 ? 'bg-[#c4262c]' : 'bg-[#ff5a00]'}`} style={{ width: `${width}%` }} />
                </div>
              </div>
            </div>
          </li>
        })}
      </ol>
    </>}
  </section>
}
