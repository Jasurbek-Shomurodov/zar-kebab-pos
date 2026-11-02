import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canEditFeature, canViewPage, defaultPath, updateFeatureAccessSelection } from '../src/lib/permissions.js'
import { formatLongDate } from '../src/lib/dateFormat.js'
import { formatMoneyInput } from '../src/lib/moneyInput.js'
import { isInventoryObjectKey, keyFromR2Url, makeObjectKey, normalizeMenuObjectKey } from '../api/menu-image/_lib/r2.js'
import { isInventoryMediaRequest } from '../api/menu-image/_lib/auth.js'
import {
  emptyInventoryDraft, filterInventoryItems, inventoryDraftChanged, inventoryDraftError, inventoryDraftFrom,
  inventoryItemMatches, inventoryPayload, inventoryPhotoSize, normalizeInventoryCountInput, parseInventoryCount,
  upsertInventoryItem,
} from '../src/lib/inventory.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const page = () => read('src/pages/Inventory.jsx')

test('Inventory is independently shareable in Team; viewers cannot edit', () => {
  for (const role of ['admin', 'viewer', 'owner']) {
    const profile = { role, feature_access: ['inventory'] }
    assert.equal(canViewPage(profile, 'inventory'), true)
    assert.equal(canViewPage(profile, 'ingredients'), false)
    assert.equal(canEditFeature(profile, 'inventory'), role !== 'viewer')
    assert.equal(defaultPath(profile), '/admin/inventory')
  }
  assert.deepEqual(updateFeatureAccessSelection([], 'inventory', true), ['inventory'])
  assert.equal(canViewPage({ role: 'admin', feature_access: ['ingredients', 'bazaar', 'tech_cards'] }, 'inventory'), false)
  assert.equal(canViewPage({ role: 'owner', feature_access: null }, 'inventory'), true)
})

test('Inventory owns a protected lazy route and a Kitchen & stock drawer entry', () => {
  const app = read('src/App.jsx')
  assert.match(app, /const Inventory = lazy/)
  assert.match(app, /path="\/admin\/inventory"[\s\S]*?page="inventory"><Inventory/)
  const sidebar = read('src/components/UnifiedSidebar.jsx')
  assert.match(sidebar, /key: 'inventory',[\s\S]*?path: '\/admin\/inventory',\s+group: 'kitchen'/)
  assert.match(sidebar, /startsWith\('\/admin\/inventory'\)\) return 'inventory'/)
})

test('the migration enforces the feature in RLS and allows no physical deletion', () => {
  const sql = read('migrations/276_inventory_items.sql')
  assert.match(sql, /grant select, insert, update on public\.inventory_items to authenticated/)
  assert.match(sql, /revoke all on public\.inventory_items from public, anon, authenticated/)
  assert.doesNotMatch(sql, /grant[^;]*delete/i)
  assert.doesNotMatch(sql, /for delete/i)
  assert.match(sql, /using \(public\.current_staff_can_access\('inventory'\)\)/)
  assert.equal(sql.match(/public\.current_staff_can_write\('inventory'\)/g).length, 3)
  assert.match(sql, /end;\n\$\$;[\s\S]*^commit;$/m)
  assert.doesNotMatch(page(), /\.delete\(/)
})

test('photos reuse the media endpoints, confined to the inventory prefix', () => {
  assert.match(makeObjectKey({ type: 'inventory', entityId: 'a1', contentType: 'image/jpeg' }), /^menu\/inventory\/a1-.+\.jpg$/)
  assert.throws(() => makeObjectKey({ type: 'constructor', contentType: 'image/jpeg' }), /Menu media type/)
  assert.equal(normalizeMenuObjectKey('menu/inventory/plate-1.jpg'), 'menu/inventory/plate-1.jpg')
  assert.equal(normalizeMenuObjectKey('menu/inventory/../products/dish.webp'), '')
  assert.equal(isInventoryObjectKey(keyFromR2Url('menu/inventory/plate-1.jpg')), true)
  assert.equal(isInventoryObjectKey(keyFromR2Url('menu/products/dish.webp')), false)
  assert.equal(isInventoryObjectKey(keyFromR2Url('menu/inventory/../products/dish.webp')), false)
  assert.equal(isInventoryMediaRequest({ url: '/api/menu-image/upload?scope=inventory' }), true)
  assert.equal(isInventoryMediaRequest({ url: '/?scope=inventory' }), true)
  assert.equal(isInventoryMediaRequest({ url: '/api/menu-image/upload' }), false)

  const upload = read('api/menu-image/upload.js')
  assert.match(upload, /inventoryScope \? requireInventoryEditAccess\(req\) : requireMenuEditAccess\(req\)/)
  assert.match(upload, /const type = inventoryScope \? 'inventory'/)
  const remove = read('api/menu-image/delete.js')
  assert.match(remove, /inventoryScope \? requireInventoryEditAccess\(req\) : requireMenuEditAccess\(req\)/)
  assert.match(remove, /inventoryScope && !isInventoryObjectKey\(keyFromR2Url\(target\)\)/)
  assert.match(read('api/menu-image/_lib/auth.js'), /ALLOWED_ROLES\.has\(profile\?\.role\) && access\?\.includes\('inventory'\)/)
  assert.match(read('src/lib/inventoryPhoto.js'), /scope=inventory/)
})

test('counts accept only whole numbers within the database bounds', () => {
  assert.equal(normalizeInventoryCountInput(' 0120 шт'), '120')
  assert.equal(normalizeInventoryCountInput('000'), '0')
  assert.equal(parseInventoryCount('0'), 0)
  assert.equal(parseInventoryCount('1000000'), 1000000)
  assert.equal(parseInventoryCount('1000001'), null)
  assert.equal(parseInventoryCount(''), null)
  assert.equal(parseInventoryCount('1.5'), null)
})

test('drafts validate before saving and map to a retry-safe payload', () => {
  const draft = { ...emptyInventoryDraft('id-1'), name: ' Tarelka ', quantity: '40', note: '  ', image_url: '' }
  assert.equal(inventoryDraftError({ ...draft, name: '  ' }), 'nameRequired')
  assert.equal(inventoryDraftError({ ...draft, name: 'tarelka' }), 'nameStartInvalid')
  assert.equal(inventoryDraftError({ ...draft, quantity: '' }), 'countInvalid')
  assert.equal(inventoryDraftError(draft), '')
  const payload = inventoryPayload(draft)
  assert.deepEqual(payload, { id: 'id-1', name: 'Tarelka', image_url: null, quantity: 40, note: null })
  // The photo is optional, and a save never carries server-stamped fields.
  assert.equal(inventoryItemMatches({ ...payload, counted_by_name: 'Server' }, payload), true)
  assert.equal(inventoryItemMatches({ ...payload, quantity: 39 }, payload), false)
  assert.equal(inventoryItemMatches(null, payload), false)
})

test('editing detects real changes only', () => {
  const draft = inventoryDraftFrom({ id: 'a', name: 'Vilka', image_url: null, quantity: 0, note: null })
  assert.equal(draft.quantity, '0')
  assert.equal(inventoryDraftChanged({ ...draft }, draft), false)
  assert.equal(inventoryDraftChanged({ ...draft, name: 'Vilka ' }, draft), false)
  assert.equal(inventoryDraftChanged({ ...draft, quantity: '3' }, draft), true)
  assert.equal(inventoryDraftChanged({ ...draft, image_url: 'https://x/y.jpg' }, draft), true)
})

test('lists filter by status and name, and saved rows replace in sorted order', () => {
  const items = [
    { id: '1', name: 'Tarelka', is_active: true },
    { id: '2', name: 'Вилка', is_active: true },
    { id: '3', name: 'Qoshiq', is_active: false },
  ]
  assert.deepEqual(filterInventoryItems(items).map(item => item.id), ['1', '2'])
  assert.deepEqual(filterInventoryItems(items, { status: 'archived' }).map(item => item.id), ['3'])
  assert.deepEqual(filterInventoryItems(items, { query: 'ВИЛ' }).map(item => item.id), ['2'])
  assert.deepEqual(upsertInventoryItem(items, { id: '1', name: 'Aaa', is_active: true }).map(item => item.name), ['Aaa', 'Qoshiq', 'Вилка'])
})

test('large photos shrink to the display limit and small ones keep their size', () => {
  assert.deepEqual(inventoryPhotoSize(4032, 3024), { width: 1280, height: 960 })
  assert.deepEqual(inventoryPhotoSize(800, 600), { width: 800, height: 600 })
})

test('card counts keep zero and group thousands without browser locale formatting', () => {
  assert.equal(formatMoneyInput(0), '0')
  assert.equal(formatMoneyInput(1200), '1 200')
})

test('the last-count date uses the Tashkent business day', () => {
  assert.equal(formatLongDate('2026-11-01T20:00:00+00:00', 'en'), formatLongDate('2026-11-02', 'en'))
})

test('loading shimmers, reads page past the row cap, and language never reloads', () => {
  const source = page()
  assert.match(source, /layout="inventoryCards"/)
  assert.match(read('src/components/PageShimmer.jsx'), /startsWith\('\/admin\/inventory'\)\) return 'inventory'/)
  assert.match(source, /loadSalaryRows\(\(\) => supabase\.from\('inventory_items'\)/)
  const loader = source.slice(source.indexOf('const loadItems ='), source.indexOf('useEffect(() => { loadItems()'))
  assert.match(loader, /\}, \[\]\)/)
  assert.doesNotMatch(loader, /\blang\b|\bl\./)
  assert.doesNotMatch(source, /window\.confirm|alert\(/)
})

test('saves are idempotent and uncertain outcomes reconcile before retrying', () => {
  const source = page()
  assert.match(source, /emptyInventoryDraft\(crypto\.randomUUID\(\)\)/)
  assert.match(source, /upsert\(payload, \{ onConflict: 'id' \}\)/)
  assert.match(source, /reconcile: readInventoryItem\(payload\.id, row => inventoryItemMatches\(row, payload\)\)/)
  // Keep a replaced photo until the save is confirmed, and an uploaded one while the outcome is unknown.
  assert.match(source, /setItems\(current => upsertInventoryItem\(current, data\)\)\s+if \(original\.image_url && original\.image_url !== data\.image_url\) deleteInventoryPhoto/)
  assert.match(source, /saveOutcomeUnknownRef\.current = isBazaarIngredientNetworkError\(saveError\)/)
})

test('copy exists in all three languages and the note stays multi-line', () => {
  const source = page()
  const keysFor = code => {
    const start = source.indexOf(`  ${code}: {`)
    const end = source.indexOf('\n  },', start)
    return [...source.slice(start, end).matchAll(/(\w+): (?:'|name =>|count =>|\(date)/g)].map(match => match[1]).sort()
  }
  assert.ok(keysFor('en').length > 30)
  assert.deepEqual(keysFor('ru'), keysFor('en'))
  assert.deepEqual(keysFor('uz'), keysFor('en'))
  assert.match(source, /<textarea value=\{form\.note\}/)
})
