import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { useOrderDeletionDate } from '../store/useOrderDeletionDate'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'
import {
  getOrderDate,
  getOrderItemCategoryId,
  getOrderItems,
  getOrderLoyaltyIncomeTotal,
  getOrderPaymentBreakdown,
  getOrderPaymentSummary,
  getOrderRevenueTotal,
  getRestaurantHour,
  getSoldOrderItems,
  getOrderTotal,
  groupOrdersBySession,
  isCancelledOrderItem,
  isPaidOrder,
  matchesRange,
  toLocalDateStr,
} from '../lib/analytics'
import { getOrderItemUnitPrice, getPriceModeLabel, normalizePriceMode } from '../lib/priceModes'
import AppShell from '../components/AppShell'
import DateRangePicker from '../components/DateRangePicker'
import PaidPaymentSplitEditor from '../components/PaidPaymentSplitEditor'
import { applyPaymentSplit } from '../lib/paidPaymentSplit'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useAppDataStatus } from '../store/appHooks'
import {
  TrendingUp, ShoppingBag, DollarSign, Package,
  Download, X, Printer, Eye, ChevronLeft, ChevronRight,
  Search, SlidersHorizontal, CreditCard,
  Monitor, Banknote, UtensilsCrossed,
  BarChart2, Clock, Tag, Users, ListOrdered, HelpCircle, Trash2, Truck, Pencil, Globe2, UserRound,
} from 'lucide-react'
import { closeoutToCsv, downloadCsv, getDailyCloseout } from '../lib/closeout'
import { ALL_DISHES_KEY, getDishSalesAnalysis } from '../lib/dishSales'
import { ORDER_TYPE_KEYS, ORDER_TYPE_LABELS, inferOrderType, orderTypeLabel } from '../lib/orderTypes'
import { formatMenuQuantity, isMenuItemSoldByWeight } from '../lib/menuSaleUnits'
import {
  buildSalaryBonusExpenseRows,
  buildFinalizedEmployeeMealExpenseRows,
  buildSalaryPaymentExpenseRows,
  expenseCategoryLabel,
  expenseDescriptionLabel,
  expensePaymentMethodLabel,
  normalizeExpenseAmount,
  normalizeExpenseEntryType,
  summarizeExpenseCashflow,
  summarizeExpenses,
} from '../lib/expenses'
import { formatLongDate, formatLongDateTime } from '../lib/dateFormat'
import { getConfiguredServiceRatePct } from '../lib/serviceRates'
import { canChangeCompletedOrderPaymentMethod, canDeleteOrderToday, canViewPage } from '../lib/permissions'
import { collectPagedRows, loadOrdersForRange, mergeOrderHistory } from '../lib/orderHistory'
import { getAccountingQuickRange } from '../lib/accounting'

/** Payment method with fallback */
function getPaymentMethod(o) {
  const breakdown = getOrderPaymentBreakdown(o)
  if (breakdown.length > 1) return 'mixed'
  return breakdown[0]?.method || o.payment_method || null
}

function applyIndividualPaymentMethodChanges(order, changes) {
  const methodByPaymentId = new Map(changes.map(row => [row.paymentId, row.method]))
  const payments = (order.payments || []).map(payment => methodByPaymentId.has(payment.id)
    ? { ...payment, method: methodByPaymentId.get(payment.id) }
    : payment)
  const methods = [...new Set(payments
    .filter(payment => payment.method !== 'loyalty_card' && Number(payment.amount) > 0)
    .map(payment => payment.method))]
  return {
    ...order,
    payment_method: methods.length > 1 ? 'mixed' : (methods[0] || order.payment_method),
    payments,
  }
}

function PriceModeBadge({ mode, lang }) {
  const normalized = normalizePriceMode(mode)
  const tourist = normalized === 'tourist'
  const Icon = tourist ? Globe2 : UserRound
  return (
    <span className={`ws-badge ${tourist ? 'ws-tone-info' : ''}`}>
      <Icon size={11} aria-hidden="true" />
      {getPriceModeLabel(normalized, lang)}
    </span>
  )
}

function composeSalaryProfiles(rows = [], rates = [], payments = [], bonuses = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates.filter(rate => rate.salary_profile_id === row.id),
    payments: payments.filter(payment => payment.salary_profile_id === row.id),
    bonuses: bonuses.filter(bonus => bonus.salary_profile_id === row.id),
    absences: absences.filter(absence => absence.salary_profile_id === row.id),
  }))
}

function loadPagedResult(loadPage) {
  return collectPagedRows(loadPage)
    .then(data => ({ data, error: null }))
    .catch(error => ({ data: [], error }))
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE    = 8

const TABS = [
  { key: 'best_selling',       label: { uz: 'Ko\'p sotiladigan', ru: 'Бестселлеры',    en: 'Best Selling'       }, Icon: TrendingUp  },
  { key: 'dish_sales',         label: { uz: 'Taom tahlili',      ru: 'Анализ блюд',    en: 'Dish Analysis'      }, Icon: UtensilsCrossed },
  { key: 'by_category',        label: { uz: 'Kategoriya',         ru: 'По категории',   en: 'Sales by Category'  }, Icon: Tag         },
  { key: 'by_hour',            label: { uz: 'Soat bo\'yicha',     ru: 'По часам',       en: 'Sales by Hour'      }, Icon: Clock       },
  { key: 'payment_methods',    label: { uz: 'To\'lov usullari',   ru: 'Методы оплаты',  en: 'Payment Methods'    }, Icon: CreditCard  },
  { key: 'order_types',        label: { uz: 'Buyurtma turi',      ru: 'Типы заказов',   en: 'Order Types'        }, Icon: Truck       },
  { key: 'waiter_performance', label: { uz: 'Ofitsiantlar',       ru: 'Официанты',      en: 'Waiter Performance' }, Icon: Users       },
  { key: 'order_history',      label: { uz: 'Buyurtmalar',        ru: 'История',        en: 'Order History'      }, Icon: ListOrdered },
]

const STATUS_CFG = {
  paid:      { label: { uz: 'To\'landi',   ru: 'Оплачен',    en: 'Paid'      }, cls: 'ws-tone-positive' },
  unpaid:    { label: { uz: 'To\'lanmagan',ru: 'Не оплачен', en: 'Unpaid'    }, cls: 'ws-tone-caution'  },
  cancelled: { label: { uz: 'Bekor',       ru: 'Отменён',    en: 'Cancelled' }, cls: 'ws-tone-negative' },
}

const PAY_CFG = {
  salary: { label: { uz: 'Maoshdan', ru: 'Из зарплаты', en: 'Salary deduction' }, cls: 'ws-tone-info', Icon: Banknote, bar: '#2a6fdb' },
  cash:     { label: { uz: 'Naqd',      ru: 'Наличные',   en: 'Cash'     }, cls: 'ws-tone-positive', Icon: Banknote,   bar: '#1d7a52' },
  card:     { label: { uz: 'Karta',     ru: 'Карта',      en: 'Card'     }, cls: 'ws-tone-info',     Icon: CreditCard, bar: '#2a6fdb' },
  terminal: { label: { uz: 'Terminal',  ru: 'Терминал',   en: 'Terminal' }, cls: 'ws-tone-accent',   Icon: Monitor,    bar: '#ff5a00' },
  loyalty_card: { label: { uz: 'Sodiqlik', ru: 'Лояльность', en: 'Loyalty' }, cls: 'ws-tone-caution', Icon: Tag, bar: '#9a5a00' },
  mixed:    { label: { uz: 'Aralash',    ru: 'Смешанная',  en: 'Mixed'    }, cls: '',                 Icon: CreditCard, bar: '#68655f' },
  unknown:  { label: { uz: "Noma'lum",  ru: 'Неизвестно', en: 'Unknown'  }, cls: '',                 Icon: HelpCircle, bar: '#a8a49e' },
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────

function todayStr() {
  return toLocalDateStr(new Date().toISOString())
}

function fmtDate(iso, lang) {
  return formatLongDateTime(iso, lang, '—')
}

function orderTableLabel(order, lang) {
  const orderType = inferOrderType(order)
  return orderType === 'dine_in' ? (order?.table_name || '—') : orderTypeLabel(orderType, lang)
}

function StatusBadge({ status, lang }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.unpaid
  return (
    <span className={`ws-status ${cfg.cls}`}>
      {cfg.label[lang] || cfg.label.en}
    </span>
  )
}

function PayBadge({ method, lang, amount = null }) {
  const key = (method || '').toLowerCase()
  const cfg = PAY_CFG[key] || PAY_CFG.unknown
  const { Icon } = cfg
  const hasAmount = amount != null
  return (
    <span className={`inline-flex items-center font-medium ${
      hasAmount
        ? 'min-w-[170px] flex-1 justify-between gap-3 rounded-[10px] border border-[#e4e1de] bg-white px-3 py-2.5 text-xs text-[#22201d]'
        : `ws-badge ${cfg.cls}`
    }`}>
      <span className={`inline-flex items-center whitespace-nowrap ${hasAmount ? 'gap-1.5' : 'gap-1'}`}>
        <Icon size={hasAmount ? 13 : 10} className={hasAmount ? 'text-[#68655f]' : ''} />
        {cfg.label[lang] || cfg.label.en}
      </span>
      {hasAmount && <span className="whitespace-nowrap font-semibold tabular-nums">{formatCurrency(amount)}</span>}
    </span>
  )
}

function PaymentMethodBadges({ order, lang, showAmounts = false }) {
  const payments = getOrderPaymentBreakdown(order)
    .filter(row => row.method !== 'loyalty_card' && row.amount > 0)
  const visiblePayments = payments.length > 0
    ? payments
    : [{ method: order?.payment_method, amount: null }]
  return (
    <span className={showAmounts ? 'flex w-full flex-wrap items-center gap-2' : 'inline-flex flex-wrap items-center gap-1'}>
      {visiblePayments.filter(row => row.method).map(row => (
        <PayBadge
          key={row.method}
          method={row.method}
          lang={lang}
          amount={showAmounts ? row.amount : null}
        />
      ))}
    </span>
  )
}

function KpiCard({ icon: Icon, iconCls, label, value, sub }) {
  return (
    <div className="ws-panel h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ws-caption">{label}</p>
          <p className={`mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${iconCls || 'text-[#22201d]'}`}>{value}</p>
        </div>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
          <Icon size={16} />
        </div>
      </div>
      {sub && <p className="ws-caption mt-3 leading-relaxed">{sub}</p>}
    </div>
  )
}

function ProgressBar({ pct, color = '#ff5a00' }) {
  return (
    <div className="mt-2 h-1.5 bg-[#efece9] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function EmptyState({ label, lang }) {
  return (
    <div className="ws-panel ws-empty">
      <BarChart2 aria-hidden="true" />
      <h3>
        {label || (lang === 'uz' ? "Bu davr uchun ma'lumot yo'q" : lang === 'ru' ? 'Нет данных за этот период' : 'No data for this period')}
      </h3>
      <p>
        {lang === 'uz' ? 'Boshqa sana yoki filterni tanlang' : lang === 'ru' ? 'Выберите другую дату или уберите фильтры' : 'Try selecting a different date or removing filters'}
      </p>
    </div>
  )
}

function PageBtn({ children, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      className={`ws-btn ws-btn-sm ws-btn-icon tabular-nums ${active ? 'ws-btn-primary' : 'ws-btn-ghost'}`}
    >
      {children}
    </button>
  )
}

function SummaryRow({ label, value, bold, valueClass }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? 'font-semibold text-[#22201d]' : 'text-[#68655f]'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? `font-semibold ${valueClass || 'text-[#22201d]'}` : `font-medium text-[#22201d] ${valueClass || ''}`}`}>
        {value}
      </span>
    </div>
  )
}

function ExpenseBreakdownDialog({ rows, expenseSummary, expenseCashflow, cashflowLeft, dateFrom, dateTo, lang, labels, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const periodLabel = dateFrom === dateTo
    ? formatLongDate(dateTo, lang, dateTo)
    : `${formatLongDate(dateFrom, lang, dateFrom)} — ${formatLongDate(dateTo, lang, dateTo)}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#22201d]/40 backdrop-blur-[2px] sm:items-center sm:p-5" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-breakdown-title"
        onClick={event => event.stopPropagation()}
        className="ws-dialog flex max-h-[92vh] w-full flex-col overflow-hidden !rounded-b-none !bg-[#f6f5f3] sm:max-w-2xl sm:!rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e4e1de] bg-white px-5 py-4">
          <div>
            <h2 id="expense-breakdown-title" className="ws-display">{labels.expenseDetails}</h2>
            <p className="ws-caption mt-1">{periodLabel}</p>
          </div>
          <button
            type="button"
            aria-label={labels.close}
            onClick={onClose}
            className="ws-btn ws-btn-ghost !h-10 !w-10 flex-shrink-0 touch-manipulation !px-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div className="ws-panel mb-4">
            <h3 className="ws-heading mb-3">{labels.leftAfterExpenses}</h3>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <SummaryRow label={labels.cash} value={formatCurrency(expenseCashflow.byMethod.cash.left)} />
              <SummaryRow label={labels.card} value={formatCurrency(expenseCashflow.byMethod.card.left)} />
              <SummaryRow label={labels.terminal} value={formatCurrency(expenseCashflow.byMethod.terminal.left)} />
              <SummaryRow label={labels.employeeMeals} value={formatCurrency(expenseSummary.byCategory.employee_meals || 0)} />
              <SummaryRow label={labels.totalLeft} value={formatCurrency(cashflowLeft)} bold valueClass={cashflowLeft < 0 ? 'text-[#c4262c]' : 'text-[#1d7a52]'} />
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <h3 className="ws-heading">{labels.periodExpenses}</h3>
              <p className="ws-caption">{rows.length} {labels.entries}</p>
            </div>
            <p className="text-lg font-semibold tracking-[-.02em] tabular-nums text-[#c4262c]">{formatCurrency(expenseSummary.total)}</p>
          </div>

          {rows.length === 0 ? (
            <div className="ws-panel ws-empty">
              {labels.noExpenses}
            </div>
          ) : (
            <div className="ws-panel ws-panel-flush">
              {rows.map(expense => {
                const title = expense.is_salary_payment
                  ? labels.salaryPayment
                  : expense.is_salary_bonus
                    ? labels.salaryBonus
                    : expenseCategoryLabel(expense.category, lang)
                const details = [expense.vendor, expenseDescriptionLabel(expense.description, lang)].filter(Boolean).join(' · ')
                return (
                  <div key={expense.id} className="ws-row flex items-start justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#22201d]">{title}</p>
                      <p className="ws-caption mt-1">
                        {formatLongDate(expense.expense_date, lang, expense.expense_date)} · {expensePaymentMethodLabel(expense.payment_method, lang)}
                      </p>
                      {details && <p className="mt-1 break-words text-sm text-[#22201d]">{details}</p>}
                    </div>
                    <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-[#c4262c]">−{formatCurrency(expense.amount)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function formatQuantity(value) {
  const qty = Number(value) || 0
  if (Number.isInteger(qty)) return String(qty)
  return qty.toFixed(1).replace(/\.0$/, '')
}

function dishDisplayName(dish, lang) {
  if (!dish) return '—'
  return dish[`name_${lang}`] || dish.name_en || dish.name_uz || dish.name_ru || dish.name || '—'
}

function dishCategoryLabel(dish, categories, lang) {
  const category = categories.find(cat => cat.id === dish?.category_id)
  return category ? getCategoryName(category, lang) : '—'
}

function hourLabel(hour) {
  if (hour === null || hour === undefined || hour === '') return '—'
  return `${String(hour).padStart(2, '0')}:00`
}

function CompactEmpty({ label }) {
  return (
    <div className="ws-empty !py-8">
      <BarChart2 aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

function DishMetric({ icon: Icon, iconCls, label, value, sub }) {
  return (
    <div className="ws-panel h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ws-caption">{label}</p>
          <p className={`mt-1 break-words text-xl font-semibold leading-tight tracking-[-.02em] tabular-nums ${iconCls || 'text-[#22201d]'}`}>{value}</p>
        </div>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
          <Icon size={16} />
        </div>
      </div>
      {sub && <p className="ws-caption mt-2">{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — BEST SELLING
// ─────────────────────────────────────────────────────────────────────────────

function BestSellingTab({ orders, menuItemMap, categories, lang }) {
  const [sortBy, setSortBy] = useState('quantity') // 'quantity' | 'revenue'

  const items = useMemo(() => {
    const map = {}
    orders.forEach(o => {
      getSoldOrderItems(o).forEach(item => {
        const key = item.menu_item_id || item.name || 'unknown'
        const mi  = menuItemMap[item.menu_item_id]
        const categoryId = getOrderItemCategoryId(item, mi)
        const cat = categoryId ? categories.find(c => c.id === categoryId) : null
        if (!map[key]) {
          map[key] = {
            name:     item.name || mi?.name_en || mi?.name_uz || 'Unknown',
            image:    item.image_url || mi?.image_url || null,
            category: cat ? getCategoryName(cat, lang) : '—',
            quantity: 0,
            revenue:  0,
          }
        }
        map[key].quantity += Number(item.quantity) || 1
        map[key].revenue  += getOrderItemUnitPrice(item) * (Number(item.quantity) || 1)
      })
    })
    return Object.values(map).sort((a, b) =>
      sortBy === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity
    )
  }, [orders, menuItemMap, categories, lang, sortBy])

  const maxQty = items[0]?.quantity || 1
  const maxRev = items[0]?.revenue  || 1

  const s = {
    sortBy:   { uz: 'Saralash:',  ru: 'Сортировка:', en: 'Sort by:' },
    units:    { uz: 'Dona',       ru: 'Кол-во',      en: 'Units Sold' },
    revenue:  { uz: 'Daromad',    ru: 'Выручка',     en: 'Revenue' },
    product:  { uz: 'Mahsulot',   ru: 'Продукт',     en: 'Product' },
    category: { uz: 'Kategoriya', ru: 'Категория',   en: 'Category' },
    sold:     { uz: 'Sotilgan',   ru: 'Продано',     en: 'Sold' },
  }

  if (items.length === 0) return <EmptyState lang={lang} />

  return (
    <div>
      {/* Sort toggle */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <span className="ws-caption">{s.sortBy[lang] || s.sortBy.en}</span>
        <div className="ws-segmented">
          {['quantity', 'revenue'].map(k => (
            <button
              key={k}
              type="button"
              aria-pressed={sortBy === k}
              onClick={() => setSortBy(k)}
            >
              {k === 'quantity' ? (s.units[lang] || s.units.en) : (s.revenue[lang] || s.revenue.en)}
            </button>
          ))}
        </div>
      </div>

      <div className="ws-panel ws-panel-flush w-full !overflow-x-auto">
        <div className="min-w-[520px]">
        {/* Header */}
        <div className="ws-table-head hidden md:grid grid-cols-[32px_48px_1fr_120px_80px_110px] gap-3 px-5 py-3">
          <span>#</span><span></span><span>{s.product[lang] || s.product.en}</span><span>{s.category[lang] || s.category.en}</span>
          <span className="text-center">{s.sold[lang] || s.sold.en}</span><span className="text-right">{s.revenue[lang] || s.revenue.en}</span>
        </div>

        {items.slice(0, 20).map((item, i) => (
          <div key={i} className="ws-row grid grid-cols-[32px_48px_1fr_120px_80px_110px] gap-3 px-5 py-3.5 items-center">
            <span className={`w-7 h-7 rounded-full text-[11px] font-semibold tabular-nums flex items-center justify-center ${
              i === 0 ? 'bg-[#ff5a00] text-white' :
              i < 3   ? 'bg-[#fff1e8] text-[#ff5a00]' :
                        'bg-[#efece9] text-[#68655f]'
            }`}>{i + 1}</span>

            <div className="w-12 h-12 rounded-[10px] overflow-hidden bg-[#efece9] border border-[#e4e1de] flex-shrink-0">
              {item.image ? (
                <img src={item.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <UtensilsCrossed size={14} className="text-[#a8a49e]" />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <p className="font-medium text-sm text-[#22201d] truncate">{item.name}</p>
              <ProgressBar pct={sortBy === 'revenue'
                ? Math.round(item.revenue  / maxRev  * 100)
                : Math.round(item.quantity / maxQty * 100)} />
            </div>

            <span className="ws-caption truncate">{item.category}</span>
            <span className="text-center text-sm font-semibold tabular-nums text-[#22201d]">{item.quantity}</span>
            <span className="text-right font-semibold tabular-nums text-sm text-[#22201d]">{formatCurrency(item.revenue)}</span>
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — DISH SALES ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

function DishSalesTab({ orders, menuItems, categories, lang }) {
  const [selectedDishKey, setSelectedDishKey] = useState(ALL_DISHES_KEY)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [activeSectionKey, setActiveSectionKey] = useState('')
  const pickerRef = useRef(null)

  const analysis = useMemo(() => (
    getDishSalesAnalysis({ orders, menuItems, selectedDishKey })
  ), [orders, menuItems, selectedDishKey])

  useEffect(() => {
    if (selectedDishKey === ALL_DISHES_KEY) return
    if (!analysis.dishes.some(dish => dish.key === selectedDishKey)) {
      setSelectedDishKey(ALL_DISHES_KEY)
    }
  }, [analysis.dishes, selectedDishKey])

  useEffect(() => {
    if (!pickerOpen) return
    function handlePointerDown(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [pickerOpen])

  const dishSections = useMemo(() => {
    const categoryMap = new Map(categories.map(category => [category.id, category]))
    const sections = new Map()
    const query = pickerSearch.trim().toLowerCase()

    function ensureSection(key, label, sortOrder = 9999) {
      if (!sections.has(key)) sections.set(key, { key, label, sortOrder, dishes: [] })
      return sections.get(key)
    }

    analysis.dishes.forEach(dish => {
      const category = categoryMap.get(dish.category_id)
      const key = category ? category.id : dish.currentMenuItem ? '__uncategorized__' : '__removed__'
      const label = category
        ? getCategoryName(category, lang)
        : dish.currentMenuItem
          ? (lang === 'uz' ? 'Kategoriyasiz' : lang === 'ru' ? 'Без категории' : 'Uncategorized')
          : (lang === 'uz' ? 'Menyudan olib tashlangan' : lang === 'ru' ? 'Удалено из меню' : 'Removed from menu')
      const sortOrder = Number(category?.sort_order ?? 9999)
      const name = dishDisplayName(dish, lang)
      const haystack = `${name} ${label}`.toLowerCase()
      if (query && !haystack.includes(query)) return
      ensureSection(key, label, sortOrder).dishes.push(dish)
    })

    return Array.from(sections.values())
      .map(section => ({
        ...section,
        dishes: section.dishes.sort((a, b) => (
          dishDisplayName(a, lang).localeCompare(dishDisplayName(b, lang))
        )),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  }, [analysis.dishes, categories, lang, pickerSearch])

  useEffect(() => {
    if (dishSections.length === 0) {
      setActiveSectionKey('')
      return
    }
    if (!dishSections.some(section => section.key === activeSectionKey)) {
      setActiveSectionKey(dishSections[0].key)
    }
  }, [dishSections, activeSectionKey])

  const mostSoldMeals = useMemo(() => (
    selectedDishKey !== ALL_DISHES_KEY ? analysis.sources : analysis.dishes
      .filter(dish => dish.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.key.localeCompare(b.key))
      .slice(0, 30)
  ), [analysis.dishes, analysis.sources, selectedDishKey])

  const lowSellers = useMemo(() => (
    analysis.dishes.filter(dish => dish.currentMenuItem).slice(0, 15)
  ), [analysis.dishes])

  const s = {
    dish:       { uz: 'Taom',             ru: 'Блюдо',           en: 'Dish' },
    allDishes:  { uz: 'Barcha taomlar',   ru: 'Все блюда',       en: 'All dishes' },
    menuItems:  { uz: 'menyu taomi',      ru: 'позиций меню',    en: 'menu items' },
    sold:       { uz: 'Sotildi',          ru: 'Продано',         en: 'Sold' },
    orders:     { uz: 'Buyurtmalar',      ru: 'Заказов',         en: 'Orders' },
    revenue:    { uz: 'Taomlar summasi',   ru: 'Сумма блюд',      en: 'Item sales' },
    lastSale:   { uz: 'Oxirgi sotuv',     ru: 'Последняя продажа', en: 'Last sale' },
    avgOrder:   { uz: "O'rtacha",         ru: 'В среднем',       en: 'Avg per order' },
    noSales:    { uz: 'Sotuv yo‘q',       ru: 'Нет продаж',      en: 'No sales' },
    direct:     { uz: 'Alohida sotilgan', ru: 'Продано отдельно', en: 'Sold directly' },
    included:   { uz: 'Setlar tarkibida', ru: 'В составе сетов', en: 'Sold in sets' },
    sources:    { uz: 'Sotuv tarkibi', ru: 'Источники продаж', en: 'Sales breakdown' },
    overall:    { uz: 'Jami', ru: 'Всего', en: 'Overall' },
    directRevenue: { uz: 'Alohida sotuvlar summasi', ru: 'Сумма отдельных продаж', en: 'Direct item sales' },
    setRevenue: { uz: 'Set narxiga kiritilgan', ru: 'Включено в цену сета', en: 'Included in set price' },
    mostSold:   { uz: 'Eng ko‘p sotilgan taomlar', ru: 'Самые продаваемые блюда', en: 'Most-sold meals' },
    byHour:     { uz: 'Soat bo‘yicha',    ru: 'По часам',        en: 'Sales by hour' },
    lowSellers: { uz: 'Kam sotilganlar',  ru: 'Слабые продажи',  en: 'Low sellers' },
    saleLog:    { uz: 'Sotuv vaqtlari',   ru: 'Время продаж',    en: 'Sale times' },
    product:    { uz: 'Mahsulot',         ru: 'Продукт',         en: 'Product' },
    category:   { uz: 'Kategoriya',       ru: 'Категория',       en: 'Category' },
    qty:        { uz: 'Dona',             ru: 'Кол-во',          en: 'Qty' },
    time:       { uz: 'Vaqt',             ru: 'Время',           en: 'Time' },
    waiter:     { uz: 'Ofitsiant',        ru: 'Официант',        en: 'Waiter' },
    order:      { uz: 'Buyurtma',         ru: 'Заказ',           en: 'Order' },
    current:    { uz: 'Menyuda',          ru: 'В меню',          en: 'On menu' },
    removed:    { uz: 'Olib tashlangan',  ru: 'Удалено',         en: 'Removed' },
    search:     { uz: 'Taom yoki kategoriya', ru: 'Блюдо или категория', en: 'Dish or category' },
  }

  const selectedName = selectedDishKey === ALL_DISHES_KEY
    ? (s.allDishes[lang] || s.allDishes.en)
    : dishDisplayName(analysis.selectedDish, lang)
  const activeSection = dishSections.find(section => section.key === activeSectionKey) || dishSections[0]
  const maxMealQty = Math.max(...mostSoldMeals.map(row => row.quantity), 1)
  const maxHourlyQty = Math.max(...analysis.hourly.map(row => row.quantity), 1)
  const visibleSales = selectedDishKey === ALL_DISHES_KEY ? analysis.sales.slice(0, 18) : analysis.sales

  function selectDish(key) {
    setSelectedDishKey(key)
    setPickerOpen(false)
    setPickerSearch('')
  }

  return (
    <div className="space-y-5">
      <div className="ws-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="ws-heading">{selectedName}</h2>
            <p className="ws-caption mt-0.5">
              {analysis.selectedDish ? dishCategoryLabel(analysis.selectedDish, categories, lang) : `${analysis.dishes.length} ${s.menuItems[lang] || s.menuItems.en}`}
            </p>
            <p className="ws-muted mt-1 whitespace-pre-line">
              {analysis.selectedDish?.[`description_${lang}`] || analysis.selectedDish?.description_en}
            </p>
          </div>
          <div ref={pickerRef} className="relative flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <button
              type="button"
              onClick={() => setPickerOpen(open => !open)}
              aria-expanded={pickerOpen}
              className="ws-input flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:bg-[#ebe8e5] lg:min-w-[360px]"
            >
              <SlidersHorizontal size={14} className="flex-shrink-0 text-[#68655f]" />
              <span className="ws-caption flex-shrink-0 font-medium">{s.dish[lang] || s.dish.en}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#22201d]">{selectedName}</span>
              <ChevronRight size={14} className={`flex-shrink-0 text-[#68655f] transition-transform ${pickerOpen ? 'rotate-90' : ''}`} />
            </button>

            {pickerOpen && (
              <div className="ws-dialog absolute right-0 top-[calc(100%+8px)] z-30 w-full overflow-hidden !rounded-xl sm:w-[620px]">
                <div className="border-b border-[#e4e1de] p-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
                    <input
                      value={pickerSearch}
                      onChange={event => setPickerSearch(event.target.value)}
                      placeholder={s.search[lang] || s.search.en}
                      className="ws-input !h-10 !pl-9"
                    />
                  </div>
                </div>

                <div className="grid max-h-[440px] min-h-[260px] grid-cols-1 overflow-hidden sm:grid-cols-[230px_1fr]">
                  <div className="border-b border-[#e4e1de] bg-[#f6f5f3] p-2 sm:border-b-0 sm:border-r">
                    <button
                      type="button"
                      onClick={() => selectDish(ALL_DISHES_KEY)}
                      className={`mb-1 flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                        selectedDishKey === ALL_DISHES_KEY
                          ? 'bg-[#ff5a00] text-white'
                          : 'text-[#22201d] hover:bg-white'
                      }`}
                    >
                      <span className="truncate text-sm font-semibold">{s.allDishes[lang] || s.allDishes.en}</span>
                      <span className={`text-[11px] font-semibold tabular-nums ${selectedDishKey === ALL_DISHES_KEY ? 'text-white/80' : 'text-[#68655f]'}`}>
                        {analysis.dishes.length}
                      </span>
                    </button>
                    <div className="max-h-[362px] space-y-1 overflow-y-auto pr-1">
                      {dishSections.map(section => (
                        <button
                          key={section.key}
                          type="button"
                          onMouseEnter={() => setActiveSectionKey(section.key)}
                          onFocus={() => setActiveSectionKey(section.key)}
                          onClick={() => setActiveSectionKey(section.key)}
                          className={`flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                            activeSection?.key === section.key ? 'bg-white text-[#ff5a00] shadow-[0_1px_2px_rgb(34_32_29/8%)]' : 'text-[#22201d] hover:bg-white'
                          }`}
                        >
                          <span className="min-w-0 truncate text-sm font-medium">{section.label}</span>
                          <span className="ws-count flex-shrink-0">
                            {section.dishes.length}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="max-h-[440px] overflow-y-auto p-2">
                    {activeSection ? (
                      <>
                        <div className="sticky top-0 z-10 mb-1 rounded-[10px] bg-white/95 px-3 py-2 backdrop-blur">
                          <p className="ws-caption truncate font-medium">{activeSection.label}</p>
                        </div>
                        {activeSection.dishes.map(dish => {
                          const isSelected = selectedDishKey === dish.key
                          return (
                            <button
                              key={dish.key}
                              type="button"
                              onClick={() => selectDish(dish.key)}
                              className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                                isSelected ? 'bg-[#fff1e8] text-[#ff5a00]' : 'text-[#22201d] hover:bg-[#f6f5f3]'
                              }`}
                            >
                              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-[10px] border border-[#e4e1de] bg-[#efece9]">
                                {dish.image_url ? (
                                  <img src={dish.image_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <UtensilsCrossed size={13} className="text-[#a8a49e]" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{dishDisplayName(dish, lang)}</p>
                                <p className="ws-caption">
                                  {formatQuantity(dish.quantity)} {s.sold[lang] || s.sold.en}
                                </p>
                              </div>
                              {isSelected && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-[#ff5a00]" />}
                            </button>
                          )
                        })}
                      </>
                    ) : (
                      <CompactEmpty label={s.noSales[lang] || s.noSales.en} />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {analysis.selectedDish && (
        <p className="ws-caption">
          {lang === 'ru' ? 'Продажи в сетах учитываются по сохранённому составу при продаже. Для старых продаж без сохранённого состава эти количества недоступны.' : lang === 'uz' ? 'Setlardagi sotuvlar sotuv vaqtida saqlangan tarkib bo‘yicha hisoblanadi. Tarkibi saqlanmagan eski sotuvlar uchun bu miqdorlar mavjud emas.' : 'Set quantities use the contents saved at the time of sale. Older sales without saved set contents cannot be included.'}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DishMetric
          icon={Package}
          label={s.sold[lang] || s.sold.en}
          value={formatQuantity(analysis.totals.quantity)}
          sub={selectedDishKey === ALL_DISHES_KEY ? `${analysis.totals.saleLines} ${lang === 'uz' ? 'qator' : lang === 'ru' ? 'строк' : 'lines'}` : `${s.direct[lang]}: ${formatQuantity(analysis.totals.directQuantity)} · ${s.included[lang]}: ${formatQuantity(analysis.totals.includedQuantity)}`}
        />
        <DishMetric
          icon={ShoppingBag}
          label={s.orders[lang] || s.orders.en}
          value={analysis.totals.orders}
          sub={`${s.avgOrder[lang] || s.avgOrder.en}: ${formatQuantity(analysis.totals.averagePerOrder)}`}
        />
        <DishMetric
          icon={DollarSign}
          label={selectedDishKey === ALL_DISHES_KEY ? s.revenue[lang] : s.directRevenue[lang]}
          value={formatCurrency(analysis.totals.revenue)}
        />
        <DishMetric
          icon={Clock}
          label={s.lastSale[lang] || s.lastSale.en}
          value={analysis.totals.lastSoldAt ? formatLongDateTime(analysis.totals.lastSoldAt, lang) : '—'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="ws-panel">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="ws-heading">{selectedDishKey === ALL_DISHES_KEY ? s.mostSold[lang] : s.sources[lang]}</h2>
            <span className="ws-count">{mostSoldMeals.length}</span>
          </div>
          {selectedDishKey !== ALL_DISHES_KEY && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] bg-[#f6f5f3] px-4 py-3">
              <span className="text-sm font-medium text-[#22201d]">{s.overall[lang] || s.overall.en}</span>
              <span className="text-xl font-semibold tracking-[-.02em] tabular-nums text-[#22201d]">{formatQuantity(analysis.totals.quantity)}</span>
            </div>
          )}
          {mostSoldMeals.length === 0 ? (
            <CompactEmpty label={s.noSales[lang] || s.noSales.en} />
          ) : (
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {mostSoldMeals.map(row => {
                const pct = Math.round(row.quantity / maxMealQty * 100)
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <span className="w-28 flex-shrink-0 text-right text-[12px] font-medium text-[#68655f]">
                      {selectedDishKey === ALL_DISHES_KEY ? dishDisplayName(row, lang) : row.includedInSet ? `${s.included[lang]}: ${dishDisplayName(analysis.dishes.find(dish => dish.key === row.key) || row, lang)}` : s.direct[lang]}
                    </span>
                    <div className="h-8 flex-1 overflow-hidden rounded-lg bg-[#efece9]">
                      <div
                        className="flex h-full items-center rounded-lg bg-[#ff5a00] px-2"
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      >
                        {pct > 16 && <span className="truncate text-[10px] font-semibold tabular-nums text-white">{formatQuantity(row.quantity)}</span>}
                      </div>
                    </div>
                    <span className="w-20 flex-shrink-0 text-right text-[12px] font-semibold tabular-nums text-[#22201d]">
                      {formatQuantity(row.quantity)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="ws-panel">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="ws-heading">{s.byHour[lang] || s.byHour.en}</h2>
            <span className="ws-count">{analysis.hourly.length}</span>
          </div>
          {analysis.hourly.length === 0 ? (
            <CompactEmpty label={s.noSales[lang] || s.noSales.en} />
          ) : (
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {analysis.hourly.map(row => {
                const pct = Math.round(row.quantity / maxHourlyQty * 100)
                return (
                  <div key={row.hour} className="flex items-center gap-3">
                    <span className="w-14 flex-shrink-0 text-right text-[12px] font-medium text-[#68655f]">{hourLabel(row.hour)}</span>
                    <div className="h-8 flex-1 overflow-hidden rounded-lg bg-[#efece9]">
                      <div
                        className="flex h-full items-center rounded-lg bg-[#ff5a00]/45 px-2"
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      >
                        {pct > 16 && <span className="truncate text-[10px] font-semibold tabular-nums text-white">{formatQuantity(row.quantity)}</span>}
                      </div>
                    </div>
                    <span className="w-20 flex-shrink-0 text-right text-[12px] font-semibold tabular-nums text-[#22201d]">
                      {formatQuantity(row.quantity)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className={`grid gap-5 ${selectedDishKey === ALL_DISHES_KEY ? 'xl:grid-cols-2' : ''}`}>
        {selectedDishKey === ALL_DISHES_KEY && <div className="ws-panel ws-panel-flush">
          <div className="flex items-center justify-between gap-3 border-b border-[#e4e1de] px-5 py-4">
            <h2 className="ws-heading">{s.lowSellers[lang] || s.lowSellers.en}</h2>
            <span className="ws-count">{lowSellers.length}</span>
          </div>
          {lowSellers.length === 0 ? (
            <CompactEmpty label={s.noSales[lang] || s.noSales.en} />
          ) : (
            <div className="max-h-[440px] overflow-y-auto">
              {lowSellers.map((dish, index) => (
                <div key={dish.key} className="ws-row grid grid-cols-[30px_44px_1fr_76px_96px] items-center gap-3 px-5 py-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#efece9] text-[10px] font-semibold tabular-nums text-[#68655f]">{index + 1}</span>
                  <div className="h-11 w-11 overflow-hidden rounded-[10px] border border-[#e4e1de] bg-[#efece9]">
                    {dish.image_url ? (
                      <img src={dish.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <UtensilsCrossed size={13} className="text-[#a8a49e]" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#22201d]">{dishDisplayName(dish, lang)}</p>
                    <p className="ws-caption truncate">{dishCategoryLabel(dish, categories, lang)}</p>
                  </div>
                  <span className={`text-right text-sm font-semibold tabular-nums ${dish.quantity === 0 ? 'text-[#c4262c]' : 'text-[#22201d]'}`}>
                    {dish.quantity === 0 ? '0' : formatQuantity(dish.quantity)}
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(dish.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>}

        <div className="ws-panel ws-panel-flush">
          <div className="flex items-center justify-between gap-3 border-b border-[#e4e1de] px-5 py-4">
            <h2 className="ws-heading">{s.saleLog[lang] || s.saleLog.en}</h2>
            <span className="ws-count">{analysis.sales.length}</span>
          </div>
          {visibleSales.length === 0 ? (
            <CompactEmpty label={s.noSales[lang] || s.noSales.en} />
          ) : (
            <div className="max-h-[440px] overflow-y-auto">
              {visibleSales.map((sale, index) => (
                <div key={`${sale.orderId}-${sale.dishKey}-${index}`} className="ws-row px-5 py-3">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#22201d]">
                        {selectedDishKey === ALL_DISHES_KEY ? sale.dishName : `#${String(sale.orderId).slice(-4).toUpperCase()}`}
                      </p>
                      <p className="ws-caption">{formatLongDateTime(sale.orderDate, lang, '—')}</p>
                    </div>
                    <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-[#22201d]">{sale.includedInSet ? s.setRevenue[lang] : formatCurrency(sale.revenue)}</p>
                  </div>
                  <div className="ws-caption flex flex-wrap items-center gap-2">
                    <span>{s.qty[lang] || s.qty.en}: {formatQuantity(sale.quantity)}</span>
                    {sale.includedInSet && <span>· {s.included[lang]}: {sale.sourceName}</span>}
                    <span>·</span>
                    <span>{s.order[lang] || s.order.en}: #{String(sale.orderId).slice(-4).toUpperCase()}</span>
                    {sale.waiterName && (
                      <>
                        <span>·</span>
                        <span>{s.waiter[lang] || s.waiter.en}: {sale.waiterName.split(' ')[0]}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — SALES BY CATEGORY
// ─────────────────────────────────────────────────────────────────────────────

function ByCategoryTab({ orders, categories, menuItemMap, lang }) {
  const data = useMemo(() => {
    const map = {}
    let totalRev = 0
    orders.forEach(o => {
      getSoldOrderItems(o).forEach(item => {
        const mi  = menuItemMap[item.menu_item_id]
        const categoryId = getOrderItemCategoryId(item, mi)
        const cat = categoryId ? categories.find(c => c.id === categoryId) : null
        const key = cat?.id || '__uncategorized__'
        const lbl = cat ? getCategoryName(cat, lang) : 'Uncategorized'
        if (!map[key]) map[key] = { label: lbl, image: cat?.image_url || null, revenue: 0, qty: 0 }
        const rev = getOrderItemUnitPrice(item) * (Number(item.quantity) || 1)
        map[key].revenue += rev
        map[key].qty     += Number(item.quantity) || 1
        totalRev         += rev
      })
    })
    return Object.values(map)
      .map(d => ({ ...d, pct: totalRev > 0 ? Math.round(d.revenue / totalRev * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [orders, categories, menuItemMap, lang])

  if (data.length === 0) return <EmptyState lang={lang} />

  const maxRev = data[0]?.revenue || 1
  return (
    <div className="ws-panel ws-panel-flush">
      {data.map((d, i) => (
        <div key={i} className="ws-row flex items-center gap-4 px-5 py-4">
          <span className={`w-7 h-7 rounded-full text-[11px] font-semibold tabular-nums flex items-center justify-center flex-shrink-0 ${
            i === 0 ? 'bg-[#ff5a00] text-white' : i === 1 ? 'bg-[#fff1e8] text-[#ff5a00]' : 'bg-[#efece9] text-[#68655f]'
          }`}>{i + 1}</span>

          <div className="w-10 h-10 rounded-[10px] overflow-hidden bg-[#efece9] border border-[#e4e1de] flex-shrink-0">
            {d.image ? (
              <img src={d.image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Tag size={12} className="text-[#a8a49e]" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium text-sm text-[#22201d]">{d.label}</p>
              <div className="flex items-center gap-3">
                <span className="ws-caption tabular-nums">{d.qty} {lang === 'uz' ? 'dona' : lang === 'ru' ? 'шт.' : 'items'} · {d.pct}%</span>
                <span className="font-semibold tabular-nums text-sm text-[#22201d]">{formatCurrency(d.revenue)}</span>
              </div>
            </div>
            <ProgressBar pct={Math.round(d.revenue / maxRev * 100)} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — SALES BY HOUR
// ─────────────────────────────────────────────────────────────────────────────

function ByHourTab({ orders, lang }) {
  const { hours, peakIdx } = useMemo(() => {
    const hrs = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, count: 0 }))
    orders.forEach(o => {
      const d = getOrderDate(o)
      if (!d) return
      const h = getRestaurantHour(d)
      hrs[h].revenue += getOrderRevenueTotal(o)
      hrs[h].count   += 1
    })
    const active  = hrs.filter(h => h.count > 0)
    const peakIdx = hrs.reduce((best, h, i) => h.revenue > hrs[best].revenue ? i : best, 0)
    return { hours: hrs, peakIdx }
  }, [orders])

  const activeHours = hours.filter(h => h.count > 0)
  if (activeHours.length === 0) return <EmptyState lang={lang} />

  const maxRev = Math.max(...hours.map(h => h.revenue), 1)
  const peak   = hours[peakIdx]

  return (
    <div>
      {/* Peak summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: lang === 'ru' ? 'Пиковый час' : lang === 'uz' ? 'Eng faol soat' : 'Peak Hour',
            value: `${String(peak.hour).padStart(2, '0')}:00` },
          { label: lang === 'ru' ? 'Доход за пиковый час' : lang === 'uz' ? 'Eng ko\'p daromad' : 'Peak Revenue',
            value: formatCurrency(peak.revenue) },
          { label: lang === 'ru' ? 'Заказов в пик' : lang === 'uz' ? 'Buyurtmalar' : 'Peak Orders',
            value: peak.count },
        ].map(({ label, value }) => (
          <div key={label} className="ws-panel">
            <p className="ws-caption mb-1">{label}</p>
            <p className="break-words text-xl font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]">{value}</p>
          </div>
        ))}
      </div>

      {/* Hourly bars */}
      <div className="ws-panel">
        <div className="space-y-2">
          {activeHours.map(h => {
            const isPeak = h.hour === peakIdx
            const pct    = Math.round(h.revenue / maxRev * 100)
            return (
              <div key={h.hour} className="flex items-center gap-3">
                <span className="w-12 text-[12px] font-medium tabular-nums text-[#68655f] flex-shrink-0 text-right">
                  {String(h.hour).padStart(2, '0')}:00
                </span>
                <div className="flex-1 h-7 bg-[#efece9] rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg flex items-center px-2 transition-all"
                    style={{ width: `${Math.max(pct, 2)}%`, background: isPeak ? '#ff5a00' : 'rgb(255 90 0 / 45%)' }}
                  >
                    {pct > 15 && (
                      <span className="text-[10px] font-semibold tabular-nums text-white truncate">{formatCurrency(h.revenue)}</span>
                    )}
                  </div>
                </div>
                <span className="ws-caption w-16 text-right flex-shrink-0">
                  {h.count} {lang === 'ru' ? 'зак.' : lang === 'uz' ? 'brt.' : 'orders'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — PAYMENT METHODS
// ─────────────────────────────────────────────────────────────────────────────

function PaymentMethodsTab({ orders, lang }) {
  const { data, totalRevenue, loyaltyIncome } = useMemo(() => {
    const map = {}
    let totalPaymentValue = 0
    let cashIncome = 0
    let loyalty = 0
    orders.forEach(o => {
      const breakdown = getOrderPaymentBreakdown(o)
      const rows = breakdown.length > 0 ? breakdown : [{ method: getPaymentMethod(o), amount: getOrderRevenueTotal(o) }]
      rows.forEach(row => {
        const key = (row.method || '').toLowerCase()
        const m   = PAY_CFG[key] ? key : 'unknown'
        const rev = Number(row.amount) || 0
        if (!map[m]) map[m] = { method: m, revenue: 0, count: 0 }
        map[m].revenue += rev
        map[m].count   += 1
        totalPaymentValue += rev
        if (m === 'loyalty_card') loyalty += rev
        else cashIncome += rev
      })
    })
    const rows = Object.values(map)
      .map(d => ({ ...d, pct: totalPaymentValue > 0 ? Math.round(d.revenue / totalPaymentValue * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
    return { data: rows, totalRevenue: cashIncome, loyaltyIncome: loyalty }
  }, [orders])

  if (data.length === 0) return <EmptyState lang={lang} />

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {data.map(d => {
          const cfg   = PAY_CFG[d.method] || PAY_CFG.unknown
          const { Icon } = cfg
          return (
            <div key={d.method} className="ws-panel">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="ws-caption">{cfg.label[lang] || cfg.label.en}</p>
                  <p className="mt-1 break-words text-xl font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]">{formatCurrency(d.revenue)}</p>
                </div>
                <span className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center bg-[#efece9] text-[#68655f]">
                  <Icon size={16} />
                </span>
              </div>
              <p className="ws-caption mt-1 tabular-nums">{d.count} {lang === 'uz' ? 'ta' : lang === 'ru' ? 'зак.' : 'orders'} · {d.pct}%</p>
              <ProgressBar pct={d.pct} color={cfg.bar} />
            </div>
          )
        })}
      </div>

      {/* Detailed breakdown */}
      <div className="ws-panel ws-panel-flush">
        <div className="px-5 py-4 border-b border-[#e4e1de]">
          <h2 className="ws-heading">{lang === 'uz' ? 'Tafsilot' : lang === 'ru' ? 'Детали' : 'Breakdown'}</h2>
        </div>
        {data.map(d => {
          const cfg = PAY_CFG[d.method] || PAY_CFG.unknown
          const { Icon } = cfg
          return (
            <div key={d.method} className="ws-row flex items-center gap-4 px-5 py-4">
              <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-[#efece9] text-[#68655f]">
                <Icon size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <p className="font-medium text-sm text-[#22201d]">{cfg.label[lang] || cfg.label.en}</p>
                  <p className="font-semibold tabular-nums text-sm text-[#22201d]">{formatCurrency(d.revenue)}</p>
                </div>
                <ProgressBar pct={d.pct} color={cfg.bar} />
              </div>
              <div className="text-right flex-shrink-0 min-w-[60px]">
                <p className="text-[12px] font-semibold tabular-nums text-[#22201d]">{d.pct}%</p>
                <p className="ws-caption">{d.count} {lang === 'uz' ? 'ta' : lang === 'ru' ? 'зак.' : 'orders'}</p>
              </div>
            </div>
          )
        })}
        {/* Totals row */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 bg-[#f6f5f3] border-t border-[#e4e1de]">
          <span className="font-semibold text-sm text-[#22201d]">
            {lang === 'uz' ? 'Daromad' : lang === 'ru' ? 'Доход' : 'Income'}
          </span>
          <span className="text-right">
            <span className="block font-semibold text-lg tracking-[-.02em] tabular-nums text-[#22201d]">{formatCurrency(totalRevenue)}</span>
            <span className="ws-badge ws-tone-caution mt-1">
              {lang === 'uz' ? 'Loyallik daromadi' : lang === 'ru' ? 'Доход по лояльности' : 'Loyalty income'}: {formatCurrency(loyaltyIncome)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — ORDER TYPES
// ─────────────────────────────────────────────────────────────────────────────

function OrderTypesTab({ orders, lang }) {
  const data = useMemo(() => {
    const totalRevenue = orders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
    return ORDER_TYPE_KEYS
      .map(type => {
        const rows = orders.filter(order => inferOrderType(order) === type)
        const revenue = rows.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
        const items = rows.reduce(
          (sum, order) => sum + getSoldOrderItems(order).reduce((itemSum, item) => itemSum + (Number(item.quantity) || 1), 0),
          0
        )
        return {
          type,
          label: ORDER_TYPE_LABELS[type]?.[lang] || ORDER_TYPE_LABELS[type]?.en || type,
          orders: rows.length,
          revenue,
          items,
          pct: totalRevenue > 0 ? Math.round(revenue / totalRevenue * 100) : 0,
        }
      })
  }, [orders, lang])

  if (orders.length === 0) return <EmptyState lang={lang} />

  const colors = {
    dine_in: '#ff5a00',
    take_away: '#2a6fdb',
    delivery: '#9a5a00',
    game_club: '#1d7a52',
  }
  const total = data.reduce((sum, row) => sum + row.revenue, 0)
  const maxRev = Math.max(...data.map(row => row.revenue), 1)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {data.map(row => (
          <div key={row.type} className="ws-panel">
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="ws-caption">{row.label}</p>
              <span className="ws-count">{row.pct}%</span>
            </div>
            <p className="break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]">{formatCurrency(row.revenue)}</p>
            <p className="ws-caption mt-1 tabular-nums">
              {row.orders} {lang === 'uz' ? 'buyurtma' : lang === 'ru' ? 'заказов' : 'orders'} · {row.items} {lang === 'uz' ? 'dona' : lang === 'ru' ? 'поз.' : 'items'}
            </p>
            <ProgressBar pct={Math.round(row.revenue / maxRev * 100)} color={colors[row.type]} />
          </div>
        ))}
      </div>

      <div className="ws-panel ws-panel-flush">
        {data.map(row => (
          <div key={row.type} className="ws-row flex items-center gap-4 px-5 py-4">
            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: colors[row.type] }} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#22201d]">{row.label}</p>
                <p className="text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(row.revenue)}</p>
              </div>
              <ProgressBar pct={total > 0 ? row.pct : 0} color={colors[row.type]} />
            </div>
            <div className="min-w-[88px] text-right">
              <p className="text-[12px] font-semibold tabular-nums text-[#22201d]">{row.pct}%</p>
              <p className="ws-caption">{row.orders} {lang === 'ru' ? 'зак.' : lang === 'uz' ? 'brt.' : 'orders'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 6 — WAITER PERFORMANCE
// ─────────────────────────────────────────────────────────────────────────────

function WaiterPerformanceTab({ orders, lang }) {
  const data = useMemo(() => {
    const map = {}
    orders.forEach(o => {
      const w = o.waiter_name || o.waiter_email || 'Unknown'
      if (!map[w]) map[w] = { name: w, revenue: 0, orders: 0, items: 0 }
      map[w].revenue += getOrderRevenueTotal(o)
      map[w].orders  += 1
      map[w].items   += getSoldOrderItems(o).reduce((s, i) => s + (Number(i.quantity) || 1), 0)
    })
    return Object.values(map)
      .map(d => ({ ...d, avg: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [orders])

  if (data.length === 0) return <EmptyState lang={lang} />

  const maxRev = data[0]?.revenue || 1

  return (
    <div className="ws-panel ws-panel-flush w-full !overflow-x-auto">
    <div className="min-w-[640px]">
      {/* Header */}
      <div className="ws-table-head hidden md:grid grid-cols-[32px_1fr_80px_140px_140px_80px] gap-4 px-5 py-3">
        <span>#</span><span>{lang === 'uz' ? 'Ofitsiant' : lang === 'ru' ? 'Официант' : 'Waiter'}</span>
        <span className="text-center">{lang === 'uz' ? 'Brt.' : lang === 'ru' ? 'Зак.' : 'Orders'}</span>
        <span className="text-right">{lang === 'uz' ? 'Daromad' : lang === 'ru' ? 'Выручка' : 'Revenue'}</span>
        <span className="text-right">{lang === 'uz' ? "O'rtacha" : lang === 'ru' ? 'Ср. чек' : 'Avg Order'}</span>
        <span className="text-center">{lang === 'uz' ? 'Dona' : lang === 'ru' ? 'Блюд' : 'Items'}</span>
      </div>

      {data.map((d, i) => (
        <div key={d.name} className="ws-row px-5 py-4">
          {/* Desktop row */}
          <div className="hidden md:grid grid-cols-[32px_1fr_80px_140px_140px_80px] gap-4 items-center">
            <span className={`w-7 h-7 rounded-full text-[11px] font-semibold tabular-nums flex items-center justify-center ${
              i === 0 ? 'bg-[#ff5a00] text-white' : i === 1 ? 'bg-[#fff1e8] text-[#ff5a00]' : 'bg-[#efece9] text-[#68655f]'
            }`}>{i + 1}</span>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-full bg-[#efece9] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#68655f] text-[11px] font-semibold">
                    {(d.name[0] || '?').toUpperCase()}
                  </span>
                </div>
                <p className="font-medium text-sm text-[#22201d] truncate">{d.name}</p>
              </div>
              <ProgressBar pct={Math.round(d.revenue / maxRev * 100)} />
            </div>

            <span className="text-center text-sm font-semibold tabular-nums text-[#22201d]">{d.orders}</span>
            <span className="text-right font-semibold tabular-nums text-sm text-[#22201d]">{formatCurrency(d.revenue)}</span>
            <span className="text-right text-sm tabular-nums text-[#68655f]">{formatCurrency(d.avg)}</span>
            <span className="text-center text-sm tabular-nums text-[#68655f]">{d.items}</span>
          </div>

          {/* Mobile card */}
          <div className="md:hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-[10px] font-semibold tabular-nums flex items-center justify-center ${
                  i === 0 ? 'bg-[#ff5a00] text-white' : 'bg-[#efece9] text-[#68655f]'
                }`}>{i + 1}</span>
                <p className="font-medium text-[14px] text-[#22201d]">{d.name}</p>
              </div>
              <p className="font-semibold tabular-nums text-[#22201d]">{formatCurrency(d.revenue)}</p>
            </div>
            <div className="ws-caption flex gap-4">
              <span>{d.orders} {lang === 'uz' ? 'brt.' : lang === 'ru' ? 'зак.' : 'orders'}</span>
              <span>{lang === 'uz' ? "o'rt." : lang === 'ru' ? 'ср.' : 'avg'} {formatCurrency(d.avg)}</span>
              <span>{d.items} {lang === 'uz' ? 'dona' : lang === 'ru' ? 'шт.' : 'items'}</span>
            </div>
            <ProgressBar pct={Math.round(d.revenue / maxRev * 100)} />
          </div>
        </div>
      ))}
    </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 6 — ORDER HISTORY
// ─────────────────────────────────────────────────────────────────────────────

function OrderDrawer({ order, menuItemMap, onClose, navigate, lang, serviceRateSettings, canDeleteOrder, onDeleteOrder, deletingOrderId, confirmDeleteOrderId, onCancelDeleteOrder, canChangePaymentMethod, paymentMethodOrderId, paymentMethodDraft, onStartPaymentMethodChange, onPaymentMethodDraftChange, onSavePaymentMethod, onCancelPaymentMethod, savingPaymentOrderId, onPaymentSplitSaved, onPaymentSplitSaving }) {
  const [fetchedItems, setFetchedItems] = useState(null)
  const [splitPayment, setSplitPayment] = useState(null)

  useEffect(() => {
    if (!order) return
    setFetchedItems(null)
    setSplitPayment(null)
    const ids = order._mergedIds?.length ? order._mergedIds : [order.id]
    supabase
      .from('order_items')
      .select('*')
      .in('order_id', ids)
      .then(({ data }) => { if (data?.length) setFetchedItems(data) })
  }, [order?.id])

  if (!order) return null

  const items    = (fetchedItems || getOrderItems(order)).filter(item => !isCancelledOrderItem(item))
  const payment = getOrderPaymentSummary(
    order,
    items,
    getConfiguredServiceRatePct(serviceRateSettings, order.price_mode)
  )
  const subtotal = payment.subtotal
  const loyaltyUsed = payment.loyaltyUsedAmount || payment.discountAmount
  const servicePct = payment.serviceRatePct
  const serviceAmt = payment.serviceFee
  const total = payment.total
  const received   = order.amount_received || 0
  const change     = order.change_amount   || (received > 0 ? Math.max(0, received - total) : 0)
  const orderNum   = order.id ? `#${String(order.id).slice(-4).toUpperCase()}` : '—'
  const sessionCnt = order._orderCount || 1
  const paymentRows = (order.payments || []).filter(row => Number(row.amount) > 0)

  return (
    <div className="flex flex-col h-full">
      {/* Drawer header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e1de] flex-shrink-0 bg-white">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="ws-heading flex items-center gap-1.5">
            {lang === 'uz' ? 'Buyurtma' : lang === 'ru' ? 'Заказ' : 'Order'} {orderNum}
            {sessionCnt > 1 && (
              <span className="ws-badge ws-tone-accent">
                {sessionCnt} {lang === 'uz' ? 'tur' : lang === 'ru' ? 'раунд' : 'rounds'}
              </span>
            )}
          </span>
          <StatusBadge status={order.payment_status || (isPaidOrder(order) ? 'paid' : 'unpaid')} lang={lang} />
          <PriceModeBadge mode={order.price_mode} lang={lang} />
        </div>
        <button type="button" onClick={onClose} className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon">
          <X size={16} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Order meta */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: lang === 'uz' ? 'Stol'      : lang === 'ru' ? 'Стол'      : 'Table',    value: orderTableLabel(order, lang) },
            { label: lang === 'uz' ? 'Mijoz turi' : lang === 'ru' ? 'Тип клиента' : 'Customer Type', value: <PriceModeBadge mode={order.price_mode} lang={lang} /> },
            { label: lang === 'uz' ? 'Ochgan'    : lang === 'ru' ? 'Открыл'    : 'Opened By', value: order.opened_by_name || order.waiter_name || '—' },
            { label: lang === 'uz' ? "To'lov"    : lang === 'ru' ? 'Оплата'    : 'Payment',  value: <PaymentMethodBadges order={order} lang={lang} showAmounts />, fullWidth: true },
            { label: lang === 'uz' ? 'Yopgan'    : lang === 'ru' ? 'Закрыл'    : 'Completed By', value: order.completed_by_name || '—' },
            { label: lang === 'uz' ? 'Holat'     : lang === 'ru' ? 'Статус'    : 'Status',   value: <StatusBadge status={order.payment_status || (isPaidOrder(order) ? 'paid' : 'unpaid')} lang={lang} /> },
            { label: lang === 'uz' ? 'Yaratildi' : lang === 'ru' ? 'Создан'    : 'Created',  value: fmtDate(order.created_at, lang) },
            { label: lang === 'uz' ? "To'landi"  : lang === 'ru' ? 'Оплачен'   : 'Paid At',  value: fmtDate(order.paid_at, lang) },
          ].map(({ label, value, fullWidth = false }) => (
            <div key={label} className={`min-w-0 rounded-xl bg-[#f6f5f3] ${fullWidth ? 'col-span-2 p-4' : 'p-3'}`}>
              <p className={`ws-caption font-medium ${fullWidth ? 'mb-2' : 'mb-1'}`}>{label}</p>
              <div className={`text-sm font-medium text-[#22201d] ${fullWidth ? 'w-full' : ''}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Items */}
        <div>
          <p className="ws-caption font-medium mb-3">
            {lang === 'uz' ? 'Buyurtma qilingan' : lang === 'ru' ? 'Заказанные блюда' : 'Ordered Items'} ({items.length})
          </p>
          <div className="space-y-3">
            {items.map((item, i) => {
              const mi = menuItemMap[item.menu_item_id]
              const grams = gramsLabel(mi || item, lang)
              const millilitres = millilitresLabel(mi || item, lang)
              const kcal = kcalLabel(mi || item, lang)
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-[10px] overflow-hidden bg-[#efece9] border border-[#e4e1de] flex-shrink-0">
                    {(item.image_url || mi?.image_url) ? (
                      <img src={item.image_url || mi.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UtensilsCrossed size={14} className="text-[#a8a49e]" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-[#22201d] truncate">{item.name || mi?.name_en || 'Item'}</p>
                    {(grams || millilitres || kcal) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {grams && (
                          <span className="ws-badge">
                            {grams}
                          </span>
                        )}
                        {millilitres && (
                          <span className="ws-badge">
                            {millilitres}
                          </span>
                        )}
                        {kcal && (
                          <span className="ws-badge">
                            {kcal}
                          </span>
                        )}
                      </div>
                    )}
                    {item.notes && <p className="ws-caption">{item.notes}</p>}
                    <p className="ws-caption mt-0.5 tabular-nums">
                      {isMenuItemSoldByWeight(item)
                        ? `${formatMenuQuantity(item.quantity, item)} · ${formatCurrency(getOrderItemUnitPrice(item))} / kg`
                        : `${lang === 'uz' ? 'Dona' : lang === 'ru' ? 'Кол' : 'Qty'} ${formatMenuQuantity(item.quantity, item)} × ${formatCurrency(getOrderItemUnitPrice(item))}`}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-sm text-[#22201d] flex-shrink-0">
                    {formatCurrency(getOrderItemUnitPrice(item) * (Number(item.quantity) || 1))}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Payment summary */}
        <div>
          <p className="ws-caption font-medium mb-3">{lang === 'uz' ? "To'lov xulosasi" : lang === 'ru' ? 'Итог оплаты' : 'Payment Summary'}</p>
          <div className="bg-[#f6f5f3] rounded-xl p-4 space-y-2.5">
            <SummaryRow label={lang === 'uz' ? 'Jami' : lang === 'ru' ? 'Подитог' : 'Subtotal'}                                      value={formatCurrency(subtotal)}   />
            {loyaltyUsed > 0 && (
              <SummaryRow label={lang === 'uz' ? 'Sodiqlik ishlatildi' : lang === 'ru' ? 'Использовано с карты' : 'Loyalty used'} value={`− ${formatCurrency(loyaltyUsed)}`} valueClass="text-[#1d7a52]" />
            )}
            <SummaryRow label={`${lang === 'uz' ? 'Xizmat' : lang === 'ru' ? 'Сервис' : 'Service'} (${servicePct}%)`}               value={formatCurrency(serviceAmt)} />
            <div className="border-t border-dashed border-[#dcd9d6] pt-2.5">
              <SummaryRow label={lang === 'uz' ? "To'lash kerak" : lang === 'ru' ? 'К оплате' : 'Total to Pay'}                      value={formatCurrency(total)} bold />
            </div>
            {received > 0 && <SummaryRow label={lang === 'uz' ? 'Qabul qilindi' : lang === 'ru' ? 'Получено' : 'Amount Received'}    value={formatCurrency(received)} />}
            {received > 0 && <SummaryRow label={lang === 'uz' ? 'Qaytim' : lang === 'ru' ? 'Сдача' : 'Change'}                       value={formatCurrency(change)} valueClass="text-[#1d7a52]" />}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="max-h-[65dvh] overflow-y-auto flex-shrink-0 px-5 py-4 border-t border-[#e4e1de] bg-white grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate(`/receipt/${order.id}`)}
          type="button"
          className="ws-btn ws-btn-outline"
        >
          <Eye size={14} />
          {lang === 'uz' ? 'Chek' : lang === 'ru' ? 'Чек' : 'View Check'}
        </button>
        <button
          onClick={() => { navigate(`/receipt/${order.id}`); setTimeout(() => window.print(), 800) }}
          type="button"
          className="ws-btn ws-btn-outline"
        >
          <Printer size={14} />
          {lang === 'uz' ? 'Bosish' : lang === 'ru' ? 'Печать' : 'Print'}
        </button>
        {canChangePaymentMethod && !getOrderPaymentBreakdown(order).some(row => row.method === 'salary') && (
          <div className="col-span-2 grid gap-2">
            {paymentMethodOrderId === order.id && splitPayment ? (
              <PaidPaymentSplitEditor
                key={splitPayment.id}
                orderId={order.id} payment={splitPayment} lang={lang}
                onSaved={result => { setSplitPayment(null); onPaymentSplitSaved(result) }}
                onCancel={() => setSplitPayment(null)}
                onSavingChange={onPaymentSplitSaving}
              />
            ) : paymentMethodOrderId === order.id ? (
              <div className="grid gap-2 rounded-xl border border-[#e4e1de] bg-[#f6f5f3] p-3">
                <p className="ws-caption leading-relaxed">
                  {lang === 'uz'
                    ? 'Har bir to‘lov turini alohida o‘zgartirish mumkin. Summalar va sodiqlik ma’lumotlari o‘zgarmaydi.'
                    : lang === 'ru'
                      ? 'Каждый способ оплаты можно изменить отдельно. Суммы и данные лояльности не изменятся.'
                      : 'Each payment method can be changed separately. Amounts and loyalty data stay unchanged.'}
                </p>
                {(paymentRows.length > 0 ? paymentRows : [{ id: 'legacy', method: order.payment_method, amount: total }]).map((row, index) => (
                  <div key={row.id || `${row.method}-${index}`} className="grid grid-cols-[1fr_150px] items-center gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[#22201d]">
                        {row.method === 'loyalty_card'
                          ? (lang === 'uz' ? 'Sodiqlik' : lang === 'ru' ? 'Лояльность' : 'Loyalty')
                          : `${lang === 'uz' ? "To‘lov" : lang === 'ru' ? 'Платёж' : 'Payment'} ${index + 1}`}
                      </p>
                      <p className="ws-caption tabular-nums">{formatCurrency(row.amount)}</p>
                      {row.method !== 'loyalty_card' && Number(row.amount) >= 2
                        && ((row.id && row.id !== 'legacy') || !(order._mergedIds?.length > 1)) && (
                        <button
                          onClick={() => setSplitPayment(row)}
                          disabled={savingPaymentOrderId === order.id}
                          type="button"
                          className="mt-1 text-left text-xs font-medium text-[#ff5a00] hover:underline disabled:opacity-60"
                        >
                          + {lang === 'uz' ? 'Ikkinchi to‘lovni qo‘shish' : lang === 'ru' ? 'Добавить второй платёж' : 'Add second payment'}
                        </button>
                      )}
                    </div>
                    {row.method === 'loyalty_card' ? (
                      <div className="flex justify-end"><PayBadge method="loyalty_card" lang={lang} /></div>
                    ) : (
                      <select
                        value={paymentMethodDraft[row.id || 'legacy'] || row.method || 'cash'}
                        onChange={event => onPaymentMethodDraftChange(row.id || 'legacy', event.target.value)}
                        disabled={savingPaymentOrderId === order.id}
                        className="ws-input !h-10"
                      >
                        <option value="cash">{lang === 'uz' ? 'Naqd' : lang === 'ru' ? 'Наличные' : 'Cash'}</option>
                        {row.method === 'card' && (
                          <option value="card" disabled>
                            {lang === 'uz' ? 'Karta (tarixiy)' : lang === 'ru' ? 'Карта (исторический)' : 'Card (historical)'}
                          </option>
                        )}
                        <option value="terminal">Terminal</option>
                        {row.method === 'other' && <option value="other" disabled>{lang === 'uz' ? 'Boshqa' : lang === 'ru' ? 'Другое' : 'Other'}</option>}
                      </select>
                    )}
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onSavePaymentMethod(order)}
                    disabled={savingPaymentOrderId === order.id}
                    type="button"
                    className="ws-btn ws-btn-primary"
                  >
                    {savingPaymentOrderId === order.id
                      ? (lang === 'uz' ? 'Saqlanmoqda...' : lang === 'ru' ? 'Сохранение...' : 'Saving...')
                      : (lang === 'uz' ? 'Saqlash' : lang === 'ru' ? 'Сохранить' : 'Save')}
                  </button>
                  <button
                    onClick={onCancelPaymentMethod}
                    disabled={savingPaymentOrderId === order.id}
                    type="button"
                    className="ws-btn ws-btn-outline"
                  >
                    {lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => onStartPaymentMethodChange(order)}
                disabled={deletingOrderId === order.id}
                type="button"
                className="ws-btn ws-btn-outline"
              >
                <Pencil size={14} />
                {lang === 'uz' ? 'To‘lov turini o‘zgartirish' : lang === 'ru' ? 'Изменить способ оплаты' : 'Change payment method'}
              </button>
            )}
          </div>
        )}
        {canDeleteOrder && (
          <div className="col-span-2 grid gap-2">
            <button
              onClick={() => onDeleteOrder(order)}
              disabled={deletingOrderId === order.id || savingPaymentOrderId === order.id}
              type="button"
              className={`ws-btn ${
                confirmDeleteOrderId === order.id
                  ? 'ws-btn-danger-solid'
                  : 'ws-btn-outline ws-btn-danger !text-[#c4262c]'
              }`}
            >
              <Trash2 size={14} />
              {deletingOrderId === order.id
                ? (lang === 'uz' ? 'O‘chirilmoqda...' : lang === 'ru' ? 'Удаление...' : 'Deleting...')
                : confirmDeleteOrderId === order.id
                  ? (lang === 'uz' ? 'O‘chirishni tasdiqlash' : lang === 'ru' ? 'Подтвердить удаление' : 'Confirm delete')
                  : (lang === 'uz' ? 'Buyurtmani o‘chirish' : lang === 'ru' ? 'Удалить заказ' : 'Delete order')}
            </button>
            {confirmDeleteOrderId === order.id && (
              <button
                onClick={onCancelDeleteOrder}
                type="button"
                className="ws-btn ws-btn-ghost"
              >
                {lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function OrderHistoryTab({ orders, allOrders, menuItemMap, lang, navigate, selectedOrder, onSelect, serviceRateSettings }) {
  const [page,      setPage]      = useState(1)
  const [search,    setSearch]    = useState('')
  const [filterPay, setFilterPay] = useState('all')

  // Apply in-tab filters on top of the already date/table/waiter filtered orders
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allOrders.filter(o => {
      const matchPay = filterPay === 'all' || (getPaymentMethod(o) || '').toLowerCase() === filterPay
      const matchQ   = !q ||
        (o.id          && String(o.id).toLowerCase().includes(q)) ||
        (orderTableLabel(o, lang).toLowerCase().includes(q)) ||
        (o.waiter_name && o.waiter_name.toLowerCase().includes(q)) ||
        (o.opened_by_name && o.opened_by_name.toLowerCase().includes(q)) ||
        (o.completed_by_name && o.completed_by_name.toLowerCase().includes(q)) ||
        getOrderItems(o).some(i => (i.name || '').toLowerCase().includes(q))
      return matchPay && matchQ
    })
  }, [allOrders, search, filterPay])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  function resetPage() { setPage(1) }

  return (
    <div>
      {/* In-tab filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
          <input
            type="text" value={search}
            onChange={e => { setSearch(e.target.value); resetPage() }}
            placeholder={lang === 'uz' ? 'Buyurtma, stol, xodim...' : lang === 'ru' ? 'Заказ, стол, сотрудник...' : 'Search by order, table, staff...'}
            className="ws-input !pl-9"
          />
        </div>
        <select value={filterPay} onChange={e => { setFilterPay(e.target.value); resetPage() }}
          className="ws-input !w-auto">
          <option value="all">{lang === 'uz' ? "Barcha to'lovlar" : lang === 'ru' ? 'Все методы' : 'All Payments'}</option>
          <option value="cash">{lang === 'uz' ? 'Naqd' : lang === 'ru' ? 'Наличные' : 'Cash'}</option>
          <option value="card">{lang === 'uz' ? 'Karta' : lang === 'ru' ? 'Карта' : 'Card'}</option>
          <option value="terminal">Terminal</option>
        </select>
      </div>

      {pageOrders.length === 0 ? (
        <EmptyState label={lang === 'uz' ? 'Buyurtmalar topilmadi' : lang === 'ru' ? 'Заказы не найдены' : 'No orders found'} lang={lang} />
      ) : (
        <div className="ws-panel ws-panel-flush w-full !overflow-x-auto">
        <div className="lg:min-w-[1340px]">
          {/* Desktop header */}
          <div className="ws-table-head hidden lg:grid grid-cols-[80px_90px_90px_120px_120px_minmax(145px,1fr)_90px_140px_60px_60px_110px_100px] gap-2 px-4 py-3">
            <span>{lang === 'uz' ? 'Buyurtma' : lang === 'ru' ? 'Заказ' : 'Order ID'}</span>
            <span>{lang === 'uz' ? 'Stol' : lang === 'ru' ? 'Стол' : 'Table'}</span>
            <span>{lang === 'uz' ? 'Mijoz' : lang === 'ru' ? 'Клиент' : 'Customer'}</span>
            <span>{lang === 'uz' ? 'Ochgan' : lang === 'ru' ? 'Открыл' : 'Opened by'}</span>
            <span>{lang === 'uz' ? 'Yopgan' : lang === 'ru' ? 'Закрыл' : 'Completed by'}</span>
            <span>{lang === 'uz' ? 'Sana va vaqt' : lang === 'ru' ? 'Дата и время' : 'Date & Time'}</span>
            <span>{lang === 'uz' ? 'Holat' : lang === 'ru' ? 'Статус' : 'Status'}</span>
            <span>{lang === 'uz' ? "To'lov" : lang === 'ru' ? 'Оплата' : 'Payment'}</span>
            <span className="text-center">{lang === 'uz' ? 'Sodiqlik' : lang === 'ru' ? 'Лояльность' : 'Loyalty'}</span>
            <span className="text-center">{lang === 'uz' ? 'Xizmat' : lang === 'ru' ? 'Серв.' : 'Serv%'}</span>
            <span className="text-right">{lang === 'uz' ? 'Jami' : lang === 'ru' ? 'Итого' : 'Total'}</span>
            <span className="text-right">{lang === 'uz' ? 'Amal' : lang === 'ru' ? 'Действие' : 'Action'}</span>
          </div>

          <div>
            {pageOrders.map(order => {
              const orderNum    = order.id ? `#${String(order.id).slice(-4).toUpperCase()}` : '—'
              const sessionCnt  = order._orderCount || 1
              const loyaltyUsed = Number(order.loyalty_used_amount ?? order.loyalty_redeem_amount ?? order.loyalty_discount_amount ?? 0) || 0
              const servicePct  = getOrderPaymentSummary(
                order,
                getOrderItems(order),
                getConfiguredServiceRatePct(serviceRateSettings, order.price_mode)
              ).serviceRatePct
              const status      = order.payment_status || (isPaidOrder(order) ? 'paid' : 'unpaid')
              const isSelected  = selectedOrder?.id === order.id
              return (
                <div
                  key={order.id || orderNum}
                  onClick={() => onSelect(isSelected ? null : order)}
                  className={`ws-row px-4 py-3 cursor-pointer ${isSelected ? '!bg-[#fff1e8]' : ''}`}
                >
                  {/* Desktop row */}
                  <div className="hidden lg:grid grid-cols-[80px_90px_90px_120px_120px_minmax(145px,1fr)_90px_140px_60px_60px_110px_100px] gap-2 items-center">
                    <span className="font-semibold tabular-nums text-[#22201d] text-sm flex items-center gap-1">
                      {orderNum}
                      {sessionCnt > 1 && (
                        <span className="ws-count !min-w-0 !px-1.5">+{sessionCnt - 1}</span>
                      )}
                    </span>
                    <span className="text-sm font-medium text-[#22201d] truncate">{orderTableLabel(order, lang)}</span>
                    <span><PriceModeBadge mode={order.price_mode} lang={lang} /></span>
                    <span className="text-sm text-[#68655f] truncate">{(order.opened_by_name || order.waiter_name || '—').split(' ')[0]}</span>
                    <span className="text-sm text-[#68655f] truncate">{(order.completed_by_name || '—').split(' ')[0]}</span>
                    <span className="ws-caption">{fmtDate(getOrderDate(order), lang)}</span>
                    <span><StatusBadge status={status} lang={lang} /></span>
                    <span><PaymentMethodBadges order={order} lang={lang} /></span>
                    <span className="text-center text-sm tabular-nums text-[#68655f]">{loyaltyUsed > 0 ? formatCurrency(loyaltyUsed) : '—'}</span>
                    <span className="text-center text-sm tabular-nums text-[#68655f]">{servicePct}%</span>
                    <span className="text-right font-semibold tabular-nums text-sm text-[#22201d]">{formatCurrency(getOrderTotal(order))}</span>
                    <div className="flex justify-end">
                      <button
                        onClick={e => { e.stopPropagation(); onSelect(isSelected ? null : order) }}
                        type="button"
                        className={`ws-btn ws-btn-sm ${isSelected ? 'ws-btn-primary' : 'ws-btn-outline'}`}
                      >
                        {isSelected ? (lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close') : (lang === 'uz' ? 'Batafsil' : lang === 'ru' ? 'Детали' : 'Details')}
                      </button>
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="lg:hidden flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold tabular-nums text-[#22201d] text-sm">{orderNum}</span>
                        <StatusBadge status={status} lang={lang} />
                        <PriceModeBadge mode={order.price_mode} lang={lang} />
                      </div>
                      <p className="text-sm font-medium text-[#22201d]">{orderTableLabel(order, lang)} · {(order.opened_by_name || order.waiter_name || '').split(' ')[0]}</p>
                      {order.completed_by_name && (
                        <p className="ws-caption mt-0.5">
                          {lang === 'uz' ? 'Yopgan' : lang === 'ru' ? 'Закрыл' : 'Completed by'}: {order.completed_by_name.split(' ')[0]}
                        </p>
                      )}
                      <p className="ws-caption mt-0.5">{fmtDate(getOrderDate(order), lang)}</p>
                      <div className="mt-1.5"><PaymentMethodBadges order={order} lang={lang} /></div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="font-semibold tabular-nums text-[#22201d] text-base">{formatCurrency(getOrderTotal(order))}</span>
                      <button type="button" className="ws-btn ws-btn-outline ws-btn-sm">{lang === 'uz' ? 'Batafsil' : lang === 'ru' ? 'Детали' : 'Details'}</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-[#f6f5f3] border-t border-[#e4e1de]">
            <p className="ws-caption tabular-nums">
              {filtered.length === 0
                ? (lang === 'uz' ? "Buyurtma yo'q" : lang === 'ru' ? 'Нет заказов' : 'No orders')
                : `${lang === 'uz' ? "Ko'rsatilmoqda" : lang === 'ru' ? 'Показано' : 'Showing'} ${Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–${Math.min(page * PAGE_SIZE, filtered.length)} ${lang === 'uz' ? 'dan' : lang === 'ru' ? 'из' : 'of'} ${filtered.length} ${lang === 'uz' ? 'ta buyurtma' : lang === 'ru' ? 'заказов' : 'orders'}`
              }
            </p>
            <div className="flex items-center gap-1">
              <PageBtn disabled={page <= 1}           onClick={() => setPage(p => p - 1)}><ChevronLeft  size={14} /></PageBtn>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const n = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i
                return <PageBtn key={n} active={n === page} onClick={() => setPage(n)}>{n}</PageBtn>
              })}
              <PageBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></PageBtn>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

function ReportsSkeleton({ canViewExpenses, lang }) {
  return (
    <div role="status" aria-busy="true" className="space-y-5">
      <span className="sr-only">{lang === 'ru' ? 'Загрузка отчётов' : lang === 'uz' ? 'Hisobotlar yuklanmoqda' : 'Loading reports'}</span>
      <div aria-hidden="true" className={`grid grid-cols-2 lg:grid-cols-3 ${canViewExpenses ? 'xl:grid-cols-6' : 'xl:grid-cols-3'} gap-4`}>
        {Array.from({ length: canViewExpenses ? 6 : 3 }, (_, index) => (
          <div key={index} className="ws-panel motion-safe:animate-pulse">
            <div className="mb-3 h-3 w-2/3 rounded bg-[#efece9]" />
            <div className="h-7 w-full rounded bg-[#e4e1de]" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        {Array.from({ length: canViewExpenses ? 3 : 2 }, (_, index) => (
          <div key={index} className="ws-panel">
            <div className="mb-4 h-4 w-40 rounded bg-[#e4e1de]" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-12 rounded bg-[#efece9]" />
              <div className="h-12 rounded bg-[#efece9]" />
            </div>
          </div>
        ))}
        <div className="ws-panel space-y-6">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-10 rounded bg-[#efece9]" />)}
        </div>
      </div>
    </div>
  )
}

export default function Reports() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const { loaded, loadError } = useAppDataStatus()
  const navigate     = useNavigate()
  const lang         = state.lang
  const deletionDate = useOrderDeletionDate()
  const canDeleteOrder = candidate => !getOrderPaymentBreakdown(candidate).some(row => row.method === 'salary') && canDeleteOrderToday(profile || { role: state.user?.role }, candidate, deletionDate)
  const canChangePaymentMethod = canChangeCompletedOrderPaymentMethod(profile || { role: state.user?.role })
  const canViewExpenses = canViewPage(profile || { role: state.user?.role }, 'expenses')

  const [activeTab,     setActiveTab]     = useState('order_history')
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo,   setDateTo]   = useState(todayStr())
  const [activeRangeKey, setActiveRangeKey] = useState('today')
  const [tableFilter,   setTableFilter]   = useState('all')
  const [waiterFilter,  setWaiterFilter]  = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [deletingOrderId, setDeletingOrderId] = useState('')
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState('')
  const [paymentMethodOrderId, setPaymentMethodOrderId] = useState('')
  const [paymentMethodDraft, setPaymentMethodDraft] = useState({})
  const [savingPaymentOrderId, setSavingPaymentOrderId] = useState('')
  const [expenses, setExpenses] = useState([])
  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [employeeMealSnapshots, setEmployeeMealSnapshots] = useState([])
  const [expensesError, setExpensesError] = useState('')
  const [expenseBreakdownOpen, setExpenseBreakdownOpen] = useState(false)
  const [historyOrders, setHistoryOrders] = useState([])
  const [ordersError, setOrdersError] = useState('')
  const [loadedHistoryRange, setLoadedHistoryRange] = useState('')
  const [settledHistoryRange, setSettledHistoryRange] = useState('')
  const [settledExpenseRange, setSettledExpenseRange] = useState('')
  const reportRange = `${dateFrom}:${dateTo}`
  // Compare during render so applying dates hides stale results before effects run.
  const reportsLoading = settledHistoryRange !== reportRange ||
    (canViewExpenses && settledExpenseRange !== reportRange)

  // ── Lookups ────────────────────────────────────────────────────────────────

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  const reportOrders = useMemo(
    () => mergeOrderHistory(historyOrders, state.orders, dateFrom, dateTo),
    [historyOrders, state.orders, dateFrom, dateTo]
  )

  const uniqueWaiters = useMemo(() => {
    const s = new Set(reportOrders.map(o => o.waiter_name).filter(Boolean))
    return [...s]
  }, [reportOrders])

  // ── Base date-filtered order sets ─────────────────────────────────────────
  //
  // Grouping is applied once here. Both KPI cards and all tabs read from
  // these two lists so they are always in sync.

  const allDateFiltered = useMemo(() => {
    return groupOrdersBySession([...reportOrders])
      .filter(o => {
        const matchDate   = matchesRange(o, dateFrom, dateTo)
        const matchTable  = tableFilter  === 'all' || o.table_id === tableFilter
        const matchWaiter = waiterFilter === 'all' || o.waiter_name === waiterFilter
        return matchDate && matchTable && matchWaiter
      })
      .sort((a, b) => new Date(getOrderDate(b) || 0) - new Date(getOrderDate(a) || 0))
  }, [reportOrders, dateFrom, dateTo, tableFilter, waiterFilter])

  // Paid subset — used for KPI cards and all analytics tabs
  const filteredForAnalytics = useMemo(() =>
    allDateFiltered.filter(isPaidOrder),
    [allDateFiltered]
  )

  // ── KPI ───────────────────────────────────────────────────────────────────

  const kpiRevenue   = filteredForAnalytics.reduce((s, o) => s + getOrderRevenueTotal(o), 0)
  const kpiLoyaltyIncome = filteredForAnalytics.reduce((s, o) => s + getOrderLoyaltyIncomeTotal(o), 0)
  const kpiOrders    = filteredForAnalytics.length
  const kpiAvg       = kpiOrders > 0 ? Math.round(kpiRevenue / kpiOrders) : 0
  const priceModeBreakdown = useMemo(() => {
    const rows = {
      regular: { mode: 'regular', orders: 0, revenue: 0 },
      tourist: { mode: 'tourist', orders: 0, revenue: 0 },
    }
    filteredForAnalytics.forEach(order => {
      const mode = normalizePriceMode(order.price_mode)
      rows[mode].orders += 1
      rows[mode].revenue += getOrderRevenueTotal(order)
    })
    return Object.values(rows)
  }, [filteredForAnalytics])
  const closeout = useMemo(
    () => getDailyCloseout(reportOrders, dateFrom, dateTo, {
      tableId: tableFilter,
      waiterName: waiterFilter,
    }),
    [reportOrders, dateFrom, dateTo, tableFilter, waiterFilter]
  )
  const salaryExpenses = useMemo(() => (
    buildSalaryPaymentExpenseRows(salaryProfiles, dateFrom, dateTo)
  ), [salaryProfiles, dateFrom, dateTo])
  const salaryBonusExpenses = useMemo(() => (
    buildSalaryBonusExpenseRows(salaryProfiles, dateFrom, dateTo)
  ), [salaryProfiles, dateFrom, dateTo])
  const employeeMealExpenses = useMemo(() => (
    buildFinalizedEmployeeMealExpenseRows(employeeMealSnapshots)
  ), [employeeMealSnapshots])
  const allExpenses = useMemo(
    () => [...salaryExpenses, ...salaryBonusExpenses, ...employeeMealExpenses, ...expenses],
    [salaryExpenses, salaryBonusExpenses, employeeMealExpenses, expenses],
  )
  const expenseBreakdownRows = useMemo(() => (
    allExpenses
      .filter(expense => (
        normalizeExpenseEntryType(expense?.entry_type) === 'expense' &&
        normalizeExpenseAmount(expense?.amount) > 0
      ))
      .sort((a, b) => (
        String(b.expense_date || '').localeCompare(String(a.expense_date || '')) ||
        String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
        String(b.id || '').localeCompare(String(a.id || ''))
      ))
  ), [allExpenses])
  const expenseSummary = useMemo(() => summarizeExpenses(allExpenses), [allExpenses])
  const expenseCashflow = useMemo(
    () => summarizeExpenseCashflow(filteredForAnalytics, allExpenses, { includeIncomeEntries: false }),
    [filteredForAnalytics, allExpenses]
  )
  const cashflowLeft = kpiRevenue - expenseSummary.total
  const netIncome = cashflowLeft
  const employeeMealTotal = expenseSummary.byCategory.employee_meals || 0

  useEffect(() => {
    let cancelled = false
    setOrdersError('')
    setLoadedHistoryRange('')
    setSettledHistoryRange('')
    loadOrdersForRange(dateFrom, dateTo)
      .then(rows => {
        if (!cancelled) {
          setHistoryOrders(rows)
          setLoadedHistoryRange(`${dateFrom}:${dateTo}`)
        }
      })
      .catch(error => {
        if (cancelled) return
        setHistoryOrders([])
        setOrdersError(error?.message || 'Could not load complete order history')
      })
      .finally(() => {
        if (!cancelled) setSettledHistoryRange(`${dateFrom}:${dateTo}`)
      })
    return () => { cancelled = true }
  }, [dateFrom, dateTo])

  useEffect(() => {
    let cancelled = false
    setSettledExpenseRange('')
    setExpensesError('')
    async function loadExpenses() {
      if (!canViewExpenses) {
        setExpenses([])
        setEmployeeMealSnapshots([])
        setExpensesError('')
        return
      }
      const [expenseResult, salaryProfileResult, salaryRateResult, salaryPaymentResult, salaryBonusResult, salaryAbsenceResult, teamResult, employeeMealResult] = await Promise.all([
        loadPagedResult((from, to) => supabase
          .from('expenses')
          .select('id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_at')
          .gte('expense_date', dateFrom)
          .lte('expense_date', dateTo)
          .order('expense_date')
          .order('id')
          .range(from, to)),
        loadPagedResult((from, to) => supabase.from('employee_salary_profiles').select('*').order('id').range(from, to)),
        loadPagedResult((from, to) => supabase.from('employee_salary_rates').select('*').order('id').range(from, to)),
        loadPagedResult((from, to) => supabase.from('employee_salary_payments').select('*').order('id').range(from, to)),
        loadPagedResult((from, to) => supabase.from('employee_salary_bonuses').select('*').order('id').range(from, to)),
        loadPagedResult((from, to) => supabase.from('employee_salary_absences').select('*').order('id').range(from, to)),
        loadPagedResult((from, to) => supabase.from('profiles').select('id, full_name, email, role, status').order('id').range(from, to)),
        loadPagedResult((from, to) => supabase.from('employee_daily_meal_expenses').select('business_date, average_daily_amount, present_employee_count, total_amount, source_type, finalized_at, created_at').gte('business_date', dateFrom).lte('business_date', dateTo).order('business_date').range(from, to)),
      ])
      if (cancelled) return
      const { data, error } = expenseResult
      const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
      if (error && message.includes('expenses') && (message.includes('does not exist') || message.includes('schema cache') || message.includes('42p01'))) {
        setExpenses([])
        setExpensesError('')
      } else if (error) {
        setExpenses([])
        setExpensesError(error.message || 'Could not load expenses')
      } else {
        setExpenses(data || [])
        setExpensesError('')
      }
      if (salaryProfileResult.error || salaryRateResult.error || salaryPaymentResult.error || salaryBonusResult.error || salaryAbsenceResult.error) {
        setSalaryProfiles([])
        const salaryError = salaryProfileResult.error || salaryRateResult.error || salaryPaymentResult.error || salaryBonusResult.error || salaryAbsenceResult.error
        setExpensesError(current => current || salaryError?.message || 'Could not load salary accounting data')
      } else {
        setSalaryProfiles(composeSalaryProfiles(
          salaryProfileResult.data || [],
          salaryRateResult.data || [],
          salaryPaymentResult.data || [],
          salaryBonusResult.data || [],
          salaryAbsenceResult.data || [],
          teamResult.data || [],
        ))
      }
      if (employeeMealResult.error) {
        setEmployeeMealSnapshots([])
        setExpensesError(current => current || employeeMealResult.error.message || 'Could not load finalized employee meals')
      } else {
        setEmployeeMealSnapshots(employeeMealResult.data || [])
      }
    }
    loadExpenses()
      .catch(error => {
        if (!cancelled) setExpensesError(error?.message || 'Could not load expenses')
      })
      .finally(() => {
        if (!cancelled) setSettledExpenseRange(`${dateFrom}:${dateTo}`)
      })
    return () => { cancelled = true }
  }, [dateFrom, dateTo, canViewExpenses])

  function selectQuickRange(key) {
    const range = getAccountingQuickRange(key, todayStr())
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

  function exportCloseout() {
    if (reportsLoading || ordersError) return
    const dateSuffix = closeout.dateFrom === closeout.dateTo
      ? closeout.dateTo
      : `${closeout.dateFrom}-to-${closeout.dateTo}`
    downloadCsv(`zar-kebab-closeout-${dateSuffix}.csv`, closeoutToCsv(closeout))
  }

  async function deleteOrder(order) {
    if (!canDeleteOrderToday(profile || { role: state.user?.role }, order) || !order?.id || deletingOrderId) return
    setDeletingOrderId(order.id)
    try {
      const result = await dispatch({ type: 'DELETE_ORDER', payload: { orderId: order.id } })
      if (!result?.error) {
        setHistoryOrders(current => current.filter(row => row.id !== order.id))
        setSelectedOrder(null)
        setConfirmDeleteOrderId('')
      }
    } finally {
      setDeletingOrderId('')
    }
  }

  function startPaymentMethodChange(order) {
    if (!canChangePaymentMethod || !order?.id) return
    const currentMethod = ['cash', 'card', 'terminal'].includes(order.payment_method)
      ? order.payment_method
      : 'cash'
    const editablePayments = (order.payments || []).filter(payment => payment.id && payment.method !== 'loyalty_card')
    setConfirmDeleteOrderId('')
    setPaymentMethodDraft(editablePayments.length > 0
      ? Object.fromEntries(editablePayments.map(payment => [payment.id, payment.method || 'cash']))
      : { legacy: currentMethod })
    setPaymentMethodOrderId(order.id)
  }

  function changePaymentMethodDraft(paymentId, method) {
    setPaymentMethodDraft(current => ({ ...current, [paymentId]: method }))
  }

  async function saveCompletedOrderPaymentMethod(order) {
    if (!canChangePaymentMethod || !order?.id || savingPaymentOrderId || paymentMethodOrderId !== order.id) return
    const orderIds = [...new Set((order._mergedIds?.length ? order._mergedIds : [order.id]).filter(Boolean))]
    const editablePayments = (order.payments || [])
      .filter(payment => payment.id && payment.method !== 'loyalty_card')
    const changes = editablePayments
      .map(payment => ({ paymentId: payment.id, method: paymentMethodDraft[payment.id] || payment.method, previousMethod: payment.method }))
      .filter(change => change.method !== change.previousMethod)
      .map(({ paymentId, method }) => ({ paymentId, method }))
    if (editablePayments.length > 0 && changes.length === 0) {
      setPaymentMethodOrderId('')
      return
    }
    setSavingPaymentOrderId(order.id)
    try {
      const result = editablePayments.length > 0
        ? await dispatch({
            type: 'CHANGE_PAID_ORDER_PAYMENT_METHODS',
            payload: { changes },
          })
        : await dispatch({
            type: 'CHANGE_PAID_ORDER_PAYMENT_METHOD',
            payload: { orderIds, paymentMethod: paymentMethodDraft.legacy },
          })
      if (result?.error) return
      setHistoryOrders(current => current.map(row => {
        if (!orderIds.includes(row.id)) return row
        if (changes.length > 0) return applyIndividualPaymentMethodChanges(row, changes)
        return {
          ...row,
          payment_method: paymentMethodDraft.legacy,
          payments: (row.payments || []).map(payment => payment.method === 'loyalty_card'
            ? payment
            : { ...payment, method: paymentMethodDraft.legacy }
          ),
        }
      }))
      setSelectedOrder(current => current?.id === order.id
        ? (changes.length > 0
            ? applyIndividualPaymentMethodChanges(current, changes)
            : {
                ...current,
                payment_method: paymentMethodDraft.legacy,
                payments: (current.payments || []).map(payment => payment.method === 'loyalty_card'
                  ? payment
                  : { ...payment, method: paymentMethodDraft.legacy }
                ),
              })
        : current
      )
      setPaymentMethodOrderId('')
    } finally {
      setSavingPaymentOrderId('')
    }
  }

  const showDrawer = !!selectedOrder

  const L = {
    uz: { title: 'Hisobotlar', sub: 'Savdo ko\'rsatkichlari va tahlil', totalRev: 'Daromad', loyaltyIncome: 'Loyallik daromadi', numOrders: 'Buyurtmalar', avgOrder: 'O\'rtacha buyurtma', expenses: 'Xarajatlar', employeeMeals: 'Xodimlar ovqati', employeeMealsSub: 'Davomat bo‘yicha hisoblangan', netIncome: 'Barcha xarajatlardan keyin', allTables: 'Barcha stollar', allWaiters: 'Barcha ofitsiantlar', export: 'Eksport', today: 'Bugun', yesterday: 'Kecha', week: '7 kun', month: 'Oy', previousMonth: 'O‘tgan oy', previousWeek: 'O‘tgan hafta', previousCurrentWeek: 'O‘tgan va joriy hafta', currentWeek: 'Joriy hafta', currentNextWeek: 'Joriy va keyingi hafta', nextWeek: 'Keyingi hafta', nextMonth: 'Keyingi oy', presets: 'Tayyor davrlar', applyRange: 'Davrni qo‘llash', cancel: 'Bekor qilish', selectDateRange: 'Sana oralig‘ini tanlash', weekdays: ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'], from: 'Dan', to: 'Gacha', closeout: 'Davr tushumlari', leftAfterExpenses: 'Xarajatlardan keyin qolgan', totalLeft: 'Xarajatlar va ovqatdan keyin', cash: 'Naqd', card: 'Karta', terminal: 'Terminal', cashbackIssued: 'Cashback berildi', cancelled: 'Bekor qilingan', variance: 'Farq', tapForDetails: 'Xarajatlarni ko‘rish', expenseDetails: 'Xarajatlar tafsiloti', periodExpenses: 'Davr xarajatlari', entries: 'ta yozuv', noExpenses: 'Bu davrda xarajatlar yo‘q', salaryPayment: 'Maosh to‘lovi', salaryBonus: 'Maosh bonusi', close: 'Yopish' },
    ru: { title: 'Отчёты',     sub: 'Обзор продаж и аналитика',         totalRev: 'Доход', loyaltyIncome: 'Доход по лояльности', numOrders: 'Заказов',     avgOrder: 'Средний чек',      expenses: 'Расходы', employeeMeals: 'Питание сотрудников', employeeMealsSub: 'Рассчитано по посещаемости', netIncome: 'После всех расходов',   allTables: 'Все столы',         allWaiters: 'Все официанты',       export: 'Экспорт', today: 'Сегодня', yesterday: 'Вчера', week: '7 дней', month: 'Месяц', previousMonth: 'Прошлый месяц', previousWeek: 'Прошлая неделя', previousCurrentWeek: 'Прошлая и текущая неделя', currentWeek: 'Текущая неделя', currentNextWeek: 'Текущая и следующая неделя', nextWeek: 'Следующая неделя', nextMonth: 'Следующий месяц', presets: 'Готовые периоды', applyRange: 'Применить период', cancel: 'Отмена', selectDateRange: 'Выбрать период', weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], from: 'С', to: 'По', closeout: 'Поступления за период', leftAfterExpenses: 'Остаток после расходов', totalLeft: 'После расходов и питания', cash: 'Наличные', card: 'Карта', terminal: 'Терминал', cashbackIssued: 'Кешбэк выдан', cancelled: 'Отменено', variance: 'Расхождение', tapForDetails: 'Показать расходы', expenseDetails: 'Детализация расходов', periodExpenses: 'Расходы за период', entries: 'записей', noExpenses: 'За этот период расходов нет', salaryPayment: 'Выплата зарплаты', salaryBonus: 'Бонус к зарплате', close: 'Закрыть' },
    en: { title: 'Reports',    sub: 'Sales overview and analytics',      totalRev: 'Income', loyaltyIncome: 'Loyalty income', numOrders: 'Orders',      avgOrder: 'Avg Order Value',  expenses: 'Expenses', employeeMeals: 'Employees meal', employeeMealsSub: 'Calculated from attendance', netIncome: 'After all expenses', allTables: 'All Tables',        allWaiters: 'All Waiters',         export: 'Export',  today: 'Today', yesterday: 'Yesterday', week: '7 Days', month: 'Month', previousMonth: 'Previous month', previousWeek: 'Previous week', previousCurrentWeek: 'Previous & current week', currentWeek: 'Current week', currentNextWeek: 'Current & next week', nextWeek: 'Next week', nextMonth: 'Next month', presets: 'Presets', applyRange: 'Apply range', cancel: 'Cancel', selectDateRange: 'Select date range', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], from: 'From', to: 'To', closeout: 'Period receipts', leftAfterExpenses: 'Left after expenses', totalLeft: 'After expenses and meals', cash: 'Cash', card: 'Card', terminal: 'Terminal', cashbackIssued: 'Cashback issued', cancelled: 'Cancelled', variance: 'Variance', tapForDetails: 'View expenses', expenseDetails: 'Expense breakdown', periodExpenses: 'Expenses for the period', entries: 'entries', noExpenses: 'No expenses were recorded for this period', salaryPayment: 'Salary payment', salaryBonus: 'Salary bonus', close: 'Close' },
  }
  const l = L[lang] || L.en

  if (!loaded || loadError) {
    return (
      <AppShell title={l.title}>
        <div className="min-h-full bg-[#f6f5f3]">
          {!loaded ? (
            <OperationalLoading layout="dashboard"
              title={lang === 'uz' ? 'Hisobotlar yuklanmoqda' : lang === 'ru' ? 'Загрузка отчётов' : 'Loading reports'}
              description={lang === 'uz' ? 'Buyurtmalar va to‘lovlar olinmoqda.' : lang === 'ru' ? 'Получаем заказы и платежи.' : 'Fetching orders and payments.'}
            />
          ) : (
            <OperationalError
              title={lang === 'uz' ? 'Hisobotlarni yuklab bo‘lmadi' : lang === 'ru' ? 'Не удалось загрузить отчёты' : 'Could not load reports'}
              description={loadError}
              actionLabel={lang === 'uz' ? 'Qayta yuklash' : lang === 'ru' ? 'Перезагрузить' : 'Reload'}
              onAction={() => window.location.reload()}
            />
          )}
        </div>
      </AppShell>
    )
  }

  const reportTabs = {
    label: l.title,
    value: activeTab,
    onChange: setActiveTab,
    items: TABS.map(({ key, label }) => ({ key, label: label[lang] || label.en })),
  }

  function renderFilters(compact) {
    const control = compact ? '!h-[38px]' : '!h-11'
    return (
      <div className="flex flex-wrap items-stretch gap-2">
        <DateRangePicker
          l={l}
          lang={lang}
          rangeKey={activeRangeKey}
          dateFrom={dateFrom}
          dateTo={dateTo}
          today={todayStr()}
          onPreset={selectQuickRange}
          onApply={setCustomRange}
          compact={compact}
          className={compact ? 'w-[260px]' : 'w-full sm:w-auto sm:min-w-[280px] sm:max-w-[420px] sm:flex-1'}
        />
        <div className="flex flex-wrap items-stretch gap-2">
          <select value={tableFilter} onChange={e => setTableFilter(e.target.value)}
            aria-label={l.allTables}
            className={`ws-input ${control} !w-auto max-w-[200px]`}>
            <option value="all">{l.allTables}</option>
            {state.tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={waiterFilter} onChange={e => setWaiterFilter(e.target.value)}
            aria-label={l.allWaiters}
            className={`ws-input ${control} !w-auto max-w-[200px]`}>
            <option value="all">{l.allWaiters}</option>
            {uniqueWaiters.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>
    )
  }

  return (
    <AppShell
      title={l.title}
      titleAccessory={<div className="zk-filters-in-header">{renderFilters(true)}</div>}
      headerActions={(
        <button
          type="button"
          onClick={exportCloseout}
          disabled={reportsLoading || Boolean(ordersError)}
          aria-label={l.export}
          title={l.export}
          className="ws-btn ws-btn-outline !h-[38px]"
        >
          <Download size={16} />
          <span className="hidden sm:inline">{l.export}</span>
        </button>
      )}
    >
      <div className="flex h-full overflow-hidden bg-[#f6f5f3]">

        {/* ── Main content ── */}
        <div className={`flex-1 min-w-0 overflow-y-auto transition-all ${showDrawer ? 'lg:mr-[380px]' : ''}`}>
          <div className="min-h-full bg-[#f6f5f3]">
          <div className="ws-page">

            {/* Report views sit at the top of the page; the filters live in the top bar when it has room. */}
            <nav aria-label={reportTabs.label} className="ws-page-tabs -mt-2 border-b border-[#e4e1de]">
              {reportTabs.items.map(item => (
                <button key={item.key} type="button" aria-pressed={reportTabs.value === item.key} onClick={() => reportTabs.onChange(item.key)}>
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Filters fall back to the page when the top bar is too narrow (.zk-filters-in-page). */}
            <div className="zk-filters-in-page">{renderFilters(false)}</div>

            {ordersError && (
              <div className="ws-notice ws-tone-negative" role="alert">
                {ordersError}
              </div>
            )}
            {canViewExpenses && expensesError && (
              <div className="ws-notice ws-tone-negative" role="alert">
                {expensesError}
              </div>
            )}

            {reportsLoading && (
              <ReportsSkeleton canViewExpenses={canViewExpenses} lang={lang} />
            )}
            <div hidden={reportsLoading || Boolean(ordersError)} className="space-y-5">
            {/* KPI cards */}
            <div className={`grid grid-cols-2 lg:grid-cols-3 ${canViewExpenses ? 'xl:grid-cols-6' : 'xl:grid-cols-3'} gap-4`}>
              <KpiCard icon={DollarSign}  label={l.totalRev}  value={formatCurrency(kpiRevenue)} sub={`${l.loyaltyIncome}: ${formatCurrency(kpiLoyaltyIncome)}`} />
              <KpiCard icon={ShoppingBag} label={l.numOrders} value={kpiOrders} />
              <KpiCard icon={BarChart2}   label={l.avgOrder}  value={formatCurrency(kpiAvg)} />
              {canViewExpenses && (
                <>
                  <KpiCard icon={CreditCard} label={l.expenses} value={expensesError ? '—' : formatCurrency(expenseSummary.total)} sub={expensesError || ''} />
                  <KpiCard icon={UtensilsCrossed} label={l.employeeMeals} value={expensesError ? '—' : formatCurrency(employeeMealTotal)} sub={l.employeeMealsSub} />
                  <KpiCard icon={DollarSign} iconCls={expensesError ? '' : netIncome >= 0 ? 'text-[#1d7a52]' : 'text-[#c4262c]'} label={l.netIncome} value={expensesError ? '—' : formatCurrency(netIncome)} />
                </>
              )}
            </div>

            <section className="ws-panel">
              <div className="mb-4">
                <h2 className="ws-heading">
                  {lang === 'uz' ? 'Menyu turi bo‘yicha savdo' : lang === 'ru' ? 'Продажи по типу меню' : 'Sales by menu type'}
                </h2>
                <p className="ws-caption mt-0.5">
                  {lang === 'uz' ? 'Oddiy va turist narxlari bo‘yicha daromad' : lang === 'ru' ? 'Доход по обычным и туристическим ценам' : 'Income split between regular and tourist pricing'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {priceModeBreakdown.map(row => (
                  <div key={row.mode} className="rounded-xl border border-[#e4e1de] bg-[#f6f5f3] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[#22201d]">{getPriceModeLabel(row.mode, lang)}</span>
                      <span className="ws-caption tabular-nums">{row.orders} {lang === 'uz' ? 'buyurtma' : lang === 'ru' ? 'заказов' : 'orders'}</span>
                    </div>
                    <p className="mt-2 text-xl font-semibold tracking-[-.02em] tabular-nums text-[#22201d]">{formatCurrency(row.revenue)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="ws-panel">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="ws-heading">{l.closeout}</h2>
                  <p className="ws-caption mt-0.5">
                    {closeout.dateFrom === closeout.dateTo
                      ? formatLongDate(closeout.dateTo, lang, closeout.dateTo)
                      : `${formatLongDate(closeout.dateFrom, lang, closeout.dateFrom)} — ${formatLongDate(closeout.dateTo, lang, closeout.dateTo)}`}
                  </p>
                </div>
                <button type="button" onClick={exportCloseout} className="ws-btn ws-btn-outline ws-btn-sm">
                  <Download size={14} />{l.export}
                </button>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <SummaryRow label={l.cash} value={formatCurrency(closeout.totals.cash)} />
                <SummaryRow label={l.card} value={formatCurrency(closeout.totals.card)} />
                <SummaryRow label={l.terminal} value={formatCurrency(closeout.totals.terminal)} />
                {closeout.totals.salary > 0 && <SummaryRow label={expensePaymentMethodLabel('salary', lang)} value={formatCurrency(closeout.totals.salary)} />}
                <SummaryRow label={l.loyaltyIncome} value={formatCurrency(closeout.loyaltyIncome)} />
                <SummaryRow label={l.cashbackIssued} value={formatCurrency(closeout.cashbackIssued)} />
                <SummaryRow label={l.cancelled} value={closeout.cancelledCount} />
                <SummaryRow label={l.variance} value={closeout.variance == null ? (lang === 'ru' ? 'Не измерено' : lang === 'uz' ? 'O‘lchanmagan' : 'Not measured') : formatCurrency(closeout.variance)} />
              </div>
            </section>

            {canViewExpenses && !expensesError && (
              <div
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                aria-expanded={expenseBreakdownOpen}
                onClick={() => setExpenseBreakdownOpen(true)}
                onKeyDown={event => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  setExpenseBreakdownOpen(true)
                }}
                className="ws-panel block w-full cursor-pointer touch-manipulation text-left transition-shadow hover:shadow-[0_4px_14px_rgb(34_32_29/8%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="ws-heading">{l.leftAfterExpenses}</h2>
                    <p className="ws-caption mt-0.5">
                      {closeout.dateFrom === closeout.dateTo
                        ? formatLongDate(closeout.dateTo, lang, closeout.dateTo)
                        : `${formatLongDate(closeout.dateFrom, lang, closeout.dateFrom)} — ${formatLongDate(closeout.dateTo, lang, closeout.dateTo)}`}
                    </p>
                  </div>
                  <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-[#ff5a00]">
                    {l.tapForDetails}<ChevronRight size={15} />
                  </span>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryRow label={l.cash} value={formatCurrency(expenseCashflow.byMethod.cash.left)} />
                  <SummaryRow label={l.card} value={formatCurrency(expenseCashflow.byMethod.card.left)} />
                  <SummaryRow label={l.terminal} value={formatCurrency(expenseCashflow.byMethod.terminal.left)} />
                  <SummaryRow label={l.employeeMeals} value={formatCurrency(employeeMealTotal)} />
                  <SummaryRow label={l.expenses} value={formatCurrency(expenseSummary.total)} />
                  <SummaryRow label={l.totalLeft} value={formatCurrency(cashflowLeft)} />
                  <p className="ws-caption sm:col-span-2 lg:col-span-4">{lang === 'ru' ? 'Движение за выбранный период, без начального остатка. Питание сотрудников уже включено в расходы как расчётная стоимость, без списания с наличных, карты или терминала.' : lang === 'uz' ? 'Tanlangan davr harakati, boshlang‘ich qoldiqsiz. Xodimlar ovqati hisoblangan xarajatga kiritilgan, naqd, karta yoki terminaldan yechilmagan.' : 'Movement for this period, excluding opening balances. Employee meals are already included in expenses as a calculated cost, with no cash, card or terminal deduction.'}</p>
                </div>
              </div>
            )}

            {/* Tab content — all use filteredForAnalytics (same as KPI) */}
            {activeTab === 'best_selling'       && (
              <BestSellingTab orders={filteredForAnalytics} menuItemMap={menuItemMap} categories={state.categories} lang={lang} />
            )}
            {activeTab === 'dish_sales'         && (
              ordersError ? (
                <CompactEmpty label={lang === 'ru' ? 'История продаж не загружена. Обновите страницу, чтобы повторить.' : lang === 'uz' ? 'Sotuv tarixi yuklanmadi. Qayta urinish uchun sahifani yangilang.' : 'Sales history could not load. Refresh the page to retry.'} />
              ) : loadedHistoryRange !== `${dateFrom}:${dateTo}` ? (
                <CompactEmpty label={lang === 'ru' ? 'Загрузка продаж за выбранный период…' : lang === 'uz' ? 'Tanlangan davr sotuvlari yuklanmoqda…' : 'Loading sales for the selected period…'} />
              ) : <DishSalesTab orders={filteredForAnalytics} menuItems={state.menuItems} categories={state.categories} lang={lang} />
            )}
            {activeTab === 'by_category'        && (
              <ByCategoryTab  orders={filteredForAnalytics} categories={state.categories} menuItemMap={menuItemMap} lang={lang} />
            )}
            {activeTab === 'by_hour'            && (
              <ByHourTab      orders={filteredForAnalytics} lang={lang} />
            )}
            {activeTab === 'payment_methods'    && (
              <PaymentMethodsTab orders={filteredForAnalytics} lang={lang} />
            )}
            {activeTab === 'order_types'        && (
              <OrderTypesTab orders={filteredForAnalytics} lang={lang} />
            )}
            {activeTab === 'waiter_performance' && (
              <WaiterPerformanceTab orders={filteredForAnalytics} lang={lang} />
            )}
            {activeTab === 'order_history'      && (
              <OrderHistoryTab
                orders={filteredForAnalytics}
                allOrders={filteredForAnalytics}
                menuItemMap={menuItemMap}
                lang={lang}
                navigate={navigate}
                selectedOrder={selectedOrder}
                onSelect={setSelectedOrder}
                serviceRateSettings={state.settings}
              />
            )}

            </div>
          </div>
          </div>
        </div>

        {/* ── Right drawer ── */}
        {showDrawer && (
          <>
            <div className="lg:hidden fixed inset-0 bg-[#22201d]/40 z-30" onClick={() => setSelectedOrder(null)} />
            <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] lg:w-[380px] bg-white border-l border-[#e4e1de] shadow-[0_24px_48px_-12px_rgb(34_32_29/25%)] z-40 flex flex-col overflow-hidden">
              <OrderDrawer
                order={selectedOrder}
                menuItemMap={menuItemMap}
                onClose={() => {
                  setSelectedOrder(null)
                  setPaymentMethodOrderId('')
                  setConfirmDeleteOrderId('')
                }}
                navigate={navigate}
                lang={lang}
                serviceRateSettings={state.settings}
                canDeleteOrder={canDeleteOrder(selectedOrder)}
                onDeleteOrder={deleteOrder}
                deletingOrderId={deletingOrderId}
                confirmDeleteOrderId={confirmDeleteOrderId}
                onCancelDeleteOrder={() => setConfirmDeleteOrderId('')}
                canChangePaymentMethod={canChangePaymentMethod}
                paymentMethodOrderId={paymentMethodOrderId}
                onPaymentSplitSaved={result => {
                  setHistoryOrders(current => current.map(row => applyPaymentSplit(row, result)))
                  setSelectedOrder(current => applyPaymentSplit(current, result))
                  setPaymentMethodOrderId('')
                }}
                onPaymentSplitSaving={saving => setSavingPaymentOrderId(saving ? selectedOrder.id : '')}
                paymentMethodDraft={paymentMethodDraft}
                onStartPaymentMethodChange={startPaymentMethodChange}
                onPaymentMethodDraftChange={changePaymentMethodDraft}
                onSavePaymentMethod={saveCompletedOrderPaymentMethod}
                onCancelPaymentMethod={() => setPaymentMethodOrderId('')}
                savingPaymentOrderId={savingPaymentOrderId}
              />
            </div>
          </>
        )}

        {expenseBreakdownOpen && !expensesError && (
          <ExpenseBreakdownDialog
            rows={expenseBreakdownRows}
            expenseSummary={expenseSummary}
            expenseCashflow={expenseCashflow}
            cashflowLeft={cashflowLeft}
            dateFrom={dateFrom}
            dateTo={dateTo}
            lang={lang}
            labels={l}
            onClose={() => setExpenseBreakdownOpen(false)}
          />
        )}
      </div>
    </AppShell>
  )
}
