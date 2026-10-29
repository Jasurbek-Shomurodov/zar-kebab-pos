import { inferOrderType, isOffPremiseOrderType, orderTypeLabel } from '../../../src/lib/orderTypes.js'
import { formatLongDateTime } from '../../../src/lib/dateFormat.js'
import { getGroupedOrderItems, getOrderPaymentSummary } from '../../../src/lib/analytics.js'
import { escapeTelegramHtml, TELEGRAM_STATUS_MESSAGES } from './telegram.js'
import { formatMenuQuantity, isMenuItemSoldByWeight } from '../../../src/lib/menuSaleUnits.js'

const COMPLETED_ORDER_GROUP_CHAT_ID_ENV_KEYS = [
  'TELEGRAM_COMPLETED_ORDERS_CHAT_ID',
  'TELEGRAM_COMPLETED_ORDERS_CHAT_IDS',
]

const PAYMENT_METHOD_LABELS_RU = {
  cash: 'Наличные',
  card: 'Карта',
  terminal: 'Терминал',
  qr: 'Терминал',
  qr_code: 'Терминал',
  loyalty: 'Карта лояльности',
  loyalty_card: 'Карта лояльности',
  mixed: 'Смешанная оплата',
  pay_at_cashier: 'Оплата на кассе',
}

const PRICE_MODE_TOURIST = 'tourist'
const TURBO_ORDER_STEP_UZS = 100_000
const TURBO_ORDER_MAX_ICONS = 6

function formatMoney(amount) {
  const rounded = Math.round(Number(amount) || 0)
  return `${new Intl.NumberFormat('ru-RU').format(rounded).replace(/\s/g, ' ')} UZS`
}

function formatRowMoney(amount) {
  const rounded = Math.round(Number(amount) || 0)
  return new Intl.NumberFormat('ru-RU').format(rounded).replace(/\s/g, ' ')
}

function formatPercent(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '-'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(amount)}%`
}

function paymentMethodLabel(value) {
  if (value === 'salary') return 'Из зарплаты'
  const key = String(value || '').toLowerCase()
  if (PAYMENT_METHOD_LABELS_RU[key]) return PAYMENT_METHOD_LABELS_RU[key]
  return String(value || '-')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getOrderPayments(order) {
  const rows = Array.isArray(order?.payments)
    ? order.payments
    : Array.isArray(order?.order_payments)
      ? order.order_payments
      : []
  return rows
    .map(row => ({
      method: row?.method || row?.payment_method,
      amount: Math.round(Number(row?.amount) || 0),
    }))
    .filter(row => row.method && row.amount > 0)
}

function getLoyaltyUsedAmount(order) {
  return Math.max(0, Math.round(Number(
    order?.loyalty_used_amount ??
    order?.loyalty_redeem_amount ??
    order?.loyalty_discount_amount ??
    0
  ) || 0))
}

function getLoyaltyOwnerNames(order) {
  const transactions = Array.isArray(order?.loyalty_transactions)
    ? order.loyalty_transactions
    : []
  return [...new Set([
    order?.loyalty_customer_name,
    ...transactions.map(transaction => transaction?.customer_name_at_transaction),
  ].map(value => String(value || '').trim()).filter(Boolean))]
}

export function mergeCompletedOrders(orders = []) {
  const rows = orders.filter(Boolean)
  if (rows.length <= 1) return rows[0] || null

  const first = rows[0]
  const unique = values => [...new Set(values.filter(Boolean))]
  const waiterNames = unique(rows.map(order => order.waiter_name))
  const completedByNames = unique(rows.map(order => order.completed_by_name))
  const priceModes = unique(rows.map(order => normalizePriceMode(order.price_mode)))
  const loyaltyOwnerNames = unique(rows.flatMap(order => getLoyaltyOwnerNames(order)))
  const paymentsByMethod = new Map()

  for (const order of rows) {
    for (const payment of getOrderPayments(order)) {
      paymentsByMethod.set(payment.method, (paymentsByMethod.get(payment.method) || 0) + payment.amount)
    }
  }

  return {
    ...first,
    id: rows.map(order => order.id).join(','),
    waiter_name: waiterNames.join(', '),
    completed_by_name: completedByNames.join(', '),
    price_mode: priceModes.length === 1 ? priceModes[0] : first.price_mode,
    subtotal: rows.reduce((sum, order) => sum + (Number(order.subtotal) || 0), 0),
    service_fee: rows.reduce((sum, order) => sum + (Number(order.service_fee) || 0), 0),
    total: rows.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    loyalty_used_amount: rows.reduce((sum, order) => sum + getLoyaltyUsedAmount(order), 0),
    cashback_earned: rows.reduce((sum, order) => sum + getOrderPaymentSummary(order).cashbackEarned, 0),
    loyalty_customer_name: loyaltyOwnerNames.join(', '),
    items: rows.flatMap(order => getOrderItems(order)),
    payments: paymentsByMethod.size > 0
      ? [...paymentsByMethod].map(([method, amount]) => ({ method, amount }))
      : [],
    payment_method: unique(rows.map(order => order.payment_method)).join(', '),
    paid_at: rows.map(order => order.paid_at).filter(Boolean).sort().at(-1) || first.paid_at,
    updated_at: rows.map(order => order.updated_at).filter(Boolean).sort().at(-1) || first.updated_at,
  }
}

function formatPaymentLine(order) {
  const payments = getOrderPayments(order)
  if (payments.length > 0) {
    return payments
      .map(row => `${paymentMethodLabel(row.method)} ${formatMoney(row.amount)}`)
      .join(', ')
  }
  return paymentMethodLabel(order?.payment_method)
}

function normalizePriceMode(value) {
  return value === PRICE_MODE_TOURIST ? PRICE_MODE_TOURIST : 'regular'
}

function priceModeIcon(order) {
  const mode = normalizePriceMode(order?.price_mode)
  return mode === PRICE_MODE_TOURIST ? '🧳' : '🍴'
}

function isPaidOrder(order) {
  return order?.payment_status === 'paid' || order?.status === 'paid' || order?.status === 'completed'
}

function isOffPremiseOrder(order) {
  const type = inferOrderType(order)
  return isOffPremiseOrderType(type)
}

function orderTypeIcon(order) {
  const type = inferOrderType(order)
  if (type === 'game_club') return '🎮'
  if (type === 'delivery') return '🚚'
  if (type === 'take_away') return '🥡'
  return '🍽️'
}

function getOrderItems(order) {
  return (order?.items || order?.order_items || [])
    .filter(item => String(item?.status || '').toLowerCase() !== 'cancelled')
    .filter(item => Math.max(0, Number(item?.quantity) || 0) > 0)
}

function getItemAmount(item) {
  const quantity = Math.max(0, Number(item?.quantity) || 0)
  const unitPrice = Number.isFinite(Number(item?.unit_price))
    ? Number(item.unit_price)
    : Number(item?.price) || 0
  return unitPrice * quantity
}

function parseJsonObject(value, fallback) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return fallback
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function normalizeItemName(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function optionLabelIsFullItemName(label, parentName) {
  const normalizedLabel = normalizeItemName(label)
  const normalizedParent = normalizeItemName(parentName)
  const sharedPrefixLength = Math.min(5, normalizedParent.length)
  return sharedPrefixLength >= 4 && normalizedLabel.startsWith(normalizedParent.slice(0, sharedPrefixLength))
}

export function getRussianOrderItemDisplayName(item, menuItem = null) {
  const parentName = menuItem?.name_ru || item?.menu_name_ru || item?.name_ru || item?.name || item?.menu_item_id || '-'
  const selectedOptions = parseJsonObject(item?.selected_options || item?.selectedOptions, {})
  const optionGroups = parseJsonObject(menuItem?.option_groups || menuItem?.optionGroups, [])
  const selectedLabels = Array.isArray(optionGroups)
    ? optionGroups.map(group => {
        const selectedId = selectedOptions?.[String(group?.id || '')]
        const option = Array.isArray(group?.options)
          ? group.options.find(row => String(row?.id || '') === String(selectedId || ''))
          : null
        return String(option?.label_ru || option?.label || option?.name || '').trim()
      }).filter(Boolean)
    : []

  if (selectedLabels.length === 1 && optionLabelIsFullItemName(selectedLabels[0], parentName)) {
    return selectedLabels[0]
  }
  if (selectedLabels.length > 0) return `${parentName} · ${selectedLabels.join(', ')}`

  const noteMatch = String(item?.notes || '').match(/(?:Variants|Варианты|Variantlar)\s*:\s*([^\n]+)/i)
  if (noteMatch?.[1]) {
    const label = noteMatch[1].trim()
    return optionLabelIsFullItemName(label, parentName) ? label : `${parentName} · ${label}`
  }

  return parentName
}

function truncateText(value, maxLength) {
  const text = String(value || '-')
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}.` : text
}

export function buildItemRows(items) {
  const rows = [
    `${'Позиция'.padEnd(22)} ${'Кол'.padStart(3)} ${'Сумма'.padStart(10)}`,
  ]

  for (const item of getGroupedOrderItems(items)) {
    const name = truncateText(item?.telegram_display_name || getRussianOrderItemDisplayName(item), 22)
    const quantity = Math.max(0, Number(item?.quantity) || 0)
    const quantityText = isMenuItemSoldByWeight(item)
      ? formatMenuQuantity(quantity, item)
      : String(quantity)
    const amount = formatRowMoney(getItemAmount(item))
    rows.push(`${name.padEnd(22)} ${quantityText.padStart(6)} ${amount.padStart(10)}`)
  }

  return rows.join('\n')
}

function formatTelegramDateTime(value) {
  return formatLongDateTime(value, 'ru', '-', { includeYear: false }).replace(/ (\d{2}:\d{2})$/, ' | $1')
}

export function getCompletedOrdersChatIds(env = process.env) {
  const seen = new Set()
  return COMPLETED_ORDER_GROUP_CHAT_ID_ENV_KEYS
    .flatMap(key => String(env?.[key] || '').split(','))
    .map(value => value.trim())
    .filter(Boolean)
    .filter(value => {
      if (seen.has(value)) return false
      seen.add(value)
      return true
    })
}

export function shouldNotifyCompletedOrderGroup(status, order, env = process.env) {
  return status === 'completed' && isPaidOrder(order) && getCompletedOrdersChatIds(env).length > 0
}

export function buildCustomerStatusMessage(status, order) {
  const statusMessage = TELEGRAM_STATUS_MESSAGES[status]
  if (!statusMessage) return ''
  const orderLabel = order?.order_number || order?.id || '-'
  return `${statusMessage}\nOrder ${escapeTelegramHtml(orderLabel)}`
}

export function buildCompletedOrderGroupMessage(order) {
  const items = getOrderItems(order)
  const itemSubtotal = items.reduce((sum, item) => sum + getItemAmount(item), 0)
  const subtotal = Number.isFinite(Number(order?.subtotal)) ? Number(order.subtotal) : itemSubtotal
  const serviceFee = Number.isFinite(Number(order?.service_fee)) ? Number(order.service_fee) : 0
  const grossOrderTotal = subtotal + serviceFee
  const serviceRate = Number.isFinite(Number(order?.service_rate_pct))
    ? Number(order.service_rate_pct)
    : 0
  const loyaltyUsed = getLoyaltyUsedAmount(order)
  const loyaltyOwnerNames = getLoyaltyOwnerNames(order)
  const turboIconCount = Math.min(TURBO_ORDER_MAX_ICONS, Math.floor(grossOrderTotal / TURBO_ORDER_STEP_UZS))
  const turboBadge = turboIconCount > 0 ? ` ${'⚡'.repeat(turboIconCount)}` : ''
  const closedAt = formatTelegramDateTime(order?.paid_at || order?.updated_at || order?.created_at)
  const typeIcon = orderTypeIcon(order)
  const header = isOffPremiseOrder(order)
    ? `${typeIcon} Тип: ${escapeTelegramHtml(orderTypeLabel(inferOrderType(order), 'ru'))}`
    : `${typeIcon} Стол: ${escapeTelegramHtml(order?.table_name || '-')}`
  const lines = [
    `${header} ${priceModeIcon(order)}${turboBadge}`,
    `Дата: ${escapeTelegramHtml(closedAt)}`,
    `Официант: ${escapeTelegramHtml(String(order?.waiter_name || '').trim() || 'Не указан')}`,
  ]

  if (items.length > 0) lines.push('', `<pre>${escapeTelegramHtml(buildItemRows(items))}</pre>`)
  lines.push('')
  lines.push(`Сумма заказа: ${escapeTelegramHtml(formatMoney(subtotal))}`)
  if (serviceFee > 0) lines.push(`Сервис ${escapeTelegramHtml(serviceRate)}%: ${escapeTelegramHtml(formatMoney(serviceFee))}`)
  if (loyaltyUsed > 0) {
    lines.push(`Лояльность: - ${escapeTelegramHtml(formatMoney(loyaltyUsed))}`)
    if (loyaltyOwnerNames.length > 0) {
      lines.push(`Владелец карты: ${escapeTelegramHtml(loyaltyOwnerNames.join(', '))}`)
    }
  }
  lines.push(`Оплата: ${escapeTelegramHtml(formatPaymentLine(order))}`)
  const cashbackEarned = getOrderPaymentSummary(order).cashbackEarned
  if (cashbackEarned > 0) {
    const cardOwner = loyaltyOwnerNames.join(', ') || 'Карта лояльности'
    lines.push(`💳 ${escapeTelegramHtml(cardOwner)} · кешбэк + ${escapeTelegramHtml(formatMoney(cashbackEarned))}`)
  }
  if (order?.orderNetProfit != null && Number.isFinite(Number(order.orderNetProfit))) {
    const margin = order?.orderProfitMarginPct != null && Number.isFinite(Number(order.orderProfitMarginPct))
      ? ` · ${formatPercent(order.orderProfitMarginPct)}`
      : ''
    lines.push('', `Чистая прибыль: ${escapeTelegramHtml(`${formatMoney(order.orderNetProfit)}${margin}`)}`)
  }
  const dailySummaryLines = []
  if (Number.isFinite(Number(order?.dailyRevenueTotal))) {
    dailySummaryLines.push(`<b>Доход: ${escapeTelegramHtml(formatMoney(order.dailyRevenueTotal))}</b>`)
  }
  if (Number(order?.dailyLoyaltyIncomeTotal) > 0) {
    dailySummaryLines.push(`Доход по лояльности: ${escapeTelegramHtml(formatMoney(order.dailyLoyaltyIncomeTotal))}`)
  }
  if (order?.dailyNetProfitTotal != null && Number.isFinite(Number(order.dailyNetProfitTotal))) {
    const margin = order?.dailyProfitMarginPct != null && Number.isFinite(Number(order.dailyProfitMarginPct))
      ? ` · ${formatPercent(order.dailyProfitMarginPct)}`
      : ''
    dailySummaryLines.push(`Чистая прибыль: ${escapeTelegramHtml(`${formatMoney(order.dailyNetProfitTotal)}${margin}`)}`)
  }
  if (dailySummaryLines.length > 0) {
    lines.push('', ...dailySummaryLines)
  }

  return lines.join('\n')
}
