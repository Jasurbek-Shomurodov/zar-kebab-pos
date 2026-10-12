import {
  getOrderPaymentSummary,
  isCancelledOrderItem,
  isPaidOrder,
} from './analytics.js'
import { inferOrderType, isOffPremiseOrderType, isDeliveryOrderType, isTakeAwayOrderType } from './orderTypes.js'

export function isTakeAwayBill(order) {
  return isTakeAwayOrderType(inferOrderType(order))
}

export function isDeliveryBill(order) {
  return isDeliveryOrderType(inferOrderType(order))
}

export function isOffPremiseBill(order) {
  return isOffPremiseOrderType(inferOrderType(order))
}

export function getCashierBillableItems(order) {
  return (order?.items || []).filter(item => !isCancelledOrderItem(item))
}

export function isCashierVisibleBill(order) {
  if (!order || order.payment_status === 'paid' || order.status === 'cancelled') return false
  if (!isOffPremiseBill(order) && order.status !== 'needs_bill') return false
  const billableItems = getCashierBillableItems(order)
  if (billableItems.length === 0) return false
  return getOrderPaymentSummary(order, billableItems, order.service_rate_pct).total > 0
}

// One cashier bill per table for dine-in; take-away/delivery stay one bill per order.
export function cashierBillKey(order) {
  return isOffPremiseBill(order) || !order?.table_id ? `order:${order?.id}` : `table:${order.table_id}`
}

/** Bills waiting on the cashier, counted the same way the Cashier page groups them. */
export function countCashierAttentionBills(orders = []) {
  return new Set(orders.filter(isCashierVisibleBill).map(cashierBillKey)).size
}

// Recovery candidates only; empty shells must never become payable bills.
export function getEmptyCashierOrders(orders = [], { tableId, orderId } = {}) {
  if (!tableId && !orderId) return []
  return orders.filter(order =>
    (orderId ? order.id === orderId : order.table_id === tableId) &&
    !isPaidOrder(order) && order.status !== 'cancelled' && order.payment_status !== 'cancelled' &&
    Array.isArray(order.items) && getCashierBillableItems(order).length === 0
  )
}

// Quick items (e.g. disposable dishes) belong to the bill the cashier is looking at,
// never to the oldest unpaid row. An old leftover shell would otherwise absorb the
// item and be billed together with a different waiter's table.
export function pickQuickItemOrder(orders = [], { tableId, orderId } = {}) {
  if (!tableId && !orderId) return null
  const candidates = orders.filter(order =>
    (orderId ? order?.id === orderId : order?.table_id === tableId) &&
    !isPaidOrder(order) && order.status !== 'cancelled' && order.payment_status !== 'cancelled'
  )
  const newestFirst = [...candidates].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')))
  return newestFirst.find(order => getCashierBillableItems(order).length > 0) || newestFirst[0] || null
}
