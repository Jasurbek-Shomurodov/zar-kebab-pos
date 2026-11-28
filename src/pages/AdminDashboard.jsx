import React, { useMemo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, ShoppingBag, Package, Receipt,
  Clock, ArrowUpRight, ArrowDownRight, Users,
  BadgeDollarSign,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, formatCurrencyWithPercentage, formatGroupedNumber, formatPercent } from '../lib/formatCurrency'
import { normalizeDateLang } from '../lib/dateFormat'
import {
  addRestaurantDays,
  getRestaurantHour,
  getOrderDate,
  getOrderLoyaltyIncomeTotal,
  getOrderRevenueTotal,
  groupOrdersBySession,
  isPaidOrder,
  restaurantTodayStr,
} from '../lib/analytics'
import {
  formatReadableDateTime,
  getDashboardProductContribution,
  getDashboardOrderTypePerformance,
  getDashboardPaymentMethods,
  getDashboardDayOrders,
  getDashboardSalesByCategory,
} from '../lib/dashboardAnalytics'
import AppShell from '../components/AppShell'
import PageShimmer, { Shimmer } from '../components/PageShimmer'
import BarChart from '../components/charts/BarChart'
import { CHART_DASH, ChartLegend } from '../components/charts/ChartKit'
import MonthGlancePanel from '../components/MonthGlancePanel'
import { buildHourlyComparison, buildTodayGlance } from '../lib/dashboardInsights'
import { DASHBOARD_DAILY_BREAK_EVEN_INCOME } from '../lib/monthlyIncome'
import { canViewPage } from '../lib/permissions'
import BusyHoursCard from '../components/BusyHoursCard'
import ProductContributionCard from '../components/ProductContributionCard'
import { loadPaidOrdersForRange, mergePaidOrderHistory } from '../lib/orderHistory'
import { collectOrderIds, loadOrderItemCosts, withOrderItemCosts } from '../lib/orderItemColumns'
import { getOrdersNetProfit, getSaleProfitSummary, hasOrdersCostCoverage } from '../lib/profit'
import { RollingValue } from '../components/RollingNumber'

// ── Localisation ──────────────────────────────────────────────────────────────
const L = {
  uz: {
    title:          'Boshqaruv paneli',
    loyaltyIncome:  'Loyallik daromadi',
    netProfit:      'Sof foyda',
    activeBills:    'Faol hisoblar',
    needAttention:  'Diqqat talab qiladi',
    partialCost:    'Sotilgan ayrim taomlarda saqlangan tannarx yo‘q, foyda hisoblanmaydi',
    comparisonFailed:'Kechagi kun bilan taqqoslashni yuklab bo‘lmadi. Bugungi raqamlar to‘g‘ri.',
    retry:          'Qayta urinish',
    loyalty:        'Sodiqlik',
    lastUpdated:    'Oxirgi yangilanish',
    revenueStats:   'Daromad statistikasi',
    today:          'Bugun',
    yesterday:      'Kecha',
    paymentMethods: "To'lov usullari",
    cash:           'Naqd',
    card:           'Karta',
    terminal:       'Terminal',
    unknown:        "Noma'lum",
    salesByCategory:'Kategoriya bo\'yicha savdo',
    orderTypePerformance:'Buyurtma turi bo‘yicha savdo',
    topOrderType:    'Eng yaxshisi',
    noSales:        "Savdo ma'lumotlari yo'q",
    orders:         'buyurtma',
    revenue:        'Daromad',
    avgOrderShort:  "O'rtacha",
    items:          'taom',
    footer:         'Barcha ma\'lumotlar to\'langan buyurtmalarga asoslangan',
    loading:        'Yuklanmoqda…',
    noData:         "Ma'lumot yo'q",
    avgCheck:       'O‘rtacha chek',
    peakHour:       'Eng faol soat',
    sameTime:       'Kechaning shu vaqtiga',
    yesterdayPeak:  'Kechagi eng faol soat',
    sameTimeShort:  'kecha shu vaqtgacha',
    hourly:         'Soatlik daromad',
    noSalesYet:     'Bugun hali savdo yo‘q',
  },
  ru: {
    title:          'Панель управления',
    loyaltyIncome:  'Доход по лояльности',
    netProfit:      'Чистая прибыль',
    activeBills:    'Активные счета',
    needAttention:  'Требует внимания',
    partialCost:    'У части проданных блюд нет сохранённой себестоимости, прибыль не считается',
    comparisonFailed:'Не удалось загрузить сравнение со вчерашним днём. Сегодняшние цифры верны.',
    retry:          'Повторить',
    loyalty:        'Лояльность',
    lastUpdated:    'Последнее обновление',
    revenueStats:   'Статистика дохода',
    today:          'Сегодня',
    yesterday:      'Вчера',
    paymentMethods: 'Способы оплаты',
    cash:           'Наличные',
    card:           'Карта',
    terminal:       'Терминал',
    unknown:        'Неизвестно',
    salesByCategory:'Продажи по категориям',
    orderTypePerformance:'Продажи по типу заказа',
    topOrderType:    'Лучший',
    noSales:        'Данных о продажах нет',
    orders:         'заказов',
    revenue:        'Доход',
    avgOrderShort:  'Средний',
    items:          'блюд',
    footer:         'Все данные основаны на оплаченных заказах',
    loading:        'Загрузка…',
    noData:         'Нет данных',
    avgCheck:       'Средний чек',
    peakHour:       'Пиковый час',
    sameTime:       'К этому времени вчера',
    yesterdayPeak:  'Пиковый час вчера',
    sameTimeShort:  'вчера к этому часу',
    hourly:         'Доход по часам',
    noSalesYet:     'Сегодня продаж пока нет',
  },
  en: {
    title:          'Dashboard',
    loyaltyIncome:  'Loyalty income',
    netProfit:      'Net profit',
    activeBills:    'Active bills',
    needAttention:  'Needs attention',
    partialCost:    'Some sold items have no saved cost, so profit is not shown',
    comparisonFailed:'Could not load yesterday for comparison. Today’s figures are correct.',
    retry:          'Retry',
    loyalty:        'Loyalty',
    lastUpdated:    'Last updated',
    revenueStats:   'Income statistics',
    today:          'Today',
    yesterday:      'Yesterday',
    paymentMethods: 'Payment methods',
    cash:           'Cash',
    card:           'Card',
    terminal:       'Terminal',
    unknown:        'Unknown',
    salesByCategory:'Sales by category',
    orderTypePerformance:'Order type performance',
    topOrderType:    'Best',
    noSales:        'No sales data yet',
    orders:         'orders',
    revenue:        'Income',
    avgOrderShort:  'Avg',
    items:          'items',
    footer:         'All data is based on paid orders',
    loading:        'Loading…',
    noData:         'No data yet',
    avgCheck:       'Average check',
    peakHour:       'Peak hour',
    sameTime:       'By this time yesterday',
    yesterdayPeak:  'Yesterday’s peak hour',
    sameTimeShort:  'yesterday by now',
    hourly:         'Income by hour',
    noSalesYet:     'No sales yet today',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr()     { return restaurantTodayStr() }
function yesterdayStr() { return addRestaurantDays(todayStr(), -1) }

// ── Sub-components ────────────────────────────────────────────────────────────

function ShimmerBlock({ className = '' }) {
  return <Shimmer className={`rounded-lg ${className}`} />
}

const TODAY_COLOR = 'var(--ws-primary)'
const YESTERDAY_COLOR = 'var(--ws-muted-foreground)'

function hourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`
}

function KpiCard({ icon: Icon, label, value, sub, subColor, badge, highlight, tone = 'default', loading = false }) {
  const valueClass = highlight || tone === 'loss'
    ? 'text-[#c4262c]'
    : tone === 'profit'
      ? 'text-[#1d7a52]'
      : 'text-[#22201d]'

  return (
    <div aria-busy={loading} className="ws-panel flex h-full min-w-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="ws-caption first-letter:uppercase">{label}</p>
          {loading ? (
            <ShimmerBlock className="mt-2 h-6 w-2/3" />
          ) : (
            <p className={`mt-1 whitespace-nowrap text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${valueClass}`}><RollingValue value={value} /></p>
          )}
        </div>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
          <Icon size={16} />
        </div>
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          <ShimmerBlock className="h-3 w-1/2" />
          <ShimmerBlock className="h-3 w-5/6" />
        </div>
      ) : (badge || sub) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {badge && (
            <span className={`ws-badge tabular-nums ${badge.cls}`}>
              {badge.up !== null && (badge.up ? <ArrowUpRight /> : <ArrowDownRight />)}
              {badge.text}
            </span>
          )}
          {sub && <p className={`ws-caption leading-relaxed ${subColor || ''}`}>{sub}</p>}
        </div>
      )}
    </div>
  )
}

// Chart colours are theme tokens: a hex passed as an inline style or SVG attribute
// is invisible to the dark palette build. Card keeps its violet, which reads on both themes.
const PAYMENT_COLORS = {
  cash:     'var(--ws-positive)',
  card:     '#8b5cf6',
  terminal: 'var(--ws-info)',
  loyalty:  'var(--ws-caution)',
  unknown:  'var(--ws-input)',
}

const ORDER_TYPE_PERFORMANCE_STYLE = {
  game_club: { Icon: Package, bar: 'var(--ws-positive)' },
  dine_in: { Icon: Users, bar: 'var(--ws-primary)' },
  take_away: { Icon: ShoppingBag, bar: 'var(--ws-info)' },
  delivery: { Icon: Package, bar: '#8b5cf6' },
}

function DonutChart({ slices }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total === 0) return (
    <svg viewBox="0 0 36 36" className="w-28 h-28">
      <circle cx="18" cy="18" r="15.9" fill="none" style={{ stroke: 'var(--ws-muted)' }} strokeWidth="3.8" />
    </svg>
  )
  const circ = 2 * Math.PI * 15.9
  let offset = 0
  return (
    <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
      {slices.map((seg, i) => {
        const dash = (seg.value / total) * circ
        const el = (
          <circle key={i} cx="18" cy="18" r="15.9" fill="none"
            style={{ stroke: seg.color }} strokeWidth="3.8"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
          />
        )
        offset += dash
        return el
      })}
    </svg>
  )
}

function OrderTypePerformanceCard({ rows, lang }) {
  const l = L[lang] || L.en
  const maxRevenue = Math.max(...rows.map(row => row.revenue), 1)
  const topKey = rows.find(row => row.revenue > 0)?.key || ''

  return (
    <div className="ws-panel min-w-0">
      <div className="ws-panel-title mb-4">
        <h3 className="ws-heading">{l.orderTypePerformance}</h3>
        {topKey && (
          <span className="ws-badge ws-tone-accent">
            {l.topOrderType}: {rows.find(row => row.key === topKey)?.label}
          </span>
        )}
      </div>
      {/* Four order types: one row on wide screens, 2x2 below, never a lone orphan card. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {rows.map(row => {
          const visual = ORDER_TYPE_PERFORMANCE_STYLE[row.key] || ORDER_TYPE_PERFORMANCE_STYLE.dine_in
          const Icon = visual.Icon
          const width = row.revenue > 0 ? Math.max(6, Math.round((row.revenue / maxRevenue) * 100)) : 0
          const isTop = row.key === topKey

          return (
            <div key={row.key} className="min-w-0 rounded-[10px] bg-[#f6f5f3] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#22201d] truncate">{row.label}</p>
                    <p className="ws-caption truncate tabular-nums">{row.orders} {l.orders}</p>
                  </div>
                </div>
                {isTop && (
                  <span className="ws-badge ws-tone-accent flex-shrink-0">
                    {l.topOrderType}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-x-2">
                  <p className="whitespace-nowrap text-lg font-semibold tracking-[-.01em] tabular-nums text-[#22201d]">{formatCurrency(row.revenue)}</p>
                  <p className="ws-caption font-medium tabular-nums flex-shrink-0">{formatPercent(row.pct, lang, 0)}</p>
                </div>
                <div className="h-1.5 rounded-full bg-[#efece9] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: visual.bar }} />
                </div>
                <div className="ws-caption mt-2 flex flex-wrap items-center justify-between gap-x-2 tabular-nums">
                  <span>{row.items} {l.items}</span>
                  <span className="whitespace-nowrap">{l.avgOrderShort}: {formatCurrency(row.avgOrder)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = normalizeDateLang(state.lang || 'ru')
  // The month panel reads Accounting totals: only for people who may open Financial analysis.
  const showMonth = canViewPage(profile || { role: state.user?.role }, 'financial_analysis')
  const l    = L[lang] || L.en

  const displayName = profile?.full_name || state.user?.name || 'Admin'

  const [yesterdayHistoryOrders, setYesterdayHistoryOrders] = useState([])
  // A failed read of yesterday is a flag, not zeros: comparisons print "—" until a retry succeeds.
  const [historyError, setHistoryError] = useState(false)
  const [comparisonLoading, setComparisonLoading] = useState(true)
  const [comparisonRetry, setComparisonRetry] = useState(0)

  // The Dashboard shows today only. Today's paid orders already arrive with POS
  // hydration and stay live through realtime (state.orders), so the only fetch
  // is yesterday's paid orders for the comparison figures.
  useEffect(() => {
    let cancelled = false
    const yesterday = yesterdayStr()
    setHistoryError(false)
    setComparisonLoading(true)
    loadPaidOrdersForRange(yesterday, yesterday)
      .then(orders => {
        if (cancelled) return
        setYesterdayHistoryOrders(orders)
        setComparisonLoading(false)
      })
      .catch(error => {
        if (cancelled) return
        setYesterdayHistoryOrders([])
        console.error('[dashboard] yesterday comparison load failed:', error)
        setHistoryError(true)
        setComparisonLoading(false)
      })
    return () => { cancelled = true }
  }, [comparisonRetry])

  // ── Core derived sets ─────────────────────────────────────────────────────
  const rangeOrders = useMemo(
    () => mergePaidOrderHistory(yesterdayHistoryOrders, state.orders, yesterdayStr(), todayStr()),
    [yesterdayHistoryOrders, state.orders]
  )
  // POS hydration never carries cost snapshots (they stay out of waiter/cashier
  // payloads), so profit figures load them for the paid orders shown here.
  const paidOrderIdsKey = useMemo(
    () => [...new Set(collectOrderIds(rangeOrders.filter(isPaidOrder)))].sort().join(','),
    [rangeOrders]
  )
  const [itemCosts, setItemCosts] = useState(() => new Map())
  useEffect(() => {
    if (!paidOrderIdsKey) return undefined
    let cancelled = false
    loadOrderItemCosts(paidOrderIdsKey.split(','))
      .then(costs => { if (!cancelled) setItemCosts(costs) })
      .catch(error => { if (!cancelled) console.error('[dashboard] item cost load failed:', error) })
    return () => { cancelled = true }
  }, [paidOrderIdsKey])
  const paidOrders = useMemo(
    () => groupOrdersBySession(withOrderItemCosts(rangeOrders, itemCosts)).filter(isPaidOrder),
    [rangeOrders, itemCosts]
  )
  const todayPaidOrders = useMemo(() => getDashboardDayOrders(paidOrders, todayStr()), [paidOrders])
  const yesterdayPaidOrders = useMemo(() => getDashboardDayOrders(paidOrders, yesterdayStr()), [paidOrders])

  const menuItemMap = useMemo(
    () => Object.fromEntries(state.menuItems.map(m => [m.id, m])),
    [state.menuItems]
  )

  const categoryMap = useMemo(
    () => Object.fromEntries(state.categories.filter(c => c.id !== 'all').map(c => [c.id, c])),
    [state.categories]
  )

  // ── KPI: today's revenue & orders against yesterday ──────────────────────
  const {
    todayRevenue, todayLoyaltyIncome, yesterdayRevenue, revenueChange,
    todayNetProfit, todayProfitMargin, yesterdayNetProfit, netProfitChange,
    todayOrderCount, yesterdayOrderCount, orderChange,
  } = useMemo(() => {
    const currentRevenue = todayPaidOrders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
    const currentLoyaltyIncome = todayPaidOrders.reduce((sum, order) => sum + getOrderLoyaltyIncomeTotal(order), 0)
    const previousRevenue = yesterdayPaidOrders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
    const currentNetProfit = getOrdersNetProfit(todayPaidOrders, menuItemMap)
    const previousNetProfit = getOrdersNetProfit(yesterdayPaidOrders, menuItemMap)
    const currentOrderCount = todayPaidOrders.length
    const previousCount = yesterdayPaidOrders.length
    return {
      todayRevenue: currentRevenue,
      todayLoyaltyIncome: currentLoyaltyIncome,
      yesterdayRevenue: previousRevenue,
      revenueChange: previousRevenue > 0
        ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100)
        : null,
      todayNetProfit: currentNetProfit,
      todayProfitMargin: getSaleProfitSummary(
        currentRevenue,
        currentRevenue - currentNetProfit
      )?.marginPct ?? null,
      yesterdayNetProfit: previousNetProfit,
      netProfitChange: previousNetProfit > 0
        ? Math.round(((currentNetProfit - previousNetProfit) / previousNetProfit) * 100)
        : null,
      todayOrderCount: currentOrderCount,
      yesterdayOrderCount: previousCount,
      orderChange: previousCount > 0
        ? Math.round(((currentOrderCount - previousCount) / previousCount) * 100)
        : null,
    }
  }, [todayPaidOrders, yesterdayPaidOrders, menuItemMap])

  // Net profit is only a number when every sold item carries its cost snapshot;
  // a missing cost would count as zero and overstate the profit.
  const todayCostCovered = useMemo(() => hasOrdersCostCoverage(todayPaidOrders), [todayPaidOrders])
  const yesterdayCostCovered = useMemo(() => hasOrdersCostCoverage(yesterdayPaidOrders), [yesterdayPaidOrders])
  const yesterdayKnown = !historyError

  const activeBills = useMemo(
    () => state.tables.filter(t => t.status === 'needs_bill').length,
    [state.tables]
  )

  // ── Hourly income chart & comparison with yesterday ──────────────────────
  // Yesterday up to the same hour is the fair comparison while today is still running.
  const hourly = useMemo(() => buildHourlyComparison(
    todayPaidOrders,
    yesterdayPaidOrders,
    getRestaurantHour(new Date()),
    { hourOf: order => getRestaurantHour(getOrderDate(order)), revenueOf: getOrderRevenueTotal },
  ), [todayPaidOrders, yesterdayPaidOrders])
  const todayGlance = useMemo(
    () => buildTodayGlance(hourly, { orderCount: todayOrderCount, revenue: todayRevenue }),
    [hourly, todayOrderCount, todayRevenue]
  )

  // ── Payment methods breakdown ─────────────────────────────────────────────
  const paymentMethods = useMemo(() => {
    return getDashboardPaymentMethods(todayPaidOrders, {
      cash: l.cash,
      card: l.card,
      terminal: l.terminal,
      loyalty: l.loyalty,
      unknown: l.unknown,
      colors: PAYMENT_COLORS,
    }).map(row => ({
      ...row,
      color: row.color || PAYMENT_COLORS[row.key] || PAYMENT_COLORS.unknown,
    }))
  }, [todayPaidOrders, l])

  // ── Sales by category ─────────────────────────────────────────────────────
  const salesByCategory = useMemo(() => {
    return getDashboardSalesByCategory(todayPaidOrders, menuItemMap, categoryMap, lang)
  }, [todayPaidOrders, menuItemMap, categoryMap, lang])

  // ── Sales by order type ───────────────────────────────────────────────────
  const orderTypePerformance = useMemo(() => {
    return getDashboardOrderTypePerformance(todayPaidOrders, lang)
  }, [todayPaidOrders, lang])

  const productContribution = useMemo(() => {
    return getDashboardProductContribution(todayPaidOrders, menuItemMap)
  }, [todayPaidOrders, menuItemMap])

  // ── KPI badges ────────────────────────────────────────────────────────────
  function pctBadge(change) {
    if (change === null) return null
    return {
      text: `${change > 0 ? '+' : ''}${formatPercent(change, lang, 0)}`,
      cls:  change >= 0 ? 'ws-tone-positive' : 'ws-tone-negative',
      up:   change >= 0,
    }
  }

  const lastUpdated = formatReadableDateTime(new Date())

  if (!state.loaded) {
    return (
      <AppShell title={l.title}>
        <PageShimmer layout="dashboard" label={l.loading} />
      </AppShell>
    )
  }

  const headerActions = (
    <span className="ws-caption hidden items-center gap-1.5 tabular-nums xl:inline-flex">
      <Clock size={13} />
      {lastUpdated}
    </span>
  )

  return (
    <AppShell title={l.title} headerActions={headerActions}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page min-w-0 overflow-x-hidden">

        {historyError && (
          <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-3">
            <span>{l.comparisonFailed}</span>
            <button type="button" onClick={() => setComparisonRetry(value => value + 1)} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>
          </div>
        )}

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            icon={TrendingUp}
            loading={comparisonLoading}
            label={`${l.revenue} · ${l.today}`}
            value={formatCurrency(todayRevenue)}
            sub={`${l.loyaltyIncome}: ${formatCurrency(todayLoyaltyIncome)} · ${l.yesterday}: ${yesterdayKnown ? formatCurrency(yesterdayRevenue) : '—'}`}
            badge={yesterdayKnown ? pctBadge(revenueChange) : null}
          />
          <KpiCard
            icon={BadgeDollarSign}
            loading={comparisonLoading}
            label={`${l.netProfit} · ${l.today}`}
            value={todayCostCovered ? formatCurrencyWithPercentage(todayNetProfit, todayProfitMargin, lang) : '—'}
            sub={todayCostCovered
              ? `${l.yesterday}: ${yesterdayKnown && yesterdayCostCovered ? formatCurrency(yesterdayNetProfit) : '—'}`
              : l.partialCost}
            subColor={todayCostCovered ? '' : '!text-[#9a5a00]'}
            badge={todayCostCovered && yesterdayKnown && yesterdayCostCovered ? pctBadge(netProfitChange) : null}
            tone={!todayCostCovered ? 'default' : todayNetProfit < 0 ? 'loss' : 'profit'}
          />
          <KpiCard
            icon={ShoppingBag}
            loading={comparisonLoading}
            label={`${l.orders} · ${l.today}`}
            value={todayOrderCount}
            sub={`${l.yesterday}: ${yesterdayKnown ? yesterdayOrderCount : '—'}`}
            badge={yesterdayKnown ? pctBadge(orderChange) : null}
          />
          <KpiCard
            icon={Receipt}
            label={l.activeBills}
            value={activeBills}
            sub={activeBills > 0 ? l.needAttention : '—'}
            subColor={activeBills > 0 ? '!text-[#9a5a00] font-medium' : ''}
          />
        </div>

        {/* ── Row 2: Revenue Statistics + Payment Methods ── */}
        <div className="grid grid-cols-12 gap-4 min-w-0">

          {/* Revenue Statistics — left 2 cols */}
          <div className="ws-panel col-span-12 xl:col-span-8 min-w-0">
            <div className="mb-4">
              <h3 className="ws-heading">{l.revenueStats}</h3>
            </div>

            {/* Today at a glance: the figures a glance should answer, beside the hourly chart. */}
            <div className="mb-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 2xl:grid-cols-4">
              {[
                { key: 'avgCheck', label: l.avgCheck, value: todayGlance.averageCheck == null ? '—' : formatCurrency(todayGlance.averageCheck) },
                { key: 'peak', label: l.peakHour, value: todayGlance.peakHour ? hourLabel(todayGlance.peakHour.hour) : '—', sub: todayGlance.peakHour ? formatCurrency(todayGlance.peakHour.amount) : '' },
                {
                  key: 'sameTime',
                  label: l.sameTime,
                  value: comparisonLoading ? null : historyError ? '—' : formatCurrency(todayGlance.sameTimeYesterday),
                  badge: !comparisonLoading && !historyError ? pctBadge(todayGlance.sameTimeChangePct) : null,
                },
                {
                  key: 'yesterdayPeak',
                  label: l.yesterdayPeak,
                  value: comparisonLoading ? null : historyError || !todayGlance.yesterdayPeakHour ? '—' : hourLabel(todayGlance.yesterdayPeakHour.hour),
                  sub: todayGlance.yesterdayPeakHour && !historyError ? formatCurrency(todayGlance.yesterdayPeakHour.amount) : '',
                },
              ].map(stat => (
                <div key={stat.key} className="min-w-0 rounded-[10px] bg-[#f6f5f3] px-4 py-3">
                  <p className="ws-caption truncate">{stat.label}</p>
                  {stat.value == null
                    ? <ShimmerBlock className="mt-2 h-5 w-2/3" />
                    : <p className="mt-1 whitespace-nowrap text-lg font-semibold tracking-[-.01em] tabular-nums text-[#22201d]">{stat.value}</p>}
                  {(stat.sub || stat.badge) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {stat.badge && (
                        <span className={`ws-badge tabular-nums ${stat.badge.cls}`}>
                          {stat.badge.up ? <ArrowUpRight /> : <ArrowDownRight />}
                          {stat.badge.text}
                        </span>
                      )}
                      {stat.sub && <span className="ws-caption whitespace-nowrap tabular-nums">{stat.sub}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <ChartLegend
              label={l.hourly}
              items={[
                { key: 'today', label: l.today, color: TODAY_COLOR },
                { key: 'yesterday', label: l.yesterday, color: YESTERDAY_COLOR, kind: 'line', dash: CHART_DASH.average },
              ]}
            />
            {hourly.every(row => !row.today && !row.yesterday) ? (
              <p className="ws-empty !py-6">{l.noSalesYet}</p>
            ) : (
              <BarChart
                rows={hourly}
                rowKey={row => row.hour}
                series={[{ key: 'today', color: TODAY_COLOR }]}
                value={(row, key) => Number(row[key]) || 0}
                lang={lang}
                height={220}
                minSlot={18}
                lines={historyError || comparisonLoading ? [] : [{ key: 'yesterday', color: YESTERDAY_COLOR, values: hourly.map(row => row.yesterday), dash: CHART_DASH.average }]}
                xLabel={row => hourLabel(row.hour)}
                rowLabel={row => `${hourLabel(row.hour)} · ${formatCurrency(row.today || 0)}`}
                ariaLabel={l.hourly}
                tooltip={row => ({
                  title: `${hourLabel(row.hour)}–${hourLabel((row.hour + 1) % 24)}`,
                  rows: [
                    ...(row.today != null ? [{ key: 'today', label: l.today, color: TODAY_COLOR, value: formatCurrency(row.today) }] : []),
                    ...(!historyError && !comparisonLoading ? [{ key: 'yesterday', label: l.yesterday, color: YESTERDAY_COLOR, kind: 'line', dash: CHART_DASH.average, value: formatCurrency(row.yesterday) }] : []),
                  ],
                })}
              />
            )}
          </div>

          {/* Payment Methods */}
          <div className="ws-panel col-span-12 xl:col-span-4 min-w-0">
            <h3 className="ws-heading mb-4">{l.paymentMethods}</h3>
            {paymentMethods.length === 0 ? (
              <p className="ws-empty !py-6">{l.noData}</p>
            ) : (
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative flex-shrink-0">
                  <DonutChart slices={paymentMethods.map(p => ({ value: p.amount, color: p.color }))} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="whitespace-nowrap font-semibold text-[#22201d] text-xs leading-none tabular-nums">{formatGroupedNumber(paymentMethods.reduce((s, p) => s + p.amount, 0))}</p>
                  </div>
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  {paymentMethods.map(p => (
                    <div key={p.key} className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                        <span className="text-xs text-[#68655f] flex-1 truncate">{p.label}</span>
                        <span className="text-xs font-semibold text-[#22201d] tabular-nums flex-shrink-0">{formatPercent(p.pct, lang, 0)}</span>
                      </div>
                      <p className="whitespace-nowrap pl-4 text-xs font-medium text-[#22201d] tabular-nums">{formatCurrency(p.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {showMonth && (
          <MonthGlancePanel
            lang={lang}
            today={todayStr()}
            fallbackTarget={state.settings?.averageDailyBreakEvenIncomeUzs ?? DASHBOARD_DAILY_BREAK_EVEN_INCOME}
            onOpen={() => navigate('/admin/financial-analysis')}
          />
        )}

        <OrderTypePerformanceCard rows={orderTypePerformance} lang={lang} />

        {/* ── Row 3: Sales by Category + Best-Selling + Busy Hours ── */}
        <div className="grid grid-cols-12 gap-4 min-w-0">

          {/* Sales by Category */}
          <div className="ws-panel col-span-12 xl:col-span-4 flex min-h-0 min-w-0 flex-col">
            <h3 className="ws-heading mb-3">{l.salesByCategory} · {l.today}</h3>
            {salesByCategory.length === 0 ? (
              <p className="ws-empty !py-6">{l.noSales}</p>
            ) : (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {salesByCategory.map(cat => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <p className="text-xs font-medium text-[#22201d] truncate flex-1">{cat.name}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="whitespace-nowrap text-xs font-semibold text-[#22201d] tabular-nums">{formatCurrency(cat.revenue)}</p>
                        <p className="text-xs text-[#68655f] tabular-nums w-9 text-right">{formatPercent(cat.pct, lang, 0)}</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#efece9] rounded-full overflow-hidden">
                      <div className="h-full bg-[#ff5a00] rounded-full" style={{ width: `${cat.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ProductContributionCard rows={productContribution} lang={lang} periodLabel={l.today} />

          <BusyHoursCard lang={lang} />
        </div>

        {/* Footer */}
        <p className="ws-caption text-center">
          {l.footer} • {l.lastUpdated}: <span className="whitespace-nowrap">{lastUpdated}</span>
        </p>

        </div>
      </div>
    </AppShell>
  )
}
