import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const tables = read('src/pages/AdminTables.jsx')
const users = read('src/pages/AdminUsers.jsx')
const settings = read('src/pages/AdminSettings.jsx')
const audit = read('src/pages/AdminAudit.jsx')
const login = read('src/pages/Login.jsx')
const callback = read('src/pages/AuthCallback.jsx')
const qrAccess = read('src/components/AttendanceQrAccessSettings.jsx')
const checkinQr = read('src/pages/CheckinQr.jsx')
const kiosk = read('src/pages/AttendanceKiosk.jsx')
const assistant = read('src/pages/AdminAssistant.jsx')
const inventory = read('src/pages/Inventory.jsx')

// Keys of one language block of a page's label object, including function labels.
function labelKeys(source, code, indent = '  ') {
  const start = source.indexOf(`\n${indent}${code}: {`)
  assert.ok(start >= 0, `${code} block`)
  const end = source.indexOf(`\n${indent}},`, start)
  return [...source.slice(start, end).matchAll(new RegExp(`\\n${indent}  (\\w+):`, 'g'))].map(match => match[1]).sort()
}

test('admin pages keep the same label keys in uz, ru and en', () => {
  for (const [name, source, indent] of [['tables', tables, '  '], ['users', users, '  '], ['settings', settings, '    '], ['audit', audit, '    '], ['callback', callback, '  '], ['login', login, '  ']]) {
    const en = labelKeys(source, 'en', indent)
    assert.ok(en.length > 2, name)
    assert.deepEqual(labelKeys(source, 'ru', indent), en, `${name} ru`)
    assert.deepEqual(labelKeys(source, 'uz', indent), en, `${name} uz`)
  }
})

test('a new table gets its id once, when the sheet opens, so a retry cannot add it twice', () => {
  const openNew = tables.slice(tables.indexOf('function openNew()'), tables.indexOf('function openEdit('))
  assert.match(openNew, /id: makeTableId\(\)/)
  // The id no longer depends on the typed name, which changes between attempts.
  assert.match(tables, /function makeTableId\(\) \{/)
  // A second attempt that hits the primary key means the first one landed: that is a success.
  assert.match(tables, /const alreadySaved = isNew && newTableAttemptedRef\.current && isDuplicateIdError\(result\?\.error\)/)
  // A failed optimistic add never shows the same table twice.
  assert.match(tables, /const tables = useMemo\(\(\) => uniqueById\(state\.tables\), \[state\.tables\]\)/)
})

test('the table sheet and its confirmations are the shared dialog, with errors and progress inside', () => {
  assert.doesNotMatch(tables, /function Modal\(/)
  assert.doesNotMatch(tables, /fixed inset-0/)
  assert.match(tables, /<WorkspaceDialog\s+as="form"\s+panelProps=\{\{ onSubmit: save, noValidate: true \}\}\s+variant="sheet"/)
  assert.match(tables, /busy=\{saving\}/)
  assert.match(tables, /notice=\{saveError \? <p role="alert" className="ws-notice ws-tone-negative">\{l\[saveError\]\}<\/p> : null\}/)
  assert.match(tables, /<button type="submit" disabled=\{saving\} className="ws-btn ws-btn-primary">/)
  assert.match(tables, /variant="alert"/)
  assert.equal((tables.match(/role="switch"/g) || []).length, 2)
  assert.equal((tables.match(/className="ws-switch flex-shrink-0"/g) || []).length, 2)
})

test('switching language on Tables never refetches and never leaves an old-language message', () => {
  const effect = tables.slice(tables.indexOf('loadTableOrderHistoryIds()') - 200, tables.indexOf('const tables = useMemo'))
  assert.match(effect, /\}, \[historyAttempt\]\)/)
  assert.doesNotMatch(effect, /\bl\.|\blang\b/)
  // Notices, confirmations and validation are stored as label keys.
  assert.doesNotMatch(tables, /setNotice\(\{[^}]*message:/)
  assert.doesNotMatch(tables, /error\.message \|\|/)
  assert.match(tables, /nextErrors\.name = 'requiredTableName'/)
  assert.match(tables, /setConfirm\(\{ kind, table \}\)/)
})

test('cancelling a reservation asks first, and seating waits for the write', () => {
  const cancel = tables.slice(tables.indexOf('function cancelReservation('), tables.indexOf('const confirmSpec'))
  assert.match(cancel, /openConfirm\('cancelReservation', table\)/)
  assert.doesNotMatch(cancel, /dispatch\(/)
  const seat = tables.slice(tables.indexOf('async function seatReservation('), tables.indexOf('function cancelReservation('))
  assert.match(seat, /const result = await dispatch\(\{ type: 'UPDATE_TABLE', payload: clearReservationPatch\(table\) \}\)/)
  assert.match(seat, /if \(result\?\.error\) \{[\s\S]*?return\s+\}\s+navigate\(`\/waiter\/order\/\$\{table\.id\}`\)/)
})

test('bulk apply counts failures and cannot be pressed twice', () => {
  const bulk = tables.slice(tables.indexOf('async function applyBulkUpdates('), tables.indexOf('async function handleTableDragEnd('))
  assert.match(bulk, /if \(!canManageTables \|\| bulkBusy\) return/)
  assert.match(bulk, /if \(result\?\.error\) \{[\s\S]*?failed \+= 1/)
  assert.match(bulk, /key: 'bulkResult', args: \[updated, failed\]/)
  assert.match(tables, /onClick=\{\(\) => applyBulkUpdates\(\)\} disabled=\{bulkBusy\}/)
  assert.match(tables, /bulkResult: \(updated, failed\) => `\$\{updated\} updated, \$\{failed\} failed/)
})

test('Tables shows the shared loading and error states and names its icon actions', () => {
  assert.match(tables, /const \{ loaded, loadError, retry: retryPOSLoad \} = useAppDataStatus\(\)/)
  assert.match(tables, /<OperationalLoading title=\{l\.title\} layout="table"/)
  assert.match(tables, /<OperationalError lang=\{lang\}/)
  assert.doesNotMatch(tables, /<h1/)
  assert.doesNotMatch(tables, /purple|bg-blue|text-blue|uppercase/)
  for (const label of ['edit', 'reserve', 'disable']) {
    assert.match(tables, new RegExp('aria-label=\\{`\\$\\{l\\.' + label + '\\}: \\$\\{table\\.name\\}`\\}'))
  }
  assert.ok((tables.match(/ws-btn ws-btn-ghost (?:ws-btn-danger )?ws-btn-sm ws-btn-icon/g) || []).length >= 5)
})

test('a failed Team load is an error with a retry, not an empty team', () => {
  const loader = users.slice(users.indexOf('async function loadUsers()'), users.indexOf('useEffect(() => { loadUsers() }'))
  assert.match(loader, /const \{ data, error \} = await getAllProfiles\(\)/)
  assert.match(loader, /if \(error\) \{[\s\S]*?setLoadFailed\(true\)/)
  assert.match(users, /loadFailed \? \(\s*<OperationalError lang=\{lang\} title=\{l\.loadFailed\} onAction=\{loadUsers\} \/>/)
  assert.doesNotMatch(users, /error\.message \|\|/)
  assert.doesNotMatch(users, /uppercase|text-gray-400/)
})

test('Russian counts on Team use the right plural form', () => {
  assert.match(users, /function ruPlural\(n, one, few, many\)/)
  assert.match(users, /ruPlural\(n, 'заявка', 'заявки', 'заявок'\)/)
  assert.match(users, /ruPlural\(n, 'участник', 'участника', 'участников'\)/)
})

test('instant settings send one field on top of the saved settings and report next to the control', () => {
  const instant = settings.slice(settings.indexOf('async function saveSettings(overrides = {})'), settings.indexOf('const moneyChanged'))
  assert.match(instant, /writeSettings\(savedSettings\(\), overrides\)/)
  // The unsaved typed drafts are not part of an instant save.
  assert.doesNotMatch(instant, /normalizeMoneyInput|restaurantName/)
  assert.match(settings, /await dispatch\(\{ type: 'SET_SETTINGS', payload: previous \}\)/)
  for (const field of ['serviceRate', 'touristServiceRate', 'touristMenuEnabled', 'publicTouristPrices', 'autoPrint', 'autoPrintKitchenCheck', 'receiptMarketing']) {
    assert.match(settings, new RegExp(`<FieldStatus state=\\{fieldStates\\.${field}\\} labels=\\{l\\} />`), field)
  }
  // Saving one control must not reset what is typed in another.
  assert.match(settings, /useEffect\(\(\) => \{ setRestaurantName\(settings\.restaurantName\) \}, \[settings\.restaurantName\]\)/)
  // The Save button covers the typed fields only.
  const dirty = settings.slice(settings.indexOf('const hasChanges ='), settings.indexOf('async function handleSave()'))
  assert.doesNotMatch(dirty, /autoPrint|serviceRate|receiptMarketing|touristMenuEnabled/)
})

test('Settings has no control that does nothing, and its switches are named', () => {
  assert.doesNotMatch(settings, /notifications|notifSub|Bell/)
  assert.doesNotMatch(login, /remember|premiumLoginRemember/i)
  assert.match(settings, /aria-label=\{label\}[\s\S]{0,120}className="ws-switch"/)
  assert.equal((settings.match(/<Toggle label=\{l\.\w+\}/g) || []).length, 4)
  assert.doesNotMatch(settings, /h-6 w-11/)
  assert.doesNotMatch(settings, /result\.error\.message|err\.message \|\|/)
})

test('the audit says it is the latest 100, never cuts before/after values, and separates no-match from empty', () => {
  assert.match(audit, /const AUDIT_LIMIT = 100/)
  assert.match(audit, /\.limit\(AUDIT_LIMIT\)/)
  assert.match(audit, /l\.limitNote\(AUDIT_LIMIT\)/)
  const value = audit.slice(audit.indexOf('function AuditValue('))
  assert.doesNotMatch(value, /truncate/)
  assert.doesNotMatch(audit, /xl:grid-cols-5/)
  assert.match(audit, /if \(rows\.length === 0\) \{[\s\S]*?l\.empty[\s\S]*?if \(groupedRows\.length === 0\) \{[\s\S]*?l\.noMatches[\s\S]*?l\.clearFilters/)
  assert.doesNotMatch(audit, /animate-pulse/)
  assert.match(audit, /<Shimmer className="h-9 w-9/)
  assert.doesNotMatch(audit, /setError\(error\.message\)/)
})

test('sign-in pages show translated messages, one form, and no debug output', () => {
  assert.equal((login.match(/<LoginCard /g) || []).length, 1)
  assert.equal((login.match(/<form /g) || []).length, 1)
  assert.doesNotMatch(login, /setError\(error\.message\)/)
  assert.doesNotMatch(login, /min-h-\[430px\]/)
  for (const id of ['login-name', 'login-email', 'login-password', 'login-confirm-password']) {
    assert.match(login, new RegExp(`<label htmlFor="${id}"`))
    assert.match(login, new RegExp(`id="${id}"\\s+autoComplete=`))
  }
  assert.match(login, /autoComplete=\{isSignup \? 'new-password' : 'current-password'\}/)
  assert.doesNotMatch(callback, /debugLog|font-mono|⚠️|animate-spin/)
  assert.match(callback, /console\.debug\('\[auth-callback\]', msg\)/)
  assert.doesNotMatch(callback, /setErrorMsg|\{errorMsg\}/)
})

test('the check-in QR keeps a white field in the dark theme', () => {
  // The dark theme remaps colour classes; an inline style is left alone.
  assert.match(checkinQr, /const QR_FRAME_STYLE = \{ backgroundColor: '#ffffff', colorScheme: 'light' \}/)
  assert.match(checkinQr, /className="rounded-3xl p-4 shadow-xl ring-1 ring-black\/5" style=\{QR_FRAME_STYLE\}/)
  assert.doesNotMatch(checkinQr, /rounded-3xl bg-white/)
  assert.match(kiosk, /style=\{\{ backgroundColor: '#ffffff', colorScheme: 'light' \}\}/)
  assert.doesNotMatch(checkinQr, /<h1/)
})

test('remaining admin dialogs are the shared dialog and raw backend text stays out of them', () => {
  assert.match(qrAccess, /<WorkspaceDialog/)
  assert.doesNotMatch(qrAccess, /fixed inset-0|setDialogError\(error\.message\)/)
  assert.equal((inventory.match(/<WorkspaceDialog/g) || []).length, 2)
  assert.doesNotMatch(inventory, /fixed inset-0/)
  assert.match(inventory, /notice=\{formError \? <p role="alert"/)
  // The assistant's model and quota badges wrap in the page instead of overflowing the top bar.
  assert.doesNotMatch(assistant, /titleAccessory/)
})
