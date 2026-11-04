import { supabase } from './supabase.js'

// Paid, non-cancelled sold items whose saved cost is above their price
// (migration 278). Saved costs are immutable; this only surfaces them so a
// wrong Tech Card cost does not silently pull gross profit below zero.

export function isMissingCostAnomaliesRpc(error) {
  const text = `${error?.message || ''} ${error?.details || ''}`
  return error?.code === 'PGRST202' || error?.code === '42883' || text.includes('get_accounting_cost_anomalies')
}

function amount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

export function normalizeCostAnomalies(data = {}) {
  const items = (Array.isArray(data?.items) ? data.items : [])
    .map(row => {
      const quantity = Math.max(0, Number(row?.quantity) || 0)
      const price = amount(row?.price)
      const cost = amount(row?.cost_price)
      return {
        id: String(row?.id || ''),
        orderId: String(row?.order_id || ''),
        name: String(row?.name || '').trim(),
        soldOn: String(row?.sold_on || '').slice(0, 10),
        quantity,
        price,
        cost,
        excess: Math.round(quantity * Math.max(0, cost - price)),
      }
    })
    .filter(row => row.id && row.cost > row.price)
  return {
    count: Math.max(items.length, Math.round(Number(data?.count) || 0)),
    costTotal: amount(data?.cost_total),
    excessTotal: amount(data?.excess_total),
    items,
  }
}

export async function loadCostAnomalies(dateFrom, dateTo, options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await dbClient.rpc('get_accounting_cost_anomalies', { p_date_from: dateFrom, p_date_to: dateTo })
  if (error) throw error
  return normalizeCostAnomalies(data || {})
}
