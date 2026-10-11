import { getActiveTableOrders } from '../lib/tableGuestEntry.js'
import {
  allocateSplitPaymentsToOrders,
  calculateLoyaltyCashback,
  getOrderPaymentFields,
  getOrderPaymentSummary,
  getPaymentMethodSummary,
  isCancelledOrderItem,
  isPaidOrder,
  normalizeSplitPayments,
  removeSentCartItems,
} from '../lib/analytics.js'
import {
  DEFAULT_PRICE_MODE,
  calculateUnitPrice,
  getOrderItemBasePrice,
  getOrderItemUnitPrice,
  normalizePriceMode,
  withPriceModeFields,
} from '../lib/priceModes.js'
import {
  makeOrderNumber,
  makeLocalId,
  normalizeOrderType,
  recalcOrderTotals,
  serviceRatePctFromSettings,
} from './reducerHelpers.js'
import { normalizeMenuQuantity } from '../lib/menuSaleUnits.js'
import { getLoyaltyCardCashbackPercent } from '../lib/loyalty.js'
import { isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes.js'
import { pickQuickItemOrder } from '../lib/cashierBills.js'

// Table-wide served/bill actions never reopen paid or cancelled bills.
function isReopenableTableOrder(order) {
  return !isPaidOrder(order) && order.status !== 'cancelled' && order.payment_status !== 'cancelled'
}

function orderActorFields(user, fallbackName) {
  const name = user?.name || user?.email || fallbackName
  return { id: user?.id || null, name }
}

export function ordersReducer(state, action) {
  switch (action.type) {
    case 'SET_ORDERS':
      return { ...state, orders: action.payload }

    case 'SYNC_CASHIER_BILL_ORDERS': {
      const freshOrders = Array.isArray(action.payload?.orders) ? action.payload.orders : []
      const freshOrderIds = new Set(freshOrders.map(order => order?.id).filter(Boolean))
      const tableId = action.payload?.tableId || null
      const orderId = action.payload?.orderId || null
      const isTargetActiveOrder = order => {
        const matchesTarget = orderId ? order.id === orderId : order.table_id === tableId
        return matchesTarget &&
          order.payment_status !== 'paid' &&
          !order.paid_at &&
          !['paid', 'completed', 'cancelled'].includes(String(order.status || '').toLowerCase())
      }
      return {
        ...state,
        orders: [
          ...state.orders.filter(order => !freshOrderIds.has(order.id) && !isTargetActiveOrder(order)),
          ...freshOrders,
        ],
      }
    }

    case 'SEND_TO_KITCHEN': {
      const orderType = normalizeOrderType(action.payload?.orderType)
      const isOffPremise = isOffPremiseOrderType(orderType)
      const tableId = isOffPremise ? null : (action._tableId || state.currentTableId)
      const table = isOffPremise ? null : state.tables.find(t => t.id === tableId)
      const orderId = action._orderId || ('o' + Date.now())
      const opener = orderActorFields(state.user, 'Waiter')
      const priceMode = normalizePriceMode(action.payload?.priceMode || action._priceMode || DEFAULT_PRICE_MODE)
      const submittedAt = action._submittedAt || new Date().toISOString()
      const kitchenRoundId = action._kitchenRoundId || `${orderId}-${submittedAt}`
      const cartItems = (action._items || state.cart.map(i => ({
        ...i,
        id: makeLocalId(),
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
      if (cartItems.length === 0) return state
      if (action._kitchenSubmissionReconciled) {
        return { ...state, cart: removeSentCartItems(state.cart, cartItems) }
      }

      const exactOrder = state.orders.find(o => o.id === orderId)
      const exactOrderItemIds = new Set((exactOrder?.items || []).map(item => item.id).filter(Boolean))
      const exactRoundAlreadyLoaded = !!exactOrder && cartItems.every(item => item.id && exactOrderItemIds.has(item.id))
      if (exactRoundAlreadyLoaded) {
        return { ...state, cart: removeSentCartItems(state.cart, cartItems) }
      }
      if (exactOrder && isPaidOrder(exactOrder)) return state
      if (!isOffPremise && !table) return state

      const activeOrder = exactOrder || (!action._orderId && !isOffPremise
        ? getActiveTableOrders(tableId, state.orders)[0]
        : null)
      const existingItemIds = new Set((activeOrder?.items || []).map(item => item.id).filter(Boolean))
      const newCartItems = activeOrder
        ? cartItems.filter(item => !item.id || !existingItemIds.has(item.id))
        : cartItems
      const addedSubtotal = newCartItems.reduce((s, i) => s + getOrderItemUnitPrice(i) * (Number(i.quantity) || 1), 0)
      const subtotal = (Number(activeOrder?.subtotal) || 0) + addedSubtotal
      const activeOrderMatchesPriceMode = !activeOrder || normalizePriceMode(activeOrder.price_mode) === priceMode
      const serviceRatePct = isOffPremise ? 0 : activeOrderMatchesPriceMode && Number.isFinite(Number(activeOrder?.service_rate_pct))
        ? Number(activeOrder.service_rate_pct)
        : Number.isFinite(Number(action._serviceRatePct))
          ? Number(action._serviceRatePct)
          : serviceRatePctFromSettings(state.settings, priceMode)
      const paymentFields = getOrderPaymentFields(
        { subtotal, order_type: orderType, service_rate_pct: serviceRatePct },
        [],
        serviceRatePct
      )
      const nextOrders = activeOrder
        ? state.orders.map(o => o.id === activeOrder.id
            ? {
                ...o,
                status: 'sent_to_kitchen',
                price_mode: priceMode,
                items: [...(o.items || []), ...newCartItems],
                ...paymentFields,
              }
            : o
          )
        : [...state.orders, {
            id: orderId,
            order_number: isOffPremise ? (action._orderNumber || makeOrderNumber(orderId, orderType)) : undefined,
            order_type: orderType,
            price_mode: priceMode,
            table_id: tableId,
            table_name: isOffPremise ? orderTypeLabel(orderType, 'en') : table.name,
            waiter_name: opener.name,
            opened_by: opener.id,
            opened_by_name: opener.name,
            status: 'sent_to_kitchen',
            payment_status: 'unpaid',
            items: cartItems,
            ...paymentFields,
            created_at: new Date().toISOString(),
          }]
      const updatedTables = isOffPremise ? state.tables : state.tables.map(t =>
        t.id === tableId
          ? {
              ...t,
              status: 'occupied',
              reserved_for_name: '',
              reserved_for_phone: '',
              reserved_at: null,
              reserved_until: null,
              reservation_notes: '',
            }
          : t
      )
      return { ...state, orders: nextOrders, cart: removeSentCartItems(state.cart, cartItems), tables: updatedTables }
    }

    case 'UPDATE_ORDER_ITEM_STATUS': {
      const { orderId, orderItemId, menuItemId, status } = action.payload
      let removedOrder = null
      const orders = state.orders.flatMap(o => {
        if (o.id !== orderId) return [o]
        const matchesItem = i => orderItemId ? i.id === orderItemId : i.menu_item_id === menuItemId
        const nextItems = status === 'cancelled'
          ? o.items.filter(i => !matchesItem(i))
          : o.items.map(i => matchesItem(i) ? { ...i, status } : i)
        const nextOrder = recalcOrderTotals({ ...o, items: nextItems }, state.settings)
        const billableItems = nextItems.filter(item => !isCancelledOrderItem(item))
        const shouldRemove = billableItems.length === 0 || getOrderPaymentSummary(nextOrder, nextItems, nextOrder.service_rate_pct).total <= 0
        if (shouldRemove) {
          removedOrder = nextOrder
          return []
        }
        return [nextOrder]
      })
      const hasOtherActiveTableOrders = removedOrder?.table_id
        ? orders.some(o => o.table_id === removedOrder.table_id && o.payment_status !== 'paid' && o.status !== 'cancelled')
        : false
      return {
        ...state,
        orders,
        tables: removedOrder?.table_id && !hasOtherActiveTableOrders
          ? state.tables.map(t => t.id === removedOrder.table_id ? { ...t, status: 'available' } : t)
          : state.tables,
      }
    }

    case 'CONFIRM_ORDER_DELIVERED': {
      const tableId = action.payload
      const statusChangedAt = action._statusChangedAt || new Date().toISOString()
      return {
        ...state,
        orders: state.orders.map(o =>
          o.table_id === tableId && isReopenableTableOrder(o)
            ? {
              ...o,
              status: 'delivered',
              updated_at: statusChangedAt,
              items: o.items.map(i => ({ ...i, status: 'served', updated_at: statusChangedAt })),
            }
            : o
        ),
      }
    }

    case 'MARK_TABLE_NEEDS_BILL': {
      const statusChangedAt = action._statusChangedAt || new Date().toISOString()
      return {
        ...state,
        tables: state.tables.map(t =>
          t.id === action.payload ? { ...t, status: 'needs_bill', updated_at: statusChangedAt } : t
        ),
        orders: state.orders.map(o =>
          o.table_id === action.payload && isReopenableTableOrder(o)
            ? { ...o, status: 'needs_bill', updated_at: statusChangedAt }
            : o
        ),
      }
    }

    case 'RECALL_TABLE_FROM_CASHIER': {
      const tableId = action.payload
      const statusChangedAt = action._statusChangedAt || new Date().toISOString()
      return {
        ...state,
        tables: state.tables.map(t =>
          t.id === tableId ? { ...t, status: 'occupied', updated_at: statusChangedAt } : t
        ),
        orders: state.orders.map(o =>
          o.table_id === tableId && o.payment_status !== 'paid' && o.status !== 'cancelled'
            ? { ...o, status: 'sent_to_kitchen', updated_at: statusChangedAt }
            : o
        ),
      }
    }

    case 'ADD_QUICK_ITEM_TO_ORDER': {
      const { tableId, orderId, item } = action.payload
      const activeOrder = pickQuickItemOrder(state.orders, { tableId, orderId })
      if (!activeOrder || !item) return state

      const existing = (activeOrder.items || []).find(i =>
        i.menu_item_id === item.id &&
        !i.notes &&
        (i.status === 'served' || i.status === 'new' || i.status === 'ready' || i.status === 'preparing')
      )
      const nextItems = existing
        ? activeOrder.items.map(i => i.id === existing.id
            ? {
                ...i,
                quantity: (Number(i.quantity) || 1) + 1,
                item_type: i.item_type || i.itemType || 'counter',
                is_counter_item: true,
              }
            : i
          )
        : [
            ...(activeOrder.items || []),
            {
              id: action._itemId || makeLocalId(),
              menu_item_id: item.id,
              name: item.name,
              price: Number(item.price) || 0,
              base_price: Number(item.base_price ?? item.basePrice ?? item.price) || 0,
              unit_price: Number(item.unit_price ?? item.unitPrice ?? item.price) || 0,
              price_mode: normalizePriceMode(item.price_mode || item.priceMode || activeOrder.price_mode),
              quantity: 1,
              notes: '',
              status: item.sendToKitchen || item.send_to_kitchen ? 'new' : 'served',
              order_type: item.order_type || activeOrder.order_type || 'dine_in',
              item_type: item.item_type || item.itemType || 'counter',
              is_counter_item: item.is_counter_item ?? item.isCounterItem ?? true,
            },
          ]

      return {
        ...state,
        orders: state.orders.map(o => o.id === activeOrder.id
          ? recalcOrderTotals({ ...o, items: nextItems }, state.settings)
          : o
        ),
      }
    }

    case 'UPDATE_ORDER_PRICE_MODE': {
      const { tableId, orderId } = action.payload || {}
      const priceMode = normalizePriceMode(action.payload?.priceMode)
      return {
        ...state,
        orders: state.orders.map(order => {
          const matches = orderId ? order.id === orderId : order.table_id === tableId
          if (!matches || order.payment_status === 'paid') return order
          const priceModeChanged = normalizePriceMode(order.price_mode) !== priceMode
          const nextServiceRatePct = isOffPremiseOrderType(order.order_type)
            ? 0
            : !priceModeChanged && Number.isFinite(Number(order.service_rate_pct))
              ? Number(order.service_rate_pct)
              : serviceRatePctFromSettings(state.settings, priceMode)
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
          return recalcOrderTotals({
            ...order,
            price_mode: priceMode,
            service_rate_pct: nextServiceRatePct,
            items: nextItems,
          }, state.settings)
        }),
      }
    }

    case 'UPDATE_BILL_ITEM_QTY': {
      const { tableId, orderId, orderItemId, menuItemId, qty } = action.payload
      const sourceItemIds = new Set(action.payload.sourceItemIds || [])
      const rawQty = Number(qty) || 0
      const nextQty = rawQty <= 0 ? 0 : normalizeMenuQuantity(rawQty, action.payload)
      let removedOrder = null

      return {
        ...state,
        orders: state.orders.flatMap(o => {
          if ((orderId ? o.id !== orderId : o.table_id !== tableId) || o.payment_status === 'paid') return [o]
          const matchesItem = i => orderItemId
            ? i.id === orderItemId || sourceItemIds.has(i.id)
            : i.menu_item_id === menuItemId
          const target = (o.items || []).find(matchesItem)
          const hasItem = !!target
          if (!hasItem) return [o]
          const nextItems = nextQty <= 0
            ? (o.items || []).filter(i => !matchesItem(i))
            : (o.items || []).flatMap(i => {
                if (!matchesItem(i)) return [i]
                if (i.id !== target.id) return []
                return [{ ...i, quantity: nextQty }]
              })
          const nextOrder = recalcOrderTotals({ ...o, items: nextItems }, state.settings)
          const billableItems = nextItems.filter(item => !isCancelledOrderItem(item))
          const shouldRemove = billableItems.length === 0 || getOrderPaymentSummary(nextOrder, nextItems, nextOrder.service_rate_pct).total <= 0
          if (shouldRemove) {
            removedOrder = nextOrder
            return []
          }
          return [nextOrder]
        }),
        tables: removedOrder?.table_id && !state.orders.some(o =>
          o.id !== removedOrder.id &&
          o.table_id === removedOrder.table_id &&
          o.payment_status !== 'paid' &&
          o.status !== 'cancelled'
        )
          ? state.tables.map(t => t.id === removedOrder.table_id ? { ...t, status: 'available' } : t)
          : state.tables,
      }
    }

    case 'MARK_ORDER_PAID': {
      const tableId = typeof action.payload === 'string' ? action.payload : action.payload.tableId
      const orderId = typeof action.payload === 'object' ? action.payload.orderId : null
      const loyalty = typeof action.payload === 'object' ? action.payload.loyalty : null
      const payment_method = typeof action.payload === 'object' ? action.payload.payment_method : null
      const requestedPayments = typeof action.payload === 'object' ? action.payload.payments : null
      const paidAt = new Date().toISOString()
      const completer = orderActorFields(state.user, 'Cashier')
      const cashbackPercent = getLoyaltyCardCashbackPercent(loyalty?.cashback_type || loyalty?.cashbackType || 'bronze')
      let remainingLoyalty = Math.max(0, Math.round(Number(loyalty?.loyalty_used_amount ?? loyalty?.loyalty_redeem_amount ?? 0) || 0))
      const activeOrderSummaries = state.orders
        .filter(o => (orderId ? o.id === orderId : o.table_id === tableId) && o.payment_status !== 'paid')
        .map(o => {
          const isOffPremise = isOffPremiseOrderType(o.order_type)
          const serviceRatePct = isOffPremise ? 0 : Number.isFinite(Number(loyalty?.service_rate_pct))
            ? Number(loyalty.service_rate_pct)
            : Number.isFinite(Number(o.service_rate_pct))
              ? Number(o.service_rate_pct)
              : serviceRatePctFromSettings(state.settings, o.price_mode)
          const gross = getOrderPaymentSummary({ ...o, service_rate_pct: serviceRatePct }, o.items || [], serviceRatePct)
          const loyaltyUsedAmount = Math.min(remainingLoyalty, gross.total)
          remainingLoyalty -= loyaltyUsedAmount
          const cashbackEarned = calculateLoyaltyCashback(
            { ...o, loyalty_used_amount: loyaltyUsedAmount, status: 'paid', payment_status: 'paid' },
            o.items || [],
            loyalty?.loyalty_card_number ? cashbackPercent : 0
          )
          const fields = getOrderPaymentFields(
            {
              ...o,
              service_rate_pct: serviceRatePct,
              loyalty_used_amount: loyaltyUsedAmount,
              loyalty_redeem_amount: loyaltyUsedAmount,
              cashback_earned: cashbackEarned,
            },
            o.items || [],
            serviceRatePct
          )
          return { id: o.id, fields, total: fields.total, loyaltyUsedAmount, cashbackEarned }
        })
      const totalDue = activeOrderSummaries.reduce((sum, row) => sum + row.total, 0)
      const payments = normalizeSplitPayments(
        requestedPayments || [{ method: payment_method || 'cash', amount: totalDue }],
        totalDue
      )
      const finalPaymentMethod = getPaymentMethodSummary(payments, payment_method)
      const paymentAllocations = new Map(activeOrderSummaries.map(row => [row.id, []]))
      allocateSplitPaymentsToOrders(activeOrderSummaries, payments).forEach(row => {
        paymentAllocations.get(row.order_id)?.push({ method: row.method, amount: row.amount })
      })
      // IDs of orders being paid in this action
      const paidOrderIds = new Set(
        state.orders
          .filter(o => (orderId ? o.id === orderId : o.table_id === tableId) && o.payment_status !== 'paid')
          .map(o => o.id)
      )

      // Reset table to available when it has no remaining unpaid orders after this payment.
      // For tableId-based payments we reset directly (original behaviour, no table left behind).
      // For orderId-based payments we must check that no OTHER unpaid orders exist for the same table.
      const tableResetFields = {
        status: 'available',
        reserved_for_name: '',
        reserved_for_phone: '',
        reserved_at: null,
        reserved_until: null,
        reservation_notes: '',
      }

      const updatedTables = state.tables.map(t => {
        if (!orderId) {
          // tableId-based: reset the one table directly
          return t.id === tableId ? { ...t, ...tableResetFields } : t
        }
        // orderId-based: find out which table the paid order belongs to
        const paidOrderForTable = state.orders.find(o => paidOrderIds.has(o.id) && o.table_id === t.id)
        if (!paidOrderForTable) return t
        const hasOtherUnpaid = state.orders.some(
          o => o.table_id === t.id && o.payment_status !== 'paid' && !paidOrderIds.has(o.id)
        )
        return hasOtherUnpaid ? t : { ...t, ...tableResetFields }
      })

      return {
        ...state,
        tables: updatedTables,
        orders: state.orders.map(o => {
          if ((orderId ? o.id !== orderId : o.table_id !== tableId) || o.payment_status === 'paid') return o
          const isOffPremise = isOffPremiseOrderType(o.order_type)
          const serviceRatePct = isOffPremise ? 0 : Number.isFinite(Number(loyalty?.service_rate_pct))
            ? Number(loyalty.service_rate_pct)
            : Number.isFinite(Number(o.service_rate_pct))
              ? Number(o.service_rate_pct)
              : serviceRatePctFromSettings(state.settings, o.price_mode)
          const activeSummary = activeOrderSummaries.find(row => row.id === o.id)
          const paymentFields = activeSummary?.fields || getOrderPaymentFields(
            { ...o, ...(loyalty || {}), service_rate_pct: serviceRatePct },
            o.items || [],
            serviceRatePct
          )
          return {
            ...o,
            status: 'paid',
            payment_status: 'paid',
            paid_at: paidAt,
            completed_by: completer.id,
            completed_by_name: completer.name,
            payment_method: finalPaymentMethod,
            payments: paymentAllocations.get(o.id) || [],
            loyalty_card_number: loyalty?.loyalty_card_number || null,
            cashback_percent: loyalty?.loyalty_card_number ? cashbackPercent : 0,
            cashback_earned: activeSummary?.cashbackEarned || 0,
            ...paymentFields,
          }
        }),
      }
    }

    case 'CHANGE_PAID_ORDER_PAYMENT_METHOD': {
      const orderIds = new Set((action.payload?.orderIds || []).filter(Boolean))
      const paymentMethod = String(action.payload?.paymentMethod || '').trim().toLowerCase()
      if (orderIds.size === 0 || !['cash', 'card', 'terminal'].includes(paymentMethod)) return state
      return {
        ...state,
        orders: state.orders.map(order => orderIds.has(order.id)
          ? {
              ...order,
              payment_method: paymentMethod,
              payments: (order.payments || []).map(payment => (
                payment.method === 'loyalty_card'
                  ? payment
                  : { ...payment, method: paymentMethod }
              )),
            }
          : order
        ),
      }
    }

    case 'CHANGE_PAID_ORDER_PAYMENT_METHODS': {
      const methodByPaymentId = new Map((action.payload?.changes || [])
        .filter(row => row?.paymentId && ['cash', 'card', 'terminal'].includes(row?.method))
        .map(row => [row.paymentId, row.method]))
      if (methodByPaymentId.size === 0) return state

      return {
        ...state,
        orders: state.orders.map(order => {
          const payments = (order.payments || []).map(payment => methodByPaymentId.has(payment.id)
            ? { ...payment, method: methodByPaymentId.get(payment.id) }
            : payment)
          if (!payments.some((payment, index) => payment !== (order.payments || [])[index])) return order
          const nonLoyaltyPayments = payments.filter(payment => payment.method !== 'loyalty_card')
          return {
            ...order,
            payment_method: getPaymentMethodSummary(nonLoyaltyPayments, order.payment_method),
            payments,
          }
        }),
      }
    }

    case 'DELETE_ORDER': {
      const orderId = typeof action.payload === 'string' ? action.payload : action.payload?.orderId
      if (!orderId) return state
      const removedOrder = state.orders.find(o => o.id === orderId)
      const orders = state.orders.filter(o => o.id !== orderId)
      const hasOtherActiveTableOrders = removedOrder?.table_id
        ? orders.some(o =>
            o.table_id === removedOrder.table_id &&
            o.payment_status !== 'paid' &&
            o.status !== 'cancelled'
          )
        : false
      return {
        ...state,
        orders,
        tables: removedOrder?.table_id && !hasOtherActiveTableOrders
          ? state.tables.map(t => t.id === removedOrder.table_id
              ? {
                  ...t,
                  status: 'available',
                  reserved_for_name: '',
                  reserved_for_phone: '',
                  reserved_at: null,
                  reserved_until: null,
                  reservation_notes: '',
                }
              : t
            )
          : state.tables,
      }
    }

    default:
      return state
  }
}
