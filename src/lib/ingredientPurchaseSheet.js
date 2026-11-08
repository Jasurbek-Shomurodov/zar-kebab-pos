// Pivots purchase lines from get_ingredient_purchase_sheet (migration 279)
// into a sheet: one row per ingredient and unit, one column per date.

/** Every Tashkent date from `from` to `to`, inclusive, as YYYY-MM-DD. */
export function sheetDates(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  const dates = []
  for (let time = start; time <= end && dates.length < 366; time += 86400000) {
    dates.push(new Date(time).toISOString().slice(0, 10))
  }
  return dates
}

const rowKey = line => `${line.identity}::${line.unit}`

/**
 * Groups lines by ingredient and unit. Each row has per-date cells
 * ({ quantity, paid, lines }) and period totals; `dayTotals` sums paid per date.
 */
export function buildPurchaseSheet(lines = []) {
  const rows = new Map()
  const dayTotals = {}
  let total = 0
  for (const line of lines) {
    const key = rowKey(line)
    let row = rows.get(key)
    if (!row) {
      row = { key, identity: line.identity, name: line.name, category: line.category, unit: line.unit, quantity: 0, paid: 0, cells: {} }
      rows.set(key, row)
    }
    const paid = Number(line.paid) || 0
    const quantity = Number(line.quantity) || 0
    const cell = row.cells[line.date] || (row.cells[line.date] = { quantity: 0, paid: 0, lines: [] })
    cell.quantity += quantity
    cell.paid += paid
    cell.lines.push(line)
    row.quantity += quantity
    row.paid += paid
    dayTotals[line.date] = (dayTotals[line.date] || 0) + paid
    total += paid
  }
  return { rows: [...rows.values()], dayTotals, total }
}

/** Average price per unit; 0 when nothing was bought. */
export function averageUnitPrice(paid, quantity) {
  const amount = Number(quantity) || 0
  return amount > 0 ? Math.round((Number(paid) || 0) / amount) : 0
}
