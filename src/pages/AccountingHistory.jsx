import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Clock3, Search, Tag, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
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
  return { row: 'border-l-orange-500 bg-orange-50/30', text: 'text-[#ff5a00]', badge: 'bg-orange-100 text-orange-700' }
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
  const [error, setError] = useState('')
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
    uz: { allSalaries: 'Barcha maoshlar', title: 'Barcha buxgalteriya', back: 'Buxgalteriyaga qaytish', search: 'Qidirish', all: 'Barchasi', expense: 'Xarajat', income: 'Daromad', thisMonth: 'Bu oy', lastMonth: 'O‘tgan oy', allTime: 'Barcha vaqt', date: 'Sana va vaqt', category: 'Kategoriya', method: 'To‘lov turi', vendor: 'Yetkazuvchi / xodim', description: 'Izoh', author: 'Kiritgan', amount: 'Summa', actions: 'Amallar', remove: 'O‘chirish', confirmRemove: 'Tasdiqlash', removing: 'O‘chirilmoqda...', removeFailed: 'Yozuvni o‘chirib bo‘lmadi.', manageBazaar: 'Kunlik bozorda boshqarish', bazaarManaged: 'Kunlik bozorda boshqariladi', totalExpenses: 'Jami xarajat', salaryExpenses: 'Maosh xarajatlari', employeeMeals: 'Xodimlar ovqati', productBazaarExpenses: 'Mahsulot / bozor xarajatlari', otherExpenses: 'Boshqa xarajatlar', investorSupport: 'Investor yordami', cafeIncome: 'Kafe daromadi', loyaltyIncome: 'Loyallik daromadi', investorIncome: 'Investor yordami', empty: 'Yozuv topilmadi', loadFailed: 'Buxgalteriya tarixini yuklab bo‘lmadi', salaryPayment: 'Maosh to‘lovi', salaryBonus: 'Maosh bonusi' },
    ru: { allSalaries: 'Все зарплаты', title: 'Вся бухгалтерия', back: 'Назад к бухгалтерии', search: 'Поиск', all: 'Все', expense: 'Расход', income: 'Доход', thisMonth: 'Этот месяц', lastMonth: 'Прошлый месяц', allTime: 'За всё время', date: 'Дата и время', category: 'Категория', method: 'Способ оплаты', vendor: 'Поставщик / сотрудник', description: 'Описание', author: 'Добавил', amount: 'Сумма', actions: 'Действия', remove: 'Удалить', confirmRemove: 'Подтвердить', removing: 'Удаление...', removeFailed: 'Не удалось удалить запись.', manageBazaar: 'Управлять в Ежедневном базаре', bazaarManaged: 'Управляется в Ежедневном базаре', totalExpenses: 'Всего расходов', salaryExpenses: 'Расходы на зарплаты', employeeMeals: 'Питание сотрудников', productBazaarExpenses: 'Расходы на продукты / базар', otherExpenses: 'Остальные расходы', investorSupport: 'Поддержка инвестора', cafeIncome: 'Доход кафе', loyaltyIncome: 'Доход по лояльности', investorIncome: 'Поддержка инвестора', empty: 'Записей не найдено', loadFailed: 'Не удалось загрузить историю бухгалтерии', salaryPayment: 'Выплата зарплаты', salaryBonus: 'Бонус к зарплате' },
    en: { allSalaries: 'All salaries', title: 'All accounting', back: 'Back to accounting', search: 'Search', all: 'All', expense: 'Expense', income: 'Income', thisMonth: 'This month', lastMonth: 'Last month', allTime: 'All time', date: 'Date and time', category: 'Category', method: 'Payment method', vendor: 'Vendor / employee', description: 'Description', author: 'Added by', amount: 'Amount', actions: 'Actions', remove: 'Delete', confirmRemove: 'Confirm', removing: 'Deleting...', removeFailed: 'Could not delete the entry.', manageBazaar: 'Manage in Daily Bazaar', bazaarManaged: 'Managed in Daily Bazaar', totalExpenses: 'Total expenses', salaryExpenses: 'Salary expenses', employeeMeals: 'Employees meal', productBazaarExpenses: 'Products / bazaar expenses', otherExpenses: 'Other expenses', investorSupport: 'Investor support', cafeIncome: 'Cafe income', loyaltyIncome: 'Loyalty income', investorIncome: 'Investor support', empty: 'No entries found', loadFailed: 'Could not load accounting history', salaryPayment: 'Salary payment', salaryBonus: 'Salary bonus' },
  }
  const l = labels[lang] || labels.en

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setSalaryLoading(true)
      setOrderLoading(true)
      setError('')
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
          if (!active) return
          setExpenseRows(expenseResult.error ? [] : expenseResult.data || [])
          if (expenseResult.error) setError(expenseResult.error.message || 'Could not load accounting history')
          setLoading(false)
        }),
        salaryPromise.then(([profileResult, paymentResult, bonusResult, absenceResult, teamResult, employeeMealResult]) => {
          if (!active) return
          const salaryError = [profileResult, paymentResult, bonusResult, absenceResult, teamResult, employeeMealResult].find(result => result.error)?.error
          if (salaryError) {
            setSalaryRows([])
            setError(salaryError.message || 'Could not load accounting history')
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
          if (!active) return
          setPaidHistoryOrders(orderHistoryResult.error ? [] : orderHistoryResult.data || [])
          if (orderHistoryResult.error) setError(orderHistoryResult.error.message || 'Could not load accounting history')
          setOrderLoading(false)
        }),
      ])
    }
    load()
    return () => { active = false }
  }, [dateFrom, dateTo])

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

  async function removeRow(row) {
    if (!canDelete || deletingId || !row?.id) return
    if (confirmDeleteId !== row.id) {
      setConfirmDeleteId(row.id)
      return
    }

    const target = getAccountingHistoryDeleteTarget(row)
    if (!target) return
    setDeletingId(row.id)
    setError('')
    const { data, error: deleteError } = await supabase
      .from(target.table)
      .delete()
      .eq('id', target.id)
      .select('id')
    setDeletingId('')

    if (deleteError || !data?.length) {
      setError(deleteError?.message || l.removeFailed)
      return
    }

    setConfirmDeleteId('')
    if (target.table === 'expenses') {
      setExpenseRows(current => current.filter(item => item.id !== row.id))
    } else {
      setSalaryRows(current => current.filter(item => item.id !== row.id))
    }
  }

  return (
    <AppShell title={l.title}>
      <div className="h-full overflow-y-auto bg-[#FAF7F0]">
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5 sm:py-6">
          <button onClick={() => navigate('/admin/accounting')} className="mb-4 inline-flex items-center gap-2 text-xs font-black text-[#6B7280] hover:text-[#ff5a00]"><ArrowLeft size={15} />{l.back}</button>
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
              <p className="mt-1 text-sm font-bold text-[#9CA3AF]">{visibleRows.length} {l.all.toLowerCase()}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1 rounded-xl border border-blue-100 bg-blue-50 p-1">
                {['thisMonth', 'lastMonth', 'allTime'].map(value => <button key={value} onClick={() => setPeriod(value)} className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${period === value ? 'bg-blue-600 text-white shadow-sm' : 'text-blue-700 hover:bg-white'}`}>{l[value]}</button>)}
              </div>
              {['all', 'expense', 'income'].map(value => <button key={value} onClick={() => setType(value)} className={`rounded-xl border px-3 py-2 text-xs font-black ${type === value ? 'border-[#ff5a00] bg-[#ff5a00] text-white' : 'border-[#E5E7EB] bg-white text-[#6B7280]'}`}>{l[value]}</button>)}
              <label className="flex min-w-[210px] items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2">
                <Tag size={15} className="flex-shrink-0 text-[#9CA3AF]" />
                <select
                  aria-label={l.category}
                  value={category}
                  onChange={event => {
                    const nextCategory = event.target.value
                    setCategory(nextCategory)
                    if (nextCategory !== 'all') setType('expense')
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#4B5563] outline-none"
                >
                  <option value="all">{l.all} — {l.category}</option>
                  <option value="salaries">{l.allSalaries}</option>
                  {EXPENSE_CATEGORIES.map(item => (
                    <option key={item.key} value={item.key}>{expenseCategoryLabel(item.key, lang)}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[240px] items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2">
                <Search size={15} className="text-[#9CA3AF]" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder={l.search} className="w-full bg-transparent text-sm font-semibold outline-none" />
              </label>
            </div>
          </div>
          {period === 'linked' && (
            <div className="mb-4 inline-flex rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
              {formatLongDate(dateFrom, lang, dateFrom)} — {formatLongDate(dateTo, lang, dateTo)}
            </div>
          )}
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#9CA3AF]">{l.cafeIncome}</p><p className="mt-1 text-2xl font-black text-emerald-600">{orderLoading ? '—' : formatCurrency(cafeIncomeSummary.total)}</p><p className="mt-1 text-xs font-bold text-amber-700">{orderLoading ? '' : `${l.loyaltyIncome}: ${formatCurrency(cafeIncomeSummary.loyaltyTotal)}`}</p></div>
            <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#9CA3AF]">{l.totalExpenses}</p><p className="mt-1 text-2xl font-black text-red-600">{loading || salaryLoading ? '—' : formatCurrency(expenseSummary.total)}</p></div>
            <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#9CA3AF]">{l.salaryExpenses}</p><p className="mt-1 text-2xl font-black text-red-600">{salaryLoading ? '—' : formatCurrency(salaryExpensesTotal)}</p></div>
            <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#9CA3AF]">{l.employeeMeals}</p><p className="mt-1 text-2xl font-black text-amber-700">{salaryLoading ? '—' : formatCurrency(employeeMealExpensesTotal)}</p></div>
            <div className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#9CA3AF]">{l.productBazaarExpenses}</p><p className="mt-1 text-2xl font-black text-purple-600">{loading ? '—' : formatCurrency(productBazaarExpensesTotal)}</p></div>
            <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#9CA3AF]">{l.otherExpenses}</p><p className="mt-1 text-2xl font-black text-[#ff5a00]">{loading ? '—' : formatCurrency(otherExpensesTotal)}</p></div>
            <div className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#9CA3AF]">{l.investorSupport}</p><p className="mt-1 text-2xl font-black text-purple-600">{loading ? '—' : formatCurrency(investorSupportTotal)}</p></div>
          </div>
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
            {loading ? <OperationalLoading title={l.title} description="" /> : visibleRows.length === 0 ? <div className="p-12 text-center text-sm font-bold text-[#9CA3AF]">{l.empty}</div> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left">
                  <thead className="bg-[#F9FAFB] text-[11px] font-black uppercase tracking-wide text-[#9CA3AF]"><tr>{[l.date, l.expense, l.category, l.amount, l.method, l.vendor, l.description, l.author, ...(canDelete ? [l.actions] : [])].map(heading => <th key={heading} className="border-b border-[#E5E7EB] px-4 py-3">{heading}</th>)}</tr></thead>
                  {rowsByDate.map(group => (
                    <tbody key={group.date}>
                      <tr className="bg-blue-50/70">
                        <td colSpan={canDelete ? 9 : 8} className="border-y border-blue-100 px-4 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black text-blue-700">{formatLongDate(group.date, lang, group.date)}</span>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-blue-600 shadow-sm">{group.rows.length}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-black tabular-nums">
                              <span className="rounded-full bg-green-50 px-3 py-1.5 text-green-700">{l.cafeIncome}: {formatCurrency(group.cafeIncome)}</span>
                              {group.loyaltyIncome > 0 && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">{l.loyaltyIncome}: {formatCurrency(group.loyaltyIncome)}</span>}
                              <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700">{l.totalExpenses}: {formatCurrency(group.totalExpenses)}</span>
                              <span className="rounded-full bg-purple-50 px-3 py-1.5 text-purple-700">{l.investorIncome}: {formatCurrency(group.investorIncome)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {group.rows.map(row => {
                        const isIncome = normalizeExpenseEntryType(row.entry_type) === 'income'
                        const category = row.is_salary_payment ? l.salaryPayment : row.is_salary_bonus ? l.salaryBonus : expenseCategoryLabel(row.category, lang)
                        const tone = expenseTone(row)
                        const dailyBazaarTotal = row.is_bazaar_daily_total
                        return <tr key={`${row.id}-${row.expense_date}`} className={`border-b border-l-4 border-[#F3F4F6] last:border-b-0 ${tone.row}`}>
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-[#4B5563]">
                            <span className="block">{formatLongDate(row.expense_date, lang, row.expense_date)}</span>
                            <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#9CA3AF]"><Clock3 size={12} />{formatTime(row.created_at, '—')}</span>
                          </td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${tone.badge}`}>{isIncome ? l.income : l.expense}</span></td>
                          <td className={`px-4 py-3 text-sm font-black ${tone.text}`}>{category}</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-black ${tone.text}`}>{formatCurrency(row.amount)}</td>
                          <td className="px-4 py-3 text-sm font-bold text-[#4B5563]">{expensePaymentMethodLabel(row.payment_method, lang)}</td>
                          <td className="max-w-[220px] px-4 py-3 text-sm font-semibold text-[#4B5563]">{row.vendor || '—'}</td>
                          <td className="max-w-[260px] break-words px-4 py-3 text-sm font-semibold text-[#4B5563]">{expenseDescriptionLabel(row.description, lang) || (row.is_salary_payment ? l.salaryPayment : row.is_salary_bonus ? l.salaryBonus : '—')}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-[#6B7280]">{row.created_by_name || '—'}</td>
                          {canDelete && <td className="px-4 py-3">
                            {dailyBazaarTotal ? (
                              canAccessBazaar ? (
                                <button type="button" onClick={() => navigate('/admin/bazaar')} className="inline-flex h-9 items-center whitespace-nowrap rounded-xl border border-purple-200 bg-white px-3 text-xs font-black text-purple-700 hover:bg-purple-50">
                                  {l.manageBazaar}
                                </button>
                              ) : (
                                <span className="text-xs font-bold text-[#9CA3AF]">{l.manageBazaar}</span>
                              )
                            ) : getAccountingHistoryDeleteTarget(row) ? <button
                              type="button"
                              disabled={Boolean(deletingId)}
                              onClick={() => removeRow(row)}
                              className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                confirmDeleteId === row.id ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:border-red-200 hover:text-red-600'
                              }`}
                            >
                              <Trash2 size={14} />
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
