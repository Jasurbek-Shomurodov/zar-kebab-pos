import { getActiveTableOrders } from './tableGuestEntry.js'

// Resolve operational labels only; persisted actor names remain historical snapshots.
export async function loadActiveOrderWaiterNames(orders, dbClient) {
  const active = orders.filter(order => order.payment_status !== 'paid' && !order.paid_at && !['paid', 'completed', 'cancelled'].includes(order.status))
  const ids = [...new Set(active.map(order => order.opened_by).filter(Boolean))]
  if (!ids.length) return orders
  try {
    const { data, error } = await dbClient.from('profiles').select('id, full_name').in('id', ids)
    if (error) throw error
    const names = new Map((data || []).map(profile => [profile.id, profile.full_name?.trim()]))
    const activeIds = new Set(active.map(order => order.id))
    return orders.map(order => activeIds.has(order.id) && names.get(order.opened_by)
      ? { ...order, waiter_name: names.get(order.opened_by) }
      : order)
  } catch (error) {
    console.warn('[db] current waiter names unavailable, using saved names:', error.message)
    return orders
  }
}

// Applies names embedded by loadActiveOrders. Returns null when the rows came
// back without the embed, so the caller falls back to the separate lookup.
export function applyEmbeddedWaiterNames(orders) {
  if (!orders.length || !orders.some(order => Object.prototype.hasOwnProperty.call(order, 'opener'))) {
    return orders.length ? null : orders
  }
  return orders.map(({ opener, ...order }) => {
    const name = opener?.full_name?.trim()
    const active = order.payment_status !== 'paid' && !order.paid_at && !['paid', 'completed', 'cancelled'].includes(order.status)
    return active && name ? { ...order, waiter_name: name } : order
  })
}

export function getActiveWaiterNames(orders) {
  return [...new Set(orders.map(order => order.waiter_name?.trim() || order.opened_by_name?.trim()).filter(Boolean))]
}

export function getTableOrderWaiterNames(tableId, orders = [], draftWaiterName = '') {
  if (!tableId) return []
  const active = getActiveTableOrders(tableId, orders)
  return active.length > 0
    ? getActiveWaiterNames(active)
    : [draftWaiterName.trim()].filter(Boolean)
}
