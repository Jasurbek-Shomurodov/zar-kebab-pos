import CalendarPicker from '../components/CalendarPicker'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Clock3,
  CreditCard,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Tag,
  Users,
  Terminal,
  Trash2,
  UtensilsCrossed,
  WalletCards,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import DateRangePicker from '../components/DateRangePicker'
import { accountingTitle, buildAccountingTabs } from '../lib/accountingTabs'
import { OperationalLoading } from '../components/OperationalState'
import { Kpi, KpiExplanationDialog, toKpiDetail } from '../components/AccountingKpi'
import { ChoiceGroup, ChoiceTile } from '../components/ChoiceTiles'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { canEditFeature } from '../lib/permissions'
import {
  collapseDailyBazaarExpenseRows,
  getAccountingPageSummaryFromOrderSummary,
  getAccountingQuickRange,
} from '../lib/accounting'
import { loadAccountingAllTimeBalance, loadAccountingPaidOrderSummary } from '../lib/accountingSummary'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate, formatTime } from '../lib/dateFormat'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_ENTRY_TYPES,
  EXPENSE_PAYMENT_METHODS,
  INCOME_CATEGORIES,
  MANUAL_EXPENSE_CATEGORIES,
  buildFinalizedEmployeeMealExpenseRows,
  buildSalaryBonusExpenseRows,
  buildSalaryPaymentExpenseRows,
  expenseCategoryLabel,
  expenseDescriptionLabel,
  expensePaymentMethodLabel,
  getExpenseEntryMinDate,
  getExpenseHistoryDeleteTarget,
  getSalaryMonthEndDate,
  getTotalSalaryDue,
  normalizeExpenseAmount,
  normalizeExpenseEntryType,
  isExpenseEntryDateAllowed,
  todayExpenseDate,
} from '../lib/expenses'
import { collectPagedRows } from '../lib/orderHistory'
import { notifyTelegramInvestorExpense } from '../lib/telegramNotifications'

const SELECT_COLUMNS = 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by, created_by_name, created_at, updated_at'
const FIELD_INPUT_CLASS = 'ws-input disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]'
const DATE_INPUT_CLASS = FIELD_INPUT_CLASS
const HISTORY_SECTION_GRID = 'grid items-stretch gap-5 lg:grid-cols-2'

async function notifyInvestorIncome(expenseId) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || ''
  const response = await fetch('/api/telegram/employee-notification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ type: 'investor_income', expenseId }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.ok) throw new Error(data.error || 'Investor notification failed')
  return data
}

function methodIcon(method) {
  if (method === 'card') return CreditCard
  if (method === 'terminal') return Terminal
  if (method === 'loyalty_card') return Tag
  return Banknote
}

function expenseTone(expense) {
  const category = String(expense?.category || '')
  if (normalizeExpenseEntryType(expense?.entry_type) === 'income') {
    return {
      row: 'border-l-2 border-l-[#1d7a52]',
      title: 'text-[#22201d]',
      badge: 'ws-tone-positive',
      amount: 'text-[#1d7a52]',
    }
  }
  if (category.startsWith('salary_') || expense?.is_salary_payment || expense?.is_salary_bonus) {
    return {
      row: 'border-l-2 border-l-[#2a6fdb]',
      title: 'text-[#22201d]',
      badge: 'ws-tone-info',
      amount: 'text-[#22201d]',
    }
  }
  if (category === 'products_bazaar') {
    return {
      row: 'border-l-2 border-l-[#0f766e]',
      title: 'text-[#22201d]',
      badge: '',
      amount: 'text-[#22201d]',
    }
  }
  return {
    row: 'border-l-2 border-l-[#ff5a00]',
    title: 'text-[#22201d]',
    badge: '',
    amount: 'text-[#22201d]',
  }
}

function DateInput(props) {
  return <CalendarPicker className={DATE_INPUT_CLASS} {...props} />
}

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


export default function Expenses() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const role = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const canAdd = canEditFeature(profile || { role }, 'expenses')
  const canDelete = canEditFeature(profile || { role }, 'expenses')

  const [dateFrom, setDateFrom] = useState(() => todayExpenseDate().slice(0, 8) + '01')
  const [dateTo, setDateTo] = useState(() => todayExpenseDate())
  const [activeRangeKey, setActiveRangeKey] = useState('month')
  const [expenses, setExpenses] = useState([])
  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [employeeMealSnapshots, setEmployeeMealSnapshots] = useState([])
  const [paidOrderSummary, setPaidOrderSummary] = useState({})
  const [allTimeBalance, setAllTimeBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [deletingExpenseId, setDeletingExpenseId] = useState('')
  const [selectedKpi, setSelectedKpi] = useState(null)
  const loadRequestRef = useRef(0)
  const [form, setForm] = useState({
    entry_type: 'expense',
    expense_date: todayExpenseDate(),
    category: 'charcoal',
    payment_method: 'cash',
    amount: '',
    vendor: '',
    description: '',
  })

  const L = {
    uz: {
      title: 'Buxgalteriya',
      sub: 'Daromad, xarajat, investor yordami va maoshlarni kuzatish',
      income: 'Daromad',
      expenses: 'Xarajatlar',
      employeeMeals: 'Xodimlar ovqatining o‘rtacha qiymati',
      employeeMealsSub: 'Davomat bo‘yicha hisoblangan',
      left: 'Qolgan pul',
      allTimeLeft: 'Barcha vaqtdagi qoldiq',
      allTimeLeftSub: 'Barcha qayd etilgan kirim minus to‘langan xarajatlar va yopilgan oylar egasi foydasi',
      add: 'Xarajat qo‘shish',
      addIncome: 'Investor yordamini qo‘shish',
      date: 'Sana',
      entryType: 'Yozuv turi',
      expenseType: 'Xarajat',
      incomeType: 'Daromad',
      category: 'Kategoriya',
      method: 'To‘lov turi',
      amount: 'Summa',
      vendor: 'Yetkazuvchi yoki xodim',
      source: 'Investor yoki manba',
      description: 'Izoh',
      save: 'Saqlash',
      saving: 'Saqlanmoqda...',
      refresh: 'Yangilash',
      salaries: 'Maoshlar',
      employees: 'Xodimlar',
      salaryDue: 'Hozirgi maosh qarzi',
      salaryDueAsOf: 'Hisoblangan sana',
      salaryDueMonthEnd: 'Oy oxirigacha maosh qarzi',
      salaryDueProjection: 'Prognoz sanasi',
      period: 'Hisobot davri',
      periodHelp: 'Quyidagi barcha ko‘rsatkichlar va tarix tanlangan davrga tegishli.',
      overview: 'Moliyaviy ko‘rinish',
      overviewHelp: 'Xarajatlar, qoldiq va maosh majburiyatlari bir joyda.',
      overviewCash: 'Xarajatlar va qoldiq',
      overviewCashHelp: 'Pul chiqimi va hozir mavjud bo‘lgan mablag‘.',
      overviewSalary: 'Maosh majburiyatlari',
      overviewSalaryHelp: 'Hozirgi qarz va oy oxirigacha kutilayotgan summa.',
      operations: 'Yozuvlar',
      operationsHelp: 'Yangi xarajat yoki investor yordamini yozing.',
      recentActivity: 'So‘nggi operatsiyalar',
      recentActivityHelp: 'Investor yordami va xarajatlar yonma-yon ko‘rsatiladi.',
      recordExpenseHelp: 'Kafedan chiqqan pulni yozing.',
      recordIncomeHelp: 'Investordan olingan yordamni yozing.',
      expenseSaved: 'Xarajat saqlandi',
      incomeSaved: 'Daromad saqlandi',
      today: 'Bugun',
      yesterday: 'Kecha',
      week: '7 kun',
      month: 'Oy',
      previousMonth: 'O‘tgan oy',
      presets: 'Tayyor davrlar',
      previousWeek: 'O‘tgan hafta',
      previousCurrentWeek: 'O‘tgan va joriy hafta',
      currentWeek: 'Joriy hafta',
      currentNextWeek: 'Joriy va keyingi hafta',
      nextWeek: 'Keyingi hafta',
      nextMonth: 'Keyingi oy',
      applyRange: 'Davrni qo‘llash',
      cancel: 'Bekor qilish',
      selectDateRange: 'Sana oralig‘ini tanlash',
      weekdays: ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'],
      from: 'Dan',
      to: 'Gacha',
      incomeSources: 'Qo‘shimcha daromad manbalari',
      investorHistory: 'Investor yordami',
      history: 'Xarajatlar tarixi',
      more: 'Batafsil',
      seeAll: 'Barchasini ko‘rish',
      showLess: 'Kamroq ko‘rsatish',
      empty: 'Bu davrda xarajat yozilmagan',
      emptyInvestor: 'Bu davrda investor yordami yo‘q',
      investorNotificationFailed: 'Investor yordami saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
      expenseNotificationFailed: 'Xarajat saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
      salaryBonus: 'Maosh bonusi',
      required: 'Sana, kategoriya, to‘lov turi va summa kerak.',
      expenseDateLimit: 'Xarajat faqat bugun yoki oldingi 3 kalendar kun uchun kiritilishi mumkin.',
      saveFailed: 'Xarajatni saqlab bo‘lmadi.',
      loadFailed: 'Xarajatlarni yuklab bo‘lmadi.',
      migrationMissing: 'Xarajatlar jadvali hali bazada tayyor emas. Supabase SQL editorida migrations/048_expenses.sql va migrations/059_expense_income_entries.sql migratsiyalarini ishga tushiring.',
      salaryMigrationMissing: 'Maosh jadvallari yangilanmagan. Supabase SQL editorida employee_salary migratsiyalarini va migrations/099_employee_salary_fines.sql ni ishga tushiring.',
      automaticSalary: 'Maosh to‘lovi',
      delete: 'O‘chirish',
      confirmDelete: 'Tasdiqlash',
      deleteFailed: 'Xarajatni o‘chirib bo‘lmadi.',
      readOnly: 'Bu rol faqat ko‘ra oladi.',
      calculationDetails: 'Hisoblash tafsilotlari',
      howCalculated: 'Qanday hisoblangan',
      included: 'Nimalar kiritilgan',
      close: 'Yopish',
      tapForDetails: 'Hisoblashni ko‘rish uchun bosing',
    },
    ru: {
      title: 'Бухгалтерия',
      sub: 'Учёт доходов, расходов, поддержки инвестора и зарплат',
      income: 'Доход',
      expenses: 'Расходы',
      employeeMeals: 'Среднее питание сотрудников',
      employeeMealsSub: 'Рассчитано по посещаемости',
      left: 'Остаток',
      allTimeLeft: 'Остаток за всё время',
      allTimeLeftSub: 'Все учтённые поступления минус оплаченные расходы и прибыль владельца закрытых месяцев',
      add: 'Добавить расход',
      addIncome: 'Добавить поддержку инвестора',
      date: 'Дата',
      entryType: 'Тип записи',
      expenseType: 'Расход',
      incomeType: 'Доход',
      category: 'Категория',
      method: 'Способ оплаты',
      amount: 'Сумма',
      vendor: 'Поставщик или сотрудник',
      source: 'Инвестор или источник',
      description: 'Описание',
      save: 'Сохранить',
      saving: 'Сохраняется...',
      refresh: 'Обновить',
      salaries: 'Зарплаты',
      employees: 'Сотрудники',
      salaryDue: 'Долг по зарплате сейчас',
      salaryDueAsOf: 'На дату',
      salaryDueMonthEnd: 'Долг по зарплате к концу месяца',
      salaryDueProjection: 'Прогноз на',
      period: 'Отчётный период',
      periodHelp: 'Все показатели и история ниже относятся к выбранному периоду.',
      overview: 'Финансовый обзор',
      overviewHelp: 'Расходы, остаток и зарплатные обязательства в одном месте.',
      overviewCash: 'Расходы и остаток',
      overviewCashHelp: 'Отток денег и доступные средства на текущий момент.',
      overviewSalary: 'Зарплатные обязательства',
      overviewSalaryHelp: 'Текущий долг и прогнозируемая сумма к концу месяца.',
      operations: 'Запись операций',
      operationsHelp: 'Запишите новый расход или поддержку инвестора.',
      recentActivity: 'Последние операции',
      recentActivityHelp: 'Поддержка инвестора и расходы показаны рядом.',
      recordExpenseHelp: 'Запишите деньги, которые были потрачены из кассы кафе.',
      recordIncomeHelp: 'Запишите поддержку, полученную от инвестора.',
      expenseSaved: 'Расход сохранён',
      incomeSaved: 'Доход сохранён',
      today: 'Сегодня',
      yesterday: 'Вчера',
      week: '7 дней',
      month: 'Месяц',
      previousMonth: 'Прошлый месяц',
      presets: 'Готовые периоды',
      previousWeek: 'Прошлая неделя',
      previousCurrentWeek: 'Прошлая и текущая неделя',
      currentWeek: 'Текущая неделя',
      currentNextWeek: 'Текущая и следующая неделя',
      nextWeek: 'Следующая неделя',
      nextMonth: 'Следующий месяц',
      applyRange: 'Применить период',
      cancel: 'Отмена',
      selectDateRange: 'Выбрать период',
      weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
      from: 'С',
      to: 'По',
      incomeSources: 'Источники внешнего дохода',
      investorHistory: 'Поддержка инвестора',
      history: 'История расходов',
      more: 'Подробнее',
      seeAll: 'Показать все',
      showLess: 'Свернуть',
      empty: 'За этот период расходов нет',
      emptyInvestor: 'За этот период поддержки инвестора нет',
      investorNotificationFailed: 'Поддержка инвестора сохранена, но сообщение в группу ZarKebab Investor не отправлено.',
      expenseNotificationFailed: 'Расход сохранён, но сообщение в группу ZarKebab Investor не отправлено.',
      salaryBonus: 'Бонус к зарплате',
      required: 'Нужны дата, категория, способ оплаты и сумма.',
      expenseDateLimit: 'Расход можно добавить только за сегодня или за предыдущие 3 календарных дня.',
      saveFailed: 'Не удалось сохранить расход.',
      loadFailed: 'Не удалось загрузить расходы.',
      migrationMissing: 'Таблица расходов ещё не готова в базе. Запустите migrations/048_expenses.sql и migrations/059_expense_income_entries.sql в Supabase SQL Editor.',
      salaryMigrationMissing: 'Таблицы зарплат не обновлены. Запустите миграции employee_salary и migrations/099_employee_salary_fines.sql в Supabase SQL Editor.',
      automaticSalary: 'Выплата зарплаты',
      delete: 'Удалить',
      confirmDelete: 'Подтвердить',
      deleteFailed: 'Не удалось удалить расход.',
      readOnly: 'Эта роль может только просматривать.',
      calculationDetails: 'Расчёт показателя',
      howCalculated: 'Как рассчитано',
      included: 'Что включено',
      close: 'Закрыть',
      tapForDetails: 'Нажмите, чтобы увидеть расчёт',
    },
    en: {
      title: 'Accounting',
      sub: 'Track income, expenses, investor support, and salaries',
      income: 'Income',
      expenses: 'Expenses',
      employeeMeals: 'Avg employees meal',
      employeeMealsSub: 'Calculated from attendance',
      left: 'Left',
      allTimeLeft: 'All-time left',
      allTimeLeftSub: 'All recorded income minus paid expenses and closed months’ owner profit',
      add: 'Add expense',
      addIncome: 'Add investor support',
      date: 'Date',
      entryType: 'Entry type',
      expenseType: 'Expense',
      incomeType: 'Income',
      category: 'Category',
      method: 'Payment method',
      amount: 'Amount',
      vendor: 'Vendor or employee',
      source: 'Investor or source',
      description: 'Description',
      save: 'Save',
      saving: 'Saving...',
      refresh: 'Refresh',
      salaries: 'Salaries',
      employees: 'Employees',
      salaryDue: 'Salary due now',
      salaryDueAsOf: 'As of',
      salaryDueMonthEnd: 'Salary due by month end',
      salaryDueProjection: 'Projected for',
      period: 'Reporting period',
      periodHelp: 'All totals and history below use the selected period.',
      overview: 'Financial overview',
      overviewHelp: 'Spending, balances, and salary obligations in one place.',
      overviewCash: 'Spending and balances',
      overviewCashHelp: 'Money going out and the funds currently available.',
      overviewSalary: 'Salary obligations',
      overviewSalaryHelp: 'Amount due now and projected through the end of the month.',
      operations: 'Record',
      operationsHelp: 'Record a new expense or investor support.',
      recentActivity: 'Recent activity',
      recentActivityHelp: 'Investor support and expenses are shown side by side.',
      recordExpenseHelp: 'Record money spent from the cafe.',
      recordIncomeHelp: 'Record support received from an investor.',
      expenseSaved: 'Expense saved',
      incomeSaved: 'Income saved',
      today: 'Today',
      yesterday: 'Yesterday',
      week: '7 days',
      month: 'Month',
      previousMonth: 'Previous month',
      presets: 'Presets',
      previousWeek: 'Previous week',
      previousCurrentWeek: 'Previous & current week',
      currentWeek: 'Current week',
      currentNextWeek: 'Current & next week',
      nextWeek: 'Next week',
      nextMonth: 'Next month',
      applyRange: 'Apply range',
      cancel: 'Cancel',
      selectDateRange: 'Select date range',
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      from: 'From',
      to: 'To',
      incomeSources: 'Other income sources',
      investorHistory: 'Investor support',
      history: 'Expense history',
      more: 'More',
      seeAll: 'See all',
      showLess: 'Show less',
      empty: 'No expenses in this period',
      emptyInvestor: 'No investor support in this period',
      investorNotificationFailed: 'Investor support was saved, but the ZarKebab Investor group notification was not sent.',
      expenseNotificationFailed: 'The expense was saved, but the ZarKebab Investor group notification was not sent.',
      salaryBonus: 'Salary bonus',
      required: 'Date, category, payment method, and amount are required.',
      expenseDateLimit: 'An expense can be added only for today or the previous 3 calendar days.',
      saveFailed: 'Could not save expense.',
      loadFailed: 'Could not load expenses.',
      migrationMissing: 'Expenses table is not ready yet. Run migrations/048_expenses.sql and migrations/059_expense_income_entries.sql in Supabase SQL Editor.',
      salaryMigrationMissing: 'Salary tables are not up to date. Run the employee_salary migrations and migrations/099_employee_salary_fines.sql in Supabase SQL Editor.',
      automaticSalary: 'Salary payment',
      delete: 'Delete',
      confirmDelete: 'Confirm',
      deleteFailed: 'Could not delete expense.',
      readOnly: 'This role can view only.',
      calculationDetails: 'Calculation details',
      howCalculated: 'How it is calculated',
      included: 'What is included',
      close: 'Close',
      tapForDetails: 'Tap to see the calculation',
    },
  }
  const l = L[lang] || L.en
  const categoryOptions = form.entry_type === 'income' ? INCOME_CATEGORIES : MANUAL_EXPENSE_CATEGORIES
  const formGuidance = form.entry_type === 'income' ? l.recordIncomeHelp : l.recordExpenseHelp
  const expenseEntryMinDate = getExpenseEntryMinDate()
  const expenseDateAllowed = form.entry_type === 'income' || isExpenseEntryDateAllowed(form.expense_date)
  const canSubmitExpense = canAdd && !saving && Boolean(
    form.expense_date &&
    form.category &&
    form.payment_method &&
    normalizeExpenseAmount(form.amount) > 0 &&
    expenseDateAllowed
  )

  async function loadExpenses() {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    setLoading(true)
    setPaidOrderSummary({})
    setError('')
    const expensePromise = loadPagedResult((from, to) => supabase
        .from('expenses')
        .select(SELECT_COLUMNS)
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to))
    const salaryPromise = Promise.all([
      loadPagedResult((from, to) => supabase.from('employee_salary_profiles').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_rates').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_payments').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_bonuses').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_fines').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('employee_salary_absences').select('*').order('id').range(from, to)),
      loadPagedResult((from, to) => supabase.from('profiles').select('id, full_name, email, role, status').order('id').range(from, to)),
    ])
    const employeeMealPromise = loadPagedResult((from, to) => supabase
      .from('employee_daily_meal_expenses')
      .select('business_date, average_daily_amount, present_employee_count, total_amount, source_type, finalized_at, created_at')
      .gte('business_date', dateFrom)
      .lte('business_date', dateTo)
      .order('business_date', { ascending: false })
      .range(from, to))
    const fallbackMenuItemMap = Object.fromEntries(state.menuItems.map(item => [item.id, item]))
    const orderPromise = loadAccountingPaidOrderSummary(dateFrom, dateTo, { fallbackMenuItemMap })
      .then(data => ({ data, error: null }))
      .catch(error => ({ data: {}, error }))
    const allTimeBalancePromise = loadAccountingAllTimeBalance()
      .then(data => ({ data, error: null }))
      .catch(error => ({ data: null, error }))

    const [
      expenseResult,
      orderHistoryResult,
      allTimeBalanceResult,
      employeeMealResult,
      [salaryProfileResult, salaryRateResult, salaryPaymentResult, salaryBonusResult, salaryFineResult, salaryAbsenceResult, teamResult],
    ] = await Promise.all([expensePromise, orderPromise, allTimeBalancePromise, employeeMealPromise, salaryPromise])
    if (requestId !== loadRequestRef.current) return

    let loadError = ''
    if (expenseResult.error) {
      loadError = isMissingExpensesMigration(expenseResult.error)
        ? l.migrationMissing
        : expenseResult.error.message || l.loadFailed
      setExpenses([])
    } else {
      setExpenses(expenseResult.data || [])
    }

    if (orderHistoryResult.error) {
      setPaidOrderSummary({})
      loadError ||= orderHistoryResult.error.message || l.loadFailed
    } else {
      setPaidOrderSummary(orderHistoryResult.data || {})
    }

    setAllTimeBalance(allTimeBalanceResult.error ? null : allTimeBalanceResult.data)

    if (employeeMealResult.error) {
      setEmployeeMealSnapshots([])
      loadError ||= employeeMealResult.error.message || l.loadFailed
    } else {
      setEmployeeMealSnapshots(employeeMealResult.data || [])
    }

    const salaryError = salaryProfileResult.error
      || salaryRateResult.error
      || salaryPaymentResult.error
      || salaryBonusResult.error
      || salaryAbsenceResult.error
    if (salaryError) {
      setSalaryProfiles([])
      loadError ||= isMissingSalaryMigration(salaryError)
        ? l.salaryMigrationMissing
        : salaryError.message || l.loadFailed
    } else {
      if (salaryFineResult.error) {
        loadError ||= isMissingSalaryMigration(salaryFineResult.error)
          ? l.salaryMigrationMissing
          : salaryFineResult.error.message || l.loadFailed
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

    setError(loadError)
    setLoading(false)
  }

  useEffect(() => {
    loadExpenses()
    return () => { loadRequestRef.current += 1 }
  }, [dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  const salaryExpenses = useMemo(() => (
    buildSalaryPaymentExpenseRows(salaryProfiles, dateFrom, dateTo)
      .map(row => ({ ...row, description: l.automaticSalary }))
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || String(a.vendor || '').localeCompare(String(b.vendor || '')))
  ), [salaryProfiles, dateFrom, dateTo, l.automaticSalary])
  const salaryBonusExpenses = useMemo(() => (
    buildSalaryBonusExpenseRows(salaryProfiles, dateFrom, dateTo)
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || String(a.vendor || '').localeCompare(String(b.vendor || '')))
  ), [salaryProfiles, dateFrom, dateTo])

  const employeeMealExpenses = useMemo(() => (
    buildFinalizedEmployeeMealExpenseRows(employeeMealSnapshots)
  ), [employeeMealSnapshots])

  const allExpenses = useMemo(() => (
    [...salaryExpenses, ...salaryBonusExpenses, ...employeeMealExpenses, ...expenses]
      .sort((a, b) => (
        b.expense_date.localeCompare(a.expense_date) ||
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      ))
  ), [salaryExpenses, salaryBonusExpenses, employeeMealExpenses, expenses])

  const filteredExpenses = allExpenses

  const filteredInvestorSupport = useMemo(() => (
    filteredExpenses.filter(expense => (
      normalizeExpenseEntryType(expense.entry_type) === 'income' &&
      expense.category === 'investor_support'
    ))
  ), [filteredExpenses])
  const filteredExpenseRows = useMemo(() => (
    collapseDailyBazaarExpenseRows(
      filteredExpenses.filter(expense => normalizeExpenseEntryType(expense.entry_type) !== 'income')
    )
  ), [filteredExpenses])
  const accountingSummary = useMemo(
    () => getAccountingPageSummaryFromOrderSummary(
      paidOrderSummary,
      filteredExpenses,
      dateFrom,
      dateTo
    ),
    [paidOrderSummary, filteredExpenses, dateFrom, dateTo]
  )
  const {
    cafeIncome,
    expenseSummary: summary,
    netIncome,
    employeeMealExpensesTotal,
    investorSupportTotal,
    incomeSummary,
  } = accountingSummary
  const currentAccountingDate = todayExpenseDate()
  const salaryDueDate = dateTo < currentAccountingDate ? dateTo : currentAccountingDate
  const payableSalaryProfiles = useMemo(
    () => salaryProfiles.filter(salaryProfile => !salaryProfile.deleted_at),
    [salaryProfiles]
  )
  const totalSalaryDue = useMemo(
    () => getTotalSalaryDue(payableSalaryProfiles, salaryDueDate),
    [payableSalaryProfiles, salaryDueDate]
  )
  const salaryMonthEndDate = getSalaryMonthEndDate(salaryDueDate)
  const totalSalaryDueByMonthEnd = useMemo(
    () => getTotalSalaryDue(payableSalaryProfiles, salaryMonthEndDate),
    [payableSalaryProfiles, salaryMonthEndDate]
  )
  const periodLabel = `${formatLongDate(dateFrom, lang, dateFrom)} — ${formatLongDate(dateTo, lang, dateTo)}`
  const kpiDetails = useMemo(() => {
    const text = {
      uz: {
        expenses: ['Tanlangan davrdagi barcha xarajat yozuvlari yig‘indisi.', ['Qo‘lda kiritilgan xarajatlar va Kunlik bozor', 'To‘langan maoshlar va bonuslar', 'Yakunlangan xodimlar ovqati hisoblari', 'Daromad yozuvlari kiritilmaydi']],
        meals: ['Tanlangan davrdagi yakunlangan kunlik ovqat xarajatlari yig‘indisi.', ['Har kun uchun: o‘rtacha ovqat summasi × qatnashgan xodimlar soni', 'Faqat yakunlangan kunlik snapshotlar']],
        left: [`${formatCurrency(cafeIncome)} + ${formatCurrency(incomeSummary.total)} − ${formatCurrency(summary.total)} = ${formatCurrency(netIncome)}`, ['Kafe daromadi', 'Investor yordami va boshqa tashqi daromadlar', 'Barcha qayd etilgan xarajatlar', 'Loyallik mablag‘i kiritilmaydi']],
        salaryDue: ['Hisoblangan maosh + bonuslar − jarimalar − to‘lovlar.', ['Ish boshlagan kundan ko‘rsatilgan sanagacha kunlik stavkalar', 'Yo‘qlik kunlari hisoblanmaydi', 'Oldingi qarzlar, bonuslar, jarimalar va amalga oshirilgan to‘lovlar']],
        salaryMonthEnd: ['Oy oxirigacha prognoz maosh + bonuslar − jarimalar − to‘lovlar.', ['Joriy maosh stavkalari oy oxirigacha davom etadi deb olinadi', 'Ma’lum yo‘qlik kunlari hisoblanmaydi', 'Oldingi qarzlar va qayd etilgan tuzatishlar']],
      },
      ru: {
        expenses: ['Сумма всех расходных записей за выбранный период.', ['Ручные расходы и Ежедневный базар', 'Выплаченные зарплаты и бонусы', 'Завершённые расчёты питания сотрудников', 'Записи дохода не включены']],
        meals: ['Сумма завершённых дневных расчётов питания за выбранный период.', ['За каждый день: средняя стоимость питания × количество присутствовавших сотрудников', 'Только финализированные дневные снимки']],
        left: [`${formatCurrency(cafeIncome)} + ${formatCurrency(incomeSummary.total)} − ${formatCurrency(summary.total)} = ${formatCurrency(netIncome)}`, ['Доход кафе', 'Поддержка инвестора и другой внешний доход', 'Все учтённые расходы', 'Оплата лояльностью не включена']],
        salaryDue: ['Начисленная зарплата + бонусы − штрафы − выплаты.', ['Дневные ставки с даты начала работы по указанную дату', 'Дни отсутствия не начисляются', 'Прошлый долг, бонусы, штрафы и произведённые выплаты']],
        salaryMonthEnd: ['Прогноз начислений до конца месяца + бонусы − штрафы − выплаты.', ['Текущие ставки продолжаются до конца месяца', 'Известные дни отсутствия не начисляются', 'Прошлый долг и записанные корректировки']],
      },
      en: {
        expenses: ['Total of all expense entries in the selected period.', ['Manual expenses and Daily Bazaar', 'Paid salaries and bonuses', 'Finalized employee meal calculations', 'Income entries are excluded']],
        meals: ['Total finalized daily employee-meal calculations in the selected period.', ['Per day: average meal amount × employees present', 'Finalized daily snapshots only']],
        left: [`${formatCurrency(cafeIncome)} + ${formatCurrency(incomeSummary.total)} − ${formatCurrency(summary.total)} = ${formatCurrency(netIncome)}`, ['Cafe income', 'Investor support and other external income', 'All recorded expenses', 'Loyalty value is excluded']],
        salaryDue: ['Accrued salary + bonuses − fines − payments.', ['Daily rates from employment start through the as-of date', 'Absence days are not accrued', 'Earlier debt, bonuses, fines, and completed payments']],
        salaryMonthEnd: ['Projected accrual through month end + bonuses − fines − payments.', ['Current rates are projected through month end', 'Known absence days are not accrued', 'Earlier debt and recorded adjustments']],
      },
    }[lang] || null
    return {
      expenses: { title: l.expenses, value: formatCurrency(summary.total), ...toKpiDetail(text.expenses) },
      meals: { title: l.employeeMeals, value: formatCurrency(employeeMealExpensesTotal), ...toKpiDetail(text.meals) },
      left: { title: l.left, value: formatCurrency(netIncome), ...toKpiDetail(text.left) },
      salaryDue: { title: l.salaryDue, value: formatCurrency(totalSalaryDue), ...toKpiDetail(text.salaryDue) },
      salaryMonthEnd: { title: l.salaryDueMonthEnd, value: formatCurrency(totalSalaryDueByMonthEnd), ...toKpiDetail(text.salaryMonthEnd) },
    }
  }, [lang, l, cafeIncome, incomeSummary.total, summary.total, employeeMealExpensesTotal, netIncome, totalSalaryDue, totalSalaryDueByMonthEnd])

  function selectQuickRange(key) {
    const range = getAccountingQuickRange(key)
    setActiveRangeKey(key)
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
  }

  function setCustomRange(from, to) {
    if (!from || !to) return
    setActiveRangeKey('custom')
    setDateFrom(from <= to ? from : to)
    setDateTo(from <= to ? to : from)
  }

  async function saveExpense(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    const amount = normalizeExpenseAmount(form.amount)
    if (!form.expense_date || !form.category || !form.payment_method || amount <= 0) {
      setError(l.required)
      return
    }
    const entryType = normalizeExpenseEntryType(form.entry_type)
    if (entryType === 'expense' && !isExpenseEntryDateAllowed(form.expense_date)) {
      setError(l.expenseDateLimit)
      return
    }
    setSaving(true)
    const payload = {
      entry_type: entryType,
      expense_date: form.expense_date,
      category: form.category,
      payment_method: form.payment_method,
      amount,
      vendor: form.vendor.trim(),
      description: form.description.trim(),
      created_by: profile?.id || null,
      created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
    }
    const { data: savedExpense, error: saveError } = await supabase
      .from('expenses')
      .insert(payload)
      .select('id')
      .single()
    if (saveError) {
      setSaving(false)
      setError(isMissingExpensesMigration(saveError) ? l.migrationMissing : saveError.message || l.saveFailed)
      return
    }
    setForm(current => ({
      ...current,
      category: entryType === 'income' ? 'investor_support' : current.category,
      amount: '',
      vendor: '',
      description: '',
    }))
    setMessage(entryType === 'income' ? l.incomeSaved : l.expenseSaved)
    if (entryType === 'income') {
      try {
        await notifyInvestorIncome(savedExpense.id)
      } catch (notificationError) {
        console.error('[accounting] investor Telegram notification failed:', notificationError)
        setError(l.investorNotificationFailed)
      }
    } else {
      const notification = await notifyTelegramInvestorExpense(savedExpense.id)
      if (!notification.ok) setError(l.expenseNotificationFailed)
    }
    setSaving(false)
    await loadExpenses()
  }

  async function deleteExpense(expense) {
    if (!canDelete || deletingExpenseId) return
    const target = getExpenseHistoryDeleteTarget(expense)
    if (!target) return
    if (confirmDeleteId !== expense.id) {
      setConfirmDeleteId(expense.id)
      return
    }
    setDeletingExpenseId(expense.id)
    setError('')
    const { data, error: deleteError } = await supabase
      .from(target.table)
      .delete()
      .eq('id', target.id)
      .select('id')
    setDeletingExpenseId('')
    if (deleteError || !data?.length) {
      setError(deleteError?.message || l.deleteFailed)
      return
    }
    setConfirmDeleteId('')
    await loadExpenses()
  }

  return (
    <AppShell
      title={accountingTitle(lang)}
      tabs={buildAccountingTabs(lang, 'overview', navigate)}
      headerActions={(
        <nav aria-label={l.title} className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadExpenses}
            disabled={loading}
            aria-label={l.refresh}
            title={l.refresh}
            className="ws-btn ws-btn-outline !h-[38px] !w-[38px] !px-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </nav>
      )}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          {/* Reporting period sits under the top bar, which holds the Accounting tabs. */}
          <section className="flex flex-wrap items-center justify-between gap-3" aria-labelledby="accounting-period-heading">
            <div className="min-w-0">
              <h2 id="accounting-period-heading" className="ws-heading">{l.period}</h2>
              <p className="ws-caption mt-0.5">{l.periodHelp}</p>
            </div>
            <DateRangePicker
              l={l}
              lang={lang}
              rangeKey={activeRangeKey}
              dateFrom={dateFrom}
              dateTo={dateTo}
              today={todayExpenseDate()}
              onPreset={selectQuickRange}
              onApply={setCustomRange}
              compact
              align="right"
              className="w-full sm:w-[340px]"
            />
          </section>

          {error && <div role="alert" className="ws-notice ws-tone-negative">{error}</div>}
          {message && !error && <div role="status" aria-live="polite" className="ws-notice ws-tone-positive">{message}</div>}

          <section aria-labelledby="accounting-overview-heading">
            <SectionHeading
              id="accounting-overview-heading"
              title={l.overview}
              description={`${l.overviewHelp} · ${formatLongDate(dateFrom, lang, dateFrom)} — ${formatLongDate(dateTo, lang, dateTo)}`}
            />
            <div className="space-y-6">
              <div aria-labelledby="accounting-cash-heading">
                <OverviewGroupHeading id="accounting-cash-heading" title={l.overviewCash} description={l.overviewCashHelp} tone="orange" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi loading={loading} icon={ReceiptText} label={l.expenses} value={loading ? '—' : formatCurrency(summary.total)} sub={loading ? l.periodHelp : `${l.period}: ${periodLabel} · ${summary.count} ${l.expenses.toLowerCase()}`} tone="orange" detailHint={l.tapForDetails} onClick={loading ? null : () => setSelectedKpi(kpiDetails.expenses)} />
            <Kpi loading={loading} icon={UtensilsCrossed} label={l.employeeMeals} value={loading ? '—' : formatCurrency(employeeMealExpensesTotal)} sub={l.employeeMealsSub} tone="orange" detailHint={l.tapForDetails} onClick={loading ? null : () => setSelectedKpi(kpiDetails.meals)} />
            <Kpi loading={loading} icon={Banknote} label={l.left} value={loading ? '—' : formatCurrency(netIncome)} sub={loading ? l.periodHelp : `${l.period}: ${periodLabel}`} tone={netIncome >= 0 ? 'blue' : 'red'} detailHint={l.tapForDetails} onClick={loading ? null : () => setSelectedKpi(kpiDetails.left)} />
            <Kpi loading={loading} icon={WalletCards} label={l.allTimeLeft} value={loading || allTimeBalance == null ? '—' : formatCurrency(allTimeBalance)} sub={l.allTimeLeftSub} tone={allTimeBalance == null || allTimeBalance >= 0 ? 'blue' : 'red'} />
                </div>
              </div>

              <div aria-labelledby="accounting-salary-heading">
                <OverviewGroupHeading id="accounting-salary-heading" title={l.overviewSalary} description={l.overviewSalaryHelp} tone="red" />
                <div className="grid gap-3 sm:grid-cols-2">
            <Kpi loading={loading}
              icon={Users}
              label={l.salaryDue}
              value={loading ? '—' : formatCurrency(totalSalaryDue)}
              sub={`${l.salaryDueAsOf}: ${formatLongDate(salaryDueDate, lang, salaryDueDate)}`}
              tone={totalSalaryDue > 0 ? 'orange' : 'green'}
              detailHint={l.tapForDetails}
              onClick={loading ? null : () => setSelectedKpi(kpiDetails.salaryDue)}
            />
            <Kpi loading={loading}
              icon={CalendarDays}
              label={l.salaryDueMonthEnd}
              value={loading ? '—' : formatCurrency(totalSalaryDueByMonthEnd)}
              sub={`${l.salaryDueProjection}: ${formatLongDate(salaryMonthEndDate, lang, salaryMonthEndDate)}`}
              tone={totalSalaryDueByMonthEnd > 0 ? 'red' : 'green'}
              detailHint={l.tapForDetails}
              onClick={loading ? null : () => setSelectedKpi(kpiDetails.salaryMonthEnd)}
            />
                </div>
              </div>
            </div>
          </section>

          {selectedKpi && (
            <KpiExplanationDialog
              detail={selectedKpi}
              period={periodLabel}
              labels={l}
              onClose={() => setSelectedKpi(null)}
            />
          )}

          <section aria-labelledby="accounting-operations-heading">
            <SectionHeading id="accounting-operations-heading" title={l.operations} description={l.operationsHelp} />
            <section className="ws-panel">
                  <CardHeading
                    title={form.entry_type === 'income' ? l.addIncome : l.add}
                    description={formGuidance}
                  />
                {!canAdd ? (
                  <p className="ws-notice ws-tone-caution">{l.readOnly}</p>
                ) : (
                  <form onSubmit={saveExpense} className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <ChoiceGroup label={l.entryType} className="sm:col-span-2" columns="sm:grid-cols-2">
                      {EXPENSE_ENTRY_TYPES.map(entryType => {
                        const active = form.entry_type === entryType
                        const incomeEntry = entryType === 'income'
                        return (
                          <ChoiceTile
                            key={entryType}
                            active={active}
                            disabled={saving}
                            tone={incomeEntry ? 'green' : 'orange'}
                            icon={incomeEntry ? ArrowDownLeft : ArrowUpRight}
                            title={incomeEntry ? l.incomeType : l.expenseType}
                            hint={incomeEntry ? l.recordIncomeHelp : l.recordExpenseHelp}
                            onClick={() => setForm(current => ({
                              ...current,
                              entry_type: entryType,
                              category: entryType === 'income' ? 'investor_support' : 'charcoal',
                            }))}
                          />
                        )
                      })}
                    </ChoiceGroup>
                    <Field label={l.date}>
                      <DateInput
                        value={form.expense_date}
                        lang={lang}
                        onChange={value => setForm(current => ({ ...current, expense_date: value }))}
                        disabled={saving}
                        min={form.entry_type === 'expense' ? expenseEntryMinDate : undefined}
                      />
                      {form.entry_type === 'expense' && <p className="ws-caption mt-1">{l.expenseDateLimit}</p>}
                    </Field>
                    <Field label={l.amount}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInput(form.amount)}
                        onChange={event => setForm(current => ({ ...current, amount: normalizeMoneyInput(event.target.value) }))}
                        className={`${FIELD_INPUT_CLASS} !text-base font-semibold tabular-nums`}
                        placeholder="0 UZS"
                        disabled={saving}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label={l.category}>
                      <select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} className={FIELD_INPUT_CLASS} disabled={saving}>
                        {categoryOptions.map(category => (
                          <option key={category.key} value={category.key}>{expenseCategoryLabel(category.key, lang)}</option>
                        ))}
                      </select>
                      </Field>
                    </div>
                    <ChoiceGroup label={l.method} className="sm:col-span-2" columns="grid-cols-3">
                      {EXPENSE_PAYMENT_METHODS.map(method => {
                        const active = form.payment_method === method
                        return (
                          <ChoiceTile
                            key={method}
                            active={active}
                            disabled={saving}
                            icon={methodIcon(method)}
                            title={expensePaymentMethodLabel(method, lang)}
                            compact
                            onClick={() => setForm(current => ({ ...current, payment_method: method }))}
                          />
                        )
                      })}
                    </ChoiceGroup>
                    <div className="sm:col-span-2">
                      <Field label={form.entry_type === 'income' ? l.source : l.vendor}>
                        <input
                          value={form.vendor}
                          onChange={event => setForm(current => ({ ...current, vendor: event.target.value }))}
                          className={FIELD_INPUT_CLASS}
                          disabled={saving}
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label={l.description}>
                        <textarea
                          value={form.description}
                          onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                          rows={3}
                          className={`${FIELD_INPUT_CLASS} !h-auto min-h-[88px] resize-y py-3`}
                          disabled={saving}
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                        />
                      </Field>
                    </div>
                    <button
                      disabled={!canSubmitExpense}
                      className={`ws-btn ws-btn-primary !h-11 w-full sm:col-span-2 xl:col-span-4 xl:w-64 xl:justify-self-end ${form.entry_type === 'income' ? '!bg-[#1d7a52] hover:!bg-[#17633f]' : ''}`}
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{saving ? l.saving : l.save}
                    </button>
                  </form>
                )}
            </section>
          </section>

          <section aria-labelledby="accounting-activity-heading">
            <SectionHeading id="accounting-activity-heading" title={l.recentActivity} description={l.recentActivityHelp} />
            <div className={HISTORY_SECTION_GRID}>
              <ExpenseHistorySection
                title={l.investorHistory}
                titleAmount={investorSupportTotal}
                rows={filteredInvestorSupport}
                loading={loading}
                emptyText={l.emptyInvestor}
                loadingTitle={l.loadFailed.replace('Не удалось ', '').replace('Could not ', '')}
                lang={lang}
                canDelete={canDelete}
                confirmDeleteId={confirmDeleteId}
                deletingExpenseId={deletingExpenseId}
                confirmDeleteLabel={l.confirmDelete}
                deleteLabel={l.delete}
                onDelete={deleteExpense}
                salaryPaymentLabel={l.automaticSalary}
                salaryBonusLabel={l.salaryBonus}
                seeAllLabel={l.seeAll}
                onSeeAll={() => navigate('/admin/accounting/history')}
              />
              <ExpenseHistorySection
                title={l.history}
                rows={filteredExpenseRows}
                loading={loading}
                emptyText={l.empty}
                loadingTitle={l.loadFailed.replace('Не удалось ', '').replace('Could not ', '')}
                lang={lang}
                canDelete={canDelete}
                confirmDeleteId={confirmDeleteId}
                deletingExpenseId={deletingExpenseId}
                confirmDeleteLabel={l.confirmDelete}
                deleteLabel={l.delete}
                onDelete={deleteExpense}
                salaryPaymentLabel={l.automaticSalary}
                salaryBonusLabel={l.salaryBonus}
                seeAllLabel={l.seeAll}
                onSeeAll={() => navigate('/admin/accounting/history')}
              />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

function SectionHeading({ id, title, description }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="ws-display">{title}</h2>
      <p className="ws-muted mt-1">{description}</p>
    </div>
  )
}

function OverviewGroupHeading({ id, title, description, tone }) {
  const dotTone = {
    green: 'bg-[#1d7a52]',
    orange: 'bg-[#ff5a00]',
    red: 'bg-[#c4262c]',
  }
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span aria-hidden="true" className={`mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotTone[tone] || dotTone.orange}`} />
      <div>
        <h3 id={id} className="text-sm font-semibold text-[#22201d]">{title}</h3>
        <p className="ws-caption mt-0.5">{description}</p>
      </div>
    </div>
  )
}

function CardHeading({ title, description }) {
  return (
    <div className="mb-5">
      <span className="ws-heading block">{title}</span>
      <span className="ws-caption mt-1 block">{description}</span>
    </div>
  )
}

function ExpenseHistorySection({
  title,
  titleAmount,
  rows,
  loading,
  emptyText,
  loadingTitle,
  lang,
  canDelete,
  confirmDeleteId,
  deletingExpenseId,
  confirmDeleteLabel,
  deleteLabel,
  onDelete,
  salaryPaymentLabel,
  salaryBonusLabel,
  seeAllLabel,
  onSeeAll,
}) {
  return (
    <section className="ws-panel ws-panel-flush h-full">
      <div className="border-b border-[#e4e1de] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="ws-heading">{title}</h2>
          <div className="flex items-center gap-2">
            {titleAmount !== undefined && (
              <span className="ws-badge ws-tone-positive !text-[13px] font-semibold tabular-nums">
                {formatCurrency(titleAmount)}
              </span>
            )}
            {!loading && rows.length > 0 && (
              <button
                type="button"
                onClick={onSeeAll}
                className="ws-btn ws-btn-outline ws-btn-sm"
              >
                {seeAllLabel}
              </button>
            )}
          </div>
        </div>
      </div>
      {loading ? (
        <OperationalLoading layout="table" title={loadingTitle} description="" />
      ) : rows.length === 0 ? (
        <div className="ws-empty">{emptyText}</div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          {rows.map(expense => {
            const Icon = methodIcon(expense.payment_method)
            const tone = expenseTone(expense)
            const title = expense.is_salary_payment
              ? salaryPaymentLabel
              : expense.is_salary_bonus
                ? salaryBonusLabel
                : expenseCategoryLabel(expense.category, lang)
            return (
              <div key={expense.id} className={`ws-row flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between ${tone.row}`}>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold ${tone.title}`}>{title}</span>
                    <span className={`ws-badge ${tone.badge}`}>
                      <Icon size={11} />{expensePaymentMethodLabel(expense.payment_method, lang)}
                    </span>
                  </div>
                  <p className="ws-caption flex flex-wrap items-center gap-1.5">
                    <span>{formatLongDate(expense.expense_date, lang, expense.expense_date)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><Clock3 size={12} />{formatTime(expense.created_at, '—')}</span>
                    <span>·</span>
                    <span>{expense.created_by_name || '—'}</span>
                  </p>
                  {(expense.vendor || expense.description) && (
                    <p className="mt-1 break-words text-sm text-[#22201d]">
                      {[expense.vendor, expenseDescriptionLabel(expense.description, lang)].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <p className={`text-base font-semibold tabular-nums ${tone.amount}`}>{formatCurrency(expense.amount)}</p>
                  {canDelete && getExpenseHistoryDeleteTarget(expense) && (
                    <button
                      type="button"
                      disabled={Boolean(deletingExpenseId)}
                      onClick={() => onDelete(expense)}
                      className={`ws-btn ws-btn-sm ${confirmDeleteId === expense.id ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'}`}
                    >
                      {deletingExpenseId === expense.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                      {confirmDeleteId === expense.id ? confirmDeleteLabel : deleteLabel}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="ws-caption mb-1.5 block font-medium">{label}</span>
      {children}
    </label>
  )
}



function Breakdown({ title, rows, total, lang, type }) {
  return (
    <section className="ws-panel">
      <h2 className="ws-heading mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="ws-muted py-4">—</p>
      ) : (
        <div className="space-y-3">
          {rows.map(([key, amount]) => {
            const label = type === 'method' ? expensePaymentMethodLabel(key, lang) : expenseCategoryLabel(key, lang)
            const width = total > 0 ? Math.max(4, Math.round((amount / total) * 100)) : 0
            return (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="text-[#22201d]">{label}</span>
                  <span className="font-semibold tabular-nums text-[#22201d]">{formatCurrency(amount)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#efece9]">
                  <div className="h-full rounded-full bg-[#ff5a00]" style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
