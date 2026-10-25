import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Crown, Loader2, Lock, RefreshCw, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import AppShell from '../components/AppShell'
import { Kpi } from '../components/AccountingKpi'
import SankeyChart from '../components/SankeyChart'
import { OperationalError } from '../components/OperationalState'
import { Shimmer } from '../components/PageShimmer'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { supabase } from '../lib/supabase'
import { loadSalaryRows } from '../lib/salaryData'
import { withReadTimeout } from '../lib/writeTimeout'
import { composeSalaryProfiles } from '../lib/accountingAnalysis'
import { expenseCategoryLabel, getSalaryMonthEndDate } from '../lib/expenses'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate, formatLongDateTime, formatMonthYear } from '../lib/dateFormat'
import { normalizeRole } from '../lib/permissions'
import {
  OWNER_PROFIT_EXPENSES_NODE,
  OWNER_PROFIT_LEGACY_BONUS_NODE,
  OWNER_PROFIT_SALARY_NODE,
  buildOwnerProfitMonths,
  buildOwnerProfitSankey,
  closeAccountingMonth,
  getMonthCloseErrorCode,
  reopenAccountingMonth,
  isMissingOwnerProfitRpc,
  loadOwnerProfitData,
  summarizeClosedOwnerProfit,
} from '../lib/ownerProfit'

const LABELS = {
  uz: {
    title: 'Egasi foydasi', refresh: 'Yangilash', loading: 'Oylar yuklanmoqda',
    tabOverview: 'Umumiy', tabTake: 'Foydani olish',
    intro: 'Har oy noldan boshlanadi: o‘sha oy kirimi minus o‘sha oy xarajatlari, maosh ishlangan oyiga yoziladi. Yopilgan oylar o‘zgarmaydi, ochiq oylar jonli yangilanadi.',
    introTake: 'Tugagan oyni yopib, uning egasi foydasini oling: raqamlar muzlatiladi, qolgan pul umumiy qoldiqdan chiqariladi va Investor kanaliga xabar boradi. Oylar navbat bilan, keyingi oyning 4-sanasidan yopiladi. Yopish va qayta ochish faqat egasiga ruxsat.',
    totalClosed: 'Yopilgan oylar foydasi', totalClosedSub: '{n} ta yopilgan oy', average: 'O‘rtacha oylik foyda', averageSub: 'Yopilgan oylar bo‘yicha',
    best: 'Eng yaxshi oy', worst: 'Eng yomon oy', none: 'Hali yopilgan oy yo‘q',
    chartTitle: 'Oylar bo‘yicha egasi foydasi', chartSub: 'Har oy alohida, oldingi oylardan qoldiqsiz',
    tableTitle: 'Oylar', month: 'Oy', income: 'Kirim', expenses: 'Xarajatlar', salary: 'Ishlangan maosh', meals: 'Xodimlar ovqati', profit: 'Egasi foydasi', margin: 'Marja', status: 'Holat',
    closed: 'Yopilgan', ready: 'Yopishga tayyor', waiting: 'Kutilmoqda', current: 'Joriy oy',
    waitingFrom: '{date} dan yopish mumkin', waitingEarlier: 'Avval oldingi oyni yoping', soFar: '{date} gacha',
    close: 'Oyni yopish', confirmTitle: '{month}ni yopish', confirmText: 'Bu oy muzlatiladi va o‘zgartirib bo‘lmaydi. Egasi foydasi: {profit}. Umumiy qoldiqdan {settled} chiqariladi. Shu oy sanasidagi xarajat, kirim, xodimlar ovqati, bonus va jarimalar qulflanadi.', confirm: 'Tasdiqlash', cancel: 'Bekor qilish', closing: 'Yopilmoqda…',
    ownerOnly: 'Oyni faqat egasi yopadi.',
    cafeIncome: 'Kafe daromadi', otherIncome: 'Boshqa kirim', recordedExpenses: 'Qayd etilgan xarajatlar', legacyBonuses: 'Darhol to‘langan bonuslar', investorSupport: 'Investor yordami (foydaga kirmaydi)', settled: 'Qoldiqdan chiqariladi', settledClosed: 'Qoldiqdan chiqarildi',
    employee: 'Xodim', base: 'Asosiy', bonuses: 'Bonuslar', fines: 'Jarimalar', earned: 'Ishlangan', closedBy: '{name} yopdi, {date}', noSalary: 'Bu oyda ishlangan maosh yo‘q',
    loadFailed: 'Egasi foydasini yuklab bo‘lmadi', migrationNeeded: 'migrations/257_accounting_month_closes.sql ni qo‘llang.', retry: 'Qayta urinish',
    errors: {
      owner_required: 'Oyni faqat egasi yopadi.', month_already_closed: 'Bu oy allaqachon yopilgan.', month_not_finished: 'Bu oy hali yopishga tayyor emas.', month_has_no_activity: 'Bu oyda faoliyat yo‘q.', earlier_month_open: 'Avval oldingi oyni yoping.', salary_breakdown_mismatch: 'Maosh hisobi mos kelmadi. Yangilab, qayta urining.', kpi_days_pending: 'Bu oyning KPI kunlari hali yakunlanmagan.', reopen_reason_required: 'Sababini yozing.', month_not_closed: 'Bu oy yopilmagan.', later_month_closed: 'Avval keyingi yopilgan oyni qayta oching.', meal_days_pending: 'Bu oyning xodimlar ovqati kunlari hali yakunlanmagan.', invalid_month_close: 'Noto‘g‘ri so‘rov.', unknown: 'Natija noma’lum. Tekshirib, qayta urining.',
    },
    closedOk: '{month} yopildi.',
    reopen: 'Qayta ochish', reopenTitle: '{month}ni qayta ochish', reopenText: 'Oy yopilishi bekor qilinadi va uning yozuvlari yana o‘zgartirilishi mumkin bo‘ladi. Investor kanaliga xabar yuboriladi.', reopenReason: 'Sabab', reopenReasonPlaceholder: 'Nega oy qayta ochilmoqda?', reopening: 'Ochilmoqda…', reopenedOk: '{month} qayta ochildi.', notifyClosed: 'Yopilganda Investor kanaliga xabar yuboriladi.',
    sankeyTitle: '{month} pul oqimi', sankeySub: 'Kirim qayerga ketdi va egasiga nima qoldi. Investor yordami kirmaydi.', sankeyHint: '› belgili oqimni bosing: yozuvlari yoki maosh tafsiloti ochiladi.', hub: 'Kirim', lossCovered: 'Zarar (egasi qopladi)', other: 'Boshqa', legacyBonusesShort: 'Darhol to‘langan bonuslar', prevMonth: 'Oldingi oy', nextMonth: 'Keyingi oy', emptyFlow: 'Bu oyda harakat yo‘q', showFlow: 'Pul oqimini ko‘rsatish',
  },
  ru: {
    title: 'Прибыль владельца', refresh: 'Обновить', loading: 'Загрузка месяцев',
    tabOverview: 'Обзор', tabTake: 'Снять прибыль',
    intro: 'Каждый месяц начинается с нуля: доход месяца минус расходы месяца, зарплата — в месяце, когда её заработали. Закрытые месяцы не меняются, открытые обновляются в реальном времени.',
    introTake: 'Закройте завершённый месяц, чтобы снять его прибыль владельца: цифры фиксируются, остаток списывается с общего остатка, в канал инвестора уходит сообщение. Месяцы закрываются по порядку, с 4-го числа следующего месяца. Закрывать и открывать снова может только владелец.',
    totalClosed: 'Прибыль закрытых месяцев', totalClosedSub: 'Закрыто месяцев: {n}', average: 'Средняя прибыль в месяц', averageSub: 'По закрытым месяцам',
    best: 'Лучший месяц', worst: 'Худший месяц', none: 'Закрытых месяцев пока нет',
    chartTitle: 'Прибыль владельца по месяцам', chartSub: 'Каждый месяц отдельно, без остатка прошлых месяцев',
    tableTitle: 'Месяцы', month: 'Месяц', income: 'Доход', expenses: 'Расходы', salary: 'Заработанная зарплата', meals: 'Питание сотрудников', profit: 'Прибыль владельца', margin: 'Маржа', status: 'Статус',
    closed: 'Закрыт', ready: 'Можно закрыть', waiting: 'Ожидает', current: 'Текущий месяц',
    waitingFrom: 'Закрыть можно с {date}', waitingEarlier: 'Сначала закройте предыдущий месяц', soFar: 'по {date}',
    close: 'Закрыть месяц', confirmTitle: 'Закрыть {month}', confirmText: 'Месяц будет зафиксирован без возможности изменения. Прибыль владельца: {profit}. Из общего остатка будет списано {settled}. Расходы, поступления, питание, бонусы и штрафы с датой в этом месяце будут заблокированы.', confirm: 'Подтвердить', cancel: 'Отмена', closing: 'Закрываем…',
    ownerOnly: 'Закрыть месяц может только владелец.',
    cafeIncome: 'Доход кафе', otherIncome: 'Другой доход', recordedExpenses: 'Учтённые расходы', legacyBonuses: 'Сразу выплаченные бонусы', investorSupport: 'Поддержка инвестора (не входит в прибыль)', settled: 'Будет списано с остатка', settledClosed: 'Списано с остатка',
    employee: 'Сотрудник', base: 'Оклад', bonuses: 'Бонусы', fines: 'Штрафы', earned: 'Заработано', closedBy: 'Закрыл(а) {name}, {date}', noSalary: 'В этом месяце зарплата не начислялась',
    loadFailed: 'Не удалось загрузить прибыль владельца', migrationNeeded: 'Примените migrations/257_accounting_month_closes.sql.', retry: 'Повторить',
    errors: {
      owner_required: 'Закрыть месяц может только владелец.', month_already_closed: 'Этот месяц уже закрыт.', month_not_finished: 'Этот месяц ещё нельзя закрыть.', month_has_no_activity: 'В этом месяце нет операций.', earlier_month_open: 'Сначала закройте предыдущий месяц.', salary_breakdown_mismatch: 'Расчёт зарплаты не сошёлся. Обновите и попробуйте снова.', kpi_days_pending: 'KPI-дни этого месяца ещё не закрыты.', reopen_reason_required: 'Укажите причину.', month_not_closed: 'Этот месяц не закрыт.', later_month_closed: 'Сначала откройте более поздний закрытый месяц.', meal_days_pending: 'Дни питания сотрудников этого месяца ещё не закрыты.', invalid_month_close: 'Некорректный запрос.', unknown: 'Результат неизвестен. Проверьте и попробуйте снова.',
    },
    closedOk: '{month} закрыт.',
    reopen: 'Открыть снова', reopenTitle: 'Открыть {month} снова', reopenText: 'Закрытие месяца отменяется, его записи снова можно изменять. В канал инвестора уйдёт сообщение.', reopenReason: 'Причина', reopenReasonPlaceholder: 'Почему месяц открывается снова?', reopening: 'Открываем…', reopenedOk: '{month} снова открыт.', notifyClosed: 'После закрытия в канал инвестора уйдёт сообщение.',
    sankeyTitle: 'Денежный поток: {month}', sankeySub: 'Куда ушёл доход и что осталось владельцу. Поддержка инвестора не учитывается.', sankeyHint: 'Нажмите на поток со знаком ›, чтобы открыть записи или детали зарплаты.', hub: 'Доход', lossCovered: 'Убыток (покрыл владелец)', other: 'Прочее', legacyBonusesShort: 'Сразу выплаченные бонусы', prevMonth: 'Предыдущий месяц', nextMonth: 'Следующий месяц', emptyFlow: 'В этом месяце нет движения', showFlow: 'Показать денежный поток',
  },
  en: {
    title: 'Owner profit', refresh: 'Refresh', loading: 'Loading months',
    tabOverview: 'Overview', tabTake: 'Take profit',
    intro: 'Every month starts from zero: that month’s income minus that month’s costs, with salary counted in the month it was earned. Closed months are final; open months update live.',
    introTake: 'Close a finished month to take its owner profit: the figures are frozen, what is left leaves the all-time remainder, and the Investor channel is told. Months close in order from the 4th of the next month. Only the owner can close or reopen.',
    totalClosed: 'Closed months profit', totalClosedSub: '{n} closed months', average: 'Average monthly profit', averageSub: 'Across closed months',
    best: 'Best month', worst: 'Worst month', none: 'No closed months yet',
    chartTitle: 'Owner profit by month', chartSub: 'Each month on its own, with nothing carried over',
    tableTitle: 'Months', month: 'Month', income: 'Income', expenses: 'Expenses', salary: 'Salary earned', meals: 'Employees meal', profit: 'Owner profit', margin: 'Margin', status: 'Status',
    closed: 'Closed', ready: 'Ready to close', waiting: 'Waiting', current: 'This month',
    waitingFrom: 'Can be closed from {date}', waitingEarlier: 'Close the earlier month first', soFar: 'through {date}',
    close: 'Close month', confirmTitle: 'Close {month}', confirmText: 'The month is frozen and cannot be changed. Owner profit: {profit}. {settled} leaves the all-time remainder. Expenses, income, employee meals, bonuses and fines dated in this month are locked.', confirm: 'Confirm', cancel: 'Cancel', closing: 'Closing…',
    ownerOnly: 'Only the owner can close a month.',
    cafeIncome: 'Cafe income', otherIncome: 'Other income', recordedExpenses: 'Recorded expenses', legacyBonuses: 'Immediately paid bonuses', investorSupport: 'Investor support (not profit)', settled: 'Leaves the remainder', settledClosed: 'Left the remainder',
    employee: 'Employee', base: 'Base', bonuses: 'Bonuses', fines: 'Fines', earned: 'Earned', closedBy: 'Closed by {name}, {date}', noSalary: 'No salary earned this month',
    loadFailed: 'Could not load owner profit', migrationNeeded: 'Apply migrations/257_accounting_month_closes.sql.', retry: 'Retry',
    errors: {
      owner_required: 'Only the owner can close a month.', month_already_closed: 'This month is already closed.', month_not_finished: 'This month cannot be closed yet.', month_has_no_activity: 'This month has no activity.', earlier_month_open: 'Close the earlier month first.', salary_breakdown_mismatch: 'The salary total did not match. Refresh and try again.', kpi_days_pending: 'Some KPI days of this month are not finalized yet.', reopen_reason_required: 'Write a reason.', month_not_closed: 'This month is not closed.', later_month_closed: 'Reopen the later closed month first.', meal_days_pending: 'Some employee-meal days of this month are not finalized yet.', invalid_month_close: 'Invalid request.', unknown: 'The result is unknown. Check and try again.',
    },
    closedOk: '{month} closed.',
    reopen: 'Reopen', reopenTitle: 'Reopen {month}', reopenText: 'The close is undone and the month’s records can be changed again. The Investor channel is notified.', reopenReason: 'Reason', reopenReasonPlaceholder: 'Why is this month being reopened?', reopening: 'Reopening…', reopenedOk: '{month} reopened.', notifyClosed: 'The Investor channel is notified once the month is closed.',
    sankeyTitle: '{month} money flow', sankeySub: 'Where the income went and what was left for the owner. Investor support is not included.', sankeyHint: 'Tap a flow marked › to open its records or the salary breakdown.', hub: 'Income', lossCovered: 'Loss (owner covered)', other: 'Other', legacyBonusesShort: 'Immediately paid bonuses', prevMonth: 'Previous month', nextMonth: 'Next month', emptyFlow: 'No movement this month', showFlow: 'Show money flow',
  },
}

const TAKE_PROFIT_TAB = 'take-profit'

// The full payroll ledger is paged, so it gets longer than a single read.
const PAYROLL_LOAD_TIMEOUT_MS = 30000

function fill(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template)
}

function signed(value) {
  if (!value) return formatCurrency(0)
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`
}

function profitTone(value) {
  return value < 0 ? 'text-[#c4262c]' : value > 0 ? 'text-[#1d7a52]' : 'text-[#68655f]'
}

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

// Payroll ledgers for every employee, archived ones too: someone who left
// still earned salary in the months they worked.
async function loadSalaryProfilesForOwnerProfit() {
  const [team, profiles, rates, bonuses, fines, absences] = await Promise.all([
    loadSalaryRows(() => supabase.from('profiles').select('id, full_name, email, role, status')),
    loadSalaryRows(() => supabase.from('employee_salary_profiles').select('*')),
    loadSalaryRows(() => supabase.from('employee_salary_rates').select('*')),
    loadSalaryRows(() => supabase.from('employee_salary_bonuses').select('*')),
    loadSalaryRows(() => supabase.from('employee_salary_fines').select('*')),
    loadSalaryRows(() => supabase.from('employee_salary_absences').select('*')),
  ])
  const error = team.error || profiles.error || rates.error || bonuses.error || fines.error || absences.error
  if (error) throw error
  return composeSalaryProfiles(profiles.data, rates.data, [], bonuses.data, fines.data, absences.data, team.data)
}

function ProfitChart({ rows, lang, selected, onSelect, selectLabel }) {
  const max = Math.max(1, ...rows.map(row => Math.abs(row.ownerProfit)))
  const hasNegative = rows.some(row => row.ownerProfit < 0)
  const hasPositive = rows.some(row => row.ownerProfit > 0)
  const positiveShare = hasNegative && hasPositive ? 0.5 : hasNegative ? 0 : 1
  const height = 180
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[420px] items-stretch gap-2" style={{ height: height + 44 }}>
        {rows.map(row => {
          const share = Math.abs(row.ownerProfit) / max
          const barHeight = Math.max(row.ownerProfit ? 2 : 0, share * height * (row.ownerProfit >= 0 ? positiveShare : 1 - positiveShare))
          const open = row.status !== 'closed'
          return (
            <button
              type="button"
              key={row.monthStart}
              onClick={() => onSelect(row.monthStart)}
              aria-pressed={selected === row.monthStart}
              aria-label={`${formatMonthYear(row.monthStart, lang)}: ${signed(row.ownerProfit)}. ${selectLabel}`}
              className={`flex min-w-[44px] flex-1 flex-col items-center rounded-lg pb-1 transition-colors hover:bg-[#f6f5f3] ${selected === row.monthStart ? 'bg-[#f6f5f3]' : ''}`}
              title={`${formatMonthYear(row.monthStart, lang)}: ${signed(row.ownerProfit)}`}
            >
              <span className={`text-[11px] font-semibold tabular-nums ${profitTone(row.ownerProfit)}`}>{formatCompactSigned(row.ownerProfit)}</span>
              <div className="relative w-full flex-1">
                <div className="absolute inset-x-0 border-t border-[#d6d2cd]" style={{ top: `${positiveShare * 100}%` }} />
                <div
                  className={`absolute left-1/2 w-3/5 max-w-[40px] -translate-x-1/2 rounded-[3px] ${row.ownerProfit < 0 ? 'bg-[#c4262c]' : 'bg-[#1baf7a]'} ${open ? 'opacity-40' : ''}`}
                  style={row.ownerProfit >= 0
                    ? { bottom: `${(1 - positiveShare) * 100}%`, height: barHeight }
                    : { top: `${positiveShare * 100}%`, height: barHeight }}
                />
              </div>
              <span className={`mt-1 whitespace-nowrap text-[11px] ${selected === row.monthStart ? 'font-semibold text-[#22201d]' : 'text-[#8a867f]'}`}>{formatMonthYear(row.monthStart, lang).split(' ')[0]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// One month as a money flow. Expense categories and employee meals open their
// Accounting history for that month; salary earned opens the month's
// per-employee breakdown in the table below.
function MonthFlowCard({ row, rows, categories, l, lang, onSelect, onOpenSalary }) {
  const navigate = useNavigate()
  const flow = useMemo(() => buildOwnerProfitSankey(row, categories), [row, categories])
  const index = rows.findIndex(item => item.monthStart === row.monthStart)
  const previous = rows[index - 1]
  const next = rows[index + 1]
  const monthEnd = getSalaryMonthEndDate(row.monthStart)

  function targetLabel(key) {
    if (key === '__left__') return l.profit
    if (key === '__other__') return l.other
    if (key === OWNER_PROFIT_SALARY_NODE) return l.salary
    if (key === OWNER_PROFIT_LEGACY_BONUS_NODE) return l.legacyBonusesShort
    if (key === OWNER_PROFIT_EXPENSES_NODE) return l.recordedExpenses
    return expenseCategoryLabel(key, lang)
  }

  function sourceLabel(key) {
    if (key === 'cafe') return l.cafeIncome
    if (key === 'reserves') return l.lossCovered
    return l.otherIncome
  }

  function openTarget(key) {
    if (key === OWNER_PROFIT_SALARY_NODE) {
      onOpenSalary(row.monthStart)
      return
    }
    const params = new URLSearchParams({ type: 'expense', from: row.monthStart, to: monthEnd })
    if (key !== OWNER_PROFIT_EXPENSES_NODE) params.set('category', key)
    navigate(`/admin/accounting/history?${params.toString()}`)
  }

  const monthLabel = formatMonthYear(row.monthStart, lang)
  return (
    <section className="ws-panel" aria-label={fill(l.sankeyTitle, { month: monthLabel })}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ws-heading">{fill(l.sankeyTitle, { month: monthLabel })}</h3>
          <p className="ws-caption mt-0.5">{l.sankeySub}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => previous && onSelect(previous.monthStart)} disabled={!previous} aria-label={l.prevMonth} title={l.prevMonth} className="ws-btn ws-btn-outline !h-[34px] !w-[34px] !px-0"><ChevronLeft size={16} /></button>
          <StatusBadge row={row} l={l} lang={lang} />
          <button type="button" onClick={() => next && onSelect(next.monthStart)} disabled={!next} aria-label={l.nextMonth} title={l.nextMonth} className="ws-btn ws-btn-outline !h-[34px] !w-[34px] !px-0"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="mt-4">
        <SankeyChart
          sankey={flow.sankey}
          colors={flow.colors}
          hubLabel={l.hub}
          emptyLabel={l.emptyFlow}
          sourceLabel={sourceLabel}
          targetLabel={targetLabel}
          onTargetClick={openTarget}
          isTargetClickable={node => !node.isLeft && !node.isOther && node.key !== OWNER_PROFIT_LEGACY_BONUS_NODE}
        />
      </div>
      {flow.sankey.total > 0 && <p className="ws-caption mt-3">{l.sankeyHint}</p>}
    </section>
  )
}

function ChartShimmer({ label }) {
  const heights = ['h-[40%]', 'h-[70%]', 'h-[55%]', 'h-[90%]', 'h-[65%]', 'h-[30%]']
  return (
    <div role="status" aria-busy="true" className="flex h-[224px] items-end gap-2">
      <span className="sr-only">{label}</span>
      {heights.map((height, index) => <Shimmer key={index} className={`min-w-[44px] flex-1 rounded-[3px] ${height}`} />)}
    </div>
  )
}

function TableShimmer({ label }) {
  return (
    <div role="status" aria-busy="true" className="space-y-3 py-1">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 5 }, (_, index) => <Shimmer key={index} className="h-9 w-full" />)}
    </div>
  )
}

function formatCompactSigned(value) {
  const amount = Math.abs(Number(value) || 0)
  const sign = value < 0 ? '−' : value > 0 ? '+' : ''
  if (amount >= 1_000_000) return `${sign}${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (amount >= 1_000) return `${sign}${Math.round(amount / 1_000)}K`
  return `${sign}${Math.round(amount)}`
}

function StatusBadge({ row, l, lang }) {
  const tones = {
    closed: 'bg-[#efece9] text-[#22201d]',
    ready: 'bg-[#fff1e8] text-[#cc4800]',
    waiting: 'bg-[#f6f5f3] text-[#8a867f]',
    current: 'bg-[#eaf3fc] text-[#1f5fa8]',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[row.status]}`}>
      {row.status === 'closed' && <Lock size={11} />}
      {l[row.status]}
      {row.status === 'current' && <span className="font-normal">· {fill(l.soFar, { date: formatLongDate(row.dateTo, lang, row.dateTo, { includeYear: false }) })}</span>}
    </span>
  )
}

function MonthDetails({ row, l, lang }) {
  const lines = [
    [l.cafeIncome, row.cafeIncome],
    [l.otherIncome, row.otherIncome],
    [l.recordedExpenses, -row.recordedExpenses],
    [l.legacyBonuses, -row.legacyPaidBonuses],
    [l.meals, -row.employeeMeals],
    [l.salary, -row.salaryEarned],
  ].filter(([, value], index) => index < 1 || value)
  return (
    <div className="grid gap-4 bg-[#faf9f7] px-3 py-4 lg:grid-cols-2">
      <dl className="space-y-1.5 text-[13px]">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4"><dt className="text-[#68655f]">{label}</dt><dd className="tabular-nums">{signed(value)}</dd></div>
        ))}
        <div className="flex justify-between gap-4 border-t border-[#e4e1de] pt-1.5 font-semibold"><dt>{l.profit}</dt><dd className={`tabular-nums ${profitTone(row.ownerProfit)}`}>{signed(row.ownerProfit)}</dd></div>
        {row.investorSupport > 0 && (
          <div className="flex justify-between gap-4 text-[#68655f]"><dt>{l.investorSupport}</dt><dd className="tabular-nums">{signed(row.investorSupport)}</dd></div>
        )}
        {row.status !== 'current' && (
          <div className="flex justify-between gap-4 text-[#68655f]"><dt>{row.status === 'closed' ? l.settledClosed : l.settled}</dt><dd className="tabular-nums">{formatCurrency(row.settledAmount)}</dd></div>
        )}
        {row.status === 'closed' && row.closedAt && (
          <p className="ws-caption pt-1">{fill(l.closedBy, { name: row.closedByName || '—', date: formatLongDateTime(row.closedAt, lang, '') })}</p>
        )}
      </dl>
      {row.salaryBreakdown.length ? (
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[#e4e1de] text-[#8a867f]">
              {[l.employee, l.base, l.bonuses, l.fines, l.earned].map((column, index) => <th key={column} scope="col" className={`py-1.5 px-2 font-semibold ${index ? 'text-right' : 'text-left'}`}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {row.salaryBreakdown.map(item => (
              <tr key={item.salary_profile_id} className="border-b border-[#efece9]">
                <th scope="row" className="py-1.5 px-2 text-left font-medium">{item.employee_name || '—'}</th>
                <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(item.base)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{item.bonuses ? formatCurrency(item.bonuses) : '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{item.fines ? `−${formatCurrency(item.fines)}` : '—'}</td>
                <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{formatCurrency(item.earned)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="ws-caption">{l.noSalary}</p>}
    </div>
  )
}

export default function OwnerProfit() {
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang
  const l = LABELS[lang] || LABELS.en
  const isOwner = normalizeRole(profile?.role || state.user?.role) === 'owner'
  // Overview first; taking profit (closing and reopening months) is the second tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === TAKE_PROFIT_TAB ? TAKE_PROFIT_TAB : 'overview'
  const taking = tab === TAKE_PROFIT_TAB
  const tabs = {
    label: l.title,
    value: tab,
    items: [{ key: 'overview', label: l.tabOverview }, { key: TAKE_PROFIT_TAB, label: l.tabTake }],
    onChange: key => setSearchParams(key === TAKE_PROFIT_TAB ? { tab: TAKE_PROFIT_TAB } : {}, { replace: true }),
  }

  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [data, setData] = useState(null)
  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [flowMonth, setFlowMonth] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState(null)
  const [closedMonth, setClosedMonth] = useState(null)
  const [reopening, setReopening] = useState(null)
  const [reopenReason, setReopenReason] = useState('')
  const [reopenBusy, setReopenBusy] = useState(false)
  const [reopenError, setReopenError] = useState(null)
  const [reopenedMonth, setReopenedMonth] = useState(null)
  const reopenRequestIds = useRef({})
  // One request id per month until that close succeeds, so a retry after a
  // timeout returns the saved close instead of risking a second attempt.
  const requestIds = useRef({})
  const loadRef = useRef(0)

  useEffect(() => {
    const id = loadRef.current + 1
    loadRef.current = id
    setLoading(true)
    setLoadError(null)
    Promise.all([loadOwnerProfitData(), withReadTimeout(loadSalaryProfilesForOwnerProfit, 'OWNER_PROFIT_PAYROLL', PAYROLL_LOAD_TIMEOUT_MS)])
      .then(([ownerData, profiles]) => {
        if (id !== loadRef.current) return
        setData(ownerData)
        setSalaryProfiles(profiles)
      })
      .catch(error => {
        if (id !== loadRef.current) return
        setLoadError(isMissingOwnerProfitRpc(error) ? 'migration' : 'failed')
      })
      .finally(() => {
        if (id === loadRef.current) setLoading(false)
      })
  }, [reloadKey])

  const rows = useMemo(() => (data ? buildOwnerProfitMonths({
    closes: data.closes,
    openMonths: data.openMonths,
    salaryProfiles,
    today: data.today,
  }) : []), [data, salaryProfiles])
  const summary = useMemo(() => summarizeClosedOwnerProfit(rows), [rows])
  const earliestOpen = rows.find(row => row.status !== 'closed')
  const latestClosed = [...rows].reverse().find(row => row.status === 'closed')
  // The flow opens on the latest finished month, or this month before one exists.
  const flowRow = rows.find(row => row.monthStart === flowMonth)
    || [...rows].reverse().find(row => row.status !== 'current')
    || rows[rows.length - 1]

  function openMonthDetails(monthStart) {
    setExpanded(monthStart)
    setFlowMonth(monthStart)
    requestAnimationFrame(() => document.getElementById(`owner-month-${monthStart}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function handleClose(row) {
    const requestId = requestIds.current[row.monthStart] || newRequestId()
    requestIds.current[row.monthStart] = requestId
    setClosing(true)
    setCloseError(null)
    try {
      await closeAccountingMonth({
        monthStart: row.monthStart,
        salaryEarned: row.salaryEarned,
        salaryBreakdown: row.salaryBreakdown,
        requestId,
      })
      delete requestIds.current[row.monthStart]
      setConfirming(null)
      setClosedMonth(row.monthStart)
      setReopenedMonth(null)
      setReloadKey(key => key + 1)
    } catch (error) {
      const code = getMonthCloseErrorCode(error)
      setCloseError({ monthStart: row.monthStart, code })
      if (code === 'month_already_closed') {
        delete requestIds.current[row.monthStart]
        setConfirming(null)
        setReloadKey(key => key + 1)
      }
    } finally {
      setClosing(false)
    }
  }

  async function handleReopen(row) {
    if (!reopenReason.trim()) {
      setReopenError({ monthStart: row.monthStart, code: 'reopen_reason_required' })
      return
    }
    const requestId = reopenRequestIds.current[row.monthStart] || newRequestId()
    reopenRequestIds.current[row.monthStart] = requestId
    setReopenBusy(true)
    setReopenError(null)
    try {
      await reopenAccountingMonth({ monthStart: row.monthStart, reason: reopenReason, requestId })
      delete reopenRequestIds.current[row.monthStart]
      setReopening(null)
      setReopenReason('')
      setReopenedMonth(row.monthStart)
      setClosedMonth(null)
      setReloadKey(key => key + 1)
    } catch (error) {
      const code = getMonthCloseErrorCode(error)
      setReopenError({ monthStart: row.monthStart, code })
      if (code === 'month_not_closed') {
        delete reopenRequestIds.current[row.monthStart]
        setReopening(null)
        setReloadKey(key => key + 1)
      }
    } finally {
      setReopenBusy(false)
    }
  }

  const headerActions = (
    <button
      type="button"
      onClick={() => setReloadKey(key => key + 1)}
      disabled={loading}
      aria-label={l.refresh}
      title={l.refresh}
      className="ws-btn ws-btn-outline !h-[38px] !w-[38px] !px-0"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
    </button>
  )

  const cell = 'py-2.5 px-3 text-right tabular-nums'
  const showShimmer = loading && !data

  return (
    <AppShell title={l.title} tabs={tabs} headerActions={headerActions}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page space-y-5">
          <p className="max-w-3xl text-[13px] leading-relaxed text-[#68655f]">{taking ? l.introTake : l.intro}</p>

          {loadError && !data ? (
            <OperationalError
              title={l.loadFailed}
              description={loadError === 'migration' ? l.migrationNeeded : ''}
              actionLabel={l.retry}
              onAction={() => setReloadKey(key => key + 1)}
            />
          ) : (
            <>
              {!taking && (<>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi loading={showShimmer} icon={Crown} label={l.totalClosed} value={summary.count ? signed(summary.total) : '—'} sub={summary.count ? fill(l.totalClosedSub, { n: summary.count }) : l.none} tone={summary.total < 0 ? 'red' : 'green'} emphasizeValue={summary.count > 0} />
                <Kpi loading={showShimmer} icon={WalletCards} label={l.average} value={summary.average == null ? '—' : signed(summary.average)} sub={l.averageSub} tone={summary.average < 0 ? 'red' : 'green'} />
                <Kpi loading={showShimmer} icon={TrendingUp} label={l.best} value={summary.best ? signed(summary.best.ownerProfit) : '—'} sub={summary.best ? formatMonthYear(summary.best.monthStart, lang) : l.none} tone="green" />
                <Kpi loading={showShimmer} icon={TrendingDown} label={l.worst} value={summary.worst ? signed(summary.worst.ownerProfit) : '—'} sub={summary.worst ? formatMonthYear(summary.worst.monthStart, lang) : l.none} tone="red" />
              </div>

              <section className="ws-panel">
                <h3 className="ws-heading">{l.chartTitle}</h3>
                <p className="ws-caption mt-0.5">{l.chartSub}</p>
                <div className="mt-4">
                  {showShimmer ? <ChartShimmer label={l.loading} /> : <ProfitChart rows={rows} lang={lang} selected={flowRow?.monthStart} onSelect={setFlowMonth} selectLabel={l.showFlow} />}
                </div>
              </section>

              {showShimmer ? (
                <section className="ws-panel"><ChartShimmer label={l.loading} /></section>
              ) : flowRow && (
                <MonthFlowCard
                  row={flowRow}
                  rows={rows}
                  categories={data?.expenseCategories?.[flowRow.monthStart] || null}
                  l={l}
                  lang={lang}
                  onSelect={setFlowMonth}
                  onOpenSalary={openMonthDetails}
                />
              )}
              </>)}

              {taking && (closedMonth || reopenedMonth) && (
                <div role="status" aria-live="polite" className="ws-notice ws-tone-positive">
                  {closedMonth ? fill(l.closedOk, { month: formatMonthYear(closedMonth, lang) }) : fill(l.reopenedOk, { month: formatMonthYear(reopenedMonth, lang) })}
                </div>
              )}

              <section className="ws-panel">
                <h3 className="ws-heading">{l.tableTitle}</h3>
                {taking && !isOwner && <p className="ws-caption mt-0.5">{l.ownerOnly}</p>}
                <div className="mt-3">
                  {showShimmer ? <TableShimmer label={l.loading} /> : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] border-collapse text-[13px]">
                        <thead>
                          <tr className="border-b border-[#e4e1de] text-[12px] text-[#8a867f]">
                            {[l.month, l.income, l.expenses, l.salary, l.meals, l.profit, l.margin, l.status].map((column, index) => (
                              <th key={column} scope="col" className={`py-2 px-3 font-semibold ${index === 0 || index === 7 ? 'text-left' : 'text-right'}`}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...rows].reverse().map(row => {
                            const isExpanded = expanded === row.monthStart
                            const isConfirming = confirming === row.monthStart
                            const error = closeError?.monthStart === row.monthStart ? l.errors[closeError.code] || l.errors.unknown : ''
                            const isReopening = reopening === row.monthStart
                            const reopenMessage = reopenError?.monthStart === row.monthStart ? l.errors[reopenError.code] || l.errors.unknown : ''
                            return (
                              <React.Fragment key={row.monthStart}>
                                <tr id={`owner-month-${row.monthStart}`} className="scroll-mt-4 border-b border-[#efece9] text-[#22201d]">
                                  <th scope="row" className="py-2.5 px-3 text-left font-semibold">
                                    <button type="button" onClick={() => { setExpanded(isExpanded ? null : row.monthStart); if (!isExpanded) setFlowMonth(row.monthStart) }} aria-expanded={isExpanded} className="inline-flex items-center gap-1.5 hover:text-[#ff5a00]">
                                      <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      {formatMonthYear(row.monthStart, lang)}
                                    </button>
                                  </th>
                                  <td className={cell}>{formatCurrency(row.income)}</td>
                                  <td className={cell}>{formatCurrency(row.recordedExpenses + row.legacyPaidBonuses)}</td>
                                  <td className={cell}>{formatCurrency(row.salaryEarned)}</td>
                                  <td className={cell}>{formatCurrency(row.employeeMeals)}</td>
                                  <td className={`${cell} font-semibold ${profitTone(row.ownerProfit)}`}>{signed(row.ownerProfit)}</td>
                                  <td className={`${cell} text-[#68655f]`}>{row.marginPct == null ? '—' : `${row.marginPct}%`}</td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <StatusBadge row={row} l={l} lang={lang} />
                                      {taking && row.status === 'ready' && isOwner && !isConfirming && (
                                        <button type="button" onClick={() => { setConfirming(row.monthStart); setCloseError(null) }} className="ws-btn ws-btn-primary !h-[30px] !px-3 text-[12px]">{l.close}</button>
                                      )}
                                      {taking && row === latestClosed && isOwner && !isReopening && (
                                        <button type="button" onClick={() => { setReopening(row.monthStart); setReopenReason(''); setReopenError(null) }} className="ws-btn ws-btn-outline !h-[30px] !px-3 text-[12px]">{l.reopen}</button>
                                      )}
                                      {taking && row.status === 'waiting' && (
                                        <span className="ws-caption">{row === earliestOpen ? fill(l.waitingFrom, { date: formatLongDate(row.availableFrom, lang, row.availableFrom) }) : l.waitingEarlier}</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                {taking && isConfirming && (
                                  <tr className="border-b border-[#efece9]">
                                    <td colSpan={8} className="bg-[#fff8f3] px-3 py-3">
                                      <p className="text-[13px] font-semibold text-[#22201d]">{fill(l.confirmTitle, { month: formatMonthYear(row.monthStart, lang) })}</p>
                                      <p className="mt-1 text-[13px] text-[#68655f]">{fill(l.confirmText, { profit: signed(row.ownerProfit), settled: formatCurrency(row.settledAmount) })} {l.notifyClosed}</p>
                                      {error && <p role="alert" className="mt-2 text-[13px] font-semibold text-[#c4262c]">{error}</p>}
                                      <div className="mt-3 flex gap-2">
                                        <button type="button" onClick={() => handleClose(row)} disabled={closing} className="ws-btn ws-btn-primary !h-[34px] !px-3.5">
                                          {closing && <Loader2 size={14} className="animate-spin" />}
                                          {closing ? l.closing : l.confirm}
                                        </button>
                                        <button type="button" onClick={() => setConfirming(null)} disabled={closing} className="ws-btn ws-btn-outline !h-[34px] !px-3.5">{l.cancel}</button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                {taking && isReopening && (
                                  <tr className="border-b border-[#efece9]">
                                    <td colSpan={8} className="bg-[#fff8f3] px-3 py-3">
                                      <p className="text-[13px] font-semibold text-[#22201d]">{fill(l.reopenTitle, { month: formatMonthYear(row.monthStart, lang) })}</p>
                                      <p className="mt-1 text-[13px] text-[#68655f]">{l.reopenText}</p>
                                      <label className="mt-3 block max-w-xl">
                                        <span className="ws-caption">{l.reopenReason}</span>
                                        <textarea
                                          value={reopenReason}
                                          onChange={event => setReopenReason(event.target.value)}
                                          rows={2}
                                          maxLength={1000}
                                          placeholder={l.reopenReasonPlaceholder}
                                          className="ws-input mt-1 !h-auto min-h-[64px] w-full resize-y"
                                        />
                                      </label>
                                      {reopenMessage && <p role="alert" className="mt-2 text-[13px] font-semibold text-[#c4262c]">{reopenMessage}</p>}
                                      <div className="mt-3 flex gap-2">
                                        <button type="button" onClick={() => handleReopen(row)} disabled={reopenBusy} className="ws-btn ws-btn-primary !h-[34px] !px-3.5">
                                          {reopenBusy && <Loader2 size={14} className="animate-spin" />}
                                          {reopenBusy ? l.reopening : l.confirm}
                                        </button>
                                        <button type="button" onClick={() => setReopening(null)} disabled={reopenBusy} className="ws-btn ws-btn-outline !h-[34px] !px-3.5">{l.cancel}</button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                {isExpanded && (
                                  <tr className="border-b border-[#efece9]">
                                    <td colSpan={8} className="p-0"><MonthDetails row={row} l={l} lang={lang} /></td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}
