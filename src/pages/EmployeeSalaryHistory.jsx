import React, { useEffect, useMemo, useState } from 'react'
import {
  BadgeMinus,
  Banknote,
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Gift,
  Loader2,
  Percent,
  RefreshCw,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import SalaryRateHistory from '../components/SalaryRateHistory'
import { OperationalError } from '../components/OperationalState'
import { Shimmer } from '../components/PageShimmer'
import { ACCOUNTING_TAB_PATHS, accountingTitle, buildAccountingTabs } from '../lib/accountingTabs'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCompactCurrency, formatCurrency } from '../lib/formatCurrency'
import { SALARY_ENTRY_TONES, formatSalaryEntryAmount, salaryEntryTone } from '../lib/salaryTransactions'
import { formatLongDate, formatMonthYear, formatTime } from '../lib/dateFormat'
import { formatKpiRatePercent, formatKpiStartTime } from '../lib/dailyKpi'
import { getSalaryLedgerLoadError, isMissingSalaryMigration, loadSalaryRows } from '../lib/salaryData'
import {
  expensePaymentMethodLabel,
  getSalaryAccruedAmount,
  getSalaryActiveUntil,
  getSalaryBalance,
  getSalaryDue,
  todayExpenseDate,
} from '../lib/expenses'
import { canEditFeature, normalizeRole } from '../lib/permissions'
import { retractTelegramSalaryEvent } from '../lib/telegramNotifications'
import {
  buildSalaryHistoryCalendar,
  buildSalaryHistoryEntries,
  filterSalaryHistoryEntries,
  groupSalaryHistoryEntries,
  normalizeSalaryHistoryMonth,
  shiftSalaryHistoryMonth,
  summarizeSalaryHistoryMonth,
} from '../lib/salaryHistory'

const PAGE_SIZE = 10
const HISTORY_TABLE_BY_TYPE = {
  rate: 'employee_salary_rates',
  payment: 'employee_salary_payments',
  bonus: 'employee_salary_bonuses',
  fine: 'employee_salary_fines',
  absence: 'employee_salary_absences',
}
const HISTORY_TYPES = ['all', 'payment', 'bonus', 'fine', 'absence']
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/


function employeeName(employee, fallback) {
  return employee?.employee_name || fallback
}

function formatRecordCount(count, lang) {
  const amount = Number(count) || 0
  if (lang === 'ru') {
    const mod100 = amount % 100
    const mod10 = amount % 10
    const word = mod100 >= 11 && mod100 <= 14
      ? 'записей'
      : mod10 === 1
        ? 'запись'
        : mod10 >= 2 && mod10 <= 4
          ? 'записи'
          : 'записей'
    return `${amount} ${word}`
  }
  if (lang === 'en') return `${amount} ${amount === 1 ? 'record' : 'records'}`
  return `${amount} yozuv`
}

export default function EmployeeSalaryHistory() {
  const { employeeId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const today = todayExpenseDate()
  const currentMonth = today.slice(0, 7)
  const visibleMonth = normalizeSalaryHistoryMonth(searchParams.get('month'), currentMonth)
  const requestedDay = String(searchParams.get('day') || '')
  const selectedDate = ISO_DATE_PATTERN.test(requestedDay) && requestedDay.startsWith(visibleMonth)
    ? requestedDay
    : ''
  const requestedType = String(searchParams.get('type') || 'all')
  const activeType = HISTORY_TYPES.includes(requestedType) ? requestedType : 'all'
  const canManage = canEditFeature(profile || { role: state.user?.role }, 'expenses')
  const isOwner = normalizeRole(profile?.role || state.user?.role) === 'owner'
  const canDeleteHistory = canManage && isOwner

  const L = {
    uz: {
      title: 'Maosh tarixi',
      back: 'Xodimlarga qaytish',
      employee: 'Xodim',
      active: 'Faol',
      inactive: 'Nofaol',
      joined: 'Ishga kirgan',
      refresh: 'Yangilash',
      loadingTitle: 'Maosh tarixi yuklanmoqda',
      loadingDescription: 'Taqvim va maosh operatsiyalari tayyorlanmoqda.',
      loadFailed: 'Maosh tarixini yuklab bo‘lmadi.',
      notFound: 'Xodim topilmadi yoki o‘chirilgan.',
      migration: 'Maosh jadvallari yangilanmagan. Supabase SQL editorida employee_salary migratsiyalarini ishga tushiring.',
      currentMonth: 'Joriy oy',
      previousMonth: 'Oldingi oy',
      nextMonth: 'Keyingi oy',
      calendar: 'Faoliyat taqvimi',
      calendarHelp: 'Kunlarda to‘lov, bonus, KPI va jarimalar qisqa ko‘rinishda belgilangan. Aniq summalar uchun kunni bosing.',
      loadFailedHint: 'Internetni tekshirib, qayta urinib ko‘ring.',
      advance: 'Avans',
      dismiss: 'Yopish',
      workStatus: 'Davomat',
      allMonth: 'Butun oy',
      monthActivity: 'Oylik faoliyat',
      selectedDayActivity: 'Tanlangan kun',
      clearDay: 'Butun oyni ko‘rish',
      records: 'yozuv',
      all: 'Hammasi',
      payments: 'To‘lovlar',
      bonuses: 'Bonuslar',
      fines: 'Jarimalar',
      absences: 'Kelmagan kunlar',
      payment: 'To‘lov',
      bonus: 'Bonus',
      fine: 'Jarima',
      absence: 'Kelmagan',
      paidTotal: 'To‘langan',
      salaryEarnedTotal: 'Hisoblangan maosh',
      bonusTotal: 'Bonuslar',
      kpiBonusTotal: 'KPI bonuslari',
      fineTotal: 'Jarimalar',
      absenceTotal: 'Kelmagan kunlar',
      worked: 'Ishladi',
      noCheckin: 'Check-in yo‘q',
      earnedTotal: 'Maosh + bonuslar',
      leftToPay: 'To‘lash qoldi',
      empty: 'Bu davrda yozuvlar yo‘q.',
      delete: 'O‘chirish',
      confirm: 'Tasdiqlash',
      cancel: 'Bekor qilish',
      deleteFailed: 'Yozuvni o‘chirib bo‘lmadi.',
      telegramDeleteFailed: 'Telegramdagi xabarlarga «o‘chirildi» belgisini qo‘yib bo‘lmadi, shuning uchun yozuv saqlandi.',
      automaticKpi: 'Avtomatik KPI',
      accruedToSalary: 'Maosh balansiga qo‘shildi',
      kpiFormula: 'Hisobga olingan zal buyurtmalari summasi + xizmat haqi',
      previous: 'Oldingi',
      next: 'Keyingi',
      page: 'Sahifa',
      of: '/',
      weekdays: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
    },
    ru: {
      title: 'История зарплаты',
      back: 'Назад к сотрудникам',
      employee: 'Сотрудник',
      active: 'Активен',
      inactive: 'Неактивен',
      joined: 'Дата выхода',
      refresh: 'Обновить',
      loadingTitle: 'Загружаем историю зарплаты',
      loadingDescription: 'Готовим календарь и операции сотрудника.',
      loadFailed: 'Не удалось загрузить историю зарплаты.',
      notFound: 'Сотрудник не найден или удалён.',
      migration: 'Таблицы зарплат не обновлены. Запустите миграции employee_salary в Supabase SQL Editor.',
      currentMonth: 'Текущий месяц',
      previousMonth: 'Предыдущий месяц',
      nextMonth: 'Следующий месяц',
      calendar: 'Календарь операций',
      calendarHelp: 'В днях кратко отмечены выплаты, бонусы, KPI и штрафы. Нажмите на день, чтобы увидеть точные суммы.',
      loadFailedHint: 'Проверьте интернет и повторите.',
      advance: 'Аванс',
      dismiss: 'Закрыть',
      workStatus: 'Посещаемость',
      allMonth: 'Весь месяц',
      monthActivity: 'Операции за месяц',
      selectedDayActivity: 'Выбранный день',
      clearDay: 'Показать весь месяц',
      records: 'записей',
      all: 'Все',
      payments: 'Выплаты',
      bonuses: 'Бонусы',
      fines: 'Штрафы',
      absences: 'Отсутствия',
      payment: 'Выплата',
      bonus: 'Бонус',
      fine: 'Штраф',
      absence: 'Отсутствовал',
      paidTotal: 'Выплачено',
      salaryEarnedTotal: 'Начисленная зарплата',
      bonusTotal: 'Бонусы',
      kpiBonusTotal: 'KPI-бонусы',
      fineTotal: 'Штрафы',
      absenceTotal: 'Дни отсутствия',
      worked: 'Работал',
      noCheckin: 'Нет отметки',
      earnedTotal: 'Зарплата + бонусы',
      leftToPay: 'Осталось выплатить',
      empty: 'За этот период записей нет.',
      delete: 'Удалить',
      confirm: 'Подтвердить',
      cancel: 'Отмена',
      deleteFailed: 'Не удалось удалить запись.',
      telegramDeleteFailed: 'Не удалось отметить сообщения в Telegram как удалённые, поэтому запись сохранена.',
      automaticKpi: 'Автоматический KPI',
      accruedToSalary: 'Добавлено к балансу зарплаты',
      kpiFormula: 'Сумма учитываемых заказов в зале + плата за обслуживание',
      previous: 'Назад',
      next: 'Далее',
      page: 'Страница',
      of: 'из',
      weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    },
    en: {
      title: 'Salary history',
      back: 'Back to employees',
      employee: 'Employee',
      active: 'Active',
      inactive: 'Inactive',
      joined: 'Joined',
      refresh: 'Refresh',
      loadingTitle: 'Loading salary history',
      loadingDescription: 'Preparing the employee calendar and activity.',
      loadFailed: 'Could not load salary history.',
      notFound: 'Employee was not found or has been removed.',
      migration: 'Salary tables are not up to date. Run the employee_salary migrations in Supabase SQL Editor.',
      currentMonth: 'Current month',
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
      calendar: 'Activity calendar',
      calendarHelp: 'Days mark payments, bonuses, KPI and fines in short form. Select a day to see the exact amounts.',
      loadFailedHint: 'Check the connection and try again.',
      advance: 'Advance',
      dismiss: 'Close',
      workStatus: 'Attendance',
      allMonth: 'All month',
      monthActivity: 'Monthly activity',
      selectedDayActivity: 'Selected day',
      clearDay: 'Show all month',
      records: 'records',
      all: 'All',
      payments: 'Payments',
      bonuses: 'Bonuses',
      fines: 'Fines',
      absences: 'Absences',
      payment: 'Payment',
      bonus: 'Bonus',
      fine: 'Fine',
      absence: 'Absent',
      paidTotal: 'Paid',
      salaryEarnedTotal: 'Earned salary',
      bonusTotal: 'Bonuses',
      kpiBonusTotal: 'KPI bonuses',
      fineTotal: 'Fines',
      absenceTotal: 'Absent days',
      worked: 'Worked',
      noCheckin: 'No check-in',
      earnedTotal: 'Salary + bonuses',
      leftToPay: 'Left to pay',
      empty: 'There are no records for this period.',
      delete: 'Delete',
      confirm: 'Confirm',
      cancel: 'Cancel',
      deleteFailed: 'Could not delete the record.',
      telegramDeleteFailed: 'The Telegram messages could not be marked as removed, so the record was kept.',
      automaticKpi: 'Automatic KPI',
      accruedToSalary: 'Added to salary balance',
      kpiFormula: 'Eligible dine-in sales + service',
      previous: 'Previous',
      next: 'Next',
      page: 'Page',
      of: 'of',
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    },
  }
  const l = L[lang] || L.en

  const [employee, setEmployee] = useState(null)
  const [entries, setEntries] = useState([])
  const [checkins, setCheckins] = useState(() => new Map())
  const [loading, setLoading] = useState(true)
  // Codes, translated at render: a language switch re-labels them and raw database text stays in the console.
  const [error, setError] = useState('')
  // A failed or empty read of the employee: nothing is shown as a balance until a retry succeeds.
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState('')
  const [confirmActionKey, setConfirmActionKey] = useState('')
  const [page, setPage] = useState(1)

  async function loadHistory({ showLoader = true } = {}) {
    if (!employeeId) return
    if (showLoader) setLoading(true)
    setError('')
    setLoadError('')
    try {
      const [employeeRes, rateRes, paymentRes, bonusRes, fineRes, absenceRes, kpiResultRes, checkinRes] = await Promise.all([
        supabase.from('employee_salary_profiles').select('*').eq('id', employeeId).maybeSingle(),
        loadSalaryRows(() => supabase.from('employee_salary_rates').select('*').eq('salary_profile_id', employeeId)),
        loadSalaryRows(() => supabase.from('employee_salary_payments').select('*').eq('salary_profile_id', employeeId)),
        loadSalaryRows(() => supabase.from('employee_salary_bonuses').select('*').eq('salary_profile_id', employeeId)),
        loadSalaryRows(() => supabase.from('employee_salary_fines').select('*').eq('salary_profile_id', employeeId)),
        loadSalaryRows(() => supabase.from('employee_salary_absences').select('*').eq('salary_profile_id', employeeId)),
        loadSalaryRows(() => supabase.from('employee_daily_kpi_results')
          .select('id, business_date, salary_profile_id, sales_base_amount, rate_bps, bonus_amount, bonus_id, status, start_time_snapshot')
          .eq('salary_profile_id', employeeId)),
        loadSalaryRows(() => supabase.from('employee_attendance_checkins')
          .select('id, business_date, checked_in_at, minutes_late, arrival_status')
          .eq('salary_profile_id', employeeId)),
      ])
      const ledgerError = getSalaryLedgerLoadError([employeeRes, rateRes, paymentRes, bonusRes, absenceRes], fineRes)
      if (ledgerError) throw ledgerError
      if (!employeeRes.data || employeeRes.data.deleted_at) {
        setEmployee(null)
        setEntries([])
        setLoadError('notFound')
        return
      }

      setEmployee({
        ...employeeRes.data,
        rates: rateRes.data || [],
        payments: paymentRes.data || [],
        bonuses: bonusRes.data || [],
        fines: fineRes.data || [],
        absences: absenceRes.data || [],
      })
      // Check-ins are optional before migration 243; the calendar then falls back to absences only.
      setCheckins(new Map((checkinRes.error ? [] : checkinRes.data || []).map(row => [row.business_date, row])))
      setEntries(buildSalaryHistoryEntries({
        payments: paymentRes.data || [],
        bonuses: bonusRes.data || [],
        fines: fineRes.data || [],
        absences: absenceRes.data || [],
        kpiResults: kpiResultRes.error ? [] : kpiResultRes.data || [],
      }))
      // Only a database from before the fines migration gets here with a fines error.
      if (fineRes.error) setError('migration')
    } catch (caught) {
      console.error('[salary history] load failed:', caught)
      setEmployee(null)
      setEntries([])
      setLoadError(isMissingSalaryMigration(caught) ? 'migration' : 'loadFailed')
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [employeeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const calendarDays = useMemo(
    () => buildSalaryHistoryCalendar(visibleMonth, entries, today, employee ? {
      joinedAt: employee.joined_at,
      endedAt: employee.ended_at,
      worksRemotely: employee.works_remotely === true,
      checkins,
    } : null),
    [visibleMonth, entries, today, employee, checkins]
  )
  const workStatusCounts = useMemo(() => {
    const counts = { worked: 0, absent: 0, noCheckin: 0 }
    for (const day of calendarDays) {
      if (day.inMonth && day.workStatus) counts[day.workStatus] += 1
    }
    return counts
  }, [calendarDays])
  const monthEntries = useMemo(
    () => filterSalaryHistoryEntries(entries, { month: visibleMonth }),
    [entries, visibleMonth]
  )
  const visibleEntries = useMemo(
    () => filterSalaryHistoryEntries(entries, {
      month: visibleMonth,
      date: selectedDate,
      entryType: activeType,
    }),
    [entries, visibleMonth, selectedDate, activeType]
  )
  const monthSummary = useMemo(
    () => summarizeSalaryHistoryMonth(entries, visibleMonth),
    [entries, visibleMonth]
  )
  const headerTotals = useMemo(() => {
    if (!employee || !visibleMonth) return { salaryEarned: 0, earned: 0, due: 0, advance: 0 }
    const monthStart = `${visibleMonth}-01`
    const [year, month] = visibleMonth.split('-').map(Number)
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    const accrualEnd = [monthEnd, today, getSalaryActiveUntil(employee, monthEnd)]
      .filter(Boolean)
      .sort()[0]
    const salaryEarned = accrualEnd >= monthStart
      ? getSalaryAccruedAmount(employee, monthStart, accrualEnd)
      : 0
    // Display only: a negative ledger balance is money already paid ahead (an advance).
    const balance = getSalaryBalance(employee, today)
    return {
      salaryEarned,
      earned: salaryEarned + monthSummary.bonusAmount + monthSummary.kpiBonusAmount,
      due: getSalaryDue(employee, today),
      advance: balance < 0 ? Math.abs(balance) : 0,
    }
  }, [employee, monthSummary.bonusAmount, monthSummary.kpiBonusAmount, today, visibleMonth])
  const pageCount = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE))
  const pagedEntries = useMemo(
    () => visibleEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visibleEntries, page]
  )
  const entryGroups = useMemo(() => groupSalaryHistoryEntries(pagedEntries), [pagedEntries])
  const typeCounts = useMemo(() => ({
    all: monthEntries.length,
    payment: monthEntries.filter(entry => entry.entryType === 'payment').length,
    bonus: monthEntries.filter(entry => entry.entryType === 'bonus').length,
    fine: monthEntries.filter(entry => entry.entryType === 'fine').length,
    absence: monthEntries.filter(entry => entry.entryType === 'absence').length,
  }), [monthEntries])

  useEffect(() => { setPage(1) }, [visibleMonth, selectedDate, activeType])
  useEffect(() => { setPage(current => Math.min(current, pageCount)) }, [pageCount])

  function updateView({ month = visibleMonth, day = selectedDate, type = activeType }, replace = false) {
    const next = new URLSearchParams(searchParams)
    next.set('month', month)
    if (day) next.set('day', day)
    else next.delete('day')
    if (type && type !== 'all') next.set('type', type)
    else next.delete('type')
    setSearchParams(next, { replace })
    setConfirmActionKey('')
  }

  function selectCalendarDay(day) {
    const nextMonth = day.date.slice(0, 7)
    const nextDay = selectedDate === day.date ? '' : day.date
    updateView({ month: nextMonth, day: nextDay })
  }

  async function deleteHistoryEntry(entry) {
    if (saving) return
    if (!canDeleteHistory || entry?.paymentMethod === 'salary' || !entry?.id || (entry.entryType === 'rate' && !employee?.rates.some(rate => rate.id === entry.id))) {
      setError('deleteFailed')
      return
    }
    const table = HISTORY_TABLE_BY_TYPE[entry.entryType]
    if (!table) return
    const key = `${entry.entryType}-history-delete-${entry.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }

    setSaving(key)
    setError('')
    try {
      await retractTelegramSalaryEvent(entry.entryType, entry.id)
    } catch (telegramError) {
      console.error('[salary history] Telegram retraction failed:', telegramError)
      setSaving('')
      setConfirmActionKey('')
      setError('telegramDeleteFailed')
      return
    }
    try {
      const { data: deleted, error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq('id', entry.id)
        .eq('salary_profile_id', employeeId)
        .select('id')
      if (deleteError) throw deleteError
      if (!deleted?.length) throw new Error('Salary history row was not deleted')
      if (entry.entryType === 'rate') {
        await loadHistory({ showLoader: false })
        return
      }
    } catch (deleteError) {
      console.error('[salary history] delete failed:', deleteError)
      setError('deleteFailed')
      return
    } finally {
      setSaving('')
      setConfirmActionKey('')
    }
    setEntries(current => current.filter(item => !(
      item.id === entry.id && item.entryType === entry.entryType
    )))
    if (entry.entryType === 'payment' || entry.entryType === 'bonus' || entry.entryType === 'fine' || entry.entryType === 'absence') {
      const collection = entry.entryType === 'payment'
        ? 'payments'
        : entry.entryType === 'bonus'
          ? 'bonuses'
          : entry.entryType === 'fine'
            ? 'fines'
            : 'absences'
      setEmployee(current => current ? {
        ...current,
        [collection]: (current[collection] || []).filter(item => item.id !== entry.id),
      } : current)
    }
  }

  // The history sits under the Employees tab of Accounting; every tab, Employees included, navigates.
  const accountingTabs = buildAccountingTabs(lang, 'employees', navigate)
  const tabs = { ...accountingTabs, onChange: key => navigate(ACCOUNTING_TAB_PATHS[key]) }
  const inactive = employee?.is_active === false
  const errorText = error ? l[error] || l.deleteFailed : ''
  const monthLabel = formatMonthYear(visibleMonth, lang, visibleMonth)
  const filters = [
    { key: 'all', label: l.all },
    { key: 'payment', label: l.payments },
    { key: 'bonus', label: l.bonuses },
    { key: 'fine', label: l.fines },
    { key: 'absence', label: l.absences },
  ]
  const workStatusLabels = { worked: l.worked, absent: l.absence, noCheckin: l.noCheckin }
  const valueShimmer = <Shimmer className="h-5 w-28 max-w-full rounded-md" />

  // The header, month controls and section headings render at once; only loaded values shimmer.
  return (
    <AppShell
      title={accountingTitle(lang)}
      tabs={tabs}
      back={{ label: l.back, onClick: () => navigate(ACCOUNTING_TAB_PATHS.employees) }}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${inactive ? 'bg-[#efece9] text-[#68655f]' : 'bg-[#ff5a00]/10 text-[#bf4300]'}`}>
                <UserRound size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="ws-display min-w-0 break-words">
                    {loading ? <Shimmer className="h-7 w-44 max-w-full rounded-md" /> : employee ? employeeName(employee, l.employee) : l.title}
                  </h2>
                  {employee && (
                    <span className={`ws-status ${inactive ? 'ws-tone-caution' : 'ws-tone-positive'}`}>
                      {inactive ? l.inactive : l.active}
                    </span>
                  )}
                </div>
                <p className="ws-caption mt-0.5">
                  {l.title}
                  {employee?.joined_at && <> · {l.joined}: {formatLongDate(employee.joined_at, lang, employee.joined_at)}</>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => updateView({ month: currentMonth, day: '', type: activeType })}
                aria-pressed={visibleMonth === currentMonth && !selectedDate}
                className="ws-btn ws-btn-outline ws-btn-sm aria-pressed:border-[#ff5a00]/50 aria-pressed:bg-[#fff1e8] aria-pressed:text-[#bf4300]"
              >
                <CalendarDays aria-hidden="true" />{l.currentMonth}
              </button>
              <button
                type="button"
                onClick={() => loadHistory({ showLoader: false })}
                disabled={loading || saving !== ''}
                className="ws-btn ws-btn-outline ws-btn-sm"
              >
                <RefreshCw aria-hidden="true" />{l.refresh}
              </button>
            </div>
          </header>

          {loadError ? (
            <div className="ws-panel">
              <OperationalError
                lang={lang}
                title={loadError === 'notFound' ? l.notFound : l.loadFailed}
                description={loadError === 'migration' ? l.migration : l.loadFailedHint}
                actionLabel={l.refresh}
                onAction={() => loadHistory()}
              />
            </div>
          ) : (
            <>
              {/* Label left, amount right on a phone; stacked columns from sm. An amount never wraps or truncates. */}
              <section className="ws-panel" aria-label={monthLabel}>
                <dl className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-x-6 gap-y-3">
                  <SummaryItem icon={Banknote} tone="payment" label={l.leftToPay} value={loading ? valueShimmer : formatCurrency(headerTotals.due)}
                    chip={!loading && headerTotals.advance > 0 ? `${l.advance}: ${formatCurrency(headerTotals.advance)}` : ''} />
                  <SummaryItem icon={CalendarDays} label={l.earnedTotal} value={loading ? valueShimmer : formatCurrency(headerTotals.earned)} />
                  <SummaryItem icon={CalendarDays} label={l.salaryEarnedTotal} value={loading ? valueShimmer : formatCurrency(headerTotals.salaryEarned)} />
                  <SummaryItem icon={Banknote} tone="payment" label={l.paidTotal} value={loading ? valueShimmer : formatCurrency(monthSummary.paymentAmount)} />
                  <SummaryItem icon={Gift} tone="bonus" label={l.bonusTotal} value={loading ? valueShimmer : formatCurrency(monthSummary.bonusAmount)} />
                  <SummaryItem icon={Percent} tone="kpi" label={l.kpiBonusTotal} value={loading ? valueShimmer : formatCurrency(monthSummary.kpiBonusAmount)} />
                  <SummaryItem icon={BadgeMinus} tone="fine" label={l.fineTotal} value={loading ? valueShimmer : formatCurrency(monthSummary.fineAmount)} />
                  <SummaryItem icon={CalendarX2} tone="absence" label={l.absenceTotal}
                    value={loading ? <Shimmer className="h-5 w-8 rounded-md" /> : monthSummary.absenceCount} />
                </dl>
              </section>

              <section className="ws-panel min-w-0" aria-labelledby="salary-history-calendar-heading">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[12rem] flex-1">
                    <h3 id="salary-history-calendar-heading" className="ws-heading">{l.calendar}</h3>
                    <p className="ws-caption mt-0.5">{l.calendarHelp}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateView({ month: shiftSalaryHistoryMonth(visibleMonth, -1), day: '' })}
                      aria-label={l.previousMonth}
                      title={l.previousMonth}
                      className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
                    >
                      <ChevronLeft aria-hidden="true" />
                    </button>
                    <p className="min-w-[8.5rem] text-center text-sm font-semibold text-[#22201d]" aria-live="polite">{monthLabel}</p>
                    <button
                      type="button"
                      onClick={() => updateView({ month: shiftSalaryHistoryMonth(visibleMonth, 1), day: '' })}
                      aria-label={l.nextMonth}
                      title={l.nextMonth}
                      className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
                    >
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Seven columns at every width: dots on phones, short amounts from md, exact amounts in the day list. */}
                <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${l.calendar}: ${monthLabel}`}>
                  {l.weekdays.map(day => (
                    <div key={day} role="columnheader" className="ws-caption pb-1 text-center !text-xs">
                      {day}
                    </div>
                  ))}
                  {loading && Array.from({ length: 35 }, (_, index) => <Shimmer key={index} className="h-14 rounded-lg md:h-24" />)}
                  {!loading && calendarDays.map(day => {
                    const selected = selectedDate === day.date
                    const absent = day.entryTypes.includes('absence')
                    const statusLabel = day.inMonth && day.workStatus ? workStatusLabels[day.workStatus] : ''
                    return (
                      <button
                        key={day.date}
                        type="button"
                        role="gridcell"
                        aria-label={`${formatLongDate(day.date, lang, day.date)}${statusLabel ? ` · ${statusLabel}` : ''} · ${formatRecordCount(day.entries.length, lang)}`}
                        aria-current={day.isToday ? 'date' : undefined}
                        aria-pressed={selected}
                        onClick={() => selectCalendarDay(day)}
                        className={`flex min-h-14 min-w-0 flex-col items-center gap-1 rounded-lg border p-1 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a00] md:min-h-24 md:items-stretch md:p-1.5 ${
                          selected
                            ? 'border-[#cc4800] bg-[#fff1e8] text-[#22201d] ring-2 ring-[#ff5a00]/40'
                            : absent
                              ? 'border-[#9a5a00]/40 bg-[#f6f5f3] text-[#22201d] hover:bg-[#ebe8e5]'
                              : day.isToday
                                ? 'border-[#ff5a00]/60 bg-white text-[#bf4300] hover:bg-[#fff1e8]'
                                : day.inMonth
                                  ? 'border-transparent bg-[#f6f5f3] text-[#22201d] hover:bg-[#ebe8e5]'
                                  : 'border-transparent bg-transparent text-[#68655f] hover:bg-[#f6f5f3]'
                        }`}
                      >
                        <span className="md:text-left">{day.day}</span>
                        {day.inMonth && <CalendarWorkStatus status={day.workStatus} checkin={day.checkin} labels={l} />}
                        <CalendarDaySummary entries={day.entries} labels={l} lang={lang} />
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#e4e1de] pt-4 text-xs text-[#68655f]">
                  {[
                    ['payment', l.payment],
                    ['bonus', l.bonus],
                    ['kpi', l.kpiBonusTotal],
                    ['fine', l.fine],
                  ].map(([type, label]) => (
                    <span key={type} className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${type === 'kpi' ? 'ring-1 ring-[#1d7a52] ring-offset-1' : ''} ${SALARY_ENTRY_TONES[type].dot}`} aria-hidden="true" />{label}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-[#1d7a52]" aria-hidden="true" />{l.worked} · {loading ? '…' : workStatusCounts.worked}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarX2 size={12} className={SALARY_ENTRY_TONES.absence.text} aria-hidden="true" />{l.absence} · {loading ? '…' : workStatusCounts.absent}
                  </span>
                  {workStatusCounts.noCheckin > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <CircleDashed size={12} aria-hidden="true" />{l.noCheckin} · {workStatusCounts.noCheckin}
                    </span>
                  )}
                </div>
              </section>

              <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <section className="ws-panel min-w-0" aria-labelledby="salary-history-activity-heading">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 id="salary-history-activity-heading" className="ws-heading">
                        {selectedDate ? l.selectedDayActivity : l.monthActivity}
                      </h3>
                      <p className="ws-caption mt-0.5">
                        {selectedDate ? formatLongDate(selectedDate, lang, selectedDate) : monthLabel}
                        {!loading && <> · {formatRecordCount(visibleEntries.length, lang)}</>}
                      </p>
                    </div>
                    {selectedDate && (
                      <button type="button" onClick={() => updateView({ day: '' })} className="ws-btn ws-btn-outline ws-btn-sm">
                        <X aria-hidden="true" />{l.clearDay}
                      </button>
                    )}
                  </div>

                  <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={l.monthActivity}>
                    {filters.map(filter => {
                      const active = activeType === filter.key
                      return (
                        <button
                          key={filter.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateView({ type: filter.key })}
                          className={`ws-btn ws-btn-sm ${active ? 'ws-btn-primary' : 'ws-btn-outline'}`}
                        >
                          {filter.label}
                          {!loading && <span className={`ws-count ${active ? '!bg-white/20 !text-white' : ''}`}>{typeCounts[filter.key]}</span>}
                        </button>
                      )
                    })}
                  </div>

                  {loading ? (
                    <div className="space-y-2" role="status" aria-busy="true">
                      <span className="sr-only">{l.loadingTitle}</span>
                      {Array.from({ length: 4 }, (_, index) => <Shimmer key={index} className="h-16 w-full rounded-lg" />)}
                    </div>
                  ) : entryGroups.length === 0 ? (
                    <div className="ws-empty"><CalendarDays aria-hidden="true" /><p>{l.empty}</p></div>
                  ) : (
                    <div className="space-y-5">
                      {entryGroups.map(group => (
                        <div key={group.date}>
                          <div className="mb-2 flex items-center gap-3">
                            <p className="ws-caption flex-shrink-0 font-medium">{formatLongDate(group.date, lang, group.date)}</p>
                            <span className="h-px flex-1 bg-[#e4e1de]" />
                            <span className="ws-count">{group.entries.length}</span>
                          </div>
                          <div className="space-y-2">
                            {group.entries.map(entry => (
                              <HistoryEntryCard
                                key={`${entry.entryType}-${entry.id}`}
                                entry={entry}
                                lang={lang}
                                labels={l}
                                canDelete={canDeleteHistory && entry.paymentMethod !== 'salary'}
                                confirming={confirmActionKey === `${entry.entryType}-history-delete-${entry.id}`}
                                saving={saving === `${entry.entryType}-history-delete-${entry.id}`}
                                onDelete={() => deleteHistoryEntry(entry)}
                                onCancelDelete={() => setConfirmActionKey('')}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!loading && pageCount > 1 && (
                    <nav aria-label={l.monthActivity} className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e4e1de] pt-4">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage(current => Math.max(1, current - 1))}
                        className="ws-btn ws-btn-outline ws-btn-sm"
                      >
                        <ChevronLeft aria-hidden="true" />{l.previous}
                      </button>
                      <span className="ws-caption tabular-nums">{l.page} {page} {l.of} {pageCount}</span>
                      <button
                        type="button"
                        disabled={page >= pageCount}
                        onClick={() => setPage(current => Math.min(pageCount, current + 1))}
                        className="ws-btn ws-btn-outline ws-btn-sm"
                      >
                        {l.next}<ChevronRight aria-hidden="true" />
                      </button>
                    </nav>
                  )}
                </section>

                {employee ? (
                  <SalaryRateHistory employeeId={employeeId} rates={employee.rates} lang={lang}
                    canDelete={canDeleteHistory} onDelete={deleteHistoryEntry}
                    onCancelDelete={() => setConfirmActionKey('')}
                    confirmActionKey={confirmActionKey} saving={saving} actionLabels={l} actionError={errorText} />
                ) : (
                  <div className="ws-panel space-y-3" aria-hidden="true">
                    <Shimmer className="h-5 w-40 rounded-md" />
                    {Array.from({ length: 3 }, (_, index) => <Shimmer key={index} className="h-12 w-full rounded-lg" />)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {errorText && employee && (
        <div role="alert" aria-live="assertive" className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-toast mx-auto flex max-w-xl items-start gap-3 rounded-xl border border-[#c4262c]/40 bg-white px-4 py-3 text-sm font-medium text-[#c4262c] shadow-lg">
          <p className="min-w-0 flex-1 break-words">{errorText}</p>
          <button type="button" onClick={() => setError('')} aria-label={l.dismiss} className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"><X aria-hidden="true" /></button>
        </div>
      )}
    </AppShell>
  )
}

function SummaryItem({ icon: Icon, label, value, tone = '', chip = '' }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 sm:flex-col sm:justify-start">
      <dt className="ws-caption flex min-w-0 items-center gap-1.5">
        <Icon size={14} className={`flex-shrink-0 self-center ${tone ? SALARY_ENTRY_TONES[tone].text : ''}`} aria-hidden="true" />{label}
      </dt>
      <dd className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1 sm:justify-start">
        <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-[#22201d]">{value}</span>
        {chip && <span className="ws-badge ws-tone-caution tabular-nums">{chip}</span>}
      </dd>
    </div>
  )
}

// Absent days already carry the absence mark, so only worked/no check-in get a line here.
function CalendarWorkStatus({ status, checkin, labels }) {
  if (status !== 'worked' && status !== 'noCheckin') return null
  const worked = status === 'worked'
  const Icon = worked ? CheckCircle2 : CircleDashed
  return (
    <span className={`flex min-w-0 items-center gap-1 text-xs font-medium ${worked ? 'text-[#1d7a52]' : 'text-[#68655f]'}`}>
      <Icon size={12} className="shrink-0" aria-hidden="true" />
      <span className="hidden truncate md:inline">
        {worked ? `${labels.worked}${checkin?.checked_in_at ? ` · ${formatTime(checkin.checked_in_at)}` : ''}` : labels.noCheckin}
      </span>
    </span>
  )
}

const CALENDAR_CATEGORIES = ['payment', 'bonus', 'kpi', 'fine', 'absence']

// A day cell is too narrow for a full amount, so it carries a dot per kind on phones and a short
// figure from md ("+67,8 ming"). The exact amounts are in the list under the calendar.
function CalendarDaySummary({ entries, labels, lang }) {
  const groups = CALENDAR_CATEGORIES.map(key => {
    const records = entries.filter(entry => key === 'kpi'
      ? entry.entryType === 'bonus' && entry.automaticKpi
      : entry.entryType === key && !(key === 'bonus' && entry.automaticKpi))
    if (!records.length) return null
    const amount = records.reduce((total, entry) => total + entry.amount, 0)
    const text = key === 'absence'
      ? labels.absence
      : formatCompactCurrency(key === 'fine' ? -amount : amount, lang, { signed: key === 'bonus' || key === 'kpi' })
    return { key, text, tone: SALARY_ENTRY_TONES[key] }
  }).filter(Boolean)
  if (!groups.length) return null
  return (
    <>
      <span className="flex flex-wrap justify-center gap-1 md:hidden" aria-hidden="true">
        {groups.map(group => <span key={group.key} className={`h-1.5 w-1.5 rounded-full ${group.tone.dot}`} />)}
      </span>
      <span className="hidden w-full flex-col gap-1 text-left md:flex" aria-hidden="true">
        {groups.map(group => (
          <span key={group.key} className={`block whitespace-nowrap rounded-md px-1 py-0.5 text-xs font-semibold tabular-nums ${group.tone.badge}`}>
            {group.text}
          </span>
        ))}
      </span>
    </>
  )
}

const ENTRY_ICONS = { payment: Banknote, bonus: Gift, fine: BadgeMinus, absence: CalendarX2 }

function HistoryEntryCard({ entry, lang, labels, canDelete, confirming, saving, onDelete, onCancelDelete }) {
  const tone = salaryEntryTone(entry.entryType)
  const Icon = ENTRY_ICONS[entry.entryType] || Banknote
  const label = labels[entry.entryType]
  const detail = entry.detail
    || (entry.entryType === 'bonus' && entry.accruesToSalary
      ? ''
      : entry.paymentMethod ? expensePaymentMethodLabel(entry.paymentMethod, lang) : '')

  return (
    <article className={`rounded-lg border-l-4 bg-[#f6f5f3] p-3 ${tone.border}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white ${tone.text}`}>
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={`ws-badge ${tone.badge}`}>{label}</span>
              {entry.automaticKpi && <span className="ws-badge">{labels.automaticKpi}</span>}
              {entry.entryType === 'bonus' && entry.accruesToSalary && (
                <span className="ws-badge !whitespace-normal">{labels.accruedToSalary}</span>
              )}
              {entry.createdAt && <span className="ws-caption !text-xs tabular-nums">{formatTime(entry.createdAt, '—')}</span>}
            </div>
            {entry.entryType !== 'absence' && (
              <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${entry.entryType === 'payment' ? 'text-[#22201d]' : tone.text}`}>
                {formatSalaryEntryAmount(entry.entryType, entry.amount)}
              </span>
            )}
          </div>
          {detail && <p className="ws-caption mt-1.5 break-words">{detail}</p>}
          {entry.automaticKpi && entry.kpiResult && (
            <p className="mt-1.5 rounded-md bg-white px-2.5 py-2 text-xs leading-relaxed text-[#68655f]">
              {entry.kpiResult.start_time_snapshot != null && <span className="block">{formatKpiStartTime(entry.kpiResult.start_time_snapshot, lang)}</span>}
              {labels.kpiFormula}: <span className="whitespace-nowrap tabular-nums">{formatCurrency(entry.kpiResult.baseAmountUzs)}</span> × {formatKpiRatePercent(entry.kpiResult.rateBps, lang)} = <span className="whitespace-nowrap font-semibold tabular-nums text-[#22201d]">{formatCurrency(entry.kpiResult.bonusAmountUzs)}</span>
            </p>
          )}
          {canDelete && (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              {confirming && (
                <button type="button" onClick={onCancelDelete} disabled={saving} className="ws-btn ws-btn-outline ws-btn-sm">
                  {labels.cancel}
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                aria-label={confirming ? undefined : `${labels.delete}: ${label}`}
                title={confirming ? undefined : labels.delete}
                className={`ws-btn ws-btn-sm ${confirming ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger ws-btn-icon'}`}
              >
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                {confirming && labels.confirm}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
