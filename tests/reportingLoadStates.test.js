import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const reports = read('src/pages/Reports.jsx')
const expenses = read('src/pages/Expenses.jsx')
const dashboard = read('src/pages/AdminDashboard.jsx')
const history = read('src/pages/AccountingHistory.jsx')

test('Accounting overview never prints a failed load as a real zero', () => {
  assert.match(expenses, /const NO_LOAD_FAILURES = \{ expenses: false, orders: false, meals: false, salary: false \}/)
  assert.match(expenses, /failures\.expenses = true/)
  assert.match(expenses, /failures\.orders = true/)
  assert.match(expenses, /failures\.meals = true/)
  assert.match(expenses, /failures\.salary = true/)
  assert.match(expenses, /const money = \(known, amount\) => known \? formatCurrency\(amount\) : '—'/)
  assert.match(expenses, /value=\{money\(expensesKnown, summary\.total\)\}/)
  assert.match(expenses, /value=\{money\(leftKnown, netIncome\)\}/)
  assert.match(expenses, /value=\{money\(salaryKnown, totalSalaryDue\)\}/)
  assert.match(expenses, /value=\{money\(salaryKnown, totalSalaryDueByMonthEnd\)\}/)
  // The retry re-runs the page loader, and the lists say the load failed instead of "no expenses".
  assert.match(expenses, /<button type="button" onClick=\{loadExpenses\} disabled=\{loading\} className="ws-btn ws-btn-outline ws-btn-sm">\{l\.retry\}<\/button>/)
  assert.match(expenses, /\) : failed \? \([\s\S]{0,260}<OperationalError lang=\{lang\}[^\n]*onAction=\{onRetry\} \/>/)
  // Errors are stored as label keys and translated at render; raw database messages stay in the console.
  assert.match(expenses, /\{l\[error\] \|\| l\.saveFailed\}/)
  assert.doesNotMatch(expenses, /setError\(l\./)
  assert.doesNotMatch(expenses, /Error\?*\.message \|\| l\./)
  assert.doesNotMatch(expenses, /loadFailed\.replace\(/)
})

test('Reports detail tabs and the order drawer show loading and failure, not empty results', () => {
  assert.match(reports, /if \(dishError\) \{[\s\S]{0,260}<OperationalError lang=\{lang\} title=\{loadText\.dishFailed\}/)
  assert.match(reports, /if \(dishRpc === null\) return <OperationalLoading layout="table"/)
  assert.match(reports, /\{result\.error \? \([\s\S]{0,260}title=\{loadText\.ordersFailed\}[^\n]*onAction=\{\(\) => setOrdersRetry\(value => value \+ 1\)\}/)
  assert.match(reports, /result\.loading && pageOrders\.length === 0 \? \(\s*<OperationalLoading layout="table"/)
  assert.match(reports, /const itemsKnown = itemsState === 'ready' \|\| embeddedItems\.length > 0/)
  assert.match(reports, /value=\{itemsKnown \? formatCurrency\(total\) : '—'\} bold/)
  assert.match(reports, /aria-label=\{loadText\.closeOrder\}/)
  // Raw error messages are logged, never rendered.
  assert.doesNotMatch(reports, /error\?*\.message \|\| 'Could not/)
  assert.doesNotMatch(reports, /<span>\{reportsError\}<\/span>/)
  for (const lang of ['uz', 'ru', 'en']) {
    assert.match(reports, new RegExp(`\\n  ${lang}: \\{ dishFailed: [^\\n]*ordersFailed: [^\\n]*itemsFailed: [^\\n]*closeOrder: [^\\n]*terminal: `))
  }
  assert.doesNotMatch(reports, /<option value="terminal">Terminal<\/option>/)
})

test('Reports Print opens the self-printing receipt, only for accounts that may open it', () => {
  assert.match(reports, /navigate\(`\/receipt\/\$\{order\.id\}\?print=1`\)/)
  assert.doesNotMatch(reports, /window\.print\(\)/)
  assert.match(reports, /const canOpenReceipt = canViewPage\([^\n]*'cashier'\) \|\| canViewPage\([^\n]*'tables'\)/)
  assert.match(reports, /\{canOpenReceipt && \(\s*<>\s*<button\s+onClick=\{\(\) => navigate\(`\/receipt\/\$\{order\.id\}`\)\}/)
  assert.match(read('src/App.jsx'), /path="\/receipt\/:orderId" element=\{\s*<LazyProtectedRoute page=\{\['cashier', 'tables'\]\}>/)
})

test('Dashboard comparisons and net profit are unknown, not zero, when their inputs are missing', () => {
  assert.match(dashboard, /setHistoryError\(true\)/)
  assert.match(dashboard, /\$\{l\.yesterday\}: \$\{yesterdayKnown \? formatCurrency\(yesterdayRevenue\) : '—'\}/)
  assert.match(dashboard, /badge=\{yesterdayKnown \? pctBadge\(revenueChange\) : null\}/)
  assert.match(dashboard, /onClick=\{\(\) => setComparisonRetry\(value => value \+ 1\)\}/)
  assert.match(dashboard, /: l\.partialCost\}/)
  // The donut centre prints the grouped total; splitting "1 250 000 UZS" on a space printed "1".
  assert.match(dashboard, /\{formatGroupedNumber\(paymentMethods\.reduce\(\(s, p\) => s \+ p\.amount, 0\)\)\}/)
  assert.doesNotMatch(dashboard, /formatCurrency\([^\n]*\)\.split\(' '\)/)
  // Chart colours are tokens so the dark theme applies.
  assert.match(dashboard, /cash:\s+'var\(--ws-positive\)'/)
  assert.doesNotMatch(dashboard, /stroke="#/)
  for (const key of ['partialCost', 'comparisonFailed', 'retry', 'loyalty', 'lastUpdated']) {
    assert.equal((dashboard.match(new RegExp(`\\n    ${key}:`, 'g')) || []).length, 3, key)
  }
})

test('dashboard cards keep readable ink, real shimmers and unbroken figures', () => {
  const busy = read('src/components/BusyHoursCard.jsx')
  assert.match(busy, /color-mix\(in srgb, var\(--ws-primary\) \$\{getBusyHourHeatPct\(row\.count, max, theme === 'dark'\)\}%, var\(--ws-card\)\)/)
  assert.match(busy, /color: 'var\(--ws-foreground\)'/)
  assert.doesNotMatch(busy, /#ffffff|#FFFFFF|text-\[10px\]/)
  assert.match(busy, /hours === null \? <div role="status">[\s\S]{0,200}<Shimmer/)
  const weekly = read('src/components/WeeklyIncomeChart.jsx')
  assert.match(weekly, /!rows \? <div role="status">[\s\S]{0,400}<Shimmer/)
  assert.doesNotMatch(weekly, /className="ws-empty">\{l\.loading\}/)
  const contribution = read('src/components/ProductContributionCard.jsx')
  assert.match(contribution, /getProductContributionSummary\(rows\)/)
  assert.match(contribution, /\{l\.summaryScope\}/)
  assert.doesNotMatch(contribution, /truncate text-sm font-semibold tabular-nums|!h-7|text-\[1[01]px\]/)
  assert.match(read('src/components/RollingNumber.jsx'), /<roll-chars aria-hidden="true" style=\{\{ flexWrap: 'nowrap' \}\}>/)
  const kpi = read('src/components/AccountingKpi.jsx')
  assert.match(kpi, /<WorkspaceDialog\s+title=\{detail\.title\}/)
  assert.doesNotMatch(kpi, /fixed inset-0|break-words/)
})

test('All accounting sits on workspace classes with sentence-case labels in three languages', () => {
  assert.match(history, /<AppShell title=\{l\.title\} back=\{\{ label: l\.back, onClick: \(\) => navigate\('\/admin\/accounting'\) \}\}>/)
  assert.doesNotMatch(history, /<h1|uppercase|font-black|text-\[11px\]|text-\[#9CA3AF\]|bg-\[#ff5a00\]/)
  assert.match(history, /<thead className="ws-table-head">/)
  assert.match(history, /<Kpi loading=\{orderLoading\}/)
  for (const key of ['entries', 'retry', 'loadFailedHint', 'telegramRemoveFailed', 'period', 'type', 'dayTotals']) {
    assert.equal((history.match(new RegExp(`[{ ]${key}: '`, 'g')) || []).length, 3, key)
  }
  assert.doesNotMatch(history, /'Could not load accounting history'\)/)
})
