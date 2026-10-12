import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Receipt, CreditCard, Clock, Users, Search,
  ChevronDown, Table2, Banknote, Monitor,
  UtensilsCrossed, ArrowUpDown, X, HelpCircle, Trash2, RotateCcw, Plus,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useOrderDeletionDate } from '../store/useOrderDeletionDate'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/formatCurrency'
import {
  getGroupedOrderItems,
  getOrderDate,
  getOrderPaymentBreakdown,
  getOrderRevenueTotal,
  getOrderTotal,
  groupOrdersBySession,
  isPaidOrder,
  normalizePaymentMethod,
  toLocalDateStr,
} from '../lib/analytics'
import { getOrderItemUnitPrice, getPriceModeLabel, normalizePriceMode } from '../lib/priceModes'
import { cashierBillKey, getCashierBillableItems, isCashierVisibleBill, isTakeAwayBill } from '../lib/cashierBills'
import UnifiedSidebar from '../components/UnifiedSidebar'
import MobileDrawer from '../components/MobileDrawer'
import WorkspaceTopBar from '../components/WorkspaceTopBar'
import { inferOrderType, isDeliveryOrderType, isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes'
import { getItemName } from '../lib/i18n'
import { getQuickItemSortOrder, isActiveMenuItem, isCashierQuickItem } from '../lib/menuItems'
import { formatDateTime, formatElapsedSince, formatTime, parseInstantDate } from '../lib/dateFormat'
import { canDeleteOrderToday, canEditFeature, canMoveBackToTable } from '../lib/permissions'
import { getOrderItemOptionLines } from '../components/MenuProductCards'
import { useAppDataStatus } from '../store/appHooks'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { formatMenuQuantity, isMenuItemSoldByWeight } from '../lib/menuSaleUnits'
import { getConfiguredServiceRatePct } from '../lib/serviceRates'

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsedSince(iso) {
  return formatElapsedSince(iso)
}

function timeLabel(iso) {
  return formatTime(iso)
}

function dateTimeLabel(iso) {
  return formatDateTime(iso)
}

function countLabel(count, lang) {
  if (lang === 'uz') return `${count} hisob`
  if (lang === 'ru') return `${count} ${count === 1 ? 'счёт' : count < 5 ? 'счёта' : 'счетов'}`
  return `${count} bill${count === 1 ? '' : 's'}`
}


function getCashierItemName(item, menuItem, lang) {
  return menuItem ? getItemName(menuItem, lang) : item.name
}

// ── Localisation ──────────────────────────────────────────────────────────────
const L = {
  uz: {
    title:           'Kassir',
    subtitle:        "To'lovlarni qayta ishlash va hisoblarni yopish",
    activeBills:     'Faol hisoblar',
    needsBill:       'Hisob kerak',
    paidToday:       "Bugun to'langan",
    attentionBills:  'hisob kassirni kutmoqda',
    billsTab:        'Hisoblar',
    payMethods:      "Bugungi to'lov usullari",
    tables:          'stol',
    waitingPay:      "To'lovni kutmoqda",
    completed:       'Yakunlangan',
    totalCollected:  "Jami yig'ilgan",
    activeBillsSec:  'Faol hisoblar',
    search:          'Stol, ofitsiant yoki mahsulot qidirish...',
    allWaiters:      'Barcha ofitsiantlar',
    allStatus:       'Barcha holat',
    occupied:        'Band',
    activeNotReady:  'Faol, hisobga tayyor emas',
    activeTableBills: 'Faol stol hisoblari',
    takeAwayBills:   'Olib ketish hisoblari',
    deliveryBills:   'Yetkazib berish hisoblari',
    needsBillBadge:  'Hisob kerak',
    newestFirst:     'Yangi avval',
    oldestFirst:     'Eski avval',
    highestAmt:      "Yuqori summa",
    lowestAmt:       "Quyi summa",
    openBill:        'Hisobni ochish',
    moreItems:       'ta mahsulot ko\'proq',
    waiter:          'Ofitsiant',
    opened:          'Ochildi',
    items:           'mahsulot',
    noActiveBills:   'Faol hisoblar yo\'q',
    noActiveSub:     "Hech qanday stol to'lov kutmaydi",
    noPayData:       "To'lov ma'lumotlari yo'q",
    deleteOrder:     "Buyurtmani o'chirish",
    confirmDelete:   "O'chirishni tasdiqlash",
    takeAway:         'Olib ketish',
    delivery:         'Yetkazib berish',
    showPaid:         "To'langanlarni ko'rsatish",
    hidePaid:         "To'langanlarni yashirish",
    noTable:          'Stolsiz',
    waitingKitchen:  'Tayyorlanmoqda',
    waitingKitchenSub: 'Buyurtma kassirda ochiq',
    recallTable:     'Stolga qaytarish',
    deleteFailed:    "Buyurtmani o'chirib bo'lmadi",
    quickItems:      'Tezkor kassir mahsulotlari',
    addQuickFailed:  "Tezkor mahsulotni qo'shib bo'lmadi",
    payments:        n => `${n} ta to'lov`,
    ofTodayRev:      'bugungi daromaddan',
    openCheck:       'Chekni ochish',
  },
  ru: {
    title:           'Кассир',
    subtitle:        'Обработка платежей и закрытие счетов',
    activeBills:     'Активные счета',
    needsBill:       'Нужен счёт',
    paidToday:       'Оплачено сегодня',
    attentionBills:  'счетов ждут кассира',
    billsTab:        'Счета',
    payMethods:      'Способы оплаты сегодня',
    tables:          'столов',
    waitingPay:      'Ожидают оплаты',
    completed:       'Завершённые',
    totalCollected:  'Всего собрано',
    activeBillsSec:  'Активные счета',
    search:          'Поиск по столу, официанту или блюду...',
    allWaiters:      'Все официанты',
    allStatus:       'Все статусы',
    occupied:        'Занят',
    activeNotReady:  'Активные, счёт не готов',
    activeTableBills: 'Активные счета столов',
    takeAwayBills:   'Заказ с собой',
    deliveryBills:   'Доставка',
    needsBillBadge:  'Нужен счёт',
    newestFirst:     'Сначала новые',
    oldestFirst:     'Сначала старые',
    highestAmt:      'Высокая сумма',
    lowestAmt:       'Низкая сумма',
    openBill:        'Открыть счёт',
    moreItems:       'ещё позиций',
    waiter:          'Официант',
    opened:          'Открыт',
    items:           'позиций',
    noActiveBills:   'Нет активных счетов',
    noActiveSub:     'Ни один стол не ожидает оплаты',
    noPayData:       'Нет данных об оплате',
    deleteOrder:     'Удалить заказ',
    confirmDelete:   'Подтвердить удаление',
    takeAway:         'Заказ с собой',
    delivery:         'Доставка',
    showPaid:         'Показать оплаченные',
    hidePaid:         'Скрыть оплаченные',
    noTable:          'Без стола',
    waitingKitchen:  'Готовится',
    waitingKitchenSub: 'Заказ уже открыт у кассира',
    recallTable:     'Вернуть на стол',
    deleteFailed:    'Не удалось удалить заказ',
    quickItems:      'Быстрые товары кассира',
    addQuickFailed:  'Не удалось добавить быстрый товар',
    payments:        n => `${n} платёж${n === 1 ? '' : n < 5 ? 'а' : 'ей'}`,
    ofTodayRev:      'от дневной выручки',
  },
  en: {
    title:           'Cashier',
    subtitle:        'Process payments and close bills',
    activeBills:     'Active Bills',
    needsBill:       'Needs Bill',
    paidToday:       'Paid Today',
    attentionBills:  'bills waiting for the cashier',
    billsTab:        'Bills',
    payMethods:      'Payment Methods Today',
    tables:          'tables',
    waitingPay:      'Waiting for payment',
    completed:       'Completed orders',
    totalCollected:  'Total collected',
    activeBillsSec:  'Active Bills',
    search:          'Search by table, waiter or customer...',
    allWaiters:      'All Waiters',
    allStatus:       'All Status',
    occupied:        'Occupied',
    activeNotReady:  'Active, not bill-ready',
    activeTableBills: 'Active table bills',
    takeAwayBills:   'Take-away bills',
    deliveryBills:   'Delivery bills',
    needsBillBadge:  'Needs Bill',
    newestFirst:     'Newest First',
    oldestFirst:     'Oldest First',
    highestAmt:      'Highest Amount',
    lowestAmt:       'Lowest Amount',
    openBill:        'Open Bill',
    moreItems:       'more items',
    waiter:          'Waiter',
    opened:          'Opened',
    items:           'items',
    noActiveBills:   'No active bills',
    noActiveSub:     'No tables need payment right now',
    noPayData:       'No payments today yet',
    deleteOrder:     'Delete order',
    confirmDelete:   'Confirm delete',
    takeAway:         'Take Away',
    delivery:         'Delivery',
    showPaid:         'Show paid today',
    hidePaid:         'Hide paid today',
    noTable:          'No table',
    waitingKitchen:  'Preparing',
    waitingKitchenSub: 'Order is already open for cashier',
    recallTable:     'Move back to table',
    deleteFailed:    'Could not delete order',
    quickItems:      'Cashier quick items',
    addQuickFailed:  'Could not add quick item',
    payments:        n => `${n} payment${n === 1 ? '' : 's'}`,
    ofTodayRev:      "of today's income",
  },
}

const PAY_METHOD_CONFIG = [
  { key: 'cash',     icon: Banknote,    color: '#16A34A', labelEn: 'Cash',     labelUz: 'Naqd',      labelRu: 'Наличные'    },
  { key: 'card',     icon: CreditCard,  color: '#7C3AED', labelEn: 'Card',     labelUz: 'Karta',     labelRu: 'Карта'       },
  { key: 'terminal', icon: Monitor,     color: '#2563EB', labelEn: 'Terminal', labelUz: 'Terminal',  labelRu: 'Терминал'    },
  { key: 'loyalty_card', icon: CreditCard, color: '#D97706', labelEn: 'Loyalty', labelUz: 'Loyallik', labelRu: 'Лояльность' },
  { key: 'mixed',    icon: CreditCard,  color: '#475569', labelEn: 'Mixed',    labelUz: 'Aralash',   labelRu: 'Смешанный'   },
  { key: 'unknown',  icon: HelpCircle,  color: '#9CA3AF', labelEn: 'Unknown',  labelUz: "Noma'lum",  labelRu: 'Неизвестно'  },
]

function getPaymentMethodConfig(method) {
  const key = normalizePaymentMethod(method)
  return PAY_METHOD_CONFIG.find(config => config.key === key)
    || PAY_METHOD_CONFIG.find(config => config.key === 'unknown')
}

function getPaymentMethodLabel(config, lang) {
  if (lang === 'uz') return config.labelUz
  if (lang === 'ru') return config.labelRu
  return config.labelEn
}

function getPaidOrderPaymentMethods(order) {
  const breakdown = getOrderPaymentBreakdown(order)
  const methods = breakdown.length > 0
    ? breakdown.filter(row => Number(row.amount) > 0).map(row => row.method)
    : [order.payment_method]
  return [...new Set(methods.map(normalizePaymentMethod))].map(getPaymentMethodConfig)
}

const SORT_OPTIONS = (l) => [
  { key: 'newest',  label: l.newestFirst },
  { key: 'oldest',  label: l.oldestFirst },
  { key: 'highest', label: l.highestAmt  },
  { key: 'lowest',  label: l.lowestAmt   },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function TableStatusBadge({ status, lang }) {
  const l = L[lang] || L.en
  if (status === 'game_club') return <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">{orderTypeLabel(status, lang)}</span>
  if (status === 'delivery') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
        {l.delivery}
      </span>
    )
  }
  if (status === 'take_away') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-[#2563EB] border border-blue-100">
        {l.takeAway}
      </span>
    )
  }
  if (status === 'needs_bill') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-[#DC2626] border border-red-100">
        {l.needsBillBadge}
      </span>
    )
  }
  return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-orange-50 text-[#ff5a00] border border-orange-100">
      {l.occupied}
    </span>
  )
}

function BillCard({
  order,
  table,
  menuItemMap,
  lang,
  quickItems = [],
  onOpen,
  onAddQuickItem,
  quickAddBusyKey = '',
  quickAddError = '',
  onRecall,
  canEdit,
  canDelete,
  onDelete,
  confirmDelete,
  isDeleting,
  deleteError,
}) {
  const l = L[lang] || L.en
  const orderType = inferOrderType(order)
  const priceMode = normalizePriceMode(order.price_mode)

  const items = useMemo(() => {
    return getGroupedOrderItems(order.items || [])
  }, [order.items])

  const preview   = items.slice(0, 4)
  const moreCount = items.length - preview.length
  const readyForCashier = isCashierVisibleBill(order)

  return (
    <div className={`rounded-2xl border flex flex-col transition-all ${
      readyForCashier
        ? 'bg-white border-[#E5E7EB] shadow-sm hover:shadow-md'
        : 'bg-[#FAFAFA] border-[#E5E7EB] opacity-60'
    }`}>

      {/* Card header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#F3F4F6]">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              readyForCashier ? 'bg-gray-100' : 'bg-gray-50'
            }`}>
              <Users size={16} className="text-[#6B7280]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-[#1F2937] text-[16px] leading-tight">
                {isOffPremiseOrderType(orderType) ? `${orderTypeLabel(orderType, lang)} · ${order.order_number || order.id}` : order.table_name}
              </h3>
              {isOffPremiseOrderType(orderType) && <p className="text-[11px] font-bold text-[#ff5a00]">{l.noTable}</p>}
              {order.waiter_name && (
                <p className="text-[11px] text-[#9CA3AF]">{l.waiter}: {order.waiter_name}</p>
              )}
              <p className="mt-1 text-[11px] font-black text-[#ff5a00]">
                {lang === 'uz' ? 'Menyu turi' : lang === 'ru' ? 'Тип меню' : 'Menu type'}: {getPriceModeLabel(priceMode, lang)}
              </p>
            </div>
          </div>
          <TableStatusBadge status={isOffPremiseOrderType(orderType) ? orderType : table?.status || order.status} lang={lang} />
        </div>

        <div className="flex items-center gap-4 mt-3 text-[11px] text-[#9CA3AF]">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {l.opened} {elapsedSince(order.created_at)}
            {order.created_at && <span className="text-[#D1D5DB]">({dateTimeLabel(order.created_at)})</span>}
          </span>
          <span>{items.length} {l.items}</span>
        </div>
      </div>

      {/* Total */}
      <div className="px-5 pt-4 pb-3">
        <p className={`font-black text-[26px] leading-none mb-4 ${readyForCashier ? 'text-[#ff5a00]' : 'text-[#9CA3AF]'}`}>
          {formatCurrency(order.cashier_total ?? getOrderTotal(order))}
        </p>

        {/* Item preview */}
        <div className="space-y-2.5">
          {preview.map((item, i) => {
            const mi = menuItemMap[item.menu_item_id]
            const displayName = getCashierItemName(item, mi, lang)
            const optionLines = getOrderItemOptionLines(item, mi, lang)
            const lineTotal = getOrderItemUnitPrice(item) * (Number(item.quantity) || 1)
            const quantitySource = { ...mi, sale_unit: item.sale_unit || mi?.sale_unit }
            const quantityLabel = isMenuItemSoldByWeight(quantitySource)
              ? formatMenuQuantity(item.quantity, quantitySource)
              : `×${formatMenuQuantity(item.quantity, quantitySource)}`
            return (
              <div key={i} className="flex items-center gap-3">
                {mi?.image_url ? (
                  <img
                    src={mi.image_url}
                    alt={displayName}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <UtensilsCrossed size={12} className="text-gray-300" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#1F2937]">{displayName}</p>
                  {optionLines.map((line, index) => (
                    <p key={`${item.id || i}-option-${index}`} className="truncate text-[11px] font-black text-[#111827]">{line}</p>
                  ))}
                </div>
                <span className="min-w-8 flex-shrink-0 text-center text-[12px] text-[#9CA3AF]">{quantityLabel}</span>
                <span className="text-[13px] font-semibold text-[#1F2937] flex-shrink-0 w-24 text-right">
                  {formatCurrency(lineTotal)}
                </span>
              </div>
            )
          })}
          {moreCount > 0 && (
            <p className="text-[12px] text-[#ff5a00] font-semibold pt-0.5">
              +{moreCount} {l.moreItems}
            </p>
          )}
        </div>

        {canEdit && readyForCashier && quickItems.length > 0 && (
          <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-[#ff5a00]">{l.quickItems}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {quickItems.map(item => {
                const busyKey = `${order.id}:${item.id}`
                const busy = quickAddBusyKey === busyKey
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onAddQuickItem?.(order, item)}
                    className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-orange-100 bg-white px-2.5 py-2 text-left text-[12px] font-black text-[#1F2937] shadow-sm transition-all hover:border-[#ff5a00] disabled:opacity-60"
                  >
                    <span className="line-clamp-1">{getItemName(item, lang)}</span>
                    <span className="flex items-center gap-1 text-[#ff5a00]">
                      {formatCurrency(item.price)}
                      <Plus size={13} />
                    </span>
                  </button>
                )
              })}
            </div>
            {quickAddError && (
              <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-600">{quickAddError}</p>
            )}
          </div>
        )}
      </div>

      {/* Open bill button */}
      <div className="px-5 pb-5 mt-auto pt-3">
        {readyForCashier ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onOpen(order)}
              className="w-full flex items-center justify-center gap-2 bg-[#ff5a00] text-white rounded-xl py-3 text-[14px] font-bold hover:bg-[#cc4800] active:scale-[0.98] transition-all shadow-sm shadow-orange-200"
            >
              <Receipt size={16} />
              {l.openBill}
            </button>
            {canEdit && order.status === 'needs_bill' && !isOffPremiseOrderType(orderType) && onRecall && (
              <button
                onClick={() => onRecall(order)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 py-2.5 text-[13px] font-bold hover:bg-gray-100 active:scale-[0.98] transition-all"
              >
                <RotateCcw size={14} />
                {l.recallTable}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(order)}
                disabled={isDeleting}
                className={`w-full flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[13px] font-black transition-all disabled:opacity-60 ${
                  confirmDelete
                    ? 'border-red-200 bg-red-600 text-white hover:bg-red-700'
                    : 'border-red-100 bg-red-50 text-red-600 hover:border-red-200 hover:bg-red-100'
                }`}
              >
                <Trash2 size={15} />
                {confirmDelete ? l.confirmDelete : l.deleteOrder}
              </button>
            )}
            {deleteError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-bold leading-snug text-red-600">
                {l.deleteFailed}: {deleteError}
              </p>
            )}
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center gap-1 bg-gray-100 rounded-xl py-3 px-4 text-center">
            <p className="text-[13px] font-bold text-[#9CA3AF]">{l.waitingKitchen}</p>
            <p className="text-[11px] text-[#9CA3AF]">{l.waitingKitchenSub}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Simple native-looking dropdown
function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 pr-8 text-[13px] text-[#1F2937] font-medium focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
    </div>
  )
}

function BillsSection({ title, count, icon: Icon, tone, children }) {
  const toneClasses = {
    red:    'bg-red-50 text-[#DC2626] border-red-100',
    amber:  'bg-orange-50 text-[#ff5a00] border-orange-100',
    blue:   'bg-blue-50 text-[#2563EB] border-blue-100',
  }[tone] || 'bg-gray-50 text-[#6B7280] border-gray-100'

  return (
    <section className="mb-8 border-t border-[#E5E7EB] pt-5 first:border-t-0 first:pt-0">
      <div className="sticky top-0 z-10 -mx-5 mb-3 flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-[#f6f5f3] px-5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 ${toneClasses}`}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-[#1F2937] text-[15px] leading-tight">{title}</h2>
            <p className="text-[11px] font-semibold text-[#9CA3AF]">{count}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  )
}

// Paid today is its own Cashier view (top-bar tab): day totals, payment-method split, and every paid bill.
function PaidTodaySummary({ orders, lang, methodTotals = {}, onOpenReceipt }) {
  const l = L[lang] || L.en
  const total = orders.reduce((sum, order) => sum + (order.cashier_total ?? getOrderTotal(order)), 0)
  const latest = [...orders]
    .sort((a, b) => parseInstantDate(getOrderDate(b)) - parseInstantDate(getOrderDate(a)))
  const methods = PAY_METHOD_CONFIG.filter(config => methodTotals[config.key]?.amount > 0)

  return (
    <section aria-label={l.paidToday} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <p className="text-[12px] font-semibold text-[#6B7280]">{l.paidToday}</p>
          <p className="mt-1 text-[22px] font-black tabular-nums text-[#16A34A]">{formatCurrency(total)}</p>
          <p className="text-[12px] text-[#9CA3AF]">{countLabel(orders.length, lang)}</p>
        </div>
        {methods.map(config => {
          const MethodIcon = config.icon
          return (
            <div key={config.key} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: config.color }}>
                <MethodIcon size={13} />
                {getPaymentMethodLabel(config, lang)}
              </p>
              <p className="mt-1 text-[18px] font-black tabular-nums text-[#1F2937]">{formatCurrency(methodTotals[config.key].amount)}</p>
              <p className="text-[12px] text-[#9CA3AF]">{countLabel(methodTotals[config.key].count, lang)}</p>
            </div>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          {latest.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-[#6B7280]">{l.noPayData}</p>
          ) : (
            latest.map(order => {
              const orderType = inferOrderType(order)
              const priceMode = normalizePriceMode(order.price_mode)
              const paymentMethods = getPaidOrderPaymentMethods(order)
              return (
                <div key={order.id} className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[#F3F4F6] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpenReceipt(order)}
                    className="min-w-0 text-left flex-1 rounded-xl -mx-2 px-2 py-1 transition-colors hover:bg-[#F9FAFB]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-bold text-[#1F2937] text-[13px]">
                        {isOffPremiseOrderType(orderType) ? `${orderTypeLabel(orderType, lang)} · ${order.order_number || order.id}` : order.table_name}
                      </p>
                      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                        priceMode === 'tourist'
                          ? 'bg-orange-50 text-[#ff5a00] ring-1 ring-orange-100'
                          : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                      }`}>
                        {getPriceModeLabel(priceMode, lang)}
                      </span>
                      {paymentMethods.map(config => {
                        const PaymentIcon = config.icon
                        return (
                          <span
                            key={config.key}
                            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ring-1 ring-inset ring-current/20"
                            style={{ color: config.color }}
                          >
                            <PaymentIcon size={10} />
                            {getPaymentMethodLabel(config, lang)}
                          </span>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-[#9CA3AF]">
                      {dateTimeLabel(order.paid_at || getOrderDate(order))}
                      {order.waiter_name ? ` · ${order.waiter_name}` : ''}
                    </p>
                  </button>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="font-black text-[#16A34A] text-[13px] whitespace-nowrap">{formatCurrency(order.cashier_total ?? getOrderTotal(order))}</p>
                    <button
                      type="button"
                      onClick={() => onOpenReceipt(order)}
                      className="hidden sm:inline-flex items-center rounded-xl border border-[#E5E7EB] bg-gray-50 px-3 py-1.5 text-[12px] font-bold text-[#1F2937] transition-colors hover:bg-gray-100"
                    >
                      {l.openCheck}
                    </button>
                  </div>
                </div>
              )
            })
          )}
      </div>
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CashierTables() {
  const { state, dispatch } = useApp()
  const { loaded, loadError } = useAppDataStatus()
  const { profile } = useAuth()
  const navigate            = useNavigate()
  const lang                = state.lang
  const l                   = L[lang] || L.en

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search,      setSearch]      = useState('')
  const [filterWaiter,setFilterWaiter]= useState('all')
  const [filterStatus,setFilterStatus]= useState('all')
  const [sortKey,     setSortKey]     = useState('newest')
  // Bills vs Paid today views; kept in ?view= so reloads and back/forward keep the open view.
  const [searchParams, setSearchParams] = useSearchParams()
  const showPaidToday = searchParams.get('view') === 'paid'
  const setCashierView = view => setSearchParams(view === 'paid' ? { view: 'paid' } : {}, { replace: true })
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState('')
  const [deletingOrderId, setDeletingOrderId] = useState('')
  const [deleteErrorByOrderId, setDeleteErrorByOrderId] = useState({})
  const [quickAddBusyKey, setQuickAddBusyKey] = useState('')
  const [quickAddErrorByOrderId, setQuickAddErrorByOrderId] = useState({})
  const deletionDate = useOrderDeletionDate()
  const canDeleteOrder = candidate => canDeleteOrderToday(profile || { role: state.user?.role }, candidate, deletionDate)
  const canEditCashier = canEditFeature(profile || { role: state.user?.role }, 'cashier')
  const canRecallTable = canMoveBackToTable(profile || { role: state.user?.role })

  // ── Menu item lookup map ────────────────────────────────────────────────────
  const menuItemMap = useMemo(() =>
    Object.fromEntries(state.menuItems.map(m => [m.id, m])),
    [state.menuItems]
  )

  const quickItems = useMemo(() =>
    state.menuItems
      .filter(isActiveMenuItem)
      .filter(isCashierQuickItem)
      .sort((a, b) => getQuickItemSortOrder(a) - getQuickItemSortOrder(b))
      .slice(0, 6),
    [state.menuItems]
  )

  // ── Derive active bills — dine-in is merged per table; take-away stays one bill per order.
  const activeBills = useMemo(() => {
    const raw = state.orders.filter(isCashierVisibleBill)
    const grouped = {}
    raw.forEach(order => {
      const key = cashierBillKey(order)
      if (!grouped[key]) {
        grouped[key] = {
          ...order,
          items: [...(order.items || [])],
          cashier_total: getOrderTotal(order, getConfiguredServiceRatePct(state.settings, order.price_mode)),
        }
      } else {
        grouped[key].items  = [...grouped[key].items, ...(order.items || [])]
        grouped[key].cashier_total = (grouped[key].cashier_total || 0) +
          getOrderTotal(order, getConfiguredServiceRatePct(state.settings, order.price_mode))
        // Keep earliest created_at
        if (parseInstantDate(order.created_at) < parseInstantDate(grouped[key].created_at)) {
          grouped[key].created_at = order.created_at
        }
        // Escalate to needs_bill if any sub-order is needs_bill
        if (order.status === 'needs_bill') grouped[key].status = 'needs_bill'
      }
    })
    return Object.values(grouped)
  }, [state.orders, state.settings])

  const paidTodayOrders = useMemo(() =>
    groupOrdersBySession(state.orders.filter(order => !isPaidOrder(order) || getCashierBillableItems(order).length > 0))
      .filter(o => isPaidOrder(o) && toLocalDateStr(getOrderDate(o)) === toLocalDateStr(new Date().toISOString()))
      .map(order => ({ ...order, cashier_total: Number(order.total) || 0 })),
    [state.orders]
  )

  // ── KPI values ─────────────────────────────────────────────────────────────

  // Payment method breakdown — tracks { amount, count } per method
  const payMethodTotals = useMemo(() => {
    const KNOWN = ['cash', 'card', 'terminal', 'loyalty_card']
    const map = {}
    paidTodayOrders.forEach(o => {
      const breakdown = getOrderPaymentBreakdown(o)
      const rows = breakdown.length > 0 ? breakdown : [{ method: o.payment_method, amount: getOrderRevenueTotal(o) }]
      rows.forEach(row => {
        const raw = (row.method || '').toLowerCase().trim()
        const key = KNOWN.includes(raw) ? raw : 'unknown'
        if (!map[key]) map[key] = { amount: 0, count: 0 }
        map[key].amount += Number(row.amount) || 0
        map[key].count++
      })
    })
    return map
  }, [paidTodayOrders])

  // ── Unique waiters for dropdown ────────────────────────────────────────────
  const waiterOptions = useMemo(() => {
    const names = [...new Set(activeBills.map(o => o.waiter_name).filter(Boolean))]
    return [
      { value: 'all', label: l.allWaiters },
      ...names.map(n => ({ value: n, label: n })),
    ]
  }, [activeBills, l])

  const statusOptions = [
    { value: 'all',        label: l.allStatus      },
    { value: 'needs_bill', label: l.needsBillBadge },
    { value: 'active',     label: l.activeNotReady },
    { value: 'take_away',  label: l.takeAway       },
    { value: 'delivery',   label: l.delivery       },
    { value: 'game_club', label: orderTypeLabel('game_club', lang) },
  ]

  const sortOptions = SORT_OPTIONS(l).map(o => ({ value: o.key, label: o.label }))

  // ── Filtered + sorted bills ────────────────────────────────────────────────
  const filteredBills = useMemo(() => {
    const q = search.toLowerCase().trim()
    let result = activeBills

    // Search
    if (q) {
      result = result.filter(o => {
        const matchTable  = o.table_name?.toLowerCase().includes(q) || o.order_number?.toLowerCase().includes(q)
        const matchWaiter = o.waiter_name?.toLowerCase().includes(q)
        const matchItems  = (o.items || []).some(i => i.name?.toLowerCase().includes(q))
        return matchTable || matchWaiter || matchItems
      })
    }

    // Waiter filter
    if (filterWaiter !== 'all') {
      result = result.filter(o => o.waiter_name === filterWaiter)
    }

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(o => {
        const isTakeAway = isTakeAwayBill(o)
        const isDelivery = isDeliveryOrderType(inferOrderType(o))
        if (filterStatus === 'needs_bill') return !isOffPremiseOrderType(inferOrderType(o)) && o.status === 'needs_bill'
        if (filterStatus === 'active') return !isOffPremiseOrderType(inferOrderType(o)) && o.status !== 'needs_bill'
        if (filterStatus === 'take_away') return isTakeAway
        if (filterStatus === 'delivery') return isDelivery
        if (filterStatus === 'game_club') return inferOrderType(o) === 'game_club'
        return false
      })
    }

    // Sort
    return [...result].sort((a, b) => {
      if (sortKey === 'newest')  return parseInstantDate(b.created_at) - parseInstantDate(a.created_at)
      if (sortKey === 'oldest')  return parseInstantDate(a.created_at) - parseInstantDate(b.created_at)
      if (sortKey === 'highest') return (b.total || 0) - (a.total || 0)
      if (sortKey === 'lowest')  return (a.total || 0) - (b.total || 0)
      return 0
    })
  }, [activeBills, search, filterWaiter, filterStatus, sortKey])

  // Table lookup
  const tableMap = useMemo(() =>
    Object.fromEntries(state.tables.map(t => [t.id, t])),
    [state.tables]
  )

  const billSections = useMemo(() => {
    const needsBill = filteredBills.filter(o => !isOffPremiseOrderType(inferOrderType(o)) && o.status === 'needs_bill')
    const active = filteredBills.filter(o => !isOffPremiseOrderType(inferOrderType(o)) && o.status !== 'needs_bill')
    const takeAway = filteredBills.filter(isTakeAwayBill)
    const delivery = filteredBills.filter(o => isDeliveryOrderType(inferOrderType(o)))

    return [
      { key: 'needs_bill', title: l.needsBill, tone: 'red', icon: CreditCard, bills: needsBill },
      { key: 'active', title: l.activeTableBills, tone: 'amber', icon: Receipt, bills: active },
      { key: 'take_away', title: l.takeAwayBills, tone: 'blue', icon: Receipt, bills: takeAway },
      { key: 'delivery', title: l.deliveryBills, tone: 'purple', icon: Receipt, bills: delivery },
      { key: 'game_club', title: orderTypeLabel('game_club', lang), tone: 'purple', icon: Receipt, bills: filteredBills.filter(o => inferOrderType(o) === 'game_club') },
    ].filter(section => section.bills.length > 0)
  }, [filteredBills, l, lang])

  const visibleBillCount = billSections.reduce((sum, section) => sum + section.bills.length, 0)

  function handleRecallTable(order) {
    if (!canEditCashier || !order?.table_id) return
    dispatch({ type: 'RECALL_TABLE_FROM_CASHIER', payload: order.table_id })
  }

  async function handleDeleteOrder(order) {
    if (!canDeleteOrderToday(profile || { role: state.user?.role }, order) || !order?.id || deletingOrderId) return
    setDeleteErrorByOrderId(errors => ({ ...errors, [order.id]: '' }))

    setDeletingOrderId(order.id)
    try {
      const result = await dispatch({
        type: 'DELETE_ORDER',
        payload: { orderId: order.id },
      })
      if (result?.cancelled) return
      if (result?.error) {
        setDeleteErrorByOrderId(errors => ({
          ...errors,
          [order.id]: result.error.message || String(result.error),
        }))
        return
      }
      setConfirmDeleteOrderId('')
    } finally {
      setDeletingOrderId('')
    }
  }

  async function handleAddQuickItem(order, item) {
    if (!canEditCashier || !order?.id || !item?.id) return
    const orderType = inferOrderType(order)
    const busyKey = `${order.id}:${item.id}`
    setQuickAddBusyKey(busyKey)
    setQuickAddErrorByOrderId(current => ({ ...current, [order.id]: '' }))
    try {
      const result = await dispatch({
        type: 'ADD_QUICK_ITEM_TO_ORDER',
        payload: {
          tableId: isOffPremiseOrderType(orderType) ? null : order.table_id,
          orderId: order.id,
          item,
        },
      })
      if (result?.error) throw result.error
    } catch (err) {
      setQuickAddErrorByOrderId(current => ({
        ...current,
        [order.id]: err?.message || l.addQuickFailed,
      }))
    } finally {
      setQuickAddBusyKey('')
    }
  }

  if (!loaded || loadError) {
    return (
      <div className="flex overflow-hidden bg-[#f6f5f3]" style={{ height: '100dvh' }}>
        <div className="hidden h-full flex-shrink-0 lg:block"><UnifiedSidebar /></div>
        <div className="flex-1 overflow-y-auto">
          {!loaded ? (
            <OperationalLoading layout="cards"
              title={lang === 'uz' ? 'Kassa yuklanmoqda' : lang === 'ru' ? 'Загрузка кассы' : 'Loading cashier'}
              description={lang === 'uz' ? 'Faol hisoblar va bugungi to‘lovlar olinmoqda.' : lang === 'ru' ? 'Получаем активные счета и сегодняшние платежи.' : 'Fetching active bills and today’s payments.'}
            />
          ) : (
            <OperationalError
              title={lang === 'uz' ? 'Kassani yuklab bo‘lmadi' : lang === 'ru' ? 'Не удалось загрузить кассу' : 'Could not load cashier'}
              description={loadError}
              actionLabel={lang === 'uz' ? 'Qayta yuklash' : lang === 'ru' ? 'Перезагрузить' : 'Reload'}
              onAction={() => window.location.reload()}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex overflow-hidden bg-[#f6f5f3]" style={{ height: '100dvh' }}>

      {/* Sidebar – desktop */}
      <div className="hidden lg:block flex-shrink-0 h-full">
        <UnifiedSidebar />
      </div>

      {/* Sidebar – mobile overlay */}
      <MobileDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        <UnifiedSidebar onClose={() => setSidebarOpen(false)} />
      </MobileDrawer>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Header */}
        <WorkspaceTopBar
          lang={lang}
          title={l.title}
          badge={activeBills.length}
          badgeLabel={l.attentionBills}
          onOpenDrawer={() => setSidebarOpen(true)}
          drawerLabel={lang === 'uz' ? 'Yon panel' : lang === 'ru' ? 'Боковая панель' : 'Toggle Sidebar'}
          tabs={{
            label: l.title,
            value: showPaidToday ? 'paid' : 'bills',
            onChange: setCashierView,
            items: [
              { key: 'bills', label: l.billsTab },
              { key: 'paid', label: `${l.paidToday}${paidTodayOrders.length ? ` (${paidTodayOrders.length})` : ''}` },
            ],
          }}
        />

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Keep padding inside the scrollport so sticky headings reach its top edge. */}
          <div className="p-5">

          {showPaidToday ? (
            <PaidTodaySummary
              orders={paidTodayOrders}
              lang={lang}
              methodTotals={payMethodTotals}
              onOpenReceipt={order => navigate(`/receipt/${order.id}`)}
            />
          ) : (
          <>
          {/* ── Filter bar ── */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={l.search}
                className="w-full pl-9 pr-8 py-2 bg-white border border-[#E5E7EB] rounded-xl text-[13px] text-[#1F2937] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Waiter filter */}
            <FilterSelect
              value={filterWaiter}
              onChange={setFilterWaiter}
              options={waiterOptions}
            />

            {/* Status filter */}
            <FilterSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={statusOptions}
            />

            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown size={14} className="text-[#9CA3AF]" />
              <FilterSelect
                value={sortKey}
                onChange={setSortKey}
                options={sortOptions}
              />
            </div>
          </div>

          {/* ── Bill cards ── */}
          {visibleBillCount === 0 ? (
            <div className="max-w-sm mx-auto mt-12">
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                  <CreditCard size={28} className="text-orange-300" />
                </div>
                <p className="font-black text-[#1F2937] text-base mb-1">{l.noActiveBills}</p>
                <p className="text-sm text-[#6B7280] leading-snug">{l.noActiveSub}</p>
              </div>
            </div>
          ) : (
            billSections.map(section => (
              <BillsSection
                key={section.key}
                title={section.title}
                count={countLabel(section.bills.length, lang)}
                icon={section.icon}
                tone={section.tone}
              >
                {section.bills.map(order => (
                  <BillCard
                    key={order.id}
                    order={order}
                    table={tableMap[order.table_id]}
                    menuItemMap={menuItemMap}
                    lang={lang}
                    quickItems={quickItems}
                    onOpen={bill => navigate(isOffPremiseOrderType(inferOrderType(bill))
                      ? `/cashier/bill/order/${bill.id}`
                      : `/cashier/bill/${bill.table_id}`
                    )}
                    onAddQuickItem={handleAddQuickItem}
                    quickAddBusyKey={quickAddBusyKey}
                    quickAddError={quickAddErrorByOrderId[order.id]}
                    canEdit={canEditCashier}
                    canDelete={canDeleteOrder(order)}
                    onRecall={canEditCashier && canRecallTable ? handleRecallTable : null}
                    onDelete={handleDeleteOrder}
                    confirmDelete={confirmDeleteOrderId === order.id}
                    isDeleting={deletingOrderId === order.id}
                    deleteError={deleteErrorByOrderId[order.id]}
                  />
                ))}
              </BillsSection>
            ))
          )}
          </>
          )}

          </div>
        </main>
      </div>
    </div>
  )
}
