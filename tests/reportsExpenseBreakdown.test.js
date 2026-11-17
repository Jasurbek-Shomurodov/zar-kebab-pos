import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const reports = readFileSync(new URL('../src/pages/Reports.jsx', import.meta.url), 'utf8')

test('reports left-after-expenses card opens a period expense breakdown', () => {
  assert.match(reports, /const \[expenseBreakdownOpen, setExpenseBreakdownOpen\] = useState\(false\)/)
  assert.match(reports, /aria-haspopup="dialog"/)
  assert.match(reports, /onClick=\{\(\) => setExpenseBreakdownOpen\(true\)\}/)
  assert.match(reports, /role="dialog"/)
  assert.match(reports, /aria-modal="true"/)
  assert.match(reports, /normalizeExpenseEntryType\(expense\?\.entry_type\) === 'expense'/)
  assert.match(reports, /expenseCategoryLabel\(expense\.category, lang\)/)
  assert.match(reports, /expensePaymentMethodLabel\(expense\.payment_method, lang\)/)
  assert.match(reports, /\[expense\.vendor, expenseDescriptionLabel\(expense\.description, lang\)\]\.filter\(Boolean\)\.join\(' · '\)/)
  assert.match(reports, /summarizeExpenseCashflowFromIncome\(incomeByMethod, allExpenses, \{ includeIncomeEntries: false \}\)/)
  assert.match(reports, /const cashflowLeft = kpiRevenue - expenseSummary\.total/)
  assert.match(reports, /const netIncome = cashflowLeft/)
})

test('reports loads the identifying details needed by the expense breakdown', () => {
  assert.match(
    reports,
    /\.select\('id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_at'\)/,
  )
})
