import { bazaarPricePerPiece, normalizeBazaarPiecesPerUnit } from './bazaar.js'

export const TECH_CARD_UNITS = ['g', 'kg', 'ml', 'l', 'piece']

const BAZAAR_TO_TECH_CARD_UNIT = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  pcs: 'piece',
  piece: 'piece',
}

const TECH_CARD_EXCLUDED_CATEGORY_NAMES = new Set([
  'alcohol',
  'utensils',
  'carbonated drinks',
])

function normalizeTechCardCategoryName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function isTechCardEligibleMenuItem(item, categories = []) {
  const category = categories.find(candidate => candidate?.id === item?.category_id)
  if (!category) return true

  return ![category.id, category.name_en, category.name_uz, category.name_ru]
    .some(value => TECH_CARD_EXCLUDED_CATEGORY_NAMES.has(normalizeTechCardCategoryName(value)))
}

// Units sharing a dimension convert by their size in the smallest unit.
const TECH_CARD_UNIT_SCALE = {
  g: ['mass', 1],
  kg: ['mass', 1000],
  ml: ['volume', 1],
  l: ['volume', 1000],
  piece: ['piece', 1],
}

function roundTechCardPrice(value) {
  return Math.round(value * 10_000) / 10_000
}

// Mirrors public.tech_card_unit_price_from_bazaar (228); null when units are incompatible.
export function convertTechCardUnitPrice(price, fromUnit, toUnit) {
  const from = TECH_CARD_UNIT_SCALE[fromUnit]
  const to = TECH_CARD_UNIT_SCALE[toUnit]
  if (!from || !to || from[0] !== to[0]) return null
  return roundTechCardPrice(Math.max(0, Number(price) || 0) * to[1] / from[1])
}

export function getCompatibleTechCardUnits(unit) {
  const dimension = TECH_CARD_UNIT_SCALE[unit]?.[0]
  return dimension ? TECH_CARD_UNITS.filter(candidate => TECH_CARD_UNIT_SCALE[candidate][0] === dimension) : TECH_CARD_UNITS
}

export function getBazaarIngredientTechCardUnit(ingredient = {}) {
  return BAZAAR_TO_TECH_CARD_UNIT[String(ingredient.unit || '').trim().toLowerCase()] || 'piece'
}

// A package with a piece count (a box of 30 eggs) is priced per piece in recipes.
function bazaarIngredientPiecesPerUnit(ingredient = {}) {
  const unit = String(ingredient.unit || '').trim().toLowerCase()
  return normalizeBazaarPiecesPerUnit(unit, ingredient.piecesPerUnit ?? ingredient.pieces_per_unit)
}

export function getBazaarIngredientTechCardPatch(ingredient = {}, unit = '') {
  const catalogUnit = getBazaarIngredientTechCardUnit(ingredient)
  const targetUnit = getCompatibleTechCardUnits(catalogUnit).includes(unit) ? unit : catalogUnit
  const price = ingredient.normalUnitPrice ?? ingredient.normal_unit_price
  const pieces = bazaarIngredientPiecesPerUnit(ingredient)
  return {
    name: String(ingredient.name || ingredient.product_name || '').trim(),
    unit: targetUnit,
    unit_price_uzs: String(convertTechCardUnitPrice(
      pieces ? bazaarPricePerPiece(price, pieces) : price,
      catalogUnit,
      targetUnit,
    )),
  }
}

export function formatTechCardUnitPrice(value) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  const [whole, fraction] = String(roundTechCardPrice(number)).split('.')
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (fraction ? `.${fraction}` : '')
}

export function normalizeTechCardNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

export function normalizeTechCardUnit(value, fallback = 'kg') {
  const normalized = String(value || '').trim().toLowerCase()
  return TECH_CARD_UNITS.includes(normalized) ? normalized : fallback
}

export function createBlankTechCard(menuItemId = '', variantOptionId = '') {
  return {
    menu_item_id: menuItemId,
    variant_option_id: String(variantOptionId || '').trim(),
    portion_count: '1',
    batch_output_quantity: '',
    batch_output_unit: 'kg',
    preparation_steps: '',
    notes: '',
    ingredients: [],
    components: [],
  }
}

export function createBlankTechCardIngredient() {
  return {
    name: '',
    quantity: '1',
    unit: 'kg',
    unit_price_uzs: '',
  }
}

export function createBlankTechCardComponent() {
  return {
    component_menu_item_id: '',
    selected_options: {},
    quantity: '1',
  }
}

function normalizeSelectedOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([groupId, optionId]) => {
    const normalizedGroupId = String(groupId || '').trim()
    const normalizedOptionId = String(optionId || '').trim()
    return normalizedGroupId && normalizedOptionId ? [[normalizedGroupId, normalizedOptionId]] : []
  }))
}

function parseOptionGroups(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function getVariantCosts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

export function getTechCardComponentUnitCost(menuItem, selectedOptions = {}) {
  const normalizedSelections = normalizeSelectedOptions(selectedOptions)
  const variantCosts = getVariantCosts(menuItem?.variant_costs)
  for (const optionId of Object.values(normalizedSelections)) {
    if (Object.prototype.hasOwnProperty.call(variantCosts, optionId)) {
      const variantCost = variantCosts[optionId]
      if (variantCost !== null && variantCost !== '' && Number.isFinite(Number(variantCost))) {
        return Math.max(0, Number(variantCost))
      }
    }
  }
  const parentCost = menuItem?.cost_price
  return parentCost !== null && parentCost !== undefined && parentCost !== '' && Number.isFinite(Number(parentCost))
    ? Math.max(0, Number(parentCost))
    : null
}

export function normalizeTechCard(card = {}) {
  return {
    menu_item_id: String(card.menu_item_id || '').trim(),
    variant_option_id: String(card.variant_option_id || '').trim(),
    portion_count: String(card.portion_count ?? '1'),
    batch_output_quantity: card.batch_output_quantity == null ? '' : String(card.batch_output_quantity),
    batch_output_unit: normalizeTechCardUnit(card.batch_output_unit, 'kg'),
    preparation_steps: String(card.preparation_steps || ''),
    notes: String(card.notes || ''),
    updated_at: card.updated_at || null,
    ingredients: (card.ingredients || []).map(ingredient => ({
      id: ingredient.id || null,
      name: String(ingredient.name || ''),
      quantity: String(ingredient.quantity ?? '1'),
      unit: normalizeTechCardUnit(ingredient.unit, 'kg'),
      unit_price_uzs: String(ingredient.unit_price_uzs ?? ''),
    })),
    components: (card.components || []).map(component => ({
      id: component.id || null,
      component_menu_item_id: String(component.component_menu_item_id || ''),
      selected_options: normalizeSelectedOptions(component.selected_options),
      quantity: String(component.quantity ?? '1'),
    })),
  }
}

export function calculateTechCardSummary(card = {}, menuItems = []) {
  const menuItemById = new Map(menuItems.map(item => [item.id, item]))
  const ingredients = (card.ingredients || []).map(ingredient => {
    const quantity = normalizeTechCardNumber(ingredient.quantity)
    const unitPrice = normalizeTechCardNumber(ingredient.unit_price_uzs)
    return {
      ...ingredient,
      quantity,
      unitPrice,
      lineCost: quantity * unitPrice,
    }
  })
  const ingredientBatchCost = ingredients.reduce((sum, ingredient) => sum + ingredient.lineCost, 0)
  const components = (card.components || []).map(component => {
    const quantity = normalizeTechCardNumber(component.quantity)
    const menuItem = menuItemById.get(component.component_menu_item_id)
    const unitCost = getTechCardComponentUnitCost(menuItem, component.selected_options)
    const costAvailable = unitCost !== null
    return {
      ...component,
      quantity,
      menuItem,
      costAvailable,
      unitCost,
      lineCost: costAvailable ? quantity * unitCost : null,
    }
  })
  const portionCount = normalizeTechCardNumber(card.portion_count)
  const batchOutputQuantity = normalizeTechCardNumber(card.batch_output_quantity)
  const selectedComponents = components.filter(component => component.component_menu_item_id)
  const componentCostAvailable = selectedComponents.every(component => component.costAvailable)
  const componentCostPerPortion = componentCostAvailable
    ? selectedComponents.reduce((sum, component) => sum + component.lineCost, 0)
    : null
  const ingredientCostPerPortion = portionCount > 0 ? ingredientBatchCost / portionCount : 0
  const portionCost = componentCostPerPortion === null
    ? null
    : ingredientCostPerPortion + componentCostPerPortion
  const batchCost = portionCost === null || portionCount <= 0 ? null : portionCost * portionCount

  return {
    ingredients,
    components,
    ingredientBatchCost,
    ingredientCostPerPortion,
    componentCostAvailable,
    componentCostPerPortion,
    batchCost,
    portionCount,
    portionCost,
    batchOutputQuantity,
    outputPerPortion: portionCount > 0 && batchOutputQuantity > 0
      ? batchOutputQuantity / portionCount
      : null,
  }
}

export function buildTechCardPayload(card = {}) {
  const normalized = normalizeTechCard(card)
  return {
    menu_item_id: normalized.menu_item_id,
    variant_option_id: normalized.variant_option_id,
    portion_count: normalizeTechCardNumber(normalized.portion_count),
    batch_output_quantity: normalized.batch_output_quantity === ''
      ? null
      : normalizeTechCardNumber(normalized.batch_output_quantity),
    batch_output_unit: normalized.batch_output_unit,
    preparation_steps: normalized.preparation_steps.trim(),
    notes: normalized.notes.trim(),
    ingredients: normalized.ingredients.map((ingredient, index) => ({
      name: ingredient.name.trim(),
      quantity: normalizeTechCardNumber(ingredient.quantity),
      unit: ingredient.unit,
      unit_price_uzs: roundTechCardPrice(normalizeTechCardNumber(ingredient.unit_price_uzs)),
      sort_order: index + 1,
    })),
    components: normalized.components.map((component, index) => ({
      component_menu_item_id: component.component_menu_item_id.trim(),
      selected_options: normalizeSelectedOptions(component.selected_options),
      quantity: normalizeTechCardNumber(component.quantity),
      sort_order: index + 1,
    })),
  }
}

export function techCardStorageKey(menuItemId, variantOptionId = '') {
  return `${String(menuItemId || '').trim()}::${String(variantOptionId || '').trim()}`
}

export function copyAndScaleTechCard(card = {}, variantOptionId = '', scale = 1) {
  const normalized = normalizeTechCard(card)
  const multiplier = normalizeTechCardNumber(scale, 1) || 1
  return normalizeTechCard({
    ...normalized,
    variant_option_id: String(variantOptionId || '').trim(),
    updated_at: null,
    ingredients: normalized.ingredients.map(({ id: _id, ...ingredient }) => ({
      ...ingredient,
      quantity: String(normalizeTechCardNumber(ingredient.quantity) * multiplier),
    })),
    components: normalized.components.map(({ id: _id, ...component }) => ({
      ...component,
      quantity: String(normalizeTechCardNumber(component.quantity) * multiplier),
    })),
    // The copied card still yields the same number of sellable variant units;
    // only its recipe/output quantities scale (for example, a larger Qurutob).
    portion_count: normalized.portion_count,
    batch_output_quantity: normalized.batch_output_quantity === ''
      ? ''
      : String(normalizeTechCardNumber(normalized.batch_output_quantity) * multiplier),
  })
}

export function validateTechCard(card = {}, menuItems = [], messages = {}) {
  const payload = buildTechCardPayload(card)
  const menuItemById = new Map(menuItems.map(item => [item.id, item]))
  if (!payload.menu_item_id) return 'Menu item is required.'
  if (!(payload.portion_count > 0)) return 'Portions per batch must be greater than zero.'
  if (payload.batch_output_quantity !== null && !(payload.batch_output_quantity > 0)) {
    return 'Batch output must be greater than zero when provided.'
  }
  if (payload.ingredients.length === 0 && payload.components.length === 0) {
    return 'Add at least one ingredient or included menu item.'
  }
  for (const ingredient of payload.ingredients) {
    if (!ingredient.name) return 'Every ingredient needs a name.'
    if (!(ingredient.quantity > 0)) return `${ingredient.name}: quantity must be greater than zero.`
    if (ingredient.unit_price_uzs < 0) return `${ingredient.name}: price cannot be negative.`
  }
  const componentKeys = new Set()
  for (const component of payload.components) {
    if (!component.component_menu_item_id) return 'Every included menu item must be selected.'
    if (component.component_menu_item_id === payload.menu_item_id) return 'A meal cannot include itself.'
    if (!(component.quantity > 0)) return 'Included menu item quantity must be greater than zero.'
    const includedItem = menuItemById.get(component.component_menu_item_id)
    if (includedItem && getTechCardComponentUnitCost(includedItem, component.selected_options) === null) {
      return 'Every included menu item must have a real cost.'
    }
    if (includedItem) {
      const optionGroups = parseOptionGroups(includedItem.option_groups)
      for (const [groupId, optionId] of Object.entries(component.selected_options)) {
        const group = optionGroups.find(row => String(row?.id || '') === groupId)
        const optionExists = Array.isArray(group?.options)
          && group.options.some(option => String(option?.id || '') === optionId)
        if (!optionExists) return 'The selected included-item variant is no longer available.'
      }
    }
    const componentKey = `${component.component_menu_item_id}:${JSON.stringify(component.selected_options)}`
    if (componentKeys.has(componentKey)) return 'The same included menu item variant cannot be added twice.'
    componentKeys.add(componentKey)
  }
  if (!payload.preparation_steps) return messages.preparationMethodRequired || 'Add the preparation method.'
  return ''
}

export function techCardFingerprint(card = {}) {
  return JSON.stringify(buildTechCardPayload(card))
}

export function techCardUnitLabel(unit, lang) {
  const unitLabels = {
    g: { uz: 'g', ru: 'г', en: 'g' },
    kg: { uz: 'kg', ru: 'кг', en: 'kg' },
    ml: { uz: 'ml', ru: 'мл', en: 'ml' },
    l: { uz: 'l', ru: 'л', en: 'l' },
    piece: { uz: 'dona', ru: 'шт', en: 'piece' },
  }
  return unitLabels[unit]?.[lang] || unitLabels[unit]?.en || unit
}
