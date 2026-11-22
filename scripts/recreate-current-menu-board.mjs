import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const envPath = ['.env.local', '.env'].map(name => path.join(root, name)).find(fs.existsSync)
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data, error } = await supabase.rpc('get_public_menu_data')
if (error) throw error

const preferredCategoryOrder = [
  'breakfast',
  'kebab',
  'first',
  'sides',
  'c1781337286710',
  'salads',
  'desserts',
  'c1780408777665',
  'bread',
  'c1781345261911',
  'c1780385299367',
  'c1781109502897',
  'drinks',
  'c1780304119652',
]
const categoryRank = new Map(preferredCategoryOrder.map((id, index) => [id, index]))
const categories = (data.categories || []).slice().sort((a, b) =>
  (categoryRank.get(a.id) ?? 999) - (categoryRank.get(b.id) ?? 999)
  || (a.sort_order || 0) - (b.sort_order || 0),
)
const items = (data.items || []).filter(item => item.available !== false)

const escapeXml = value => String(value || '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const formatPrice = value => Number(value || 0).toLocaleString('en-US')
const groups = categories.map(category => ({
  category,
  items: items.filter(item => item.category_id === category.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
})).filter(group => group.items.length)

const groupById = new Map(groups.map(group => [group.category.id, group]))
const columnCategoryIds = [
  ['breakfast', 'kebab', 'first', 'sides'],
  ['c1781337286710', 'salads'],
  ['desserts', 'bread', 'c1781345261911'],
  ['c1780385299367', 'c1781109502897', 'drinks', 'c1780304119652'],
]
const columns = columnCategoryIds.map(ids => ({ groups: ids.map(id => groupById.get(id)).filter(Boolean) }))

const width = 2400
const height = 1350
const top = 182
const bottom = 90
const side = 92
const gutter = 32
const columnWidth = (width - side * 2 - gutter * 3) / 4
const availableHeight = height - top - bottom
const logo = fs.readFileSync(path.join(root, 'public/brand/zarkebab-logo.png')).toString('base64')
const menuFont = fs.readFileSync(path.join(root, 'deliverables/Neucha-Regular.ttf')).toString('base64')

const rowMarkup = (group, x, y, scale) => {
  const titleHeight = 35 * scale
  const rowHeight = 30 * scale
  const title = `${group.category.name_ru || group.category.name_uz} / ${(group.category.name_en || group.category.name_uz).toUpperCase()}`
  let out = `<text x="${x}" y="${y + 23 * scale}" class="section" font-size="${20 * scale}">${escapeXml(title.toUpperCase())}</text>`
  out += `<line x1="${x}" y1="${y + 30 * scale}" x2="${x + columnWidth}" y2="${y + 30 * scale}" class="rule"/>`
  let cursor = y + titleHeight
  for (const item of group.items) {
    const ru = item.name_ru || item.name_uz || item.name_en
    const en = item.name_en || item.name_uz || item.name_ru
    const ruSize = (ru.length > 24 ? 14 : ru.length > 19 ? 15.5 : 17) * scale
    const enSize = (en.length > 27 ? 13.5 : en.length > 21 ? 15 : 17) * scale
    out += `<text x="${x}" y="${cursor + 21 * scale}" class="item" font-size="${ruSize}">${escapeXml(ru)}</text>`
    out += `<text x="${x + columnWidth * 0.50}" y="${cursor + 21 * scale}" class="item alt" font-size="${enSize}">${escapeXml(en)}</text>`
    out += `<text x="${x + columnWidth}" y="${cursor + 21 * scale}" class="price" font-size="${16 * scale}" text-anchor="end">${formatPrice(item.price)}</text>`
    cursor += rowHeight
  }
  return { markup: out, height: titleHeight + group.items.length * rowHeight + 14 * scale }
}

const columnMarkup = (column, index) => {
  const naturalHeight = column.groups.reduce((sum, group) => sum + 49 + group.items.length * 30, 0)
  const scale = Math.min(1, availableHeight / naturalHeight)
  const x = side + index * (columnWidth + gutter)
  let y = top
  let out = index ? `<line x1="${x - gutter / 2}" y1="${top - 18}" x2="${x - gutter / 2}" y2="${height - bottom + 12}" class="divider"/>` : ''
  for (const group of column.groups) {
    const rendered = rowMarkup(group, x, y, scale)
    out += rendered.markup
    y += rendered.height
  }
  return out
}

const motif = `
  <pattern id="motif" width="56" height="56" patternUnits="userSpaceOnUse">
    <path d="M28 4 52 28 28 52 4 28Z M28 14 42 28 28 42 14 28Z" fill="none" stroke="#315070" stroke-width="1" opacity=".24"/>
  </pattern>`

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${motif}<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="8" result="noise"/><feColorMatrix in="noise" type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .055"/></feComponentTransfer></filter></defs>
  <style>
    @font-face{font-family:'Neucha';src:url(data:font/truetype;base64,${menuFont}) format('truetype');font-weight:400;font-style:normal}
    .section{font-family:Arial,sans-serif;font-weight:800;letter-spacing:.4px;fill:#0d3156}.item{font-family:'Neucha',Arial,sans-serif;fill:#15394e}.alt{fill:#31594f}.price{font-family:Arial,sans-serif;font-weight:700;fill:#0d3156}.rule{stroke:#b88a25;stroke-width:2}.divider{stroke:#d5c99f;stroke-width:1}.corner{fill:none;stroke:#d8a72a;stroke-width:6}.tiny{font-family:Arial,sans-serif;fill:#d8a72a;letter-spacing:5px}
  </style>
  <rect width="${width}" height="${height}" fill="#0a294d"/>
  <rect width="${width}" height="150" fill="url(#motif)"/>
  <rect x="32" y="28" width="${width - 64}" height="${height - 56}" rx="2" fill="#f4eed9" stroke="#d8a72a" stroke-width="4"/>
  <rect x="48" y="44" width="${width - 96}" height="${height - 88}" fill="none" stroke="#0d3156" stroke-width="3"/>
  <rect x="48" y="44" width="${width - 96}" height="108" fill="#0a294d"/>
  <rect x="48" y="44" width="${width - 96}" height="108" fill="url(#motif)"/>
  <image href="data:image/png;base64,${logo}" x="78" y="48" width="160" height="96" preserveAspectRatio="xMidYMid meet"/>
  <text x="${width / 2}" y="91" text-anchor="middle" font-family="Georgia,serif" font-size="37" font-weight="700" letter-spacing="7" fill="#f4eed9">MENU · МЕНЮ · MENYU</text>
  <line x1="${width / 2 - 410}" y1="113" x2="${width / 2 + 410}" y2="113" stroke="#d8a72a" stroke-width="2"/>
  <text x="${width / 2}" y="136" text-anchor="middle" class="tiny" font-size="11">TRADITIONAL UZBEK &amp; EUROPEAN CUISINE</text>
  <rect x="48" y="152" width="${width - 96}" height="${height - 200}" fill="#f6f0dc"/>
  <rect x="48" y="152" width="${width - 96}" height="${height - 200}" filter="url(#paper)" opacity=".85"/>
  ${columns.map(columnMarkup).join('')}
  <g transform="translate(1216 625)">
    <rect x="0" y="0" width="530" height="250" rx="5" fill="#0d3156"/>
    <rect x="10" y="10" width="510" height="230" rx="3" fill="none" stroke="#d8a72a" stroke-width="2"/>
    <path d="M54 64 H182 M348 64 H476" stroke="#d8a72a" stroke-width="2"/>
    <circle cx="265" cy="64" r="7" fill="none" stroke="#d8a72a" stroke-width="2"/>
    <text x="265" y="112" text-anchor="middle" font-family="Georgia,serif" font-size="46" font-weight="700" letter-spacing="5" fill="#f6f0dc">ОШ · OSH</text>
    <line x1="145" y1="135" x2="385" y2="135" stroke="#d8a72a" stroke-width="2"/>
    <text x="265" y="195" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" font-weight="800" letter-spacing="2" fill="#d8a72a">40,000 UZS</text>
  </g>
  <text x="1728" y="1198" text-anchor="end" font-family="Arial,sans-serif" font-size="34" font-weight="800" letter-spacing="2" fill="#0d3156">2-ЭТАЖ · 2nd FLOOR</text>
  <text x="1728" y="1232" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#0d3156">Ежедневно · Open daily 08:00–23:30</text>
  <line x1="92" y1="${height - 68}" x2="${width - 92}" y2="${height - 68}" stroke="#d8a72a" stroke-width="2"/>
  <text x="110" y="${height - 39}" font-family="Arial,sans-serif" font-size="13" fill="#0d3156">ZAR KEBAB · CURRENT MENU</text>
  <text x="${width / 2}" y="${height - 39}" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#0d3156">Prices in UZS · Narxlar UZSda</text>
  <text x="${width - 110}" y="${height - 39}" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#0d3156">Updated ${new Date().toISOString().slice(0, 10)}</text>
</svg>`

const deliverables = path.join(root, 'deliverables')
fs.mkdirSync(deliverables, { recursive: true })
const svgPath = path.join(deliverables, 'Zar-Kebab-Current-Menu-Board.svg')
const pngPath = path.join(deliverables, 'Zar-Kebab-Current-Menu-Board.png')
const webpPath = path.join(deliverables, 'Zar-Kebab-Current-Menu-Board.webp')
const htmlPath = path.join(deliverables, 'Zar-Kebab-Current-Menu-Board-Editable-Canva.html')
fs.writeFileSync(svgPath, svg)
await sharp(Buffer.from(svg)).png().toFile(pngPath)
await sharp(Buffer.from(svg)).webp({ quality: 92 }).toFile(webpPath)

const htmlColumns = columnCategoryIds
const htmlSection = group => group ? `
  <section class="menu-section">
    <h2>${escapeXml((group.category.name_ru || group.category.name_uz).toUpperCase())} / ${escapeXml((group.category.name_en || group.category.name_uz).toUpperCase())}</h2>
    ${group.items.map(item => `<div class="menu-row"><span>${escapeXml(item.name_ru || item.name_uz || item.name_en)}</span><span>${escapeXml(item.name_en || item.name_uz || item.name_ru)}</span><b>${formatPrice(item.price)}</b></div>`).join('')}
  </section>` : ''

const editableHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>Zar Kebab Current Menu</title>
<style>
@font-face{font-family:Neucha;src:url(data:font/truetype;base64,${menuFont}) format('truetype')}
*{box-sizing:border-box}html,body{margin:0;background:#0a294d}.page{position:relative;width:2400px;height:1350px;background:#f6f0dc;color:#123854;border:10px solid #d8a72a;outline:5px solid #0a294d;overflow:hidden;font-family:Arial,sans-serif}.inner{position:absolute;inset:17px;border:3px solid #0d3156}.header{position:absolute;left:17px;right:17px;top:17px;height:132px;background:#0a294d;color:#f6f0dc;text-align:center;padding-top:20px}.header:after{content:'';position:absolute;inset:0;opacity:.14;background-image:linear-gradient(45deg,transparent 45%,#55718c 46%,#55718c 54%,transparent 55%),linear-gradient(-45deg,transparent 45%,#55718c 46%,#55718c 54%,transparent 55%);background-size:56px 56px}.logo{position:absolute;left:66px;top:11px;width:150px;height:105px;object-fit:contain;z-index:2}.title{position:relative;z-index:2;font-family:Georgia,serif;font-size:41px;letter-spacing:8px;font-weight:bold}.subtitle{position:relative;z-index:2;margin:18px auto 0;width:810px;border-top:2px solid #d8a72a;padding-top:11px;color:#d8a72a;font-size:11px;letter-spacing:6px}.columns{position:absolute;left:76px;right:76px;top:178px;bottom:88px;display:grid;grid-template-columns:repeat(4,1fr);gap:28px}.column{position:relative;padding:0 14px;border-right:1px solid #d8ccb0}.column:last-child{border-right:0}.menu-section{margin:0 0 17px}.menu-section h2{margin:0 0 8px;padding:0 0 6px;border-bottom:2px solid #ba8b21;font-size:20px;line-height:1;font-weight:800;color:#0d3156}.menu-row{display:grid;grid-template-columns:46% 39% 15%;align-items:start;min-height:30px;line-height:1.05;font-family:Neucha,Arial,sans-serif;font-size:18px;color:#15394e}.menu-row span:nth-child(2){color:#31594f}.menu-row b{text-align:right;font-family:Arial,sans-serif;font-size:15px;color:#0d3156}.osh-feature{margin-top:92px;height:250px;border:10px solid #0d3156;outline:2px solid #d8a72a;outline-offset:-20px;background:#0d3156;color:#f6f0dc;text-align:center;padding-top:54px}.osh-title{font-family:Georgia,serif;font-size:46px;font-weight:700;letter-spacing:5px}.osh-rule{width:240px;margin:18px auto;border-top:2px solid #d8a72a}.osh-price{font-size:38px;font-weight:800;letter-spacing:2px;color:#d8a72a}.floor{position:absolute;left:0;right:0;bottom:44px;text-align:center;font-size:35px;font-weight:800;letter-spacing:2px;color:#0d3156}.hours{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:12px}.footer{position:absolute;left:76px;right:76px;bottom:36px;border-top:2px solid #d8a72a;padding-top:10px;display:flex;justify-content:space-between;font-size:11px;color:#0d3156}
</style></head><body>
<div class="page" data-document-role="page" data-label="Zar Kebab Current Menu">
  <div class="inner"></div>
  <header class="header"><img class="logo" src="data:image/png;base64,${logo}"><div class="title">MENU · МЕНЮ · MENYU</div><div class="subtitle">TRADITIONAL UZBEK &amp; EUROPEAN CUISINE</div></header>
  <main class="columns">
    ${htmlColumns.map((ids, index) => `<div class="column">${ids.map(id => htmlSection(groupById.get(id))).join('')}${index === 2 ? `<div class="osh-feature"><div class="osh-title">ОШ · OSH</div><div class="osh-rule"></div><div class="osh-price">40,000 UZS</div></div><div class="floor">2-ЭТАЖ · 2nd FLOOR</div><div class="hours">Ежедневно · Open daily 08:00–23:30</div>` : ''}</div>`).join('')}
  </main>
  <footer class="footer"><span>ZAR KEBAB · CURRENT MENU</span><span>Prices in UZS · Narxlar UZSda</span><span>Updated ${new Date().toISOString().slice(0, 10)}</span></footer>
</div></body></html>`
fs.writeFileSync(htmlPath, editableHtml)
console.log(JSON.stringify({ categories: groups.length, items: items.length, svgPath, pngPath, webpPath, htmlPath }))
