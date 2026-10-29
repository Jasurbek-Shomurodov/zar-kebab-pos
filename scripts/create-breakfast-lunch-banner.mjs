import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const envPath = ['.env.local', '.env'].map(name => path.join(root, name)).find(fs.existsSync)
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')]
}))

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data, error } = await supabase.rpc('get_public_menu_data')
if (error) throw error

const categories = new Map((data.categories || []).map(category => [category.id, category]))
const items = (data.items || []).filter(item => item.available !== false && item.public_hidden !== true)
const breakfastId = [...categories.values()].find(c => /breakfast|завтрак|nonushta/i.test([c.id, c.name_ru, c.name_en, c.name_uz].join(' ')))?.id
const lunchId = [...categories.values()].find(c => /business|бизнес|biznes/i.test([c.id, c.name_ru, c.name_en, c.name_uz].join(' ')))?.id
const byOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
const breakfast = items.filter(item => item.category_id === breakfastId).sort(byOrder)
const lunch = items.filter(item => item.category_id === lunchId).sort(byOrder)

const popularMatchers = [
  /шашлык из говядины/i,
  /молотый шашлык/i,
  /куриные крылышки/i,
  /суп с фрикадельками/i,
  /говяжий кофте/i,
  /казан.?кебаб/i,
  /уйгурский лагман/i,
  /жареный лагман/i,
  /сет с уйгурскими мантами/i,
  /долма/i,
  /чечевичный суп/i,
  /кайнатма шурпа/i,
  /салат цезарь/i,
  /греческий салат/i,
  /хрустящий баклажан/i,
  /мужской каприз/i,
  /медовик/i,
  /торт.*спартак/i,
  /сан-себастьян/i,
]
const preferred = popularMatchers.map(pattern => items.find(item => pattern.test(item.name_ru || ''))).filter(Boolean)
const preferredIds = new Set(preferred.map(item => item.id))
const fillers = items.filter(item =>
  item.category_id !== breakfastId
  && item.category_id !== lunchId
  && item.image_url
  && Number(item.price) > 0
  && !preferredIds.has(item.id)
).sort(byOrder)
const popular = [...preferred, ...fillers].slice(0, 20)

const escapeXml = value => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const formatPrice = value => Number(value || 0).toLocaleString('ru-RU').replaceAll('\u00a0', '.')
const cache = new Map()
async function imageData(url) {
  if (!url) return null
  if (cache.has(url)) return cache.get(url)
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    const normalized = await sharp(bytes).png().toBuffer()
    const value = `data:image/png;base64,${normalized.toString('base64')}`
    cache.set(url, value)
    return value
  } catch {
    return null
  }
}

const lunchFallback = await imageData(categories.get(lunchId)?.image_url)
const allCards = [...breakfast, ...popular]
const images = new Map()
for (const item of allCards) images.set(item.id, await imageData(item.image_url) || (item.category_id === lunchId ? lunchFallback : null))

const width = 2500
const height = 4000
const margin = 54
const gap = 28
const columns = 4
const contentWidth = width - margin * 2
const cardWidth = (contentWidth - gap * (columns - 1)) / columns

function card(item, index, top, cardHeight, sectionItems, accent = '#173d22') {
  const col = index % columns
  const row = Math.floor(index / columns)
  const x = margin + col * (cardWidth + gap)
  const y = top + row * (cardHeight + gap)
  const photoHeight = cardHeight - 168
  const image = images.get(item.id)
  const name = item.name_ru || item.name_uz || item.name_en || 'ZAR KEBAB'
  const englishName = item.name_en || item.name_uz || item.name_ru || 'ZAR KEBAB'
  const fontSize = name.length > 23 ? 27 : name.length > 17 ? 30 : 34
  const englishSize = englishName.length > 27 ? 23 : englishName.length > 20 ? 25 : 28
  return `<g>
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="34" fill="#fffdf7" stroke="#173d22" stroke-width="4"/>
    <rect x="${x + 8}" y="${y + 8}" width="${cardWidth - 16}" height="${cardHeight - 16}" rx="27" fill="none" stroke="#c89a36" stroke-width="1.5" opacity=".7"/>
    ${image ? `<defs><clipPath id="clip-${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}"><rect x="${x + 5}" y="${y + 5}" width="${cardWidth - 10}" height="${photoHeight}" rx="30"/></clipPath></defs><image href="${image}" x="${x + 5}" y="${y + 5}" width="${cardWidth - 10}" height="${photoHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${index})"/>` : `<rect x="${x + 5}" y="${y + 5}" width="${cardWidth - 10}" height="${photoHeight}" rx="30" fill="#d9efc8"/><text x="${x + cardWidth / 2}" y="${y + photoHeight / 2}" text-anchor="middle" font-family="Arial" font-weight="800" font-size="42" fill="#173d22">ZAR KEBAB</text>`}
    <text x="${x + 22}" y="${y + photoHeight + 42}" font-family="Arial" font-weight="900" font-size="${fontSize}" fill="#111">${escapeXml(name.toUpperCase())}</text>
    <text x="${x + 22}" y="${y + photoHeight + 78}" font-family="Arial" font-weight="700" font-size="${englishSize}" fill="#506257">${escapeXml(englishName.toUpperCase())}</text>
    <rect x="${x + cardWidth - 209}" y="${y + cardHeight - 65}" width="190" height="58" rx="19" fill="#c89a36"/>
    <rect x="${x + cardWidth - 206}" y="${y + cardHeight - 62}" width="184" height="52" rx="17" fill="${accent}"/>
    <text x="${x + cardWidth - 114}" y="${y + cardHeight - 25}" text-anchor="middle" font-family="Arial" font-weight="900" font-size="34" fill="#fff">${formatPrice(item.price)}</text>
  </g>`
}

function section(title, subtitle, sectionItems, top, cardHeight, accent) {
  const headerHeight = 95
  const rows = Math.ceil(sectionItems.length / columns)
  const cardsTop = top + headerHeight
  return {
    markup: `<text x="${margin}" y="${top + 58}" font-family="Arial" font-weight="900" font-size="72" fill="${accent}">${escapeXml(title)}</text>
      <text x="${width - margin}" y="${top + 56}" text-anchor="end" font-family="Arial" font-weight="700" font-size="30" fill="#4b5b4e">${escapeXml(subtitle)}</text>
      <line x1="${margin}" y1="${top + 78}" x2="${width - margin}" y2="${top + 78}" stroke="#c89a36" stroke-width="5"/>
      <path d="M${width / 2 - 26} ${top + 78}l26-18 26 18-26 18z" fill="#f7f7f2" stroke="#c89a36" stroke-width="4"/>
      ${sectionItems.map((item, index) => card(item, index, cardsTop, cardHeight, sectionItems, accent)).join('')}`,
    bottom: cardsTop + rows * cardHeight + (rows - 1) * gap,
  }
}

const breakfastSection = section('ЗАВТРАКИ / BREAKFAST', '7 БЛЮД · 7 DISHES', breakfast, 350, 420, '#173d22')
const popularSection = section('НАШЕ МЕНЮ / OUR MENU', 'ПОПУЛЯРНЫЕ БЛЮДА · POPULAR DISHES', popular, breakfastSection.bottom + 68, 420, '#173d22')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="uzbekMotif" width="120" height="120" patternUnits="userSpaceOnUse">
      <path d="M60 8L112 60 60 112 8 60zM60 30L90 60 60 90 30 60z" fill="none" stroke="#c89a36" stroke-width="2" opacity=".09"/>
      <circle cx="60" cy="60" r="9" fill="none" stroke="#173d22" stroke-width="2" opacity=".07"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="#173d22"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="38" fill="#f7f7f2" stroke="#fff" stroke-width="14"/>
  <rect x="38" y="38" width="${width - 76}" height="${height - 76}" rx="29" fill="none" stroke="#c89a36" stroke-width="5"/>
  <rect x="44" y="300" width="${width - 88}" height="${height - 500}" fill="url(#uzbekMotif)"/>
  <rect x="24" y="24" width="${width - 48}" height="280" rx="38" fill="#173d22"/>
  <path d="M72 72h210l-34 34 34 34H72zM${width - 72} 72h-210l34 34-34 34h210z" fill="none" stroke="#c89a36" stroke-width="7" opacity=".9"/>
  <path d="M${width / 2 - 48} 250l48-30 48 30-48 30z" fill="#173d22" stroke="#c89a36" stroke-width="6"/>
  <text x="${width / 2}" y="208" text-anchor="middle" font-family="Arial" font-weight="900" font-size="196" letter-spacing="4" fill="#fff">ZAR KEBAB</text>
  ${breakfastSection.markup}
  ${popularSection.markup}
  <rect x="24" y="${height - 180}" width="${width - 48}" height="156" rx="34" fill="#173d22"/>
  <line x1="54" y1="${height - 176}" x2="${width - 54}" y2="${height - 176}" stroke="#c89a36" stroke-width="6"/>
  <path d="M230 ${height - 102}h300v-55l130 78-130 78v-55H230z" fill="#fff"/>
  <text x="${width - 100}" y="${height - 78}" text-anchor="end" font-family="Arial" font-weight="900" font-size="78" fill="#fff">2-ЭТАЖ / 2ND FLOOR</text>
</svg>`

const outputDir = path.join(root, 'deliverables', 'banners')
fs.mkdirSync(outputDir, { recursive: true })
const svgPath = path.join(outputDir, 'zar-kebab-live-menu-banner-v4.svg')
const pngPath = path.join(outputDir, 'zar-kebab-live-menu-banner-v4.png')
fs.writeFileSync(svgPath, svg)
await sharp(Buffer.from(svg)).png().toFile(pngPath)
console.log(JSON.stringify({ breakfast: breakfast.length, businessLunch: lunch.length, popular: popular.length, svgPath, pngPath }))
