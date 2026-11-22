// Search-engine copy for the public site, shared by the React pages (JS crawlers such as
// Google) and scripts/prerender-public-seo.mjs (static HTML for Bing, Yandex and link previews).
// Keep title <= 60 and description <= 160 characters.
import { getMenuItemLinkKey, getMenuItemPublicPath } from './menuLinks.js'

export const PUBLIC_SITE_ORIGIN = 'https://www.zarkebab.uz'

export const PUBLIC_MENU_SEO = {
  uz: {
    title: 'Zar Kebab — Toshkentda halol shashlik, osh va kabob',
    heading: 'Zar Kebab — Toshkentdagi O‘zbek, Uyg‘ur va Turk restorani',
    description: 'Toshkentdagi halol restoran: shashlik, kabob, osh, manti, chuchvara, lag‘mon va nonushta. O‘zbek, uyg‘ur va turk taomlari. +998 91-509-55-45.',
    locale: 'uz_UZ',
  },
  ru: {
    title: 'Zar Kebab — шашлык, плов и халяль кухня в Ташкенте',
    heading: 'Zar Kebab — ресторан узбекской, уйгурской и турецкой кухни в Ташкенте',
    description: 'Халяль ресторан в Ташкенте: шашлык, плов, манты, чучвара, лагман, казан-кебаб и завтраки. Узбекская, уйгурская и турецкая кухня. +998 91-509-55-45.',
    locale: 'ru_RU',
  },
  en: {
    title: 'Zar Kebab — Halal Shashlik, Plov & Kebab in Tashkent',
    heading: 'Zar Kebab — Uzbek, Uyghur & Turkish restaurant in Tashkent',
    description: 'Halal restaurant in Tashkent: shashlik, kebab, plov, manti and chuchvara dumplings, lagman and breakfast. Uzbek, Uyghur and Turkish food. +998 91-509-55-45.',
    locale: 'en_US',
  },
}

const ITEM_COPY = {
  uz: { city: 'Toshkentda', fallback: name => `${name} — Zar Kebab halol restoranining taomi, Toshkent, Matbuotchilar 17. Buyurtma: +998 91-509-55-45.` },
  ru: { city: 'в Ташкенте', fallback: name => `${name} в халяль ресторане Zar Kebab, Ташкент, Матбуотчилар 17. Заказ и бронирование: +998 91-509-55-45.` },
  en: { city: 'in Tashkent', fallback: name => `${name} at Zar Kebab, a halal restaurant on Matbuotchilar 17, Tashkent. Orders and bookings: +998 91-509-55-45.` },
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function localizedItemText(item, key, lang) {
  for (const code of [lang, 'ru', 'en', 'uz']) {
    const value = clean(item?.[`${key}_${code}`])
    if (value) return value
  }
  return ''
}

function truncate(text, max) {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,.;:—-]+$/, '')}…`
}

// One dish page: /menu/item/<key>. The static prerender and the React detail view use the same copy.
export function menuItemSeo(item, lang = 'ru') {
  const copy = ITEM_COPY[lang] || ITEM_COPY.ru
  const name = localizedItemText(item, 'name', lang)
  // Only this language's own description; another language's text would read as foreign copy.
  const description = clean(item?.[`description_${lang}`]).replace(/[.\s]+$/, '')
  const path = getMenuItemPublicPath(item, '/menu')
  return {
    key: getMenuItemLinkKey(item),
    name,
    title: truncate(`${name} ${copy.city} — Zar Kebab`, 70),
    description: truncate(description ? `${description} — Zar Kebab, ${copy.city}.` : copy.fallback(name), 160),
    path,
    url: `${PUBLIC_SITE_ORIGIN}${path}`,
  }
}
