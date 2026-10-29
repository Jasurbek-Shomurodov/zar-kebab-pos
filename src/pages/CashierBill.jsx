import { getEmptyCashierOrders } from '../lib/cashierBills'
import { formatWriteError } from '../lib/writeErrorMessage'
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Printer, CheckCircle2, Banknote,
  Receipt, Users, Clock, Tag, UtensilsCrossed,
  Monitor, MoreHorizontal, Plus, Minus, Trash2, ClipboardPaste, X,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useOrderDeletionDate } from '../store/useOrderDeletionDate'
import { useAuth } from '../contexts/AuthContext'
import { getItemName, t, tf } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { gramsLabel, kcalLabel, millilitresLabel, servesLabel } from '../lib/nutrition'
import {
  getGroupedOrderItems,
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
  const { loaded, loadError } = useAppDataStatus()
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
      setLoyaltyLookupMessage(lbl.loyaltyInvalid)
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
        setLoyaltyLookupMessage(lbl.loyaltyNotFound)
        return
      }
      const balance = Math.max(0, Math.round(Number(data.balance ?? data.balance_amount ?? 0) || 0))
      setLoyaltyCard({ ...data, balance })
      setLoyaltyLookupMessage(lbl.loyaltyFound)
    } catch (error) {
      if (requestId !== loyaltyLookupRequest.current) return
      setLoyaltyLookupMessage(error?.message || lbl.loyaltyLookupFailed)
    } finally {
      if (requestId === loyaltyLookupRequest.current) setCheckingLoyalty(false)
    }
  }

  async function pasteLoyaltyCardNumber() {
    try {
      const clipboardText = await navigator.clipboard.readText()
      const cardNumber = String(clipboardText || '').replace(/\D/g, '').slice(0, 8)
      if (!cardNumber) {
        setLoyaltyLookupMessage(lbl.clipboardNoCardNumber)
        return
      }
      setLoyaltyCardNumber(cardNumber)
      setLoyaltyCard(null)
      setLoyaltyRedeemAmount('')
      setLoyaltyLookupMessage('')
      await checkLoyaltyCard(cardNumber)
    } catch {
      setLoyaltyLookupMessage(lbl.clipboardUnavailable)
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
      setLoyaltyLookupMessage(lbl.noLoyaltyBalance)
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
        setPaymentRefreshMessage(lang === 'uz'
          ? 'Buyurtma allaqachon yopilgan yoki o‘zgargan. Kassir sahifasiga qayting.'
          : lang === 'ru'
            ? 'Заказ уже закрыт или изменился. Вернитесь на страницу кассира.'
            : 'The order was already closed or changed. Return to the cashier page.')
        return
      }
      if (freshQuote.total !== total) {
        if (splitPayments.length === 1 && paymentValidation.canConfirmPayment) {
          setSplitPayments(prev => prev.map(row => ({ ...row, amount: freshQuote.total > 0 ? String(freshQuote.total) : '' })))
        }
        setPaymentRefreshMessage(lang === 'uz'
          ? `Hisob yangilandi: ${formatCurrency(freshQuote.total)}. Summani tekshirib, to‘lovni yana tasdiqlang.`
          : lang === 'ru'
            ? `Счёт обновлён: ${formatCurrency(freshQuote.total)}. Проверьте сумму и подтвердите оплату ещё раз.`
            : `The bill was refreshed to ${formatCurrency(freshQuote.total)}. Check the amount and confirm again.`)
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
        setPaymentRefreshMessage(lbl.noOrder)
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
    backTables:   lang === 'uz' ? 'Storlarga qaytish' : lang === 'ru' ? 'Назад к столам' : 'Back to Tables',
    waiter:       lang === 'uz' ? 'Ofitsiant' : lang === 'ru' ? 'Официант' : 'Waiter',
    opened:       lang === 'uz' ? 'Ochildi' : lang === 'ru' ? 'Открыт' : 'Opened',
    openedBy:     lang === 'uz' ? 'Ochgan' : lang === 'ru' ? 'Открыл' : 'Opened by',
    orderItems:   lang === 'uz' ? 'Buyurtma elementlari' : lang === 'ru' ? 'Позиции заказа' : 'Order Items',
    item:         lang === 'uz' ? 'Mahsulot' : lang === 'ru' ? 'Блюдо' : 'Item',
    qty:          lang === 'uz' ? 'Miqdor' : lang === 'ru' ? 'Кол-во' : 'Qty',
    unitPrice:    lang === 'uz' ? 'Narxi' : lang === 'ru' ? 'Цена' : 'Unit Price',
    total:        lang === 'uz' ? 'Jami' : lang === 'ru' ? 'Итого' : 'Total',
    paySummary:   lang === 'uz' ? "To'lov xulosasi" : lang === 'ru' ? 'Итоговый счёт' : 'Payment Summary',
    subtotal:     lang === 'uz' ? 'Buyurtma summasi' : lang === 'ru' ? 'Сумма заказа' : 'Subtotal',
    service:      lang === 'uz' ? `Xizmat (${serviceRatePct}%)` : lang === 'ru' ? `Обслуживание (${serviceRatePct}%)` : `Service (${serviceRatePct}%)`,
    loyalty:      lang === 'uz' ? 'Sodiqlik ishlatildi' : lang === 'ru' ? 'Использовано с карты' : 'Loyalty used',
    totalAmt:     lang === 'uz' ? "To'lovga jami" : lang === 'ru' ? 'Итого к оплате' : 'Total Amount',
    payMethod:    lang === 'uz' ? "To'lov usuli" : lang === 'ru' ? 'Способ оплаты' : 'Payment Method',
    splitPay:     lang === 'uz' ? "Bo'lib to'lash" : lang === 'ru' ? 'Смешанная оплата' : 'Split payment',
    addPayment:   lang === 'uz' ? "To'lov qo'shish" : lang === 'ru' ? 'Добавить оплату' : 'Add payment',
    fillRest:     lang === 'uz' ? 'Qoldiqni to‘ldirish' : lang === 'ru' ? 'Заполнить остаток' : 'Fill remaining',
    paid:         lang === 'uz' ? "To'langan" : lang === 'ru' ? 'Оплачено' : 'Paid',
    receivedAmt:  lang === 'uz' ? 'Qabul qilingan summa' : lang === 'ru' ? 'Полученная сумма' : 'Enter received amount',
    fullyPaid:    lang === 'uz' ? "To'liq to'landi" : lang === 'ru' ? 'Оплачено полностью' : 'Fully paid',
    remaining:    lang === 'uz' ? 'Yetishmaydi' : lang === 'ru' ? 'Не хватает' : 'Remaining',
    quickAmt:     lang === 'uz' ? 'Tez summa' : lang === 'ru' ? 'Быстрая сумма' : 'Quick Amount',
    exact:        lang === 'uz' ? 'Aniq' : lang === 'ru' ? 'Точно' : 'Exact',
    confirmPay:   lang === 'uz' ? "To'lovni tasdiqlash" : lang === 'ru' ? 'Подтвердить оплату' : 'Confirm Payment',
    processingPay: lang === 'uz' ? "To'lov saqlanmoqda" : lang === 'ru' ? 'Сохранение оплаты' : 'Saving payment',
    refreshingBill: lang === 'uz' ? 'Hisob tekshirilmoqda' : lang === 'ru' ? 'Проверка счёта' : 'Checking bill',
    cashierAccessRequired: lang === 'uz' ? 'To‘lovni yakunlash uchun Kassa tahrirlash ruxsati kerak.' : lang === 'ru' ? 'Для завершения оплаты нужен доступ на изменение кассы.' : 'Cashier write access is required to complete payment.',
    resolveLoyaltyBeforePayment: lang === 'uz' ? 'Sodiqlik kartasini tekshiring yoki karta raqamini tozalang.' : lang === 'ru' ? 'Проверьте карту лояльности или очистите номер карты.' : 'Check the loyalty card or clear its number.',
    clearLoyalty: lang === 'uz' ? 'Kartani tozalash' : lang === 'ru' ? 'Очистить карту' : 'Clear card',
    printBill:    lang === 'uz' ? 'Hisob chiqarish' : lang === 'ru' ? 'Распечатать счёт' : 'Print Bill',
    printReceipt: lang === 'uz' ? 'Chek chiqarish' : lang === 'ru' ? 'Распечатать чек' : 'Print Receipt',
    printingBill: lang === 'uz' ? 'Hisob tayyorlanmoqda…' : lang === 'ru' ? 'Подготовка счёта…' : 'Preparing bill…',
    deleteOrder:  lang === 'uz' ? 'Buyurtmani o‘chirish' : lang === 'ru' ? 'Удалить заказ' : 'Delete order',
    confirmDeleteOrder: lang === 'uz' ? 'O‘chirishni tasdiqlash' : lang === 'ru' ? 'Подтвердить удаление' : 'Confirm delete',
    deletingOrder: lang === 'uz' ? 'O‘chirilmoqda...' : lang === 'ru' ? 'Удаление...' : 'Deleting...',
    cancelDelete: lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel',
    loyaltyLabel: lang === 'uz' ? 'Sodiqlik kartasi' : lang === 'ru' ? 'Карта лояльности' : 'Loyalty Card',
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
    counterItems: lang === 'uz' ? 'Kassa mahsulotlari' : lang === 'ru' ? 'Товары у кассы' : 'Counter Items',
    counterItemsSub: lang === 'uz' ? 'Bu hisobga tezkor kassa mahsulotlarini qo‘shing' : lang === 'ru' ? 'Добавьте быстрые товары кассы к этому счёту' : 'Add quick cashier items to this bill',
    noTable:      lang === 'uz' ? 'Stol tanlanmagan' : lang === 'ru' ? 'Стол не выбран' : 'No table selected',
    removePayment: t(lang, 'removePayment'),
  }
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
            <OperationalError
              title={lang === 'uz' ? 'Hisobni yuklab bo‘lmadi' : lang === 'ru' ? 'Не удалось загрузить счёт' : 'Could not load bill'}
              description={loadError}
              actionLabel={lang === 'uz' ? 'Qayta yuklash' : lang === 'ru' ? 'Перезагрузить' : 'Reload'}
              onAction={() => window.location.reload()}
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
        <div className="flex flex-col flex-1 min-w-0 items-center justify-center p-8">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-10 flex flex-col items-center text-center max-w-sm w-full">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
              <Receipt size={28} className="text-orange-300" strokeWidth={1.5} />
            </div>
            <p className="font-black text-[#1F2937] text-base mb-1">{isRefreshingBill ? lbl.refreshingBill : emptyOrders.length > 0
              ? (lang === 'uz' ? 'Buyurtmada mahsulot yo‘q' : lang === 'ru' ? 'В заказе нет позиций' : 'This order has no items')
              : lbl.noOrder}</p>
            <p className="text-sm text-[#6B7280] mt-1 mb-5">
              {!isRefreshingBill && !paymentRefreshMessage && (emptyOrders.length > 0
                ? (lang === 'uz' ? 'To‘lanmagan bo‘sh buyurtma saqlanib qolgan. Saqlangan summa to‘lov uchun hisob emas.' : lang === 'ru' ? 'Остался пустой неоплаченный заказ. Сохранённая сумма не является счётом к оплате.' : 'An empty unpaid order remains. Its saved amount is not a bill to charge.')
                : (lang === 'uz' ? "Buyurtma allaqachon to'langan bo'lishi mumkin." : lang === 'ru' ? 'Возможно, заказ уже оплачен.' : 'The order may have already been paid.'))}
            </p>
            {!isRefreshingBill && !paymentRefreshMessage && emptyOrders.map(candidate => (
              <div key={candidate.id} className="mb-4 w-full rounded-xl border border-orange-100 bg-orange-50 p-3">
                <p className="mb-2 break-all text-xs text-gray-500">{candidate.table_name || table?.name} · {candidate.id}</p>
                {canDeleteOrder(candidate) ? (
                  <button type="button" disabled={isDeletingOrder} onClick={() => handleDeleteOrder(candidate)}
                    className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                    {isDeletingOrder ? lbl.deletingOrder : lbl.deleteOrder}
                  </button>
                ) : (
                  <p className="text-sm text-gray-600">{lang === 'uz' ? 'Bugungi buyurtmani o‘chirish uchun ruxsatli hisob kerak. Yordam uchun rahbarga murojaat qiling.' : lang === 'ru' ? 'Удаление доступно уполномоченной учётной записи только в день заказа. Обратитесь к руководителю.' : 'Deletion requires an authorized account and is available only on the order’s date. Ask a manager for help.'}</p>
                )}
              </div>
            ))}
            {deleteOrderError && <p role="alert" className="mb-4 text-sm text-red-600">{formatWriteError(deleteOrderError, lang, 'DELETE_ORDER')}</p>}
            {paymentRefreshMessage && (
              <div role="alert" className="mb-4 text-sm text-red-600">
                <p>{paymentRefreshMessage.error ? cashierRefreshErrorMessage(paymentRefreshMessage.error, lang) : paymentRefreshMessage}</p>
                <button type="button" disabled={isRefreshingBill} className="mt-2 font-bold underline"
                  onClick={async () => {
                    setRefreshingBill(true)
                    setPaymentRefreshMessage('')
                    try { await refreshCurrentBill() } catch (error) { setPaymentRefreshMessage({ error }) }
                    finally { setRefreshingBill(false) }
                  }}>{lang === 'uz' ? 'Qayta urinish' : lang === 'ru' ? 'Повторить' : 'Retry'}</button>
              </div>
            )}
            {canDeletePaidOrders(profile || { role: state.user?.role }) && hasPendingSalarySettlement(orderId || tableId) && (
              <SalaryOrderPayment lang={lang} disabled={false} total={0} loyaltyUsed={0} cashback={0}
                tableId={tableId} orderId={orderId} getFreshQuote={async () => ({ orderIds: [] })}
                onOpenChange={() => {}} onDone={() => navigate('/cashier/tables')} />
            )}
            <button
              onClick={() => navigate('/cashier/tables')}
              className="flex items-center gap-2 text-[#ff5a00] font-semibold hover:underline text-sm"
            >
              <ArrowLeft size={15} /> {lbl.backTables}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0)

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
          drawerLabel={lang === 'uz' ? 'Yon panel' : lang === 'ru' ? 'Боковая панель' : 'Toggle Sidebar'}
          leading={(
            <button
              type="button"
              onClick={() => navigate('/cashier/tables')}
              aria-label={lang === 'uz' ? 'Orqaga' : lang === 'ru' ? 'Назад' : 'Back'}
              className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] text-[#68655f] transition-colors hover:bg-[#ebe8e5] hover:text-[#22201d]"
            >
              <ArrowLeft size={18} />
            </button>
          )}
        />

        {/* Scrollable area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5">
          <div className="flex flex-col lg:flex-row gap-4 items-start">

            {/* ══ CENTER: order details ══════════════════════════════════════ */}
            <div className="w-full lg:flex-[60] min-w-0 flex flex-col gap-3">

              {/* Bill card */}
              <div className="receipt-print-area bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">

                {/* Bill header */}
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                  {/* Table info */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="font-black text-[#1F2937] text-2xl leading-tight">{orderLabel}</h1>
                        <StatusBadge status={order.payment_status === 'paid' ? 'paid' : order.status} />
                        <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-black text-[#ff5a00]">
                          {lang === 'uz' ? 'Menyu turi' : lang === 'ru' ? 'Тип меню' : 'Menu type'}: {getPriceModeLabel(orderPriceMode, lang)}
                        </span>
                      </div>
                      {isOffPremise && <p className="text-[11px] font-bold text-[#ff5a00] mt-0.5">{lbl.noTable}</p>}
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-[#6B7280]">
                        {order.waiter_name && (
                          <span className="flex items-center gap-1">
                            <Users size={11} />
                            {lbl.openedBy}: {order.opened_by_name || order.waiter_name}
                          </span>
                        )}
                        {order.created_at && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {lbl.opened}: {elapsedSince(order.created_at, lang)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={handlePrintBill}
                        disabled={isPrintingBill || isRefreshingBill}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E7EB] text-[#1F2937] text-[12px] font-semibold hover:bg-gray-100 transition-colors disabled:cursor-wait disabled:opacity-50"
                      >
                        <Printer size={14} />
                        {isPrintingBill ? lbl.printingBill : lbl.printBill}
                      </button>
                      <button className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#E5E7EB] hover:bg-gray-100 text-[#6B7280] transition-colors">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Column headers */}
                <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  <div className="col-span-6">{lbl.item}</div>
                  <div className="col-span-2 text-center">{lbl.qty}</div>
                  <div className="col-span-2 text-right">{lbl.unitPrice}</div>
                  <div className="col-span-2 text-right">{lbl.total}</div>
                </div>

                {/* Item rows */}
                <div className="divide-y divide-[#F9FAFB]">
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
                    const lineTotal = unitPrice * (Number(item.quantity) || 1)
                    const quantitySource = { ...mi, sale_unit: item.sale_unit || mi?.sale_unit }
                    const quantityLabel = isMenuItemSoldByWeight(quantitySource)
                      ? formatMenuQuantity(item.quantity, quantitySource)
                      : `×${formatMenuQuantity(item.quantity, quantitySource)}`
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-gray-50/50 transition-colors"
                      >
                        {/* Image + name + desc */}
                        <div className="col-span-12 sm:col-span-6 flex items-center gap-3 min-w-0">
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
                                <UtensilsCrossed size={18} className="text-orange-200" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-[#1F2937] line-clamp-1">{displayName}</p>
                            {optionLines.map((line, index) => (
                              <p key={`${item.id || i}-option-${index}`} className="text-[12px] font-black text-[#111827] line-clamp-1 mt-0.5">{line}</p>
                            ))}
                            {desc && (
                              <p className="text-[11px] text-[#6B7280] line-clamp-1 mt-0.5">{desc}</p>
                            )}
                            {(grams || millilitres || kcal || serves) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {grams && (
                                  <span className="inline-flex rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                                    {grams}
                                  </span>
                                )}
                                {millilitres && (
                                  <span className="inline-flex rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                                    {millilitres}
                                  </span>
                                )}
                                {kcal && (
                                  <span className="inline-flex rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                                    {kcal}
                                  </span>
                                )}
                                {serves && (
                                  <span className="inline-flex rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                                    {serves}
                                  </span>
                                )}
                              </div>
                            )}
                            {manualNotes && (
                              <p className="text-[11px] text-amber-600 mt-0.5 line-clamp-1">
                                {lbl.noteLabel}: {manualNotes}
                              </p>
                            )}
                            {/* Mobile: qty + price */}
                            <div className="flex items-center gap-3 mt-1.5 sm:hidden">
                              <span className="inline-flex items-center justify-center bg-[#fff1e8] text-[#ff5a00] font-black text-[11px] rounded-lg px-2 py-0.5">
                                {quantityLabel}
                              </span>
                              <span className="text-xs text-[#6B7280]">{formatCurrency(unitPrice)}</span>
                              <span className="text-sm font-black text-[#1F2937]">{formatCurrency(lineTotal)}</span>
                            </div>
                            {isCounter && (
                              <div className="mt-2 flex w-fit items-center gap-1 rounded-xl border border-[#FFE0CC] bg-[#fff7f2] p-1 sm:hidden">
                                <button
                                  type="button"
                                  onClick={() => updateBillItemQty(item, (Number(item.quantity) || 1) - 1)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#6B7280]"
                                >
                                  <Minus size={12} />
                                </button>
                                <span className="min-w-[24px] text-center text-xs font-black text-[#ff5a00]">{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updateBillItemQty(item, (Number(item.quantity) || 1) + 1)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff5a00] text-white"
                                >
                                  <Plus size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateBillItemQty(item, 0)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-red-500"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Qty */}
                        <div className="hidden sm:flex col-span-2 justify-center">
                          {isCounter ? (
                            <div className="flex items-center gap-1 rounded-xl border border-[#FFE0CC] bg-[#fff7f2] p-1">
                              <button
                                type="button"
                                onClick={() => updateBillItemQty(item, (Number(item.quantity) || 1) - 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#6B7280] hover:bg-red-50 hover:text-red-600"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="min-w-[24px] text-center text-xs font-black text-[#ff5a00]">×{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateBillItemQty(item, (Number(item.quantity) || 1) + 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff5a00] text-white hover:bg-[#cc4800]"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center justify-center bg-[#fff1e8] text-[#ff5a00] font-black text-xs rounded-lg w-9 h-7">
                              {quantityLabel}
                            </span>
                          )}
                        </div>

                        {/* Unit price */}
                        <div className="hidden sm:block col-span-2 text-right text-sm text-[#6B7280] font-medium">
                          {formatCurrency(unitPrice)}
                        </div>

                        {/* Line total */}
                        <div className="hidden sm:block col-span-2 text-right font-black text-sm text-[#1F2937]">
                          <div className="flex items-center justify-end gap-2">
                            <span>{formatCurrency(lineTotal)}</span>
                            {isCounter && (
                              <button
                                type="button"
                                onClick={() => updateBillItemQty(item, 0)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#D1D5DB] hover:bg-red-50 hover:text-red-500"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Items footer: subtotal strip */}
                <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between text-sm text-[#6B7280]">
                    <span>{lbl.subtotal}</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-[#6B7280]">
                    <span>{lbl.service}</span>
                    <span>{formatCurrency(serviceFee)}</span>
                  </div>
                  {counterItemsSubtotal > 0 && (
                    <div className="flex justify-between text-sm text-[#6B7280]">
                      <span>{lbl.counterItems}</span>
                      <span>{formatCurrency(counterItemsSubtotal)}</span>
                    </div>
                  )}
                  {loyaltyAmt > 0 && (
                    <div className="flex justify-between text-sm text-[#16A34A] font-medium">
                      <span>{lbl.loyalty}</span>
                      <span>− {formatCurrency(loyaltyAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-200">
                    <span className="font-black text-[#1F2937]">{lbl.totalAmt}</span>
                    <span className="font-black text-2xl text-[#ff5a00]"><RollingText text={formatCurrency(total)} /></span>
                  </div>
                  {cashbackToBeEarned > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-[#92400E]">{lbl.cashbackRewardHint}</span>
                        <span className="font-black text-[#D97706]">+ {formatCurrency(cashbackToBeEarned)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] font-semibold text-[#B45309]">{lbl.cashbackToBeEarned}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Counter Items */}
              {quickItems.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-[#1F2937]">{lbl.counterItems}</h3>
                      <p className="mt-0.5 text-xs font-semibold text-[#6B7280]">{lbl.counterItemsSub}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {quickItems.map(item => {
                      const current = order.items.find(row =>
                        row.menu_item_id === item.id &&
                        (row.is_counter_item || row.isCounterItem || row.item_type === 'counter' || row.itemType === 'counter')
                      )
                      const qty = Number(current?.quantity) || 0
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-[#E5E7EB] bg-[#FBFCFE] p-3"
                        >
                          <button
                            type="button"
                            onClick={() => addQuickItem(item)}
                            className="w-full text-left"
                          >
                            <p className="line-clamp-1 text-[13px] font-black text-[#1F2937]">{getItemName(item, lang)}</p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[#ff5a00]">{formatCurrency(item.price)}</span>
                              {qty > 0 ? (
                                <span className="rounded-lg bg-[#fff1e8] px-2 py-0.5 text-[11px] font-black text-[#ff5a00]">×{qty}</span>
                              ) : (
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0f3b2e] text-white">
                                  <Plus size={13} />
                                </span>
                              )}
                            </div>
                          </button>
                          {qty > 0 && current && (
                            <div className="mt-2 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateBillItemQty(current, qty - 1)}
                                className="flex h-8 flex-1 items-center justify-center rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:bg-red-50 hover:text-red-600"
                              >
                                <Minus size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => updateBillItemQty(current, qty + 1)}
                                className="flex h-8 flex-1 items-center justify-center rounded-lg bg-[#0f3b2e] text-white hover:bg-[#0A2A20]"
                              >
                                <Plus size={12} />
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
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={15} className="text-[#ff5a00]" />
                  <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest">{lbl.loyaltyLabel}</p>
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
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
                    className="min-w-0 flex-1 border-2 border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1F2937] focus:outline-none focus:border-[#ff5a00] transition-all"
                  />
                  <button
                    type="button"
                    onClick={pasteLoyaltyCardNumber}
                    className="flex flex-shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-black text-[#1F2937] transition-colors hover:border-[#ff5a00] hover:text-[#ff5a00]"
                  >
                    <ClipboardPaste size={16} />
                    <span className="hidden sm:inline">{lbl.paste}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => checkLoyaltyCard()}
                    disabled={isCheckingLoyalty}
                    className="rounded-xl bg-[#0f3b2e] px-4 py-2.5 text-sm font-black text-white disabled:bg-gray-200 disabled:text-gray-500"
                  >
                    {isCheckingLoyalty ? '...' : lbl.checkCard}
                  </button>
                </div>
                {loyaltyLookupMessage && (
                  <p className="mt-2 text-[11px] font-bold text-[#6B7280]">{loyaltyLookupMessage}</p>
                )}
                {hasLoyaltyCardEntry && !loyaltyCard && (
                  <button
                    type="button"
                    onClick={clearLoyaltyEntry}
                    className="mt-2 text-[11px] font-black text-[#ff5a00] underline underline-offset-2"
                  >
                    {lbl.clearLoyalty}
                  </button>
                )}
                {loyaltyCard && (
                  <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[#15803D]">{lbl.cardOwner}</p>
                        <p className="mt-1 truncate text-sm font-black text-[#1F2937]">{loyaltyCard.customer_name || lbl.unnamedCardOwner}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-bold text-[#16A34A]">{lbl.cashbackBalance}</p>
                        <button
                          type="button"
                          onClick={fillMaxLoyaltyRedeem}
                          aria-disabled={maxLoyaltyRedeemAmount <= 0}
                          className={`mt-1 font-black underline-offset-2 hover:underline ${
                            maxLoyaltyRedeemAmount > 0
                              ? 'text-[#16A34A] md:cursor-pointer'
                              : 'text-[#9CA3AF] md:cursor-not-allowed'
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
                    value={formatMoneyInput(loyaltyRedeemAmount)}
                    onChange={e => updateLoyaltyRedeem(normalizeMoneyInput(e.target.value))}
                    placeholder={lbl.useLoyalty}
                    className={`w-full border-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1F2937] focus:outline-none transition-all ${
                      loyaltyValidation.ok ? 'border-[#E5E7EB] focus:border-[#ff5a00]' : 'border-red-300 focus:border-red-500'
                    }`}
                  />
                </div>
                {!loyaltyValidation.ok && (
                  <p className="mt-2 text-[11px] font-bold text-red-600">
                    {loyaltyValidation.reason === 'balance' ? lbl.loyaltyBalanceExceeded : lbl.loyaltyBillExceeded}
                  </p>
                )}
                {loyaltyAmt > 0 && loyaltyValidation.ok && (
                  <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 flex justify-between items-center">
                    <span className="text-sm text-[#C2410C] font-medium">{lbl.loyalty}</span>
                    <span className="font-black text-[#C2410C]">− {formatCurrency(loyaltyAmt)}</span>
                  </div>
                )}
                {cashbackToBeEarned > 0 && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[#D97706]">{lbl.cashbackToBeEarned}</span>
                      <span className="font-black text-[#D97706]">+ {formatCurrency(cashbackToBeEarned)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#B45309]">{lbl.cashbackRewardHint}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ══ RIGHT: payment panel ════════════════════════════════════════ */}
            <div className="w-full lg:w-[360px] flex-shrink-0 flex flex-col gap-3 lg:sticky lg:top-0">

              {/* Payment Summary */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
                <h3 className="font-black text-[#1F2937] text-base mb-4">{lbl.paySummary}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6B7280]">{lbl.subtotal}</span>
                    <span className="text-[#1F2937] font-semibold">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6B7280]">{lbl.service}</span>
                    <span className="text-[#1F2937] font-semibold">{formatCurrency(serviceFee)}</span>
                  </div>
                  {counterItemsSubtotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6B7280]">{lbl.counterItems}</span>
                      <span className="text-[#1F2937] font-semibold">{formatCurrency(counterItemsSubtotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6B7280]">{lbl.loyalty}</span>
                    <span className="text-[#1F2937] font-semibold">
                      {loyaltyAmt > 0 ? `− ${formatCurrency(loyaltyAmt)}` : `− 0 UZS`}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-dashed border-[#E5E7EB] flex justify-between items-baseline">
                    <span className="font-black text-[#1F2937] text-sm">{lbl.totalAmt}</span>
                    <span className="font-black text-2xl text-[#ff5a00]"><RollingText text={formatCurrency(total)} /></span>
                  </div>
                  {cashbackToBeEarned > 0 && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#B45309]">{lbl.cashbackRewardHint}</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-[#92400E]">{lbl.cashbackToBeEarned}</span>
                        <span className="font-black text-[#D97706]">+ {formatCurrency(cashbackToBeEarned)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Split Payment */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-black text-[#1F2937] text-sm">{lbl.splitPay}</h3>
                  <button
                    type="button"
                    onClick={addPaymentRow}
                    className="text-[11px] font-black text-[#0f3b2e] hover:text-[#ff5a00]"
                  >
                    + {lbl.addPayment}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {PAY_METHODS.map(m => {
                    const Icon = m.icon
                    const active = payMethod === m.key
                    return (
                      <button
                        key={m.key}
                        onClick={() => selectPaymentMethod(m.key)}
                        className={`flex flex-col items-center gap-2 py-3.5 rounded-xl border-2 font-semibold text-[12px] transition-all ${
                          active
                            ? 'border-[#ff5a00] bg-[#fff1e8] text-[#ff5a00]'
                            : 'border-[#E5E7EB] text-[#6B7280] hover:border-gray-300 bg-white'
                        }`}
                      >
                        <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
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
                    return (
                      <div
                        key={row.id}
                        className={`rounded-xl border p-3 transition-all ${
                          rowOverLimit
                            ? 'border-red-300 bg-red-50'
                            : active ? 'border-[#ff5a00] bg-[#fff7f2]' : 'border-[#E5E7EB] bg-white'
                        }`}
                        onClick={() => {
                          setActivePaymentId(row.id)
                          setPayMethod(row.method)
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2 min-w-[104px]">
                            <Icon size={15} className={active ? 'text-[#ff5a00]' : 'text-[#6B7280]'} />
                            <span className="text-xs font-black text-[#1F2937]">{payLabel(method, lang)}</span>
                          </div>
                          <div className="relative flex-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9 ]*"
                              value={formatMoneyInput(row.amount)}
                              onChange={e => updatePayment(row.id, { amount: normalizeMoneyInput(e.target.value) })}
                              onFocus={() => {
                                setActivePaymentId(row.id)
                                setPayMethod(row.method)
                              }}
                              placeholder="0"
                              className={`w-full border rounded-lg px-3 py-2.5 text-sm font-black text-[#1F2937] pr-11 focus:outline-none transition-colors ${
                                rowOverLimit
                                  ? 'border-red-300 bg-white text-red-700 focus:border-red-500'
                                  : 'border-[#E5E7EB] focus:border-[#ff5a00]'
                              }`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[10px] font-bold">UZS</span>
                          </div>
                          {splitPayments.length > 1 && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                removePaymentRow(row.id)
                              }}
                              className="w-8 h-8 rounded-lg border border-[#E5E7EB] text-[#9CA3AF] hover:text-red-600 hover:border-red-200"
                              aria-label={lbl.removePayment}
                            >
                              ×
                            </button>
                          )}
                        </div>
                        {active && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              fillRemaining(row.id)
                            }}
                            className="mt-2 text-[11px] font-bold text-[#0f3b2e] hover:text-[#ff5a00]"
                          >
                            {lbl.fillRest}
                          </button>
                        )}
                        {rowOverLimit && (
                          <p className="mt-2 text-[11px] font-bold text-red-600">
                            {lbl.exceedsTotal}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-semibold text-[#9CA3AF] mb-2 uppercase tracking-wide">
                    {lbl.quickAmt}
                  </p>
                  <button
                    type="button"
                    onClick={applyExactAmount}
                    className="flex min-h-12 w-full items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-bold text-[#6B7280] transition-all hover:border-[#ff5a00] hover:text-[#ff5a00] active:scale-[0.99]"
                  >
                    {lbl.exact}
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="rounded-xl px-4 py-3 flex justify-between items-center bg-gray-50 border border-gray-100">
                    <span className="text-sm font-semibold text-[#6B7280]">{lbl.paid}</span>
                    <span className="font-black text-lg text-[#1F2937]">{formatCurrency(paidAmount)}</span>
                  </div>
                  <div className={`rounded-xl px-4 py-3 flex justify-between items-center ${
                    isFullyPaid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                  }`}>
                    <span className={`text-sm font-semibold ${isFullyPaid ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {isOverpaid ? lbl.overpaid : isFullyPaid ? lbl.fullyPaid : lbl.remaining}
                    </span>
                    <span className={`font-black text-lg ${isFullyPaid ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {formatCurrency(isOverpaid ? overpaidAmount : isFullyPaid ? 0 : shortfall)}
                    </span>
                  </div>
                  {isOverpaid && (
                    <p className="text-[11px] font-bold text-red-600">
                      {lbl.exceedsTotal}
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-5 space-y-2.5">
                {canDeletePaidOrders(profile || { role: state.user?.role }) && (
                  <SalaryOrderPayment lang={lang} disabled={isProcessingPayment || isRefreshingBill || !loyaltyReady || total <= 0}
                    total={total} loyaltyUsed={loyaltyAmt} cashback={cashbackToBeEarned} cardNumber={loyaltyCard?.card_number}
                    tableId={tableId} orderId={orderId}
                    getFreshQuote={async () => getFreshCashierPaymentQuote({ orders: await refreshCurrentBill(), menuItems: state.menuItems, settings: state.settings, tableId, orderId, loyaltyUsedAmount: loyaltyAmt })}
                    onOpenChange={open => { if (open) salaryBill.current = order; setSalaryCheckoutActive(open) }}
                    onDone={() => { void refreshCurrentBill().catch(() => {}); navigate('/cashier/tables') }} />
                )}
                <button
                  onClick={handlePaid}
                  disabled={!canProcess}
                  className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base transition-all active:scale-[0.98] ${
                    canProcess
                      ? 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-lg shadow-orange-200'
                      : 'bg-gray-100 text-[#9CA3AF] cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 size={19} />
                  {isProcessingPayment ? lbl.processingPay : isRefreshingBill ? lbl.refreshingBill : lbl.confirmPay}
                </button>
                {checkoutBlockMessage && !isProcessingPayment && (
                  <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-[#6B7280]">
                    {checkoutBlockMessage}
                  </p>
                )}
                {paymentRefreshMessage && (
                  <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                    {paymentRefreshMessage.error ? cashierRefreshErrorMessage(paymentRefreshMessage.error, lang) : paymentRefreshMessage}
                  </p>
                )}
                <button
                  onClick={handlePrintBill}
                  disabled={isPrintingBill || isRefreshingBill}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#E5E7EB] text-[#1F2937] font-bold text-sm hover:bg-gray-50 transition-colors disabled:cursor-wait disabled:opacity-50"
                >
                  <Printer size={16} />
                  {isPrintingBill ? lbl.printingBill : lbl.printReceipt}
                </button>

                {canDeleteOrder(order) && (
                  <div className="grid gap-2">
                    <button
                      onClick={() => handleDeleteOrder(order)}
                      disabled={isDeletingOrder}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-colors ${
                        confirmDeleteOrder
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'border-2 border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                      } disabled:opacity-60`}
                    >
                      <Trash2 size={16} />
                      {isDeletingOrder ? lbl.deletingOrder : confirmDeleteOrder ? lbl.confirmDeleteOrder : lbl.deleteOrder}
                    </button>
                    {confirmDeleteOrder && (
                      <button
                        onClick={() => setConfirmDeleteOrder(false)}
                        className="w-full rounded-xl border border-[#E5E7EB] py-2 text-xs font-black text-[#6B7280] hover:bg-gray-50"
                      >
                        {lbl.cancelDelete}
                      </button>
                    )}
                  </div>
                )}

              </div>
            </div>

          </div>
        </div>
        {/* Mobile sticky confirm button */}
        <div className="lg:hidden flex-shrink-0 bg-white border-t border-[#E5E7EB] px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <button
            onClick={handlePaid}
            disabled={!canProcess}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-base transition-all active:scale-[0.98] ${
              canProcess
                ? 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-lg shadow-orange-200'
                : 'bg-gray-100 text-[#9CA3AF] cursor-not-allowed'
            }`}
          >
            <CheckCircle2 size={19} />
            {isProcessingPayment ? lbl.processingPay : isRefreshingBill ? lbl.refreshingBill : lbl.confirmPay}
          </button>
          {checkoutBlockMessage && !isProcessingPayment && (
            <p className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-[#6B7280]">
              {checkoutBlockMessage}
            </p>
          )}
          {paymentRefreshMessage && (
            <p role="alert" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              {paymentRefreshMessage.error ? cashierRefreshErrorMessage(paymentRefreshMessage.error, lang) : paymentRefreshMessage}
            </p>
          )}
        </div>
      </div>

      {printRequest && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lang === 'uz' ? 'Chekni chop etish' : lang === 'ru' ? 'Печать чека' : 'Print receipt'}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
        >
          <div className="flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <Printer size={17} className="text-[#ff5a00]" />
                <p className="text-sm font-black text-[#1F2937]">
                  {lang === 'uz' ? 'Chekni chop etish' : lang === 'ru' ? 'Печать чека' : 'Print receipt'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrintRequest(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6B7280] hover:bg-gray-100 hover:text-[#1F2937]"
                aria-label={lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close'}
              >
                <X size={18} />
              </button>
            </div>
            <iframe
              key={printRequest.key}
              src={printRequest.path}
              title={lang === 'uz' ? 'Chek' : lang === 'ru' ? 'Чек' : 'Receipt'}
              className="min-h-0 flex-1 border-0 bg-white"
            />
          </div>
        </div>
      )}
    </div>
  )
}
