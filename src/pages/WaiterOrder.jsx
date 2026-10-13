import { flushSync } from 'react-dom'
import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import {
  Search, ShoppingCart, Plus, UtensilsCrossed,
  Menu as MenuIcon, X, CheckCircle2, Clock,
  Receipt, Loader2, ArrowLeft, LogOut, Minus, Printer,
  LockKeyhole, Minimize2, Maximize2,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t, getItemName, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { getOrderPaymentSummary } from '../lib/analytics'
import CartPanel from '../components/CartPanel'
import UnifiedSidebar from '../components/UnifiedSidebar'
import MobileDrawer from '../components/MobileDrawer'
import ThemeToggle from '../components/ThemeToggle'
import AnimatedSearch from '../components/AnimatedSearch'
import MenuCategoryScroller, { menuCategorySectionId } from '../components/MenuCategoryScroller'
import { ProductCard, ProductDetailPage, getMenuItemOptionGroups, getOrderItemOptionLines, menuItemRequiresOptions } from '../components/MenuProductCards'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useAppDataStatus } from '../store/appHooks'
import { getKitchenCheckGroups } from '../lib/kitchenCheck'
import { isOffPremiseOrderType, normalizeOrderType, orderTypeLabel } from '../lib/orderTypes'
import { isCustomerMenuCategory, isCustomerMenuItem, isTouristHiddenMenuCategory, isWaiterMenuCategory, isWaiterMenuItem } from '../lib/menuItems'
import { DEFAULT_PRICE_MODE, PRICE_MODE_TOURIST, calculateUnitPrice, getMenuItemForPriceMode, normalizePriceMode, resolveOrderingPriceMode } from '../lib/priceModes'
import { getConfiguredServiceRatePct } from '../lib/serviceRates'
import { canEditFeature } from '../lib/permissions'
import { rebuildGuestCartFromCatalog } from '../lib/guestCart'
import { getActiveTableOrders } from '../lib/tableGuestEntry'
import { getTableOrderWaiterNames } from '../lib/activeOrderWaiters'
import {
  clearGuestModeSession,
  getGuestModePinLength,
  guestModePinLockSeconds,
  isGuestModeSessionFor,
  normalizeGuestModePriceMode,
  readGuestModeSession,
  registerGuestModePinFailure,
  updateGuestModeSession,
  verifyGuestModePin,
  writeGuestModeSession,
} from '../lib/guestMode'
import { useGuestModeSession } from '../hooks/useGuestModeSession'
import { GuestModeUtilities, GuestPinDialog, GuestSelectionReady, guestModeCopy } from '../components/GuestModeUI'
import { formatWriteError } from '../lib/writeErrorMessage'
import { completeBillHandoff } from '../lib/billHandoff'
import {
  changeMenuQuantity,
  formatMenuQuantity,
  isMenuItemSoldByWeight,
  normalizeMenuQuantity,
} from '../lib/menuSaleUnits'

// ── OrderActionPanel ───────────────────────────────────────────────────────────
function OrderActionPanel({ order, tableId, lang, dispatch, menuItemMap, canEditOrder, autoPrintBill, onPrintKitchenCheck, onMovedToCashier }) {
  const [busy, setBusy] = useState(false)
  const [updatingItemId, setUpdatingItemId] = useState(null)

  if (!order) return null

  const items       = order.items || []
  const newCount    = items.filter(i => i.status === 'new').length
  const prepCount   = items.filter(i => i.status === 'preparing').length
  const readyCount  = items.filter(i => i.status === 'ready').length
  const inPreparation = newCount > 0 || prepCount > 0
  const allReady    = items.length > 0 && !inPreparation
  const isDelivered = !inPreparation && order.status === 'delivered'
  const isNeedsBill = !inPreparation && order.status === 'needs_bill'
  const isRecalledWaiting = !inPreparation &&
    order.status === 'sent_to_kitchen' &&
    readyCount === 0 &&
    items.some(i => String(i.status || '').toLowerCase() === 'served') &&
    items.every(i => ['served', 'cancelled'].includes(String(i.status || '').toLowerCase()))
  const canEditRequestedBill = canEditOrder

  const L = {
    uz: {
      preparationTitle: 'Buyurtma tayyorlanmoqda',
      preparationSub: (n, p) => [n > 0 && `${n} yangi`, p > 0 && `${p} tayyorlanmoqda`].filter(Boolean).join(' · '),
      waitingTitle: 'Kutilmoqda',
      waitingSub: 'Ofitsiantga qaytarildi',
      readyTitle: 'Barcha taomlar tayyor!',
      readySub: 'Mijozga yetkazilganini tasdiqlang',
      confirmBtn: 'Yetkazildi ✓',
      deliveredTitle: 'Yetkazildi',
      deliveredSub: 'Hisob so\'rash mumkin',
      billBtn: 'Hisob so\'rash',
      needsBillTitle: 'Hisob so\'raldi',
      needsBillSub: 'Kassir to\'lovni qayta ishlaydi',
      removeItem: 'Olib tashlash',
      decreaseItem: 'Kamaytirish',
      increaseItem: 'Ko‘paytirish',
      printCheck: 'Chek chiqarish',
      printAllChecks: 'Hammasini chiqarish',
      roundLabel: n => `Buyurtma ${n}`,
      missingItem: 'Menyuda yo‘q',
      removeReason: 'Menyuda mavjud emas',
    },
    ru: {
      preparationTitle: 'Заказ готовится',
      preparationSub: (n, p) => [n > 0 && `${n} новых`, p > 0 && `${p} готовится`].filter(Boolean).join(' · '),
      waitingTitle: 'Ожидание',
      waitingSub: 'Возвращено официанту',
      readyTitle: 'Все блюда готовы!',
      readySub: 'Подтвердите, что заказ подан гостю',
      confirmBtn: 'Подано ✓',
      deliveredTitle: 'Подано',
      deliveredSub: 'Можно запросить счёт',
      billBtn: 'Запросить счёт',
      needsBillTitle: 'Счёт запрошен',
      needsBillSub: 'Кассир обрабатывает оплату',
      removeItem: 'Убрать',
      decreaseItem: 'Уменьшить',
      increaseItem: 'Увеличить',
      printCheck: 'Печать чека',
      printAllChecks: 'Печать всех',
      roundLabel: n => `Заказ ${n}`,
      missingItem: 'Нет в меню',
      removeReason: 'Нет в меню',
    },
    en: {
      preparationTitle: 'Order is preparing',
      preparationSub: (n, p) => [n > 0 && `${n} new`, p > 0 && `${p} preparing`].filter(Boolean).join(' · '),
      waitingTitle: 'Waiting',
      waitingSub: 'Back with waiter',
      readyTitle: 'All items ready!',
      readySub: 'Confirm the order has been served to the guest',
      confirmBtn: 'Mark as Served ✓',
      deliveredTitle: 'Order Served',
      deliveredSub: 'You can now request the bill',
      billBtn: 'Request Bill',
      needsBillTitle: 'Bill Requested',
      needsBillSub: 'Cashier is processing payment',
      removeItem: 'Remove',
      decreaseItem: 'Decrease',
      increaseItem: 'Increase',
      printCheck: 'Print check',
      printAllChecks: 'Print all',
      roundLabel: n => `Order ${n}`,
      missingItem: 'Not in menu',
      removeReason: 'Not present in menu',
    },
  }
  const l = L[lang] || L.en

  const requestedBillEditableItems = canEditRequestedBill
    ? items.filter(item => String(item.status || '').toLowerCase() !== 'cancelled')
    : []
  const recalledEditableItems = canEditOrder && isRecalledWaiting
    ? items.filter(item => String(item.status || '').toLowerCase() !== 'cancelled')
    : []
  const kitchenCheckGroups = getKitchenCheckGroups(order)
  const preparationGroups = kitchenCheckGroups
    .map((group, index) => ({
      ...group,
      roundNumber: index + 1,
    }))
  const requestedBillEditableGroups = canEditRequestedBill
    ? kitchenCheckGroups
      .map((group, index) => ({
        ...group,
        roundNumber: index + 1,
        items: group.items.filter(item => String(item.status || '').toLowerCase() !== 'cancelled'),
      }))
      .filter(group => group.items.length > 0)
    : []
  const recalledEditableGroups = canEditOrder && isRecalledWaiting
    ? kitchenCheckGroups
      .map((group, index) => ({
        ...group,
        roundNumber: index + 1,
        items: group.items.filter(item => String(item.status || '').toLowerCase() !== 'cancelled'),
      }))
      .filter(group => group.items.length > 0)
    : []

  async function handleUpdateItemQty(item, qty) {
    if (!canEditOrder) return
    const itemKey = item.id || item.menu_item_id
    const sourceOrderId = item.order_id || item._orderId || order.id
    if (!sourceOrderId || !itemKey || updatingItemId) return
    setUpdatingItemId(itemKey)
    const result = await dispatch({
      type: 'UPDATE_BILL_ITEM_QTY',
      payload: {
        tableId,
        orderId: sourceOrderId,
        orderItemId: item.id,
        menuItemId: item.menu_item_id,
        sourceItemIds: item.source_item_ids || item.sourceItemIds || [],
        qty,
        sale_unit: item.sale_unit || menuItemMap?.[item.menu_item_id]?.sale_unit || 'piece',
      },
    })
    if (result?.error) {
      setTimeout(() => setUpdatingItemId(null), 700)
      return
    }
    setUpdatingItemId(null)
  }

  function OrderItemQtyRow({ item, editable = true }) {
    const itemKey = item.id || item.menu_item_id
    const menuItem = menuItemMap?.[item.menu_item_id]
    const displayName = menuItem ? getItemName(menuItem, lang) : item.name
    const optionLines = getOrderItemOptionLines(item, menuItem, lang)
    const missing = !menuItem || menuItem.available === false
    const updating = updatingItemId === itemKey
    const quantity = Number(item.quantity) || 1
    const quantitySource = { ...menuItem, sale_unit: item.sale_unit || menuItem?.sale_unit }
    return (
      <div className="flex items-center gap-2 rounded-xl bg-white/75 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-black text-[#1F2937]">{displayName}</p>
          {optionLines.map((line, index) => (
            <p key={`${itemKey}-option-${index}`} className="truncate text-[11px] font-black text-[#111827]">{line}</p>
          ))}
          <p className="text-[10px] font-bold text-[#9CA3AF]">
            {isMenuItemSoldByWeight(quantitySource) ? formatMenuQuantity(quantity, quantitySource) : `×${formatMenuQuantity(quantity, quantitySource)}`}
            {missing ? ` · ${l.missingItem}` : ''}
          </p>
        </div>
        {editable && (
        <div className="flex h-9 flex-shrink-0 items-center gap-1 rounded-lg border border-orange-100 bg-white p-1">
          <button
            type="button"
            onClick={() => handleUpdateItemQty(item, changeMenuQuantity(quantity, quantitySource, -1))}
            disabled={!!updatingItemId}
            title={l.decreaseItem}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-wait disabled:opacity-50"
          >
            {updating ? <Loader2 size={12} className="animate-spin" /> : <Minus size={12} />}
          </button>
          <span className="min-w-6 text-center text-[12px] font-black tabular-nums text-[#1F2937]">{formatMenuQuantity(quantity, quantitySource)}</span>
          <button
            type="button"
            onClick={() => handleUpdateItemQty(item, changeMenuQuantity(quantity, quantitySource, 1))}
            disabled={!!updatingItemId}
            title={l.increaseItem}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#ff5a00] text-white transition-colors hover:bg-[#cc4800] disabled:cursor-wait disabled:opacity-50"
          >
            <Plus size={12} />
          </button>
        </div>
        )}
      </div>
    )
  }

  function handleConfirmDelivery() {
    if (busy || !canEditOrder) return
    setBusy(true)
    dispatch({ type: 'CONFIRM_ORDER_DELIVERED', payload: tableId })
    setTimeout(() => setBusy(false), 700)
  }
  async function handleRequestBill() {
    if (busy || !canEditOrder) return
    setBusy(true)
    const result = await dispatch({ type: 'MARK_TABLE_NEEDS_BILL', payload: tableId })
    if (!result?.error) onMovedToCashier?.()
    setBusy(false)
  }

  if (inPreparation) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-orange-100 bg-[#fff7ed] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Clock size={16} className="text-[#ff5a00]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-[#ff5a00]">{l.preparationTitle}</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">{l.preparationSub(newCount, prepCount)}</p>
          </div>
          {readyCount > 0 && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full flex-shrink-0">
              {readyCount} {lang === 'uz' ? 'tayyor' : lang === 'ru' ? 'готово' : 'ready'}
            </span>
          )}
          {preparationGroups.length > 1 && (
            <button
              type="button"
              onClick={() => onPrintKitchenCheck(preparationGroups)}
              className="inline-flex h-8 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#ff5a00] px-2.5 text-[11px] font-black text-white transition-colors hover:bg-[#cc4800]"
            >
              <Printer size={13} />
              {l.printAllChecks}
            </button>
          )}
        </div>
        {preparationGroups.length > 0 && (
          <div className="mt-3 space-y-3 border-t border-orange-100 pt-3">
            {preparationGroups.map(group => (
              <div key={group.roundId} className="space-y-2 rounded-2xl border border-orange-100 bg-white/35 p-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="text-[11px] font-black uppercase tracking-wide text-[#ff5a00]">
                    {l.roundLabel(group.roundNumber)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onPrintKitchenCheck(group)}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-white px-2.5 text-[11px] font-black text-[#ff5a00] transition-colors hover:bg-orange-50"
                  >
                    <Printer size={13} />
                    {l.printCheck}
                  </button>
                </div>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <OrderItemQtyRow
                      key={item.id || `${group.roundId}-${item.menu_item_id}`}
                      item={item}
                      editable={canEditOrder && !['served', 'cancelled'].includes(String(item.status || '').toLowerCase())}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (isRecalledWaiting) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-yellow-100 bg-yellow-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
            <Clock size={16} className="text-yellow-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-yellow-700">{l.waitingTitle}</p>
            <p className="text-[11px] text-[#6B7280] mt-0.5">{l.waitingSub}</p>
          </div>
        </div>
        {recalledEditableItems.length > 0 && (
          <div className="mt-3 space-y-3 border-t border-yellow-100 pt-3">
            {recalledEditableGroups.map(group => (
              <div key={group.roundId} className="space-y-2 rounded-2xl border border-yellow-100 bg-white/45 p-2">
                <p className="px-1 text-[11px] font-black uppercase tracking-wide text-yellow-700">
                  {l.roundLabel(group.roundNumber)}
                </p>
                {group.items.map(item => (
                  <OrderItemQtyRow key={item.id || `${group.roundId}-${item.menu_item_id}`} item={item} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (allReady && !isDelivered && !isNeedsBill) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border-2 border-green-300 bg-[#f0fdf4] px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={16} className="text-[#16A34A]" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-[#16A34A]">{l.readyTitle}</p>
            <p className="text-[11px] text-[#6B7280] mt-0.5">{l.readySub}</p>
          </div>
        </div>
        <button
          onClick={handleConfirmDelivery}
          disabled={busy || !canEditOrder}
          className={`w-full py-2.5 rounded-xl font-black text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            busy ? 'bg-green-200 text-green-500 cursor-not-allowed' : 'bg-[#16A34A] text-white hover:bg-[#15803D] shadow-sm'
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {l.confirmBtn}
        </button>
      </div>
    )
  }
  if (isDelivered) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Receipt size={16} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-blue-700">{l.deliveredTitle}</p>
            <p className="text-[11px] text-[#6B7280] mt-0.5">{l.deliveredSub}</p>
          </div>
        </div>
        <button
          onClick={handleRequestBill}
          disabled={busy || !canEditOrder}
          className={`w-full py-2.5 rounded-xl font-black text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            busy ? 'bg-blue-200 text-blue-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
          {l.billBtn}
        </button>
      </div>
    )
  }
  if (isNeedsBill) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <Clock size={16} className="text-[#DC2626]" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#DC2626]">{l.needsBillTitle}</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">{l.needsBillSub}</p>
          </div>
        </div>
        {requestedBillEditableItems.length > 0 && (
          <div className="mt-3 space-y-3 border-t border-red-100 pt-3">
            {requestedBillEditableGroups.map(group => (
              <div key={group.roundId} className="space-y-2 rounded-2xl border border-red-100 bg-white/45 p-2">
                <p className="px-1 text-[11px] font-black uppercase tracking-wide text-red-500">
                  {l.roundLabel(group.roundNumber)}
                </p>
                {group.items.map(item => (
                  <OrderItemQtyRow key={item.id || `${group.roundId}-${item.menu_item_id}`} item={item} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  return null
}

// ── BottomTableChips ───────────────────────────────────────────────────────────
function BottomTableChips({ currentTableId, onNewOrder, disabled = false }) {
  const { state } = useApp()
  const navigate  = useNavigate()

  const chips = useMemo(() => {
    const byTable = {}
    state.orders.forEach(o => {
      if (!getActiveTableOrders(o.table_id, [o]).length) return
      if (!byTable[o.table_id]) {
        byTable[o.table_id] = {
          table_id:   o.table_id,
          table_name: o.table_name,
          itemCount:  o.items?.length ?? 0,
          status:     o.status,
        }
      } else {
        byTable[o.table_id].itemCount += o.items?.length ?? 0
        // escalate status
        const priority = ['preparing', 'sent_to_kitchen', 'needs_bill', 'delivered']
        const cur = priority.indexOf(byTable[o.table_id].status)
        const nxt = priority.indexOf(o.status)
        if (nxt !== -1 && (cur === -1 || nxt < cur)) byTable[o.table_id].status = o.status
      }
    })
    return Object.values(byTable)
  }, [state.orders])

  if (chips.length === 0) return null

  const STATUS_LABEL = {
    sent_to_kitchen: { en: 'Sent', uz: 'Yuborildi', ru: 'Отправлен', cls: 'bg-orange-100 text-[#ff5a00]' },
    preparing:       { en: 'Cooking', uz: 'Pishirilmoqda', ru: 'Готовится', cls: 'bg-yellow-100 text-yellow-700' },
    delivered:       { en: 'Served',  uz: 'Yetkazildi', ru: 'Подано', cls: 'bg-green-100 text-green-700' },
    needs_bill:      { en: 'Bill',    uz: 'Hisob', ru: 'Счёт',      cls: 'bg-red-100 text-red-600' },
  }
  const lang = state.lang

  return (
    <div className="flex-shrink-0 bg-white border-t border-[#E5E7EB] px-3 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <div className="flex items-center gap-2 min-w-max">
        {chips.map((chip, idx) => {
          const isActive = chip.table_id === currentTableId
          const sl = STATUS_LABEL[chip.status]
          return (
            <button
              key={chip.table_id}
              onClick={() => { if (!disabled) navigate(`/waiter/order/${chip.table_id}`) }}
              disabled={disabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all flex-shrink-0 disabled:cursor-wait disabled:opacity-50 ${
                isActive
                  ? 'bg-[#fff1e8] border-[#ff5a00]/40 text-[#ff5a00]'
                  : 'bg-gray-50 border-[#E5E7EB] text-[#6B7280] hover:border-orange-200 hover:bg-orange-50/30'
              }`}
            >
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] flex-shrink-0 ${
                isActive ? 'bg-[#ff5a00] text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                T{idx + 1}
              </span>
              <span className="max-w-[72px] truncate font-bold">{chip.table_name}</span>
              <span className="text-[#9CA3AF] font-medium">{chip.itemCount}</span>
              {sl && (
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold flex-shrink-0 ${sl.cls}`}>
                  {sl[lang] || sl.en}
                </span>
              )}
            </button>
          )
        })}

        {/* New Order button */}
        <button
          onClick={onNewOrder}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-[#ff5a00]/40 text-[#ff5a00] text-[11px] font-bold hover:bg-orange-50 transition-colors flex-shrink-0 disabled:cursor-wait disabled:opacity-50"
        >
          <Plus size={12} />
          {lang === 'uz' ? 'Yangi buyurtma' : lang === 'ru' ? 'Новый заказ' : 'New Order'}
        </button>
      </div>
    </div>
  )
}

// ── Product section (used inside "All" grouped view) ──────────────────────────
function ProductSection({ cat, items, cartQtyMap, lang, onAdd, onIncrement, onDecrement, onOpenDetail, eagerCount = 0, audience = 'waiter', compactMobileGrid = false }) {
  return (
    <div>
      <div className="mb-3 flex flex-col items-center text-center sm:mb-6">
        <h2 className="zk-serif lux-title text-[24px] font-semibold leading-none sm:text-[38px]">
          {getCategoryName(cat, lang)}
        </h2>
        <span aria-hidden="true" className="mt-2 h-px w-12 bg-[#C9A86A] sm:mt-3 sm:w-16" />
      </div>
      <div className={`grid ${compactMobileGrid ? 'grid-cols-2 gap-2' : 'grid-cols-2 gap-3'} sm:grid-cols-2 min-[700px]:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 sm:gap-4`}>
        {items.map((item, index) => (
          <ProductCard
            key={item.id}
            item={item}
            qty={cartQtyMap[item.id] || 0}
            lang={lang}
            eager={index < eagerCount}
            audience={audience}
            compactMobileGrid={compactMobileGrid}
            density="compact"
            variant="lux"
            onAdd={onAdd}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  )
}

function cartFlyerSize(rect) {
  return Math.min(86, Math.max(50, Math.min(rect.width, rect.height) * 0.26))
}

function FlyingCartItem({ flyer, onDone }) {
  const [active, setActive] = useState(false)
  const source = flyer.sourceRect
  const target = flyer.targetRect
  const targetSize = cartFlyerSize(target)
  const targetScale = Math.min(0.32, Math.max(0.18, targetSize / Math.max(source.width, source.height)))
  const startCenterX = source.left + source.width / 2
  const startCenterY = source.top + source.height / 2
  const endCenterX = target.left + target.width / 2
  const endCenterY = target.top + target.height / 2
  const dx = endCenterX - startCenterX
  const dy = endCenterY - startCenterY

  useEffect(() => {
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setActive(true))
    })
    const doneTimer = window.setTimeout(() => onDone(flyer.id), 760)
    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.clearTimeout(doneTimer)
    }
  }, [flyer.id])

  return (
    <div
      className="pointer-events-none fixed z-[90] flex items-center justify-center overflow-hidden rounded-[22px] border-2 border-white bg-orange-50 shadow-2xl ring-2 ring-[#ff5a00]/25 will-change-transform"
      style={{
        left: source.left,
        top: source.top,
        width: source.width,
        height: source.height,
        transform: active
          ? `translate3d(${dx}px, ${dy}px, 0) scale(${targetScale})`
          : 'translate3d(0, 0, 0) scale(1)',
        opacity: active ? 0.08 : 0.98,
        transformOrigin: 'center center',
        transition: 'transform 720ms cubic-bezier(0.16, 1, 0.3, 1), opacity 720ms ease-out, border-radius 720ms cubic-bezier(0.16, 1, 0.3, 1)',
        borderRadius: active ? 18 : 22,
      }}
      aria-hidden="true"
    >
      {flyer.imageUrl ? (
        <img
          src={flyer.imageUrl}
          alt=""
          draggable="false"
          className="h-full w-full object-cover object-center"
        />
      ) : (
        <UtensilsCrossed size={Math.max(28, Math.min(source.width, source.height) * 0.24)} className="text-[#ff5a00]" />
      )}
      <span className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#ff5a00] text-white shadow-lg">
        <Plus size={14} />
      </span>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WaiterOrder() {
  const { tableId }         = useParams()
  const navigate            = useNavigate()
  const location            = useLocation()
  const [searchParams]      = useSearchParams()
  const { state, dispatch, pendingKitchenSubmission } = useApp()
  // A switched-off Tourist menu ignores a stale Tourist request; saved Tourist orders keep their mode.
  const requestedPriceMode  = state.settings?.touristMenuEnabled === false
    ? DEFAULT_PRICE_MODE
    : normalizePriceMode(location.state?.priceMode)
  const { loaded, loadError } = useAppDataStatus()
  const { profile, signOut } = useAuth()
  const role                = (profile?.role || state.user?.role || '').toLowerCase()
  const staffUserId         = profile?.id || ''
  const guestModeSession    = useGuestModeSession()
  const isGuestTabletMode   = isGuestModeSessionFor(guestModeSession, {
    tableId,
    staffUserId,
    pathname: location.pathname,
  })
  const guestSessionPriceMode = normalizeGuestModePriceMode(guestModeSession?.priceMode)
  const [guestLang, setGuestLang] = useState(() => guestModeSession?.guestLang || 'en')
  const lang                = isGuestTabletMode ? guestLang : state.lang
  const staffLang           = state.lang || 'en'
  const shouldShowSidebar   = role !== 'guest' && !isGuestTabletMode
  const canEditTables       = canEditFeature(profile || { role }, 'tables')
  const [mobileMenuView, setMobileMenuView] = useState(() => {
    try { return localStorage.getItem('waiter-mobile-grid-view') === 'grid' ? 'grid' : 'compact' } catch { return 'compact' }
  })
  const [search,        setSearch]       = useState('')
  const [activeCategory,setCategory]     = useState('all')
  const [cartOpen,      setCartOpen]     = useState(false)
  const [sidebarOpen,   setSidebarOpen]  = useState(false)
  const [isSendingOrder,setSendingOrder] = useState(false)
  const orderLocked = isSendingOrder || !!pendingKitchenSubmission
  const orderLockedRef = useRef(orderLocked)
  useEffect(() => { orderLockedRef.current = orderLocked }, [orderLocked])
  const isTakeAwayFlow = !tableId
  const [orderType,     setOrderType]    = useState(isTakeAwayFlow ? 'take_away' : 'dine_in')
  const [priceMode,     setPriceMode]    = useState(isGuestTabletMode ? guestSessionPriceMode : requestedPriceMode)
  const [guestUnlockOpen, setGuestUnlockOpen] = useState(false)
  const [guestModeBusy, setGuestModeBusy] = useState(false)
  const [guestModeError, setGuestModeError] = useState('')
  const [guestReviewWarning, setGuestReviewWarning] = useState('')
  const [guestExpectedOrderIds, setGuestExpectedOrderIds] = useState(null)
  const [guestCartReady, setGuestCartReady] = useState(false)
  const [guestUnlockClock, setGuestUnlockClock] = useState(() => Date.now())
  const [detailItem,    setDetailItem]   = useState(null)
  const [visibilityNow, setVisibilityNow] = useState(() => new Date())
  const [cartFlyers, setCartFlyers] = useState([])
  const [cartPulse, setCartPulse] = useState(false)
  const productScrollRef = useRef(null)
  const savedMenuScrollRef = useRef(0)
  const cartButtonRef = useRef(null)
  const cartAnimationIdRef = useRef(0)
  const cartPulseTimerRef = useRef(null)
  const preserveUnlockedGuestPriceModeRef = useRef(null)
  const wasGuestTabletModeRef = useRef(isGuestTabletMode)
  const shouldOpenOrderPanel = searchParams.get('panel') === 'order'
  const isManageOrderPanel = shouldOpenOrderPanel
  const routeOrderType = isTakeAwayFlow
    ? normalizeOrderType(searchParams.get('orderType') || searchParams.get('type') || 'take_away')
    : 'dine_in'
  const menuAudience = isGuestTabletMode ? 'public' : 'waiter'

  useEffect(() => {
    if (!pendingKitchenSubmission) return
    const pendingOrderType = normalizeOrderType(pendingKitchenSubmission.payload?.orderType)
    const pendingIsOffPremise = isOffPremiseOrderType(pendingOrderType)
    const pendingTableId = String(pendingKitchenSubmission._tableId || '').trim()
    setOrderType(pendingOrderType)
    setPriceMode(normalizePriceMode(pendingKitchenSubmission._priceMode || pendingKitchenSubmission.payload?.priceMode))
    if (isSendingOrder) return
    if (pendingIsOffPremise && !isTakeAwayFlow) {
      navigate(`/waiter/take-away?orderType=${encodeURIComponent(pendingOrderType)}`, { replace: true })
    } else if (!pendingIsOffPremise && pendingTableId && pendingTableId !== tableId) {
      navigate(`/waiter/order/${encodeURIComponent(pendingTableId)}`, { replace: true })
    }
  }, [pendingKitchenSubmission?._kitchenRoundId, pendingKitchenSubmission?._tableId, isSendingOrder, isTakeAwayFlow, tableId, navigate])

  const table = isTakeAwayFlow ? null : state.tables.find(t => t.id === tableId)
  const orderTitle = isTakeAwayFlow
    ? orderTypeLabel(orderType, lang)
    : table?.name || table?.label || `${t(lang, 'table')} ${table?.number || tableId}`
  const orderContextLabel = isTakeAwayFlow
    ? (lang === 'uz' ? 'Buyurtma turi' : lang === 'ru' ? 'Тип заказа' : 'Order type')
    : t(lang, 'table')

  const activeOrders = useMemo(
    () => isTakeAwayFlow ? [] : getActiveTableOrders(tableId, state.orders),
    [state.orders, tableId, isTakeAwayFlow]
  )
  const waiterName = isTakeAwayFlow ? '' : getTableOrderWaiterNames(tableId, state.orders, profile?.full_name || state.user?.name || '').join(', ')
  const waiterLabel = lang === 'uz' ? 'Ofitsiantingiz' : lang === 'ru' ? 'Ваш официант' : 'Your waiter'

  // Merge all billable active orders for this table. Empty shells must not
  // override the R/T price mode selected while entering the table.
  const activeOrder = useMemo(() => {
    if (activeOrders.length === 0) return null
    const merged = { ...activeOrders[0] }
    merged.items = activeOrders.flatMap(o => (o.items || []).map(item => ({
      ...item,
      order_id: item.order_id || o.id,
      _orderId: o.id,
      order_number: item.order_number || o.order_number,
      table_name: item.table_name || o.table_name,
      waiter_name: item.waiter_name || o.waiter_name,
      created_at: item.created_at || o.created_at,
    })))
    const priority = ['preparing', 'sent_to_kitchen', 'needs_bill', 'delivered']
    for (const p of priority) {
      if (activeOrders.some(o => o.status === p)) { merged.status = p; break }
    }
    return merged
  }, [activeOrders])

  const activeTableOrderIds = useMemo(() => (
    activeOrders
      .map(order => String(order.id || '').trim())
      .filter(Boolean)
      .sort()
  ), [activeOrders])

  const guestOrderChangedWarning = staffLang === 'uz'
    ? 'Bu stolning buyurtmasi mehmon rejimi vaqtida o‘zgargan. Oshxonaga yuborishdan oldin stol holati va tanlovni tekshiring.'
    : staffLang === 'ru'
      ? 'Заказ этого стола изменился во время гостевого режима. Проверьте стол и выбор перед отправкой на кухню.'
      : 'This table order changed during Guest mode. Review the table and selection before sending it to the kitchen.'

  useEffect(() => {
    if (isGuestTabletMode) {
      setPriceMode(guestSessionPriceMode)
      return
    }
    if (preserveUnlockedGuestPriceModeRef.current) {
      setPriceMode(preserveUnlockedGuestPriceModeRef.current)
      return
    }
    if (orderLocked) return
    setPriceMode(activeOrder || state.cart.length > 0
      ? resolveOrderingPriceMode(activeOrder, state.cart)
      : requestedPriceMode)
  }, [activeOrder?.id, activeOrder?.price_mode, guestSessionPriceMode, isGuestTabletMode, orderLocked, requestedPriceMode, state.cart.length])

  useEffect(() => {
    if (!isGuestTabletMode) {
      setGuestCartReady(false)
      return
    }
    if (!loaded || guestCartReady) return
    const restoredCart = rebuildGuestCartFromCatalog({
      cart: guestModeSession?.cart || [],
      menuItems: state.menuItems,
      categories: state.categories,
      now: visibilityNow,
      lang: guestModeSession?.guestLang || guestLang,
      priceMode: guestSessionPriceMode,
    })
    dispatch({ type: 'REPLACE_CART', payload: restoredCart })
    setGuestCartReady(true)
  }, [isGuestTabletMode, loaded, guestModeSession?.id, guestCartReady, state.menuItems, state.categories, visibilityNow, guestLang, guestSessionPriceMode, dispatch])

  useEffect(() => {
    if (!isGuestTabletMode || !guestCartReady) return
    updateGuestModeSession({ cart: state.cart })
  }, [isGuestTabletMode, guestCartReady, state.cart])

  useEffect(() => {
    if (!isGuestTabletMode || !guestCartReady) return

    const reviewedCart = rebuildGuestCartFromCatalog({
      cart: state.cart,
      menuItems: state.menuItems,
      categories: state.categories,
      now: visibilityNow,
      lang,
      priceMode: guestSessionPriceMode,
    })
    if (JSON.stringify(reviewedCart) !== JSON.stringify(state.cart)) {
      dispatch({ type: 'REPLACE_CART', payload: reviewedCart })
    }

    if (!detailItem) return
    const currentItem = state.menuItems.find(item => item.id === detailItem.id)
    const currentCategory = state.categories.find(category => category.id === currentItem?.category_id)
    const remainsVisible = currentItem &&
      isCustomerMenuItem(currentItem, visibilityNow) &&
      (!currentItem.category_id || (
        currentCategory &&
        isCustomerMenuCategory(currentCategory, visibilityNow) &&
        (guestSessionPriceMode !== PRICE_MODE_TOURIST || !isTouristHiddenMenuCategory(currentCategory))
      ))
    if (!remainsVisible) {
      setDetailItem(null)
    } else {
      const currentGuestItem = getMenuItemForPriceMode(currentItem, guestSessionPriceMode)
      if (JSON.stringify(currentGuestItem) !== JSON.stringify(detailItem)) {
        setDetailItem(currentGuestItem)
      }
    }
  }, [isGuestTabletMode, guestCartReady, state.cart, state.menuItems, state.categories, visibilityNow, lang, guestSessionPriceMode, detailItem, dispatch])

  useEffect(() => {
    const wasGuestTabletMode = wasGuestTabletModeRef.current
    if (wasGuestTabletMode && !isGuestTabletMode && !preserveUnlockedGuestPriceModeRef.current) {
      dispatch({ type: 'CLEAR_CART' })
      setDetailItem(null)
      setCartOpen(false)
    }
    wasGuestTabletModeRef.current = isGuestTabletMode
  }, [isGuestTabletMode, dispatch])

  useEffect(() => {
    if (!guestExpectedOrderIds) return
    const orderContextChanged = guestExpectedOrderIds.join('|') !== activeTableOrderIds.join('|')
    setGuestReviewWarning(orderContextChanged ? guestOrderChangedWarning : '')
  }, [guestExpectedOrderIds, activeTableOrderIds, guestOrderChangedWarning])

  useEffect(() => {
    if (isGuestTabletMode || state.cart.length > 0 || !guestExpectedOrderIds) return
    setGuestExpectedOrderIds(null)
    setGuestReviewWarning('')
  }, [isGuestTabletMode, state.cart.length, guestExpectedOrderIds])

  useEffect(() => {
    if (!isGuestTabletMode || !guestModeSession?.guestLang) return
    setGuestLang(guestModeSession.guestLang)
  }, [isGuestTabletMode, guestModeSession?.id])

  useEffect(() => {
    if (!guestUnlockOpen) return undefined
    setGuestUnlockClock(Date.now())
    const timer = window.setInterval(() => setGuestUnlockClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [guestUnlockOpen])

  useEffect(() => {
    if ((!shouldOpenOrderPanel && !pendingKitchenSubmission) || detailItem) return
    setCartOpen(true)
  }, [shouldOpenOrderPanel, detailItem, activeOrder?.id, pendingKitchenSubmission?._kitchenRoundId])

  // Cart lookups
  const cartQtyMap = useMemo(() => {
    const map = {}
    state.cart.forEach(i => { map[i.menu_item_id] = (map[i.menu_item_id] || 0) + (Number(i.quantity) || 0) })
    return map
  }, [state.cart])

  const cartNotesMap = useMemo(() => {
    const map = {}
    state.cart.forEach(i => {
      if (!i.notes || Object.keys(i.selected_options || i.selectedOptions || {}).length > 0) return
      map[i.menu_item_id] = i.notes
    })
    return map
  }, [state.cart])

  const cartCount = state.cart.reduce((s, i) => s + i.quantity, 0)
  const submittedItemCount = (activeOrder?.items || []).reduce((sum, item) => (
    String(item?.status || '').toLowerCase() === 'cancelled'
      ? sum
      : sum + (Number(item?.quantity) || 0)
  ), 0)
  const hasSubmittedItems = submittedItemCount > 0
  const isManageOrderOnly = !isGuestTabletMode && isManageOrderPanel && cartCount === 0 && !pendingKitchenSubmission
  const configuredServiceRatePct = getConfiguredServiceRatePct(state.settings, priceMode)
  const cartSummary = useMemo(() => {
    const serviceRatePct = isOffPremiseOrderType(orderType) ? 0 : configuredServiceRatePct
    return getOrderPaymentSummary({ order_type: orderType, service_rate_pct: serviceRatePct }, state.cart, configuredServiceRatePct)
  }, [configuredServiceRatePct, orderType, state.cart])

  // Categories
  const sortedCategories = useMemo(() =>
    [...state.categories]
      .filter(category => {
        const visibleForAudience = isGuestTabletMode
          ? isCustomerMenuCategory(category, visibilityNow)
          : isWaiterMenuCategory(category, visibilityNow, staffUserId, orderType)
        return visibleForAudience && (
          priceMode !== PRICE_MODE_TOURIST || !isTouristHiddenMenuCategory(category)
        )
      })
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.categories, isGuestTabletMode, visibilityNow, staffUserId, priceMode, orderType]
  )

  const visibleCategoryIds = useMemo(
    () => new Set(sortedCategories.map(category => category.id)),
    [sortedCategories]
  )

  const categoryItemCounts = useMemo(() => {
    const counts = { all: 0 }
    state.menuItems.forEach(item => {
      const visible = isGuestTabletMode
        ? isCustomerMenuItem(item, visibilityNow)
        : isWaiterMenuItem(item, visibilityNow)
      if (!visible) return
      if (item.category_id && !visibleCategoryIds.has(item.category_id)) return
      counts.all = (counts.all || 0) + 1
      counts[item.category_id] = (counts[item.category_id] || 0) + 1
    })
    return counts
  }, [state.menuItems, visibleCategoryIds, isGuestTabletMode, visibilityNow])

  const allCategoryCards = useMemo(() => [
    { id: 'all' },
    ...sortedCategories,
  ], [sortedCategories])

  // Filtered items
  const q = search.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    return state.menuItems
      .filter(item => {
        const visible = isGuestTabletMode
          ? isCustomerMenuItem(item, visibilityNow)
          : isWaiterMenuItem(item, visibilityNow)
        if (!visible) return false
        if (item.category_id && !visibleCategoryIds.has(item.category_id)) return false
        const matchSearch = !q || [item.name_uz, item.name_ru, item.name_en].some(n => n?.toLowerCase().includes(q))
        return matchSearch
      })
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
  }, [state.menuItems, visibleCategoryIds, isGuestTabletMode, q, visibilityNow])

  const pricedFilteredItems = useMemo(
    () => filteredItems.map(item => getMenuItemForPriceMode(item, priceMode)),
    [filteredItems, priceMode]
  )

  // Grouped sections when "All" is selected without a search query
  const sections = useMemo(() => {
    return sortedCategories
      .map(cat => ({ cat, items: pricedFilteredItems.filter(i => i.category_id === cat.id) }))
      .filter(s => s.items.length > 0)
  }, [sortedCategories, pricedFilteredItems])

  // Category lookup map (for product detail page)
  const categoryMap = useMemo(() => {
    const map = {}
    state.categories.forEach(c => { map[c.id] = c })
    return map
  }, [state.categories])

  const menuItemMap = useMemo(() => {
    const map = {}
    state.menuItems.forEach(item => { map[item.id] = item })
    return map
  }, [state.menuItems])

  useEffect(() => () => {
    if (cartPulseTimerRef.current) window.clearTimeout(cartPulseTimerRef.current)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setVisibilityNow(new Date()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  // ── Cart handlers ──────────────────────────────────────────────────────────

  function pulseCartButton() {
    if (cartPulseTimerRef.current) window.clearTimeout(cartPulseTimerRef.current)
    setCartPulse(true)
    cartPulseTimerRef.current = window.setTimeout(() => setCartPulse(false), 280)
  }

  function finishCartFlyer(id) {
    setCartFlyers(current => current.filter(flyer => flyer.id !== id))
    pulseCartButton()
  }

  function playCartAnimation(item, animation) {
    const target = cartButtonRef.current
    if (!target) return
    const shouldReduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (!animation?.sourceRect || shouldReduceMotion) {
      pulseCartButton()
      return
    }
    const targetRect = target.getBoundingClientRect()
    cartAnimationIdRef.current += 1
    setCartFlyers(current => [
      ...current,
      {
        id: cartAnimationIdRef.current,
        sourceRect: animation.sourceRect,
        targetRect: {
          left: targetRect.left,
          top: targetRect.top,
          width: targetRect.width,
          height: targetRect.height,
        },
        imageUrl: animation.imageUrl || item.image_url || '',
        name: animation.name || getItemName(item, lang),
      },
    ].slice(-4))
  }

  function handleAdd(item, animation) {
    if (orderLocked || !canEditTables) return
    if (item?.available === false) return
    if (menuItemRequiresOptions(item, menuAudience) || isMenuItemSoldByWeight(item)) {
      openDetail(item)
      return
    }
    dispatch({ type: 'ADD_TO_CART', payload: makeCartPayload(item) })
    playCartAnimation(item, animation)
  }

  function handleIncrement(item, animation) {
    if (orderLocked || !canEditTables) return
    if (item?.available === false) return
    if (menuItemRequiresOptions(item, menuAudience) || isMenuItemSoldByWeight(item)) {
      openDetail(item)
      return
    }
    dispatch({ type: 'ADD_TO_CART', payload: makeCartPayload(item) })
    playCartAnimation(item, animation)
  }

  function handleDecrement(item) {
    if (orderLocked || !canEditTables) return
    if (menuItemRequiresOptions(item, menuAudience) || isMenuItemSoldByWeight(item)) {
      openDetail(item)
      return
    }
    const qty = (cartQtyMap[item.id] || 0) - 1
    if (qty <= 0) dispatch({ type: 'REMOVE_FROM_CART', payload: item.id })
    else dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.id, qty } })
  }

  // ── Modal handlers ─────────────────────────────────────────────────────────

  // The tapped dish photo morphs into the product page and back (View Transitions; instant where unsupported).
  function runDishTransition(update) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || typeof document.startViewTransition !== 'function') {
      update()
      return null
    }
    return document.startViewTransition(update)
  }

  function openDetail(item, sourceElement = null) {
    if (orderLocked || !canEditTables) return
    savedMenuScrollRef.current = productScrollRef.current?.scrollTop ?? 0
    if (sourceElement) sourceElement.style.viewTransitionName = 'zk-dish'
    runDishTransition(() => {
      if (sourceElement) sourceElement.style.viewTransitionName = ''
      flushSync(() => setDetailItem(item))
    })
  }

  // The cart panel grows out of the cart button and shrinks back into it.
  function openCart() {
    const button = cartButtonRef.current
    if (button) button.style.viewTransitionName = 'zk-cart'
    const transition = runDishTransition(() => {
      if (button) button.style.viewTransitionName = ''
      flushSync(() => setCartOpen(true))
    })
    if (!transition && button) button.style.viewTransitionName = ''
  }

  // force: the cart panel closes itself after a successful send, while the order is still locked.
  function closeCart({ force = false } = {}) {
    if (orderLocked && !force) return
    const button = cartButtonRef.current
    const transition = runDishTransition(() => {
      flushSync(() => setCartOpen(false))
      if (button) button.style.viewTransitionName = 'zk-cart'
    })
    if (button) {
      if (transition) transition.finished.finally(() => { button.style.viewTransitionName = '' })
      else button.style.viewTransitionName = ''
    }
  }

  function closeDetail() {
    const itemId = detailItem?.id
    // Hide the details card first so only the photo animates back into its menu card.
    const details = document.querySelector('[data-dish-details]')
    if (details) {
      details.style.viewTransitionName = 'none'
      details.style.visibility = 'hidden'
    }
    let target = null
    const transition = runDishTransition(() => {
      // Commit first: the menu grid remounts on close, so its cards only exist after this flush.
      flushSync(() => setDetailItem(null))
      // Restore the grid's scroll, then tag the dish's card photo as the morph target.
      if (productScrollRef.current) productScrollRef.current.scrollTop = savedMenuScrollRef.current
      if (!itemId) return
      target = [...document.querySelectorAll('[data-item-id]')]
        .find(card => card.getAttribute('data-item-id') === String(itemId) && card.offsetParent)
        ?.querySelector('[data-menu-product-image]') || null
      if (target) target.style.viewTransitionName = 'zk-dish'
    })
    transition?.finished.finally(() => {
      if (target) target.style.viewTransitionName = ''
    })
  }

  // Accepts one round group, or an array of groups to print every round in one go.
  function handlePrintKitchenCheck(group) {
    const groups = (Array.isArray(group) ? group : [group]).filter(Boolean)
    const sourceOrderId = groups[0]?.orderId || activeOrder?.id
    if (!sourceOrderId) return
    const params = new URLSearchParams({ print: '1' })
    if (groups.length > 1) {
      groups.forEach(row => {
        params.append('round', String(row.roundId || ''))
        params.append('order', String(row.orderId || sourceOrderId))
      })
    } else {
      params.set('round', String(groups[0]?.roundId || ''))
    }
    params.set('back', isTakeAwayFlow ? '/waiter/take-away?panel=order' : `/waiter/order/${tableId}?panel=order`)
    navigate(`/kitchen-check/${encodeURIComponent(sourceOrderId)}?${params.toString()}`)
  }

  function handleSubmittedOrderPrint(info) {
    setGuestReviewWarning('')
    setGuestExpectedOrderIds(null)
    if (!state.settings?.autoPrintKitchenCheck || !info?.orderId) return
    const params = new URLSearchParams({
      print: '1',
      round: String(info.kitchenRoundId || ''),
      back: isTakeAwayFlow ? '/waiter/take-away?panel=order' : `/waiter/order/${tableId}?panel=order`,
    })
    navigate(`/kitchen-check/${encodeURIComponent(info.orderId)}?${params.toString()}`)
  }

  function handleProductDetailAdd(item, qty, notes, selectedOptions = {}, selectedOptionBasePrice = null) {
    if (orderLocked || !canEditTables) return
    if (item?.available === false) return
    const payload = makeCartPayload(item, { selectedOptions, selectedOptionBasePrice })
    const isOptionProduct = getMenuItemOptionGroups(item, lang, { audience: menuAudience }).length > 0
    if (isOptionProduct) {
      dispatch({
        type: 'ADD_TO_CART',
        payload: {
          ...payload,
          quantity: normalizeMenuQuantity(qty, item),
          notes: notes || '',
        },
      })
      closeDetail()
      return
    }
    const cartItemKey = payload.cart_item_key || payload.menu_item_id
    const alreadyInCart = state.cart.some(row => (row.cart_item_key || row.menu_item_id) === cartItemKey)
    if (!alreadyInCart) {
      dispatch({ type: 'ADD_TO_CART', payload })
    } else {
      dispatch({
        type: 'UPDATE_CART_ITEM_FIELDS',
        payload: {
          cart_item_key: cartItemKey,
          fields: {
            price: payload.price,
            base_price: payload.base_price,
            unit_price: payload.unit_price,
            selected_options: payload.selected_options,
          },
        },
      })
    }
    dispatch({ type: 'UPDATE_CART_QTY', payload: { cart_item_key: cartItemKey, qty: normalizeMenuQuantity(qty, item) } })
    dispatch({ type: 'UPDATE_CART_NOTES', payload: { cart_item_key: cartItemKey, notes: notes || '' } })
    closeDetail()
  }

  function selectedOptionsCartKey(selectedOptions = {}) {
    const entries = Object.keys(selectedOptions || {})
      .sort()
      .map(key => `${key}:${selectedOptions[key]}`)
      .join('|')
    return entries ? entries : 'plain'
  }

  function makeCartPayload(item, extra = {}) {
    const pricedItem = getMenuItemForPriceMode(item, priceMode)
    const suppliedBasePrice = Number(extra.selectedOptionBasePrice)
    const basePrice = Number.isFinite(suppliedBasePrice) && suppliedBasePrice > 0
      ? Math.round(suppliedBasePrice)
      : pricedItem.base_price
    const unitPrice = calculateUnitPrice(basePrice, priceMode)
    const selectedOptions = extra.selectedOptions || {}
    const optionKey = selectedOptionsCartKey(selectedOptions)
    const hasSelectedOptions = optionKey !== 'plain'
    return {
      ...(hasSelectedOptions ? {
        id: `${pricedItem.id}::${optionKey}`,
        cart_item_key: `${pricedItem.id}::${optionKey}`,
      } : {}),
      menu_item_id: pricedItem.id,
      name: getItemName(pricedItem, lang),
      price: unitPrice,
      base_price: basePrice,
      unit_price: unitPrice,
      price_mode: pricedItem.price_mode,
      sale_unit: pricedItem.sale_unit || pricedItem.saleUnit || 'piece',
      selected_options: hasSelectedOptions ? selectedOptions : {},
    }
  }

  function changeGuestLanguage(nextLang) {
    if (!['uz', 'ru', 'en'].includes(nextLang)) return
    setGuestLang(nextLang)
    if (isGuestTabletMode) updateGuestModeSession({ guestLang: nextLang })
  }

  function finishGuestSelection() {
    if (!isGuestTabletMode || cartCount === 0) return
    const reviewedCart = rebuildGuestCartFromCatalog({
      cart: state.cart,
      menuItems: state.menuItems,
      categories: state.categories,
      now: new Date(),
      lang,
      priceMode: guestSessionPriceMode,
    })
    dispatch({ type: 'REPLACE_CART', payload: reviewedCart })
    updateGuestModeSession({ finished: reviewedCart.length > 0, cart: reviewedCart })
    if (reviewedCart.length === 0) return
    setCartOpen(false)
  }

  function continueGuestSelection() {
    if (!isGuestTabletMode) return
    updateGuestModeSession({ finished: false })
  }

  function exitGuestModeToTables() {
    setGuestExpectedOrderIds(null)
    setGuestReviewWarning('')
    clearGuestModeSession()
    setGuestUnlockOpen(false)
    setGuestCartReady(false)
    setDetailItem(null)
    setCartOpen(false)
    navigate('/waiter/tables', { replace: true })
  }

  async function unlockGuestMode(pin) {
    const latestSession = readGuestModeSession()
    if (!isGuestModeSessionFor(latestSession, { tableId, staffUserId, pathname: location.pathname })) return
    if (guestModePinLockSeconds(latestSession) > 0) return
    setGuestModeBusy(true)
    setGuestModeError('')
    try {
      const verified = await verifyGuestModePin(latestSession, pin)
      if (!verified) {
        const failedSession = registerGuestModePinFailure(latestSession)
        writeGuestModeSession(failedSession)
        setGuestUnlockClock(Date.now())
        setGuestModeError(guestModeCopy(staffLang).wrongPin)
        return
      }
      const guestCart = guestCartReady ? state.cart : (latestSession.cart || [])
      if (guestCart.length === 0) {
        exitGuestModeToTables()
        return
      }
      if (!loaded || loadError) {
        setGuestModeError(staffLang === 'uz'
          ? 'Menyu hali tayyor emas. Qayta yuklang va yana urinib ko‘ring.'
          : staffLang === 'ru'
            ? 'Меню ещё не готово. Перезагрузите страницу и попробуйте снова.'
            : 'The menu is not ready yet. Reload and try again.')
        return
      }
      const reviewedCart = rebuildGuestCartFromCatalog({
        cart: guestCart,
        menuItems: state.menuItems,
        categories: state.categories,
        now: new Date(),
        lang: staffLang,
        priceMode: normalizeGuestModePriceMode(latestSession.priceMode),
      })
      if (reviewedCart.length === 0) {
        exitGuestModeToTables()
        return
      }
      const selectedPriceMode = normalizeGuestModePriceMode(latestSession.priceMode)
      dispatch({ type: 'REPLACE_CART', payload: reviewedCart })
      const submitResult = await dispatch({
        type: 'SEND_TO_KITCHEN',
        payload: { orderType: 'dine_in', priceMode: selectedPriceMode },
        _cart: reviewedCart,
      })
      if (submitResult?.error) {
        setGuestModeError({ writeError: submitResult.error })
        return
      }
      exitGuestModeToTables()
    } catch {
      setGuestModeError(staffLang === 'uz'
        ? 'PIN-ni tekshirib bo‘lmadi. Planshet qulflangan holda qoladi.'
        : staffLang === 'ru'
          ? 'Не удалось проверить PIN. Планшет останется заблокированным.'
          : 'The PIN could not be verified. The tablet will remain locked.')
    } finally {
      setGuestModeBusy(false)
    }
  }

  function handleSignOut() {
    if (orderLocked) return
    clearGuestModeSession()
    dispatch({ type: 'LOGOUT' })
    signOut?.()
  }

  React.useEffect(() => {
    if (!detailItem && savedMenuScrollRef.current > 0) {
      requestAnimationFrame(() => {
        if (productScrollRef.current) {
          productScrollRef.current.scrollTop = savedMenuScrollRef.current
        }
      })
    }
  }, [detailItem])

  React.useEffect(() => {
    dispatch({ type: 'SET_TABLE', payload: isTakeAwayFlow ? null : tableId })
    if (isTakeAwayFlow) setOrderType(routeOrderType)
    return () => {
      if (!orderLockedRef.current) dispatch({ type: 'CLEAR_CART' })
    }
    // dispatch is stable; omitting it keeps this cleanup scoped only to route identity changes.
  }, [isTakeAwayFlow, tableId, routeOrderType])

  if (!loaded || loadError) {
    return (
      <div className="flex overflow-hidden bg-[#FAF7F0]" style={{ height: '100dvh' }}>
        {shouldShowSidebar && (
          <div className="hidden lg:block flex-shrink-0 h-full">
            <UnifiedSidebar navigationDisabled={orderLocked} />
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {!loaded ? (
            <OperationalLoading layout="detail"
              title={lang === 'uz' ? 'Buyurtma ekrani yuklanmoqda' : lang === 'ru' ? 'Загрузка экрана заказа' : 'Loading order screen'}
              description={lang === 'uz' ? 'Stollar, menyu va buyurtmalar olinmoqda.' : lang === 'ru' ? 'Получаем столы, меню и заказы.' : 'Fetching tables, menu, and orders.'}
            />
          ) : (
            <OperationalError
              title={lang === 'uz' ? 'Buyurtmani yuklab bo‘lmadi' : lang === 'ru' ? 'Не удалось загрузить заказ' : 'Could not load order'}
              description={loadError}
              actionLabel={lang === 'uz' ? 'Qayta yuklash' : lang === 'ru' ? 'Перезагрузить' : 'Reload'}
              onAction={() => window.location.reload()}
            />
          )}
        </div>
        {isGuestTabletMode && (
          <button
            type="button"
            onClick={() => { setGuestModeError(''); setGuestUnlockOpen(true) }}
            className="fixed bottom-4 right-4 z-40 inline-flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-black text-[#6B7280] shadow-lg"
          >
            <LockKeyhole size={15} /> {guestModeCopy(staffLang).staff}
          </button>
        )}
        {isGuestTabletMode && guestUnlockOpen && (
          <GuestPinDialog
            mode="unlock"
            lang={staffLang}
            pinLength={getGuestModePinLength(guestModeSession)}
            busy={guestModeBusy}
            error={guestModeError?.writeError ? formatWriteError(guestModeError.writeError, staffLang, 'SEND_TO_KITCHEN') : guestModeError}
            lockSeconds={guestModePinLockSeconds(guestModeSession, guestUnlockClock)}
            onInput={() => setGuestModeError('')}
            onCancel={() => { if (!guestModeBusy) { setGuestUnlockOpen(false); setGuestModeError('') } }}
            onSubmit={unlockGuestMode}
          />
        )}
      </div>
    )
  }

  if (!isTakeAwayFlow && !table) {
    return (
      <div className="min-h-screen bg-[#FAF7F0] flex items-center justify-center">
        <div className="text-center">
          <UtensilsCrossed size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="mb-4 text-sm text-gray-400">{t(lang, 'tableNotFound')}</p>
          {isGuestTabletMode ? (
            <button
              type="button"
              onClick={() => { setGuestModeError(''); setGuestUnlockOpen(true) }}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-black text-[#6B7280] shadow-sm"
            >
              <LockKeyhole size={15} /> {guestModeCopy(staffLang).staff}
            </button>
          ) : (
            <button
              onClick={() => { if (!orderLocked) navigate('/waiter/tables') }}
              disabled={orderLocked}
              className="text-[#ff5a00] font-semibold hover:underline text-sm disabled:cursor-wait disabled:opacity-50"
            >
              {t(lang, 'back')}
            </button>
          )}
        </div>
        {isGuestTabletMode && guestUnlockOpen && (
          <GuestPinDialog
            mode="unlock"
            lang={staffLang}
            pinLength={getGuestModePinLength(guestModeSession)}
            busy={guestModeBusy}
            error={guestModeError?.writeError ? formatWriteError(guestModeError.writeError, staffLang, 'SEND_TO_KITCHEN') : guestModeError}
            lockSeconds={guestModePinLockSeconds(guestModeSession, guestUnlockClock)}
            onInput={() => setGuestModeError('')}
            onCancel={() => { if (!guestModeBusy) { setGuestUnlockOpen(false); setGuestModeError('') } }}
            onSubmit={unlockGuestMode}
          />
        )}
      </div>
    )
  }

  // ── Shared card props ─────────────────────────────────────────────────────
  const cardProps = {
    cartQtyMap, lang,
    onAdd:        handleAdd,
    onIncrement:  handleIncrement,
    onDecrement:  handleDecrement,
    onOpenDetail: openDetail,
  }

  function renderSearchControl(className = '') {
    return (
      <AnimatedSearch
        value={search}
        onChange={setSearch}
        placeholder={lang === 'uz' ? 'Menyu qidirish...' : lang === 'ru' ? 'Поиск по меню...' : 'Search menu...'}
        searchLabel={lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search'}
        clearLabel={lang === 'uz' ? 'Qidiruvni tozalash' : lang === 'ru' ? 'Очистить поиск' : 'Clear search'}
        alwaysOpen
        panelClassName="!h-11 lux-input !rounded-full !ring-0"
        className={className}
      />
    )
  }

  function renderCartButton(className = '') {
    const cartButtonLabel = cartCount > 0
      ? hasSubmittedItems
        ? (lang === 'uz'
          ? `${cartCount} yangi · ${submittedItemCount} buyurtmada`
          : lang === 'ru'
            ? `${cartCount} новых · ${submittedItemCount} в заказе`
            : `${cartCount} new · ${submittedItemCount} ordered`)
        : `${cartCount} ${lang === 'uz' ? 'ta' : lang === 'ru' ? 'поз.' : 'items'} · ${formatCurrency(cartSummary.total)}`
      : hasSubmittedItems
        ? (lang === 'uz'
          ? `${submittedItemCount} buyurtmada`
          : lang === 'ru'
            ? `${submittedItemCount} в заказе`
            : `${submittedItemCount} ordered`)
        : (lang === 'uz' ? "Savat bo'sh" : lang === 'ru' ? 'Корзина пуста' : 'Cart is empty')

    return (
      <button
        ref={cartButtonRef}
        onClick={openCart}
        className={`relative min-w-0 max-w-[min(260px,38vw)] flex-shrink rounded-full font-semibold transition-all active:scale-[0.98] ${
          cartCount > 0 || hasSubmittedItems ? 'lux-primary' : 'lux-chip lux-chip-static'
        } ${cartPulse ? 'scale-[1.04] ring-4 ring-[#E2AB64]/40' : ''} ${className}`}
        title={cartButtonLabel}
      >
        <span className="flex h-10 min-w-0 items-center gap-2 px-3 sm:h-11 sm:px-4">
          <ShoppingCart size={17} className="flex-shrink-0" />
          <span className="hidden min-w-0 truncate whitespace-nowrap text-[13px] sm:inline">
            {cartButtonLabel}
          </span>
        </span>
        {(cartCount > 0 || hasSubmittedItems) && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#1F1A15] px-1 text-[10px] font-semibold text-[#FFF8EE] ring-2 ring-[#E2AB64] sm:hidden">
            {cartCount || submittedItemCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex overflow-hidden bg-[#FAF7F0]" style={{ height: '100dvh' }}>

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      {shouldShowSidebar && !detailItem && (
      <div className="hidden lg:block flex-shrink-0 h-full">
        <UnifiedSidebar navigationDisabled={orderLocked} />
      </div>
      )}

      {/* ── Mobile sidebar overlay ───────────────────────────────────────── */}
      {shouldShowSidebar && !detailItem && (
        <MobileDrawer open={sidebarOpen} onClose={() => { if (!orderLocked) setSidebarOpen(false) }}>
          <UnifiedSidebar navigationDisabled={orderLocked} onClose={() => setSidebarOpen(false)} />
        </MobileDrawer>
      )}

      {/* ── Center column ───────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {detailItem ? (
          <ProductDetailPage
            item={detailItem}
            category={categoryMap[detailItem.category_id]}
            currentQty={getMenuItemOptionGroups(detailItem, lang, { audience: menuAudience }).length > 0 ? 0 : (cartQtyMap[detailItem.id] || 0)}
            currentNotes={cartNotesMap[detailItem.id] || ''}
            lang={lang}
            audience={menuAudience}
            languageControl={isGuestTabletMode ? (
              <GuestModeUtilities
                lang={lang}
                staffLang={staffLang}
                onLanguageChange={changeGuestLanguage}
                onStaffAccess={() => { setGuestModeError(''); setGuestUnlockOpen(true) }}
                compact
              />
            ) : null}
            onBack={closeDetail}
            onCancel={closeDetail}
            onAddToCart={handleProductDetailAdd}
            variant="lux"
          />
        ) : (
          <>

        {/* Public-menu style search */}
        <div className="zk-lux flex-shrink-0 px-3 pt-2 pb-0 sm:px-4 sm:pt-4">
          <div className="lux-glass relative rounded-[24px] p-2.5 sm:rounded-[28px] sm:p-3.5">
            {isGuestTabletMode ? (
              <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
                <div className="flex min-w-0 items-center gap-3 xl:contents">
                  <div className="min-w-0 flex-1 xl:flex-[1_0_max-content] xl:max-w-full">
                    <p className="hidden sm:block truncate text-[10px] font-black uppercase tracking-wide text-[#9CA3AF]">{orderContextLabel}</p>
                    <h1 className="min-w-0 whitespace-normal break-words text-sm font-black leading-tight text-[#1F2937] sm:text-base">
                    <span className="shrink-0">{orderTitle}</span>
                    {waiterName && (
                      <span className="ml-2 text-xs font-semibold text-[#374151]" title={`${waiterLabel}: ${waiterName}`} aria-label={`${waiterLabel}: ${waiterName}`}>
                        <span aria-hidden="true">· </span><span className="font-normal text-[#6B7280]">{waiterLabel}: </span>{waiterName}
                      </span>
                    )}
                  </h1>
                  </div>
                  <div className="ml-auto xl:hidden">
                    <GuestModeUtilities
                      lang={lang}
                      staffLang={staffLang}
                      onLanguageChange={changeGuestLanguage}
                      onStaffAccess={() => { setGuestModeError(''); setGuestUnlockOpen(true) }}
                    />
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-3 xl:contents">
                  {renderSearchControl('!order-none min-w-0 flex-1 xl:!basis-48 xl:!min-w-48 xl:ml-auto')}
                  {renderCartButton('ml-auto xl:ml-0')}
                  <div className="hidden xl:block">
                    <GuestModeUtilities
                      lang={lang}
                      staffLang={staffLang}
                      onLanguageChange={changeGuestLanguage}
                      onStaffAccess={() => { setGuestModeError(''); setGuestUnlockOpen(true) }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5 sm:gap-x-2.5">
                {shouldShowSidebar && (
                  <button
                    onClick={() => { if (!orderLocked) setSidebarOpen(true) }}
                    disabled={orderLocked}
                    aria-label={lang === 'uz' ? 'Menyu' : lang === 'ru' ? 'Меню' : 'Menu'}
                    className="lux-chip lux-chip-static flex h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 items-center justify-center rounded-full disabled:cursor-wait disabled:opacity-50 lg:hidden"
                  >
                    <MenuIcon size={19} />
                  </button>
                )}
                <button
                  onClick={() => { if (!orderLocked) navigate('/waiter/tables') }}
                  disabled={orderLocked}
                  className="lux-chip lux-chip-static flex h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 items-center justify-center rounded-full"
                  title={lang === 'uz' ? 'Stollar' : lang === 'ru' ? 'Столы' : 'Tables'}
                  aria-label={lang === 'uz' ? 'Stollar' : lang === 'ru' ? 'Столы' : 'Tables'}
                >
                  <ArrowLeft size={17} />
                </button>
                {/* Table name in the serif display face, waiter underneath; truncates instead of wrapping. */}
                <div className="min-w-0 flex-1 pl-0.5">
                  <p className="lux-gold truncate text-[10px] font-medium uppercase tracking-[0.24em]">{orderContextLabel}</p>
                  <h1 className="zk-serif lux-title mt-0.5 truncate text-[20px] font-semibold leading-none sm:text-[26px]">{orderTitle}</h1>
                  {waiterName && (
                    <p className="lux-muted mt-1 truncate text-[12px]" title={`${waiterLabel}: ${waiterName}`}>
                      {waiterLabel}: <span className="lux-title font-medium">{waiterName}</span>
                    </p>
                  )}
                </div>
                {renderSearchControl('!order-last !basis-full xl:!order-none xl:!basis-56 xl:!min-w-56')}
                {renderCartButton('')}
                <button type="button"
                  aria-label={mobileMenuView === 'compact' ? (lang === 'ru' ? 'Крупные карточки' : lang === 'uz' ? 'Katta kartochkalar' : 'Large cards') : (lang === 'ru' ? 'Компактные карточки' : lang === 'uz' ? 'Ixcham kartochkalar' : 'Compact cards')}
                  onClick={() => {
                    const view = mobileMenuView === 'compact' ? 'grid' : 'compact'
                    setMobileMenuView(view)
                    try { localStorage.setItem('waiter-mobile-grid-view', view) } catch {}
                  }}
                  className="lux-chip lux-chip-static flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full sm:hidden">
                  {mobileMenuView === 'compact' ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
                </button>
                <ThemeToggle lang={lang} variant="lux" className="!h-10 !w-10 sm:!h-11 sm:!w-11" />
                {!shouldShowSidebar && (
                  <div className="flex items-center gap-1.5">
                    {['uz', 'ru', 'en'].map(l => (
                      <button
                        key={l}
                        onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                          lang === l ? 'bg-[#ff5a00] text-white' : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                    <button
                      onClick={handleSignOut}
                      disabled={orderLocked}
                      className="p-2 rounded-xl text-[#6B7280] hover:text-red-500 hover:bg-red-50 transition-colors disabled:cursor-wait disabled:opacity-50"
                      title={lang === 'uz' ? 'Chiqish' : lang === 'ru' ? 'Выйти' : 'Logout'}
                    >
                      <LogOut size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Product area */}
        <div ref={productScrollRef} className="zk-lux flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-0">
          <MenuCategoryScroller
            compactMobile={!isGuestTabletMode}
            categories={allCategoryCards}
            activeCategoryId={activeCategory}
            onCategoryClick={setCategory}
            onActiveCategoryChange={setCategory}
            lang={lang}
            itemCounts={categoryItemCounts}
            sectionPrefix="waiter-menu-category"
            scrollContainerRef={productScrollRef}
            className="pt-1 mb-2 sm:pt-4 sm:mb-4"
            rowClassName="lux-fade-edges -mx-4 px-4 py-1.5"
            variant="lux"
            collapsedSurfaceClass="lux-header lux-bar"
            collapsedContentClassName="lux-fade-edges py-1.5"
            collapsedClassName="-mx-4 px-4 !border-0"
          />
          {pricedFilteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#9CA3AF]">
              <Search size={36} className="mb-3 opacity-20" />
              <p className="text-sm font-semibold">
                {lang === 'uz' ? 'Mahsulot topilmadi' : lang === 'ru' ? 'Ничего не найдено' : 'No items found'}
              </p>
              {search && (
                <button onClick={() => setSearch('')} className="mt-2 text-xs text-[#ff5a00] hover:underline">
                  {lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить' : 'Clear search'}
                </button>
              )}
            </div>
          ) : sections ? (
            // Grouped by category when "All" selected, no search
            <div className="space-y-8 sm:space-y-14">
              {sections.map(({ cat, items }) => (
                <div
                  key={cat.id}
                  id={menuCategorySectionId('waiter-menu-category', cat.id)}
                  className="scroll-mt-20"
                >
                  <ProductSection
                    compactMobileGrid={!isGuestTabletMode && mobileMenuView === 'compact'}
                    audience={menuAudience}
                    cat={cat}
                    items={items}
                    eagerCount={sections[0]?.cat.id === cat.id ? 6 : 0}
                    {...cardProps}
                  />
                </div>
              ))}
            </div>
          ) : (
            // Flat grid for specific category or search results
            <div className={`grid ${!isGuestTabletMode && mobileMenuView === 'compact' ? 'grid-cols-2 gap-2' : 'grid-cols-2 gap-3'} sm:grid-cols-2 min-[700px]:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 sm:gap-4`}>
              {pricedFilteredItems.map((item, index) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  qty={cartQtyMap[item.id] || 0}
                  lang={lang}
                  eager={index < 8}
                  audience={menuAudience}
                  compactMobileGrid={!isGuestTabletMode && mobileMenuView === 'compact'}
                  density="compact"
                  variant="lux"
                  onAdd={handleAdd}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onOpenDetail={openDetail}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom table chips */}
        {!isGuestTabletMode && !isTakeAwayFlow && (
          <BottomTableChips
            currentTableId={tableId}
            disabled={orderLocked}
            onNewOrder={() => { if (!orderLocked) navigate('/waiter/tables') }}
          />
        )}
          </>
        )}
      </div>

      {cartFlyers.map(flyer => (
        <FlyingCartItem key={flyer.id} flyer={flyer} onDone={finishCartFlyer} />
      ))}

      {/* ── Cart drawer ─────────────────────────────────────────────────── */}
      {!detailItem && cartOpen && (
        // Centred glass panel; tapping the blurred backdrop closes it.
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div className="absolute inset-0 backdrop-blur-[6px]" style={{ background: 'rgb(20 15 11 / 38%)' }} onClick={() => closeCart()} />
          <div
            className="zk-lux relative flex h-[min(860px,calc(100dvh-24px))] w-full max-w-[540px] flex-col overflow-hidden rounded-[30px] shadow-[0_30px_80px_rgb(20_15_11/35%)]"
            style={{ viewTransitionName: 'zk-cart', border: '1px solid var(--lux-glass-border)' }}
          >
            {isManageOrderOnly && (
              <button
                type="button"
                onClick={() => closeCart()}
                disabled={orderLocked}
                className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-[#9CA3AF] shadow-sm ring-1 ring-gray-100 transition-colors hover:bg-gray-100 hover:text-[#6B7280] disabled:cursor-wait disabled:opacity-50"
                title={lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close'}
              >
                <X size={16} />
              </button>
            )}
            {!isGuestTabletMode && (
              <div className={`${isManageOrderOnly ? 'flex-1 pt-14' : 'max-h-[48dvh] flex-shrink-0'} overflow-y-auto overscroll-contain`}>
                <OrderActionPanel
                  order={activeOrder}
                  tableId={tableId}
                  lang={lang}
                  dispatch={dispatch}
                  menuItemMap={menuItemMap}
                  canEditOrder={canEditTables && !orderLocked}
                  autoPrintBill={!!state.settings?.autoPrint}
                  onPrintKitchenCheck={orderLocked ? () => {} : handlePrintKitchenCheck}
                  onMovedToCashier={() => completeBillHandoff({
                    navigate,
                    tableId,
                    autoPrint: !!state.settings?.autoPrint,
                  })}
                />
              </div>
            )}
            {!isManageOrderOnly && canEditTables && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <CartPanel
                tableName={orderTitle}
                orderType={orderType}
                onOrderTypeChange={canEditTables ? setOrderType : undefined}
                priceMode={priceMode}
                allowOrderTypeChange={isTakeAwayFlow && !isGuestTabletMode}
                showOrderBadges={isTakeAwayFlow}
                isSending={isSendingOrder}
                onSendingChange={setSendingOrder}
                onSubmitSuccess={handleSubmittedOrderPrint}
                lang={lang}
                guestMode={isGuestTabletMode}
                onGuestFinish={finishGuestSelection}
                reviewWarning={guestReviewWarning}
                reviewKey={guestExpectedOrderIds ? `${guestExpectedOrderIds.join('|')}=>${activeTableOrderIds.join('|')}` : ''}
                hasSubmittedItems={hasSubmittedItems}
                onClose={() => closeCart({ force: true })}
              />
            </div>
            )}
          </div>
        </div>
      )}

      {isGuestTabletMode && guestCartReady && guestModeSession?.finished && (
        <GuestSelectionReady
          lang={lang}
          staffLang={staffLang}
          itemCount={cartCount}
          total={cartSummary.total}
          onLanguageChange={changeGuestLanguage}
          onContinue={continueGuestSelection}
          onStaffAccess={() => { setGuestModeError(''); setGuestUnlockOpen(true) }}
        />
      )}

      {isGuestTabletMode && guestUnlockOpen && (
        <GuestPinDialog
          mode="unlock"
          lang={staffLang}
          pinLength={getGuestModePinLength(guestModeSession)}
          busy={guestModeBusy}
          error={guestModeError?.writeError ? formatWriteError(guestModeError.writeError, staffLang, 'SEND_TO_KITCHEN') : guestModeError}
          lockSeconds={guestModePinLockSeconds(guestModeSession, guestUnlockClock)}
          onInput={() => setGuestModeError('')}
          onCancel={() => { if (!guestModeBusy) { setGuestUnlockOpen(false); setGuestModeError('') } }}
          onSubmit={unlockGuestMode}
        />
      )}

    </div>
  )
}
