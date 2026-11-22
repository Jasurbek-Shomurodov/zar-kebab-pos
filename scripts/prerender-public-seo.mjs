#!/usr/bin/env node
// Post-build: writes static, crawler-readable HTML for the public site so search engines that
// do not run JavaScript (Bing, Yandex, link previews) see real titles, canonicals and dish names.
//
//   dist/index.html                 home (/ and the SPA fallback): full dish list in ru/en/uz
//   dist/menu/item/<key>/index.html one page per public dish (Vercel serves it at /menu/item/<key>;
//                                   unknown keys fall through to the SPA rewrite)
//   dist/<section>.html             catering, corporate-sets, frozen-meals, vacancies
//   dist/sitemap.xml                every page above
//
// React replaces the static #root content on load, so visitors see the normal app.
// Only public menu fields are used (get_public_menu_data): never costs, recipes or tech cards.
// Prices are left out on purpose: the static copy only refreshes on deploy.
// If the menu cannot be loaded the build still succeeds with the section pages and the
// committed public/sitemap.xml.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPublicMenuCategory, isPublicMenuItem } from '../src/lib/menuItems.js'
import { PUBLIC_MENU_SEO, PUBLIC_SITE_ORIGIN, localizedItemText, menuItemSeo } from '../src/lib/publicSeo.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

// Categories kept off the restaurant menu page (they have their own page, or do not belong
// in halal search results).
export const CORPORATE_SETS_CATEGORY_ID = 'c1789462941735'
const EXCLUDED_CATEGORY_NAMES = new Set(['alcohol'])
// Dish keys become file names under dist/menu/item/.
const SAFE_KEY = /^[A-Za-z0-9_-]+$/

const CONTACT = {
  phoneLabel: '+998 91-509-55-45',
  phoneHref: 'tel:+998915095545',
  mapHref: 'https://yandex.com/maps/org/zarkebab/34684464035/',
  googleMapHref: 'https://www.google.com/maps/search/?api=1&query=Zar+Kebab+Matbuotchilar+17+Tashkent',
  telegram: 'https://t.me/zarkebab',
  instagram: 'https://www.instagram.com/zarkebab',
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function readEnvFile(file) {
  const env = {}
  if (!fs.existsSync(file)) return env
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return env
}

function supabaseEnv() {
  const fileEnv = { ...readEnvFile(path.join(root, '.env')), ...readEnvFile(path.join(root, '.env.local')) }
  const pick = (...keys) => keys.map(key => process.env[key] || fileEnv[key]).find(Boolean) || ''
  return {
    url: pick('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, ''),
    key: pick('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'),
  }
}

async function loadPublicMenu() {
  const { url, key } = supabaseEnv()
  if (!url || !key) throw new Error('Supabase URL or anon key is not set')
  const response = await fetch(`${url}/rest/v1/rpc/get_public_menu_data`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`get_public_menu_data returned ${response.status}`)
  return response.json()
}

// Mirrors the /menu page: public categories without the corporate-set and frozen-shop lines.
export function restaurantMenuSections(data) {
  const categories = (data?.categories || [])
    .filter(category => isPublicMenuCategory(category) && !category.frozen_shop)
    .filter(category => category.id !== CORPORATE_SETS_CATEGORY_ID)
    .filter(category => !EXCLUDED_CATEGORY_NAMES.has(String(category.name_en || '').trim().toLowerCase()))
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
  const items = (data?.items || []).filter(isPublicMenuItem)
  return categories
    .map(category => ({
      category,
      items: items
        .filter(item => item.category_id === category.id && SAFE_KEY.test(menuItemSeo(item).key) && menuItemSeo(item).name)
        .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)),
    }))
    .filter(section => section.items.length > 0)
}

function dishNames(item) {
  const names = ['ru', 'en', 'uz'].map(lang => localizedItemText(item, 'name', lang))
  return [...new Set(names.filter(Boolean))]
}

function categoryNames(category) {
  return [...new Set(['ru', 'en', 'uz'].map(lang => String(category[`name_${lang}`] || '').trim()).filter(Boolean))]
}

function contactBlock() {
  return `<section id="contacts">
          <h2>Контакты · Contacts · Aloqa</h2>
          <p>Zar Kebab, Матбуотчилар, 17, Ташкент · Matbuotchilar ko‘chasi, 17, Toshkent · Matbuotchilar 17, Tashkent, Uzbekistan.</p>
          <p><a href="${CONTACT.phoneHref}">${CONTACT.phoneLabel}</a> · <a href="${CONTACT.mapHref}">Яндекс Карты</a> · <a href="${CONTACT.googleMapHref}">Google Maps</a> · <a href="${CONTACT.telegram}">Telegram</a> · <a href="${CONTACT.instagram}">Instagram</a></p>
        </section>`
}

function siteNav() {
  return `<nav aria-label="Основные разделы">
          <a href="/">Меню</a>
          <a href="/corporate-sets">Корпоративные сеты</a>
          <a href="/frozen-meals">Полуфабрикаты</a>
          <a href="/catering">Кейтеринг</a>
          <a href="/vacancies">Вакансии</a>
          <a href="${CONTACT.mapHref}">Адрес: Матбуотчилар, 17</a>
          <a href="${CONTACT.telegram}">Telegram</a>
        </nav>`
}

export function homeBody(sections) {
  const menu = sections.map(({ category, items }) => `<section>
          <h2>${escapeHtml(categoryNames(category).join(' · '))}</h2>
          <ul>
${items.map(item => `            <li><a href="${escapeHtml(menuItemSeo(item).path)}">${escapeHtml(dishNames(item).join(' · '))}</a></li>`).join('\n')}
          </ul>
        </section>`).join('\n        ')
  return `<main id="seo-content">
        <h1>${escapeHtml(PUBLIC_MENU_SEO.ru.heading)}</h1>
        <p>Халяль ресторан Zar Kebab в Ташкенте: шашлык на мангале, плов, манты, чучвара, уйгурский лагман, казан-кебаб, самса, супы и завтраки.
          Завтрак · Обед · Ужин. Меню · Бронирование · Акции · Контакты.
          +998 91-509-55-45. Ежедневно с 08:00 до 23:30.</p>
        <p lang="en">Zar Kebab is a halal restaurant in Tashkent serving shashlik and kebab from the grill, plov, manti and chuchvara dumplings, Uyghur lagman, kazan kebab, samsa, soups and breakfast.</p>
        <p lang="uz">Zar Kebab — Toshkentdagi halol restoran: mangalda shashlik va kabob, osh, manti, chuchvara, uyg‘ur lag‘moni, qozon kabob, somsa, sho‘rvalar va nonushta.</p>
        ${siteNav()}
        ${menu}
        ${contactBlock()}
      </main>`
}

export function itemBody(item, category) {
  const seo = menuItemSeo(item, 'ru')
  const otherNames = dishNames(item).filter(name => name !== seo.name)
  const descriptions = ['ru', 'en', 'uz']
    .map(lang => ({ lang, text: String(item[`description_${lang}`] || '').trim() }))
    .filter(entry => entry.text)
  const image = String(item.image_url || '').trim()
  return `<main id="seo-content">
        <h1>${escapeHtml(seo.name)} — Zar Kebab, Ташкент</h1>
        ${otherNames.length ? `<p>${escapeHtml(otherNames.join(' · '))}</p>` : ''}
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(`${seo.name} — Zar Kebab, Ташкент`)}" />` : ''}
        ${descriptions.map(entry => `<p lang="${entry.lang}">${escapeHtml(entry.text)}</p>`).join('\n        ')}
        <p>${escapeHtml(seo.name)} в халяль ресторане Zar Kebab: узбекская, уйгурская и турецкая кухня в Ташкенте. Заказ и бронирование: ${CONTACT.phoneLabel}.</p>
        ${category ? `<p>Раздел меню: <a href="/">${escapeHtml(categoryNames(category).join(' · '))}</a></p>` : ''}
        ${siteNav()}
        ${contactBlock()}
      </main>`
}

function sectionBody(heading, text) {
  return `<main id="seo-content">
        <h1>${escapeHtml(heading)}</h1>
        <p>${escapeHtml(text)}</p>
        ${siteNav()}
        ${contactBlock()}
      </main>`
}

export const SECTION_PAGES = [
  {
    route: '/catering',
    title: 'Кейтеринг и корпоративное питание в Ташкенте | Zar Kebab',
    description: 'Zar Kebab предлагает корпоративное питание, обеды в офис, шашлык-сеты и кейтеринг для мероприятий в Ташкенте. Индивидуальное меню под ваш бюджет.',
    heading: 'Кейтеринг и корпоративное питание в Ташкенте — Zar Kebab',
  },
  {
    route: '/corporate-sets',
    title: 'Корпоративные сеты — Zar Kebab',
    description: 'Корпоративные сеты Zar Kebab в Ташкенте: шашлычный сет, казан-кебаб, сай, жареный лагман и бифштекс для обедов в офис. +998 91-509-55-45.',
    heading: 'Корпоративные сеты — Zar Kebab, Ташкент',
  },
  {
    route: '/frozen-meals',
    title: 'Полуфабрикаты — Zar Kebab',
    description: 'Наши замороженные полуфабрикаты — приготовьте дома за несколько минут.',
    heading: 'Полуфабрикаты Zar Kebab, Ташкент',
  },
  {
    route: '/vacancies',
    title: 'Открытые вакансии — Zar Kebab',
    description: 'Работа в ресторане Zar Kebab в Ташкенте: открытые вакансии официанта, повара и хостес. +998 91-509-55-45.',
    heading: 'Открытые вакансии в Zar Kebab, Ташкент',
  },
]

function setTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`prerender: template tag not found: ${pattern}`)
  return html.replace(pattern, replacement)
}

export function renderPage(template, { title, description, url, image, body, jsonLd }) {
  let html = template
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  html = setTag(html, /<title>[^<]*<\/title>/, `<title>${t}</title>`)
  html = setTag(html, /(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${d}$2`)
  html = setTag(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
  html = setTag(html, /(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
  html = setTag(html, /(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${d}$2`)
  html = setTag(html, /(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
  html = setTag(html, /(<meta name="twitter:title" content=")[^"]*(")/, `$1${t}$2`)
  html = setTag(html, /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${d}$2`)
  if (image) {
    html = setTag(html, /(<meta property="og:image" content=")[^"]*(")/, `$1${escapeHtml(image)}$2`)
    html = setTag(html, /(<meta name="twitter:image" content=")[^"]*(")/, `$1${escapeHtml(image)}$2`)
  }
  html = setTag(html, /<div id="root">[\s\S]*?<\/main>\s*<\/div>/, `<div id="root">\n      ${body}\n    </div>`)
  // Re-running on an already prerendered dist/index.html must not stack menu data.
  html = html.replace(/\s*<script type="application\/ld\+json" data-prerender>[\s\S]*?<\/script>/g, '')
  if (jsonLd) {
    const json = JSON.stringify(jsonLd).replace(/</g, '\\u003c')
    html = html.replace('</head>', `  <script type="application/ld+json" data-prerender>${json}</script>\n  </head>`)
  }
  return html
}

function menuJsonLd(sections) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': `${PUBLIC_SITE_ORIGIN}/#menu`,
    name: 'Zar Kebab menu',
    inLanguage: ['ru', 'en', 'uz'],
    hasMenuSection: sections.map(({ category, items }) => ({
      '@type': 'MenuSection',
      name: categoryNames(category).join(' · '),
      hasMenuItem: items.map(item => ({
        '@type': 'MenuItem',
        name: menuItemSeo(item, 'ru').name,
        alternateName: dishNames(item).slice(1),
        url: menuItemSeo(item).url,
      })),
    })),
  }
}

function itemJsonLd(item) {
  const seo = menuItemSeo(item, 'ru')
  const image = String(item.image_url || '').trim()
  return {
    '@context': 'https://schema.org',
    '@type': 'MenuItem',
    name: seo.name,
    alternateName: dishNames(item).slice(1),
    description: seo.description,
    url: seo.url,
    ...(image ? { image } : {}),
    ...(item.grams ? { weight: { '@type': 'QuantitativeValue', value: Number(item.grams), unitCode: 'GRM' } } : {}),
    isPartOf: { '@id': `${PUBLIC_SITE_ORIGIN}/#menu` },
    provider: { '@id': `${PUBLIC_SITE_ORIGIN}/#restaurant` },
  }
}

export function sitemapXml(urls, lastmod) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, priority }) => `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>
`
}

function writeFile(relative, content) {
  const file = path.join(dist, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

async function main() {
  const templatePath = path.join(dist, 'index.html')
  if (!fs.existsSync(templatePath)) throw new Error('dist/index.html is missing: run vite build first')
  const template = fs.readFileSync(templatePath, 'utf8')
  const lastmod = new Date().toISOString().slice(0, 10)

  for (const page of SECTION_PAGES) {
    writeFile(`${page.route.slice(1)}.html`, renderPage(template, {
      ...page,
      url: `${PUBLIC_SITE_ORIGIN}${page.route}`,
      body: sectionBody(page.heading, page.description),
    }))
  }

  let sections = []
  try {
    sections = restaurantMenuSections(await loadPublicMenu())
  } catch (error) {
    console.warn(`[prerender-public-seo] menu not loaded, dish pages skipped: ${error.message}`)
  }
  if (!sections.length) {
    console.log(`[prerender-public-seo] wrote ${SECTION_PAGES.length} section pages`)
    return
  }

  const home = PUBLIC_MENU_SEO.ru
  writeFile('index.html', renderPage(template, {
    title: home.title,
    description: home.description,
    url: `${PUBLIC_SITE_ORIGIN}/`,
    body: homeBody(sections),
    jsonLd: menuJsonLd(sections),
  }))

  let itemCount = 0
  const seen = new Set()
  for (const { category, items } of sections) {
    for (const item of items) {
      const seo = menuItemSeo(item, 'ru')
      if (seen.has(seo.key)) continue
      seen.add(seo.key)
      writeFile(`menu/item/${seo.key}/index.html`, renderPage(template, {
        title: seo.title,
        description: seo.description,
        url: seo.url,
        image: String(item.image_url || '').trim(),
        body: itemBody(item, category),
        jsonLd: itemJsonLd(item),
      }))
      itemCount += 1
    }
  }

  writeFile('sitemap.xml', sitemapXml([
    { loc: `${PUBLIC_SITE_ORIGIN}/`, priority: '1.0' },
    ...SECTION_PAGES.map(page => ({ loc: `${PUBLIC_SITE_ORIGIN}${page.route}`, priority: '0.7' })),
    ...[...seen].map(key => ({ loc: `${PUBLIC_SITE_ORIGIN}/menu/item/${encodeURIComponent(key)}`, priority: '0.6' })),
  ], lastmod))

  console.log(`[prerender-public-seo] wrote home, ${SECTION_PAGES.length} section pages and ${itemCount} dish pages`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[prerender-public-seo] ${error.message}`)
    process.exitCode = 1
  })
}
