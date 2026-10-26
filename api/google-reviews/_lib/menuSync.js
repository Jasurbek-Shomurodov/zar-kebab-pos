import sharp from 'sharp'
import { calculateUnitPrice, PRICE_MODE_TOURIST } from '../../../src/lib/priceModes.js'
import { gramsLabel, kcalLabel, millilitresLabel, getItemKcal } from '../../../src/lib/nutrition.js'
import { loadSalaryRows } from '../../../src/lib/salaryData.js'
import { getGoogleAccessToken, getGoogleBusinessConfig, googleLocationResource } from './googleBusiness.js'

const GOOGLE_BUSINESS_API_URL = 'https://mybusiness.googleapis.com'
const LANGS = ['en', 'ru', 'uz']
const DEFAULT_EXCLUDED_CATEGORIES = 'Utensils,Corporate set'
const TOURIST_PRICE = { en: 'Tourist price', ru: 'Цена для туристов', uz: 'Turistlar uchun narx' }
const TOURIST_SUFFIX = { en: ' — tourist', ru: ' — для туристов', uz: ' — turistlar uchun' }
const MENU_TITLE = { en: 'Menu', ru: 'Меню', uz: 'Menyu' }
// Google fetches PNG/JPEG by URL; anything else (WebP) is converted and uploaded as bytes.
const URL_UPLOAD_PATTERN = /\.(png|jpe?g)(\?|$)/i

const ITEM_COLUMNS = [
  'id', 'category_id', 'name_uz', 'name_ru', 'name_en', 'description_uz', 'description_ru', 'description_en',
  'price', 'image_url', 'sort_order', 'option_groups', 'grams', 'millilitres', 'litres', 'kcal',
].join(',')

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function money(units) {
  return { currencyCode: 'UZS', units: String(Math.max(0, Math.round(Number(units) || 0))) }
}

function localized(row, key, lang) {
  return clean(row?.[`${key}_${lang}`]) || clean(row?.[`${key}_en`])
}

function subtitle(item, lang) {
  return [gramsLabel(item, lang) || millilitresLabel(item), kcalLabel(item, lang)].filter(Boolean).join(' · ')
}

// Mirrors src/lib/menuPricing.js: a variant's own price, else parent price + delta.
function publicVariants(item) {
  return (Array.isArray(item.option_groups) ? item.option_groups : [])
    .filter(group => group?.id === 'variants')
    .flatMap(group => group.options || [])
    .filter(option => !option?.public_hidden)
    .map(option => ({
      ...option,
      price: Number(option.price) > 0 ? Number(option.price) : (Number(item.price) || 0) + (Number(option.price_delta) || 0),
    }))
}

function itemLabels(item) {
  return LANGS.map(lang => {
    const label = { displayName: localized(item, 'name', lang).slice(0, 140), languageCode: lang }
    // Google drops line breaks, so the POS card subtitle leads the description with a dash.
    const description = [subtitle(item, lang), clean(item[`description_${lang}`]) || clean(item.description_en)]
      .filter(Boolean).join(' — ')
    if (description) label.description = description.slice(0, 1000)
    return label
  })
}

function itemOptions(item, variants) {
  if (!variants.length) {
    return [{
      labels: LANGS.map(lang => ({ displayName: TOURIST_PRICE[lang], languageCode: lang })),
      attributes: { price: money(calculateUnitPrice(item.price, PRICE_MODE_TOURIST)) },
    }]
  }
  return variants.flatMap(variant => [false, true].map(tourist => ({
    labels: LANGS.map(lang => ({
      displayName: (localized(variant, 'label', lang) + (tourist ? TOURIST_SUFFIX[lang] : '')).slice(0, 140),
      languageCode: lang,
    })),
    attributes: { price: money(tourist ? calculateUnitPrice(variant.price, PRICE_MODE_TOURIST) : variant.price) },
  })))
}

export function excludedCategoryNames(env = process.env) {
  return new Set(String(env.GOOGLE_MENU_EXCLUDED_CATEGORIES ?? DEFAULT_EXCLUDED_CATEGORIES)
    .split(',').map(name => clean(name).toLowerCase()).filter(Boolean))
}

// Pure: POS categories/items (archived already removed) -> Google FoodMenus payload.
export function buildGoogleFoodMenu(categories, items, mediaKeysByUrl = {}, options = {}) {
  const excluded = options.excludedCategories || excludedCategoryNames()
  const bySort = (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
  const sections = []
  for (const category of [...categories].sort(bySort)) {
    if (excluded.has(clean(category.name_en).toLowerCase())) continue
    const sectionItems = items
      .filter(item => item.category_id === category.id)
      .sort(bySort)
      .map(item => {
        const variants = publicVariants(item)
        const basePrice = variants.length ? Math.min(...variants.map(variant => variant.price)) : item.price
        const attributes = { price: money(basePrice) }
        const kcal = getItemKcal(item)
        if (kcal) attributes.nutritionFacts = { calories: { lowerAmount: kcal, unit: 'CALORIE' } }
        const mediaKey = mediaKeysByUrl[item.image_url]
        if (mediaKey) attributes.mediaKeys = [mediaKey]
        return { labels: itemLabels(item), attributes, options: itemOptions(item, variants) }
      })
    if (!sectionItems.length) continue
    sections.push({
      labels: LANGS.map(lang => ({ displayName: localized(category, 'name', lang), languageCode: lang })),
      items: sectionItems,
    })
  }
  return { menus: [{ labels: LANGS.map(lang => ({ displayName: MENU_TITLE[lang], languageCode: lang })), sections }] }
}

// Google collapses whitespace and may reorder object keys, so compare a canonical form.
export function canonicalFoodMenu(payload) {
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).filter(key => key !== 'name').sort().map(key => [key, canonical(value[key])]))
    }
    return typeof value === 'string' ? clean(value) : value
  }
  return JSON.stringify(canonical({ menus: payload?.menus || [] }))
}

async function googleRequest(path, accessToken, { method = 'GET', body, rawBody, contentType, fetchImpl }) {
  const response = await fetchImpl(`${GOOGLE_BUSINESS_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined || rawBody ? { 'Content-Type': contentType || 'application/json' } : {}),
    },
    ...(rawBody ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let payload = {}
  try { payload = text ? JSON.parse(text) : {} } catch { payload = { raw: text.slice(0, 300) } }
  if (!response.ok) throw new Error(payload?.error?.message || `Google API request failed (${response.status})`)
  return payload
}

async function uploadMenuPhoto(imageUrl, location, accessToken, fetchImpl) {
  const mediaPath = `/v4/${location}/media`
  let created
  if (URL_UPLOAD_PATTERN.test(imageUrl)) {
    created = await googleRequest(mediaPath, accessToken, {
      method: 'POST', fetchImpl,
      body: { mediaFormat: 'PHOTO', locationAssociation: { category: 'MENU' }, sourceUrl: imageUrl },
    })
  } else {
    const image = await fetchImpl(imageUrl)
    if (!image.ok) throw new Error(`Photo download failed (${image.status})`)
    const jpeg = await sharp(Buffer.from(await image.arrayBuffer())).jpeg({ quality: 90 }).toBuffer()
    const { resourceName } = await googleRequest(`${mediaPath}:startUpload`, accessToken, { method: 'POST', body: {}, fetchImpl })
    await googleRequest(`/upload/v1/media/${resourceName}?upload_type=media`, accessToken, {
      method: 'POST', rawBody: jpeg, contentType: 'image/jpeg', fetchImpl,
    })
    created = await googleRequest(mediaPath, accessToken, {
      method: 'POST', fetchImpl,
      body: { mediaFormat: 'PHOTO', locationAssociation: { category: 'MENU' }, dataRef: { resourceName } },
    })
  }
  const mediaKey = String(created?.name || '').split('/').pop()
  if (!mediaKey) throw new Error('Google did not return a media key')
  return mediaKey
}

async function loadPosMenu(supabase) {
  const [{ data: categories, error: categoryError }, { data: items, error: itemError }] = await Promise.all([
    supabase.from('menu_categories').select('id,name_uz,name_ru,name_en,sort_order').is('deleted_at', null),
    loadSalaryRows(() => supabase.from('menu_items').select(ITEM_COLUMNS).is('deleted_at', null)),
  ])
  if (categoryError) throw categoryError
  if (itemError) throw itemError
  return { categories: categories || [], items: items || [] }
}

async function loadPhotoKeys(supabase) {
  const { data, error } = await loadSalaryRows(() => supabase.from('google_menu_photo_keys').select('id,image_url,media_key'))
  if (error) throw error
  return Object.fromEntries((data || []).map(row => [row.image_url, row.media_key]))
}

export async function runGoogleMenuSync(options = {}) {
  const env = options.env || process.env
  const fetchImpl = options.fetchImpl || fetch
  const supabase = options.supabase
  const config = getGoogleBusinessConfig(env)
  const location = googleLocationResource(config)
  const accessToken = await getGoogleAccessToken(config, fetchImpl)
  const { categories, items } = await loadPosMenu(supabase)
  const excludedCategories = excludedCategoryNames(env)
  const mediaKeys = await loadPhotoKeys(supabase)

  const includedCategoryIds = new Set(categories
    .filter(category => !excludedCategories.has(clean(category.name_en).toLowerCase()))
    .map(category => category.id))
  const neededUrls = [...new Set(items
    .filter(item => includedCategoryIds.has(item.category_id) && item.image_url)
    .map(item => item.image_url))]

  const photoFailures = []
  let photosUploaded = 0
  for (const imageUrl of neededUrls) {
    if (mediaKeys[imageUrl]) continue
    try {
      const mediaKey = await uploadMenuPhoto(imageUrl, location, accessToken, fetchImpl)
      // Save each key at once so a later failure never re-uploads this photo.
      const { error } = await supabase.from('google_menu_photo_keys').upsert({ image_url: imageUrl, media_key: mediaKey }, { onConflict: 'image_url' })
      if (error) throw error
      mediaKeys[imageUrl] = mediaKey
      photosUploaded += 1
    } catch (error) {
      photoFailures.push({ imageUrl, error: String(error?.message || error).slice(0, 300) })
    }
  }

  const menu = buildGoogleFoodMenu(categories, items, mediaKeys, { excludedCategories })
  const sectionCount = menu.menus[0].sections.length
  const itemCount = menu.menus[0].sections.reduce((sum, section) => sum + section.items.length, 0)
  const summary = { sections: sectionCount, items: itemCount, photosUploaded, photoFailures }
  // An empty read must never wipe the live Google menu.
  if (!itemCount) throw new Error('Refusing to publish an empty Google menu')

  const current = await googleRequest(`/v4/${location}/foodMenus`, accessToken, { fetchImpl })
  if (canonicalFoodMenu(current) === canonicalFoodMenu(menu)) return { mode: 'unchanged', ...summary }
  await googleRequest(`/v4/${location}/foodMenus`, accessToken, {
    method: 'PATCH', fetchImpl, body: { name: `${location}/foodMenus`, ...menu },
  })
  return { mode: 'published', ...summary }
}
