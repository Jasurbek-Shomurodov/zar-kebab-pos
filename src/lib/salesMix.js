import { getOrderItemCategoryId, getOrderItemProductId, getSoldOrderItems } from './analytics.js'
import { getOrderItemUnitPrice } from './priceModes.js'
import { isMenuItemSoldByWeight } from './menuSaleUnits.js'
import { getOrderItemCostPrice } from './profit.js'

const UNCATEGORIZED_KEY = '__uncategorized__'

function positiveQuantity(value) {
  const quantity = Number(value)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

function percentOf(value, total) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0
}

function withProfit(row, totalRevenue) {
  const profit = Math.round(row.revenue - row.cost)
  return {
    ...row,
    cost: Math.round(row.cost),
    profit,
    margin: percentOf(profit, row.revenue),
    share: percentOf(row.revenue, totalRevenue),
  }
}

function sortByRevenue(a, b) {
  return b.revenue - a.revenue || b.quantity - a.quantity || a.name.localeCompare(b.name, 'ru')
}

// Same per-line math as the Reports "By category" tab: saved unit price × quantity,
// before service fee and order-level discounts, so shares add up to 100%.
// Profit uses the saved per-unit cost snapshot (getOrderItemCostPrice); a line
// whose cost is missing or zero marks its row as having incomplete cost.
export function getDailySalesMix(orders = [], { menuItems = [], categories = [] } = {}) {
  const menuById = new Map((menuItems || []).map(item => [String(item.id), item]))
  const categoryById = new Map((categories || []).map(category => [String(category.id), category]))
  const dishes = new Map()
  const categoryRows = new Map()
  let totalRevenue = 0
  let totalCost = 0

  for (const order of orders || []) {
    if (!order || order.status === 'cancelled') continue
    for (const item of getSoldOrderItems(order)) {
      const productId = getOrderItemProductId(item)
      const menuItem = productId != null ? menuById.get(String(productId)) : null
      const categoryId = getOrderItemCategoryId(item, menuItem)
      const category = categoryId ? categoryById.get(String(categoryId)) : null
      const quantity = positiveQuantity(item.quantity)
      const revenue = getOrderItemUnitPrice(item) * quantity
      const cost = getOrderItemCostPrice(item) * quantity
      const missingCost = !(Number(item.cost_price ?? item.costPrice) > 0)
      const name = String(menuItem?.name_ru || item.name_ru || item.name || menuItem?.name_en || productId || '—').trim()
      const dishKey = productId != null ? `menu:${productId}` : `name:${name.toLowerCase()}`
      const byWeight = isMenuItemSoldByWeight(menuItem || item)

      const dish = dishes.get(dishKey) || { key: dishKey, name, byWeight, quantity: 0, revenue: 0, cost: 0, missingCost: false, orderIds: new Set() }
      dish.quantity += quantity
      dish.revenue += revenue
      dish.cost += cost
      dish.missingCost ||= missingCost
      if (order.id) dish.orderIds.add(order.id)
      dishes.set(dishKey, dish)

      const categoryKey = category ? String(category.id) : UNCATEGORIZED_KEY
      const categoryName = category
        ? String(category.name_ru || category.name_en || category.name_uz || '').trim() || '—'
        : 'Без категории'
      const categoryRow = categoryRows.get(categoryKey)
        || { key: categoryKey, name: categoryName, quantity: 0, revenue: 0, cost: 0, missingCost: false, dishKeys: new Set() }
      categoryRow.quantity += byWeight ? 0 : quantity
      categoryRow.revenue += revenue
      categoryRow.cost += cost
      categoryRow.missingCost ||= missingCost
      categoryRow.dishKeys.add(dishKey)
      categoryRows.set(categoryKey, categoryRow)

      totalRevenue += revenue
      totalCost += cost
    }
  }

  const dishRows = [...dishes.values()].map(({ orderIds, ...dish }) => withProfit({
    ...dish,
    orderCount: orderIds.size,
  }, totalRevenue)).sort(sortByRevenue)
  const categoryList = [...categoryRows.values()].map(({ dishKeys, ...row }) => withProfit({
    ...row,
    dishCount: dishKeys.size,
  }, totalRevenue)).sort(sortByRevenue)
  const totalProfit = Math.round(totalRevenue - totalCost)

  return {
    totalRevenue,
    totalCost: Math.round(totalCost),
    totalProfit,
    totalMargin: percentOf(totalProfit, totalRevenue),
    totalPieces: dishRows.reduce((sum, dish) => sum + (dish.byWeight ? 0 : dish.quantity), 0),
    dishes: dishRows,
    categories: categoryList,
  }
}
