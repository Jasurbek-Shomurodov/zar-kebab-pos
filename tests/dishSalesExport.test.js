import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { getDishSalesAnalysis } from '../src/lib/dishSales.js'
import {
  buildDishSalesExportRows,
  createDishSalesWorkbook,
  dayHeading,
  dishSalesExportFilename,
  listIsoDates,
} from '../src/lib/dishSalesExport.js'
import { bannerMetaText } from '../src/lib/sheetKit.js'

const menuItems = [
  { id: 'plov', name_en: 'Plov', category_id: 'mains', is_active: true },
  { id: 'tea', name_en: 'Black Tea', category_id: 'drinks', is_active: true },
  { id: 'soup', name_en: 'Soup', category_id: 'mains', is_active: true },
]

const orders = [
  { id: 'o1', status: 'paid', paid_at: '2026-10-16T08:00:00Z', items: [
    { product_id: 'plov', name_en: 'Plov', quantity: 2, price: 50000 },
    { product_id: 'tea', name_en: 'Black Tea', quantity: 1, price: 8000 },
  ] },
  { id: 'o2', status: 'paid', paid_at: '2026-10-18T09:00:00Z', items: [
    { product_id: 'plov', name_en: 'Plov', quantity: 1, price: 50000 },
    { product_id: 'tea', name_en: 'Black Tea', quantity: 3, price: 8000, status: 'cancelled', cancelled: true },
  ] },
]

function exportRows() {
  const analysis = getDishSalesAnalysis({ orders, menuItems })
  return buildDishSalesExportRows(analysis, {
    dishName: dish => dish.name_en || dish.name,
    dateFrom: '2026-10-16',
    dateTo: '2026-10-18',
  })
}

test('sold dishes export goes date by date, keeping days without sales', () => {
  const rows = exportRows()

  assert.deepEqual(rows.days.map(day => [day.date, day.totals.quantity, day.totals.orders, day.totals.revenue]), [
    ['2026-10-16', 3, 1, 108000],
    ['2026-10-17', 0, 0, 0],
    ['2026-10-18', 1, 1, 50000],
  ])
  assert.deepEqual(rows.days[0].dishes.map(dish => [dish.name, dish.quantity, dish.revenue, dish.averagePrice]), [
    ['Plov', 2, 100000, 50000],
    ['Black Tea', 1, 8000, 8000],
  ])
  assert.deepEqual(rows.dishes.map(row => [row.name, row.quantity, row.revenue, row.orders]), [
    ['Plov', 3, 150000, 2],
    ['Black Tea', 1, 8000, 1],
  ])
  assert.equal(rows.totals.quantity, 4)
  assert.equal(rows.totals.revenue, 158000)
})

test('sold dishes workbook opens on the period total, then categories, day bands and a dish by day grid', async () => {
  const workbook = await createDishSalesWorkbook(ExcelJS, { rows: exportRows(), lang: 'ru', periodLabel: '16 — 18 октября 2026' })
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
  const [summary, byCategory, byDay, matrix] = loaded.worksheets

  assert.deepEqual(loaded.worksheets.map(sheet => sheet.name), ['Итого за период', 'По категориям', 'По дням', 'Блюдо × день'])
  loaded.worksheets.forEach(sheet => {
    assert.match(sheet.getCell('A1').value, /^Zar Kebab — /)
    assert.match(bannerMetaText(sheet), /^Период: 16 — 18 октября 2026 {3}· {3}Создан: /)
    assert.equal(sheet.pageSetup.printTitlesRow, '4:4')
  })

  // Period total: best seller first, totals that follow the filter.
  assert.equal(summary.getRow(5).getCell(2).value, 'Plov')
  assert.equal(summary.getRow(7).getCell(4).value.formula, 'SUBTOTAL(109,D5:D6)')
  assert.equal(summary.getRow(7).getCell(6).value.result, 158000)
  assert.equal(summary.getRow(7).getCell(5).value, 2)
  assert.equal(summary.autoFilter, 'A4:I6')

  assert.equal(byCategory.getRow(5).getCell(2).value, '—')
  assert.equal(byCategory.getRow(6).getCell(5).value.result, 158000)

  assert.equal(byDay.getRow(5).getCell(1).value, '16 октября 2026, пятница')
  assert.equal(byDay.getRow(5).getCell(6).value, 108000)
  assert.equal(byDay.getRow(6).getCell(2).value, 'Plov')
  assert.equal(byDay.getRow(6).outlineLevel, 1)
  assert.equal(byDay.getRow(8).getCell(1).value, '17 октября 2026, суббота — нет продаж')
  assert.equal(byDay.getRow(9).getCell(1).value, '18 октября 2026, воскресенье')

  assert.deepEqual(matrix.getRow(4).values.slice(4), ['16.10\nПт', '17.10\nСб', '18.10\nВс', 'Итого'])
  assert.deepEqual([2, 3, 4, 5, 6, 7].map(column => matrix.getRow(5).getCell(column).value), ['Plov', '—', 2, null, 1, 3])
  assert.equal(matrix.getRow(7).getCell(7).value.result, 4)
})

test('sold dishes roll up by category, biggest seller first', () => {
  const rows = buildDishSalesExportRows(getDishSalesAnalysis({ orders, menuItems }), {
    dishName: dish => dish.name_en || dish.name,
    categoryName: dish => dish.category_id || '—',
    dateFrom: '2026-10-16',
    dateTo: '2026-10-18',
  })
  assert.deepEqual(rows.categories, [
    { name: 'mains', dishes: 1, quantity: 3, revenue: 150000 },
    { name: 'drinks', dishes: 1, quantity: 1, revenue: 8000 },
  ])
})

test('dates and filenames follow the selected range', () => {
  assert.deepEqual(listIsoDates('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  assert.equal(dayHeading('2026-10-18', 'en'), 'Sunday, 18 October 2026')
  assert.equal(dishSalesExportFilename('2026-10-18', '2026-10-18'), 'zar-kebab-sold-dishes-2026-10-18.xlsx')
  assert.equal(dishSalesExportFilename('2026-10-01', '2026-10-31'), 'zar-kebab-sold-dishes-2026-10-01-to-2026-10-31.xlsx')
})
