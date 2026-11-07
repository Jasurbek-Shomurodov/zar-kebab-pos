import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CASHBACK_TYPES,
  DEFAULT_CASHBACK_TYPE,
  adjustLoyaltyBalance,
  canAdjustLoyaltyBalance,
  canCreateLoyaltyCard,
  canDeleteLoyaltyTransaction,
  canEditLoyaltyCard,
  canRemoveLoyaltyCard,
  canViewLoyaltyCards,
  completeOrderCashback,
  createLoyaltyCardRecord,
  deleteLoyaltyTransactionRecord,
  editLoyaltyCardRecord,
  formatUzPhoneNumberInput,
  getCashbackTypePercent,
  getLoyaltyCardCashbackPercent,
  getLoyaltyCardCashbackType,
  getLoyaltyCardDisplay,
  getLoyaltyCashbackPreview,
  getLoyaltyTransactionHistory,
  getPublicLoyaltyCardView,
  isMissingLoyaltySchemaColumn,
  isValidUzPhoneNumber,
  normalizeCardNumber,
  normalizeCashbackType,
  redeemLoyaltyBalance,
  removeLoyaltyCardRecord,
  validateLoyaltyPayment,
} from '../src/lib/loyalty.js'
import {
  getMaxLoyaltyRedeemAmount,
  getOrderPaymentSummary,
  getSplitPaymentValidation,
} from '../src/lib/analytics.js'

function assertLoyaltyError(fn, code) {
  assert.throws(fn, error => error?.name === 'LoyaltyError' && error?.code === code)
}

function card(overrides = {}) {
  return {
    id: 'lc-1',
    card_number: '00123456',
    public_token: 'public-token-1',
    customer_name: 'Ali Valiyev',
    phone_number: '+998901112233',
    cashback_type: 'silver',
    balance: 50000,
    total_earned: 120000,
    total_redeemed: 70000,
    is_active: true,
    updated_at: '2026-05-20T10:00:00.000Z',
    ...overrides,
  }
}

function item(overrides = {}) {
  return {
    id: 'item-1',
    menu_item_id: 'kebab',
    name: 'Kebab',
    quantity: 1,
    price: 100000,
    ...overrides,
  }
}

function unpaidOrder(overrides = {}) {
  return {
    id: 'order-1',
    status: 'needs_bill',
    payment_status: 'unpaid',
    order_type: 'dine_in',
    service_rate_pct: 15,
    ...overrides,
  }
}

function paidOrder(overrides = {}) {
  return {
    ...unpaidOrder(),
    status: 'paid',
    payment_status: 'paid',
    paid_at: '2026-05-20T12:00:00.000Z',
    ...overrides,
  }
}

test('loyalty card registration is owner/admin and preserves exact 8-digit card numbers', () => {
  const created = createLoyaltyCardRecord({
    role: 'owner',
    cardNumber: '00123456',
    customerName: ' Sabina ',
    phoneNumber: ' +998901112233 ',
    publicToken: 'token-00123456',
    existingCardNumbers: [],
    now: '2026-05-20T10:00:00.000Z',
  })

  assert.equal(created.card_number, '00123456')
  assert.equal(typeof created.card_number, 'string')
  assert.equal(created.customer_name, 'Sabina')
  assert.equal(created.phone_number, '+998 90 111 22 33')
  assert.equal(created.cashback_type, DEFAULT_CASHBACK_TYPE)
  assert.equal(created.public_token, 'token-00123456')
  assert.equal(created.balance, 0)
  assert.equal(created.total_earned, 0)
  assert.equal(created.total_redeemed, 0)
  assert.equal(created.is_active, true)

  const adminCreated = createLoyaltyCardRecord({ role: 'admin', cardNumber: '11112222' })
  assert.equal(adminCreated.card_number, '11112222')
  assertLoyaltyError(() => createLoyaltyCardRecord({ role: 'viewer', cardNumber: '11112222' }), 'forbidden')
  assertLoyaltyError(() => createLoyaltyCardRecord({ role: 'owner', cardNumber: '1234567' }), 'invalid_card_number')
  assertLoyaltyError(() => createLoyaltyCardRecord({ role: 'owner', cardNumber: '123456789' }), 'invalid_card_number')
  assertLoyaltyError(() => createLoyaltyCardRecord({ role: 'owner', cardNumber: '1234abcd' }), 'invalid_card_number')
  assertLoyaltyError(() => createLoyaltyCardRecord({
    role: 'owner',
    cardNumber: '00123456',
    existingCardNumbers: ['00123456'],
    phoneNumber: '+998 91 132 32 32',
  }), 'duplicate_card_number')
  const withoutPhoneOrName = createLoyaltyCardRecord({ role: 'owner', cardNumber: '11112222' })
  assert.equal(withoutPhoneOrName.customer_name, '')
  assert.equal(withoutPhoneOrName.phone_number, '')
  assertLoyaltyError(() => createLoyaltyCardRecord({
    role: 'owner',
    cardNumber: '11112222',
    phoneNumber: '+998 91 132',
  }), 'invalid_phone_number')
  assert.equal(normalizeCardNumber('00000001'), '00000001')
})

test('loyalty card phone input masks and validates Uzbek numbers', () => {
  assert.equal(formatUzPhoneNumberInput('911323232'), '+998 91 132 32 32')
  assert.equal(formatUzPhoneNumberInput('+998911323232'), '+998 91 132 32 32')
  assert.equal(isValidUzPhoneNumber('+998 91 132 32 32'), true)
  assert.equal(isValidUzPhoneNumber('+998 911 32 32'), false)
})

test('loyalty schema cache helper detects missing migration columns without masking other errors', () => {
  assert.equal(isMissingLoyaltySchemaColumn({
    message: "Could not find the 'cashback_type' column of 'loyalty_cards' in the schema cache",
  }, 'cashback_type'), true)
  assert.equal(isMissingLoyaltySchemaColumn({
    message: "Could not find the 'cashback_percent_used' column of 'loyalty_transactions' in the schema cache",
  }, 'cashback_percent_used'), true)
  assert.equal(isMissingLoyaltySchemaColumn({ message: 'duplicate key value violates unique constraint' }, 'cashback_type'), false)
})

test('loyalty card display keeps card number, phone number, balance, type and fallbacks distinct', () => {
  const display = getLoyaltyCardDisplay(card({ cashback_type: 'gold' }))

  assert.equal(display.cardNumber, '00123456')
  assert.equal(display.customerName, 'Ali Valiyev')
  assert.equal(display.phoneNumber, '+998901112233')
  assert.equal(display.cashbackType, 'Gold')
  assert.equal(display.cashbackPercent, 7)
  assert.equal(display.balance, 50000)
  assert.equal(display.totalEarned, 120000)
  assert.equal(display.totalRedeemed, 70000)
  assert.equal(display.status, 'Active')

  const missing = getLoyaltyCardDisplay(card({ customer_name: '', phone_number: '', card_number: '00000009' }))
  assert.equal(missing.customerName, 'Unnamed customer')
  assert.equal(missing.phoneNumber, 'No phone')
  assert.equal(missing.cardNumber, '00000009')
  assert.notEqual(missing.cardNumber, missing.phoneNumber)
})

test('cashback types use fixed rates and reject invalid types', () => {
  assert.deepEqual(Object.keys(CASHBACK_TYPES), ['bronze', 'silver', 'gold', 'premium', 'black', 'platinum', 'special'])
  assert.equal(getCashbackTypePercent('bronze'), 3)
  assert.equal(getCashbackTypePercent('silver'), 5)
  assert.equal(getCashbackTypePercent('gold'), 7)
  assert.equal(getCashbackTypePercent('premium'), 10)
  assert.equal(getCashbackTypePercent('black'), 15)
  assert.equal(getCashbackTypePercent('platinum'), 30)
  assert.equal(getCashbackTypePercent('special'), 40)
  assert.equal(normalizeCashbackType('Gold'), 'gold')
  assert.equal(getLoyaltyCardCashbackType({ cashbackType: 'Premium' }), 'premium')
  assert.equal(getLoyaltyCardCashbackPercent({ cashbackType: 'Premium' }), 10)
  assert.equal(getLoyaltyCardCashbackPercent({ cashback_type: 'black' }), 15)
  assert.equal(getLoyaltyCardCashbackType({ cashbackType: 'Platinum' }), 'platinum')
  assert.equal(getLoyaltyCardCashbackPercent({ cashback_type: 'platinum' }), 30)
  assert.equal(getLoyaltyCardCashbackType({ cashbackType: 'Special' }), 'special')
  assert.equal(getLoyaltyCardCashbackPercent({ cashback_type: 'special' }), 40)
  assertLoyaltyError(() => normalizeCashbackType('diamond'), 'invalid_cashback_type')
})

test('cashback preview uses selected loyalty card type against subtotal plus service', () => {
  const rows = [
    item({ id: 'menu-total', menu_item_id: 'menu-total', price: 151000 }),
    item({ id: 'counter-total', menu_item_id: 'cola', price: 99000, item_type: 'counter', is_counter_item: true }),
  ]
  const order = paidOrder({ service_rate_pct: 15, tip_amount: 50000 })
  const expectedByType = {
    bronze: 8179,
    silver: 13632,
    gold: 19085,
    premium: 27265,
    black: 40897,
    platinum: 81795,
    special: 109060,
  }

  for (const [cashbackType, expected] of Object.entries(expectedByType)) {
    const preview = getLoyaltyCashbackPreview({
      order,
      items: rows,
      loyaltyUsedAmount: 0,
      card: card({ cashback_type: undefined, cashbackType }),
    })
    assert.equal(preview.cashback, expected)
  }

  const premiumPreview = getLoyaltyCashbackPreview({
    order,
    items: rows,
    loyaltyUsedAmount: 0,
    card: card({ cashback_type: undefined, cashbackType: 'premium' }),
  })
  assert.equal(premiumPreview.cashback, 27265)
  assert.notEqual(premiumPreview.cashback, 7550)

  const premiumPartial = getLoyaltyCashbackPreview({
    order,
    items: rows,
    loyaltyUsedAmount: 50000,
    card: card({ cashback_type: undefined, cashbackType: 'premium' }),
  })
  assert.equal(premiumPartial.cashback, 22265)

  const premiumOverRedeemed = getLoyaltyCashbackPreview({
    order,
    items: rows,
    loyaltyUsedAmount: 300000,
    card: card({ cashback_type: undefined, cashbackType: 'premium' }),
  })
  assert.equal(premiumOverRedeemed.cashback, 0)
})

test('cashback type is immutable after registration while customer details remain editable', () => {
  const original = card({ cashback_type: 'bronze' })
  const oldSettlement = completeOrderCashback({
    card: original,
    order: paidOrder(),
    items: [item({ price: 99999 })],
    loyaltyUsedAmount: 0,
    now: '2026-05-20T12:00:00.000Z',
  })
  const edited = editLoyaltyCardRecord({
    role: 'owner',
    card: original,
    patch: { customer_name: 'New Name', phone_number: '+998 91 132 32 32' },
  })
  const newSettlement = completeOrderCashback({
    card: edited,
    order: paidOrder({ id: 'order-2' }),
    items: [item({ price: 99999 })],
    loyaltyUsedAmount: 0,
    now: '2026-05-21T12:00:00.000Z',
  })

  assert.equal(edited.customer_name, 'New Name')
  assert.equal(edited.phone_number, '+998 91 132 32 32')
  assert.equal(edited.cashback_type, 'bronze')
  assert.equal(oldSettlement.transaction.card_type_at_transaction, 'bronze')
  assert.equal(oldSettlement.transaction.cashback_percent_used, 3)
  assert.equal(oldSettlement.cashback, 3449)
  assert.equal(newSettlement.transaction.card_type_at_transaction, 'bronze')
  assert.equal(newSettlement.transaction.cashback_percent_used, 3)
  assert.equal(newSettlement.cashback, 3449)
  assertLoyaltyError(() => editLoyaltyCardRecord({ role: 'owner', card: original, patch: { cashback_type: 'black' } }), 'cashback_type_locked')
  assertLoyaltyError(() => editLoyaltyCardRecord({ role: 'owner', card: original, patch: { cashbackType: 'black' } }), 'cashback_type_locked')
  assertLoyaltyError(() => editLoyaltyCardRecord({ role: 'owner', card: original, patch: { card_number: '87654321' } }), 'card_number_locked')
  assert.equal(editLoyaltyCardRecord({ role: 'admin', card: original, patch: { customer_name: 'Admin Edit' } }).customer_name, 'Admin Edit')
})

test('manual balance adjustment is owner-only, reasoned, transactional and never negative', () => {
  const base = card({ balance: 50000, total_earned: 10000, total_redeemed: 2000 })
  const credit = adjustLoyaltyBalance({
    role: 'owner',
    card: base,
    amount: 25000,
    reason: 'Service recovery',
    createdBy: 'owner-1',
    now: '2026-05-20T11:00:00.000Z',
  })

  assert.equal(credit.card.balance, 75000)
  assert.equal(credit.card.total_earned, 35000)
  assert.equal(credit.card.total_redeemed, 2000)
  assert.equal(credit.transaction.type, 'manual_adjustment')
  assert.equal(credit.transaction.amount, 25000)
  assert.equal(credit.transaction.balance_before, 50000)
  assert.equal(credit.transaction.balance_after, 75000)
  assert.equal(credit.transaction.reason, 'Service recovery')
  assert.equal(credit.transaction.created_by, 'owner-1')

  const debit = adjustLoyaltyBalance({ role: 'owner', card: credit.card, amount: -10000, reason: 'Correction' })
  assert.equal(debit.card.balance, 65000)
  assert.equal(debit.card.total_redeemed, 12000)
  assert.equal(debit.transaction.amount, -10000, 'a deduction is stored with its minus sign')
  assert.equal(debit.transaction.balance_before, 75000)
  assert.equal(debit.transaction.balance_after, 65000)

  for (const role of ['admin', 'cashier', 'waiter', 'stakeholder']) {
    assertLoyaltyError(() => adjustLoyaltyBalance({ role, card: base, amount: 1000, reason: 'Nope' }), 'forbidden')
  }
  assertLoyaltyError(() => adjustLoyaltyBalance({ role: 'owner', card: base, amount: 1000, reason: '' }), 'reason_required')
  assertLoyaltyError(() => adjustLoyaltyBalance({ role: 'owner', card: base, amount: -60000, reason: 'Too much' }), 'negative_balance')
  assert.equal(base.balance, 50000)
})

test('loyalty permissions allow admin card editing while keeping financial mutations owner-only', () => {
  assert.equal(canViewLoyaltyCards('owner'), true)
  assert.equal(canViewLoyaltyCards('admin'), true)
  assert.equal(canViewLoyaltyCards('viewer'), true)
  assert.equal(canViewLoyaltyCards('guest'), false)
  assert.equal(canCreateLoyaltyCard('owner'), true)
  assert.equal(canCreateLoyaltyCard('admin'), true)
  assert.equal(canEditLoyaltyCard('owner'), true)
  assert.equal(canEditLoyaltyCard('admin'), true)
  assert.equal(canAdjustLoyaltyBalance('owner'), true)
  assert.equal(canRemoveLoyaltyCard('owner'), true)
  assert.equal(canDeleteLoyaltyTransaction('owner'), true)

  for (const role of ['viewer', 'guest']) {
    assert.equal(canCreateLoyaltyCard(role), false)
  }

  for (const role of ['viewer', 'guest']) {
    assert.equal(canEditLoyaltyCard(role), false)
  }

  for (const role of ['admin', 'viewer', 'guest']) {
    assert.equal(canAdjustLoyaltyBalance(role), false)
    assert.equal(canRemoveLoyaltyCard(role), false)
    assert.equal(canDeleteLoyaltyTransaction(role), false)
  }

  assertLoyaltyError(() => removeLoyaltyCardRecord({ role: 'admin', card: card() }), 'forbidden')
  assert.equal(removeLoyaltyCardRecord({ role: 'owner', card: card() }).removedCardId, 'lc-1')
  assert.equal(removeLoyaltyCardRecord({ role: 'owner', card: card() }).card_number, '00123456')
})

test('cashier loyalty payment validates search, card state, order state, bill cap and balance cap', () => {
  const found = card({ card_number: '00001234', balance: 80000 })
  const remainingOrderAmount = 120000

  assert.equal(found.card_number, '00001234')
  assert.equal(validateLoyaltyPayment({ card: found, amount: 50000, remainingOrderAmount, order: unpaidOrder() }).amount, 50000)
  assert.equal(validateLoyaltyPayment({ card: found, amount: 80000, remainingOrderAmount, order: unpaidOrder() }).amount, 80000)
  assert.equal(validateLoyaltyPayment({ card: found, amount: 80000, remainingOrderAmount: 120000, order: unpaidOrder(), }).maxRedeemAmount, 80000)

  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 80001, remainingOrderAmount, order: unpaidOrder() }), 'exceeds_balance')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 80001, remainingOrderAmount: 80000, order: unpaidOrder() }), 'exceeds_balance')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 60000, remainingOrderAmount: 50000, order: unpaidOrder() }), 'exceeds_bill')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 0, remainingOrderAmount, order: unpaidOrder() }), 'invalid_amount')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: -1, remainingOrderAmount, order: unpaidOrder() }), 'invalid_amount')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 100.5, remainingOrderAmount, order: unpaidOrder() }), 'invalid_amount')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: card({ is_active: false }), amount: 1000, remainingOrderAmount, order: unpaidOrder() }), 'inactive_card')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: null, amount: 1000, remainingOrderAmount, order: unpaidOrder() }), 'card_not_found')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 1000, remainingOrderAmount, order: paidOrder() }), 'order_completed')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 1000, remainingOrderAmount, order: unpaidOrder({ status: 'cancelled' }) }), 'order_cancelled')
})

test('successful loyalty redeem updates balance and history; failed redeem leaves money unchanged', () => {
  const base = card({ balance: 90000, total_redeemed: 5000 })
  const result = redeemLoyaltyBalance({
    card: base,
    amount: 30000,
    remainingOrderAmount: 120000,
    order: unpaidOrder(),
    createdBy: 'cashier-1',
    now: '2026-05-20T13:00:00.000Z',
  })

  assert.equal(result.card.balance, 60000)
  assert.equal(result.card.total_redeemed, 35000)
  assert.equal(result.transaction.type, 'redeemed')
  assert.equal(result.transaction.amount, -30000)
  assert.equal(result.transaction.balance_before, 90000)
  assert.equal(result.transaction.balance_after, 60000)
  assert.equal(result.transaction.reason, 'Loyalty used for order payment')
  assert.equal(result.transaction.created_by, 'cashier-1')
  assertLoyaltyError(() => redeemLoyaltyBalance({ card: base, amount: 100000, remainingOrderAmount: 120000, order: unpaidOrder() }), 'exceeds_balance')
  assert.equal(base.balance, 90000)
})

test('redeem plus cashback produces ordered transactions and final wallet balance', () => {
  const base = card({ balance: 70800, total_earned: 0, total_redeemed: 0, cashback_type: 'premium' })
  const redeemed = redeemLoyaltyBalance({
    card: base,
    amount: 50000,
    remainingOrderAmount: 231150,
    order: unpaidOrder({ id: 'order-redeem' }),
    now: '2026-05-22T10:00:00.000Z',
  })
  const cashback = completeOrderCashback({
    card: redeemed.card,
    order: paidOrder({ id: 'order-redeem', service_rate_pct: 0 }),
    items: [item({ price: 281150 })],
    loyaltyUsedAmount: 50000,
    now: '2026-05-22T10:01:00.000Z',
  })

  assert.equal(redeemed.transaction.type, 'redeemed')
  assert.equal(redeemed.transaction.amount, -50000)
  assert.equal(redeemed.transaction.balance_before, 70800)
  assert.equal(redeemed.transaction.balance_after, 20800)
  assert.equal(cashback.cashback, 23115)
  assert.equal(cashback.transaction.type, 'cashback_earned')
  assert.equal(cashback.transaction.amount, 23115)
  assert.equal(cashback.transaction.balance_before, 20800)
  assert.equal(cashback.transaction.balance_after, 43915)
  assert.equal(cashback.transaction.cashback_percent_used, 10)
  assert.equal(cashback.transaction.card_type_at_transaction, 'premium')
  assert.equal(cashback.card.balance, 43915)
})

test('tap-to-fill max loyalty amount uses min(balance, remaining bill) and does not auto-apply payment', () => {
  assert.equal(getMaxLoyaltyRedeemAmount(50000, 180000), 50000)
  assert.equal(getMaxLoyaltyRedeemAmount(120000, 80000), 80000)
  assert.equal(getMaxLoyaltyRedeemAmount(80000, 80000), 80000)
  assert.equal(getMaxLoyaltyRedeemAmount(0, 180000), 0)
  assert.equal(getMaxLoyaltyRedeemAmount(50000, 0), 0)
  assert.equal(getMaxLoyaltyRedeemAmount(-1, -1), 0)
  assert.equal(getMaxLoyaltyRedeemAmount(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 2), Number.MAX_SAFE_INTEGER - 2)

  const inputState = { value: '' }
  const max = getMaxLoyaltyRedeemAmount(50000, 180000)
  inputState.value = String(max)
  assert.equal(inputState.value, '50000')
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 130000 }], 130000).canConfirmPayment, true)
})

test('cashier split payment validation supports loyalty-reduced totals and rejects under/over payment', () => {
  const rows = [
    item({ id: 'meal', menu_item_id: 'meal', price: 100000 }),
    item({ id: 'water', menu_item_id: 'water', price: 12000, item_type: 'counter', is_counter_item: true }),
  ]
  const summary = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15, loyalty_used_amount: 20000 }, rows, 15)

  assert.equal(summary.total, 107000)
  assert.equal(summary.counterItemsSubtotal, 12000)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 107000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'card', amount: 107000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'terminal', amount: 107000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 50000 }, { method: 'card', amount: 57000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'terminal', amount: 50000 }, { method: 'card', amount: 57000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 106999 }], summary.total).canConfirmPayment, false)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 107001 }], summary.total).canConfirmPayment, false)
})

test('cashback calculation uses subtotal plus service minus loyalty, floors integer UZS and excludes tips', () => {
  const rates = [
    ['bronze', 6449],
    ['silver', 10749],
    ['gold', 15049],
    ['premium', 21499],
    ['black', 32249],
    ['platinum', 64499],
    ['special', 85999],
  ]

  for (const [type, expected] of rates) {
    const result = completeOrderCashback({
      card: card({ cashback_type: type, balance: 0, total_earned: 0 }),
      order: paidOrder({ tip_amount: 50000 }),
      items: [
        item({ price: 99999 }),
        item({ id: 'counter', menu_item_id: 'cola', price: 100000, item_type: 'counter', is_counter_item: true }),
      ],
      loyaltyUsedAmount: 0,
    })
    assert.equal(result.cashback, expected)
    assert.equal(result.transaction.cashback_percent_used, getCashbackTypePercent(type))
  }

  assert.equal(completeOrderCashback({
    card: card({ cashback_type: 'black' }),
    order: paidOrder(),
    items: [item({ price: 99999 })],
    loyaltyUsedAmount: 114999,
  }).cashback, 0)
  assert.equal(completeOrderCashback({
    card: card({ cashback_type: 'black' }),
    order: paidOrder(),
    items: [item({ price: 0 })],
    loyaltyUsedAmount: 0,
  }).cashback, 0)
  assertLoyaltyError(() => completeOrderCashback({ card: card(), order: paidOrder(), items: [item()], loyaltyUsedAmount: -1 }), 'invalid_amount')
  assertLoyaltyError(() => completeOrderCashback({ card: card(), order: paidOrder(), items: [item()], loyaltyUsedAmount: 1.5 }), 'invalid_amount')
})

test('premium card completion matches preview and stores transaction snapshots', () => {
  const rows = [item({ id: 'exact-premium', menu_item_id: 'exact-premium', price: 151000 })]
  const premiumCard = card({ cashback_type: undefined, cashbackType: 'premium', balance: 0, total_earned: 0 })
  const preview = getLoyaltyCashbackPreview({
    order: paidOrder({ service_rate_pct: 15 }),
    items: rows,
    loyaltyUsedAmount: 0,
    card: premiumCard,
  })
  const settlement = completeOrderCashback({
    card: premiumCard,
    order: paidOrder({ service_rate_pct: 15 }),
    items: rows,
    loyaltyUsedAmount: 0,
  })

  assert.equal(preview.cashback, 17365)
  assert.equal(settlement.cashback, preview.cashback)
  assert.equal(settlement.transaction.amount, 17365)
  assert.equal(settlement.transaction.cashback_percent_used, 10)
  assert.equal(settlement.transaction.card_type_at_transaction, 'premium')
})

test('order completion creates cashback only after successful paid order and stores order fields', () => {
  assertLoyaltyError(() => completeOrderCashback({ card: card(), order: unpaidOrder(), items: [item()], loyaltyUsedAmount: 0 }), 'order_not_completed')
  assertLoyaltyError(() => completeOrderCashback({ card: card(), order: paidOrder({ status: 'cancelled', payment_status: 'cancelled' }), items: [item()], loyaltyUsedAmount: 0 }), 'order_cancelled')

  const partial = completeOrderCashback({
    card: card({ cashback_type: 'silver', balance: 10000, total_earned: 0 }),
    order: paidOrder(),
    items: [item({ price: 100000 })],
    loyaltyUsedAmount: 25000,
  })

  assert.equal(partial.cashback, 4500)
  assert.equal(partial.card.balance, 14500)
  assert.equal(partial.card.total_earned, 4500)
  assert.equal(partial.order.loyalty_used_amount, 25000)
  assert.equal(partial.order.cashback_earned, 4500)
  assert.equal(partial.order.cashback_percent, 5)
  assert.equal(partial.transaction.type, 'cashback_earned')

  const counterOnly = completeOrderCashback({
    card: card({ cashback_type: 'black' }),
    order: paidOrder(),
    items: [item({ item_type: 'counter', is_counter_item: true })],
    loyaltyUsedAmount: 0,
  })
  assert.equal(counterOnly.cashback, 15000)
  assert.equal(counterOnly.transaction.type, 'cashback_earned')
})

test('transaction history is newest first and preserves amount signs, balances, rates and card type snapshots', () => {
  const transactions = [
    { id: 'old', type: 'cashback_earned', amount: 3000, balance_before: 0, balance_after: 3000, cashback_percent_used: 3, card_type_at_transaction: 'bronze', created_at: '2026-05-19T10:00:00.000Z' },
    { id: 'new', type: 'redeemed', amount: 1000, balance_before: 3000, balance_after: 2000, created_at: '2026-05-20T10:00:00.000Z' },
    { id: 'mid', type: 'manual_adjustment', amount: 500, balance_before: 2000, balance_after: 2500, created_at: '2026-05-19T12:00:00.000Z' },
  ]
  const history = getLoyaltyTransactionHistory(transactions)

  assert.deepEqual(history.map(tx => tx.id), ['new', 'mid', 'old'])
  assert.equal(history[0].amount, 1000)
  assert.equal(history[0].balance_before, 3000)
  assert.equal(history[0].balance_after, 2000)
  assert.equal(history[2].cashback_percent_used, 3)
  assert.equal(history[2].card_type_at_transaction, 'bronze')
})

test('owner can delete a loyalty transaction and recompute remaining wallet balances', () => {
  const transactions = [
    { id: 'tx-1', type: 'cashback_earned', amount: 1000, balance_before: 0, balance_after: 1000, created_at: '2026-05-19T10:00:00.000Z' },
    { id: 'tx-2', type: 'manual_adjustment', amount: 500, balance_before: 1000, balance_after: 1500, created_at: '2026-05-19T12:00:00.000Z' },
    { id: 'tx-3', type: 'redeemed', amount: -300, balance_before: 1500, balance_after: 1200, created_at: '2026-05-20T10:00:00.000Z' },
  ]

  const result = deleteLoyaltyTransactionRecord({
    role: 'owner',
    card: card({ balance: 1200, total_earned: 1500, total_redeemed: 300 }),
    transactions,
    transactionId: 'tx-2',
    now: '2026-05-21T10:00:00.000Z',
  })

  assert.equal(result.deletedTransaction.id, 'tx-2')
  assert.equal(result.card.balance, 700)
  assert.equal(result.card.total_earned, 1000)
  assert.equal(result.card.total_redeemed, 300)
  assert.equal(result.card.updated_at, '2026-05-21T10:00:00.000Z')
  assert.deepEqual(result.transactions.map(tx => tx.id), ['tx-3', 'tx-1'])
  assert.deepEqual(
    result.transactions.find(tx => tx.id === 'tx-3'),
    { ...transactions[2], balance_before: 1000, balance_after: 700 }
  )

  assertLoyaltyError(() => deleteLoyaltyTransactionRecord({
    role: 'admin',
    card: card(),
    transactions,
    transactionId: 'tx-1',
  }), 'forbidden')
  assertLoyaltyError(() => deleteLoyaltyTransactionRecord({
    role: 'owner',
    card: card(),
    transactions,
    transactionId: 'missing',
  }), 'transaction_not_found')
})

test('customer public loyalty page is read-only and protected by public token', () => {
  const view = getPublicLoyaltyCardView({
    card: card(),
    publicToken: 'public-token-1',
    transactions: [{ id: 'tx-1', created_at: '2026-05-20T10:00:00.000Z' }],
    orders: [{ id: 'order-1', cashback_earned: 5000, loyalty_used_amount: 10000 }],
  })

  assert.equal(view.balance, 50000)
  assert.equal(view.orders[0].cashbackEarned, 5000)
  assert.equal(view.orders[0].loyaltyUsed, 10000)
  assert.equal(view.transactions.length, 1)
  assert.equal(view.canEdit, false)
  assert.equal(view.canAdjust, false)
  assert.equal(view.canRemoveCard, false)
  assertLoyaltyError(() => getPublicLoyaltyCardView({ card: card(), publicToken: 'guessed-card-number' }), 'not_found')
})

test('old discount-card regression: loyalty wallet does not apply percent discount or stack with legacy card logic', () => {
  const rows = [item({ price: 100000 })]
  const legacyPercentOnly = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15, loyalty_discount_pct: 50 }, rows, 15)
  const wallet = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15, loyalty_used_amount: 20000, loyalty_discount_pct: 50 }, rows, 15)

  assert.equal(legacyPercentOnly.discountAmount, 0)
  assert.equal(legacyPercentOnly.total, 115000)
  assert.equal(wallet.discountAmount, 20000)
  assert.equal(wallet.loyaltyUsedAmount, 20000)
  assert.equal(wallet.total, 95000)
})

test('counter items update payable total and cashback subtotal without increasing service fee', () => {
  const mealOnly = [item({ price: 100000 })]
  const withCounter = [
    item({ price: 100000 }),
    item({ id: 'cola', menu_item_id: 'cola', price: 12000, item_type: 'counter', is_counter_item: true }),
  ]
  const before = getLoyaltyCashbackPreview({ order: paidOrder(), items: mealOnly, loyaltyUsedAmount: 0, cashbackType: 'silver' })
  const after = getLoyaltyCashbackPreview({ order: paidOrder(), items: withCounter, loyaltyUsedAmount: 0, cashbackType: 'silver' })

  assert.equal(before.summary.serviceFee, 15000)
  assert.equal(after.summary.serviceFee, 15000)
  assert.equal(before.cashback, 5750)
  assert.equal(after.cashback, 6350)
  assert.equal(after.summary.total - before.summary.total, 12000)
  assert.equal(getMaxLoyaltyRedeemAmount(200000, after.summary.grossAmount), after.summary.grossAmount)
})

test('fresh card validation handles balance or active-state changes before redeem to prevent stale lookup spend', () => {
  const lookedUp = card({ balance: 100000, is_active: true })
  const freshLowerBalance = { ...lookedUp, balance: 20000 }
  const freshInactive = { ...lookedUp, is_active: false }

  assertLoyaltyError(() => redeemLoyaltyBalance({
    card: freshLowerBalance,
    amount: 50000,
    remainingOrderAmount: 80000,
    order: unpaidOrder(),
  }), 'exceeds_balance')
  assertLoyaltyError(() => redeemLoyaltyBalance({
    card: freshInactive,
    amount: 10000,
    remainingOrderAmount: 80000,
    order: unpaidOrder(),
  }), 'inactive_card')
  assert.equal(lookedUp.balance, 100000)
})
