import React, { useMemo, useEffect, useRef, useState } from 'react'
import {
  TrendingUp, ShoppingBag, Package, Receipt,
  Clock, ArrowUpRight, ArrowDownRight, Users,
  BadgeDollarSign,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, formatCurrencyWithPercentage } from '../lib/formatCurrency'
import { formatLongDate, normalizeDateLang } from '../lib/dateFormat'
import {
  addRestaurantDays,
  getRestaurantHour,
  getOrderDate,
  getOrderLoyaltyIncomeTotal,
  getOrderRevenueTotal,
  groupOrdersBySession,
  isPaidOrder,
  restaurantTodayStr,
  toRestaurantDateStr,
} from '../lib/analytics'
import {
  formatReadableDateTime,
  getDashboardProductContribution,
  getDashboardOrderTypePerformance,
  getDashboardPaymentMethods,
  getDashboardPeriodOrders,
  getRollingDashboardMonthRange,
  getDashboardSalesByCategory,
} from '../lib/dashboardAnalytics'
import AppShell from '../components/AppShell'
import PageShimmer from '../components/PageShimmer'
import BusyHoursCard from '../components/BusyHoursCard'
import ProductContributionCard from '../components/ProductContributionCard'
import { loadPaidOrdersForRange, mergePaidOrderHistory } from '../lib/orderHistory'
import { getOrdersNetProfit, getSaleProfitSummary } from '../lib/profit'

// ── Localisation ──────────────────────────────────────────────────────────────
const L = {
  uz: {
    title:          'Boshqaruv paneli',
    loyaltyIncome:  'Loyallik daromadi',
    netProfit:      'Sof foyda',
    activeBills:    'Faol hisoblar',
    needAttention:  'DIQQAT TALAB QILADI',
    revenueStats:   'Daromad statistikasi',
    today:          'Bugun',
    days7:          '7 kun',
    rollingMonth:   'Oy',
    thisMonth:      'Bu oy',
    prevPeriod:     'Oldingi davr',
    thisPeriod:     'Bu davr',
    growth:         'O\'sish',
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
    loading:        'Yuklanmoqda...',
    noData:         "Ma'lumot yo'q",
  },
  ru: {
    title:          'Панель управления',
    loyaltyIncome:  'Доход по лояльности',
    netProfit:      'Чистая прибыль',
    activeBills:    'Активные счета',
    needAttention:  'ТРЕБУЕТ ВНИМАНИЯ',
    revenueStats:   'Статистика дохода',
    today:          'Сегодня',
    days7:          '7 дней',
    rollingMonth:   'Месяц',
    thisMonth:      'Этот месяц',
    prevPeriod:     'Предыдущий период',
    thisPeriod:     'Этот период',
    growth:         'Рост',
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
    loading:        'Загрузка...',
    noData:         'Нет данных',
  },
  en: {
    title:          'Dashboard',
    loyaltyIncome:  'Loyalty income',
    netProfit:      'Net Profit',
    activeBills:    'Active Bills',
    needAttention:  'NEED ATTENTION',
    revenueStats:   'Income Statistics',
    today:          'Today',
    days7:          '7 Days',
    rollingMonth:   'Month',
    thisMonth:      'This Month',
    prevPeriod:     'Previous Period',
    thisPeriod:     'This Period',
    growth:         'Growth',
    paymentMethods: 'Payment Methods',
    cash:           'Cash',
    card:           'Card',
    terminal:       'Terminal',
    unknown:        'Unknown',
    salesByCategory:'Sales by Category',
    orderTypePerformance:'Order Type Performance',
    topOrderType:    'Best',
    noSales:        'No sales data yet',
    orders:         'orders',
    revenue:        'Income',
    avgOrderShort:  'Avg',
    items:          'items',
    footer:         'All data is based on paid orders',
    loading:        'Loading...',
    noData:         'No data yet',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d) {
  return toRestaurantDateStr(d)
}

function todayStr()     { return restaurantTodayStr() }
function yesterdayStr() { return addRestaurantDays(todayStr(), -1) }

function dashboardPeriodLabel(period, lang) {
  const labels = {
    uz: { today: 'Bugun', '7days': '7 kun', rollingMonth: 'Oy', month: 'Bu oy', year: 'Bu yil' },
    ru: { today: 'Сегодня', '7days': '7 дней', rollingMonth: 'Месяц', month: 'Этот месяц', year: 'Этот год' },
    en: { today: 'Today', '7days': '7 days', rollingMonth: 'Month', month: 'This month', year: 'This year' },
  }
  return (labels[lang] || labels.en)[period] || (labels[lang] || labels.en)['7days']
}

function previousDashboardPeriodLabel(period, lang, fallback) {
  if (period !== 'today') return fallback
  if (lang === 'uz') return 'Kecha'
  if (lang === 'ru') return 'Вчера'
  return 'Yesterday'
}

function getPreviousDashboardPeriodOrders(orders, period) {
  const todayDs = todayStr()

  if (period === 'today') {
    const yesterday = addRestaurantDays(todayDs, -1)
    return orders.filter(order => localDateStr(getOrderDate(order)) === yesterday)
  }

  if (period === '7days') {
    const days = new Set(Array.from({ length: 7 }, (_, index) => addRestaurantDays(todayDs, -(13 - index))))
    return orders.filter(order => days.has(localDateStr(getOrderDate(order))))
  }

  if (period === 'rollingMonth') {
    const range = getRollingDashboardMonthRange(todayDs)
    const previousStart = addRestaurantDays(range.dateFrom, -range.dayCount)
    const previousEnd = addRestaurantDays(range.dateFrom, -1)
    return orders.filter(order => {
      const date = localDateStr(getOrderDate(order))
      return date >= previousStart && date <= previousEnd
    })
  }

  if (period === 'month') {
    const [year, monthNumber] = todayDs.split('-').map(Number)
    const month = monthNumber - 1
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    const prefix = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-`
    return orders.filter(order => localDateStr(getOrderDate(order)).startsWith(prefix))
  }

  const year = Number(todayDs.slice(0, 4)) - 1
  return orders.filter(order => localDateStr(getOrderDate(order)).startsWith(`${year}-`))
}

function getDashboardHistoryRange(period, today = todayStr()) {
  if (period === 'today') return { dateFrom: addRestaurantDays(today, -1), dateTo: today }
  if (period === '7days') return { dateFrom: addRestaurantDays(today, -13), dateTo: today }
  if (period === 'rollingMonth') {
    const range = getRollingDashboardMonthRange(today)
    return { dateFrom: addRestaurantDays(range.dateFrom, -range.dayCount), dateTo: today }
  }
  if (period === 'month') {
    const previousMonthEnd = addRestaurantDays(`${today.slice(0, 8)}01`, -1)
    return { dateFrom: `${previousMonthEnd.slice(0, 8)}01`, dateTo: today }
  }
  return { dateFrom: `${Number(today.slice(0, 4)) - 1}-01-01`, dateTo: today }
}

function dashboardHistoryRangeKey(range) {
  return `${range.dateFrom}:${range.dateTo}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ShimmerBlock({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-[#efece9] ${className}`}
    />
  )
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
          <p className="ws-caption">{label}</p>
          {loading ? (
            <ShimmerBlock className="mt-2 h-6 w-2/3" />
          ) : (
            <p className={`mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${valueClass}`}>{value}</p>
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

function ChartShimmer() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="flex h-36 items-end gap-2 mb-4">
        {[28, 44, 35, 62, 48, 78, 56, 88, 68, 96, 74, 84].map((height, index) => (
          <div key={index} className="flex-1 rounded-t-md bg-[#efece9]" style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-[#e4e1de] pt-3">
        <ShimmerBlock className="h-9 w-4/5" />
        <ShimmerBlock className="h-9 w-4/5" />
        <ShimmerBlock className="h-9 w-3/5" />
      </div>
    </div>
  )
}

function ListShimmer({ rows = 5, withAvatar = false }) {
  return (
    <div className="animate-pulse space-y-3 py-1" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          {withAvatar && <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-[#efece9]" />}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <ShimmerBlock className="h-3 w-2/5" />
              <ShimmerBlock className="h-3 w-1/4" />
            </div>
            <ShimmerBlock className="h-1.5 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

const PAYMENT_COLORS = {
  cash:     '#1d7a52',
  card:     '#8b5cf6',
  terminal: '#2a6fdb',
  loyalty:  '#9a5a00',
  unknown:  '#dcd9d6',
}

const ORDER_TYPE_PERFORMANCE_STYLE = {
  game_club: { Icon: Package, bar: '#1d7a52' },
  dine_in: { Icon: Users, bar: '#ff5a00' },
  take_away: { Icon: ShoppingBag, bar: '#2a6fdb' },
  delivery: { Icon: Package, bar: '#8b5cf6' },
}

function DonutChart({ slices }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total === 0) return (
    <svg viewBox="0 0 36 36" className="w-28 h-28">
      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#efece9" strokeWidth="3.8" />
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
            stroke={seg.color} strokeWidth="3.8"
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

function OrderTypePerformanceCard({ rows, lang, loading = false }) {
  const l = L[lang] || L.en
  const maxRevenue = Math.max(...rows.map(row => row.revenue), 1)
  const topKey = rows.find(row => row.revenue > 0)?.key || ''

  return (
    <div aria-busy={loading} className="ws-panel min-w-0">
      <div className="ws-panel-title mb-4">
        <h3 className="ws-heading">{l.orderTypePerformance}</h3>
        {!loading && topKey && (
          <span className="ws-badge ws-tone-accent">
            {l.topOrderType}: {rows.find(row => row.key === topKey)?.label}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {loading ? Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-[10px] border border-[#e4e1de] px-4 py-3" aria-hidden="true">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[#efece9]" />
              <div className="flex-1 space-y-2">
                <ShimmerBlock className="h-3 w-2/5" />
                <ShimmerBlock className="h-3 w-1/4" />
              </div>
            </div>
            <ShimmerBlock className="mt-4 h-5 w-3/5" />
            <ShimmerBlock className="mt-3 h-1.5 w-full" />
          </div>
        )) : rows.map(row => {
          const visual = ORDER_TYPE_PERFORMANCE_STYLE[row.key] || ORDER_TYPE_PERFORMANCE_STYLE.dine_in
          const Icon = visual.Icon
          const width = row.revenue > 0 ? Math.max(6, Math.round((row.revenue / maxRevenue) * 100)) : 0
          const isTop = row.key === topKey

          return (
            <div key={row.key} className="min-w-0 rounded-[10px] border border-[#e4e1de] bg-white px-4 py-3">
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
                <div className="flex items-end justify-between gap-2 mb-2">
                  <p className="text-lg font-semibold tracking-[-.01em] tabular-nums truncate text-[#22201d]">{formatCurrency(row.revenue)}</p>
                  <p className="ws-caption font-medium tabular-nums flex-shrink-0">{row.pct}%</p>
                </div>
                <div className="h-1.5 rounded-full bg-[#efece9] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: visual.bar }} />
                </div>
                <div className="ws-caption mt-2 flex items-center justify-between gap-2 tabular-nums">
                  <span>{row.items} {l.items}</span>
                  <span>{l.avgOrderShort}: {formatCurrency(row.avgOrder)}</span>
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
  const lang = normalizeDateLang(state.lang || 'ru')
  const l    = L[lang] || L.en

  const displayName = profile?.full_name || state.user?.name || 'Admin'

  const [period, setPeriod]           = useState('today')
  const [paidHistoryOrders, setPaidHistoryOrders] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [loadedHistoryRangeKey, setLoadedHistoryRangeKey] = useState('')

  const dashboardHistoryRange = useMemo(() => getDashboardHistoryRange(period), [period])
  const requestedHistoryRangeKey = dashboardHistoryRangeKey(dashboardHistoryRange)
  const analyticsLoading = historyLoading || loadedHistoryRangeKey !== requestedHistoryRangeKey

  // Today's paid orders already arrive with POS hydration and stay live through
  // realtime (state.orders), so only completed days are fetched here. Those are
  // immutable, so each range is fetched once per visit and reused when the
  // period is switched back.
  const historyCache = useRef(new Map())
  useEffect(() => {
    let cancelled = false
    const requestRangeKey = dashboardHistoryRangeKey(dashboardHistoryRange)
    const pastDateTo = addRestaurantDays(dashboardHistoryRange.dateTo, -1)
    const cached = historyCache.current.get(requestRangeKey)
    setHistoryError('')
    if (cached) {
      setPaidHistoryOrders(cached)
      setLoadedHistoryRangeKey(requestRangeKey)
      setHistoryLoading(false)
      return undefined
    }
    setHistoryLoading(true)
    loadPaidOrdersForRange(dashboardHistoryRange.dateFrom, pastDateTo)
      .then(orders => {
        historyCache.current.set(requestRangeKey, orders)
        if (cancelled) return
        setPaidHistoryOrders(orders)
        setLoadedHistoryRangeKey(requestRangeKey)
        setHistoryLoading(false)
      })
      .catch(error => {
        if (cancelled) return
        setPaidHistoryOrders([])
        setLoadedHistoryRangeKey(requestRangeKey)
        setHistoryError(error?.message || 'Could not load complete dashboard history')
        setHistoryLoading(false)
      })
    return () => { cancelled = true }
  }, [dashboardHistoryRange])

  // ── Core derived sets ─────────────────────────────────────────────────────
  const dashboardOrders = useMemo(
    () => mergePaidOrderHistory(
      paidHistoryOrders,
      state.orders,
      dashboardHistoryRange.dateFrom,
      dashboardHistoryRange.dateTo,
    ),
    [paidHistoryOrders, state.orders, dashboardHistoryRange]
  )
  const paidOrders = useMemo(
    () => groupOrdersBySession(dashboardOrders).filter(isPaidOrder),
    [dashboardOrders]
  )

  const periodPaidOrders = useMemo(
    () => getDashboardPeriodOrders(paidOrders, period),
    [paidOrders, period]
  )

  const menuItemMap = useMemo(
    () => Object.fromEntries(state.menuItems.map(m => [m.id, m])),
    [state.menuItems]
  )

  const categoryMap = useMemo(
    () => Object.fromEntries(state.categories.filter(c => c.id !== 'all').map(c => [c.id, c])),
    [state.categories]
  )

  // ── KPI: selected period revenue & orders ─────────────────────────────────
  const previousPeriodOrders = useMemo(
    () => getPreviousDashboardPeriodOrders(paidOrders, period),
    [paidOrders, period]
  )

  const {
    periodRevenue, periodLoyaltyIncome, previousKpiRevenue, revenueChange,
    periodNetProfit, periodProfitMargin, previousKpiNetProfit, netProfitChange,
    periodOrderCount, previousOrderCount, orderChange,
  } = useMemo(() => {
    const currentRevenue = periodPaidOrders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
    const currentLoyaltyIncome = periodPaidOrders.reduce((sum, order) => sum + getOrderLoyaltyIncomeTotal(order), 0)
    const previousRevenue = previousPeriodOrders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
    const currentNetProfit = getOrdersNetProfit(periodPaidOrders, menuItemMap)
    const previousNetProfit = getOrdersNetProfit(previousPeriodOrders, menuItemMap)
    const currentOrderCount = periodPaidOrders.length
    const previousCount = previousPeriodOrders.length
    return {
      periodRevenue: currentRevenue,
      periodLoyaltyIncome: currentLoyaltyIncome,
      previousKpiRevenue: previousRevenue,
      revenueChange: previousRevenue > 0
        ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100)
        : null,
      periodNetProfit: currentNetProfit,
      periodProfitMargin: getSaleProfitSummary(
        currentRevenue,
        currentRevenue - currentNetProfit
      )?.marginPct ?? null,
      previousKpiNetProfit: previousNetProfit,
      netProfitChange: previousNetProfit > 0
        ? Math.round(((currentNetProfit - previousNetProfit) / previousNetProfit) * 100)
        : null,
      periodOrderCount: currentOrderCount,
      previousOrderCount: previousCount,
      orderChange: previousCount > 0
        ? Math.round(((currentOrderCount - previousCount) / previousCount) * 100)
        : null,
    }
  }, [periodPaidOrders, previousPeriodOrders, menuItemMap])

  const activeBills = useMemo(
    () => state.tables.filter(t => t.status === 'needs_bill').length,
    [state.tables]
  )

  // ── Revenue chart & period comparison ─────────────────────────────────────
  const { chartBars, currentPeriodTotal, previousPeriodTotal } = useMemo(() => {
    const now = new Date()

    if (period === 'today') {
      const today = todayStr()
      const yesterday = yesterdayStr()
      const todayPaid = paidOrders.filter(o => localDateStr(getOrderDate(o)) === today)
      const yestPaid  = paidOrders.filter(o => localDateStr(getOrderDate(o)) === yesterday)
      const currentHour = getRestaurantHour(now)
      const bars = Array.from({ length: currentHour + 1 }, (_, h) => ({
        label:   `${h}:00`,
        revenue: todayPaid
          .filter(o => getRestaurantHour(getOrderDate(o)) === h)
          .reduce((s, o) => s + getOrderRevenueTotal(o), 0),
        isToday: h === currentHour,
      }))
      return {
        chartBars: bars,
        currentPeriodTotal:  todayPaid.reduce((s, o) => s + getOrderRevenueTotal(o), 0),
        previousPeriodTotal: yestPaid.reduce((s, o) => s + getOrderRevenueTotal(o), 0),
      }
    }

    if (period === '7days') {
      const todayDs = todayStr()
      const days = Array.from({ length: 7 }, (_, i) => addRestaurantDays(todayDs, -(6 - i)))
      const prev = Array.from({ length: 7 }, (_, i) => addRestaurantDays(todayDs, -(13 - i)))
      const bars = days.map(ds => ({
        label:   formatLongDate(ds, lang, ds, { includeYear: false }),
        revenue: paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s, o) => s + getOrderRevenueTotal(o), 0),
        isToday: ds === todayDs,
      }))
      const prevTotal = prev.reduce((s, ds) =>
        s + paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s2, o) => s2 + getOrderRevenueTotal(o), 0), 0)
      return {
        chartBars: bars,
        currentPeriodTotal:  bars.reduce((s, b) => s + b.revenue, 0),
        previousPeriodTotal: prevTotal,
      }
    }

    if (period === 'rollingMonth') {
      const range = getRollingDashboardMonthRange(todayStr())
      const days = Array.from({ length: range.dayCount }, (_, index) => addRestaurantDays(range.dateFrom, index))
      const previousStart = addRestaurantDays(range.dateFrom, -range.dayCount)
      const previousDays = Array.from({ length: range.dayCount }, (_, index) => addRestaurantDays(previousStart, index))
      const bars = days.map(date => ({
        label: formatLongDate(date, lang, date, { includeYear: false }),
        revenue: paidOrders
          .filter(order => localDateStr(getOrderDate(order)) === date)
          .reduce((sum, order) => sum + getOrderRevenueTotal(order), 0),
        isToday: date === range.dateTo,
      }))
      const previousPeriodTotal = previousDays.reduce((sum, date) => (
        sum + paidOrders
          .filter(order => localDateStr(getOrderDate(order)) === date)
          .reduce((dateSum, order) => dateSum + getOrderRevenueTotal(order), 0)
      ), 0)
      return {
        chartBars: bars,
        currentPeriodTotal: bars.reduce((sum, bar) => sum + bar.revenue, 0),
        previousPeriodTotal,
      }
    }

    if (period === 'month') {
      const todayDs = todayStr()
      const [year, monthNumber] = todayDs.split('-').map(Number)
      const month = monthNumber - 1
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      const bars = Array.from({ length: daysInMonth }, (_, i) => {
        const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
        return {
          label:   String(i + 1),
          revenue: paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s, o) => s + getOrderRevenueTotal(o), 0),
          isToday: ds === todayDs,
        }
      })
      // Previous month
      const prevMonth     = month === 0 ? 11 : month - 1
      const prevYear      = month === 0 ? year - 1 : year
      const daysInPrevMonth = new Date(Date.UTC(prevYear, prevMonth + 1, 0)).getUTCDate()
      const prevTotal = Array.from({ length: daysInPrevMonth }, (_, i) => {
        const ds = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
        return paidOrders.filter(o => localDateStr(getOrderDate(o)) === ds).reduce((s, o) => s + getOrderRevenueTotal(o), 0)
      }).reduce((s, v) => s + v, 0)
      return {
        chartBars: bars,
        currentPeriodTotal:  bars.reduce((s, b) => s + b.revenue, 0),
        previousPeriodTotal: prevTotal,
      }
    }

    // year
    const todayDs = todayStr()
    const year = Number(todayDs.slice(0, 4))
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const bars = Array.from({ length: 12 }, (_, m) => {
      const prefix = `${year}-${String(m + 1).padStart(2, '0')}-`
      return {
        label:   monthNames[m],
        revenue: paidOrders.filter(o => localDateStr(getOrderDate(o)).startsWith(prefix)).reduce((s, o) => s + getOrderRevenueTotal(o), 0),
        isToday: todayDs.startsWith(prefix),
      }
    })
    return {
      chartBars: bars,
      currentPeriodTotal:  bars.reduce((s, b) => s + b.revenue, 0),
      previousPeriodTotal: 0, // prior year data not loaded
    }
  }, [paidOrders, period, lang])

  const periodGrowth = useMemo(() => {
    if (previousPeriodTotal === 0) return null
    return Math.round(((currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal) * 100)
  }, [currentPeriodTotal, previousPeriodTotal])

  // ── Payment methods breakdown ─────────────────────────────────────────────
  const paymentMethods = useMemo(() => {
    return getDashboardPaymentMethods(periodPaidOrders, {
      cash: l.cash,
      card: l.card,
      terminal: l.terminal,
      loyalty: lang === 'uz' ? 'Sodiqlik' : lang === 'ru' ? 'Лояльность' : 'Loyalty',
      unknown: l.unknown,
      colors: PAYMENT_COLORS,
    }).map(row => ({
      ...row,
      color: row.color || PAYMENT_COLORS[row.key] || PAYMENT_COLORS.unknown,
    }))
  }, [periodPaidOrders, l])

  // ── Sales by category ─────────────────────────────────────────────────────
  const salesByCategory = useMemo(() => {
    return getDashboardSalesByCategory(periodPaidOrders, menuItemMap, categoryMap, lang)
  }, [periodPaidOrders, menuItemMap, categoryMap, lang])

  // ── Sales by order type ───────────────────────────────────────────────────
  const orderTypePerformance = useMemo(() => {
    return getDashboardOrderTypePerformance(periodPaidOrders, lang)
  }, [periodPaidOrders, lang])

  const productContribution = useMemo(() => {
    return getDashboardProductContribution(periodPaidOrders, menuItemMap)
  }, [periodPaidOrders, menuItemMap])

  // ── KPI badges ────────────────────────────────────────────────────────────
  function pctBadge(change) {
    if (change === null) return null
    return {
      text: `${change > 0 ? '+' : ''}${change}%`,
      cls:  change >= 0 ? 'ws-tone-positive' : 'ws-tone-negative',
      up:   change >= 0,
    }
  }

  const chartMax = Math.max(...chartBars.map(b => b.revenue), 1)
  const now      = new Date()
  const lastUpdated = formatReadableDateTime(now)
  const currentKpiPeriodLabel = dashboardPeriodLabel(period, lang)
  const rollingMonthRange = getRollingDashboardMonthRange(todayStr())
  const previousKpiPeriodLabel = previousDashboardPeriodLabel(period, lang, l.prevPeriod)

  if (!state.loaded) {
    return (
      <AppShell title={l.title}>
        <PageShimmer layout="dashboard" label={l.loading} />
      </AppShell>
    )
  }

  const periodTabs = [
    { key: 'today',  label: l.today    },
    { key: '7days',  label: l.days7    },
    { key: 'rollingMonth', label: l.rollingMonth },
    { key: 'month',  label: l.thisMonth },
  ]

  function renderPeriodSwitch(buttonClassName = '') {
    return (
      <div className="ws-segmented" role="group" aria-label={l.revenueStats}>
        {periodTabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={period === tab.key}
            onClick={() => setPeriod(tab.key)}
            className={buttonClassName}
          >
            {tab.label}
          </button>
        ))}
      </div>
    )
  }

  const headerActions = (
    <div className="flex items-center gap-3">
      <span className="ws-caption hidden items-center gap-1.5 tabular-nums xl:inline-flex">
        <Clock size={13} />
        {lastUpdated}
      </span>
      <div className="hidden md:block">
        {renderPeriodSwitch('!h-[30px] !px-3')}
      </div>
    </div>
  )

  return (
    <AppShell title={l.title} headerActions={headerActions}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page min-w-0 overflow-x-hidden">

        {/* Period switch on phones; wider screens keep it in the top bar. */}
        <div className="md:hidden">
          {renderPeriodSwitch()}
        </div>

        {historyError && (
          <div role="alert" className="ws-notice ws-tone-negative">
            {historyError}
          </div>
        )}

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            icon={TrendingUp}
            loading={analyticsLoading}
            label={`${l.revenue} · ${currentKpiPeriodLabel}`}
            value={formatCurrency(periodRevenue)}
            sub={`${l.loyaltyIncome}: ${formatCurrency(periodLoyaltyIncome)} · ${previousKpiPeriodLabel}: ${formatCurrency(previousKpiRevenue)}`}
            badge={pctBadge(revenueChange)}
          />
          <KpiCard
            icon={BadgeDollarSign}
            loading={analyticsLoading}
            label={`${l.netProfit} · ${currentKpiPeriodLabel}`}
            value={formatCurrencyWithPercentage(periodNetProfit, periodProfitMargin, lang)}
            sub={`${previousKpiPeriodLabel}: ${formatCurrency(previousKpiNetProfit)}`}
            badge={pctBadge(netProfitChange)}
            tone={periodNetProfit < 0 ? 'loss' : 'profit'}
          />
          <KpiCard
            icon={ShoppingBag}
            loading={analyticsLoading}
            label={`${l.orders} · ${currentKpiPeriodLabel}`}
            value={periodOrderCount}
            sub={`${previousKpiPeriodLabel}: ${previousOrderCount}`}
            badge={pctBadge(orderChange)}
          />
          <KpiCard
            icon={Receipt}
            label={l.activeBills}
            value={activeBills}
            sub={activeBills > 0 ? l.needAttention : '—'}
            subColor={activeBills > 0 ? '!text-[#c4262c] font-medium' : ''}
            highlight={activeBills > 0}
          />
        </div>

        {/* ── Row 2: Revenue Statistics + Payment Methods ── */}
        <div className="grid grid-cols-12 gap-4 min-w-0">

          {/* Revenue Statistics — left 2 cols */}
          <div aria-busy={analyticsLoading} className="ws-panel col-span-12 xl:col-span-8 min-w-0">
            <div className="mb-4">
              <h3 className="ws-heading">{l.revenueStats}</h3>
              {period === 'rollingMonth' && (
                <p className="ws-caption mt-0.5 tabular-nums">
                  {formatLongDate(rollingMonthRange.dateFrom, lang, rollingMonthRange.dateFrom)} — {formatLongDate(rollingMonthRange.dateToExclusive, lang, rollingMonthRange.dateToExclusive)}
                </p>
              )}
            </div>

            {analyticsLoading ? (
              <ChartShimmer />
            ) : (
              <>
            {/* Bar chart — bars use h-full so they fill it properly */}
            <div className="relative h-36 mb-1">
              <div className="flex items-end gap-[3px] h-full">
                {chartBars.map((bar, i) => {
                  const pct = Math.round((bar.revenue / chartMax) * 100)
                  return (
                    <div key={i} className="flex-1 flex items-end h-full group relative min-w-[6px]">
                      {bar.revenue > 0 && (
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#22201d] text-white text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          {formatCurrency(bar.revenue)}
                        </div>
                      )}
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          bar.isToday ? 'bg-[#ff5a00]' : bar.revenue > 0 ? 'bg-[#ff5a00]/35 group-hover:bg-[#ff5a00]/55' : 'bg-[#efece9]'
                        }`}
                        style={{ height: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* X-axis labels — show max 10 evenly, rest hidden */}
            <div className="flex gap-[3px] mb-4">
              {chartBars.map((bar, i) => {
                const show = chartBars.length <= 10 || i === chartBars.length - 1 || i % Math.ceil(chartBars.length / 10) === 0
                return (
                  <p key={i} className={`flex-1 text-center text-[10px] font-medium truncate min-w-[6px] ${
                    bar.isToday ? 'text-[#ff5a00]' : 'text-[#68655f]'
                  } ${!show ? 'opacity-0 pointer-events-none' : ''}`}>
                    {bar.label}
                  </p>
                )
              })}
            </div>

            {/* Period comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#e4e1de]">
              <div className="min-w-0">
                <p className="ws-caption mb-1">{l.prevPeriod}</p>
                <p className="font-semibold text-[#22201d] text-sm tabular-nums truncate">{formatCurrency(previousPeriodTotal)}</p>
              </div>
              <div className="min-w-0">
                <p className="ws-caption mb-1">{l.thisPeriod}</p>
                <p className="font-semibold text-[#22201d] text-sm tabular-nums truncate">{formatCurrency(currentPeriodTotal)}</p>
              </div>
              <div className="min-w-0">
                <p className="ws-caption mb-1">{l.growth}</p>
                {periodGrowth !== null ? (
                  <span className={`ws-badge tabular-nums ${periodGrowth >= 0 ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
                    {periodGrowth >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}
                    {periodGrowth > 0 ? '+' : ''}{periodGrowth}%
                  </span>
                ) : (
                  <p className="font-semibold text-[#68655f] text-sm">—</p>
                )}
              </div>
            </div>
              </>
            )}
          </div>

          {/* Payment Methods */}
          <div aria-busy={analyticsLoading} className="ws-panel col-span-12 xl:col-span-4 min-w-0">
            <h3 className="ws-heading mb-4">{l.paymentMethods}</h3>
            {analyticsLoading ? (
              <div className="flex animate-pulse items-center gap-4 py-1" aria-hidden="true">
                <div className="h-28 w-28 flex-shrink-0 rounded-full border-[14px] border-[#efece9]" />
                <div className="flex-1 space-y-3">
                  <ShimmerBlock className="h-3 w-full" />
                  <ShimmerBlock className="h-3 w-5/6" />
                  <ShimmerBlock className="h-3 w-2/3" />
                </div>
              </div>
            ) : paymentMethods.length === 0 ? (
              <p className="ws-empty !py-6">{l.noData}</p>
            ) : (
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative flex-shrink-0">
                  <DonutChart slices={paymentMethods.map(p => ({ value: p.amount, color: p.color }))} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="font-semibold text-[#22201d] text-xs leading-none tabular-nums">{formatCurrency(paymentMethods.reduce((s, p) => s + p.amount, 0)).split(' ')[0]}</p>
                  </div>
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  {paymentMethods.map(p => (
                    <div key={p.key} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                      <span className="text-xs text-[#68655f] flex-1 truncate">{p.label}</span>
                      <span className="text-xs font-semibold text-[#22201d] tabular-nums flex-shrink-0">{p.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <OrderTypePerformanceCard rows={orderTypePerformance} lang={lang} loading={analyticsLoading} />

        {/* ── Row 3: Sales by Category + Best-Selling + Busy Hours ── */}
        <div className="grid grid-cols-12 gap-4 min-w-0">

          {/* Sales by Category */}
          <div aria-busy={analyticsLoading} className="ws-panel col-span-12 xl:col-span-4 flex min-h-0 min-w-0 flex-col">
            <h3 className="ws-heading mb-3">{l.salesByCategory} · {currentKpiPeriodLabel}</h3>
            {analyticsLoading ? (
              <ListShimmer rows={6} />
            ) : salesByCategory.length === 0 ? (
              <p className="ws-empty !py-6">{l.noSales}</p>
            ) : (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {salesByCategory.map(cat => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <p className="text-xs font-medium text-[#22201d] truncate flex-1">{cat.name}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-xs font-semibold text-[#22201d] tabular-nums">{formatCurrency(cat.revenue)}</p>
                        <p className="text-xs text-[#68655f] tabular-nums w-8 text-right">{cat.pct}%</p>
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

          <ProductContributionCard rows={productContribution} lang={lang} periodLabel={currentKpiPeriodLabel} loading={analyticsLoading} LoadingView={() => <ListShimmer rows={6} withAvatar />} />

          <BusyHoursCard lang={lang} />
        </div>

        {/* Footer */}
        <p className="ws-caption text-center">
          {l.footer} • {lang === 'uz' ? 'Oxirgi yangilanish' : lang === 'ru' ? 'Последнее обновление' : 'Last updated'}: {lastUpdated}
        </p>

        </div>
      </div>
    </AppShell>
  )
}
