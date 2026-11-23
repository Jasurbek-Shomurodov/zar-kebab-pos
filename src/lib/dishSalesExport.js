import { formatDateTime, formatLongDate } from './dateFormat.js'
import {
  COLORS,
  FORMATS,
  addSheet,
  createWorkbook,
  downloadWorkbook,
  fillCell,
  fillRow,
  isWeekend,
  styleHeaderRow,
  styleTotalRow,
  subtotal,
  weekdayName,
  writeBanner,
  writeTable,
} from './sheetKit.js'

// Excel export of directly sold dishes for the selected report period.
// Rows come from getDishSalesAnalysis (saved order prices only); set contents
// are not added, matching the All dishes view.
//
// Sheets, in reading order: the period total per dish, the same by category,
// each day with its dishes (collapsible), and a dish × day heat map.

const LABELS = {
  title:      { uz: 'Sotilgan taomlar', ru: 'Проданные блюда', en: 'Sold dishes' },
  byDay:      { uz: 'Kunlar bo‘yicha', ru: 'По дням', en: 'By day' },
  matrix:     { uz: 'Taom × kun', ru: 'Блюдо × день', en: 'Dish × day' },
  summary:    { uz: 'Davr bo‘yicha jami', ru: 'Итого за период', en: 'Period total' },
  byCategory: { uz: 'Kategoriyalar', ru: 'По категориям', en: 'By category' },
  generated:  { uz: 'Yaratilgan', ru: 'Создан', en: 'Generated' },
  dishes:     { uz: 'Taomlar', ru: 'Блюд', en: 'Dishes' },
  day:        { uz: 'Kun', ru: 'День', en: 'Day' },
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

const DAY_MS = 86_400_000

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
  const weekday = weekdayName(iso, lang)
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

  const categoryMap = new Map()
  dishes.forEach(dish => {
    if (!categoryMap.has(dish.category)) categoryMap.set(dish.category, { name: dish.category, dishes: 0, quantity: 0, revenue: 0 })
    const category = categoryMap.get(dish.category)
    category.dishes += 1
    category.quantity += dish.quantity
    category.revenue += dish.revenue
  })
  const categories = Array.from(categoryMap.values())
    .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity || a.name.localeCompare(b.name))

  return {
    dishes,
    categories,
    days,
    totals: {
      quantity: dishes.reduce((sum, row) => sum + row.quantity, 0),
      revenue: dishes.reduce((sum, row) => sum + row.revenue, 0),
      orders: analysis?.totals?.orders || 0,
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

function share(part, whole) {
  return whole > 0 ? part / whole : 0
}

// Sheet 1: one row per dish for the whole period, best sellers first.
function writeSummarySheet(workbook, options) {
  const { rows, lang } = options
  const sheet = addSheet(workbook, label('summary', lang))
  sheet.columns = [
    { width: 6 }, { width: 38 }, { width: 24 }, { width: 11 }, { width: 11 },
    { width: 21 }, { width: 20 }, { width: 10 }, { width: 18 },
  ]
  const startRow = writeBanner(sheet, { title: label('title', lang), meta: bannerMeta(options), lastColumn: 9 })
  writeTable(sheet, {
    startRow,
    freezeColumns: 2,
    totalLabel: label('total', lang),
    empty: label('noSales', lang),
    rows: rows.dishes,
    columns: [
      { header: label('number', lang), type: 'index', value: (_, index) => index + 1 },
      { header: label('dish', lang), type: 'text', value: dish => dish.name },
      { header: label('category', lang), type: 'text', muted: true, value: dish => dish.category },
      { header: label('qty', lang), type: 'int', total: 'sum', value: dish => dish.quantity },
      // Orders overlap between dishes, so the period figure is not a column sum.
      { header: label('orders', lang), type: 'int', total: rows.totals.orders, value: dish => dish.orders },
      { header: label('revenue', lang), type: 'money', total: 'sum', value: dish => dish.revenue },
      { header: label('avgPrice', lang), type: 'money', value: dish => dish.averagePrice },
      { header: label('share', lang), type: 'percent', total: 'sum', value: dish => share(dish.revenue, rows.totals.revenue) },
      { header: label('lastSale', lang), type: 'text', muted: true, value: dish => formatDateTime(dish.lastSoldAt) },
    ],
  })
}

// Sheet 2: the same sales rolled up by menu category.
function writeCategorySheet(workbook, options) {
  const { rows, lang } = options
  const sheet = addSheet(workbook, label('byCategory', lang), { landscape: false })
  sheet.columns = [{ width: 6 }, { width: 34 }, { width: 11 }, { width: 12 }, { width: 22 }, { width: 11 }]
  const startRow = writeBanner(sheet, { title: label('byCategory', lang), meta: bannerMeta(options), lastColumn: 6 })
  writeTable(sheet, {
    startRow,
    totalLabel: label('total', lang),
    empty: label('noSales', lang),
    rows: rows.categories,
    columns: [
      { header: label('number', lang), type: 'index', value: (_, index) => index + 1 },
      { header: label('category', lang), type: 'text', value: category => category.name },
      { header: label('dishes', lang), type: 'int', total: 'sum', value: category => category.dishes },
      { header: label('qty', lang), type: 'int', total: 'sum', value: category => category.quantity },
      { header: label('revenue', lang), type: 'money', total: 'sum', value: category => category.revenue },
      { header: label('share', lang), type: 'percent', total: 'sum', value: category => share(category.revenue, rows.totals.revenue) },
    ],
  })
}

// Sheet 3: each date as a band with that day's totals, its dishes folded below.
function writeByDaySheet(workbook, options) {
  const { rows, lang } = options
  const columns = [
    { header: label('number', lang), type: 'index' },
    { header: label('dish', lang), type: 'text' },
    { header: label('category', lang), type: 'text' },
    { header: label('qty', lang), type: 'int' },
    { header: label('orders', lang), type: 'int' },
    { header: label('revenue', lang), type: 'money' },
    { header: label('avgPrice', lang), type: 'money' },
  ]
  const lastColumn = columns.length
  const sheet = addSheet(workbook, label('byDay', lang), { landscape: false })
  // The +/- button sits on the day band, above the dishes it folds.
  sheet.properties.outlineLevelRow = 1
  sheet.properties.outlineProperties = { summaryBelow: false, summaryRight: false }
  sheet.columns = [{ width: 6 }, { width: 38 }, { width: 24 }, { width: 11 }, { width: 11 }, { width: 21 }, { width: 20 }]
  const headerRow = writeBanner(sheet, { title: label('byDay', lang), meta: bannerMeta(options), lastColumn })
  sheet.getRow(headerRow).values = columns.map(column => column.header)
  styleHeaderRow(sheet.getRow(headerRow), columns)
  sheet.views = [{ state: 'frozen', ySplit: headerRow }]
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`

  rows.days.forEach(day => {
    const hasSales = day.dishes.length > 0
    const band = sheet.addRow(hasSales
      ? [dayHeading(day.date, lang), '', '', day.totals.quantity, day.totals.orders, day.totals.revenue, '']
      : [`${dayHeading(day.date, lang)} — ${label('noSales', lang).toLowerCase()}`])
    sheet.mergeCells(band.number, 1, band.number, hasSales ? 3 : lastColumn)
    band.height = hasSales ? 24 : 20
    band.font = hasSales
      ? { bold: true, size: 12, color: isWeekend(day.date) ? { argb: COLORS.brandDark } : undefined }
      : { italic: true, color: { argb: COLORS.faint } }
    if (hasSales) fillRow(band, COLORS.soft, 1, lastColumn)
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = band.getCell(column)
      cell.alignment = { vertical: 'middle', horizontal: column > 3 ? 'right' : 'left', indent: column === 1 ? 1 : 0 }
      cell.border = { top: { style: 'thin', color: { argb: hasSales ? COLORS.brand : COLORS.line } } }
      if (column > 3) cell.numFmt = FORMATS.int
    }

    day.dishes.forEach((dish, index) => {
      const row = sheet.addRow([index + 1, dish.name, dish.category, dish.quantity, dish.orders, dish.revenue, dish.averagePrice])
      row.outlineLevel = 1
      row.getCell(1).alignment = { horizontal: 'center' }
      row.getCell(1).font = { color: { argb: COLORS.faint } }
      row.getCell(3).font = { color: { argb: COLORS.muted } }
      for (let column = 4; column <= lastColumn; column += 1) row.getCell(column).numFmt = FORMATS.int
      for (let column = 1; column <= lastColumn; column += 1) {
        row.getCell(column).border = { bottom: { style: 'hair', color: { argb: COLORS.line } } }
      }
    })
  })

  const total = sheet.addRow([label('total', lang), '', '', rows.totals.quantity, rows.totals.orders, rows.totals.revenue, ''])
  sheet.mergeCells(total.number, 1, total.number, 3)
  for (let column = 4; column <= lastColumn; column += 1) {
    total.getCell(column).numFmt = FORMATS.int
    total.getCell(column).alignment = { horizontal: 'right' }
  }
  styleTotalRow(total, lastColumn)
}

// Sheet 4: dishes down, dates across, quantities in the grid as a heat map.
function writeMatrixSheet(workbook, options) {
  const { rows, lang } = options
  const dates = rows.days.map(day => day.date)
  const fixed = 3
  const totalColumn = fixed + dates.length + 1
  const sheet = addSheet(workbook, label('matrix', lang))
  sheet.columns = [
    { width: 6 }, { width: 38 }, { width: 24 },
    ...dates.map(() => ({ width: 7 })),
    { width: 11 },
  ]
  const headerRow = writeBanner(sheet, { title: label('matrix', lang), meta: bannerMeta(options), lastColumn: totalColumn })
  const columns = [
    { header: label('number', lang), type: 'index' },
    { header: label('dish', lang), type: 'text' },
    { header: label('category', lang), type: 'text' },
    // Day and month on top, the weekday under it; weekends get a darker cap.
    ...dates.map(date => ({ header: `${date.slice(8, 10)}.${date.slice(5, 7)}\n${weekdayName(date, lang, { short: true })}`, type: 'date', weekend: isWeekend(date) })),
    { header: label('total', lang), type: 'int' },
  ]
  const header = sheet.getRow(headerRow)
  header.values = columns.map(column => column.header)
  styleHeaderRow(header, columns, { height: 34 })

  const firstRow = headerRow + 1
  const lastRow = headerRow + rows.dishes.length
  const quantityByDay = new Map(rows.days.map(day => [day.date, new Map(day.dishes.map(dish => [dish.key, dish.quantity]))]))
  rows.dishes.forEach((dish, index) => {
    const row = sheet.addRow([
      index + 1, dish.name, dish.category,
      ...dates.map(date => quantityByDay.get(date)?.get(dish.key) || null),
      dish.quantity,
    ])
    row.getCell(1).alignment = { horizontal: 'center' }
    row.getCell(1).font = { color: { argb: COLORS.faint } }
    row.getCell(3).font = { color: { argb: COLORS.muted } }
    for (let column = fixed + 1; column < totalColumn; column += 1) row.getCell(column).alignment = { horizontal: 'center' }
    row.getCell(totalColumn).font = { bold: true }
    row.getCell(totalColumn).numFmt = FORMATS.int
    fillCell(row.getCell(totalColumn), COLORS.soft)
    for (let column = 1; column <= totalColumn; column += 1) {
      row.getCell(column).border = { bottom: { style: 'hair', color: { argb: COLORS.line } } }
    }
  })

  const total = sheet.addRow([
    label('total', lang), '', '',
    ...rows.days.map((day, index) => (rows.dishes.length ? subtotal(sheet, fixed + 1 + index, firstRow, lastRow, day.totals.quantity) : 0)),
    rows.dishes.length ? subtotal(sheet, totalColumn, firstRow, lastRow, rows.totals.quantity) : 0,
  ])
  sheet.mergeCells(total.number, 1, total.number, 3)
  for (let column = fixed + 1; column <= totalColumn; column += 1) {
    total.getCell(column).numFmt = FORMATS.int
    total.getCell(column).alignment = { horizontal: column === totalColumn ? 'right' : 'center' }
  }
  styleTotalRow(total, totalColumn)
  for (let column = fixed + 1; column < totalColumn; column += 1) total.getCell(column).font = { bold: true, size: 10 }

  if (rows.dishes.length && dates.length) {
    sheet.addConditionalFormatting({
      ref: `${sheet.getColumn(fixed + 1).letter}${firstRow}:${sheet.getColumn(totalColumn - 1).letter}${lastRow}`,
      rules: [{
        type: 'colorScale',
        priority: 1,
        cfvo: [{ type: 'min' }, { type: 'max' }],
        color: [{ argb: COLORS.white }, { argb: COLORS.heat }],
      }],
    })
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: totalColumn } }
  }
  sheet.views = [{ state: 'frozen', xSplit: fixed, ySplit: headerRow }]
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`
  sheet.pageSetup.printTitlesColumn = 'A:C'
}

export async function createDishSalesWorkbook(ExcelJS, { rows, lang = 'en', periodLabel = '', filterLabel = '' }) {
  const workbook = createWorkbook(ExcelJS)
  const options = { rows, lang, periodLabel, filterLabel }
  writeSummarySheet(workbook, options)
  writeCategorySheet(workbook, options)
  writeByDaySheet(workbook, options)
  writeMatrixSheet(workbook, options)
  return workbook
}

export function downloadDishSalesWorkbook({ filename, ...options }) {
  return downloadWorkbook(filename, ExcelJS => createDishSalesWorkbook(ExcelJS, options))
}
