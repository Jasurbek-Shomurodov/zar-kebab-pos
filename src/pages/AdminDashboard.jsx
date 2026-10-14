import React, { useMemo, useEffect, useState } from 'react'
import {
  TrendingUp, ShoppingBag, Package, Receipt,
  Clock, ArrowUpRight, ArrowDownRight, Users,
  BadgeDollarSign,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, formatCurrencyWithPercentage } from '../lib/formatCurrency'
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
import PageShimmer from '../components/PageShimmer'
import BusyHoursCard from '../components/BusyHoursCard'
import ProductContributionCard from '../components/ProductContributionCard'
import { loadPaidOrdersForRange, mergePaidOrderHistory } from '../lib/orderHistory'
import { getOrdersNetProfit, getSaleProfitSummary } from '../lib/profit'
import { RollingValue } from '../components/RollingNumber'

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
    yesterday:      'Yesterday',
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

function todayStr()     { return restaurantTodayStr() }
function yesterdayStr() { return addRestaurantDays(todayStr(), -1) }

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
            <p className={`mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${valueClass}`}><RollingValue value={value} /></p>
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

  const [yesterdayHistoryOrders, setYesterdayHistoryOrders] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [comparisonLoading, setComparisonLoading] = useState(true)

  // The Dashboard shows today only. Today's paid orders already arrive with POS
  // hydration and stay live through realtime (state.orders), so the only fetch
  // is yesterday's paid orders for the comparison figures.
  useEffect(() => {
    let cancelled = false
    const yesterday = yesterdayStr()
    loadPaidOrdersForRange(yesterday, yesterday)
      .then(orders => {
        if (cancelled) return
        setYesterdayHistoryOrders(orders)
        setComparisonLoading(false)
      })
      .catch(error => {
        if (cancelled) return
        setYesterdayHistoryOrders([])
        setHistoryError(error?.message || 'Could not load yesterday for comparison')
        setComparisonLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // ── Core derived sets ─────────────────────────────────────────────────────
  const paidOrders = useMemo(
    () => groupOrdersBySession(
      mergePaidOrderHistory(yesterdayHistoryOrders, state.orders, yesterdayStr(), todayStr()),
    ).filter(isPaidOrder),
    [yesterdayHistoryOrders, state.orders]
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

  const activeBills = useMemo(
    () => state.tables.filter(t => t.status === 'needs_bill').length,
    [state.tables]
  )

  // ── Hourly income chart & comparison with yesterday ──────────────────────
  const chartBars = useMemo(() => {
    const currentHour = getRestaurantHour(new Date())
    return Array.from({ length: currentHour + 1 }, (_, h) => ({
      label:   `${h}:00`,
      revenue: todayPaidOrders
        .filter(o => getRestaurantHour(getOrderDate(o)) === h)
        .reduce((s, o) => s + getOrderRevenueTotal(o), 0),
      isCurrent: h === currentHour,
    }))
  }, [todayPaidOrders])

  // ── Payment methods breakdown ─────────────────────────────────────────────
  const paymentMethods = useMemo(() => {
    return getDashboardPaymentMethods(todayPaidOrders, {
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
      text: `${change > 0 ? '+' : ''}${change}%`,
      cls:  change >= 0 ? 'ws-tone-positive' : 'ws-tone-negative',
      up:   change >= 0,
    }
  }

  const chartMax = Math.max(...chartBars.map(b => b.revenue), 1)
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
          <div role="alert" className="ws-notice ws-tone-negative">
            {historyError}
          </div>
        )}

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            icon={TrendingUp}
            loading={comparisonLoading}
            label={`${l.revenue} · ${l.today}`}
            value={formatCurrency(todayRevenue)}
            sub={`${l.loyaltyIncome}: ${formatCurrency(todayLoyaltyIncome)} · ${l.yesterday}: ${formatCurrency(yesterdayRevenue)}`}
            badge={pctBadge(revenueChange)}
          />
          <KpiCard
            icon={BadgeDollarSign}
            loading={comparisonLoading}
            label={`${l.netProfit} · ${l.today}`}
            value={formatCurrencyWithPercentage(todayNetProfit, todayProfitMargin, lang)}
            sub={`${l.yesterday}: ${formatCurrency(yesterdayNetProfit)}`}
            badge={pctBadge(netProfitChange)}
            tone={todayNetProfit < 0 ? 'loss' : 'profit'}
          />
          <KpiCard
            icon={ShoppingBag}
            loading={comparisonLoading}
            label={`${l.orders} · ${l.today}`}
            value={todayOrderCount}
            sub={`${l.yesterday}: ${yesterdayOrderCount}`}
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
          <div className="ws-panel col-span-12 xl:col-span-8 min-w-0">
            <div className="mb-4">
              <h3 className="ws-heading">{l.revenueStats}</h3>
            </div>

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
                          bar.isCurrent ? 'bg-[#ff5a00]' : bar.revenue > 0 ? 'bg-[#ff5a00]/35 group-hover:bg-[#ff5a00]/55' : 'bg-[#efece9]'
                        }`}
                        style={{ height: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* X-axis labels — show max 10 evenly, rest hidden */}
            <div className="flex gap-[3px]">
              {chartBars.map((bar, i) => {
                const show = chartBars.length <= 10 || i === chartBars.length - 1 || i % Math.ceil(chartBars.length / 10) === 0
                return (
                  <p key={i} className={`flex-1 text-center text-[10px] font-medium truncate min-w-[6px] ${
                    bar.isCurrent ? 'text-[#ff5a00]' : 'text-[#68655f]'
                  } ${!show ? 'opacity-0 pointer-events-none' : ''}`}>
                    {bar.label}
                  </p>
                )
              })}
            </div>
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

          <ProductContributionCard rows={productContribution} lang={lang} periodLabel={l.today} />

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
