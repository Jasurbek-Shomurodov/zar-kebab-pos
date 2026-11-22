import { getOrderPaymentSummary, isCancelledOrderItem } from './analytics.js'
import { isCashierQuickItem } from './menuItems.js'
import { inferOrderType, isOffPremiseOrderType } from './orderTypes.js'
import { getConfiguredServiceRatePct } from './serviceRates.js'
import { getOrderItemUnitPrice, normalizePriceMode } from './priceModes.js'

function isOpenSettlementOrder(order) {
  return order &&
    order.payment_status !== 'paid' &&
    !order.paid_at &&
    !['paid', 'completed', 'cancelled'].includes(String(order.status || '').toLowerCase())
}

function getQuoteOrderItems(order, menuById) {
  return (order.items || order.order_items || [])
    .filter(item => (
      !isCancelledOrderItem(item) &&
      Number(item.quantity) > 0 &&
      getOrderItemUnitPrice(item) > 0
    ))
    .map(item => {
      const menuItem = menuById.get(item.menu_item_id)
      const isCounter = isCashierQuickItem(menuItem) || item.is_counter_item || item.isCounterItem
      return isCounter
        ? { ...item, item_type: item.item_type || item.itemType || 'counter', is_counter_item: true }
        : item
    })
}

/**
 * Sum an order group without flattening its saved service-rate snapshots.
 * Empty/cancelled shells never contribute metadata or stale stored totals.
 */
export function getOrderGroupPaymentQuote({
  orders = [],
  menuItems = [],
  settings = {},
  ignoreStoredLoyalty = false,
} = {}) {
  const menuById = new Map(menuItems.map(item => [item.id, item]))
  let subtotal = 0
  let serviceFee = 0
  let counterItemsSubtotal = 0
  let grossAmount = 0
  let loyaltyUsedAmount = 0
  let cashbackEarned = 0
  let total = 0
  let primaryOrderId = null
  const contributingOrderIds = []
  const contributingPriceModes = new Set()
  const contributingServiceRates = new Set()

  for (const order of orders) {
    const orderType = inferOrderType(order)
    const fallbackServiceRatePct = getConfiguredServiceRatePct(settings, order.price_mode)
    const serviceRatePct = isOffPremiseOrderType(orderType)
      ? 0
      : Number.isFinite(Number(order.service_rate_pct))
        ? Number(order.service_rate_pct)
        : fallbackServiceRatePct
    const items = getQuoteOrderItems(order, menuById)

    // Item rows are authoritative. This rejects empty shells whose old stored
    // subtotal or total columns were never cleared.
    if (items.length === 0) continue

    const summary = getOrderPaymentSummary(
      {
        ...order,
        order_type: orderType,
        service_rate_pct: serviceRatePct,
        ...(ignoreStoredLoyalty ? { loyalty_used_amount: 0 } : {}),
      },
      items,
      fallbackServiceRatePct
    )
    if (summary.grossAmount <= 0) continue

    subtotal += summary.subtotal
    serviceFee += summary.serviceFee
    counterItemsSubtotal += Number(summary.counterItemsSubtotal) || 0
    grossAmount += summary.grossAmount
    loyaltyUsedAmount += summary.loyaltyUsedAmount
    cashbackEarned += summary.cashbackEarned
    total += summary.total
    if (!primaryOrderId) primaryOrderId = order.id
    contributingOrderIds.push(order.id)
    contributingPriceModes.add(normalizePriceMode(order.price_mode))
    contributingServiceRates.add(summary.serviceRatePct)
  }

  return {
    subtotal,
    serviceFee,
    counterItemsSubtotal,
    grossAmount,
    loyaltyUsedAmount,
    cashbackEarned,
    total,
    primaryOrderId,
    contributingOrderIds,
    priceMode: contributingPriceModes.size === 1 ? [...contributingPriceModes][0] : null,
    priceModes: [...contributingPriceModes],
    serviceRatePct: contributingServiceRates.size === 1 ? [...contributingServiceRates][0] : null,
  }
}

/**
 * Recompute the cashier target from freshly loaded order rows using the same
 * per-order snapshots that the atomic database settlement uses.
 */
export function getFreshCashierPaymentQuote({
  orders = [],
  menuItems = [],
  settings = {},
  tableId = null,
  orderId = null,
  loyaltyUsedAmount = 0,
} = {}) {
  const targets = orders.filter(order => (
    (orderId ? order.id === orderId : order.table_id === tableId) &&
    isOpenSettlementOrder(order)
  ))

  const quote = getOrderGroupPaymentQuote({
    orders: targets,
    menuItems,
    settings,
    ignoreStoredLoyalty: true,
  })

  // Round exactly as applyLoyaltyToCashierPaymentQuote does for the total on screen. A weight
  // line such as 42 000 x 0.7 kg is 29399.999999999996 in floating point; comparing that with
  // the shown 29 400 reported "bill changed" on every Confirm tap and the bill could not be paid.
  const grossAmount = Math.max(0, Math.round(Number(quote.grossAmount) || 0))
  const loyalty = Math.min(
    grossAmount,
    Math.max(0, Math.round(Number(loyaltyUsedAmount) || 0))
  )

  return {
    ...quote,
    grossAmount,
    orderIds: targets.map(order => order.id),
    loyaltyUsedAmount: loyalty,
    total: Math.max(0, grossAmount - loyalty),
  }
}

export function applyLoyaltyToCashierPaymentQuote(quote, loyaltyUsedAmount = 0) {
  const grossAmount = Math.max(0, Math.round(Number(quote?.grossAmount) || 0))
  const loyalty = Math.min(
    grossAmount,
    Math.max(0, Math.round(Number(loyaltyUsedAmount) || 0))
  )

  return {
    subtotal: Math.max(0, Math.round(Number(quote?.subtotal) || 0)),
    serviceFee: Math.max(0, Math.round(Number(quote?.serviceFee) || 0)),
    serviceRatePct: quote?.serviceRatePct ?? null,
    counterItemsSubtotal: Math.max(0, Math.round(Number(quote?.counterItemsSubtotal) || 0)),
    grossAmount,
    loyaltyUsedAmount: loyalty,
    total: Math.max(0, grossAmount - loyalty),
  }
}

export function canConfirmCashierCheckout({
  canEditCashier,
  paymentValidation,
  loyaltyReady,
  grossAmount,
  loyaltyUsedAmount,
  isProcessingPayment,
  isRefreshingBill,
} = {}) {
  const gross = Math.max(0, Math.round(Number(grossAmount) || 0))
  const loyalty = Math.max(0, Math.round(Number(loyaltyUsedAmount) || 0))
  const loyaltyOnly = gross > 0 && loyalty >= gross && Number(paymentValidation?.totalAmount) === 0

  return !!(
    canEditCashier &&
    loyaltyReady &&
    (paymentValidation?.canConfirmPayment || loyaltyOnly) &&
    !isProcessingPayment &&
    !isRefreshingBill
  )
}
