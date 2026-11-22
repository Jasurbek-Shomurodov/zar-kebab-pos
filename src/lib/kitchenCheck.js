import { formatTime } from './dateFormat.js'
import { getGroupedOrderItems } from './analytics.js'
import { formatMenuQuantity, isMenuItemSoldByWeight } from './menuSaleUnits.js'

const CANCELLED_STATUS = 'cancelled'
export const KITCHEN_CHECK_TITLE = 'ЧЕК ДЛЯ КУХНИ'

function orderItemRoundId(item, fallbackOrderId) {
  return (
    item?.kitchen_round_id ||
    item?.kitchenRoundId ||
    item?.submitted_at ||
    item?.submittedAt ||
    item?.created_at ||
    item?.createdAt ||
    item?.order_id ||
    item?._orderId ||
    item?.orderId ||
    fallbackOrderId ||
    'order'
  )
}

function itemCreatedAt(item) {
  return item?.submitted_at || item?.submittedAt || item?.created_at || item?.createdAt || ''
}

export function formatKitchenOrderNumber(group) {
  const raw = group?.orderNumber || group?.orderId || ''
  if (!raw) return ''
  const text = String(raw)
  const numericSuffix = text.match(/\d+$/)?.[0]
  if (numericSuffix) return `#${numericSuffix.slice(-4)}`
  return text.startsWith('#') ? text : `#${text}`
}

export function formatKitchenTableName(value) {
  const text = String(value || '-').trim()
  const tableNumber = text.match(/^(table|стол)\s+(.+)$/i)?.[2]
  return tableNumber ? `СТОЛ ${tableNumber}` : text.toLocaleUpperCase('ru-RU')
}

export function kitchenItemName(item) {
  return String(item?.name || '').trim().toLocaleUpperCase('ru-RU')
}

export function getKitchenCheckGroups(order) {
  if (!order) return []
  const groups = new Map()

  for (const item of order.items || []) {
    if (String(item?.status || '').toLowerCase() === CANCELLED_STATUS) continue
    const roundId = orderItemRoundId(item, order.id)
    if (!groups.has(roundId)) {
      groups.set(roundId, {
        orderId: item.order_id || item._orderId || item.orderId || order.id,
        roundId,
        orderNumber: item.order_number || item.orderNumber || order.order_number || '',
        tableName: item.table_name || item.tableName || order.table_name || '',
        waiterName: item.waiter_name || item.waiterName || order.waiter_name || '',
        createdAt: itemCreatedAt(item) || order.created_at || '',
        items: [],
      })
    }
    groups.get(roundId).items.push(item)
  }

  return [...groups.values()].sort((a, b) => {
    const aTime = Date.parse(a.createdAt)
    const bTime = Date.parse(b.createdAt)
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
    return aTime - bTime
  })
}

export function getKitchenCheckGroup(order, roundId = '') {
  const groups = getKitchenCheckGroups(order)
  if (!roundId) return groups[0] || null
  return groups.find(group => String(group.roundId) === String(roundId)) || null
}

/**
 * Everything the kitchen slip prints, as plain text: the one description of a check that the
 * on-screen/printed paper (`KitchenCheckReceipt.jsx`) renders. Identical rows of the round are
 * combined; prices never appear on a kitchen check.
 */
export function buildKitchenCheckModel(group) {
  return {
    title: KITCHEN_CHECK_TITLE,
    tableName: formatKitchenTableName(group?.tableName),
    orderNumber: formatKitchenOrderNumber(group),
    time: formatTime(group?.createdAt || new Date()),
    waiterName: String(group?.waiterName || '').trim() || '-',
    rows: getGroupedOrderItems(group?.items || []).map(item => ({
      key: String(item.id || `${item.menu_item_id}-${item.name}`),
      quantity: `${formatMenuQuantity(item.quantity, item)} ${isMenuItemSoldByWeight(item) ? '·' : '×'}`,
      name: kitchenItemName(item),
      notes: String(item.notes || '').trim(),
    })),
  }
}

/**
 * Which requested rounds can be printed. A round that could not be found is reported, never
 * dropped silently: the page warns about it and does not print by itself.
 */
export function resolveKitchenCheckTargets(targets, findGroup) {
  const groups = []
  let missingCount = 0
  for (const target of targets || []) {
    const group = findGroup(target)
    if (group) groups.push(group)
    else missingCount += 1
  }
  return { groups, missingCount, complete: groups.length > 0 && missingCount === 0 }
}
