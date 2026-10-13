import {
  addRestaurantDays,
  getCafeIncomeForRange,
  getOrderDate,
  getOrderItemCategoryId,
  getOrderPaymentBreakdown,
  getOrderRevenueTotal,
  getSoldOrderItems,
  restaurantTodayStr,
  toLocalDateStr,
} from './analytics.js'
import { getOrderItemUnitPrice } from './priceModes.js'
import { ORDER_TYPE_KEYS, inferOrderType, orderTypeLabel } from './orderTypes.js'
import { getOrderItemCostPrice } from './profit.js'

function localDateStr(value) {
  return toLocalDateStr(value instanceof Date ? value.toISOString() : value)
}

import { formatDateTime } from './dateFormat.js'

function todayStr(now = new Date()) {
  return restaurantTodayStr(now)
}

export function getRollingDashboardMonthRange(today = todayStr()) {
  const dateFrom = addRestaurantDays(today, -31)
  return {
    dateFrom,
    dateTo: today,
    dateToExclusive: addRestaurantDays(today, 1),
    dayCount: 32,
  }
}

export function isOrderInDashboardPeriod(order, period, now = new Date()) {
  const ds = localDateStr(getOrderDate(order))
  if (!ds) return false

  if (period === 'today') return ds === todayStr(now)

  if (period === '7days') {
    const today = todayStr(now)
    const start = addRestaurantDays(today, -6)
    return ds >= start && ds <= today
  }

  if (period === 'rollingMonth') {
    const range = getRollingDashboardMonthRange(todayStr(now))
    return ds >= range.dateFrom && ds < range.dateToExclusive
  }

  if (period === 'month') {
    const today = todayStr(now)
    const prefix = today.slice(0, 8)
    return ds.startsWith(prefix)
  }

  if (period === 'year') {
    return ds.startsWith(`${todayStr(now).slice(0, 4)}-`)
  }

  return true
}

export function getDashboardPeriodOrders(orders, period, now = new Date()) {
  return (orders || []).filter(order => isOrderInDashboardPeriod(order, period, now))
}

export function getDashboardPeriodCafeIncome(orders, period, now = new Date()) {
  const today = todayStr(now)
  let dateFrom = today
  if (period === '7days') dateFrom = addRestaurantDays(today, -6)
  else if (period === 'rollingMonth') dateFrom = getRollingDashboardMonthRange(today).dateFrom
  else if (period === 'month') dateFrom = `${today.slice(0, 8)}01`
  else if (period === 'year') dateFrom = `${today.slice(0, 4)}-01-01`
  return getCafeIncomeForRange(orders, dateFrom, today, now)
}

export function getDashboardSalesByCategory(orders, menuItemMap, categoryMap, lang = 'en') {
  const map = {}
  ;(orders || []).forEach(order => {
    getSoldOrderItems(order).forEach(item => {
      const mi = menuItemMap[item.menu_item_id]
      const categoryId = getOrderItemCategoryId(item, mi)
      const cat = categoryId ? categoryMap[categoryId] : null
      const name = cat
        ? (cat[`name_${lang}`] || cat.name_en || cat.name_uz || 'Other')
        : 'Other'
      const revenue = getOrderItemUnitPrice(item) * (Number(item.quantity) || 1)
      if (!map[name]) map[name] = { name, revenue: 0, qty: 0 }
      map[name].revenue += revenue
      map[name].qty += Number(item.quantity) || 1
    })
  })

  const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue)
  const total = rows.reduce((sum, row) => sum + row.revenue, 0)
  return rows.map(row => ({
    ...row,
    pct: total > 0 ? Math.round((row.revenue / total) * 100) : 0,
  }))
}

export function getDashboardProductContribution(orders = [], menuItemMap = {}) {
  const products = new Map()
  for (const order of orders || []) {
    for (const item of getSoldOrderItems(order)) {
      const key = item.menu_item_id || item.name
      const quantity = Math.max(0, Number(item.quantity) || 1)
      const revenue = getOrderItemUnitPrice(item) * quantity
      const rawCost = item?.cost_price ?? item?.costPrice ?? item?.real_cost ?? item?.realCost
      const hasCost = rawCost !== null && rawCost !== undefined && rawCost !== '' && Number.isFinite(Number(rawCost))
      const row = products.get(key) || {
        menuItemId: item.menu_item_id,
        name: item.name,
        quantity: 0,
        revenue: 0,
        cost: 0,
        hasCostCoverage: true,
      }
      row.quantity += quantity
      row.revenue += revenue
      row.hasCostCoverage = row.hasCostCoverage && hasCost
      if (hasCost) row.cost += getOrderItemCostPrice(item) * quantity
      products.set(key, row)
    }
  }
  const totalRevenue = [...products.values()].reduce((sum, row) => sum + row.revenue, 0)
  return [...products.values()]
    .map(row => ({
      ...row,
      imageUrl: menuItemMap[row.menuItemId]?.image_url || '',
      revenueSharePct: totalRevenue > 0 ? Math.round(row.revenue / totalRevenue * 1000) / 10 : 0,
      profit: row.hasCostCoverage ? Math.round(row.revenue - row.cost) : null,
      marginPct: row.hasCostCoverage && row.revenue > 0
        ? Math.round((row.revenue - row.cost) / row.revenue * 1000) / 10
        : null,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
    .slice(0, 10)
}

export function getDashboardOrderTypePerformance(orders, lang = 'en') {
  const map = Object.fromEntries(ORDER_TYPE_KEYS.map(key => [key, {
    key,
    label: orderTypeLabel(key, lang),
    orders: 0,
    items: 0,
    revenue: 0,
  }]))

  ;(orders || []).forEach(order => {
    const key = inferOrderType(order)
    const row = map[key] || map.dine_in
    row.orders += 1
    row.items += getSoldOrderItems(order).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
    row.revenue += getOrderRevenueTotal(order)
  })

  const total = Object.values(map).reduce((sum, row) => sum + row.revenue, 0)
  return ORDER_TYPE_KEYS
    .map(key => {
      const row = map[key]
      return {
        ...row,
        avgOrder: row.orders > 0 ? Math.round(row.revenue / row.orders) : 0,
        pct: total > 0 ? Math.round((row.revenue / total) * 100) : 0,
      }
    })
    .sort((a, b) => b.revenue - a.revenue || ORDER_TYPE_KEYS.indexOf(a.key) - ORDER_TYPE_KEYS.indexOf(b.key))
}

export function getDashboardPaymentMethods(orders, labels = {}) {
  const knownLabels = {
    cash: labels.cash || 'Cash',
    card: labels.card || 'Card',
    terminal: labels.terminal || 'Terminal',
    loyalty_card: labels.loyalty || 'Loyalty',
    unknown: labels.unknown || 'Unknown',
  }
  const colors = labels.colors || {}
  const map = {}

  ;(orders || []).forEach(order => {
    const breakdown = getOrderPaymentBreakdown(order)
    const rows = breakdown.length > 0
      ? breakdown
      : [{ method: order.payment_method, amount: getOrderRevenueTotal(order) }]

    rows.forEach(row => {
      const raw = (row.method || '').toLowerCase().trim()
      const key = ['cash', 'card', 'terminal', 'loyalty_card'].includes(raw) ? raw : 'unknown'
      const amount = Number(row.amount) || 0
      map[key] = (map[key] || 0) + amount
    })
  })

  const total = Object.values(map).reduce((sum, value) => sum + value, 0)
  return Object.entries(map)
    .map(([key, amount]) => ({
      key,
      label: knownLabels[key] || knownLabels.unknown,
      amount,
      pct: total > 0 ? Math.round((amount / total) * 100) : 0,
      color: colors[key],
    }))
    .sort((a, b) => b.amount - a.amount)
}

export function formatReadableDateTime(date, locale = 'en-US') {
  return formatDateTime(date)
}
