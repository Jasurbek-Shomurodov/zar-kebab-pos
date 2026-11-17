import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  collectPagedRows,
  collectPagedRowsConcurrent,
  getOrderHistoryRangeBounds,
  mergeOrderHistory,
  mergePaidOrderHistory,
} from '../src/lib/orderHistory.js'

test('order history range uses inclusive Tashkent dates and an exclusive next-day bound', () => {
  assert.deepEqual(getOrderHistoryRangeBounds('2025-12-01', '2025-12-31'), {
    dateFrom: '2025-12-01',
    dateTo: '2025-12-31',
    instantFrom: '2025-12-01T00:00:00+05:00',
    instantToExclusive: '2026-01-01T00:00:00+05:00',
  })
})

test('full report history merges paid, unpaid, and cancelled rows for the selected range', () => {
  const history = [
    { id: 'paid', payment_status: 'paid', paid_at: '2025-12-03T10:00:00+05:00' },
    { id: 'cancelled', status: 'cancelled', created_at: '2025-12-04T10:00:00+05:00' },
    { id: 'outside', status: 'cancelled', created_at: '2026-01-01T10:00:00+05:00' },
  ]
  const live = [
    { id: 'paid', payment_status: 'paid', paid_at: '2025-12-03T10:00:00+05:00', total: 250 },
    { id: 'unpaid', payment_status: 'unpaid', created_at: '2025-12-05T10:00:00+05:00' },
  ]

  const merged = mergeOrderHistory(history, live, '2025-12-01', '2025-12-31')
  assert.deepEqual([...merged].sort((a, b) => a.id.localeCompare(b.id)).map(row => [row.id, row.total || 0]), [
    ['cancelled', 0],
    ['paid', 250],
    ['unpaid', 0],
  ])
})

test('fresh historical payment rows are not replaced by stale operational payment data', () => {
  const history = [{
    id: 'paid',
    payment_status: 'paid',
    payment_method: 'mixed',
    paid_at: '2025-12-03T10:00:00+05:00',
    payments: [
      { id: 'p1', method: 'cash', amount: 55000 },
      { id: 'p2', method: 'card', amount: 71500 },
    ],
  }]
  const live = [{
    id: 'paid',
    payment_status: 'paid',
    payment_method: 'cash',
    paid_at: '2025-12-03T10:00:00+05:00',
    total: 126500,
    payments: [
      { id: 'p1', method: 'cash', amount: 55000 },
      { id: 'p2', method: 'cash', amount: 71500 },
    ],
  }]

  const [merged] = mergeOrderHistory(history, live, '2025-12-01', '2025-12-31')
  assert.equal(merged.total, 126500)
  assert.equal(merged.payment_method, 'mixed')
  assert.deepEqual(merged.payments.map(row => [row.method, row.amount]), [
    ['cash', 55000],
    ['card', 71500],
  ])
})

test('order history pagination reads every page without truncating at one response', async () => {
  const source = Array.from({ length: 1_205 }, (_, index) => ({ id: `order-${index}` }))
  const ranges = []
  const rows = await collectPagedRows(async (from, to) => {
    ranges.push([from, to])
    return { data: source.slice(from, to + 1), error: null }
  }, 500)

  assert.equal(rows.length, 1_205)
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]])
})

test('active order query explicitly includes legacy null payment and status values', () => {
  const source = readFileSync(new URL('../src/lib/orderHistory.js', import.meta.url), 'utf8')
  const activeQuery = source.slice(
    source.indexOf('async function queryActiveOrderPages'),
    source.indexOf('export async function loadPaidOrdersForRange'),
  )
  assert.match(source, /payment_status\.neq\.paid,payment_status\.is\.null/)
  assert.match(source, /status\.not\.in\.\(paid,completed,cancelled\),status\.is\.null/)
  assert.match(source, /export async function loadActiveOrders/)
  assert.doesNotMatch(activeQuery, /\.gte\(|\.lt\(/)
})

test('live paid orders replace fetched history without admitting unpaid or out-of-range rows', () => {
  const history = [
    { id: 'same', payment_status: 'paid', paid_at: '2026-07-10T10:00:00+05:00', total: 100 },
    { id: 'history', payment_status: 'paid', paid_at: '2026-07-11T10:00:00+05:00', total: 200 },
  ]
  const live = [
    { id: 'same', payment_status: 'paid', paid_at: '2026-07-10T10:00:00+05:00', total: 150 },
    { id: 'new', payment_status: 'paid', paid_at: '2026-07-12T10:00:00+05:00', total: 300 },
    { id: 'unpaid', payment_status: 'unpaid', created_at: '2026-07-12T10:00:00+05:00', total: 900 },
    { id: 'outside', payment_status: 'paid', paid_at: '2026-06-30T10:00:00+05:00', total: 700 },
  ]

  const merged = mergePaidOrderHistory(history, live, '2026-07-01', '2026-07-31')
  assert.deepEqual([...merged].sort((a, b) => a.id.localeCompare(b.id)).map(row => [row.id, row.total]), [
    ['history', 200],
    ['new', 300],
    ['same', 150],
  ])
})

test('concurrent order paging reads every page, reads each batch then stops at the first short page, and keeps order', async () => {
  const source = Array.from({ length: 2_305 }, (_, index) => ({ id: `order-${index}` }))
  const calls = []
  const rows = await collectPagedRowsConcurrent(async (from, to) => {
    calls.push(from)
    return { data: source.slice(from, to + 1), error: null }
  }, 500, 4)

  assert.equal(rows.length, 2_305)
  assert.deepEqual(rows.map(row => row.id), source.map(row => row.id))
  assert.deepEqual([...new Set(calls)].sort((a, b) => a - b).slice(0, 6), [0, 500, 1000, 1500, 2000, 2500])
})

test('order range load runs one unpaid-timestamp query instead of an overlapping legacy query', () => {
  const source = readFileSync(new URL('../src/lib/orderHistory.js', import.meta.url), 'utf8')
  const loader = source.slice(
    source.indexOf('export async function loadOrdersForRange'),
    source.indexOf('export function mergeOrderHistory'),
  )
  assert.doesNotMatch(loader, /queryPaidOrderPages/)
  assert.match(loader, /queryPaidTimestampPages/)
  assert.match(loader, /queryOrdersWithoutPaidTimestamp/)
})
