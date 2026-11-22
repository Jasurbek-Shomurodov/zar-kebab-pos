import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AUTO_PRINT_DELAY_MS,
  createPrintController,
  getAutoPrintAction,
  stripPrintParam,
} from '../src/lib/usePrintOnce.js'

const readSource = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// A browser stand-in: manual timers, a counted print() and a fireable `afterprint`.
function fakeBrowser({ printThrows = false } = {}) {
  const timers = new Map()
  const busyLog = []
  let nextId = 1
  let listener = null
  const browser = {
    prints: 0,
    busyLog,
    listening: () => listener != null,
    pendingTimers: () => timers.size,
    runTimers() {
      for (const [id, fn] of [...timers]) {
        timers.delete(id)
        fn()
      }
    },
    afterPrint: () => listener?.(),
  }
  browser.controller = createPrintController({
    print: () => {
      browser.prints += 1
      if (printThrows) throw new Error('print blocked')
    },
    setTimer: fn => {
      timers.set(nextId, fn)
      return nextId++
    },
    clearTimer: id => timers.delete(id),
    onAfterPrint: fn => {
      listener = fn
      return () => { listener = null }
    },
    onBusyChange: value => busyLog.push(value),
  })
  return browser
}

test('a second print request is refused until afterprint', () => {
  const browser = fakeBrowser()
  const { controller } = browser

  assert.equal(controller.request({ delay: 300 }), true)
  assert.equal(controller.isBusy(), true)
  // Double tap, or a tap while the ?print=1 print is still scheduled.
  assert.equal(controller.request({ delay: 300 }), false)
  assert.equal(browser.prints, 0)

  browser.runTimers() // the scheduled print reaches the printer
  assert.equal(browser.prints, 1)
  assert.equal(controller.request(), false, 'still printing: no second ticket')

  browser.afterPrint()
  assert.equal(controller.isBusy(), false)
  assert.deepEqual(browser.busyLog, [true, false])

  assert.equal(controller.request(), true, 'a deliberate reprint after the first one finished')
  browser.runTimers()
  assert.equal(browser.prints, 2)
})

test('onStart runs once, right before the print it belongs to', () => {
  const browser = fakeBrowser()
  const order = []
  browser.controller.request({ onStart: () => order.push(`start:${browser.prints}`) })
  browser.controller.request({ onStart: () => order.push('second') })
  browser.runTimers()
  assert.deepEqual(order, ['start:0'])
  assert.equal(browser.prints, 1)
})

test('the lock opens by itself when the browser never reports afterprint', () => {
  const browser = fakeBrowser()
  browser.controller.request()
  browser.runTimers() // print() returned, the fallback timer is now waiting
  assert.equal(browser.controller.isBusy(), true)
  assert.equal(browser.pendingTimers(), 1)
  browser.runTimers() // fallback
  assert.equal(browser.controller.isBusy(), false)
})

test('an afterprint that is not ours, a failed print and unmount all leave a clean state', () => {
  const scheduled = fakeBrowser()
  scheduled.controller.request({ delay: 600 })
  scheduled.afterPrint() // the user pressed Ctrl+P meanwhile
  assert.equal(scheduled.controller.isBusy(), true)
  assert.equal(scheduled.controller.cancelPending(), true)
  assert.equal(scheduled.controller.isBusy(), false)
  scheduled.runTimers()
  assert.equal(scheduled.prints, 0)
  assert.equal(scheduled.controller.cancelPending(), false)

  const failing = fakeBrowser({ printThrows: true })
  failing.controller.request()
  assert.throws(() => failing.runTimers(), /print blocked/)
  assert.equal(failing.controller.isBusy(), false)

  const unmounted = fakeBrowser()
  unmounted.controller.request({ delay: 600 })
  unmounted.controller.dispose()
  unmounted.runTimers()
  assert.equal(unmounted.prints, 0)
  assert.equal(unmounted.listening(), false)
  assert.equal(unmounted.controller.request(), false)
  assert.deepEqual(unmounted.busyLog, [true, false])
})

test('?print=1 prints once, only when the ticket is complete', () => {
  assert.equal(getAutoPrintAction({ autoPrint: false, ready: true }), 'none')
  assert.equal(getAutoPrintAction({ autoPrint: true, ready: false }), 'wait')
  assert.equal(getAutoPrintAction({ autoPrint: true, ready: true, busy: true }), 'wait')
  assert.equal(getAutoPrintAction({ autoPrint: true, ready: true }), 'print')
  assert.equal(getAutoPrintAction({ autoPrint: true, ready: true, fired: true }), 'none')
  // A missing round: do not print, but use the flag up so a reload cannot print later.
  assert.equal(getAutoPrintAction({ autoPrint: true, ready: false, blocked: true }), 'consume')
  assert.equal(getAutoPrintAction({ autoPrint: true, ready: false, blocked: true, fired: true }), 'none')
  assert.ok(AUTO_PRINT_DELAY_MS >= 300)
})

test('print is stripped from the URL and everything else is kept', () => {
  assert.equal(stripPrintParam('?print=1'), '')
  assert.equal(stripPrintParam('?round=r1&order=o1&print=1&round=r2&back=%2Fwaiter%2Ftables'), '?round=r1&order=o1&round=r2&back=%2Fwaiter%2Ftables')
  assert.equal(stripPrintParam('?back=%2Fcashier'), '?back=%2Fcashier')
  assert.equal(stripPrintParam(''), '')
  assert.equal(stripPrintParam(undefined), '')
})

test('receipt page prints through the shared controller and strips print=1', () => {
  const receipt = readSource('src/pages/Receipt.jsx')
  const hook = readSource('src/lib/usePrintOnce.js')

  assert.doesNotMatch(receipt, /window\.print\(|setTimeout\(/)
  assert.match(receipt, /usePrintOnce\(\{ autoPrint, ready: true, onAutoPrintConsumed: consumeAutoPrint \}\)/)
  assert.match(receipt, /navigate\(`\$\{location\.pathname\}\$\{stripPrintParam\(location\.search\)\}`, \{ replace: true \}\)/)
  assert.equal((hook.match(/window\.print\(\)/g) || []).length, 1)
  assert.match(hook, /window\.addEventListener\('afterprint', listener\)/)
})

test('receipt and kitchen check share one top bar with 44px translated controls', () => {
  const bar = readSource('src/components/ReceiptTopBar.jsx')
  const receipt = readSource('src/pages/Receipt.jsx')
  const kitchen = readSource('src/pages/KitchenCheckReceipt.jsx')

  assert.match(receipt, /<ReceiptTopBar/)
  assert.match(kitchen, /<ReceiptTopBar/)
  for (const key of ['back', 'print', 'printing', 'language']) {
    assert.equal((bar.match(new RegExp(`\\b${key}: '`, 'g')) || []).length, 3, key)
  }
  assert.match(bar, /className="no-print sticky top-0 z-sticky flex flex-wrap /)
  assert.match(bar, /disabled=\{printBusy \|\| printDisabled\}/)
  assert.equal((bar.match(/type="button"/g) || []).length, 3)
  assert.equal((bar.match(/min-h-11|!h-11 min-w-11/g) || []).length, 3)
  assert.doesNotMatch(bar, /uppercase|tracking-|text-\[1[01]px\]|bg-\[#ff5a00\]/)
  // No literal English chrome left on the receipt page.
  assert.doesNotMatch(receipt, />\s*Back\s*</)
})

test('receipt: app data status, shared money format, real restaurant name, 10px print floor', () => {
  const receipt = readSource('src/pages/Receipt.jsx')
  const tableReceipt = receipt.slice(receipt.indexOf('export function TableReceipt()'), receipt.indexOf('export default function Receipt()'))

  // K8: no "Order not found" before the orders have loaded; a failed load is retryable.
  assert.match(tableReceipt, /const \{ loaded, loadError, retry: retryPOSLoad \} = useAppDataStatus\(\)/)
  assert.ok(tableReceipt.indexOf('if (!loaded) return <OperationalLoading layout="form"') > 0)
  assert.ok(tableReceipt.indexOf('if (!loaded) return') < tableReceipt.indexOf('if (loadError)'))
  assert.ok(tableReceipt.indexOf('if (loadError)') < tableReceipt.indexOf('if (!data) return <NotFound'))
  assert.match(tableReceipt, /<OperationalError[\s\S]*?onAction=/)

  // K15/K16: shared formatter and shared line total; amounts never wrap.
  assert.match(receipt, /import \{ formatCurrency, formatGroupedNumber \} from '\.\.\/lib\/formatCurrency'/)
  assert.doesNotMatch(receipt, /Intl\.NumberFormat|toLocaleString|toFixed/)
  assert.match(receipt, /fmtNum\(getOrderItemLineTotal\(item\)\)/)
  assert.match(receipt, /<span style=\{\{ flexShrink: 0, whiteSpace: 'nowrap' \}\}>\{fmtUZS\(total\)\}<\/span>/)

  // K17/K19/K20/K21
  assert.match(receipt, /const brandName = String\(restaurantName \|\| ''\)\.trim\(\) \|\| 'ZarKebab'/)
  assert.match(receipt, /\{brandName\}/)
  assert.doesNotMatch(receipt, /@import/)
  assert.doesNotMatch(receipt, /fontSize: '\d(?:\.\d+)?px'/)
  assert.doesNotMatch(receipt, /🧾|←/)
  // Raw backend text never reaches the screen.
  assert.match(receipt, /setLookupState\(\{ loading: false, error: 'load_failed' \}\)/)
  for (const key of ['loadFailedTitle', 'loadFailedHint', 'retry', 'reload']) {
    assert.equal((receipt.match(new RegExp(`\\n    ${key}: `, 'g')) || []).length, 3, key)
  }
})

test('receipt money keeps the digits it printed before', async () => {
  const { formatCurrency, formatGroupedNumber } = await import('../src/lib/formatCurrency.js')
  const { getOrderItemLineTotal } = await import('../src/lib/analytics.js')
  for (const value of [0, 950, 18000, 29997.5, 1250000, 12345678]) {
    const before = new Intl.NumberFormat('ru-RU').format(Math.round(value))
    assert.equal(formatGroupedNumber(Math.round(value)), before)
    assert.equal(formatCurrency(Math.round(value)), `${before} UZS`)
  }
  for (const line of [{ price: 84500, quantity: 0.355 }, { unit_price: 18000, quantity: 2 }, { price: 5000 }]) {
    const unit = Math.max(0, Math.round(Number(line.unit_price ?? line.price ?? 0)))
    assert.equal(getOrderItemLineTotal(line), Math.round(unit * (Number(line.quantity) || 1)))
  }
})
