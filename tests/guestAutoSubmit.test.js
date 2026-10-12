import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('successful Staff Access submits the reviewed guest cart before returning to tables', () => {
  const orderSource = fs.readFileSync(new URL('../src/pages/WaiterOrder.jsx', import.meta.url), 'utf8')
  const unlockStart = orderSource.indexOf('async function unlockGuestMode(pin)')
  const unlockEnd = orderSource.indexOf('\n  function handleSignOut()', unlockStart)
  const unlockSource = orderSource.slice(unlockStart, unlockEnd)

  const submitAt = unlockSource.indexOf("type: 'SEND_TO_KITCHEN'")
  const exitAt = unlockSource.lastIndexOf('exitGuestModeToTables()')
  assert.ok(submitAt > 0)
  assert.ok(exitAt > submitAt)
  assert.match(unlockSource, /_cart: reviewedCart/)
  assert.match(unlockSource, /if \(submitResult\?\.error\)/)
})

test('Staff Access exits Guest mode without creating an order when the selection is empty', () => {
  const orderSource = fs.readFileSync(new URL('../src/pages/WaiterOrder.jsx', import.meta.url), 'utf8')
  const unlockStart = orderSource.indexOf('async function unlockGuestMode(pin)')
  const unlockEnd = orderSource.indexOf('\n  function handleSignOut()', unlockStart)
  const unlockSource = orderSource.slice(unlockStart, unlockEnd)
  const exitStart = orderSource.indexOf('function exitGuestModeToTables()')
  const exitEnd = orderSource.indexOf('\n  async function unlockGuestMode(pin)', exitStart)
  const exitSource = orderSource.slice(exitStart, exitEnd)

  assert.match(unlockSource, /if \(guestCart\.length === 0\) \{\s*exitGuestModeToTables\(\)\s*return/)
  assert.match(unlockSource, /if \(reviewedCart\.length === 0\) \{\s*exitGuestModeToTables\(\)\s*return/)
  assert.doesNotMatch(unlockSource, /guest selection is empty|Выбор гостя пуст|Mehmon tanlovi bo‘sh/)
  assert.match(exitSource, /clearGuestModeSession\(\)/)
  assert.match(exitSource, /navigate\('\/waiter\/tables', \{ replace: true \}\)/)
})

test('Guest submission can use the reviewed cart snapshot before React state catches up', () => {
  const contextSource = fs.readFileSync(new URL('../src/store/AppContext.jsx', import.meta.url), 'utf8')
  const dbSource = fs.readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8')

  assert.match(contextSource, /Array\.isArray\(action\._cart\) \? action\._cart : stateRef\.current\.cart/)
  assert.match(dbSource, /if \(\(!isOffPremise && !table\) \|\| items\.length === 0\) return/)
})

test('PIN verification and table entry remain guarded from duplicate requests', () => {
  const dialogSource = fs.readFileSync(new URL('../src/components/GuestModeUI.jsx', import.meta.url), 'utf8')
  const tablesSource = fs.readFileSync(new URL('../src/pages/WaiterTables.jsx', import.meta.url), 'utf8')

  assert.match(dialogSource, /submitRequestRef\.current/)
  assert.match(tablesSource, /guestEntryRequestRef\.current/)
})

test('table entry requires only R or T and carries the selected mode into waiter ordering', () => {
  const dialogSource = fs.readFileSync(new URL('../src/components/GuestModeUI.jsx', import.meta.url), 'utf8')
  const tablesSource = fs.readFileSync(new URL('../src/pages/WaiterTables.jsx', import.meta.url), 'utf8')
  const orderSource = fs.readFileSync(new URL('../src/pages/WaiterOrder.jsx', import.meta.url), 'utf8')
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const dialogStart = dialogSource.indexOf('export function TableGuestEntryDialog')
  const dialogEnd = dialogSource.indexOf('\nexport function GuestSelectionReady', dialogStart)
  const tableEntryDialog = dialogSource.slice(dialogStart, dialogEnd)
  const openStart = tablesSource.indexOf('async function openTable(')
  const openEnd = tablesSource.indexOf('\n  function handleManageOrder', openStart)
  const openTable = tablesSource.slice(openStart, openEnd)

  assert.match(tableEntryDialog, /name="table-price-mode"/)
  assert.match(tableEntryDialog, /disabled=\{busy \|\| !validPriceMode\}/)
  assert.doesNotMatch(tableEntryDialog, /type="password"|inputMode="numeric"|confirmPin|temporaryStaffPin/)
  assert.doesNotMatch(tablesSource, /createGuestModeSession|writeGuestModeSession/)
  assert.match(openTable, /\{ state: \{ priceMode: selectedPriceMode \} \}/)
  assert.doesNotMatch(openTable, /\?priceMode=/)
  assert.doesNotMatch(orderSource, /searchParams\.get\('priceMode'\)/)
  assert.match(orderSource, /const requestedPriceMode\s*= state\.settings\?\.touristMenuEnabled === false\s*\? DEFAULT_PRICE_MODE\s*: normalizePriceMode\(location\.state\?\.priceMode\)/)
  assert.match(orderSource, /activeOrder \|\| state\.cart\.length > 0[\s\S]*requestedPriceMode/)
  assert.match(appSource, /if \(guestModeSession\) clearGuestModeSession\(\)/)
})

test('Staff Access verifies immediately when the final PIN digit is entered', () => {
  const dialogSource = fs.readFileSync(new URL('../src/components/GuestModeUI.jsx', import.meta.url), 'utf8')
  const changePinStart = dialogSource.indexOf('function changePin(value)')
  const changePinEnd = dialogSource.indexOf('\n  function changeConfirmPin(value)', changePinStart)
  const changePinSource = dialogSource.slice(changePinStart, changePinEnd)

  assert.match(changePinSource, /!setup && lockSeconds <= 0 && nextPin\.length === expectedPinLength/)
  assert.match(changePinSource, /submitPin\(nextPin\)/)
  assert.match(dialogSource, /busy \|\| lockSeconds > 0 \|\| submitRequestRef\.current/)
})
