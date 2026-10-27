import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGoogleFoodMenu,
  canonicalFoodMenu,
  diffFoodMenus,
  excludedCategoryNames,
  runGoogleMenuSync,
} from '../api/google-reviews/_lib/menuSync.js'

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

const categories = [
  { id: 'drinks', name_en: 'Drinks', name_ru: 'Напитки', name_uz: 'Ichimliklar', sort_order: 2 },
  { id: 'shash', name_en: 'Shashleek', name_ru: 'Шашлык', name_uz: 'Shashlik', sort_order: 1 },
  { id: 'utensils', name_en: 'Utensils', name_ru: 'Приборы', name_uz: 'Idishlar', sort_order: 3 },
]

const items = [
  {
    id: 'beef', category_id: 'shash', sort_order: 1, price: 35000, kcal: 420, grams: 150,
    name_en: 'Beef Shashleek', name_ru: 'Шашлык из говядины', name_uz: 'Mol go‘shti shashlik',
    description_en: 'Charcoal-grilled\nbeef', description_ru: 'Говядина на углях', description_uz: '',
    image_url: 'https://cdn.example/beef.png',
  },
  {
    id: 'cola', category_id: 'drinks', sort_order: 1, price: 20000, millilitres: 0,
    name_en: 'Coca-Cola', name_ru: 'Кока-кола', name_uz: 'Koka-kola', image_url: 'https://cdn.example/cola.webp',
    option_groups: [{ id: 'variants', required: true, options: [
      { label_en: 'Cola 1L', label_ru: 'Кола 1л', label_uz: 'Kola 1l', price: 17000, price_delta: 0 },
      { label_en: 'Cola 1.5L', label_ru: 'Кола 1,5л', label_uz: 'Kola 1,5l', price: 0, price_delta: 2000 },
      { label_en: 'Hidden', price: 5000, public_hidden: true },
    ] }],
  },
  { id: 'fork', category_id: 'utensils', sort_order: 1, price: 3000, name_en: 'Fork', image_url: 'https://cdn.example/fork.png' },
]

test('Google menu mirrors POS names, descriptions, prices, tourist prices and photos', () => {
  const menu = buildGoogleFoodMenu(categories, items, { 'https://cdn.example/beef.png': 'KEY_BEEF' }, {
    excludedCategories: excludedCategoryNames({}),
  })
  const sections = menu.menus[0].sections
  assert.deepEqual(sections.map(section => section.labels[0].displayName), ['Shashleek', 'Drinks'], 'POS order, Utensils excluded')

  const beef = sections[0].items[0]
  assert.deepEqual(beef.labels.map(label => label.languageCode), ['en', 'ru', 'uz'])
  assert.equal(beef.labels[0].description, '150 g · 420 kcal — Charcoal-grilled beef')
  assert.equal(beef.labels[1].description, '150 г · 420 ккал — Говядина на углях')
  assert.equal(beef.labels[2].description, '150 g · 420 kcal — Charcoal-grilled\nbeef'.replace('\n', ' '), 'English fallback')
  assert.deepEqual(beef.attributes.price, { currencyCode: 'UZS', units: '35000' })
  assert.deepEqual(beef.attributes.mediaKeys, ['KEY_BEEF'])
  assert.deepEqual(beef.attributes.nutritionFacts, { calories: { lowerAmount: 420, unit: 'CALORIE' } })
  assert.equal(beef.options.length, 1)
  assert.equal(beef.options[0].labels[0].displayName, 'Tourist price')
  assert.equal(beef.options[0].attributes.price.units, '42000', 'tourist = ×1.2 rounded to 1000')

  const cola = sections[1].items[0]
  assert.equal(cola.attributes.price.units, '17000', 'cheapest public variant')
  assert.equal(cola.attributes.mediaKeys, undefined, 'no photo until uploaded')
  assert.deepEqual(cola.options.map(option => [option.labels[0].displayName, option.attributes.price.units]), [
    ['Cola 1L', '17000'], ['Cola 1L — tourist', '20000'],
    ['Cola 1.5L', '22000'], ['Cola 1.5L — tourist', '26000'],
  ], 'zero-priced variant uses parent + delta; hidden variants omitted')
})

test('menu comparison ignores whitespace Google collapses and the resource name', () => {
  const menu = buildGoogleFoodMenu(categories, items, {}, { excludedCategories: excludedCategoryNames({}) })
  const fromGoogle = JSON.parse(JSON.stringify(menu).replace('Charcoal-grilled beef', 'Charcoal-grilled  beef'))
  fromGoogle.name = 'accounts/1/locations/2/foodMenus'
  assert.equal(canonicalFoodMenu(fromGoogle), canonicalFoodMenu(menu))
  fromGoogle.menus[0].sections[0].items[0].attributes.price.units = '30000'
  assert.notEqual(canonicalFoodMenu(fromGoogle), canonicalFoodMenu(menu))
})

test('menu changes are listed by Russian name: prices, new, removed and updated items', () => {
  const excluded = { excludedCategories: excludedCategoryNames({}) }
  const before = buildGoogleFoodMenu(categories, items, { 'https://cdn.example/beef.png': 'OLD' }, excluded)
  const changed = items.filter(item => item.id !== 'cola').map(item => item.id === 'beef'
    ? { ...item, price: 40000, description_ru: 'Новое описание' }
    : item)
  changed.push({ id: 'lamb', category_id: 'shash', sort_order: 2, price: 55000, name_en: 'Lamb Shashleek', name_ru: 'Шашлык из баранины', image_url: 'x.png' })
  const after = buildGoogleFoodMenu(categories, changed, { 'https://cdn.example/beef.png': 'NEW' }, excluded)
  const diff = diffFoodMenus(before, after)
  assert.deepEqual(diff.priceChanges, [{ name: 'Шашлык из говядины', from: 35000, to: 40000 }])
  assert.deepEqual(diff.added, [{ name: 'Шашлык из баранины', section: 'Shashleek', price: 55000 }])
  assert.deepEqual(diff.removed, [{ name: 'Кока-кола', section: 'Drinks', price: 17000 }])
  assert.deepEqual(diff.updated, [{ name: 'Шашлык из говядины', fields: ['description', 'photo', 'options'] }])
  assert.deepEqual(diffFoodMenus(after, after), { added: [], removed: [], priceChanges: [], updated: [] })
})

function fakeSupabase({ photoKeys = [], menuItems = items } = {}) {
  const saved = []
  const rowsFor = table => ({ menu_categories: categories, menu_items: menuItems, google_menu_photo_keys: photoKeys })[table]
  const query = table => {
    const result = { data: rowsFor(table), error: null }
    const chain = {
      select: () => chain,
      is: () => chain,
      order: () => chain,
      range: async (from, to) => ({ data: result.data.slice(from, to + 1), error: null }),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      upsert: async row => { saved.push(row); return { error: null } },
    }
    return chain
  }
  return { from: query, saved }
}

const env = {
  GOOGLE_BUSINESS_CLIENT_ID: 'client',
  GOOGLE_BUSINESS_CLIENT_SECRET: 'secret',
  GOOGLE_BUSINESS_REFRESH_TOKEN: 'refresh',
  GOOGLE_BUSINESS_ACCOUNT_ID: '123',
  GOOGLE_BUSINESS_LOCATION_ID: '456',
}

test('daily sync uploads only new photos, saves their keys, and publishes only on change', async () => {
  const supabase = fakeSupabase({ photoKeys: [{ image_url: 'https://cdn.example/cola.webp', media_key: 'KEY_COLA' }] })
  const calls = []
  let liveMenu = { menus: [] }
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body })
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'token' })
    if (url.endsWith('/media') && options.method === 'POST') {
      const body = JSON.parse(options.body)
      assert.equal(body.sourceUrl, 'https://cdn.example/beef.png')
      assert.equal(body.locationAssociation.category, 'MENU')
      return response({ name: 'accounts/123/locations/456/media/KEY_BEEF' })
    }
    if (url.endsWith('/foodMenus') && options.method === 'PATCH') {
      liveMenu = JSON.parse(options.body)
      return response(liveMenu)
    }
    if (url.endsWith('/foodMenus')) return response(liveMenu)
    throw new Error(`Unexpected ${url}`)
  }

  const first = await runGoogleMenuSync({ env, fetchImpl, supabase })
  assert.equal(first.mode, 'published')
  assert.equal(first.items, 2)
  assert.equal(first.photosUploaded, 1)
  assert.deepEqual(supabase.saved, [{ image_url: 'https://cdn.example/beef.png', media_key: 'KEY_BEEF' }])
  assert.equal(calls.some(call => call.url.includes('fork')), false, 'excluded categories never upload photos')
  const patched = JSON.parse(calls.find(call => call.method === 'PATCH').body)
  assert.equal(patched.name, 'accounts/123/locations/456/foodMenus')
  assert.deepEqual(patched.menus[0].sections[1].items[0].attributes.mediaKeys, ['KEY_COLA'])

  const secondSupabase = fakeSupabase({ photoKeys: [
    { image_url: 'https://cdn.example/cola.webp', media_key: 'KEY_COLA' },
    { image_url: 'https://cdn.example/beef.png', media_key: 'KEY_BEEF' },
  ] })
  calls.length = 0
  const second = await runGoogleMenuSync({ env, fetchImpl, supabase: secondSupabase })
  assert.equal(second.mode, 'unchanged')
  assert.equal(calls.some(call => call.method === 'PATCH' || call.url.endsWith('/media')), false)
})

test('a failed photo upload still publishes the menu and reports the failure', async () => {
  const supabase = fakeSupabase({ menuItems: items.filter(item => item.id === 'beef') })
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'token' })
    if (url.endsWith('/media')) return response({ error: { message: 'Image too small' } }, 400)
    if (url.endsWith('/foodMenus') && options.method === 'PATCH') return response(JSON.parse(options.body))
    return response({ menus: [] })
  }
  const result = await runGoogleMenuSync({ env, fetchImpl, supabase })
  assert.equal(result.mode, 'published')
  assert.equal(result.photoFailures.length, 1)
  assert.match(result.photoFailures[0].error, /Image too small/)
  assert.deepEqual(supabase.saved, [])
})

test('an empty POS read never wipes the Google menu', async () => {
  const supabase = fakeSupabase({ menuItems: [] })
  let patched = false
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'token' })
    if (options.method === 'PATCH') patched = true
    return response({ menus: [] })
  }
  await assert.rejects(runGoogleMenuSync({ env, fetchImpl, supabase }), /empty Google menu/)
  assert.equal(patched, false)
})
