import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Daily Bazaar route is lazy-loaded and feature-protected', () => {
  const app = readSource('src/App.jsx')

  assert.match(app, /const DailyBazaar = lazy\(\(\) => import\('\.\/pages\/DailyBazaar'\)\)/)
  assert.match(
    app,
    /<Route path="\/admin\/bazaar" element=\{\s*<LazyProtectedRoute page="bazaar"><DailyBazaar \/><\/LazyProtectedRoute>\s*\} \/>/,
  )
  assert.match(app, /const BazaarIngredients = lazy\(\(\) => import\('\.\/pages\/BazaarIngredients'\)\)/)
  assert.match(app, /<Route path="\/admin\/ingredients" element=\{\s*<LazyProtectedRoute page="ingredients"><BazaarIngredients \/><\/LazyProtectedRoute>\s*\} \/>/)
})

test('ingredient editors receive management controls through the delegated feature', () => {
  const page = readSource('src/pages/BazaarIngredients.jsx')

  assert.match(page, /canEditFeature\(profile \|\| state.user, 'ingredients'\)/)
  assert.match(page, /\{canManage \? \(/)
  // Cards open the editor on tap; the only card button is archive / restore.
  assert.match(page, /onClick=\{event => \{ event\.stopPropagation\(\); requestIngredientStatus\(ingredient\) \}\}/)
  // Restore is immediate; archive first lists the Tech Cards that still use the ingredient.
  assert.match(page, /if \(!ingredient\.is_active\) \{ setIngredientActive\(ingredient\); return \}\s*setError\(''\)\s*setNotice\(''\)\s*loadArchiveUsage\(ingredient\)/)
  assert.match(page, /supabase\.rpc\('get_bazaar_ingredient_tech_card_usage', \{ p_product_key: ingredient\.product_key \}\)/)
  assert.match(page, /navigate\(`\/admin\/tech-cards\/\$\{encodeURIComponent\(row\.menuItemId\)\}\?\$\{params\}`\)/)
  assert.match(page, /if \(await setIngredientActive\(ingredient\)\) setArchiveCheck\(null\)/)
  assert.doesNotMatch(page, /window\.confirm\(/)
  assert.match(page, /runBazaarIngredientWriteWithRecovery/)
  assert.match(page, /upsertIngredient\(savedIngredientRow\(savedData\)\)/)
  assert.match(page, /isBazaarIngredientNetworkError\(requestError\)/)
  assert.doesNotMatch(page, /setNotice\(l\.saved\)[\s\S]{0,80}await loadIngredients\(\)/)
})

test('Daily Bazaar appears in the sidebar and becomes active on its route', () => {
  const sidebar = readSource('src/components/UnifiedSidebar.jsx')

  assert.match(sidebar, /import \{[\s\S]*?ShoppingBasket[\s\S]*?\} from 'lucide-react'/)
  assert.match(
    sidebar,
    /key: 'bazaar',[\s\S]{0,120}icon: ShoppingBasket,[\s\S]{0,240}path: '\/admin\/bazaar'/,
  )
  assert.match(sidebar, /pathname\.startsWith\('\/admin\/bazaar'\)\)\s+return 'bazaar'/)
})

test('Daily Bazaar is a page feature with a default route fallback', () => {
  const permissions = readSource('src/lib/permissions.js')

  assert.match(permissions, /key: 'bazaar',\s*kind: 'page'/)
  assert.match(
    permissions,
    /if \(canViewPage\(profile, 'bazaar'\)\) return '\/admin\/bazaar'/,
  )
})

test('Daily Bazaar lives in the drawer and Accounting prevents duplicate manual bazaar expenses', () => {
  const expensesPage = readSource('src/pages/Expenses.jsx')
  const expensesLib = readSource('src/lib/expenses.js')

  assert.doesNotMatch(expensesPage, /navigate\('\/admin\/bazaar'\)/)
  assert.match(
    expensesLib,
    /MANUAL_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES\.filter\(category => \([\s\S]{0,240}category\.key !== 'products_bazaar'/,
  )
})

test('Daily Bazaar entry uses active employees, cash/card entry methods, and durable product suggestions', () => {
  const page = readSource('src/pages/DailyBazaar.jsx')
  const picker = readSource('src/components/BazaarIngredientPicker.jsx')

  assert.match(page, /from\('profiles'\)[\s\S]{0,180}\.eq\('status', 'active'\)/)
  assert.match(page, /value=\{form\.buyer_profile_id \|\| ''\}/)
  assert.match(page, /BAZAAR_ENTRY_PAYMENT_METHODS\.map/)
  assert.match(page, /bazaarCategoriesFor\(suggestions\)\.map/)
  assert.match(page, /from\('bazaar_product_catalog'\)/)
  assert.match(page, /\.eq\('is_catalog_managed', true\)/)
  assert.match(page, /\.eq\('is_active', true\)/)
  assert.match(page, /value=\{item\.product_key \|\| ''\}/)
  assert.doesNotMatch(page, /navigate\('\/admin\/bazaar\/ingredients'\)/)
  assert.doesNotMatch(page, /list="bazaar-product-suggestions"/)
  assert.doesNotMatch(page, /onChange=\{event => onUpdateItem\(index, 'category'/)
  assert.match(page, /<BazaarIngredientPicker suggestions=\{suggestions\} value=\{item\.product_key \|\| ''\}/)
  assert.match(page, /data-bazaar-line-fields="true"[^>]*className="grid items-end/)
  assert.match(page, /data-bazaar-line-notes="true"[\s\S]{0,500}<textarea[\s\S]{0,300}rows=\{3\}/)
  assert.match(page, /data-bazaar-line-summary="true"[^>]*sm:max-w-\[430px\][^>]*sm:grid-cols-2[^>]*sm:items-stretch/)
  assert.equal((page.match(/flex h-full min-h-\[70px\] flex-col justify-center/g) || []).length, 2)
  assert.doesNotMatch(page, /<input value=\{item\.notes\}/)
  assert.match(picker, /className=\{`flex h-11 w-full/)
  assert.match(picker, /bazaarCategoriesFor\(suggestions\)/)
  assert.match(picker, /visibleSections\.map\(section/)
  assert.match(picker, /onMouseEnter=\{\(\) => setActiveCategory\(section\.key\)\}/)
  assert.match(picker, /placeholder=\{l\.search\}/)
  assert.match(picker, /role="listbox"/)
  assert.match(page, /getBazaarPriceDifference\(item\)/)
  assert.match(page, /formatBazaarSignedCurrency\(priceDifference\)/)
  assert.match(page, /normalTotal=\{formNormalTotal\}/)
  assert.match(page, /difference=\{formDifference\}/)
  assert.match(page, /\.eq\('status', 'active'\)[\s\S]{0,100}\.neq\('role', 'guest'\)/)
  assert.match(page, /withWriteTimeout\([\s\S]{0,180}save_bazaar_purchase/)
  assert.match(page, /<fieldset disabled=\{saving\} className="contents">/)
  assert.match(page, /<aside className="[^"]*xl:sticky xl:top-5[^"]*">/)
  assert.doesNotMatch(page, /<aside className="sticky bottom-3/)
  assert.match(page, /signal => supabase\.rpc\('save_bazaar_purchase',[\s\S]{0,120}\.abortSignal\(signal\)/)
  assert.match(page, /loadedRangeRef\.current !== requestedRange\) setPurchases\(\[\]\)/)
  assert.doesNotMatch(page, /md:grid-cols-2 xl:grid-cols-\[minmax\(180px,1\.5fr\)/)
  assert.doesNotMatch(page, /<Field label=\{l\.supplier\}/)
  assert.doesNotMatch(page, /<Field label=\{l\.market\}/)
  assert.doesNotMatch(page, /receipt_reference|l\.reference|l\.receipt/)
})

test('Daily Bazaar dates display through shared formatters and the entry uses the shared custom calendar', () => {
  const page = readSource('src/pages/DailyBazaar.jsx')
  const rangePicker = readSource('src/components/DateRangePicker.jsx')

  assert.match(page, /function FormattedDateInput/)
  assert.match(readSource('src/components/CalendarPicker.jsx'), /formatLongDate\(value, lang, value\)/)
  assert.match(page, /<FormattedDateInput value=\{form\.purchase_date\}/)
  assert.match(page, /import DateRangePicker from '\.\.\/components\/DateRangePicker'/)
  assert.match(rangePicker, /formatLongDate\(dateFrom, lang, dateFrom\)/)
  assert.match(rangePicker, /formatLongDate\(dateTo, lang, dateTo\)/)
})

test('Daily Bazaar history defaults to today and shows only structured entries in a compact paginated ledger', () => {
  const page = readSource('src/pages/DailyBazaar.jsx')

  assert.match(page, /getBazaarRange\('today'\)/)
  assert.match(page, /useState\('today'\)/)
  assert.match(page, /purchases\.filter\(purchase => purchase\.entry_source === 'daily_bazaar'\)/)
  assert.match(page, /const HISTORY_PAGE_SIZE = 10/)
  assert.match(page, /historyRows\.slice\(start, start \+ HISTORY_PAGE_SIZE\)/)
  assert.match(page, /<th[^>]*>\{l\.productName\}<\/th>/)
  assert.match(page, /<th[^>]*>\{l\.quantity\}<\/th>/)
  assert.match(page, /<th[^>]*>\{l\.itemPrice\}<\/th>/)
  assert.match(page, /<th[^>]*>\{l\.category\}<\/th>/)
  assert.doesNotMatch(page, /<th[^>]*>\{l\.purchaseDate\}<\/th>/)
  assert.doesNotMatch(page, /<th[^>]*>\{l\.addedBy\}<\/th>/)
  assert.doesNotMatch(page, /<th[^>]*>\{l\.totalPaid\}<\/th>/)
  assert.doesNotMatch(page, /<th[^>]*>\{l\.actions\}<\/th>/)
  assert.match(page, /purchase\.created_by_name \|\| '—'/)
  assert.match(page, /formatCurrency\(item\.line_total\)/)
  assert.match(page, /data-bazaar-purchase-summary="true"/)
  assert.match(page, /const columnCount = 5/)
  assert.match(page, /colSpan=\{columnCount\} className="h-3 border-y/)
  assert.doesNotMatch(page, /rowSpan=\{rowSpan\}/)
  assert.match(page, /pageCount > 1/)
  assert.doesNotMatch(page, /function PurchaseCard/)

  const history = page.slice(page.indexOf('function BazaarHistory'), page.indexOf('function BazaarAnalytics'))
  assert.ok(history.indexOf('data-bazaar-purchase-summary="true"') < history.indexOf('{items.map((item, index) => {'))
})

test('Accounting shows one daily Bazaar total and manages its details in Daily Bazaar', () => {
  const accounting = readSource('src/pages/AccountingHistory.jsx')
  const accountingLib = readSource('src/lib/accounting.js')

  assert.match(accounting, /collapseDailyBazaarExpenseRows\(rows\)/)
  assert.match(accounting, /row\.is_bazaar_daily_total/)
  assert.match(accounting, /navigate\('\/admin\/bazaar'\)/)
  assert.match(accountingLib, /export function collapseDailyBazaarExpenseRows/)
  assert.match(accountingLib, /id: `bazaar-day:\$\{date\}`/)
  assert.match(accountingLib, /payment_method: paymentMethods\.length === 1 \? paymentMethods\[0\] : 'mixed'/)
})

test('Tech Card usage lookup returns only recipe identities to Ingredients staff', () => {
  const sql = readSource('migrations/242_bazaar_ingredient_tech_card_usage.sql')
  assert.match(sql, /returns table \(menu_item_id text, variant_option_id text\)/)
  assert.match(sql, /security definer/)
  assert.match(sql, /current_staff_can_access\('ingredients'\) is not true\s+and public\.current_staff_can_access\('tech_cards'\) is not true/)
  assert.match(sql, /lower\(btrim\(ingredient\.name\)\) = lower\(btrim\(catalog\.product_name\)\)/)
  assert.doesNotMatch(sql, /quantity|unit_price_uzs|preparation_steps/)

  const techCards = readSource('src/pages/TechCards.jsx')
  assert.match(techCards, /const requestedVariantId = searchParams\.get\('variant'\) \|\| ''/)
  assert.match(techCards, /if \(!editorVariants\.some\(option => option\.id === requestedVariantId\)\) return/)
  assert.match(techCards, /data-highlighted-ingredient=\{highlighted \|\| undefined\}/)
})
