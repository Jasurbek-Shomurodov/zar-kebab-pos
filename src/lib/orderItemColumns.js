import { supabase } from './supabase.js'

// Every order_items column staff screens may read. cost_price is deliberately
// absent: cost snapshots stay out of waiter/cashier payloads (migration 292
// revokes the column from `authenticated`). Owners' profit views get costs
// through get_order_item_costs (291) instead.
export const ORDER_ITEM_COLUMNS = [
  'id', 'order_id', 'menu_item_id', 'name', 'price', 'quantity', 'notes', 'status',
  'created_at', 'order_type', 'item_type', 'is_counter_item', 'kitchen_round_id',
  'submitted_at', 'base_price', 'unit_price', 'price_mode', 'selected_options',
  'sale_unit', 'category_id_snapshot', 'category_snapshot_captured',
  'tech_card_component_snapshot',
].join(', ')

export const ORDER_ITEMS_EMBED = `items:order_items(${ORDER_ITEM_COLUMNS})`

const COST_BATCH_SIZE = 200

function isMissingCostRpc(error) {
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return error?.code === 'PGRST202' || error?.code === '42883' ||
    (text.includes('get_order_item_costs') && (text.includes('could not find') || text.includes('does not exist')))
}

async function loadCostBatch(dbClient, orderIds) {
  const { data, error } = await dbClient.rpc('get_order_item_costs', { p_order_ids: orderIds })
  if (!error) return data || []
  if (!isMissingCostRpc(error)) throw error
  // Until 291 is applied the column is still readable directly.
  const legacy = await dbClient.from('order_items').select('id, cost_price').in('order_id', orderIds)
  if (legacy.error) throw legacy.error
  return legacy.data || []
}

/** Map of order_item id -> cost snapshot (null when none) for the given orders. */
export async function loadOrderItemCosts(orderIds = [], { dbClient = supabase } = {}) {
  const ids = [...new Set((orderIds || []).map(id => String(id || '').trim()).filter(Boolean))].sort()
  const costs = new Map()
  for (let start = 0; start < ids.length; start += COST_BATCH_SIZE) {
    const rows = await loadCostBatch(dbClient, ids.slice(start, start + COST_BATCH_SIZE))
    for (const row of rows) {
      if (!row?.id) continue
      const cost = row.cost_price
      costs.set(String(row.id), cost === null || cost === undefined ? null : Number(cost))
    }
  }
  return costs
}

/** Returns orders whose items carry cost_price from `costs`; other fields untouched. */
export function withOrderItemCosts(orders = [], costs = new Map()) {
  return (orders || []).map(order => {
    const items = order?.items || order?.order_items
    if (!Array.isArray(items) || items.length === 0) return order
    const nextItems = items.map(item => (
      costs.has(String(item?.id)) ? { ...item, cost_price: costs.get(String(item.id)) } : item
    ))
    return order.items ? { ...order, items: nextItems } : { ...order, order_items: nextItems }
  })
}

/** Order ids of the orders and of any grouped session members (`_orders`). */
export function collectOrderIds(orders = []) {
  const ids = []
  for (const order of orders || []) {
    if (order?.id) ids.push(order.id)
    for (const member of order?._orders || []) if (member?.id) ids.push(member.id)
  }
  return ids
}
