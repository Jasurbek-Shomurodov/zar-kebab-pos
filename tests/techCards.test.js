import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTechCardPayload,
  calculateTechCardSummary,
  convertTechCardUnitPrice,
  copyAndScaleTechCard,
  createBlankTechCard,
  formatTechCardUnitPrice,
  getBazaarIngredientTechCardPatch,
  getCompatibleTechCardUnits,
  isTechCardEligibleMenuItem,
  techCardStorageKey,
  validateTechCard,
} from '../src/lib/techCards.js'

test('Bazaar ingredient selection prefills the Tech Card name, compatible unit, and locked price value', () => {
  assert.deepEqual(getBazaarIngredientTechCardPatch({
    name: 'Beef',
    unit: 'kg',
    normalUnitPrice: 85_000,
  }), {
    name: 'Beef',
    unit: 'kg',
    unit_price_uzs: '85000',
  })
  assert.equal(getBazaarIngredientTechCardPatch({ product_name: 'Eggs', unit: 'pcs', normal_unit_price: 2_000 }).unit, 'piece')
})

test('catalog prices convert to the row unit without whole-UZS rounding', () => {
  assert.equal(convertTechCardUnitPrice(7_500, 'kg', 'g'), 7.5)
  assert.equal(convertTechCardUnitPrice(15, 'ml', 'l'), 15_000)
  assert.equal(convertTechCardUnitPrice(2_000, 'piece', 'piece'), 2_000)
  assert.equal(convertTechCardUnitPrice(10_000, 'kg', 'piece'), null)
  assert.deepEqual(getCompatibleTechCardUnits('kg'), ['g', 'kg'])
  assert.deepEqual(getCompatibleTechCardUnits('piece'), ['piece'])
  assert.deepEqual(getBazaarIngredientTechCardPatch({ name: 'pomidor', unit: 'kg', normalUnitPrice: 7_500 }, 'g'), {
    name: 'pomidor', unit: 'g', unit_price_uzs: '7.5',
  })
  // An incompatible requested unit falls back to the catalog unit.
  assert.equal(getBazaarIngredientTechCardPatch({ name: 'Egg', unit: 'pcs', normalUnitPrice: 1_500 }, 'kg').unit, 'piece')
  assert.equal(formatTechCardUnitPrice('12500.25'), '12 500.25')
  assert.equal(buildTechCardPayload({
    menu_item_id: 'm', ingredients: [{ name: 'pomidor', quantity: '250', unit: 'g', unit_price_uzs: '7.5' }],
  }).ingredients[0].unit_price_uzs, 7.5)
  const summary = calculateTechCardSummary({ portion_count: '1', ingredients: [{ name: 'pomidor', quantity: '250', unit: 'g', unit_price_uzs: '7.5' }] })
  assert.equal(summary.ingredientBatchCost, 1_875)
})

test('tech cards exclude alcohol, utensils, and carbonated drink categories', () => {
  const categories = [
    { id: 'cat-1', name_en: 'Alcohol' },
    { id: 'cat-2', name_en: ' Utensils ' },
    { id: 'cat-3', name_en: 'Carbonated   Drinks' },
    { id: 'cat-4', name_en: 'Main dishes' },
  ]

  assert.equal(isTechCardEligibleMenuItem({ category_id: 'cat-1' }, categories), false)
  assert.equal(isTechCardEligibleMenuItem({ category_id: 'cat-2' }, categories), false)
  assert.equal(isTechCardEligibleMenuItem({ category_id: 'cat-3' }, categories), false)
  assert.equal(isTechCardEligibleMenuItem({ category_id: 'cat-4' }, categories), true)
  assert.equal(isTechCardEligibleMenuItem({ category_id: 'unknown' }, categories), true)
})

test('variant tech cards keep a stable storage key and payload identity', () => {
  const card = createBlankTechCard('qurutob', 'two_three_people')
  assert.equal(card.variant_option_id, 'two_three_people')
  assert.equal(techCardStorageKey(card.menu_item_id, card.variant_option_id), 'qurutob::two_three_people')
  assert.equal(buildTechCardPayload(card).variant_option_id, 'two_three_people')
})

test('copying a variant recipe scales quantities and removes row identities', () => {
  const copied = copyAndScaleTechCard({
    menu_item_id: 'qurutob',
    variant_option_id: 'one_person',
    portion_count: 1,
    batch_output_quantity: 0.5,
    ingredients: [{ id: 'ingredient-row', name: 'Bread', quantity: 2, unit: 'piece', unit_price_uzs: 5_000 }],
    components: [{ id: 'component-row', component_menu_item_id: 'salad', quantity: 1 }],
  }, 'two_three_people', 2)

  assert.equal(copied.variant_option_id, 'two_three_people')
  assert.equal(copied.portion_count, '1')
  assert.equal(copied.batch_output_quantity, '1')
  assert.equal(copied.ingredients[0].quantity, '4')
  assert.equal(copied.ingredients[0].id, null)
  assert.equal(copied.components[0].quantity, '2')
})

test('tech card calculates batch cost and per-portion cost from ingredient prices', () => {
  const summary = calculateTechCardSummary({
    portion_count: 50,
    batch_output_quantity: 5,
    ingredients: [
      { name: 'Meat', quantity: 5, unit: 'kg', unit_price_uzs: 80_000 },
      { name: 'Onion', quantity: 2.5, unit: 'kg', unit_price_uzs: 4_000 },
    ],
  })

  assert.equal(summary.batchCost, 410_000)
  assert.equal(summary.portionCost, 8_200)
  assert.equal(summary.outputPerPortion, 0.1)
})

test('included menu items add their protected real cost to every set portion', () => {
  const summary = calculateTechCardSummary({
    portion_count: 2,
    ingredients: [
      { name: 'Packaging', quantity: 2, unit: 'piece', unit_price_uzs: 5_000 },
    ],
    components: [
      { component_menu_item_id: 'coke-1', quantity: 1 },
      { component_menu_item_id: 'kebab-1', quantity: 2 },
      { component_menu_item_id: '', quantity: 1 },
    ],
  }, [
    { id: 'coke-1', cost_price: 4_000 },
    { id: 'kebab-1', cost_price: 20_000 },
  ])

  assert.equal(summary.ingredientBatchCost, 10_000)
  assert.equal(summary.ingredientCostPerPortion, 5_000)
  assert.equal(summary.componentCostPerPortion, 44_000)
  assert.equal(summary.portionCost, 49_000)
  assert.equal(summary.batchCost, 98_000)
  assert.deepEqual(summary.components.map(component => component.lineCost), [4_000, 40_000, null])
})

test('included menu item variants use their protected variant cost and otherwise fall back to the parent cost', () => {
  const menuItem = {
    id: 'bread-1',
    cost_price: 8_000,
    variant_costs: { half: 4_000 },
    option_groups: [{ id: 'variants', options: [{ id: 'whole' }, { id: 'half' }] }],
  }
  const summary = calculateTechCardSummary({
    portion_count: 1,
    components: [
      { component_menu_item_id: 'bread-1', selected_options: { variants: 'half' }, quantity: 1 },
      { component_menu_item_id: 'bread-1', selected_options: { variants: 'whole' }, quantity: 1 },
    ],
  }, [menuItem])

  assert.deepEqual(summary.components.map(component => component.unitCost), [4_000, 8_000])
  assert.equal(summary.portionCost, 12_000)
})

test('included menu item cost is unavailable instead of silently treated as zero', () => {
  const card = {
    menu_item_id: 'set-1',
    portion_count: 1,
    preparation_steps: 'Assemble.',
    ingredients: [],
    components: [{ component_menu_item_id: 'legacy-1', quantity: 1 }],
  }

  const summary = calculateTechCardSummary(card, [{ id: 'legacy-1', cost_price: null }])
  assert.equal(summary.componentCostAvailable, false)
  assert.equal(summary.portionCost, null)
  assert.equal(summary.batchCost, null)
  assert.match(validateTechCard(card, [{ id: 'legacy-1', cost_price: null }]), /real cost/i)
})

test('tech card payload trims recipe text and normalizes ingredient values', () => {
  const payload = buildTechCardPayload({
    menu_item_id: ' meal-1 ',
    portion_count: '50',
    batch_output_quantity: '5,5',
    batch_output_unit: 'kg',
    preparation_steps: '  Cook slowly.  ',
    notes: '  Keep chilled. ',
    ingredients: [{ name: '  Meat ', quantity: '5,25', unit: 'kg', unit_price_uzs: '80000' }],
  })

  assert.deepEqual(payload, {
    menu_item_id: 'meal-1',
    variant_option_id: '',
    portion_count: 50,
    batch_output_quantity: 5.5,
    batch_output_unit: 'kg',
    preparation_steps: 'Cook slowly.',
    notes: 'Keep chilled.',
    ingredients: [{ name: 'Meat', quantity: 5.25, unit: 'kg', unit_price_uzs: 80_000, sort_order: 1 }],
    components: [],
  })
})

test('tech card validation requires a positive yield and a complete ingredient', () => {
  const card = createBlankTechCard('meal-1')
  assert.match(validateTechCard(card), /ingredient/i)

  card.ingredients = [{ name: 'Meat', quantity: '0', unit: 'kg', unit_price_uzs: '80000' }]
  assert.match(validateTechCard(card), /quantity/i)

  card.ingredients[0].quantity = '5'
  assert.match(validateTechCard(card), /preparation method/i)
  assert.equal(
    validateTechCard(card, [], { preparationMethodRequired: 'Tayyorlash usulini kiriting.' }),
    'Tayyorlash usulini kiriting.'
  )

  card.preparation_steps = 'Cook slowly.'
  assert.equal(validateTechCard(card), '')
})

test('tech card normalizes and validates included menu items for sets', () => {
  const card = createBlankTechCard('set-1')
  card.components = [
    { component_menu_item_id: ' kebab-1 ', quantity: '10' },
    { component_menu_item_id: 'bread-1', quantity: '2,5' },
  ]
  card.preparation_steps = 'Assemble the set.'

  const payload = buildTechCardPayload(card)
  assert.deepEqual(payload.components, [
    { component_menu_item_id: 'kebab-1', selected_options: {}, quantity: 10, sort_order: 1 },
    { component_menu_item_id: 'bread-1', selected_options: {}, quantity: 2.5, sort_order: 2 },
  ])
  assert.equal(validateTechCard(card), '')

  card.components.push({ component_menu_item_id: 'kebab-1', quantity: 1 })
  assert.match(validateTechCard(card), /same included menu item/i)
})

test('tech card payload preserves a selected included-item variant', () => {
  const payload = buildTechCardPayload({
    menu_item_id: 'set-1',
    portion_count: 1,
    preparation_steps: 'Assemble.',
    components: [{
      component_menu_item_id: 'bread-1',
      selected_options: { variants: 'half' },
      quantity: 2,
    }],
  })

  assert.deepEqual(payload.components[0], {
    component_menu_item_id: 'bread-1',
    selected_options: { variants: 'half' },
    quantity: 2,
    sort_order: 1,
  })
})

test('included menu items accept fractional recipe quantities for every sale unit', () => {
  const card = createBlankTechCard('set-1')
  card.components = [
    { component_menu_item_id: 'salad-1', quantity: '0,3' },
    { component_menu_item_id: 'coke-1', quantity: '0.5' },
  ]
  card.preparation_steps = 'Assemble the set.'

  const menuItems = [
    { id: 'salad-1', sale_unit: 'piece', cost_price: 5_500 },
    { id: 'coke-1', sale_unit: 'piece', cost_price: 4_000 },
  ]

  assert.equal(validateTechCard(card, menuItems), '')
  assert.deepEqual(buildTechCardPayload(card).components.map(component => component.quantity), [0.3, 0.5])

  const summary = calculateTechCardSummary(card, menuItems)
  assert.equal(summary.componentCostPerPortion, 3_650)
})
