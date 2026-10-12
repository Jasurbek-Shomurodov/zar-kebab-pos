import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEmbeddedWaiterNames, loadActiveOrderWaiterNames, getActiveWaiterNames, getTableOrderWaiterNames } from '../src/lib/activeOrderWaiters.js'

const order = { id: 'order-1', opened_by: 'user-1', opened_by_name: 'Oleg', waiter_name: 'Oleg', payment_status: 'unpaid', status: 'needs_bill' }
function client(result) {
  return { from(table) {
    assert.equal(table, 'profiles')
    return { select(fields) {
      assert.equal(fields, 'id, full_name')
      return { in(field, ids) {
        assert.equal(field, 'id')
        assert.deepEqual(ids, ['user-1'])
        return Promise.resolve(result)
      } }
    } }
  } }
}

test('active orders use current profile name without changing actor snapshots or history', async () => {
  const paid = { ...order, id: 'paid', payment_status: 'paid' }
  const cancelled = { ...order, id: 'cancelled', status: 'cancelled' }
  const settled = { ...order, id: 'settled', paid_at: '2026-09-25T10:00:00Z' }
  const result = await loadActiveOrderWaiterNames([order, paid, cancelled, settled], client({ data: [{ id: 'user-1', full_name: 'Asil' }] }))
  assert.equal(result[0].waiter_name, 'Asil')
  assert.equal(result[0].opened_by_name, 'Oleg')
  assert.equal(order.waiter_name, 'Oleg')
  assert.equal(result[1], paid)
  assert.equal(result[2], cancelled)
  assert.equal(result[3], settled)
})

test('missing, blank and unavailable profiles retain saved waiter names', async () => {
  for (const response of [{ data: [] }, { data: [{ id: 'user-1', full_name: ' ' }] }, { error: new Error('offline') }]) {
    const result = await loadActiveOrderWaiterNames([order], client(response))
    assert.equal(result[0], order)
  }
  const legacy = { ...order, opened_by: null }
  assert.deepEqual(await loadActiveOrderWaiterNames([legacy], {}), [legacy])
})

test('table labels include all distinct assigned names and omit empty labels', () => {
  assert.deepEqual(getActiveWaiterNames([{ waiter_name: 'Asil' }, { waiter_name: 'Asil' }, { waiter_name: 'Ali' }, {}]), ['Asil', 'Ali'])
})

test('table creator labels exclude empty shells, other tables and closed orders', () => {
  const active = { ...order, table_id: 'table-4', waiter_name: 'Asil', items: [{ price: 10000, quantity: 1 }] }
  const orders = [
    active,
    { ...active, id: 'empty', waiter_name: 'Old waiter', items: [], total: 41400 },
    { ...active, table_id: 'table-5', waiter_name: 'Other table' },
    { ...active, payment_status: 'paid', waiter_name: 'Paid' },
    { ...active, status: 'completed', waiter_name: 'Completed' },
    { ...active, paid_at: '2026-09-25T10:00:00Z', waiter_name: 'Settled' },
    { ...active, status: 'cancelled', waiter_name: 'Cancelled' },
    { ...active, payment_status: 'cancelled', waiter_name: 'Cancelled payment' },
  ]
  assert.deepEqual(getTableOrderWaiterNames('table-4', orders), ['Asil'])
  assert.deepEqual(getTableOrderWaiterNames('new-table', orders), [])
  assert.deepEqual(getTableOrderWaiterNames(null, orders), [])
  assert.deepEqual(getTableOrderWaiterNames('table-4', [{ ...active, waiter_name: '', opened_by_name: '' }]), [])
})


test('available table drafts use the signed-in name instead of a previous empty order owner', () => {
  const shell = { ...order, table_id: 't4', waiter_name: 'Asil', items: [], total: 41400 }
  assert.deepEqual(getTableOrderWaiterNames('t4', [shell], 'Jasurbek Shomurodov'), ['Jasurbek Shomurodov'])
  assert.deepEqual(getTableOrderWaiterNames('t4', [shell]), [])
  const active = { ...shell, items: [{ price: 10000, quantity: 1 }] }
  assert.deepEqual(getTableOrderWaiterNames('t4', [active], 'Jasurbek Shomurodov'), ['Asil'])
})


test('draft headers and fresh submissions share billable-order selection while retries retain identity', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const page = read('src/pages/WaiterOrder.jsx')
  assert.match(page, /getTableOrderWaiterNames\(tableId, state.orders, profile\?\.full_name \|\| state.user\?\.name \|\| ''\)/)
  const context = read('src/store/AppContext.jsx')
  assert.match(context, /const activeOrder = isOffPremise \? null : getActiveTableOrders\(stateRef.current.currentTableId, stateRef.current.orders\)\[0\]/)
  assert.match(context, /: activeOrder\?\.id \|\| 'o' \+ Date.now\(\)/)
  assert.match(context, /enriched = \{ \.\.\.pendingAttempt, _kitchenSubmissionRetry: true \}/)
})

test('embedded waiter names label active orders in the same request and keep saved names otherwise', () => {
  const active = { id: 'a', status: 'pending', opened_by: 'u1', opened_by_name: 'Old', opener: { full_name: ' Asil ' } }
  const hidden = { id: 'b', status: 'pending', opened_by: 'u2', opened_by_name: 'Saved', opener: null }
  const paid = { id: 'c', status: 'paid', paid_at: '2026-10-12T10:00:00Z', opened_by: 'u1', opener: { full_name: 'Asil' } }
  const result = applyEmbeddedWaiterNames([active, hidden, paid])
  assert.equal(result[0].waiter_name, 'Asil')
  assert.equal(result[1].waiter_name, undefined)
  assert.equal(result[2].waiter_name, undefined)
  assert.ok(result.every(order => !('opener' in order)))
  // Rows without the embed (older database or fallback query) use the separate lookup.
  assert.equal(applyEmbeddedWaiterNames([{ id: 'x', status: 'pending', opened_by: 'u1' }]), null)
  assert.deepEqual(applyEmbeddedWaiterNames([]), [])
})

test('active orders ask for the waiter name in the same query and fall back without it', async () => {
  const { loadActiveOrders, ACTIVE_ORDER_OPENER_SELECT } = await import('../src/lib/orderHistory.js')
  const selects = []
  const query = select => {
    const chain = {
      or: () => chain, is: () => chain, order: () => chain,
      range: () => (select.includes('opener:')
        ? Promise.resolve({ data: null, error: { code: 'PGRST200', message: 'Could not find a relationship' } })
        : Promise.resolve({ data: [{ id: 'a' }], error: null })),
    }
    return chain
  }
  const dbClient = { from: () => ({ select: select => { selects.push(select); return query(select) } }) }
  const rows = await loadActiveOrders({ dbClient })
  assert.deepEqual(rows, [{ id: 'a' }])
  assert.match(selects[0], new RegExp(ACTIVE_ORDER_OPENER_SELECT.replace(/[()!]/g, '\\$&')))
  assert.doesNotMatch(selects[1], /opener:/)
})
