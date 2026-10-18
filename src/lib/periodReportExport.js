import { formatDateTime } from './dateFormat.js'
import { getDailyCloseout } from './closeout.js'
import { dayHeading, listIsoDates } from './dishSalesExport.js'

// Excel export of the Reports Overview: the same totals the page shows,
// a day-by-day receipts sheet and, for expense viewers, the expense entries.
// Values come from the page's own helpers; nothing is recalculated here.

const LABELS = {
  title:          { uz: 'Davr hisoboti', ru: 'Отчёт за период', en: 'Period report' },
  overview:       { uz: 'Umumiy', ru: 'Обзор', en: 'Overview' },
  byDay:          { uz: 'Kunlar bo‘yicha', ru: 'По дням', en: 'By day' },
  expensesSheet:  { uz: 'Xarajatlar', ru: 'Расходы', en: 'Expenses' },
  period:         { uz: 'Davr', ru: 'Период', en: 'Period' },
  filters:        { uz: 'Filtrlar', ru: 'Фильтры', en: 'Filters' },
  generated:      { uz: 'Yaratilgan', ru: 'Создан', en: 'Generated' },
  sales:          { uz: 'Savdo', ru: 'Продажи', en: 'Sales' },
  received:       { uz: 'Kelgan pul', ru: 'Поступившие деньги', en: 'Money received' },
  result:         { uz: 'Xarajatlar va natija', ru: 'Расходы и итог', en: 'Expenses and result' },
  leftByMethod:   { uz: 'Xarajatlardan keyin qolgan', ru: 'Остаток после расходов', en: 'Left after expenses' },
  income:         { uz: 'Daromad', ru: 'Доход', en: 'Income' },
  orders:         { uz: 'Buyurtmalar', ru: 'Заказов', en: 'Orders' },
  avgOrder:       { uz: 'O‘rtacha buyurtma', ru: 'Средний чек', en: 'Avg order value' },
  loyaltyIncome:  { uz: 'Loyallik daromadi', ru: 'Доход по лояльности', en: 'Loyalty income' },
  regular:        { uz: 'Oddiy menyu', ru: 'Обычное меню', en: 'Regular menu' },
  tourist:        { uz: 'Turist menyu', ru: 'Туристическое меню', en: 'Tourist menu' },
  cash:           { uz: 'Naqd', ru: 'Наличные', en: 'Cash' },
  card:           { uz: 'Karta', ru: 'Карта', en: 'Card' },
  terminal:       { uz: 'Terminal', ru: 'Терминал', en: 'Terminal' },
  salary:         { uz: 'Maoshdan ushlab qolish', ru: 'Удержание из зарплаты', en: 'Salary deduction' },
  cashback:       { uz: 'Cashback berildi', ru: 'Кешбэк выдан', en: 'Cashback issued' },
  cancelled:      { uz: 'Bekor qilingan buyurtmalar', ru: 'Отменённые заказы', en: 'Cancelled orders' },
  variance:       { uz: 'Farq', ru: 'Расхождение', en: 'Variance' },
  notMeasured:    { uz: 'O‘lchanmagan', ru: 'Не измерено', en: 'Not measured' },
  expenses:       { uz: 'Xarajatlar', ru: 'Расходы', en: 'Expenses' },
  employeeMeals:  { uz: 'Xodimlar ovqati', ru: 'Питание сотрудников', en: 'Employees meal' },
  netIncome:      { uz: 'Barcha xarajatlardan keyin', ru: 'После всех расходов', en: 'After all expenses' },
  mealsNote:      { uz: 'Davomat bo‘yicha hisoblangan, xarajatlarga kiritilgan', ru: 'Рассчитано по посещаемости, входит в расходы', en: 'Calculated from attendance, included in expenses' },
  leftNote:       { uz: 'Davr harakati, boshlang‘ich qoldiqsiz', ru: 'Движение за период, без начального остатка', en: 'Movement for the period, excluding opening balances' },
  ordersSuffix:   { uz: 'buyurtma', ru: 'заказов', en: 'orders' },
  date:           { uz: 'Sana', ru: 'Дата', en: 'Date' },
  type:           { uz: 'Turi', ru: 'Тип', en: 'Type' },
  details:        { uz: 'Tafsilot', ru: 'Детали', en: 'Details' },
  method:         { uz: 'To‘lov usuli', ru: 'Способ оплаты', en: 'Payment method' },
  amount:         { uz: 'Summa (UZS)', ru: 'Сумма (UZS)', en: 'Amount (UZS)' },
  incomeUzs:      { uz: 'Daromad (UZS)', ru: 'Доход (UZS)', en: 'Income (UZS)' },
  total:          { uz: 'Jami', ru: 'Итого', en: 'Total' },
  noExpenses:     { uz: 'Bu davrda xarajatlar yo‘q', ru: 'За этот период расходов нет', en: 'No expenses were recorded for this period' },
}

const BRAND = 'FFFF5A00'
const SOFT = 'FFFFF1E8'
const TOTAL_FILL = 'FFEFECE9'
const MUTED = 'FF68655F'
const LINE = 'FFE4E1DE'
const POSITIVE = 'FF1D7A52'
const NEGATIVE = 'FFC4262C'
const MONEY = '#,##0 "UZS";[Red]-#,##0 "UZS"'
const NUMBER = '#,##0'

function label(key, lang) {
  return LABELS[key][lang] || LABELS[key].en
}

export function periodReportFilename(dateFrom, dateTo) {
  const suffix = dateFrom === dateTo ? dateTo : `${dateFrom}-to-${dateTo}`
  return `zar-kebab-report-${suffix}.xlsx`
}

// Day-by-day receipts from the same closeout helper as the Period receipts panel,
// so the day rows add up to the period totals.
export function buildDailyReceiptRows(orders, dateFrom, dateTo, scope = {}) {
  const days = listIsoDates(dateFrom, dateTo).map(date => {
    const day = getDailyCloseout(orders, date, date, scope)
    return {
      date,
      orders: day.orderCount,
      revenue: day.revenue,
      cash: day.totals.cash,
      card: day.totals.card,
      terminal: day.totals.terminal,
      salary: day.totals.salary,
      cancelled: day.cancelledCount,
    }
  })
  const sum = key => days.reduce((total, day) => total + (Number(day[key]) || 0), 0)
  return {
    days,
    totals: {
      orders: sum('orders'),
      revenue: sum('revenue'),
      cash: sum('cash'),
      card: sum('card'),
      terminal: sum('terminal'),
      salary: sum('salary'),
      cancelled: sum('cancelled'),
    },
  }
}

function fill(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function writeTitle(sheet, { lang, title, periodLabel, filterLabel, lastColumn }) {
  sheet.mergeCells(1, 1, 1, lastColumn)
  const heading = sheet.getCell(1, 1)
  heading.value = `Zar Kebab — ${title}`
  heading.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  heading.alignment = { vertical: 'middle', indent: 1 }
  fill(heading, BRAND)
  sheet.getRow(1).height = 32

  const meta = [
    [label('period', lang), periodLabel],
    filterLabel ? [label('filters', lang), filterLabel] : null,
    [label('generated', lang), formatDateTime(new Date().toISOString())],
  ].filter(Boolean)
  meta.forEach(([name, value], index) => {
    const row = sheet.getRow(2 + index)
    row.getCell(1).value = name
    row.getCell(1).font = { color: { argb: MUTED } }
    row.getCell(2).value = value
    row.getCell(2).font = { bold: true }
  })
  return 2 + meta.length + 1
}

function styleTableHeader(row, lastColumn, { centerFrom = 2 } = {}) {
  row.height = 22
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = row.getCell(column)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle', wrapText: true, horizontal: column >= centerFrom ? 'right' : 'left' }
    fill(cell, BRAND)
  }
}

function styleTotalRow(row, lastColumn) {
  row.height = 22
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = row.getCell(column)
    cell.font = { bold: true, size: 12 }
    cell.border = { top: { style: 'medium' } }
    cell.alignment = { vertical: 'middle', horizontal: cell.alignment?.horizontal }
    fill(cell, TOTAL_FILL)
  }
}

function lineBelow(row, lastColumn) {
  for (let column = 1; column <= lastColumn; column += 1) {
    row.getCell(column).border = { bottom: { style: 'thin', color: { argb: LINE } } }
  }
}

// Sheet 1 mirrors the Overview tab: Sales, Money received, Expenses and result.
function writeOverviewSheet(workbook, data) {
  const { lang } = data
  const lastColumn = 3
  const sheet = workbook.addWorksheet(label('overview', lang), {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  })
  sheet.columns = [{ width: 34 }, { width: 22 }, { width: 52 }]
  // writeTitle leaves a spacer row; each section adds its own spacer above it.
  let rowNumber = writeTitle(sheet, { ...data, title: label('title', lang), lastColumn }) - 1

  function section(titleKey) {
    rowNumber += 1
    sheet.mergeCells(rowNumber, 1, rowNumber, lastColumn)
    const cell = sheet.getCell(rowNumber, 1)
    cell.value = label(titleKey, lang).toUpperCase()
    cell.font = { bold: true, size: 11, color: { argb: BRAND } }
    cell.border = { bottom: { style: 'medium', color: { argb: BRAND } } }
    sheet.getRow(rowNumber).height = 22
    rowNumber += 1
  }

  function line(nameKey, value, { money = true, note = '', strong = false, color = '' } = {}) {
    const row = sheet.getRow(rowNumber)
    row.getCell(1).value = label(nameKey, lang)
    row.getCell(2).value = value
    row.getCell(2).numFmt = typeof value === 'number' ? (money ? MONEY : NUMBER) : '@'
    row.getCell(2).alignment = { horizontal: 'right' }
    row.getCell(2).font = { bold: true, size: strong ? 13 : 11, color: color ? { argb: color } : undefined }
    if (strong) row.getCell(1).font = { bold: true, size: 12 }
    if (note) {
      row.getCell(3).value = note
      row.getCell(3).font = { italic: true, color: { argb: MUTED } }
    }
    row.height = strong ? 22 : 18
    lineBelow(row, lastColumn)
    rowNumber += 1
  }

  section('sales')
  line('income', data.revenue, { strong: true })
  line('orders', data.orders, { money: false })
  line('avgOrder', data.averageOrder)
  data.priceModes.forEach(mode => {
    line(mode.mode === 'tourist' ? 'tourist' : 'regular', mode.revenue, { note: `${mode.orders} ${label('ordersSuffix', lang)}` })
  })

  const closeout = data.closeout
  section('received')
  line('cash', closeout.totals.cash)
  line('card', closeout.totals.card)
  line('terminal', closeout.totals.terminal)
  if (closeout.totals.salary > 0) line('salary', closeout.totals.salary)
  line('loyaltyIncome', closeout.loyaltyIncome)
  line('cashback', closeout.cashbackIssued)
  line('cancelled', closeout.cancelledCount, { money: false })
  line('variance', closeout.variance == null ? label('notMeasured', lang) : closeout.variance)

  if (data.expenses) {
    const { expenses } = data
    section('result')
    line('expenses', expenses.total, { color: NEGATIVE })
    line('employeeMeals', expenses.employeeMeals, { note: label('mealsNote', lang) })
    line('netIncome', expenses.net, { strong: true, color: expenses.net >= 0 ? POSITIVE : NEGATIVE })
    section('leftByMethod')
    line('cash', expenses.leftByMethod.cash)
    line('card', expenses.leftByMethod.card)
    line('terminal', expenses.leftByMethod.terminal, { note: label('leftNote', lang) })
  }
}

// Sheet 2: one row per calendar day, including days with no sales.
function writeByDaySheet(workbook, data) {
  const { lang, daily } = data
  const showSalary = daily.totals.salary > 0
  const keys = ['orders', 'revenue', 'cash', 'card', 'terminal', ...(showSalary ? ['salary'] : []), 'cancelled']
  const lastColumn = keys.length + 1
  const sheet = workbook.addWorksheet(label('byDay', lang))
  sheet.columns = [{ width: 34 }, ...keys.map(key => ({ width: key === 'orders' || key === 'cancelled' ? 13 : 18 }))]
  const headerRow = writeTitle(sheet, { ...data, title: label('byDay', lang), lastColumn })
  sheet.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 1 }]

  const headings = { orders: 'orders', revenue: 'incomeUzs', cash: 'cash', card: 'card', terminal: 'terminal', salary: 'salary', cancelled: 'cancelled' }
  const header = sheet.getRow(headerRow)
  header.values = [label('date', lang), ...keys.map(key => label(headings[key], lang))]
  styleTableHeader(header, lastColumn)

  daily.days.forEach((day, index) => {
    const row = sheet.addRow([dayHeading(day.date, lang), ...keys.map(key => day[key] || null)])
    keys.forEach((key, offset) => {
      const cell = row.getCell(offset + 2)
      cell.numFmt = NUMBER
      cell.alignment = { horizontal: 'right' }
    })
    if (day.orders === 0) row.font = { color: { argb: MUTED } }
    if (index % 2 === 1) for (let column = 1; column <= lastColumn; column += 1) fill(row.getCell(column), 'FFFAF9F7')
  })

  const total = sheet.addRow([label('total', lang), ...keys.map(key => daily.totals[key])])
  keys.forEach((_, offset) => {
    total.getCell(offset + 2).numFmt = NUMBER
    total.getCell(offset + 2).alignment = { horizontal: 'right' }
  })
  styleTotalRow(total, lastColumn)
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: lastColumn } }
}

// Sheet 3: the expense entries behind the Expenses total.
function writeExpensesSheet(workbook, data) {
  const { lang, expenses } = data
  const lastColumn = 5
  const sheet = workbook.addWorksheet(label('expensesSheet', lang))
  sheet.columns = [{ width: 30 }, { width: 28 }, { width: 46 }, { width: 18 }, { width: 18 }]
  const headerRow = writeTitle(sheet, { ...data, title: label('expensesSheet', lang), lastColumn })
  sheet.views = [{ state: 'frozen', ySplit: headerRow }]
  const header = sheet.getRow(headerRow)
  header.values = ['date', 'type', 'details', 'method', 'amount'].map(key => label(key, lang))
  styleTableHeader(header, lastColumn, { centerFrom: 5 })

  if (expenses.rows.length === 0) {
    const empty = sheet.addRow([label('noExpenses', lang)])
    empty.font = { italic: true, color: { argb: MUTED } }
  }
  expenses.rows.forEach(entry => {
    const row = sheet.addRow([entry.date, entry.type, entry.details, entry.method, entry.amount])
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' }
    row.getCell(5).numFmt = NUMBER
    row.getCell(5).font = { color: { argb: NEGATIVE } }
    lineBelow(row, lastColumn)
  })

  const total = sheet.addRow([label('total', lang), '', '', '', expenses.total])
  total.getCell(5).numFmt = NUMBER
  total.getCell(5).alignment = { horizontal: 'right' }
  styleTotalRow(total, lastColumn)
  total.getCell(5).font = { bold: true, size: 12, color: { argb: NEGATIVE } }
  if (expenses.rows.length) sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: lastColumn } }
}

export function createPeriodReportWorkbook(ExcelJS, data) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Zar Kebab POS'
  workbook.created = new Date()
  writeOverviewSheet(workbook, data)
  writeByDaySheet(workbook, data)
  if (data.expenses) writeExpensesSheet(workbook, data)
  return workbook
}

export async function downloadPeriodReportWorkbook({ filename, ...data }) {
  if (typeof document === 'undefined') return
  const module = await import('exceljs')
  const ExcelJS = module.default || module
  const workbook = createPeriodReportWorkbook(ExcelJS, data)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
