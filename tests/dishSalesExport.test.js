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

test('sold dishes workbook has day bands, a dish by day grid and a period summary', async () => {
  const workbook = await createDishSalesWorkbook(ExcelJS, { rows: exportRows(), lang: 'ru', periodLabel: '16 — 18 октября 2026' })
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
  const [byDay, matrix, summary] = loaded.worksheets

  assert.deepEqual(loaded.worksheets.map(sheet => sheet.name), ['По дням', 'Блюдо × день', 'Итого за период'])
  assert.equal(byDay.getCell('A2').value, 'Период: 16 — 18 октября 2026')
  assert.equal(byDay.getRow(6).getCell(1).value, '16 октября 2026, пятница')
  assert.equal(byDay.getRow(6).getCell(6).value, 108000)
  assert.equal(byDay.getRow(7).getCell(2).value, 'Plov')
  assert.equal(byDay.getRow(10).getCell(1).value, '17 октября 2026, суббота')
  assert.equal(byDay.getRow(11).getCell(2).value, 'Нет продаж')

  assert.deepEqual(matrix.getRow(5).values.slice(4), ['16.10', '17.10', '18.10', 'Итого'])
  assert.deepEqual([2, 3, 4, 5, 6, 7].map(column => matrix.getRow(6).getCell(column).value), ['Plov', '—', 2, null, 1, 3])

  assert.equal(summary.getRow(6).getCell(2).value, 'Plov')
  assert.equal(summary.getRow(8).getCell(6).value, 158000)
})

test('dates and filenames follow the selected range', () => {
  assert.deepEqual(listIsoDates('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  assert.equal(dayHeading('2026-10-18', 'en'), 'Sunday, 18 October 2026')
  assert.equal(dishSalesExportFilename('2026-10-18', '2026-10-18'), 'zar-kebab-sold-dishes-2026-10-18.xlsx')
  assert.equal(dishSalesExportFilename('2026-10-01', '2026-10-31'), 'zar-kebab-sold-dishes-2026-10-01-to-2026-10-31.xlsx')
})
