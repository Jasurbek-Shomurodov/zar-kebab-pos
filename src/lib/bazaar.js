import { todayExpenseDate } from './expenses.js'

const LANGUAGE_FALLBACK = 'en'
const DECIMAL_UNITS = new Set(['kg', 'g', 'l', 'ml'])
const WHOLE_NUMBER_UNITS = new Set(['pcs', 'pack', 'box', 'bag', 'bottle', 'bunch'])

export const BAZAAR_CATEGORIES = [
  { key: 'meat', labels: { uz: 'Go‘sht', ru: 'Мясо', en: 'Meat' } },
  { key: 'poultry', labels: { uz: 'Parranda', ru: 'Птица', en: 'Poultry' } },
  { key: 'vegetables', labels: { uz: 'Sabzavotlar', ru: 'Овощи', en: 'Vegetables' } },
  { key: 'fruit', labels: { uz: 'Mevalar', ru: 'Фрукты', en: 'Fruit' } },
  { key: 'dairy', labels: { uz: 'Sut mahsulotlari', ru: 'Молочные продукты', en: 'Dairy' } },
  { key: 'grocery', labels: { uz: 'Bakaleya', ru: 'Бакалея', en: 'Grocery' } },
  { key: 'spices', labels: { uz: 'Ziravorlar', ru: 'Специи', en: 'Spices' } },
  { key: 'beverages', labels: { uz: 'Ichimliklar', ru: 'Напитки', en: 'Beverages' } },
  { key: 'bakery', labels: { uz: 'Non mahsulotlari', ru: 'Хлеб и выпечка', en: 'Bakery' } },
  { key: 'packaging', labels: { uz: 'Qadoqlash', ru: 'Упаковка', en: 'Packaging' } },
  { key: 'cleaning', labels: { uz: 'Tozalash', ru: 'Уборка', en: 'Cleaning' } },
  { key: 'charcoal', labels: { uz: 'Ko‘mir', ru: 'Уголь', en: 'Charcoal' } },
]

export const BAZAAR_ENTRY_CATEGORIES = BAZAAR_CATEGORIES

// Owner-added categories are stored as `custom:<name>` so every reader can label them without a lookup.
export const BAZAAR_CUSTOM_CATEGORY_PREFIX = 'custom:'
export const BAZAAR_CUSTOM_CATEGORY_MAX_LENGTH = 60

export function isCustomBazaarCategory(category) {
  const value = String(category || '')
  if (!value.startsWith(BAZAAR_CUSTOM_CATEGORY_PREFIX)) return false
  const name = value.slice(BAZAAR_CUSTOM_CATEGORY_PREFIX.length)
  return name.trim() === name && name.length > 0 && name.length <= BAZAAR_CUSTOM_CATEGORY_MAX_LENGTH
}

export function customBazaarCategoryKey(name) {
  const cleaned = String(name || '').replace(/\s+/g, ' ').trim().slice(0, BAZAAR_CUSTOM_CATEGORY_MAX_LENGTH).trim()
  return cleaned ? `${BAZAAR_CUSTOM_CATEGORY_PREFIX}${cleaned}` : ''
}

export function isValidBazaarCategory(category) {
  return CATEGORY_KEYS.has(category) || isCustomBazaarCategory(category)
}

// Built-in categories first, then custom categories found on the given rows, alphabetically.
export function bazaarCategoriesFor(rows = []) {
  const custom = new Map()
  for (const row of rows) {
    const key = typeof row === 'string' ? row : row?.category
    if (isCustomBazaarCategory(key) && !custom.has(key.toLocaleLowerCase())) custom.set(key.toLocaleLowerCase(), key)
  }
  const customDefinitions = [...custom.values()]
    .sort((left, right) => left.localeCompare(right))
    .map(key => {
      const name = key.slice(BAZAAR_CUSTOM_CATEGORY_PREFIX.length)
      return { key, custom: true, labels: { uz: name, ru: name, en: name } }
    })
  return [...BAZAAR_CATEGORIES, ...customDefinitions]
}

export const BAZAAR_UNITS = [
  { key: 'kg', labels: { uz: 'kg', ru: 'кг', en: 'kg' } },
  { key: 'g', labels: { uz: 'g', ru: 'г', en: 'g' } },
  { key: 'l', labels: { uz: 'l', ru: 'л', en: 'L' } },
  { key: 'ml', labels: { uz: 'ml', ru: 'мл', en: 'ml' } },
  { key: 'pcs', labels: { uz: 'dona', ru: 'шт', en: 'pcs' } },
  { key: 'pack', labels: { uz: 'qadoq', ru: 'упак', en: 'pack' } },
  { key: 'box', labels: { uz: 'quti', ru: 'короб', en: 'box' } },
  { key: 'bag', labels: { uz: 'qop', ru: 'мешок', en: 'bag' } },
  { key: 'bottle', labels: { uz: 'butilka', ru: 'бутылка', en: 'bottle' } },
  { key: 'bunch', labels: { uz: 'bog‘', ru: 'пучок', en: 'bunch' } },
]

export const BAZAAR_ENTRY_UNITS = BAZAAR_UNITS

// Container units may record how many pieces one unit holds (a box of 30 eggs).
// Mirrors public.bazaar_ingredient_pieces_per_unit (239).
export const BAZAAR_PACKAGE_UNITS = new Set(['pack', 'box', 'bag', 'bottle', 'bunch'])

export function normalizeBazaarPiecesPerUnit(unit, value) {
  if (!BAZAAR_PACKAGE_UNITS.has(unit)) return null
  const pieces = Number(String(value ?? '').trim())
  return Number.isInteger(pieces) && pieces >= 1 && pieces <= 100_000 ? pieces : null
}

export function bazaarPricePerPiece(price, pieces) {
  const count = Number(pieces) || 0
  return count > 0 ? (Number(price) || 0) / count : null
}

export const BAZAAR_PAYMENT_METHODS = [
  { key: 'cash', labels: { uz: 'Naqd', ru: 'Наличные', en: 'Cash' } },
  { key: 'card', labels: { uz: 'Karta', ru: 'Карта', en: 'Card' } },
  { key: 'terminal', labels: { uz: 'Terminal', ru: 'Терминал', en: 'Terminal' } },
]

// Terminal remains a display value for historical Accounting backfills, but
// new structured Bazaar receipts may be paid only by cash or card.
export const BAZAAR_ENTRY_PAYMENT_METHODS = BAZAAR_PAYMENT_METHODS.filter(method => method.key !== 'terminal')

const CATEGORY_KEYS = new Set(BAZAAR_CATEGORIES.map(category => category.key))
const ENTRY_CATEGORY_KEYS = new Set(BAZAAR_ENTRY_CATEGORIES.map(category => category.key))
const UNIT_KEYS = new Set(BAZAAR_UNITS.map(unit => unit.key))
const PAYMENT_KEYS = new Set(BAZAAR_PAYMENT_METHODS.map(method => method.key))
const ENTRY_UNIT_KEYS = new Set(BAZAAR_ENTRY_UNITS.map(unit => unit.key))
const ENTRY_PAYMENT_KEYS = new Set(BAZAAR_ENTRY_PAYMENT_METHODS.map(method => method.key))

function definitionLabel(definitions, key, lang) {
  const definition = definitions.find(item => item.key === key)
  return definition?.labels?.[lang] || definition?.labels?.[LANGUAGE_FALLBACK] || String(key || '')
}

export function bazaarCategoryLabel(category, lang = LANGUAGE_FALLBACK) {
  if (isCustomBazaarCategory(category)) return category.slice(BAZAAR_CUSTOM_CATEGORY_PREFIX.length)
  return definitionLabel(BAZAAR_CATEGORIES, CATEGORY_KEYS.has(category) ? category : 'vegetables', lang)
}

export function bazaarUnitLabel(unit, lang = LANGUAGE_FALLBACK) {
  return definitionLabel(BAZAAR_UNITS, UNIT_KEYS.has(unit) ? unit : 'pcs', lang)
}

export function bazaarPaymentMethodLabel(method, lang = LANGUAGE_FALLBACK) {
  return definitionLabel(BAZAAR_PAYMENT_METHODS, PAYMENT_KEYS.has(method) ? method : 'cash', lang)
}

export function normalizeBazaarText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export function normalizeBazaarProductKey(value) {
  return normalizeBazaarText(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u2018\u2019`\u00b4]/g, "'")
}

function parseBazaarQuantity(value) {
  const normalized = typeof value === 'string'
    ? value.trim().replace(/\s+/g, '').replace(',', '.')
    : value
  return Number(normalized)
}

function hasAtMostThreeDecimalPlaces(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s+/g, '').replace(',', '.')
    const decimal = normalized.split('.')[1] || ''
    return decimal.length <= 3
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) && Math.abs(numeric * 1000 - Math.round(numeric * 1000)) < 1e-7
}

export function normalizeBazaarQuantity(value) {
  const quantity = parseBazaarQuantity(value)
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  return Math.round(quantity * 1000) / 1000
}

export function normalizeBazaarMoney(value) {
  const normalized = typeof value === 'string'
    ? value.replace(/\s+/g, '').replace(/,/g, '')
    : value
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.max(0, Math.round(amount))
}

export function normalizeBazaarUnit(value) {
  const aliases = {
    kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
    gram: 'g', grams: 'g',
    litre: 'l', litres: 'l', liter: 'l', liters: 'l',
    millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
    pc: 'pcs', piece: 'pcs', pieces: 'pcs', count: 'pcs', dona: 'pcs',
  }
  const raw = normalizeBazaarText(value).toLowerCase()
  const unit = aliases[raw] || raw
  return UNIT_KEYS.has(unit) ? unit : 'pcs'
}

export function normalizeBazaarQuantityToBase(quantity, unit) {
  const normalizedQuantity = normalizeBazaarQuantity(quantity)
  const normalizedUnit = normalizeBazaarUnit(unit)
  if (normalizedUnit === 'g') return { quantity: normalizedQuantity / 1000, unit: 'kg' }
  if (normalizedUnit === 'ml') return { quantity: normalizedQuantity / 1000, unit: 'l' }
  return { quantity: normalizedQuantity, unit: normalizedUnit }
}

export function getBazaarDisplayQuantity(quantity, unit) {
  const normalizedQuantity = normalizeBazaarQuantity(quantity)
  const normalizedUnit = normalizeBazaarUnit(unit)
  if ((normalizedUnit === 'g' || normalizedUnit === 'ml') && normalizedQuantity >= 1000) {
    return normalizeBazaarQuantityToBase(normalizedQuantity, normalizedUnit)
  }
  return { quantity: normalizedQuantity, unit: normalizedUnit }
}

export function normalizeBazaarItem(item = {}, index = 0) {
  const productName = normalizeBazaarText(item.product_name ?? item.productName ?? item.name)
  const productKey = normalizeBazaarProductKey(item.product_key || productName)
  const category = isValidBazaarCategory(item.category) ? item.category : 'vegetables'
  const unit = normalizeBazaarUnit(item.unit)
  return {
    ...item,
    id: item.id || '',
    product_name: productName,
    product_key: productKey,
    category,
    quantity: normalizeBazaarQuantity(item.quantity),
    unit,
    line_total: normalizeBazaarMoney(item.line_total ?? item.lineTotal ?? item.total),
    sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index,
    notes: normalizeBazaarText(item.notes),
  }
}

export function normalizeBazaarPurchase(purchase = {}) {
  const items = (purchase.bazaar_purchase_items || purchase.items || [])
    .map(normalizeBazaarItem)
    .sort((a, b) => a.sort_order - b.sort_order || String(a.id).localeCompare(String(b.id)))
  return {
    ...purchase,
    id: purchase.id || '',
    purchase_date: normalizeBazaarDate(purchase.purchase_date),
    payment_method: PAYMENT_KEYS.has(purchase.payment_method) ? purchase.payment_method : 'cash',
    buyer_profile_id: normalizeBazaarText(purchase.buyer_profile_id),
    buyer_name: normalizeBazaarText(purchase.buyer_name),
    notes: normalizeBazaarText(purchase.notes),
    total_amount: normalizeBazaarMoney(purchase.total_amount),
    bazaar_purchase_items: items,
    items,
  }
}

export function calculateBazaarTotal(items = []) {
  return (items || []).reduce((total, item) => total + normalizeBazaarMoney(item?.line_total ?? item?.lineTotal), 0)
}

export function getBazaarPurchaseTotal(purchase = {}) {
  const items = purchase.bazaar_purchase_items || purchase.items || []
  const itemTotal = calculateBazaarTotal(items)
  return itemTotal > 0 ? itemTotal : normalizeBazaarMoney(purchase.total_amount)
}

function bazaarPurchaseHeaderSearchText(purchase) {
  return [
    purchase.buyer_name,
    purchase.notes,
    purchase.created_by_name,
  ].join(' ').toLocaleLowerCase()
}

function bazaarItemSearchText(item) {
  return [
    item.product_name,
    item.product_key,
    item.notes,
  ].join(' ').toLocaleLowerCase()
}

export function getBazaarPurchaseScopedItems(purchase = {}, category = 'all', query = '') {
  const normalized = normalizeBazaarPurchase(purchase)
  const categoryItems = category && category !== 'all'
    ? normalized.items.filter(item => item.category === category)
    : normalized.items
  const normalizedQuery = normalizeBazaarText(query).toLocaleLowerCase()

  if (!normalizedQuery || bazaarPurchaseHeaderSearchText(normalized).includes(normalizedQuery)) {
    return categoryItems
  }

  return categoryItems.filter(item => bazaarItemSearchText(item).includes(normalizedQuery))
}

export function getBazaarPurchaseScopedTotal(purchase = {}, category = 'all', query = '') {
  if ((!category || category === 'all') && !normalizeBazaarText(query)) return getBazaarPurchaseTotal(purchase)
  return calculateBazaarTotal(getBazaarPurchaseScopedItems(purchase, category, query))
}

export function getBazaarSubmissionAttempt(previousAttempt, payload, createRequestKey) {
  const fingerprint = JSON.stringify(payload)
  if (
    previousAttempt?.requestKey
    && previousAttempt.fingerprint === fingerprint
  ) {
    return previousAttempt
  }

  const requestKey = createRequestKey?.()
  if (!requestKey) throw new Error('A Daily Bazaar request key is required')
  return { fingerprint, requestKey }
}

export function getBazaarUnitCost(item = {}) {
  const base = normalizeBazaarQuantityToBase(item.quantity, item.unit)
  const total = normalizeBazaarMoney(item.line_total ?? item.lineTotal)
  return base.quantity > 0 ? total / base.quantity : 0
}

export function calculateBazaarNormalTotal(quantity, normalUnitPrice) {
  const normalizedQuantity = normalizeBazaarQuantity(quantity)
  const normalizedPrice = normalizeBazaarMoney(normalUnitPrice)
  return normalizedQuantity > 0 && normalizedPrice > 0
    ? Math.round(normalizedQuantity * normalizedPrice)
    : 0
}

export function getBazaarNormalLineTotal(item = {}) {
  const savedTotal = Number(item.normal_line_total)
  if (Number.isFinite(savedTotal) && savedTotal > 0) return Math.round(savedTotal)
  return calculateBazaarNormalTotal(item.quantity, item.normal_unit_price)
}

export function getBazaarPriceDifference(item = {}) {
  const savedDifference = Number(item.price_difference)
  if (item.price_difference !== undefined && item.price_difference !== null && Number.isFinite(savedDifference)) {
    return Math.round(savedDifference)
  }
  const paid = normalizeBazaarMoney(item.line_total ?? item.lineTotal)
  const normal = getBazaarNormalLineTotal(item)
  return paid > 0 && normal > 0 ? paid - normal : 0
}

export function calculateBazaarExpectedTotal(items = []) {
  return (items || []).reduce((total, item) => total + getBazaarNormalLineTotal(item), 0)
}

export function calculateBazaarPriceDifference(items = []) {
  return (items || []).reduce((total, item) => total + getBazaarPriceDifference(item), 0)
}

export function validateBazaarPurchase(purchase = {}) {
  const normalized = normalizeBazaarPurchase(purchase)
  const rawItems = purchase.bazaar_purchase_items || purchase.items || []
  const errors = []
  if (!normalized.purchase_date) errors.push({ code: 'purchase_date_required', field: 'purchase_date' })
  if (!ENTRY_PAYMENT_KEYS.has(purchase.payment_method)) errors.push({ code: 'payment_method_required', field: 'payment_method' })
  if (!normalized.buyer_profile_id) errors.push({ code: 'buyer_profile_id_required', field: 'buyer_profile_id' })
  if (normalized.items.length === 0) errors.push({ code: 'items_required', field: 'items' })

  normalized.items.forEach((item, index) => {
    const rawItem = rawItems[index] || {}
    const rawUnit = normalizeBazaarText(rawItem.unit).toLowerCase()
    const rawCategory = isCustomBazaarCategory(rawItem.category) ? rawItem.category : normalizeBazaarText(rawItem.category).toLowerCase()
    const rawQuantity = parseBazaarQuantity(rawItem.quantity)
    if (!item.product_name) errors.push({ code: 'product_name_required', field: 'product_name', index })
    if (!ENTRY_CATEGORY_KEYS.has(rawCategory) && !isCustomBazaarCategory(rawCategory)) errors.push({ code: 'category_required', field: 'category', index })
    if (!ENTRY_UNIT_KEYS.has(rawUnit)) errors.push({ code: 'unit_required', field: 'unit', index })
    if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) {
      errors.push({ code: 'quantity_required', field: 'quantity', index })
    } else if (WHOLE_NUMBER_UNITS.has(rawUnit) && !Number.isInteger(rawQuantity)) {
      errors.push({ code: 'quantity_must_be_whole', field: 'quantity', index })
    } else if (DECIMAL_UNITS.has(rawUnit) && !hasAtMostThreeDecimalPlaces(rawItem.quantity)) {
      errors.push({ code: 'quantity_precision', field: 'quantity', index })
    }
    if (item.line_total <= 0) errors.push({ code: 'line_total_required', field: 'line_total', index })
  })

  const total = calculateBazaarTotal(normalized.items)
  if (normalized.items.length > 0 && total <= 0) errors.push({ code: 'total_required', field: 'total_amount' })

  return {
    valid: errors.length === 0,
    errors,
    total,
    purchase: { ...normalized, total_amount: total },
  }
}

export function normalizeBazaarDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || ''
}

export function todayBazaarDate() {
  return todayExpenseDate()
}

function parseLocalDate(value) {
  const date = normalizeBazaarDate(value)
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function addDays(value, amount) {
  const parsed = parseLocalDate(value)
  if (!parsed) return ''
  parsed.setDate(parsed.getDate() + amount)
  return normalizeBazaarDate(parsed)
}

function startOfWeek(value) {
  const parsed = parseLocalDate(value)
  if (!parsed) return ''
  const mondayOffset = (parsed.getDay() + 6) % 7
  return addDays(value, -mondayOffset)
}

function monthRange(value, monthOffset = 0) {
  const parsed = parseLocalDate(value)
  if (!parsed) return { dateFrom: '', dateTo: '' }
  const first = new Date(parsed.getFullYear(), parsed.getMonth() + monthOffset, 1, 12, 0, 0, 0)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12, 0, 0, 0)
  return { dateFrom: normalizeBazaarDate(first), dateTo: normalizeBazaarDate(last) }
}

export function getBazaarRange(key = 'month', today = todayBazaarDate()) {
  const normalizedToday = normalizeBazaarDate(today) || todayBazaarDate()
  if (key === 'today') return { dateFrom: normalizedToday, dateTo: normalizedToday }
  if (key === 'week' || key === '7days') return { dateFrom: addDays(normalizedToday, -6), dateTo: normalizedToday }
  const currentWeekStart = startOfWeek(normalizedToday)
  if (key === 'previousWeek') return { dateFrom: addDays(currentWeekStart, -7), dateTo: addDays(currentWeekStart, -1) }
  if (key === 'previousCurrentWeek') return { dateFrom: addDays(currentWeekStart, -7), dateTo: addDays(currentWeekStart, 6) }
  if (key === 'currentWeek') return { dateFrom: currentWeekStart, dateTo: addDays(currentWeekStart, 6) }
  if (key === 'currentNextWeek') return { dateFrom: currentWeekStart, dateTo: addDays(currentWeekStart, 13) }
  if (key === 'nextWeek') return { dateFrom: addDays(currentWeekStart, 7), dateTo: addDays(currentWeekStart, 13) }
  if (key === 'previousMonth') return monthRange(normalizedToday, -1)
  if (key === 'nextMonth') return monthRange(normalizedToday, 1)
  return { dateFrom: `${normalizedToday.slice(0, 8)}01`, dateTo: normalizedToday }
}

function utcCalendarDayIndex(value) {
  const date = normalizeBazaarDate(value)
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null
  return Math.floor(timestamp / 86400000)
}

export function bazaarRangeDayCount(dateFrom, dateTo) {
  const start = utcCalendarDayIndex(dateFrom)
  const end = utcCalendarDayIndex(dateTo)
  if (start === null || end === null || start > end) return 0
  return end - start + 1
}

export function filterBazaarPurchases(purchases = [], filters = {}) {
  const query = normalizeBazaarText(filters.query).toLocaleLowerCase()
  const dateFrom = normalizeBazaarDate(filters.dateFrom)
  const dateTo = normalizeBazaarDate(filters.dateTo)
  return (purchases || [])
    .map(normalizeBazaarPurchase)
    .filter(purchase => {
      if (dateFrom && purchase.purchase_date < dateFrom) return false
      if (dateTo && purchase.purchase_date > dateTo) return false
      if (filters.paymentMethod && filters.paymentMethod !== 'all' && purchase.payment_method !== filters.paymentMethod) return false
      if (filters.buyer && !normalizeBazaarText(purchase.buyer_name).toLocaleLowerCase().includes(normalizeBazaarText(filters.buyer).toLocaleLowerCase())) return false
      if ((filters.category && filters.category !== 'all') || query) {
        return getBazaarPurchaseScopedItems(purchase, filters.category, query).length > 0
      }
      return true
    })
    .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

function incrementAmount(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount)
}

function analyticsItemsForPurchase(purchase, options) {
  const category = options.category && options.category !== 'all' ? options.category : ''
  return purchase.items.filter(item => !category || item.category === category)
}

export function summarizeBazaarPurchases(purchases = [], options = {}) {
  const normalizedPurchases = filterBazaarPurchases(purchases, {
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    paymentMethod: options.paymentMethod,
    buyer: options.buyer,
  })

  const categoryAmounts = new Map()
  const paymentAmounts = new Map()
  const buyerAmounts = new Map()
  const dailyMap = new Map()
  const productMap = new Map()
  let totalSpent = 0
  let totalItemLines = 0
  let includedPurchaseCount = 0

  for (const [purchaseIndex, purchase] of normalizedPurchases.entries()) {
    const scopedItems = analyticsItemsForPurchase(purchase, options)
    const productItems = scopedItems
    if (options.category && options.category !== 'all' && scopedItems.length === 0) continue
    const hasItems = purchase.items.length > 0
    const purchaseTotal = scopedItems.length > 0
      ? calculateBazaarTotal(scopedItems)
      : hasItems
        ? 0
        : getBazaarPurchaseTotal(purchase)
    if (purchaseTotal <= 0) continue

    includedPurchaseCount += 1
    totalSpent += purchaseTotal
    totalItemLines += productItems.length
    incrementAmount(paymentAmounts, purchase.payment_method, purchaseTotal)

    const buyerName = purchase.buyer_name || purchase.created_by_name || ''
    const buyerProfileId = normalizeBazaarText(purchase.buyer_profile_id)
    const buyerKey = buyerProfileId
      ? `profile:${buyerProfileId}`
      : `name:${normalizeBazaarProductKey(buyerName) || 'unspecified'}`
    const buyer = buyerAmounts.get(buyerKey) || {
      key: buyerKey,
      profile_id: buyerProfileId,
      name: buyerName,
      amount: 0,
      purchases: 0,
    }
    buyer.amount += purchaseTotal
    buyer.purchases += 1
    buyerAmounts.set(buyerKey, buyer)

    const daily = dailyMap.get(purchase.purchase_date) || { date: purchase.purchase_date, total: 0, purchases: 0 }
    daily.total += purchaseTotal
    daily.purchases += 1
    dailyMap.set(purchase.purchase_date, daily)

    if (scopedItems.length === 0) {
      continue
    }

    for (const item of scopedItems) {
      incrementAmount(categoryAmounts, item.category, item.line_total)
      const base = normalizeBazaarQuantityToBase(item.quantity, item.unit)
      const productKey = item.product_key || normalizeBazaarProductKey(item.product_name)
      const groupKey = `${productKey}::${base.unit}`
      const purchaseKey = purchase.id || `${purchase.purchase_date}-${purchase.created_at || ''}-${purchaseIndex}`
      const product = productMap.get(groupKey) || {
        key: groupKey,
        product_key: productKey,
        product_name: item.product_name,
        category: item.category,
        unit: base.unit,
        quantity: 0,
        spend: 0,
        lines: 0,
        purchaseTotals: new Map(),
      }
      product.product_name ||= item.product_name
      product.quantity += base.quantity
      product.spend += item.line_total
      product.lines += 1
      if (base.quantity > 0) {
        const purchaseTotal = product.purchaseTotals.get(purchaseKey) || {
          key: purchaseKey,
          date: purchase.purchase_date,
          created_at: purchase.created_at || '',
          quantity: 0,
          spend: 0,
        }
        purchaseTotal.quantity += base.quantity
        purchaseTotal.spend += item.line_total
        product.purchaseTotals.set(purchaseKey, purchaseTotal)
      }
      productMap.set(groupKey, product)
    }
  }

  const products = [...productMap.values()]
    .map(product => {
      const costs = [...product.purchaseTotals.values()]
        .map(purchase => ({
          ...purchase,
          cost: purchase.quantity > 0 ? purchase.spend / purchase.quantity : 0,
        }))
        .sort((a, b) => (
          b.date.localeCompare(a.date)
          || String(b.created_at).localeCompare(String(a.created_at))
          || String(b.key).localeCompare(String(a.key))
        ))
      const latestUnitCost = costs[0]?.cost || 0
      const previousUnitCost = costs[1]?.cost || 0
      const { purchaseTotals, ...productSummary } = product
      return {
        ...productSummary,
        purchaseCount: purchaseTotals.size,
        averageUnitCost: product.quantity > 0 ? product.spend / product.quantity : 0,
        latestUnitCost,
        previousUnitCost,
        unitCostChangePct: previousUnitCost > 0 ? ((latestUnitCost - previousUnitCost) / previousUnitCost) * 100 : 0,
      }
    })
    .sort((a, b) => b.spend - a.spend || a.product_name.localeCompare(b.product_name))

  const categories = [...categoryAmounts.entries()]
    .map(([key, amount]) => ({ key, amount, percent: totalSpent > 0 ? (amount / totalSpent) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
  const payments = [...paymentAmounts.entries()]
    .map(([key, amount]) => ({ key, amount, percent: totalSpent > 0 ? (amount / totalSpent) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
  const buyers = [...buyerAmounts.values()]
    .map(buyer => ({ ...buyer, percent: totalSpent > 0 ? (buyer.amount / totalSpent) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  const dayCount = bazaarRangeDayCount(options.dateFrom, options.dateTo) || new Set(daily.map(row => row.date)).size

  return {
    totalSpent,
    purchaseCount: includedPurchaseCount,
    averagePerDay: dayCount > 0 ? totalSpent / dayCount : 0,
    activeDays: daily.length,
    dayCount,
    uniqueProducts: new Set(products.map(product => product.product_key)).size,
    totalItemLines,
    daily,
    categories,
    payments,
    buyers,
    products,
  }
}

export function formatBazaarQuantity(value, maximumFractionDigits = 3) {
  const quantity = Number(value) || 0
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(quantity)
}
