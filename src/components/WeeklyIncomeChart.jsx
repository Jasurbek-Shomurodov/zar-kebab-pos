import CalendarPicker from './CalendarPicker'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import BreakEvenLine from './BreakEvenLine'
import { buildIncomeMonthOptions, incomeMonthColors, hideZeroIncomeMonths, loadDashboardWeeklyIncome, loadFirstOrderMonth } from '../lib/weeklyIncome'
import { loadEarliestOrderDate } from '../lib/db'
import { restaurantTodayStr, toRestaurantDateStr } from '../lib/analytics'
import { formatCurrency } from '../lib/formatCurrency'
import { formatMonthYear } from '../lib/dateFormat'

const labels = {
  en: { title: 'Average daily income by 10-day period', sub: 'Latest 20 periods · zero-income months hidden · 1–10 · 11–20 · 21–month end · completed days only, including days without sales', empty: 'No income in this range', month: 'Through month', retry: 'Retry', error: 'Could not load income by period', loading: 'Loading…', days: 'days', total: 'Total', target: 'Daily target' },
  uz: { title: 'Dekadalar bo‘yicha o‘rtacha kunlik daromad', sub: 'Oxirgi 20 davr · daromadsiz oylar yashirilgan · 1–10 · 11–20 · 21–oy oxiri · faqat tugallangan kunlar, savdosiz kunlar ham hisoblanadi', empty: 'Bu davrda daromad yo‘q', month: 'Shu oygacha', retry: 'Qayta urinish', error: 'Dekada daromadini yuklab bo‘lmadi', loading: 'Yuklanmoqda…', days: 'kun', total: 'Jami', target: 'Kunlik maqsad' },
  ru: { title: 'Средний дневной доход по декадам', sub: 'Последние 20 периодов · месяцы без дохода скрыты · 1–10 · 11–20 · 21–конец месяца · только завершённые дни, включая дни без продаж', empty: 'Нет дохода за этот период', month: 'По месяц', retry: 'Повторить', error: 'Не удалось загрузить доход по декадам', loading: 'Загрузка…', days: 'дн.', total: 'Всего', target: 'Дневная цель' },
}

// targetForPeriod(dateTo) gives the daily break-even target in effect for a
// period, so the dotted line moves where the target was changed.
export default function WeeklyIncomeChart({ lang, targetForPeriod = null }) {
  const l = labels[lang] || labels.en
  const today = restaurantTodayStr()
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [firstMonth, setFirstMonth] = useState(null)
  const [startFailed, setStartFailed] = useState(false)
  const [result, setResult] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const cache = useRef(new Map())
  const scrollContainer = useRef(null)
  useEffect(() => {
    let cancelled = false
    setStartFailed(false)
    loadFirstOrderMonth({
      loadEarliestDate: loadEarliestOrderDate,
      toMonth: date => toRestaurantDateStr(date).slice(0, 7),
    }).then(firstOrderMonth => {
      if (!cancelled) setFirstMonth(firstOrderMonth)
    }).catch(() => { if (!cancelled) setStartFailed(true) })
    return () => { cancelled = true }
  }, [retry])
  const key = month + ':' + today
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setFailed(false)
    setResult(null)
    if (cache.current.has(key)) {
      setResult({ key, rows: cache.current.get(key) })
      return
    }
    loadDashboardWeeklyIncome(month + '-01', { signal: controller.signal })
      .then(rows => {
        if (cancelled) return
        cache.current.set(key, rows)
        setResult({ key, rows })
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; controller.abort() }
  }, [month, key, retry])
  const rows = result?.key === key ? hideZeroIncomeMonths(result.rows) : null
  // Position newly loaded ranges before paint; preserve manual scrolling on other renders.
  useLayoutEffect(() => {
    const container = scrollContainer.current
    if (result?.key === key && container) container.scrollLeft = container.scrollWidth
  }, [result, key])
  const monthGroups = []
  const chartRows = (rows || []).map(row => {
    const monthKey = row.weekStart.slice(0, 7)
    let group = monthGroups[monthGroups.length - 1]
    const startsMonth = group?.key !== monthKey
    if (startsMonth) {
      group = { key: monthKey, count: 0, ...incomeMonthColors(monthKey) }
      monthGroups.push(group)
    }
    group.count += 1
    const target = targetForPeriod ? Math.max(0, Math.round(Number(targetForPeriod(row.weekEnd)) || 0)) : 0
    return { ...row, target, barColor: group.border, monthStyle: { '--income-hue': group.hue, backgroundColor: group.background, borderLeft: startsMonth ? '2px solid ' + group.border : '2px solid transparent' } }
  })
  const monthOptions = buildIncomeMonthOptions(firstMonth || today.slice(0, 7), today.slice(0, 7))
  const max = Math.max(...chartRows.map(row => row.target * 1.2), ...(rows || []).map(row => row.averageDailyIncome * 1.2), 1)
  return (
    <section aria-busy={!rows && !failed} className="ws-panel min-w-0">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ws-heading">{l.title}</h3>
          <p className="ws-caption mt-1">{l.sub}</p>
        </div>
        <label className="ws-caption flex items-center font-medium">{l.month}
          <CalendarPicker mode="month" lang={lang} label={l.month}
            disabled={firstMonth === null || startFailed} value={month} onChange={setMonth}
            min={monthOptions[monthOptions.length - 1]} max={monthOptions[0]}
            className="ws-input ml-2 !h-[38px] !w-auto" />
        </label>
      </div>
      {failed || startFailed ? <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-3">{l.error} <button type="button" onClick={() => setRetry(value => value + 1)} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button></div>
        : !rows ? <p role="status" className="ws-empty">{l.loading}</p>
        : rows.length === 0 ? <p className="ws-empty">{l.empty}</p>
        : <div ref={scrollContainer} className="overflow-x-auto">
          <div style={{ minWidth: rows.length * 90 }}>
            <p className="mb-3 text-sm font-medium tabular-nums text-[#22201d]">{rows.length > 0 && formatMonthYear(rows[0].weekStart, lang)} – {formatMonthYear(month + '-01', lang)}</p>
            <div className="flex">{monthGroups.map(group => <div key={group.key}
              className="zk-income-month min-w-0 rounded-t-lg border-t-4 py-2 text-center text-xs font-medium text-[#22201d]"
              style={{ '--income-hue': group.hue, flex: group.count, backgroundColor: group.background, borderColor: group.border }}>
              {formatMonthYear(group.key + '-01', lang)}
            </div>)}</div>
            <div className="relative flex h-48 items-end border-b border-[#e4e1de]" role="list" aria-label={l.title}>
              <BreakEvenLine points={chartRows.map((row, index) => ({
                key: row.weekStart,
                value: row.target,
                x: ((index + 0.5) / chartRows.length) * 100,
                y: (row.target / max) * 100,
                label: row.target > 0 && row.target !== chartRows[index - 1]?.target ? l.target + ': ' + formatCurrency(row.target) : '',
              }))} />
              {chartRows.map(row => <div key={row.weekStart} role="listitem" tabIndex={0}
                aria-label={row.weekStart + ' – ' + row.weekEnd + ': ' + formatCurrency(row.averageDailyIncome) + (row.target > 0 ? ' · ' + l.target + ': ' + formatCurrency(row.target) : '')}
                title={l.total + ': ' + formatCurrency(row.totalIncome) + ' · ' + row.dayCount + ' ' + l.days + (row.target > 0 ? ' · ' + l.target + ': ' + formatCurrency(row.target) : '')}
                className="zk-income-month relative flex h-full min-w-0 flex-1 items-end px-2" style={row.monthStyle}>
                <div className="w-full rounded-t-lg"
                  style={{ backgroundColor: row.dayCount === 0 ? 'var(--ws-border, #e4e1de)' : row.barColor, height: Math.max(1, row.averageDailyIncome / max * 100) + '%' }} />
              </div>)}
            </div>
            <div className="flex">{chartRows.map(row => <div key={row.weekStart} className="zk-income-month min-w-0 flex-1 px-2 pb-3 pt-2 text-center text-xs text-[#68655f]" style={row.monthStyle}>
              <p className="tabular-nums">{Number(row.weekStart.slice(8))}–{Number(row.weekEnd.slice(8))}</p>
              <p className="mt-1 font-semibold tabular-nums" style={{ color: row.barColor }}>{row.averageDailyIncome > 0 ? formatCurrency(row.averageDailyIncome) : '—'}</p>
              <p className="mt-1 text-[10px] tabular-nums">{row.dayCount} {l.days}</p>
            </div>)}</div>
          </div>
        </div>}
    </section>
  )
}
