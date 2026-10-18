import { formatDateTime, formatLongDate } from './dateFormat.js'

// Excel export of directly sold dishes for the selected report period.
// Rows come from getDishSalesAnalysis (saved order prices only); set contents
// are not added, matching the All dishes view.

const LABELS = {
  title:      { uz: 'Sotilgan taomlar', ru: 'Проданные блюда', en: 'Sold dishes' },
  byDay:      { uz: 'Kunlar bo‘yicha', ru: 'По дням', en: 'By day' },
  matrix:     { uz: 'Taom × kun', ru: 'Блюдо × день', en: 'Dish × day' },
  summary:    { uz: 'Davr bo‘yicha jami', ru: 'Итого за период', en: 'Period total' },
  period:     { uz: 'Davr', ru: 'Период', en: 'Period' },
  filters:    { uz: 'Filtrlar', ru: 'Фильтры', en: 'Filters' },
  number:     { uz: '№', ru: '№', en: '#' },
  dish:       { uz: 'Taom', ru: 'Блюдо', en: 'Dish' },
  category:   { uz: 'Kategoriya', ru: 'Категория', en: 'Category' },
  qty:        { uz: 'Sotildi', ru: 'Продано', en: 'Sold' },
  orders:     { uz: 'Buyurtmalar', ru: 'Заказов', en: 'Orders' },
  revenue:    { uz: 'Taomlar summasi (UZS)', ru: 'Сумма блюд (UZS)', en: 'Item sales (UZS)' },
  avgPrice:   { uz: 'O‘rtacha narx (UZS)', ru: 'Средняя цена (UZS)', en: 'Average price (UZS)' },
  share:      { uz: 'Ulush', ru: 'Доля', en: 'Share' },
  lastSale:   { uz: 'Oxirgi sotuv', ru: 'Последняя продажа', en: 'Last sale' },
  total:      { uz: 'Jami', ru: 'Итого', en: 'Total' },
  noSales:    { uz: 'Sotuv yo‘q', ru: 'Нет продаж', en: 'No sales' },
}

const WEEKDAYS = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  uz: ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'],
}

const DAY_MS = 86_400_000
const BRAND = 'FFFF5A00'
const DAY_FILL = 'FFFFF1E8'
const TOTAL_FILL = 'FFEFECE9'
const MONEY = '#,##0'

function label(key, lang) {
  return LABELS[key][lang] || LABELS[key].en
}

function isoDayNumber(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return match ? Math.floor(Date.UTC(+match[1], +match[2] - 1, +match[3]) / DAY_MS) : null
}

function isoFromDayNumber(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

// Every calendar date in the range, so days without sales still show up.
export function listIsoDates(dateFrom, dateTo) {
  const start = isoDayNumber(dateFrom)
  const end = isoDayNumber(dateTo)
  if (start === null || end === null || end < start) return []
  return Array.from({ length: Math.min(end - start + 1, 366) }, (_, index) => isoFromDayNumber(start + index))
}

export function dayHeading(iso, lang = 'en') {
  const day = isoDayNumber(iso)
  if (day === null) return iso || ''
  const weekday = (WEEKDAYS[lang] || WEEKDAYS.en)[(day + 4) % 7] // 1970-01-01 was a Thursday.
  const date = formatLongDate(iso, lang, iso)
  return lang === 'en' ? `${weekday}, ${date}` : `${date}, ${weekday}`
}

export function dishSalesExportFilename(dateFrom, dateTo) {
  const suffix = dateFrom === dateTo ? dateTo : `${dateFrom}-to-${dateTo}`
  return `zar-kebab-sold-dishes-${suffix}.xlsx`
}

function sortByQuantity(a, b) {
  return b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name)
}

function averagePrice(row) {
  return row.quantity > 0 ? Math.round(row.revenue / row.quantity) : 0
}

function createDay(date) {
  return { date, orderIds: new Set(), dishes: new Map() }
}

// Pure row builder so totals stay testable without ExcelJS.
export function buildDishSalesExportRows(analysis, { dishName, categoryName, dateFrom, dateTo } = {}) {
  const nameOf = dishName || (dish => dish?.name || '—')
  const categoryOf = categoryName || (() => '—')
  const dishByKey = new Map((analysis?.dishes || []).map(dish => [dish.key, dish]))

  const dishes = (analysis?.dishes || [])
    .filter(dish => dish.quantity > 0)
    .map(dish => ({
      key: dish.key,
      name: nameOf(dish),
      category: categoryOf(dish),
      quantity: dish.quantity,
      orders: dish.orders || 0,
      revenue: dish.revenue,
      averagePrice: averagePrice(dish),
      lastSoldAt: dish.lastSoldAt || null,
    }))
    .sort(sortByQuantity)

  const dayMap = new Map(listIsoDates(dateFrom, dateTo).map(date => [date, createDay(date)]))
  ;(analysis?.sales || []).forEach(sale => {
    if (sale.includedInSet || !sale.date) return
    if (!dayMap.has(sale.date)) dayMap.set(sale.date, createDay(sale.date))
    const day = dayMap.get(sale.date)
    day.orderIds.add(sale.orderId)
    if (!day.dishes.has(sale.dishKey)) {
      const dish = dishByKey.get(sale.dishKey)
      day.dishes.set(sale.dishKey, {
        key: sale.dishKey,
        name: dish ? nameOf(dish) : sale.dishName,
        category: dish ? categoryOf(dish) : '—',
        quantity: 0,
        revenue: 0,
        orderIds: new Set(),
      })
    }
    const row = day.dishes.get(sale.dishKey)
    row.quantity += sale.quantity
    row.revenue += sale.revenue
    row.orderIds.add(sale.orderId)
  })

  const days = Array.from(dayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(day => {
      const dayDishes = Array.from(day.dishes.values())
        .map(({ orderIds, ...row }) => ({ ...row, orders: orderIds.size, averagePrice: averagePrice(row) }))
        .sort(sortByQuantity)
      return {
        date: day.date,
        dishes: dayDishes,
        totals: {
          quantity: dayDishes.reduce((sum, row) => sum + row.quantity, 0),
          revenue: dayDishes.reduce((sum, row) => sum + row.revenue, 0),
          orders: day.orderIds.size,
        },
      }
    })

  return {
    dishes,
    days,
    totals: {
      quantity: dishes.reduce((sum, row) => sum + row.quantity, 0),
      revenue: dishes.reduce((sum, row) => sum + row.revenue, 0),
      orders: analysis?.totals?.orders || 0,
    },
  }
}

function fillRow(row, argb, fromColumn, toColumn) {
  for (let column = fromColumn; column <= toColumn; column += 1) {
    row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  }
}

function styleHeader(row, columnCount) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.height = 22
  fillRow(row, BRAND, 1, columnCount)
  for (let column = 1; column <= columnCount; column += 1) {
    row.getCell(column).alignment = { vertical: 'middle', wrapText: true }
  }
}

function styleTotal(sheet, row, columnCount) {
  sheet.mergeCells(row.number, 1, row.number, 3)
  row.font = { bold: true, size: 12 }
  row.height = 22
  fillRow(row, TOTAL_FILL, 1, columnCount)
  for (let column = 1; column <= columnCount; column += 1) {
    row.getCell(column).border = { top: { style: 'medium' } }
    row.getCell(column).alignment = { vertical: 'middle' }
  }
}

function writeTitle(sheet, { title, lang, periodLabel, filterLabel }) {
  sheet.getCell('A1').value = `Zar Kebab — ${title}`
  sheet.getCell('A1').font = { bold: true, size: 14 }
  sheet.getCell('A2').value = `${label('period', lang)}: ${periodLabel}`
  if (filterLabel) sheet.getCell('A3').value = `${label('filters', lang)}: ${filterLabel}`
}

// Sheet 1: each date as a band with that day's totals, its dishes below.
function writeByDaySheet(workbook, { rows, lang, periodLabel, filterLabel }) {
  const columns = 7
  const sheet = workbook.addWorksheet(label('byDay', lang), {
    views: [{ state: 'frozen', ySplit: 5 }],
    properties: { outlineLevelRow: 1 },
  })
  sheet.columns = [{ width: 6 }, { width: 36 }, { width: 24 }, { width: 11 }, { width: 11 }, { width: 20 }, { width: 19 }]
  writeTitle(sheet, { title: label('title', lang), lang, periodLabel, filterLabel })
  sheet.getRow(5).values = ['number', 'dish', 'category', 'qty', 'orders', 'revenue', 'avgPrice'].map(key => label(key, lang))
  styleHeader(sheet.getRow(5), columns)

  rows.days.forEach(day => {
    const band = sheet.addRow([dayHeading(day.date, lang), '', '', day.totals.quantity, day.totals.orders, day.totals.revenue, ''])
    sheet.mergeCells(band.number, 1, band.number, 3)
    band.font = { bold: true, size: 12 }
    band.height = 24
    band.getCell(6).numFmt = MONEY
    fillRow(band, DAY_FILL, 1, columns)
    for (let column = 1; column <= columns; column += 1) {
      band.getCell(column).alignment = { vertical: 'middle' }
      band.getCell(column).border = { top: { style: 'thin', color: { argb: BRAND } } }
    }

    if (day.dishes.length === 0) {
      const empty = sheet.addRow(['', label('noSales', lang)])
      empty.font = { italic: true, color: { argb: 'FF8A867F' } }
      empty.outlineLevel = 1
    }
    day.dishes.forEach((dish, index) => {
      const row = sheet.addRow([index + 1, dish.name, dish.category, dish.quantity, dish.orders, dish.revenue, dish.averagePrice])
      row.outlineLevel = 1
      row.getCell(1).alignment = { horizontal: 'center' }
      row.getCell(3).font = { color: { argb: 'FF68655F' } }
      row.getCell(6).numFmt = MONEY
      row.getCell(7).numFmt = MONEY
    })
    sheet.addRow([]).outlineLevel = 1
  })

  const total = sheet.addRow([label('total', lang), '', '', rows.totals.quantity, rows.totals.orders, rows.totals.revenue, ''])
  total.getCell(6).numFmt = MONEY
  styleTotal(sheet, total, columns)
}

// Sheet 2: dishes down, dates across, quantities in the grid.
function writeMatrixSheet(workbook, { rows, lang, periodLabel, filterLabel }) {
  const dates = rows.days.map(day => day.date)
  const fixed = 3
  const totalColumn = fixed + dates.length + 1
  const sheet = workbook.addWorksheet(label('matrix', lang), { views: [{ state: 'frozen', xSplit: fixed, ySplit: 5 }] })
  sheet.columns = [
    { width: 6 }, { width: 36 }, { width: 22 },
    ...dates.map(() => ({ width: 7 })),
    { width: 10 },
  ]
  writeTitle(sheet, { title: label('matrix', lang), lang, periodLabel, filterLabel })
  const header = sheet.getRow(5)
  header.values = [
    label('number', lang), label('dish', lang), label('category', lang),
    ...dates.map(date => `${date.slice(8, 10)}.${date.slice(5, 7)}`),
    label('total', lang),
  ]
  styleHeader(header, totalColumn)
  for (let column = fixed + 1; column <= totalColumn; column += 1) {
    header.getCell(column).alignment = { horizontal: 'center', vertical: 'middle' }
  }

  const quantityByDay = new Map(rows.days.map(day => [day.date, new Map(day.dishes.map(dish => [dish.key, dish.quantity]))]))
  rows.dishes.forEach((dish, index) => {
    const row = sheet.addRow([
      index + 1, dish.name, dish.category,
      ...dates.map(date => quantityByDay.get(date)?.get(dish.key) || null),
      dish.quantity,
    ])
    row.getCell(1).alignment = { horizontal: 'center' }
    row.getCell(totalColumn).font = { bold: true }
    row.getCell(totalColumn).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAY_FILL } }
  })
  const total = sheet.addRow([label('total', lang), '', '', ...rows.days.map(day => day.totals.quantity || null), rows.totals.quantity])
  styleTotal(sheet, total, totalColumn)
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: totalColumn } }
}

// Sheet 3: one row per dish for the whole period.
function writeSummarySheet(workbook, { rows, lang, periodLabel, filterLabel }) {
  const columns = 9
  const sheet = workbook.addWorksheet(label('summary', lang), { views: [{ state: 'frozen', ySplit: 5 }] })
  sheet.columns = [
    { width: 6 }, { width: 36 }, { width: 22 }, { width: 10 }, { width: 11 },
    { width: 20 }, { width: 19 }, { width: 9 }, { width: 18 },
  ]
  writeTitle(sheet, { title: label('summary', lang), lang, periodLabel, filterLabel })
  sheet.getRow(5).values = ['number', 'dish', 'category', 'qty', 'orders', 'revenue', 'avgPrice', 'share', 'lastSale'].map(key => label(key, lang))
  styleHeader(sheet.getRow(5), columns)

  rows.dishes.forEach((dish, index) => {
    const row = sheet.addRow([
      index + 1, dish.name, dish.category, dish.quantity, dish.orders, dish.revenue, dish.averagePrice,
      rows.totals.revenue > 0 ? dish.revenue / rows.totals.revenue : 0,
      formatDateTime(dish.lastSoldAt),
    ])
    row.getCell(1).alignment = { horizontal: 'center' }
    row.getCell(6).numFmt = MONEY
    row.getCell(7).numFmt = MONEY
    row.getCell(8).numFmt = '0.0%'
  })
  const total = sheet.addRow([label('total', lang), '', '', rows.totals.quantity, rows.totals.orders, rows.totals.revenue, '', rows.dishes.length ? 1 : 0, ''])
  total.getCell(6).numFmt = MONEY
  total.getCell(8).numFmt = '0.0%'
  styleTotal(sheet, total, columns)
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: columns } }
}

export async function createDishSalesWorkbook(ExcelJS, { rows, lang = 'en', periodLabel = '', filterLabel = '' }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Zar Kebab POS'
  workbook.created = new Date()
  const options = { rows, lang, periodLabel, filterLabel }
  writeByDaySheet(workbook, options)
  writeMatrixSheet(workbook, options)
  writeSummarySheet(workbook, options)
  return workbook
}

export async function downloadDishSalesWorkbook({ filename, ...options }) {
  if (typeof document === 'undefined') return
  const module = await import('exceljs')
  const ExcelJS = module.default || module
  const workbook = await createDishSalesWorkbook(ExcelJS, options)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
