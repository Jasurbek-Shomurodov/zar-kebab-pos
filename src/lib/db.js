import { supabase } from './supabase.js'
import { hasMenuItemImage } from './menuMedia.js'
import { applyEmbeddedWaiterNames, loadActiveOrderWaiterNames } from './activeOrderWaiters.js'
import { withWriteTimeout } from './writeTimeout.js'
import { pickQuickItemOrder } from './cashierBills.js'
import {
  getOrderPaymentFields,
  normalizeServiceRatePct,
  restaurantTodayStr,
} from './analytics.js'
import {
  DEFAULT_PRICE_MODE,
  calculateUnitPrice,
  getOrderItemBasePrice,
  getOrderItemUnitPrice,
  normalizePriceMode,
  withPriceModeFields,
} from './priceModes.js'
import {
  notifyTelegramMenuAvailable,
  notifyTelegramMenuArchived,
  notifyTelegramMenuCreated,
  notifyTelegramMenuUnavailable,
  notifyTelegramInvestorOrderChange,
  notifyTelegramOrderStatus,
} from './telegramNotifications.js'
import {
  isOffPremiseOrderType,
  normalizeOrderType,
  orderTypeLabel,
  orderTypePrefix,
} from './orderTypes.js'
import {
  DEFAULT_REGULAR_SERVICE_RATE_PCT,
  DEFAULT_TOURIST_SERVICE_RATE_PCT,
  getConfiguredServiceRatePct,
} from './serviceRates.js'
import { collectPagedRows, loadActiveOrders, loadPaidOrdersForRange } from './orderHistory.js'
import { getRequiredMenuItemCost } from './menuItemCosts.js'
import { trimMenuItemTextFields } from './menuItemText.js'
import { normalizeMenuQuantity, normalizeMenuSaleUnit } from './menuSaleUnits.js'

// ── Loaders ───────────────────────────────────────────────────────────────────

function serviceRatePctFromSettings(settings, priceMode) {
  return getConfiguredServiceRatePct(settings, priceMode)
}

function isMissingOptionalOrderTypeColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('schema cache') &&
    (
      message.includes('order_type') ||
      message.includes('order_number') ||
      message.includes('item_type') ||
      message.includes('is_counter_item') ||
      message.includes('kitchen_round_id') ||
      message.includes('submitted_at') ||
      message.includes('price_mode') ||
      message.includes('base_price') ||
      message.includes('unit_price') ||
      message.includes('sale_unit') ||
      message.includes('selected_options') ||
      message.includes('opened_by') ||
      message.includes('opened_by_name') ||
      message.includes('completed_by') ||
      message.includes('completed_by_name')
    )
  )
}

function isMissingKitchenSubmitRpc(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('submit_order_to_kitchen') ||
    message.includes('schema cache') ||
    message.includes('function') && message.includes('not found')
  )
}

function isMissingRpc(error, functionName) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes(String(functionName || '').toLowerCase()) ||
    message.includes('schema cache') ||
    message.includes('could not find the function') ||
    message.includes('function') && message.includes('not found')
  )
}

function isMissingTableReservationColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('schema cache') &&
    (
      message.includes('reserved_for_name') ||
      message.includes('reserved_for_phone') ||
      message.includes('reserved_at') ||
      message.includes('reserved_until') ||
      message.includes('reservation_notes')
    )
  )
}

function isMissingVariantCostsColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('variant_costs') && (
    message.includes('schema cache') ||
    message.includes('column') ||
    message.includes('42703')
  )
}

function isMissingMenuItemCostSourceColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('cost_source') && (
    message.includes('schema cache') ||
    message.includes('column') ||
    message.includes('42703') ||
    message.includes('pgrst204')
  )
}

function isMissingCategoryScheduleOverridesTable(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('menu_category_user_schedule_overrides') && (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('42p01') ||
    message.includes('pgrst205')
  )
}

function isCategoryScheduleOverridesPermissionError(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('42501') || message.includes('permission denied')
}

function isMissingTouristPricingColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (message.includes('tourist_menu_enabled') || message.includes('public_tourist_prices')) && (
    message.includes('schema cache') ||
    message.includes('column') ||
    message.includes('42703') ||
    message.includes('pgrst204')
  )
}

// Public pages cannot read business_settings; an absent RPC means the switches were never changed.
export async function loadPublicMenuPriceSettings(dbClient = supabase) {
  const { data, error } = await dbClient.rpc('public_menu_price_settings')
  if (error) {
    console.warn('[db] public menu price settings unavailable, using defaults:', error.message)
    return { touristMenuEnabled: true, publicTouristPrices: false }
  }
  const touristMenuEnabled = data?.tourist_menu_enabled !== false
  return { touristMenuEnabled, publicTouristPrices: touristMenuEnabled && data?.public_tourist_prices === true }
}

function isMissingTouristServiceRateColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('tourist_service_rate_pct') && (
    message.includes('schema cache') ||
    message.includes('column') ||
    message.includes('42703') ||
    message.includes('pgrst204')
  )
}

function isMissingDailyBreakEvenIncomeColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('average_daily_break_even_income_uzs') && (
    message.includes('schema cache') ||
    message.includes('column') ||
    message.includes('42703') ||
    message.includes('pgrst204')
  )
}

function normalizeVariantCosts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([variantId, rawCost]) => {
    const id = String(variantId || '').trim()
    const cost = Number(rawCost)
    if (!id || !Number.isFinite(cost)) return []
    return [[id, Math.max(0, Math.round(cost))]]
  }))
}

async function updateRestaurantTableStatus(tableId, fields, fallbackFields = null) {
  let { data, error } = await supabase
    .from('restaurant_tables')
    .update(fields)
    .eq('id', tableId)
    .select('id')
  if (error && fallbackFields && isMissingTableReservationColumn(error)) {
    ;({ data, error } = await supabase
      .from('restaurant_tables')
      .update(fallbackFields)
      .eq('id', tableId)
      .select('id'))
  }
  if (error) throw error
  assertUpdatedRows(data, `Table ${tableId} was not updated. Refresh and try again.`)
}

// Table-wide status writes must never reopen cancelled or completed bills.
const CLOSED_ORDER_STATUS_FILTER = '(cancelled,paid,completed)'

function assertUpdatedRows(data, message) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(message)
  }
}

function makeOrderNumber(orderId, orderType = 'take_away') {
  const suffix = String(orderId || Date.now()).replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `${orderTypePrefix(orderType)}-${suffix}`
}

function orderActorFields(user, fallbackName) {
  const name = user?.name || user?.email || fallbackName
  return { id: user?.id || null, name }
}

function omitOrderTrackingFields(row) {
  const {
    opened_by,
    opened_by_name,
    completed_by,
    completed_by_name,
    ...fallback
  } = row
  return fallback
}

const RECEIPT_MARKETING_MODES = new Set(['none', 'compactFooter', 'loyaltyOnly', 'instagramOnly', 'full'])

function normalizeReceiptMarketing(value) {
  return RECEIPT_MARKETING_MODES.has(value) ? value : 'compactFooter'
}

function normalizeBusinessSettings(row) {
  if (!row) return null
  return {
    restaurantName: row.restaurant_name || 'Zar Kebab',
    serviceRate: normalizeServiceRatePct(row.service_rate_pct, DEFAULT_REGULAR_SERVICE_RATE_PCT),
    touristServiceRate: normalizeServiceRatePct(
      row.tourist_service_rate_pct,
      DEFAULT_TOURIST_SERVICE_RATE_PCT
    ),
    monthlyRentUzs: Math.max(0, Math.round(Number(row.monthly_rent_uzs) || 0)),
    monthlyUtilitiesUzs: Math.max(0, Math.round(Number(row.monthly_utilities_uzs) || 0)),
    averageDailyEmployeeMealUzs: Math.max(0, Math.round(Number(row.average_daily_employee_meal_uzs) || 0)),
    averageDailyBreakEvenIncomeUzs: Math.max(0, Math.round(Number(row.average_daily_break_even_income_uzs ?? 10_000_000) || 0)),
    receiptFooter: row.receipt_footer || '',
    receiptMarketing: normalizeReceiptMarketing(row.receipt_marketing),
    autoPrint: !!row.auto_print,
    autoPrintKitchenCheck: !!row.auto_print_kitchen_check,
    touristMenuEnabled: row.tourist_menu_enabled !== false,
    publicTouristPrices: row.public_tourist_prices === true,
  }
}

export function isRecoverableIdleError(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    message.includes('jwt') ||
    message.includes('token') ||
    message.includes('session') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection') ||
    message.includes('websocket')
  )
}

export async function refreshSupabaseSession(dbClient = supabase) {
  const auth = dbClient?.auth
  if (!auth?.getSession) return null
  const { data, error } = await auth.getSession()
  if (error) throw error

  let activeSession = data?.session || null
  if (activeSession && auth.refreshSession) {
    const { data: refreshedData, error: refreshError } = await auth.refreshSession()
    if (refreshError) throw refreshError
    activeSession = refreshedData?.session || activeSession
  }
  return activeSession
}

async function submitOrderToKitchenRpc({ orderId, table, tableId, orderType, items, paymentFields, state, action, signal }) {
  const isOffPremise = isOffPremiseOrderType(orderType)
  const priceMode = normalizePriceMode(action.payload?.priceMode || action._priceMode || DEFAULT_PRICE_MODE)
  const opener = orderActorFields(state.user, 'Waiter')
  const payload = {
    order: {
      id: orderId,
      table_id: isOffPremise ? null : tableId,
      table_name: isOffPremise ? orderTypeLabel(orderType, 'en') : table.name,
      waiter_name: opener.name,
      opened_by: opener.id,
      opened_by_name: opener.name,
      status: 'sent_to_kitchen',
      payment_status: 'unpaid',
      order_type: orderType,
      order_number: isOffPremise ? (action._orderNumber || makeOrderNumber(orderId, orderType)) : null,
      price_mode: priceMode,
      ...paymentFields,
    },
    items: items.map(i => ({
      id: i.id,
      menu_item_id: i.menu_item_id,
      name: i.name,
      price: getOrderItemUnitPrice(i),
      base_price: getOrderItemBasePrice(i),
      unit_price: getOrderItemUnitPrice(i),
      price_mode: normalizePriceMode(i.price_mode || priceMode),
      quantity: normalizeMenuQuantity(i.quantity, i),
      sale_unit: normalizeMenuSaleUnit(i.sale_unit || i.saleUnit),
      notes: i.notes || '',
      selected_options: i.selected_options || i.selectedOptions || {},
      status: 'new',
      order_type: normalizeOrderType(i.order_type || orderType),
      item_type: i.item_type || i.itemType || 'menu',
      is_counter_item: !!(i.is_counter_item ?? i.isCounterItem),
      kitchen_round_id: i.kitchen_round_id || i.kitchenRoundId || '',
      submitted_at: null,
    })),
    kitchen_round_id: action._kitchenRoundId || items[0]?.kitchen_round_id || '',
    table_status: isOffPremise ? null : 'occupied',
  }

  const { error } = await withAbortSignal(supabase.rpc('submit_order_to_kitchen', { payload }), signal)
  return { error }
}

function withAbortSignal(query, signal) {
  if (signal && typeof query?.abortSignal === 'function') return query.abortSignal(signal)
  return query
}

function kitchenSubmissionIdentity(action) {
  const orderId = String(action?._orderId || '').trim()
  const kitchenRoundId = String(action?._kitchenRoundId || '').trim()
  const items = Array.isArray(action?._items) ? action._items : []
  const itemIds = items.map(item => String(item?.id || '').trim())
  if (!orderId || !kitchenRoundId || itemIds.length === 0 || itemIds.some(id => !id)) return null
  const uniqueItemIds = [...new Set(itemIds)]
  if (uniqueItemIds.length !== itemIds.length) return null
  return { orderId, kitchenRoundId, itemIds: uniqueItemIds }
}

function isMissingKitchenRoundReceiptTable(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('order_kitchen_rounds') && (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('42p01') ||
    text.includes('pgrst205')
  )
}

export async function confirmKitchenRoundSubmission(action, { dbClient = supabase, signal } = {}) {
  const identity = kitchenSubmissionIdentity(action)
  if (!identity) return false

  const { data: receipt, error: receiptError } = await withAbortSignal(dbClient
    .from('order_kitchen_rounds')
    .select('item_ids')
    .eq('order_id', identity.orderId)
    .eq('kitchen_round_id', identity.kitchenRoundId)
    .maybeSingle(), signal)
  if (receiptError && !isMissingKitchenRoundReceiptTable(receiptError)) throw receiptError
  const savedItemIds = new Set(
    (Array.isArray(receipt?.item_ids) ? receipt.item_ids : [])
      .map(id => String(id || '').trim())
      .filter(Boolean)
  )
  if (receipt && identity.itemIds.every(id => savedItemIds.has(id))) return true

  const { data, error } = await withAbortSignal(dbClient
    .from('order_items')
    .select('id')
    .eq('order_id', identity.orderId)
    .eq('kitchen_round_id', identity.kitchenRoundId)
    .in('id', identity.itemIds), signal)
  if (error) throw error

  for (const row of data || []) {
    const savedItemId = String(row?.id || '').trim()
    if (savedItemId) savedItemIds.add(savedItemId)
  }
  const missingItemIds = identity.itemIds.filter(id => !savedItemIds.has(id))
  if (missingItemIds.length === 0) return true

  const { data: cancellations, error: cancellationError } = await withAbortSignal(dbClient
    .from('order_item_cancellations')
    .select('order_item_id')
    .eq('order_id', identity.orderId)
    .in('order_item_id', missingItemIds), signal)
  if (cancellationError) throw cancellationError
  for (const row of cancellations || []) {
    const cancelledItemId = String(row?.order_item_id || '').trim()
    if (cancelledItemId) savedItemIds.add(cancelledItemId)
  }
  if (identity.itemIds.every(id => savedItemIds.has(id))) return true
  if (!receipt) return false

  const integrityError = new Error('The saved kitchen-round receipt does not match every submitted item.')
  integrityError.code = 'POS_KITCHEN_RECEIPT_MISMATCH'
  integrityError.kitchenSubmissionUnresolved = true
  throw integrityError
}

function waitForKitchenConfirmationDelay(delayMs, signal) {
  const delay = Math.max(0, Number(delayMs) || 0)
  if (delay === 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let timeoutId
    const handleAbort = () => {
      clearTimeout(timeoutId)
      reject(signal?.reason || new Error('Kitchen submission confirmation was cancelled'))
    }
    if (signal?.aborted) {
      handleAbort()
      return
    }
    timeoutId = setTimeout(() => {
      signal?.removeEventListener?.('abort', handleAbort)
      resolve()
    }, delay)
    signal?.addEventListener?.('abort', handleAbort, { once: true })
  })
}

export async function waitForKitchenRoundSubmission(action, {
  dbClient = supabase,
  signal,
  attempts,
  delayMs = 500,
} = {}) {
  if (!kitchenSubmissionIdentity(action)) return false
  const requestedAttempts = Number(attempts)
  const attemptCount = Number.isFinite(requestedAttempts) && requestedAttempts > 0
    ? Math.max(1, Math.min(20, Math.floor(requestedAttempts)))
    : signal
      ? Number.POSITIVE_INFINITY
      : 3
  const pollDelayMs = Math.max(0, Number(delayMs) || 0)
  let hadSuccessfulCheck = false
  let lastError = null

  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    if (signal?.aborted) throw signal.reason || new Error('Kitchen submission confirmation was cancelled')
    if (attempt > 0) await waitForKitchenConfirmationDelay(pollDelayMs, signal)
    try {
      if (await confirmKitchenRoundSubmission(action, { dbClient, signal })) return true
      hadSuccessfulCheck = true
    } catch (error) {
      if (signal?.aborted) throw signal.reason || error
      lastError = error
    }
  }

  if (!hadSuccessfulCheck && lastError) throw lastError
  return false
}

export function buildAtomicPaymentPayload(action) {
  const source = action?.payload && typeof action.payload === 'object' ? action.payload : {}
  const orderId = String(source.orderId || '').trim() || null
  const tableId = String(source.tableId || '').trim() || null
  if ((orderId && tableId) || (!orderId && !tableId)) {
    throw new Error('Payment requires exactly one order or table')
  }
  if (!Array.isArray(source.payments)) {
    throw new Error('Payment amounts are required and must match the current bill exactly')
  }

  const loyalty = source.loyalty && typeof source.loyalty === 'object' ? source.loyalty : {}
  return {
    order_id: orderId,
    table_id: tableId,
    payments: source.payments.map(row => ({
      method: row?.method ?? row?.payment_method,
      amount: row?.amount,
    })),
    loyalty_card_number: String(loyalty.loyalty_card_number || loyalty.cardNumber || '').trim() || null,
    loyalty_used_amount: loyalty.loyalty_used_amount ?? loyalty.loyalty_redeem_amount ?? 0,
  }
}

async function loadBusinessSettings(dbClient = supabase) {
  const { data, error } = await dbClient
    .from('business_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle()

  if (error) {
    console.warn('[db] business settings unavailable, using local fallback:', error.message)
    return null
  }

  return normalizeBusinessSettings(data)
}

async function loadRestaurantTables(dbClient = supabase) {
  const sorted = await dbClient
    .from('restaurant_tables')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!sorted.error) return sorted.data || []

  console.warn('[db] table management columns unavailable, loading tables by id:', sorted.error.message)
  const fallback = await dbClient.from('restaurant_tables').select('*').order('id')
  if (fallback.error) throw fallback.error
  return fallback.data || []
}

async function loadTableZones(dbClient = supabase) {
  const { data, error } = await dbClient
    .from('table_zones')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.warn('[db] table_zones unavailable, using table zone names only:', error.message)
    return []
  }

  return data || []
}

export async function loadMenuCatalog(dbClient = supabase) {
  const [categoriesRes, menuItemsRes, initialMenuItemCostsRes, categoryScheduleOverridesRes] = await Promise.all([
    dbClient.from('menu_categories').select('*').order('sort_order'),
    dbClient.from('menu_items').select('*').order('sort_order'),
    dbClient.from('menu_item_costs').select('menu_item_id, cost_price, variant_costs, cost_source'),
    dbClient.from('menu_category_user_schedule_overrides').select('category_id, profile_id'),
  ])
  if (categoriesRes.error) throw categoriesRes.error
  if (menuItemsRes.error) throw menuItemsRes.error
  if (
    categoryScheduleOverridesRes.error &&
    !isMissingCategoryScheduleOverridesTable(categoryScheduleOverridesRes.error) &&
    !isCategoryScheduleOverridesPermissionError(categoryScheduleOverridesRes.error)
  ) {
    throw categoryScheduleOverridesRes.error
  }

  let menuItemCostsRes = initialMenuItemCostsRes
  if (isMissingMenuItemCostSourceColumn(menuItemCostsRes.error)) {
    menuItemCostsRes = await dbClient.from('menu_item_costs').select('menu_item_id, cost_price, variant_costs')
  }
  if (isMissingVariantCostsColumn(menuItemCostsRes.error)) {
    menuItemCostsRes = await dbClient.from('menu_item_costs').select('menu_item_id, cost_price')
  }

  const costsByMenuItemId = menuItemCostsRes.error
    ? new Map()
    : new Map((menuItemCostsRes.data || []).map(row => [row.menu_item_id, row]))
  const scheduleOverridesByCategoryId = new Map()
  for (const row of categoryScheduleOverridesRes.data || []) {
    const categoryId = String(row?.category_id || '').trim()
    const profileId = String(row?.profile_id || '').trim()
    if (!categoryId || !profileId) continue
    const profileIds = scheduleOverridesByCategoryId.get(categoryId) || []
    profileIds.push(profileId)
    scheduleOverridesByCategoryId.set(categoryId, profileIds)
  }

  return {
    categories: (categoriesRes.data || []).map(category => ({
      ...category,
      always_visible_profile_ids: scheduleOverridesByCategoryId.get(category.id) || [],
    })),
    menuItems: (menuItemsRes.data || []).map(item => {
      const protectedCosts = costsByMenuItemId.get(item.id)
      return {
        ...item,
        cost_price: protectedCosts ? protectedCosts.cost_price : null,
        cost_source: protectedCosts?.cost_source === 'tech_card' ? 'tech_card' : 'manual',
        variant_costs: normalizeVariantCosts(protectedCosts?.variant_costs),
      }
    }),
  }
}

export function mergeOperationalOrders(activeOrders = [], paidTodayOrders = []) {
  const byId = new Map(paidTodayOrders.map(order => [order.id, order]))
  activeOrders.forEach(order => byId.set(order.id, order))
  return [...byId.values()]
}

async function loadCurrentOrderState() {
  const today = restaurantTodayStr()
  const [activeOrders, paidTodayOrders] = await Promise.all([
    loadActiveOrders(),
    loadPaidOrdersForRange(today, today),
  ])
  const namedActiveOrders = applyEmbeddedWaiterNames(activeOrders)
    ?? await loadActiveOrderWaiterNames(activeOrders, supabase)
  return mergeOperationalOrders(namedActiveOrders, paidTodayOrders)
}

export async function loadOrders() {
  return loadCurrentOrderState()
}

export async function loadOperationalTableData() {
  const [tables, orders] = await Promise.all([
    loadRestaurantTables(),
    loadCurrentOrderState(),
  ])
  return { tables, orders }
}

export async function loadCashierBillOrders({ tableId = null, orderId = null, signal, dbClient = supabase } = {}) {
  if ((!tableId && !orderId) || (tableId && orderId)) {
    throw new Error('Cashier bill refresh requires exactly one order or table.')
  }

  let query = dbClient
    .from('orders')
    .select('*, items:order_items(*)')
    .or('payment_status.neq.paid,payment_status.is.null')
    .is('paid_at', null)
    .or('status.not.in.(paid,completed,cancelled),status.is.null')

  query = orderId ? query.eq('id', orderId) : query.eq('table_id', tableId)
  const { data, error } = await withAbortSignal(
    query.order('created_at', { ascending: true }),
    signal
  )
  if (error) throw error
  return data || []
}

export async function loadTableOrderHistoryIds(dbClient = supabase) {
  const rows = await collectPagedRows((from, to) => dbClient
    .from('orders')
    .select('table_id')
    .not('table_id', 'is', null)
    .order('created_at', { ascending: false })
    .range(from, to))
  return [...new Set(rows.map(row => row.table_id).filter(Boolean))]
}

export async function loadEarliestOrderDate(dbClient = supabase) {
  const { data, error } = await dbClient
    .from('orders')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.created_at || ''
}

export async function loadReceiptOrderGroup(orderId, options = {}) {
  const dbClient = options.dbClient || supabase
  const select = '*, items:order_items(*), payments:order_payments(*)'
  const { data: order, error } = await withAbortSignal(dbClient
    .from('orders')
    .select(select)
    .eq('id', orderId)
    .maybeSingle(), options.signal)
  if (error) throw error
  if (!order) return []

  const paidAtMs = Date.parse(order.paid_at || '')
  const isGroupedPaidTableOrder = (
    order.table_id &&
    order.payment_status === 'paid' &&
    Number.isFinite(paidAtMs) &&
    !isOffPremiseOrderType(normalizeOrderType(order.order_type))
  )
  if (!isGroupedPaidTableOrder) return [order]

  const minuteStart = new Date(Math.floor(paidAtMs / 60000) * 60000).toISOString()
  const minuteEnd = new Date(Math.floor(paidAtMs / 60000) * 60000 + 60000).toISOString()
  const { data: siblings, error: siblingsError } = await withAbortSignal(dbClient
    .from('orders')
    .select(select)
    .eq('table_id', order.table_id)
    .eq('payment_status', 'paid')
    .gte('paid_at', minuteStart)
    .lt('paid_at', minuteEnd)
    .order('created_at', { ascending: true }), options.signal)
  if (siblingsError) throw siblingsError
  return siblings?.length ? siblings : [order]
}

export async function loadKitchenCheckOrder(orderId, options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await withAbortSignal(dbClient
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', orderId)
    .maybeSingle(), options.signal)
  if (error) throw error
  return data || null
}

export async function loadPOSData() {
  const [tables, tableZones, menuCatalog, orders, settings] = await Promise.all([
    loadRestaurantTables(),
    loadTableZones(),
    loadMenuCatalog(),
    loadCurrentOrderState(),
    loadBusinessSettings(),
  ])

  return {
    tables,
    tableZones,
    categories: menuCatalog.categories,
    menuItems:  menuCatalog.menuItems,
    orders,
    settings,
  }
}

// ── Realtime subscription ─────────────────────────────────────────────────────

export function subscribeToRealtime(dispatch, options = {}) {
  const dbClient = options.dbClient || supabase
  const settingsLoader = options.settingsLoader || (() => loadBusinessSettings(dbClient))
  const menuCatalogLoader = options.menuCatalogLoader || (() => loadMenuCatalog(dbClient))
  const debounceMs = options.debounceMs ?? 250
  const onConnectionIssue = options.onConnectionIssue || (() => {})
  const onSubscribed = options.onSubscribed || (() => {})

  let ordersReloadTimer = null
  let ordersReloadInFlight = false
  let ordersReloadQueued = false
  let settingsReloadTimer = null
  let menuReloadTimer = null

  function notifyRemoteChange(payload) {
    if (!payload || payload.eventType !== 'UPDATE') return
    dispatch({
      type: 'SET_CONNECTION_NOTICE',
      payload: {
        tone: 'info',
        message: 'Changed by another device. Refreshed the latest data.',
      },
    })
  }

  async function reloadOrders() {
    if (ordersReloadInFlight) {
      ordersReloadQueued = true
      return
    }

    ordersReloadInFlight = true
    dispatch({ type: 'SET_ORDERS', payload: await loadOrders() })
    ordersReloadInFlight = false

    if (ordersReloadQueued) {
      ordersReloadQueued = false
      scheduleReloadOrders()
    }
  }

  function scheduleReloadOrders(payload) {
    notifyRemoteChange(payload)
    if (ordersReloadTimer) clearTimeout(ordersReloadTimer)
    ordersReloadTimer = setTimeout(() => {
      ordersReloadTimer = null
      reloadOrders().catch(err => {
        ordersReloadInFlight = false
        console.error('[db] realtime orders reload failed:', err)
      })
    }, debounceMs)
  }

  async function reloadTables(payload) {
    notifyRemoteChange(payload)
    dispatch({ type: 'SET_TABLES', payload: await loadRestaurantTables(dbClient) })
  }

  async function reloadTableZones() {
    dispatch({ type: 'SET_TABLE_ZONES', payload: await loadTableZones(dbClient) })
  }

  function scheduleReloadSettings() {
    if (settingsReloadTimer) clearTimeout(settingsReloadTimer)
    settingsReloadTimer = setTimeout(() => {
      settingsReloadTimer = null
      settingsLoader()
        .then(settings => {
          if (settings) dispatch({ type: 'SET_SETTINGS', payload: settings })
        })
        .catch(err => console.error('[db] realtime settings reload failed:', err))
    }, debounceMs)
  }

  function scheduleReloadMenu(payload) {
    notifyRemoteChange(payload)
    if (menuReloadTimer) clearTimeout(menuReloadTimer)
    menuReloadTimer = setTimeout(() => {
      menuReloadTimer = null
      menuCatalogLoader()
        .then(({ categories, menuItems }) => {
          dispatch({ type: 'SET_CATEGORIES', payload: categories })
          dispatch({ type: 'SET_MENU_ITEMS', payload: menuItems })
        })
        .catch(err => console.error('[db] realtime menu reload failed:', err))
    }, debounceMs)
  }

  const channel = dbClient
    .channel(`pos-realtime-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleReloadOrders)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, scheduleReloadOrders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, scheduleReloadMenu)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_item_costs' }, scheduleReloadMenu)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' }, scheduleReloadMenu)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_category_user_schedule_overrides' }, scheduleReloadMenu)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, reloadTables)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_zones' }, reloadTableZones)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'business_settings' }, scheduleReloadSettings)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
        onSubscribed()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[db] realtime channel status:', status)
        onConnectionIssue(status)
        dispatch({
          type: 'SET_CONNECTION_NOTICE',
          payload: {
            tone: 'error',
            message: 'Realtime connection is unstable. Data may be delayed.',
          },
        })
      }
    })

  return () => {
    if (ordersReloadTimer) clearTimeout(ordersReloadTimer)
    if (settingsReloadTimer) clearTimeout(settingsReloadTimer)
    if (menuReloadTimer) clearTimeout(menuReloadTimer)
    dbClient.removeChannel(channel)
  }
}

// ── Writers ───────────────────────────────────────────────────────────────────

// This RPC reconciles its durable request receipt before retrying a split.
export async function splitCompletedOrderPayment(request, dbClient = supabase) {
  const { data, error } = await withWriteTimeout(
    signal => withAbortSignal(dbClient.rpc('split_paid_order_payment', request), signal),
    'SPLIT_PAID_ORDER_PAYMENT'
  )
  if (error) throw error
  void notifyTelegramInvestorOrderChange([data.orderId])
  return data
}

export async function writeToSupabase(action, state, options = {}) {
  switch (action.type) {

    case 'SEND_TO_KITCHEN': {
      const orderId  = action._orderId
      const tableId  = action._tableId ?? state.currentTableId
      const orderType = normalizeOrderType(action.payload?.orderType)
      const priceMode = normalizePriceMode(action.payload?.priceMode || action._priceMode || DEFAULT_PRICE_MODE)
      const isOffPremise = isOffPremiseOrderType(orderType)
      const table    = isOffPremise ? null : state.tables.find(t => t.id === tableId)

      const submittedAt = action._submittedAt || new Date().toISOString()
      const kitchenRoundId = action._kitchenRoundId || `${orderId}-${submittedAt}`
      const items = (action._items || state.cart.map(i => ({
        ...i,
        status: 'new',
        order_type: orderType,
        kitchen_round_id: kitchenRoundId,
        submitted_at: submittedAt,
        created_at: submittedAt,
      }))).map(i => ({
        ...withPriceModeFields(i, i.price_mode || priceMode),
        status: i.status || 'new',
        order_type: i.order_type || orderType,
        kitchen_round_id: i.kitchen_round_id || kitchenRoundId,
        submitted_at: i.submitted_at || submittedAt,
        created_at: i.created_at || submittedAt,
      }))
      if ((!isOffPremise && !table) || items.length === 0) return
      const addedSubtotal = items.reduce((s, i) => s + getOrderItemUnitPrice(i) * (Number(i.quantity) || 1), 0)
      const { data: existingOrder, error: existingOrderError } = await withAbortSignal(supabase
        .from('orders')
        .select('id, subtotal, service_rate_pct, price_mode')
        .eq('id', orderId)
        .neq('payment_status', 'paid')
        .maybeSingle(), options.signal)
      if (existingOrderError) throw existingOrderError

      const subtotal    = (Number(existingOrder?.subtotal) || 0) + addedSubtotal
      const existingOrderMatchesPriceMode = !existingOrder || normalizePriceMode(existingOrder.price_mode) === priceMode
      const serviceRatePct = isOffPremise ? 0 : existingOrderMatchesPriceMode && Number.isFinite(Number(existingOrder?.service_rate_pct))
        ? Number(existingOrder.service_rate_pct)
        : Number.isFinite(Number(action._serviceRatePct))
          ? Number(action._serviceRatePct)
          : serviceRatePctFromSettings(state.settings, priceMode)
      const paymentFields = getOrderPaymentFields(
        { subtotal, order_type: orderType, service_rate_pct: serviceRatePct },
        [],
        serviceRatePct
      )

      const rpcResult = await submitOrderToKitchenRpc({
        orderId,
        table,
        tableId,
        orderType,
        items,
        paymentFields,
        state,
        action,
        signal: options.signal,
      })
      if (!rpcResult.error) break
      if (!isMissingKitchenSubmitRpc(rpcResult.error)) throw rpcResult.error

      if (existingOrder) {
        let { data: updatedOrder, error: orderUpdateError } = await withAbortSignal(supabase.from('orders').update({
          status: 'sent_to_kitchen',
          price_mode: priceMode,
          ...paymentFields,
        }).eq('id', orderId).select('*').maybeSingle(), options.signal)
        if (orderUpdateError && isMissingOptionalOrderTypeColumn(orderUpdateError)) {
          ;({ data: updatedOrder, error: orderUpdateError } = await withAbortSignal(supabase.from('orders').update({
            status: 'sent_to_kitchen',
            ...paymentFields,
          }).eq('id', orderId).select('*').maybeSingle(), options.signal))
        }
        if (orderUpdateError) throw orderUpdateError
      } else {
        const opener = orderActorFields(state.user, 'Waiter')
        const orderInsert = {
          id:             orderId,
          table_id:       isOffPremise ? null : tableId,
          table_name:     isOffPremise ? orderTypeLabel(orderType, 'en') : table.name,
          waiter_name:    opener.name,
          opened_by:      opener.id,
          opened_by_name: opener.name,
          status:         'sent_to_kitchen',
          payment_status: 'unpaid',
          price_mode:     priceMode,
          ...paymentFields,
        }
        if (isOffPremise) {
          orderInsert.order_number = action._orderNumber || makeOrderNumber(orderId, orderType)
          orderInsert.order_type = orderType
        }
        let { data: createdOrder, error: orderInsertError } = await withAbortSignal(supabase.from('orders').insert(orderInsert).select('*').maybeSingle(), options.signal)
        if (orderInsertError && isOffPremise && isMissingOptionalOrderTypeColumn(orderInsertError)) {
          // Backward-compatible fallback while the take-away migration is being applied.
          // table_id=null + service_fee=0 still lets the order reach kitchen/cashier.
          const { order_type, order_number, price_mode, ...fallbackOrderInsert } = omitOrderTrackingFields(orderInsert)
          ;({ data: createdOrder, error: orderInsertError } = await withAbortSignal(supabase.from('orders').insert(fallbackOrderInsert).select('*').maybeSingle(), options.signal))
        } else if (orderInsertError && isMissingOptionalOrderTypeColumn(orderInsertError)) {
          const { price_mode, ...fallbackOrderInsert } = omitOrderTrackingFields(orderInsert)
          ;({ data: createdOrder, error: orderInsertError } = await withAbortSignal(supabase.from('orders').insert(fallbackOrderInsert).select('*').maybeSingle(), options.signal))
        }
        if (orderInsertError) throw orderInsertError
      }

      const rows = items.map(i => ({
        id:           i.id,
        order_id:     orderId,
        menu_item_id: i.menu_item_id,
        name:         i.name,
        price:        getOrderItemUnitPrice(i),
        base_price:   getOrderItemBasePrice(i),
        unit_price:   getOrderItemUnitPrice(i),
        price_mode:   normalizePriceMode(i.price_mode || priceMode),
        quantity:     normalizeMenuQuantity(i.quantity, i),
        sale_unit:    normalizeMenuSaleUnit(i.sale_unit || i.saleUnit),
        notes:        i.notes || '',
        selected_options: i.selected_options || i.selectedOptions || {},
        status:       'new',
        order_type:   normalizeOrderType(i.order_type || orderType),
        kitchen_round_id: i.kitchen_round_id || i.kitchenRoundId || '',
        submitted_at: null,
      }))
      let { data: insertedItems, error: itemInsertError } = await withAbortSignal(supabase
        .from('order_items')
        .insert(rows)
        .select('*'), options.signal)
      if (itemInsertError && isMissingOptionalOrderTypeColumn(itemInsertError)) {
        const fallbackRows = rows.map(({ order_type, kitchen_round_id, submitted_at, base_price, unit_price, price_mode, selected_options, sale_unit, ...row }) => row)
        ;({ data: insertedItems, error: itemInsertError } = await withAbortSignal(supabase
          .from('order_items')
          .insert(fallbackRows)
          .select('*'), options.signal))
      }
      if (itemInsertError) throw itemInsertError

      if (!isOffPremise) {
        await updateRestaurantTableStatus(
          tableId,
          {
            status: 'occupied',
            reserved_for_name: '',
            reserved_for_phone: '',
            reserved_at: null,
            reserved_until: null,
            reservation_notes: '',
          },
          { status: 'occupied' }
        )
      }
      break
    }

    case 'UPDATE_ORDER_ITEM_STATUS': {
      const { orderId, orderItemId, menuItemId, status, reason, markMenuUnavailable } = action.payload
      if (status === 'cancelled') {
        const { error: cancellationError } = await supabase.from('order_item_cancellations').insert({
          order_id: orderId,
          order_item_id: orderItemId || null,
          menu_item_id: menuItemId || null,
          reason: reason || 'Unavailable',
          created_at: new Date().toISOString(),
        })
        if (cancellationError && !/order_item_cancellations|schema cache|relation/i.test(cancellationError.message || '')) {
          throw cancellationError
        }
        if (markMenuUnavailable && menuItemId) {
          const { error: availabilityError } = await supabase
            .from('menu_items')
            .update({ available: false })
            .eq('id', menuItemId)
          if (availabilityError) throw availabilityError
          void notifyTelegramMenuUnavailable(menuItemId)
        }
      }
      let query = status === 'cancelled'
        ? supabase.from('order_items').delete().eq('order_id', orderId)
        : supabase.from('order_items').update({ status }).eq('order_id', orderId)
      query = orderItemId ? query.eq('id', orderItemId) : query.eq('menu_item_id', menuItemId)
      const { error } = await query
      if (error) throw error

      const { data: order } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('id', orderId)
        .maybeSingle()
      if (order) {
        const serviceRatePct = isOffPremiseOrderType(order.order_type) ? 0 : Number.isFinite(Number(order.service_rate_pct))
          ? Number(order.service_rate_pct)
          : serviceRatePctFromSettings(state.settings, order.price_mode)
        const paymentFields = getOrderPaymentFields(
          { order_type: order.order_type, service_rate_pct: serviceRatePct },
          order.items || [],
          serviceRatePct
        )
        if (paymentFields.total <= 0) {
          await supabase
            .from('orders')
            .update({
              status: 'cancelled',
              payment_status: 'cancelled',
              subtotal: 0,
              service_fee: 0,
              total: 0,
            })
            .eq('id', orderId)
          if (order.table_id) {
            const { data: activeOrders } = await supabase
              .from('orders')
              .select('id')
              .eq('table_id', order.table_id)
              .neq('id', orderId)
              .neq('payment_status', 'paid')
              .neq('status', 'cancelled')
              .limit(1)
            if (!activeOrders?.length) {
              await updateRestaurantTableStatus(order.table_id, { status: 'available' }, { status: 'available' })
            }
          }
        } else {
          await supabase
            .from('orders')
            .update(paymentFields)
            .eq('id', orderId)
        }
      }
      await notifyTelegramOrderStatus(orderId, status)
      break
    }

    case 'CONFIRM_ORDER_DELIVERED': {
      const tableId = action.payload
      // Mark all active orders for this table as delivered. Cancelled shells stay
      // closed: reopening them left empty bills in the open-orders report.
      const { data: tableOrders, error: tableOrdersError } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', tableId)
        .neq('payment_status', 'paid')
        .neq('payment_status', 'cancelled')
        .not('status', 'in', CLOSED_ORDER_STATUS_FILTER)
      if (tableOrdersError) throw tableOrdersError
      if (tableOrders?.length) {
        const ids = tableOrders.map(o => o.id)
        const { data: deliveredOrders, error: ordersError } = await supabase
          .from('orders')
          .update({ status: 'delivered' })
          .in('id', ids)
          .select('id')
        if (ordersError) throw ordersError
        assertUpdatedRows(deliveredOrders, 'Order was not marked served. Refresh and try again.')
        const { data: servedItems, error: itemsError } = await supabase
          .from('order_items')
          .update({ status: 'served' })
          .in('order_id', ids)
          .select('id')
        if (itemsError) throw itemsError
        assertUpdatedRows(servedItems, 'Order items were not marked served. Refresh and try again.')
        await Promise.all(ids.map(id => notifyTelegramOrderStatus(id, 'completed')))
      }
      break
    }

    case 'MARK_TABLE_NEEDS_BILL': {
      const tableId = action.payload
      const { data: billOrders, error: ordersError } = await supabase
        .from('orders')
        .update({ status: 'needs_bill' })
        .eq('table_id', tableId)
        .neq('payment_status', 'paid')
        .neq('payment_status', 'cancelled')
        .not('status', 'in', CLOSED_ORDER_STATUS_FILTER)
        .select('id')
      if (ordersError) throw ordersError
      // Soft check: if no orders matched (e.g. legacy null payment_status), still update the table
      if (!billOrders?.length) {
        const { data: fallbackOrders, error: fallbackError } = await supabase
          .from('orders')
          .update({ status: 'needs_bill' })
          .eq('table_id', tableId)
          .is('payment_status', null)
          .not('status', 'in', CLOSED_ORDER_STATUS_FILTER)
          .select('id')
        if (fallbackError) throw fallbackError
        if (!fallbackOrders?.length) {
          throw new Error('Order was not moved to bill. Refresh and try again.')
        }
      }
      await updateRestaurantTableStatus(tableId, { status: 'needs_bill' }, { status: 'needs_bill' })
      break
    }

    case 'RECALL_TABLE_FROM_CASHIER': {
      const tableId = action.payload
      const { error } = await supabase.rpc('recall_table_from_cashier', { p_table_id: tableId })
      if (error) throw error
      break
    }

    case 'ADD_QUICK_ITEM_TO_ORDER': {
      const { tableId, orderId, item } = action.payload
      if ((!tableId && !orderId) || !item) return

      let query = supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .neq('payment_status', 'paid')
      query = orderId ? query.eq('id', orderId) : query.eq('table_id', tableId)
      const { data: orders, error: ordersError } = await query
        .order('created_at', { ascending: true })
      if (ordersError) throw ordersError

      const order = pickQuickItemOrder(orders || [], { tableId, orderId })
      if (!order) return

      const existing = (order.items || []).find(row =>
        row.menu_item_id === item.id &&
        !row.notes &&
        ['served', 'new', 'ready', 'preparing'].includes(row.status)
      )

      let nextItems
      if (existing) {
        const nextQty = (Number(existing.quantity) || 1) + 1
        const updateRow = {
          quantity: nextQty,
          item_type: existing.item_type || existing.itemType || 'counter',
          is_counter_item: true,
        }
        let { error } = await supabase
          .from('order_items')
          .update(updateRow)
          .eq('id', existing.id)
        if (error && isMissingOptionalOrderTypeColumn(error)) {
          ;({ error } = await supabase
            .from('order_items')
            .update({ quantity: nextQty })
            .eq('id', existing.id))
        }
        if (error) throw error
        nextItems = (order.items || []).map(row => row.id === existing.id
          ? {
              ...row,
              quantity: nextQty,
              item_type: row.item_type || row.itemType || 'counter',
              is_counter_item: true,
            }
          : row
        )
      } else {
        const row = {
          id: action._itemId,
          order_id: order.id,
          menu_item_id: item.id,
          name: item.name,
          price: Number(item.unit_price ?? item.unitPrice ?? item.price) || 0,
          base_price: Number(item.base_price ?? item.basePrice ?? item.price) || 0,
          unit_price: Number(item.unit_price ?? item.unitPrice ?? item.price) || 0,
          price_mode: normalizePriceMode(item.price_mode || item.priceMode || order.price_mode),
          quantity: 1,
          notes: '',
          status: item.sendToKitchen || item.send_to_kitchen ? 'new' : 'served',
          order_type: item.order_type || order.order_type || 'dine_in',
          item_type: item.item_type || item.itemType || 'counter',
          is_counter_item: item.is_counter_item ?? item.isCounterItem ?? true,
        }
        let { error } = await supabase.from('order_items').insert(row)
        if (error && isMissingOptionalOrderTypeColumn(error)) {
          const { order_type, item_type, is_counter_item, base_price, unit_price, price_mode, ...fallbackRow } = row
          ;({ error } = await supabase.from('order_items').insert(fallbackRow))
        }
        if (error) throw error
        nextItems = [...(order.items || []), row]
      }

      const serviceRatePct = isOffPremiseOrderType(order.order_type) ? 0 : Number.isFinite(Number(order.service_rate_pct))
        ? Number(order.service_rate_pct)
        : serviceRatePctFromSettings(state.settings, order.price_mode)
      const paymentFields = getOrderPaymentFields(
        { order_type: order.order_type, service_rate_pct: serviceRatePct },
        nextItems,
        serviceRatePct
      )
      const orderUpdateFields = paymentFields.total <= 0
        ? {
            status: 'cancelled',
            payment_status: 'cancelled',
            subtotal: 0,
            service_fee: 0,
            total: 0,
          }
        : paymentFields
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update(orderUpdateFields)
        .eq('id', order.id)
      if (orderUpdateError) throw orderUpdateError
      if (paymentFields.total <= 0 && order.table_id) {
        const { data: activeOrders, error: activeOrdersError } = await supabase
          .from('orders')
          .select('id')
          .eq('table_id', order.table_id)
          .neq('id', order.id)
          .neq('payment_status', 'paid')
          .neq('status', 'cancelled')
          .limit(1)
        if (activeOrdersError) throw activeOrdersError
        if (!activeOrders?.length) {
          await updateRestaurantTableStatus(order.table_id, { status: 'available' }, { status: 'available' })
        }
      }
      break
    }

    case 'UPDATE_ORDER_PRICE_MODE': {
      const { tableId, orderId } = action.payload || {}
      const priceMode = normalizePriceMode(action.payload?.priceMode)
      if (!tableId && !orderId) return

      let query = supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .neq('payment_status', 'paid')
      query = orderId ? query.eq('id', orderId) : query.eq('table_id', tableId)
      const { data: orders, error: ordersError } = await query
      if (ordersError) throw ordersError

      for (const order of orders || []) {
        const nextItems = (order.items || []).map(item => {
          const basePrice = getOrderItemBasePrice(item)
          const unitPrice = calculateUnitPrice(basePrice, priceMode)
          return {
            ...item,
            base_price: basePrice,
            unit_price: unitPrice,
            price: unitPrice,
            price_mode: priceMode,
          }
        })

        for (const item of nextItems) {
          const updateRow = {
            price: item.unit_price,
            base_price: item.base_price,
            unit_price: item.unit_price,
            price_mode: priceMode,
          }
          let { error } = await supabase.from('order_items').update(updateRow).eq('id', item.id)
          if (error && isMissingOptionalOrderTypeColumn(error)) {
            ;({ error } = await supabase.from('order_items').update({ price: item.unit_price }).eq('id', item.id))
          }
          if (error) throw error
        }

        const priceModeChanged = normalizePriceMode(order.price_mode) !== priceMode
        const serviceRatePct = isOffPremiseOrderType(order.order_type)
          ? 0
          : !priceModeChanged && Number.isFinite(Number(order.service_rate_pct))
            ? Number(order.service_rate_pct)
            : serviceRatePctFromSettings(state.settings, priceMode)
        const paymentFields = getOrderPaymentFields(
          { ...order, order_type: order.order_type, service_rate_pct: serviceRatePct, price_mode: priceMode },
          nextItems,
          serviceRatePct
        )
        let { error: orderUpdateError } = await supabase
          .from('orders')
          .update({ price_mode: priceMode, ...paymentFields })
          .eq('id', order.id)
        if (orderUpdateError && isMissingOptionalOrderTypeColumn(orderUpdateError)) {
          ;({ error: orderUpdateError } = await supabase
            .from('orders')
            .update(paymentFields)
            .eq('id', order.id))
        }
        if (orderUpdateError) throw orderUpdateError
      }
      break
    }

    case 'UPDATE_BILL_ITEM_QTY': {
      const { tableId, orderId, orderItemId, sourceItemIds = [], qty } = action.payload
      const { error } = await withAbortSignal(supabase.rpc('update_bill_item_quantity', {
        payload: {
          request_id: action._billEditRequestId,
          table_id: tableId || null,
          order_id: orderId || null,
          order_item_id: orderItemId,
          source_item_ids: sourceItemIds,
          quantity: Number(qty),
        },
      }), options.signal)
      if (error) throw error
      break
    }

    case 'MARK_ORDER_PAID': {
      const payload = buildAtomicPaymentPayload(action)
      const { data, error } = await withAbortSignal(
        supabase.rpc('settle_orders_payment', { payload }),
        options.signal
      )
      if (error) throw error

      const paidOrderIds = Array.isArray(data?.order_ids) ? data.order_ids.filter(Boolean) : []
      if (paidOrderIds.length === 0) {
        throw new Error('No unpaid orders were settled. Refresh and try again.')
      }
      notifyTelegramOrderStatus(paidOrderIds, 'completed')
      break
    }

    case 'CHANGE_PAID_ORDER_PAYMENT_METHOD': {
      const orderIds = (action.payload?.orderIds || []).filter(Boolean)
      const paymentMethod = String(action.payload?.paymentMethod || '').trim().toLowerCase()
      if (orderIds.length === 0 || !paymentMethod) return
      const { error } = await supabase.rpc('change_paid_order_payment_method_owner', {
        p_order_ids: orderIds,
        p_payment_method: paymentMethod,
      })
      if (error) throw error
      void notifyTelegramInvestorOrderChange(orderIds)
      break
    }

    case 'CHANGE_PAID_ORDER_PAYMENT_METHODS': {
      const changes = (action.payload?.changes || [])
        .map(row => ({
          paymentId: String(row?.paymentId || '').trim(),
          method: String(row?.method || '').trim().toLowerCase(),
        }))
        .filter(row => row.paymentId && row.method)
      if (changes.length === 0) return
      const { data, error } = await supabase.rpc('change_paid_order_payment_methods_owner', {
        p_changes: changes,
      })
      if (error) throw error
      void notifyTelegramInvestorOrderChange(data?.orderIds || data?.order_ids || [])
      break
    }

    case 'DELETE_ORDER': {
      const orderId = typeof action.payload === 'string' ? action.payload : action.payload?.orderId
      if (!orderId) return
      const reason = String(action.payload?.reason || '').trim()
      if (!reason || reason.length > 1000) throw new Error('A deletion reason of 1–1000 characters is required')
      const { error } = await supabase.rpc('delete_order_owner', { p_order_id: orderId, p_reason: reason })
      if (error) throw error
      void notifyTelegramInvestorOrderChange(orderId)
      break
    }

    case 'SET_SETTINGS': {
      const settings = action.payload || {}
      const serviceRatePct = serviceRatePctFromSettings(settings, 'regular')
      const touristServiceRatePct = serviceRatePctFromSettings(settings, 'tourist')
      const settingsRow = {
        id: 'default',
        restaurant_name: settings.restaurantName || 'Zar Kebab',
        service_rate_pct: serviceRatePct,
        tourist_service_rate_pct: touristServiceRatePct,
        monthly_rent_uzs: Math.max(0, Math.round(Number(settings.monthlyRentUzs) || 0)),
        monthly_utilities_uzs: Math.max(0, Math.round(Number(settings.monthlyUtilitiesUzs) || 0)),
        average_daily_employee_meal_uzs: Math.max(0, Math.round(Number(settings.averageDailyEmployeeMealUzs) || 0)),
        average_daily_break_even_income_uzs: Math.max(0, Math.round(Number(settings.averageDailyBreakEvenIncomeUzs) || 0)),
        receipt_footer: settings.receiptFooter || '',
        receipt_marketing: normalizeReceiptMarketing(settings.receiptMarketing),
        auto_print: !!settings.autoPrint,
        auto_print_kitchen_check: !!settings.autoPrintKitchenCheck,
        tourist_menu_enabled: settings.touristMenuEnabled !== false,
        public_tourist_prices: settings.publicTouristPrices === true,
        updated_at: new Date().toISOString(),
      }
      let { error } = await supabase
        .from('business_settings')
        .upsert(settingsRow)
      let compatibleSettingsRow = settingsRow
      if (error && isMissingTouristPricingColumn(error)) {
        if (settings.touristMenuEnabled === false || settings.publicTouristPrices === true) {
          throw new Error('Run migrations/238_tourist_menu_toggle.sql to change Tourist menu settings')
        }
        const { tourist_menu_enabled, public_tourist_prices, ...legacySettingsRow } = compatibleSettingsRow
        compatibleSettingsRow = legacySettingsRow
        ;({ error } = await supabase
          .from('business_settings')
          .upsert(compatibleSettingsRow))
      }
      if (error && isMissingDailyBreakEvenIncomeColumn(error)) {
        const { average_daily_break_even_income_uzs, ...legacySettingsRow } = compatibleSettingsRow
        compatibleSettingsRow = legacySettingsRow
        ;({ error } = await supabase
          .from('business_settings')
          .upsert(compatibleSettingsRow))
      }
      if (error && isMissingTouristServiceRateColumn(error)) {
        const { tourist_service_rate_pct, ...legacySettingsRow } = compatibleSettingsRow
        ;({ error } = await supabase
          .from('business_settings')
          .upsert(legacySettingsRow))
      }
      if (error) throw error
      break
    }

    case 'ADD_TABLE': {
      const { error } = await supabase.from('restaurant_tables').insert(action.payload)
      if (error) throw error
      break
    }

    case 'UPDATE_TABLE': {
      const { id, ...fields } = action.payload
      const { error } = await supabase.from('restaurant_tables').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      break
    }

    case 'REORDER_TABLES': {
      const updates = (action.payload?.updates || []).filter(update =>
        update?.id && Number.isFinite(Number(update.sort_order))
      )
      const updatedAt = new Date().toISOString()
      const results = await Promise.all(updates.map(update =>
        supabase
          .from('restaurant_tables')
          .update({ sort_order: Number(update.sort_order), updated_at: updatedAt })
          .eq('id', update.id)
      ))
      const error = results.find(result => result.error)?.error
      if (error) throw error
      break
    }

    case 'DELETE_TABLE': {
      const { data: history, error: historyError } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', action.payload)
        .limit(1)
      if (historyError) throw historyError
      if (history?.length) {
        throw new Error('This table has order history. Disable it instead of deleting it.')
      }
      const { error } = await supabase.from('restaurant_tables').delete().eq('id', action.payload)
      if (error) throw error
      break
    }

    case 'ADD_TABLE_ZONE': {
      const { error } = await supabase.from('table_zones').insert(action.payload)
      if (error) throw error
      break
    }

    case 'UPDATE_TABLE_ZONE': {
      const { id, ...fields } = action.payload
      const { error } = await supabase.from('table_zones').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      break
    }

    case 'ADD_MENU_ITEM': {
      const {
        cost_price: costPrice,
        costPrice: _costPriceAlias,
        variant_costs: variantCosts,
        variantCosts: _variantCostsAlias,
        ...fields
      } = action.payload
      const requiredCost = getRequiredMenuItemCost(costPrice ?? _costPriceAlias)
      if (requiredCost === null) {
        throw new Error('Real cost must be greater than zero for every new product.')
      }
      if (!hasMenuItemImage([fields.image_url, ...(fields.media_urls || [])])) {
        throw new Error('menu_item_image_required')
      }
      const normalizedVariantCosts = normalizeVariantCosts(variantCosts ?? _variantCostsAlias)
      const normalizedFields = trimMenuItemTextFields(fields)
      const rpcResult = await supabase.rpc('create_menu_item_with_media_and_cost', {
        payload: {
          ...normalizedFields,
          cost_price: requiredCost,
          variant_costs: normalizedVariantCosts,
        },
      })
      if (!rpcResult.error) {
        void notifyTelegramMenuCreated(normalizedFields.id)
        break
      }
      if (isMissingRpc(rpcResult.error, 'create_menu_item_with_media_and_cost')) {
        throw new Error('Database migration 103 is required before creating menu products with media.')
      }
      throw rpcResult.error
    }

    case 'UPDATE_MENU_ITEM': {
      const {
        id,
        cost_price: costPrice,
        costPrice: _costPriceAlias,
        cost_source: _costSource,
        costSource: _costSourceAlias,
        variant_costs: variantCosts,
        variantCosts: _variantCostsAlias,
        ...fields
      } = action.payload
      delete fields.external_id
      delete fields.externalId
      const normalizedFields = trimMenuItemTextFields(fields)
      const { error } = await supabase.from('menu_items').update(normalizedFields).eq('id', id)
      if (error) throw error
      if (normalizedFields.available === false) {
        void notifyTelegramMenuUnavailable(id)
      } else if (normalizedFields.available === true) {
        void notifyTelegramMenuAvailable(id)
      }
      const { error: costError } = await supabase.from('menu_item_costs').upsert({
        menu_item_id: id,
        cost_price: Math.max(0, Math.round(Number(costPrice ?? _costPriceAlias) || 0)),
        variant_costs: normalizeVariantCosts(variantCosts ?? _variantCostsAlias),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'menu_item_id' })
      if (costError) throw costError
      break
    }

    case 'DELETE_MENU_ITEM': {
      const deletedAt = new Date().toISOString()
      const payload = {
        show_in_cashier_quick_items: false,
        deleted_at: deletedAt,
      }
      const { data, error } = await supabase
        .from('menu_items')
        .update(payload)
        .eq('id', action.payload)
        .select('id, deleted_at')
      if (error) {
        const text = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
        const missingDeletedAt = text.includes('deleted_at') && (
          text.includes('column') ||
          text.includes('schema cache') ||
          text.includes('42703')
        )
        if (missingDeletedAt) {
          throw new Error('Menu archive migration is missing. Apply migrations 078 and 115, then try again.')
        }
        throw error
      }
      if (!data?.length) throw new Error('Menu item was not archived. Refresh permissions and try again.')
      void notifyTelegramMenuArchived(action.payload)
      action.meta = { ...(action.meta || {}), deleted_at: deletedAt }
      break
    }

    case 'RESTORE_MENU_ITEM': {
      const { data, error } = await supabase
        .from('menu_items')
        .update({ deleted_at: null })
        .eq('id', action.payload)
        .select('id, deleted_at, available, show_in_cashier_quick_items')
      if (error) throw error
      if (!data?.length) throw new Error('Menu item was not restored. Refresh permissions and try again.')
      action.meta = { ...(action.meta || {}), restored: data[0] }
      break
    }

    case 'REORDER_MENU_ITEM': {
      if (Array.isArray(action.payload?.updates)) {
        const updates = action.payload.updates.filter(update => update?.id && Number.isFinite(Number(update.sort_order)))
        const results = await Promise.all(updates.map(update =>
          supabase.from('menu_items').update({ sort_order: Number(update.sort_order) }).eq('id', update.id)
        ))
        const error = results.find(result => result.error)?.error
        if (error) throw error
        break
      }
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return

      const results = await Promise.all([
        supabase.from('menu_items').update({ sort_order: itemB.sort_order ?? 0 }).eq('id', idA),
        supabase.from('menu_items').update({ sort_order: itemA.sort_order ?? 0 }).eq('id', idB),
      ])
      const error = results.find(result => result.error)?.error
      if (error) throw error
      break
    }

    case 'REORDER_QUICK_ITEM': {
      if (Array.isArray(action.payload?.updates)) {
        const updates = action.payload.updates.filter(update => update?.id && Number.isFinite(Number(update.quick_item_sort_order)))
        const results = await Promise.all(updates.map(update =>
          supabase.from('menu_items').update({ quick_item_sort_order: Number(update.quick_item_sort_order) }).eq('id', update.id)
        ))
        const error = results.find(result => result.error)?.error
        if (error) throw error
        break
      }
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return

      const orderA = Number(itemA.quick_item_sort_order ?? itemA.sort_order ?? 0)
      const orderB = Number(itemB.quick_item_sort_order ?? itemB.sort_order ?? 0)
      const results = await Promise.all([
        supabase.from('menu_items').update({ quick_item_sort_order: orderB }).eq('id', idA),
        supabase.from('menu_items').update({ quick_item_sort_order: orderA }).eq('id', idB),
      ])
      const error = results.find(result => result.error)?.error
      if (error) throw error
      break
    }

    case 'ADD_CATEGORY': {
      const hasScheduleOverrides = Object.prototype.hasOwnProperty.call(action.payload, 'always_visible_profile_ids')
      const { always_visible_profile_ids: profileIds = [], ...categoryFields } = action.payload
      const { error } = await supabase.from('menu_categories').insert(categoryFields)
      if (error) throw error
      if (hasScheduleOverrides) {
        const { error: overrideError } = await supabase.rpc('set_menu_category_user_schedule_overrides', {
          p_category_id: categoryFields.id,
          p_profile_ids: profileIds,
        })
        if (overrideError) overrideError.categoryDetailsSaved = true
        if (overrideError) throw overrideError
      }
      break
    }

    case 'UPDATE_CATEGORY': {
      const hasScheduleOverrides = Object.prototype.hasOwnProperty.call(action.payload, 'always_visible_profile_ids')
      const { id, always_visible_profile_ids: profileIds = [], ...fields } = action.payload
      const { error } = await supabase.from('menu_categories').update(fields).eq('id', id)
      if (error) throw error
      if (hasScheduleOverrides) {
        const { error: overrideError } = await supabase.rpc('set_menu_category_user_schedule_overrides', {
          p_category_id: id,
          p_profile_ids: profileIds,
        })
        if (overrideError) overrideError.categoryDetailsSaved = true
        if (overrideError) throw overrideError
      }
      break
    }

    case 'DELETE_CATEGORY': {
      const deletedAt = new Date().toISOString()
      const { error } = await supabase.from('menu_categories').update({
        hidden: true,
        waiter_hidden: true,
        tourist_hidden: true,
        deleted_at: deletedAt,
      }).eq('id', action.payload)
      if (error) throw error
      action.meta = { ...(action.meta || {}), deleted_at: deletedAt }
      break
    }

    case 'RESTORE_CATEGORY': {
      // Archival hid the category everywhere; it stays hidden after restore so
      // staff choose its visibility again instead of it reappearing publicly.
      const { data, error } = await supabase
        .from('menu_categories')
        .update({ deleted_at: null })
        .eq('id', action.payload)
        .select('id, deleted_at, hidden, waiter_hidden, tourist_hidden')
      if (error) throw error
      if (!data?.length) throw new Error('Category was not restored. Refresh permissions and try again.')
      action.meta = { ...(action.meta || {}), restored: data[0] }
      break
    }

    case 'REORDER_CATEGORY': {
      if (Array.isArray(action.payload?.updates)) {
        const updates = action.payload.updates.filter(update => update?.id && Number.isFinite(Number(update.sort_order)))
        const results = await Promise.all(updates.map(update =>
          supabase.from('menu_categories').update({ sort_order: Number(update.sort_order) }).eq('id', update.id)
        ))
        const error = results.find(result => result.error)?.error
        if (error) throw error
        break
      }
      const { idA, idB } = action.payload
      const catA = state.categories.find(c => c.id === idA)
      const catB = state.categories.find(c => c.id === idB)
      if (!catA || !catB) return

      const results = await Promise.all([
        supabase.from('menu_categories').update({ sort_order: catB.sort_order ?? 0 }).eq('id', idA),
        supabase.from('menu_categories').update({ sort_order: catA.sort_order ?? 0 }).eq('id', idB),
      ])
      const error = results.find(result => result.error)?.error
      if (error) throw error
      break
    }

    default:
      break
  }
}
