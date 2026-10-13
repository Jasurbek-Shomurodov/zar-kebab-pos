import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarDays,
  ChevronDown,
  Flame,
  HandCoins,
  Hourglass,
  Loader2,
  ReceiptText,
  PiggyBank,
  RefreshCw,
  ShoppingBasket,
  Users,
  WalletCards,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { Kpi, KpiExplanationDialog, toKpiDetail } from '../components/AccountingKpi'
import DateRangePicker from '../components/DateRangePicker'
import { OperationalLoading } from '../components/OperationalState'
import MonthlyIncomeChart from '../components/MonthlyIncomeChart'
import WeeklyIncomeChart from '../components/WeeklyIncomeChart'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { getAccountingQuickRange, normalizeAccountingPaidOrderSummary } from '../lib/accounting'
import {
  isMissingAccountingMonthlyCashflowRpc,
  loadAccountingAllTimeBalance,
  loadAccountingMonthlyCashflow,
  loadAccountingPaidOrderSummary,
  loadFinancialAnalysisBundle,
} from '../lib/accountingSummary'
import { DASHBOARD_DAILY_BREAK_EVEN_INCOME, loadDashboardMonthlyAverageIncome, normalizeDashboardMonthlyIncomeRows } from '../lib/monthlyIncome'
import { loadDashboardWeeklyIncome, normalizeDashboardWeeklyIncomeRows } from '../lib/weeklyIncome'
import {
  ANALYSIS_OTHER_COLOR,
  ANALYSIS_SERIES_COLORS,
  SPENDING_GROUPS,
  assignCategoryColors,
  buildAccountingIndicators,
  buildAccountingPeriodEntries,
  buildAccountingProfitAndLoss,
  buildAccountingSankey,
  buildAccountingTrend,
  buildCategoryComparison,
  buildDailySpending,
  buildGrowthOverview,
  buildLargestPayments,
  buildMonthlyProfitRows,
  buildPaybackSummary,
  buildTrendBuckets,
  composeSalaryProfiles,
  getAccountingAnalysisSummary,
  getPercentChange,
  getPreviousAccountingPeriod,
  getTopExpenseCategories,
  getTrendIntervals,
} from '../lib/accountingAnalysis'
import { expenseCategoryLabel, expenseDescriptionLabel, expensePaymentMethodLabel, todayExpenseDate } from '../lib/expenses'
import { formatCurrency, formatCurrencyWithPercentage } from '../lib/formatCurrency'
import { formatLongDate, formatMonthYear } from '../lib/dateFormat'
import { collectPagedRows } from '../lib/orderHistory'
import { RollingText, RollingValue } from '../components/RollingNumber'

const EXPENSE_COLUMNS = 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_at'
const MEAL_COLUMNS = 'business_date, average_daily_amount, present_employee_count, total_amount, source_type, finalized_at, created_at'
const GROUP_COLORS = { salaries: ANALYSIS_SERIES_COLORS[0], bazaar: ANALYSIS_SERIES_COLORS[2], meals: ANALYSIS_SERIES_COLORS[3], other: ANALYSIS_SERIES_COLORS[1] }
const SOURCE_COLORS = { cafe: '#1baf7a', investor: '#4a3aa7', otherIncome: '#2a78d6', reserves: '#e34948' }
const LEFT_COLOR = '#16a34a'

const L = {
  uz: {
    title: 'Moliyaviy tahlil',
    sub: 'Pul qayerdan kelib, qayerga ketayotganini ko‘ring',
    incomeTitle: 'Daromad va foyda',
    incomeHelp: 'Tanlangan davrdagi savdo natijalari va tashqi tushumlar.',
    cafeIncome: 'Kafe daromadi',
    loyaltyIncome: 'Loyallik daromadi',
    netProfit: 'Sof foyda',
    netProfitSub: 'Kafe daromadi minus sotilgan mahsulot tannarxi',
    avgDailyCafeIncome: "Kafe o'rtacha kunlik daromadi",
    periodCafeIncome: 'Tanlangan davr kafe daromadi',
    investorSupport: 'Investor yordami',
    investorSupportSub: 'Investor kiritgan yordam',
    otherIncomeSub: 'Boshqa daromad',
    analysisTitle: 'Pul qayerga ketmoqda',
    analysisHelp: 'Ko‘rsatkichlar, pul oqimi va xarajatlar tarkibi.',
    tapForDetails: 'Hisoblashni ko‘rish uchun bosing',
    calculationDetails: 'Hisoblash tafsilotlari',
    howCalculated: 'Qanday hisoblangan',
    included: 'Nimalar kiritilgan',
    close: 'Yopish',
    refresh: 'Yangilash',
    estimate: 'Oylik taxmin',
    period: 'Hisobot davri',
    comparedWith: 'Taqqoslash',
    moneyIn: 'Kirim',
    spent: 'Sarflandi',
    left: 'Qoldi',
    savingsRate: 'Tejash darajasi',
    savingsRateSub: 'Kirimdan qolgan ulush',
    burnRate: 'Kunlik sarf',
    burnRateSub: 'O‘rtacha bir kunlik xarajat',
    runway: 'Zaxira yetadi',
    runwaySub: 'Umumiy qoldiq ÷ kunlik sarf',
    days: 'kun',
    foodCost: 'Bozor / kafe daromadi',
    foodCostSub: 'Mahsulot xaridining daromaddagi ulushi',
    payrollShare: 'Maosh ulushi',
    payrollShareSub: 'Barcha xarajatlardagi maosh ulushi',
    vsPrevious: 'oldingi davrga nisbatan',
    flowTitle: 'Pul oqimi',
    flowSub: 'Har bir manbadan kelgan pul qaysi xarajatlarga ketgani',
    intervalDecade: '10 kun', trendTable: 'Jadval', trendPeriod: 'Davr', trendDays: 'Kun', avgPerDay: 'O‘rtacha kunlik', avgChange: 'Kunlik o‘zgarish', growth: 'O‘sish', orders: 'Buyurtmalar', avgCheck: 'O‘rtacha chek', breakEven: 'Zararsizlik nuqtasi', salesMargin: 'Savdo marjasi', costOfSold: 'Sotilgan mahsulot tannarxi', grossProfit: 'Yalpi foyda', largestTitle: 'Eng katta to‘lovlar', largestSub: 'Davrdagi eng yirik xarajatlar (maosh va xodimlar ovqatisiz). Tarixni ochish uchun bosing.', date: 'Sana', category: 'Kategoriya', details: 'Tafsilot',
    growthTitle: 'O‘sish', growthSub: 'So‘nggi 12 oy — investorlar uchun bir qarashda', avgSalesPerDay: 'Kunlik o‘rtacha savdo', vsMonth: '{month} bilan solishtirganda', threeMonthGrowth: '3 oylik o‘sish', monthlyGrowth: 'Oylik o‘rtacha o‘sish', perMonth: 'oyiga', overMonths: '{n} oy davomida, kunlik o‘rtacha savdo bo‘yicha', ordersPerDay: 'Kunlik buyurtmalar', recordsTitle: 'Rekordlar', recordsSub: 'Tugagan oylar va so‘nggi 10 kunliklar ichida', bestMonth: 'Eng yaxshi oy', bestTenDay: 'Eng yaxshi 10 kun', ofRecord: 'rekordning {pct}', newRecord: 'Yangi rekord', paybackTitle: 'Investitsiya qaytimi', paybackSub: 'Ochilgandan beri investor yordami va kafe ishlab topgan pul', invested: 'Kiritilgan', generated: 'Ishlab topilgan', paidBack: 'qaytdi', pace: 'Oylik sur’at', monthsLeft: 'Joriy sur’atda taxminan {n} oy qoldi', paidOff: 'To‘liq qaytdi', noPace: 'So‘nggi oylarda foyda yo‘q, muddatni hisoblab bo‘lmaydi', noInvestment: 'Investor yordami yozilmagan', profitTitle: 'Oylar bo‘yicha foyda', profitSub: 'Kirim (investor yordamisiz) va barcha xarajatlar', unitTitle: 'Mijozlar va chek', unitSub: 'O‘sish ko‘proq mijozdanmi yoki kattaroq chekdan', grossMargin: 'Yalpi marja', migrationNeeded: 'Bu karta uchun migrations/229_accounting_monthly_cashflow.sql ni qo‘llang.', growthFailed: 'O‘sish ma’lumotlarini yuklab bo‘lmadi.',
    flowBreakdown: 'Tarkib', flowTrends: 'Dinamika', flowSankey: 'Oqim', flowPnl: 'Foyda va zarar', pnlCategories: 'Kategoriyalar', pnlGroups: 'Guruhlar', pnlBoth: 'Ikkalasi', intervalDay: 'Kun', intervalWeek: 'Hafta', intervalMonth: 'Oy', trendTotals: 'Kirim va chiqim', trendGroups: 'Xarajat guruhlari', lineItem: 'Modda', amount: 'Summa', totalIncome: 'Jami kirim', totalExpenses: 'Jami xarajat', trendsFailed: 'Dinamikani yuklab bo‘lmadi.', retry: 'Qayta urinish', chartType: 'Diagramma turi', flowView: 'Ko‘rinish', interval: 'Oraliq', openHistory: 'Tarixni ochish', showSection: 'Ko‘rsatish', hideSection: 'Yashirish',
    hub: 'Jami kirim',
    cafe: 'Kafe daromadi',
    investor: 'Investor yordami',
    otherIncome: 'Boshqa daromad',
    reserves: 'Zaxiradan',
    other: 'Boshqa',
    categoriesTitle: 'Xarajatlar tarkibi',
    categoriesSub: 'Kategoriya bo‘yicha. Tarixni ochish uchun bosing.',
    dailyTitle: 'Kunlik xarajatlar',
    dailySub: 'Har kuni sarflangan pul va o‘rtacha kunlik kafe daromadi',
    avgIncome: 'O‘rtacha kunlik daromad',
    salaries: 'Maoshlar',
    bazaar: 'Bozor',
    meals: 'Xodimlar ovqati',
    otherSpend: 'Boshqa xarajatlar',
    total: 'Jami',
    compareTitle: 'Oldingi davr bilan taqqoslash',
    compareSub: 'Qaysi xarajatlar o‘sdi yoki kamaydi',
    current: 'Joriy',
    previous: 'Oldingi',
    newItem: 'yangi',
    methodsTitle: 'To‘lov turlari bo‘yicha',
    methodsSub: 'Har bir to‘lov turida kirim va chiqim',
    empty: 'Bu davrda ma’lumot yo‘q',
    loading: 'Tahlil yuklanmoqda',
    loadFailed: 'Tahlil ma’lumotlarini yuklab bo‘lmadi.',
    today: 'Bugun', month: 'Oy', previousMonth: 'O‘tgan oy', presets: 'Tayyor davrlar', previousWeek: 'O‘tgan hafta', previousCurrentWeek: 'O‘tgan va joriy hafta', currentWeek: 'Joriy hafta', currentNextWeek: 'Joriy va keyingi hafta', nextWeek: 'Keyingi hafta', nextMonth: 'Keyingi oy', applyRange: 'Davrni qo‘llash', cancel: 'Bekor qilish', selectDateRange: 'Sana oralig‘ini tanlash', weekdays: ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'], from: 'Dan', to: 'Gacha',
  },
  ru: {
    title: 'Финансовый анализ',
    sub: 'Откуда приходят деньги и куда они уходят',
    incomeTitle: 'Доход и прибыль',
    incomeHelp: 'Результаты продаж и внешние поступления за выбранный период.',
    cafeIncome: 'Доход кафе',
    loyaltyIncome: 'Доход по лояльности',
    netProfit: 'Чистая прибыль',
    netProfitSub: 'Доход кафе минус себестоимость проданных товаров',
    avgDailyCafeIncome: 'Среднедневной доход кафе',
    periodCafeIncome: 'Доход кафе за выбранный период',
    investorSupport: 'Поддержка инвестора',
    investorSupportSub: 'Помощь, внесённая инвестором',
    otherIncomeSub: 'Другой доход',
    analysisTitle: 'Куда уходят деньги',
    analysisHelp: 'Показатели, денежный поток и структура расходов.',
    tapForDetails: 'Нажмите, чтобы увидеть расчёт',
    calculationDetails: 'Расчёт показателя',
    howCalculated: 'Как рассчитано',
    included: 'Что включено',
    close: 'Закрыть',
    refresh: 'Обновить',
    estimate: 'Прогноз на месяц',
    period: 'Отчётный период',
    comparedWith: 'Сравнение с',
    moneyIn: 'Приход',
    spent: 'Потрачено',
    left: 'Осталось',
    savingsRate: 'Норма сбережений',
    savingsRateSub: 'Доля прихода, которая осталась',
    burnRate: 'Расход в день',
    burnRateSub: 'Средние траты за один день',
    runway: 'Запаса хватит',
    runwaySub: 'Общий остаток ÷ расход в день',
    days: 'дн.',
    foodCost: 'Базар / доход кафе',
    foodCostSub: 'Доля закупок продуктов в доходе',
    payrollShare: 'Доля зарплат',
    payrollShareSub: 'Доля зарплат во всех расходах',
    vsPrevious: 'к прошлому периоду',
    flowTitle: 'Денежный поток',
    flowSub: 'Куда ушли деньги из каждого источника',
    intervalDecade: '10 дней', trendTable: 'Таблица', trendPeriod: 'Период', trendDays: 'Дни', avgPerDay: 'Ср. за день', avgChange: 'Изм. за день', growth: 'Рост', orders: 'Заказы', avgCheck: 'Средний чек', breakEven: 'Точка безубыточности', salesMargin: 'Маржа продаж', costOfSold: 'Себестоимость проданного', grossProfit: 'Валовая прибыль', largestTitle: 'Крупнейшие платежи', largestSub: 'Самые большие расходы периода (без зарплат и питания сотрудников). Нажмите, чтобы открыть историю.', date: 'Дата', category: 'Категория', details: 'Детали',
    growthTitle: 'Рост', growthSub: 'Последние 12 месяцев — коротко для инвесторов', avgSalesPerDay: 'Средние продажи в день', vsMonth: 'к {month}', threeMonthGrowth: 'Рост за 3 месяца', monthlyGrowth: 'Средний рост в месяц', perMonth: 'в месяц', overMonths: 'за {n} мес., по средним продажам в день', ordersPerDay: 'Заказов в день', recordsTitle: 'Рекорды', recordsSub: 'Среди завершённых месяцев и последних 10-дневок', bestMonth: 'Лучший месяц', bestTenDay: 'Лучшие 10 дней', ofRecord: '{pct} от рекорда', newRecord: 'Новый рекорд', paybackTitle: 'Окупаемость инвестиций', paybackSub: 'Поддержка инвестора и деньги, заработанные кафе с открытия', invested: 'Вложено', generated: 'Заработано', paidBack: 'окуплено', pace: 'Темп в месяц', monthsLeft: 'При текущем темпе ещё примерно {n} мес.', paidOff: 'Полностью окуплено', noPace: 'В последние месяцы нет прибыли — срок не рассчитать', noInvestment: 'Поддержка инвестора не записана', profitTitle: 'Прибыль по месяцам', profitSub: 'Доход (без поддержки инвестора) и все расходы', unitTitle: 'Клиенты и чек', unitSub: 'Рост за счёт клиентов или среднего чека', grossMargin: 'Валовая маржа', migrationNeeded: 'Для этой карточки примените migrations/229_accounting_monthly_cashflow.sql.', growthFailed: 'Не удалось загрузить данные роста.',
    flowBreakdown: 'Структура', flowTrends: 'Динамика', flowSankey: 'Поток', flowPnl: 'Прибыль и убытки', pnlCategories: 'Категории', pnlGroups: 'Группы', pnlBoth: 'Оба', intervalDay: 'День', intervalWeek: 'Неделя', intervalMonth: 'Месяц', trendTotals: 'Доход и расход', trendGroups: 'Группы расходов', lineItem: 'Статья', amount: 'Сумма', totalIncome: 'Всего доход', totalExpenses: 'Всего расходы', trendsFailed: 'Не удалось загрузить динамику.', retry: 'Повторить', chartType: 'Тип диаграммы', flowView: 'Вид', interval: 'Интервал', openHistory: 'Открыть историю', showSection: 'Показать', hideSection: 'Скрыть',
    hub: 'Весь приход',
    cafe: 'Доход кафе',
    investor: 'Поддержка инвестора',
    otherIncome: 'Другой доход',
    reserves: 'Из запаса',
    other: 'Другое',
    categoriesTitle: 'Структура расходов',
    categoriesSub: 'По категориям. Нажмите, чтобы открыть историю.',
    dailyTitle: 'Расходы по дням',
    dailySub: 'Траты каждого дня и средний дневной доход кафе',
    avgIncome: 'Средний дневной доход',
    salaries: 'Зарплаты',
    bazaar: 'Базар',
    meals: 'Питание сотрудников',
    otherSpend: 'Прочие расходы',
    total: 'Всего',
    compareTitle: 'Сравнение с прошлым периодом',
    compareSub: 'Какие расходы выросли или снизились',
    current: 'Сейчас',
    previous: 'Раньше',
    newItem: 'новое',
    methodsTitle: 'По способам оплаты',
    methodsSub: 'Приход и расход по каждому способу оплаты',
    empty: 'За этот период нет данных',
    loading: 'Загрузка анализа',
    loadFailed: 'Не удалось загрузить данные анализа.',
    today: 'Сегодня', month: 'Месяц', previousMonth: 'Прошлый месяц', presets: 'Готовые периоды', previousWeek: 'Прошлая неделя', previousCurrentWeek: 'Прошлая и текущая неделя', currentWeek: 'Текущая неделя', currentNextWeek: 'Текущая и следующая неделя', nextWeek: 'Следующая неделя', nextMonth: 'Следующий месяц', applyRange: 'Применить период', cancel: 'Отмена', selectDateRange: 'Выбрать период', weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], from: 'С', to: 'По',
  },
  en: {
    title: 'Financial analysis',
    sub: 'See where money comes from and where it goes',
    incomeTitle: 'Income and profit',
    incomeHelp: 'Sales performance and external income for the selected period.',
    cafeIncome: 'Cafe income',
    loyaltyIncome: 'Loyalty income',
    netProfit: 'Net Profit',
    netProfitSub: 'Cafe income minus cost of sold items',
    avgDailyCafeIncome: 'Avg daily cafe income',
    periodCafeIncome: 'Selected period cafe income',
    investorSupport: 'Investor support',
    investorSupportSub: 'Investor support entries',
    otherIncomeSub: 'Other income',
    analysisTitle: 'Where money is going',
    analysisHelp: 'Indicators, money flow, and spending breakdown.',
    tapForDetails: 'Tap to see the calculation',
    calculationDetails: 'Calculation details',
    howCalculated: 'How it is calculated',
    included: 'What is included',
    close: 'Close',
    refresh: 'Refresh',
    estimate: 'Monthly estimate',
    period: 'Reporting period',
    comparedWith: 'Compared with',
    moneyIn: 'Money in',
    spent: 'Spent',
    left: 'Left',
    savingsRate: 'Savings rate',
    savingsRateSub: 'Share of money in that was kept',
    burnRate: 'Daily burn',
    burnRateSub: 'Average spending per day',
    runway: 'Runway',
    runwaySub: 'All-time balance ÷ daily burn',
    days: 'days',
    foodCost: 'Bazaar / cafe income',
    foodCostSub: 'Product purchases as a share of income',
    payrollShare: 'Payroll share',
    payrollShareSub: 'Salaries as a share of all spending',
    vsPrevious: 'vs previous period',
    flowTitle: 'Money flow',
    flowSub: 'Where the money from each source ended up',
    intervalDecade: '10 days', trendTable: 'Table', trendPeriod: 'Period', trendDays: 'Days', avgPerDay: 'Avg / day', avgChange: 'Change / day', growth: 'Growth', orders: 'Orders', avgCheck: 'Avg check', breakEven: 'Break-even', salesMargin: 'Sales margin', costOfSold: 'Cost of items sold', grossProfit: 'Gross profit', largestTitle: 'Largest payments', largestSub: 'The biggest expenses in the period (salaries and staff meals excluded). Tap one to open its history.', date: 'Date', category: 'Category', details: 'Details',
    growthTitle: 'Growth', growthSub: 'The last 12 months at a glance, for investors', avgSalesPerDay: 'Avg sales per day', vsMonth: 'vs {month}', threeMonthGrowth: '3-month growth', monthlyGrowth: 'Avg monthly growth', perMonth: 'a month', overMonths: 'over {n} months, by avg sales per day', ordersPerDay: 'Orders per day', recordsTitle: 'Records', recordsSub: 'Across completed months and recent 10-day periods', bestMonth: 'Best month', bestTenDay: 'Best 10 days', ofRecord: '{pct} of the record', newRecord: 'New record', paybackTitle: 'Payback', paybackSub: 'Investor support against cash the cafe generated since opening', invested: 'Invested', generated: 'Generated', paidBack: 'paid back', pace: 'Monthly pace', monthsLeft: 'About {n} months left at the current pace', paidOff: 'Fully paid back', noPace: 'No profit in recent months, so no payback date yet', noInvestment: 'No investor support recorded', profitTitle: 'Profit by month', profitSub: 'Income (without investor support) against every expense', unitTitle: 'Customers and check', unitSub: 'Is growth coming from more customers or bigger bills?', grossMargin: 'Gross margin', migrationNeeded: 'Apply migrations/229_accounting_monthly_cashflow.sql to show this card.', growthFailed: 'Could not load growth data.',
    flowBreakdown: 'Breakdown', flowTrends: 'Trends', flowSankey: 'Sankey', flowPnl: 'Profit & loss', pnlCategories: 'Categories', pnlGroups: 'Groups', pnlBoth: 'Both', intervalDay: 'Day', intervalWeek: 'Week', intervalMonth: 'Month', trendTotals: 'Income vs spending', trendGroups: 'Spending groups', lineItem: 'Line item', amount: 'Amount', totalIncome: 'Total income', totalExpenses: 'Total expenses', trendsFailed: 'Could not load trends.', retry: 'Retry', chartType: 'Chart type', flowView: 'View', interval: 'Interval', openHistory: 'Open history', showSection: 'Show', hideSection: 'Hide',
    hub: 'Total in',
    cafe: 'Cafe income',
    investor: 'Investor support',
    otherIncome: 'Other income',
    reserves: 'From reserves',
    other: 'Other',
    categoriesTitle: 'Spending breakdown',
    categoriesSub: 'By category. Tap one to open its history.',
    dailyTitle: 'Daily spending',
    dailySub: 'What was spent each day against average daily cafe income',
    avgIncome: 'Avg daily income',
    salaries: 'Salaries',
    bazaar: 'Bazaar',
    meals: 'Employee meals',
    otherSpend: 'Other spending',
    total: 'Total',
    compareTitle: 'Compared with previous period',
    compareSub: 'Which costs grew and which shrank',
    current: 'Now',
    previous: 'Before',
    newItem: 'new',
    methodsTitle: 'By payment method',
    methodsSub: 'Money in and out for each payment method',
    empty: 'No data in this period',
    loading: 'Loading analysis',
    loadFailed: 'Could not load analysis data.',
    today: 'Today', month: 'Month', previousMonth: 'Previous month', presets: 'Presets', previousWeek: 'Previous week', previousCurrentWeek: 'Previous & current week', currentWeek: 'Current week', currentNextWeek: 'Current & next week', nextWeek: 'Next week', nextMonth: 'Next month', applyRange: 'Apply range', cancel: 'Cancel', selectDateRange: 'Select date range', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], from: 'From', to: 'To',
  },
}

function formatCompact(value) {
  const amount = Math.abs(Number(value) || 0)
  const sign = Number(value) < 0 ? '−' : ''
  if (amount >= 1_000_000_000) return `${sign}${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (amount >= 1_000_000) return `${sign}${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (amount >= 1_000) return `${sign}${Math.round(amount / 1_000)}K`
  return `${sign}${Math.round(amount)}`
}

function formatPct(value) {
  return value == null ? '—' : `${String(value).replace(/\.0$/, '')}%`
}

function shareOf(amount, total) {
  return total > 0 ? Math.round((amount / total) * 1000) / 10 : 0
}

// Runs at most `limit` loads at once so a month of daily buckets does not flood the API.
function mapWithLimit(items, limit, load) {
  const results = new Array(items.length)
  let next = 0
  const worker = () => {
    if (next >= items.length) return Promise.resolve()
    const index = next
    next += 1
    return load(items[index]).then(result => { results[index] = result }).then(worker)
  }
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)).then(() => results)
}

function pageRows(loadPage) {
  return collectPagedRows(loadPage)
    .then(data => ({ data, error: null }))
    .catch(error => ({ data: [], error }))
}

function loadPeriodRows(dateFrom, dateTo, fallbackMenuItemMap) {
  return Promise.all([
    pageRows((from, to) => supabase.from('expenses').select(EXPENSE_COLUMNS)
      .gte('expense_date', dateFrom).lte('expense_date', dateTo).order('id').range(from, to)),
    pageRows((from, to) => supabase.from('employee_daily_meal_expenses').select(MEAL_COLUMNS)
      .gte('business_date', dateFrom).lte('business_date', dateTo).order('business_date').range(from, to)),
    loadAccountingPaidOrderSummary(dateFrom, dateTo, { fallbackMenuItemMap })
      .then(data => ({ data, error: null }))
      .catch(error => ({ data: {}, error })),
  ]).then(([expenses, meals, orders]) => ({
    expenses: expenses.data || [],
    employeeMealSnapshots: meals.data || [],
    paidOrderSummary: orders.data || {},
    error: expenses.error || meals.error || orders.error || null,
  }))
}

export default function AccountingAnalysis() {
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const l = L[lang] || L.en
  const [dateFrom, setDateFrom] = useState(() => todayExpenseDate().slice(0, 8) + '01')
  const [dateTo, setDateTo] = useState(() => todayExpenseDate())
  const [activeRangeKey, setActiveRangeKey] = useState('month')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedKpi, setSelectedKpi] = useState(null)
  const requestRef = useRef(0)
  const previousPeriod = useMemo(() => getPreviousAccountingPeriod(dateFrom, dateTo), [dateFrom, dateTo])
  const [growth, setGrowth] = useState({ status: 'loading', months: [], tenDay: [], cashflow: null, cashflowStatus: 'loading' })
  const [flowMode, setFlowMode] = useState('breakdown')
  const [flowView, setFlowView] = useState('sankey')
  const [pnlBreakdown, setPnlBreakdown] = useState('category')
  const [trendStyle, setTrendStyle] = useState('totals')
  const [chosenInterval, setChosenInterval] = useState(null)
  const [trendRetry, setTrendRetry] = useState(0)
  const [trend, setTrend] = useState({ key: '', status: 'idle', cafeIncomeByBucket: {} })
  const trendRequestRef = useRef('')
  // Trends stop at today: future days have no income yet and would read as a collapse.
  const trendTo = useMemo(() => (dateTo > todayExpenseDate() ? todayExpenseDate() : dateTo), [dateTo])
  const trendIntervals = useMemo(() => getTrendIntervals(dateFrom, trendTo), [dateFrom, trendTo])
  const trendInterval = trendIntervals.available.includes(chosenInterval) ? chosenInterval : trendIntervals.preferred
  const trendBuckets = useMemo(() => buildTrendBuckets(dateFrom, trendTo, trendInterval), [dateFrom, trendTo, trendInterval])
  const trendKey = `${dateFrom}|${trendTo}|${trendInterval}|${reloadKey}|${trendRetry}`

  // One round trip (migration 231) for both periods, salary rows, the all-time
  // balance and, when not loaded yet for this refresh, the growth band. Growth
  // does not depend on the selected period, so date changes skip it.
  const growthLoadedForRef = useRef(null)
  useEffect(() => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const includeGrowth = growthLoadedForRef.current !== reloadKey
    const today = todayExpenseDate()
    setLoading(true)
    setLoadFailed(false)
    if (includeGrowth) setGrowth(current => ({ ...current, status: 'loading', cashflowStatus: 'loading' }))

    function applyPageData({ current, previous, salary, allTimeBalance }) {
      const salaryProfiles = salary.error ? [] : composeSalaryProfiles(
        salary.profiles, [], salary.payments, salary.bonuses, [], [], salary.team,
      )
      setData({ current, previous, salaryProfiles, allTimeBalance })
      setLoadFailed(Boolean(current.error || salary.error))
      setLoading(false)
    }

    loadFinancialAnalysisBundle({
      dateFrom,
      dateTo,
      previousFrom: previousPeriod.dateFrom,
      previousTo: previousPeriod.dateTo,
      includeGrowth,
    }).then(bundle => {
      if (requestId !== requestRef.current) return
      if (!bundle) {
        loadSeparately(requestId, includeGrowth, today)
        return
      }
      applyPageData(bundle)
      if (bundle.growth) {
        growthLoadedForRef.current = reloadKey
        setGrowth({
          status: bundle.growth.monthlyIncome ? 'ready' : 'error',
          months: normalizeDashboardMonthlyIncomeRows(bundle.growth.monthlyIncome || []),
          tenDay: normalizeDashboardWeeklyIncomeRows(bundle.growth.tenDayIncome || []),
          cashflow: bundle.growth.cashflow,
          cashflowStatus: bundle.growth.cashflow ? 'ready' : 'error',
          today,
        })
      }
    }).catch(() => {
      if (requestId !== requestRef.current) return
      setLoadFailed(true)
      setLoading(false)
      if (includeGrowth) setGrowth(current => ({ ...current, status: 'error', cashflowStatus: 'error' }))
    })

    // Before migration 231: the same data as separate requests.
    function loadSeparately(id, withGrowth, day) {
      const fallbackMenuItemMap = Object.fromEntries(state.menuItems.map(item => [item.id, item]))
      // Only salary payments and bonuses become cash rows here, and only inside the
      // two compared periods; rates, fines and absences are payroll-page data.
      const salaryFrom = previousPeriod.dateFrom
      Promise.all([
        loadPeriodRows(dateFrom, dateTo, fallbackMenuItemMap),
        loadPeriodRows(previousPeriod.dateFrom, previousPeriod.dateTo, fallbackMenuItemMap),
        Promise.all([
          pageRows((from, to) => supabase.from('employee_salary_profiles').select('*').order('id').range(from, to)),
          pageRows((from, to) => supabase.from('employee_salary_payments').select('*').gte('paid_date', salaryFrom).lte('paid_date', dateTo).order('id').range(from, to)),
          pageRows((from, to) => supabase.from('employee_salary_bonuses').select('*').gte('bonus_date', salaryFrom).lte('bonus_date', dateTo).order('id').range(from, to)),
          pageRows((from, to) => supabase.from('profiles').select('id, full_name, email, role, status').order('id').range(from, to)),
        ]),
        loadAccountingAllTimeBalance().catch(() => null),
      ]).then(([current, previous, [profiles, payments, bonuses, team], allTimeBalance]) => {
        if (id !== requestRef.current) return
        applyPageData({
          current,
          previous,
          salary: { profiles: profiles.data, payments: payments.data, bonuses: bonuses.data, team: team.data, error: profiles.error || payments.error || bonuses.error },
          allTimeBalance,
        })
      })
      if (!withGrowth) return
      Promise.allSettled([
        loadDashboardMonthlyAverageIncome({ monthCount: 13 }),
        loadDashboardWeeklyIncome(`${day.slice(0, 8)}01`),
        loadAccountingMonthlyCashflow(13),
      ]).then(([months, tenDay, cashflow]) => {
        if (id !== requestRef.current) return
        growthLoadedForRef.current = reloadKey
        setGrowth({
          status: months.status === 'fulfilled' ? 'ready' : 'error',
          months: months.status === 'fulfilled' ? months.value : [],
          tenDay: tenDay.status === 'fulfilled' ? tenDay.value : [],
          cashflow: cashflow.status === 'fulfilled' ? cashflow.value : null,
          cashflowStatus: cashflow.status === 'fulfilled' ? 'ready' : isMissingAccountingMonthlyCashflowRpc(cashflow.reason) ? 'missing' : 'error',
          today: day,
        })
      })
    }

    return () => { requestRef.current += 1 }
  }, [dateFrom, dateTo, previousPeriod, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const growthOverview = useMemo(() => buildGrowthOverview(growth.months, growth.tenDay), [growth.months, growth.tenDay])
  const profitRows = useMemo(() => buildMonthlyProfitRows(growth.cashflow?.months, growth.today), [growth.cashflow, growth.today])
  const payback = useMemo(() => (growth.cashflow ? buildPaybackSummary(growth.cashflow.totals, profitRows) : null), [growth.cashflow, profitRows])

  // Cafe income is only stored as period totals, so Trends asks the same summary RPC once per bucket.
  // Loaded on first use of Trends; switching back and forth keeps the result for the same range.
  useEffect(() => {
    if (flowMode !== 'trends' || trendRequestRef.current === trendKey) return
    trendRequestRef.current = trendKey
    const key = trendKey
    const fallbackMenuItemMap = Object.fromEntries(state.menuItems.map(item => [item.id, item]))
    setTrend({ key, status: 'loading', cafeIncomeByBucket: {} })
    mapWithLimit(trendBuckets, 4, bucket => loadAccountingPaidOrderSummary(bucket.dateFrom, bucket.dateTo, { fallbackMenuItemMap })
      .then(summary => {
        const normalized = normalizeAccountingPaidOrderSummary(summary, bucket.dateFrom, bucket.dateTo)
        return [bucket.key, { cafeIncome: normalized.cafeIncome, orderCount: normalized.orderCount, costTotal: normalized.costTotal }]
      }))
      .then(pairs => setTrend(current => (current.key === key ? { key, status: 'ready', cafeIncomeByBucket: Object.fromEntries(pairs) } : current)))
      .catch(() => {
        if (trendRequestRef.current === key) trendRequestRef.current = ''
        setTrend(current => (current.key === key ? { key, status: 'error', cafeIncomeByBucket: {} } : current))
      })
  }, [flowMode, trendKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const analysis = useMemo(() => {
    if (!data) return null
    const currentEntries = buildAccountingPeriodEntries({ ...data.current, salaryProfiles: data.salaryProfiles }, dateFrom, dateTo)
    const previousEntries = buildAccountingPeriodEntries({ ...data.previous, salaryProfiles: data.salaryProfiles }, previousPeriod.dateFrom, previousPeriod.dateTo)
    const summary = getAccountingAnalysisSummary(data.current.paidOrderSummary, currentEntries, dateFrom, dateTo)
    const previousSummary = getAccountingAnalysisSummary(data.previous.paidOrderSummary, previousEntries, previousPeriod.dateFrom, previousPeriod.dateTo)
    const dayCount = summary.cafeIncomeSummary.dayCount
    const indicators = buildAccountingIndicators(summary, { dayCount, allTimeBalance: data.allTimeBalance })
    const previousIndicators = buildAccountingIndicators(previousSummary, { dayCount: previousSummary.cafeIncomeSummary.dayCount })
    const categories = getTopExpenseCategories(summary.expenseSummary.byCategory)
    return {
      summary,
      entries: currentEntries,
      pnl: buildAccountingProfitAndLoss({
        cafeIncome: summary.cafeIncome,
        salesCost: summary.cafeIncome - summary.netProfit,
        incomeByCategory: summary.incomeSummary.byCategory,
        expenseByCategory: summary.expenseSummary.byCategory,
      }),
      indicators,
      previousIndicators,
      categories,
      colors: assignCategoryColors(categories),
      sankey: buildAccountingSankey({
        cafeIncome: summary.cafeIncome,
        investorSupport: summary.investorSupportTotal,
        otherIncome: summary.otherIncomeTotal,
        categories,
      }),
      daily: buildDailySpending(currentEntries, dateFrom, summary.cafeIncomeSummary.effectiveTo < dateTo ? summary.cafeIncomeSummary.effectiveTo : dateTo),
      largest: buildLargestPayments(currentEntries, dateFrom, dateTo),
      comparison: buildCategoryComparison(summary.expenseSummary.byCategory, previousSummary.expenseSummary.byCategory),
    }
  }, [data, dateFrom, dateTo, previousPeriod])

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

  function openCategoryHistory(category) {
    openHistory(category, 'expense')
  }

  function openIncomeHistory(category) {
    openHistory(category, 'income')
  }

  function openHistory(category, type) {
    if (!category || category.startsWith('__')) return
    const params = new URLSearchParams({ type, category, from: dateFrom, to: dateTo })
    navigate(`/admin/accounting/history?${params.toString()}`)
  }

  function categoryName(key) {
    if (key === '__other__') return l.other
    if (key === '__left__') return l.left
    return expenseCategoryLabel(key, lang)
  }

  const showData = !loading && analysis
  const indicators = analysis?.indicators
  const previousIndicators = analysis?.previousIndicators
  const accountingSummary = analysis?.summary
  const cafeIncome = accountingSummary?.cafeIncome || 0
  const loyaltyIncome = accountingSummary?.loyaltyIncome || 0
  const netProfit = accountingSummary?.netProfit || 0
  const profitMarginPct = accountingSummary?.profitMarginPct ?? null
  const selectedRangeCafeIncome = accountingSummary?.cafeIncomeSummary || { total: 0, loyaltyTotal: 0, averageDaily: 0, dayCount: 0 }
  const investorSupportTotal = accountingSummary?.investorSupportTotal || 0
  const otherIncomeTotal = accountingSummary?.otherIncomeTotal || 0
  const paidOrderSummary = data?.current?.paidOrderSummary || {}
  const costTotal = Math.max(0, Number(paidOrderSummary.costTotal ?? paidOrderSummary.cost_total) || 0)
  const periodLabel = `${formatLongDate(dateFrom, lang, dateFrom)} — ${formatLongDate(dateTo, lang, dateTo)}`
  const kpiDetails = useMemo(() => {
    const text = {
      uz: {
        cafeIncome: ['Tanlangan davrdagi to‘langan buyurtmalardan olingan haqiqiy tushum.', ['Naqd, karta va terminal orqali olingan to‘lovlar', `Loyallik mablag‘i (${formatCurrency(loyaltyIncome)}) alohida ko‘rsatiladi va sarflanadigan tushumga qo‘shilmaydi`]],
        netProfit: [`${formatCurrency(cafeIncome)} − ${formatCurrency(costTotal)} = ${formatCurrency(netProfit)}`, ['Kafe daromadi', 'Sotilgan mahsulotlarning buyurtma vaqtida saqlangan tannarxi', `Foiz: sof foyda ÷ kafe daromadi = ${profitMarginPct == null ? '—' : `${String(profitMarginPct).replace('.', ',')}%`}`]],
        average: [`${formatCurrency(selectedRangeCafeIncome.total)} ÷ ${selectedRangeCafeIncome.dayCount} kun = ${formatCurrency(selectedRangeCafeIncome.averageDaily)}`, ['Tanlangan davrning barcha kalendar kunlari (savdo bo‘lmagan kunlar ham)', 'Faqat kafe daromadi; loyallik mablag‘i kiritilmaydi']],
        investor: ['Tanlangan davrdagi “Investor yordami” turidagi daromad yozuvlari yig‘indisi.', ['Investor yordami yozuvlari', `Boshqa daromad (${formatCurrency(otherIncomeTotal)}) alohida hisoblanadi va bu kartaga qo‘shilmaydi`]],
      },
      ru: {
        cafeIncome: ['Фактически полученные деньги по оплаченным заказам за выбранный период.', ['Оплаты наличными, картой и терминалом', `Оплата лояльностью (${formatCurrency(loyaltyIncome)}) показана отдельно и не входит в доступную выручку`]],
        netProfit: [`${formatCurrency(cafeIncome)} − ${formatCurrency(costTotal)} = ${formatCurrency(netProfit)}`, ['Доход кафе', 'Историческая себестоимость проданных позиций, сохранённая в заказах', `Процент: чистая прибыль ÷ доход кафе = ${profitMarginPct == null ? '—' : `${String(profitMarginPct).replace('.', ',')}%`}`]],
        average: [`${formatCurrency(selectedRangeCafeIncome.total)} ÷ ${selectedRangeCafeIncome.dayCount} дн. = ${formatCurrency(selectedRangeCafeIncome.averageDaily)}`, ['Все календарные дни выбранного периода, включая дни без продаж', 'Только доход кафе; оплата лояльностью не включена']],
        investor: ['Сумма записей дохода с категорией «Поддержка инвестора» за выбранный период.', ['Внесённая поддержка инвестора', `Другой доход (${formatCurrency(otherIncomeTotal)}) считается отдельно и в эту карточку не входит`]],
      },
      en: {
        cafeIncome: ['Money actually received from paid orders in the selected period.', ['Cash, card, and terminal payments', `Loyalty value (${formatCurrency(loyaltyIncome)}) is shown separately and is not spendable revenue`]],
        netProfit: [`${formatCurrency(cafeIncome)} − ${formatCurrency(costTotal)} = ${formatCurrency(netProfit)}`, ['Cafe income', 'Historical cost of sold items saved with the orders', `Percentage: net profit ÷ cafe income = ${profitMarginPct == null ? '—' : `${profitMarginPct}%`}`]],
        average: [`${formatCurrency(selectedRangeCafeIncome.total)} ÷ ${selectedRangeCafeIncome.dayCount} days = ${formatCurrency(selectedRangeCafeIncome.averageDaily)}`, ['Every calendar day in the selected period, including days with no sales', 'Cafe income only; loyalty value is excluded']],
        investor: ['Total income entries categorized as Investor support in the selected period.', ['Recorded investor support', `Other income (${formatCurrency(otherIncomeTotal)}) is separate and excluded from this card`]],
      },
    }[lang] || null
    if (!text) return {}
    return {
      cafeIncome: { title: l.cafeIncome, value: formatCurrency(cafeIncome), ...toKpiDetail(text.cafeIncome) },
      netProfit: { title: l.netProfit, value: formatCurrencyWithPercentage(netProfit, profitMarginPct, lang), ...toKpiDetail(text.netProfit) },
      average: { title: l.avgDailyCafeIncome, value: formatCurrency(selectedRangeCafeIncome.averageDaily), ...toKpiDetail(text.average) },
      investor: { title: l.investorSupport, value: formatCurrency(investorSupportTotal), ...toKpiDetail(text.investor) },
    }
  }, [lang, l, cafeIncome, loyaltyIncome, costTotal, netProfit, profitMarginPct, selectedRangeCafeIncome, otherIncomeTotal, investorSupportTotal])

  const periodPicker = props => (
    <DateRangePicker
      l={l}
      lang={lang}
      rangeKey={activeRangeKey}
      dateFrom={dateFrom}
      dateTo={dateTo}
      today={todayExpenseDate()}
      onPreset={selectQuickRange}
      onApply={setCustomRange}
      {...props}
    />
  )

  return (
    <AppShell
      title={l.title}
      titleAccessory={(
        <div className="zk-period-in-header w-[clamp(240px,32cqi,340px)]">
          {periodPicker({ compact: true, className: 'w-full' })}
        </div>
      )}
      headerActions={(
        <nav aria-label={l.title} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/financial-analysis/estimate')}
            aria-label={l.estimate}
            title={l.estimate}
            className="ws-btn ws-btn-outline !h-[38px] !px-2.5 xl:!px-3.5"
          >
            <ReceiptText size={16} />
            <span className="hidden xl:inline">{l.estimate}</span>
          </button>
          <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-[#e4e1de] sm:block" />
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
        </nav>
      )}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          <section className="ws-panel zk-period-in-page" aria-labelledby="analysis-period-heading">
            <div className="min-w-0">
              <h2 id="analysis-period-heading" className="ws-heading">{l.period}</h2>
              <p className="ws-caption mt-0.5">
                {l.comparedWith}: {formatLongDate(previousPeriod.dateFrom, lang, previousPeriod.dateFrom)} — {formatLongDate(previousPeriod.dateTo, lang, previousPeriod.dateTo)}
              </p>
            </div>
            <div className="mt-4">{periodPicker()}</div>
          </section>

          {loadFailed && !loading && (
            <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-3">
              <span>{l.loadFailed}</span>
              <button type="button" onClick={() => setReloadKey(key => key + 1)} className="ws-btn ws-btn-outline ws-btn-sm">{l.refresh}</button>
            </div>
          )}

          <section aria-labelledby="analysis-growth-heading">
            <SectionHeading id="analysis-growth-heading" title={l.growthTitle} description={l.growthSub} />
            <GrowthSection
              growth={growth}
              overview={growthOverview}
              profitRows={profitRows}
              payback={payback}
              l={l}
              lang={lang}
              onRetry={() => setReloadKey(key => key + 1)}
            />
            <div className="mt-5 space-y-5">
              <MonthlyIncomeChart
                rows={growth.months}
                status={growth.status}
                onRetry={() => setReloadKey(key => key + 1)}
                lang={lang}
                target={state.settings?.averageDailyBreakEvenIncomeUzs ?? DASHBOARD_DAILY_BREAK_EVEN_INCOME}
              />
              <WeeklyIncomeChart lang={lang} target={state.settings?.averageDailyBreakEvenIncomeUzs ?? DASHBOARD_DAILY_BREAK_EVEN_INCOME} />
            </div>
          </section>

          <section aria-labelledby="analysis-income-heading">
            <SectionHeading id="analysis-income-heading" title={l.incomeTitle} description={`${l.incomeHelp} · ${periodLabel}`} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi loading={loading} icon={WalletCards} label={l.cafeIncome} value={loading ? '—' : formatCurrency(cafeIncome)} sub={loading ? '' : `${l.loyaltyIncome}: ${formatCurrency(loyaltyIncome)}`} tone="green" detailHint={l.tapForDetails} onClick={loading ? null : () => setSelectedKpi(kpiDetails.cafeIncome)} />
              <Kpi loading={loading}
                icon={BadgeDollarSign}
                label={l.netProfit}
                value={loading ? '—' : formatCurrencyWithPercentage(netProfit, profitMarginPct, lang)}
                sub={l.netProfitSub}
                tone={netProfit >= 0 ? 'green' : 'red'}
                emphasizeValue
                detailHint={l.tapForDetails}
                onClick={loading ? null : () => setSelectedKpi(kpiDetails.netProfit)}
              />
              <Kpi loading={loading}
                icon={CalendarDays}
                label={l.avgDailyCafeIncome}
                value={loading ? '—' : formatCurrency(selectedRangeCafeIncome.averageDaily)}
                sub={loading ? '' : `${l.periodCafeIncome}: ${formatCurrency(selectedRangeCafeIncome.total)} · ${l.loyaltyIncome}: ${formatCurrency(selectedRangeCafeIncome.loyaltyTotal)}`}
                tone="blue"
                detailHint={l.tapForDetails}
                onClick={loading ? null : () => setSelectedKpi(kpiDetails.average)}
              />
              <Kpi loading={loading}
                icon={HandCoins}
                label={l.investorSupport}
                value={loading ? '—' : formatCurrency(investorSupportTotal)}
                sub={loading ? '' : otherIncomeTotal > 0 ? `${l.otherIncomeSub}: ${formatCurrency(otherIncomeTotal)}` : l.investorSupportSub}
                tone="purple"
                detailHint={l.tapForDetails}
                onClick={loading ? null : () => setSelectedKpi(kpiDetails.investor)}
              />
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

          {!showData ? (
            <div className="ws-panel ws-panel-flush">
              <OperationalLoading layout="dashboard" title={l.loading} description="" />
            </div>
          ) : (
            <section aria-labelledby="analysis-flow-heading" className="space-y-5">
              <SectionHeading id="analysis-flow-heading" title={l.analysisTitle} description={l.analysisHelp} />
              <div className="grid gap-3 sm:grid-cols-3">
                <TotalTile label={l.moneyIn} value={indicators.moneyIn} change={getPercentChange(indicators.moneyIn, previousIndicators.moneyIn)} goodWhenUp vsLabel={l.vsPrevious} tone="green" />
                <TotalTile label={l.spent} value={indicators.spent} change={getPercentChange(indicators.spent, previousIndicators.spent)} goodWhenUp={false} vsLabel={l.vsPrevious} tone="orange" />
                <TotalTile label={l.left} value={indicators.left} change={getPercentChange(indicators.left, previousIndicators.left)} goodWhenUp vsLabel={l.vsPrevious} tone={indicators.left >= 0 ? 'blue' : 'red'} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Indicator icon={PiggyBank} label={l.savingsRate} value={formatPct(indicators.savingsRatePct)} sub={l.savingsRateSub} meter={indicators.savingsRatePct} tone={indicators.savingsRatePct != null && indicators.savingsRatePct < 0 ? 'red' : 'green'} />
                <Indicator icon={Flame} label={l.burnRate} value={formatCurrency(indicators.avgDailySpend)} sub={l.burnRateSub} tone="orange" />
                <Indicator icon={Hourglass} label={l.runway} value={indicators.runwayDays == null ? '—' : `${indicators.runwayDays} ${l.days}`} sub={l.runwaySub} tone="blue" />
                <Indicator icon={ShoppingBasket} label={l.foodCost} value={formatPct(indicators.foodCostPct)} sub={l.foodCostSub} meter={indicators.foodCostPct} tone="teal" />
                <Indicator icon={Users} label={l.payrollShare} value={formatPct(indicators.payrollSharePct)} sub={l.payrollShareSub} meter={indicators.payrollSharePct} tone="purple" />
              </div>

              <MoneyFlowCard
                l={l}
                lang={lang}
                analysis={analysis}
                categoryName={categoryName}
                onOpenHistory={openCategoryHistory}
                onOpenIncomeHistory={openIncomeHistory}
                mode={flowMode}
                onMode={setFlowMode}
                view={flowView}
                onView={setFlowView}
                pnlBreakdown={pnlBreakdown}
                onPnlBreakdown={setPnlBreakdown}
                trendStyle={trendStyle}
                onTrendStyle={setTrendStyle}
                intervals={trendIntervals.available}
                interval={trendInterval}
                onInterval={setChosenInterval}
                trendRows={trend.key === trendKey && trend.status === 'ready' ? buildAccountingTrend(trendBuckets, trend.cafeIncomeByBucket, analysis.entries) : null}
                trendStatus={trend.key === trendKey ? trend.status : 'loading'}
                onTrendRetry={() => setTrendRetry(value => value + 1)}
                breakEvenDaily={state.settings?.averageDailyBreakEvenIncomeUzs || 0}
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <ChartCard title={l.categoriesTitle} description={l.categoriesSub}>
                  <DonutChart
                    categories={analysis.categories}
                    colors={analysis.colors}
                    total={analysis.summary.expenseSummary.total}
                    totalLabel={l.spent}
                    emptyLabel={l.empty}
                    labelFor={categoryName}
                    onSelect={openCategoryHistory}
                  />
                </ChartCard>
                <ChartCard title={l.compareTitle} description={l.compareSub}>
                  <CategoryComparison rows={analysis.comparison} labelFor={categoryName} l={l} />
                </ChartCard>
              </div>

              <ChartCard title={l.largestTitle} description={l.largestSub}>
                <LargestPayments rows={analysis.largest} l={l} lang={lang} categoryName={categoryName} onOpen={openCategoryHistory} />
              </ChartCard>

              <ChartCard title={l.dailyTitle} description={l.dailySub}>
                <DailySpendingChart
                  days={analysis.daily}
                  averageIncome={analysis.summary.cafeIncomeSummary.averageDaily}
                  l={l}
                  lang={lang}
                />
              </ChartCard>

              <ChartCard title={l.methodsTitle} description={l.methodsSub}>
                <PaymentMethodFlow rows={analysis.summary.cashflow.rows} lang={lang} l={l} />
              </ChartCard>
            </section>
          )}
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

function ChartCard({ title, description, children, className = '' }) {
  return (
    <section className={`ws-panel flex flex-col ${className}`}>
      <h3 className="ws-heading">{title}</h3>
      <p className="ws-caption mt-0.5">{description}</p>
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </section>
  )
}

function ChangeBadge({ change, goodWhenUp, label }) {
  if (change == null || change === 0) return <span className="ws-caption">— {label}</span>
  const up = change > 0
  const good = up === goodWhenUp
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="ws-caption inline-flex flex-wrap items-center gap-1">
      <span className={`ws-badge ${good ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
        <Icon size={12} />{formatPct(Math.abs(change))}
      </span>
      {label}
    </span>
  )
}

function TotalTile({ label, value, change, goodWhenUp, vsLabel, tone }) {
  const tones = { green: 'text-[#1d7a52]', orange: 'text-[#ff5a00]', blue: 'text-[#22201d]', red: 'text-[#c4262c]' }
  return (
    <div className="ws-panel">
      <p className="ws-caption">{label}</p>
      <p className={`mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${tones[tone] || tones.blue}`}><RollingText text={formatCurrency(value)} /></p>
      <div className="mt-2"><ChangeBadge change={change} goodWhenUp={goodWhenUp} label={vsLabel} /></div>
    </div>
  )
}

function Indicator({ icon: Icon, label, value, sub, meter = null, tone = 'orange' }) {
  const barColors = { green: '#1d7a52', orange: '#ff5a00', blue: '#2a78d6', red: '#c4262c', teal: '#1baf7a', purple: '#4a3aa7' }
  const width = meter == null ? null : Math.max(0, Math.min(100, meter))
  return (
    <div className="ws-panel flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <p className="ws-caption">{label}</p>
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]"><Icon size={15} /></span>
      </div>
      <p className="mt-1 break-words text-lg font-semibold leading-tight tracking-[-.01em] text-[#22201d] tabular-nums">{value}</p>
      {width != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efece9]" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: barColors[tone] || barColors.orange }} />
        </div>
      )}
      <p className="ws-caption mt-auto pt-2 leading-snug">{sub}</p>
    </div>
  )
}

function fillText(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template)
}

// Growth figures read at a glance: green when up, red when down.
function trendTone(value) {
  if (value == null || value === 0 || Number.isNaN(value)) return 'text-[#22201d]'
  return value > 0 ? 'text-[#1d7a52]' : 'text-[#c4262c]'
}

function signedPct(value) {
  return value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPct(Math.abs(value))}`
}

function Sparkline({ values, color = '#1d7a52', highlightLast = false }) {
  const points = values.filter(value => Number.isFinite(value))
  if (points.length < 2) return null
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const x = index => (index / (points.length - 1)) * 100
  const y = value => 30 - ((value - min) / (max - min || 1)) * 28
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-3 h-8 w-full" aria-hidden="true">
      <polyline points={points.map((value, index) => `${x(index)},${y(value)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {highlightLast && <circle cx={x(points.length - 1)} cy={y(points.at(-1))} r={2.5} fill={color} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

function GrowthTile({ label, value, valueTone, sub, change, changeLabel, spark, sparkColor }) {
  return (
    <div className="ws-panel flex h-full flex-col">
      <p className="ws-caption">{label}</p>
      <p className={`mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${valueTone || 'text-[#22201d]'}`}><RollingValue value={value} /></p>
      {changeLabel != null && <div className="mt-2"><ChangeBadge change={change} goodWhenUp label={changeLabel} /></div>}
      {sub && <p className="ws-caption mt-1 leading-snug">{sub}</p>}
      <div className="mt-auto">{spark && <Sparkline values={spark} color={sparkColor} highlightLast />}</div>
    </div>
  )
}

function RecordsCard({ overview, l, lang }) {
  const { best, bestTenDay, latest, latestOfBestPct } = overview
  return (
    <ChartCard title={l.recordsTitle} description={l.recordsSub}>
      <dl className="space-y-3">
        {best && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm font-semibold text-[#22201d]">{l.bestMonth}<span className="block text-[12px] font-normal text-[#8a867f]">{formatMonthYear(best.monthStart, lang, best.monthStart)}</span></dt>
            <dd className="text-right text-sm font-semibold tabular-nums text-[#22201d]">{formatCompact(best.averageDailyIncome)}<span className="block text-[12px] font-normal text-[#8a867f]">{l.avgPerDay}</span></dd>
          </div>
        )}
        {bestTenDay && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm font-semibold text-[#22201d]">{l.bestTenDay}<span className="block text-[12px] font-normal text-[#8a867f]">{formatLongDate(bestTenDay.weekStart, lang, bestTenDay.weekStart, { includeYear: false })} — {formatLongDate(bestTenDay.weekEnd, lang, bestTenDay.weekEnd)}</span></dt>
            <dd className="text-right text-sm font-semibold tabular-nums text-[#22201d]">{formatCompact(bestTenDay.averageDailyIncome)}<span className="block text-[12px] font-normal text-[#8a867f]">{l.avgPerDay}</span></dd>
          </div>
        )}
        {latest && latestOfBestPct != null && best && latest.monthStart !== best.monthStart && (
          <div>
            <div className="mb-1 flex justify-between text-[12px] font-semibold text-[#68655f]">
              <span>{formatMonthYear(latest.monthStart, lang, latest.monthStart)}</span>
              <span className="tabular-nums">{fillText(l.ofRecord, { pct: formatPct(latestOfBestPct) })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#efece9]"><div className="h-full rounded-full bg-[#1d7a52]" style={{ width: `${Math.min(100, latestOfBestPct)}%` }} /></div>
          </div>
        )}
        {latest && best && latest.monthStart === best.monthStart && <p className="ws-badge ws-tone-positive">{l.newRecord}</p>}
      </dl>
    </ChartCard>
  )
}

function PaybackCard({ payback, status, l }) {
  let body
  if (status === 'loading') body = <div className="flex h-24 items-center justify-center text-[#8a867f]"><Loader2 className="animate-spin" size={20} aria-hidden="true" /></div>
  else if (status === 'missing') body = <p className="ws-caption">{l.migrationNeeded}</p>
  else if (status === 'error') body = <p className="ws-caption">{l.growthFailed}</p>
  else if (!payback) body = <p className="ws-caption">{l.noInvestment}</p>
  else {
    const note = payback.monthsLeft === 0 ? l.paidOff
      : payback.monthsLeft == null ? l.noPace
        : fillText(l.monthsLeft, { n: payback.monthsLeft })
    body = (
      <div className="space-y-3">
        <p className="text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]">{formatPct(payback.paidBackPct)} <span className="text-sm font-semibold text-[#68655f]">{l.paidBack}</span></p>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#efece9]"><div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${payback.paidBackPct}%` }} /></div>
        <dl className="grid grid-cols-2 gap-2 text-[12px]">
          <div><dt className="text-[#8a867f]">{l.invested}</dt><dd className="font-semibold tabular-nums text-[#22201d]">{formatCurrency(payback.invested)}</dd></div>
          <div><dt className="text-[#8a867f]">{l.generated}</dt><dd className={`font-semibold tabular-nums ${payback.generated < 0 ? 'text-red-600' : 'text-[#22201d]'}`}>{formatCurrency(payback.generated)}</dd></div>
          {payback.monthlyPace != null && <div><dt className="text-[#8a867f]">{l.pace}</dt><dd className={`font-semibold tabular-nums ${payback.monthlyPace < 0 ? 'text-red-600' : 'text-[#22201d]'}`}>{formatCompact(payback.monthlyPace)}</dd></div>}
        </dl>
        <p className="ws-caption">{note}</p>
      </div>
    )
  }
  return <ChartCard title={l.paybackTitle} description={l.paybackSub}>{body}</ChartCard>
}

function UnitEconomicsTable({ months, profitRows, l, lang }) {
  const marginByMonth = Object.fromEntries((profitRows || []).map(row => [row.dateFrom, row.grossMarginPct]))
  const rows = [...months].reverse()
  const cell = 'py-2 px-3 text-right tabular-nums'
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[#e4e1de] text-[12px] text-[#8a867f]">
            <th scope="col" className="py-2 px-3 text-left font-semibold">{l.trendPeriod}</th>
            <th scope="col" className="py-2 px-3 text-right font-semibold">{l.ordersPerDay}</th>
            <th scope="col" className="py-2 px-3 text-right font-semibold">{l.avgCheck}</th>
            {profitRows && <th scope="col" className="py-2 px-3 text-right font-semibold">{l.grossMargin}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const before = rows[index + 1]
            const direction = (now, then) => (now == null || then == null ? 0 : Math.sign(now - then))
            const arrow = value => (value > 0 ? ' ↑' : value < 0 ? ' ↓' : '')
            const ordersMove = direction(row.ordersPerDay, before?.ordersPerDay)
            const checkMove = direction(row.averageCheck, before?.averageCheck)
            const margin = marginByMonth[row.monthStart] ?? null
            const marginMove = direction(margin, before ? marginByMonth[before.monthStart] ?? null : null)
            return (
              <tr key={row.monthStart} className="border-b border-[#efece9] text-[#22201d]">
                <th scope="row" className="py-2 px-3 text-left font-semibold">{formatMonthYear(row.monthStart, lang, row.monthStart)}</th>
                <td className={`${cell} ${trendTone(ordersMove)}`}>{row.ordersPerDay}{arrow(ordersMove)}</td>
                <td className={`${cell} ${trendTone(checkMove)}`}>{row.averageCheck == null ? '—' : formatCompact(row.averageCheck)}{arrow(checkMove)}</td>
                {profitRows && <td className={`${cell} ${trendTone(marginMove)}`}>{formatPct(margin)}{arrow(marginMove)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// The investor band: headline growth, 12 months of sales per day, records,
// payback, profit by month and what drives growth. Sales come from immutable
// monthly snapshots; cash rows come from migration 229.
function GrowthSection({ growth, overview, profitRows, payback, l, lang, onRetry }) {
  if (growth.status === 'loading' && !overview) {
    return <div className="ws-panel flex h-40 items-center justify-center text-[#8a867f]" role="status" aria-label={l.loading}><Loader2 className="animate-spin" size={22} aria-hidden="true" /></div>
  }
  if (growth.status === 'error' || !overview) {
    return (
      <div className="ws-notice flex flex-wrap items-center justify-between gap-3">
        <span>{growth.status === 'error' ? l.growthFailed : l.empty}</span>
        {growth.status === 'error' && <button type="button" onClick={onRetry} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>}
      </div>
    )
  }
  const { latest, previous, threeAgo, months } = overview
  const latestName = latest ? formatMonthYear(latest.monthStart, lang, latest.monthStart) : ''
  const averages = months.map(row => row.averageDailyIncome)
  const cashflowStatus = growth.cashflowStatus
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GrowthTile
          label={l.avgSalesPerDay}
          value={latest ? formatCurrency(latest.averageDailyIncome) : '—'}
          valueTone={trendTone(overview.vsPreviousPct)}
          change={overview.vsPreviousPct}
          changeLabel={previous ? fillText(l.vsMonth, { month: formatMonthYear(previous.monthStart, lang, previous.monthStart) }) : l.vsPrevious}
          sub={overview.latestIsCurrent ? `${latestName} · ${latest.dayCount} ${l.days}` : latestName}
          spark={averages}
          sparkColor={overview.vsPreviousPct < 0 ? '#c4262c' : '#1d7a52'}
        />
        <GrowthTile
          label={l.threeMonthGrowth}
          value={signedPct(overview.vsThreeAgoPct)}
          valueTone={trendTone(overview.vsThreeAgoPct)}
          sub={threeAgo ? fillText(l.vsMonth, { month: formatMonthYear(threeAgo.monthStart, lang, threeAgo.monthStart) }) : ''}
          spark={averages.slice(-4)}
          sparkColor={overview.vsThreeAgoPct < 0 ? '#c4262c' : '#1d7a52'}
        />
        <GrowthTile
          label={l.monthlyGrowth}
          value={overview.monthlyGrowthPct == null ? '—' : `${signedPct(overview.monthlyGrowthPct)} ${l.perMonth}`}
          valueTone={trendTone(overview.monthlyGrowthPct)}
          sub={overview.monthlyGrowthPct == null ? '' : fillText(l.overMonths, { n: overview.monthlyGrowthSpan })}
          spark={months.filter(row => row.isFinalized).map(row => row.averageDailyIncome)}
          sparkColor={overview.monthlyGrowthPct < 0 ? '#c4262c' : '#1d7a52'}
        />
        <GrowthTile
          label={l.ordersPerDay}
          value={latest ? String(latest.ordersPerDay) : '—'}
          valueTone={trendTone(overview.ordersPerDayChangePct)}
          change={overview.ordersPerDayChangePct}
          changeLabel={previous ? fillText(l.vsMonth, { month: formatMonthYear(previous.monthStart, lang, previous.monthStart) }) : l.vsPrevious}
          sub={latest?.averageCheck != null ? (
            <>{l.avgCheck}: {formatCompact(latest.averageCheck)} <span className={`font-semibold ${trendTone(overview.averageCheckChangePct)}`}>({signedPct(overview.averageCheckChangePct)})</span></>
          ) : ''}
          spark={months.map(row => row.ordersPerDay)}
          sparkColor={overview.ordersPerDayChangePct < 0 ? '#c4262c' : '#1d7a52'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <RecordsCard overview={overview} l={l} lang={lang} />
        <PaybackCard payback={payback} status={cashflowStatus} l={l} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title={l.profitTitle} description={l.profitSub}>
          {cashflowStatus === 'ready'
            ? <TrendChart rows={profitRows} styleKey="totals" interval="month" breakEvenDaily={0} l={l} lang={lang} />
            : cashflowStatus === 'loading'
              ? <div className="flex h-40 items-center justify-center text-[#8a867f]"><Loader2 className="animate-spin" size={20} aria-hidden="true" /></div>
              : <p className="ws-caption py-6">{cashflowStatus === 'missing' ? l.migrationNeeded : l.growthFailed}</p>}
        </ChartCard>
        <ChartCard title={l.unitTitle} description={l.unitSub}>
          <UnitEconomicsTable months={months} profitRows={cashflowStatus === 'ready' ? profitRows : null} l={l} lang={lang} />
        </ChartCard>
      </div>
    </div>
  )
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="ws-segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

// Money flow in the personal-finance Reports layout: Breakdown (Sankey or a
// profit and loss table) and Trends (income and spending per day, week or month).
function MoneyFlowCard({
  l, lang, analysis, categoryName, onOpenHistory, onOpenIncomeHistory,
  mode, onMode, view, onView, pnlBreakdown, onPnlBreakdown,
  trendStyle, onTrendStyle, intervals, interval, onInterval, trendRows, trendStatus, onTrendRetry, breakEvenDaily,
}) {
  const intervalLabels = { day: l.intervalDay, week: l.intervalWeek, decade: l.intervalDecade, month: l.intervalMonth }
  return (
    <section className="ws-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ws-heading">{l.flowTitle}</h3>
          <p className="ws-caption mt-0.5">{l.flowSub}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented label={l.flowView} value={mode} onChange={onMode} options={[{ value: 'breakdown', label: l.flowBreakdown }, { value: 'trends', label: l.flowTrends }]} />
          {mode === 'breakdown' ? (
            <>
              <Segmented label={l.chartType} value={view} onChange={onView} options={[{ value: 'sankey', label: l.flowSankey }, { value: 'pnl', label: l.flowPnl }]} />
              {view === 'pnl' && (
                <Segmented label={l.flowPnl} value={pnlBreakdown} onChange={onPnlBreakdown} options={[{ value: 'category', label: l.pnlCategories }, { value: 'group', label: l.pnlGroups }, { value: 'both', label: l.pnlBoth }]} />
              )}
            </>
          ) : (
            <>
              <Segmented label={l.chartType} value={trendStyle} onChange={onTrendStyle} options={[{ value: 'totals', label: l.trendTotals }, { value: 'groups', label: l.trendGroups }, { value: 'table', label: l.trendTable }]} />
              {intervals.length > 1 && (
                <Segmented label={l.interval} value={interval} onChange={onInterval} options={intervals.map(value => ({ value, label: intervalLabels[value] }))} />
              )}
            </>
          )}
        </div>
      </div>
      <div className="mt-4">
        {mode === 'trends' ? (
          trendStatus === 'error' ? (
            <div className="flex flex-col items-center gap-3 py-10 text-sm font-bold text-[#8a867f]">
              <p>{l.trendsFailed}</p>
              <button type="button" className="ws-btn" onClick={onTrendRetry}><RefreshCw size={14} aria-hidden="true" />{l.retry}</button>
            </div>
          ) : !trendRows ? (
            <div className="flex h-[300px] items-center justify-center text-[#8a867f]" role="status" aria-label={l.loading}><Loader2 className="animate-spin" size={22} aria-hidden="true" /></div>
          ) : (
            trendStyle === 'table'
              ? <TrendTable rows={trendRows} interval={interval} breakEvenDaily={breakEvenDaily} l={l} lang={lang} />
              : <TrendChart rows={trendRows} styleKey={trendStyle} interval={interval} breakEvenDaily={breakEvenDaily} l={l} lang={lang} />
          )
        ) : view === 'pnl' ? (
          <ProfitLossTable pnl={analysis.pnl} breakdown={pnlBreakdown} l={l} lang={lang} categoryName={categoryName} onOpenHistory={onOpenHistory} onOpenIncomeHistory={onOpenIncomeHistory} />
        ) : (
          <SankeyChart
            sankey={analysis.sankey}
            colors={analysis.colors}
            hubLabel={l.hub}
            emptyLabel={l.empty}
            sourceLabel={key => l[key] || key}
            targetLabel={categoryName}
            onTargetClick={onOpenHistory}
          />
        )}
      </div>
    </section>
  )
}

const PNL_ROW = {
  total: 'bg-[#f6f5f3] font-semibold text-[#22201d]',
  subtotal: 'font-semibold text-[#22201d]',
  line: 'text-[#68655f]',
}

// Profit and loss: total income and its lines, total expenses by category,
// by spending group, or both, and what was left. A section's chevron folds it;
// a category line opens its history.
function ProfitLossTable({ pnl, breakdown, l, lang, categoryName, onOpenHistory, onOpenIncomeHistory }) {
  const [closed, setClosed] = useState([])
  if (!pnl.incomeTotal && !pnl.expenseTotal) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{l.empty}</p>

  const groupLabels = { salaries: l.salaries, bazaar: l.bazaar, meals: l.meals, other: l.otherSpend }
  const toggle = key => setClosed(list => (list.includes(key) ? list.filter(item => item !== key) : [...list, key]))
  const incomeName = key => (key === '__cafe__' ? l.cafeIncome : expenseCategoryLabel(key, lang))

  function row({ key, label, amount, level, kind = 'line', section = false, tone, onOpen }) {
    const isClosed = closed.includes(key)
    return (
      <tr key={key} className={`border-b border-[#efece9] ${PNL_ROW[kind]}`}>
        <th scope="row" className="py-2.5 pr-3 text-left text-[13px] font-[inherit]" style={{ paddingLeft: 12 + level * 20 }}>
          <span className="inline-flex items-center gap-1.5">
            {section && (
              <button type="button" className="-ml-1 rounded p-0.5 text-[#8a867f] hover:bg-[#efece9]" aria-expanded={!isClosed} aria-label={`${isClosed ? l.showSection : l.hideSection}: ${label}`} onClick={() => toggle(key)}>
                <ChevronDown size={15} className={`transition-transform ${isClosed ? '-rotate-90' : ''}`} aria-hidden="true" />
              </button>
            )}
            {onOpen ? (
              <button type="button" className="text-left hover:underline" title={l.openHistory} onClick={onOpen}>{label}</button>
            ) : label}
          </span>
        </th>
        <td className={`py-2.5 pr-3 text-right text-[13px] tabular-nums ${tone === 'negative' ? 'text-red-600' : tone === 'positive' ? 'text-green-700' : ''}`}>
          {tone === 'negative' && amount > 0 ? `−${formatCurrency(amount)}` : formatCurrency(amount)}
        </td>
      </tr>
    )
  }

  const categoryRows = (lines, level, prefix) => lines.map(line => row({
    key: `${prefix}:${line.key}`, label: categoryName(line.key), amount: line.amount, level, onOpen: () => onOpenHistory(line.key),
  }))
  const expenseRows = breakdown === 'category'
    ? categoryRows(pnl.expenseLines, 1, 'e')
    : pnl.groups.flatMap(group => {
      const key = `g:${group.key}`
      const both = breakdown === 'both'
      return [
        row({ key, label: groupLabels[group.key], amount: group.amount, level: 1, kind: both ? 'subtotal' : 'line', section: both }),
        ...(both && !closed.includes(key) ? categoryRows(group.lines, 2, key) : []),
      ]
    })

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse">
        <thead>
          <tr className="border-b border-[#e4e1de] text-[12px] text-[#8a867f]">
            <th scope="col" className="py-2 pl-3 text-left font-semibold">{l.lineItem}</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">{l.amount}</th>
          </tr>
        </thead>
        <tbody>
          {pnl.gross && (
            <>
              {row({ key: 'gross', label: `${l.grossProfit}${pnl.gross.marginPct == null ? '' : ` · ${formatPct(pnl.gross.marginPct)}`}`, amount: Math.abs(pnl.gross.profit), level: 0, kind: 'total', section: true, tone: pnl.gross.profit < 0 ? 'negative' : undefined })}
              {!closed.includes('gross') && (
                <>
                  {row({ key: 'gross:sales', label: l.cafeIncome, amount: pnl.gross.sales, level: 1 })}
                  {row({ key: 'gross:cost', label: l.costOfSold, amount: pnl.gross.cost, level: 1, tone: 'negative' })}
                </>
              )}
              <tr aria-hidden="true"><td colSpan={2} className="h-4" /></tr>
            </>
          )}
          {row({ key: 'income', label: l.totalIncome, amount: pnl.incomeTotal, level: 0, kind: 'total', section: true })}
          {!closed.includes('income') && pnl.incomeLines.map(line => row({
            key: `i:${line.key}`, label: incomeName(line.key), amount: line.amount, level: 1,
            onOpen: line.key === '__cafe__' ? undefined : () => onOpenIncomeHistory(line.key),
          }))}
          {row({ key: 'expenses', label: l.totalExpenses, amount: pnl.expenseTotal, level: 0, kind: 'total', section: true })}
          {!closed.includes('expenses') && expenseRows}
          {row({ key: 'net', label: l.left, amount: Math.abs(pnl.net), level: 0, kind: 'total', tone: pnl.net < 0 ? 'negative' : 'positive' })}
        </tbody>
      </table>
    </div>
  )
}

const TREND_TOTAL_SERIES = [
  { key: 'income', color: '#16a34a' },
  { key: 'spent', color: '#eb6834' },
  { key: 'left', color: '#2a78d6' },
]

function trendAxisLabel(row, interval, lang) {
  if (interval === 'day') return String(Number(row.dateFrom.slice(8)))
  if (interval === 'month') return formatMonthYear(row.key, lang, row.key).slice(0, 3)
  if (interval === 'decade') return `${Number(row.dateFrom.slice(8))}–${Number(row.dateTo.slice(8))} ${formatMonthYear(row.dateFrom.slice(0, 7), lang, '').slice(0, 3)}`
  return formatLongDate(row.dateFrom, lang, row.dateFrom, { includeYear: false })
}

function trendRangeLabel(row, interval, lang) {
  if (interval === 'day') return formatLongDate(row.dateFrom, lang, row.dateFrom)
  if (interval === 'month') {
    const [year, month] = row.key.split('-').map(Number)
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    if (row.dateFrom === `${row.key}-01` && row.dateTo === `${row.key}-${lastDay}`) return formatMonthYear(row.key, lang, row.key)
  }
  return `${formatLongDate(row.dateFrom, lang, row.dateFrom, { includeYear: false })} — ${formatLongDate(row.dateTo, lang, row.dateTo)}`
}

// Bars over time, like the personal-finance Trends view: income, spending and
// what was left side by side, or spending stacked by group with income as a
// dashed line. Clicking a legend entry hides or shows its series.
function TrendChart({ rows, styleKey, interval, breakEvenDaily, l, lang }) {
  const [hidden, setHidden] = useState([])
  const [hoverIndex, setHoverIndex] = useState(null)
  const [wrapRef, measuredWidth] = useElementWidth()
  if (!rows.length || rows.every(row => !row.income && !row.spent)) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{l.empty}</p>

  const stacked = styleKey === 'groups'
  const seriesLabels = { income: l.moneyIn, spent: l.spent, left: l.left, salaries: l.salaries, bazaar: l.bazaar, meals: l.meals, other: l.otherSpend, breakEven: l.breakEven }
  const series = stacked
    ? [...SPENDING_GROUPS.map(key => ({ key, color: GROUP_COLORS[key] })), { key: 'income', color: '#16a34a', line: true }]
    : [...TREND_TOTAL_SERIES, ...(breakEvenDaily > 0 ? [{ key: 'breakEven', color: '#e34948', marker: true }] : [])]
  // The owner's daily break-even target, scaled to each bucket's length, as a mark over its bars.
  const breakEvenOf = row => breakEvenDaily * row.days
  const visible = series.filter(item => !hidden.includes(item.key))
  const bars = visible.filter(item => !item.line && !item.marker)
  const incomeLine = visible.find(item => item.line)
  const breakEvenMark = visible.find(item => item.marker)

  const values = rows.flatMap(row => stacked
    ? [bars.reduce((sum, item) => sum + row[item.key], 0), incomeLine ? row.income : 0]
    : [...bars.map(item => row[item.key]), breakEvenMark ? breakEvenOf(row) : 0])
  const maxValue = Math.max(1, ...values) * 1.08
  const minValue = Math.min(0, ...values) * 1.08

  const width = Math.max(rows.length * 28 + 70, measuredWidth || 0)
  const height = 280
  const pad = { top: 12, right: 8, bottom: 28, left: 58 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const y = value => pad.top + ((maxValue - value) / (maxValue - minValue)) * plotH
  const slot = plotW / rows.length
  const groupWidth = Math.min(stacked ? 36 : 54, slot * 0.72)
  const barWidth = stacked ? groupWidth : Math.max(2, (groupWidth - 2 * Math.max(0, bars.length - 1)) / Math.max(1, bars.length))
  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => minValue + ((maxValue - minValue) * index) / tickCount)
  const labelEvery = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(plotW / 64))))
  const hovered = hoverIndex == null ? null : rows[hoverIndex]
  const toggle = key => setHidden(list => (list.includes(key) ? list.filter(item => item !== key) : [...list, key]))
  const centerX = index => pad.left + index * slot + slot / 2

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-1 gap-y-1">
        {series.map(item => (
          <button
            key={item.key}
            type="button"
            aria-pressed={!hidden.includes(item.key)}
            onClick={() => toggle(item.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold hover:bg-[#f6f5f3] ${hidden.includes(item.key) ? 'text-[#8a867f] line-through' : 'text-[#68655f]'}`}
          >
            {item.line || item.marker
              ? <span className={`h-0 w-4 border-t-2 ${item.marker ? 'border-dotted' : 'border-dashed'}`} style={{ borderColor: item.color }} />
              : <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color, opacity: hidden.includes(item.key) ? 0.35 : 1 }} />}
            {seriesLabels[item.key]}
          </button>
        ))}
      </div>
      <div ref={wrapRef} className="relative overflow-x-auto">
        <svg width={width} height={height} className="block" role="img" aria-label={l.flowTrends} onMouseLeave={() => setHoverIndex(null)}>
          {ticks.map(tick => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-current text-[#efece9]" />
              <text x={pad.left - 8} y={y(tick)} dy="0.35em" textAnchor="end" className="fill-current text-[#8a867f] text-[11px] font-bold">{formatCompact(tick)}</text>
            </g>
          ))}
          {minValue < 0 && <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="stroke-current text-[#c9c5bf]" />}
          {rows.map((row, index) => {
            const start = centerX(index) - groupWidth / 2
            let stackTop = y(0)
            return (
              <g key={row.key} onMouseEnter={() => setHoverIndex(index)}>
                <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotH} fill={hoverIndex === index ? 'rgb(255 90 0 / 7%)' : 'transparent'} />
                {stacked
                  ? bars.map(item => {
                    if (!row[item.key]) return null
                    const h = y(0) - y(row[item.key])
                    stackTop -= h
                    return <rect key={item.key} x={start} y={stackTop} width={barWidth} height={Math.max(0, h - 1)} rx={barWidth > 6 ? 2 : 0} fill={item.color} />
                  })
                  : bars.map((item, barIndex) => {
                    const value = row[item.key]
                    if (!value) return null
                    const top = Math.min(y(value), y(0))
                    return <rect key={item.key} x={start + barIndex * (barWidth + 2)} y={top} width={barWidth} height={Math.max(1, Math.abs(y(value) - y(0)))} rx={barWidth > 6 ? 2 : 0} fill={item.color} />
                  })}
                {index % labelEvery === 0 && (
                  <text x={centerX(index)} y={height - 8} textAnchor="middle" className="fill-current text-[#8a867f] text-[11px] font-bold">{trendAxisLabel(row, interval, lang)}</text>
                )}
              </g>
            )
          })}
          {breakEvenMark && rows.map((row, index) => (
            <line key={`be-${row.key}`} x1={centerX(index) - groupWidth / 2 - 3} x2={centerX(index) + groupWidth / 2 + 3} y1={y(breakEvenOf(row))} y2={y(breakEvenOf(row))} stroke={breakEvenMark.color} strokeWidth={2} strokeDasharray="2 3" pointerEvents="none" />
          ))}
          {incomeLine && (
            <g pointerEvents="none">
              <polyline points={rows.map((row, index) => `${centerX(index)},${y(row.income)}`).join(' ')} fill="none" stroke={incomeLine.color} strokeWidth={2} strokeDasharray="6 4" />
              {rows.map((row, index) => <circle key={row.key} cx={centerX(index)} cy={y(row.income)} r={3} fill={incomeLine.color} />)}
            </g>
          )}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-56 rounded-xl border border-[#e4e1de] bg-white p-3 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(0, centerX(hoverIndex) + 12), Math.max(0, width - 232)) }}
          >
            <p className="mb-1.5 font-semibold text-[#22201d]">{trendRangeLabel(hovered, interval, lang)}</p>
            {series.map(item => {
              const value = item.marker ? breakEvenOf(hovered) : hovered[item.key]
              return (
                <p key={item.key} className="flex items-center justify-between gap-2 font-bold text-[#68655f]">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />{seriesLabels[item.key]}</span>
                  <span className={`tabular-nums ${value < 0 ? 'text-red-600' : 'text-[#22201d]'}`}>{formatCompact(value)}</span>
                </p>
              )
            })}
            <p className="mt-1.5 flex justify-between border-t border-[#efece9] pt-1.5 font-bold text-[#68655f]"><span>{l.avgPerDay}</span><span className="tabular-nums text-[#22201d]">{formatCompact(hovered.averageDaily)}</span></p>
            {stacked && (
              <p className="mt-1.5 flex justify-between border-t border-[#efece9] pt-1.5 font-semibold text-[#22201d]"><span>{l.spent}</span><span className="tabular-nums">{formatCurrency(hovered.spent)}</span></p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// The owner's sales sheet as a table: per period sales, days, average per day
// and its change and growth against the previous period, orders, average
// check, spending and what was left. Average per day is red below break-even.
function TrendTable({ rows, interval, breakEvenDaily, l, lang }) {
  if (!rows.length) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{l.empty}</p>
  const totals = rows.reduce((sum, row) => ({
    days: sum.days + row.days, cafeIncome: sum.cafeIncome + row.cafeIncome, orderCount: sum.orderCount + row.orderCount, spent: sum.spent + row.spent, left: sum.left + row.left,
  }), { days: 0, cafeIncome: 0, orderCount: 0, spent: 0, left: 0 })
  const signed = value => (value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCompact(Math.abs(value))}`)
  const tone = value => (value == null || value === 0 ? 'text-[#8a867f]' : value > 0 ? 'text-green-700' : 'text-red-600')
  const belowBreakEven = value => breakEvenDaily > 0 && value < breakEvenDaily
  const cell = 'py-2.5 px-3 text-right tabular-nums'
  const columns = [l.trendPeriod, l.cafeIncome, l.trendDays, l.avgPerDay, l.avgChange, l.growth, l.orders, l.avgCheck, l.spent, l.left]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[#e4e1de] text-[12px] text-[#8a867f]">
            {columns.map((column, index) => <th key={column} scope="col" className={`py-2 px-3 font-semibold ${index === 0 ? 'text-left' : 'text-right'}`}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-b border-[#efece9] text-[#22201d]">
              <th scope="row" className="py-2.5 px-3 text-left font-semibold">{trendRangeLabel(row, interval, lang)}</th>
              <td className={cell}>{formatCompact(row.cafeIncome)}</td>
              <td className={`${cell} text-[#68655f]`}>{row.days}</td>
              <td className={`${cell} font-semibold ${belowBreakEven(row.averageDaily) ? 'text-red-600' : ''}`} title={breakEvenDaily > 0 ? `${l.breakEven}: ${formatCurrency(breakEvenDaily)}` : undefined}>{formatCompact(row.averageDaily)}</td>
              <td className={`${cell} ${tone(row.averageDailyChange)}`}>{signed(row.averageDailyChange)}</td>
              <td className={`${cell} ${tone(row.growthPct)}`}>{row.growthPct == null ? '—' : `${row.growthPct > 0 ? '+' : ''}${formatPct(row.growthPct)}`}</td>
              <td className={`${cell} text-[#68655f]`}>{row.orderCount}</td>
              <td className={cell}>{row.averageCheck == null ? '—' : formatCompact(row.averageCheck)}</td>
              <td className={cell}>{formatCompact(row.spent)}</td>
              <td className={`${cell} ${row.left < 0 ? 'text-red-600' : 'text-green-700'}`}>{signed(row.left)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-[#f6f5f3] font-semibold text-[#22201d]">
            <th scope="row" className="py-2.5 px-3 text-left">{l.total}</th>
            <td className={cell}>{formatCompact(totals.cafeIncome)}</td>
            <td className={cell}>{totals.days}</td>
            <td className={`${cell} ${belowBreakEven(totals.days ? totals.cafeIncome / totals.days : 0) ? 'text-red-600' : ''}`}>{formatCompact(totals.days ? totals.cafeIncome / totals.days : 0)}</td>
            <td className={cell} colSpan={2}>{breakEvenDaily > 0 ? <span className="text-[12px] font-bold text-[#8a867f]">{l.breakEven}: {formatCompact(breakEvenDaily)}</span> : null}</td>
            <td className={cell}>{totals.orderCount}</td>
            <td className={cell}>{totals.orderCount ? formatCompact(totals.cafeIncome / totals.orderCount) : '—'}</td>
            <td className={cell}>{formatCompact(totals.spent)}</td>
            <td className={`${cell} ${totals.left < 0 ? 'text-red-600' : 'text-green-700'}`}>{signed(totals.left)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function LargestPayments({ rows, l, lang, categoryName, onOpen }) {
  if (!rows.length) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{l.empty}</p>
  const max = rows[0].amount || 1
  return (
    <ol className="divide-y divide-[#efece9]">
      {rows.map(row => {
        const details = [row.vendor, expenseDescriptionLabel(row.description, lang)].filter(Boolean).join(' · ')
        return (
          <li key={row.id}>
            <button type="button" onClick={() => onOpen(row.category)} title={l.openHistory} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 text-left hover:bg-[#f6f5f3]">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-[#22201d]">{categoryName(row.category)}{details ? <span className="font-normal text-[#68655f]"> · {details}</span> : null}</span>
                <span className="block text-[12px] text-[#8a867f]">{formatLongDate(row.date, lang, row.date)} · {expensePaymentMethodLabel(row.method, lang)}</span>
              </span>
              <span className="text-right text-[13px] font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.amount)}</span>
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-[#efece9]"><span className="block h-full rounded-full bg-[#eb6834]" style={{ width: `${(row.amount / max) * 100}%` }} /></span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// Same layout rules as the personal-finance Reports Sankey: real pixels (no viewBox scaling), a height that grows with
// the node count, node heights proportional to amounts, and side margins sized to the longest label so nothing is cut off.
const SANKEY = { nodeWidth: 10, nodePadding: 16, perNode: 30, minHeight: 300, padY: 8, labelGap: 8, perColumn: 140 }

let sankeyCanvas
function measureSankeyLabel(text) {
  if (typeof document === 'undefined') return text.length * 6.8
  const context = (sankeyCanvas ??= document.createElement('canvas')).getContext('2d')
  if (!context) return text.length * 6.8
  context.font = `600 12px ${getComputedStyle(document.body).fontFamily}`
  return context.measureText(text).width
}

function sankeyLinkPath(x0, y0, x1, y1) {
  const mid = (x0 + x1) / 2
  return `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1}`
}

function useElementWidth() {
  const [element, setElement] = useState(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return [setElement, width]
}

function SankeyChart({ sankey, colors, hubLabel, emptyLabel, sourceLabel, targetLabel, onTargetClick }) {
  const [hovered, setHovered] = useState(null)
  const [wrapRef, measuredWidth] = useElementWidth()
  if (!sankey.total) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{emptyLabel}</p>

  const { nodeWidth, nodePadding, perNode, minHeight, padY, labelGap, perColumn } = SANKEY
  const total = sankey.total
  const label = (name, amount) => `${name} · ${formatCompact(amount)}`
  const sourceText = node => label(sourceLabel(node.key), node.amount)
  const targetText = node => label(targetLabel(node.key), node.amount)
  const hubText = label(hubLabel, sankey.incomeTotal)

  const longest = texts => Math.ceil(Math.max(0, ...texts.map(measureSankeyLabel))) + labelGap + 6
  const marginLeft = longest(sankey.sources.map(sourceText))
  const marginRight = longest(sankey.targets.map(targetText))
  const middle = longest([hubText])
  const minWidth = marginLeft + marginRight + 2 * Math.max(perColumn, middle + 24)
  const width = Math.max(minWidth, measuredWidth || 0)
  const height = Math.max(minHeight, (sankey.sources.length + sankey.targets.length + 1) * perNode)

  // One scale for every column, taken from the column with the least room once its gaps are removed.
  const roomFor = count => height - padY * 2 - nodePadding * Math.max(0, count - 1) - 2 * count
  const scale = Math.max(0, Math.min(roomFor(sankey.sources.length), roomFor(sankey.targets.length), roomFor(1)) / total)
  const hubHeight = total * scale
  const hubTop = (height - hubHeight) / 2

  const leftX = marginLeft
  const rightX = width - marginRight - nodeWidth
  const hubX = Math.round((leftX + rightX) / 2)

  function layout(nodes) {
    const heights = nodes.map(node => Math.max(2, node.amount * scale))
    const used = heights.reduce((sum, h) => sum + h, 0) + nodePadding * Math.max(0, nodes.length - 1)
    let y = (height - used) / 2
    let hubY = hubTop
    return nodes.map((node, index) => {
      const band = node.amount * scale
      const placed = { ...node, y, h: heights[index], band, hubY }
      y += heights[index] + nodePadding
      hubY += band
      return placed
    })
  }

  const sources = layout(sankey.sources)
  const targets = layout(sankey.targets)
  const sourceColor = node => SOURCE_COLORS[node.key] || ANALYSIS_OTHER_COLOR
  const targetColor = node => (node.isLeft ? LEFT_COLOR : colors[node.key] || ANALYSIS_OTHER_COLOR)
  const clickable = node => !node.isLeft && !node.isOther
  const linkOpacity = key => (hovered === key ? 0.5 : hovered ? 0.14 : 0.28)
  const hover = key => ({ onMouseEnter: () => setHovered(key), onMouseLeave: () => setHovered(null) })
  const percent = amount => formatPct(shareOf(amount, total))

  return (
    <div ref={wrapRef} className="overflow-x-auto">
      <svg width={width} height={height} className="block" role="img" aria-label={hubLabel}>
        {sources.map(node => (
          <path
            key={`ls-${node.key}`}
            d={sankeyLinkPath(leftX + nodeWidth, node.y + node.h / 2, hubX, node.hubY + node.band / 2)}
            fill="none"
            strokeWidth={Math.max(1, node.band)}
            className="stroke-current text-[#8a867f] transition-[stroke-opacity]"
            strokeOpacity={linkOpacity(`s-${node.key}`)}
            {...hover(`s-${node.key}`)}
          >
            <title>{`${sourceLabel(node.key)} → ${hubLabel}: ${formatCurrency(node.amount)} (${percent(node.amount)})`}</title>
          </path>
        ))}
        {targets.map(node => (
          <path
            key={`lt-${node.key}`}
            d={sankeyLinkPath(hubX + nodeWidth, node.hubY + node.band / 2, rightX, node.y + node.h / 2)}
            fill="none"
            strokeWidth={Math.max(1, node.band)}
            className={`stroke-current text-[#8a867f] transition-[stroke-opacity] ${clickable(node) ? 'cursor-pointer' : ''}`}
            strokeOpacity={linkOpacity(`t-${node.key}`)}
            onClick={clickable(node) ? () => onTargetClick(node.key) : undefined}
            {...hover(`t-${node.key}`)}
          >
            <title>{`${hubLabel} → ${targetLabel(node.key)}: ${formatCurrency(node.amount)} (${percent(node.amount)})`}</title>
          </path>
        ))}

        {sources.map(node => (
          <g key={`s-${node.key}`} {...hover(`s-${node.key}`)}>
            <title>{`${sourceLabel(node.key)}: ${formatCurrency(node.amount)} (${percent(node.amount)})`}</title>
            <rect x={leftX} y={node.y} width={nodeWidth} height={node.h} rx={3} fill={sourceColor(node)} />
            <text x={leftX - labelGap} y={node.y + node.h / 2} dy="0.35em" textAnchor="end" className="fill-current text-[#22201d] text-[12px] font-semibold">{sourceText(node)}</text>
          </g>
        ))}

        <rect x={hubX} y={hubTop} width={nodeWidth} height={hubHeight} rx={3} className="fill-current text-[#22201d]" />
        <text x={hubX + nodeWidth + labelGap} y={hubTop + hubHeight / 2} dy="0.35em" className="fill-current text-[#22201d] text-[12px] font-semibold">{hubText}</text>

        {targets.map(node => (
          <g
            key={`t-${node.key}`}
            className={clickable(node) ? 'cursor-pointer' : ''}
            onClick={clickable(node) ? () => onTargetClick(node.key) : undefined}
            {...hover(`t-${node.key}`)}
          >
            <title>{`${targetLabel(node.key)}: ${formatCurrency(node.amount)} (${percent(node.amount)})`}</title>
            <rect x={rightX} y={node.y} width={nodeWidth} height={node.h} rx={3} fill={targetColor(node)} />
            <text x={rightX + nodeWidth + labelGap} y={node.y + node.h / 2} dy="0.35em" className="fill-current text-[#22201d] text-[12px] font-semibold">{targetText(node)}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function DonutChart({ categories, colors, total, totalLabel, emptyLabel, labelFor, onSelect }) {
  const [hovered, setHovered] = useState(null)
  if (!total) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{emptyLabel}</p>

  const size = 200
  const radius = 80
  const stroke = 30
  const circumference = 2 * Math.PI * radius
  const gapLength = categories.length > 1 ? 2 : 0
  let offset = 0
  const active = categories.find(category => category.key === hovered)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 xl:flex-row">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-48 w-48 flex-shrink-0" role="img" aria-label={totalLabel}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {categories.map(category => {
            const length = (category.amount / total) * circumference
            const segment = (
              <circle
                key={category.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={colors[category.key]}
                strokeWidth={hovered === category.key ? stroke + 6 : stroke}
                strokeDasharray={`${Math.max(0.5, length - gapLength)} ${circumference}`}
                strokeDashoffset={-offset}
                opacity={hovered && hovered !== category.key ? 0.35 : 1}
                className={category.isOther ? '' : 'cursor-pointer'}
                onMouseEnter={() => setHovered(category.key)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(category.key)}
              >
                <title>{`${labelFor(category.key)}: ${formatCurrency(category.amount)}`}</title>
              </circle>
            )
            offset += length
            return segment
          })}
        </g>
        <text x={size / 2} y={size / 2 - 6} textAnchor="middle" className="fill-current text-[#68655f] text-[11px] font-bold">
          {active ? labelFor(active.key).slice(0, 22) : totalLabel}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="fill-current text-[#22201d] text-[17px] font-semibold">
          {formatCompact(active ? active.amount : total)}
        </text>
      </svg>
      <ul className="w-full min-w-0 space-y-1">
        {categories.map(category => (
          <li key={category.key}>
            <button
              type="button"
              disabled={category.isOther}
              onClick={() => onSelect(category.key)}
              onMouseEnter={() => setHovered(category.key)}
              onMouseLeave={() => setHovered(null)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors disabled:cursor-default ${hovered === category.key ? 'bg-orange-50' : 'hover:bg-orange-50'}`}
            >
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: colors[category.key] }} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#22201d]">{labelFor(category.key)}</span>
              <span className="text-xs font-bold text-[#8a867f] tabular-nums">{formatPct(shareOf(category.amount, total))}</span>
              <span className="w-24 text-right text-sm font-semibold text-[#22201d] tabular-nums">{formatCompact(category.amount)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}


function CategoryComparison({ rows, labelFor, l }) {
  if (!rows.length) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{l.empty}</p>
  const max = Math.max(...rows.map(row => Math.max(row.current, row.previous)), 1)
  // Largest categories first; the full list scrolls inside the card.
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[11px] font-bold text-[#68655f]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[#ff5a00]" />{l.current}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[#D1D5DB]" />{l.previous}</span>
      </div>
      <div data-comparison-scroll="true" className="max-h-[340px] space-y-3 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]">
      {rows.map(row => {
        const up = row.change > 0
        const badgeClass = row.change === 0 ? 'bg-gray-100 text-[#68655f]' : up ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
        const Icon = up ? ArrowUpRight : ArrowDownRight
        return (
          <div key={row.key} title={`${l.current}: ${formatCurrency(row.current)} · ${l.previous}: ${formatCurrency(row.previous)}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-bold text-[#22201d]">{labelFor(row.key)}</span>
              <span className={`inline-flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
                {row.change !== 0 && <Icon size={11} />}
                {row.changePct == null ? l.newItem : formatPct(Math.abs(row.changePct))}
                <span className="ml-1 font-bold opacity-80">{row.change > 0 ? '+' : row.change < 0 ? '−' : ''}{formatCompact(Math.abs(row.change))}</span>
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="h-2 rounded-r bg-[#ff5a00]" style={{ width: `${Math.max(0.5, (row.current / max) * 100)}%` }} />
              <div className="h-2 rounded-r bg-[#D1D5DB]" style={{ width: `${Math.max(0.5, (row.previous / max) * 100)}%` }} />
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}

function DailySpendingChart({ days, averageIncome, l, lang }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  if (!days.length || days.every(day => day.total === 0)) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{l.empty}</p>

  const width = 960
  const height = 260
  const pad = { top: 12, right: 12, bottom: 28, left: 52 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const maxValue = Math.max(averageIncome, ...days.map(day => day.total), 1) * 1.08
  const y = value => pad.top + plotH - (value / maxValue) * plotH
  const slot = plotW / days.length
  const barWidth = Math.max(2, Math.min(28, slot - 3))
  const ticks = [0, maxValue / 3, (maxValue * 2) / 3].map(Math.round)
  const labelEvery = Math.ceil(days.length / 12)
  const groupLabels = { salaries: l.salaries, bazaar: l.bazaar, meals: l.meals, other: l.otherSpend }
  const hovered = hoverIndex == null ? null : days[hoverIndex]

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-[#68655f]">
        {SPENDING_GROUPS.map(group => (
          <span key={group} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: GROUP_COLORS[group] }} />{groupLabels[group]}</span>
        ))}
        {averageIncome > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-[#22201d]" />{l.avgIncome}</span>}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={l.dailyTitle} onMouseLeave={() => setHoverIndex(null)}>
          {ticks.map(tick => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-current text-[#efece9]" />
              <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-current text-[#8a867f] text-[11px] font-bold">{formatCompact(tick)}</text>
            </g>
          ))}
          {days.map((day, index) => {
            const x = pad.left + index * slot + (slot - barWidth) / 2
            let stackTop = pad.top + plotH
            return (
              <g key={day.date} onMouseEnter={() => setHoverIndex(index)}>
                <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotH} fill={hoverIndex === index ? 'rgb(255 90 0 / 8%)' : 'transparent'} />
                {SPENDING_GROUPS.map(group => {
                  if (!day[group]) return null
                  const h = (day[group] / maxValue) * plotH
                  stackTop -= h
                  return <rect key={group} x={x} y={stackTop} width={barWidth} height={Math.max(0, h - 1)} rx={barWidth > 6 ? 2 : 0} fill={GROUP_COLORS[group]} />
                })}
                {index % labelEvery === 0 && (
                  <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" className="fill-current text-[#8a867f] text-[11px] font-bold">{Number(day.date.slice(8))}</text>
                )}
              </g>
            )
          })}
          {averageIncome > 0 && (
            <line x1={pad.left} x2={width - pad.right} y1={y(averageIncome)} y2={y(averageIncome)} className="stroke-current text-[#22201d]" strokeWidth={2} strokeDasharray="6 5" pointerEvents="none" />
          )}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-52 rounded-xl border border-[#e4e1de] bg-white p-3 text-xs shadow-lg"
            style={{ left: `${Math.min(70, Math.max(0, ((hoverIndex + 0.5) / days.length) * 100 - 10))}%` }}
          >
            <p className="mb-1.5 font-semibold text-[#22201d]">{formatLongDate(hovered.date, lang, hovered.date)}</p>
            {SPENDING_GROUPS.filter(group => hovered[group] > 0).map(group => (
              <p key={group} className="flex items-center justify-between gap-2 font-bold text-[#68655f]">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: GROUP_COLORS[group] }} />{groupLabels[group]}</span>
                <span className="text-[#22201d] tabular-nums">{formatCompact(hovered[group])}</span>
              </p>
            ))}
            <p className="mt-1.5 flex justify-between border-t border-[#efece9] pt-1.5 font-semibold text-[#22201d]"><span>{l.total}</span><span className="tabular-nums">{formatCurrency(hovered.total)}</span></p>
          </div>
        )}
      </div>
    </div>
  )
}

function PaymentMethodFlow({ rows, lang, l }) {
  const visible = rows.filter(row => row.method !== 'loyalty_card' && (row.income > 0 || row.expenses > 0))
  if (!visible.length) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{l.empty}</p>
  const max = Math.max(...visible.map(row => Math.max(row.income, row.expenses)), 1)
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {visible.map(row => (
        <div key={row.method} className="rounded-xl border border-[#e4e1de] bg-[#f6f5f3] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#22201d]">{expensePaymentMethodLabel(row.method, lang)}</span>
            <span className={`text-sm font-semibold tabular-nums ${row.left >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCompact(row.left)}</span>
          </div>
          {[[l.moneyIn, row.income, '#16a34a'], [l.spent, row.expenses, '#ff5a00']].map(([label, amount, color]) => (
            <div key={label} className="mb-1.5" title={`${label}: ${formatCurrency(amount)}`}>
              <div className="mb-0.5 flex justify-between text-[11px] font-bold text-[#68655f]"><span>{label}</span><span className="tabular-nums">{formatCompact(amount)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full" style={{ width: `${(amount / max) * 100}%`, backgroundColor: color }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
