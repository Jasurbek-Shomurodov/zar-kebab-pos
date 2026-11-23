// Shared look and behaviour for every Excel file the app generates, so the
// workbooks read as one family: a brand banner, one meta line, aligned and
// typed columns, totals that follow the filter, and pages that print cleanly.
// Writers stay pure (they take ExcelJS as an argument) so tests can run them.

export const COLORS = {
  brand: 'FFFF5A00',
  brandDark: 'FFC74600',
  soft: 'FFFFF1E8',
  heat: 'FFFFB37F',
  zebra: 'FFFAF9F7',
  total: 'FFEFECE9',
  muted: 'FF68655F',
  faint: 'FF8A867F',
  line: 'FFE4E1DE',
  positive: 'FF1D7A52',
  negative: 'FFC4262C',
  white: 'FFFFFFFF',
}

export const FORMATS = {
  int: '#,##0',
  money: '#,##0',
  moneyUzs: '#,##0 "UZS";[Red]-#,##0 "UZS"',
  percent: '0.0%',
  date: 'dd.mm.yyyy',
  dateTime: 'dd.mm.yyyy hh:mm',
}

const RIGHT_ALIGNED = new Set(['int', 'money', 'percent'])
const CENTERED = new Set(['index', 'date', 'dateTime'])

const WEEKDAYS_SHORT = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  uz: ['Ya', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha'],
}

const WEEKDAYS_LONG = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  uz: ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'],
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/

/** A YYYY-MM-DD date as a real Excel date (UTC midnight), or null. */
export function isoToSheetDate(iso) {
  const match = ISO_DATE.exec(String(iso || ''))
  return match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])) : null
}

/** 0 (Sunday) to 6 (Saturday) for a YYYY-MM-DD date, or null. */
export function isoWeekday(iso) {
  const date = isoToSheetDate(iso)
  return date ? date.getUTCDay() : null
}

export function weekdayName(iso, lang = 'en', { short = false } = {}) {
  const day = isoWeekday(iso)
  if (day === null) return ''
  const names = short ? WEEKDAYS_SHORT : WEEKDAYS_LONG
  return (names[lang] || names.en)[day]
}

export function isWeekend(iso) {
  const day = isoWeekday(iso)
  return day === 0 || day === 6
}

export function fillCell(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

export function fillRow(row, argb, fromColumn, toColumn) {
  for (let column = fromColumn; column <= toColumn; column += 1) fillCell(row.getCell(column), argb)
}

export function columnLetter(sheet, column) {
  return sheet.getColumn(column).letter
}

function alignmentFor(type) {
  if (RIGHT_ALIGNED.has(type)) return 'right'
  if (CENTERED.has(type)) return 'center'
  return 'left'
}

/**
 * Adds a worksheet set up for A4 printing: fitted to the page width, page
 * numbers in the footer, the workbook name on the left.
 */
export function addSheet(workbook, name, { landscape = true, gridLines = true, tabColor = COLORS.brand } = {}) {
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor }, defaultRowHeight: 18 },
    pageSetup: {
      paperSize: 9,
      orientation: landscape ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: `&L&8Zar Kebab — ${name}&R&8&P / &N` },
    views: [{ showGridLines: gridLines }],
  })
  return sheet
}

/**
 * Brand banner on row 1 and one meta line on row 2. Returns the row the
 * content should start on (row 4, after a spacer), so the frozen area stays small.
 */
export function writeBanner(sheet, { title, meta = [], lastColumn }) {
  sheet.mergeCells(1, 1, 1, lastColumn)
  const heading = sheet.getCell(1, 1)
  heading.value = `Zar Kebab — ${title}`
  heading.font = { bold: true, size: 16, color: { argb: COLORS.white } }
  heading.alignment = { vertical: 'middle', indent: 1 }
  fillCell(heading, COLORS.brand)
  sheet.getRow(1).height = 34

  const parts = meta.filter(entry => entry && entry[1])
  sheet.mergeCells(2, 1, 2, lastColumn)
  const line = sheet.getCell(2, 1)
  line.value = {
    richText: parts.flatMap(([name, value], index) => [
      { text: `${index ? '   ·   ' : ''}${name}: `, font: { color: { argb: COLORS.muted } } },
      { text: String(value), font: { bold: true } },
    ]),
  }
  let width = 0
  for (let column = 1; column <= lastColumn; column += 1) width += sheet.getColumn(column).width || 9
  const length = parts.reduce((total, [name, value]) => total + String(name).length + String(value).length + 9, 0)
  line.alignment = { vertical: 'middle', indent: 1, wrapText: true }
  fillCell(line, COLORS.soft)
  sheet.getRow(2).height = 20 * Math.max(1, Math.ceil(length / Math.max(width, 1)))
  sheet.getRow(3).height = 8
  return 4
}

/** Plain text of the meta line, for readers (and tests) that want the string. */
export function bannerMetaText(sheet) {
  const value = sheet.getCell(2, 1).value
  return value?.richText ? value.richText.map(part => part.text).join('') : String(value || '')
}

export function styleHeaderRow(row, columns, { height = 24 } = {}) {
  row.height = height
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1)
    cell.font = { bold: true, color: { argb: COLORS.white } }
    cell.alignment = { vertical: 'middle', wrapText: true, horizontal: alignmentFor(column.type) }
    fillCell(cell, column.weekend ? COLORS.brandDark : COLORS.brand)
    cell.border = { bottom: { style: 'thin', color: { argb: COLORS.brandDark } } }
  })
}

export function styleTotalRow(row, lastColumn) {
  row.height = 24
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = row.getCell(column)
    cell.font = { ...cell.font, bold: true, size: 12 }
    cell.border = { top: { style: 'medium', color: { argb: COLORS.muted } } }
    cell.alignment = { ...cell.alignment, vertical: 'middle' }
    fillCell(cell, COLORS.total)
  }
}

function styleValueCell(cell, column) {
  const format = FORMATS[column.type]
  if (format) cell.numFmt = format
  cell.alignment = { horizontal: alignmentFor(column.type), vertical: 'middle', wrapText: Boolean(column.wrap) }
  if (column.muted) cell.font = { color: { argb: COLORS.muted } }
  if (column.color) cell.font = { color: { argb: column.color } }
}

/** A SUBTOTAL that follows the filter, carrying the value already shown in the app. */
export function subtotal(sheet, column, firstRow, lastRow, result) {
  const letter = columnLetter(sheet, column)
  return { formula: `SUBTOTAL(109,${letter}${firstRow}:${letter}${lastRow})`, result }
}

/**
 * Writes a filterable table at `startRow`.
 *
 * columns: [{ header, type, value(row, index), total, width?, muted?, color?, wrap? }]
 *   type  — 'text' | 'index' | 'int' | 'money' | 'percent' | 'date' | 'dateTime'
 *   total — 'sum' (SUBTOTAL over the column), a literal, or omitted
 * options: totalLabel, empty (text shown when there are no rows),
 *   rowStyle(row, source, index) for per-row tweaks, zebra, freezeColumns.
 */
export function writeTable(sheet, { startRow, columns, rows, totalLabel = '', empty = '', rowStyle, zebra = true, freezeColumns = 0 }) {
  const lastColumn = columns.length
  const header = sheet.getRow(startRow)
  header.values = columns.map(column => column.header)
  styleHeaderRow(header, columns)

  rows.forEach((source, index) => {
    const row = sheet.getRow(startRow + 1 + index)
    columns.forEach((column, offset) => {
      const cell = row.getCell(offset + 1)
      const value = column.value(source, index)
      cell.value = value === undefined ? null : value
      styleValueCell(cell, column)
      if (zebra && index % 2 === 1) fillCell(cell, COLORS.zebra)
      cell.border = { bottom: { style: 'hair', color: { argb: COLORS.line } } }
    })
    if (rowStyle) rowStyle(row, source, index)
  })

  let nextRow = startRow + 1 + rows.length
  if (rows.length === 0 && empty) {
    sheet.mergeCells(nextRow, 1, nextRow, lastColumn)
    const cell = sheet.getCell(nextRow, 1)
    cell.value = empty
    cell.font = { italic: true, color: { argb: COLORS.faint } }
    cell.alignment = { vertical: 'middle', indent: 1 }
    nextRow += 1
  }

  const firstRow = startRow + 1
  const lastRow = startRow + rows.length
  let totalRow = null
  if (totalLabel) {
    totalRow = sheet.getRow(nextRow)
    columns.forEach((column, offset) => {
      const cell = totalRow.getCell(offset + 1)
      if (column.total === 'sum') {
        const result = rows.reduce((sum, source, index) => sum + (Number(column.value(source, index)) || 0), 0)
        cell.value = rows.length ? subtotal(sheet, offset + 1, firstRow, lastRow, result) : 0
      } else if (column.total !== undefined) {
        cell.value = column.total
      }
      styleValueCell(cell, { ...column, muted: false })
    })
    totalRow.getCell(1).value = totalLabel
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    styleTotalRow(totalRow, lastColumn)
  }

  // The filter covers the data only, so sorting never drags the total row along.
  if (rows.length) {
    sheet.autoFilter = { from: { row: startRow, column: 1 }, to: { row: lastRow, column: lastColumn } }
  }
  sheet.views = [{ ...(sheet.views?.[0] || {}), state: 'frozen', ySplit: startRow, xSplit: freezeColumns }]
  sheet.pageSetup.printTitlesRow = `${startRow}:${startRow}`
  return { headerRow: startRow, firstRow, lastRow, totalRow }
}

/** A strip of headline numbers: a small label above a large value, one card per column span. */
export function writeKpis(sheet, { row, items, lastColumn }) {
  const span = Math.max(1, Math.floor(lastColumn / items.length))
  items.forEach((item, index) => {
    const from = index * span + 1
    const to = index === items.length - 1 ? lastColumn : from + span - 1
    if (to > from) {
      sheet.mergeCells(row, from, row, to)
      sheet.mergeCells(row + 1, from, row + 1, to)
    }
    const name = sheet.getCell(row, from)
    name.value = item.label
    name.font = { size: 9, color: { argb: COLORS.muted } }
    name.alignment = { vertical: 'bottom', indent: 1 }
    const value = sheet.getCell(row + 1, from)
    value.value = item.value
    if (typeof item.value === 'number') value.numFmt = item.format || FORMATS.int
    value.font = { bold: true, size: 15, color: item.color ? { argb: item.color } : undefined }
    value.alignment = { vertical: 'top', horizontal: 'left', indent: 1 }
    for (let column = from; column <= to; column += 1) {
      fillCell(sheet.getCell(row, column), COLORS.soft)
      fillCell(sheet.getCell(row + 1, column), COLORS.soft)
      sheet.getCell(row + 1, column).border = { bottom: { style: 'medium', color: { argb: COLORS.brand } } }
    }
  })
  sheet.getRow(row).height = 18
  sheet.getRow(row + 1).height = 26
  return row + 3
}

export function createWorkbook(ExcelJS) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Zar Kebab POS'
  workbook.created = new Date()
  return workbook
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Loads ExcelJS on demand, builds the workbook and hands the file to the browser. */
export async function downloadWorkbook(filename, build) {
  if (typeof document === 'undefined') return
  const module = await import('exceljs')
  const workbook = await build(module.default || module)
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_TYPE }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Safari needs the URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
