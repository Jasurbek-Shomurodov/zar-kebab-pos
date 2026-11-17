// Reports data layer: thin wrappers over the migration 281 readers, plus the
// adapter that turns the dish reader into the analysis shape DishSalesTab draws.
//
// All filters travel as SQL parameters. 'all' means "no filter" (null).
import { supabase } from './supabase.js'
import { ALL_DISHES_KEY, getDishSalesAnalysis } from './dishSales.js'

function scopeArgs(dateFrom, dateTo, tableId, waiterName) {
  return {
    p_from: dateFrom,
    p_to: dateTo,
    p_table_id: tableId && tableId !== 'all' ? tableId : null,
    p_waiter_name: waiterName && waiterName !== 'all' ? waiterName : null,
  }
}

async function callReport(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export function loadReportsOverview({ dateFrom, dateTo, tableId, waiterName }) {
  return callReport('get_reports_overview', scopeArgs(dateFrom, dateTo, tableId, waiterName))
}

export function loadReportsItemSales({ dateFrom, dateTo, tableId, waiterName }) {
  return callReport('get_reports_item_sales', scopeArgs(dateFrom, dateTo, tableId, waiterName))
}

export function loadReportsFilterOptions({ dateFrom, dateTo }) {
  return callReport('get_reports_filter_options', { p_from: dateFrom, p_to: dateTo })
}

export function loadReportsDishSales({ dateFrom, dateTo, tableId, waiterName, dishKey }) {
  return callReport('get_reports_dish_sales', {
    ...scopeArgs(dateFrom, dateTo, tableId, waiterName),
    p_dish_key: dishKey && dishKey !== ALL_DISHES_KEY ? dishKey : null,
  })
}

export function loadReportsOrderPage({
  dateFrom, dateTo, tableId, waiterName, paymentMethod, status, search, sort, limit, offset,
}) {
  return callReport('get_reports_order_page', {
    ...scopeArgs(dateFrom, dateTo, tableId, waiterName),
    p_payment_method: paymentMethod && paymentMethod !== 'all' ? paymentMethod : null,
    p_status: status || 'all',
    p_search: search?.trim() ? search.trim() : null,
    p_sort: sort || 'date_desc',
    p_limit: limit || 50,
    p_offset: offset || 0,
  })
}

const CLOSEOUT_METHODS = ['salary', 'cash', 'card', 'terminal', 'loyalty_card', 'mixed', 'other']

// Same shape as getDailyCloseout (src/lib/closeout.js), from get_reports_overview.
// Payment totals are the per-session breakdowns; unknown methods count as 'other'.
export function buildCloseoutFromOverview(overview, dateFrom, dateTo) {
  const totals = Object.fromEntries(CLOSEOUT_METHODS.map(method => [method, 0]))
  for (const row of overview?.payment_methods || []) {
    const key = CLOSEOUT_METHODS.includes(row.method) ? row.method : 'other'
    totals[key] += Number(row.revenue) || 0
  }
  const loyaltyIncome = Number(overview?.kpi?.loyalty) || 0
  return {
    date: dateTo,
    dateFrom,
    dateTo,
    orderCount: Number(overview?.kpi?.orders) || 0,
    revenue: Number(overview?.kpi?.revenue) || 0,
    totals,
    loyaltyIncome,
    loyaltyUsed: loyaltyIncome,
    cashbackIssued: Number(overview?.cashback) || 0,
    cancelledCount: Number(overview?.cancelled_count) || 0,
    // No counted cash/bank balance is captured, so an actual variance is unknown.
    variance: null,
    notes: '',
  }
}

// Builds the object getDishSalesAnalysis returns, from the reader output.
// Menu items supply the rows for dishes that did not sell (as before).
export function buildDishAnalysisFromRpc(rpc, menuItems = [], selectedDishKey = ALL_DISHES_KEY) {
  const base = getDishSalesAnalysis({ orders: [], menuItems, selectedDishKey: ALL_DISHES_KEY })
  const rows = new Map(base.dishes.map(dish => [dish.key, dish]))
  for (const row of rpc?.dishes || []) {
    let dish = rows.get(row.dish_key)
    if (!dish) {
      dish = {
        key: row.dish_key,
        menuItemId: row.menu_item_id || null,
        name: row.name || 'Unknown',
        name_uz: '',
        name_ru: '',
        name_en: row.name || 'Unknown',
        category_id: row.category_id || null,
        image_url: '',
        available: false,
        currentMenuItem: false,
      }
      rows.set(row.dish_key, dish)
    }
    dish.quantity = Number(row.direct_quantity) || 0
    dish.revenue = Number(row.direct_revenue) || 0
    dish.orders = Number(row.direct_orders) || 0
    dish.saleLines = Number(row.sale_lines) || 0
    dish.firstSoldAt = row.first_sold_at || null
    dish.lastSoldAt = row.last_sold_at || null
    if (!dish.category_id) dish.category_id = row.category_id || null
  }
  const dishes = [...rows.values()].sort((a, b) => (
    a.quantity - b.quantity || a.revenue - b.revenue || a.name.localeCompare(b.name)
  ))

  const sel = rpc?.selected
  if (!sel || selectedDishKey === ALL_DISHES_KEY) {
    return {
      dishes,
      selectedDish: null,
      sources: [],
      totals: {
        quantity: 0, directQuantity: 0, includedQuantity: 0, revenue: 0,
        orders: 0, saleLines: 0, averagePerOrder: 0, firstSoldAt: null, lastSoldAt: null,
      },
      daily: [],
      hourly: [],
      sales: [],
    }
  }

  const quantity = Number(sel.quantity) || 0
  const orders = Number(sel.orders) || 0
  return {
    dishes,
    selectedDish: dishes.find(dish => dish.key === selectedDishKey) || null,
    sources: (sel.sources || []).map(row => ({
      key: row.key,
      name: row.name,
      quantity: Number(row.quantity) || 0,
      revenue: Number(row.revenue) || 0,
      orders: Number(row.orders) || 0,
      saleLines: Number(row.sale_lines) || 0,
      includedInSet: !!row.included_in_set,
    })),
    totals: {
      quantity,
      directQuantity: Number(sel.direct_quantity) || 0,
      includedQuantity: Number(sel.included_quantity) || 0,
      revenue: Number(sel.revenue) || 0,
      orders,
      saleLines: Number(sel.sale_lines) || 0,
      averagePerOrder: orders > 0 ? quantity / orders : 0,
      firstSoldAt: sel.first_sold_at || null,
      lastSoldAt: sel.last_sold_at || null,
    },
    daily: (sel.daily || []).map(row => ({
      date: row.date,
      quantity: Number(row.quantity) || 0,
      revenue: Number(row.revenue) || 0,
      orders: Number(row.orders) || 0,
      saleLines: Number(row.sale_lines) || 0,
    })),
    hourly: (sel.hourly || []).map(row => ({
      hour: Number(row.hour),
      quantity: Number(row.quantity) || 0,
      revenue: Number(row.revenue) || 0,
      orders: Number(row.orders) || 0,
      saleLines: Number(row.sale_lines) || 0,
    })),
    sales: (sel.sales || []).map(row => ({
      dishKey: selectedDishKey,
      menuItemId: null,
      dishName: row.dish_name,
      orderId: row.order_id,
      orderDate: row.order_date,
      date: row.date,
      hour: Number(row.hour),
      quantity: Number(row.quantity) || 0,
      unitPrice: 0,
      revenue: Number(row.revenue) || 0,
      tableName: row.table_name || '',
      waiterName: row.waiter_name || '',
      orderType: row.order_type || 'dine_in',
      sourceKey: row.source_key,
      sourceName: row.source_name,
      includedInSet: !!row.included_in_set,
    })),
  }
}
