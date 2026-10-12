import React from 'react'
import { formatCurrency } from '../lib/formatCurrency'

const labels = {
  en: { title: 'Product Contribution', revenue: 'Revenue', profit: 'Profit', share: 'share', sold: 'sold', margin: 'margin', missingCost: 'Cost unavailable', none: 'No sales data yet' },
  uz: { title: 'Mahsulot hissasi', revenue: 'Daromad', profit: 'Foyda', share: 'ulush', sold: 'sotildi', margin: 'marja', missingCost: 'Tannarx mavjud emas', none: "Savdo ma’lumotlari yo‘q" },
  ru: { title: 'Вклад продуктов', revenue: 'Выручка', profit: 'Прибыль', share: 'доля', sold: 'продано', margin: 'маржа', missingCost: 'Себестоимость недоступна', none: 'Нет данных о продажах' },
}

export default function ProductContributionCard({ rows, lang, periodLabel, loading, LoadingView }) {
  const l = labels[lang] || labels.en
  return <section aria-busy={loading} className="ws-panel col-span-12 xl:col-span-4 min-w-0">
    <h3 className="ws-heading mb-4">{l.title} · {periodLabel}</h3>
    {loading ? <LoadingView /> : rows.length === 0 ? <p className="ws-empty !py-6">{l.none}</p> :
      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {rows.map((row, index) => <div key={row.menuItemId || row.name} className="rounded-[10px] border border-[#e4e1de] p-2.5">
          <div className="flex items-center gap-2.5">
            <span className="w-5 text-center text-xs font-medium tabular-nums text-[#68655f]">{index + 1}</span>
            {row.imageUrl ? <img src={row.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div className="h-9 w-9 rounded-lg bg-[#efece9]" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#22201d]">{row.name}</p>
              <p className="text-[11px] tabular-nums text-[#68655f]">{row.quantity} {l.sold} · {row.revenueSharePct}% {l.share}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#e4e1de] pt-2 text-xs">
            <div><p className="text-[#68655f]">{l.revenue}</p><p className="font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.revenue)}</p></div>
            <div><p className="text-[#68655f]">{l.profit}</p>{row.profit === null
              ? <p className="font-semibold text-[#9a5a00]" title={l.missingCost}>—</p>
              : <p className={`font-semibold tabular-nums ${row.profit < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'}`}>{formatCurrency(row.profit)} · {row.marginPct}% {l.margin}</p>}</div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efece9]"><div className="h-full rounded-full bg-[#ff5a00]" style={{ width: `${row.revenueSharePct}%` }} /></div>
        </div>)}
      </div>}
  </section>
}
