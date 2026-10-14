import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('page switches keep the current page on screen instead of a full-screen loader', () => {
  const app = source('src/App.jsx')
  const main = source('src/main.jsx')

  assert.match(main, /<BrowserRouter future=\{\{ v7_startTransition: true \}\}>/)
  // One Suspense boundary around the staff routes; no per-route spinner fallback.
  assert.match(app, /<Suspense fallback=\{<AppShellShimmer \/>\}>\s*<Routes>/)
  assert.doesNotMatch(app, /<Suspense fallback=\{<Spinner \/>\}>/)
  assert.match(app, /function LazyProtectedRoute\(\{ page, children \}\) \{\s*return <ProtectedRoute page=\{page\}>\{children\}<\/ProtectedRoute>/)
  // Staff page code is warmed after sign-in so navigation does not wait on it.
  assert.match(app, /Object\.values\(STAFF_PAGES\)\.forEach\(load =>/)
  assert.match(app, /<PreloadStaffPages \/>\s*<InternalAppRoutes/)
})

test('page and tab data loads render page-shaped shimmers, not spinners', () => {
  const operational = source('src/components/OperationalState.jsx')
  assert.match(operational, /export function OperationalLoading\(\{ title, layout = 'table', className = '' \}\) \{\s*return <PageShimmer/)
  assert.doesNotMatch(operational, /Loader2/)

  assert.match(source('src/pages/AdminDashboard.jsx'), /<PageShimmer layout="dashboard"/)
  assert.match(source('src/pages/WaiterOrder.jsx'), /<OperationalLoading layout="detail"/)
  assert.match(source('src/pages/CashierTables.jsx'), /<OperationalLoading layout="cards"/)
  // Monthly estimate loads in its own full-width layout so the page does not jump when data arrives.
  assert.match(source('src/pages/MonthlyEstimate.jsx'), /<OperationalLoading layout="estimate"/)
  // Salaries renders its static operations form immediately; only metric values and the delivery list shimmer.
  assert.doesNotMatch(source('src/pages/Salaries.jsx'), /<OperationalLoading/)
  assert.match(source('src/pages/Salaries.jsx'), /\{loading \? \(\s*<div className="space-y-2" aria-busy="true"/)
  assert.match(source('src/components/PageShimmer.jsx'), /PAGE_CONTAINER_LAYOUTS = new Set\(\['salaries', 'estimate', 'techCards', 'techCardEditor', 'ingredients', 'ingredientUsage', 'employees'\]\)/)
  // Tech Cards and Ingredients shimmer in their own card layouts, not a generic table.
  assert.match(source('src/components/PageShimmer.jsx'), /startsWith\('\/admin\/tech-cards\/'\)\) return 'techCardEditor'\s+if \(pathname\.startsWith\('\/admin\/tech-cards'\)\) return 'techCards'\s+if \(pathname\.startsWith\('\/admin\/ingredients\/usage'\)\) return 'ingredientUsage'\s+if \(pathname\.startsWith\('\/admin\/ingredients'\)\) return 'ingredients'/)
  assert.match(source('src/pages/TechCards.jsx'), /<OperationalLoading title=\{l\.title\} layout=\{menuItemId \? 'techCardEditor' : 'techCards'\} \/>/)
  assert.match(source('src/pages/BazaarIngredients.jsx'), /\{loading \? <OperationalLoading title=\{l\.title\} layout="ingredientCards" \/>/)
  assert.match(source('src/components/IngredientMovement.jsx'), /loading \? <OperationalLoading title=\{l\.loading\} layout="ingredientMovementCards" \/>/)
  assert.match(source('src/components/PageShimmer.jsx'), /startsWith\('\/admin\/financial-analysis\/estimate'\)\) return 'estimate'/)
  assert.match(source('src/pages/AdminUsers.jsx'), /<PageShimmer layout="table"/)
  // Employees shimmer as employee cards (and KPI tiles before the page code loads), not a table.
  assert.match(source('src/pages/Employees.jsx'), /<PageShimmer layout="employeeCards" \/>/)
  assert.match(source('src/components/PageShimmer.jsx'), /pathname === '\/admin\/accounting\/employees'\) return 'employees'/)
})

test('native dropdowns get a padded chevron that beats Tailwind padding utilities', () => {
  const css = source('src/index.css')
  assert.match(css, /select:not\(\[multiple\]\):not\(\[size\]\):not\(\.appearance-none\) \{[\s\S]*?appearance: none;[\s\S]*?padding-right: 2\.5rem;[\s\S]*?background-position: right 0\.875rem center;/)
})

test('Accounting KPI cards shimmer while totals load instead of showing dashes', () => {
  const kpi = source('src/components/AccountingKpi.jsx')
  const pages = source('src/pages/Expenses.jsx') + source('src/pages/AccountingAnalysis.jsx')
  assert.match(kpi, /function Kpi\(\{[^}]*loading = false \}\)/)
  assert.match(kpi, /\{loading\s*\? <Shimmer className="mt-2 h-\[26px\] w-36 max-w-full" \/>/)
  assert.ok((pages.match(/<Kpi loading=\{loading\}/g) || []).length >= 10)
})

test('cashier attention badge uses the Cashier page bill grouping in the drawer and top bar', async () => {
  const { countCashierAttentionBills, cashierBillKey } = await import('../src/lib/cashierBills.js')
  const item = { name: 'Plov', price: 50000, quantity: 1, status: 'served' }
  const orders = [
    { id: 'a', table_id: 't1', status: 'needs_bill', order_type: 'dine_in', items: [item] },
    { id: 'b', table_id: 't1', status: 'needs_bill', order_type: 'dine_in', items: [item] },
    { id: 'c', table_id: 't2', status: 'active', order_type: 'dine_in', items: [item] },
    { id: 'd', status: 'active', order_type: 'take_away', items: [item] },
    { id: 'e', status: 'active', order_type: 'take_away', payment_status: 'paid', items: [item] },
  ]
  assert.equal(cashierBillKey(orders[0]), 'table:t1')
  assert.equal(countCashierAttentionBills(orders), 2) // table t1 (merged) + one take-away
  assert.match(source('src/components/UnifiedSidebar.jsx'), /item\.key === 'cashier' && <AttentionBadge count=\{cashierAttention\}/)
  assert.match(source('src/pages/CashierTables.jsx'), /const key = cashierBillKey\(order\)/)
})
