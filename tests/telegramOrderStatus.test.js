import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCompletedOrderGroupMessage,
  buildCustomerStatusMessage,
  getCompletedOrdersChatIds,
  getRussianOrderItemDisplayName,
  mergeCompletedOrders,
  shouldNotifyCompletedOrderGroup,
} from '../api/telegram/_lib/orderStatusMessages.js'
import { hasCompleteOrderItemCostCoverage } from '../api/telegram/order-status.js'

test('completed order profit requires immutable cost snapshots for every sold item', () => {
  assert.equal(hasCompleteOrderItemCostCoverage([
    { menu_item_id: 'snapshotted', cost_price: 0 },
    { menu_item_id: 'legacy-covered', cost_price: null },
  ]), false)
  assert.equal(hasCompleteOrderItemCostCoverage([
    { menu_item_id: 'snapshotted-zero', cost_price: 0 },
    { menu_item_id: 'snapshotted-positive', cost_price: 20_000 },
  ]), true)
})

test('Telegram completed order names include the selected Qurutoba portion', () => {
  const menuItem = {
    name_ru: 'Курутоба',
    option_groups: [{
      id: 'variants',
      options: [
        { id: 'one', label_ru: 'Курутоб (1 человек)' },
        { id: 'two-three', label_ru: 'Курутоб (2-3 человека)' },
      ],
    }],
  }
  const item = {
    name: 'Qurutoba',
    selected_options: { variants: 'two-three' },
  }

  assert.equal(getRussianOrderItemDisplayName(item, menuItem), 'Курутоб (2-3 человека)')

  const message = buildCompletedOrderGroupMessage({
    table_name: 'Stol 5',
    payment_status: 'paid',
    subtotal: 145000,
    total: 145000,
    items: [{ ...item, telegram_display_name: getRussianOrderItemDisplayName(item, menuItem), quantity: 1, unit_price: 145000 }],
  })
  assert.match(message, /Курутоб \(2-3 человека\)/)
  assert.doesNotMatch(message, /Курутоба \(1 человек\)/)
})

test('Telegram item names recover legacy variant labels from notes', () => {
  assert.equal(
    getRussianOrderItemDisplayName(
      { name: 'Курутоба', notes: 'Варианты: Курутоб (2-3 человека)' },
      { name_ru: 'Курутоба' },
    ),
    'Курутоб (2-3 человека)'
  )
})

test('completed table rounds merge into one Telegram order summary', () => {
  const order = mergeCompletedOrders([
    {
      id: 'drinks', table_name: 'Table 3', waiter_name: 'Ali', price_mode: 'tourist',
      subtotal: 20000, service_fee: 3000, service_rate_pct: 15, total: 23000, payment_method: 'cash',
      items: [{ name: 'Tea', quantity: 2, unit_price: 10000, status: 'served' }],
      payments: [{ method: 'cash', amount: 23000 }], paid_at: '2026-07-12T13:00:00Z',
    },
    {
      id: 'meal', table_name: 'Table 3', waiter_name: 'Bek', price_mode: 'tourist',
      subtotal: 70000, service_fee: 10500, service_rate_pct: 15, total: 80500, payment_method: 'cash',
      items: [{ name: 'Kebab', quantity: 2, unit_price: 35000, status: 'served' }],
      payments: [{ method: 'cash', amount: 80500 }], paid_at: '2026-07-12T13:00:00Z',
    },
  ])

  assert.equal(order.subtotal, 90000)
  assert.equal(order.service_fee, 13500)
  assert.equal(order.total, 103500)
  assert.equal(order.items.length, 2)
  assert.equal(order.waiter_name, 'Ali, Bek')
  assert.deepEqual(order.payments, [{ method: 'cash', amount: 103500 }])

  const message = buildCompletedOrderGroupMessage({
    ...order,
    orderNetProfit: 72500,
    orderProfitMarginPct: 70,
    dailyRevenueTotal: 500000,
    dailyLoyaltyIncomeTotal: 25000,
    dailyNetProfitTotal: 310000,
    dailyProfitMarginPct: 62,
  })
  assert.match(message, /Tea/)
  assert.match(message, /Официант: Ali, Bek/)
  assert.match(message, /Kebab/)
  assert.match(message, /Сумма заказа: 90 000 UZS/)
  assert.match(message, /Сервис 15%: 13 500 UZS/)
  assert.match(message, /Оплата: Наличные 103 500 UZS\n\nЧистая прибыль: 72 500 UZS · 70%/)
  assert.match(
    message,
    /Чистая прибыль: 72 500 UZS · 70%\n\n<b>Доход: 500 000 UZS<\/b>\nДоход по лояльности: 25 000 UZS\nЧистая прибыль: 310 000 UZS · 62%/
  )
  assert.equal(message.endsWith('Чистая прибыль: 310 000 UZS · 62%'), true)
  assert.doesNotMatch(message, /· Заказ|· Сегодня|Маржа прибыли/)
  assert.equal((message.match(/🍽️ Стол: Table 3/g) || []).length, 1)
})

test('completed order group chat ids parse comma-separated env values', () => {
  assert.deepEqual(
    getCompletedOrdersChatIds({
      TELEGRAM_COMPLETED_ORDERS_CHAT_ID: ' -100123 , -100456, -100123 ',
    }),
    ['-100123', '-100456']
  )
})

test('completed order group notification requires paid order and configured chat id', () => {
  const env = { TELEGRAM_COMPLETED_ORDERS_CHAT_ID: '-100123' }

  assert.equal(
    shouldNotifyCompletedOrderGroup('completed', { payment_status: 'paid', status: 'paid' }, env),
    true
  )
  assert.equal(
    shouldNotifyCompletedOrderGroup('completed', { payment_status: 'unpaid', status: 'delivered' }, env),
    false
  )
  assert.equal(
    shouldNotifyCompletedOrderGroup('served', { payment_status: 'paid', status: 'paid' }, env),
    false
  )
  assert.equal(
    shouldNotifyCompletedOrderGroup('completed', { payment_status: 'paid', status: 'paid' }, {}),
    false
  )
})

test('completed order group message escapes dynamic Telegram HTML fields', () => {
  const message = buildCompletedOrderGroupMessage({
    id: 'order<1>',
    order_number: 'A&B<2>',
    table_name: 'Table <1>',
    waiter_name: 'Jasurbek & Team',
    order_type: 'take_away',
    price_mode: 'tourist',
    subtotal: 142000,
    service_fee: 21300,
    service_rate_pct: 15,
    total: 163300,
    orderNetProfit: 101300,
    orderProfitMarginPct: 62.03,
    dailyRevenueTotal: 525300,
    dailyNetProfitTotal: 337800,
    dailyProfitMarginPct: 64.3,
    payment_method: 'terminal',
    completed_by_name: 'Ali & Bob',
    paid_at: '2026-07-08T19:09:00.000Z',
    items: [
      { name: 'Beef <Shashlik>', menu_name_ru: 'Шашлык <говяжий>', quantity: 1, price: 30000, status: 'served' },
      { name: 'Cancelled item', quantity: 1, price: 99999, status: 'cancelled' },
    ],
  })

  assert.doesNotMatch(message, /Заказ закрыт/)
  assert.doesNotMatch(message, /Заказ: A&amp;B&lt;2&gt;/)
  assert.equal(message.startsWith('🥡 Тип: Заказ с собой'), true)
  assert.doesNotMatch(message, /Стол: Table &lt;1&gt;/)
  assert.match(message, /Официант: Jasurbek &amp; Team/)
  assert.doesNotMatch(message, /Закрыл:/)
  assert.match(message, /Дата: 9 июля \| 00:09/)
  assert.equal(message.split('\n')[0], '🥡 Тип: Заказ с собой 🧳 ⚡')
  assert.doesNotMatch(message, /Тип меню:/)
  assert.doesNotMatch(message, /Итого: 163 300 UZS/)
  assert.equal((message.match(/🥡 Тип: Заказ с собой/g) || []).length, 1)
  assert.match(message, /Шашлык &lt;говяжий&gt;/)
  assert.doesNotMatch(message, /Beef &lt;Shashlik&gt;/)
  assert.doesNotMatch(message, /Cancelled item/)
  assert.match(message, /Сумма заказа: 142 000 UZS/)
  assert.match(message, /Сервис 15%: 21 300 UZS/)
  assert.match(message, /Оплата: Терминал/)
  assert.doesNotMatch(message, /К оплате: 163 300 UZS/)
  assert.match(message, /Чистая прибыль: 101 300 UZS · 62%/)
  assert.match(message, /Чистая прибыль: 337 800 UZS · 64,3%/)
  assert.match(message, /<b>Доход: 525 300 UZS<\/b>\nЧистая прибыль: 337 800 UZS · 64,3%/)
  assert.equal(message.endsWith('Чистая прибыль: 337 800 UZS · 64,3%'), true)
  assert.doesNotMatch(message, /· Заказ|· Сегодня|Маржа прибыли/)
})

test('completed group message omits profit margin when protected costs are unavailable', () => {
  const message = buildCompletedOrderGroupMessage({
    table_name: 'Table 1',
    payment_status: 'paid',
    subtotal: 50_000,
    total: 50_000,
    orderNetProfit: null,
    orderProfitMarginPct: null,
    items: [{ name: 'Kebab', quantity: 1, unit_price: 50_000, status: 'served' }],
  })

  assert.doesNotMatch(message, /Чистая прибыль:/)
  assert.doesNotMatch(message, /Маржа прибыли/)
})

test('completed dine-in group message starts with a dine-in icon and table', () => {
  const message = buildCompletedOrderGroupMessage({
    table_name: 'Terassa stol 1',
    waiter_name: 'Jasurbek',
    completed_by_name: 'Ali',
    order_type: 'dine_in',
    price_mode: 'regular',
    total: 163300,
    payment_status: 'paid',
    paid_at: '2026-07-08T19:09:00.000Z',
    items: [],
  })

  assert.equal(message.startsWith('🍽️ Стол: Terassa stol 1'), true)
  assert.match(message, /Официант: Jasurbek/)
  assert.doesNotMatch(message, /Официант: Ali/)
  assert.doesNotMatch(message, /Тип: В зале/)
  assert.equal(message.split('\n')[0], '🍽️ Стол: Terassa stol 1 🍴')
  assert.doesNotMatch(message, /Тип меню:/)
})

test('completed delivery group message starts with a delivery icon and type', () => {
  const message = buildCompletedOrderGroupMessage({
    order_type: 'delivery',
    payment_status: 'paid',
    total: 69000,
    items: [],
  })

  assert.equal(message.startsWith('🚚 Тип: Доставка'), true)
})

test('completed group message shows split payment methods with amounts', () => {
  const message = buildCompletedOrderGroupMessage({
    table_name: 'Terassa stol 1',
    waiter_name: 'Jasurbek',
    completed_by_name: 'Ali',
    order_type: 'dine_in',
    subtotal: 100000,
    service_fee: 0,
    total: 100000,
    payment_status: 'paid',
    paid_at: '2026-07-08T19:09:00.000Z',
    payments: [
      { method: 'cash', amount: 60000 },
      { method: 'card', amount: 40000 },
    ],
  })

  assert.match(message, /Оплата: Наличные 60 000 UZS, Карта 40 000 UZS/)
})

test('completed headers show menu icons and turbo badges including service capped at six', () => {
  for (const [total, count] of [[99_999, 0], [100_000, 1], [199_999, 1], [200_000, 2], [386_400, 3], [400_000, 4], [599_999, 5], [600_000, 6], [773_950, 6]]) {
    for (const [priceMode, icon] of [['regular', '🍴'], ['tourist', '🧳']]) {
      const subtotal = Math.floor(total / 1.15)
      const message = buildCompletedOrderGroupMessage({
        table_name: 'Stol 7',
        order_type: 'dine_in',
        price_mode: priceMode,
        subtotal,
        service_fee: total - subtotal,
        total,
        payment_status: 'paid',
      })

      assert.equal(message.split('\n')[0], `🍽️ Стол: Stol 7 ${icon}${count ? ` ${'⚡'.repeat(count)}` : ''}`)
      assert.doesNotMatch(message, /Тип меню:|🏠/)
      assert.doesNotMatch(message.split('\n').slice(1).join('\n'), /⚡/)
    }
  }
})

test('completed group message shows loyalty usage and the card owner snapshot', () => {
  const message = buildCompletedOrderGroupMessage({
    table_name: 'Take Away',
    waiter_name: 'Zar kebab',
    completed_by_name: 'Диля Камолова',
    order_type: 'take_away',
    subtotal: 35000,
    service_fee: 0,
    total: 20000,
    loyalty_used_amount: 15000,
    payment_status: 'paid',
    paid_at: '2026-07-14T17:17:00.000Z',
    payments: [{ method: 'cash', amount: 20000 }],
    loyalty_transactions: [{
      type: 'redeemed',
      customer_name_at_transaction: 'Shohsanam & Fransiya',
      card_number_at_transaction: '77761225',
    }],
  })

  assert.match(message, /Сумма заказа: 35 000 UZS/)
  assert.match(message, /Лояльность: - 15 000 UZS/)
  assert.match(message, /Владелец карты: Shohsanam &amp; Fransiya/)
  assert.match(message, /Оплата: Наличные 20 000 UZS/)
})

test('completed group message shows saved cashback only when earned', () => {
  const order = {
    order_type: 'delivery', subtotal: 120000, total: 120000,
    payments: [{ method: 'cash', amount: 120000 }],
    cashback_earned: 36000,
    loyalty_transactions: [{ customer_name_at_transaction: 'Ali & <Bob>' }],
  }
  const message = buildCompletedOrderGroupMessage(order)
  assert.match(message, /Оплата: Наличные 120 000 UZS\n💳 Ali &amp; &lt;Bob&gt; · кешбэк \+ 36 000 UZS/)
  assert.match(
    buildCompletedOrderGroupMessage({ ...order, loyalty_transactions: [] }),
    /💳 Карта лояльности · кешбэк \+ 36 000 UZS/,
  )
  for (const cashback_earned of [0, null, undefined]) {
    assert.doesNotMatch(buildCompletedOrderGroupMessage({ ...order, cashback_earned }), /кешбэк/)
  }
})

test('merged completed rounds aggregate loyalty without changing payment amounts', () => {
  const order = mergeCompletedOrders([
    {
      id: 'first',
      subtotal: 20000,
      total: 15000,
      loyalty_used_amount: 5000,
      cashback_earned: 600,
      payments: [{ method: 'cash', amount: 15000 }],
      loyalty_transactions: [{ customer_name_at_transaction: 'Card Owner' }],
    },
    {
      id: 'second',
      subtotal: 30000,
      total: 20000,
      loyalty_redeem_amount: 10000,
      cashback_earned: 900,
      payments: [{ method: 'cash', amount: 20000 }],
      loyalty_transactions: [{ customer_name_at_transaction: 'Card Owner' }],
    },
  ])

  assert.equal(order.loyalty_used_amount, 15000)
  assert.equal(order.cashback_earned, 1500)
  assert.match(buildCompletedOrderGroupMessage(order), /💳 Card Owner · кешбэк \+ 1 500 UZS/)
  assert.equal(order.loyalty_customer_name, 'Card Owner')
  assert.deepEqual(order.payments, [{ method: 'cash', amount: 35000 }])
})

test('customer status message escapes order labels', () => {
  const message = buildCustomerStatusMessage('completed', { order_number: 'TG<&1>' })
  assert.match(message, /Order completed\nOrder TG&lt;&amp;1&gt;/)
})
