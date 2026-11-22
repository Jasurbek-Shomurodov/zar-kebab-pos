import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Receipt, CreditCard, Clock, Users, Search,
  Banknote, Monitor, Wallet, SearchX,
  UtensilsCrossed, ArrowUpDown, X, HelpCircle, Trash2, RotateCcw, Plus,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useOrderDeletionDate } from '../store/useOrderDeletionDate'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/formatCurrency'
import {
  getGroupedOrderItems,
  getOrderDate,
  getOrderItemLineTotal,
  getOrderPaymentBreakdown,
  getOrderRevenueTotal,
  getOrderTotal,
  groupOrdersBySession,
  isPaidOrder,
  normalizePaymentMethod,
  toLocalDateStr,
} from '../lib/analytics'
import { getPriceModeLabel, normalizePriceMode } from '../lib/priceModes'
import { cashierBillKey, getCashierBillableItems, getCashierBillTarget, getCashierBillTotal, isCashierVisibleBill, isTakeAwayBill } from '../lib/cashierBills'
import { formatWriteError } from '../lib/writeErrorMessage'
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
    search:          'Stol, ofitsiant yoki mahsulot qidirish…',
    allWaiters:      'Barcha ofitsiantlar',
    allStatus:       'Barcha holat',
    occupied:        'Band',
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
    recallTable:     'Stolga qaytarish',
    deleteFailed:    "Buyurtmani o'chirib bo'lmadi",
    quickItems:      'Tezkor kassir mahsulotlari',
    addQuickFailed:  "Tezkor mahsulotni qo'shib bo'lmadi",
    payments:        n => `${n} ta to'lov`,
    ofTodayRev:      'bugungi daromaddan',
    openCheck:       'Chekni ochish',
    noResults:       'Filtrga mos hisob topilmadi',
    noResultsSub:    'Qidiruv yoki filtrlarni o‘zgartiring.',
    resetFilters:    'Barcha hisoblarni ko‘rsatish',
    clearSearch:     'Qidiruvni tozalash',
    filterWaiter:    'Ofitsiant bo‘yicha filtr',
    filterStatus:    'Hisob turi bo‘yicha filtr',
    sortBy:          'Saralash',
    menuType:        'Menyu turi',
    loadingTitle:    'Kassa yuklanmoqda',
    loadingSub:      'Faol hisoblar va bugungi to‘lovlar olinmoqda.',
    loadFailed:      'Kassani yuklab bo‘lmadi',
    reload:          'Qayta yuklash',
    sidebar:         'Yon panel',
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
    search:          'Поиск по столу, официанту или блюду…',
    allWaiters:      'Все официанты',
    allStatus:       'Все статусы',
    occupied:        'Занят',
    takeAwayBills:   'Заказ с собой',
    deliveryBills:   'Доставка',
    needsBillBadge:  'Нужен счёт',
    newestFirst:     'Сначала новые',
    oldestFirst:     'Сначала старые',
    highestAmt:      'Высокая сумма',
    lowestAmt:       'Низкая сумма',
    openBill:        'Открыть счёт',
    openCheck:       'Открыть чек',
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
    recallTable:     'Вернуть на стол',
    deleteFailed:    'Не удалось удалить заказ',
    quickItems:      'Быстрые товары кассира',
    addQuickFailed:  'Не удалось добавить быстрый товар',
    payments:        n => `${n} платёж${n === 1 ? '' : n < 5 ? 'а' : 'ей'}`,
    ofTodayRev:      'от дневной выручки',
    noResults:       'Нет счетов по этому фильтру',
    noResultsSub:    'Измените поиск или фильтры.',
    resetFilters:    'Показать все счета',
    clearSearch:     'Очистить поиск',
    filterWaiter:    'Фильтр по официанту',
    filterStatus:    'Фильтр по типу счёта',
    sortBy:          'Сортировка',
    menuType:        'Тип меню',
    loadingTitle:    'Загрузка кассы',
    loadingSub:      'Получаем активные счета и сегодняшние платежи.',
    loadFailed:      'Не удалось загрузить кассу',
    reload:          'Перезагрузить',
    sidebar:         'Боковая панель',
  },
  en: {
    title:           'Cashier',
    subtitle:        'Process payments and close bills',
    activeBills:     'Active bills',
    needsBill:       'Needs bill',
    paidToday:       'Paid today',
    attentionBills:  'bills waiting for the cashier',
    billsTab:        'Bills',
    payMethods:      'Payment methods today',
    tables:          'tables',
    waitingPay:      'Waiting for payment',
    completed:       'Completed orders',
    totalCollected:  'Total collected',
    activeBillsSec:  'Active bills',
    search:          'Search by table, waiter or dish…',
    allWaiters:      'All waiters',
    allStatus:       'All bills',
    occupied:        'Occupied',
    takeAwayBills:   'Take-away bills',
    deliveryBills:   'Delivery bills',
    needsBillBadge:  'Needs bill',
    newestFirst:     'Newest first',
    oldestFirst:     'Oldest first',
    highestAmt:      'Highest amount',
    lowestAmt:       'Lowest amount',
    openBill:        'Open bill',
    openCheck:       'Open receipt',
    moreItems:       'more items',
    waiter:          'Waiter',
    opened:          'Opened',
    items:           'items',
    noActiveBills:   'No active bills',
    noActiveSub:     'No tables need payment right now',
    noPayData:       'No payments today yet',
    deleteOrder:     'Delete order',
    confirmDelete:   'Confirm delete',
    takeAway:         'Take away',
    delivery:         'Delivery',
    showPaid:         'Show paid today',
    hidePaid:         'Hide paid today',
    noTable:          'No table',
    recallTable:     'Move back to table',
    deleteFailed:    'Could not delete order',
    quickItems:      'Cashier quick items',
    addQuickFailed:  'Could not add quick item',
    payments:        n => `${n} payment${n === 1 ? '' : 's'}`,
    ofTodayRev:      "of today's income",
    noResults:       'No bills match this filter',
    noResultsSub:    'Change the search or the filters.',
    resetFilters:    'Show all bills',
    clearSearch:     'Clear search',
    filterWaiter:    'Filter by waiter',
    filterStatus:    'Filter by bill type',
    sortBy:          'Sort bills',
    menuType:        'Menu type',
    loadingTitle:    'Loading cashier',
    loadingSub:      'Fetching active bills and today’s payments.',
    loadFailed:      'Could not load cashier',
    reload:          'Reload',
    sidebar:         'Toggle sidebar',
  },
}

// Tones are ws-tone-* classes (CSS variables), so the dark theme recolours them; an inline
// style colour is invisible to the dark palette.
const PAY_METHOD_CONFIG = [
  { key: 'cash',     icon: Banknote,    tone: 'ws-tone-positive', labelEn: 'Cash',     labelUz: 'Naqd',      labelRu: 'Наличные'    },
  { key: 'card',     icon: CreditCard,  tone: 'ws-tone-info',     labelEn: 'Card',     labelUz: 'Karta',     labelRu: 'Карта'       },
  { key: 'terminal', icon: Monitor,     tone: 'ws-tone-info',     labelEn: 'Terminal', labelUz: 'Terminal',  labelRu: 'Терминал'    },
  { key: 'loyalty_card', icon: CreditCard, tone: 'ws-tone-caution', labelEn: 'Loyalty', labelUz: 'Loyallik', labelRu: 'Лояльность' },
  { key: 'salary',   icon: Wallet,      tone: 'ws-tone-accent',   labelEn: 'From salary', labelUz: 'Maoshdan', labelRu: 'Из зарплаты' },
  { key: 'mixed',    icon: CreditCard,  tone: '',                 labelEn: 'Mixed',    labelUz: 'Aralash',   labelRu: 'Смешанный'   },
  { key: 'unknown',  icon: HelpCircle,  tone: '',                 labelEn: 'Unknown',  labelUz: "Noma'lum",  labelRu: 'Неизвестно'  },
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
  const [tone, label] = status === 'game_club' ? ['ws-tone-info', orderTypeLabel(status, lang)]
    : status === 'delivery' ? ['ws-tone-info', l.delivery]
    : status === 'take_away' ? ['ws-tone-info', l.takeAway]
    : status === 'needs_bill' ? ['ws-tone-negative', l.needsBillBadge]
    : ['ws-tone-accent', l.occupied]
  return <span className={`ws-status flex-shrink-0 ${tone}`}>{label}</span>
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
  quickAddError = null,
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

  // Every card here passed isCashierVisibleBill, so it is always ready for the cashier.
  return (
    <div className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white shadow-sm transition-shadow hover:shadow-md">

      {/* Card header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#F3F4F6]">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100">
              <Users size={16} className="text-[#6B7280]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-[#1F2937] text-[16px] leading-tight">
                {isOffPremiseOrderType(orderType) ? `${orderTypeLabel(orderType, lang)} · ${order.order_number || order.id}` : order.table_name}
              </h3>
              {isOffPremiseOrderType(orderType) && <p className="text-xs font-semibold text-[#bf4300]">{l.noTable}</p>}
              {order.waiter_name && (
                <p className="text-xs text-[#68655f]">{l.waiter}: {order.waiter_name}</p>
              )}
              <p className="mt-1 text-xs font-semibold text-[#bf4300]">
                {l.menuType}: {getPriceModeLabel(priceMode, lang)}
              </p>
            </div>
          </div>
          <TableStatusBadge status={isOffPremiseOrderType(orderType) ? orderType : table?.status || order.status} lang={lang} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#68655f]">
          <span className="flex flex-wrap items-center gap-x-1">
            <Clock size={12} aria-hidden="true" />
            {l.opened} {elapsedSince(order.created_at)}
            {order.created_at && <span className="whitespace-nowrap">({dateTimeLabel(order.created_at)})</span>}
          </span>
          <span className="whitespace-nowrap">{items.length} {l.items}</span>
        </div>
      </div>

      {/* Total */}
      <div className="px-5 pt-4 pb-3">
        <p className="mb-4 whitespace-nowrap font-black text-[26px] leading-none tabular-nums text-[#ff5a00]">
          {formatCurrency(order.cashier_total ?? getOrderTotal(order))}
        </p>

        {/* Item preview */}
        <div className="space-y-2.5">
          {preview.map((item, i) => {
            const mi = menuItemMap[item.menu_item_id]
            const displayName = getCashierItemName(item, mi, lang)
            const optionLines = getOrderItemOptionLines(item, mi, lang)
            const lineTotal = getOrderItemLineTotal(item)
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
                    <UtensilsCrossed size={12} className="text-gray-300" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#1F2937]">{displayName}</p>
                  {optionLines.map((line, index) => (
                    <p key={`${item.id || i}-option-${index}`} className="truncate text-xs font-semibold text-[#111827]">{line}</p>
                  ))}
                </div>
                <span className="min-w-8 flex-shrink-0 whitespace-nowrap text-center text-xs text-[#68655f]">{quantityLabel}</span>
                <span className="flex-shrink-0 whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-[#1F2937]">
                  {formatCurrency(lineTotal)}
                </span>
              </div>
            )
          })}
          {moreCount > 0 && (
            <p className="text-xs text-[#bf4300] font-semibold pt-0.5">
              +{moreCount} {l.moreItems}
            </p>
          )}
        </div>

        {canEdit && quickItems.length > 0 && (
          // Quick items sit directly in the card: no frame or heading, just the buttons.
          <div className="mt-4" role="group" aria-label={l.quickItems}>
            {/* The card decides the columns, not the viewport: it sits beside a 256px sidebar. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
              {quickItems.map(item => {
                const busyKey = `${order.id}:${item.id}`
                const busy = quickAddBusyKey === busyKey
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onAddQuickItem?.(order, item)}
                    className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-orange-100 bg-white px-2.5 py-2 text-left text-xs font-semibold text-[#1F2937] shadow-sm transition-colors hover:border-[#ff5a00] disabled:opacity-60"
                  >
                    <span className="line-clamp-2 min-w-0">{getItemName(item, lang)}</span>
                    <span className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap tabular-nums text-[#bf4300]">
                      {formatCurrency(item.price)}
                      <Plus size={13} aria-hidden="true" />
                    </span>
                  </button>
                )
              })}
            </div>
            {quickAddError && (
              <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-semibold text-[#c4262c]">
                {l.addQuickFailed}. {formatWriteError(quickAddError, lang, 'ADD_QUICK_ITEM_TO_ORDER')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Open bill button */}
      <div className="px-5 pb-5 mt-auto pt-3">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onOpen(order)}
            className="ws-btn ws-btn-primary min-h-12 w-full"
          >
            <Receipt aria-hidden="true" />
            {l.openBill}
          </button>
          {canEdit && order.status === 'needs_bill' && !isOffPremiseOrderType(orderType) && onRecall && (
            <button
              type="button"
              onClick={() => onRecall(order)}
              className="ws-btn ws-btn-outline w-full"
            >
              <RotateCcw aria-hidden="true" />
              {l.recallTable}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(order)}
              disabled={isDeleting}
              className={`ws-btn mt-2 w-full ${confirmDelete ? 'ws-btn-danger-solid' : 'ws-btn-danger'}`}
            >
              <Trash2 aria-hidden="true" />
              {confirmDelete ? l.confirmDelete : l.deleteOrder}
            </button>
          )}
          {deleteError && (
            <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold leading-snug text-[#c4262c]">
              {l.deleteFailed}. {formatWriteError(deleteError, lang, 'DELETE_ORDER')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// A named native select on the shared field style (44px, labelled for screen readers).
function FilterSelect({ value, onChange, options, label }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="ws-input !w-auto max-w-full"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function BillsSection({ title, count, icon: Icon, tone, children }) {
  const toneClasses = {
    red:    'bg-red-50 text-[#c4262c] border-red-100',
    blue:   'bg-blue-50 text-[#2563EB] border-blue-100',
  }[tone] || 'bg-gray-50 text-[#6B7280] border-gray-100'

  return (
    <section className="mb-8 border-t border-[#E5E7EB] pt-5 first:border-t-0 first:pt-0">
      <div className="sticky top-0 z-10 -mx-5 mb-3 flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-[#f6f5f3] px-5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 ${toneClasses}`}>
            <Icon size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-[#1F2937] text-[15px] leading-tight">{title}</h2>
            <p className="text-xs font-medium text-[#68655f]">{count}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-4">
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
      {/* Tiles wrap by their own width, so a 22px figure never shares a 130px column at 320px. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11.5rem),1fr))] gap-3">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#68655f]">{l.paidToday}</p>
          <p className="mt-1 whitespace-nowrap text-[22px] font-black tabular-nums text-[#1d7a52]">{formatCurrency(total)}</p>
          <p className="text-xs text-[#68655f]">{countLabel(orders.length, lang)}</p>
        </div>
        {methods.map(config => {
          const MethodIcon = config.icon
          return (
            <div key={config.key} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <span className={`ws-badge ${config.tone}`}>
                <MethodIcon aria-hidden="true" />
                {getPaymentMethodLabel(config, lang)}
              </span>
              <p className="mt-1 whitespace-nowrap text-[18px] font-black tabular-nums text-[#1F2937]">{formatCurrency(methodTotals[config.key].amount)}</p>
              <p className="text-xs text-[#68655f]">{l.payments(methodTotals[config.key].count)}</p>
            </div>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          {latest.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-[#68655f]">{l.noPayData}</p>
          ) : (
            latest.map(order => {
              const orderType = inferOrderType(order)
              const priceMode = normalizePriceMode(order.price_mode)
              const paymentMethods = getPaidOrderPaymentMethods(order)
              return (
                // One row is one button to the receipt: the name wraps, the amount never does.
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onOpenReceipt(order)}
                  aria-label={`${l.openCheck}: ${isOffPremiseOrderType(orderType) ? `${orderTypeLabel(orderType, lang)} ${order.order_number || order.id}` : order.table_name}`}
                  className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#F3F4F6] px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-[#F9FAFB]"
                >
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-[#1F2937] text-[13px]">
                        {isOffPremiseOrderType(orderType) ? `${orderTypeLabel(orderType, lang)} · ${order.order_number || order.id}` : order.table_name}
                      </span>
                      <span className={`ws-badge ${priceMode === 'tourist' ? 'ws-tone-accent' : ''}`}>
                        {getPriceModeLabel(priceMode, lang)}
                      </span>
                      {paymentMethods.map(config => {
                        const PaymentIcon = config.icon
                        return (
                          <span key={config.key} className={`ws-badge ${config.tone}`}>
                            <PaymentIcon aria-hidden="true" />
                            {getPaymentMethodLabel(config, lang)}
                          </span>
                        )
                      })}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#68655f]">
                      {dateTimeLabel(order.paid_at || getOrderDate(order))}
                      {order.waiter_name ? ` · ${order.waiter_name}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-3">
                    <span className="whitespace-nowrap text-[13px] font-black tabular-nums text-[#1d7a52]">{formatCurrency(order.cashier_total ?? getOrderTotal(order))}</span>
                    <span className="hidden text-xs font-semibold text-[#bf4300] sm:inline">{l.openCheck}</span>
                  </span>
                </button>
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
        }
      } else {
        grouped[key].items  = [...grouped[key].items, ...(order.items || [])]
        // Keep earliest created_at
        if (parseInstantDate(order.created_at) < parseInstantDate(grouped[key].created_at)) {
          grouped[key].created_at = order.created_at
        }
        // Escalate to needs_bill if any sub-order is needs_bill
        if (order.status === 'needs_bill') grouped[key].status = 'needs_bill'
      }
    })
    // The tile prints the quote the bill page opens with (same orders, same rounding, quick
    // items without service, no stale loyalty), so the two screens never disagree.
    return Object.values(grouped).map(bill => ({
      ...bill,
      cashier_total: getCashierBillTotal(bill, {
        orders: state.orders,
        menuItems: state.menuItems,
        settings: state.settings,
      }),
    }))
  }, [state.orders, state.menuItems, state.settings])

  const paidTodayOrders = useMemo(() =>
    groupOrdersBySession(state.orders.filter(order => !isPaidOrder(order) || getCashierBillableItems(order).length > 0))
      .filter(o => isPaidOrder(o) && toLocalDateStr(getOrderDate(o)) === toLocalDateStr(new Date().toISOString()))
      .map(order => ({ ...order, cashier_total: Number(order.total) || 0 })),
    [state.orders]
  )

  // ── KPI values ─────────────────────────────────────────────────────────────

  // Payment method breakdown — tracks { amount, count } per method
  const payMethodTotals = useMemo(() => {
    const KNOWN = ['cash', 'card', 'terminal', 'loyalty_card', 'salary']
    const map = {}
    paidTodayOrders.forEach(o => {
      const breakdown = getOrderPaymentBreakdown(o)
      const rows = breakdown.length > 0 ? breakdown : [{ method: o.payment_method, amount: getOrderRevenueTotal(o) }]
      rows.forEach(row => {
        const raw = normalizePaymentMethod(row.method)
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
        // A dine-in bill reaches this list only as needs_bill (isCashierVisibleBill).
        if (filterStatus === 'needs_bill') return !isOffPremiseOrderType(inferOrderType(o))
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
      // Sort by the amount printed on the tile, not the stored orders.total of the first round.
      if (sortKey === 'highest') return (b.cashier_total || 0) - (a.cashier_total || 0)
      if (sortKey === 'lowest')  return (a.cashier_total || 0) - (b.cashier_total || 0)
      return 0
    })
  }, [activeBills, search, filterWaiter, filterStatus, sortKey])

  // Table lookup
  const tableMap = useMemo(() =>
    Object.fromEntries(state.tables.map(t => [t.id, t])),
    [state.tables]
  )

  const billSections = useMemo(() => {
    const needsBill = filteredBills.filter(o => !isOffPremiseOrderType(inferOrderType(o)))
    const takeAway = filteredBills.filter(isTakeAwayBill)
    const delivery = filteredBills.filter(o => isDeliveryOrderType(inferOrderType(o)))

    return [
      { key: 'needs_bill', title: l.needsBill, tone: 'red', icon: CreditCard, bills: needsBill },
      { key: 'take_away', title: l.takeAwayBills, tone: 'blue', icon: Receipt, bills: takeAway },
      { key: 'delivery', title: l.deliveryBills, tone: 'purple', icon: Receipt, bills: delivery },
      { key: 'game_club', title: orderTypeLabel('game_club', lang), tone: 'purple', icon: Receipt, bills: filteredBills.filter(o => inferOrderType(o) === 'game_club') },
    ].filter(section => section.bills.length > 0)
  }, [filteredBills, l, lang])

  const visibleBillCount = billSections.reduce((sum, section) => sum + section.bills.length, 0)
  const hasFilters = search.trim() !== '' || filterWaiter !== 'all' || filterStatus !== 'all'

  function resetFilters() {
    setSearch('')
    setFilterWaiter('all')
    setFilterStatus('all')
  }

  function handleRecallTable(order) {
    if (!canEditCashier || !order?.table_id) return
    dispatch({ type: 'RECALL_TABLE_FROM_CASHIER', payload: order.table_id })
  }

  async function handleDeleteOrder(order) {
    if (!canDeleteOrderToday(profile || { role: state.user?.role }, order) || !order?.id || deletingOrderId) return
    setDeleteErrorByOrderId(errors => ({ ...errors, [order.id]: null }))

    setDeletingOrderId(order.id)
    try {
      const result = await dispatch({
        type: 'DELETE_ORDER',
        payload: { orderId: order.id },
      })
      if (result?.cancelled) return
      if (result?.error) {
        console.error('[cashier] order delete failed', result.error)
        setDeleteErrorByOrderId(errors => ({ ...errors, [order.id]: result.error }))
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
    setQuickAddErrorByOrderId(current => ({ ...current, [order.id]: null }))
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
      console.error('[cashier] quick item add failed', err)
      setQuickAddErrorByOrderId(current => ({ ...current, [order.id]: err || new Error('quick item add failed') }))
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
              title={l.loadingTitle}
              description={l.loadingSub}
            />
          ) : (
            // The app-level load has no retry of its own; the raw store message stays in the console.
            <OperationalError
              lang={lang}
              title={l.loadFailed}
              actionLabel={l.reload}
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
            <div className="relative min-w-[min(100%,14rem)] flex-1">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
              <input
                type="text"
                aria-label={l.search}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={l.search}
                className="ws-input w-full !pl-9 !pr-11"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label={l.clearSearch} className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon absolute right-0.5 top-1/2 -translate-y-1/2">
                  <X aria-hidden="true" />
                </button>
              )}
            </div>

            <FilterSelect label={l.filterWaiter} value={filterWaiter} onChange={setFilterWaiter} options={waiterOptions} />
            <FilterSelect label={l.filterStatus} value={filterStatus} onChange={setFilterStatus} options={statusOptions} />

            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown size={14} aria-hidden="true" className="text-[#68655f]" />
              <FilterSelect label={l.sortBy} value={sortKey} onChange={setSortKey} options={sortOptions} />
            </div>
          </div>

          {/* ── Bill cards ── */}
          {visibleBillCount === 0 ? (
            hasFilters && activeBills.length > 0 ? (
              // Bills exist but the search or a filter hides them: say so and offer the way back.
              <div className="ws-empty">
                <SearchX aria-hidden="true" />
                <h3>{l.noResults}</h3>
                <p>{l.noResultsSub}</p>
                <button type="button" onClick={resetFilters} className="ws-btn ws-btn-outline">{l.resetFilters}</button>
              </div>
            ) : (
              <div className="ws-empty">
                <CreditCard aria-hidden="true" />
                <h3>{l.noActiveBills}</h3>
                <p>{l.noActiveSub}</p>
              </div>
            )
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
                    onOpen={bill => {
                      // Same target the tile total was quoted for.
                      const target = getCashierBillTarget(bill)
                      navigate(target.orderId ? `/cashier/bill/order/${target.orderId}` : `/cashier/bill/${target.tableId}`)
                    }}
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
