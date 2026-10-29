import { loadSalaryRows } from '../../src/lib/salaryData.js'

// Public POS menu shared by the Google Maps sync and the Yandex Business feed.
// Only public columns: never costs, recipes or tech cards.
const DEFAULT_EXCLUDED_CATEGORIES = 'Utensils,Corporate set'

const ITEM_COLUMNS = [
  'id', 'category_id', 'name_uz', 'name_ru', 'name_en', 'description_uz', 'description_ru', 'description_en',
  'price', 'image_url', 'sort_order', 'option_groups', 'grams', 'millilitres', 'litres', 'kcal', 'serves',
].join(',')

export function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function bySortOrder(a, b) {
  return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
}

// Mirrors src/lib/menuPricing.js: a variant's own price, else parent price + delta.
export function publicVariants(item) {
  return (Array.isArray(item.option_groups) ? item.option_groups : [])
    .filter(group => group?.id === 'variants')
    .flatMap(group => group.options || [])
    .filter(option => !option?.public_hidden)
    .map(option => ({
      ...option,
      price: Number(option.price) > 0 ? Number(option.price) : (Number(item.price) || 0) + (Number(option.price_delta) || 0),
    }))
}

export function excludedCategoryNames(env = process.env) {
  return new Set(String(env.GOOGLE_MENU_EXCLUDED_CATEGORIES ?? DEFAULT_EXCLUDED_CATEGORIES)
    .split(',').map(name => clean(name).toLowerCase()).filter(Boolean))
}

export async function loadPosMenu(supabase) {
  const [{ data: categories, error: categoryError }, { data: items, error: itemError }] = await Promise.all([
    supabase.from('menu_categories').select('id,name_uz,name_ru,name_en,sort_order,frozen_shop').is('deleted_at', null),
    loadSalaryRows(() => supabase.from('menu_items').select(ITEM_COLUMNS).is('deleted_at', null)),
  ])
  if (categoryError) throw categoryError
  if (itemError) throw itemError
  // Frozen half-prepared meals (272) are a retail line with their own site page, not the cafe menu.
  return { categories: (categories || []).filter(category => !category.frozen_shop), items: items || [] }
}
