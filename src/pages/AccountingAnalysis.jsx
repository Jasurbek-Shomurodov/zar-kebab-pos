import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
  PiggyBank,
  RefreshCw,
  ShoppingBasket,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { Kpi, KpiExplanationDialog, toKpiDetail } from '../components/AccountingKpi'
import DateRangePicker from '../components/DateRangePicker'
import { OperationalLoading } from '../components/OperationalState'
import MonthlyIncomeChart from '../components/MonthlyIncomeChart'
import WeeklyIncomeChart from '../components/WeeklyIncomeChart'
import SankeyChart, { useElementWidth } from '../components/SankeyChart'
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
  loadAccountingPaidOrderSummary,
  loadFinancialAnalysisBundle,
} from '../lib/accountingSummary'
import { DASHBOARD_DAILY_BREAK_EVEN_INCOME, loadDashboardMonthlyAverageIncome, normalizeDashboardMonthlyIncomeRows } from '../lib/monthlyIncome'
import { loadDashboardWeeklyIncome, normalizeDashboardWeeklyIncomeRows } from '../lib/weeklyIncome'
import { breakEvenTargetForPeriod, lastDayOfMonth, loadBreakEvenTargetHistory } from '../lib/breakEvenTarget'
import {
  ANALYSIS_SERIES_COLORS,
  SPENDING_GROUPS,
  assignCategoryColors,
  buildAccountingIndicators,
  buildAccountingPeriodEntries,
  buildAccountingProfitAndLoss,
  buildAccountingSankey,
  buildAccountingTrend,
  buildBreakEvenSummary,
  buildCategoryComparison,
  buildDailySpending,
  buildDayMoneyFlow,
  buildGrowthOverview,
  buildInvestorOverview,
  buildLargestPayments,
  buildMonthlyProfitRows,
  buildMonthlyIncomeSources,
  buildMonthlySpending,
  buildPaybackSummary,
  buildPeriodTotals,
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
    dailyTitle: 'Kunlik xarajatlar',
    dailySub: 'Har kuni sarflangan pul va o‘rtacha kunlik kafe daromadi. Kunni bosing — pul qayerga ketgani ochiladi',
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
    dailyTitle: 'Расходы по дням',
    dailySub: 'Траты каждого дня и средний дневной доход кафе. Нажмите на день, чтобы увидеть, куда ушли деньги',
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
    dailyTitle: 'Daily spending',
    dailySub: 'What was spent each day against average daily cafe income. Tap a day to see where the money went',
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
    daily: 'Spending on each day, with the average daily income as a line. Tap a day to see where its money went.',
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
    daily: 'Расходы по дням и линия среднего дохода в день. Нажмите на день, чтобы увидеть, куда ушли деньги.',
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
    daily: 'Har kungi xarajat va kunlik o‘rtacha daromad chizig‘i. Pul qayerga ketganini ko‘rish uchun kunni bosing.',
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
      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[#8a867f] transition-colors hover:bg-[#efece9] hover:text-[#22201d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40"
    >
      <HelpCircle size={16} aria-hidden="true" />
    </button>
  )
}

function HelpDialog({ title, text, closeLabel, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#22201d]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="analysis-help-title" className="ws-dialog w-full !rounded-b-none sm:max-w-md sm:!rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e4e1de] px-5 py-4">
          <h2 id="analysis-help-title" className="ws-heading flex items-center gap-2"><HelpCircle size={18} className="text-[#ff5a00]" aria-hidden="true" />{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="ws-btn ws-btn-ghost !h-9 !w-9 !px-0"><X size={18} /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <p className="text-[15px] leading-relaxed text-[#22201d]">{text}</p>
          <button type="button" onClick={onClose} className="ws-btn ws-btn-outline !h-11 w-full">{closeLabel}</button>
        </div>
      </section>
    </div>
  )
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
  // Each saved target change applies from its own day, so past periods keep the target they had.
  // Refetched when the setting changes; a failed read falls back to the current target.
  useEffect(() => {
    const controller = new AbortController()
    loadBreakEvenTargetHistory({ signal: controller.signal })
      .then(setTargetHistory)
      .catch(() => { if (!controller.signal.aborted) setTargetHistory([]) })
    return () => controller.abort()
  }, [breakEvenTarget, reloadKey])
  const targetForPeriod = useCallback(
    dateTo => breakEvenTargetForPeriod(targetHistory, dateTo, todayExpenseDate(), breakEvenTarget),
    [targetHistory, breakEvenTarget],
  )
  const breakEven = useMemo(
    () => buildBreakEvenSummary(growthOverview, breakEvenTarget, monthStart => targetForPeriod(lastDayOfMonth(monthStart))),
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

  function openHistory(category, type, from = dateFrom, to = dateTo) {
    if (!category || category.startsWith('__')) return
    const params = new URLSearchParams({ type, category, from, to })
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
                <TotalTile help="moneyIn" label={l.moneyIn} value={indicators.moneyIn} change={getPercentChange(indicators.moneyIn, previousIndicators.moneyIn)} goodWhenUp vsLabel={l.vsPrevious} tone="green" />
                <TotalTile help="spent" label={l.spent} value={indicators.spent} change={getPercentChange(indicators.spent, previousIndicators.spent)} goodWhenUp={false} vsLabel={l.vsPrevious} tone="orange" />
                <TotalTile help="left" label={l.left} value={indicators.left} change={getPercentChange(indicators.left, previousIndicators.left)} goodWhenUp vsLabel={l.vsPrevious} tone={indicators.left >= 0 ? 'blue' : 'red'} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Indicator icon={PiggyBank} help="savingsRate" label={l.savingsRate} value={formatPct(indicators.savingsRatePct)} sub={l.savingsRateSub} meter={indicators.savingsRatePct} tone={indicators.savingsRatePct != null && indicators.savingsRatePct < 0 ? 'red' : 'green'} />
                <Indicator icon={Flame} help="burnRate" label={l.burnRate} value={formatCurrency(indicators.avgDailySpend)} sub={l.burnRateSub} tone="orange" />
                <Indicator icon={Hourglass} help="runway" label={l.runway} value={indicators.runwayDays == null ? '—' : `${indicators.runwayDays} ${l.days}`} sub={l.runwaySub} tone="blue" />
                <Indicator icon={ShoppingBasket} help="foodCost" label={l.foodCost} value={formatPct(indicators.foodCostPct)} sub={l.foodCostSub} meter={indicators.foodCostPct} tone="teal" />
                <Indicator icon={Users} help="payrollShare" label={l.payrollShare} value={formatPct(indicators.payrollSharePct)} sub={l.payrollShareSub} meter={indicators.payrollSharePct} tone="purple" />
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
                  <CategoryComparison rows={analysis.comparison} labelFor={categoryName} l={l} />
                </ChartCard>
              </div>

              <ChartCard title={l.largestTitle} help="largest" description={l.largestSub}>
                <LargestPayments rows={analysis.largest} l={l} lang={lang} categoryName={categoryName} onOpen={openCategoryHistory} />
              </ChartCard>

              <ChartCard title={l.dailyTitle} help="daily" description={l.dailySub}>
                <DailySpendingChart
                  days={analysis.daily}
                  averageIncome={analysis.summary.cafeIncomeSummary.averageDaily}
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

function LabelWithHelp({ label, help, as: Tag = 'p' }) {
  return (
    <Tag className="ws-caption flex items-center gap-0.5">
      <span className="min-w-0">{label}</span>
      {help && <span className="-my-1.5"><HelpButton topic={help} title={label} /></span>}
    </Tag>
  )
}

function TotalTile({ label, value, change, goodWhenUp, vsLabel, tone, help = null }) {
  const tones = { green: 'text-[#1d7a52]', orange: 'text-[#ff5a00]', blue: 'text-[#22201d]', red: 'text-[#c4262c]' }
  return (
    <div className="ws-panel">
      <LabelWithHelp label={label} help={help} />
      <p className={`mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${tones[tone] || tones.blue}`}><RollingText text={formatCurrency(value)} /></p>
      <div className="mt-2"><ChangeBadge change={change} goodWhenUp={goodWhenUp} label={vsLabel} /></div>
    </div>
  )
}

function Indicator({ icon: Icon, label, value, sub, meter = null, tone = 'orange', help = null }) {
  const barColors = { green: '#1d7a52', orange: '#ff5a00', blue: '#2a78d6', red: '#c4262c', teal: '#1baf7a', purple: '#4a3aa7' }
  const width = meter == null ? null : Math.max(0, Math.min(100, meter))
  return (
    <div className="ws-panel flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <LabelWithHelp label={label} help={help} />
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

function GrowthTile({ label, value, valueTone, sub, change, changeLabel, spark, sparkColor, help = null }) {
  return (
    <div className="ws-panel flex h-full flex-col">
      <LabelWithHelp label={label} help={help} />
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
    <ChartCard title={l.recordsTitle} help="records" description={l.recordsSub}>
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

function StatCell({ label, value, sub, tone, help = null }) {
  return (
    <div className="min-w-0">
      <LabelWithHelp as="dt" label={label} help={help} />
      <dd className={`mt-0.5 break-words text-base font-semibold leading-tight tabular-nums ${tone || 'text-[#22201d]'}`}>{value}</dd>
      {sub && <dd className="ws-caption mt-0.5 leading-snug">{sub}</dd>}
    </div>
  )
}

function InvestorSupportBars({ months, l, lang }) {
  const max = Math.max(...months.map(row => row.amount), 0)
  return (
    <div>
      <p className="ws-caption mb-2">{l.supportByMonth}</p>
      <div className="flex h-32 items-end gap-1" role="list">
        {months.map(row => {
          const name = formatMonthYear(row.key, lang, row.key)
          return (
            <div key={row.key} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${name}: ${formatCurrency(row.amount)}`}>
              {row.amount > 0 && <span className="text-[10px] font-semibold tabular-nums text-[#2a78d6]">{formatCompact(row.amount)}</span>}
              <div className={`w-full max-w-[28px] rounded-t ${row.amount > 0 ? 'bg-[#2a78d6]' : 'bg-[#efece9]'}`} style={{ height: row.amount > 0 && max > 0 ? `${Math.max(6, (row.amount / max) * 80)}%` : '3px' }} />
              <span className="text-[10px] text-[#8a867f]">{name.slice(0, 3)}</span>
              <span className="sr-only">{formatCurrency(row.amount)}</span>
            </div>
          )
        })}
      </div>
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
              <p className="mt-1 break-words text-[clamp(28px,2.6vw,38px)] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#2a78d6]"><RollingText text={formatCurrency(investor.invested)} /></p>
            </div>
            {payback && (
              <>
                <div>
                  <div className="mb-1 flex justify-between gap-2 text-[12px] font-semibold text-[#68655f]">
                    <span>{formatPct(payback.paidBackPct)} {l.paidBack}</span>
                    <span className="tabular-nums">{l.stillToRecover}: {formatCompact(payback.remaining)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#efece9]"><div className="h-full rounded-full bg-[#1d7a52]" style={{ width: `${payback.paidBackPct}%` }} /></div>
                </div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatCell help="generated" label={l.generated} value={formatCompact(payback.generated)} tone={payback.generated < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'} />
                  <StatCell label={l.stillToRecover} value={formatCompact(payback.remaining)} />
                  {payback.monthlyPace != null && <StatCell help="pace" label={l.pace} value={formatCompact(payback.monthlyPace)} tone={payback.monthlyPace < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'} />}
                </dl>
                <p className="ws-caption">{note}</p>
              </>
            )}
          </div>
          <InvestorSupportBars months={investor.months} l={l} lang={lang} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[#efece9] pt-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCell label={l.thisMonthSupport} value={investor.thisMonth > 0 ? formatCompact(investor.thisMonth) : l.noneLabel} />
          <StatCell label={fillText(l.recentSupport, { n })} value={formatCompact(investor.recentTotal)} sub={`${l.supportedMonths}: ${investor.supportedMonthCount} ${fillText(l.ofMonths, { n })}`} />
          <StatCell label={l.lastSupport} value={investor.last ? formatCompact(investor.last.amount) : '—'} sub={investor.last ? formatMonthYear(investor.last.key, lang, investor.last.key) : ''} />
          <StatCell label={l.averagePerMonth} value={investor.averagePerSupportedMonth == null ? '—' : formatCompact(investor.averagePerSupportedMonth)} sub={investor.largest ? `${l.largestSupport}: ${formatMonthYear(investor.largest.key, lang, investor.largest.key)}` : ''} />
          <StatCell help="shareOfSpending" label={l.shareOfSpending} value={formatPct(investor.shareOfSpendingPct)} sub={fillText(l.shareOfSpendingSub, { n })} />
          <StatCell
            label={l.shortfallTitle}
            help="shortfall"
            value={formatCompact(investor.shortfall)}
            tone={investor.shortfall > 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'}
            sub={investor.shortfall > 0 ? fillText(l.shortfallCovered, { pct: formatPct(investor.shortfallCoveredPct) }) : l.noShortfall}
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
        <StatCell label={l.cafeIncome} value={formatCompact(totals.cafeIncome)} sub={`${l.orders}: ${formatCompact(totals.orderCount)} · ${l.avgCheck}: ${totals.averageCheck == null ? '—' : formatCompact(totals.averageCheck)}`} />
        <StatCell label={l.grossProfit} value={formatCompact(totals.grossProfit)} sub={fillText(l.marginOf, { pct: formatPct(totals.grossMarginPct) })} />
        <StatCell label={l.spent} value={formatCompact(totals.spent)} tone="text-[#ff5a00]" sub={`${l.avgMonthlySpend}: ${formatCompact(totals.averageMonthlySpent)}`} />
        <StatCell label={l.resultLabel} value={formatCompact(totals.left)} tone={trendTone(totals.left)} sub={fillText(l.marginOf, { pct: formatPct(totals.leftMarginPct) })} />
        <StatCell label={l.salaries} value={formatCompact(totals.salaries)} sub={`${l.salaryShare}: ${formatPct(totals.salaryShareOfSpendingPct)}`} />
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
        <p className={`text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${reached ? 'text-[#1d7a52]' : 'text-[#c4262c]'}`}>{fillText(l.ofTarget, { pct: formatPct(summary.coveragePct) })}</p>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#efece9]"><div className={`h-full rounded-full ${reached ? 'bg-[#1d7a52]' : 'bg-[#ff5a00]'}`} style={{ width: `${Math.min(100, summary.coveragePct || 0)}%` }} /></div>
        <dl className="grid grid-cols-3 gap-3">
          <StatCell label={l.avgPerDay} value={formatCompact(summary.latestDaily)} sub={formatMonthYear(summary.latestMonth, lang, summary.latestMonth)} />
          <StatCell label={l.targetPerDay} value={formatCompact(summary.target)} />
          <StatCell label={l.monthsAboveTarget} value={`${summary.monthsAbove} / ${summary.completedMonths}`} />
        </dl>
        <p className="ws-caption">{fillText(reached ? l.abovePerDay : l.shortPerDay, { amount: formatCompact(Math.abs(summary.dailyGap)) })}</p>
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
    [formatCompact(row.cafeIncome)],
    [formatCompact(row.otherIncome)],
    [formatCompact(row.salesCost)],
    [formatCompact(row.grossProfit)],
    [formatCompact(row.spent), 'text-[#ff5a00]'],
    [formatCompact(row.salaries)],
    [formatCompact(row.left), `font-semibold ${trendTone(row.left)}`],
    [formatPct(row.grossMarginPct)],
    [row.investorSupport > 0 ? formatCompact(row.investorSupport) : '—', row.investorSupport > 0 ? 'font-semibold text-[#2a78d6]' : 'text-[#8a867f]'],
  ]
  return (
    <ChartCard title={l.statementTitle} help="statement" description={l.statementSub}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#e4e1de] text-[12px] text-[#8a867f]">
              <th scope="col" className="py-2 px-3 text-left font-semibold">{l.trendPeriod}</th>
              {columns.map(label => <th key={label} scope="col" className="py-2 px-3 text-right font-semibold">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {ordered.map(row => (
              <tr key={row.key} className="border-b border-[#efece9] text-[#22201d]">
                <th scope="row" className="py-2 px-3 text-left font-semibold whitespace-nowrap">
                  {formatMonthYear(row.key, lang, row.key)}
                  {row.days < daysInMonth(row.dateFrom) && <span className="ml-1 text-[11px] font-normal text-[#8a867f]">({l.soFar})</span>}
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
          <StatCell label={l.avgMonthlySpend} value={formatCompact(spending.averageMonthly)} tone="text-[#ff5a00]" sub={fillText(l.overCompleted, { n: spending.completedCount })} />
          {top && <StatCell label={l.biggestCost} value={label(top.key)} sub={`${formatPct(top.sharePct)} · ${l.avgPerMonthShort}: ${formatCompact(top.averagePerMonth)}`} />}
          <StatCell label={fillText(l.spentInMonths, { n: spending.months.length })} value={formatCompact(spending.total)} />
        </dl>
        <div>
          <div className="flex h-44 items-end gap-1.5 sm:gap-3" role="list">
            {spending.months.map(month => {
              const name = formatMonthYear(month.key, lang, month.key)
              return (
                <div key={month.key} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${name}: ${formatCurrency(month.total)}`}>
                  <span className="text-[10px] font-semibold tabular-nums text-[#68655f]">{month.total > 0 ? formatCompact(month.total) : ''}</span>
                  <div className="flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-t" style={{ height: `${Math.max(month.total > 0 ? 4 : 0, (month.total / max) * 82)}%` }}>
                    {month.parts.map(part => <div key={part.key} style={{ height: `${(part.amount / month.total) * 100}%`, backgroundColor: colorOf[part.key] }} />)}
                  </div>
                  <span className="text-[10px] text-[#8a867f]">{name.slice(0, 3)}</span>
                  <span className="sr-only">{month.parts.map(part => `${label(part.key)} ${formatCurrency(part.amount)}`).join(', ')}</span>
                </div>
              )
            })}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#68655f]">
            {spending.categories.map(category => (
              <li key={category.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: category.color }} />{label(category.key)}</li>
            ))}
          </ul>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#e4e1de] text-[12px] text-[#8a867f]">
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
                  <td className={`${cell} font-semibold`}>{formatCompact(category.averagePerMonth)}</td>
                  <td className={cell}>
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[#efece9] sm:inline-block"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, category.sharePct || 0)}%`, backgroundColor: category.color }} /></span>
                      {formatPct(category.sharePct)}
                    </span>
                  </td>
                  <td className={`${cell} ${category.current > category.averagePerMonth ? 'text-[#c4262c]' : ''}`}>{formatCompact(category.current)}</td>
                  <td className={cell}>{category.previous == null ? '—' : formatCompact(category.previous)}</td>
                  <td className={cell}>{formatCompact(category.total)}</td>
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
  const height = 240
  const pad = { top: 16, right: 12, bottom: 28, left: 52 }
  const shown = sources.series.filter(row => !hidden.has(row.key))
  const max = Math.max(1, ...shown.flatMap(row => sources.months.map(month => month.values[row.key])))
  const innerWidth = Math.max(0, width - pad.left - pad.right)
  const innerHeight = height - pad.top - pad.bottom
  const count = sources.months.length
  const x = index => pad.left + (count > 1 ? (index / (count - 1)) * innerWidth : innerWidth / 2)
  const y = value => pad.top + innerHeight - (value / max) * innerHeight
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(step => Math.round(max * step))
  return (
    <div ref={wrapRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={l.incomeSourcesTitle}>
          {ticks.map(tick => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#efece9" />
              <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize="10" fill="#8a867f">{formatCompact(tick)}</text>
            </g>
          ))}
          {sources.months.map((month, index) => (
            <text key={month.key} x={x(index)} y={height - 8} textAnchor="middle" fontSize="10" fill="#8a867f">{formatMonthYear(month.key, lang, month.key).slice(0, 3)}</text>
          ))}
          {shown.map(row => (
            <g key={row.key}>
              <polyline
                points={sources.months.map((month, index) => `${x(index)},${y(month.values[row.key])}`).join(' ')}
                fill="none"
                stroke={INCOME_SOURCE_COLORS[row.key]}
                strokeWidth={2}
                strokeDasharray={row.key === 'investor_support' ? '5 4' : undefined}
                strokeLinejoin="round"
              />
              {sources.months.map((month, index) => (
                <circle key={month.key} cx={x(index)} cy={y(month.values[row.key])} r={3} fill={INCOME_SOURCE_COLORS[row.key]}>
                  <title>{`${incomeSourceLabel(row.key, l)} · ${formatMonthYear(month.key, lang, month.key)}: ${formatCurrency(month.values[row.key])}`}</title>
                </circle>
              ))}
            </g>
          ))}
        </svg>
      )}
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
          <StatCell label={l.avgIncomeMonth} value={formatCompact(sources.averageMonthly)} tone="text-[#1d7a52]" sub={fillText(l.overCompleted, { n: sources.completedCount })} />
          {top && <StatCell label={l.biggestSource} value={incomeSourceLabel(top.key, l)} sub={`${formatPct(top.sharePct)} · ${l.avgPerMonthShort}: ${formatCompact(top.averagePerMonth)}`} />}
          <StatCell label={l.touristShare} value={formatPct(tourist?.sharePct ?? 0)} sub={tourist?.averageCheck != null ? `${l.avgCheck}: ${formatCompact(tourist.averageCheck)}` : ''} />
        </dl>
        <div>
          <ul className="mb-3 flex flex-wrap gap-2" aria-label={l.chartLegend}>
            {sources.series.map(row => (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => toggle(row.key)}
                  aria-pressed={!hidden.has(row.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-opacity ${hidden.has(row.key) ? 'border-[#e4e1de] text-[#8a867f] opacity-60' : 'border-[#e4e1de] text-[#22201d]'}`}
                >
                  <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: INCOME_SOURCE_COLORS[row.key] }} />
                  {incomeSourceLabel(row.key, l)}
                </button>
              </li>
            ))}
          </ul>
          <IncomeSourcesChart sources={sources} hidden={hidden} l={l} lang={lang} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#e4e1de] text-[12px] text-[#8a867f]">
                {[l.sourceLabel, l.avgPerMonthShort, l.shareShort, l.orders, l.avgCheck, l.thisMonthSoFar, l.lastMonthShort, l.total].map((label, index) => (
                  <th key={label} scope="col" className={`py-2 px-3 font-semibold ${index === 0 ? 'text-left' : 'text-right'}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.series.map(row => (
                <tr key={row.key} className="border-b border-[#efece9] text-[#22201d]">
                  <th scope="row" className="py-2 px-3 text-left font-semibold whitespace-nowrap"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: INCOME_SOURCE_COLORS[row.key] }} />{incomeSourceLabel(row.key, l)}</th>
                  <td className={`${cell} font-semibold`}>{formatCompact(row.averagePerMonth)}</td>
                  <td className={cell}>{row.sharePct == null ? '—' : formatPct(row.sharePct)}</td>
                  <td className={cell}>{row.orders > 0 ? formatCompact(row.orders) : '—'}</td>
                  <td className={cell}>{row.averageCheck == null ? '—' : formatCompact(row.averageCheck)}</td>
                  <td className={cell}>{formatCompact(row.current)}</td>
                  <td className={cell}>{row.previous == null ? '—' : formatCompact(row.previous)}</td>
                  <td className={cell}>{formatCompact(row.total)}</td>
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
            <p className={`mt-1 break-words text-[clamp(26px,2.4vw,34px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${trendTone(overview.total)}`}><RollingText text={formatCurrency(overview.total)} /></p>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCell label={l.avgPerMonthShort} value={formatCompact(overview.average)} tone={trendTone(overview.average)} sub={fillText(l.marginOf, { pct: formatPct(overview.marginPct) })} />
            <StatCell label={l.profitableMonths} value={`${overview.profitableCount} / ${overview.count}`} />
            {overview.best && <StatCell label={l.bestResult} value={formatCompact(overview.best.ownerProfit)} sub={formatMonthYear(overview.best.monthStart, lang, overview.best.monthStart)} />}
          </dl>
          {overview.pending.length > 0 && <p className="ws-notice text-[12px]">{fillText(l.ownerProfitPending, { months: overview.pending.map(month => formatMonthYear(month, lang, month)).join(', ') })}</p>}
          {open}
        </div>
        <div>
          <p className="ws-caption mb-2">{l.ownerProfitByMonth}</p>
          <ul className="space-y-2">
            {[...overview.months].reverse().map(row => (
              <li key={row.key} className="grid grid-cols-[96px_minmax(0,1fr)_72px] items-center gap-3 text-[12px]">
                <span className="truncate font-semibold text-[#22201d]">{formatMonthYear(row.monthStart, lang, row.monthStart)}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-[#efece9]"><span className={`block h-full rounded-full ${row.ownerProfit >= 0 ? 'bg-[#1d7a52]' : 'bg-[#c4262c]'}`} style={{ width: `${Math.max(2, (Math.abs(row.ownerProfit) / max) * 100)}%` }} /></span>
                <span className={`text-right font-semibold tabular-nums ${trendTone(row.ownerProfit)}`}>{formatCompact(row.ownerProfit)}</span>
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
          label={l.avgSalesPerDay}
          help="avgSalesPerDay"
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
          help="threeMonthGrowth"
          value={signedPct(overview.vsThreeAgoPct)}
          valueTone={trendTone(overview.vsThreeAgoPct)}
          sub={threeAgo ? fillText(l.vsMonth, { month: formatMonthYear(threeAgo.monthStart, lang, threeAgo.monthStart) }) : ''}
          spark={averages.slice(-4)}
          sparkColor={overview.vsThreeAgoPct < 0 ? '#c4262c' : '#1d7a52'}
        />
        <GrowthTile
          label={l.monthlyGrowth}
          help="monthlyGrowth"
          value={overview.monthlyGrowthPct == null ? '—' : `${signedPct(overview.monthlyGrowthPct)} ${l.perMonth}`}
          valueTone={trendTone(overview.monthlyGrowthPct)}
          sub={overview.monthlyGrowthPct == null ? '' : fillText(l.overMonths, { n: overview.monthlyGrowthSpan })}
          spark={months.filter(row => row.isFinalized).map(row => row.averageDailyIncome)}
          sparkColor={overview.monthlyGrowthPct < 0 ? '#c4262c' : '#1d7a52'}
        />
        <GrowthTile
          label={l.ordersPerDay}
          help="ordersPerDay"
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
            <div className="flex flex-col items-center gap-3 py-10 text-sm font-bold text-[#8a867f]">
              <p>{l.trendsFailed}</p>
              <button type="button" className="ws-btn" onClick={onTrendRetry}><RefreshCw size={14} aria-hidden="true" />{l.retry}</button>
            </div>
          ) : !trendRows ? (
            <div className="flex h-[300px] items-center justify-center text-[#8a867f]" role="status" aria-label={l.loading}><Loader2 className="animate-spin" size={22} aria-hidden="true" /></div>
          ) : (
            trendStyle === 'table'
              ? <TrendTable rows={trendRows} interval={interval} breakEvenFor={breakEvenFor} l={l} lang={lang} />
              : <TrendChart rows={trendRows} styleKey={trendStyle} interval={interval} breakEvenFor={breakEvenFor} l={l} lang={lang} />
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
function TrendChart({ rows, styleKey, interval, breakEvenFor, l, lang }) {
  const [hidden, setHidden] = useState([])
  const [hoverIndex, setHoverIndex] = useState(null)
  const [wrapRef, measuredWidth] = useElementWidth()
  if (!rows.length || rows.every(row => !row.income && !row.spent)) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{l.empty}</p>

  const stacked = styleKey === 'groups'
  const seriesLabels = { income: l.moneyIn, spent: l.spent, left: l.left, salaries: l.salaries, bazaar: l.bazaar, meals: l.meals, other: l.otherSpend, breakEven: l.breakEven }
  const series = stacked
    ? [...SPENDING_GROUPS.map(key => ({ key, color: GROUP_COLORS[key] })), { key: 'income', color: '#16a34a', line: true }]
    : [...TREND_TOTAL_SERIES, ...(breakEvenFor && rows.some(row => breakEvenFor(row.dateTo) > 0) ? [{ key: 'breakEven', color: '#e34948', marker: true }] : [])]
  // The daily break-even target in effect for each bucket, scaled to its length, as a mark over its bars.
  const breakEvenOf = row => (breakEvenFor ? breakEvenFor(row.dateTo) * row.days : 0)
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
function TrendTable({ rows, interval, breakEvenFor, l, lang }) {
  if (!rows.length) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{l.empty}</p>
  const totals = rows.reduce((sum, row) => ({
    days: sum.days + row.days, cafeIncome: sum.cafeIncome + row.cafeIncome, orderCount: sum.orderCount + row.orderCount, spent: sum.spent + row.spent, left: sum.left + row.left,
  }), { days: 0, cafeIncome: 0, orderCount: 0, spent: 0, left: 0 })
  const signed = value => (value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCompact(Math.abs(value))}`)
  const tone = value => (value == null || value === 0 ? 'text-[#8a867f]' : value > 0 ? 'text-green-700' : 'text-red-600')
  // Each row uses the target in effect for it; the total row uses their day-weighted average.
  const targetOf = row => (breakEvenFor ? breakEvenFor(row.dateTo) : 0)
  const totalTarget = totals.days ? rows.reduce((sum, row) => sum + targetOf(row) * row.days, 0) / totals.days : 0
  const belowBreakEven = (value, target) => target > 0 && value < target
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
              <td className={`${cell} font-semibold ${belowBreakEven(row.averageDaily, targetOf(row)) ? 'text-red-600' : ''}`} title={targetOf(row) > 0 ? `${l.breakEven}: ${formatCurrency(targetOf(row))}` : undefined}>{formatCompact(row.averageDaily)}</td>
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
            <td className={`${cell} ${belowBreakEven(totals.days ? totals.cafeIncome / totals.days : 0, totalTarget) ? 'text-red-600' : ''}`}>{formatCompact(totals.days ? totals.cafeIncome / totals.days : 0)}</td>
            <td className={cell} colSpan={2}>{totalTarget > 0 ? <span className="text-[12px] font-bold text-[#8a867f]">{l.breakEven}: {formatCompact(totalTarget)}</span> : null}</td>
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

function DailySpendingChart({ days, averageIncome, l, lang, onSelectDay }) {
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
              <g
                key={day.date}
                onMouseEnter={() => setHoverIndex(index)}
                onClick={day.total > 0 ? () => onSelectDay(day.date) : undefined}
                onKeyDown={event => {
                  if (day.total > 0 && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectDay(day.date) }
                }}
                role={day.total > 0 ? 'button' : undefined}
                tabIndex={day.total > 0 ? 0 : undefined}
                aria-label={day.total > 0 ? `${formatLongDate(day.date, lang, day.date)} · ${formatCurrency(day.total)}` : undefined}
                className={day.total > 0 ? 'cursor-pointer outline-none' : undefined}
              >
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

// Tapping a day in Daily spending: that day's money flow (income -> spending
// categories) and every payment of the day. Cafe income is stored only as
// period totals, so the day's paid-order summary is loaded on open.
function DayFlowDialog({ date, entries, menuItems, l, lang, categoryName, onOpenHistory, onClose }) {
  const [order, setOrder] = useState({ status: 'loading', summary: null })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#22201d]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="day-flow-title" className="ws-dialog max-h-[92vh] w-full overflow-y-auto !rounded-b-none sm:max-w-4xl sm:!rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e4e1de] bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="ws-caption font-medium">{l.dayFlowTitle}</p>
            <h2 id="day-flow-title" className="ws-display mt-1">{formatLongDate(date, lang, date)}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={l.close} className="ws-btn ws-btn-ghost !h-10 !w-10 !px-0">
            <X size={19} />
          </button>
        </div>
        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[[l.moneyIn, moneyIn, 'text-[#22201d]', !ready], [l.spent, spent, 'text-[#22201d]', false], [l.left, moneyIn - spent, moneyIn - spent >= 0 ? 'text-green-600' : 'text-red-600', !ready]].map(([label, amount, tone, pending]) => (
              <div key={label} className="rounded-xl bg-[#f6f5f3] p-3 sm:p-4">
                <p className="ws-caption">{label}</p>
                {pending
                  ? <Shimmer className="mt-1.5 h-6 w-24" />
                  : <p className={`mt-1 break-words text-base font-semibold tabular-nums sm:text-xl ${tone}`}>{formatCurrency(amount)}</p>}
              </div>
            ))}
          </div>

          {order.status === 'error' ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-[#e4e1de] py-10 text-sm font-bold text-[#8a867f]">
              <p>{l.dayLoadFailed}</p>
              <button type="button" className="ws-btn" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />{l.retry}</button>
            </div>
          ) : !ready ? (
            <Shimmer className="h-[300px] w-full rounded-xl" />
          ) : (
            <SankeyChart
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
              <p className="py-6 text-center text-sm font-bold text-[#8a867f]">{l.dayNoPayments}</p>
            ) : (
              <ol className="mt-2 divide-y divide-[#efece9]">
                {flow.payments.map(row => {
                  const details = [row.vendor, expenseDescriptionLabel(row.description, lang)].filter(Boolean).join(' · ')
                  return (
                    <li key={row.id}>
                      <button type="button" onClick={() => onOpenHistory(row.category)} title={l.openHistory} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 text-left hover:bg-[#f6f5f3]">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-[#22201d]">{categoryName(row.category)}{details ? <span className="font-normal text-[#68655f]"> · {details}</span> : null}</span>
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#8a867f]"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: GROUP_COLORS[row.group] }} />{groupLabels[row.group]} · {expensePaymentMethodLabel(row.method, lang)}</span>
                        </span>
                        <span className="text-right text-[13px] font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.amount)}</span>
                        <span className="col-span-2 h-1 overflow-hidden rounded-full bg-[#efece9]"><span className="block h-full rounded-full" style={{ width: `${(row.amount / max) * 100}%`, backgroundColor: GROUP_COLORS[row.group] }} /></span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      </section>
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
