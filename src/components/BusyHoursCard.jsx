import React, { useEffect, useState } from 'react'
import { restaurantTodayStr } from '../lib/analytics'
import { formatMonthYear } from '../lib/dateFormat'
import { loadDashboardMonthlyBusyHours } from '../lib/monthlyBusyHours'

const labels = {
  en: { title: 'Monthly Busy Hours', sub: 'Paid orders in 2-hour periods · Tashkent time', peak: 'Busiest period', orders: 'orders', none: 'No paid orders this month', loading: 'Loading…', error: 'Could not load busy hours', retry: 'Retry' },
  uz: { title: 'Oylik gavjum soatlar', sub: 'To‘langan buyurtmalar 2 soatlik davrlarda · Toshkent vaqti', peak: 'Eng gavjum davr', orders: 'buyurtma', none: 'Bu oyda to‘langan buyurtmalar yo‘q', loading: 'Yuklanmoqda…', error: 'Gavjum soatlarni yuklab bo‘lmadi', retry: 'Qayta urinish' },
  ru: { title: 'Часы пик за месяц', sub: 'Оплаченные заказы по 2-часовым периодам · время Ташкента', peak: 'Самый загруженный период', orders: 'заказов', none: 'Нет оплаченных заказов за месяц', loading: 'Загрузка…', error: 'Не удалось загрузить часы пик', retry: 'Повторить' },
}
const hourLabel = hour => String(hour).padStart(2, '0') + ':00'
const rangeLabel = hour => `${hourLabel(hour)}–${hourLabel((hour + 2) % 24)}`

export default function BusyHoursCard({ lang }) {
  const l = labels[lang] || labels.en
  const monthStart = restaurantTodayStr().slice(0, 7) + '-01'
  const [hours, setHours] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setHours(null)
    setFailed(false)
    loadDashboardMonthlyBusyHours(monthStart, { signal: controller.signal })
      .then(rows => { if (!cancelled) setHours(rows) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; controller.abort() }
  }, [monthStart, retry])

  const safeHours = hours || []
  const max = Math.max(0, ...safeHours.map(row => row.count))
  const peaks = safeHours.filter(row => row.count === max && max > 0)

  return <section aria-busy={hours === null && !failed} className="ws-panel col-span-12 xl:col-span-4 min-w-0">
    <h3 className="ws-heading mb-1">{l.title} · {formatMonthYear(monthStart, lang)}</h3>
    <p className="ws-caption mb-4">{l.sub}</p>
    {failed ? <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-3">{l.error}<button type="button" className="ws-btn ws-btn-outline ws-btn-sm" onClick={() => setRetry(value => value + 1)}>{l.retry}</button></div>
      : hours === null ? <p role="status" className="ws-empty">{l.loading}</p>
      : max === 0 ? <p className="ws-empty">{l.none}</p>
      : <>
        <div className="mb-4 rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] p-3">
          <p className="ws-caption">{l.peak} · <span className="tabular-nums">{max}</span> {l.orders}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-[#22201d]">{peaks.map(row => rangeLabel(row.hour)).join(', ')}</p>
        </div>
        <div role="list" aria-label={l.title} className="grid grid-cols-4 gap-2">
          {safeHours.map(row => <div key={row.hour} role="listitem" tabIndex={0}
            aria-label={`${rangeLabel(row.hour)}: ${row.count} ${l.orders}`}
            className={`rounded-lg border px-1 py-2 text-center focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/40 ${row.count === max ? 'border-[#ff5a00]' : 'border-transparent'}`}
            style={{ backgroundColor: row.count > 0 ? `color-mix(in srgb, #ff5a00 ${Math.round(10 + row.count / max * 85)}%, #ffffff)` : '#efece9', color: row.count / max > 0.55 ? '#FFFFFF' : '#22201d' }}>
            <p className="text-[10px] font-medium tabular-nums">{rangeLabel(row.hour)}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{row.count}</p>
          </div>)}
        </div>
      </>}
  </section>
}
