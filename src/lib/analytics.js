import { inferOrderType, isOffPremiseOrderType } from './orderTypes.js'
import { getOrderItemBasePrice, getOrderItemUnitPrice, normalizePriceMode } from './priceModes.js'
import { parseInstantDate, RESTAURANT_UTC_OFFSET_MINUTES } from './dateFormat.js'

export { RESTAURANT_TIME_ZONE, RESTAURANT_UTC_OFFSET_MINUTES } from './dateFormat.js'

function toRestaurantDate(value) {
  const date = parseInstantDate(value)
  if (!date || isNaN(date.getTime())) return null
  return new Date(date.getTime() + RESTAURANT_UTC_OFFSET_MINUTES * 60 * 1000)
}

export function toRestaurantDateStr(value) {
  const date = toRestaurantDate(value)
  if (!date) return ''
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function restaurantTodayStr(now = new Date()) {
  return toRestaurantDateStr(now)
}

export function getRestaurantHour(value = new Date()) {
  const date = toRestaurantDate(value)
  return date ? date.getUTCHours() : 0
}

export function addRestaurantDays(dateStr, days) {
  if (!dateStr) return ''
  const [year, month, day] = String(dateStr).split('-').map(Number)
  if (!year || !month || !day) return ''
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12, 0, 0))
  return toRestaurantDateStr(date)
}

export function isPaidOrder(o) {
  if (!o) return false
  if (o.status === 'cancelled' || o.payment_status === 'cancelled') return false
  return (
    o.payment_status === 'paid' ||
    o.status === 'paid' ||
    o.status === 'completed' ||
    !!o.paid_at
  )
}

export function isActiveNeedsBillOrder(order, tables = []) {
  if (!order || isPaidOrder(order)) return false
  if (order.status !== 'needs_bill') return false
  const table = tables.find(t => t.id === order.table_id)
  return table?.status === 'needs_bill'
}

export function getOrderDate(o) {
  return o?.paid_at || o?.created_at || null
}

export function getOrderActivityDate(order, tables = []) {
  if (!order) return null
  if (isActiveNeedsBillOrder(order, tables)) {
    const table = tables.find(t => t.id === order.table_id)
    return order.updated_at || table?.updated_at || order.created_at || null
  }
  if (isPaidOrder(order)) return order.paid_at || order.updated_at || order.created_at || null
  return order.updated_at || order.created_at || null
}

export function getOrderItems(o) {
  return o?.items || o?.order_items || []
}

export function getSoldOrderItems(order) {
  return getOrderItems(order).filter(item => !isCancelledOrderItem(item))
}

export function getOrderItemCategoryId(item, currentMenuItem = null) {
  if (item && Object.prototype.hasOwnProperty.call(item, 'category_id_snapshot')) {
    return String(item.category_id_snapshot || '').trim() || null
  }
  const legacyItemCategory = String(item?.category_id || '').trim()
  if (legacyItemCategory) return legacyItemCategory
  return String(currentMenuItem?.category_id || '').trim() || null
}

export function mergeOrderItemsByIdentity(primaryItems = [], fallbackItems = []) {
  const merged = []
  const seen = new Set()

  const append = item => {
    if (!item) return
    const key = item.id || item.order_item_id || item.orderItemId
    if (key) {
      if (seen.has(key)) return
      seen.add(key)
    }
    merged.push(item)
  }

  primaryItems.forEach(append)
  fallbackItems.forEach(append)
  return merged
}

export function isCancelledOrderItem(item) {
  return String(item?.status || '').toLowerCase() === 'cancelled'
}

export function isCounterOrderItem(item) {
  const typeText = String(item?.item_type || item?.itemType || '').toLowerCase()
  return !!(
    item?.is_counter_item ||
    item?.isCounterItem ||
    item?.show_in_cashier_quick_items ||
    item?.showInCashierQuickItems ||
    typeText === 'counter' ||
    typeText === 'quick' ||
    typeText === 'cashier_quick'
  )
}

/**
 * The amount printed for one bill line: unit price x quantity, rounded to whole UZS.
 * A weight line such as 84 500 x 0.355 kg is 29 997.5 in floating point; a line never
 * shows a fraction of a so'm. Display only: bill totals keep using getOrderPaymentSummary.
 */
export function getOrderItemLineTotal(item) {
  return Math.round(getOrderItemUnitPrice(item) * (Number(item?.quantity) || 1))
}

export function normalizeServiceRatePct(value, fallbackPct = 20) {
  if (value == null || value === '') {
    const fallback = Number(fallbackPct)
    return Number.isFinite(fallback) ? Math.max(0, Math.min(100, fallback)) : 20
  }

  const pct = Number(value)
  if (Number.isFinite(pct)) return Math.max(0, Math.min(100, pct))

  const fallback = Number(fallbackPct)
  return Number.isFinite(fallback) ? Math.max(0, Math.min(100, fallback)) : 20
}

export function removeSentCartItems(cart = [], sentItems = []) {
  const remainingByKey = new Map()

  for (const item of sentItems) {
    const key = item?.cart_item_key || item?.cartItemKey || item?.menu_item_id
    if (!key) continue
    remainingByKey.set(key, (remainingByKey.get(key) || 0) + (Number(item.quantity) || 0))
  }

  return cart.flatMap(item => {
    const key = item?.cart_item_key || item?.cartItemKey || item?.menu_item_id
    const sentQty = remainingByKey.get(key) || 0
    if (sentQty <= 0) return [item]

    const qty = Number(item.quantity) || 0
    if (sentQty >= qty) {
      remainingByKey.set(key, sentQty - qty)
      return []
    }

    remainingByKey.set(key, 0)
    return [{ ...item, quantity: qty - sentQty }]
  })
}

export function getOrderServiceRatePct(o, fallbackPct = 20) {
  if (isOffPremiseOrderType(inferOrderType(o))) return 0
  const pct = Number(o?.service_rate_pct ?? o?.service_percent ?? o?.servicePercent)
  return Number.isFinite(pct) ? normalizeServiceRatePct(pct, fallbackPct) : normalizeServiceRatePct(fallbackPct)
}

export function getOrderServiceFee(o, fallbackPct = 20) {
  return getOrderPaymentSummary(o, getOrderItems(o), fallbackPct).serviceFee
}

export function getOrderTotal(o, fallbackServicePct = 20) {
  return getOrderPaymentSummary(o, getOrderItems(o), fallbackServicePct).total
}

export function getOrderLoyaltyWalletPaymentAmount(order) {
  return Math.max(0, Math.round(
    Number(
      order?.loyalty_used_amount ??
      order?.loyaltyUsedAmount ??
      order?.loyalty_redeem_amount ??
      order?.loyaltyRedeemAmount ??
      0
    ) || 0
  ))
}

function hasOrderLoyaltyWalletPaymentField(order) {
  return order?.loyalty_used_amount != null ||
    order?.loyaltyUsedAmount != null ||
    order?.loyalty_redeem_amount != null ||
    order?.loyaltyRedeemAmount != null
}

export function getOrderRevenueTotal(o, fallbackServicePct = 20) {
  const storedTotal = Number(o?.total)
  // Checkout freezes the amount actually collected on the order. Historical
  // loaders do not always include every item/service field needed to rebuild
  // that amount, so recalculating a paid order can silently change revenue.
  if (isPaidOrder(o) && o?.total != null && Number.isFinite(storedTotal)) {
    return Math.max(0, Math.round(storedTotal))
  }
  const summary = getOrderPaymentSummary(o, getOrderItems(o), fallbackServicePct)
  return summary.total
}

export function getOrderLoyaltyIncomeTotal(o, fallbackServicePct = 20) {
  const summary = getOrderPaymentSummary(o, getOrderItems(o), fallbackServicePct)
  return Math.max(0, Math.round(Number(summary.loyaltyUsedAmount) || 0))
}

export function getOrderSalesValueTotal(o, fallbackServicePct = 20) {
  return getOrderRevenueTotal(o, fallbackServicePct) +
    getOrderLoyaltyIncomeTotal(o, fallbackServicePct)
}

export function getLoyaltyUsedAmount(order) {
  return Math.max(0, Math.round(
    Number(
      order?.loyalty_used_amount ??
      order?.loyaltyUsedAmount ??
      order?.loyalty_redeem_amount ??
      order?.loyaltyRedeemAmount ??
      order?.loyalty_discount_amount ??
      order?.discount_amount ??
      0
    ) || 0
  ))
}

export function normalizeCashbackPercent(value, fallbackPct = 0) {
  const pct = Number(value)
  if (Number.isFinite(pct)) return Math.max(0, Math.min(100, pct))
  const fallback = Number(fallbackPct)
  return Number.isFinite(fallback) ? Math.max(0, Math.min(100, fallback)) : 0
}

export function calculateLoyaltyCashback(order, items = getOrderItems(order), cashbackPercent = 0) {
  if (order?.status === 'cancelled' || order?.payment_status === 'cancelled') return 0
  const summary = getOrderPaymentSummary(order, items)
  const loyaltyUsed = getLoyaltyUsedAmount(order)
  const cashbackBase = Math.max(0, summary.grossAmount - loyaltyUsed)
  return Math.floor(cashbackBase * normalizeCashbackPercent(cashbackPercent) / 100)
}

export function validateLoyaltyRedeemAmount(amount, availableBalance, remainingBillTotal) {
  const redeemAmount = Math.round(Number(amount) || 0)
  const balance = Math.max(0, Math.round(Number(availableBalance) || 0))
  const billTotal = Math.max(0, Math.round(Number(remainingBillTotal) || 0))

  if (redeemAmount <= 0) return { ok: true, amount: 0 }
  if (redeemAmount > balance) {
    return { ok: false, amount: redeemAmount, reason: 'balance' }
  }
  if (redeemAmount > billTotal) {
    return { ok: false, amount: redeemAmount, reason: 'bill' }
  }
  return { ok: true, amount: redeemAmount }
}

export function getMaxLoyaltyRedeemAmount(availableBalance, remainingOrderAmount) {
  const balance = Math.max(0, Math.round(Number(availableBalance) || 0))
  const remaining = Math.max(0, Math.round(Number(remainingOrderAmount) || 0))
  return Math.min(balance, remaining)
}

export function clampMoneyInput(value, max) {
  const safeMax = Math.max(0, Math.round(Number(max) || 0))
  if (value == null || value === '') return 0

  const raw = String(value).trim()
  if (!raw) return 0
  if (/[eE.+-]/.test(raw)) return 0

  const normalized = raw.replace(/[\s,_]/g, '')
  if (!/^\d+$/.test(normalized)) return 0
  if (safeMax <= 0) return 0

  try {
    const typed = BigInt(normalized)
    const maxInt = BigInt(safeMax)
    if (typed > maxInt) return safeMax
    return Number(typed)
  } catch {
    return safeMax
  }
}

export function getMaxPaymentAmount(remainingAmount) {
  return Math.max(0, Math.round(Number(remainingAmount) || 0))
}

export function getOrderPaymentSummary(order, items = getOrderItems(order), fallbackServicePct = 20) {
  const sourceItems = items || []
  const billableItems = sourceItems.filter(item => !isCancelledOrderItem(item))
  const hasItems = sourceItems.length > 0
  const menuItemsSubtotal = billableItems.reduce(
    (s, i) => isCounterOrderItem(i) ? s : s + getOrderItemUnitPrice(i) * (Number(i.quantity) || 1),
    0
  )
  const counterItemsSubtotal = billableItems.reduce(
    (s, i) => isCounterOrderItem(i) ? s + getOrderItemUnitPrice(i) * (Number(i.quantity) || 1) : s,
    0
  )
  const itemsSubtotal = menuItemsSubtotal + counterItemsSubtotal
  const counterSubtotal = hasItems
    ? counterItemsSubtotal
    : Number(order?.counter_items_subtotal ?? order?.counterItemsSubtotal ?? 0) || 0
  const subtotal = hasItems ? itemsSubtotal : (Number(order?.subtotal) || 0)
  const storedMenuSubtotal = Number(order?.menu_items_subtotal ?? order?.menuItemsSubtotal)
  const menuSubtotal = hasItems
    ? menuItemsSubtotal
    : Number.isFinite(storedMenuSubtotal)
      ? storedMenuSubtotal
      : Math.max(0, subtotal - counterSubtotal)

  if (!hasItems && subtotal <= 0 && Number(order?.total) > 0) {
    const serviceRatePct = getOrderServiceRatePct(order, fallbackServicePct)
    const serviceFee = Number(order?.service_fee) || 0
    const loyaltyUsedAmount = getLoyaltyUsedAmount(order)
    return {
      subtotal: 0,
      menuItemsSubtotal: 0,
      normalItemsSubtotal: 0,
      counterItemsSubtotal: 0,
      serviceFeeBase: 0,
      discountBase: serviceFee,
      discountPercent: 0,
      discountAmount: loyaltyUsedAmount,
      loyaltyUsedAmount,
      cashbackEarned: Math.max(0, Math.round(Number(order?.cashback_earned ?? order?.cashbackEarned ?? 0) || 0)),
      grossAmount: serviceFee,
      afterDiscount: Number(order.total),
      serviceRatePct,
      serviceFee,
      total: Number(order.total),
    }
  }

  const discPct = Number(order?.loyalty_discount_pct ?? order?.discount_percent ?? 0) || 0
  const serviceRatePct = getOrderServiceRatePct(order, fallbackServicePct)
  const serviceFeeBase = serviceRatePct > 0 ? menuSubtotal : 0
  const serviceFee = Math.round(serviceFeeBase * serviceRatePct / 100)
  const discountBase = menuSubtotal + serviceFee
  const hasWalletAmount = order?.loyalty_used_amount != null ||
    order?.loyaltyUsedAmount != null ||
    order?.loyalty_redeem_amount != null ||
    order?.loyaltyRedeemAmount != null
  const legacyDiscountAmount = !hasWalletAmount && isPaidOrder(order) && discPct > 0
    ? Math.round(discountBase * discPct / 100)
    : 0
  const loyaltyUsedAmount = hasWalletAmount
    ? getLoyaltyUsedAmount(order)
    : legacyDiscountAmount || getLoyaltyUsedAmount({ ...order, loyalty_discount_amount: order?.loyalty_discount_amount, discount_amount: order?.discount_amount })
  const discountAmount = Math.min(loyaltyUsedAmount, subtotal + serviceFee)
  const grossAmount = subtotal + serviceFee
  const afterDiscount = Math.max(0, grossAmount - discountAmount)

  return {
    subtotal,
    menuItemsSubtotal: menuSubtotal,
    normalItemsSubtotal: menuSubtotal,
    counterItemsSubtotal: counterSubtotal,
    serviceFeeBase,
    discountBase,
    discountPercent: legacyDiscountAmount > 0 ? discPct : 0,
    discountAmount,
    loyaltyUsedAmount: discountAmount,
    cashbackEarned: Math.max(0, Math.round(Number(order?.cashback_earned ?? order?.cashbackEarned ?? 0) || 0)),
    grossAmount,
    afterDiscount,
    serviceRatePct,
    serviceFee,
    total: afterDiscount,
  }
}

export function getOrderPaymentFields(order, items = getOrderItems(order), fallbackServicePct = 20) {
  const summary = getOrderPaymentSummary(order, items, fallbackServicePct)
  const fields = {
    subtotal: summary.subtotal,
    service_fee: summary.serviceFee,
    service_rate_pct: summary.serviceRatePct,
    total: summary.total,
  }

  if (summary.discountPercent > 0) {
    fields.loyalty_discount_pct = summary.discountPercent
  }

  if (summary.discountAmount > 0) {
    fields.loyalty_discount_amount = summary.discountAmount
    fields.loyalty_used_amount = summary.discountAmount
    fields.loyalty_redeem_amount = summary.discountAmount
  }

  return fields
}

export function normalizePaymentMethod(method) {
  const raw = String(method || '').toLowerCase().trim()
  if (raw === 'qr' || raw === 'qr_code' || raw === 'qr-code' || raw === 'qrcode') return 'terminal'
  if (raw === 'loyalty' || raw === 'loyalty-card' || raw === 'loyalty_card') return 'loyalty_card'
  if (['cash', 'card', 'terminal', 'loyalty_card', 'other', 'mixed'].includes(raw)) return raw
  return raw || 'unknown'
}

export function getOrderPayments(order) {
  const rows = order?.payments || order?.order_payments || []
  if (Array.isArray(rows) && rows.length > 0) {
    return rows
      .map(row => ({
        ...row,
        method: normalizePaymentMethod(row.method || row.payment_method),
        amount: Math.round(Number(row.amount) || 0),
      }))
      .filter(row => row.amount > 0)
  }

  if (!isPaidOrder(order)) return []

  const total = getOrderRevenueTotal(order)
  if (total <= 0) return []

  return [{
    method: normalizePaymentMethod(order?.payment_method),
    amount: total,
  }]
}

export function normalizeSplitPayments(payments, total) {
  const due = Math.max(0, Math.round(Number(total) || 0))
  const rows = (payments || [])
    .map(row => ({
      method: normalizePaymentMethod(row.method || row.payment_method),
      amount: Math.round(Number(row.amount) || 0),
    }))
    .filter(row => row.amount > 0 && row.method !== 'mixed')

  if (due <= 0) return []
  if (rows.length === 0) return [{ method: 'cash', amount: due }]

  const sum = rows.reduce((s, row) => s + row.amount, 0)
  if (sum <= due) return rows

  const adjusted = rows.map(row => ({ ...row }))
  let overpay = sum - due
  const cashIndex = adjusted.map(row => row.method).lastIndexOf('cash')
  const preferredIndex = cashIndex >= 0 ? cashIndex : adjusted.length - 1

  for (let offset = 0; offset < adjusted.length && overpay > 0; offset += 1) {
    const index = (preferredIndex - offset + adjusted.length) % adjusted.length
    const reduction = Math.min(adjusted[index].amount, overpay)
    adjusted[index].amount -= reduction
    overpay -= reduction
  }

  return adjusted.filter(row => row.amount > 0)
}

export function getSplitPaymentValidation(payments, total) {
  const due = Math.max(0, Math.round(Number(total) || 0))
  const paidAmount = (payments || []).reduce(
    (sum, row) => sum + Math.max(0, Math.round(Number(row.amount) || 0)),
    0
  )
  const overpaidAmount = Math.max(0, paidAmount - due)
  const remainingAmount = Math.max(0, due - paidAmount)
  const isFullyPaid = due > 0 && paidAmount === due

  return {
    totalAmount: due,
    paidAmount,
    remainingAmount,
    overpaidAmount,
    isOverpaid: overpaidAmount > 0,
    isFullyPaid,
    canConfirmPayment: isFullyPaid && overpaidAmount === 0,
  }
}

export function getPaymentMethodSummary(payments, fallbackMethod = null) {
  const rows = (payments || []).filter(row => Number(row.amount) > 0)
  if (rows.length === 0) return normalizePaymentMethod(fallbackMethod)
  const methods = [...new Set(rows.map(row => normalizePaymentMethod(row.method || row.payment_method)))]
  return methods.length === 1 ? methods[0] : 'mixed'
}

export function allocateSplitPaymentsToOrders(orderTotals, payments) {
  const totals = (orderTotals || [])
    .map(row => ({
      order_id: row.order_id || row.orderId || row.id,
      total: Math.max(0, Math.round(Number(row.total) || 0)),
    }))
    .filter(row => row.order_id && row.total > 0)
  const totalDue = totals.reduce((sum, row) => sum + row.total, 0)
  const normalizedPayments = normalizeSplitPayments(payments, totalDue)
  const remainingByOrder = new Map(totals.map(row => [row.order_id, row.total]))
  const allocations = []

  normalizedPayments.forEach(payment => {
    let remainingPayment = payment.amount
    for (const orderRow of totals) {
      if (remainingPayment <= 0) break
      const remainingOrder = remainingByOrder.get(orderRow.order_id) || 0
      if (remainingOrder <= 0) continue
      const amount = Math.min(remainingPayment, remainingOrder)
      allocations.push({
        order_id: orderRow.order_id,
        method: payment.method,
        amount,
      })
      remainingByOrder.set(orderRow.order_id, remainingOrder - amount)
      remainingPayment -= amount
    }
  })

  return allocations
}

export function getOrderPaymentBreakdown(order) {
  const map = {}
  getOrderPayments(order).forEach(row => {
    const method = normalizePaymentMethod(row.method)
    map[method] = (map[method] || 0) + (Number(row.amount) || 0)
  })
  if (isPaidOrder(order)) {
    const walletPayment = getOrderLoyaltyIncomeTotal(order)
    if (walletPayment > 0 && !map.loyalty_card) {
      map.loyalty_card = (map.loyalty_card || 0) + walletPayment
    }
  }
  return Object.entries(map).map(([method, amount]) => ({ method, amount }))
}

function stableStringify(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${key}:${stableStringify(value[key])}`).join(',')}}`
  }
  return String(value)
}

export function getOrderItemProductId(item) {
  return item?.menu_item_id ?? item?.menuItemId ?? item?.product_id ?? item?.productId ?? null
}

// Each entry lists a canonical grouping field followed by its aliases, so a
// cart row (camelCase) and a stored row (snake_case) produce the same key.
const ORDER_ITEM_OPTION_FIELDS = [
  ['variant_id', 'variantId'],
  ['size_id', 'sizeId'],
  ['modifiers', 'selected_modifiers', 'selectedModifiers'],
  ['options'],
  ['selected_options', 'selectedOptions'],
  ['extras', 'selected_extras', 'selectedExtras'],
  ['notes'],
  ['order_type', 'orderType'],
  ['service_type', 'serviceType'],
  ['dining_type', 'diningType'],
  ['fulfillment_type', 'fulfillmentType'],
  ['is_takeaway', 'isTakeAway'],
  ['item_type', 'itemType'],
  ['is_counter_item', 'isCounterItem'],
  ['price_mode', 'priceMode'],
  ['base_price', 'basePrice'],
  ['unit_price', 'unitPrice'],
]

function isEmptyGroupingValue(value) {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.values(value).every(isEmptyGroupingValue)
  return false
}

function countSelectedOptions(item) {
  const selected = item?.selected_options ?? item?.selectedOptions
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) return 0
  return Object.values(selected).filter(value => !isEmptyGroupingValue(value)).length
}

// Variant choices are written into notes as "<localized group title>: <localized label>"
// lines ahead of the manual note. The language depends on the waiter's UI, so a
// second round sent in another language must not split an identical dish. When
// selected_options carries the choice, those leading lines are redundant.
export function getOrderItemGroupingNotes(item) {
  const lines = String(item?.notes || '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  let generatedLines = countSelectedOptions(item)
  while (generatedLines > 0 && lines.length > 0 && lines[0].includes(':')) {
    lines.shift()
    generatedLines -= 1
  }
  return lines
    .map(line => line.replace(/^(?:Variants|Варианты|Variantlar)\s*:\s*/i, 'variants:'))
    .join('\n')
}

export function getOrderItemOptionsKey(item) {
  const selected = {}
  ORDER_ITEM_OPTION_FIELDS.forEach(([field, ...aliases]) => {
    let value = [field, ...aliases].map(name => item?.[name]).find(candidate => candidate != null)
    if (field === 'notes') value = getOrderItemGroupingNotes(item)
    if (field === 'price_mode') value = normalizePriceMode(value)
    if (!isEmptyGroupingValue(value)) selected[field] = value
  })
  return stableStringify(selected)
}

export function getGroupedOrderItems(items, resolveName) {
  const grouped = new Map()

  items.forEach((item, index) => {
    if (isCancelledOrderItem(item)) return

    const productId = getOrderItemProductId(item)
    const key = productId != null
      ? `${productId}::${getOrderItemOptionsKey(item)}::${getOrderItemUnitPrice(item)}::${item.sale_unit || item.saleUnit || ''}`
      : `row::${item.id || index}`
    const existing = grouped.get(key)

    if (existing) {
      grouped.set(key, {
        ...existing,
        quantity: (Number(existing.quantity) || 1) + (Number(item.quantity) || 1),
        source_item_ids: [
          ...(existing.source_item_ids || (existing.id ? [existing.id] : [])),
          ...(item.source_item_ids || (item.id ? [item.id] : [])),
        ],
      })
      return
    }

    grouped.set(key, {
      ...item,
      name: resolveName ? resolveName(item) : item.name,
      price: getOrderItemUnitPrice(item),
      unit_price: getOrderItemUnitPrice(item),
      base_price: getOrderItemBasePrice(item),
      price_mode: normalizePriceMode(item.price_mode ?? item.priceMode),
      source_item_ids: item.source_item_ids || (item.id ? [item.id] : []),
    })
  })

  return Array.from(grouped.values())
}

export function toLocalDateStr(iso) {
  return toRestaurantDateStr(iso)
}

export function matchesRange(o, from, to) {
  if (!from && !to) return true
  const ds = toLocalDateStr(getOrderDate(o))
  if (!ds) return false
  if (from && ds < from) return false
  if (to && ds > to) return false
  return true
}

function getGroupedServiceRatePct(order) {
  const servicePct = Number(order?.service_rate_pct ?? order?.service_percent ?? order?.servicePercent)
  return Number.isFinite(servicePct) ? servicePct : null
}

export function groupOrdersBySession(orders) {
  const map = {}

  orders.forEach(o => {
    const anchor = o.paid_at
      ? o.paid_at.slice(0, 16)
      : (o.created_at || '').slice(0, 10)
    const isOffPremise = isOffPremiseOrderType(inferOrderType(o))
    const key = isOffPremise || !o.table_id ? `order::${o.id}` : `${o.table_id}::${anchor}`

    if (!map[key]) {
      map[key] = {
        ...o,
        items: [...getOrderItems(o)],
        total: Number(o.total) || 0,
        subtotal: Number(o.subtotal) || 0,
        service_fee: Number(o.service_fee) || 0,
        service_rate_pct: getGroupedServiceRatePct(o),
        loyalty_discount_pct: Number(o.loyalty_discount_pct ?? o.discount_percent) || 0,
        loyalty_discount_amount: Number(o.loyalty_discount_amount) || 0,
        cashback_earned: Number(o.cashback_earned) || 0,
        ...(hasOrderLoyaltyWalletPaymentField(o)
          ? {
              loyalty_used_amount: Number(o.loyalty_used_amount ?? o.loyaltyUsedAmount) || 0,
              loyalty_redeem_amount: Number(o.loyalty_redeem_amount ?? o.loyaltyRedeemAmount) || 0,
            }
          : {}),
        payments: [...getOrderPayments(o)],
        _orderCount: 1,
        _mergedIds: [o.id],
      }
      return
    }

    const session = map[key]
    session.items = [...session.items, ...getOrderItems(o)]
    session.total = (session.total || 0) + (Number(o.total) || 0)
    session.subtotal = (session.subtotal || 0) + (Number(o.subtotal) || 0)
    session.service_fee = (session.service_fee || 0) + (Number(o.service_fee) || 0)
    const servicePct = Number(o.service_rate_pct ?? o.service_percent ?? o.servicePercent)
    if (session.service_rate_pct == null && Number.isFinite(servicePct)) {
      session.service_rate_pct = servicePct
    }
    session.loyalty_discount_amount =
      (session.loyalty_discount_amount || 0) + (Number(o.loyalty_discount_amount) || 0)
    if (hasOrderLoyaltyWalletPaymentField(o) || hasOrderLoyaltyWalletPaymentField(session)) {
      session.loyalty_used_amount =
        (session.loyalty_used_amount || 0) + (Number(o.loyalty_used_amount ?? o.loyaltyUsedAmount) || 0)
      session.loyalty_redeem_amount =
        (session.loyalty_redeem_amount || 0) + (Number(o.loyalty_redeem_amount ?? o.loyaltyRedeemAmount) || 0)
    }
    session.cashback_earned =
      (session.cashback_earned || 0) + (Number(o.cashback_earned) || 0)
    session.payments = [...(session.payments || []), ...getOrderPayments(o)]
    const discountPct = Number(o.loyalty_discount_pct ?? o.discount_percent)
    if (!session.loyalty_discount_pct && Number.isFinite(discountPct)) {
      session.loyalty_discount_pct = discountPct
    }
    session._mergedIds = [...(session._mergedIds || []), o.id]
    session._orderCount += 1

    if (!session.payment_method && o.payment_method) session.payment_method = o.payment_method
    if (o.created_at && parseInstantDate(o.created_at) < parseInstantDate(session.created_at)) session.created_at = o.created_at
    if (o.updated_at && (!session.updated_at || parseInstantDate(o.updated_at) > parseInstantDate(session.updated_at))) {
      session.updated_at = o.updated_at
    }
    if (o.paid_at && (!session.paid_at || parseInstantDate(o.paid_at) > parseInstantDate(session.paid_at))) {
      session.paid_at = o.paid_at
    }
  })

  return Object.values(map)
}

function parseIsoCalendarDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null
  return time
}

export function getInclusiveCalendarDayCount(from, to) {
  const fromTime = parseIsoCalendarDay(from)
  const toTime = parseIsoCalendarDay(to)
  if (fromTime == null || toTime == null || fromTime > toTime) return 0
  return Math.floor((toTime - fromTime) / (24 * 60 * 60 * 1000)) + 1
}

export function getCafeIncomeForRange(orders = [], from, to, now = new Date()) {
  const today = restaurantTodayStr(now)
  const requestedTo = parseIsoCalendarDay(to) == null ? today : to
  const effectiveTo = requestedTo > today ? today : requestedTo
  const requestedFrom = parseIsoCalendarDay(from) == null ? '' : from
  const rangeOrders = groupOrdersBySession(orders)
    .filter(order => isPaidOrder(order) && matchesRange(order, requestedFrom, effectiveTo))
  const total = rangeOrders.reduce((sum, order) => sum + getOrderRevenueTotal(order), 0)
  const loyaltyTotal = rangeOrders.reduce((sum, order) => sum + getOrderLoyaltyIncomeTotal(order), 0)
  const salesDayCount = new Set(
    rangeOrders
      .map(order => toRestaurantDateStr(getOrderDate(order)))
      .filter(Boolean)
  ).size
  const effectiveFrom = requestedFrom || rangeOrders
    .map(order => toRestaurantDateStr(getOrderDate(order)))
    .filter(Boolean)
    .sort()[0] || effectiveTo
  const dayCount = getInclusiveCalendarDayCount(effectiveFrom, effectiveTo)

  return {
    total,
    loyaltyTotal,
    salesValueTotal: total + loyaltyTotal,
    averageDaily: dayCount > 0 ? Math.round(total / dayCount) : 0,
    dayCount,
    salesDayCount,
    from,
    to,
    effectiveTo,
  }
}

export function getMonthToDateCafeIncome(orders = [], now = new Date()) {
  const today = restaurantTodayStr(now)
  const monthStart = `${today.slice(0, 8)}01`
  return getCafeIncomeForRange(orders, monthStart, today, now)
}
