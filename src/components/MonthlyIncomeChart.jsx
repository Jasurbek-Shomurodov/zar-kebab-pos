import React from 'react'
import { buildDashboardMonthlyIncomeChartRows, DASHBOARD_MONTHLY_INCOME_MONTH_COUNT } from '../lib/monthlyIncome'
import { restaurantTodayStr } from '../lib/analytics'
import { formatCurrency } from '../lib/formatCurrency'
import { formatMonthYear } from '../lib/dateFormat'

const labels = {
  uz: { title: "Oylar bo'yicha o'rtacha kunlik daromad", sub: "Oxirgi 12 oy ko'rsatiladi; nol daromad qiymatlari yashiriladi.", savedMonth: 'Saqlangan oy', currentMonth: 'Joriy oy', breakEven: 'Kunlik zararsizlik', failed: "Oylik daromad ma'lumotlarini yuklab bo'lmadi", retry: 'Qayta urinish', empty: "Ma'lumot yo'q" },
  ru: { title: 'Средний дневной доход по месяцам', sub: 'Показаны последние 12 месяцев; нулевые значения дохода скрыты.', savedMonth: 'Сохранённый месяц', currentMonth: 'Текущий месяц', breakEven: 'Безубыточность в день', failed: 'Не удалось загрузить среднемесячный доход', retry: 'Повторить', empty: 'Нет данных' },
  en: { title: 'Average Daily Income by Month', sub: 'The latest 12 months are shown; zero income values are hidden.', savedMonth: 'Saved month', currentMonth: 'Current month', breakEven: 'Daily break-even', failed: 'Could not load monthly income averages', retry: 'Retry', empty: 'No data yet' },
}

function formatCompactIncome(amount, lang = 'uz') {
  const locale = lang === 'en' ? 'en-US' : lang === 'ru' ? 'ru-RU' : 'uz-UZ'
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(Math.max(0, Math.round(Number(amount) || 0)))
}

function ChartShimmer() {
  return (
    <div className="flex h-48 animate-pulse items-end gap-2" aria-hidden="true">
      {[28, 44, 35, 62, 48, 78, 56, 88, 68, 96, 74, 84].map((height, index) => (
        <div key={index} className="flex-1 rounded-t-md bg-[#efece9]" style={{ height: `${height}%` }} />
      ))}
    </div>
  )
}

// Monthly rows come from the caller (Financial analysis already loads them for
// its growth overview), so this card never issues its own request.
export default function MonthlyIncomeChart({ rows, status, onRetry, lang, target = 0 }) {
  const l = labels[lang] || labels.en
  const dailyBreakEvenIncome = Math.max(0, Math.round(Number(target) || 0))
  const currentMonthStart = `${restaurantTodayStr().slice(0, 8)}01`
  const monthlyIncomeChartRows = buildDashboardMonthlyIncomeChartRows(rows)
    .slice(-DASHBOARD_MONTHLY_INCOME_MONTH_COUNT)
    .map(row => ({
      ...row,
      label: formatMonthYear(row.monthStart, lang, row.monthStart),
      isCurrent: row.monthStart === currentMonthStart,
    }))
  const monthlyIncomeScaleMax = Math.max(
    ...monthlyIncomeChartRows.map(row => row.averageDailyIncome),
    dailyBreakEvenIncome > 0 ? Math.ceil(dailyBreakEvenIncome * 1.2) : 0,
    1,
  )
  const breakEvenLineHeight = dailyBreakEvenIncome > 0
    ? Math.round((dailyBreakEvenIncome / monthlyIncomeScaleMax) * 100)
    : 0

  return (
    <section aria-busy={status === 'loading'} className="ws-panel min-w-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ws-heading">{l.title}</h3>
          <p className="ws-caption mt-1 leading-relaxed">{l.sub}</p>
        </div>
        <div className="ws-caption flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#0f766e]" />
            {l.savedMonth}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#ff5a00]" />
            {l.currentMonth}
          </span>
          {dailyBreakEvenIncome > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dotted border-[#c4262c]" />
              {l.breakEven}
            </span>
          )}
        </div>
      </div>

      {status === 'loading' ? (
        <ChartShimmer />
      ) : status === 'error' ? (
        <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-3">
          <span>{l.failed}</span>
          <button type="button" onClick={onRetry} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>
        </div>
      ) : monthlyIncomeChartRows.length === 0 ? (
        <p className="ws-empty">{l.empty}</p>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[720px] pt-7">
            <div
              className="relative flex h-48 items-end gap-3 border-b border-[#e4e1de] px-2"
              role="list"
              aria-label={l.title}
            >
              {dailyBreakEvenIncome > 0 && (
                <div
                  className="pointer-events-none absolute inset-x-2 z-20 border-t-2 border-dotted border-[#c4262c]"
                  style={{ bottom: `${breakEvenLineHeight}%` }}
                  aria-hidden="true"
                >
                  <span className="absolute bottom-1 right-0 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#c4262c] shadow-sm">
                    {formatCompactIncome(dailyBreakEvenIncome, lang)}
                  </span>
                </div>
              )}
              {monthlyIncomeChartRows.map(row => {
                const height = Math.max(3, Math.round((row.averageDailyIncome / monthlyIncomeScaleMax) * 100))
                return (
                  <div
                    key={row.monthStart}
                    className="group relative flex h-full min-w-[44px] flex-1 items-end"
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${row.label}: ${formatCurrency(row.averageDailyIncome)}`}
                  >
                    <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-[#22201d] px-2 py-1 text-[10px] font-medium tabular-nums text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      {formatCurrency(row.averageDailyIncome)}
                    </div>
                    <div
                      className={`w-full rounded-t-lg transition-colors ${
                        row.averageDailyIncome <= 0
                          ? 'bg-[#efece9]'
                          : row.isCurrent
                          ? 'bg-[#ff5a00]'
                          : 'bg-[#0f766e] group-hover:bg-[#0f766e]/85'
                      }`}
                      style={{ height: `${height}%` }}
                      title={`${row.label}: ${formatCurrency(row.averageDailyIncome)}`}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-3 px-2 pt-2">
              {monthlyIncomeChartRows.map(row => (
                <div key={row.monthStart} className="min-w-[44px] flex-1 text-center leading-tight">
                  <p className={`text-[10px] font-medium ${row.isCurrent ? 'text-[#ff5a00]' : 'text-[#68655f]'}`}>
                    {row.label}
                  </p>
                  <p className={`mt-1 text-[10px] font-semibold tabular-nums ${
                    row.averageDailyIncome <= 0
                      ? 'text-[#dcd9d6]'
                      : row.isCurrent
                      ? 'text-[#ff5a00]'
                      : 'text-[#0f766e]'
                  }`}>
                    {row.averageDailyIncome > 0 ? formatCompactIncome(row.averageDailyIncome, lang) : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
