import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Source guards for the cashier money screens (UI audit, group B). JSX cannot be imported in
// node:test, so each rule is asserted on the source, as tests/sourceGuards.*.test.js do.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const bill = read('src/pages/CashierBill.jsx')
const tables = read('src/pages/CashierTables.jsx')
const salary = read('src/components/SalaryOrderPayment.jsx')
const split = read('src/components/PaidPaymentSplitEditor.jsx')
const nameSearch = read('src/components/CashierLoyaltyNameSearch.jsx')
const loyalty = read('src/pages/AdminLoyalty.jsx')
const moneyScreens = { bill, tables, salary, split, nameSearch, loyalty }

test('salary deduction dialog is the shared dialog: pinned title and buttons, scrolling body, Escape', () => {
  assert.match(salary, /import WorkspaceDialog from '\.\/WorkspaceDialog'/)
  assert.match(salary, /<WorkspaceDialog\s+title=\{copy\.title\}\s+onClose=\{close\}[\s\S]*busy=\{saving\}[\s\S]*footer=\{/)
  assert.doesNotMatch(salary, /fixed inset-0|role="dialog"/)
  // Reading the employee list never says "Saving": the two waits are separate states.
  assert.match(salary, /const \[loading, setLoading\] = useState\(false\)/)
  assert.match(salary, /const \[saving, setSaving\] = useState\(false\)/)
  assert.match(salary, /\{loading && <Shimmer/)
  assert.match(salary, /\{saving \? copy\.saving : result \|\| request\.current \? copy\.retry : copy\.confirm\}/)
  assert.match(salary, /error === 'loadFailed' && \(\s*<button type="button" onClick=\{loadEmployees\}/)
  for (const lang of ['en', 'ru', 'uz']) {
    const row = salary.slice(salary.indexOf(`  ${lang}: {`), salary.indexOf('\n', salary.indexOf(`  ${lang}: {`)))
    assert.match(row, /loadFailed: '/, `${lang} has the load error`)
    assert.doesNotMatch(row, /loading: '/, `${lang} has no loading text`)
  }
})

test('a split-payment amount keeps the full row width, so it is never clipped on a 320px phone', () => {
  const row = bill.slice(bill.indexOf('{splitPayments.map((row, index) => {'), bill.indexOf('{lbl.quickAmt}'))
  // The method label is on its own line above the field; no fixed label column beside it.
  assert.doesNotMatch(row, /min-w-\[104px\]/)
  assert.match(row, /<div className="relative mt-1\.5">\s*<input/)
  assert.match(row, /className="ws-input w-full !pr-12 font-black tabular-nums"/)
  assert.match(row, /aria-label=\{`\$\{rowName\}: \$\{lbl\.receivedAmt\}`\}/)
  assert.match(row, /aria-label=\{`\$\{lbl\.removePayment\}: \$\{rowName\}`\}/)
})

test('bill item rows wrap by their own width and print whole, unbroken amounts', () => {
  const rows = bill.slice(bill.indexOf('{/* Item rows'), bill.indexOf('{/* Counter Items */}'))
  assert.doesNotMatch(rows, /grid-cols-12|col-span-/)
  assert.match(rows, /className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-4"/)
  assert.match(rows, /const lineTotal = getOrderItemLineTotal\(item\)/)
  assert.equal((rows.match(/whitespace-nowrap[^"]*tabular-nums/g) || []).length >= 2, true)
  assert.match(tables, /const lineTotal = getOrderItemLineTotal\(item\)/)
  for (const source of [bill, tables]) assert.doesNotMatch(source, /getOrderItemUnitPrice\(item\) \* |unitPrice \* \(Number/)
  // Quantity and remove controls are named, 44px on touch, and the dead "more" button is gone.
  assert.match(rows, /aria-label=\{`\$\{lbl\.decreaseQty\}: \$\{displayName\}`\}/)
  assert.match(rows, /aria-label=\{`\$\{lbl\.removeItem\}: \$\{displayName\}`\}/)
  assert.doesNotMatch(bill, /MoreHorizontal/)
  assert.doesNotMatch(bill, /\bh-7 w-7 items-center justify-center rounded-lg bg-white|flex h-8 w-8 items-center/)
})

test('cashier colours come from classes the dark theme can recolour, with readable inks', () => {
  for (const [name, source] of Object.entries(moneyScreens)) {
    assert.doesNotMatch(source, /style=\{\{ color/, `${name}: no inline colour`)
    assert.doesNotMatch(source, /text-\[#9CA3AF\]|text-\[#D1D5DB\]|text-gray-400|text-\[#16A34A\]/, `${name}: no failing grey or green ink`)
    assert.doesNotMatch(source, /bg-\[#ff5a00\][^"`]*text-white|text-white[^"`]*bg-\[#ff5a00\]/, `${name}: no white label on brand orange`)
    assert.doesNotMatch(source, /text-\[(8|9|10|11)px\]/, `${name}: nothing under 12px`)
    assert.doesNotMatch(source, /uppercase tracking-/, `${name}: no tracked capitals`)
  }
  assert.match(tables, /key: 'cash',\s+icon: Banknote,\s+tone: 'ws-tone-positive'/)
  assert.match(tables, /className=\{`ws-badge \$\{config\.tone\}`\}/)
})

test('an order paid from salary is labelled as salary, not Unknown', () => {
  assert.match(tables, /key: 'salary',\s+icon: Wallet,\s+tone: 'ws-tone-accent',\s+labelEn: 'From salary', labelUz: 'Maoshdan', labelRu: 'Из зарплаты'/)
  assert.match(tables, /const KNOWN = \['cash', 'card', 'terminal', 'loyalty_card', 'salary'\]/)
})

test('staff never read a raw database message on the cashier and loyalty screens', () => {
  for (const [name, source] of Object.entries({ bill, tables, loyalty })) {
    assert.doesNotMatch(source, /set\w+\([^)\n]*error\??\.message/, `${name}: raw error.message stored for display`)
    assert.doesNotMatch(source, /description=\{loadError\}/, `${name}: raw load error shown`)
  }
  assert.match(tables, /formatWriteError\(deleteError, lang, 'DELETE_ORDER'\)/)
  assert.match(tables, /formatWriteError\(quickAddError, lang, 'ADD_QUICK_ITEM_TO_ORDER'\)/)
  // Loyalty and refresh notices are stored as codes and translated at render.
  assert.match(bill, /setLoyaltyLookupMessage\('loyaltyLookupFailed'\)/)
  assert.match(bill, /\{lbl\[loyaltyLookupMessage\] \|\| ''\}/)
  assert.match(bill, /setPaymentRefreshMessage\(\{ code: 'billRefreshed', total: freshQuote\.total \}\)/)
  assert.match(loyalty, /\{l\[message\] \|\| l\.actionFailed\}/)
})

test('loading on the money screens is a shimmer, and literals are labels', () => {
  assert.match(nameSearch, /\{!current && <div className="grid gap-2 p-3"><span className="sr-only">\{labels\.loading\}<\/span><Shimmer/)
  assert.match(bill, /isRefreshingBill \? \(\s*\/\/ The bill is being read[\s\S]*?<Shimmer/)
  assert.doesNotMatch(bill, /'\.\.\.'|− 0 UZS|>UZS</)
  assert.match(split, /<option value="terminal">\{l\.terminal\}<\/option>/)
  for (const lang of ["terminal: 'Terminal', card: 'Card", "terminal: 'Терминал'", "terminal: 'Terminal', card: 'Karta"]) assert.ok(split.includes(lang), lang)
  assert.match(split, /className="ws-btn ws-btn-primary flex-1 basis-32"/)
})

test('the receipt preview uses the shared dialog', () => {
  assert.match(bill, /\{printRequest && \(\s*<WorkspaceDialog[\s\S]*?<iframe[\s\S]*?src=\{printRequest\.path\}/)
  assert.doesNotMatch(bill, /fixed inset-0/)
})
