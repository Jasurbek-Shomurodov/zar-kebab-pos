import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, Clock3, HandCoins, Loader2, ReceiptText, Search, ShoppingBasket, Trash2, Users, UtensilsCrossed, WalletCards } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { Kpi } from '../components/AccountingKpi'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { retractTelegramSalaryEvent } from '../lib/telegramNotifications'
import { canEditFeature, canViewPage } from '../lib/permissions'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate, formatTime } from '../lib/dateFormat'
import { collectPagedRows, loadPaidOrdersForRange, mergePaidOrderHistory } from '../lib/orderHistory'
import {
  collapseDailyBazaarExpenseRows,
  filterAccountingHistoryRows,
  getAccountingHistoryDeleteTarget,
  getAccountingHistoryPageSummary,
  groupAccountingHistoryRows,
} from '../lib/accounting'
import {
  buildFinalizedEmployeeMealExpenseRows,
  buildSalaryBonusExpenseRows,
  buildSalaryPaymentExpenseRows,
  EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  expenseDescriptionLabel,
  expensePaymentMethodLabel,
  getAccountingHistoryRange,
  normalizeExpenseEntryType,
} from '../lib/expenses'

const EXPENSE_COLUMNS = 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by_name, created_at'
const SALARY_PROFILE_COLUMNS = 'id, profile_id, employee_name, payment_method, joined_at, ended_at, deleted_at, is_active'
const SALARY_PAYMENT_COLUMNS = 'id, salary_profile_id, paid_date, amount, payment_method, note, created_by_name, created_at'
const SALARY_BONUS_COLUMNS = 'id, salary_profile_id, bonus_date, amount, payment_method, note, created_by_name, created_at, accrues_to_salary'
const SALARY_ABSENCE_COLUMNS = 'id, salary_profile_id, absence_date'
function expenseTone(row) {
  if (normalizeExpenseEntryType(row.entry_type) === 'income') {
    return { row: 'border-l-purple-500 bg-purple-50/30', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' }
  }
  if (row.is_salary_payment || row.is_salary_bonus || String(row.category || '').startsWith('salary_')) {
    return { row: 'border-l-red-500 bg-red-50/30', text: 'text-red-700', badge: 'bg-red-100 text-red-700' }
  }
  if (row.category === 'products_bazaar') {
    return { row: 'border-l-purple-500 bg-purple-50/30', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' }
  }
  return { row: 'border-l-orange-500 bg-orange-50/30', text: 'text-[#bf4300]', badge: 'bg-orange-100 text-orange-700' }
}

function composeSalaryProfiles(profiles, payments, bonuses, absences, team) {
  const teamById = Object.fromEntries(team.map(member => [member.id, member]))
  return profiles.map(profile => ({
    ...profile,
    profile: teamById[profile.profile_id] || null,
    payments: payments.filter(row => row.salary_profile_id === profile.id),
    bonuses: bonuses.filter(row => row.salary_profile_id === profile.id),
    absences: absences.filter(row => row.salary_profile_id === profile.id),
  }))
}

function loadPagedResult(loadPage) {
  return collectPagedRows(loadPage)
    .then(data => ({ data, error: null }))
    .catch(error => ({ data: [], error }))
}

function linkedHistoryDate(value) {
  const date = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? '' : date
}

export default function AccountingHistory() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const lang = state.lang || 'ru'
  const role = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const canDelete = canEditFeature(profile || { role }, 'expenses')
  const canAccessBazaar = canViewPage(profile || { role }, 'bazaar')
  const [expenseRows, setExpenseRows] = useState([])
  const [salaryRows, setSalaryRows] = useState([])
  const [paidHistoryOrders, setPaidHistoryOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [salaryLoading, setSalaryLoading] = useState(true)
  const [orderLoading, setOrderLoading] = useState(true)
  // Each source keeps its own failure flag: a total built on a failed read prints "—", never 0.
  const [failed, setFailed] = useState({ expenses: false, salary: false, orders: false })
  // Stored as a code and translated at render, so a language switch never leaves an old-language message.
  const [actionError, setActionError] = useState('')
  const loadRequestRef = useRef(0)
  const requestedType = searchParams.get('type')
  const requestedCategory = searchParams.get('category')
  const requestedFrom = linkedHistoryDate(searchParams.get('from'))
  const requestedTo = linkedHistoryDate(searchParams.get('to'))
  const hasLinkedRange = Boolean(requestedFrom && requestedTo && requestedFrom <= requestedTo)
  const expenseCategoryKeys = useMemo(() => new Set(EXPENSE_CATEGORIES.map(item => item.key)), [])
  const [query, setQuery] = useState(() => searchParams.get('query') || '')
  const [type, setType] = useState(() => ['all', 'expense', 'income'].includes(requestedType) ? requestedType : 'all')
  const [category, setCategory] = useState(() => (requestedCategory === 'salaries' || expenseCategoryKeys.has(requestedCategory)) ? requestedCategory : 'all')
  const [period, setPeriod] = useState(() => hasLinkedRange ? 'linked' : 'thisMonth')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const { dateFrom, dateTo } = useMemo(
    () => period === 'linked'
      ? { dateFrom: requestedFrom, dateTo: requestedTo }
      : getAccountingHistoryRange(period),
    [period, requestedFrom, requestedTo]
  )


  const labels = {
    uz: { entries: 'Yozuvlar', retry: 'Qayta urinish', loadFailedHint: 'Ulanishni tekshirib, qayta urinib ko‘ring. Yuklanmagan summalar «—» bilan ko‘rsatiladi.', telegramRemoveFailed: 'Telegram xabarini olib tashlab bo‘lmadi, yozuv saqlab qolindi. Qayta urinib ko‘ring.', period: 'Davr', type: 'Yozuv turi', dayTotals: 'Kun yakunlari', allSalaries: 'Barcha maoshlar', title: 'Barcha buxgalteriya', back: 'Buxgalteriyaga qaytish', search: 'Qidirish', all: 'Barchasi', expense: 'Xarajat', income: 'Daromad', thisMonth: 'Bu oy', lastMonth: 'O‘tgan oy', allTime: 'Barcha vaqt', date: 'Sana va vaqt', category: 'Kategoriya', method: 'To‘lov turi', vendor: 'Yetkazuvchi / xodim', description: 'Izoh', author: 'Kiritgan', amount: 'Summa', actions: 'Amallar', remove: 'O‘chirish', confirmRemove: 'Tasdiqlash', removing: 'O‘chirilmoqda…', removeFailed: 'Yozuvni o‘chirib bo‘lmadi.', manageBazaar: 'Kunlik bozorda boshqarish', bazaarManaged: 'Kunlik bozorda boshqariladi', totalExpenses: 'Jami xarajat', salaryExpenses: 'Maosh xarajatlari', employeeMeals: 'Xodimlar ovqati', productBazaarExpenses: 'Mahsulot / bozor xarajatlari', otherExpenses: 'Boshqa xarajatlar', investorSupport: 'Investor yordami', cafeIncome: 'Kafe daromadi', loyaltyIncome: 'Loyallik daromadi', investorIncome: 'Investor yordami', empty: 'Yozuv topilmadi', loadFailed: 'Buxgalteriya tarixini yuklab bo‘lmadi', salaryPayment: 'Maosh to‘lovi', salaryBonus: 'Maosh bonusi' },
    ru: { entries: 'Записей', retry: 'Повторить', loadFailedHint: 'Проверьте соединение и повторите. Незагруженные суммы показаны как «—».', telegramRemoveFailed: 'Не удалось убрать сообщение в Telegram, запись сохранена. Повторите попытку.', period: 'Период', type: 'Тип записи', dayTotals: 'Итоги дня', allSalaries: 'Все зарплаты', title: 'Вся бухгалтерия', back: 'Назад к бухгалтерии', search: 'Поиск', all: 'Все', expense: 'Расход', income: 'Доход', thisMonth: 'Этот месяц', lastMonth: 'Прошлый месяц', allTime: 'За всё время', date: 'Дата и время', category: 'Категория', method: 'Способ оплаты', vendor: 'Поставщик / сотрудник', description: 'Описание', author: 'Добавил', amount: 'Сумма', actions: 'Действия', remove: 'Удалить', confirmRemove: 'Подтвердить', removing: 'Удаление…', removeFailed: 'Не удалось удалить запись.', manageBazaar: 'Управлять в Ежедневном базаре', bazaarManaged: 'Управляется в Ежедневном базаре', totalExpenses: 'Всего расходов', salaryExpenses: 'Расходы на зарплаты', employeeMeals: 'Питание сотрудников', productBazaarExpenses: 'Расходы на продукты / базар', otherExpenses: 'Остальные расходы', investorSupport: 'Поддержка инвестора', cafeIncome: 'Доход кафе', loyaltyIncome: 'Доход по лояльности', investorIncome: 'Поддержка инвестора', empty: 'Записей не найдено', loadFailed: 'Не удалось загрузить историю бухгалтерии', salaryPayment: 'Выплата зарплаты', salaryBonus: 'Бонус к зарплате' },
    en: { entries: 'Entries', retry: 'Retry', loadFailedHint: 'Check the connection and try again. Totals that did not load are shown as “—”.', telegramRemoveFailed: 'Could not remove the Telegram message, so the entry was kept. Try again.', period: 'Period', type: 'Entry type', dayTotals: 'Day totals', allSalaries: 'All salaries', title: 'All accounting', back: 'Back to accounting', search: 'Search', all: 'All', expense: 'Expense', income: 'Income', thisMonth: 'This month', lastMonth: 'Last month', allTime: 'All time', date: 'Date and time', category: 'Category', method: 'Payment method', vendor: 'Vendor / employee', description: 'Description', author: 'Added by', amount: 'Amount', actions: 'Actions', remove: 'Delete', confirmRemove: 'Confirm', removing: 'Deleting…', removeFailed: 'Could not delete the entry.', manageBazaar: 'Manage in Daily Bazaar', bazaarManaged: 'Managed in Daily Bazaar', totalExpenses: 'Total expenses', salaryExpenses: 'Salary expenses', employeeMeals: 'Employee meals', productBazaarExpenses: 'Products / bazaar expenses', otherExpenses: 'Other expenses', investorSupport: 'Investor support', cafeIncome: 'Cafe income', loyaltyIncome: 'Loyalty income', investorIncome: 'Investor support', empty: 'No entries found', loadFailed: 'Could not load accounting history', salaryPayment: 'Salary payment', salaryBonus: 'Salary bonus' },
  }
  const l = labels[lang] || labels.en

  // Depends on the dates only: labels and language stay out, so a language switch never refetches.
  const load = useCallback(async () => {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    const active = () => loadRequestRef.current === requestId
    setLoading(true)
    setSalaryLoading(true)
    setOrderLoading(true)
    setFailed({ expenses: false, salary: false, orders: false })
    setActionError('')
    const expensePromise = loadPagedResult((from, to) => supabase.from('expenses').select(EXPENSE_COLUMNS).gte('expense_date', dateFrom).lte('expense_date', dateTo).order('expense_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to))
    const salaryPromise = Promise.all([
      loadPagedResult((from, to) => supabase.from('employee_salary_profiles').select(SALARY_PROFILE_COLUMNS).order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_payments').select(SALARY_PAYMENT_COLUMNS).gte('paid_date', dateFrom).lte('paid_date', dateTo).order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_bonuses').select(SALARY_BONUS_COLUMNS).gte('bonus_date', dateFrom).lte('bonus_date', dateTo).order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_absences').select(SALARY_ABSENCE_COLUMNS).gte('absence_date', dateFrom).lte('absence_date', dateTo).order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('profiles').select('id, full_name, email, role, status').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_daily_meal_expenses').select('business_date, average_daily_amount, present_employee_count, total_amount, source_type, finalized_at, created_at').gte('business_date', dateFrom).lte('business_date', dateTo).order('business_date', { ascending: false }).range(from, to)),
    ])
    const orderPromise = loadPaidOrdersForRange(dateFrom, dateTo)
      .then(data => ({ data, error: null }))
      .catch(error => ({ data: [], error }))

    await Promise.all([
      expensePromise.then(expenseResult => {
        if (!active()) return
        if (expenseResult.error) console.error('[accounting-history] expenses load failed:', expenseResult.error)
        setExpenseRows(expenseResult.error ? [] : expenseResult.data || [])
        setFailed(current => ({ ...current, expenses: Boolean(expenseResult.error) }))
        setLoading(false)
      }),
      salaryPromise.then(([profileResult, paymentResult, bonusResult, absenceResult, teamResult, employeeMealResult]) => {
        if (!active()) return
        const salaryError = [profileResult, paymentResult, bonusResult, absenceResult, teamResult, employeeMealResult].find(result => result.error)?.error
        if (salaryError) {
          console.error('[accounting-history] salary load failed:', salaryError)
          setSalaryRows([])
          setFailed(current => ({ ...current, salary: true }))
          setSalaryLoading(false)
          return
        }
        const salaryProfiles = composeSalaryProfiles(
          profileResult.data || [],
          paymentResult.data || [],
          bonusResult.data || [],
          absenceResult.data || [],
          teamResult.data || [],
        )
        const salaryPayments = buildSalaryPaymentExpenseRows(salaryProfiles, dateFrom, dateTo)
        const salaryBonuses = buildSalaryBonusExpenseRows(salaryProfiles, dateFrom, dateTo)
        const employeeMeals = buildFinalizedEmployeeMealExpenseRows(employeeMealResult.data || [])
        setSalaryRows([...salaryPayments, ...salaryBonuses, ...employeeMeals])
        setSalaryLoading(false)
      }),
      orderPromise.then(orderHistoryResult => {
        if (!active()) return
        if (orderHistoryResult.error) console.error('[accounting-history] paid orders load failed:', orderHistoryResult.error)
        setPaidHistoryOrders(orderHistoryResult.error ? [] : orderHistoryResult.data || [])
        setFailed(current => ({ ...current, orders: Boolean(orderHistoryResult.error) }))
        setOrderLoading(false)
      }),
    ])
  }, [dateFrom, dateTo])

  useEffect(() => {
    load()
    return () => { loadRequestRef.current += 1 }
  }, [load])

  const rows = useMemo(() => (
    [...expenseRows, ...salaryRows]
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
  ), [expenseRows, salaryRows])

  const displayRows = useMemo(() => collapseDailyBazaarExpenseRows(rows), [rows])

  const visibleRows = useMemo(() => {
    return filterAccountingHistoryRows(displayRows, { type, category, query, lang })
  }, [displayRows, query, type, category, lang])

  const accountingOrders = useMemo(
    () => mergePaidOrderHistory(paidHistoryOrders, state.orders, dateFrom, dateTo),
    [paidHistoryOrders, state.orders, dateFrom, dateTo]
  )

  const {
    expenseSummary,
    cafeIncomeSummary,
    investorSupportTotal,
    salaryExpensesTotal,
    employeeMealExpensesTotal,
    productBazaarExpensesTotal,
    otherExpensesTotal,
  } = useMemo(
    () => getAccountingHistoryPageSummary(rows, accountingOrders, dateFrom, dateTo),
    [rows, accountingOrders, dateFrom, dateTo]
  )
  const rowsByDate = useMemo(
    () => groupAccountingHistoryRows(visibleRows, rows, accountingOrders),
    [visibleRows, rows, accountingOrders]
  )

  const anyFailed = failed.expenses || failed.salary || failed.orders
  // A figure is printed only when every source it adds up has arrived; otherwise it is unknown.
  const expensesKnown = !loading && !failed.expenses
  const salaryKnown = !salaryLoading && !failed.salary
  const ordersKnown = !orderLoading && !failed.orders
  const money = (known, amount) => known ? formatCurrency(amount) : '—'

  async function removeRow(row) {
    if (!canDelete || deletingId || !row?.id) return
    if (confirmDeleteId !== row.id) {
      setConfirmDeleteId(row.id)
      return
    }

    const target = getAccountingHistoryDeleteTarget(row)
    if (!target) return
    setDeletingId(row.id)
    setActionError('')
    // Salary payments and bonuses were announced in Telegram: take that message back first,
    // exactly as the employee history page does, and keep the record if the cleanup fails.
    const salaryEventType = target.table === 'employee_salary_payments' ? 'payment' : target.table === 'employee_salary_bonuses' ? 'bonus' : ''
    if (salaryEventType) {
      try {
        await retractTelegramSalaryEvent(salaryEventType, target.id)
      } catch (telegramError) {
        console.error('[accounting-history] Telegram retraction failed:', telegramError)
        setDeletingId('')
        setConfirmDeleteId('')
        setActionError('telegramRemoveFailed')
        return
      }
    }
    const { data, error: deleteError } = await supabase
      .from(target.table)
      .delete()
      .eq('id', target.id)
      .select('id')
    setDeletingId('')

    if (deleteError || !data?.length) {
      if (deleteError) console.error('[accounting-history] delete failed:', deleteError)
      setActionError('removeFailed')
      return
    }

    setConfirmDeleteId('')
    if (target.table === 'expenses') {
      setExpenseRows(current => current.filter(item => item.id !== row.id))
    } else {
      setSalaryRows(current => current.filter(item => item.id !== row.id))
    }
  }

  const headings = [l.date, l.expense, l.category, l.amount, l.method, l.vendor, l.description, l.author, ...(canDelete ? [l.actions] : [])]

  return (
    <AppShell title={l.title} back={{ label: l.back, onClick: () => navigate('/admin/accounting') }}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          <section className="flex flex-wrap items-center gap-3" aria-label={l.title}>
            <p className="ws-caption mr-auto tabular-nums">
              {l.entries}: {loading ? '—' : visibleRows.length}
              {period === 'linked' && <> · {formatLongDate(dateFrom, lang, dateFrom)} — {formatLongDate(dateTo, lang, dateTo)}</>}
            </p>
            <div role="group" aria-label={l.period} className="ws-segmented">
              {['thisMonth', 'lastMonth', 'allTime'].map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{l[value]}</button>)}
            </div>
            <div role="group" aria-label={l.type} className="ws-segmented">
              {['all', 'expense', 'income'].map(value => <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)}>{l[value]}</button>)}
            </div>
            <select
              aria-label={l.category}
              value={category}
              onChange={event => {
                const nextCategory = event.target.value
                setCategory(nextCategory)
                if (nextCategory !== 'all') setType('expense')
              }}
              className="ws-input !w-auto min-w-[210px] flex-1 sm:flex-none"
            >
              <option value="all">{l.all} — {l.category}</option>
              <option value="salaries">{l.allSalaries}</option>
              {EXPENSE_CATEGORIES.map(item => (
                <option key={item.key} value={item.key}>{expenseCategoryLabel(item.key, lang)}</option>
              ))}
            </select>
            <label className="relative min-w-[210px] flex-1 sm:max-w-[280px]">
              <span className="sr-only">{l.search}</span>
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder={l.search} className="ws-input !pl-9" />
            </label>
          </section>

          {/* The tiles wrap by their own width, so an amount never splits from its unit beside the sidebar. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(13.5rem,1fr))] gap-3">
            <Kpi loading={orderLoading} icon={Banknote} label={l.cafeIncome} value={money(ordersKnown, cafeIncomeSummary.total)} sub={ordersKnown && cafeIncomeSummary.loyaltyTotal > 0 ? `${l.loyaltyIncome}: ${formatCurrency(cafeIncomeSummary.loyaltyTotal)}` : ''} tone="green" emphasizeValue />
            <Kpi loading={loading || salaryLoading} icon={ReceiptText} label={l.totalExpenses} value={money(expensesKnown && salaryKnown, expenseSummary.total)} tone="red" emphasizeValue />
            <Kpi loading={salaryLoading} icon={Users} label={l.salaryExpenses} value={money(salaryKnown, salaryExpensesTotal)} tone="red" emphasizeValue />
            <Kpi loading={salaryLoading} icon={UtensilsCrossed} label={l.employeeMeals} value={money(salaryKnown, employeeMealExpensesTotal)} tone="blue" />
            <Kpi loading={loading} icon={ShoppingBasket} label={l.productBazaarExpenses} value={money(expensesKnown, productBazaarExpensesTotal)} tone="blue" />
            <Kpi loading={loading} icon={WalletCards} label={l.otherExpenses} value={money(expensesKnown, otherExpensesTotal)} tone="orange" emphasizeValue />
            <Kpi loading={loading} icon={HandCoins} label={l.investorSupport} value={money(expensesKnown, investorSupportTotal)} tone="blue" />
          </div>

          {anyFailed && !failed.expenses && (
            <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-3">
              <span>{l.loadFailed}. {l.loadFailedHint}</span>
              <button type="button" onClick={load} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>
            </div>
          )}
          {actionError && <div role="alert" className="ws-notice ws-tone-negative">{l[actionError] || l.removeFailed}</div>}

          <section className="ws-panel ws-panel-flush">
            {loading ? <OperationalLoading title={l.title} layout="table" /> : failed.expenses ? (
              <OperationalError lang={lang} title={l.loadFailed} description={l.loadFailedHint} actionLabel={l.retry} onAction={load} />
            ) : visibleRows.length === 0 ? <div className="ws-empty">{l.empty}</div> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left">
                  <thead className="ws-table-head"><tr>{headings.map(heading => <th key={heading} scope="col" className={`px-4 py-3 font-medium ${heading === l.amount ? 'text-right' : ''}`}>{heading}</th>)}</tr></thead>
                  {rowsByDate.map(group => (
                    <tbody key={group.date}>
                      <tr className="bg-[#efece9]">
                        <td colSpan={headings.length} className="border-y border-[#e4e1de] px-4 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-[#22201d]">{formatLongDate(group.date, lang, group.date)}</span>
                              <span className="ws-count">{group.rows.length}</span>
                            </div>
                            <div aria-label={l.dayTotals} className="flex flex-wrap items-center gap-2 tabular-nums">
                              <span className="ws-badge ws-tone-positive whitespace-nowrap">{l.cafeIncome}: {ordersKnown ? formatCurrency(group.cafeIncome) : '—'}</span>
                              {ordersKnown && group.loyaltyIncome > 0 && <span className="ws-badge ws-tone-caution whitespace-nowrap">{l.loyaltyIncome}: {formatCurrency(group.loyaltyIncome)}</span>}
                              {salaryKnown
                                ? <span className="ws-badge ws-tone-negative whitespace-nowrap">{l.totalExpenses}: {formatCurrency(group.totalExpenses)}</span>
                                : <span className="ws-badge whitespace-nowrap">{l.totalExpenses}: —</span>}
                              <span className="ws-badge ws-tone-info whitespace-nowrap">{l.investorIncome}: {formatCurrency(group.investorIncome)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {group.rows.map(row => {
                        const isIncome = normalizeExpenseEntryType(row.entry_type) === 'income'
                        const category = row.is_salary_payment ? l.salaryPayment : row.is_salary_bonus ? l.salaryBonus : expenseCategoryLabel(row.category, lang)
                        const tone = expenseTone(row)
                        const dailyBazaarTotal = row.is_bazaar_daily_total
                        return <tr key={`${row.id}-${row.expense_date}`} className={`border-b border-l-4 border-[#e4e1de] last:border-b-0 ${tone.row}`}>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[#22201d]">
                            <span className="block">{formatLongDate(row.expense_date, lang, row.expense_date)}</span>
                            <span className="ws-caption mt-1 inline-flex items-center gap-1"><Clock3 size={12} aria-hidden="true" />{formatTime(row.created_at, '—')}</span>
                          </td>
                          <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${tone.badge}`}>{isIncome ? l.income : l.expense}</span></td>
                          <td className={`px-4 py-3 text-sm font-medium ${tone.text}`}>{category}</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums ${tone.text}`}>{formatCurrency(row.amount)}</td>
                          <td className="px-4 py-3 text-sm text-[#22201d]">{expensePaymentMethodLabel(row.payment_method, lang)}</td>
                          <td className="max-w-[220px] px-4 py-3 text-sm text-[#22201d]">{row.vendor || '—'}</td>
                          <td className="min-w-[11rem] max-w-[260px] break-words px-4 py-3 text-sm text-[#22201d]">{expenseDescriptionLabel(row.description, lang) || (row.is_salary_payment ? l.salaryPayment : row.is_salary_bonus ? l.salaryBonus : '—')}</td>
                          <td className="px-4 py-3 text-sm text-[#68655f]">{row.created_by_name || '—'}</td>
                          {canDelete && <td className="px-4 py-3">
                            {dailyBazaarTotal ? (
                              canAccessBazaar ? (
                                <button type="button" onClick={() => navigate('/admin/bazaar')} className="ws-btn ws-btn-outline ws-btn-sm whitespace-nowrap">
                                  {l.manageBazaar}
                                </button>
                              ) : (
                                <span className="ws-caption">{l.bazaarManaged}</span>
                              )
                            ) : getAccountingHistoryDeleteTarget(row) ? <button
                              type="button"
                              disabled={Boolean(deletingId)}
                              onClick={() => removeRow(row)}
                              className={`ws-btn ws-btn-sm whitespace-nowrap ${confirmDeleteId === row.id ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'}`}
                            >
                              {deletingId === row.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} />}
                              {deletingId === row.id ? l.removing : confirmDeleteId === row.id ? l.confirmRemove : l.remove}
                            </button> : null}
                          </td>}
                        </tr>
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
