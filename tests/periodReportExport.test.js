import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { getDailyCloseout } from '../src/lib/closeout.js'
import { buildDailyReceiptRows, createPeriodReportWorkbook, periodReportFilename } from '../src/lib/periodReportExport.js'

const orders = [
  { id: 'o1', status: 'paid', payment_status: 'paid', table_id: 't1', waiter_name: 'Malika', paid_at: '2026-10-16T08:00:00Z', created_at: '2026-10-16T07:00:00Z', total_amount: 60000, payment_method: 'cash', payments: [{ method: 'cash', amount: 60000 }] },
  { id: 'o2', status: 'paid', payment_status: 'paid', table_id: 't2', waiter_name: 'Aziz', paid_at: '2026-10-18T09:00:00Z', created_at: '2026-10-18T08:30:00Z', total_amount: 40000, payment_method: 'terminal', payments: [{ method: 'terminal', amount: 40000 }] },
  { id: 'o3', status: 'cancelled', table_id: 't1', waiter_name: 'Malika', created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:05:00Z', total_amount: 9000 },
]

test('daily receipts list every day and add up to the period closeout', () => {
  const daily = buildDailyReceiptRows(orders, '2026-10-16', '2026-10-18')
  const period = getDailyCloseout(orders, '2026-10-16', '2026-10-18')
  assert.deepEqual(daily.days.map(day => day.date), ['2026-10-16', '2026-10-17', '2026-10-18'])
  assert.equal(daily.days[1].orders, 0)
  assert.equal(daily.totals.revenue, period.revenue)
  assert.equal(daily.totals.cash, period.totals.cash)
  assert.equal(daily.totals.terminal, period.totals.terminal)
  assert.equal(daily.totals.cancelled, period.cancelledCount)
})

test('daily receipts respect the table and waiter filters', () => {
  const daily = buildDailyReceiptRows(orders, '2026-10-16', '2026-10-18', { waiterName: 'Malika' })
  assert.equal(daily.totals.orders, 1)
  assert.equal(daily.totals.terminal, 0)
})

function workbookData(overrides = {}) {
  const closeout = getDailyCloseout(orders, '2026-10-16', '2026-10-18')
  return {
    lang: 'ru',
    periodLabel: '16 октября 2026 — 18 октября 2026',
    filterLabel: '',
    revenue: closeout.revenue,
    orders: closeout.orderCount,
    averageOrder: 50000,
    priceModes: [{ mode: 'regular', orders: 1, revenue: 60000 }, { mode: 'tourist', orders: 1, revenue: 40000 }],
    closeout,
    daily: buildDailyReceiptRows(orders, '2026-10-16', '2026-10-18'),
    expenses: null,
    ...overrides,
  }
}

test('report workbook is translated and leaves expenses out for people who cannot see them', async () => {
  const workbook = createPeriodReportWorkbook(ExcelJS, workbookData())
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Обзор', 'По дням'])
  const overview = workbook.getWorksheet('Обзор')
  assert.equal(overview.getCell('A1').value, 'Zar Kebab — Отчёт за период')
  const values = []
  overview.eachRow(row => values.push(row.getCell(1).value))
  assert.ok(values.includes('Доход'))
  assert.ok(!values.includes('Расходы'))
  assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 0)
})

test('report workbook adds the expense sheet and result for expense viewers', () => {
  const workbook = createPeriodReportWorkbook(ExcelJS, workbookData({
    lang: 'en',
    expenses: {
      total: 30000, employeeMeals: 5000, net: 70000,
      leftByMethod: { cash: 30000, card: 0, terminal: 40000 },
      rows: [{ date: '17 October 2026', type: 'Rent', details: 'Landlord', method: 'Cash', amount: 30000 }],
    },
  }))
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Overview', 'By day', 'Expenses'])
  const sheet = workbook.getWorksheet('Expenses')
  const amounts = []
  sheet.eachRow(row => amounts.push(row.getCell(5).value))
  assert.equal(amounts.at(-1), 30000)
})

test('report filename names the period', () => {
  assert.equal(periodReportFilename('2026-10-18', '2026-10-18'), 'zar-kebab-report-2026-10-18.xlsx')
  assert.equal(periodReportFilename('2026-10-01', '2026-10-17'), 'zar-kebab-report-2026-10-01-to-2026-10-17.xlsx')
})
