import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildYandexMenuYml, serveYandexMenuFeed, serveYandexMenuPhoto, yandexPictureUrl } from '../api/yandex-menu/_lib/yandexFeed.js'
import { excludedCategoryNames } from '../api/_lib/posMenu.js'

const categories = [
  { id: 'drinks', name_en: 'Drinks', name_ru: 'Напитки', sort_order: 2 },
  { id: 'shash', name_en: 'Shashleek', name_ru: 'Шашлык', sort_order: 1 },
  { id: 'utensils', name_en: 'Utensils', name_ru: 'Приборы', sort_order: 3 },
]

const items = [
  {
    id: 'zk_beef', category_id: 'shash', sort_order: 1, price: 35000, kcal: 420, grams: 150,
    name_ru: 'Шашлык из говядины', description_ru: 'Говядина & лук <на углях>',
    image_url: 'https://cdn.example/beef.jpg',
  },
  {
    id: 'plov', category_id: 'shash', sort_order: 2, price: 40000, name_ru: 'Плов', image_url: 'https://cdn.example/plov.webp',
    option_groups: [{ id: 'variants', options: [
      { id: 'kazy', label_ru: 'Казы', price: 55000 },
      { id: 'hidden', label_ru: 'Скрытый', price: 1000, public_hidden: true },
    ] }],
  },
  {
    id: 'cola', category_id: 'drinks', sort_order: 1, price: 20000, name_ru: 'Кока-Кола',
    option_groups: [{ id: 'variants', options: [{ id: '1l', label_ru: 'Кока-Кола 1L', price_delta: 5000 }] }],
  },
  { id: 'free', category_id: 'drinks', sort_order: 2, price: 0, name_ru: 'Вода' },
  { id: 'fork', category_id: 'utensils', sort_order: 1, price: 1000, name_ru: 'Вилка' },
]

const options = { excludedCategories: excludedCategoryNames({}) }

test('Yandex feed lists POS sections in order with UZS regular and tourist prices', () => {
  const { yml, offers } = buildYandexMenuYml(categories, items, options)
  assert.equal(offers, 6)
  assert.match(yml, /<category id="1">Шашлык<\/category>\s*<category id="2">Напитки<\/category>/)
  assert.doesNotMatch(yml, /Приборы|Вилка/)
  assert.match(yml, /<offer id="zk-beef">\s*<name>Шашлык из говядины<\/name>\s*<vendor>Zar Kebab<\/vendor>\s*<categoryId>1<\/categoryId>\s*<price>35000<\/price>\s*<currencyId>UZS<\/currencyId>/)
  assert.match(yml, /<offer id="zk-beef-t">\s*<name>Шашлык из говядины — для туристов<\/name>[\s\S]*?<price>42000<\/price>/)
  assert.match(yml, /<description>150 г · 420 ккал — Говядина &amp; лук &lt;на углях&gt;<\/description>/)
  assert.match(yml, /<picture>https:\/\/cdn\.example\/beef\.jpg<\/picture>/)
})

test('Yandex feed names variants, hides hidden ones, and skips WebP photos and zero prices', () => {
  const { yml } = buildYandexMenuYml(categories, items, options)
  assert.match(yml, /<offer id="plov-kazy">\s*<name>Плов \(Казы\)<\/name>[\s\S]*?<price>55000<\/price>/)
  assert.doesNotMatch(yml, /Скрытый|plov\.webp/)
  assert.match(yml, /<offer id="cola-1l">\s*<name>Кока-Кола 1L<\/name>[\s\S]*?<price>25000<\/price>/)
  assert.doesNotMatch(yml, /Вода/)
})

function fakeSupabase({ categoryRows = categories, itemRows = items, error = null } = {}) {
  const query = rows => {
    const chain = {
      select: () => chain, is: () => chain, order: () => chain,
      range: async () => ({ data: error ? null : rows, error }),
      then: (resolve, reject) => Promise.resolve({ data: error ? null : rows, error }).then(resolve, reject),
    }
    return chain
  }
  return { from: table => query(table === 'menu_categories' ? categoryRows : itemRows) }
}

function fakeResponse() {
  return {
    statusCode: 0, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(body) { this.body = body },
  }
}

test('Yandex feed endpoint serves cached XML', async () => {
  const res = fakeResponse()
  await serveYandexMenuFeed({ method: 'GET' }, res, { supabase: fakeSupabase() })
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['content-type'], /application\/xml/)
  assert.match(res.headers['cache-control'], /s-maxage=900/)
  assert.match(res.body, /<yml_catalog>/)
})

test('Yandex feed endpoint never serves an empty feed that would wipe the Yandex price list', async () => {
  for (const supabase of [fakeSupabase({ itemRows: [] }), fakeSupabase({ error: new Error('db down') })]) {
    const res = fakeResponse()
    await serveYandexMenuFeed({ method: 'GET' }, res, { supabase })
    assert.equal(res.statusCode, 503)
    assert.doesNotMatch(String(res.body), /yml_catalog/)
  }
})

test('Yandex feed is reachable at /yandex-menu.yml ahead of the SPA fallback', () => {
  const rewrites = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url))).rewrites
  const index = rewrites.findIndex(rule => rule.source === '/yandex-menu.yml')
  assert.equal(rewrites[index]?.destination, '/api/google-reviews/run?task=yandex-feed')
  assert.ok(index < rewrites.findIndex(rule => rule.destination === '/index.html'))
})

test('Google endpoint serves the Yandex feed without the cron secret', () => {
  const run = readFileSync(new URL('../api/google-reviews/run.js', import.meta.url), 'utf8')
  const feedBranch = run.indexOf("requestTask(req) === 'yandex-feed'")
  assert.ok(feedBranch > 0 && feedBranch < run.indexOf('requireCronSecret(req)\n    const task'))
})

test('Yandex feed sends WebP menu photos through the JPEG route and keeps JPEG/PNG links', () => {
  const r2 = 'https://pub-1.r2.dev/menu/products'
  assert.equal(yandexPictureUrl(`${r2}/m3-1786540954813-jklkh093.webp`), 'https://www.zarkebab.uz/yandex-photos/m3-1786540954813-jklkh093.jpg')
  assert.equal(yandexPictureUrl(`${r2}/beef.png`), `${r2}/beef.png`)
  assert.equal(yandexPictureUrl('https://cdn.example/other/plov.webp'), '')
  assert.equal(yandexPictureUrl(''), '')
})

test('Yandex photo route converts the R2 WebP photo to a cached JPEG', async () => {
  const { default: sharp } = await import('sharp')
  const webp = await sharp({ create: { width: 8, height: 6, channels: 4, background: '#c33' } }).webp().toBuffer()
  const requested = []
  const fetchImpl = async url => { requested.push(url); return new Response(webp, { status: 200 }) }
  const res = fakeResponse()
  await serveYandexMenuPhoto({ method: 'GET', url: '/api/google-reviews/run?task=yandex-photo&file=m3-17865.jpg' }, res,
    { env: { R2_PUBLIC_BASE_URL: 'https://pub-1.r2.dev/' }, fetchImpl })
  assert.deepEqual(requested, ['https://pub-1.r2.dev/menu/products/m3-17865.webp'])
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'image/jpeg')
  assert.match(res.headers['cache-control'], /immutable/)
  assert.equal((await sharp(res.body).metadata()).format, 'jpeg')
})

test('Yandex photo route only serves menu product names from our bucket', async () => {
  const fetchImpl = async () => { throw new Error('must not fetch') }
  for (const file of ['../secret.jpg', 'a/b.jpg', 'photo.png', '', 'x.jpg?u=https://evil']) {
    const res = fakeResponse()
    await serveYandexMenuPhoto({ method: 'GET', url: `/api/google-reviews/run?task=yandex-photo&file=${encodeURIComponent(file)}` }, res,
      { env: { R2_PUBLIC_BASE_URL: 'https://pub-1.r2.dev' }, fetchImpl })
    assert.equal(res.statusCode, 404, file)
  }
  const missing = fakeResponse()
  await serveYandexMenuPhoto({ method: 'GET', url: '/x?file=gone.jpg' }, missing,
    { env: { R2_PUBLIC_BASE_URL: 'https://pub-1.r2.dev' }, fetchImpl: async () => new Response('', { status: 404 }) })
  assert.equal(missing.statusCode, 404)
})

test('Yandex photos are reachable at /yandex-photos/<name>.jpg ahead of the SPA fallback', () => {
  const rewrites = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url))).rewrites
  const index = rewrites.findIndex(rule => rule.source === '/yandex-photos/:file')
  assert.equal(rewrites[index]?.destination, '/api/google-reviews/run?task=yandex-photo&file=:file')
  assert.ok(index < rewrites.findIndex(rule => rule.destination === '/index.html'))
})
