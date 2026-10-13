import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatReadableDateTime,
  getDashboardProductContribution,
  getDashboardOrderTypePerformance,
  getDashboardPaymentMethods,
  getDashboardPeriodCafeIncome,
  getDashboardPeriodOrders,
  getRollingDashboardMonthRange,
  getDashboardSalesByCategory,
} from '../src/lib/dashboardAnalytics.js'
import {
  getCafeIncomeForRange,
  getInclusiveCalendarDayCount,
  getMonthToDateCafeIncome,
  getOrderActivityDate,
  getSoldOrderItems,
  groupOrdersBySession,
  toRestaurantDateStr,
} from '../src/lib/analytics.js'

const menuItemMap = {
  kebab: { id: 'kebab', category_id: 'kebab', image_url: 'kebab.jpg' },
  cola: { id: 'cola', category_id: 'drinks', image_url: 'cola.jpg' },
  lagman: { id: 'lagman', category_id: 'first', image_url: 'lagman.jpg' },
  salad: { id: 'salad', category_id: 'salads', image_url: 'salad.jpg' },
}

const categoryMap = {
  kebab: { id: 'kebab', name_en: 'Kebab' },
  drinks: { id: 'drinks', name_en: 'Drinks' },
  first: { id: 'first', name_en: 'First Meal' },
  salads: { id: 'salads', name_en: 'Salads' },
}

function order({ id, paidAt, method = 'cash', items, total, waiter = 'Jasurbek', orderType, tableName, ...overrides }) {
  return {
    id,
    payment_status: 'paid',
    paid_at: paidAt,
    payment_method: method,
    waiter_name: waiter,
    order_type: orderType,
    table_name: tableName,
    total,
    service_rate_pct: 0,
    items,
    ...overrides,
  }
}

function item(menu_item_id, name, quantity, price) {
  return { menu_item_id, name, quantity, price }
}

const now = new Date('2026-05-19T23:29:00')

const orders = [
  order({
    id: 'today',
    paidAt: '2026-05-19T10:00:00',
    method: 'cash',
    items: [item('kebab', 'Kebab', 2, 25000), item('cola', 'Cola', 1, 12000)],
    total: 62000,
  }),
  order({
    id: 'week',
    paidAt: '2026-05-15T10:00:00',
    method: 'card',
    waiter: 'Dildora',
    items: [item('lagman', 'Lagman', 3, 32000)],
    total: 96000,
  }),
  order({
    id: 'month',
    paidAt: '2026-05-02T10:00:00',
    method: 'qr',
    waiter: 'Dildora',
    items: [item('salad', 'Salad', 4, 15000)],
    total: 60000,
  }),
  order({
    id: 'year',
    paidAt: '2026-01-12T10:00:00',
    method: 'terminal',
    waiter: 'Aziz',
    items: [item('cola', 'Cola', 5, 12000)],
    total: 60000,
  }),
  order({
    id: 'previous-year',
    paidAt: '2025-12-31T10:00:00',
    method: 'cash',
    waiter: 'Aziz',
    items: [item('kebab', 'Old Kebab', 9, 25000)],
    total: 225000,
  }),
]

test('rolling month uses a next-day boundary from 4 July to 5 August', () => {
  assert.deepEqual(getRollingDashboardMonthRange('2026-08-04'), {
    dateFrom: '2026-07-04',
    dateTo: '2026-08-04',
    dateToExclusive: '2026-08-05',
    dayCount: 32,
  })

  const rangeOrders = [
    order({ id: 'before', paidAt: '2026-07-03T12:00:00', total: 10, items: [] }),
    order({ id: 'start', paidAt: '2026-07-04T12:00:00', total: 20, items: [] }),
    order({ id: 'today', paidAt: '2026-08-04T12:00:00', total: 30, items: [] }),
    order({ id: 'exclusive-end', paidAt: '2026-08-05T12:00:00', total: 40, items: [] }),
  ]

  assert.deepEqual(
    getDashboardPeriodOrders(rangeOrders, 'rollingMonth', new Date('2026-08-04T12:00:00+05:00')).map(row => row.id),
    ['start', 'today']
  )
})

function analyticsFor(period) {
  const periodOrders = getDashboardPeriodOrders(orders, period, now)
  return {
    ids: periodOrders.map(row => row.id),
    revenue: periodOrders.reduce((sum, row) => sum + row.total, 0),
    payments: getDashboardPaymentMethods(periodOrders),
    categories: getDashboardSalesByCategory(periodOrders, menuItemMap, categoryMap, 'en'),
  }
}

test('dashboard selected period filters revenue payments and categories together for today', () => {
  const data = analyticsFor('today')

  assert.deepEqual(data.ids, ['today'])
  assert.equal(data.revenue, 62000)
  assert.deepEqual(data.payments.map(row => row.key), ['cash'])
  assert.deepEqual(data.categories.map(row => row.name), ['Kebab', 'Drinks'])
})

test('dashboard today period uses restaurant timezone instead of device timezone', () => {
  const edgeOrders = [
    order({
      id: 'restaurant-today',
      paidAt: '2026-05-19T19:30:00.000Z',
      items: [item('kebab', 'Kebab', 1, 25000)],
      total: 25000,
    }),
    order({
      id: 'restaurant-yesterday',
      paidAt: '2026-05-18T18:30:00.000Z',
      items: [item('cola', 'Cola', 1, 12000)],
      total: 12000,
    }),
  ]

  assert.equal(toRestaurantDateStr('2026-05-19T19:30:00.000Z'), '2026-05-20')
  assert.deepEqual(
    getDashboardPeriodOrders(edgeOrders, 'today', new Date('2026-05-19T20:00:00.000Z')).map(row => row.id),
    ['restaurant-today']
  )
})

test('dashboard period change from today to 7 days removes stale today-only category and dish data', () => {
  const today = analyticsFor('today')
  const week = analyticsFor('7days')

  assert.deepEqual(today.categories.map(row => row.name), ['Kebab', 'Drinks'])
  assert.deepEqual(week.ids, ['today', 'week'])
  assert.deepEqual(week.categories.map(row => row.name), ['First Meal', 'Kebab', 'Drinks'])
})

test('dashboard analytics keep category context for soft-deleted menu items', () => {
  const deletedMenuMap = {
    ...menuItemMap,
    kebab: { ...menuItemMap.kebab, deleted_at: '2026-07-09T10:00:00.000Z' },
  }
  const rows = getDashboardSalesByCategory(
    getDashboardPeriodOrders(orders, 'today', now),
    deletedMenuMap,
    categoryMap,
    'en'
  )

  assert.deepEqual(rows.map(row => row.name), ['Kebab', 'Drinks'])
  assert.equal(rows.find(row => row.name === 'Kebab').revenue, 50000)
})

test('dashboard analytics keep historical category context after category archival', () => {
  const archivedCategoryMap = {
    ...categoryMap,
    kebab: {
      ...categoryMap.kebab,
      hidden: true,
      waiter_hidden: true,
      deleted_at: '2026-08-01T10:00:00.000Z',
    },
  }
  const rows = getDashboardSalesByCategory(
    getDashboardPeriodOrders(orders, 'today', now),
    menuItemMap,
    archivedCategoryMap,
    'en'
  )

  assert.deepEqual(rows.map(row => row.name), ['Kebab', 'Drinks'])
  assert.equal(rows.find(row => row.name === 'Kebab').revenue, 50000)
})

test('dashboard category sales prefer sold-item snapshots after a product moves category', () => {
  const movedMenuMap = {
    ...menuItemMap,
    kebab: { ...menuItemMap.kebab, category_id: 'drinks' },
  }
  const snapshotOrder = order({
    id: 'historical-category',
    paidAt: '2026-05-19T10:00:00',
    total: 50_000,
    items: [{
      ...item('kebab', 'Kebab', 2, 25_000),
      category_id_snapshot: 'kebab',
    }],
  })
  const uncategorizedOrder = order({
    id: 'historical-uncategorized',
    paidAt: '2026-05-19T11:00:00',
    total: 25_000,
    items: [{
      ...item('kebab', 'Kebab', 1, 25_000),
      category_id_snapshot: null,
    }],
  })

  assert.deepEqual(
    getDashboardSalesByCategory([snapshotOrder], movedMenuMap, categoryMap, 'en')
      .map(row => row.name),
    ['Kebab']
  )
  assert.deepEqual(
    getDashboardSalesByCategory([uncategorizedOrder], movedMenuMap, categoryMap, 'en')
      .map(row => row.name),
    ['Other']
  )
})

test('dashboard period change from 7 days to month updates all widgets to month data', () => {
  const month = analyticsFor('month')

  assert.deepEqual(month.ids, ['today', 'week', 'month'])
  assert.equal(month.revenue, 218000)
  assert.deepEqual(month.payments.map(row => row.key), ['card', 'cash', 'terminal'])
  assert.deepEqual(month.categories.map(row => row.name), ['First Meal', 'Salads', 'Kebab', 'Drinks'])
})

test('dashboard daily cafe income follows the selected period', () => {
  const today = getDashboardPeriodCafeIncome(orders, 'today', now)
  const week = getDashboardPeriodCafeIncome(orders, '7days', now)
  const month = getDashboardPeriodCafeIncome(orders, 'month', now)
  const year = getDashboardPeriodCafeIncome(orders, 'year', now)

  assert.deepEqual([today.total, today.dayCount, today.averageDaily], [62_000, 1, 62_000])
  assert.deepEqual([week.total, week.dayCount, week.averageDaily], [158_000, 7, 22_571])
  assert.deepEqual([month.total, month.dayCount, month.averageDaily], [218_000, 19, 11_474])
  assert.deepEqual([year.total, year.dayCount, year.averageDaily], [278_000, 139, 2_000])
})

test('month-to-date cafe income averages paid revenue across all elapsed calendar days', () => {
  const result = getMonthToDateCafeIncome([
    ...orders,
    order({
      id: 'next-month',
      paidAt: '2026-06-01T10:00:00',
      items: [],
      total: 500000,
    }),
    {
      id: 'unpaid-month',
      status: 'needs_bill',
      payment_status: 'unpaid',
      created_at: '2026-05-19T10:00:00',
      total: 90000,
      items: [],
    },
  ], new Date('2026-05-19T12:00:00+05:00'))

  assert.equal(result.from, '2026-05-01')
  assert.equal(result.to, '2026-05-19')
  assert.equal(result.dayCount, 19)
  assert.equal(result.salesDayCount, 3)
  assert.equal(result.total, 218000)
  assert.equal(result.averageDaily, 11474)
})

test('month-to-date cafe income keeps elapsed calendar days when there are no sales', () => {
  const result = getMonthToDateCafeIncome([
    {
      id: 'unpaid-month',
      status: 'needs_bill',
      payment_status: 'unpaid',
      created_at: '2026-05-19T10:00:00',
      total: 90000,
      items: [],
    },
  ], new Date('2026-05-19T12:00:00+05:00'))

  assert.equal(result.dayCount, 19)
  assert.equal(result.salesDayCount, 0)
  assert.equal(result.total, 0)
  assert.equal(result.averageDaily, 0)
})

test('cafe income average follows the selected accounting date range', () => {
  const weekRange = getCafeIncomeForRange(orders, '2026-05-15', '2026-05-19')
  const earlyMonthRange = getCafeIncomeForRange(orders, '2026-05-01', '2026-05-14')

  assert.equal(weekRange.total, 158000)
  assert.equal(weekRange.dayCount, 5)
  assert.equal(weekRange.salesDayCount, 2)
  assert.equal(weekRange.averageDaily, 31600)
  assert.equal(earlyMonthRange.total, 60000)
  assert.equal(earlyMonthRange.dayCount, 14)
  assert.equal(earlyMonthRange.salesDayCount, 1)
  assert.equal(earlyMonthRange.averageDaily, 4286)
})

test('cafe income keeps loyalty value separate from spendable payments', () => {
  const result = getCafeIncomeForRange([
    order({
      id: 'loyalty-order',
      paidAt: '2026-05-19T10:00:00',
      items: [item('kebab', 'Kebab', 1, 100000)],
      total: 75000,
      loyalty_used_amount: 25000,
    }),
  ], '2026-05-19', '2026-05-19')

  assert.equal(result.total, 75000)
  assert.equal(result.loyaltyTotal, 25000)
  assert.equal(result.salesValueTotal, 100000)
  assert.equal(result.averageDaily, 75000)
})

test('cafe income average caps future ranges at the current restaurant day', () => {
  const edgeOrders = [
    order({
      id: 'restaurant-may-19',
      paidAt: '2026-05-18T19:30:00.000Z',
      items: [item('kebab', 'Kebab', 1, 25000)],
      total: 25000,
    }),
    order({
      id: 'restaurant-may-20',
      paidAt: '2026-05-19T19:30:00.000Z',
      items: [item('cola', 'Cola', 1, 12000)],
      total: 12000,
    }),
  ]
  const beforeRestaurantMidnight = new Date('2026-05-19T18:59:00.000Z')

  const result = getCafeIncomeForRange(
    edgeOrders,
    '2026-05-19',
    '2026-05-22',
    beforeRestaurantMidnight
  )
  const futureOnly = getCafeIncomeForRange(
    edgeOrders,
    '2026-05-20',
    '2026-05-22',
    beforeRestaurantMidnight
  )

  assert.equal(result.effectiveTo, '2026-05-19')
  assert.equal(result.dayCount, 1)
  assert.equal(result.total, 25000)
  assert.equal(result.averageDaily, 25000)
  assert.equal(futureOnly.dayCount, 0)
  assert.equal(futureOnly.total, 0)
  assert.equal(futureOnly.averageDaily, 0)
})

test('calendar-day averaging counts inclusive leap-year ranges safely', () => {
  assert.equal(getInclusiveCalendarDayCount('2024-02-28', '2024-03-01'), 3)
  assert.equal(getInclusiveCalendarDayCount('2025-02-28', '2025-03-01'), 2)
  assert.equal(getInclusiveCalendarDayCount('2026-05-20', '2026-05-19'), 0)
  assert.equal(getInclusiveCalendarDayCount('2026-02-30', '2026-03-01'), 0)
})

test('cancelled items never contribute to sold-item dashboard or report metrics', () => {
  const mixedOrder = order({
    id: 'mixed-items',
    paidAt: '2026-05-19T10:00:00.000Z',
    orderType: 'dine_in',
    waiter: 'Jasurbek',
    items: [
      item('kebab', 'Kebab', 2, 25000),
      { ...item('cola', 'Cola', 9, 12000), status: 'cancelled' },
    ],
    total: 50000,
  })

  const soldItems = getSoldOrderItems(mixedOrder)
  const categories = getDashboardSalesByCategory([mixedOrder], menuItemMap, categoryMap, 'en')
  const orderType = getDashboardOrderTypePerformance([mixedOrder], 'en').find(row => row.key === 'dine_in')

  assert.deepEqual(soldItems.map(row => row.menu_item_id), ['kebab'])
  assert.deepEqual(categories.map(row => [row.name, row.qty, row.revenue]), [['Kebab', 2, 50000]])
  assert.equal(orderType.items, 2)
  assert.equal(orderType.revenue, 50000)
})

test('dashboard period change from month to year updates all widgets to year data', () => {
  const year = analyticsFor('year')

  assert.deepEqual(year.ids, ['today', 'week', 'month', 'year'])
  assert.equal(year.revenue, 278000)
  assert.deepEqual(year.payments.map(row => row.key), ['terminal', 'card', 'cash'])
  assert.deepEqual(year.categories.map(row => row.name), ['First Meal', 'Drinks', 'Salads', 'Kebab'])
})

test('dashboard empty selected period returns zero and empty widget states', () => {
  const empty = getDashboardPeriodOrders(orders, 'today', new Date('2026-05-18T12:00:00'))
  const payments = getDashboardPaymentMethods(empty)
  const categories = getDashboardSalesByCategory(empty, menuItemMap, categoryMap, 'en')
  const orderTypes = getDashboardOrderTypePerformance(empty, 'en')

  assert.equal(empty.reduce((sum, row) => sum + row.total, 0), 0)
  assert.deepEqual(payments, [])
  assert.deepEqual(categories, [])
  assert.deepEqual(orderTypes.map(row => row.key), ['dine_in', 'take_away', 'delivery', 'game_club'])
  assert.deepEqual(orderTypes.map(row => row.revenue), [0, 0, 0, 0])
})

test('dashboard order type performance ranks dine in take away and delivery revenue', () => {
  const rows = getDashboardOrderTypePerformance([
    order({
      id: 'dine-in',
      paidAt: '2026-05-19T10:00:00',
      orderType: 'dine_in',
      items: [item('kebab', 'Kebab', 2, 50000)],
      total: 100000,
    }),
    order({
      id: 'take-away',
      paidAt: '2026-05-19T11:00:00',
      orderType: 'take_away',
      items: [item('cola', 'Cola', 3, 20000)],
      total: 60000,
    }),
    order({
      id: 'delivery',
      paidAt: '2026-05-19T12:00:00',
      orderType: 'delivery',
      items: [item('lagman', 'Lagman', 4, 40000)],
      total: 160000,
    }),
    order({
      id: 'legacy-delivery',
      paidAt: '2026-05-19T13:00:00',
      tableName: 'Delivery #14',
      items: [item('salad', 'Salad', 2, 20000)],
      total: 40000,
    }),
  ], 'en')

  assert.deepEqual(rows.map(row => row.key), ['delivery', 'dine_in', 'take_away', 'game_club'])
  assert.deepEqual(rows.map(row => row.label), ['Delivery', 'Dine In', 'Take Away', 'Game Club'])
  assert.equal(rows[0].revenue, 200000)
  assert.equal(rows[0].orders, 2)
  assert.equal(rows[0].items, 6)
  assert.equal(rows[0].pct, 56)
  assert.equal(rows[1].avgOrder, 100000)
  assert.equal(rows[2].pct, 17)
})

test('latest selected period wins when a slow analytics response resolves out of order', async () => {
  let selectedPeriod = 'today'
  let rendered = null

  function request(period, delay) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ period, data: analyticsFor(period) })
      }, delay)
    }).then(result => {
      if (result.period === selectedPeriod) {
        rendered = result
      }
    })
  }

  const slowToday = request('today', 20)
  selectedPeriod = '7days'
  const fastWeek = request('7days', 1)

  await Promise.all([slowToday, fastWeek])

  assert.equal(rendered.period, '7days')
  assert.deepEqual(rendered.data.ids, ['today', 'week'])
})

test('dashboard readable date format uses a clear date time separator', () => {
  assert.equal(
    formatReadableDateTime('2026-05-19T23:29:00'),
    '19.05.2026 23:29'
  )
})

test('recent order activity uses bill request time instead of stale open time', () => {
  const order = {
    id: 'o-needs-bill',
    table_id: 't6',
    status: 'needs_bill',
    payment_status: 'unpaid',
    created_at: '2026-06-22T07:00:00.000Z',
    updated_at: '2026-06-29T07:59:00.000Z',
  }
  const tables = [{ id: 't6', status: 'needs_bill', updated_at: '2026-06-29T07:58:00.000Z' }]

  assert.equal(getOrderActivityDate(order, tables), '2026-06-29T07:59:00.000Z')
})

test('recent order activity falls back to table bill time when legacy order update is missing', () => {
  const order = {
    id: 'o-legacy-needs-bill',
    table_id: 't6',
    status: 'needs_bill',
    payment_status: 'unpaid',
    created_at: '2026-06-22T07:00:00.000Z',
  }
  const tables = [{ id: 't6', status: 'needs_bill', updated_at: '2026-06-29T07:58:00.000Z' }]

  assert.equal(getOrderActivityDate(order, tables), '2026-06-29T07:58:00.000Z')
})

test('merged recent order sessions keep the newest status update time', () => {
  const [session] = groupOrdersBySession([
    {
      id: 'o-old-round',
      table_id: 't6',
      status: 'needs_bill',
      payment_status: 'unpaid',
      created_at: '2026-06-22T07:00:00.000Z',
      updated_at: '2026-06-29T07:50:00.000Z',
      total: 10000,
      items: [],
    },
    {
      id: 'o-new-round',
      table_id: 't6',
      status: 'needs_bill',
      payment_status: 'unpaid',
      created_at: '2026-06-22T08:00:00.000Z',
      updated_at: '2026-06-29T07:59:00.000Z',
      total: 15000,
      items: [],
    },
  ])

  assert.equal(session.updated_at, '2026-06-29T07:59:00.000Z')
})

test('product contribution ranks revenue and preserves missing historical cost coverage', () => {
  const rows = getDashboardProductContribution([{
    items: [
      { menu_item_id: 'kebab', name: 'Kebab', quantity: 2, price: 20_000, cost_price: 8_000 },
      { menu_item_id: 'cola', name: 'Cola', quantity: 1, price: 10_000 },
    ],
  }], menuItemMap)
  assert.deepEqual(rows.map(row => row.menuItemId), ['kebab', 'cola'])
  assert.deepEqual([rows[0].revenue, rows[0].profit, rows[0].marginPct, rows[0].revenueSharePct], [40_000, 24_000, 60, 80])
  assert.equal(rows[1].profit, null)
  assert.equal(rows[1].marginPct, null)
})
