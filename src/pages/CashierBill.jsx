import { getEmptyCashierOrders } from '../lib/cashierBills'
import { formatWriteError } from '../lib/writeErrorMessage'
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Printer, CheckCircle2, Banknote,
  Receipt, Users, Clock, Tag, UtensilsCrossed,
  Monitor, Plus, Minus, Trash2, ClipboardPaste, X, Loader2,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useOrderDeletionDate } from '../store/useOrderDeletionDate'
import { useAuth } from '../contexts/AuthContext'
import { getItemName, t, tf } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { gramsLabel, kcalLabel, millilitresLabel, servesLabel } from '../lib/nutrition'
import {
  getGroupedOrderItems,
  getOrderItemLineTotal,
  getPaymentMethodSummary,
  getOrderPaymentSummary,
  getSplitPaymentValidation,
  validateLoyaltyRedeemAmount,
  getMaxLoyaltyRedeemAmount,
  clampMoneyInput,
  getMaxPaymentAmount,
  isCancelledOrderItem,
  calculateLoyaltyCashback,
  normalizeSplitPayments,
} from '../lib/analytics'
import { supabase } from '../lib/supabase'
import { getLoyaltyCardCashbackPercent, getLoyaltyCardCashbackType } from '../lib/loyalty'
import SalaryOrderPayment from '../components/SalaryOrderPayment'
import CashierLoyaltyNameSearch from '../components/CashierLoyaltyNameSearch'
import UnifiedSidebar from '../components/UnifiedSidebar'
import MobileDrawer from '../components/MobileDrawer'
import WorkspaceTopBar from '../components/WorkspaceTopBar'
import StatusBadge from '../components/StatusBadge'
import WorkspaceDialog from '../components/WorkspaceDialog'
import { Shimmer } from '../components/PageShimmer'
import { getQuickItemSortOrder, isActiveMenuItem, isCashierQuickItem } from '../lib/menuItems'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useAppDataStatus, useCashierAttentionCount } from '../store/appHooks'
import { inferOrderType, isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes'
import { canDeleteOrderToday, canDeletePaidOrders, canEditFeature } from '../lib/permissions'
import { getOrderItemUnitPrice, getPriceModeLabel, normalizePriceMode } from '../lib/priceModes'
import { getManualOrderNotes, getOrderItemOptionLines } from '../components/MenuProductCards'
import { formatElapsedSince } from '../lib/dateFormat'
import { formatMenuQuantity, isMenuItemSoldByWeight } from '../lib/menuSaleUnits'
import { getConfiguredServiceRatePct } from '../lib/serviceRates'
import { applyLoyaltyToCashierPaymentQuote, canConfirmCashierCheckout, getFreshCashierPaymentQuote } from '../lib/cashierCheckout'
import { loadCashierBillOrders } from '../lib/db'
import { withReadTimeout } from '../lib/writeTimeout'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { getBillReceiptPath } from '../lib/billHandoff'
import { RollingText } from '../components/RollingNumber'

// ── Constants ──────────────────────────────────────────────────────────────────
const PAY_METHODS = [
  { key: 'cash',     icon: Banknote,  labelUz: 'Naqd',    labelRu: 'Наличные',  labelEn: 'Cash'     },
  { key: 'terminal', icon: Monitor,   labelUz: 'Terminal', labelRu: 'Терминал',  labelEn: 'Terminal' },
]

function payLabel(m, lang) {
  return lang === 'uz' ? m.labelUz : lang === 'ru' ? m.labelRu : m.labelEn
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function elapsedSince(iso, lang) {
  return formatElapsedSince(iso, {
    lessThanMinute: () => t(lang, 'justNow'),
    minutes: minutes => tf(lang, 'minutesAgo', minutes),
    hoursMinutes: (hours, minutes) => tf(lang, 'hoursMinutesAgo', hours, minutes),
  })
}

function getDesc(menuItem, lang) {
  if (!menuItem) return ''
  return menuItem[`description_${lang}`] || menuItem.description_en || menuItem.description_uz || ''
}

function getCashierItemName(item, menuItem, lang) {
  return menuItem ? getItemName(menuItem, lang) : item.name
}

function cashierRefreshErrorMessage(error, lang) {
  if (error?.code === 'POS_READ_TIMEOUT') {
    return lang === 'uz' ? 'Hisobni tekshirish juda uzoq davom etdi. Ulanishni tekshirib, qayta urinib ko‘ring.' :
      lang === 'ru' ? 'Проверка счёта заняла слишком много времени. Проверьте соединение и попробуйте снова.' :
        'Checking the bill took too long. Check the connection and try again.'
  }
  return (
    lang === 'uz' ? 'Hisobni yangilab bo‘lmadi. Ulanishni tekshiring va qayta urinib ko‘ring.' :
      lang === 'ru' ? 'Не удалось обновить счёт. Проверьте соединение и попробуйте снова.' :
        'Could not refresh the bill. Check the connection and try again.'
  )
}

function hasPendingSalarySettlement(target) {
  try { return !!sessionStorage.getItem(`salary-order:${target}`) } catch { return false }
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function CashierBill() {
  const { tableId, orderId }  = useParams()
  const navigate     = useNavigate()
  const location     = useLocation()
  const { state, dispatch } = useApp()
  const cashierAttention = useCashierAttentionCount()
  const { profile } = useAuth()
  const { loaded, loadError, retry: retryPOSLoad } = useAppDataStatus()
  const lang = state.lang
  const deletionDate = useOrderDeletionDate()
  const canDeleteOrder = candidate => canDeleteOrderToday(profile || { role: state.user?.role }, candidate, deletionDate)
  const canEditCashier = canEditFeature(profile || { role: state.user?.role }, 'cashier')

  const [salaryCheckoutActive, setSalaryCheckoutActive] = useState(false)
  const salaryBill = useRef(null)
  const [payMethod,  setPayMethod]  = useState('cash')
  const [splitPayments, setSplitPayments] = useState([{ id: 'payment-1', method: 'cash', amount: '' }])
  const [activePaymentId, setActivePaymentId] = useState('payment-1')
  const loyaltyLookupRequest = useRef(0)
  useEffect(() => () => { loyaltyLookupRequest.current += 1 }, [])
  const [loyaltyCardNumber, setLoyaltyCardNumber] = useState('')
  const [loyaltyCard, setLoyaltyCard] = useState(null)
  const [loyaltyRedeemAmount, setLoyaltyRedeemAmount] = useState('')
  const [loyaltyLookupMessage, setLoyaltyLookupMessage] = useState('')
  const [isCheckingLoyalty, setCheckingLoyalty] = useState(false)
  const [isProcessingPayment, setProcessingPayment] = useState(false)
  const [isPrintingBill, setPrintingBill] = useState(false)
  const [printRequest, setPrintRequest] = useState(null)
  const [isRefreshingBill, setRefreshingBill] = useState(true)
  const [paymentRefreshMessage, setPaymentRefreshMessage] = useState('')
  const [isDeletingOrder, setDeletingOrder] = useState(false)
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState(false)
  const [deleteOrderError, setDeleteOrderError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  // Merge all active orders for a table, or load one take-away order by id.
  const currentOrder = useMemo(() => {
    const orders = state.orders.filter(o =>
      (orderId ? o.id === orderId : o.table_id === tableId) && o.payment_status !== 'paid'
    )
    if (orders.length === 0) return null
    const allItems = orders.flatMap(o => (o.items || []).map(item => {
      const menuItem = menuItemMap[item.menu_item_id]
      const isCounter = isCashierQuickItem(menuItem) || item.is_counter_item || item.isCounterItem
      return isCounter
        ? { ...item, item_type: item.item_type || item.itemType || 'counter', is_counter_item: true }
        : item
    }))
    const billableItems = allItems.filter(item => !isCancelledOrderItem(item))
    const mergedItems = getGroupedOrderItems(billableItems)
    const cashierQuote = getFreshCashierPaymentQuote({
      orders,
      menuItems: state.menuItems,
      settings: state.settings,
      tableId,
      orderId,
    })
    const primaryOrder = orders.find(candidate => candidate.id === cashierQuote.primaryOrderId)
    if (!primaryOrder) return null
    const orderType = inferOrderType(primaryOrder)
    const fallbackServiceRatePct = getConfiguredServiceRatePct(state.settings, primaryOrder.price_mode)
    const serviceRatePct = cashierQuote.serviceRatePct ?? (
      isOffPremiseOrderType(orderType) ? 0 : fallbackServiceRatePct
    )
    return {
      ...primaryOrder,
      order_type: orderType,
      price_mode: cashierQuote.priceMode || normalizePriceMode(primaryOrder.price_mode),
      items:       mergedItems,
      subtotal:    cashierQuote.subtotal,
      service_fee: cashierQuote.serviceFee,
      service_rate_pct: serviceRatePct,
      total:       cashierQuote.grossAmount,
      cashier_quote: { ...cashierQuote, serviceRatePct },
    }
  }, [state.orders, state.settings, tableId, orderId, menuItemMap])

  const order = currentOrder || (salaryCheckoutActive ? salaryBill.current : null)

  const emptyOrders = getEmptyCashierOrders(state.orders, { tableId, orderId })

  const table = state.tables.find(t => t.id === tableId)
  const orderType = inferOrderType(order)
  const orderPriceMode = normalizePriceMode(order?.price_mode)
  const configuredServiceRatePct = getConfiguredServiceRatePct(state.settings, orderPriceMode)
  const isOffPremise = isOffPremiseOrderType(orderType)
  const orderLabel = isOffPremise
    ? `${orderTypeLabel(orderType, lang)} · ${order?.order_number || order?.id || ''}`
    : table?.name

  const quickItems = useMemo(() =>
    state.menuItems
      .filter(isActiveMenuItem)
      .filter(isCashierQuickItem)
      .sort((a, b) => getQuickItemSortOrder(a) - getQuickItemSortOrder(b))
      .slice(0, 8),
    [state.menuItems]
  )

  // ── Totals ─────────────────────────────────────────────────────────────────
  const requestedLoyaltyUsed = Math.max(0, Math.round(Number(loyaltyRedeemAmount) || 0))
  const basePayment = order
    ? applyLoyaltyToCashierPaymentQuote(order.cashier_quote, 0)
    : getOrderPaymentSummary({ service_rate_pct: configuredServiceRatePct }, [], configuredServiceRatePct)
  const loyaltyValidation = validateLoyaltyRedeemAmount(
    requestedLoyaltyUsed,
    loyaltyCard?.balance || 0,
    basePayment.grossAmount
  )
  const effectiveLoyaltyUsed = loyaltyValidation.ok ? loyaltyValidation.amount : requestedLoyaltyUsed
  const payment       = order
    ? applyLoyaltyToCashierPaymentQuote(order.cashier_quote, effectiveLoyaltyUsed)
    : getOrderPaymentSummary({ service_rate_pct: configuredServiceRatePct }, [], configuredServiceRatePct)
  const subtotal      = payment.subtotal
  const counterItemsSubtotal = payment.counterItemsSubtotal
  const loyaltyAmt    = payment.loyaltyUsedAmount
  const loyaltyCashbackPercent = loyaltyCard
    ? getLoyaltyCardCashbackPercent(loyaltyCard)
    : 0
  const cashbackToBeEarned = order
    ? calculateLoyaltyCashback(
        { ...order, loyalty_used_amount: loyaltyAmt, status: 'paid', payment_status: 'paid' },
        order.items,
        loyaltyCashbackPercent
      )
    : 0
  const serviceFee    = payment.serviceFee
  const serviceRatePct = payment.serviceRatePct
  const total         = payment.total
  const maxLoyaltyRedeemAmount = getMaxLoyaltyRedeemAmount(loyaltyCard?.balance || 0, basePayment.grossAmount)

  const enteredPayments = splitPayments.map(row => ({
    method: row.method,
    amount: Number(row.amount) || 0,
  }))
  const paymentValidation = getSplitPaymentValidation(enteredPayments, total)
  const paidAmount = paymentValidation.paidAmount
  const appliedPayments = normalizeSplitPayments(enteredPayments, total)
  const finalPaymentMethod = getPaymentMethodSummary(appliedPayments, payMethod)
  const shortfall = paymentValidation.remainingAmount
  const overpaidAmount = paymentValidation.overpaidAmount
  const hasLoyaltyCardEntry = String(loyaltyCardNumber || '').trim().length > 0
  const loyaltyReady = loyaltyAmt <= 0
    ? (!hasLoyaltyCardEntry || !!loyaltyCard)
    : (loyaltyCard && loyaltyValidation.ok)
  const canProcess = canConfirmCashierCheckout({
    canEditCashier,
    paymentValidation,
    loyaltyReady,
    grossAmount: basePayment.grossAmount,
    loyaltyUsedAmount: loyaltyAmt,
    isProcessingPayment,
    isRefreshingBill,
  })
  const checkoutBlockReason = !canEditCashier
    ? 'access'
    : !loyaltyReady
      ? 'loyalty'
      : isRefreshingBill
        ? 'refresh'
        : null
  const isOverpaid = paymentValidation.isOverpaid
  const isFullyPaid = paymentValidation.isFullyPaid || (
    basePayment.grossAmount > 0 && loyaltyAmt >= basePayment.grossAmount && total === 0
  )

  const refreshCurrentBill = useCallback(async () => {
    const freshOrders = await withReadTimeout(
      signal => loadCashierBillOrders({ tableId, orderId, signal }),
      'REFRESH_CASHIER_BILL'
    )
    const syncResult = await dispatch({
      type: 'SYNC_CASHIER_BILL_ORDERS',
      payload: { tableId, orderId, orders: freshOrders },
    })
    if (syncResult?.error) throw syncResult.error
    return freshOrders
  }, [dispatch, tableId, orderId])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('print') !== '1') return
    setPrintRequest({
      path: getBillReceiptPath({ tableId, orderId }),
      key: Date.now(),
    })
    params.delete('print')
    const search = params.toString()
    navigate(`${location.pathname}${search ? `?${search}` : ''}`, { replace: true })
  }, [location.pathname, location.search, navigate, orderId, tableId])

  useEffect(() => {
    let active = true

    async function refreshBill() {
      setRefreshingBill(true)
      setPaymentRefreshMessage('')
      try {
        await refreshCurrentBill()
      } catch (error) {
        if (active) setPaymentRefreshMessage({ error })
      } finally {
        if (active) setRefreshingBill(false)
      }
    }

    refreshBill()

    function handlePageShow(event) {
      if (event.persisted) refreshBill()
    }

    window.addEventListener('pageshow', handlePageShow)
    return () => {
      active = false
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [refreshCurrentBill])

  useEffect(() => {
    setSplitPayments(prev => {
      let remaining = getMaxPaymentAmount(total)
      let changed = false
      const next = prev.map(row => {
        if (row.amount === '') return row
        const amount = clampMoneyInput(row.amount, remaining)
        remaining = getMaxPaymentAmount(remaining - amount)
        const nextAmount = amount > 0 ? String(amount) : ''
        if (nextAmount !== row.amount) changed = true
        return { ...row, amount: nextAmount }
      })
      return changed ? next : prev
    })
  }, [total])

  function applyExactAmount() {
    const remainingForActive = getMaxForPaymentRow(activePaymentId)
    updateActivePaymentAmount(remainingForActive)
  }

  function getMaxForPaymentRow(id) {
    const otherPaid = splitPayments.reduce((sum, row) => (
      row.id === id ? sum : sum + (Number(row.amount) || 0)
    ), 0)
    return getMaxPaymentAmount(total - otherPaid)
  }

  function updatePayment(id, patch) {
    setSplitPayments(prev => {
      const otherPaid = prev.reduce((sum, row) => (
        row.id === id ? sum : sum + (Number(row.amount) || 0)
      ), 0)
      const maxForRow = getMaxPaymentAmount(total - otherPaid)
      return prev.map(row => {
        if (row.id !== id) return row
        if (!Object.prototype.hasOwnProperty.call(patch, 'amount')) return { ...row, ...patch }
        const amount = clampMoneyInput(patch.amount, maxForRow)
        return { ...row, ...patch, amount: patch.amount === '' ? '' : String(amount) }
      })
    })
  }

  function updateActivePaymentAmount(amount) {
    updatePayment(activePaymentId, { amount: String(amount) })
  }

  function fillRemaining(id = activePaymentId) {
    updatePayment(id, { amount: String(getMaxForPaymentRow(id)) })
  }

  function addPaymentRow() {
    const id = `payment-${Date.now()}`
    setSplitPayments(prev => [...prev, { id, method: 'cash', amount: '' }])
    setActivePaymentId(id)
  }

  function removePaymentRow(id) {
    setSplitPayments(prev => {
      const next = prev.filter(row => row.id !== id)
      if (next.length === 0) return [{ id: 'payment-1', method: 'cash', amount: '' }]
      return next
    })
    if (activePaymentId === id) {
      const nextRow = splitPayments.find(row => row.id !== id)
      if (nextRow) {
        setActivePaymentId(nextRow.id)
        setPayMethod(nextRow.method)
      }
    }
  }

  function selectPaymentMethod(method) {
    setPayMethod(method)
    updatePayment(activePaymentId, { method })
  }

  async function checkLoyaltyCard(cardNumberOverride) {
    const requestId = ++loyaltyLookupRequest.current
    const cardNumber = String(cardNumberOverride ?? loyaltyCardNumber ?? '').trim()
    setLoyaltyCard(null)
    setLoyaltyLookupMessage('')
    setCheckingLoyalty(false)
    if (!/^\d{8}$/.test(cardNumber)) {
      setLoyaltyLookupMessage('loyaltyInvalid')
      return
    }

    setCheckingLoyalty(true)
    try {
      const { data, error } = await supabase
        .from('loyalty_cards')
        .select('*')
        .eq('card_number', cardNumber)
        .maybeSingle()
      if (requestId !== loyaltyLookupRequest.current) return
      if (error) throw error
      if (!data || data.is_active === false) {
        setLoyaltyLookupMessage('loyaltyNotFound')
        return
      }
      const balance = Math.max(0, Math.round(Number(data.balance ?? data.balance_amount ?? 0) || 0))
      setLoyaltyCard({ ...data, balance })
      setLoyaltyLookupMessage('loyaltyFound')
    } catch (error) {
      if (requestId !== loyaltyLookupRequest.current) return
      console.error('[cashier] loyalty card lookup failed', error)
      setLoyaltyLookupMessage('loyaltyLookupFailed')
    } finally {
      if (requestId === loyaltyLookupRequest.current) setCheckingLoyalty(false)
    }
  }

  async function pasteLoyaltyCardNumber() {
    try {
      const clipboardText = await navigator.clipboard.readText()
      const cardNumber = String(clipboardText || '').replace(/\D/g, '').slice(0, 8)
      if (!cardNumber) {
        setLoyaltyLookupMessage('clipboardNoCardNumber')
        return
      }
      setLoyaltyCardNumber(cardNumber)
      setLoyaltyCard(null)
      setLoyaltyRedeemAmount('')
      setLoyaltyLookupMessage('')
      await checkLoyaltyCard(cardNumber)
    } catch {
      setLoyaltyLookupMessage('clipboardUnavailable')
    }
  }

  function updateLoyaltyRedeem(value) {
    if (value === '') {
      setLoyaltyRedeemAmount('')
      return
    }
    const amount = clampMoneyInput(value, maxLoyaltyRedeemAmount)
    setLoyaltyRedeemAmount(amount > 0 ? String(amount) : '')
    if (amount > 0) setLoyaltyLookupMessage('')
  }

  function fillMaxLoyaltyRedeem() {
    if (maxLoyaltyRedeemAmount <= 0) {
      setLoyaltyRedeemAmount('')
      setLoyaltyLookupMessage('noLoyaltyBalance')
      return
    }
    setLoyaltyRedeemAmount(String(clampMoneyInput(maxLoyaltyRedeemAmount, maxLoyaltyRedeemAmount)))
    setLoyaltyLookupMessage('')
  }

  function clearLoyaltyEntry() {
    loyaltyLookupRequest.current += 1
    setCheckingLoyalty(false)
    setLoyaltyCardNumber('')
    setLoyaltyCard(null)
    setLoyaltyRedeemAmount('')
    setLoyaltyLookupMessage('')
  }

  async function handlePaid() {
    if (!canProcess) return
    setProcessingPayment(true)
    setPaymentRefreshMessage('')
    try {
      const freshOrders = await refreshCurrentBill()
      const freshQuote = getFreshCashierPaymentQuote({
        orders: freshOrders,
        menuItems: state.menuItems,
        settings: state.settings,
        tableId,
        orderId,
        loyaltyUsedAmount: loyaltyAmt,
      })
      if (freshQuote.orderIds.length === 0) {
        setPaymentRefreshMessage({ code: 'orderClosed' })
        return
      }
      if (freshQuote.total !== total) {
        if (splitPayments.length === 1 && paymentValidation.canConfirmPayment) {
          setSplitPayments(prev => prev.map(row => ({ ...row, amount: freshQuote.total > 0 ? String(freshQuote.total) : '' })))
        }
        setPaymentRefreshMessage({ code: 'billRefreshed', total: freshQuote.total })
        return
      }
      const result = await dispatch({
        type: 'MARK_ORDER_PAID',
        payload: {
          tableId,
          orderId,
          payment_method: finalPaymentMethod,
          payments: appliedPayments,
          loyalty: {
            loyalty_card_number: loyaltyCard?.card_number || null,
            loyalty_used_amount: loyaltyAmt,
            loyalty_redeem_amount: loyaltyAmt,
            cashback_earned: cashbackToBeEarned,
            cashback_percent: loyaltyCashbackPercent,
            cashback_type: loyaltyCard ? getLoyaltyCardCashbackType(loyaltyCard) : null,
            discounted_subtotal: total,
            service_fee:             serviceFee,
            service_rate_pct:         serviceRatePct,
            total,
          },
        },
      })
      if (result?.error) return
      navigate('/cashier/tables')
    } catch (error) {
      setPaymentRefreshMessage({ error })
    } finally {
      setProcessingPayment(false)
    }
  }

  async function handlePrintBill() {
    if (isPrintingBill || isRefreshingBill) return
    setPrintingBill(true)
    setPaymentRefreshMessage('')
    try {
      const freshOrders = await refreshCurrentBill()
      const freshQuote = getFreshCashierPaymentQuote({
        orders: freshOrders,
        menuItems: state.menuItems,
        settings: state.settings,
        tableId,
        orderId,
      })
      if (!freshQuote.primaryOrderId) {
        setPaymentRefreshMessage({ code: 'noOrder' })
        return
      }
      setPrintRequest({
        path: getBillReceiptPath({ tableId, orderId }),
        key: Date.now(),
      })
    } catch (error) {
      setPaymentRefreshMessage({ error })
    } finally {
      setPrintingBill(false)
    }
  }

  async function handleDeleteOrder(candidate = order) {
    if (!canDeleteOrderToday(profile || { role: state.user?.role }, candidate) || !candidate?.id || isDeletingOrder) return
    setDeletingOrder(true)
    setDeleteOrderError(null)
    try {
      if (!order) {
        const freshOrders = await refreshCurrentBill()
        if (!getEmptyCashierOrders(freshOrders, { tableId, orderId }).some(row => row.id === candidate.id)) return
      }
      const result = await dispatch({
        type: 'DELETE_ORDER',
        payload: { orderId: candidate.id },
      })
      if (result?.cancelled) return
      if (result?.error) {
        setDeleteOrderError(result.error)
        return
      }
      navigate('/cashier/tables')
    } catch (error) {
      setDeleteOrderError(error)
    } finally {
      setDeletingOrder(false)
    }
  }

  function addQuickItem(item) {
    if (!canEditCashier) return
    dispatch({
      type: 'ADD_QUICK_ITEM_TO_ORDER',
      payload: {
        tableId,
        orderId,
        item: {
          id: item.id,
          name: getItemName(item, lang),
          price: item.price,
          sendToKitchen: !!(item.sendToKitchen || item.send_to_kitchen),
          item_type: 'counter',
          is_counter_item: true,
        },
      },
    })
  }

  function updateBillItemQty(item, qty) {
    if (!canEditCashier) return
    const sourceItemIds = item.source_item_ids || item.sourceItemIds || []
    dispatch({
      type: 'UPDATE_BILL_ITEM_QTY',
      payload: {
        tableId,
        orderId,
        orderItemId: item.id,
        sourceItemIds,
        menuItemId: item.menu_item_id,
        qty,
        sale_unit: item.sale_unit || menuItemMap?.[item.menu_item_id]?.sale_unit || 'piece',
      },
    })
  }

  // ── Localized strings ───────────────────────────────────────────────────────
  const lbl = {
    backTables:   lang === 'uz' ? 'Storlarga qaytish' : lang === 'ru' ? 'Назад к столам' : 'Back to tables',
    waiter:       lang === 'uz' ? 'Ofitsiant' : lang === 'ru' ? 'Официант' : 'Waiter',
    opened:       lang === 'uz' ? 'Ochildi' : lang === 'ru' ? 'Открыт' : 'Opened',
    openedBy:     lang === 'uz' ? 'Ochgan' : lang === 'ru' ? 'Открыл' : 'Opened by',
    orderItems:   lang === 'uz' ? 'Buyurtma elementlari' : lang === 'ru' ? 'Позиции заказа' : 'Order items',
    item:         lang === 'uz' ? 'Mahsulot' : lang === 'ru' ? 'Блюдо' : 'Item',
    qty:          lang === 'uz' ? 'Miqdor' : lang === 'ru' ? 'Кол-во' : 'Qty',
    unitPrice:    lang === 'uz' ? 'Narxi' : lang === 'ru' ? 'Цена' : 'Unit price',
    total:        lang === 'uz' ? 'Jami' : lang === 'ru' ? 'Итого' : 'Total',
    paySummary:   lang === 'uz' ? "To'lov xulosasi" : lang === 'ru' ? 'Итоговый счёт' : 'Payment summary',
    subtotal:     lang === 'uz' ? 'Buyurtma summasi' : lang === 'ru' ? 'Сумма заказа' : 'Subtotal',
    service:      lang === 'uz' ? `Xizmat (${serviceRatePct}%)` : lang === 'ru' ? `Обслуживание (${serviceRatePct}%)` : `Service (${serviceRatePct}%)`,
    loyalty:      lang === 'uz' ? 'Sodiqlik ishlatildi' : lang === 'ru' ? 'Использовано с карты' : 'Loyalty used',
    totalAmt:     lang === 'uz' ? "To'lovga jami" : lang === 'ru' ? 'Итого к оплате' : 'Total amount',
    payMethod:    lang === 'uz' ? "To'lov usuli" : lang === 'ru' ? 'Способ оплаты' : 'Payment method',
    splitPay:     lang === 'uz' ? "Bo'lib to'lash" : lang === 'ru' ? 'Смешанная оплата' : 'Split payment',
    addPayment:   lang === 'uz' ? "To'lov qo'shish" : lang === 'ru' ? 'Добавить оплату' : 'Add payment',
    fillRest:     lang === 'uz' ? 'Qoldiqni to‘ldirish' : lang === 'ru' ? 'Заполнить остаток' : 'Fill remaining',
    paid:         lang === 'uz' ? "To'langan" : lang === 'ru' ? 'Оплачено' : 'Paid',
    receivedAmt:  lang === 'uz' ? 'Qabul qilingan summa' : lang === 'ru' ? 'Полученная сумма' : 'Enter received amount',
    fullyPaid:    lang === 'uz' ? "To'liq to'landi" : lang === 'ru' ? 'Оплачено полностью' : 'Fully paid',
    remaining:    lang === 'uz' ? 'Yetishmaydi' : lang === 'ru' ? 'Не хватает' : 'Remaining',
    quickAmt:     lang === 'uz' ? 'Tez summa' : lang === 'ru' ? 'Быстрая сумма' : 'Quick amount',
    exact:        lang === 'uz' ? 'Aniq' : lang === 'ru' ? 'Точно' : 'Exact',
    confirmPay:   lang === 'uz' ? "To'lovni tasdiqlash" : lang === 'ru' ? 'Подтвердить оплату' : 'Confirm payment',
    processingPay: lang === 'uz' ? "To'lov saqlanmoqda" : lang === 'ru' ? 'Сохранение оплаты' : 'Saving payment',
    refreshingBill: lang === 'uz' ? 'Hisob tekshirilmoqda' : lang === 'ru' ? 'Проверка счёта' : 'Checking bill',
    cashierAccessRequired: lang === 'uz' ? 'To‘lovni yakunlash uchun Kassa tahrirlash ruxsati kerak.' : lang === 'ru' ? 'Для завершения оплаты нужен доступ на изменение кассы.' : 'Cashier write access is required to complete payment.',
    resolveLoyaltyBeforePayment: lang === 'uz' ? 'Sodiqlik kartasini tekshiring yoki karta raqamini tozalang.' : lang === 'ru' ? 'Проверьте карту лояльности или очистите номер карты.' : 'Check the loyalty card or clear its number.',
    clearLoyalty: lang === 'uz' ? 'Kartani tozalash' : lang === 'ru' ? 'Очистить карту' : 'Clear card',
    printBill:    lang === 'uz' ? 'Hisob chiqarish' : lang === 'ru' ? 'Распечатать счёт' : 'Print bill',
    printReceipt: lang === 'uz' ? 'Chek chiqarish' : lang === 'ru' ? 'Распечатать чек' : 'Print receipt',
    printingBill: lang === 'uz' ? 'Hisob tayyorlanmoqda…' : lang === 'ru' ? 'Подготовка счёта…' : 'Preparing bill…',
    deleteOrder:  lang === 'uz' ? 'Buyurtmani o‘chirish' : lang === 'ru' ? 'Удалить заказ' : 'Delete order',
    confirmDeleteOrder: lang === 'uz' ? 'O‘chirishni tasdiqlash' : lang === 'ru' ? 'Подтвердить удаление' : 'Confirm delete',
    deletingOrder: lang === 'uz' ? 'O‘chirilmoqda…' : lang === 'ru' ? 'Удаление…' : 'Deleting…',
    cancelDelete: lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel',
    loyaltyLabel: lang === 'uz' ? 'Sodiqlik kartasi' : lang === 'ru' ? 'Карта лояльности' : 'Loyalty card',
    cardOwner: lang === 'uz' ? 'Karta egasi' : lang === 'ru' ? 'Владелец карты' : 'Card owner',
    unnamedCardOwner: lang === 'uz' ? 'Ism ko‘rsatilmagan' : lang === 'ru' ? 'Имя не указано' : 'Name not provided',
    cashbackBalance: lang === 'uz' ? 'Cashback balansi' : lang === 'ru' ? 'Баланс кешбэка' : 'Cashback balance',
    useLoyalty:   lang === 'uz' ? 'Ishlatiladigan sodiqlik summasi' : lang === 'ru' ? 'Сумма лояльности к списанию' : 'Loyalty amount to use',
    cardNumber:   lang === 'uz' ? 'Karta raqami' : lang === 'ru' ? 'Номер карты' : 'Card number',
    paste:        lang === 'uz' ? 'Qo‘yish' : lang === 'ru' ? 'Вставить' : 'Paste',
    clipboardNoCardNumber: lang === 'uz' ? 'Buferda karta raqami yo‘q' : lang === 'ru' ? 'В буфере нет номера карты' : 'No card number found in the clipboard',
    clipboardUnavailable: lang === 'uz' ? 'Buferni o‘qib bo‘lmadi' : lang === 'ru' ? 'Не удалось прочитать буфер обмена' : 'Could not read the clipboard',
    checkCard:    lang === 'uz' ? 'Tekshirish' : lang === 'ru' ? 'Проверить' : 'Check card',
    cashbackToBeEarned: lang === 'uz' ? 'To‘lovdan keyin cashback' : lang === 'ru' ? 'Кешбэк после оплаты' : 'Cashback to be earned',
    cashbackRewardHint: lang === 'uz' ? 'To‘lovdan keyin mukofot' : lang === 'ru' ? 'Награда после оплаты' : 'Reward after payment',
    loyaltyInvalid: lang === 'uz' ? '8 xonali karta raqamini kiriting' : lang === 'ru' ? 'Введите 8-значный номер карты' : 'Enter an 8-digit card number',
    loyaltyNotFound: lang === 'uz' ? 'Faol karta topilmadi' : lang === 'ru' ? 'Активная карта не найдена' : 'Active card not found',
    loyaltyFound: lang === 'uz' ? 'Karta topildi' : lang === 'ru' ? 'Карта найдена' : 'Card found',
    loyaltyLookupFailed: lang === 'uz' ? 'Kartani tekshirib bo‘lmadi' : lang === 'ru' ? 'Не удалось проверить карту' : 'Could not check card',
    loyaltyBalanceExceeded: lang === 'uz' ? 'Summa cashback balansidan oshib ketdi' : lang === 'ru' ? 'Сумма превышает баланс кешбэка' : 'Amount exceeds cashback balance',
    loyaltyBillExceeded: lang === 'uz' ? 'Summa to‘lov qoldig‘idan oshib ketdi' : lang === 'ru' ? 'Сумма превышает остаток счёта' : 'Amount exceeds remaining bill',
    tapBalanceMax: lang === 'uz' ? 'Maksimal summani ishlatish uchun balansni bosing' : lang === 'ru' ? 'Нажмите на баланс, чтобы использовать максимум' : 'Tap balance to use max available',
    noLoyaltyBalance: lang === 'uz' ? 'Ishlatish uchun sodiqlik balansi yo‘q' : lang === 'ru' ? 'Нет баланса лояльности для использования' : 'No loyalty balance available to use',
    noOrder:      lang === 'uz' ? 'Bu stol uchun faol buyurtma yo\'q' : lang === 'ru' ? 'Нет активного заказа для этого стола' : 'No active order for this table',
    noteLabel:    lang === 'uz' ? 'Izoh' : lang === 'ru' ? 'Примечание' : 'Note',
    overpaid:     lang === 'uz' ? 'Ortiqcha to‘lov' : lang === 'ru' ? 'Переплата' : 'Overpayment',
    exceedsTotal: lang === 'uz' ? 'Kiritilgan summa jami to‘lovdan oshib ketdi' : lang === 'ru' ? 'Введённая сумма превышает итоговую сумму' : 'Entered amount exceeds total amount',
    counterItems: lang === 'uz' ? 'Kassa mahsulotlari' : lang === 'ru' ? 'Товары у кассы' : 'Counter items',
    counterItemsSub: lang === 'uz' ? 'Bu hisobga tezkor kassa mahsulotlarini qo‘shing' : lang === 'ru' ? 'Добавьте быстрые товары кассы к этому счёту' : 'Add quick cashier items to this bill',
    noTable:      lang === 'uz' ? 'Stol tanlanmagan' : lang === 'ru' ? 'Стол не выбран' : 'No table selected',
    removePayment: t(lang, 'removePayment'),
    decreaseQty:  lang === 'uz' ? 'Bittaga kamaytirish' : lang === 'ru' ? 'Уменьшить на один' : 'Decrease by one',
    increaseQty:  lang === 'uz' ? 'Bittaga ko‘paytirish' : lang === 'ru' ? 'Увеличить на один' : 'Increase by one',
    removeItem:   lang === 'uz' ? 'Hisobdan olib tashlash' : lang === 'ru' ? 'Убрать из счёта' : 'Remove from bill',
    addToBill:    lang === 'uz' ? 'Hisobga qo‘shish' : lang === 'ru' ? 'Добавить в счёт' : 'Add to bill',
    menuType:     lang === 'uz' ? 'Menyu turi' : lang === 'ru' ? 'Тип меню' : 'Menu type',
    back:         lang === 'uz' ? 'Orqaga' : lang === 'ru' ? 'Назад' : 'Back',
    close:        lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close',
    retry:        lang === 'uz' ? 'Qayta urinish' : lang === 'ru' ? 'Повторить' : 'Retry',
    printTitle:   lang === 'uz' ? 'Chekni chop etish' : lang === 'ru' ? 'Печать чека' : 'Print receipt',
    receiptFrame: lang === 'uz' ? 'Chek' : lang === 'ru' ? 'Чек' : 'Receipt',
    orderClosed:  lang === 'uz' ? 'Buyurtma allaqachon yopilgan yoki o‘zgargan. Kassir sahifasiga qayting.' : lang === 'ru' ? 'Заказ уже закрыт или изменился. Вернитесь на страницу кассира.' : 'The order was already closed or changed. Return to the cashier page.',
    billRefreshed: amount => lang === 'uz' ? `Hisob yangilandi: ${amount}. Summani tekshirib, to‘lovni yana tasdiqlang.` : lang === 'ru' ? `Счёт обновлён: ${amount}. Проверьте сумму и подтвердите оплату ещё раз.` : `The bill was refreshed to ${amount}. Check the amount and confirm again.`,
    emptyOrder:   lang === 'uz' ? 'Buyurtmada mahsulot yo‘q' : lang === 'ru' ? 'В заказе нет позиций' : 'This order has no items',
    emptyOrderSub: lang === 'uz' ? 'To‘lanmagan bo‘sh buyurtma saqlanib qolgan. Saqlangan summa to‘lov uchun hisob emas.' : lang === 'ru' ? 'Остался пустой неоплаченный заказ. Сохранённая сумма не является счётом к оплате.' : 'An empty unpaid order remains. Its saved amount is not a bill to charge.',
    maybePaid:    lang === 'uz' ? "Buyurtma allaqachon to'langan bo'lishi mumkin." : lang === 'ru' ? 'Возможно, заказ уже оплачен.' : 'The order may have already been paid.',
    deleteNeedsAccess: lang === 'uz' ? 'Bugungi buyurtmani o‘chirish uchun ruxsatli hisob kerak. Yordam uchun rahbarga murojaat qiling.' : lang === 'ru' ? 'Удаление доступно уполномоченной учётной записи только в день заказа. Обратитесь к руководителю.' : 'Deletion requires an authorized account and is available only on the order’s date. Ask a manager for help.',
  }
  // State holds a code (or the caught error); the sentence is built here, in the current language.
  const refreshMessageText = !paymentRefreshMessage ? ''
    : paymentRefreshMessage.error ? cashierRefreshErrorMessage(paymentRefreshMessage.error, lang)
    : paymentRefreshMessage.code === 'billRefreshed' ? lbl.billRefreshed(formatCurrency(paymentRefreshMessage.total))
    : lbl[paymentRefreshMessage.code] || ''
  const remainingLabel = isOverpaid ? lbl.overpaid : isFullyPaid ? lbl.fullyPaid : lbl.remaining
  const remainingAmount = isOverpaid ? overpaidAmount : isFullyPaid ? 0 : shortfall
  const checkoutBlockMessage = checkoutBlockReason === 'access'
    ? lbl.cashierAccessRequired
    : checkoutBlockReason === 'loyalty'
      ? lbl.resolveLoyaltyBeforePayment
      : checkoutBlockReason === 'refresh'
        ? lbl.refreshingBill
        : ''

  if (!loaded || loadError) {
    return (
      <div className="flex overflow-hidden bg-[#f6f5f3]" style={{ height: '100dvh' }}>
        <div className="hidden lg:block flex-shrink-0 h-full"><UnifiedSidebar /></div>
        <div className="flex-1 overflow-y-auto">
          {!loaded ? (
            <OperationalLoading layout="detail"
              title={lang === 'uz' ? 'Hisob yuklanmoqda' : lang === 'ru' ? 'Загрузка счёта' : 'Loading bill'}
              description={lang === 'uz' ? 'Buyurtma va to‘lov maʼlumotlari olinmoqda.' : lang === 'ru' ? 'Получаем заказ и данные оплаты.' : 'Fetching order and payment details.'}
            />
          ) : (
            // The app-level load has no retry of its own; the raw store message stays in the console.
            <OperationalError
              lang={lang}
              title={lang === 'uz' ? 'Hisobni yuklab bo‘lmadi' : lang === 'ru' ? 'Не удалось загрузить счёт' : 'Could not load bill'}
              actionLabel={lang === 'uz' ? 'Qayta yuklash' : lang === 'ru' ? 'Перезагрузить' : 'Reload'}
              onAction={retryPOSLoad}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!order) {
    return (
      <div className="flex overflow-hidden bg-[#f6f5f3]" style={{ height: '100dvh' }}>
        <div className="hidden lg:block flex-shrink-0 h-full"><UnifiedSidebar /></div>
        <div className="flex flex-col flex-1 min-w-0 items-center justify-center overflow-y-auto p-4 sm:p-8">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-6 sm:p-10 flex flex-col items-center text-center max-w-sm w-full">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
              <Receipt size={28} className="text-orange-300" strokeWidth={1.5} aria-hidden="true" />
            </div>
            {isRefreshingBill ? (
              // The bill is being read: a shimmer in the shape of the two lines, never a "checking" text.
              <div role="status" className="mb-5 grid w-full justify-items-center gap-2">
                <span className="sr-only">{lbl.refreshingBill}</span>
                <Shimmer className="h-5 w-44 rounded" />
                <Shimmer className="h-4 w-56 max-w-full rounded" />
              </div>
            ) : (
              <>
                <h1 className="font-black text-[#1F2937] text-base mb-1">{emptyOrders.length > 0 ? lbl.emptyOrder : lbl.noOrder}</h1>
                <p className="text-sm text-[#6B7280] mt-1 mb-5">
                  {!paymentRefreshMessage && (emptyOrders.length > 0 ? lbl.emptyOrderSub : lbl.maybePaid)}
                </p>
              </>
            )}
            {!isRefreshingBill && !paymentRefreshMessage && emptyOrders.map(candidate => (
              <div key={candidate.id} className="mb-4 w-full rounded-xl border border-orange-100 bg-orange-50 p-3">
                <p className="mb-2 text-xs text-[#68655f]">{candidate.table_name || table?.name} · {candidate.order_number || `#${String(candidate.id).slice(0, 8)}`}</p>
                {canDeleteOrder(candidate) ? (
                  <button type="button" disabled={isDeletingOrder} onClick={() => handleDeleteOrder(candidate)}
                    className="ws-btn ws-btn-danger-solid w-full">
                    {isDeletingOrder && <Loader2 className="animate-spin" aria-hidden="true" />}
                    {isDeletingOrder ? lbl.deletingOrder : lbl.deleteOrder}
                  </button>
                ) : (
                  <p className="text-sm text-[#68655f]">{lbl.deleteNeedsAccess}</p>
                )}
              </div>
            ))}
            {deleteOrderError && <p role="alert" className="mb-4 text-sm text-[#c4262c]">{formatWriteError(deleteOrderError, lang, 'DELETE_ORDER')}</p>}
            {paymentRefreshMessage && (
              <div role="alert" className="mb-4 grid justify-items-center gap-2 text-sm text-[#c4262c]">
                <p>{refreshMessageText}</p>
                <button type="button" disabled={isRefreshingBill} className="ws-btn ws-btn-outline ws-btn-sm"
                  onClick={async () => {
                    setRefreshingBill(true)
                    setPaymentRefreshMessage('')
                    try { await refreshCurrentBill() } catch (error) { setPaymentRefreshMessage({ error }) }
                    finally { setRefreshingBill(false) }
                  }}>{lbl.retry}</button>
              </div>
            )}
            {canDeletePaidOrders(profile || { role: state.user?.role }) && hasPendingSalarySettlement(orderId || tableId) && (
              <div className="mb-3 w-full">
                <SalaryOrderPayment lang={lang} disabled={false} total={0} loyaltyUsed={0} cashback={0}
                  tableId={tableId} orderId={orderId} getFreshQuote={async () => ({ orderIds: [] })}
                  onOpenChange={() => {}} onDone={() => navigate('/cashier/tables')} />
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate('/cashier/tables')}
              className="ws-btn ws-btn-ghost"
            >
              <ArrowLeft aria-hidden="true" /> {lbl.backTables}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0)

  const confirmButton = (
    <button
      type="button"
      onClick={handlePaid}
      disabled={!canProcess}
      className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-black transition-colors active:scale-[0.98] ${
        canProcess
          ? 'bg-[#cc4800] text-white hover:bg-[#b23f00]'
          : 'bg-gray-100 text-[#68655f] cursor-not-allowed'
      }`}
    >
      {isProcessingPayment ? <Loader2 size={19} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={19} aria-hidden="true" />}
      {isProcessingPayment ? lbl.processingPay : lbl.confirmPay}
    </button>
  )
  // Why Confirm is disabled, or what the last check found: shown beside every Confirm button.
  const checkoutMessages = (
    <>
      {checkoutBlockMessage && !isProcessingPayment && (
        checkoutBlockReason === 'refresh' ? (
          <div role="status" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="sr-only">{checkoutBlockMessage}</span>
            <Shimmer className="h-3.5 w-40 rounded" />
          </div>
        ) : (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-[#68655f]">
            {checkoutBlockMessage}
          </p>
        )
      )}
      {paymentRefreshMessage && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {refreshMessageText}
        </p>
      )}
    </>
  )

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

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top header */}
        <WorkspaceTopBar
          lang={lang}
          badge={cashierAttention}
          badgeLabel={lang === 'uz' ? 'hisob kassirni kutmoqda' : lang === 'ru' ? 'счетов ждут кассира' : 'bills waiting for the cashier'}
          title={lang === 'uz' ? 'Kassir' : lang === 'ru' ? 'Кассир' : 'Cashier'}
          onOpenDrawer={() => setSidebarOpen(true)}
          back={{ onClick: () => navigate('/cashier/tables'), label: lbl.back }}
        />

        {/* Scrollable area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5">
          <div className="flex flex-col lg:flex-row gap-4 items-start">

            {/* ══ CENTER: order details ══════════════════════════════════════ */}
            <div className="w-full lg:flex-[60] min-w-0 flex flex-col gap-3">

              {/* Bill card */}
              <div className="receipt-print-area bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">

                {/* Bill header */}
                <div className="px-4 sm:px-5 py-4 border-b border-gray-100 bg-gray-50">
                  {/* Table info: the print button drops under the title when the card is narrow. */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-black text-[#1F2937] text-2xl leading-tight">{orderLabel}</h2>
                        <StatusBadge status={order.payment_status === 'paid' ? 'paid' : order.status} />
                        <span className="ws-badge ws-tone-accent">
                          {lbl.menuType}: {getPriceModeLabel(orderPriceMode, lang)}
                        </span>
                      </div>
                      {isOffPremise && <p className="text-xs font-semibold text-[#bf4300] mt-0.5">{lbl.noTable}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#68655f]">
                        {order.waiter_name && (
                          <span className="flex items-center gap-1">
                            <Users size={12} aria-hidden="true" />
                            {lbl.openedBy}: {order.opened_by_name || order.waiter_name}
                          </span>
                        )}
                        {order.created_at && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} aria-hidden="true" />
                            {lbl.opened}: {elapsedSince(order.created_at, lang)}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handlePrintBill}
                      disabled={isPrintingBill || isRefreshingBill}
                      className="ws-btn ws-btn-outline ws-btn-sm"
                    >
                      {isPrintingBill ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Printer aria-hidden="true" />}
                      {isPrintingBill ? lbl.printingBill : lbl.printBill}
                    </button>
                  </div>
                </div>

                {/* Item rows: the row wraps by its own width (the card sits beside a sidebar and a
                    payment panel), and an amount is never split across lines. */}
                <div className="divide-y divide-[#F3F4F6]">
                  {order.items.map((item, i) => {
                    const mi   = menuItemMap[item.menu_item_id]
                    const displayName = getCashierItemName(item, mi, lang)
                    const desc = getDesc(mi, lang)
                    const grams = gramsLabel(mi, lang)
                    const millilitres = millilitresLabel(mi, lang)
                    const kcal = kcalLabel(mi, lang)
                    const serves = servesLabel(mi, lang)
                    const optionLines = getOrderItemOptionLines(item, mi, lang)
                    const manualNotes = getManualOrderNotes(item, mi, lang)
                    const isCounter = isCashierQuickItem(mi)
                    const unitPrice = getOrderItemUnitPrice(item)
                    const lineTotal = getOrderItemLineTotal(item)
                    const quantitySource = { ...mi, sale_unit: item.sale_unit || mi?.sale_unit }
                    const quantityLabel = isMenuItemSoldByWeight(quantitySource)
                      ? formatMenuQuantity(item.quantity, quantitySource)
                      : `×${formatMenuQuantity(item.quantity, quantitySource)}`
                    const facts = [grams, millilitres, kcal, serves].filter(Boolean)
                    return (
                      <div
                        key={i}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-4"
                      >
                        {/* Image + name + desc */}
                        <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-orange-50 border border-gray-100 flex-shrink-0">
                            {mi?.image_url ? (
                              <img
                                src={mi.image_url}
                                alt={displayName}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <UtensilsCrossed size={18} className="text-orange-200" aria-hidden="true" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-[#1F2937] line-clamp-2">{displayName}</p>
                            {optionLines.map((line, index) => (
                              <p key={`${item.id || i}-option-${index}`} className="text-xs font-semibold text-[#111827] line-clamp-1 mt-0.5">{line}</p>
                            ))}
                            {desc && (
                              <p className="text-xs text-[#68655f] line-clamp-1 mt-0.5">{desc}</p>
                            )}
                            {facts.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {facts.map(fact => <span key={fact} className="ws-badge">{fact}</span>)}
                              </div>
                            )}
                            {manualNotes && (
                              <p className="text-xs text-[#9a5a00] mt-0.5 line-clamp-2">
                                {lbl.noteLabel}: {manualNotes}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Quantity, unit price, line total: one group that moves under the name together. */}
                        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                          {isCounter ? (
                            <div className="flex items-center gap-1" role="group" aria-label={`${displayName}: ${lbl.qty}`}>
                              <button
                                type="button"
                                disabled={!canEditCashier}
                                onClick={() => updateBillItemQty(item, (Number(item.quantity) || 1) - 1)}
                                aria-label={`${lbl.decreaseQty}: ${displayName}`}
                                className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
                              >
                                <Minus aria-hidden="true" />
                              </button>
                              <span className="min-w-8 text-center text-sm font-semibold tabular-nums text-[#22201d]">×{item.quantity}</span>
                              <button
                                type="button"
                                disabled={!canEditCashier}
                                onClick={() => updateBillItemQty(item, (Number(item.quantity) || 1) + 1)}
                                aria-label={`${lbl.increaseQty}: ${displayName}`}
                                className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
                              >
                                <Plus aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <span className="ws-badge ws-tone-accent tabular-nums">{quantityLabel}</span>
                          )}
                          <span className="whitespace-nowrap text-right text-sm tabular-nums text-[#68655f]">
                            <span className="sr-only">{lbl.unitPrice}: </span>{formatCurrency(unitPrice)}
                          </span>
                          <span className="min-w-[7rem] whitespace-nowrap text-right text-sm font-black tabular-nums text-[#1F2937]">
                            <span className="sr-only">{lbl.total}: </span>{formatCurrency(lineTotal)}
                          </span>
                          {isCounter && (
                            <button
                              type="button"
                              disabled={!canEditCashier}
                              onClick={() => updateBillItemQty(item, 0)}
                              aria-label={`${lbl.removeItem}: ${displayName}`}
                              className="ws-btn ws-btn-danger ws-btn-sm ws-btn-icon"
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Counter Items */}
              {quickItems.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-[#1F2937]">{lbl.counterItems}</h3>
                      <p className="mt-0.5 text-xs font-medium text-[#68655f]">{lbl.counterItemsSub}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {quickItems.map(item => {
                      const current = order.items.find(row =>
                        row.menu_item_id === item.id &&
                        (row.is_counter_item || row.isCounterItem || row.item_type === 'counter' || row.itemType === 'counter')
                      )
                      const qty = Number(current?.quantity) || 0
                      const itemName = getItemName(item, lang)
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-[#E5E7EB] bg-[#FBFCFE] p-3"
                        >
                          <button
                            type="button"
                            disabled={!canEditCashier}
                            onClick={() => addQuickItem(item)}
                            aria-label={`${lbl.addToBill}: ${itemName}`}
                            className="min-h-11 w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="line-clamp-2 block text-[13px] font-black text-[#1F2937]">{itemName}</span>
                            <span className="mt-2 flex items-center justify-between gap-2">
                              <span className="whitespace-nowrap text-xs font-bold tabular-nums text-[#bf4300]">{formatCurrency(item.price)}</span>
                              {qty > 0 ? (
                                <span className="ws-badge ws-tone-accent tabular-nums">×{qty}</span>
                              ) : (
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0f3b2e] text-white">
                                  <Plus size={13} aria-hidden="true" />
                                </span>
                              )}
                            </span>
                          </button>
                          {qty > 0 && current && (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!canEditCashier}
                                onClick={() => updateBillItemQty(current, qty - 1)}
                                aria-label={`${lbl.decreaseQty}: ${itemName}`}
                                className="ws-btn ws-btn-outline ws-btn-sm flex-1"
                              >
                                <Minus aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={!canEditCashier}
                                onClick={() => updateBillItemQty(current, qty + 1)}
                                aria-label={`${lbl.increaseQty}: ${itemName}`}
                                className="ws-btn ws-btn-outline ws-btn-sm flex-1"
                              >
                                <Plus aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Loyalty card */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={15} className="text-[#ff5a00]" aria-hidden="true" />
                  <h3 className="text-sm font-black text-[#1F2937]">{lbl.loyaltyLabel}</h3>
                </div>
                <CashierLoyaltyNameSearch
                  lang={lang}
                  onSearchChange={clearLoyaltyEntry}
                  onSelect={cardNumber => {
                    clearLoyaltyEntry()
                    setLoyaltyCardNumber(cardNumber)
                    checkLoyaltyCard(cardNumber)
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={lbl.cardNumber}
                    value={String(loyaltyCardNumber || '').replace(/(\d{4})(?=\d)/g, '$1 ')}
                    onChange={e => {
                      loyaltyLookupRequest.current += 1
                      setCheckingLoyalty(false)
                      setLoyaltyCardNumber(e.target.value.replace(/\D/g, '').slice(0, 8))
                      setLoyaltyCard(null)
                      setLoyaltyRedeemAmount('')
                      setLoyaltyLookupMessage('')
                    }}
                    maxLength={9}
                    placeholder={lbl.cardNumber}
                    className="ws-input min-w-[9rem] flex-1 tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={pasteLoyaltyCardNumber}
                    aria-label={lbl.paste}
                    className="ws-btn ws-btn-outline !h-11"
                  >
                    <ClipboardPaste size={16} aria-hidden="true" />
                    <span className="hidden sm:inline">{lbl.paste}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => checkLoyaltyCard()}
                    disabled={isCheckingLoyalty}
                    className="ws-btn ws-btn-outline !h-11"
                  >
                    {isCheckingLoyalty && <Loader2 className="animate-spin" aria-hidden="true" />}
                    {lbl.checkCard}
                  </button>
                </div>
                {loyaltyLookupMessage && (
                  <p role="status" className="mt-2 text-xs font-semibold text-[#68655f]">{lbl[loyaltyLookupMessage] || ''}</p>
                )}
                {hasLoyaltyCardEntry && !loyaltyCard && (
                  <button
                    type="button"
                    onClick={clearLoyaltyEntry}
                    className="ws-btn ws-btn-ghost ws-btn-sm mt-1"
                  >
                    <X aria-hidden="true" />
                    {lbl.clearLoyalty}
                  </button>
                )}
                {loyaltyCard && (
                  <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1d7a52]">{lbl.cardOwner}</p>
                        <p className="mt-1 text-sm font-black text-[#1F2937]">{loyaltyCard.customer_name || lbl.unnamedCardOwner}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-semibold text-[#1d7a52]">{lbl.cashbackBalance}</p>
                        <button
                          type="button"
                          onClick={fillMaxLoyaltyRedeem}
                          aria-disabled={maxLoyaltyRedeemAmount <= 0}
                          title={lbl.tapBalanceMax}
                          className={`min-h-11 whitespace-nowrap font-black tabular-nums underline underline-offset-2 ${
                            maxLoyaltyRedeemAmount > 0
                              ? 'text-[#1d7a52] md:cursor-pointer'
                              : 'text-[#68655f] md:cursor-not-allowed'
                          }`}
                        >
                          {formatCurrency(loyaltyCard.balance)}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    aria-label={lbl.useLoyalty}
                    aria-invalid={!loyaltyValidation.ok || undefined}
                    value={formatMoneyInput(loyaltyRedeemAmount)}
                    onChange={e => updateLoyaltyRedeem(normalizeMoneyInput(e.target.value))}
                    placeholder={lbl.useLoyalty}
                    className="ws-input w-full tabular-nums"
                  />
                </div>
                {!loyaltyValidation.ok && (
                  <p role="alert" className="mt-2 text-xs font-semibold text-[#c4262c]">
                    {loyaltyValidation.reason === 'balance' ? lbl.loyaltyBalanceExceeded : lbl.loyaltyBillExceeded}
                  </p>
                )}
                {loyaltyAmt > 0 && loyaltyValidation.ok && (
                  <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 flex flex-wrap justify-between items-center gap-x-3">
                    <span className="text-sm text-[#C2410C] font-medium">{lbl.loyalty}</span>
                    <span className="whitespace-nowrap font-black tabular-nums text-[#C2410C]">− {formatCurrency(loyaltyAmt)}</span>
                  </div>
                )}
                {cashbackToBeEarned > 0 && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                      <span className="text-sm font-medium text-[#92400E]">{lbl.cashbackToBeEarned}</span>
                      <span className="whitespace-nowrap font-black tabular-nums text-[#92400E]">+ {formatCurrency(cashbackToBeEarned)}</span>
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-[#92400E]">{lbl.cashbackRewardHint}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ══ RIGHT: payment panel ════════════════════════════════════════ */}
            <div className="w-full lg:w-[360px] flex-shrink-0 flex flex-col gap-3 lg:sticky lg:top-0">

              {/* Payment Summary */}
              {/* The one summary of the bill: subtotal, service, counter items, loyalty, total. */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-4 sm:p-5">
                <h3 className="font-black text-[#1F2937] text-base mb-4">{lbl.paySummary}</h3>
                <div className="space-y-3">
                  <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                    <span className="text-[#68655f]">{lbl.subtotal}</span>
                    <span className="whitespace-nowrap tabular-nums text-[#1F2937] font-semibold">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                    <span className="text-[#68655f]">{lbl.service}</span>
                    <span className="whitespace-nowrap tabular-nums text-[#1F2937] font-semibold">{formatCurrency(serviceFee)}</span>
                  </div>
                  {counterItemsSubtotal > 0 && (
                    <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                      <span className="text-[#68655f]">{lbl.counterItems}</span>
                      <span className="whitespace-nowrap tabular-nums text-[#1F2937] font-semibold">{formatCurrency(counterItemsSubtotal)}</span>
                    </div>
                  )}
                  {loyaltyAmt > 0 && (
                    <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                      <span className="text-[#68655f]">{lbl.loyalty}</span>
                      <span className="whitespace-nowrap tabular-nums text-[#1d7a52] font-semibold">− {formatCurrency(loyaltyAmt)}</span>
                    </div>
                  )}
                  <div className="pt-3 border-t border-dashed border-[#E5E7EB] flex flex-wrap justify-between items-baseline gap-x-3">
                    <span className="font-black text-[#1F2937] text-sm">{lbl.totalAmt}</span>
                    <span className="whitespace-nowrap font-black text-2xl tabular-nums text-[#ff5a00]"><RollingText text={formatCurrency(total)} /></span>
                  </div>
                  {cashbackToBeEarned > 0 && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-2.5">
                      <p className="text-xs font-semibold text-[#92400E]">{lbl.cashbackRewardHint}</p>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
                        <span className="text-sm font-semibold text-[#92400E]">{lbl.cashbackToBeEarned}</span>
                        <span className="whitespace-nowrap font-black tabular-nums text-[#92400E]">+ {formatCurrency(cashbackToBeEarned)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Split Payment */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
                  <h3 className="font-black text-[#1F2937] text-sm">{lbl.splitPay}</h3>
                  <button
                    type="button"
                    onClick={addPaymentRow}
                    className="ws-btn ws-btn-ghost ws-btn-sm"
                  >
                    <Plus aria-hidden="true" />
                    {lbl.addPayment}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4" role="group" aria-label={lbl.payMethod}>
                  {PAY_METHODS.map(m => {
                    const Icon = m.icon
                    const active = payMethod === m.key
                    return (
                      <button
                        key={m.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => selectPaymentMethod(m.key)}
                        className={`flex flex-col items-center gap-2 py-3.5 rounded-xl border-2 font-semibold text-xs transition-colors ${
                          active
                            ? 'border-[#ff5a00] bg-[#fff1e8] text-[#bf4300]'
                            : 'border-[#E5E7EB] text-[#68655f] hover:border-gray-300 bg-white'
                        }`}
                      >
                        <Icon size={20} strokeWidth={active ? 2.5 : 1.5} aria-hidden="true" />
                        {payLabel(m, lang)}
                      </button>
                    )
                  })}
                </div>

                <div className="space-y-2.5">
                  {splitPayments.map((row, index) => {
                    const method = PAY_METHODS.find(m => m.key === row.method) || PAY_METHODS[0]
                    const Icon = method.icon
                    const active = activePaymentId === row.id
                    const rowAmount = Number(row.amount) || 0
                    const maxForRow = getMaxForPaymentRow(row.id)
                    const rowOverLimit = rowAmount > maxForRow
                    const rowName = `${index + 1}. ${payLabel(method, lang)}`
                    return (
                      <div
                        key={row.id}
                        className={`rounded-xl border p-3 transition-colors ${
                          rowOverLimit
                            ? 'border-red-300 bg-red-50'
                            : active ? 'border-[#ff5a00] bg-[#fff7f2]' : 'border-[#E5E7EB] bg-white'
                        }`}
                        onClick={() => {
                          setActivePaymentId(row.id)
                          setPayMethod(row.method)
                        }}
                      >
                        {/* The method sits above the amount, so the field keeps the full row width and a
                            nine-digit amount is never clipped on a 320px phone. */}
                        <div className="flex min-h-9 items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Icon size={15} aria-hidden="true" className={active ? 'text-[#ff5a00]' : 'text-[#68655f]'} />
                            <span className="text-xs font-black text-[#1F2937]">{payLabel(method, lang)}</span>
                          </div>
                          {splitPayments.length > 1 && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                removePaymentRow(row.id)
                              }}
                              className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"
                              aria-label={`${lbl.removePayment}: ${rowName}`}
                            >
                              <X aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <div className="relative mt-1.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9 ]*"
                            aria-label={`${rowName}: ${lbl.receivedAmt}`}
                            aria-invalid={rowOverLimit || undefined}
                            value={formatMoneyInput(row.amount)}
                            onChange={e => updatePayment(row.id, { amount: normalizeMoneyInput(e.target.value) })}
                            onFocus={() => {
                              setActivePaymentId(row.id)
                              setPayMethod(row.method)
                            }}
                            placeholder="0"
                            className="ws-input w-full !pr-12 font-black tabular-nums"
                          />
                          <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#68655f]">{formatCurrency(0).replace(/^[\d\s]+/, '')}</span>
                        </div>
                        {active && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              fillRemaining(row.id)
                            }}
                            className="ws-btn ws-btn-ghost ws-btn-sm mt-1.5"
                          >
                            {lbl.fillRest}
                          </button>
                        )}
                        {rowOverLimit && (
                          <p role="alert" className="mt-2 text-xs font-semibold text-[#c4262c]">
                            {lbl.exceedsTotal}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4">
                  <p className="text-xs font-medium text-[#68655f] mb-2">
                    {lbl.quickAmt}
                  </p>
                  <button
                    type="button"
                    onClick={applyExactAmount}
                    className="ws-btn ws-btn-outline min-h-12 w-full"
                  >
                    {lbl.exact}
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="rounded-xl px-4 py-3 flex flex-wrap justify-between items-center gap-x-3 bg-gray-50 border border-gray-100">
                    <span className="text-sm font-semibold text-[#68655f]">{lbl.paid}</span>
                    <span className="whitespace-nowrap font-black text-lg tabular-nums text-[#1F2937]">{formatCurrency(paidAmount)}</span>
                  </div>
                  <div className={`rounded-xl px-4 py-3 flex flex-wrap justify-between items-center gap-x-3 ${
                    isFullyPaid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                  }`}>
                    <span className={`text-sm font-semibold ${isFullyPaid ? 'text-[#1d7a52]' : 'text-[#c4262c]'}`}>
                      {remainingLabel}
                    </span>
                    <span className={`whitespace-nowrap font-black text-lg tabular-nums ${isFullyPaid ? 'text-[#1d7a52]' : 'text-[#c4262c]'}`}>
                      {formatCurrency(remainingAmount)}
                    </span>
                  </div>
                  {isOverpaid && (
                    <p role="alert" className="text-xs font-semibold text-[#c4262c]">
                      {lbl.exceedsTotal}
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-4 sm:p-5 space-y-2.5">
                {canDeletePaidOrders(profile || { role: state.user?.role }) && (
                  <SalaryOrderPayment lang={lang} disabled={isProcessingPayment || isRefreshingBill || !loyaltyReady || total <= 0}
                    total={total} loyaltyUsed={loyaltyAmt} cashback={cashbackToBeEarned} cardNumber={loyaltyCard?.card_number}
                    tableId={tableId} orderId={orderId}
                    getFreshQuote={async () => getFreshCashierPaymentQuote({ orders: await refreshCurrentBill(), menuItems: state.menuItems, settings: state.settings, tableId, orderId, loyaltyUsedAmount: loyaltyAmt })}
                    onOpenChange={open => { if (open) salaryBill.current = order; setSalaryCheckoutActive(open) }}
                    onDone={() => { void refreshCurrentBill().catch(() => {}); navigate('/cashier/tables') }} />
                )}
                {/* Below lg the Confirm button lives in the bar pinned under the page, beside the total. */}
                <div className="hidden lg:grid gap-2.5">
                  {confirmButton}
                  {checkoutMessages}
                </div>
                <button
                  type="button"
                  onClick={handlePrintBill}
                  disabled={isPrintingBill || isRefreshingBill}
                  className="ws-btn ws-btn-outline min-h-12 w-full"
                >
                  {isPrintingBill ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Printer aria-hidden="true" />}
                  {isPrintingBill ? lbl.printingBill : lbl.printReceipt}
                </button>

                {canDeleteOrder(order) && (
                  <div className="grid gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteOrder(order)}
                      disabled={isDeletingOrder}
                      className={`ws-btn w-full ${confirmDeleteOrder ? 'ws-btn-danger-solid' : 'ws-btn-danger'}`}
                    >
                      {isDeletingOrder ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                      {isDeletingOrder ? lbl.deletingOrder : confirmDeleteOrder ? lbl.confirmDeleteOrder : lbl.deleteOrder}
                    </button>
                    {confirmDeleteOrder && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteOrder(false)}
                        className="ws-btn ws-btn-outline w-full"
                      >
                        {lbl.cancelDelete}
                      </button>
                    )}
                    {deleteOrderError && <p role="alert" className="text-xs font-semibold text-[#c4262c]">{formatWriteError(deleteOrderError, lang, 'DELETE_ORDER')}</p>}
                  </div>
                )}

              </div>
            </div>

          </div>
        </div>
        {/* Pinned pay bar (below lg): the amount to collect, what is entered and what is missing
            always sit beside the Confirm button, whatever part of the bill is scrolled into view. */}
        <div className="lg:hidden flex-shrink-0 bg-white border-t border-[#E5E7EB] px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-40">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-xs font-medium text-[#68655f]">{lbl.totalAmt}</span>
                <span className="whitespace-nowrap text-xl font-black tabular-nums text-[#22201d]">{formatCurrency(total)}</span>
              </p>
              <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span className="text-[#68655f]">{lbl.paid}: <span className="whitespace-nowrap font-semibold tabular-nums text-[#22201d]">{formatCurrency(paidAmount)}</span></span>
                <span className={isFullyPaid ? 'text-[#1d7a52]' : 'text-[#c4262c]'}>{remainingLabel}: <span className="whitespace-nowrap font-semibold tabular-nums">{formatCurrency(remainingAmount)}</span></span>
              </p>
            </div>
            <div className="flex-1 basis-48">{confirmButton}</div>
          </div>
          <div className="mt-2 grid gap-2 empty:hidden">{checkoutMessages}</div>
        </div>
      </div>

      {printRequest && (
        <WorkspaceDialog
          title={lbl.printTitle}
          onClose={() => setPrintRequest(null)}
          closeLabel={lbl.close}
          size="xl"
          bodyClassName="!p-0"
        >
          <iframe
            key={printRequest.key}
            src={printRequest.path}
            title={lbl.receiptFrame}
            className="block h-[72dvh] w-full border-0 bg-white"
          />
        </WorkspaceDialog>
      )}
    </div>
  )
}
