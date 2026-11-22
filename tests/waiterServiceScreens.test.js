import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CART_UNDO_MS, canDecreaseCartQuantity, restoreCartItem } from '../src/lib/cartUndo.js'
import { getOrderTotal } from '../src/lib/analytics.js'
import { getConfiguredServiceRatePct } from '../src/lib/serviceRates.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('a removed cart line is restored where it was, once', () => {
  const a = { cart_item_key: 'a', menu_item_id: 'm1', quantity: 2, notes: 'no onion' }
  const b = { cart_item_key: 'b', menu_item_id: 'm2', quantity: 1 }
  const c = { menu_item_id: 'm3', quantity: 1 }

  assert.deepEqual(restoreCartItem([a, c], b, 1), [a, b, c])
  assert.deepEqual(restoreCartItem([], a, 3), [a])
  assert.deepEqual(restoreCartItem([b], a, -4), [a, b])
  assert.deepEqual(restoreCartItem([a, b], c, undefined), [a, b, c])
  // Already back (added again from the menu): never duplicated.
  const cart = [a, b]
  assert.equal(restoreCartItem(cart, { ...b, quantity: 5 }, 0), cart)
  assert.equal(restoreCartItem(cart, null, 0), cart)
  assert.notEqual(restoreCartItem([a], b, 1)[1], b, 'the restored line is a copy')
  assert.ok(CART_UNDO_MS >= 4000 && CART_UNDO_MS <= 8000)
})

test('the cart minus button stops at one step', () => {
  assert.equal(canDecreaseCartQuantity(2, 1), true)
  assert.equal(canDecreaseCartQuantity(1, 1), false)
  assert.equal(canDecreaseCartQuantity(0.2, 0.1), true)
  assert.equal(canDecreaseCartQuantity(0.1, 0.1), false)
  assert.equal(canDecreaseCartQuantity('x', 1), false)
})

test('the cart drawer keeps one scroll area with the title and total + Send pinned', () => {
  const cart = read('src/components/CartPanel.jsx')
  const order = read('src/pages/WaiterOrder.jsx')

  // Exactly one scroller in the panel; the order panel and the cart lines live inside it.
  assert.equal((cart.match(/overflow-y-auto overscroll-contain/g) || []).length, 1)
  assert.match(cart, /\{beforeItems && <div className="-mx-3">\{beforeItems\}<\/div>\}/)
  const scrollStart = cart.indexOf('overflow-y-auto overscroll-contain')
  const footerStart = cart.indexOf('Total + Send (pinned)')
  assert.ok(scrollStart > 0 && footerStart > scrollStart)
  const scrollArea = cart.slice(scrollStart, footerStart)
  assert.match(scrollArea, /ORDER_TYPES\.map/)
  assert.match(scrollArea, /<CartItemRow/)
  assert.match(scrollArea, /reviewWarning &&/)
  const footer = cart.slice(footerStart)
  assert.match(footer, /flex-shrink-0 border-t/)
  assert.match(footer, /formatCurrency\(total\)/)
  assert.match(footer, /onClick=\{guestMode \? onGuestFinish : handleSend\}/)
  assert.doesNotMatch(order, /max-h-\[48dvh\]/)
  // The drawer is a modal surface: dialog semantics, Escape and focus from the shared hook.
  assert.match(order, /import \{ useModalKeyboard \} from '\.\.\/lib\/modalKeyboard'/)
  assert.match(order, /role="dialog"\s+aria-modal="true"[\s\S]*onKeyDown=\{handleCartKeyDown\}/)
  assert.match(order, /onEscape: \(\) => closeCart\(\)/)
})

test('removing a cart line offers an undo and never happens from the minus button', () => {
  const cart = read('src/components/CartPanel.jsx')
  assert.match(cart, /onClick=\{\(\) => onRemove\?\.\(item\)\}/)
  assert.match(cart, /dispatch\(\{ type: 'REPLACE_CART', payload: restoreCartItem\(cart, removedLine\.item, removedLine\.index\) \}\)/)
  assert.match(cart, /window\.setTimeout\(\(\) => setRemovedLine\(null\), CART_UNDO_MS\)/)
  assert.match(cart, /disabled=\{!canDecrease \|\| locked\}/)
  const decrement = cart.slice(cart.indexOf('function decrement()'), cart.indexOf('function increment()'))
  assert.doesNotMatch(decrement, /REMOVE_FROM_CART/)
})

test('waiter service controls keep a 44px target and readable ink', () => {
  const sources = {
    cart: read('src/components/CartPanel.jsx'),
    order: read('src/pages/WaiterOrder.jsx'),
    tables: read('src/pages/WaiterTables.jsx'),
    guest: read('src/components/GuestModeUI.jsx'),
    search: read('src/components/AnimatedSearch.jsx'),
  }
  for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /text-\[#9CA3AF\](?! pointer-events-none)(?!")|text-gray-400|placeholder-\[#9CA3AF\]/, `${name}: failing grey text`)
    assert.doesNotMatch(source, /text-\[(8|9|10|11)(\.\d+)?px\]/, `${name}: text under 12px`)
    assert.doesNotMatch(source, /font-black/, `${name}: font-black`)
  }
  for (const name of ['cart', 'order', 'tables', 'guest']) {
    assert.doesNotMatch(sources[name], /<button[^>]*className="[^"]*\bh-(7|8|9|10) w-(7|8|9|10)\b/, `${name}: small square button`)
    assert.doesNotMatch(sources[name], /bg-\[#ff5a00\] (px-\S+ )?text-(\[\S+\] )?(font-\S+ )?text-white|bg-\[#ff5a00\] text-white/, `${name}: white label on brand orange`)
  }
  // Zero-count filter chips stay readable: no opacity on the text.
  assert.doesNotMatch(sources.tables, /opacity-45/)
  // The status filter wraps instead of hiding chips off-screen.
  assert.match(sources.tables, /className="ws-segmented !flex flex-wrap !overflow-visible"/)
})

test('kitchen-check print buttons are really disabled while the order is locked', () => {
  const order = read('src/pages/WaiterOrder.jsx')
  assert.match(order, /printDisabled=\{orderLocked\}/)
  assert.equal((order.match(/disabled=\{printDisabled\}\s+title=\{printLockedTitle\}/g) || []).length, 2)
  assert.doesNotMatch(order, /onPrintKitchenCheck=\{orderLocked \? \(\) => \{\}/)
  for (const lang of ['uz', 'ru', 'en']) assert.match(order, new RegExp(`${lang}: \\{[\\s\\S]*?printLocked: '`))
})

test('waiter tables: no dead action, guarded writes, two-step reservation cancel, load states', () => {
  const tables = read('src/pages/WaiterTables.jsx')
  assert.doesNotMatch(tables, /viewKitchen/)
  assert.doesNotMatch(tables, /if \(status === 'preparing'\) return/)
  assert.match(tables, /const \{ loaded, loadError, retry: retryPOSLoad \} = useAppDataStatus\(\)/)
  assert.match(tables, /<OperationalError[\s\S]*?<OperationalLoading layout="cards"/)
  assert.match(tables, /const \[confirmingId, setConfirmingId\] = useState\(null\)/)
  assert.match(tables, /onClick=\{\(\) => setConfirmingId\(table\.id\)\}/)
  assert.match(tables, /const cancelled = await onCancel\(table\)/)
  assert.match(tables, /runTableWrite\(table, \(\) => dispatch\(\{ type: 'UPDATE_TABLE', payload: clearReservationPatch\(table\) \}\)\)/)
  assert.match(tables, /runTableWrite\(table, \(\) => dispatch\(\{ type: 'CONFIRM_ORDER_DELIVERED', payload: table\.id \}\)\)/)
  // No interactive element nested in another: cards are not role="button" containers any more.
  assert.doesNotMatch(tables, /role=\{canEdit \? 'button' : undefined\}/)
  // Status colours come from the shared map.
  assert.match(tables, /import \{ STATUS_TONE \} from '\.\.\/components\/StatusBadge'/)
  assert.doesNotMatch(tables, /const STATUS_CFG = /)
})

test('waiter table tiles total with the configured service rate when an order stores none', () => {
  const order = { order_type: 'dine_in', price_mode: 'regular', items: [{ price: 100000, quantity: 1, status: 'served' }] }
  const settings = { serviceRate: 10, touristServiceRate: 25 }

  assert.equal(getOrderTotal(order, getConfiguredServiceRatePct(settings, order.price_mode)), 110000)
  assert.equal(getOrderTotal({ ...order, price_mode: 'tourist' }, getConfiguredServiceRatePct(settings, 'tourist')), 125000)
  // The helper's own default is 20%, which is what the tile showed before.
  assert.equal(getOrderTotal(order), 120000)
  // A stored rate on the order always wins, so history never changes.
  assert.equal(getOrderTotal({ ...order, service_rate_pct: 15 }, getConfiguredServiceRatePct(settings, order.price_mode)), 115000)
})

test('guest dialogs use the shared dialog and modal keyboard helpers', () => {
  const guest = read('src/components/GuestModeUI.jsx')
  assert.match(guest, /import \{ focusWithoutScrolling, useModalKeyboard \} from '\.\.\/lib\/modalKeyboard'/)
  assert.doesNotMatch(guest, /function useModalKeyboard|const MODAL_FOCUSABLE_SELECTOR/)
  assert.equal((guest.match(/<WorkspaceDialog\n/g) || []).length, 2)
  // Price tiles show the words; the letter is only the shorthand beside them.
  assert.match(guest, /<span className="min-w-0 flex-1 text-\[15px\] font-semibold leading-tight">\{choice\.label\}<\/span>/)
})
