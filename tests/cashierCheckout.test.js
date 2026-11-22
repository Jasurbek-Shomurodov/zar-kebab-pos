import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyLoyaltyToCashierPaymentQuote,
  canConfirmCashierCheckout,
  getFreshCashierPaymentQuote,
  getOrderGroupPaymentQuote,
} from '../src/lib/cashierCheckout.js'

test('fresh cashier quote preserves the saved Tourist service-rate snapshot', () => {
  const quote = getFreshCashierPaymentQuote({
    tableId: 't6',
    settings: { serviceRatePct: 15, touristServiceRatePct: 20 },
    menuItems: [{ id: 'zor-set', show_in_cashier_quick_items: false }],
    orders: [{
      id: 'order-t6',
      table_id: 't6',
      status: 'needs_bill',
      payment_status: 'unpaid',
      price_mode: 'tourist',
      service_rate_pct: 20,
      items: [{
        id: 'item-1',
        menu_item_id: 'zor-set',
        quantity: 1,
        unit_price: 83_000,
        status: 'new',
        item_type: 'menu',
        is_counter_item: false,
      }],
    }],
  })

  assert.equal(quote.subtotal, 83_000)
  assert.equal(quote.serviceFee, 16_600)
  assert.equal(quote.total, 99_600)
})

test('fresh cashier quote sums separate saved service rates instead of flattening table rounds', () => {
  const quote = getFreshCashierPaymentQuote({
    tableId: 't1',
    orders: [
      {
        id: 'regular', table_id: 't1', status: 'needs_bill', payment_status: 'unpaid', service_rate_pct: 15,
        items: [{ id: 'r1', quantity: 1, unit_price: 100_000, status: 'new' }],
      },
      {
        id: 'tourist', table_id: 't1', status: 'needs_bill', payment_status: 'unpaid', service_rate_pct: 20,
        items: [{ id: 't1', quantity: 1, unit_price: 100_000, status: 'new' }],
      },
    ],
  })

  assert.equal(quote.total, 235_000)
  assert.equal(quote.serviceRatePct, null)
})

test('empty Regular shell cannot replace a real Tourist cashier bill snapshot', () => {
  const quote = getFreshCashierPaymentQuote({
    tableId: 't5',
    settings: { serviceRatePct: 15, touristServiceRatePct: 20 },
    orders: [
      {
        id: 'empty-regular', table_id: 't5', status: 'needs_bill', payment_status: 'unpaid',
        price_mode: 'regular', service_rate_pct: 15, subtotal: 83_000, service_fee: 12_450,
        total: 95_450, opened_by_name: 'Manager', items: [],
      },
      {
        id: 'real-tourist', table_id: 't5', status: 'needs_bill', payment_status: 'unpaid',
        price_mode: 'tourist', service_rate_pct: 20, opened_by_name: 'Zilola',
        items: [{ id: 'item-1', quantity: 1, unit_price: 131_000, status: 'new' }],
      },
    ],
  })

  assert.equal(quote.primaryOrderId, 'real-tourist')
  assert.equal(quote.priceMode, 'tourist')
  assert.equal(quote.serviceRatePct, 20)
  assert.equal(quote.total, 157_200)
  assert.deepEqual(quote.contributingOrderIds, ['real-tourist'])
})

test('receipt quote reproduces the photographed Tourist bill and ignores the stale Regular shell', () => {
  const quote = getOrderGroupPaymentQuote({
    settings: { serviceRate: 15, touristServiceRate: 20 },
    orders: [
      {
        id: 'empty-regular', price_mode: 'regular', service_rate_pct: 15,
        subtotal: 83_000, service_fee: 12_450, total: 95_450, items: [],
      },
      {
        id: 'tourist-bill', price_mode: 'tourist', service_rate_pct: 20,
        items: [
          { id: 'chicken', quantity: 1, unit_price: 29_000 },
          { id: 'mince', quantity: 1, unit_price: 30_000 },
          { id: 'achichuk', quantity: 1, unit_price: 24_000 },
        ],
      },
    ],
  })

  assert.equal(quote.primaryOrderId, 'tourist-bill')
  assert.deepEqual(quote.contributingOrderIds, ['tourist-bill'])
  assert.equal(quote.priceMode, 'tourist')
  assert.equal(quote.serviceRatePct, 20)
  assert.equal(quote.subtotal, 83_000)
  assert.equal(quote.serviceFee, 16_600)
  assert.equal(quote.total, 99_600)
})

test('receipt quote sums each saved service rate and loyalty amount before printing', () => {
  const quote = getOrderGroupPaymentQuote({
    orders: [
      {
        id: 'regular', price_mode: 'regular', service_rate_pct: 15,
        payment_status: 'paid', loyalty_used_amount: 5_000, cashback_earned: 1_000,
        items: [{ id: 'r1', quantity: 1, unit_price: 100_000 }],
      },
      {
        id: 'tourist', price_mode: 'tourist', service_rate_pct: 20,
        payment_status: 'paid', loyalty_used_amount: 10_000, cashback_earned: 2_000,
        items: [{ id: 't1', quantity: 1, unit_price: 100_000 }],
      },
    ],
  })

  assert.equal(quote.subtotal, 200_000)
  assert.equal(quote.serviceFee, 35_000)
  assert.equal(quote.loyaltyUsedAmount, 15_000)
  assert.equal(quote.cashbackEarned, 3_000)
  assert.equal(quote.total, 220_000)
  assert.equal(quote.serviceRatePct, null)
  assert.equal(quote.priceMode, null)
})

test('cancelled, zero-quantity, and zero-price rows cannot make an empty shell printable', () => {
  const quote = getOrderGroupPaymentQuote({
    orders: [{
      id: 'empty', price_mode: 'regular', service_rate_pct: 15, total: 100_000,
      items: [
        { id: 'cancelled', quantity: 1, unit_price: 50_000, status: 'cancelled' },
        { id: 'zero-quantity', quantity: 0, unit_price: 50_000 },
        { id: 'zero-price', quantity: 1, unit_price: 0 },
      ],
    }],
  })

  assert.equal(quote.primaryOrderId, null)
  assert.deepEqual(quote.contributingOrderIds, [])
  assert.equal(quote.total, 0)
})

test('cashier quote applies loyalty without flattening saved service fees', () => {
  const payment = applyLoyaltyToCashierPaymentQuote({
    subtotal: 131_000,
    serviceFee: 26_200,
    counterItemsSubtotal: 3_000,
    grossAmount: 157_200,
    serviceRatePct: 20,
  }, 7_200)

  assert.equal(payment.serviceFee, 26_200)
  assert.equal(payment.counterItemsSubtotal, 3_000)
  assert.equal(payment.loyaltyUsedAmount, 7_200)
  assert.equal(payment.total, 150_000)
})

test('cashier can confirm a bill paid completely with loyalty', () => {
  assert.equal(canConfirmCashierCheckout({
    canEditCashier: true,
    loyaltyReady: true,
    grossAmount: 99_600,
    loyaltyUsedAmount: 99_600,
    paymentValidation: { totalAmount: 0, canConfirmPayment: false },
    isProcessingPayment: false,
    isRefreshingBill: false,
  }), true)
})

test('cashier confirmation remains disabled while the authoritative bill refresh is pending', () => {
  assert.equal(canConfirmCashierCheckout({
    canEditCashier: true,
    loyaltyReady: true,
    grossAmount: 99_600,
    loyaltyUsedAmount: 0,
    paymentValidation: { totalAmount: 99_600, canConfirmPayment: true },
    isProcessingPayment: false,
    isRefreshingBill: true,
  }), false)
})

test('a weight-sold line cannot leave the fresh quote a fraction away from the shown total', () => {
  // 42 000 x 0.7 kg is 29399.999999999996 in binary floating point. The bill shows 29 400,
  // so an unrounded fresh quote would report "bill changed" on every Confirm tap.
  const orders = [{
    id: 'order-weight',
    table_id: null,
    order_type: 'take_away',
    status: 'needs_bill',
    payment_status: 'unpaid',
    price_mode: 'regular',
    service_rate_pct: 0,
    items: [{
      id: 'item-weight',
      menu_item_id: 'kebab-kg',
      quantity: 0.7,
      unit_price: 42_000,
      status: 'new',
      item_type: 'menu',
      is_counter_item: false,
    }],
  }]
  const menuItems = [{ id: 'kebab-kg', show_in_cashier_quick_items: false }]
  const shown = applyLoyaltyToCashierPaymentQuote(
    getOrderGroupPaymentQuote({ orders, menuItems, settings: {}, ignoreStoredLoyalty: true }),
    0
  )
  const fresh = getFreshCashierPaymentQuote({ orders, menuItems, settings: {}, orderId: 'order-weight' })

  assert.equal(shown.total, 29_400)
  assert.equal(fresh.total, shown.total)
  assert.equal(fresh.grossAmount, shown.grossAmount)
  assert.ok(Number.isInteger(fresh.total))
})
