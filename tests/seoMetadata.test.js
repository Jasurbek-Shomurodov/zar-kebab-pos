import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const robots = fs.readFileSync(path.join(root, 'public/robots.txt'), 'utf8')
const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8')

test('public site metadata describes the restaurant instead of the POS', () => {
  assert.match(html, /<html lang="ru"/)
  assert.match(html, /<title>Zar Kebab — узбекская, уйгурская и турецкая кухня<\/title>/)
  assert.match(html, /name="description"/)
  assert.match(html, /Завтрак · Обед · Ужин\./)
  assert.match(html, /Меню · Бронирование · Акции · Контакты\./)
  assert.match(html, /\+998 91-509-55-45\. Ежедневно с 08:00 до 01:00\./)
  assert.doesNotMatch(html, /<title>[^<]*POS[^<]*<\/title>/)
  assert.match(html, /<h1>Zar Kebab — ресторан узбекской, уйгурской и турецкой кухни в Ташкенте<\/h1>/)
  assert.match(html, /href="\/menu">Меню<\/a>/)
})

test('text entry disables browser autocorrection across the app', () => {
  assert.match(html, /<html[^>]+autocorrect="off"/)
  assert.match(html, /<html[^>]+autocapitalize="off"/)
  assert.match(html, /<html[^>]+spellcheck="false"/)

  const expenses = fs.readFileSync(path.join(root, 'src/pages/Expenses.jsx'), 'utf8')
  assert.match(expenses, /value=\{form\.vendor\}[\s\S]*?autoCorrect="off"[\s\S]*?spellCheck=\{false\}/)
  assert.match(expenses, /value=\{form\.description\}[\s\S]*?autoCorrect="off"[\s\S]*?spellCheck=\{false\}/)
})

test('public site metadata uses the Zar Kebab logo and canonical domain', () => {
  assert.match(html, /rel="icon"[^>]+\/brand\/zarkebab-logo\.png/)
  assert.match(html, /rel="icon"[^>]+sizes="512x512"/)
  assert.match(html, /rel="apple-touch-icon"[^>]+\/brand\/zarkebab-logo\.png/)
  assert.match(html, /rel="canonical" href="https:\/\/www\.zarkebab\.uz\/"/)
  assert.match(html, /property="og:title"/)
  assert.match(html, /property="og:description"/)
  assert.match(html, /property="og:image"/)
  assert.match(html, /type="application\/ld\+json"/)
  assert.match(html, /"@type": "WebSite"/)
  assert.match(html, /"alternateName": "ZarKebab"/)
  assert.match(html, /"@type": "Restaurant"/)
  assert.match(html, /"servesCuisine": \["Uzbek", "Uyghur", "Turkish", "Kebab"\]/)
  assert.match(html, /"@type": "PostalAddress"/)
  assert.match(html, /"streetAddress": "Matbuotchilar ko‘chasi, 17"/)
  assert.match(html, /"addressLocality": "Tashkent"/)
  assert.match(html, /"addressCountry": "UZ"/)
  assert.match(html, /"acceptsReservations": true/)
  assert.match(html, /"@type": "OpeningHoursSpecification"/)
  assert.match(html, /"opens": "08:00"/)
  assert.match(html, /"closes": "01:00"/)
  assert.match(html, /"logo": "https:\/\/www\.zarkebab\.uz\/brand\/zarkebab-logo\.png"/)
})

test('public menu keeps homepage search metadata without rendering an SEO copy banner', () => {
  const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
  const menu = fs.readFileSync(path.join(root, 'src/pages/PublicMenu.jsx'), 'utf8')

  assert.match(app, /<Route path="\/" element={<PublicMenu \/>} \/>/)
  assert.match(menu, /const pageTitle = corporateSets\n\s*\? `\$\{siteCopy\.corporateSets\} — Zar Kebab`\n\s*: frozenMeals \? `\$\{siteCopy\.frozenMeals\} — Zar Kebab` : seo\.title\n\s*document\.title = pageTitle/)
  assert.match(menu, /Завтрак · Обед · Ужин\./)
  assert.match(menu, /Breakfast · Lunch · Dinner\./)
  assert.match(menu, /\+998 91-509-55-45/)
  assert.match(menu, /document\.documentElement\.lang = lang/)
  assert.doesNotMatch(menu, /<h1[^>]*>{seo\.heading}<\/h1>/)
  assert.doesNotMatch(menu, /id="public-menu-vacancies"/)
  assert.match(menu, /id="public-menu-contacts"/)
  assert.match(menu, /<div data-nosnippet="">\s*<header ref=\{headerRef\}/)
  assert.match(menu, /<div data-nosnippet="">\s*<MenuCategoryScroller/)
  assert.match(menu, /PUBLIC_CONTACTS\.location\.href/)
  assert.match(menu, /https:\/\/yandex\.com\/maps\/org\/zarkebab\/34684464035\//)
})

test('search crawlers receive real robots and sitemap files', () => {
  assert.match(robots, /User-agent: \*/)
  assert.match(robots, /Allow: \//)
  assert.match(robots, /Sitemap: https:\/\/www\.zarkebab\.uz\/sitemap\.xml/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/<\/loc>/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/menu<\/loc>/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/catering<\/loc>/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/vacancies<\/loc>/)
})
