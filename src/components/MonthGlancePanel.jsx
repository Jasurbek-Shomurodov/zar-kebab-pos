import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronRight, RefreshCw } from 'lucide-react'
import BarChart from './charts/BarChart'
import { CHART_DASH, ChartLegend } from './charts/ChartKit'
import { Shimmer } from './PageShimmer'
import { loadAccountingDailyIncome, loadAccountingMonthlyBreakdown } from '../lib/accountingSummary'
import { buildMonthlySpending } from '../lib/accountingAnalysis'
import { breakEvenTargetOn, loadBreakEvenTargetHistory } from '../lib/breakEvenTarget'
import { buildMonthGlance } from '../lib/dashboardInsights'
import { expenseCategoryLabel } from '../lib/expenses'
import { formatLongDate, formatMonthYear } from '../lib/dateFormat'
import { formatCompactCurrency, formatCurrency, formatPercent } from '../lib/formatCurrency'
import { weekdayName } from '../lib/sheetKit'

// The Dashboard's month so far, for people who may open Financial analysis:
// income per day against each day's break-even target, the pace and forecast,
// the best and weakest days, and where this month's money went. Three small
// aggregate reads (per-day cafe income 286, monthly spending 261, the target
// history 260); no orders or expense rows are downloaded.

const L = {
  uz: {
    title: 'Shu oy hozircha', open: 'Moliyaviy tahlil', failed: 'Oy ko‘rsatkichlarini yuklab bo‘lmadi.', retry: 'Qayta urinish',
    income: 'Oy daromadi', vsSameDays: 'o‘tgan oyning shu kunlariga nisbatan', average: 'Kunlik o‘rtacha', target: 'Maqsad',
    forecast: 'Oy oxirigacha taxmin', forecastSub: 'o‘rtacha bo‘yicha', lastMonth: 'O‘tgan oy', aboveTarget: 'Maqsaddan yuqori kunlar',
    targetGap: 'Maqsadga nisbatan', spent: 'Shu oy xarajat', left: 'Daromad − xarajat', leftSub: 'kafe daromadidan',
    chartTitle: 'Kunlik daromad', completed: 'Daromad', today: 'Bugun (davom etmoqda)', avgLine: 'O‘rtacha', breakEven: 'Zararsizlik maqsadi',
    whereTitle: 'Pul qayerga ketdi', noSpending: 'Shu oy xarajat yozilmagan', ofSpending: 'xarajatdan',
    highlights: 'Muhim kunlar', bestDay: 'Eng yaxshi kun', weakestDay: 'Eng sust kun', bestWeekday: 'Eng yaxshi hafta kuni', weakestWeekday: 'Eng sust hafta kuni',
    avgShort: 'o‘rtacha', salaries: 'Ish haqi', other: 'Boshqa', noData: 'Hali ma’lumot yo‘q', firstDay: 'Oyning birinchi kuni: o‘rtacha ertaga paydo bo‘ladi',
  },
  ru: {
    title: 'Этот месяц на сегодня', open: 'Финансовый анализ', failed: 'Не удалось загрузить показатели месяца.', retry: 'Повторить',
    income: 'Доход за месяц', vsSameDays: 'к тем же дням прошлого месяца', average: 'В среднем за день', target: 'Цель',
    forecast: 'Прогноз на месяц', forecastSub: 'по среднему', lastMonth: 'Прошлый месяц', aboveTarget: 'Дней выше цели',
    targetGap: 'Относительно цели', spent: 'Расходы за месяц', left: 'Доход − расходы', leftSub: 'из дохода кафе',
    chartTitle: 'Доход по дням', completed: 'Доход', today: 'Сегодня (идёт)', avgLine: 'Среднее', breakEven: 'Цель безубыточности',
    whereTitle: 'Куда ушли деньги', noSpending: 'В этом месяце расходов нет', ofSpending: 'расходов',
    highlights: 'Главные дни', bestDay: 'Лучший день', weakestDay: 'Самый слабый день', bestWeekday: 'Лучший день недели', weakestWeekday: 'Слабый день недели',
    avgShort: 'в среднем', salaries: 'Зарплаты', other: 'Другое', noData: 'Данных пока нет', firstDay: 'Первый день месяца: среднее появится завтра',
  },
  en: {
    title: 'This month so far', open: 'Financial analysis', failed: 'Could not load the month’s figures.', retry: 'Retry',
    income: 'Income this month', vsSameDays: 'vs the same days last month', average: 'Average per day', target: 'Target',
    forecast: 'Month forecast', forecastSub: 'at this average', lastMonth: 'Last month', aboveTarget: 'Days above target',
    targetGap: 'Against target', spent: 'Spent this month', left: 'Income − spending', leftSub: 'of cafe income',
    chartTitle: 'Income by day', completed: 'Income', today: 'Today (in progress)', avgLine: 'Average', breakEven: 'Break-even target',
    whereTitle: 'Where the money went', noSpending: 'No spending recorded this month', ofSpending: 'of spending',
    highlights: 'Key days', bestDay: 'Best day', weakestDay: 'Weakest day', bestWeekday: 'Best weekday', weakestWeekday: 'Weakest weekday',
    avgShort: 'avg', salaries: 'Salaries', other: 'Other', noData: 'No data yet', firstDay: 'First day of the month: the average starts tomorrow',
  },
}

const INCOME_COLOR = 'var(--ws-positive)'
const TODAY_COLOR = 'var(--ws-primary)'
const TARGET_COLOR = 'var(--ws-negative)'
const AVERAGE_COLOR = 'var(--ws-foreground)'

function previousMonthStart(today) {
  const [year, month] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function Change({ pct, goodWhenUp = true, label, lang }) {
  if (pct == null) return null
  const good = goodWhenUp ? pct >= 0 : pct <= 0
  return (
    <span className="ws-caption inline-flex flex-wrap items-center gap-x-1.5">
      <span className={`ws-badge tabular-nums ${good ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
        {pct >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}
        {`${pct > 0 ? '+' : ''}${formatPercent(pct, lang, 0)}`}
      </span>
      {label}
    </span>
  )
}

function Stat({ label, value, tone = '', children }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-[#f6f5f3] px-4 py-3">
      <p className="ws-caption truncate">{label}</p>
      <p className={`mt-1 whitespace-nowrap text-lg font-semibold tracking-[-.01em] tabular-nums ${tone || 'text-[#22201d]'}`}>{value}</p>
      {children && <div className="mt-1 min-h-[20px]">{children}</div>}
    </div>
  )
}

function GlanceShimmer({ label }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-[10px] bg-[#f6f5f3] px-4 py-3">
            <Shimmer className="h-3 w-2/3 rounded" />
            <Shimmer className="mt-2 h-5 w-4/5 rounded" />
            <Shimmer className="mt-2 h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
      <Shimmer className="mt-5 h-[220px] w-full rounded-xl" />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {[0, 1].map(column => (
          <div key={column} className="space-y-3">
            {Array.from({ length: 4 }, (_, row) => <Shimmer key={row} className="h-8 w-full rounded-lg" />)}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MonthGlancePanel({ lang = 'uz', today, fallbackTarget = 0, onOpen }) {
  const l = L[lang] || L.en
  const [state, setState] = useState({ status: 'loading', daily: null, breakdown: null, history: [] })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setState(current => ({ ...current, status: 'loading' }))
    Promise.all([
      loadAccountingDailyIncome(previousMonthStart(today), today),
      loadAccountingMonthlyBreakdown(2),
      // A missing target history only drops the target marks; the month still shows.
      loadBreakEvenTargetHistory().catch(() => []),
    ])
      .then(([daily, breakdown, history]) => { if (active) setState({ status: 'ready', daily, breakdown, history }) })
      .catch(() => { if (active) setState({ status: 'error', daily: null, breakdown: null, history: [] }) })
    return () => { active = false }
  }, [today, retry])

  const glance = useMemo(() => {
    if (state.status !== 'ready') return null
    const monthStart = `${today.slice(0, 8)}01`
    const spending = buildMonthlySpending(state.breakdown?.spending || [], [previousMonthStart(today), monthStart])
    return buildMonthGlance({
      dailyRows: state.daily,
      spending: spending || { categories: [] },
      today,
      targetOn: date => breakEvenTargetOn(state.history, date, fallbackTarget),
    })
  }, [state, today, fallbackTarget])

  const categoryLabel = key => (key === 'salaries' ? l.salaries : key === '__other__' ? l.other : expenseCategoryLabel(key, lang))
  const money = value => (value == null ? '—' : formatCurrency(value))
  const compact = value => formatCompactCurrency(value, lang)
  const dayLabel = day => (day ? formatLongDate(day.date, lang, day.date, { includeYear: false }) : '—')

  return (
    <section className="ws-panel min-w-0" aria-labelledby="dashboard-month-heading">
      <div className="ws-panel-title mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 id="dashboard-month-heading" className="ws-heading">{l.title}</h3>
          <p className="ws-caption mt-0.5">{formatMonthYear(today, lang, today)}</p>
        </div>
        {onOpen && (
          <button type="button" onClick={onOpen} className="ws-btn ws-btn-outline ws-btn-sm">
            {l.open}
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      {state.status === 'error' && (
        <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-3">
          <span>{l.failed}</span>
          <button type="button" onClick={() => setRetry(value => value + 1)} className="ws-btn ws-btn-outline ws-btn-sm"><RefreshCw size={14} aria-hidden="true" />{l.retry}</button>
        </div>
      )}
      {state.status === 'loading' && <GlanceShimmer label={l.title} />}

      {glance && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3">
            <Stat label={l.income} value={money(glance.incomeToDate)}>
              <Change pct={glance.sameDaysChangePct} label={l.vsSameDays} lang={lang} />
            </Stat>
            <Stat label={l.average} value={money(glance.averageDaily)}>
              {glance.averageDaily == null
                ? <span className="ws-caption">{l.firstDay}</span>
                : glance.days.at(-1)?.target > 0 && <span className="ws-caption tabular-nums">{l.target}: {compact(glance.days.at(-1).target)}</span>}
            </Stat>
            <Stat label={l.forecast} value={money(glance.forecast)}>
              <span className="ws-caption tabular-nums">{l.lastMonth}: {compact(glance.previousMonthIncome)}</span>
            </Stat>
            <Stat
              label={l.aboveTarget}
              value={glance.daysWithTarget ? `${glance.daysAboveTarget} / ${glance.daysWithTarget}` : '—'}
              tone={glance.daysWithTarget && glance.daysAboveTarget * 2 < glance.daysWithTarget ? 'text-[#c4262c]' : ''}
            >
              {glance.targetGap != null && (
                <span className={`ws-caption tabular-nums ${glance.targetGap < 0 ? '!text-[#c4262c]' : '!text-[#1d7a52]'}`}>
                  {l.targetGap}: {formatCompactCurrency(glance.targetGap, lang, { signed: true })}
                </span>
              )}
            </Stat>
            <Stat label={l.spent} value={money(glance.spentThisMonth)}>
              <span className="ws-caption tabular-nums">{l.lastMonth}: {compact(glance.spentLastMonth || 0)}</span>
            </Stat>
            <Stat label={l.left} value={money(glance.left)} tone={glance.left != null && glance.left < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'}>
              {glance.left != null && glance.incomeToDate > 0 && (
                <span className="ws-caption tabular-nums">{formatPercent(Math.round((glance.left / glance.incomeToDate) * 100), lang, 0)} {l.leftSub}</span>
              )}
            </Stat>
          </div>

          <div className="mt-5">
            <h4 className="mb-2 text-sm font-semibold text-[#22201d]">{l.chartTitle}</h4>
            <ChartLegend
              label={l.chartTitle}
              items={[
                { key: 'income', label: l.completed, color: INCOME_COLOR },
                { key: 'today', label: l.today, color: TODAY_COLOR },
                { key: 'avg', label: l.avgLine, color: AVERAGE_COLOR, kind: 'line', dash: CHART_DASH.average },
                { key: 'target', label: l.breakEven, color: TARGET_COLOR, kind: 'line', dash: CHART_DASH.target },
              ]}
            />
            <BarChart
              rows={glance.days}
              rowKey={day => day.date}
              series={[{ key: 'income', color: INCOME_COLOR }, { key: 'today', color: TODAY_COLOR }]}
              stacked
              value={(day, key) => (key === 'today' ? (day.isToday ? day.income : 0) : (day.isToday ? 0 : day.income))}
              lang={lang}
              height={220}
              minSlot={10}
              lines={glance.averageDaily == null ? [] : [{ key: 'avg', color: AVERAGE_COLOR, values: glance.days.map(() => glance.averageDaily), dash: CHART_DASH.average }]}
              markers={[{ key: 'target', color: TARGET_COLOR, values: glance.days.map(day => day.target) }]}
              xLabel={day => Number(day.date.slice(8))}
              rowLabel={day => `${formatLongDate(day.date, lang, day.date)} · ${formatCurrency(day.income)}`}
              ariaLabel={l.chartTitle}
              tooltip={day => ({
                title: formatLongDate(day.date, lang, day.date),
                rows: [{ key: 'income', label: day.isToday ? l.today : l.completed, color: day.isToday ? TODAY_COLOR : INCOME_COLOR, value: formatCurrency(day.income) }],
                footer: [
                  ...(day.target > 0 ? [{ key: 'target', label: l.breakEven, value: compact(day.target) }] : []),
                  ...(glance.averageDaily != null ? [{ key: 'avg', label: l.avgLine, value: compact(glance.averageDaily) }] : []),
                ],
              })}
            />
          </div>

          <div className="mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-2">
            <div className="min-w-0">
              <h4 className="mb-3 text-sm font-semibold text-[#22201d]">{l.whereTitle}</h4>
              {glance.categories.length === 0 ? (
                <p className="ws-empty !py-6">{l.noSpending}</p>
              ) : (
                <ul className="space-y-3">
                  {glance.categories.slice(0, 6).map(category => (
                    <li key={category.key} className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#22201d]">
                          <span aria-hidden="true" className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: category.color }} />
                          <span className="truncate">{categoryLabel(category.key)}</span>
                        </span>
                        <span className="flex flex-shrink-0 items-center gap-2">
                          <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(category.amount)}</span>
                          <span className="ws-caption w-10 text-right tabular-nums">{formatPercent(category.sharePct, lang, 0)}</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#efece9]">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(2, category.sharePct)}%`, background: category.color }} />
                      </div>
                      {category.previous > 0 && (
                        <p className="ws-caption mt-1 tabular-nums">{l.lastMonth}: {compact(category.previous)}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="min-w-0">
              <h4 className="mb-3 text-sm font-semibold text-[#22201d]">{l.highlights}</h4>
              <dl className="divide-y divide-[#e4e1de]">
                {[
                  { key: 'best', label: l.bestDay, value: glance.bestDay ? formatCurrency(glance.bestDay.amount) : '—', sub: dayLabel(glance.bestDay), tone: 'text-[#1d7a52]' },
                  { key: 'weak', label: l.weakestDay, value: glance.weakestDay ? formatCurrency(glance.weakestDay.amount) : '—', sub: dayLabel(glance.weakestDay), tone: '' },
                  { key: 'bestWeekday', label: l.bestWeekday, value: glance.bestWeekday ? weekdayName(glance.bestWeekday.sample, lang) : '—', sub: glance.bestWeekday ? `${l.avgShort} ${compact(glance.bestWeekday.average)}` : '', tone: '' },
                  { key: 'weakWeekday', label: l.weakestWeekday, value: glance.weakestWeekday ? weekdayName(glance.weakestWeekday.sample, lang) : '—', sub: glance.weakestWeekday ? `${l.avgShort} ${compact(glance.weakestWeekday.average)}` : '', tone: '' },
                ].map(row => (
                  <div key={row.key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                    <dt className="ws-caption min-w-0">{row.label}</dt>
                    <dd className="min-w-0 text-right">
                      <span className={`block whitespace-nowrap text-sm font-semibold tabular-nums first-letter:uppercase ${row.tone || 'text-[#22201d]'}`}>{row.value}</span>
                      {row.sub && <span className="ws-caption block whitespace-nowrap tabular-nums">{row.sub}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
