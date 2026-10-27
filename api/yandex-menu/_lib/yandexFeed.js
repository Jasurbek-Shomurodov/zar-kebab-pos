import { calculateUnitPrice, PRICE_MODE_TOURIST } from '../../../src/lib/priceModes.js'
import { gramsLabel, kcalLabel, millilitresLabel } from '../../../src/lib/nutrition.js'
import { bySortOrder, clean, excludedCategoryNames, loadPosMenu, publicVariants } from '../../_lib/posMenu.js'
import { json } from '../../telegram/_lib/http.js'
import { getSupabaseAdmin } from '../../telegram/_lib/supabaseAdmin.js'

const VENDOR = 'Zar Kebab'
const TOURIST_SUFFIX = ' — для туристов'
// Yandex Business takes JPEG/PNG photos only; WebP items are published without a photo.
const PICTURE_PATTERN = /\.(png|jpe?g)(\?|$)/i

function xml(value) {
  return clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Yandex offer ids allow letters, digits and . , \ / ( ) [ ] - = only, up to 80 chars.
function offerId(value) {
  return String(value).replace(/[^A-Za-z0-9.,\\/()[\]\-=]/g, '-').slice(0, 80)
}

function ru(row, key) {
  return clean(row?.[`${key}_ru`]) || clean(row?.[`${key}_en`])
}

function priceRows(item) {
  const variants = publicVariants(item)
  if (!variants.length) return [{ id: item.id, name: ru(item, 'name'), price: Number(item.price) || 0 }]
  return variants.map(variant => {
    // Labels like "Кока-Кола 1L" already name the dish; bare ones like "Казы" need it.
    const label = ru(variant, 'label')
    const sameStart = label.slice(0, 4).toLowerCase() === ru(item, 'name').slice(0, 4).toLowerCase()
    return {
      id: `${item.id}-${variant.id || variant.label_en}`,
      name: sameStart ? label : `${ru(item, 'name')} (${label})`,
      price: variant.price,
    }
  })
}

// Pure: POS categories/items (archived already removed) -> Yandex Business YML price list.
// Russian names, UZS prices, and a "для туристов" copy of every price, like the Google menu.
export function buildYandexMenuYml(categories, items, options = {}) {
  const excluded = options.excludedCategories || excludedCategoryNames()
  const categoryLines = []
  const offerBlocks = []
  for (const category of [...categories].sort(bySortOrder)) {
    if (excluded.has(clean(category.name_en).toLowerCase())) continue
    const categoryItems = items.filter(item => item.category_id === category.id).sort(bySortOrder)
    if (!categoryItems.length) continue
    const categoryId = categoryLines.length + 1
    categoryLines.push(`      <category id="${categoryId}">${xml(ru(category, 'name'))}</category>`)
    for (const item of categoryItems) {
      const subtitle = [gramsLabel(item, 'ru') || millilitresLabel(item), kcalLabel(item, 'ru')].filter(Boolean).join(' · ')
      const description = [subtitle, ru(item, 'description')].filter(Boolean).join(' — ').slice(0, 3000)
      const picture = PICTURE_PATTERN.test(item.image_url || '') ? item.image_url : ''
      for (const row of priceRows(item)) {
        for (const tourist of [false, true]) {
          const price = Math.round(tourist ? calculateUnitPrice(row.price, PRICE_MODE_TOURIST) : row.price)
          // Yandex never publishes a zero price.
          if (!(price > 0)) continue
          offerBlocks.push([
            `      <offer id="${offerId(row.id + (tourist ? '-t' : ''))}">`,
            `        <name>${xml((row.name + (tourist ? TOURIST_SUFFIX : '')).slice(0, 250))}</name>`,
            `        <vendor>${VENDOR}</vendor>`,
            `        <categoryId>${categoryId}</categoryId>`,
            `        <price>${price}</price>`,
            '        <currencyId>UZS</currencyId>',
            description && `        <description>${xml(description)}</description>`,
            picture && `        <picture>${xml(picture)}</picture>`,
            '      </offer>',
          ].filter(Boolean).join('\n'))
        }
      }
    }
  }
  const yml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<yml_catalog>',
    '  <shop>',
    '    <categories>',
    ...categoryLines,
    '    </categories>',
    '    <offers>',
    ...offerBlocks,
    '    </offers>',
    '  </shop>',
    '</yml_catalog>',
    '',
  ].join('\n')
  return { yml, offers: offerBlocks.length }
}

// Public feed for Yandex Business (Товары и услуги → Источник → YML‑фид), served at /yandex-menu.yml
// through api/google-reviews/run.js to stay within the Hobby function limit.
// Yandex replaces the whole price list with each fetch, so failures answer 503 and never an empty feed.
export async function serveYandexMenuFeed(req, res, { supabase } = {}) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD')
    return json(res, 405, { error: 'Method not allowed' })
  }
  try {
    const { categories, items } = await loadPosMenu(supabase || getSupabaseAdmin())
    const { yml, offers } = buildYandexMenuYml(categories, items)
    if (!offers) return json(res, 503, { ok: false, error: 'Menu is empty' })
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600')
    res.end(req.method === 'HEAD' ? undefined : yml)
  } catch (error) {
    console.error('[yandex-menu] feed failed:', error)
    return json(res, 503, { ok: false, error: 'Menu is temporarily unavailable' })
  }
}
