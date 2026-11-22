import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildKitchenCheckModel,
  formatKitchenOrderNumber,
  getKitchenCheckGroup,
  getKitchenCheckGroups,
  resolveKitchenCheckTargets,
} from '../src/lib/kitchenCheck.js'

const readSource = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('cook checks shorten long database ids to a four-digit display number', () => {
  assert.equal(formatKitchenOrderNumber({ orderId: '1786802387273' }), '#7273')
  assert.equal(formatKitchenOrderNumber({ orderNumber: '#1786802387273' }), '#7273')
  assert.equal(formatKitchenOrderNumber({ orderNumber: 'TA-0173' }), '#0173')
  assert.equal(formatKitchenOrderNumber({ orderId: '173' }), '#173')
})

const item = (overrides = {}) => ({
  id: overrides.id || 'i1',
  menu_item_id: overrides.menu_item_id || 'm1',
  name: overrides.name || 'Chicken Shashlik',
  quantity: overrides.quantity ?? 1,
  status: overrides.status || 'new',
  notes: overrides.notes || '',
  ...overrides,
})

test('cook checks stay split by submitted order round', () => {
  const groups = getKitchenCheckGroups({
    id: 'same-order',
    table_name: 'Table 3',
    waiter_name: 'Waiter',
    items: [
      item({ id: 'a', order_id: 'same-order', submitted_at: '2026-06-10T10:00:00.000Z', name: 'Chicken', quantity: 2 }),
      item({ id: 'b', order_id: 'same-order', submitted_at: '2026-06-10T10:05:00.000Z', name: 'Bread', quantity: 1 }),
      item({ id: 'c', order_id: 'same-order', submitted_at: '2026-06-10T10:00:00.000Z', name: 'Tea', quantity: 3 }),
    ],
  })

  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map(group => group.roundId), ['2026-06-10T10:00:00.000Z', '2026-06-10T10:05:00.000Z'])
  assert.deepEqual(groups.map(group => group.orderId), ['same-order', 'same-order'])
  assert.deepEqual(groups[0].items.map(row => row.name), ['Chicken', 'Tea'])
  assert.deepEqual(groups[1].items.map(row => row.name), ['Bread'])
})

test('cook check selection never substitutes another round for a requested round', () => {
  const order = {
    id: 'same-order',
    items: [
      item({ id: 'a', kitchen_round_id: 'round-one', name: 'First round', quantity: 1 }),
      item({ id: 'b', kitchen_round_id: 'round-two', name: 'Second round', quantity: 2 }),
    ],
  }

  assert.equal(getKitchenCheckGroup(order, 'round-two').items[0].quantity, 2)
  assert.equal(getKitchenCheckGroup(order, 'round-missing'), null)
  assert.equal(getKitchenCheckGroup(order).roundId, 'round-one')
})

test('cook checks fall back to persisted item created_at after reload', () => {
  const groups = getKitchenCheckGroups({
    id: 'same-order',
    items: [
      item({ id: 'a', order_id: 'same-order', created_at: '2026-06-10T11:00:00.000Z', name: 'First round' }),
      item({ id: 'b', order_id: 'same-order', created_at: '2026-06-10T11:08:00.000Z', name: 'Second round' }),
    ],
  })

  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map(group => group.items[0].name), ['First round', 'Second round'])
})

test('cook checks exclude cancelled unavailable items', () => {
  const groups = getKitchenCheckGroups({
    id: 'order-1',
    items: [
      item({ id: 'a', order_id: 'order-1', name: 'Available item' }),
      item({ id: 'b', order_id: 'order-1', name: 'Unavailable item', status: 'cancelled' }),
    ],
  })

  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].items.map(row => row.name), ['Available item'])
})

test('cook check contains item notes but no prices', () => {
  const [group] = getKitchenCheckGroups({
    id: 'order-173',
    table_name: 'Table 3',
    waiter_name: 'Jasurbek',
    created_at: '2026-06-10T10:00:00.000Z',
    items: [
      item({ id: 'a', order_id: 'order-173', name: 'Молотый шашлык', quantity: 2, notes: 'No onion', price: 18000 }),
    ],
  })
  const check = buildKitchenCheckModel(group)
  const printed = JSON.stringify(check)

  assert.equal(check.title, 'ЧЕК ДЛЯ КУХНИ')
  assert.equal(check.tableName, 'СТОЛ 3')
  assert.equal(check.orderNumber, '#173')
  assert.deepEqual(check.rows.map(row => `${row.quantity} ${row.name}`), ['2 × МОЛОТЫЙ ШАШЛЫК'])
  assert.equal(check.rows[0].notes, 'No onion')
  assert.doesNotMatch(printed, /18000/)
  assert.doesNotMatch(printed, /UZS/)
})

test('cook check keeps the compact Russian kitchen slip format', () => {
  const [group] = getKitchenCheckGroups({
    id: 'order-173',
    table_name: 'Table 10',
    waiter_name: 'Jasurbek',
    created_at: '2026-06-10T04:34:00.000Z',
    items: [
      item({ id: 'a', menu_item_id: 'wings', order_id: 'order-173', name: 'Куриные крылышки', quantity: 1 }),
      item({ id: 'b', menu_item_id: 'beef', order_id: 'order-173', name: 'Шашлык из говядины', quantity: 1 }),
      item({ id: 'c', menu_item_id: 'ground', order_id: 'order-173', name: 'Молотый шашлык', quantity: 1 }),
    ],
  })
  const check = buildKitchenCheckModel(group)

  assert.equal(check.title, 'ЧЕК ДЛЯ КУХНИ')
  assert.deepEqual([check.tableName, check.orderNumber], ['СТОЛ 10', '#173'])
  assert.deepEqual([check.time, check.waiterName], ['09:34', 'Jasurbek'])
  assert.deepEqual(check.rows.map(row => `${row.quantity} ${row.name}`), [
    '1 × КУРИНЫЕ КРЫЛЫШКИ',
    '1 × ШАШЛЫК ИЗ ГОВЯДИНЫ',
    '1 × МОЛОТЫЙ ШАШЛЫК',
  ])
  assert.equal(buildKitchenCheckModel({ items: [] }).waiterName, '-')
})

test('cook check keeps option and note lines apart and marks weight rows', () => {
  const check = buildKitchenCheckModel({
    items: [
      item({ id: 'a', name: 'Plov', quantity: 1, notes: 'Острый\nБез лука' }),
      item({ id: 'b', menu_item_id: 'm2', name: 'Lamb', quantity: 0.355, sale_unit: 'kg' }),
    ],
  })

  assert.equal(check.rows[0].notes, 'Острый\nБез лука')
  assert.match(check.rows[1].quantity, / ·$/)
  assert.match(check.rows[0].quantity, / ×$/)
})

test('print-all reports rounds that were not found instead of dropping them', () => {
  const targets = [{ orderId: 'o1', roundId: 'r1' }, { orderId: 'o1', roundId: 'r2' }, { orderId: 'o2', roundId: 'r3' }]
  const known = { r1: { roundId: 'r1' }, r3: { roundId: 'r3' } }

  const partial = resolveKitchenCheckTargets(targets, target => known[target.roundId] || null)
  assert.deepEqual(partial.groups.map(group => group.roundId), ['r1', 'r3'])
  assert.equal(partial.missingCount, 1)
  assert.equal(partial.complete, false)

  const all = resolveKitchenCheckTargets(targets.slice(0, 1), target => known[target.roundId] || null)
  assert.deepEqual([all.missingCount, all.complete], [0, true])

  const none = resolveKitchenCheckTargets(targets.slice(1, 2), () => null)
  assert.deepEqual([none.groups.length, none.missingCount, none.complete], [0, 1, false])
})

test('kitchen check page: one print, readable notes, honest loading and error states', () => {
  const page = readSource('src/pages/KitchenCheckReceipt.jsx')
  const lib = readSource('src/lib/kitchenCheck.js')

  // K1/K2: the shared controller prints; `print=1` is stripped with a replace navigation.
  assert.match(page, /import \{ stripPrintParam, usePrintOnce \} from '\.\.\/lib\/usePrintOnce'/)
  assert.doesNotMatch(page, /window\.print\(/)
  assert.match(page, /navigate\(`\$\{location\.pathname\}\$\{stripPrintParam\(location\.search\)\}`, \{ replace: true \}\)/)
  assert.match(page, /onAutoPrintConsumed: consumeAutoPrint/)
  assert.match(page, /navigate\(backPath, \{ replace: true \}\)/)
  assert.match(page, /<ReceiptTopBar lang=\{lang\} onBack=\{goBack\} onPrint=\{print\} printBusy=\{printBusy\} \/>/)

  // K5: auto-print needs every requested round; a missing one blocks it and is shown.
  assert.match(page, /ready: settled && groups\.length > 0 && missingCount === 0/)
  assert.match(page, /blocked: hasMissingRounds/)
  assert.match(page, /\{hasMissingRounds && \(\s*<div role="alert" className="no-print /)
  assert.match(page, /l\.missing\(missingCount, targets\.length\)/)

  // K3/K13: notes keep their line breaks at 12px; long names cannot push a meta line off the paper.
  assert.match(page, /fontSize: '12px'[^\n]*whiteSpace: 'pre-line'/)
  assert.match(page, /const META_FLEXIBLE = \{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' \}/)
  assert.doesNotMatch(page, /fontSize: '(?:[0-9]|1[01])(?:\.\d+)?px'/)

  // K4/K6: shimmer while loading, a retryable error for a failed lookup, "not found" only when settled.
  assert.doesNotMatch(page, /Loader2|animate-spin/)
  assert.match(page, /<OperationalLoading layout="form"/)
  assert.match(page, /setRoundLookupState\('error'\)/)
  assert.match(page, /if \(loadError \|\| lookupFailed\) \{[\s\S]*?<OperationalError[\s\S]*?setLookupVersion\(version => version \+ 1\)/)
  assert.ok(page.indexOf('if (loadError || lookupFailed)') < page.indexOf('if (groups.length === 0)'))
  assert.match(page, /\[loaded, loadError, lookupVersion, menuItemMap, missingKey\]/)

  // Chrome labels exist in all three languages; the slip itself stays Russian.
  for (const key of ['loading', 'loadFailedTitle', 'loadFailedHint', 'retry', 'reload', 'notFoundTitle', 'notFoundHint', 'back', 'missing']) {
    assert.equal((page.match(new RegExp(`\\n    ${key}: `, 'g')) || []).length, 3, key)
  }
  assert.match(page, /localizeKitchenGroup\(selected, menuItemMap, 'ru'\)/)

  // K18: the unused HTML renderer is gone; the page renders the tested model.
  assert.doesNotMatch(lib, /buildKitchenCheckHtml|kitchenCheckLabels|<!doctype/)
  assert.match(page, /const check = buildKitchenCheckModel\(group\)/)
})
