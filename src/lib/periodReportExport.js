import { formatDateTime } from './dateFormat.js'
import { getDailyCloseout } from './closeout.js'
import { listIsoDates } from './dishSalesExport.js'
import {
  COLORS,
  FORMATS,
  addSheet,
  createWorkbook,
  downloadWorkbook,
  isWeekend,
  isoToSheetDate,
  weekdayName,
  writeBanner,
  writeKpis,
  writeTable,
} from './sheetKit.js'

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
  weekday:        { uz: 'Hafta kuni', ru: 'День недели', en: 'Weekday' },
  share:          { uz: 'Ulush', ru: 'Доля', en: 'Share' },
  type:           { uz: 'Turi', ru: 'Тип', en: 'Type' },
  details:        { uz: 'Tafsilot', ru: 'Детали', en: 'Details' },
  method:         { uz: 'To‘lov usuli', ru: 'Способ оплаты', en: 'Payment method' },
  amount:         { uz: 'Summa (UZS)', ru: 'Сумма (UZS)', en: 'Amount (UZS)' },
  incomeUzs:      { uz: 'Daromad (UZS)', ru: 'Доход (UZS)', en: 'Income (UZS)' },
  total:          { uz: 'Jami', ru: 'Итого', en: 'Total' },
  noExpenses:     { uz: 'Bu davrda xarajatlar yo‘q', ru: 'За этот период расходов нет', en: 'No expenses were recorded for this period' },
}


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

function bannerMeta({ lang, periodLabel, filterLabel }) {
  return [
    [label('period', lang), periodLabel],
    [label('filters', lang), filterLabel],
    [label('generated', lang), formatDateTime(new Date().toISOString())],
  ]
}

// Sheet 1 mirrors the Overview tab: headline cards, then Sales, Money received,
// Expenses and result. Shares are of the section's own total.
function writeOverviewSheet(workbook, data) {
  const { lang, closeout } = data
  const lastColumn = 4
  const sheet = addSheet(workbook, label('overview', lang), { landscape: false, gridLines: false })
  sheet.columns = [{ width: 32 }, { width: 24 }, { width: 24 }, { width: 46 }]
  let rowNumber = writeBanner(sheet, { title: label('title', lang), meta: bannerMeta(data), lastColumn })

  rowNumber = writeKpis(sheet, {
    row: rowNumber,
    lastColumn,
    items: [
      { label: label('income', lang), value: data.revenue, format: FORMATS.moneyUzs },
      { label: label('orders', lang), value: data.orders },
      { label: label('avgOrder', lang), value: data.averageOrder, format: FORMATS.moneyUzs },
      data.expenses
        ? { label: label('netIncome', lang), value: data.expenses.net, format: FORMATS.moneyUzs, color: data.expenses.net >= 0 ? COLORS.positive : COLORS.negative }
        : { label: label('cancelled', lang), value: closeout.cancelledCount },
    ],
  }) - 1

  function section(titleKey) {
    rowNumber += 1
    sheet.mergeCells(rowNumber, 1, rowNumber, lastColumn)
    const cell = sheet.getCell(rowNumber, 1)
    cell.value = label(titleKey, lang).toUpperCase()
    cell.font = { bold: true, size: 11, color: { argb: COLORS.brand } }
    cell.alignment = { vertical: 'middle' }
    cell.border = { bottom: { style: 'medium', color: { argb: COLORS.brand } } }
    sheet.getRow(rowNumber).height = 24
    rowNumber += 1
  }

  function line(nameKey, value, { money = true, note = '', strong = false, color = '', of = 0 } = {}) {
    const row = sheet.getRow(rowNumber)
    row.getCell(1).value = label(nameKey, lang)
    row.getCell(1).alignment = { vertical: 'middle', indent: 1 }
    row.getCell(2).value = value
    row.getCell(2).numFmt = typeof value === 'number' ? (money ? FORMATS.moneyUzs : FORMATS.int) : '@'
    row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' }
    row.getCell(2).font = { bold: true, size: strong ? 13 : 11, color: color ? { argb: color } : undefined }
    if (strong) row.getCell(1).font = { bold: true, size: 12 }
    if (of > 0 && typeof value === 'number') {
      row.getCell(3).value = value / of
      row.getCell(3).numFmt = FORMATS.percent
      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      row.getCell(3).font = { color: { argb: COLORS.muted } }
    }
    if (note) {
      row.getCell(4).value = note
      row.getCell(4).font = { italic: true, color: { argb: COLORS.muted } }
      row.getCell(4).alignment = { vertical: 'middle', wrapText: true }
    }
    row.height = strong ? 24 : 20
    for (let column = 1; column <= lastColumn; column += 1) {
      row.getCell(column).border = { bottom: { style: 'thin', color: { argb: COLORS.line } } }
    }
    rowNumber += 1
  }

  section('sales')
  line('income', data.revenue, { strong: true })
  line('orders', data.orders, { money: false })
  line('avgOrder', data.averageOrder)
  data.priceModes.forEach(mode => {
    line(mode.mode === 'tourist' ? 'tourist' : 'regular', mode.revenue, { of: data.revenue, note: `${mode.orders} ${label('ordersSuffix', lang)}` })
  })

  const methods = ['cash', 'card', 'terminal', 'salary']
  const received = methods.reduce((total, method) => total + (Number(closeout.totals[method]) || 0), 0)
  section('received')
  line('cash', closeout.totals.cash, { of: received })
  line('card', closeout.totals.card, { of: received })
  line('terminal', closeout.totals.terminal, { of: received })
  if (closeout.totals.salary > 0) line('salary', closeout.totals.salary, { of: received })
  line('loyaltyIncome', closeout.loyaltyIncome)
  line('cashback', closeout.cashbackIssued)
  line('cancelled', closeout.cancelledCount, { money: false })
  line('variance', closeout.variance == null ? label('notMeasured', lang) : closeout.variance)

  if (data.expenses) {
    const { expenses } = data
    section('result')
    line('expenses', expenses.total, { color: COLORS.negative })
    line('employeeMeals', expenses.employeeMeals, { note: label('mealsNote', lang) })
    line('netIncome', expenses.net, { strong: true, color: expenses.net >= 0 ? COLORS.positive : COLORS.negative })
    section('leftByMethod')
    line('cash', expenses.leftByMethod.cash)
    line('card', expenses.leftByMethod.card)
    line('terminal', expenses.leftByMethod.terminal, { note: label('leftNote', lang) })
  }
}

// Sheet 2: one row per calendar day, including days with no sales. Dates are
// real Excel dates, so the sheet sorts and filters by day.
function writeByDaySheet(workbook, data) {
  const { lang, daily } = data
  const showSalary = daily.totals.salary > 0
  const headings = { orders: 'orders', revenue: 'incomeUzs', cash: 'cash', card: 'card', terminal: 'terminal', salary: 'salary', cancelled: 'cancelled' }
  const keys = ['orders', 'revenue', 'cash', 'card', 'terminal', ...(showSalary ? ['salary'] : []), 'cancelled']
  const sheet = addSheet(workbook, label('byDay', lang))
  sheet.columns = [{ width: 13 }, { width: 16 }, ...keys.map(key => ({ width: key === 'orders' ? 13 : key === 'cancelled' ? 17 : 19 }))]
  const startRow = writeBanner(sheet, { title: label('byDay', lang), meta: bannerMeta(data), lastColumn: keys.length + 2 })
  writeTable(sheet, {
    startRow,
    freezeColumns: 2,
    totalLabel: label('total', lang),
    rows: daily.days,
    columns: [
      { header: label('date', lang), type: 'date', value: day => isoToSheetDate(day.date) || day.date },
      { header: label('weekday', lang), type: 'text', value: day => weekdayName(day.date, lang) },
      ...keys.map(key => ({
        header: label(headings[key], lang),
        type: key === 'orders' || key === 'cancelled' ? 'int' : 'money',
        total: 'sum',
        value: day => day[key] || null,
      })),
    ],
    rowStyle(row, day) {
      if (day.orders === 0) row.eachCell(cell => { cell.font = { color: { argb: COLORS.faint } } })
      else if (isWeekend(day.date)) row.getCell(2).font = { bold: true, color: { argb: COLORS.brandDark } }
    },
  })
}

// Sheet 3: the expense entries behind the Expenses total.
function writeExpensesSheet(workbook, data) {
  const { lang, expenses } = data
  const sheet = addSheet(workbook, label('expensesSheet', lang))
  sheet.columns = [{ width: 20 }, { width: 28 }, { width: 50 }, { width: 20 }, { width: 20 }]
  const startRow = writeBanner(sheet, { title: label('expensesSheet', lang), meta: bannerMeta(data), lastColumn: 5 })
  const listed = expenses.rows.reduce((total, entry) => total + (Number(entry.amount) || 0), 0)
  const allDated = expenses.rows.every(entry => isoToSheetDate(entry.isoDate))
  const { totalRow } = writeTable(sheet, {
    startRow,
    totalLabel: label('total', lang),
    empty: label('noExpenses', lang),
    rows: expenses.rows,
    columns: [
      allDated
        ? { header: label('date', lang), type: 'date', value: entry => isoToSheetDate(entry.isoDate) }
        : { header: label('date', lang), type: 'text', value: entry => entry.date },
      { header: label('type', lang), type: 'text', value: entry => entry.type },
      { header: label('details', lang), type: 'text', wrap: true, value: entry => entry.details },
      { header: label('method', lang), type: 'text', muted: true, value: entry => entry.method },
      // The total follows the filter only when the entries add up to the page total.
      { header: label('amount', lang), type: 'money', color: COLORS.negative, total: listed === expenses.total ? 'sum' : expenses.total, value: entry => entry.amount },
    ],
  })
  totalRow.getCell(5).font = { bold: true, size: 12, color: { argb: COLORS.negative } }
}

export function createPeriodReportWorkbook(ExcelJS, data) {
  const workbook = createWorkbook(ExcelJS)
  writeOverviewSheet(workbook, data)
  writeByDaySheet(workbook, data)
  if (data.expenses) writeExpensesSheet(workbook, data)
  return workbook
}

export function downloadPeriodReportWorkbook({ filename, ...data }) {
  return downloadWorkbook(filename, ExcelJS => createPeriodReportWorkbook(ExcelJS, data))
}
