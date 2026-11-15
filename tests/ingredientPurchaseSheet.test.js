import test from 'node:test'
import assert from 'node:assert/strict'
import { averageUnitPrice, buildPurchaseSheet, groupSheetByCategory, sheetDates } from '../src/lib/ingredientPurchaseSheet.js'

test('sheetDates lists every date inclusively and rejects reversed ranges', () => {
  assert.deepEqual(sheetDates('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  assert.deepEqual(sheetDates('2026-11-02', '2026-11-01'), [])
  assert.equal(sheetDates('2026-01-01', '2026-12-31').length, 365)
})

test('buildPurchaseSheet groups lines by ingredient, unit and date with totals', () => {
  const lines = [
    { identity: 'beef', name: 'Beef', category: 'meat', unit: 'kg', date: '2026-11-01', quantity: 2, paid: 200000 },
    { identity: 'beef', name: 'Beef', category: 'meat', unit: 'kg', date: '2026-11-01', quantity: 0.5, paid: 52000 },
    { identity: 'beef', name: 'Beef', category: 'meat', unit: 'kg', date: '2026-11-03', quantity: 1, paid: 100000 },
    { identity: 'eggs', name: 'Eggs', category: 'poultry', unit: 'box', date: '2026-11-01', quantity: 1, paid: 50000 },
    { identity: 'eggs', name: 'Eggs', category: 'poultry', unit: 'piece', date: '2026-11-03', quantity: 10, paid: 15000 },
  ]
  const sheet = buildPurchaseSheet(lines)
  assert.equal(sheet.rows.length, 3)
  const beef = sheet.rows.find(row => row.key === 'beef::kg')
  assert.equal(beef.quantity, 3.5)
  assert.equal(beef.paid, 352000)
  assert.equal(beef.cells['2026-11-01'].quantity, 2.5)
  assert.equal(beef.cells['2026-11-01'].lines.length, 2)
  assert.equal(beef.cells['2026-11-02'], undefined)
  assert.deepEqual(sheet.dayTotals, { '2026-11-01': 302000, '2026-11-03': 115000 })
  assert.equal(sheet.total, 417000)
})

test('averageUnitPrice never divides by zero', () => {
  assert.equal(averageUnitPrice(105000, 2.5), 42000)
  assert.equal(averageUnitPrice(1000, 0), 0)
})

test('groupSheetByCategory sums spend per section and puts uncategorized last', () => {
  const { rows } = buildPurchaseSheet([
    { identity: 'beef', name: 'Beef', category: 'meat', unit: 'kg', date: '2026-11-01', quantity: 2, paid: 200000 },
    { identity: 'lamb', name: 'Lamb', category: 'meat', unit: 'kg', date: '2026-11-01', quantity: 1, paid: 120000 },
    { identity: 'salt', name: 'Salt', category: '', unit: 'kg', date: '2026-11-02', quantity: 1, paid: 5000 },
    { identity: 'onion', name: 'Onion', category: 'vegetables', unit: 'kg', date: '2026-11-02', quantity: 3, paid: 15000 },
  ])
  const sections = groupSheetByCategory(rows, category => ({ meat: 'Meat', vegetables: 'Vegetables', uncategorized: 'Other' })[category])
  assert.deepEqual(sections.map(section => section.category), ['meat', 'vegetables', 'uncategorized'])
  assert.equal(sections[0].rows.length, 2)
  assert.deepEqual(sections[0].days, { '2026-11-01': 320000 })
  assert.equal(sections[0].paid, 320000)
})
