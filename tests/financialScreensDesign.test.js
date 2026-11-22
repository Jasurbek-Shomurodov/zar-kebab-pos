import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatCompactCurrency, formatPercent } from '../src/lib/formatCurrency.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const FINANCIAL_SCREENS = [
  'src/pages/AccountingAnalysis.jsx',
  'src/pages/DailyBazaar.jsx',
  'src/pages/MonthlyEstimate.jsx',
  'src/pages/OwnerProfit.jsx',
  'src/components/AnalysisChecks.jsx',
  'src/components/BreakEvenLine.jsx',
  'src/components/BreakEvenTargetHistoryDialog.jsx',
  'src/components/DailyBreakEvenBreakdown.jsx',
  'src/components/SankeyChart.jsx',
  'src/components/BazaarCategoryPicker.jsx',
  'src/components/BazaarIngredientPicker.jsx',
]

test('Daily Bazaar line dialog pins its title and actions on short screens', () => {
  const page = read('src/pages/DailyBazaar.jsx')
  const dialog = page.slice(page.indexOf('function BazaarLineDialog('), page.indexOf('function BazaarHistory('))
  assert.match(dialog, /<WorkspaceDialog\s+as="form"\s+panelProps=\{\{ onSubmit: confirm, noValidate: true \}\}\s+variant="sheet"/)
  assert.match(dialog, /footer=\{\(/)
  assert.match(dialog, /notice=\{firstError \?/)
  // The old shell let the panel overflow instead of scroll on a landscape phone.
  assert.doesNotMatch(page, /sm:overflow-visible/)
  assert.doesNotMatch(dialog, /fixed inset-0|createPortal|max-h-\[92vh\]/)
})

test('the Bazaar category list is portaled so a scrolling dialog body cannot clip it', () => {
  const picker = read('src/components/BazaarCategoryPicker.jsx')
  assert.match(picker, /open && createPortal\(/)
  assert.match(picker, /className="fixed z-picker /)
  for (const file of ['src/components/BazaarCategoryPicker.jsx', 'src/components/BazaarIngredientPicker.jsx']) {
    const source = read(file)
    // Escape closes the list only; it must not bubble to the dialog and drop the line being edited.
    assert.match(source, /function closeOnPanelEscape\(event\) \{\s+if \(event\.key !== 'Escape'\) return\s+event\.stopPropagation\(\)/, file)
    assert.doesNotMatch(source, /text-\[#C3C8D0\]/, file)
  }
})

test('Bazaar history shows purchase and line notes as text, not only as a hover tooltip', () => {
  const page = read('src/pages/DailyBazaar.jsx')
  assert.match(page, /\{purchase\.notes && <p data-bazaar-purchase-note="true"[^>]*>\{purchase\.notes\}<\/p>\}/)
  assert.match(page, /\{item\.notes && <p data-bazaar-item-note="true"[^>]*>\{item\.notes\}<\/p>\}/)
  assert.doesNotMatch(page, /title=\{(?:purchase|item)\.notes/)
})

test('financial screens format compact money and percentages through the shared helpers', () => {
  for (const file of FINANCIAL_SCREENS) {
    const source = read(file)
    assert.doesNotMatch(source, /\.toFixed\(|toLocaleString\(|Intl\.NumberFormat/, file)
    assert.doesNotMatch(source, /function formatCompact(?:Signed)?\(/, file)
    assert.doesNotMatch(source, /break-words|break-all/, file)
    assert.doesNotMatch(source, /text-\[(?:8|9|10|11)px\]|fontSize="/, file)
  }
  assert.equal(formatCompactCurrency(12_500_000, 'ru'), '12,5 млн')
  assert.equal(formatCompactCurrency(12_500_000, 'en'), '12.5M')
  assert.equal(formatCompactCurrency(-850_000, 'uz', { signed: true }), '−850 ming')
  assert.equal(formatCompactCurrency(2_000_000, 'ru', { signed: true }), '+2 млн')
  assert.equal(formatPercent(39.2, 'ru'), '39,2%')
  assert.equal(formatPercent(39.2, 'en'), '39.2%')
  assert.equal(formatPercent(12, 'uz'), '12%')
})

test('the break-even breakdown translates the tax word in Russian and English', () => {
  const source = read('src/components/DailyBreakEvenBreakdown.jsx')
  const ru = source.slice(source.indexOf('  ru: {'), source.indexOf('  en: {'))
  const en = source.slice(source.indexOf('  en: {'), source.indexOf('function fill('))
  assert.doesNotMatch(ru, /soliq/)
  assert.doesNotMatch(en, /soliq/)
  assert.match(ru, /налог/)
  assert.match(en, /Estimated tax/)
})

test('financial dialogs use the shared WorkspaceDialog shell', () => {
  const analysis = read('src/pages/AccountingAnalysis.jsx')
  const history = read('src/components/BreakEvenTargetHistoryDialog.jsx')
  for (const [name, source] of [['AccountingAnalysis', analysis], ['BreakEvenTargetHistoryDialog', history]]) {
    assert.match(source, /<WorkspaceDialog/, name)
    assert.doesNotMatch(source, /fixed inset-0 z-dialog|role="dialog"/, name)
  }
  assert.match(analysis, /function HelpDialog\([^)]*\) \{\s+return \(\s+<WorkspaceDialog/)
  assert.match(analysis, /function DayFlowDialog\([\s\S]*?<WorkspaceDialog\s+title=\{formatLongDate\(date, lang, date\)\}/)
})

test('trend data loads behind a chart-shaped shimmer, never a spinner', () => {
  const analysis = read('src/pages/AccountingAnalysis.jsx')
  assert.match(analysis, /\) : !trendRows \? \(\s+<TrendShimmer label=\{l\.loading\} \/>/)
  const flow = analysis.slice(analysis.indexOf('function MoneyFlowCard('), analysis.indexOf('const PNL_ROW'))
  assert.doesNotMatch(flow, /Loader2|animate-spin/)
})

test('closing and reopening a month use full-size buttons set apart from the status badge', () => {
  const page = read('src/pages/OwnerProfit.jsx')
  assert.doesNotMatch(page, /!h-\[3\d px\]|!h-\[30px\]|!h-\[34px\]|!h-\[38px\]/)
  assert.match(page, /<div className="flex flex-wrap items-center gap-3">\s+<StatusBadge row=\{row\}/)
  assert.match(page, /className="ws-btn ws-btn-primary !px-3">\{l\.close\}<\/button>/)
  assert.match(page, /className="ws-btn ws-btn-outline !px-3">\{l\.reopen\}<\/button>/)
  // Table money never splits the number from "UZS".
  assert.match(page, /const cell = 'whitespace-nowrap py-2\.5 px-3 text-right tabular-nums'/)
})

test('the monthly estimate stores a load error code and retries through its loader', () => {
  const page = read('src/pages/MonthlyEstimate.jsx')
  assert.doesNotMatch(page, /setError\([^)]*\.message/)
  assert.match(page, /<OperationalError\s+lang=\{lang\}\s+title=\{l\.loadFailed\}\s+description=\{error === 'migration' \? l\.migrationMissing : ''\}\s+actionLabel=\{l\.refresh\}\s+onAction=\{loadEstimate\}/)
})
