import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Tech Cards is lazy-routed behind its own page access and appears in the drawer', () => {
  const app = source('src/App.jsx')
  const sidebar = source('src/components/UnifiedSidebar.jsx')

  assert.match(app, /const TechCards = lazy\(\(\) => import\('\.\/pages\/TechCards'\)\)/)
  assert.match(app, /path="\/admin\/tech-cards"[\s\S]{0,120}page="tech_cards"><TechCards/)
  assert.match(app, /path="\/admin\/tech-cards\/:menuItemId"[\s\S]{0,120}page="tech_cards"><TechCards/)
  assert.match(sidebar, /key: 'tech_cards',[\s\S]{0,180}path: '\/admin\/tech-cards'/)
  assert.doesNotMatch(sidebar, /key: 'tech_cards',[\s\S]{0,120}accessKey: 'menu'/)
  assert.match(sidebar, /pathname\.startsWith\('\/admin\/tech-cards'\)\) return 'tech_cards'/)
})

test('Tech Cards appears as an independent Team page-access option', () => {
  const permissions = source('src/lib/permissions.js')
  const users = source('src/pages/AdminUsers.jsx')

  assert.match(permissions, /key: 'tech_cards',\s*kind: 'page'/)
  assert.match(permissions, /labels: \{ uz: 'Texnologik kartalar', ru: 'Техкарты', en: 'Tech Cards' \}/)
  assert.match(users, /FEATURE_DEFINITIONS\.filter\(feature => feature\.kind === 'page'\)/)
})

test('Tech Cards exposes a prominent meal-category filter with counts and localized names', () => {
  const page = source('src/pages/TechCards.jsx')

  assert.match(page, /categories: 'Meal categories'/)
  assert.match(page, /const \[categoryFilter, setCategoryFilter\] = useState\('all'\)/)
  assert.match(page, /counts\[item\.category_id\] = \(counts\[item\.category_id\] \|\| 0\) \+ 1/)
  assert.match(page, /item\.category_id !== categoryFilter/)
  assert.match(page, /aria-labelledby="tech-card-categories-heading"/)
  assert.match(page, /<CategoryFilterTile/)
  assert.match(page, /getCategoryName\(category, lang\)/)
  assert.match(page, /count=\{category\.id === 'all' \? techCardItems\.length : categoryCounts\[category\.id\]\}/)
})

test('Tech Cards omit categories that do not require recipes', () => {
  const page = source('src/pages/TechCards.jsx')
  const adminMenu = source('src/pages/AdminMenu.jsx')
  const helpers = source('src/lib/techCards.js')

  assert.match(helpers, /'alcohol',[\s\S]*'utensils',[\s\S]*'carbonated drinks'/)
  assert.match(page, /const techCardItems = useMemo[\s\S]{0,180}isTechCardEligibleMenuItem/)
  assert.match(page, /const editorItem = menuItemId \? techCardItems\.find/)
  assert.match(adminMenu, /canViewTechCards && isTechCardEligibleMenuItem\(form, state\.categories\)/)
})

test('Tech Card meals are grouped under visible category section titles', () => {
  const page = source('src/pages/TechCards.jsx')

  assert.match(page, /const filteredSections = useMemo/)
  assert.match(page, /label: getCategoryName\(category, lang\)/)
  assert.match(page, /sections\.push\(\{ id: 'other', label: l\.otherCategory, items: otherItems \}\)/)
  assert.match(page, /filteredSections\.map\(section =>/)
  assert.match(page, /aria-labelledby=\{`tech-card-section-\$\{section\.id\}`\}/)
  assert.match(page, /section\.items\.length/)
  assert.match(page, /section\.items\.map\(item =>/)
})

test('completed Tech Card list items show estimated profit as a badge', () => {
  const page = source('src/pages/TechCards.jsx')

  assert.match(page, /const cardProfit = summary\?\.portionCost == null[\s\S]{0,180}getSaleProfitSummary/)
  assert.match(page, /\{formatDecimal\(cardProfit\.marginPct, lang, 1\)\}%/)
  assert.doesNotMatch(page, /formatCurrencyWithPercentage\(cardProfit\.profit, cardProfit\.marginPct, lang\)/)
  assert.doesNotMatch(page, /\{l\.estimatedProfit\}: \{formatCurrencyWithPercentage\(cardProfit\.profit/)
  assert.match(page, /absolute -left-5 top-3 w-20 -rotate-45/)
  assert.match(page, /cardProfit\.profit >= 0 \? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'/)
})

test('Tech Card list items omit the redundant category subtitle', () => {
  const page = source('src/pages/TechCards.jsx')

  assert.doesNotMatch(page, /truncate text-\[11px\][^>]*>\{category \? getCategoryName\(category, lang\) : '—'\}/)
})

test('Tech Card list items keep only the profit badge', () => {
  const page = source('src/pages/TechCards.jsx')

  assert.doesNotMatch(page, />\{l\.ready\}<\/span>/)
  assert.doesNotMatch(page, /\{card\.ingredients\.length\} \{l\.ingredients\.toLowerCase\(\)\}/)
  assert.doesNotMatch(page, /formatDecimal\(card\.portion_count, lang\)/)
})

test('separate Tech Cards access is enforced by the profile constraint and recipe RLS', () => {
  const migration = source('migrations/140_tech_card_feature_access.sql')

  assert.match(migration, /profiles_feature_access_valid/)
  assert.match(migration, /'bazaar', 'tech_cards', 'team'/)
  assert.match(migration, /menu_item_tech_cards for select[\s\S]{0,120}current_staff_can_access\('tech_cards'\)/)
  assert.match(migration, /menu_item_tech_card_ingredients for select[\s\S]{0,120}current_staff_can_access\('tech_cards'\)/)
  assert.match(migration, /current_staff_can_access\('tech_cards'\)[\s\S]{0,100}current_staff_can_write\('menu'\)/)
  assert.match(migration, /array\['dashboard', 'menu', 'expenses', 'tech_cards'\]/)
})

test('Tech card migration protects recipe prices and saves a whole recipe atomically', () => {
  const migration = source('migrations/139_menu_item_tech_cards.sql')

  assert.match(migration, /create table if not exists public\.menu_item_tech_cards/)
  assert.match(migration, /create table if not exists public\.menu_item_tech_card_ingredients/)
  assert.match(migration, /revoke all on table public\.menu_item_tech_cards from public, anon, authenticated/)
  assert.match(migration, /current_staff_can_write\('menu'\)/)
  assert.match(migration, /create or replace function public\.save_menu_item_tech_card\(payload jsonb\)/)
  assert.match(migration, /delete from public\.menu_item_tech_card_ingredients[\s\S]*insert into public\.menu_item_tech_card_ingredients/)
  assert.doesNotMatch(migration, /update public\.menu_item_costs|insert into public\.menu_item_costs/)
})

test('set composition is structured, cycle-safe, and snapshotted onto new order items', () => {
  const migration = source('migrations/149_tech_card_menu_item_components.sql')
  const page = source('src/pages/TechCards.jsx')

  assert.match(migration, /create table if not exists public\.menu_item_tech_card_components/)
  assert.match(migration, /component_menu_item_id text not null references public\.menu_items\(id\)/)
  assert.match(migration, /current_staff_can_access\('tech_cards'\)[\s\S]{0,120}current_staff_can_write\('menu'\)/)
  assert.match(migration, /reject_recursive_tech_card_component/)
  assert.match(migration, /add column if not exists tech_card_component_snapshot jsonb not null default '\[\]'::jsonb/)
  assert.match(migration, /create trigger order_items_snapshot_tech_card_components/)
  assert.match(migration, /'quantity', component\.quantity/)
  assert.match(migration, /delete from public\.menu_item_tech_card_components[\s\S]*insert into public\.menu_item_tech_card_components/)
  assert.doesNotMatch(migration, /update public\.menu_item_costs|insert into public\.menu_item_costs/)
  assert.match(page, /supabase\.from\('menu_item_tech_card_components'\)/)
  assert.match(page, /createBlankTechCardComponent/)
  assert.match(page, /l\.includedItems/)
  assert.match(page, /<MenuItemPicker/)
  assert.match(page, /calculateTechCardSummary\(form, activeItems\)/)
  assert.doesNotMatch(page, /<select[\s\S]{0,300}component\.component_menu_item_id/)
})

test('Tech Card components persist selected variants for cost, snapshots, and stock', () => {
  const migration = source('migrations/154_tech_card_component_variants.sql')
  const helpers = source('src/lib/techCards.js')
  const page = source('src/pages/TechCards.jsx')

  assert.match(migration, /add column if not exists selected_options jsonb not null/)
  assert.match(migration, /unique \(menu_item_id, component_menu_item_id, selected_options\)/)
  assert.match(migration, /'selected_options', component\.selected_options/)
  assert.match(migration, /component_selected_options := coalesce\(component -> 'selected_options'/)
  assert.match(migration, /decrement_selected_variant_stock\([\s\S]*component -> 'selected_options'/)
  assert.match(helpers, /getTechCardComponentUnitCost/)
  assert.match(helpers, /variant_costs/)
  assert.match(page, /selectedOptions=\{component\.selected_options\}/)
})

test('Tech Card included dishes accept fractional recipe quantities', () => {
  const migration = source('migrations/159_fractional_tech_card_components.sql')
  const helpers = source('src/lib/techCards.js')
  const page = source('src/pages/TechCards.jsx')

  assert.match(migration, /drop trigger if exists tech_card_components_validate_quantity/)
  assert.match(migration, /drop function if exists public\.validate_tech_card_component_quantity\(\)/)
  assert.doesNotMatch(helpers, /Piece-based included menu items require a whole quantity/)
  assert.match(page, /inputMode="decimal"[\s\S]{0,120}value=\{component\.quantity\}/)
})

test('Tech Card included-item picker is searchable and grouped by menu category', () => {
  const picker = source('src/components/MenuItemPicker.jsx')

  assert.match(picker, /Meal or category/)
  assert.match(picker, /getCategoryName/)
  assert.match(picker, /visibleSections/)
  assert.match(picker, /MenuMedia/)
  assert.match(picker, /getMenuItemOptionGroups\(item, lang, \{ includeUnavailable: true \}\)/)
  assert.match(picker, /group-hover:grid-rows-\[1fr\]/)
  assert.match(picker, /group-focus-within:grid-rows-\[1fr\]/)
  assert.match(picker, /selectItem\(item\.id, \{ \[group\.id\]: option\.id \}\)/)
  assert.match(picker, /document\.addEventListener\('pointerdown'/)
})

test('Tech Card ingredients come from the active Bazaar catalog and lock the normal price', () => {
  const page = source('src/pages/TechCards.jsx')
  const migration = source('migrations/171_tech_card_bazaar_ingredient_catalog_access.sql')

  assert.match(page, /from\('bazaar_product_catalog'\)[\s\S]{0,260}eq\('is_catalog_managed', true\)[\s\S]{0,120}eq\('is_active', true\)/)
  assert.match(page, /<BazaarIngredientPicker[\s\S]{0,500}getBazaarIngredientTechCardPatch\(selected\)/)
  assert.match(page, /fallbackLabel=\{ingredient\.name\}/)
  assert.match(page, /value=\{formatTechCardUnitPrice\(ingredient\.unit_price_uzs\)\} disabled className="[^"]*cursor-not-allowed/)
  assert.doesNotMatch(page, /updateIngredient\(index, \{ unit_price_uzs:/)
  assert.match(migration, /current_staff_can_access\('bazaar'\)[\s\S]{0,100}current_staff_can_access\('tech_cards'\)/)
  assert.doesNotMatch(migration, /bazaar_purchases|bazaar_purchase_items/)
})

test('included-item controls stay top-aligned when the real-cost line is visible', () => {
  const page = source('src/pages/TechCards.jsx')

  assert.match(page, /sm:grid-cols-\[minmax\(220px,1fr\)_130px_40px\] sm:items-start/)
  assert.match(page, /aria-label="Remove included menu item"[\s\S]{0,240}sm:mt-\[22px\]/)
  assert.match(page, /l\.savedCost[\s\S]{0,260}componentSummary\.lineCost/)
})

test('menu product editor links directly to its tech card', () => {
  const adminMenu = source('src/pages/AdminMenu.jsx')
  assert.match(adminMenu, /navigate\(`\/admin\/tech-cards\/\$\{encodeURIComponent\(form\.id\)\}`\)/)
})

test('saved tech-card cost replaces and locks the current menu real cost only', () => {
  const migration = source('migrations/155_tech_card_real_costs.sql')
  const adminMenu = source('src/pages/AdminMenu.jsx')
  const techCards = source('src/pages/TechCards.jsx')
  const db = source('src/lib/db.js')

  assert.match(migration, /add column if not exists cost_source text not null default 'manual'/)
  assert.match(migration, /calculate_menu_item_tech_card_real_cost/)
  assert.match(migration, /ingredient\.quantity \* ingredient\.unit_price_uzs/)
  assert.match(migration, /ingredient_batch_cost \/ target_portion_count/)
  assert.match(migration, /jsonb_each_text\(component\.selected_options\)/)
  assert.match(migration, /item_cost\.variant_costs \? selected\.value/)
  assert.match(migration, /order by selected\.key/)
  assert.match(migration, /item_cost\.cost_price::numeric/)
  assert.match(migration, /new\.cost_source := 'tech_card'/)
  assert.match(migration, /new\.cost_source := 'manual'/)
  assert.match(migration, /set cost_source = 'manual'[\s\S]{0,220}not exists/)
  assert.match(migration, /sync_menu_item_tech_card_real_costs/)
  assert.doesNotMatch(migration, /update public\.order_items|delete from public\.order_items/)

  assert.match(db, /cost_source: protectedCosts\?\.cost_source === 'tech_card' \? 'tech_card' : 'manual'/)
  assert.match(db, /case 'UPDATE_MENU_ITEM':[\s\S]{0,420}cost_source: _costSource,[\s\S]{0,180}\.\.\.fields/)
  assert.match(adminMenu, /const techCardCost = isTechCardMenuItemCost\(form\)/)
  assert.match(adminMenu, /disabled=\{techCardCost\}/)
  assert.match(adminMenu, /techCardCost \? labels\.techCardHint : labels\.hint/)
  assert.match(techCards, /cost_source: 'tech_card'/)
})

test('database health requires the tech-card schema and atomic save RPC', () => {
  const health = source('src/lib/dbHealth.js')
  const cli = source('scripts/check-db-health.js')

  assert.match(health, /name: 'menu_item_tech_cards'/)
  assert.match(health, /name: 'menu_item_tech_card_ingredients'/)
  assert.match(health, /name: 'menu_item_tech_card_components'[\s\S]{0,220}'selected_options'/)
  assert.match(health, /tech_card_component_snapshot/)
  assert.match(health, /checkRpc\(dbClient, 'save_menu_item_tech_card'\)/)
  assert.match(cli, /checkTable\('menu_item_tech_cards'/)
  assert.match(cli, /checkTable\('menu_item_tech_card_components'[\s\S]{0,160}selected_options/)
  assert.match(cli, /tech_card_component_snapshot/)
  assert.match(cli, /save_menu_item_tech_card\(payload\)/)
})
