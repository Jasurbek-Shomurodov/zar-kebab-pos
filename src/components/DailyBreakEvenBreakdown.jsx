import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { loadLatestDailyBreakEven } from '../lib/breakEvenTarget'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate } from '../lib/dateFormat'
import { Shimmer } from './PageShimmer'

const labels = {
  uz: {
    title: 'Kechagi hisob', income: 'Kafe daromadi', costOfGoods: 'Tannarx', salary: 'Hisoblangan ish haqi', kpi: 'Avtomatik KPI-bonuslar',
    rent: 'Ijara', utilities: 'Kommunal', meals: 'Xodimlar ovqati ({count} × {amount})', tax: 'Taxminiy soliq ({rate}%)', netProfit: 'Sof foyda',
    fixed: 'Doimiy xarajatlar', formula: '{fixed} ÷ (1 − {cogs} tannarx − {rate}% soliq)', result: 'Zararsizlik daromadi',
    noCost: 'Har bir sotilgan mahsulot tannarxi ma’lum emas — maqsad avvalgicha qoldi.', empty: 'Hali hisob yo‘q. Kunlik hisobot yuborilgach har kuni ertalab hisoblanadi.',
    failed: 'Kechagi hisobni yuklab bo‘lmadi', retry: 'Qayta urinish',
  },
  ru: {
    title: 'Расчёт за вчера', income: 'Выручка кафе', costOfGoods: 'Себестоимость', salary: 'Начисленная зарплата', kpi: 'Автоматические KPI-бонусы',
    rent: 'Аренда', utilities: 'Коммуналка', meals: 'Питание сотрудников ({count} × {amount})', tax: 'Оценочный soliq ({rate}%)', netProfit: 'Чистая прибыль',
    fixed: 'Постоянные расходы', formula: '{fixed} ÷ (1 − {cogs} себестоимость − {rate}% soliq)', result: 'Доход безубыточности',
    noCost: 'Себестоимость известна не для всех проданных позиций — цель осталась прежней.', empty: 'Расчёта пока нет. Он появляется каждое утро после дневного отчёта.',
    failed: 'Не удалось загрузить расчёт за вчера', retry: 'Повторить',
  },
  en: {
    title: 'Yesterday’s calculation', income: 'Cafe income', costOfGoods: 'Cost of goods', salary: 'Accrued salary', kpi: 'Automatic KPI bonuses',
    rent: 'Rent', utilities: 'Utilities', meals: 'Employee meals ({count} × {amount})', tax: 'Estimated soliq ({rate}%)', netProfit: 'Net profit',
    fixed: 'Fixed costs', formula: '{fixed} ÷ (1 − {cogs} cost of goods − {rate}% soliq)', result: 'Break-even income',
    noCost: 'Cost is not known for every item sold, so the target stayed as it was.', empty: 'No calculation yet. It runs every morning after the daily report.',
    failed: 'Could not load yesterday’s calculation', retry: 'Retry',
  },
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '')
}

function percent(rate) {
  return `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`
}

function Row({ label, value, strong = false, tone = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={`min-w-0 text-[13px] ${strong ? 'font-semibold text-[#22201d]' : 'text-[#68655f]'}`}>{label}</dt>
      <dd className={`flex-shrink-0 text-right text-[13px] tabular-nums ${strong ? 'font-semibold text-[#22201d]' : 'font-medium text-[#22201d]'} ${tone}`}>{value}</dd>
    </div>
  )
}

// Read-only: the target is calculated by the daily Telegram cron (migration 263).
export default function DailyBreakEvenBreakdown({ lang }) {
  const l = labels[lang] || labels.en
  const [state, setState] = useState({ status: 'loading', day: null })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', day: null })
    loadLatestDailyBreakEven({ signal: controller.signal })
      .then(day => setState({ status: 'ready', day }))
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error', day: null }) })
    return () => controller.abort()
  }, [retry])

  if (state.status === 'loading') {
    return (
      <div className="space-y-2 rounded-xl bg-[#f6f5f3] p-4" aria-hidden="true">
        <Shimmer className="h-3.5 w-40" />
        {[0, 1, 2, 3, 4, 5].map(index => <Shimmer key={index} className="h-3 w-full" />)}
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6f5f3] p-4 text-sm text-[#68655f]">
        <span>{l.failed}</span>
        <button type="button" className="ws-btn ws-btn-outline" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />{l.retry}</button>
      </div>
    )
  }
  const day = state.day
  if (!day) return <p className="rounded-xl bg-[#f6f5f3] p-4 text-sm text-[#68655f]">{l.empty}</p>

  const money = value => formatCurrency(value)
  return (
    <div className="rounded-xl bg-[#f6f5f3] px-4 py-3">
      <p className="text-sm font-semibold text-[#22201d]">{l.title} · {formatLongDate(day.businessDate, lang, day.businessDate)}</p>
      <dl className="mt-2 divide-y divide-[#e4e1de]">
        <Row label={l.income} value={money(day.cafeIncome)} strong />
        <Row label={day.costOfGoodsRate == null ? l.costOfGoods : `${l.costOfGoods} (${percent(day.costOfGoodsRate)})`} value={day.costOfGoods == null ? '—' : money(day.costOfGoods)} />
        <Row label={l.salary} value={money(day.salary)} />
        <Row label={l.kpi} value={money(day.kpiBonus)} />
        <Row label={l.rent} value={money(day.rent)} />
        <Row label={l.utilities} value={money(day.utilities)} />
        <Row label={fill(l.meals, { count: day.employeeMealCount, amount: formatCurrency(day.employeeMealPerEmployee) })} value={money(day.employeeMeal)} />
        <Row label={fill(l.tax, { rate: day.taxRatePercent })} value={money(day.tax)} />
        {day.netProfit != null && <Row label={l.netProfit} value={money(day.netProfit)} strong tone={day.netProfit >= 0 ? '!text-green-600' : '!text-red-600'} />}
        <Row label={l.fixed} value={money(day.fixedCosts)} />
      </dl>
      {day.breakEven == null ? (
        <p className="mt-2 text-[13px] text-[#68655f]">{l.noCost}</p>
      ) : (
        <div className="mt-2 border-t border-[#e4e1de] pt-2">
          <p className="ws-caption">{fill(l.formula, { fixed: money(day.fixedCosts), cogs: percent(day.costOfGoodsRate), rate: day.taxRatePercent })}</p>
          <Row label={l.result} value={money(day.breakEven)} strong />
        </div>
      )}
    </div>
  )
}
