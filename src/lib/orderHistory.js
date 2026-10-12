import { isPaidOrder, matchesRange, restaurantTodayStr } from './analytics.js'
import { supabase } from './supabase.js'

export const ORDER_HISTORY_PAGE_SIZE = 500
const ORDER_HISTORY_SELECT = '*, items:order_items(*), payments:order_payments(*)'
const ORDER_HISTORY_SELECT_WITHOUT_PAYMENTS = '*, items:order_items(*)'

function normalizeIsoDate(value, fallback) {
  const date = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback
}

function addIsoDateDays(value, days) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10)
}

export function getOrderHistoryRangeBounds(dateFrom, dateTo) {
  const today = restaurantTodayStr()
  const from = normalizeIsoDate(dateFrom, today)
  const to = normalizeIsoDate(dateTo, from)
  return {
    dateFrom: from,
    dateTo: to,
    instantFrom: `${from}T00:00:00+05:00`,
    instantToExclusive: `${addIsoDateDays(to, 1)}T00:00:00+05:00`,
  }
}

export async function collectPagedRows(loadPage, pageSize = ORDER_HISTORY_PAGE_SIZE) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const result = await loadPage(offset, offset + pageSize - 1)
    if (result?.error) throw result.error
    const page = result?.data || []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

function isMissingPaymentsRelation(error) {
  return /order_payments|schema cache|relation/i.test(error?.message || '')
}

async function queryPaidOrderPages(dbClient, select, bounds, pageSize) {
  const [withPaidTimestamp, legacyPaid] = await Promise.all([
    collectPagedRows(
      (from, to) => dbClient
        .from('orders')
        .select(select)
        .not('paid_at', 'is', null)
        .gte('paid_at', bounds.instantFrom)
        .lt('paid_at', bounds.instantToExclusive)
        .order('paid_at', { ascending: false })
        .range(from, to),
      pageSize
    ),
    collectPagedRows(
      (from, to) => dbClient
        .from('orders')
        .select(select)
        .is('paid_at', null)
        .or('payment_status.eq.paid,status.eq.paid,status.eq.completed')
        .gte('created_at', bounds.instantFrom)
        .lt('created_at', bounds.instantToExclusive)
        .order('created_at', { ascending: false })
        .range(from, to),
      pageSize
    ),
  ])

  return [...withPaidTimestamp, ...legacyPaid]
}

async function queryOrdersWithoutPaidTimestamp(dbClient, select, bounds, pageSize) {
  return collectPagedRows(
    (from, to) => dbClient
      .from('orders')
      .select(select)
      .is('paid_at', null)
      .gte('created_at', bounds.instantFrom)
      .lt('created_at', bounds.instantToExclusive)
      .order('created_at', { ascending: false })
      .range(from, to),
    pageSize
  )
}

async function queryActiveOrderPages(dbClient, select, pageSize) {
  return collectPagedRows(
    (from, to) => dbClient
      .from('orders')
      .select(select)
      .or('payment_status.neq.paid,payment_status.is.null')
      .is('paid_at', null)
      .or('status.not.in.(paid,completed,cancelled),status.is.null')
      .order('created_at', { ascending: false })
      .range(from, to),
    pageSize
  )
}

export async function loadPaidOrdersForRange(dateFrom, dateTo, options = {}) {
  const dbClient = options.dbClient || supabase
  const pageSize = options.pageSize || ORDER_HISTORY_PAGE_SIZE
  const bounds = getOrderHistoryRangeBounds(dateFrom, dateTo)
  let rows
  try {
    rows = await queryPaidOrderPages(dbClient, ORDER_HISTORY_SELECT, bounds, pageSize)
  } catch (error) {
    if (!isMissingPaymentsRelation(error)) throw error
    rows = await queryPaidOrderPages(dbClient, ORDER_HISTORY_SELECT_WITHOUT_PAYMENTS, bounds, pageSize)
  }

  const byId = new Map()
  for (const row of rows) {
    if (!row?.id || !isPaidOrder(row) || !matchesRange(row, bounds.dateFrom, bounds.dateTo)) continue
    byId.set(row.id, row)
  }
  return [...byId.values()].sort((a, b) => (
    String(b.paid_at || b.created_at || '').localeCompare(String(a.paid_at || a.created_at || ''))
  ))
}

export function mergePaidOrderHistory(historyOrders = [], liveOrders = [], dateFrom, dateTo) {
  const byId = new Map((historyOrders || []).filter(isPaidOrder).map(order => [order.id, order]))
  for (const order of liveOrders || []) {
    if (!order?.id || !isPaidOrder(order) || !matchesRange(order, dateFrom, dateTo)) continue
    byId.set(order.id, order)
  }
  return [...byId.values()]
}

export async function loadOrdersForRange(dateFrom, dateTo, options = {}) {
  const dbClient = options.dbClient || supabase
  const pageSize = options.pageSize || ORDER_HISTORY_PAGE_SIZE
  const bounds = getOrderHistoryRangeBounds(dateFrom, dateTo)
  let paidOrders
  let ordersWithoutPaidTimestamp
  try {
    ;[paidOrders, ordersWithoutPaidTimestamp] = await Promise.all([
      queryPaidOrderPages(dbClient, ORDER_HISTORY_SELECT, bounds, pageSize),
      queryOrdersWithoutPaidTimestamp(dbClient, ORDER_HISTORY_SELECT, bounds, pageSize),
    ])
  } catch (error) {
    if (!isMissingPaymentsRelation(error)) throw error
    ;[paidOrders, ordersWithoutPaidTimestamp] = await Promise.all([
      queryPaidOrderPages(dbClient, ORDER_HISTORY_SELECT_WITHOUT_PAYMENTS, bounds, pageSize),
      queryOrdersWithoutPaidTimestamp(dbClient, ORDER_HISTORY_SELECT_WITHOUT_PAYMENTS, bounds, pageSize),
    ])
  }

  const byId = new Map()
  for (const order of [...paidOrders, ...ordersWithoutPaidTimestamp]) {
    if (!order?.id || !matchesRange(order, bounds.dateFrom, bounds.dateTo)) continue
    byId.set(order.id, order)
  }
  return [...byId.values()].sort((a, b) => (
    String(b.paid_at || b.created_at || '').localeCompare(String(a.paid_at || a.created_at || ''))
  ))
}

export function mergeOrderHistory(historyOrders = [], liveOrders = [], dateFrom, dateTo) {
  const byId = new Map((historyOrders || [])
    .filter(order => order?.id && matchesRange(order, dateFrom, dateTo))
    .map(order => [order.id, order]))
  for (const order of liveOrders || []) {
    if (!order?.id || !matchesRange(order, dateFrom, dateTo)) continue
    const historyOrder = byId.get(order.id)
    if (!historyOrder) {
      byId.set(order.id, order)
      continue
    }
    const historyPayments = historyOrder.payments || historyOrder.order_payments
    byId.set(order.id, {
      ...historyOrder,
      ...order,
      ...(Array.isArray(historyPayments) && historyPayments.length > 0
        ? {
            payment_method: historyOrder.payment_method,
            payments: historyPayments,
          }
        : {}),
    })
  }
  return [...byId.values()]
}

// The current waiter's name rides along with each active order (orders.opened_by
// -> profiles), so startup does not need a second round trip that waits for the
// orders. RLS still decides which names are visible; a hidden profile embeds as
// null and the saved name is kept. Without the relationship, plain rows come
// back and names are resolved separately (loadActiveOrderWaiterNames).
export const ACTIVE_ORDER_OPENER_SELECT = 'opener:profiles!orders_opened_by_fkey(full_name)'

export async function loadActiveOrders(options = {}) {
  const dbClient = options.dbClient || supabase
  const pageSize = options.pageSize || ORDER_HISTORY_PAGE_SIZE
  const withOpener = options.withOpenerNames !== false
  const select = base => (withOpener ? `${base}, ${ACTIVE_ORDER_OPENER_SELECT}` : base)
  try {
    return await queryActiveOrderPages(dbClient, select(ORDER_HISTORY_SELECT), pageSize)
  } catch (error) {
    // Any failure with the name embed retries the original query, which keeps
    // its own missing-payments fallback; names are then looked up separately.
    if (withOpener) return loadActiveOrders({ ...options, withOpenerNames: false })
    if (!isMissingPaymentsRelation(error)) throw error
    return queryActiveOrderPages(dbClient, ORDER_HISTORY_SELECT_WITHOUT_PAYMENTS, pageSize)
  }
}
