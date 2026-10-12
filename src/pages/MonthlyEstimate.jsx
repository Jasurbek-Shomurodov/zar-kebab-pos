import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Target,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Loader2,
  Monitor,
  ReceiptText,
  RefreshCw,
  Tag,
  Users,
  WalletCards,
  Zap,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { getOrderRevenueTotal, isPaidOrder, matchesRange, toLocalDateStr } from '../lib/analytics'
import { formatLongDate, formatMonthYear } from '../lib/dateFormat'
import {
  buildSalaryBonusExpenseRows,
  buildFinalizedEmployeeMealExpenseRows,
  buildSalaryPaymentExpenseRows,
  addLocalDateDays,
  expensePaymentMethodLabel,
  getEmployeeMealExpenseEstimate,
  getEstimatedMonthlyExpenseSummary,
  getSelectedMonthSalaryOperatingSummary,
  normalizeExpenseEntryType,
  summarizeExpenses,
  summarizeIncomeEntries,
  todayExpenseDate,
} from '../lib/expenses'
import { formatCurrency } from '../lib/formatCurrency'
import {
  buildMonthComparisonRows,
  getEstimateMonthDays,
  getMonthlyEstimateMethodRows,
  getMonthlyEstimateOutlook,
  projectRemainingAtPace,
  summarizeEstimateMonthActuals,
} from '../lib/monthlyEstimate'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { collectPagedRows } from '../lib/orderHistory'
import { normalizeAccountingPaidOrderSummary } from '../lib/accounting'
import { loadAccountingPaidOrderSummary, loadMonthlyEstimateBundle } from '../lib/accountingSummary'

const SELECT_COLUMNS = 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by, created_by_name, created_at, updated_at'

function isMissingExpensesMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('expenses') && (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('42p01')
  )
}

function isMissingSalaryMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('employee_salary') && (
    text.includes('does not exist') ||
    text.includes('could not find the') ||
    text.includes('column') ||
    text.includes('schema cache') ||
    text.includes('42p01') ||
    text.includes('42703')
  )
}

function composeSalaryProfiles(rows = [], rates = [], payments = [], bonuses = [], fines = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates.filter(rate => rate.salary_profile_id === row.id),
    payments: payments.filter(payment => payment.salary_profile_id === row.id),
    bonuses: bonuses.filter(bonus => bonus.salary_profile_id === row.id),
    fines: fines.filter(fine => fine.salary_profile_id === row.id),
    absences: absences.filter(absence => absence.salary_profile_id === row.id),
  }))
}

function loadPagedResult(loadPage) {
  return collectPagedRows(loadPage)
    .then(data => ({ data, error: null }))
    .catch(error => ({ data: [], error }))
}

function monthStartFor(date) {
  return String(date || todayExpenseDate()).slice(0, 8) + '01'
}

function monthEndFor(monthStart) {
  const [year, month] = String(monthStart || todayExpenseDate()).split('-').map(Number)
  if (!year || !month) return monthStart
  const date = new Date(Date.UTC(year, month, 0, 12, 0, 0))
  return toLocalDateStr(date.toISOString())
}

function addMonths(monthStart, delta) {
  const [year, month] = String(monthStart || todayExpenseDate()).split('-').map(Number)
  const date = new Date(Date.UTC(year, (month || 1) - 1 + delta, 1, 12, 0, 0))
  return monthStartFor(toLocalDateStr(date.toISOString()))
}

function methodLabel(method, lang) {
  if (['cash', 'card', 'terminal'].includes(method)) return expensePaymentMethodLabel(method, lang)
  if (method === 'loyalty_card') return lang === 'uz' ? 'Sodiqlik' : lang === 'ru' ? 'Лояльность' : 'Loyalty'
  return method || '—'
}

// Paid-order totals for a range from the Accounting summary RPC: a few hundred
// bytes instead of every order with its items and payments (megabytes a month).
function loadSalesSummary(dateFrom, dateTo) {
  return loadAccountingPaidOrderSummary(dateFrom, dateTo)
    .then(summary => ({ data: normalizeAccountingPaidOrderSummary(summary, dateFrom, dateTo), error: null }))
    .catch(error => ({ data: null, error }))
}

export default function MonthlyEstimate() {
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const today = todayExpenseDate()
  const [monthStart, setMonthStart] = useState(monthStartFor(today))
  const monthEnd = useMemo(() => monthEndFor(monthStart), [monthStart])
  const actualThroughDate = today < monthStart ? monthStart : today > monthEnd ? monthEnd : today

  const [expenses, setExpenses] = useState([])
  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [employeeMealSnapshots, setEmployeeMealSnapshots] = useState([])
  // Paid-order totals for the month's completed days (summary RPC); today's
  // sales come live from the POS state so they keep updating without a reload.
  const [completedSales, setCompletedSales] = useState(null)
  // Last month's actual rows for the comparison; null while loading or unavailable.
  const [previousMonthRows, setPreviousMonthRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadRequestRef = useRef(0)

  const L = {
    uz: {
      title: 'Oylik taxmin',
      back: 'Moliyaviy tahlilga qaytish',
      refresh: 'Yangilash',
      currentMonth: 'Joriy oy',
      expectedMonthSpent: 'Tanlangan oy uchun jami kutilayotgan xarajat',
      expectedSalary: 'Bu oy yana to‘lanadigan maosh',
      salaryApplied: 'Shu oy maoshiga hisoblangan to‘lov',
      moneyCame: 'Pul qayerdan keldi',
      moneyWent: 'Pul qayerga ketdi',
      methodFlow: 'To‘lov turi bo‘yicha oqim',
      expenseBreakdown: 'Xarajatlar bir qarashda',
      salesRevenue: 'Kafe savdosi',
      loyaltyIncome: 'Loyallik daromadi',
      cafePaidIn: 'Kafedan kelgan pul',
      investorSupport: 'Investor yordami',
      otherIncome: 'Boshqa daromad',
      salaryPaid: 'Xodimlarga to‘langan',
      productsSpent: 'Mahsulotlarga ketgan',
      salaryBonus: 'Alohida to‘langan bonuslar',
      salaryAccruedBonus: 'Maoshga qo‘shilgan bonuslar',
      salaryFines: 'Jarimalar',
      absenceDays: 'Kelmagan kunlar',
      salaryPlan: 'Oy uchun maosh',
      rentRemaining: 'To‘lanishi kerak ijara',
      rentPaidAmount: 'Ijara to‘langan',
      utilitiesPaid: 'Kommunal to‘langan',
      utilitiesRemaining: 'Kommunal to‘lanishi kerak',
      otherSpent: 'Boshqa xarajatlar',
      employeeMealsActual: 'Hisoblangan xodimlar ovqati',
      employeeMealsRemaining: 'Xodimlar ovqati oy oxirigacha',
      employeeDays: 'xodim-kun',
      payroll: 'Maosh va xodimlar',
      fixedBills: 'Doimiy to‘lovlar',
      operations: 'Operatsion xarajatlar',
      actualIn: 'Hozirgacha kirim',
      actualOut: 'Hozirgacha chiqim',
      netLeft: 'Hozirgi qoldiq',
      remainingCommitments: 'Oy oxirigacha to‘lovlar',
      projectedLeft: 'Barcha xarajatlardan keyin',
      cmpTitle: 'O‘tgan oy bilan taqqoslash',
      cmpHelp: 'Bu oy: kutilayotgan jami. O‘tgan oy: haqiqiy natija.',
      cmpThis: 'Bu oy',
      cmpLast: 'O‘tgan oy',
      cmpCafe: 'Kafe daromadi',
      cmpOtherIncome: 'Investor va boshqa daromad',
      cmpPayroll: 'Maosh va bonuslar',
      cmpProducts: 'Bozor mahsulotlari',
      cmpMeals: 'Xodimlar ovqati',
      cmpRent: 'Ijara',
      cmpUtilities: 'Kommunal',
      cmpOther: 'Boshqa xarajatlar',
      cmpTotalOut: 'Jami xarajat',
      cmpResult: 'Oy natijasi',
      cmpNew: 'yangi',
      cmpPaceNote: 'Bu oyning daromadi va bozor xarajati joriy sur’atda hisoblangan.',
      cmpUnavailable: 'O‘tgan oy ma’lumotlarini yuklab bo‘lmadi.',
      bazaarRemaining: 'Bozor oy oxirigacha · joriy sur’at',
      outlook: 'Oy prognozi',
      outlookHelp: 'Hozirgacha kirim va chiqim hamda joriy sur’atda oy qanday yakunlanishi.',
      expectedIncome: 'Kutilayotgan daromad',
      forecastPending: 'Prognoz birinchi to‘liq kundan keyin boshlanadi',
      monthClosed: 'Oy yopilgan',
      futureMonth: 'Oy hali boshlanmagan',
      dailyTarget: 'Kuniga kerakli daromad',
      dailyTargetSub: 'Oy oxirigacha qolgan xarajatlarni qoplash uchun',
      daysLeft: 'kun qoldi',
      avgSoFar: 'Hozirgi o‘rtacha',
      completedDays: 'to‘liq kun',
      breakEven: 'Zararsizlik maqsadi',
      breakEvenSub: 'Sozlamalardan',
      onTrack: 'Reja bo‘yicha',
      behind: 'Kerakdan past',
      covered: 'Xarajatlar qoplangan',
      perDay: 'kuniga',
      inflow: 'Kirim',
      outflow: 'Chiqim',
      balance: 'Farq',
      loading: 'Taxmin yuklanmoqda',
      loadFailed: 'Taxminni yuklab bo‘lmadi',
      migrationMissing: 'Buxgalteriya yoki maosh jadvallari bazada tayyor emas. Supabase migratsiyalarini tekshiring.',
      noData: 'Bu oy uchun ma’lumot hali yo‘q',
    },
    ru: {
      title: 'Прогноз месяца',
      back: 'Назад к финансовому анализу',
      refresh: 'Обновить',
      currentMonth: 'Текущий месяц',
      expectedMonthSpent: 'Ожидаемые расходы за выбранный месяц',
      expectedSalary: 'Ещё выплатить зарплаты за этот месяц',
      salaryApplied: 'Оплата в счёт зарплаты этого месяца',
      moneyCame: 'Откуда поступили деньги',
      moneyWent: 'На что ушли деньги',
      methodFlow: 'Движение по способам оплаты',
      expenseBreakdown: 'Расходы одним взглядом',
      salesRevenue: 'Доход кафе',
      loyaltyIncome: 'Доход по лояльности',
      cafePaidIn: 'Пришло из кафе',
      investorSupport: 'Поддержка инвестора',
      otherIncome: 'Прочие поступления',
      salaryPaid: 'Выплачено сотрудникам',
      productsSpent: 'Потрачено на продукты',
      salaryBonus: 'Бонусы, выплаченные отдельно',
      salaryAccruedBonus: 'Бонусы, начисленные к зарплате',
      salaryFines: 'Штрафы',
      absenceDays: 'Дни отсутствия',
      salaryPlan: 'Зарплата за месяц',
      rentRemaining: 'Осталось оплатить аренду',
      rentPaidAmount: 'Аренда оплачена',
      utilitiesPaid: 'Коммуналка оплачена',
      utilitiesRemaining: 'Осталось оплатить коммуналку',
      otherSpent: 'Другие расходы',
      employeeMealsActual: 'Начисленное питание сотрудников',
      employeeMealsRemaining: 'Питание сотрудников до конца месяца',
      employeeDays: 'чел.-дн.',
      payroll: 'Зарплата и сотрудники',
      fixedBills: 'Постоянные платежи',
      operations: 'Операционные расходы',
      actualIn: 'Пришло до сегодня',
      actualOut: 'Ушло до сегодня',
      netLeft: 'Текущий остаток',
      remainingCommitments: 'Ещё оплатить до конца месяца',
      projectedLeft: 'Останется после всех расходов',
      cmpTitle: 'Сравнение с прошлым месяцем',
      cmpHelp: 'Этот месяц — ожидаемый итог. Прошлый месяц — фактический результат.',
      cmpThis: 'Этот месяц',
      cmpLast: 'Прошлый месяц',
      cmpCafe: 'Доход кафе',
      cmpOtherIncome: 'Инвестор и другой доход',
      cmpPayroll: 'Зарплаты и бонусы',
      cmpProducts: 'Продукты с базара',
      cmpMeals: 'Питание сотрудников',
      cmpRent: 'Аренда',
      cmpUtilities: 'Коммунальные',
      cmpOther: 'Прочие расходы',
      cmpTotalOut: 'Все расходы',
      cmpResult: 'Итог месяца',
      cmpNew: 'новое',
      cmpPaceNote: 'Доход и базар этого месяца рассчитаны по текущему темпу.',
      cmpUnavailable: 'Не удалось загрузить данные прошлого месяца.',
      bazaarRemaining: 'Базар до конца месяца · текущий темп',
      outlook: 'Прогноз месяца',
      outlookHelp: 'Приход и расход на сегодня и итог месяца при текущем темпе.',
      expectedIncome: 'Ожидаемый доход',
      forecastPending: 'Прогноз появится после первого полного дня',
      monthClosed: 'Месяц закрыт',
      futureMonth: 'Месяц ещё не начался',
      dailyTarget: 'Нужно зарабатывать в день',
      dailyTargetSub: 'Чтобы покрыть оставшиеся расходы до конца месяца',
      daysLeft: 'дн. осталось',
      avgSoFar: 'Средний доход сейчас',
      completedDays: 'полн. дн.',
      breakEven: 'Цель безубыточности',
      breakEvenSub: 'Из настроек',
      onTrack: 'Идём по плану',
      behind: 'Ниже нужного',
      covered: 'Расходы покрыты',
      perDay: 'в день',
      inflow: 'Поступления',
      outflow: 'Расход',
      balance: 'Разница',
      loading: 'Загружаем прогноз',
      loadFailed: 'Не удалось загрузить прогноз',
      migrationMissing: 'Таблицы бухгалтерии или зарплат не готовы в базе. Проверьте миграции Supabase.',
      noData: 'За этот месяц данных пока нет',
    },
    en: {
      title: 'Monthly estimate',
      back: 'Back to financial analysis',
      refresh: 'Refresh',
      currentMonth: 'Current month',
      expectedMonthSpent: 'Expected expenses for selected month',
      expectedSalary: 'Salary still expected this month',
      salaryApplied: 'Payment applied to this month',
      moneyCame: 'Where money came from',
      moneyWent: 'Where money went',
      methodFlow: 'Flow by payment method',
      expenseBreakdown: 'Expenses at a glance',
      salesRevenue: 'Cafe income',
      loyaltyIncome: 'Loyalty income',
      cafePaidIn: 'Came from cafe',
      investorSupport: 'Investor support',
      otherIncome: 'Other income',
      salaryPaid: 'Paid to employees',
      productsSpent: 'Spent on products',
      salaryBonus: 'Bonuses paid separately',
      salaryAccruedBonus: 'Bonuses accrued to salary',
      salaryFines: 'Fines',
      absenceDays: 'Absence days',
      salaryPlan: 'Salary for month',
      rentRemaining: 'Rent still due',
      rentPaidAmount: 'Rent paid',
      utilitiesPaid: 'Utilities paid',
      utilitiesRemaining: 'Utilities still due',
      otherSpent: 'Other expenses',
      employeeMealsActual: 'Finalized employee meals',
      employeeMealsRemaining: 'Employee meals through month end',
      employeeDays: 'employee-days',
      payroll: 'Payroll and staff',
      fixedBills: 'Fixed bills',
      operations: 'Operating expenses',
      actualIn: 'In so far',
      actualOut: 'Out so far',
      netLeft: 'Current left',
      remainingCommitments: 'Still due by month end',
      projectedLeft: 'Left after all expenses',
      cmpTitle: 'Compared with last month',
      cmpHelp: 'This month is the expected total. Last month is the actual result.',
      cmpThis: 'This month',
      cmpLast: 'Last month',
      cmpCafe: 'Cafe income',
      cmpOtherIncome: 'Investor and other income',
      cmpPayroll: 'Salaries and bonuses',
      cmpProducts: 'Bazaar products',
      cmpMeals: 'Employee meals',
      cmpRent: 'Rent',
      cmpUtilities: 'Utilities',
      cmpOther: 'Other expenses',
      cmpTotalOut: 'Total expenses',
      cmpResult: 'Month result',
      cmpNew: 'new',
      cmpPaceNote: 'This month’s income and bazaar spending are projected at the current pace.',
      cmpUnavailable: 'Could not load last month’s data.',
      bazaarRemaining: 'Bazaar through month end · current pace',
      outlook: 'Month outlook',
      outlookHelp: 'Money in and out so far, and where the month ends at the current pace.',
      expectedIncome: 'Expected income',
      forecastPending: 'The projection starts after the first full day',
      monthClosed: 'Month closed',
      futureMonth: 'Month has not started',
      dailyTarget: 'Daily income needed',
      dailyTargetSub: 'To cover everything still due this month',
      daysLeft: 'days left',
      avgSoFar: 'Average so far',
      completedDays: 'full days',
      breakEven: 'Break-even target',
      breakEvenSub: 'From settings',
      onTrack: 'On track',
      behind: 'Below target',
      covered: 'Expenses covered',
      perDay: 'per day',
      inflow: 'Inflow',
      outflow: 'Outflow',
      balance: 'Balance',
      loading: 'Loading estimate',
      loadFailed: 'Could not load estimate',
      migrationMissing: 'Accounting or salary tables are not ready in the database. Check Supabase migrations.',
      noData: 'No data for this month yet',
    },
  }
  const l = L[lang] || L.en

  async function loadEstimate() {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    setLoading(true)
    setError('')
    setPreviousMonthRows(null)
    const previousStart = addMonths(monthStart, -1)
    const previousEnd = monthEndFor(previousStart)
    const loadDay = todayExpenseDate()
    const dayBefore = addLocalDateDays(loadDay, -1)
    const completedSalesTo = dayBefore < monthEnd ? dayBefore : monthEnd
    const sources = await loadEstimateSources({ previousStart, previousEnd, completedSalesTo })
    if (requestId !== loadRequestRef.current) return
    const [expenseResult, salaryProfileResult, salaryRateResult, salaryPaymentResult, salaryBonusResult, salaryFineResult, salaryAbsenceResult, teamResult, employeeMealResult, orderHistoryResult] = sources.current

    if (expenseResult.error) {
      setExpenses([])
      setError(isMissingExpensesMigration(expenseResult.error) ? l.migrationMissing : expenseResult.error.message || l.loadFailed)
    } else {
      setExpenses(expenseResult.data || [])
    }
    if (orderHistoryResult.error) {
      setCompletedSales(null)
      if (!expenseResult.error) setError(orderHistoryResult.error.message || l.loadFailed)
    } else {
      setCompletedSales(orderHistoryResult.data)
    }
    if (employeeMealResult.error) {
      setEmployeeMealSnapshots([])
      if (!expenseResult.error && !orderHistoryResult.error) {
        setError(employeeMealResult.error.message || l.loadFailed)
      }
    } else {
      setEmployeeMealSnapshots(employeeMealResult.data || [])
    }
    const salaryError = salaryProfileResult.error || salaryRateResult.error || salaryPaymentResult.error || salaryBonusResult.error || salaryAbsenceResult.error
    if (salaryError) {
      setSalaryProfiles([])
      if (!expenseResult.error) {
        setError(isMissingSalaryMigration(salaryError) ? l.migrationMissing : salaryError.message || l.loadFailed)
      }
    } else {
      if (salaryFineResult.error && !expenseResult.error) {
        setError(isMissingSalaryMigration(salaryFineResult.error) ? l.migrationMissing : salaryFineResult.error.message || l.loadFailed)
      }
      setSalaryProfiles(composeSalaryProfiles(
        salaryProfileResult.data || [],
        salaryRateResult.data || [],
        salaryPaymentResult.data || [],
        salaryBonusResult.data || [],
        salaryFineResult.error ? [] : salaryFineResult.data || [],
        salaryAbsenceResult.data || [],
        teamResult.data || [],
      ))
    }
    const [previousExpenses, previousMeals, previousOrders] = await sources.previous
    if (requestId !== loadRequestRef.current) return
    setPreviousMonthRows(previousExpenses.error || previousMeals.error || previousOrders.error
      ? { error: true }
      : { start: previousStart, end: previousEnd, expenses: previousExpenses.data || [], meals: previousMeals.data || [], salesRevenue: previousOrders.data.cafeIncome })
    setLoading(false)
  }

  // One round trip (migration 233) when available, otherwise the same data as
  // separate requests. Both return { data, error } results in the same order.
  async function loadEstimateSources({ previousStart, previousEnd, completedSalesTo }) {
    const ok = data => ({ data, error: null })
    const emptySales = () => normalizeAccountingPaidOrderSummary({}, monthStart, monthStart)
    let bundle = null
    let bundleError = null
    try {
      bundle = await loadMonthlyEstimateBundle({ monthStart, monthEnd, completedSalesTo, previousStart, previousEnd })
    } catch (error) {
      bundleError = error
    }
    if (bundleError) {
      const failed = { data: [], error: bundleError }
      return {
        current: [failed, failed, failed, failed, failed, failed, failed, failed, failed, { data: null, error: bundleError }],
        previous: Promise.resolve([failed, failed, { data: null, error: bundleError }]),
      }
    }
    if (bundle) {
      const { current, previous, salary } = bundle
      return {
        current: [
          ok(current.expenses), ok(salary.profiles), ok(salary.rates), ok(salary.payments), ok(salary.bonuses),
          ok(salary.fines), ok(salary.absences), ok(salary.team), ok(current.employeeMealSnapshots),
          ok(current.paidOrderSummary
            ? normalizeAccountingPaidOrderSummary(current.paidOrderSummary, monthStart, completedSalesTo)
            : emptySales()),
        ],
        previous: Promise.resolve([
          ok(previous.expenses),
          ok(previous.employeeMealSnapshots),
          ok(normalizeAccountingPaidOrderSummary(previous.paidOrderSummary, previousStart, previousEnd)),
        ]),
      }
    }

    const previousPromise = Promise.all([
      loadPagedResult((from, to) => supabase
        .from('expenses')
        .select(SELECT_COLUMNS)
        .gte('expense_date', previousStart)
        .lte('expense_date', previousEnd)
        .order('expense_date')
        .order('id')
        .range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_daily_meal_expenses').select('business_date, average_daily_amount, present_employee_count, total_amount, source_type, finalized_at, created_at').gte('business_date', previousStart).lte('business_date', previousEnd).order('business_date').range(from, to)),
      loadSalesSummary(previousStart, previousEnd),
    ])
    const current = await Promise.all([
      loadPagedResult((from, to) => supabase
        .from('expenses')
        .select(SELECT_COLUMNS)
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd)
        .order('expense_date')
        .order('id')
        .range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_profiles').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_rates').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_payments').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_bonuses').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_fines').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_absences').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('profiles').select('id, full_name, email, role, status').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_daily_meal_expenses').select('business_date, average_daily_amount, present_employee_count, total_amount, source_type, finalized_at, created_at').gte('business_date', monthStart).lte('business_date', monthEnd).order('business_date').range(from, to)),
      completedSalesTo >= monthStart
        ? loadSalesSummary(monthStart, completedSalesTo)
        : Promise.resolve({ data: normalizeAccountingPaidOrderSummary({}, monthStart, monthStart), error: null }),
    ])
    return { current, previous: previousPromise }
  }

  useEffect(() => {
    loadEstimate()
    return () => { loadRequestRef.current += 1 }
  }, [monthStart, monthEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const cutoffEnd = actualThroughDate < monthStart ? monthStart : actualThroughDate
  // Operational state holds today's paid orders; earlier days are in completedSales.
  const todayInMonth = today >= monthStart && today <= monthEnd
  const paidOrders = useMemo(() => (
    todayInMonth ? state.orders.filter(order => isPaidOrder(order) && matchesRange(order, today, today)) : []
  ), [state.orders, todayInMonth, today])

  const actualEntries = useMemo(() => (
    expenses.filter(row => String(row.expense_date || '').slice(0, 10) <= cutoffEnd)
  ), [expenses, cutoffEnd])

  const incomeEntries = actualEntries.filter(row => normalizeExpenseEntryType(row.entry_type) === 'income')
  const manualExpenseRows = actualEntries.filter(row => normalizeExpenseEntryType(row.entry_type) === 'expense')
  const salaryPaymentRows = useMemo(() => (
    buildSalaryPaymentExpenseRows(salaryProfiles, monthStart, cutoffEnd)
  ), [salaryProfiles, monthStart, cutoffEnd])
  const salaryBonusRows = useMemo(() => (
    buildSalaryBonusExpenseRows(salaryProfiles, monthStart, cutoffEnd)
  ), [salaryProfiles, monthStart, cutoffEnd])
  const monthlyEstimate = useMemo(() => (
    getEstimatedMonthlyExpenseSummary(salaryProfiles, cutoffEnd, {
      monthlyRentUzs: state.settings?.monthlyRentUzs || 0,
      monthlyUtilitiesUzs: state.settings?.monthlyUtilitiesUzs || 0,
    })
  ), [salaryProfiles, cutoffEnd, state.settings?.monthlyRentUzs, state.settings?.monthlyUtilitiesUzs])
  const salaryOperatingSummary = useMemo(() => (
    getSelectedMonthSalaryOperatingSummary(salaryProfiles, cutoffEnd)
  ), [salaryProfiles, cutoffEnd])
  const finalizedEmployeeMealRows = useMemo(() => (
    buildFinalizedEmployeeMealExpenseRows(employeeMealSnapshots)
      .filter(row => row.expense_date <= cutoffEnd)
  ), [employeeMealSnapshots, cutoffEnd])
  const mealForecastStart = today < monthStart
    ? monthStart
    : today > monthEnd
      ? addLocalDateDays(monthEnd, 1)
      : today
  const employeeMealEstimate = useMemo(() => (
    getEmployeeMealExpenseEstimate(
      salaryProfiles,
      mealForecastStart,
      monthEnd,
      state.settings?.averageDailyEmployeeMealUzs || 0,
    )
  ), [salaryProfiles, mealForecastStart, monthEnd, state.settings?.averageDailyEmployeeMealUzs])
  const completedSalesTotal = completedSales?.cafeIncome || 0
  const salesRevenue = completedSalesTotal + paidOrders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
  const incomeSummary = summarizeIncomeEntries(incomeEntries)
  const allActualExpenseRows = [...salaryPaymentRows, ...salaryBonusRows, ...finalizedEmployeeMealRows, ...manualExpenseRows]
  const actualExpenseSummary = summarizeExpenses(allActualExpenseRows)
  const salaryPaymentTotal = summarizeExpenses(salaryPaymentRows).total
  const salaryBonusTotal = summarizeExpenses(salaryBonusRows).total
  const employeeMealActualTotal = summarizeExpenses(finalizedEmployeeMealRows).total
  const recordedExpenseTotal = summarizeExpenses(manualExpenseRows).total
  const investorInvestedTotal = incomeSummary.byCategory.investor_support || 0
  const productsSpentTotal = actualExpenseSummary.byCategory.products_bazaar || 0
  const recordedRentTotal = actualExpenseSummary.byCategory.rent || 0
  const recordedUtilitiesTotal = actualExpenseSummary.byCategory.utilities || 0
  const otherRecordedExpenseTotal = Math.max(
    0,
    recordedExpenseTotal - productsSpentTotal - recordedRentTotal - recordedUtilitiesTotal,
  )
  const absenceDaysTotal = salaryProfiles.reduce((sum, profile) => (
    sum + (profile.absences || []).filter(absence => {
      const date = String(absence.absence_date || '').slice(0, 10)
      return date >= monthStart && date <= cutoffEnd
    }).length
  ), 0)
  const salaryFineTotal = salaryProfiles.reduce((sum, profile) => (
    sum + (profile.fines || []).reduce((profileSum, fine) => {
      const date = String(fine.fine_date || '').slice(0, 10)
      return date >= monthStart && date <= cutoffEnd
        ? profileSum + Math.max(0, Math.round(Number(fine.amount) || 0))
        : profileSum
    }, 0)
  ), 0)
  const estimateDays = getEstimateMonthDays(monthStart, monthEnd, today)
  const completedProductsTotal = manualExpenseRows
    .filter(row => row.category === 'products_bazaar' && String(row.expense_date || '').slice(0, 10) < today)
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  // Bazaar is bought almost daily, so the rest of the month follows the completed-day pace.
  const bazaarExpectedRemaining = projectRemainingAtPace({ soFar: productsSpentTotal, completedSoFar: completedProductsTotal, days: estimateDays }).remaining
  const totalInflow = salesRevenue + incomeSummary.total
  const totalOutflow = actualExpenseSummary.total
  const salaryExpectedRemaining = salaryOperatingSummary.remainingSalary
  const rentExpectedRemaining = Math.max(0, monthlyEstimate.monthlyRentUzs - recordedRentTotal)
  const utilitiesExpectedRemaining = Math.max(0, monthlyEstimate.monthlyUtilitiesUzs - recordedUtilitiesTotal)
  const expectedMonthOutflow = totalOutflow
    - salaryPaymentTotal
    + salaryOperatingSummary.expectedSalaryCost
    + rentExpectedRemaining
    + utilitiesExpectedRemaining
    + employeeMealEstimate.total
    + bazaarExpectedRemaining

  const yesterday = addLocalDateDays(today, -1)
  const completedSalesRevenue = today > monthStart && today <= monthEnd ? completedSalesTotal : salesRevenue
  const outlook = getMonthlyEstimateOutlook({
    monthStart,
    monthEnd,
    today,
    salesRevenue,
    completedSalesRevenue,
    otherIncome: incomeSummary.total,
    actualOut: totalOutflow,
    expectedOut: expectedMonthOutflow,
  })
  const previousActuals = useMemo(() => {
    if (!previousMonthRows || previousMonthRows.error) return null
    const { start, end, expenses: rows, meals, salesRevenue: previousSalesRevenue } = previousMonthRows
    const income = rows.filter(row => normalizeExpenseEntryType(row.entry_type) === 'income')
    const manual = rows.filter(row => normalizeExpenseEntryType(row.entry_type) === 'expense')
    const mealRows = buildFinalizedEmployeeMealExpenseRows(meals)
    const bonusRows = buildSalaryBonusExpenseRows(salaryProfiles, start, end)
    const allRows = [...bonusRows, ...mealRows, ...manual]
    return summarizeEstimateMonthActuals({
      salesRevenue: previousSalesRevenue,
      incomeTotal: summarizeIncomeEntries(income).total,
      salaryOperatingCost: getSelectedMonthSalaryOperatingSummary(salaryProfiles, end).expectedSalaryCost,
      salaryBonusTotal: summarizeExpenses(bonusRows).total,
      byCategory: summarizeExpenses(allRows).byCategory,
      employeeMealTotal: summarizeExpenses(mealRows).total,
      manualExpenseTotal: summarizeExpenses(manual).total,
    })
  }, [previousMonthRows, salaryProfiles])
  const comparisonRows = previousActuals ? buildMonthComparisonRows({
    cafeIncome: salesRevenue + outlook.projectedRemainingSales,
    otherIncome: incomeSummary.total,
    payroll: salaryOperatingSummary.expectedSalaryCost + salaryBonusTotal,
    products: productsSpentTotal + bazaarExpectedRemaining,
    meals: employeeMealActualTotal + employeeMealEstimate.total,
    rent: recordedRentTotal + rentExpectedRemaining,
    utilities: recordedUtilitiesTotal + utilitiesExpectedRemaining,
    other: otherRecordedExpenseTotal,
    expectedOut: expectedMonthOutflow,
    left: outlook.projectedLeft,
  }, previousActuals) : []
  const breakEvenDaily = Math.max(0, Number(state.settings?.averageDailyBreakEvenIncomeUzs) || 0)

  const cameRows = [
    { key: 'sales', label: l.salesRevenue, amount: salesRevenue, color: '#1d7a52' },
    { key: 'investor', label: l.investorSupport, amount: investorInvestedTotal, color: '#8b5cf6' },
    { key: 'other-income', label: l.otherIncome, amount: Math.max(0, incomeSummary.total - investorInvestedTotal), color: '#2a6fdb' },
  ].filter(row => row.amount > 0)

  const wentRows = [
    { key: 'salary-paid', label: l.salaryPaid, amount: salaryPaymentTotal, color: '#2a6fdb' },
    { key: 'salary-bonus', label: l.salaryBonus, amount: salaryBonusTotal, color: '#8b5cf6' },
    { key: 'products', label: l.productsSpent, amount: productsSpentTotal, color: '#ff5a00' },
    { key: 'employee-meals', label: l.employeeMealsActual, amount: employeeMealActualTotal, color: '#c4262c' },
    { key: 'other-recorded', label: l.otherSpent, amount: otherRecordedExpenseTotal, color: '#68655f' },
    { key: 'rent-paid', label: l.rentPaidAmount, amount: recordedRentTotal, color: '#0f766e' },
    { key: 'utilities-paid', label: l.utilitiesPaid, amount: recordedUtilitiesTotal, color: '#9a5a00' },
  ].filter(row => row.amount > 0)

  const expenseBreakdownCards = [
    {
      key: 'payroll',
      icon: Users,
      title: l.payroll,
      total: salaryOperatingSummary.expectedSalaryCost + salaryBonusTotal,
      rows: [
        { label: l.salaryPlan, value: formatCurrency(salaryOperatingSummary.projectedSalary) },
        { label: l.salaryAccruedBonus, value: formatCurrency(salaryOperatingSummary.accruedBonuses) },
        { label: l.salaryApplied, value: formatCurrency(salaryOperatingSummary.appliedPayments) },
        { label: l.salaryBonus, value: formatCurrency(salaryBonusTotal) },
        { label: l.expectedSalary, value: formatCurrency(salaryExpectedRemaining), tone: salaryExpectedRemaining > 0 ? 'caution' : 'positive' },
        { label: l.salaryFines, value: `− ${formatCurrency(salaryFineTotal)}`, tone: 'negative' },
        { label: l.absenceDays, value: String(absenceDaysTotal) },
      ],
    },
    {
      key: 'fixed-bills',
      icon: Zap,
      title: l.fixedBills,
      total: recordedRentTotal + rentExpectedRemaining + recordedUtilitiesTotal + utilitiesExpectedRemaining,
      rows: [
        { label: l.rentPaidAmount, value: formatCurrency(recordedRentTotal) },
        { label: l.rentRemaining, value: formatCurrency(rentExpectedRemaining), tone: rentExpectedRemaining > 0 ? 'caution' : 'positive' },
        { label: l.utilitiesPaid, value: formatCurrency(recordedUtilitiesTotal) },
        { label: l.utilitiesRemaining, value: formatCurrency(utilitiesExpectedRemaining), tone: utilitiesExpectedRemaining > 0 ? 'caution' : 'positive' },
      ],
    },
    {
      key: 'operations',
      icon: ReceiptText,
      title: l.operations,
      total: productsSpentTotal + bazaarExpectedRemaining + otherRecordedExpenseTotal + employeeMealActualTotal + employeeMealEstimate.total,
      rows: [
        { label: l.productsSpent, value: formatCurrency(productsSpentTotal) },
        { label: l.bazaarRemaining, value: formatCurrency(bazaarExpectedRemaining), tone: bazaarExpectedRemaining > 0 ? 'caution' : 'positive' },
        { label: l.otherSpent, value: formatCurrency(otherRecordedExpenseTotal) },
        { label: l.employeeMealsActual, value: formatCurrency(employeeMealActualTotal) },
        {
          label: `${l.employeeMealsRemaining} · ${employeeMealEstimate.presentEmployeeDays} ${l.employeeDays}`,
          value: formatCurrency(employeeMealEstimate.total),
          tone: employeeMealEstimate.total > 0 ? 'caution' : 'positive',
        },
      ],
    },
  ]

  const methodRows = useMemo(() => {
    return getMonthlyEstimateMethodRows(paidOrders, incomeEntries, allActualExpenseRows, completedSales?.paymentMethodIncome)
  }, [paidOrders, incomeEntries, allActualExpenseRows, completedSales])

  const previousMonthLabel = formatMonthYear(addMonths(monthStart, -1), lang)
  const nextMonthLabel = formatMonthYear(addMonths(monthStart, 1), lang)
  const selectedMonthLabel = formatMonthYear(monthStart, lang, l.currentMonth)

  const headerActions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMonthStart(addMonths(monthStart, -1))}
        aria-label={previousMonthLabel}
        title={previousMonthLabel}
        className="ws-btn ws-btn-outline !h-[38px] !w-[38px] !px-0"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => setMonthStart(monthStartFor(today))}
        title={l.currentMonth}
        className="ws-btn ws-btn-outline !h-[38px] tabular-nums"
      >
        {selectedMonthLabel}
        <span className="sr-only"> · {l.currentMonth}</span>
      </button>
      <button
        type="button"
        onClick={() => setMonthStart(addMonths(monthStart, 1))}
        aria-label={nextMonthLabel}
        title={nextMonthLabel}
        className="ws-btn ws-btn-outline !h-[38px] !w-[38px] !px-0"
      >
        <ChevronRight size={16} />
      </button>
      <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-[#e4e1de] sm:block" />
      <button
        type="button"
        onClick={loadEstimate}
        disabled={loading}
        aria-label={l.refresh}
        title={l.refresh}
        className="ws-btn ws-btn-outline !h-[38px] !w-[38px] !px-0"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
      </button>
    </div>
  )

  const back = { label: l.back, onClick: () => navigate('/admin/financial-analysis') }

  if (loading) {
    return (
      <AppShell title={l.title} back={back} headerActions={headerActions}>
        <div className="min-h-full bg-[#f6f5f3]">
          <OperationalLoading layout="estimate" title={l.loading} description="" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={l.title} back={back} headerActions={headerActions}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          {error && (
            <section className="ws-panel" role="alert">
              <div className="ws-empty">
                <AlertCircle />
                <h3>{l.loadFailed}</h3>
                <p>{error}</p>
                <button type="button" onClick={loadEstimate} className="ws-btn ws-btn-outline">
                  <RefreshCw size={16} />{l.refresh}
                </button>
              </div>
            </section>
          )}

          {!error && (
            <>
              <MonthOutlook
                outlook={outlook}
                salesRevenue={salesRevenue}
                breakEvenDaily={breakEvenDaily}
                labels={l}
              />

              <section className="ws-panel">
                <div className="ws-panel-title mb-5 !items-end">
                  <h2 className="ws-display">{l.expenseBreakdown}</h2>
                  <div className="text-left sm:text-right">
                    <p className="ws-caption">{l.expectedMonthSpent}</p>
                    <p className="mt-0.5 text-lg font-semibold leading-tight tabular-nums text-[#22201d]">{formatCurrency(expectedMonthOutflow)}</p>
                    <p className="ws-caption mt-0.5">
                      {formatLongDate(monthStart, lang, monthStart)} - {formatLongDate(monthEnd, lang, monthEnd)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  {expenseBreakdownCards.map(card => <BreakdownCard key={card.key} {...card} />)}
                </div>
              </section>

              <MonthComparison
                rows={comparisonRows}
                unavailable={previousMonthRows?.error}
                previousLabel={previousMonthLabel}
                currentLabel={selectedMonthLabel}
                showPaceNote={outlook.status !== 'closed'}
                labels={l}
              />

              <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
                <FlowSection
                  title={l.moneyCame}
                  total={totalInflow}
                  rows={cameRows}
                  emptyText={l.noData}
                />
                <FlowSection
                  title={l.moneyWent}
                  total={totalOutflow}
                  rows={wentRows}
                  emptyText={l.noData}
                />
              </div>

              <section className="ws-panel">
                <h2 className="ws-heading mb-4">{l.methodFlow}</h2>
                {methodRows.length === 0 ? (
                  <div className="ws-empty"><p>{l.noData}</p></div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {methodRows.map(row => (
                      <MethodCard
                        key={row.method}
                        row={row}
                        lang={lang}
                        labels={l}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function MonthOutlook({ outlook, salesRevenue, breakEvenDaily, labels }) {
  const statusChip = outlook.status === 'closed'
    ? labels.monthClosed
    : outlook.status === 'future' ? labels.futureMonth : null
  const leftTone = !outlook.hasProjection ? 'default' : outlook.projectedLeft >= 0 ? 'positive' : 'negative'
  const target = outlook.requiredDailySales
  const average = outlook.averageDailySales
  const covered = target === 0
  const onTrack = covered || (average != null && target != null && average >= target)
  const pacePct = target > 0 && average != null ? Math.min(100, Math.round((average / target) * 100)) : covered ? 100 : 0

  return (
    <section className="ws-panel" aria-labelledby="estimate-outlook-heading">
      <div className="ws-panel-title mb-5">
        <div>
          <h2 id="estimate-outlook-heading" className="ws-display">{labels.outlook}</h2>
          <p className="ws-muted mt-1">{labels.outlookHelp}</p>
        </div>
        {statusChip && <span className="ws-badge ws-tone-info">{statusChip}</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OutlookTile label={labels.actualIn} value={formatCurrency(outlook.inSoFar)} sub={`${labels.cafePaidIn}: ${formatCurrency(salesRevenue)}`} tone="positive" />
        <OutlookTile label={labels.actualOut} value={formatCurrency(outlook.outSoFar)} sub={`${labels.netLeft}: ${formatCurrency(outlook.currentLeft)}`} />
        <OutlookTile label={labels.remainingCommitments} value={formatCurrency(outlook.stillDue)} sub={`${labels.expectedMonthSpent}: ${formatCurrency(outlook.expectedOut)}`} tone={outlook.stillDue > 0 ? 'caution' : 'default'} />
        <OutlookTile
          label={labels.projectedLeft}
          value={outlook.hasProjection ? formatCurrency(outlook.projectedLeft) : '—'}
          sub={outlook.hasProjection ? `${labels.expectedIncome}: ${formatCurrency(outlook.projectedIncome)}` : labels.forecastPending}
          tone={leftTone}
          icon={!outlook.hasProjection ? null : outlook.projectedLeft >= 0 ? ArrowUpRight : ArrowDownRight}
          emphasized
        />
      </div>

      {outlook.remainingDays > 0 && target != null && (
        <div className="mt-4 rounded-xl border border-[#e4e1de] bg-[#f6f5f3] p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#68655f]"><Target size={17} /></span>
              <div className="min-w-0">
                <p className="ws-caption">{labels.dailyTarget}</p>
                <p className="mt-0.5 text-xl font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]">
                  {formatCurrency(target)} <span className="text-sm font-medium text-[#68655f]">{labels.perDay}</span>
                </p>
                <p className="ws-caption mt-0.5">{labels.dailyTargetSub} · {outlook.remainingDays} {labels.daysLeft}</p>
              </div>
            </div>
            <div>
              <p className="ws-caption">{labels.avgSoFar}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-[#22201d]">{average == null ? '—' : formatCurrency(average)}</p>
              <p className="ws-caption mt-0.5">{outlook.completedDays} {labels.completedDays}</p>
            </div>
            <div>
              <p className="ws-caption">{labels.breakEven}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-[#22201d]">{breakEvenDaily > 0 ? formatCurrency(breakEvenDaily) : '—'}</p>
              <p className="ws-caption mt-0.5">{labels.breakEvenSub}</p>
            </div>
          </div>
          {(average != null || covered) && (
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white" aria-hidden="true">
                <div className={`h-full rounded-full ${onTrack ? 'bg-[#1d7a52]' : 'bg-[#ff5a00]'}`} style={{ width: `${pacePct}%` }} />
              </div>
              <span className={`ws-badge ${onTrack ? 'ws-tone-positive' : 'ws-tone-caution'}`}>
                {onTrack && <CheckCircle2 size={12} />}
                {covered ? labels.covered : onTrack ? labels.onTrack : labels.behind}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const COMPARISON_ROW_LABELS = {
  cafeIncome: 'cmpCafe',
  otherIncome: 'cmpOtherIncome',
  payroll: 'cmpPayroll',
  products: 'cmpProducts',
  meals: 'cmpMeals',
  rent: 'cmpRent',
  utilities: 'cmpUtilities',
  other: 'cmpOther',
  expectedOut: 'cmpTotalOut',
  left: 'cmpResult',
}
// Income and result are better when higher; expenses are better when lower.
const COMPARISON_HIGHER_IS_BETTER = new Set(['cafeIncome', 'otherIncome', 'left'])

function MonthComparison({ rows, unavailable, previousLabel, currentLabel, showPaceNote, labels }) {
  if (!unavailable && rows.length === 0) return null
  const lineRows = rows.filter(row => row.key !== 'expectedOut' && row.key !== 'left' && (row.current !== 0 || row.previous !== 0))
  const totals = rows.filter(row => row.key === 'expectedOut' || row.key === 'left')
  const max = Math.max(1, ...lineRows.map(row => Math.max(Math.abs(row.current), Math.abs(row.previous))))
  return (
    <section className="ws-panel" aria-labelledby="estimate-comparison-heading">
      <div className="ws-panel-title mb-4">
        <div>
          <h2 id="estimate-comparison-heading" className="ws-heading">{labels.cmpTitle}</h2>
          <p className="ws-caption mt-0.5">{labels.cmpHelp}</p>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-medium text-[#68655f]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[#ff5a00]" />{currentLabel}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[#cfcac4]" />{previousLabel}</span>
        </div>
      </div>
      {unavailable ? (
        <p className="ws-notice ws-tone-caution">{labels.cmpUnavailable}</p>
      ) : (
        <>
          <div className="divide-y divide-[#efece9]">
            {lineRows.map(row => (
              <ComparisonRow key={row.key} row={row} label={labels[COMPARISON_ROW_LABELS[row.key]]} max={max} labels={labels} />
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {totals.map(row => (
              <div key={row.key} className="rounded-xl border border-[#e4e1de] bg-[#f6f5f3] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="ws-caption">{labels[COMPARISON_ROW_LABELS[row.key]]}</p>
                  <ChangeBadge row={row} labels={labels} />
                </div>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${row.key === 'left' ? (row.current >= 0 ? 'text-[#1d7a52]' : 'text-[#c4262c]') : 'text-[#22201d]'}`}>{formatCurrency(row.current)}</p>
                <p className="ws-caption mt-0.5">{previousLabel}: {formatCurrency(row.previous)}</p>
              </div>
            ))}
          </div>
          {showPaceNote && <p className="ws-caption mt-3">{labels.cmpPaceNote}</p>}
        </>
      )}
    </section>
  )
}

function ChangeBadge({ row, labels }) {
  if (row.change === 0) return <span className="ws-badge">0%</span>
  const good = (row.change > 0) === COMPARISON_HIGHER_IS_BETTER.has(row.key)
  const Icon = row.change > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`ws-badge ${good ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
      <Icon size={12} />
      {row.changePct == null ? labels.cmpNew : `${Math.abs(row.changePct)}%`}
    </span>
  )
}

function ComparisonRow({ row, label, max, labels }) {
  const width = value => `${Math.max(0.5, (Math.abs(value) / max) * 100)}%`
  return (
    <div className="grid gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(140px,200px)_minmax(0,1fr)_auto] sm:items-center">
      <span className="text-sm font-medium text-[#22201d]">{label}</span>
      <div className="space-y-1" aria-hidden="true">
        <div className="h-2 rounded-r bg-[#ff5a00]" style={{ width: width(row.current) }} />
        <div className="h-2 rounded-r bg-[#cfcac4]" style={{ width: width(row.previous) }} />
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-right">
          <span className="block text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.current)}</span>
          <span className="ws-caption block tabular-nums">{formatCurrency(row.previous)}</span>
        </span>
        <span className="w-[72px] text-right"><ChangeBadge row={row} labels={labels} /></span>
      </div>
    </div>
  )
}

function OutlookTile({ label, value, sub, tone = 'default', icon: Icon = null, emphasized = false }) {
  return (
    <div className={`min-w-0 rounded-xl border p-4 ${emphasized ? 'border-[#d6d2cd] bg-white shadow-[0_1px_2px_rgb(34_32_29/6%)]' : 'border-[#e4e1de] bg-white'}`}>
      <p className="ws-caption">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 break-words text-[clamp(18px,1.5vw,22px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${VALUE_TONES[tone] || VALUE_TONES.default}`}>
        {Icon && <Icon size={18} className="flex-shrink-0" />}{value}
      </p>
      <p className="ws-caption mt-1.5 leading-snug">{sub}</p>
    </div>
  )
}

const VALUE_TONES = {
  default: 'text-[#22201d]',
  caution: 'text-[#9a5a00]',
  negative: 'text-[#c4262c]',
  positive: 'text-[#1d7a52]',
}

function BreakdownCard({ icon: Icon, title, total, rows }) {
  return (
    <article className="rounded-xl border border-[#e4e1de] bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
            <Icon size={15} />
          </span>
          <h3 className="text-sm font-semibold text-[#22201d]">{title}</h3>
        </div>
        <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(total)}</span>
      </div>
      <div className="divide-y divide-[#e4e1de]/60">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 text-[13px] text-[#68655f]">{row.label}</span>
            <span className={`flex-shrink-0 text-[13px] font-semibold tabular-nums ${VALUE_TONES[row.tone] || VALUE_TONES.default}`}>{row.value}</span>
          </div>
        ))}
      </div>
    </article>
  )
}

function FlowSection({ title, total, rows, emptyText }) {
  return (
    <section className="ws-panel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="ws-heading">{title}</h2>
        <p className="text-base font-semibold tabular-nums text-[#22201d]">{formatCurrency(total)}</p>
      </div>
      {rows.length === 0 ? (
        <div className="ws-empty"><p>{emptyText}</p></div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[150px_1fr] md:items-center">
          <Donut rows={rows} total={total} />
          <div className="space-y-3">
            {rows.map(row => {
              const width = total > 0 ? Math.max(4, Math.round((row.amount / total) * 100)) : 0
              return (
                <div key={row.key}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-[#22201d]">
                      <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="truncate">{row.label}</span>
                    </span>
                    <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#efece9]">
                    <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function Donut({ rows, total }) {
  let cursor = 0
  const gradient = rows.map(row => {
    const start = cursor
    const span = total > 0 ? (row.amount / total) * 100 : 0
    cursor += span
    return `${row.color} ${start}% ${cursor}%`
  }).join(', ')

  return (
    <div className="mx-auto flex h-[150px] w-[150px] items-center justify-center rounded-full" style={{ background: total > 0 ? `conic-gradient(${gradient})` : '#efece9' }}>
      <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-white text-center">
        <span className="ws-caption px-2 tabular-nums">
          {total > 0 ? '100%' : '—'}
        </span>
      </div>
    </div>
  )
}

function MethodCard({ row, lang, labels }) {
  const icons = {
    cash: Banknote,
    card: CreditCard,
    terminal: Monitor,
    loyalty_card: Tag,
  }
  const Icon = icons[row.method] || WalletCards
  const balance = row.inflow - row.outflow
  const isLoyaltyIncome = row.method === 'loyalty_card'

  return (
    <div className="rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#68655f]">
            <Icon size={15} />
          </span>
          <span className="truncate text-sm font-semibold text-[#22201d]">{isLoyaltyIncome ? labels.loyaltyIncome : methodLabel(row.method, lang)}</span>
        </div>
        <div className="text-right">
          <span className="ws-caption block">{isLoyaltyIncome ? labels.loyaltyIncome : labels.balance}</span>
          <span className={`mt-0.5 block text-base font-semibold leading-tight tabular-nums ${isLoyaltyIncome || balance >= 0 ? 'text-[#1d7a52]' : 'text-[#c4262c]'}`}>
            {formatCurrency(isLoyaltyIncome ? row.inflow : balance)}
          </span>
        </div>
      </div>
      {!isLoyaltyIncome && <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-lg bg-white px-2.5 py-2">
          <span className="ws-caption block">{labels.inflow}</span>
          <span className="mt-0.5 block break-words text-[13px] font-semibold leading-tight tabular-nums text-[#1d7a52]">{formatCurrency(row.inflow)}</span>
        </div>
        <div className="min-w-0 rounded-lg bg-white px-2.5 py-2">
          <span className="ws-caption block">{labels.outflow}</span>
          <span className="mt-0.5 block break-words text-[13px] font-semibold leading-tight tabular-nums text-[#22201d]">{formatCurrency(row.outflow)}</span>
        </div>
      </div>}
    </div>
  )
}
