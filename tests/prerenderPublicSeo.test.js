import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CORPORATE_SETS_CATEGORY_ID,
  escapeHtml,
  homeBody,
  itemBody,
  renderPage,
  restaurantMenuSections,
  sitemapXml,
} from '../scripts/prerender-public-seo.mjs'
import { menuItemSeo } from '../src/lib/publicSeo.js'

const root = path.resolve(import.meta.dirname, '..')
const template = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

const plov = {
  id: 'i1', external_id: 'MI-PLOV', category_id: 'mains', sort_order: 1,
  name_ru: 'Плов', name_en: 'Plov', name_uz: "To'y oshi",
  description_ru: 'Традиционный узбекский плов.', description_en: '', description_uz: '',
  image_url: 'https://cdn.example/plov.webp', cost_price: 12345,
}
const menuData = {
  categories: [
    { id: 'mains', name_ru: 'Вторые блюда', name_en: 'Main dishes', name_uz: 'Ikkinchi taomlar', sort_order: 2 },
    { id: 'drinks-alc', name_ru: 'Алкоголь', name_en: 'Alcohol', name_uz: 'Spirtnoy', sort_order: 3 },
    { id: CORPORATE_SETS_CATEGORY_ID, name_ru: 'Корпоративный сет', name_en: 'Corporate set', sort_order: 4 },
    { id: 'frozen', name_ru: 'Полуфабрикаты', name_en: 'Frozen', frozen_shop: true, sort_order: 5 },
    { id: 'hidden', name_ru: 'Скрыто', name_en: 'Hidden', hidden: true, sort_order: 6 },
  ],
  items: [
    plov,
    { id: 'i2', external_id: 'MI-WINE', category_id: 'drinks-alc', name_ru: 'Вино', name_en: 'Wine' },
    { id: 'i3', external_id: 'MI-SET', category_id: CORPORATE_SETS_CATEGORY_ID, name_ru: 'Сет', name_en: 'Set' },
    { id: 'i4', external_id: 'MI-FROZEN', category_id: 'frozen', name_ru: 'Манты замороженные', name_en: 'Frozen manti' },
    { id: 'i5', external_id: 'MI-OFF', category_id: 'mains', name_ru: 'Скрытое', name_en: 'Hidden dish', public_hidden: true },
    { id: 'i6', external_id: 'MI-CASH', category_id: 'mains', name_ru: 'Касса', name_en: 'Cashier', cashier_only: true },
    { id: 'i7', external_id: 'bad/key', category_id: 'mains', name_ru: 'Плохой ключ', name_en: 'Bad key' },
  ],
}

test('prerendered menu mirrors the public /menu page and skips non-restaurant lines', () => {
  const sections = restaurantMenuSections(menuData)
  assert.deepEqual(sections.map(section => section.category.id), ['mains'])
  assert.deepEqual(sections[0].items.map(item => item.external_id), ['MI-PLOV'])
})

test('dish pages carry their own title, canonical and names in every language', () => {
  const seo = menuItemSeo(plov, 'ru')
  assert.equal(seo.title, 'Плов в Ташкенте — Zar Kebab')
  assert.equal(seo.url, 'https://www.zarkebab.uz/menu/item/MI-PLOV')
  assert.ok(seo.description.length <= 160)
  assert.ok(menuItemSeo({ ...plov, description_ru: 'x'.repeat(400) }, 'ru').description.length <= 160)
  assert.match(menuItemSeo({ ...plov, description_en: '' }, 'en').description, /halal restaurant/)

  const html = renderPage(template, {
    title: seo.title,
    description: seo.description,
    url: seo.url,
    image: plov.image_url,
    body: itemBody(plov, menuData.categories[0]),
    jsonLd: { '@type': 'MenuItem', name: '</script><b>' },
  })
  assert.match(html, /<title>Плов в Ташкенте — Zar Kebab<\/title>/)
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.zarkebab\.uz\/menu\/item\/MI-PLOV" \/>/)
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.zarkebab\.uz\/menu\/item\/MI-PLOV" \/>/)
  assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.example\/plov\.webp" \/>/)
  assert.match(html, /<h1>Плов — Zar Kebab, Ташкент<\/h1>/)
  assert.match(html, /Plov · To&#39;y oshi/)
  assert.match(html, /<div id="root">\s*<main id="seo-content">/)
  assert.match(html, /<script type="module" src="\/src\/main\.jsx"><\/script>/)
  // JSON-LD cannot break out of its script tag.
  assert.doesNotMatch(html, /"<\/script><b>"/)
  // Protected costs never reach the public HTML.
  assert.doesNotMatch(html, /12345/)
  // Re-rendering an already prerendered page does not stack JSON-LD.
  const again = renderPage(html, { title: seo.title, description: seo.description, url: seo.url, body: 'x', jsonLd: { a: 1 } })
  assert.equal(again.match(/data-prerender/g).length, 1)
})

test('home prerender lists dishes with links and keeps the halal, dish and contact copy', () => {
  const body = homeBody(restaurantMenuSections(menuData))
  assert.match(body, /<a href="\/menu\/item\/MI-PLOV">Плов · Plov · To&#39;y oshi<\/a>/)
  assert.match(body, /Халяль ресторан Zar Kebab в Ташкенте: шашлык на мангале, плов, манты, чучвара/)
  assert.match(body, /lang="en">Zar Kebab is a halal restaurant in Tashkent/)
  assert.match(body, /lang="uz">Zar Kebab — Toshkentdagi halol restoran/)
  assert.match(body, /href="tel:\+998915095545"/)
  assert.doesNotMatch(body, /Вино|Wine/)
})

test('sitemap and HTML escaping', () => {
  assert.equal(escapeHtml(`a&b<"'>`), 'a&amp;b&lt;&quot;&#39;&gt;')
  const xml = sitemapXml([{ loc: 'https://www.zarkebab.uz/', priority: '1.0' }], '2026-11-22')
  // Browsers render the sitemap through the stylesheet instead of "no style information".
  assert.match(xml, /^<\?xml [^\n]*\?>\n<\?xml-stylesheet type="text\/xsl" href="\/sitemap\.xsl"\?>\n<urlset/)
  assert.match(xml, /<loc>https:\/\/www\.zarkebab\.uz\/<\/loc>\n    <lastmod>2026-11-22<\/lastmod>/)
})

test('build runs the prerender and Vercel keeps staff screens out of search', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts.postbuild, 'node scripts/prerender-public-seo.mjs')
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'))
  // cleanUrls broke the SPA catch-all (every app route returned 404 in production): never enable it.
  assert.equal(vercel.cleanUrls, undefined)
  for (const route of ['catering', 'corporate-sets', 'frozen-meals', 'vacancies']) {
    assert.ok(vercel.rewrites.some(rule => rule.source === `/${route}` && rule.destination === `/${route}.html`), route)
  }
  const adminHost = vercel.headers.find(rule => rule.has?.some(cond => cond.value === 'admin.zarkebab.uz'))
  assert.deepEqual(adminHost.headers, [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }])
  const privatePaths = vercel.headers.find(rule => !rule.has)
  for (const route of ['admin', 'waiter', 'cashier', 'receipt', 'login', 'checkin-qr', 'premium-menu']) {
    assert.match(privatePaths.source, new RegExp(`\\b${route}\\b`))
  }
  assert.equal(vercel.rewrites.at(-1).destination, '/index.html')
  // Dish pages are directory index files: Vercel serves them at /menu/item/<key> and
  // unknown keys still fall through to the SPA rewrite (checked on a preview deploy).
  const script = fs.readFileSync(path.join(root, 'scripts/prerender-public-seo.mjs'), 'utf8')
  assert.match(script, /writeFile\(`menu\/item\/\$\{seo\.key\}\/index\.html`/)
})
