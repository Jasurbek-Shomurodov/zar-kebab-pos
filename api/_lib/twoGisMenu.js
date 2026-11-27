import { createHash } from 'node:crypto'
import { calculateUnitPrice, PRICE_MODE_TOURIST } from '../../src/lib/priceModes.js'

// 2GIS price list (Товары и услуги → Добавить → Из файла / По ссылке), built from the Yandex YML
// so names, variants, photos and archived-item rules stay identical on both maps.
// Format from the 2GIS instruction and sample CSV: `;`-separated UTF-8, header
// name;price;currencyId;measure;available;category;url;picture;vendor;id;description.
export const TWO_GIS_COLUMNS = ['name', 'price', 'currencyId', 'measure', 'available', 'category', 'url', 'picture', 'vendor', 'id', 'description']
// 2GIS rules forbid alcohol; Yandex keeps it.
const DEFAULT_EXCLUDED_CATEGORIES = 'Алкоголь'
const MAX_NAME = 200
const MAX_DESCRIPTION = 500
// 2GIS rejects descriptions with promo words, links or contacts.
const FORBIDDEN_DESCRIPTION = /(скидк|акци|новинк|\bхит\b|бесплатн|https?:\/\/|www\.|\+?\d[\d\s()-]{8,}\d)/iu

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }

function decodeXml(value) {
  return String(value ?? '').replace(/&(amp|lt|gt|quot|apos);/g, entity => ENTITIES[entity])
}

function tag(body, name) {
  const match = body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return match ? decodeXml(match[1]).replace(/\s+/g, ' ').trim() : ''
}

export function twoGisExcludedCategories(env = process.env) {
  return new Set(String(env.TWO_GIS_EXCLUDED_CATEGORIES ?? DEFAULT_EXCLUDED_CATEGORIES)
    .split(',').map(name => name.trim().toLowerCase()).filter(Boolean))
}

// 2GIS ids: letters and digits only, up to 20 characters. Long POS variant ids get a stable hash.
export function twoGisId(offerId) {
  const plain = String(offerId).replace(/[^A-Za-z0-9]/g, '')
  if (plain && plain.length <= 20) return plain
  return `z${createHash('sha1').update(String(offerId)).digest('hex').slice(0, 19)}`
}

// 2GIS refuses all-caps names ("МОХИТО"); short brand-like words such as "BBQ" stay.
export function twoGisName(name) {
  const text = String(name).trim()
  const letters = text.replace(/[^\p{L}]/gu, '')
  const shouted = letters.length > 4 && letters === letters.toLocaleUpperCase('ru') && letters !== letters.toLocaleLowerCase('ru')
  const fixed = shouted ? text.charAt(0) + text.slice(1).toLocaleLowerCase('ru') : text
  return [...fixed].slice(0, MAX_NAME).join('')
}

export function twoGisDescription(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean || FORBIDDEN_DESCRIPTION.test(clean)) return ''
  const chars = [...clean]
  if (chars.length <= MAX_DESCRIPTION) return clean
  const cut = chars.slice(0, MAX_DESCRIPTION - 1).join('')
  const space = cut.lastIndexOf(' ')
  return `${(space > MAX_DESCRIPTION / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/u, '')}…`
}

function csvField(value) {
  const text = String(value ?? '').replace(/[\t\r\n]+/g, ' ')
  return /[;"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Pure: Yandex YML -> 2GIS CSV rows (objects keyed by TWO_GIS_COLUMNS).
// 2GIS always lists the tourist price (owner rule, 2026-11-27); the YML carries the regular one.
export function twoGisRowsFromYml(yml, { excludedCategories = twoGisExcludedCategories(), priceMode = PRICE_MODE_TOURIST } = {}) {
  const categories = new Map([...String(yml).matchAll(/<category id="([^"]*)">([\s\S]*?)<\/category>/g)]
    .map(match => [match[1], decodeXml(match[2]).trim()]))
  const rows = []
  for (const match of String(yml).matchAll(/<offer id="([^"]*)">([\s\S]*?)<\/offer>/g)) {
    const body = match[2]
    const category = categories.get(tag(body, 'categoryId')) || ''
    if (excludedCategories.has(category.toLowerCase())) continue
    const price = calculateUnitPrice(tag(body, 'price'), priceMode)
    if (!(price > 0)) continue
    rows.push({
      name: twoGisName(tag(body, 'name')),
      price,
      // 2GIS sets the currency from the company's location; UZS states it outright for Tashkent.
      currencyId: tag(body, 'currencyId') || 'UZS',
      measure: '',
      available: '',
      category,
      url: '',
      picture: tag(body, 'picture'),
      vendor: '',
      id: twoGisId(decodeXml(match[1])),
      description: twoGisDescription(tag(body, 'description')),
    })
  }
  return rows
}

export function buildTwoGisCsv(rows) {
  const lines = [TWO_GIS_COLUMNS.join(';'), ...rows.map(row => TWO_GIS_COLUMNS.map(key => csvField(row[key])).join(';'))]
  return `${lines.join('\n')}\n`
}

export function buildTwoGisMenuCsv(yml, options) {
  const rows = twoGisRowsFromYml(yml, options)
  return { csv: buildTwoGisCsv(rows), offers: rows.length }
}

// Reads a 2GIS CSV back (for the diff against the last upload). Handles quoted fields.
export function parseTwoGisCsv(csv) {
  const lines = String(csv).split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const header = lines[0].split(';')
  return lines.slice(1).map(line => {
    const values = []
    let current = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (quoted) {
        if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1 } else if (char === '"') quoted = false
        else current += char
      } else if (char === '"') quoted = true
      else if (char === ';') { values.push(current); current = '' } else current += char
    }
    values.push(current)
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']))
  })
}
