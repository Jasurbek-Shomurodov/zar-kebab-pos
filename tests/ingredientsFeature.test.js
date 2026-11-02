import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canViewPage, canEditFeature, defaultPath, updateFeatureAccessSelection } from '../src/lib/permissions.js'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Ingredients is independently shareable in Team; viewers cannot edit', () => {
  for (const role of ['admin', 'viewer', 'owner']) {
    const profile = { role, feature_access: ['ingredients'] }
    assert.equal(canViewPage(profile, 'ingredients'), true)
    assert.equal(canViewPage(profile, 'bazaar'), false)
    assert.equal(canViewPage(profile, 'tech_cards'), false)
    assert.equal(canEditFeature(profile, 'ingredients'), role !== 'viewer')
    assert.equal(defaultPath(profile), '/admin/ingredients')
  }
  assert.deepEqual(updateFeatureAccessSelection([], 'ingredients', true), ['ingredients'])
  assert.equal(canViewPage({ role: 'admin', feature_access: ['bazaar', 'tech_cards'] }, 'ingredients'), false)
})

test('Ingredients owns its route and drawer entry, with a legacy redirect', () => {
  const app = read('src/App.jsx')
  assert.match(app, /path="\/admin\/ingredients"[\s\S]*?page="ingredients"><BazaarIngredients/)
  assert.match(app, /path="\/admin\/bazaar\/ingredients" element={<Navigate to="\/admin\/ingredients" replace/)
  assert.match(read('src/components/UnifiedSidebar.jsx'), /key: 'ingredients',[\s\S]*?path: '\/admin\/ingredients'/)
  assert.doesNotMatch(read('src/pages/DailyBazaar.jsx'), /\/admin\/bazaar\/ingredients/)
  assert.match(read('src/pages/BazaarIngredients.jsx'), /canEditFeature\(profile \|\| state.user, 'ingredients'\)/)
})

test('movement is a permission-checked aggregate and keeps raw recipe snapshots private', () => {
  const sql = read('migrations/186_ingredients_feature_and_movement.sql')
  assert.match(sql, /current_staff_can_access\('ingredients'\) is not true/)
  assert.match(sql, /p\.role::text in \('owner', 'admin'\)/)
  assert.match(sql, /p\.status::text = 'active'/)
  assert.match(sql, /revoke all on function public\.get_ingredient_movement\(date, date\) from public, anon/)
  assert.doesNotMatch(sql, /grant.*order_item_tech_card_ingredient_snapshots/i)
  assert.doesNotMatch(sql, /update public\.order_item_tech_card_ingredient_snapshots/i)
  assert.match(sql, /uncovered_items/)
  assert.match(sql, /Asia\/Tashkent/)
  const ui = read('src/components/IngredientMovement.jsx')
  assert.match(ui, /rpc\('get_ingredient_movement'/)
  assert.doesNotMatch(ui, /\.from\(/)
  assert.match(ui, /opening stock, waste, and stock adjustments/)
})

test('adding ingredients never mounts or imports the purchases and usage loader', () => {
  const catalog = read('src/pages/BazaarIngredients.jsx')
  assert.doesNotMatch(catalog, /IngredientMovement|get_ingredient_movement|bazaar_purchases/)
  assert.match(catalog, /IngredientNavigation/)
  assert.match(read('src/pages/IngredientUsage.jsx'), /<IngredientMovement lang=\{lang\}/)
  assert.match(read('src/App.jsx'), /const IngredientUsage = lazy/)
  assert.match(read('src/App.jsx'), /path="\/admin\/ingredients\/usage"[\s\S]*?page="ingredients"><IngredientUsage/)
  assert.doesNotMatch(read('src/components/IngredientNavigation.jsx'), /supabase|IngredientMovement|useEffect/)
})

test('language changes cannot restart ingredient data loaders', () => {
  const movement = read('src/components/IngredientMovement.jsx')
  const catalog = read('src/pages/BazaarIngredients.jsx')
  // Only the requested date range and explicit retry can restart movement reads.
  assert.match(movement, /\}, \[from, to, retry\]\)/)
  assert.match(movement, /setError\('failed'\)/)
  assert.match(movement, /\{l\[error\]\}/)
  const loader = catalog.slice(catalog.indexOf('const loadIngredients ='), catalog.indexOf('const displayedError ='))
  assert.match(loader, /\}, \[\]\)/)
  assert.doesNotMatch(loader, /\blang\b|\bl\.|errorMessage/)
  assert.match(catalog, /loadFailure \? errorMessage\(loadFailure, l.loadFailed\)/)
  assert.match(read('AGENTS.md'), /Language changes update presentation only/)
})

test('movement resolves keyless snapshot names once per distinct name, not per sold element', () => {
  const sql = read('migrations/275_ingredient_movement_distinct_key_lookup.sql')
  assert.match(sql, /public\.ingredient_catalog_key\(names\.name\)[\s\S]*from \(select distinct name from sold where product_key is null\) names/)
  assert.equal(sql.match(/ingredient_catalog_key\(/g).length, 1)
  assert.match(sql, /from movements m join public\.bazaar_product_catalog c\s+on c\.product_key = m\.product_key and c\.is_catalog_managed is true/)
  assert.match(sql, /current_staff_can_access\('ingredients'\) is not true/)
  assert.match(sql, /revoke all on function public\.get_ingredient_movement\(date, date\) from public, anon/)
})

test('movement is restricted to explicitly added ingredients at the database boundary', () => {
  const sql = read('migrations/188_managed_ingredient_movement.sql')
  assert.match(sql, /from movements m join public\.bazaar_product_catalog c\s+on c\.product_key = m\.product_key and c\.is_catalog_managed is true/)
  assert.doesNotMatch(sql, /left join public\.bazaar_product_catalog|update public\.|delete from public\./i)
  assert.doesNotMatch(sql, /c\.is_active/)
  assert.doesNotMatch(read('src/components/IngredientMovement.jsx'), /activity === 'unmatched'/)
})
