import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarDays,
  ChevronDown,
  Flame,
  HandCoins,
  HelpCircle,
  Hourglass,
  Loader2,
  ReceiptText,
  ShoppingCart,
  Receipt,
  Package,
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
import WorkspaceDialog from '../components/WorkspaceDialog'
import SankeyChart from '../components/SankeyChart'
import BarChart from '../components/charts/BarChart'
import { CHART, CHART_DASH, ChartDot, ChartGradient, ChartGrid, ChartLegend, ChartTooltip, useElementWidth } from '../components/charts/ChartKit'
import { niceTicks, smoothPath } from '../lib/chartScale'
import { Shimmer } from '../components/PageShimmer'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { getAccountingQuickRange, normalizeAccountingPaidOrderSummary } from '../lib/accounting'
import {
  isMissingAccountingMonthlyCashflowRpc,
  isMissingAccountingMonthlyBreakdownRpc,
  loadAccountingAllTimeBalance,
  loadAccountingMonthlyCashflow,
  loadAccountingMonthlyBreakdown,
  dailyCafeIncomeByDate,
  loadAccountingDailyIncome,
  loadAccountingPaidOrderSummary,
  loadFinancialAnalysisBundle,
} from '../lib/accountingSummary'
import { DASHBOARD_DAILY_BREAK_EVEN_INCOME, loadDashboardMonthlyAverageIncome, normalizeDashboardMonthlyIncomeRows } from '../lib/monthlyIncome'
import { loadDashboardWeeklyIncome, normalizeDashboardWeeklyIncomeRows } from '../lib/weeklyIncome'
import { breakEvenTargetForPeriod, lastDayOfMonth, loadBreakEvenTargetHistory } from '../lib/breakEvenTarget'
import {
  ANALYSIS_SERIES_COLORS,
  INCOME_METHODS,
  SPENDING_GROUPS,
  assignCategoryColors,
  buildAccountingIndicators,
  buildAccountingPeriodEntries,
  buildAccountingProfitAndLoss,
  buildAccountingSankey,
  buildAccountingTrend,
  buildBreakEvenSummary,
  buildCategoryComparison,
  buildDailyIncome,
  buildDailySpending,
  buildRunningAverageIncome,
  buildDayMoneyFlow,
  buildGrowthOverview,
  buildInvestorOverview,
  buildLargestPayments,
  buildMonthlyProfitRows,
  buildMonthlyIncomeSources,
  buildMonthlySpending,
  buildPaybackSummary,
  buildPeriodTotals,
  buildSalesIndicators,
  buildTrendBuckets,
  composeSalaryProfiles,
  getAccountingAnalysisSummary,
  getPercentChange,
  getPreviousAccountingPeriod,
  getTopExpenseCategories,
  getTrendIntervals,
  groupSalaryCategories,
  SALARY_GROUP_CATEGORY,
} from '../lib/accountingAnalysis'
import { BANK_FEE_CATEGORY, buildPaymentFeeEntries, isMissingPaymentFeesRpc, loadPaymentFees } from '../lib/paymentFees'
import { isMissingCostAnomaliesRpc, loadCostAnomalies } from '../lib/costAnomalies'
import { CostAnomaliesNotice, PaymentFeeRatesPanel } from '../components/AnalysisChecks'
import { expenseCategoryLabel, expenseDescriptionLabel, expensePaymentMethodLabel, todayExpenseDate } from '../lib/expenses'
import { formatCompactCurrency, formatCurrency, formatCurrencyWithPercentage, formatPercent } from '../lib/formatCurrency'
import { formatLongDate, formatMonthYear } from '../lib/dateFormat'
import { collectPagedRows } from '../lib/orderHistory'
import { buildOwnerProfitOverview, loadOwnerProfitData } from '../lib/ownerProfit'
import { RollingText, RollingValue } from '../components/RollingNumber'

const EXPENSE_COLUMNS = 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_at'
const MEAL_COLUMNS = 'business_date, average_daily_amount, present_employee_count, total_amount, source_type, finalized_at, created_at'
const GROUP_COLORS = { salaries: ANALYSIS_SERIES_COLORS[0], bazaar: ANALYSIS_SERIES_COLORS[2], meals: ANALYSIS_SERIES_COLORS[3], other: ANALYSIS_SERIES_COLORS[1] }

const L = {
  uz: {
    title: 'Moliyaviy tahlil',
    sub: 'Pul qayerdan kelib, qayerga ketayotganini ko‘ring',
    incomeTitle: 'Daromad va foyda',
    incomeHelp: 'Tanlangan davrdagi savdo natijalari va tashqi tushumlar.',
    cafeIncome: 'Kafe daromadi',
    loyaltyIncome: 'Loyallik daromadi',
    netProfit: 'Yalpi foyda',
    netProfitSub: 'Kafe daromadi minus sotilgan mahsulot tannarxi',
    ordersCount: 'Buyurtmalar', ordersCountSub: 'Kuniga {n} ta buyurtma', avgCheckSub: 'Kafe daromadi ÷ buyurtmalar', costOfSoldSub: 'Kafe daromadining {pct}', bankFees: 'Bank komissiyasi (taxminiy)',
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
    tabMonthly: 'Oylik',
    tabOverall: 'Umumiy',
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
    runwaySub: 'Umumiy qoldiq (yopilgan oylar foydasisiz) ÷ kunlik sarf',
    days: 'kun',
    foodCost: 'Bozor / kafe daromadi',
    foodCostSub: 'Mahsulot xaridining daromaddagi ulushi',
    payrollShare: 'Maosh ulushi',
    payrollShareSub: 'Barcha xarajatlardagi maosh ulushi',
    vsPrevious: 'oldingi davrga nisbatan',
    flowTitle: 'Pul oqimi',
    flowSub: 'Har bir manbadan kelgan pul qaysi xarajatlarga ketgani',
    intervalDecade: '10 kun', trendTable: 'Jadval', trendPeriod: 'Davr', trendDays: 'Kun', avgPerDay: 'O‘rtacha kunlik', avgChange: 'Kunlik o‘zgarish', growth: 'O‘sish', orders: 'Buyurtmalar', avgCheck: 'O‘rtacha chek', breakEven: 'Zararsizlik nuqtasi', salesMargin: 'Savdo marjasi', costOfSold: 'Sotilgan mahsulot tannarxi', grossProfit: 'Yalpi foyda', largestTitle: 'Eng katta to‘lovlar', largestSub: 'Davrdagi eng yirik xarajatlar (maosh va xodimlar ovqatisiz). Tarixni ochish uchun bosing.', date: 'Sana', category: 'Kategoriya', details: 'Tafsilot',
    helpLabel: 'Bu nima?', spendingTitle: 'Pul oylar bo‘yicha qayerga ketmoqda', spendingSub: 'Har oy kategoriyalar bo‘yicha xarajat va oylik o‘rtacha', breakdownMigrationNeeded: 'Bu karta uchun migrations/261_accounting_monthly_breakdown.sql ni qo‘llang.', overCompleted: '{n} ta tugagan oy o‘rtachasi', biggestCost: 'Eng katta xarajat', avgPerMonthShort: 'Oyiga o‘rtacha', shareShort: 'Ulush', thisMonthSoFar: 'Shu oy hozircha', lastMonthShort: 'O‘tgan oy', spentInMonths: '{n} oyda sarflangan',
    incomeSourcesTitle: 'Pul oylar bo‘yicha qayerdan kelmoqda', incomeSourcesSub: 'Oddiy, turist, olib ketish, yetkazib berish, o‘yin klubi va boshqa daromad oyma-oy', srcRegular: 'Oddiy (zalda)', srcTourist: 'Turist', srcTakeAway: 'Olib ketish', srcDelivery: 'Yetkazib berish', srcGameClub: 'O‘yin klubi', avgIncomeMonth: 'Oyiga o‘rtacha daromad', biggestSource: 'Asosiy manba', touristShare: 'Turistlar ulushi', chartLegend: 'Chiziqlarni ko‘rsatish yoki yashirish', sourceLabel: 'Manba',
    ownerProfitTitle: 'Egasi foydasi', ownerProfitSub: 'Yopilgan oylarning haqiqiy foydasi: daromad minus barcha xarajat, maosh ishlangan oyda', ownerProfitTotal: '{n} ta yopilgan oy jami', ownerProfitByMonth: 'Yopilgan oylar bo‘yicha foyda', ownerProfitPending: 'Hali yopilmagan: {months}. Hisobga olish uchun «Egasi foydasi» sahifasida yoping.', ownerProfitNoneClosed: '{n} ta tugagan oy hali yopilmagan. Haqiqiy foydani ko‘rish uchun «Egasi foydasi» sahifasida yoping.', ownerProfitFailed: 'Egasi foydasini yuklab bo‘lmadi.', openOwnerProfit: 'Egasi foydasini ochish',
    investorTitle: 'Investor yordami', investorSub: 'Investor kiritgan barcha pul va kafe uni qanchalik qaytargani', investedSince: '{month} dan beri kiritilgan', investedTotal: 'Jami kiritilgan', stillToRecover: 'Qaytarilishi kerak', thisMonthSupport: 'Shu oy', recentSupport: 'So‘nggi {n} oyda', lastSupport: 'Oxirgi kiritilgan', supportedMonths: 'Yordam bo‘lgan oylar', ofMonths: '{n} oydan', shareOfSpending: 'Xarajatdagi ulushi', shareOfSpendingSub: '{n} oydagi barcha xarajatning shu qismi investor puli', shortfallTitle: 'Kafe yetishmovchiligi', shortfallSub: 'Kafe o‘z daromadi bilan qoplay olmagan xarajat', shortfallCovered: 'yetishmovchilikning {pct} qismini investor qopladi', noShortfall: 'Kafe har oy o‘z xarajatini qopladi', largestSupport: 'Eng katta oy', supportByMonth: 'Oylar bo‘yicha yordam', noneLabel: 'Yo‘q', averagePerMonth: 'Yordam bo‘lgan oyga o‘rtacha',
    totalsTitle: 'So‘nggi {n} oy jami', totalsSub: 'Barcha oylar yig‘indisi, joriy oy hozirgacha', resultLabel: 'Natija', profitableMonths: 'Foydali oylar', ofCompleted: '{m} ta tugagan oydan', salaryShare: 'Xarajatda maosh ulushi', avgMonthlySpend: 'Oyiga o‘rtacha xarajat', marginOf: '{pct} marja', bestResult: 'Eng yaxshi natija', worstResult: 'Eng yomon natija',
    breakEvenSub: 'Kunlik o‘rtacha savdo va sozlamalardagi kunlik maqsad', ofTarget: 'maqsadning {pct}', shortPerDay: 'Kuniga {amount} yetmayapti', abovePerDay: 'Kuniga {amount} ortiq', monthsAboveTarget: 'Maqsaddan yuqori oylar', targetPerDay: 'Kunlik maqsad', noTarget: 'Sozlamalarda kunlik zararsizlik maqsadini kiriting',
    statementTitle: 'Oyma-oy', statementSub: 'Har oyning daromadi, xarajati va natijasi; investor yordami alohida', soFar: 'hozirgacha',
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
    dailyIncomeTitle: 'Kunlik daromad',
    dailyIncomeSub: 'Har kuni kafe qancha ishlagani to‘lov turi bo‘yicha va shu kungacha o‘rtacha kunlik daromad. Kunni bosing — tafsilot ochiladi',
    incCash: 'Naqd', incCard: 'Karta', incTerminal: 'Terminal / QR', incSalary: 'Maoshdan', incOther: 'Boshqa', dailyIncomeFailed: 'Kunlik daromadni yuklab bo‘lmadi.',
    dailyTitle: 'Kunlik xarajatlar',
    dailySub: 'Har kuni sarflangan pul va shu kungacha o‘rtacha kunlik kafe daromadi. Kunni bosing — pul qayerga ketgani ochiladi',
    dayFlowTitle: 'Pul qayerga ketdi', dayPayments: 'Shu kungi to‘lovlar', dayLoadFailed: 'Kunlik kafe daromadini yuklab bo‘lmadi.', dayNoPayments: 'Bu kuni to‘lov yo‘q',
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
    netProfit: 'Валовая прибыль',
    netProfitSub: 'Доход кафе минус себестоимость проданных товаров',
    ordersCount: 'Заказы', ordersCountSub: '{n} заказов в день', avgCheckSub: 'Доход кафе ÷ заказы', costOfSoldSub: '{pct} дохода кафе', bankFees: 'Комиссия банка (расчётная)',
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
    tabMonthly: 'По месяцу',
    tabOverall: 'Общий',
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
    runwaySub: 'Общий остаток (без прибыли закрытых месяцев) ÷ расход в день',
    days: 'дн.',
    foodCost: 'Базар / доход кафе',
    foodCostSub: 'Доля закупок продуктов в доходе',
    payrollShare: 'Доля зарплат',
    payrollShareSub: 'Доля зарплат во всех расходах',
    vsPrevious: 'к прошлому периоду',
    flowTitle: 'Денежный поток',
    flowSub: 'Куда ушли деньги из каждого источника',
    intervalDecade: '10 дней', trendTable: 'Таблица', trendPeriod: 'Период', trendDays: 'Дни', avgPerDay: 'Ср. за день', avgChange: 'Изм. за день', growth: 'Рост', orders: 'Заказы', avgCheck: 'Средний чек', breakEven: 'Точка безубыточности', salesMargin: 'Маржа продаж', costOfSold: 'Себестоимость проданного', grossProfit: 'Валовая прибыль', largestTitle: 'Крупнейшие платежи', largestSub: 'Самые большие расходы периода (без зарплат и питания сотрудников). Нажмите, чтобы открыть историю.', date: 'Дата', category: 'Категория', details: 'Детали',
    helpLabel: 'Что это?', spendingTitle: 'Куда уходят деньги по месяцам', spendingSub: 'Расходы по категориям каждый месяц и среднее в месяц', breakdownMigrationNeeded: 'Для этой карточки примените migrations/261_accounting_monthly_breakdown.sql.', overCompleted: 'среднее за {n} заверш. мес.', biggestCost: 'Главный расход', avgPerMonthShort: 'Ср. в месяц', shareShort: 'Доля', thisMonthSoFar: 'Этот месяц пока', lastMonthShort: 'Прошлый месяц', spentInMonths: 'Потрачено за {n} мес.',
    incomeSourcesTitle: 'Откуда приходят деньги по месяцам', incomeSourcesSub: 'Обычные, туристы, с собой, доставка, игровой клуб и другой доход по месяцам', srcRegular: 'Обычные (в зале)', srcTourist: 'Туристы', srcTakeAway: 'С собой', srcDelivery: 'Доставка', srcGameClub: 'Игровой клуб', avgIncomeMonth: 'Ср. доход в месяц', biggestSource: 'Главный источник', touristShare: 'Доля туристов', chartLegend: 'Показать или скрыть линии', sourceLabel: 'Источник',
    ownerProfitTitle: 'Прибыль владельца', ownerProfitSub: 'Фактическая прибыль закрытых месяцев: доход минус все расходы, зарплата в месяце, когда её заработали', ownerProfitTotal: 'Итого за {n} закрытых мес.', ownerProfitByMonth: 'Прибыль по закрытым месяцам', ownerProfitPending: 'Ещё не закрыты: {months}. Закройте их на странице «Прибыль владельца», чтобы учесть.', ownerProfitNoneClosed: 'Завершённых, но не закрытых месяцев: {n}. Закройте их на странице «Прибыль владельца», чтобы увидеть фактическую прибыль.', ownerProfitFailed: 'Не удалось загрузить прибыль владельца.', openOwnerProfit: 'Открыть прибыль владельца',
    investorTitle: 'Поддержка инвестора', investorSub: 'Все деньги, вложенные инвестором, и сколько кафе уже вернуло', investedSince: 'Вложено с {month}', investedTotal: 'Вложено всего', stillToRecover: 'Осталось вернуть', thisMonthSupport: 'В этом месяце', recentSupport: 'За {n} мес.', lastSupport: 'Последнее вложение', supportedMonths: 'Месяцев с поддержкой', ofMonths: 'из {n}', shareOfSpending: 'Доля в расходах', shareOfSpendingSub: 'всех расходов за {n} мес. оплачено инвестором', shortfallTitle: 'Нехватка кафе', shortfallSub: 'Расходы, которые доход кафе не покрыл', shortfallCovered: '{pct} нехватки покрыто инвестором', noShortfall: 'Кафе каждый месяц покрывало свои расходы', largestSupport: 'Крупнейший месяц', supportByMonth: 'Поддержка по месяцам', noneLabel: 'Нет', averagePerMonth: 'В среднем за месяц с поддержкой',
    totalsTitle: 'Итого за {n} мес.', totalsSub: 'Сумма всех месяцев, текущий — на сегодня', resultLabel: 'Результат', profitableMonths: 'Прибыльные месяцы', ofCompleted: 'из {m} завершённых', salaryShare: 'Доля зарплат в расходах', avgMonthlySpend: 'Средние расходы в месяц', marginOf: 'маржа {pct}', bestResult: 'Лучший результат', worstResult: 'Худший результат',
    breakEvenSub: 'Средние продажи в день против дневной цели из настроек', ofTarget: '{pct} от цели', shortPerDay: 'Не хватает {amount} в день', abovePerDay: 'Выше на {amount} в день', monthsAboveTarget: 'Месяцев выше цели', targetPerDay: 'Цель в день', noTarget: 'Укажите дневную точку безубыточности в настройках',
    statementTitle: 'По месяцам', statementSub: 'Доход, расходы и результат каждого месяца; поддержка инвестора отдельно', soFar: 'на сегодня',
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
    dailyIncomeTitle: 'Доход по дням',
    dailyIncomeSub: 'Сколько кафе заработало каждый день по способам оплаты и средний дневной доход на эту дату. Нажмите на день, чтобы увидеть подробности',
    incCash: 'Наличные', incCard: 'Карта', incTerminal: 'Терминал / QR', incSalary: 'Из зарплаты', incOther: 'Другое', dailyIncomeFailed: 'Не удалось загрузить доход по дням.',
    dailyTitle: 'Расходы по дням',
    dailySub: 'Траты каждого дня и средний дневной доход кафе на эту дату. Нажмите на день, чтобы увидеть, куда ушли деньги',
    dayFlowTitle: 'Куда ушли деньги', dayPayments: 'Платежи за день', dayLoadFailed: 'Не удалось загрузить доход кафе за день.', dayNoPayments: 'В этот день платежей нет',
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
    netProfit: 'Gross profit',
    netProfitSub: 'Cafe income minus cost of sold items',
    ordersCount: 'Orders', ordersCountSub: '{n} orders a day', avgCheckSub: 'Cafe income ÷ orders', costOfSoldSub: '{pct} of cafe income', bankFees: 'Bank fees (estimated)',
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
    tabMonthly: 'Monthly',
    tabOverall: 'Overall',
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
    runwaySub: 'All-time balance (after closed months’ owner profit) ÷ daily burn',
    days: 'days',
    foodCost: 'Bazaar / cafe income',
    foodCostSub: 'Product purchases as a share of income',
    payrollShare: 'Payroll share',
    payrollShareSub: 'Salaries as a share of all spending',
    vsPrevious: 'vs previous period',
    flowTitle: 'Money flow',
    flowSub: 'Where the money from each source ended up',
    intervalDecade: '10 days', trendTable: 'Table', trendPeriod: 'Period', trendDays: 'Days', avgPerDay: 'Avg / day', avgChange: 'Change / day', growth: 'Growth', orders: 'Orders', avgCheck: 'Avg check', breakEven: 'Break-even', salesMargin: 'Sales margin', costOfSold: 'Cost of items sold', grossProfit: 'Gross profit', largestTitle: 'Largest payments', largestSub: 'The biggest expenses in the period (salaries and staff meals excluded). Tap one to open its history.', date: 'Date', category: 'Category', details: 'Details',
    helpLabel: 'What is this?', spendingTitle: 'Where money goes by month', spendingSub: 'Spending by category every month, with the monthly average', breakdownMigrationNeeded: 'Apply migrations/261_accounting_monthly_breakdown.sql to show this card.', overCompleted: 'average of {n} finished months', biggestCost: 'Biggest cost', avgPerMonthShort: 'Avg / month', shareShort: 'Share', thisMonthSoFar: 'This month so far', lastMonthShort: 'Last month', spentInMonths: 'Spent in {n} months',
    incomeSourcesTitle: 'Where money comes from by month', incomeSourcesSub: 'Regular, tourist, take-away, delivery, game club and other income, month by month', srcRegular: 'Regular (dine-in)', srcTourist: 'Tourist', srcTakeAway: 'Take-away', srcDelivery: 'Delivery', srcGameClub: 'Game club', avgIncomeMonth: 'Avg income / month', biggestSource: 'Biggest source', touristShare: 'Tourist share', chartLegend: 'Show or hide lines', sourceLabel: 'Source',
    ownerProfitTitle: 'Owner profit', ownerProfitSub: 'Actual profit from closed months: income minus every cost, salary in the month it was earned', ownerProfitTotal: 'Total from {n} closed months', ownerProfitByMonth: 'Profit by closed month', ownerProfitPending: 'Not closed yet: {months}. Close them on the Owner profit page to count them.', ownerProfitNoneClosed: '{n} finished months are not closed yet. Close them on the Owner profit page to see the actual profit.', ownerProfitFailed: 'Could not load owner profit.', openOwnerProfit: 'Open Owner profit',
    investorTitle: 'Investor support', investorSub: 'All the money the investor put in, and how much the cafe has paid back', investedSince: 'Invested since {month}', investedTotal: 'Invested in total', stillToRecover: 'Still to pay back', thisMonthSupport: 'This month', recentSupport: 'Last {n} months', lastSupport: 'Last top-up', supportedMonths: 'Months with support', ofMonths: 'of {n}', shareOfSpending: 'Share of spending', shareOfSpendingSub: 'of all spending in {n} months was paid by the investor', shortfallTitle: 'Cafe shortfall', shortfallSub: 'Spending the cafe’s own income did not cover', shortfallCovered: '{pct} of the shortfall covered by the investor', noShortfall: 'The cafe covered its own spending every month', largestSupport: 'Largest month', supportByMonth: 'Support by month', noneLabel: 'None', averagePerMonth: 'Avg per supported month',
    totalsTitle: 'Last {n} months in total', totalsSub: 'Every month added up, the current month so far', resultLabel: 'Result', profitableMonths: 'Profitable months', ofCompleted: 'of {m} completed', salaryShare: 'Salaries of spending', avgMonthlySpend: 'Avg spending / month', marginOf: '{pct} margin', bestResult: 'Best result', worstResult: 'Worst result',
    breakEvenSub: 'Average daily sales against the daily target in settings', ofTarget: '{pct} of target', shortPerDay: 'Short {amount} a day', abovePerDay: 'Above by {amount} a day', monthsAboveTarget: 'Months above target', targetPerDay: 'Target / day', noTarget: 'Set a daily break-even target in settings',
    statementTitle: 'Month by month', statementSub: 'Income, costs and result for every month, with investor support kept apart', soFar: 'so far',
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
    dailyIncomeTitle: 'Daily income',
    dailyIncomeSub: 'What the cafe took each day by payment method against average daily income so far. Tap a day to see the details',
    incCash: 'Cash', incCard: 'Card', incTerminal: 'Terminal / QR', incSalary: 'From salary', incOther: 'Other', dailyIncomeFailed: 'Could not load daily income.',
    dailyTitle: 'Daily spending',
    dailySub: 'What was spent each day against average daily cafe income so far. Tap a day to see where the money went',
    dayFlowTitle: 'Where the money went', dayPayments: 'Payments that day', dayLoadFailed: 'Could not load the day’s cafe income.', dayNoPayments: 'No payments that day',
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

// Plain-language answers behind each "?" button, per language.
const HELP = {
  en: {
    investor: 'Money the investor gave the cafe, counted from the first top-up. The green bar shows how much of it the cafe has already earned back from its own work. \'Still to pay back\' is what is left.',
    generated: 'All the cafe\'s own income since opening minus all its spending. Investor money is not counted. If it is below zero, the cafe spent more than it earned and investor money filled the gap.',
    pace: 'The average result (income minus spending) of the last three finished months. It is used to guess how many months are left until the investment is paid back.',
    shareOfSpending: 'Out of every 100 UZS the cafe spent in these months, how many came from the investor.',
    shortfall: 'Add up every month where spending was bigger than income: the missing money is the shortfall. It shows how much help the cafe needed.',
    ownerProfit: 'The real profit of the owner, taken from months that were closed on the Owner profit page. A closed month is final: its income minus all its costs, with salary counted in the month it was earned. Months not closed yet are listed but not counted.',
    avgSalesPerDay: 'Cafe sales in the month divided by the number of days. In the current month only finished days count. The badge compares it with last month.',
    threeMonthGrowth: 'How much higher or lower average daily sales are now compared with three months ago.',
    monthlyGrowth: 'The steady growth per month that takes daily sales from the first finished month to the last one. A simple way to say how fast the cafe is growing.',
    ordersPerDay: 'How many paid orders the cafe gets on an average day, and the average bill per order.',
    totals: 'All the months shown added together. Result is income minus spending. Gross profit is sales minus the cost of the food sold. Investor money is not counted as income.',
    records: 'The best month and the best 10 days by average daily sales, and how close this month is to the best month.',
    breakEven: 'Break-even is how much the cafe must sell per day to cover all its costs. You set it in settings. 100% means sales cover the costs; less means the cafe is short.',
    incomeSources: 'Where the money comes from each month, one line per source. Tourist means bills with tourist prices. Regular is dine-in at regular prices. Tap a name above the chart to hide or show its line.',
    spending: 'Where the money went each month, by category. The average uses finished months only. \'This month\' turns red when it is already above the average.',
    profit: 'For each month: money in (without investor money), money spent and what was left. A bar below zero means the month was a loss.',
    unit: 'Shows if growth comes from more customers (orders per day) or bigger bills (average check). Gross margin is the part of sales left after food cost.',
    statement: 'One line per month: income, cost of the food sold, all spending, salaries and the result. Investor support is in its own column and is not income.',
    moneyIn: 'All money that came in on the selected dates: cafe sales, other income and investor support.',
    spent: 'Everything paid out on the selected dates: bazaar purchases, salaries paid, rent, staff meals and other expenses.',
    left: 'Money in minus spent. Below zero means more money went out than came in.',
    savingsRate: 'The part of the money in that was kept after spending. 25% means 25 of every 100 UZS stayed.',
    burnRate: 'Average spending per day on the selected dates.',
    runway: 'How many days the money on hand would last at the current daily spending if no money came in.',
    foodCost: 'How much of the cafe income went to buying products at the bazaar.',
    payrollShare: 'The part of all spending that went to salaries.',
    flow: 'A picture of where the money came from and where it went. Thicker lines mean more money. Switch to Trends to see it over time, or Profit & loss for a table.',
    categories: 'Spending split by category. Tap a category to open its payments.',
    compare: 'Each category now against the previous period of the same length.',
    largest: 'The biggest single payments in the period, without salaries and staff meals.',
    dailyIncome: 'Cafe income on each day, split by how guests paid. Loyalty value is not counted. The dashed line is the average daily income so far: income up to that day divided by the days so far. Tap a day to see its money in and out.',
    daily: 'Spending on each day, with the average daily income so far as a line: each point is the income up to that day divided by the days so far. Tap a day to see where its money went.',
    methods: 'How money came in and went out by payment method: cash, card, terminal and others.',
  },
  ru: {
    investor: 'Деньги, которые инвестор дал кафе, с первого вложения. Зелёная полоса показывает, сколько из них кафе уже вернуло своей работой. «Осталось вернуть» — то, что ещё не вернулось.',
    generated: 'Весь собственный доход кафе с открытия минус все расходы. Деньги инвестора не считаются. Если число ниже нуля, кафе потратило больше, чем заработало, и разницу покрыл инвестор.',
    pace: 'Средний результат (доход минус расходы) трёх последних завершённых месяцев. По нему примерно считается, сколько месяцев осталось до возврата вложений.',
    shareOfSpending: 'Сколько из каждых 100 сумов расходов за эти месяцы пришло от инвестора.',
    shortfall: 'Сложите все месяцы, где расходы были больше дохода: недостающие деньги и есть нехватка. Показывает, сколько помощи было нужно кафе.',
    ownerProfit: 'Реальная прибыль владельца из месяцев, закрытых на странице «Прибыль владельца». Закрытый месяц окончательный: доход минус все расходы, зарплата учитывается в месяце, когда её заработали. Незакрытые месяцы показаны, но не считаются.',
    avgSalesPerDay: 'Продажи кафе за месяц, делённые на число дней. В текущем месяце считаются только завершённые дни. Значок сравнивает с прошлым месяцем.',
    threeMonthGrowth: 'Насколько средние продажи в день сейчас выше или ниже, чем три месяца назад.',
    monthlyGrowth: 'Ровный рост в месяц, который ведёт продажи в день от первого завершённого месяца к последнему. Простой ответ на вопрос, как быстро растёт кафе.',
    ordersPerDay: 'Сколько оплаченных заказов кафе получает в обычный день и какой средний чек.',
    totals: 'Все показанные месяцы вместе. Результат — доход минус расходы. Валовая прибыль — продажи минус себестоимость проданной еды. Деньги инвестора не считаются доходом.',
    records: 'Лучший месяц и лучшие 10 дней по средним продажам в день и насколько этот месяц близок к лучшему.',
    breakEven: 'Точка безубыточности — сколько кафе должно продавать в день, чтобы покрыть все расходы. Задаётся в настройках. 100% — продажи покрывают расходы, меньше — не хватает.',
    incomeSources: 'Откуда приходят деньги каждый месяц, по линии на источник. Туристы — чеки по туристическим ценам. Обычные — в зале по обычным ценам. Нажмите на название над графиком, чтобы скрыть или показать линию.',
    spending: 'Куда ушли деньги каждый месяц по категориям. Среднее считается только по завершённым месяцам. «Этот месяц» становится красным, если уже выше среднего.',
    profit: 'По каждому месяцу: деньги пришли (без инвестора), потрачено и что осталось. Столбец ниже нуля — месяц в убыток.',
    unit: 'Показывает, растём мы за счёт клиентов (заказов в день) или чека. Валовая маржа — доля продаж после себестоимости еды.',
    statement: 'Строка на месяц: доход, себестоимость, все расходы, зарплаты и результат. Поддержка инвестора в отдельной колонке и не является доходом.',
    moneyIn: 'Все деньги за выбранные даты: продажи кафе, другой доход и поддержка инвестора.',
    spent: 'Всё, что выплачено за выбранные даты: базар, выплаченные зарплаты, аренда, питание сотрудников и другие расходы.',
    left: 'Пришло минус потрачено. Ниже нуля — ушло больше, чем пришло.',
    savingsRate: 'Какая часть пришедших денег осталась после расходов. 25% — из каждых 100 сумов осталось 25.',
    burnRate: 'Средние расходы в день за выбранные даты.',
    runway: 'На сколько дней хватит денег при текущих расходах в день, если доход не придёт.',
    foodCost: 'Какая часть дохода кафе ушла на покупку продуктов на базаре.',
    payrollShare: 'Какая часть всех расходов ушла на зарплаты.',
    flow: 'Картинка: откуда пришли деньги и куда ушли. Толще линия — больше денег. «Тренды» показывают по времени, «Прибыль и убыток» — таблицей.',
    categories: 'Расходы по категориям. Нажмите на категорию, чтобы открыть платежи.',
    compare: 'Каждая категория сейчас против прошлого периода той же длины.',
    largest: 'Самые крупные платежи периода, без зарплат и питания сотрудников.',
    dailyIncome: 'Доход кафе за каждый день по способам оплаты. Оплата лояльностью не учитывается. Пунктир — средний доход в день на каждую дату: доход с начала периода, делённый на прошедшие дни. Нажмите на день, чтобы увидеть приход и расход.',
    daily: 'Расходы по дням и линия среднего дохода в день на каждую дату: доход с начала периода, делённый на прошедшие дни. Нажмите на день, чтобы увидеть, куда ушли деньги.',
    methods: 'Как деньги пришли и ушли по способу оплаты: наличные, карта, терминал и другие.',
  },
  uz: {
    investor: 'Investor kafega bergan pul, birinchi kiritilgan kundan beri. Yashil chiziq kafe o‘z ishi bilan qancha qismini qaytarganini ko‘rsatadi. «Qaytarilishi kerak» — hali qaytmagan qism.',
    generated: 'Ochilgandan beri kafening o‘z daromadi minus barcha xarajatlar. Investor puli hisoblanmaydi. Noldan past bo‘lsa, kafe ishlab topganidan ko‘p sarflagan va farqni investor qoplagan.',
    pace: 'So‘nggi uchta tugagan oyning o‘rtacha natijasi (daromad minus xarajat). Investitsiya qaytishiga necha oy qolganini taxmin qilish uchun ishlatiladi.',
    shareOfSpending: 'Shu oylardagi har 100 so‘m xarajatning qanchasi investordan kelgan.',
    shortfall: 'Xarajat daromaddan katta bo‘lgan barcha oylarni qo‘shing: yetishmagan pul — bu yetishmovchilik. Kafega qancha yordam kerak bo‘lganini ko‘rsatadi.',
    ownerProfit: 'Egasining haqiqiy foydasi: «Egasi foydasi» sahifasida yopilgan oylardan olinadi. Yopilgan oy yakuniy: daromad minus barcha xarajatlar, maosh ishlangan oyda hisoblanadi. Hali yopilmagan oylar ko‘rsatiladi, lekin hisoblanmaydi.',
    avgSalesPerDay: 'Oydagi kafe savdosi kunlar soniga bo‘lingan. Joriy oyda faqat tugagan kunlar hisoblanadi. Belgi o‘tgan oy bilan solishtiradi.',
    threeMonthGrowth: 'Kunlik o‘rtacha savdo hozir uch oy oldingiga qaraganda qancha yuqori yoki past.',
    monthlyGrowth: 'Kunlik savdoni birinchi tugagan oydan oxirgisigacha olib boradigan bir tekis oylik o‘sish. Kafe qanchalik tez o‘sayotganini oddiy ko‘rsatadi.',
    ordersPerDay: 'Kafe o‘rtacha bir kunda nechta to‘langan buyurtma oladi va o‘rtacha chek qancha.',
    totals: 'Ko‘rsatilgan barcha oylar yig‘indisi. Natija — daromad minus xarajat. Yalpi foyda — savdo minus sotilgan ovqat tannarxi. Investor puli daromad hisoblanmaydi.',
    records: 'Kunlik o‘rtacha savdo bo‘yicha eng yaxshi oy va eng yaxshi 10 kun, hamda shu oy eng yaxshi oyga qanchalik yaqin.',
    breakEven: 'Zararsizlik nuqtasi — barcha xarajatlarni qoplash uchun kafe kuniga qancha sotishi kerak. Sozlamalarda kiritiladi. 100% — savdo xarajatni qoplaydi, kamroq — yetmayapti.',
    incomeSources: 'Har oy pul qayerdan kelayotgani, har manba uchun bitta chiziq. Turist — turist narxidagi cheklar. Oddiy — zalda oddiy narxda. Chiziqni yashirish yoki ko‘rsatish uchun grafik ustidagi nomni bosing.',
    spending: 'Har oy pul qaysi kategoriyalarga ketgani. O‘rtacha faqat tugagan oylardan hisoblanadi. «Shu oy» o‘rtachadan oshsa qizil bo‘ladi.',
    profit: 'Har oy: kelgan pul (investorsiz), sarflangan va qolgan. Noldan pastdagi ustun — o‘sha oy zarar.',
    unit: 'O‘sish ko‘proq mijozdanmi (kunlik buyurtmalar) yoki kattaroq chekdanmi. Yalpi marja — ovqat tannarxidan keyin qolgan savdo ulushi.',
    statement: 'Har oy bitta qator: daromad, tannarx, barcha xarajat, maosh va natija. Investor yordami alohida ustunda va daromad emas.',
    moneyIn: 'Tanlangan kunlarda kelgan barcha pul: kafe savdosi, boshqa daromad va investor yordami.',
    spent: 'Tanlangan kunlarda to‘langan hammasi: bozor, to‘langan maosh, ijara, xodimlar ovqati va boshqa xarajatlar.',
    left: 'Kelgan minus sarflangan. Noldan past — kelganidan ko‘p ketgan.',
    savingsRate: 'Kelgan pulning xarajatdan keyin qolgan qismi. 25% — har 100 so‘mdan 25 so‘m qolgan.',
    burnRate: 'Tanlangan kunlardagi kunlik o‘rtacha xarajat.',
    runway: 'Daromad kelmasa, hozirgi kunlik xarajatda qo‘ldagi pul necha kunga yetadi.',
    foodCost: 'Kafe daromadining qancha qismi bozordan mahsulot olishga ketgan.',
    payrollShare: 'Barcha xarajatning qancha qismi maoshga ketgan.',
    flow: 'Pul qayerdan kelib, qayerga ketgani rasmi. Chiziq qalinroq — pul ko‘proq. «Trendlar» vaqt bo‘yicha, «Foyda va zarar» jadval ko‘rinishida.',
    categories: 'Xarajatlar kategoriyalar bo‘yicha. To‘lovlarni ochish uchun kategoriyani bosing.',
    compare: 'Har bir kategoriya hozir va shu uzunlikdagi oldingi davr.',
    largest: 'Davrdagi eng katta alohida to‘lovlar, maosh va xodimlar ovqatisiz.',
    dailyIncome: 'Har kungi kafe daromadi, mehmonlar qanday to‘lagani bo‘yicha. Sodiqlik mablag‘i hisoblanmaydi. Punktir chiziq — shu kungacha kunlik o‘rtacha daromad: davr boshidan tushgan daromad o‘tgan kunlarga bo‘linadi. Kirim va chiqimni ko‘rish uchun kunni bosing.',
    daily: 'Har kungi xarajat va shu kungacha kunlik o‘rtacha daromad chizig‘i: davr boshidan tushgan daromad o‘tgan kunlarga bo‘linadi. Pul qayerga ketganini ko‘rish uchun kunni bosing.',
    methods: 'Pul to‘lov usuli bo‘yicha qanday kelib-ketgan: naqd, karta, terminal va boshqalar.',
  },
}

const HelpContext = createContext(null)

function HelpButton({ topic, title }) {
  const help = useContext(HelpContext)
  if (!help || !topic) return null
  return (
    <button
      type="button"
      onClick={() => help.open(topic, title)}
      aria-label={`${help.label}: ${title}`}
      className="relative inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[#68655f] transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-[#efece9] hover:text-[#22201d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40"
    >
      <HelpCircle size={16} aria-hidden="true" />
    </button>
  )
}

function HelpDialog({ title, text, closeLabel, onClose }) {
  return (
    <WorkspaceDialog
      title={title}
      onClose={onClose}
      closeLabel={closeLabel}
      variant="sheet"
      size="md"
      footer={<button type="button" onClick={onClose} className="ws-btn ws-btn-outline">{closeLabel}</button>}
    >
      <p className="text-[15px] leading-relaxed text-[#22201d]">{text}</p>
    </WorkspaceDialog>
  )
}

// An amount inside a sentence: the label may wrap, the figure and its unit never split.
function Money({ value }) {
  return <span className="whitespace-nowrap tabular-nums">{formatCurrency(value)}</span>
}

// Percent values arrive already rounded to one decimal by src/lib/accountingAnalysis.js; null means "not known".
function formatPct(value, lang) {
  return value == null ? '—' : formatPercent(value, lang)
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

const OVERALL_TAB = 'overall'

export default function AccountingAnalysis() {
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const l = L[lang] || L.en
  // "?" buttons open one shared dialog; its text is read at render, so a
  // language switch only changes the words.
  const [helpTopic, setHelpTopic] = useState(null)
  const closeHelp = useCallback(() => setHelpTopic(null), [])
  const helpApi = useMemo(() => ({ open: (topic, title) => setHelpTopic({ topic, title }), label: L[lang]?.helpLabel || L.en.helpLabel }), [lang])
  // Monthly (the picked period) first; Overall is the 12-month growth view.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === OVERALL_TAB ? OVERALL_TAB : 'monthly'
  const overall = tab === OVERALL_TAB
  const tabs = {
    label: l.title,
    value: tab,
    items: [{ key: 'monthly', label: l.tabMonthly }, { key: OVERALL_TAB, label: l.tabOverall }],
    onChange: key => setSearchParams(key === OVERALL_TAB ? { tab: OVERALL_TAB } : {}, { replace: true }),
  }
  const [dateFrom, setDateFrom] = useState(() => todayExpenseDate().slice(0, 8) + '01')
  const [dateTo, setDateTo] = useState(() => todayExpenseDate())
  const [activeRangeKey, setActiveRangeKey] = useState('month')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedKpi, setSelectedKpi] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
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
  const [targetHistory, setTargetHistory] = useState([])
  const [dailyIncome, setDailyIncome] = useState({ key: '', status: 'loading', rows: null })
  const [dailyIncomeRetry, setDailyIncomeRetry] = useState(0)
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
  // Overall shows a year: the cash flow loads 13 months so payback has a full pace window.
  const yearProfitRows = useMemo(() => profitRows.slice(-12), [profitRows])
  const investorOverview = useMemo(() => (growth.cashflow ? buildInvestorOverview(growth.cashflow.totals, yearProfitRows) : null), [growth.cashflow, yearProfitRows])
  const periodTotals = useMemo(() => buildPeriodTotals(yearProfitRows), [yearProfitRows])
  const breakEvenTarget = state.settings?.averageDailyBreakEvenIncomeUzs ?? DASHBOARD_DAILY_BREAK_EVEN_INCOME
  // Each day's calculated target applies to that day; a period uses the average of its days.
  // Refetched when the setting changes; a failed read falls back to the current target.
  useEffect(() => {
    const controller = new AbortController()
    loadBreakEvenTargetHistory({ signal: controller.signal })
      .then(setTargetHistory)
      .catch(() => { if (!controller.signal.aborted) setTargetHistory([]) })
    return () => controller.abort()
  }, [breakEvenTarget, reloadKey])
  const targetForPeriod = useCallback(
    (dateFrom, dateTo) => breakEvenTargetForPeriod(targetHistory, dateFrom, dateTo, todayExpenseDate(), breakEvenTarget),
    [targetHistory, breakEvenTarget],
  )
  const breakEven = useMemo(
    () => buildBreakEvenSummary(growthOverview, breakEvenTarget, monthStart => targetForPeriod(monthStart, lastDayOfMonth(monthStart))),
    [growthOverview, breakEvenTarget, targetForPeriod],
  )

  // Income by source and spending by category per month (migration 261) and
  // closed owner-profit months (257) load only when Overall is open.
  const [breakdown, setBreakdown] = useState({ key: null, status: 'idle', data: null })
  const [ownerProfit, setOwnerProfit] = useState({ key: null, status: 'idle', data: null })
  useEffect(() => {
    if (!overall || breakdown.key === reloadKey) return
    const key = reloadKey
    setBreakdown({ key, status: 'loading', data: null })
    setOwnerProfit({ key, status: 'loading', data: null })
    loadAccountingMonthlyBreakdown(12)
      .then(data => setBreakdown(current => (current.key === key ? { key, status: 'ready', data } : current)))
      .catch(error => setBreakdown(current => (current.key === key ? { key, status: isMissingAccountingMonthlyBreakdownRpc(error) ? 'missing' : 'error', data: null } : current)))
    loadOwnerProfitData()
      .then(data => setOwnerProfit(current => (current.key === key ? { key, status: 'ready', data } : current)))
      .catch(() => setOwnerProfit(current => (current.key === key ? { key, status: 'error', data: null } : current)))
  }, [overall, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const breakdownStatus = breakdown.status === 'idle' ? 'loading' : breakdown.status
  const monthlySpending = useMemo(() => (
    breakdown.data ? buildMonthlySpending(breakdown.data.spending, yearProfitRows.map(row => row.dateFrom)) : null
  ), [breakdown.data, yearProfitRows])
  const incomeSources = useMemo(() => (
    breakdown.data ? buildMonthlyIncomeSources(breakdown.data.income, yearProfitRows) : null
  ), [breakdown.data, yearProfitRows])
  const ownerProfitOverview = useMemo(() => buildOwnerProfitOverview(ownerProfit.data, todayExpenseDate()), [ownerProfit.data])

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

  // Per-day cafe income (migration 265, split by method since 286) for Daily
  // income and the running average on Daily spending. Optional for spending:
  // until it arrives (or on error) that chart keeps the flat line.
  const dailyIncomeKey = `${dateFrom}|${trendTo}|${reloadKey}|${dailyIncomeRetry}`
  useEffect(() => {
    const key = dailyIncomeKey
    if (dateFrom > trendTo) {
      setDailyIncome({ key, status: 'ready', rows: [] })
      return undefined
    }
    let active = true
    setDailyIncome({ key, status: 'loading', rows: null })
    loadAccountingDailyIncome(dateFrom, trendTo)
      .then(rows => { if (active) setDailyIncome({ key, status: 'ready', rows }) })
      .catch(() => { if (active) setDailyIncome({ key, status: 'error', rows: null }) })
    return () => { active = false }
  }, [dailyIncomeKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const dailyIncomeReady = dailyIncome.key === dailyIncomeKey && dailyIncome.status === 'ready'
  const dailyIncomeStatus = dailyIncome.key === dailyIncomeKey ? dailyIncome.status : 'loading'
  const dailyIncomeByDate = useMemo(() => (dailyIncomeReady ? dailyCafeIncomeByDate(dailyIncome.rows) : null), [dailyIncomeReady, dailyIncome.rows])
  const dailyIncomeDays = useMemo(() => (dailyIncomeReady ? buildDailyIncome(dailyIncome.rows, dateFrom, trendTo) : null), [dailyIncomeReady, dailyIncome.rows, dateFrom, trendTo])

  // Bank fee estimates for both compared periods and the sold-item cost check
  // (migration 278), Monthly tab only. Without the migration both stay hidden
  // and the analysis keeps its earlier totals.
  const [feeVersion, setFeeVersion] = useState(0)
  const checksKey = `${dateFrom}|${dateTo}|${reloadKey}|${feeVersion}`
  const [fees, setFees] = useState({ key: '', status: 'idle', current: null, previous: null })
  const [costChecks, setCostChecks] = useState({ key: '', status: 'idle', data: null })
  useEffect(() => {
    if (overall) return undefined
    let active = true
    const key = checksKey
    setFees(current => (current.key === key ? current : { key, status: 'loading', current: null, previous: null }))
    Promise.all([
      loadPaymentFees(dateFrom, dateTo),
      loadPaymentFees(previousPeriod.dateFrom, previousPeriod.dateTo),
    ])
      .then(([current, previous]) => { if (active) setFees({ key, status: 'ready', current, previous }) })
      .catch(error => { if (active) setFees({ key, status: isMissingPaymentFeesRpc(error) ? 'missing' : 'error', current: null, previous: null }) })
    return () => { active = false }
  }, [overall, checksKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const costKey = `${dateFrom}|${dateTo}|${reloadKey}`
  useEffect(() => {
    if (overall) return undefined
    let active = true
    loadCostAnomalies(dateFrom, dateTo)
      .then(data => { if (active) setCostChecks({ key: costKey, status: 'ready', data }) })
      .catch(error => { if (active) setCostChecks({ key: costKey, status: isMissingCostAnomaliesRpc(error) ? 'missing' : 'error', data: null }) })
    return () => { active = false }
  }, [overall, costKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const feesForPeriod = fees.key === checksKey ? fees : { status: 'loading', current: null, previous: null }
  const feesSettled = feesForPeriod.status !== 'loading' && feesForPeriod.status !== 'idle'
  const costAnomalies = costChecks.key === costKey && costChecks.status === 'ready' ? costChecks.data : null

  const analysis = useMemo(() => {
    if (!data) return null
    const currentEntries = [
      ...buildAccountingPeriodEntries({ ...data.current, salaryProfiles: data.salaryProfiles }, dateFrom, dateTo),
      ...buildPaymentFeeEntries(feesForPeriod.current),
    ]
    const previousEntries = [
      ...buildAccountingPeriodEntries({ ...data.previous, salaryProfiles: data.salaryProfiles }, previousPeriod.dateFrom, previousPeriod.dateTo),
      ...buildPaymentFeeEntries(feesForPeriod.previous),
    ]
    const summary = getAccountingAnalysisSummary(data.current.paidOrderSummary, currentEntries, dateFrom, dateTo)
    const previousSummary = getAccountingAnalysisSummary(data.previous.paidOrderSummary, previousEntries, previousPeriod.dateFrom, previousPeriod.dateTo)
    const dayCount = summary.cafeIncomeSummary.dayCount
    const indicators = buildAccountingIndicators(summary, { dayCount, allTimeBalance: data.allTimeBalance })
    const previousIndicators = buildAccountingIndicators(previousSummary, { dayCount: previousSummary.cafeIncomeSummary.dayCount })
    // Salary categories show as one slice; the P&L keeps every category.
    const categories = getTopExpenseCategories(groupSalaryCategories(summary.expenseSummary.byCategory))
    return {
      summary,
      sales: buildSalesIndicators(data.current.paidOrderSummary, dateFrom, dateTo),
      previousSales: buildSalesIndicators(data.previous.paidOrderSummary, previousPeriod.dateFrom, previousPeriod.dateTo),
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
      comparison: buildCategoryComparison(groupSalaryCategories(summary.expenseSummary.byCategory), groupSalaryCategories(previousSummary.expenseSummary.byCategory)),
    }
  }, [data, dateFrom, dateTo, previousPeriod, feesForPeriod.current, feesForPeriod.previous])

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

  function openHistory(category, type, from = dateFrom, to = dateTo) {
    if (!category || category.startsWith('__')) return
    const params = new URLSearchParams({ type, category, from, to })
    navigate(`/admin/accounting/history?${params.toString()}`)
  }

  function categoryName(key) {
    if (key === '__other__') return l.other
    if (key === '__left__') return l.left
    if (key === SALARY_GROUP_CATEGORY) return l.salaries
    if (key === BANK_FEE_CATEGORY) return l.bankFees
    return expenseCategoryLabel(key, lang)
  }

  const showData = !loading && analysis && feesSettled
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
        netProfit: [`${formatCurrency(cafeIncome)} − ${formatCurrency(costTotal)} = ${formatCurrency(netProfit)}`, ['Kafe daromadi', 'Sotilgan mahsulotlarning buyurtma vaqtida saqlangan tannarxi', `Foiz: yalpi foyda ÷ kafe daromadi = ${formatPct(profitMarginPct, 'uz')}`]],
        average: [`${formatCurrency(selectedRangeCafeIncome.total)} ÷ ${selectedRangeCafeIncome.dayCount} kun = ${formatCurrency(selectedRangeCafeIncome.averageDaily)}`, ['Tanlangan davrning barcha kalendar kunlari (savdo bo‘lmagan kunlar ham)', 'Faqat kafe daromadi; loyallik mablag‘i kiritilmaydi']],
        investor: ['Tanlangan davrdagi “Investor yordami” turidagi daromad yozuvlari yig‘indisi.', ['Investor yordami yozuvlari', `Boshqa daromad (${formatCurrency(otherIncomeTotal)}) alohida hisoblanadi va bu kartaga qo‘shilmaydi`]],
      },
      ru: {
        cafeIncome: ['Фактически полученные деньги по оплаченным заказам за выбранный период.', ['Оплаты наличными, картой и терминалом', `Оплата лояльностью (${formatCurrency(loyaltyIncome)}) показана отдельно и не входит в доступную выручку`]],
        netProfit: [`${formatCurrency(cafeIncome)} − ${formatCurrency(costTotal)} = ${formatCurrency(netProfit)}`, ['Доход кафе', 'Историческая себестоимость проданных позиций, сохранённая в заказах', `Процент: валовая прибыль ÷ доход кафе = ${formatPct(profitMarginPct, 'ru')}`]],
        average: [`${formatCurrency(selectedRangeCafeIncome.total)} ÷ ${selectedRangeCafeIncome.dayCount} дн. = ${formatCurrency(selectedRangeCafeIncome.averageDaily)}`, ['Все календарные дни выбранного периода, включая дни без продаж', 'Только доход кафе; оплата лояльностью не включена']],
        investor: ['Сумма записей дохода с категорией «Поддержка инвестора» за выбранный период.', ['Внесённая поддержка инвестора', `Другой доход (${formatCurrency(otherIncomeTotal)}) считается отдельно и в эту карточку не входит`]],
      },
      en: {
        cafeIncome: ['Money actually received from paid orders in the selected period.', ['Cash, card, and terminal payments', `Loyalty value (${formatCurrency(loyaltyIncome)}) is shown separately and is not spendable revenue`]],
        netProfit: [`${formatCurrency(cafeIncome)} − ${formatCurrency(costTotal)} = ${formatCurrency(netProfit)}`, ['Cafe income', 'Historical cost of sold items saved with the orders', `Percentage: gross profit ÷ cafe income = ${formatPct(profitMarginPct, 'en')}`]],
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
    <HelpContext.Provider value={helpApi}>
    <AppShell
      title={l.title}
      tabs={tabs}
      titleAccessory={overall ? null : (
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
            className="ws-btn ws-btn-outline !px-2.5 xl:!px-3.5"
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
          className="ws-btn ws-btn-outline ws-btn-icon"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </nav>
      )}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          {!overall && (
          <section className="ws-panel zk-period-in-page" aria-labelledby="analysis-period-heading">
            <div className="min-w-0">
              <h2 id="analysis-period-heading" className="ws-heading">{l.period}</h2>
              <p className="ws-caption mt-0.5">
                {l.comparedWith}: {formatLongDate(previousPeriod.dateFrom, lang, previousPeriod.dateFrom)} — {formatLongDate(previousPeriod.dateTo, lang, previousPeriod.dateTo)}
              </p>
            </div>
            <div className="mt-4">{periodPicker()}</div>
          </section>
          )}

          {loadFailed && !loading && (
            <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-3">
              <span>{l.loadFailed}</span>
              <button type="button" onClick={() => setReloadKey(key => key + 1)} className="ws-btn ws-btn-outline ws-btn-sm">{l.refresh}</button>
            </div>
          )}

          {overall ? (
          <section aria-labelledby="analysis-growth-heading">
            <SectionHeading id="analysis-growth-heading" title={l.growthTitle} description={l.growthSub} />
            <div className="mb-5">
              <InvestorSupportPanel investor={investorOverview} payback={payback} status={growth.cashflowStatus} l={l} lang={lang} />
            </div>
            <div className="mb-5">
              <OwnerProfitCard overview={ownerProfitOverview} status={ownerProfit.status === 'idle' ? 'loading' : ownerProfit.status} l={l} lang={lang} onOpen={() => navigate('/admin/financial-analysis/owner-profit')} />
            </div>
            <GrowthSection
              growth={growth}
              overview={growthOverview}
              profitRows={yearProfitRows}
              periodTotals={periodTotals}
              breakEven={breakEven}
              l={l}
              lang={lang}
              onRetry={() => setReloadKey(key => key + 1)}
            />
            <div className="mt-5">
              <IncomeSourcesCard sources={incomeSources} status={breakdownStatus} l={l} lang={lang} onRetry={() => setBreakdown(current => ({ ...current, key: null }))} />
            </div>
            <div className="mt-5">
              <MonthlySpendingCard spending={monthlySpending} status={breakdownStatus} l={l} lang={lang} categoryName={categoryName} onRetry={() => setBreakdown(current => ({ ...current, key: null }))} />
            </div>
            <div className="mt-5 space-y-5">
              <MonthlyIncomeChart
                rows={growth.months}
                status={growth.status}
                onRetry={() => setReloadKey(key => key + 1)}
                lang={lang}
                targetForPeriod={targetForPeriod}
              />
              <WeeklyIncomeChart lang={lang} targetForPeriod={targetForPeriod} />
            </div>
          </section>
          ) : (
          <>

          <section aria-labelledby="analysis-income-heading">
            <SectionHeading id="analysis-income-heading" title={l.incomeTitle} description={`${l.incomeHelp} · ${periodLabel}`} />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-3">
              <Kpi loading={loading} icon={WalletCards} label={l.cafeIncome} value={loading ? '—' : formatCurrency(cafeIncome)} sub={loading ? '' : <>{l.loyaltyIncome}: <Money value={loyaltyIncome} /></>} tone="green" detailHint={l.tapForDetails} onClick={loading ? null : () => setSelectedKpi(kpiDetails.cafeIncome)} />
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
                sub={loading ? '' : <>{l.periodCafeIncome}: <Money value={selectedRangeCafeIncome.total} /> · {l.loyaltyIncome}: <Money value={selectedRangeCafeIncome.loyaltyTotal} /></>}
                tone="blue"
                detailHint={l.tapForDetails}
                onClick={loading ? null : () => setSelectedKpi(kpiDetails.average)}
              />
              <Kpi loading={loading}
                icon={HandCoins}
                label={l.investorSupport}
                value={loading ? '—' : formatCurrency(investorSupportTotal)}
                sub={loading ? '' : otherIncomeTotal > 0 ? <>{l.otherIncomeSub}: <Money value={otherIncomeTotal} /></> : l.investorSupportSub}
                tone="purple"
                detailHint={l.tapForDetails}
                onClick={loading ? null : () => setSelectedKpi(kpiDetails.investor)}
              />
            </div>
            <SalesRow lang={lang} sales={loading ? null : analysis?.sales} previous={analysis?.previousSales} l={l} />
            {costAnomalies && <div className="mt-3"><CostAnomaliesNotice anomalies={costAnomalies} lang={lang} /></div>}
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
              <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
                <TotalTile lang={lang} help="moneyIn" label={l.moneyIn} value={indicators.moneyIn} change={getPercentChange(indicators.moneyIn, previousIndicators.moneyIn)} goodWhenUp vsLabel={l.vsPrevious} tone="green" />
                <TotalTile lang={lang} help="spent" label={l.spent} value={indicators.spent} change={getPercentChange(indicators.spent, previousIndicators.spent)} goodWhenUp={false} vsLabel={l.vsPrevious} tone="orange" />
                <TotalTile lang={lang} help="left" label={l.left} value={indicators.left} change={getPercentChange(indicators.left, previousIndicators.left)} goodWhenUp vsLabel={l.vsPrevious} tone={indicators.left >= 0 ? 'blue' : 'red'} />
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
                <Indicator icon={PiggyBank} help="savingsRate" label={l.savingsRate} value={formatPct(indicators.savingsRatePct, lang)} sub={l.savingsRateSub} meter={indicators.savingsRatePct} tone={indicators.savingsRatePct != null && indicators.savingsRatePct < 0 ? 'red' : 'green'} />
                <Indicator icon={Flame} help="burnRate" label={l.burnRate} value={formatCurrency(indicators.avgDailySpend)} sub={l.burnRateSub} tone="orange" />
                <Indicator icon={Hourglass} help="runway" label={l.runway} value={indicators.runwayDays == null ? '—' : `${indicators.runwayDays} ${l.days}`} sub={l.runwaySub} tone="blue" />
                <Indicator icon={ShoppingBasket} help="foodCost" label={l.foodCost} value={formatPct(indicators.foodCostPct, lang)} sub={l.foodCostSub} meter={indicators.foodCostPct} tone="teal" />
                <Indicator icon={Users} help="payrollShare" label={l.payrollShare} value={formatPct(indicators.payrollSharePct, lang)} sub={l.payrollShareSub} meter={indicators.payrollSharePct} tone="purple" />
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
                breakEvenFor={targetForPeriod}
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <ChartCard title={l.categoriesTitle} help="categories" description={l.categoriesSub}>
                  <DonutChart
                    lang={lang}
                    categories={analysis.categories}
                    colors={analysis.colors}
                    total={analysis.summary.expenseSummary.total}
                    totalLabel={l.spent}
                    emptyLabel={l.empty}
                    labelFor={categoryName}
                    onSelect={openCategoryHistory}
                  />
                </ChartCard>
                <ChartCard title={l.compareTitle} help="compare" description={l.compareSub}>
                  <CategoryComparison lang={lang} rows={analysis.comparison} labelFor={categoryName} l={l} />
                </ChartCard>
              </div>

              <ChartCard title={l.largestTitle} help="largest" description={l.largestSub}>
                <LargestPayments rows={analysis.largest} l={l} lang={lang} categoryName={categoryName} onOpen={openCategoryHistory} />
              </ChartCard>

              <ChartCard title={l.dailyIncomeTitle} help="dailyIncome" description={l.dailyIncomeSub}>
                <DailyIncomeChart
                  days={dailyIncomeDays}
                  status={dailyIncomeStatus}
                  l={l}
                  lang={lang}
                  onSelectDay={setSelectedDay}
                  onRetry={() => setDailyIncomeRetry(value => value + 1)}
                />
              </ChartCard>

              <ChartCard title={l.dailyTitle} help="daily" description={l.dailySub}>
                <DailySpendingChart
                  days={analysis.daily}
                  averageIncome={analysis.summary.cafeIncomeSummary.averageDaily}
                  incomeByDate={dailyIncomeByDate}
                  l={l}
                  lang={lang}
                  onSelectDay={setSelectedDay}
                />
              </ChartCard>

              {selectedDay && (
                <DayFlowDialog
                  date={selectedDay}
                  entries={analysis.entries}
                  menuItems={state.menuItems}
                  l={l}
                  lang={lang}
                  categoryName={categoryName}
                  onOpenHistory={category => openHistory(category, 'expense', selectedDay, selectedDay)}
                  onClose={() => setSelectedDay(null)}
                />
              )}

              <ChartCard title={l.methodsTitle} help="methods" description={l.methodsSub}>
                <PaymentMethodFlow rows={analysis.summary.cashflow.rows} lang={lang} l={l} />
                <PaymentFeeRatesPanel
                  fees={feesForPeriod.current}
                  status={feesForPeriod.status}
                  periodStart={dateFrom}
                  today={todayExpenseDate()}
                  lang={lang}
                  onSaved={() => setFeeVersion(value => value + 1)}
                  onRetry={() => setFeeVersion(value => value + 1)}
                />
              </ChartCard>
            </section>
          )}
          </>
          )}
        </div>
      </div>
    </AppShell>
    {helpTopic && (
      <HelpDialog
        title={helpTopic.title}
        text={(HELP[lang] || HELP.en)[helpTopic.topic] || HELP.en[helpTopic.topic]}
        closeLabel={l.close}
        onClose={closeHelp}
      />
    )}
    </HelpContext.Provider>
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

function ChartCard({ title, description, children, className = '', help = null }) {
  return (
    <section className={`ws-panel flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="ws-heading">{title}</h3>
        <HelpButton topic={help} title={title} />
      </div>
      <p className="ws-caption mt-0.5">{description}</p>
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </section>
  )
}

function ChangeBadge({ change, goodWhenUp, label, lang }) {
  if (change == null || change === 0) return <span className="ws-caption">— {label}</span>
  const up = change > 0
  const good = up === goodWhenUp
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="ws-caption inline-flex flex-wrap items-center gap-1">
      <span className={`ws-badge ${good ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
        <Icon size={12} />{formatPct(Math.abs(change), lang)}
      </span>
      {label}
    </span>
  )
}

function LabelWithHelp({ label, help, as: Tag = 'p' }) {
  return (
    <Tag className="ws-caption flex items-center gap-0.5">
      <span className="min-w-0">{label}</span>
      {help && <span className="-my-1.5"><HelpButton topic={help} title={label} /></span>}
    </Tag>
  )
}

function TotalTile({ label, value, change, goodWhenUp, vsLabel, tone, help = null, lang }) {
  const tones = { green: 'text-[#1d7a52]', orange: 'text-[#bf4300]', blue: 'text-[#22201d]', red: 'text-[#c4262c]' }
  return (
    <div className="ws-panel">
      <LabelWithHelp label={label} help={help} />
      <p className={`mt-1 whitespace-nowrap text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${tones[tone] || tones.blue}`}><RollingText text={formatCurrency(value)} /></p>
      <div className="mt-2"><ChangeBadge lang={lang} change={change} goodWhenUp={goodWhenUp} label={vsLabel} /></div>
    </div>
  )
}

// Orders, average check and cost of sold items for the picked range, each
// against the previous period of the same length.
function SalesRow({ sales, previous, l, lang }) {
  const tiles = [
    { key: 'orders', icon: ShoppingCart, label: l.ordersCount, value: sales ? String(sales.orderCount) : '—', sub: sales ? fillText(l.ordersCountSub, { n: sales.ordersPerDay }) : '', change: sales && previous ? getPercentChange(sales.orderCount, previous.orderCount) : null, goodWhenUp: true },
    { key: 'check', icon: Receipt, label: l.avgCheck, value: sales?.averageCheck != null ? formatCurrency(sales.averageCheck) : '—', sub: l.avgCheckSub, change: sales?.averageCheck != null && previous?.averageCheck != null ? getPercentChange(sales.averageCheck, previous.averageCheck) : null, goodWhenUp: true },
    { key: 'cost', icon: Package, label: l.costOfSold, value: sales ? formatCurrency(sales.costTotal) : '—', sub: sales?.costPct != null ? fillText(l.costOfSoldSub, { pct: formatPct(sales.costPct, lang) }) : '', change: sales && previous ? getPercentChange(sales.costTotal, previous.costTotal) : null, goodWhenUp: false },
  ]
  return (
    <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
      {tiles.map(tile => (
        <div key={tile.key} className="ws-panel flex h-full flex-col">
          <div className="flex items-start justify-between gap-2">
            <span className="ws-caption">{tile.label}</span>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]"><tile.icon size={15} aria-hidden="true" /></span>
          </div>
          {sales
            ? <p className="mt-1 whitespace-nowrap text-lg font-semibold leading-tight tracking-[-.01em] text-[#22201d] tabular-nums">{tile.value}</p>
            : <Shimmer className="mt-1 h-6 w-28 rounded-md" />}
          <p className="ws-caption mt-1 leading-snug">{sales ? tile.sub : ''}</p>
          {sales && <div className="mt-auto pt-2"><ChangeBadge lang={lang} change={tile.change} goodWhenUp={tile.goodWhenUp} label={l.vsPrevious} /></div>}
        </div>
      ))}
    </div>
  )
}

function Indicator({ icon: Icon, label, value, sub, meter = null, tone = 'orange', help = null }) {
  const barColors = { green: 'bg-[#1d7a52]', orange: 'bg-[#ff5a00]', blue: 'bg-[#2a78d6]', red: 'bg-[#c4262c]', teal: 'bg-[#1baf7a]', purple: 'bg-[#4a3aa7]' }
  const width = meter == null ? null : Math.max(0, Math.min(100, meter))
  return (
    <div className="ws-panel flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <LabelWithHelp label={label} help={help} />
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]"><Icon size={15} /></span>
      </div>
      <p className="mt-1 whitespace-nowrap text-lg font-semibold leading-tight tracking-[-.01em] text-[#22201d] tabular-nums">{value}</p>
      {width != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efece9]" aria-hidden="true">
          <div className={`h-full rounded-full ${barColors[tone] || barColors.orange}`} style={{ width: `${width}%` }} />
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

function signedPct(value, lang) {
  return value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPct(Math.abs(value), lang)}`
}

const SPARK_TONES = { positive: 'text-[#1d7a52]', negative: 'text-[#c4262c]' }

function Sparkline({ values, tone = 'positive', highlightLast = false }) {
  const id = useId().replace(/:/g, '')
  const points = values.filter(value => Number.isFinite(value))
  if (points.length < 2) return null
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const x = index => (index / (points.length - 1)) * 100
  const y = value => 30 - ((value - min) / (max - min || 1)) * 27
  const line = smoothPath(points.map((value, index) => ({ x: x(index), y: y(value) })))
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={`mt-3 h-8 w-full overflow-visible ${SPARK_TONES[tone] || SPARK_TONES.positive}`} aria-hidden="true">
      <ChartGradient id={`spark-${id}`} color="currentColor" opacity={0.18} />
      <path d={`${line}L100,32L0,32Z`} style={{ fill: `url(#spark-${id})` }} />
      <path d={line} fill="none" className="stroke-current" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {highlightLast && <circle cx={x(points.length - 1)} cy={y(points.at(-1))} r={2.5} className="fill-current" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

function GrowthTile({ label, value, valueTone, sub, change, changeLabel, spark, sparkTone, help = null, lang }) {
  return (
    <div className="ws-panel flex h-full flex-col">
      <LabelWithHelp label={label} help={help} />
      <p className={`mt-1 whitespace-nowrap text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${valueTone || 'text-[#22201d]'}`}><RollingValue value={value} /></p>
      {changeLabel != null && <div className="mt-2"><ChangeBadge lang={lang} change={change} goodWhenUp label={changeLabel} /></div>}
      {sub && <p className="ws-caption mt-1 leading-snug">{sub}</p>}
      <div className="mt-auto">{spark && <Sparkline values={spark} tone={sparkTone} highlightLast />}</div>
    </div>
  )
}

function RecordsCard({ overview, l, lang }) {
  const { best, bestTenDay, latest, latestOfBestPct } = overview
  return (
    <ChartCard title={l.recordsTitle} help="records" description={l.recordsSub}>
      <dl className="space-y-3">
        {best && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm font-semibold text-[#22201d]">{l.bestMonth}<span className="block text-xs font-normal text-[#68655f]">{formatMonthYear(best.monthStart, lang, best.monthStart)}</span></dt>
            <dd className="text-right text-sm font-semibold tabular-nums text-[#22201d]">{formatCompactCurrency(best.averageDailyIncome, lang)}<span className="block text-xs font-normal text-[#68655f]">{l.avgPerDay}</span></dd>
          </div>
        )}
        {bestTenDay && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm font-semibold text-[#22201d]">{l.bestTenDay}<span className="block text-xs font-normal text-[#68655f]">{formatLongDate(bestTenDay.weekStart, lang, bestTenDay.weekStart, { includeYear: false })} — {formatLongDate(bestTenDay.weekEnd, lang, bestTenDay.weekEnd)}</span></dt>
            <dd className="text-right text-sm font-semibold tabular-nums text-[#22201d]">{formatCompactCurrency(bestTenDay.averageDailyIncome, lang)}<span className="block text-xs font-normal text-[#68655f]">{l.avgPerDay}</span></dd>
          </div>
        )}
        {latest && latestOfBestPct != null && best && latest.monthStart !== best.monthStart && (
          <div>
            <div className="mb-1 flex justify-between text-xs font-semibold text-[#68655f]">
              <span>{formatMonthYear(latest.monthStart, lang, latest.monthStart)}</span>
              <span className="tabular-nums">{fillText(l.ofRecord, { pct: formatPct(latestOfBestPct, lang) })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#efece9]"><div className="h-full rounded-full bg-[#1d7a52]" style={{ width: `${Math.min(100, latestOfBestPct)}%` }} /></div>
          </div>
        )}
        {latest && best && latest.monthStart === best.monthStart && <p className="ws-badge ws-tone-positive">{l.newRecord}</p>}
      </dl>
    </ChartCard>
  )
}

function StatCell({ label, value, sub, tone, help = null }) {
  return (
    <div className="min-w-0">
      <LabelWithHelp as="dt" label={label} help={help} />
      <dd className={`mt-0.5 text-base font-semibold leading-tight tabular-nums ${tone || 'text-[#22201d]'}`}>{value}</dd>
      {sub && <dd className="ws-caption mt-0.5 leading-snug">{sub}</dd>}
    </div>
  )
}

function InvestorSupportBars({ months, l, lang }) {
  const max = Math.max(...months.map(row => row.amount), 0)
  return (
    <div>
      <p className="ws-caption mb-2">{l.supportByMonth}</p>
      <div className="overflow-x-auto"><div className="flex h-32 items-end gap-1" role="list">
        {months.map(row => {
          const name = formatMonthYear(row.key, lang, row.key)
          return (
            <div key={row.key} role="listitem" className="flex h-full min-w-[60px] flex-1 flex-col items-center justify-end gap-1" title={`${name}: ${formatCurrency(row.amount)}`}>
              {row.amount > 0 && <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#2a78d6]">{formatCompactCurrency(row.amount, lang)}</span>}
              <div className={`w-full max-w-[28px] rounded-t ${row.amount > 0 ? 'bg-[#2a78d6]' : 'bg-[#efece9]'}`} style={{ height: row.amount > 0 && max > 0 ? `${Math.max(6, (row.amount / max) * 80)}%` : '3px' }} />
              <span className="text-xs text-[#68655f]">{name.slice(0, 3)}</span>
              <span className="sr-only">{formatCurrency(row.amount)}</span>
            </div>
          )
        })}
      </div></div>
    </div>
  )
}

// Investor support first on Overall: what was put in, how much the cafe has
// paid back, when the money came and how much of the spending it carried.
function InvestorSupportPanel({ investor, payback, status, l, lang }) {
  let body
  if (status === 'loading') {
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3"><Shimmer className="h-4 w-40" /><Shimmer className="h-9 w-64" /><Shimmer className="h-2.5 w-full" /><Shimmer className="h-10 w-full" /></div>
        <Shimmer className="h-32 w-full rounded-xl" />
      </div>
    )
  } else if (status === 'missing') body = <p className="ws-caption">{l.migrationNeeded}</p>
  else if (status === 'error') body = <p className="ws-caption">{l.growthFailed}</p>
  else if (!investor) body = <p className="ws-caption">{l.noInvestment}</p>
  else {
    const note = !payback ? '' : payback.monthsLeft === 0 ? l.paidOff
      : payback.monthsLeft == null ? l.noPace
        : fillText(l.monthsLeft, { n: payback.monthsLeft })
    const n = investor.monthCount
    body = (
      <>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-3">
            <div>
              <p className="ws-caption">{investor.firstMonth ? fillText(l.investedSince, { month: formatMonthYear(investor.firstMonth, lang, investor.firstMonth) }) : l.investedTotal}</p>
              <p className="mt-1 whitespace-nowrap text-[clamp(28px,2.6vw,38px)] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#2a78d6]"><RollingText text={formatCurrency(investor.invested)} /></p>
            </div>
            {payback && (
              <>
                <div>
                  <div className="mb-1 flex justify-between gap-2 text-xs font-semibold text-[#68655f]">
                    <span>{formatPct(payback.paidBackPct, lang)} {l.paidBack}</span>
                    <span className="tabular-nums">{l.stillToRecover}: {formatCompactCurrency(payback.remaining, lang)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#efece9]"><div className="h-full rounded-full bg-[#1d7a52]" style={{ width: `${payback.paidBackPct}%` }} /></div>
                </div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatCell help="generated" label={l.generated} value={formatCompactCurrency(payback.generated, lang)} tone={payback.generated < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'} />
                  <StatCell label={l.stillToRecover} value={formatCompactCurrency(payback.remaining, lang)} />
                  {payback.monthlyPace != null && <StatCell help="pace" label={l.pace} value={formatCompactCurrency(payback.monthlyPace, lang)} tone={payback.monthlyPace < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'} />}
                </dl>
                <p className="ws-caption">{note}</p>
              </>
            )}
          </div>
          <InvestorSupportBars months={investor.months} l={l} lang={lang} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[#efece9] pt-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCell label={l.thisMonthSupport} value={investor.thisMonth > 0 ? formatCompactCurrency(investor.thisMonth, lang) : l.noneLabel} />
          <StatCell label={fillText(l.recentSupport, { n })} value={formatCompactCurrency(investor.recentTotal, lang)} sub={`${l.supportedMonths}: ${investor.supportedMonthCount} ${fillText(l.ofMonths, { n })}`} />
          <StatCell label={l.lastSupport} value={investor.last ? formatCompactCurrency(investor.last.amount, lang) : '—'} sub={investor.last ? formatMonthYear(investor.last.key, lang, investor.last.key) : ''} />
          <StatCell label={l.averagePerMonth} value={investor.averagePerSupportedMonth == null ? '—' : formatCompactCurrency(investor.averagePerSupportedMonth, lang)} sub={investor.largest ? `${l.largestSupport}: ${formatMonthYear(investor.largest.key, lang, investor.largest.key)}` : ''} />
          <StatCell help="shareOfSpending" label={l.shareOfSpending} value={formatPct(investor.shareOfSpendingPct, lang)} sub={fillText(l.shareOfSpendingSub, { n })} />
          <StatCell
            label={l.shortfallTitle}
            help="shortfall"
            value={formatCompactCurrency(investor.shortfall, lang)}
            tone={investor.shortfall > 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'}
            sub={investor.shortfall > 0 ? fillText(l.shortfallCovered, { pct: formatPct(investor.shortfallCoveredPct, lang) }) : l.noShortfall}
          />
        </dl>
      </>
    )
  }
  return (
    <section aria-labelledby="analysis-investor-heading" className="ws-panel border-l-4 border-l-[#2a78d6]">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#e8f0fb] text-[#2a78d6]"><HandCoins size={17} aria-hidden="true" /></span>
        <div>
          <h3 id="analysis-investor-heading" className="ws-heading flex items-center gap-1">{l.investorTitle}<HelpButton topic="investor" title={l.investorTitle} /></h3>
          <p className="ws-caption mt-0.5">{l.investorSub}</p>
        </div>
      </div>
      {body}
    </section>
  )
}

function PeriodTotalsCard({ totals, l, lang }) {
  const n = totals.monthCount
  const month = row => formatMonthYear(row.key, lang, row.key)
  return (
    <ChartCard title={fillText(l.totalsTitle, { n })} help="totals" description={l.totalsSub}>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCell label={l.cafeIncome} value={formatCompactCurrency(totals.cafeIncome, lang)} sub={`${l.orders}: ${formatCompactCurrency(totals.orderCount, lang)} · ${l.avgCheck}: ${totals.averageCheck == null ? '—' : formatCompactCurrency(totals.averageCheck, lang)}`} />
        <StatCell label={l.grossProfit} value={formatCompactCurrency(totals.grossProfit, lang)} sub={fillText(l.marginOf, { pct: formatPct(totals.grossMarginPct, lang) })} />
        <StatCell label={l.spent} value={formatCompactCurrency(totals.spent, lang)} tone="text-[#bf4300]" sub={`${l.avgMonthlySpend}: ${formatCompactCurrency(totals.averageMonthlySpent, lang)}`} />
        <StatCell label={l.resultLabel} value={formatCompactCurrency(totals.left, lang)} tone={trendTone(totals.left)} sub={fillText(l.marginOf, { pct: formatPct(totals.leftMarginPct, lang) })} />
        <StatCell label={l.salaries} value={formatCompactCurrency(totals.salaries, lang)} sub={`${l.salaryShare}: ${formatPct(totals.salaryShareOfSpendingPct, lang)}`} />
        <StatCell
          label={l.profitableMonths}
          value={`${totals.profitableMonths} / ${totals.completedMonths}`}
          sub={totals.bestMonth && totals.worstMonth ? `${l.bestResult}: ${month(totals.bestMonth)} · ${l.worstResult}: ${month(totals.worstMonth)}` : ''}
        />
      </dl>
    </ChartCard>
  )
}

function BreakEvenCard({ summary, l, lang }) {
  if (!summary) return <ChartCard title={l.breakEven} description={l.breakEvenSub} help="breakEven"><p className="ws-caption">{l.noTarget}</p></ChartCard>
  const reached = summary.dailyGap <= 0
  return (
    <ChartCard title={l.breakEven} description={l.breakEvenSub} help="breakEven">
      <div className="space-y-3">
        <p className={`text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${reached ? 'text-[#1d7a52]' : 'text-[#c4262c]'}`}>{fillText(l.ofTarget, { pct: formatPct(summary.coveragePct, lang) })}</p>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#efece9]"><div className={`h-full rounded-full ${reached ? 'bg-[#1d7a52]' : 'bg-[#ff5a00]'}`} style={{ width: `${Math.min(100, summary.coveragePct || 0)}%` }} /></div>
        <dl className="grid grid-cols-3 gap-3">
          <StatCell label={l.avgPerDay} value={formatCompactCurrency(summary.latestDaily, lang)} sub={formatMonthYear(summary.latestMonth, lang, summary.latestMonth)} />
          <StatCell label={l.targetPerDay} value={formatCompactCurrency(summary.target, lang)} />
          <StatCell label={l.monthsAboveTarget} value={`${summary.monthsAbove} / ${summary.completedMonths}`} />
        </dl>
        <p className="ws-caption">{fillText(reached ? l.abovePerDay : l.shortPerDay, { amount: formatCompactCurrency(Math.abs(summary.dailyGap), lang) })}</p>
      </div>
    </ChartCard>
  )
}

// Every month as one statement line, newest first, with a total row. Investor
// support sits in its own column so it never reads as income.
function MonthlyStatementTable({ rows, totals, l, lang }) {
  const ordered = [...rows].reverse()
  const cell = 'py-2 px-3 text-right tabular-nums whitespace-nowrap'
  const columns = [l.cafeIncome, l.otherIncome, l.costOfSold, l.grossProfit, l.spent, l.salaries, l.resultLabel, l.grossMargin, l.investorSupport]
  const line = row => [
    [formatCompactCurrency(row.cafeIncome, lang)],
    [formatCompactCurrency(row.otherIncome, lang)],
    [formatCompactCurrency(row.salesCost, lang)],
    [formatCompactCurrency(row.grossProfit, lang)],
    [formatCompactCurrency(row.spent, lang), 'text-[#bf4300]'],
    [formatCompactCurrency(row.salaries, lang)],
    [formatCompactCurrency(row.left, lang), `font-semibold ${trendTone(row.left)}`],
    [formatPct(row.grossMarginPct, lang)],
    [row.investorSupport > 0 ? formatCompactCurrency(row.investorSupport, lang) : '—', row.investorSupport > 0 ? 'font-semibold text-[#2a78d6]' : 'text-[#68655f]'],
  ]
  return (
    <ChartCard title={l.statementTitle} help="statement" description={l.statementSub}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#e4e1de] text-xs text-[#68655f]">
              <th scope="col" className="py-2 px-3 text-left font-semibold">{l.trendPeriod}</th>
              {columns.map(label => <th key={label} scope="col" className="py-2 px-3 text-right font-semibold">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {ordered.map(row => (
              <tr key={row.key} className="border-b border-[#efece9] text-[#22201d]">
                <th scope="row" className="py-2 px-3 text-left font-semibold whitespace-nowrap">
                  {formatMonthYear(row.key, lang, row.key)}
                  {row.days < daysInMonth(row.dateFrom) && <span className="ml-1 text-xs font-normal text-[#68655f]">({l.soFar})</span>}
                </th>
                {line(row).map(([value, tone], column) => <td key={column} className={`${cell} ${tone || ''}`}>{value}</td>)}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="border-t-2 border-[#e4e1de] font-semibold text-[#22201d]">
                <th scope="row" className="py-2 px-3 text-left">{l.total}</th>
                {line(totals).map(([value, tone], column) => <td key={column} className={`${cell} ${tone || ''}`}>{value}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ChartCard>
  )
}

// Where the money goes, month after month: one stacked bar per month by the
// largest categories, then each category's monthly average, share and latest.
function MonthlySpendingCard({ spending, status, l, lang, categoryName, onRetry }) {
  const label = key => (key === 'salaries' ? l.salaries : categoryName(key))
  let body
  if (status === 'loading') body = <div className="space-y-3"><Shimmer className="h-40 w-full rounded-xl" /><Shimmer className="h-24 w-full" /></div>
  else if (status === 'missing') body = <p className="ws-caption">{l.breakdownMigrationNeeded}</p>
  else if (status === 'error') {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ws-caption">{l.growthFailed}</p>
        <button type="button" onClick={onRetry} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>
      </div>
    )
  } else if (!spending) body = <p className="ws-caption">{l.empty}</p>
  else {
    const max = Math.max(...spending.months.map(month => month.total), 1)
    const colorOf = Object.fromEntries(spending.categories.map(category => [category.key, category.color]))
    const top = spending.categories[0]
    const cell = 'py-2 px-3 text-right tabular-nums whitespace-nowrap'
    body = (
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCell label={l.avgMonthlySpend} value={formatCompactCurrency(spending.averageMonthly, lang)} tone="text-[#bf4300]" sub={fillText(l.overCompleted, { n: spending.completedCount })} />
          {top && <StatCell label={l.biggestCost} value={label(top.key)} sub={`${formatPct(top.sharePct, lang)} · ${l.avgPerMonthShort}: ${formatCompactCurrency(top.averagePerMonth, lang)}`} />}
          <StatCell label={fillText(l.spentInMonths, { n: spending.months.length })} value={formatCompactCurrency(spending.total, lang)} />
        </dl>
        <div>
          <div className="overflow-x-auto"><div className="flex h-44 items-end gap-1.5 sm:gap-3" role="list">
            {spending.months.map(month => {
              const name = formatMonthYear(month.key, lang, month.key)
              return (
                <div key={month.key} role="listitem" className="flex h-full min-w-[60px] flex-1 flex-col items-center justify-end gap-1" title={`${name}: ${formatCurrency(month.total)}`}>
                  <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#68655f]">{month.total > 0 ? formatCompactCurrency(month.total, lang) : ''}</span>
                  <div className="flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-t" style={{ height: `${Math.max(month.total > 0 ? 4 : 0, (month.total / max) * 82)}%` }}>
                    {month.parts.map(part => <div key={part.key} style={{ height: `${(part.amount / month.total) * 100}%`, backgroundColor: colorOf[part.key] }} />)}
                  </div>
                  <span className="text-xs text-[#68655f]">{name.slice(0, 3)}</span>
                  <span className="sr-only">{month.parts.map(part => `${label(part.key)} ${formatCurrency(part.amount)}`).join(', ')}</span>
                </div>
              )
            })}
          </div></div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#68655f]">
            {spending.categories.map(category => (
              <li key={category.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: category.color }} />{label(category.key)}</li>
            ))}
          </ul>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#e4e1de] text-xs text-[#68655f]">
                <th scope="col" className="py-2 px-3 text-left font-semibold">{l.category}</th>
                <th scope="col" className="py-2 px-3 text-right font-semibold">{l.avgPerMonthShort}</th>
                <th scope="col" className="py-2 px-3 text-right font-semibold">{l.shareShort}</th>
                <th scope="col" className="py-2 px-3 text-right font-semibold">{l.thisMonthSoFar}</th>
                <th scope="col" className="py-2 px-3 text-right font-semibold">{l.lastMonthShort}</th>
                <th scope="col" className="py-2 px-3 text-right font-semibold">{l.total}</th>
              </tr>
            </thead>
            <tbody>
              {spending.categories.map(category => (
                <tr key={category.key} className="border-b border-[#efece9] text-[#22201d]">
                  <th scope="row" className="py-2 px-3 text-left font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: category.color }} />{label(category.key)}</th>
                  <td className={`${cell} font-semibold`}>{formatCompactCurrency(category.averagePerMonth, lang)}</td>
                  <td className={cell}>
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[#efece9] sm:inline-block"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, category.sharePct || 0)}%`, backgroundColor: category.color }} /></span>
                      {formatPct(category.sharePct, lang)}
                    </span>
                  </td>
                  <td className={`${cell} ${category.current > category.averagePerMonth ? 'text-[#c4262c]' : ''}`}>{formatCompactCurrency(category.current, lang)}</td>
                  <td className={cell}>{category.previous == null ? '—' : formatCompactCurrency(category.previous, lang)}</td>
                  <td className={cell}>{formatCompactCurrency(category.total, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
  return <ChartCard title={l.spendingTitle} description={l.spendingSub} help="spending">{body}</ChartCard>
}

const INCOME_SOURCE_COLORS = {
  regular: '#1baf7a',
  tourist: '#eb6834',
  take_away: '#eda100',
  delivery: '#e87ba4',
  game_club: '#4a3aa7',
  other_income: '#008300',
  investor_support: '#2a78d6',
}

function incomeSourceLabel(key, l) {
  return {
    regular: l.srcRegular,
    tourist: l.srcTourist,
    take_away: l.srcTakeAway,
    delivery: l.srcDelivery,
    game_club: l.srcGameClub,
    other_income: l.otherIncome,
    investor_support: l.investorSupport,
  }[key] || key
}

function IncomeSourcesChart({ sources, hidden, l, lang }) {
  const [wrapRef, width] = useElementWidth()
  const [active, setActive] = useState(null)
  const height = CHART.height.compact + 20
  const shown = sources.series.filter(row => !hidden.has(row.key))
  const count = sources.months.length
  const scale = niceTicks(0, Math.max(1, ...shown.flatMap(row => sources.months.map(month => month.values[row.key]))), 4)
  const compact = value => formatCompactCurrency(value, lang)
  const pad = { top: 16, right: 16, bottom: 30, left: Math.max(44, Math.max(...scale.ticks.map(tick => compact(tick).length)) * 7 + 14) }
  const innerWidth = Math.max(0, width - pad.left - pad.right)
  const innerHeight = height - pad.top - pad.bottom
  const x = index => pad.left + (count > 1 ? (index / (count - 1)) * innerWidth : innerWidth / 2)
  const y = value => pad.top + innerHeight - ((value - scale.min) / (scale.max - scale.min || 1)) * innerHeight
  const indexAt = event => {
    const box = event.currentTarget.getBoundingClientRect()
    const index = count > 1 ? Math.round(((event.clientX - box.left - pad.left) / (innerWidth || 1)) * (count - 1)) : 0
    return index >= 0 && index < count ? index : null
  }
  const month = active == null ? null : sources.months[active]
  return (
    <div ref={wrapRef} className="ws-chart relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block touch-pan-y"
          role="img"
          aria-label={l.incomeSourcesTitle}
          onPointerMove={event => setActive(indexAt(event))}
          onPointerDown={event => setActive(indexAt(event))}
          onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null) }}
        >
          <ChartGrid ticks={scale.ticks} y={y} left={pad.left} right={width - pad.right} format={compact} />
          {sources.months.map((item, index) => (
            <text key={item.key} x={x(index)} y={height - 10} textAnchor="middle" className={`ws-chart-tick ${active === index ? 'ws-chart-tick-active' : ''}`}>{formatMonthYear(item.key, lang, item.key).slice(0, 3)}</text>
          ))}
          {active != null && <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerHeight} className="ws-chart-baseline" strokeDasharray={CHART.gridDash} />}
          <g className="ws-chart-fade">
            {shown.map(row => (
              <path
                key={row.key}
                d={smoothPath(sources.months.map((item, index) => ({ x: x(index), y: y(item.values[row.key]) })))}
                fill="none"
                style={{ stroke: INCOME_SOURCE_COLORS[row.key] }}
                strokeWidth={CHART.lineWidth}
                strokeDasharray={row.key === 'investor_support' ? CHART_DASH.average : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
          {active != null && shown.map(row => <ChartDot key={row.key} cx={x(active)} cy={y(month.values[row.key])} color={INCOME_SOURCE_COLORS[row.key]} />)}
        </svg>
      )}
      {month && (
        <ChartTooltip
          x={x(active)}
          width={width}
          title={formatMonthYear(month.key, lang, month.key)}
          rows={[...shown].sort((first, second) => month.values[second.key] - month.values[first.key]).map(row => ({
            key: row.key,
            label: incomeSourceLabel(row.key, l),
            color: INCOME_SOURCE_COLORS[row.key],
            kind: 'line',
            dash: row.key === 'investor_support' ? CHART_DASH.average : undefined,
            value: compact(month.values[row.key]),
          }))}
        />
      )}
      {!(width > 0) && <div style={{ height }} />}
    </div>
  )
}

// How money comes in month after month, one line per source: Regular dine-in,
// Tourist, take-away, delivery, game club, other income and investor support.
function IncomeSourcesCard({ sources, status, l, lang, onRetry }) {
  const [hidden, setHidden] = useState(() => new Set())
  let body
  if (status === 'loading') body = <div className="space-y-3"><Shimmer className="h-[240px] w-full rounded-xl" /><Shimmer className="h-24 w-full" /></div>
  else if (status === 'missing') body = <p className="ws-caption">{l.breakdownMigrationNeeded}</p>
  else if (status === 'error') {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ws-caption">{l.growthFailed}</p>
        <button type="button" onClick={onRetry} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>
      </div>
    )
  } else if (!sources) body = <p className="ws-caption">{l.empty}</p>
  else {
    const earnedSeries = sources.series.filter(row => row.key !== 'investor_support')
    const top = earnedSeries.reduce((best, row) => (!best || row.total > best.total ? row : best), null)
    const tourist = sources.series.find(row => row.key === 'tourist')
    const cell = 'py-2 px-3 text-right tabular-nums whitespace-nowrap'
    const toggle = key => setHidden(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    body = (
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCell label={l.avgIncomeMonth} value={formatCompactCurrency(sources.averageMonthly, lang)} tone="text-[#1d7a52]" sub={fillText(l.overCompleted, { n: sources.completedCount })} />
          {top && <StatCell label={l.biggestSource} value={incomeSourceLabel(top.key, l)} sub={`${formatPct(top.sharePct, lang)} · ${l.avgPerMonthShort}: ${formatCompactCurrency(top.averagePerMonth, lang)}`} />}
          <StatCell label={l.touristShare} value={formatPct(tourist?.sharePct ?? 0, lang)} sub={tourist?.averageCheck != null ? `${l.avgCheck}: ${formatCompactCurrency(tourist.averageCheck, lang)}` : ''} />
        </dl>
        <div>
          <ChartLegend
            label={l.chartLegend}
            items={sources.series.map(row => ({ key: row.key, label: incomeSourceLabel(row.key, l), color: INCOME_SOURCE_COLORS[row.key], kind: 'line', dash: row.key === 'investor_support' ? CHART_DASH.average : undefined }))}
            hidden={hidden}
            onToggle={toggle}
          />
          <IncomeSourcesChart sources={sources} hidden={hidden} l={l} lang={lang} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#e4e1de] text-xs text-[#68655f]">
                {[l.sourceLabel, l.avgPerMonthShort, l.shareShort, l.orders, l.avgCheck, l.thisMonthSoFar, l.lastMonthShort, l.total].map((label, index) => (
                  <th key={label} scope="col" className={`py-2 px-3 font-semibold ${index === 0 ? 'text-left' : 'text-right'}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.series.map(row => (
                <tr key={row.key} className="border-b border-[#efece9] text-[#22201d]">
                  <th scope="row" className="py-2 px-3 text-left font-semibold whitespace-nowrap"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: INCOME_SOURCE_COLORS[row.key] }} />{incomeSourceLabel(row.key, l)}</th>
                  <td className={`${cell} font-semibold`}>{formatCompactCurrency(row.averagePerMonth, lang)}</td>
                  <td className={cell}>{row.sharePct == null ? '—' : formatPct(row.sharePct, lang)}</td>
                  <td className={cell}>{row.orders > 0 ? formatCompactCurrency(row.orders, lang) : '—'}</td>
                  <td className={cell}>{row.averageCheck == null ? '—' : formatCompactCurrency(row.averageCheck, lang)}</td>
                  <td className={cell}>{formatCompactCurrency(row.current, lang)}</td>
                  <td className={cell}>{row.previous == null ? '—' : formatCompactCurrency(row.previous, lang)}</td>
                  <td className={cell}>{formatCompactCurrency(row.total, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
  return <ChartCard title={l.incomeSourcesTitle} description={l.incomeSourcesSub} help="incomeSources">{body}</ChartCard>
}

// Actual owner profit from closed months (frozen at close), with finished
// months still waiting to be closed listed so nothing reads as final early.
function OwnerProfitCard({ overview, status, l, lang, onOpen }) {
  const open = <button type="button" onClick={onOpen} className="ws-btn ws-btn-outline ws-btn-sm">{l.openOwnerProfit}</button>
  let body
  if (status === 'loading') body = <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"><div className="space-y-3"><Shimmer className="h-4 w-32" /><Shimmer className="h-8 w-48" /><Shimmer className="h-10 w-full" /></div><Shimmer className="h-28 w-full rounded-xl" /></div>
  else if (status === 'error') body = <p className="ws-caption">{l.ownerProfitFailed}</p>
  else if (!overview || !overview.count) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ws-caption">{overview?.pending?.length ? fillText(l.ownerProfitNoneClosed, { n: overview.pending.length }) : l.empty}</p>
        {open}
      </div>
    )
  } else {
    const max = Math.max(...overview.months.map(row => Math.abs(row.ownerProfit)), 1)
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="ws-caption">{fillText(l.ownerProfitTotal, { n: overview.count })}</p>
            <p className={`mt-1 whitespace-nowrap text-[clamp(26px,2.4vw,34px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${trendTone(overview.total)}`}><RollingText text={formatCurrency(overview.total)} /></p>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCell label={l.avgPerMonthShort} value={formatCompactCurrency(overview.average, lang)} tone={trendTone(overview.average)} sub={fillText(l.marginOf, { pct: formatPct(overview.marginPct, lang) })} />
            <StatCell label={l.profitableMonths} value={`${overview.profitableCount} / ${overview.count}`} />
            {overview.best && <StatCell label={l.bestResult} value={formatCompactCurrency(overview.best.ownerProfit, lang)} sub={formatMonthYear(overview.best.monthStart, lang, overview.best.monthStart)} />}
          </dl>
          {overview.pending.length > 0 && <p className="ws-notice text-xs">{fillText(l.ownerProfitPending, { months: overview.pending.map(month => formatMonthYear(month, lang, month)).join(', ') })}</p>}
          {open}
        </div>
        <div>
          <p className="ws-caption mb-2">{l.ownerProfitByMonth}</p>
          <ul className="space-y-2">
            {[...overview.months].reverse().map(row => (
              <li key={row.key} className="grid grid-cols-[96px_minmax(0,1fr)_72px] items-center gap-3 text-xs">
                <span className="truncate font-semibold text-[#22201d]">{formatMonthYear(row.monthStart, lang, row.monthStart)}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-[#efece9]"><span className={`block h-full rounded-full ${row.ownerProfit >= 0 ? 'bg-[#1d7a52]' : 'bg-[#c4262c]'}`} style={{ width: `${Math.max(2, (Math.abs(row.ownerProfit) / max) * 100)}%` }} /></span>
                <span className={`text-right font-semibold tabular-nums ${trendTone(row.ownerProfit)}`}>{formatCompactCurrency(row.ownerProfit, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }
  return <ChartCard title={l.ownerProfitTitle} description={l.ownerProfitSub} help="ownerProfit">{body}</ChartCard>
}

function daysInMonth(monthStart) {
  const [year, month] = monthStart.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function UnitEconomicsTable({ months, profitRows, l, lang }) {
  const marginByMonth = Object.fromEntries((profitRows || []).map(row => [row.dateFrom, row.grossMarginPct]))
  const rows = [...months].reverse()
  const cell = 'whitespace-nowrap py-2 px-3 text-right tabular-nums'
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[#e4e1de] text-xs text-[#68655f]">
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
                <td className={`${cell} ${trendTone(checkMove)}`}>{row.averageCheck == null ? '—' : formatCompactCurrency(row.averageCheck, lang)}{arrow(checkMove)}</td>
                {profitRows && <td className={`${cell} ${trendTone(marginMove)}`}>{formatPct(margin, lang)}{arrow(marginMove)}</td>}
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
function GrowthSection({ growth, overview, profitRows, periodTotals, breakEven, l, lang, onRetry }) {
  if (growth.status === 'loading' && !overview) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label={l.loading}>
        {[0, 1, 2, 3].map(index => <div key={index} className="ws-panel space-y-3"><Shimmer className="h-3 w-24" /><Shimmer className="h-7 w-40" /><Shimmer className="h-8 w-full" /></div>)}
      </div>
    )
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
          lang={lang}
          label={l.avgSalesPerDay}
          help="avgSalesPerDay"
          value={latest ? formatCurrency(latest.averageDailyIncome) : '—'}
          valueTone={trendTone(overview.vsPreviousPct)}
          change={overview.vsPreviousPct}
          changeLabel={previous ? fillText(l.vsMonth, { month: formatMonthYear(previous.monthStart, lang, previous.monthStart) }) : l.vsPrevious}
          sub={overview.latestIsCurrent ? `${latestName} · ${latest.dayCount} ${l.days}` : latestName}
          spark={averages}
          sparkTone={overview.vsPreviousPct < 0 ? 'negative' : 'positive'}
        />
        <GrowthTile
          lang={lang}
          label={l.threeMonthGrowth}
          help="threeMonthGrowth"
          value={signedPct(overview.vsThreeAgoPct, lang)}
          valueTone={trendTone(overview.vsThreeAgoPct)}
          sub={threeAgo ? fillText(l.vsMonth, { month: formatMonthYear(threeAgo.monthStart, lang, threeAgo.monthStart) }) : ''}
          spark={averages.slice(-4)}
          sparkTone={overview.vsThreeAgoPct < 0 ? 'negative' : 'positive'}
        />
        <GrowthTile
          lang={lang}
          label={l.monthlyGrowth}
          help="monthlyGrowth"
          value={overview.monthlyGrowthPct == null ? '—' : `${signedPct(overview.monthlyGrowthPct, lang)} ${l.perMonth}`}
          valueTone={trendTone(overview.monthlyGrowthPct)}
          sub={overview.monthlyGrowthPct == null ? '' : fillText(l.overMonths, { n: overview.monthlyGrowthSpan })}
          spark={months.filter(row => row.isFinalized).map(row => row.averageDailyIncome)}
          sparkTone={overview.monthlyGrowthPct < 0 ? 'negative' : 'positive'}
        />
        <GrowthTile
          lang={lang}
          label={l.ordersPerDay}
          help="ordersPerDay"
          value={latest ? String(latest.ordersPerDay) : '—'}
          valueTone={trendTone(overview.ordersPerDayChangePct)}
          change={overview.ordersPerDayChangePct}
          changeLabel={previous ? fillText(l.vsMonth, { month: formatMonthYear(previous.monthStart, lang, previous.monthStart) }) : l.vsPrevious}
          sub={latest?.averageCheck != null ? (
            <>{l.avgCheck}: {formatCompactCurrency(latest.averageCheck, lang)} <span className={`font-semibold ${trendTone(overview.averageCheckChangePct)}`}>({signedPct(overview.averageCheckChangePct, lang)})</span></>
          ) : ''}
          spark={months.map(row => row.ordersPerDay)}
          sparkTone={overview.ordersPerDayChangePct < 0 ? 'negative' : 'positive'}
        />
      </div>

      {cashflowStatus === 'ready' && periodTotals && <PeriodTotalsCard totals={periodTotals} l={l} lang={lang} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <RecordsCard overview={overview} l={l} lang={lang} />
        <BreakEvenCard summary={breakEven} l={l} lang={lang} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title={l.profitTitle} help="profit" description={l.profitSub}>
          {cashflowStatus === 'ready'
            ? <TrendChart rows={profitRows} styleKey="totals" interval="month" breakEvenFor={null} l={l} lang={lang} />
            : cashflowStatus === 'loading'
              ? <Shimmer className="h-40 w-full rounded-xl" />
              : <p className="ws-caption py-6">{cashflowStatus === 'missing' ? l.migrationNeeded : l.growthFailed}</p>}
        </ChartCard>
        <ChartCard title={l.unitTitle} help="unit" description={l.unitSub}>
          <UnitEconomicsTable months={months} profitRows={cashflowStatus === 'ready' ? profitRows : null} l={l} lang={lang} />
        </ChartCard>
      </div>

      {cashflowStatus === 'ready' && profitRows.length > 0 && <MonthlyStatementTable rows={profitRows} totals={periodTotals} l={l} lang={lang} />}
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

// Chart-shaped placeholder while the trend buckets load (never a spinner for data).
const TREND_SHIMMER_BARS = ['h-[45%]', 'h-[70%]', 'h-[55%]', 'h-[85%]', 'h-[60%]', 'h-[75%]', 'h-[40%]', 'h-[65%]']

function TrendShimmer({ label }) {
  return (
    <div role="status" aria-busy="true" className="flex h-[300px] items-end gap-2">
      <span className="sr-only">{label}</span>
      {TREND_SHIMMER_BARS.map((height, index) => <Shimmer key={index} className={`min-w-0 flex-1 rounded-t ${height}`} />)}
    </div>
  )
}

// Money flow in the personal-finance Reports layout: Breakdown (Sankey or a
// profit and loss table) and Trends (income and spending per day, week or month).
function MoneyFlowCard({
  l, lang, analysis, categoryName, onOpenHistory, onOpenIncomeHistory,
  mode, onMode, view, onView, pnlBreakdown, onPnlBreakdown,
  trendStyle, onTrendStyle, intervals, interval, onInterval, trendRows, trendStatus, onTrendRetry, breakEvenFor,
}) {
  const intervalLabels = { day: l.intervalDay, week: l.intervalWeek, decade: l.intervalDecade, month: l.intervalMonth }
  return (
    <section className="ws-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ws-heading flex items-center gap-1">{l.flowTitle}<HelpButton topic="flow" title={l.flowTitle} /></h3>
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
            <div role="alert" className="flex flex-col items-center gap-3 py-10 text-sm font-medium text-[#68655f]">
              <p>{l.trendsFailed}</p>
              <button type="button" className="ws-btn ws-btn-outline" onClick={onTrendRetry}><RefreshCw size={14} aria-hidden="true" />{l.retry}</button>
            </div>
          ) : !trendRows ? (
            <TrendShimmer label={l.loading} />
          ) : (
            trendStyle === 'table'
              ? <TrendTable rows={trendRows} interval={interval} breakEvenFor={breakEvenFor} l={l} lang={lang} />
              : <TrendChart rows={trendRows} styleKey={trendStyle} interval={interval} breakEvenFor={breakEvenFor} l={l} lang={lang} />
          )
        ) : view === 'pnl' ? (
          <ProfitLossTable pnl={analysis.pnl} breakdown={pnlBreakdown} l={l} lang={lang} categoryName={categoryName} onOpenHistory={onOpenHistory} onOpenIncomeHistory={onOpenIncomeHistory} />
        ) : (
          <SankeyChart
            lang={lang}
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
  if (!pnl.incomeTotal && !pnl.expenseTotal) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{l.empty}</p>

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
              <button type="button" className="-ml-1 rounded p-0.5 text-[#68655f] hover:bg-[#efece9]" aria-expanded={!isClosed} aria-label={`${isClosed ? l.showSection : l.hideSection}: ${label}`} onClick={() => toggle(key)}>
                <ChevronDown size={15} className={`transition-transform ${isClosed ? '-rotate-90' : ''}`} aria-hidden="true" />
              </button>
            )}
            {onOpen ? (
              <button type="button" className="text-left hover:underline" title={l.openHistory} onClick={onOpen}>{label}</button>
            ) : label}
          </span>
        </th>
        <td className={`whitespace-nowrap py-2.5 pr-3 text-right text-[13px] tabular-nums ${tone === 'negative' ? 'text-[#c4262c]' : tone === 'positive' ? 'text-[#1d7a52]' : ''}`}>
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
          <tr className="border-b border-[#e4e1de] text-xs text-[#68655f]">
            <th scope="col" className="py-2 pl-3 text-left font-semibold">{l.lineItem}</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">{l.amount}</th>
          </tr>
        </thead>
        <tbody>
          {pnl.gross && (
            <>
              {row({ key: 'gross', label: `${l.grossProfit}${pnl.gross.marginPct == null ? '' : ` · ${formatPct(pnl.gross.marginPct, lang)}`}`, amount: Math.abs(pnl.gross.profit), level: 0, kind: 'total', section: true, tone: pnl.gross.profit < 0 ? 'negative' : undefined })}
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
function TrendChart({ rows, styleKey, interval, breakEvenFor, l, lang }) {
  const [hidden, setHidden] = useState([])
  if (!rows.length || rows.every(row => !row.income && !row.spent)) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{l.empty}</p>

  const stacked = styleKey === 'groups'
  const seriesLabels = { income: l.moneyIn, spent: l.spent, left: l.left, salaries: l.salaries, bazaar: l.bazaar, meals: l.meals, other: l.otherSpend, breakEven: l.breakEven }
  const series = stacked
    ? [...SPENDING_GROUPS.map(key => ({ key, color: GROUP_COLORS[key] })), { key: 'income', color: '#16a34a', line: true }]
    : [...TREND_TOTAL_SERIES, ...(breakEvenFor && rows.some(row => breakEvenFor(row.dateFrom, row.dateTo) > 0) ? [{ key: 'breakEven', color: '#e34948', marker: true }] : [])]
  // The average daily break-even target of each bucket's days, scaled to its length, as a mark over its bars.
  const breakEvenOf = row => (breakEvenFor ? breakEvenFor(row.dateFrom, row.dateTo) * row.days : 0)
  const visible = series.filter(item => !hidden.includes(item.key))
  const bars = visible.filter(item => !item.line && !item.marker)
  const incomeLine = visible.find(item => item.line)
  const breakEvenMark = visible.find(item => item.marker)
  const toggle = key => setHidden(list => (list.includes(key) ? list.filter(item => item !== key) : [...list, key]))
  const kindOf = item => (item.line || item.marker ? 'line' : 'bar')
  const dashOf = item => (item.marker ? CHART_DASH.target : item.line ? CHART_DASH.average : undefined)
  const compact = value => formatCompactCurrency(value, lang)

  return (
    <div>
      <ChartLegend
        label={l.chartLegend}
        items={series.map(item => ({ key: item.key, label: seriesLabels[item.key], color: item.color, kind: kindOf(item), dash: dashOf(item) }))}
        hidden={hidden}
        onToggle={toggle}
      />
      <BarChart
        rows={rows}
        rowKey={row => row.key}
        series={bars}
        stacked={stacked}
        lang={lang}
        height={CHART.height.tall}
        minSlot={28}
        labelGap={64}
        lines={incomeLine ? [{ key: 'income', color: incomeLine.color, values: rows.map(row => row.income), dash: CHART_DASH.average, dots: true }] : []}
        markers={breakEvenMark ? [{ key: 'breakEven', color: breakEvenMark.color, values: rows.map(breakEvenOf) }] : []}
        xLabel={row => trendAxisLabel(row, interval, lang)}
        ariaLabel={l.flowTrends}
        tooltip={row => ({
          title: trendRangeLabel(row, interval, lang),
          rows: series.map(item => {
            const value = item.marker ? breakEvenOf(row) : row[item.key]
            return { key: item.key, label: seriesLabels[item.key], color: item.color, kind: kindOf(item), dash: dashOf(item), value: compact(value), tone: value < 0 ? 'negative' : undefined }
          }),
          footer: [
            { key: 'avg', label: l.avgPerDay, value: compact(row.averageDaily) },
            ...(stacked ? [{ key: 'spent', label: l.spent, value: formatCurrency(row.spent), strong: true }] : []),
          ],
        })}
      />
    </div>
  )
}

// The owner's sales sheet as a table: per period sales, days, average per day
// and its change and growth against the previous period, orders, average
// check, spending and what was left. Average per day is red below break-even.
function TrendTable({ rows, interval, breakEvenFor, l, lang }) {
  if (!rows.length) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{l.empty}</p>
  const totals = rows.reduce((sum, row) => ({
    days: sum.days + row.days, cafeIncome: sum.cafeIncome + row.cafeIncome, orderCount: sum.orderCount + row.orderCount, spent: sum.spent + row.spent, left: sum.left + row.left,
  }), { days: 0, cafeIncome: 0, orderCount: 0, spent: 0, left: 0 })
  const signed = value => (value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCompactCurrency(Math.abs(value), lang)}`)
  const tone = value => (value == null || value === 0 ? 'text-[#68655f]' : value > 0 ? 'text-[#1d7a52]' : 'text-[#c4262c]')
  // Each row uses the average target of its days; the total row uses their day-weighted average.
  const targetOf = row => (breakEvenFor ? breakEvenFor(row.dateFrom, row.dateTo) : 0)
  const totalTarget = totals.days ? rows.reduce((sum, row) => sum + targetOf(row) * row.days, 0) / totals.days : 0
  const belowBreakEven = (value, target) => target > 0 && value < target
  const cell = 'whitespace-nowrap py-2.5 px-3 text-right tabular-nums'
  const columns = [l.trendPeriod, l.cafeIncome, l.trendDays, l.avgPerDay, l.avgChange, l.growth, l.orders, l.avgCheck, l.spent, l.left]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[#e4e1de] text-xs text-[#68655f]">
            {columns.map((column, index) => <th key={column} scope="col" className={`py-2 px-3 font-semibold ${index === 0 ? 'text-left' : 'text-right'}`}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-b border-[#efece9] text-[#22201d]">
              <th scope="row" className="py-2.5 px-3 text-left font-semibold">{trendRangeLabel(row, interval, lang)}</th>
              <td className={cell}>{formatCompactCurrency(row.cafeIncome, lang)}</td>
              <td className={`${cell} text-[#68655f]`}>{row.days}</td>
              <td className={`${cell} font-semibold ${belowBreakEven(row.averageDaily, targetOf(row)) ? 'text-[#c4262c]' : ''}`} title={targetOf(row) > 0 ? `${l.breakEven}: ${formatCurrency(targetOf(row))}` : undefined}>{formatCompactCurrency(row.averageDaily, lang)}</td>
              <td className={`${cell} ${tone(row.averageDailyChange)}`}>{signed(row.averageDailyChange)}</td>
              <td className={`${cell} ${tone(row.growthPct)}`}>{row.growthPct == null ? '—' : `${row.growthPct > 0 ? '+' : ''}${formatPct(row.growthPct, lang)}`}</td>
              <td className={`${cell} text-[#68655f]`}>{row.orderCount}</td>
              <td className={cell}>{row.averageCheck == null ? '—' : formatCompactCurrency(row.averageCheck, lang)}</td>
              <td className={cell}>{formatCompactCurrency(row.spent, lang)}</td>
              <td className={`${cell} ${row.left < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'}`}>{signed(row.left)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-[#f6f5f3] font-semibold text-[#22201d]">
            <th scope="row" className="py-2.5 px-3 text-left">{l.total}</th>
            <td className={cell}>{formatCompactCurrency(totals.cafeIncome, lang)}</td>
            <td className={cell}>{totals.days}</td>
            <td className={`${cell} ${belowBreakEven(totals.days ? totals.cafeIncome / totals.days : 0, totalTarget) ? 'text-[#c4262c]' : ''}`}>{formatCompactCurrency(totals.days ? totals.cafeIncome / totals.days : 0, lang)}</td>
            <td className={cell} colSpan={2}>{totalTarget > 0 ? <span className="text-xs font-bold text-[#68655f]">{l.breakEven}: {formatCompactCurrency(totalTarget, lang)}</span> : null}</td>
            <td className={cell}>{totals.orderCount}</td>
            <td className={cell}>{totals.orderCount ? formatCompactCurrency(totals.cafeIncome / totals.orderCount, lang) : '—'}</td>
            <td className={cell}>{formatCompactCurrency(totals.spent, lang)}</td>
            <td className={`${cell} ${totals.left < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'}`}>{signed(totals.left)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function LargestPayments({ rows, l, lang, categoryName, onOpen }) {
  if (!rows.length) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{l.empty}</p>
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
                <span className="block text-xs text-[#68655f]">{formatLongDate(row.date, lang, row.date)} · {expensePaymentMethodLabel(row.method, lang)}</span>
              </span>
              <span className="whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.amount)}</span>
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
function DonutChart({ categories, colors, total, totalLabel, emptyLabel, labelFor, onSelect, lang }) {
  const [hovered, setHovered] = useState(null)
  if (!total) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{emptyLabel}</p>

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
        <text x={size / 2} y={size / 2 - 6} textAnchor="middle" className="fill-current text-[#68655f] text-xs font-medium">
          {active ? labelFor(active.key).slice(0, 22) : totalLabel}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="fill-current text-[#22201d] text-[17px] font-semibold">
          {formatCompactCurrency(active ? active.amount : total, lang)}
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
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#22201d]">{labelFor(category.key)}</span>
              <span className="text-xs font-medium text-[#68655f] tabular-nums">{formatPct(shareOf(category.amount, total), lang)}</span>
              <span className="w-24 whitespace-nowrap text-right text-sm font-semibold text-[#22201d] tabular-nums">{formatCompactCurrency(category.amount, lang)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}


function CategoryComparison({ rows, labelFor, l, lang }) {
  if (!rows.length) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{l.empty}</p>
  const max = Math.max(...rows.map(row => Math.max(row.current, row.previous)), 1)
  // Largest categories first; the full list scrolls inside the card.
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-[#68655f]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[#ff5a00]" />{l.current}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-[#D1D5DB]" />{l.previous}</span>
      </div>
      <div data-comparison-scroll="true" className="max-h-[340px] space-y-3 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]">
      {rows.map(row => {
        const up = row.change > 0
        const badgeClass = row.change === 0 ? '' : up ? 'ws-tone-negative' : 'ws-tone-positive'
        const Icon = up ? ArrowUpRight : ArrowDownRight
        return (
          <div key={row.key} title={`${l.current}: ${formatCurrency(row.current)} · ${l.previous}: ${formatCurrency(row.previous)}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-[#22201d]">{labelFor(row.key)}</span>
              <span className={`ws-badge flex-shrink-0 tabular-nums ${badgeClass}`}>
                {row.change !== 0 && <Icon size={11} />}
                {row.changePct == null ? l.newItem : formatPct(Math.abs(row.changePct), lang)}
                <span className="ml-1 font-semibold">{row.change > 0 ? '+' : row.change < 0 ? '−' : ''}{formatCompactCurrency(Math.abs(row.change), lang)}</span>
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

function DailySpendingChart({ days, averageIncome, incomeByDate, l, lang, onSelectDay }) {
  const runningAverage = useMemo(() => (incomeByDate ? buildRunningAverageIncome(days, incomeByDate) : null), [days, incomeByDate])
  if (!days.length || days.every(day => day.total === 0)) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{l.empty}</p>

  const groupLabels = { salaries: l.salaries, bazaar: l.bazaar, meals: l.meals, other: l.otherSpend }
  // The running average of daily income, or the period's flat average when only that is known.
  const averageLine = runningAverage || (averageIncome > 0 ? days.map(() => averageIncome) : null)
  const compact = value => formatCompactCurrency(value, lang)

  return (
    <div>
      <ChartLegend
        label={l.dailyTitle}
        items={[
          ...SPENDING_GROUPS.map(group => ({ key: group, label: groupLabels[group], color: GROUP_COLORS[group] })),
          ...(averageLine ? [{ key: 'avg', label: l.avgIncome, color: AVERAGE_LINE_COLOR, kind: 'line', dash: CHART_DASH.average }] : []),
        ]}
      />
      <BarChart
        rows={days}
        rowKey={day => day.date}
        series={SPENDING_GROUPS.map(group => ({ key: group, color: GROUP_COLORS[group] }))}
        stacked
        lang={lang}
        minSlot={10}
        lines={averageLine ? [{ key: 'avg', color: AVERAGE_LINE_COLOR, values: averageLine, dash: CHART_DASH.average }] : []}
        xLabel={day => Number(day.date.slice(8))}
        onSelect={day => onSelectDay(day.date)}
        selectable={day => day.total > 0}
        rowLabel={day => `${formatLongDate(day.date, lang, day.date)} · ${formatCurrency(day.total)}`}
        ariaLabel={l.dailyTitle}
        tooltip={(day, index) => ({
          title: formatLongDate(day.date, lang, day.date),
          rows: SPENDING_GROUPS.filter(group => day[group] > 0).map(group => ({ key: group, label: groupLabels[group], color: GROUP_COLORS[group], value: compact(day[group]) })),
          footer: [
            { key: 'total', label: l.total, value: formatCurrency(day.total), strong: true },
            ...(runningAverage ? [{ key: 'avg', label: l.avgIncome, value: compact(runningAverage[index]) }] : []),
          ],
        })}
      />
    </div>
  )
}

const INCOME_METHOD_COLORS = { cash: ANALYSIS_SERIES_COLORS[2], card: ANALYSIS_SERIES_COLORS[0], terminal: ANALYSIS_SERIES_COLORS[6], salary: ANALYSIS_SERIES_COLORS[3], other: '#9CA3AF' }
const AVERAGE_LINE_COLOR = 'var(--ws-foreground)'

// Daily income: each day's cafe income stacked by payment method, with the
// running average daily income as a dashed line. Same layout as Daily spending.
function DailyIncomeChart({ days, status, l, lang, onSelectDay, onRetry }) {
  const runningAverage = useMemo(() => (days ? buildRunningAverageIncome(days, Object.fromEntries(days.map(day => [day.date, day.total]))) : []), [days])
  if (status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-10 text-sm font-medium text-[#68655f]">
        <p>{l.dailyIncomeFailed}</p>
        <button type="button" className="ws-btn ws-btn-outline" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />{l.retry}</button>
      </div>
    )
  }
  if (!days) return <Shimmer className="h-[260px] w-full rounded-xl" />
  if (!days.length || days.every(day => day.total === 0)) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{l.empty}</p>

  const methodLabels = { cash: l.incCash, card: l.incCard, terminal: l.incTerminal, salary: l.incSalary, other: l.incOther }
  const shownMethods = INCOME_METHODS.filter(method => days.some(day => day[method] > 0))
  // Before migration 286 there is no split: the one bar is plain cafe income.
  if (shownMethods.length === 1 && shownMethods[0] === 'other') methodLabels.other = l.cafeIncome
  const compact = value => formatCompactCurrency(value, lang)

  return (
    <div>
      <ChartLegend
        label={l.dailyIncomeTitle}
        items={[
          ...shownMethods.map(method => ({ key: method, label: methodLabels[method], color: INCOME_METHOD_COLORS[method] })),
          { key: 'avg', label: l.avgIncome, color: AVERAGE_LINE_COLOR, kind: 'line', dash: CHART_DASH.average },
        ]}
      />
      <BarChart
        rows={days}
        rowKey={day => day.date}
        series={INCOME_METHODS.map(method => ({ key: method, color: INCOME_METHOD_COLORS[method] }))}
        stacked
        lang={lang}
        minSlot={10}
        lines={[{ key: 'avg', color: AVERAGE_LINE_COLOR, values: runningAverage, dash: CHART_DASH.average }]}
        xLabel={day => Number(day.date.slice(8))}
        onSelect={day => onSelectDay(day.date)}
        selectable={day => day.total > 0}
        rowLabel={day => `${formatLongDate(day.date, lang, day.date)} · ${formatCurrency(day.total)}`}
        ariaLabel={l.dailyIncomeTitle}
        tooltip={(day, index) => ({
          title: formatLongDate(day.date, lang, day.date),
          rows: INCOME_METHODS.filter(method => day[method] > 0).map(method => ({ key: method, label: methodLabels[method], color: INCOME_METHOD_COLORS[method], value: compact(day[method]) })),
          footer: [
            { key: 'total', label: l.total, value: formatCurrency(day.total), strong: true },
            { key: 'avg', label: l.avgIncome, value: compact(runningAverage[index]) },
          ],
        })}
      />
    </div>
  )
}

// Tapping a day in Daily spending: that day's money flow (income -> spending
// categories) and every payment of the day. Cafe income is stored only as
// period totals, so the day's paid-order summary is loaded on open.
function DayFlowDialog({ date, entries, menuItems, l, lang, categoryName, onOpenHistory, onClose }) {
  const [order, setOrder] = useState({ status: 'loading', summary: null })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    const fallbackMenuItemMap = Object.fromEntries((menuItems || []).map(item => [item.id, item]))
    setOrder({ status: 'loading', summary: null })
    loadAccountingPaidOrderSummary(date, date, { fallbackMenuItemMap })
      .then(summary => { if (active) setOrder({ status: 'ready', summary }) })
      .catch(() => { if (active) setOrder({ status: 'error', summary: null }) })
    return () => { active = false }
  }, [date, retry]) // eslint-disable-line react-hooks/exhaustive-deps

  const flow = useMemo(() => buildDayMoneyFlow(order.summary || {}, entries, date), [order.summary, entries, date])
  const groupLabels = { salaries: l.salaries, bazaar: l.bazaar, meals: l.meals, other: l.otherSpend }
  const moneyIn = flow.sankey.incomeTotal
  const spent = flow.sankey.spendTotal
  const ready = order.status === 'ready'
  const max = flow.payments[0]?.amount || 1

  return (
    <WorkspaceDialog
      title={formatLongDate(date, lang, date)}
      description={l.dayFlowTitle}
      onClose={onClose}
      closeLabel={l.close}
      variant="sheet"
      size="xl"
      bodyClassName="space-y-5"
    >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2 sm:gap-3">
            {[[l.moneyIn, moneyIn, 'text-[#22201d]', !ready], [l.spent, spent, 'text-[#22201d]', false], [l.left, moneyIn - spent, moneyIn - spent >= 0 ? 'text-[#1d7a52]' : 'text-[#c4262c]', !ready]].map(([label, amount, tone, pending]) => (
              <div key={label} className="rounded-xl bg-[#f6f5f3] p-3 sm:p-4">
                <p className="ws-caption">{label}</p>
                {pending
                  ? <Shimmer className="mt-1.5 h-6 w-24" />
                  : <p className={`mt-1 whitespace-nowrap text-base font-semibold tabular-nums sm:text-xl ${tone}`}>{formatCurrency(amount)}</p>}
              </div>
            ))}
          </div>

          {order.status === 'error' ? (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-[#f6f5f3] py-10 text-sm font-medium text-[#68655f]">
              <p>{l.dayLoadFailed}</p>
              <button type="button" className="ws-btn ws-btn-outline" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />{l.retry}</button>
            </div>
          ) : !ready ? (
            <Shimmer className="h-[300px] w-full rounded-xl" />
          ) : (
            <SankeyChart
              lang={lang}
              sankey={flow.sankey}
              colors={flow.colors}
              hubLabel={l.hub}
              emptyLabel={l.empty}
              sourceLabel={key => l[key] || key}
              targetLabel={categoryName}
              onTargetClick={onOpenHistory}
            />
          )}

          <div>
            <h3 className="text-sm font-semibold text-[#22201d]">{l.dayPayments}</h3>
            {!flow.payments.length ? (
              <p className="py-6 text-center text-sm font-medium text-[#68655f]">{l.dayNoPayments}</p>
            ) : (
              <ol className="mt-2 divide-y divide-[#efece9]">
                {flow.payments.map(row => {
                  const details = [row.vendor, expenseDescriptionLabel(row.description, lang)].filter(Boolean).join(' · ')
                  return (
                    <li key={row.id}>
                      <button type="button" onClick={() => onOpenHistory(row.category)} title={l.openHistory} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 text-left hover:bg-[#f6f5f3]">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-[#22201d]">{categoryName(row.category)}{details ? <span className="font-normal text-[#68655f]"> · {details}</span> : null}</span>
                          <span className="inline-flex items-center gap-1.5 text-xs text-[#68655f]"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: GROUP_COLORS[row.group] }} />{groupLabels[row.group]} · {expensePaymentMethodLabel(row.method, lang)}</span>
                        </span>
                        <span className="whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.amount)}</span>
                        <span className="col-span-2 h-1 overflow-hidden rounded-full bg-[#efece9]"><span className="block h-full rounded-full" style={{ width: `${(row.amount / max) * 100}%`, backgroundColor: GROUP_COLORS[row.group] }} /></span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
    </WorkspaceDialog>
  )
}

function PaymentMethodFlow({ rows, lang, l }) {
  const visible = rows.filter(row => row.method !== 'loyalty_card' && (row.income > 0 || row.expenses > 0))
  if (!visible.length) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{l.empty}</p>
  const max = Math.max(...visible.map(row => Math.max(row.income, row.expenses)), 1)
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-4">
      {visible.map(row => (
        <div key={row.method} className="rounded-xl bg-[#f6f5f3] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#22201d]">{expensePaymentMethodLabel(row.method, lang)}</span>
            <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${row.left >= 0 ? 'text-[#1d7a52]' : 'text-[#c4262c]'}`}>{formatCompactCurrency(row.left, lang)}</span>
          </div>
          {[[l.moneyIn, row.income, 'bg-[#1d7a52]'], [l.spent, row.expenses, 'bg-[#ff5a00]']].map(([label, amount, barClass]) => (
            <div key={label} className="mb-1.5" title={`${label}: ${formatCurrency(amount)}`}>
              <div className="mb-0.5 flex justify-between gap-2 text-xs font-medium text-[#68655f]"><span>{label}</span><span className="whitespace-nowrap tabular-nums">{formatCompactCurrency(amount, lang)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-[#e4e1de]">
                <div className={`h-full rounded-full ${barClass}`} style={{ width: `${(amount / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
