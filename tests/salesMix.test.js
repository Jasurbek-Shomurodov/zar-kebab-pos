import test from 'node:test'
import assert from 'node:assert/strict'
import { getDailySalesMix } from '../src/lib/salesMix.js'
import { buildDailySalesMixReportSvg } from '../api/telegram/_lib/dailyOperationsReportImages.js'

const menuItems = [
  { id: 'kebab', name_ru: 'Шашлык', category_id: 'grill' },
  { id: 'tea', name_ru: 'Чай', category_id: 'drinks' },
]
const categories = [
  { id: 'grill', name_ru: 'Гриль' },
  { id: 'drinks', name_ru: 'Напитки' },
]

test('sales mix ranks dishes and categories by line revenue with shares', () => {
  const mix = getDailySalesMix([
    { id: 'o1', status: 'served', items: [
      { menu_item_id: 'kebab', quantity: 2, unit_price: 30000, cost_price: 18000 },
      { menu_item_id: 'tea', quantity: 1, unit_price: 10000, cost_price: 2000 },
      { menu_item_id: 'tea', quantity: 5, unit_price: 10000, cost_price: 2000, status: 'cancelled' },
    ] },
    { id: 'o2', status: 'served', items: [{ menu_item_id: 'tea', quantity: 2, unit_price: 10000, cost_price: 2000, category_id_snapshot: 'drinks' }] },
    { id: 'o3', status: 'cancelled', items: [{ menu_item_id: 'kebab', quantity: 9, unit_price: 30000 }] },
  ], { menuItems, categories })

  assert.equal(mix.totalRevenue, 90000)
  assert.equal(mix.totalPieces, 5)
  assert.equal(mix.totalCost, 42000)
  assert.equal(mix.totalProfit, 48000)
  assert.equal(mix.totalMargin, 53.3)
  assert.deepEqual(mix.dishes.map(d => [d.name, d.quantity, d.revenue, d.share, d.orderCount, d.profit, d.margin, d.missingCost]), [
    ['Шашлык', 2, 60000, 66.7, 1, 24000, 40, false],
    ['Чай', 3, 30000, 33.3, 2, 24000, 80, false],
  ])
  assert.deepEqual(mix.categories.map(c => [c.name, c.revenue, c.share, c.dishCount, c.profit, c.margin]), [
    ['Гриль', 60000, 66.7, 1, 24000, 40],
    ['Напитки', 30000, 33.3, 1, 24000, 80],
  ])
})

test('sales mix keeps the category snapshot over the current menu category', () => {
  const mix = getDailySalesMix([{ id: 'o1', items: [
    { menu_item_id: 'tea', quantity: 1, unit_price: 5000, category_id_snapshot: '' },
  ] }], { menuItems, categories })
  assert.equal(mix.categories[0].name, 'Без категории')
  assert.equal(mix.categories[0].missingCost, true)
  assert.equal(mix.categories[0].margin, 100)
})

test('sales mix image lists categories, top dishes and percentages', () => {
  const svg = buildDailySalesMixReportSvg(getDailySalesMix([{ id: 'o1', items: [
    { menu_item_id: 'kebab', quantity: 1, unit_price: 30000 },
  ] }], { menuItems, categories }), '2026-10-16')
  assert.match(svg, /ТОП-1 КАТЕГОРИЙ/)
  assert.match(svg, /ТОП-1 БЛЮД/)
  assert.match(svg, /доля 100%/)
  assert.match(svg, /маржа 100%/)
  assert.match(svg, /без себестоимости/)
  assert.match(buildDailySalesMixReportSvg({}, '2026-10-16'), /Нет продаж за этот день/)
})

test('sales mix image caps categories and dishes at ten rows each', () => {
  const orders = Array.from({ length: 12 }, (_, index) => ({ id: `o${index}`, items: [
    { menu_item_id: `m${index}`, quantity: 1, unit_price: 1000 * (index + 1), cost_price: 500, category_id_snapshot: `c${index}` },
  ] }))
  const svg = buildDailySalesMixReportSvg(getDailySalesMix(orders, {
    categories: orders.map((_, index) => ({ id: `c${index}`, name_ru: `Категория ${index}` })),
  }), '2026-10-16')
  assert.match(svg, /ТОП-10 КАТЕГОРИЙ/)
  assert.match(svg, /ТОП-10 БЛЮД/)
  assert.doesNotMatch(svg, /Категория 1</)
  assert.doesNotMatch(svg, /без себестоимости/)
})
