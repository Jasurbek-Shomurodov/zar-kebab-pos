import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import BazaarIngredientPicker from '../components/BazaarIngredientPicker'
import MenuItemPicker from '../components/MenuItemPicker'
import TechCardPdfDownload from '../components/TechCardPdfDownload'
import MenuMedia from '../components/MenuMedia'
import { getMenuItemOptionGroups } from '../components/MenuProductCards'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { useAppDataStatus } from '../store/appHooks'
import { canEditMenu } from '../lib/permissions'
import { formatCurrency, formatCurrencyWithPercentage } from '../lib/formatCurrency'
import { getCategoryName, getItemName } from '../lib/i18n'
import { isActiveMenuItem } from '../lib/menuItems'
import { getSaleProfitSummary } from '../lib/profit'
import { supabase } from '../lib/supabase'
import {
  TECH_CARD_UNITS,
  techCardUnitLabel as unitLabel,
  buildTechCardPayload,
  calculateTechCardSummary,
  copyAndScaleTechCard,
  createBlankTechCard,
  createBlankTechCardComponent,
  createBlankTechCardIngredient,
  getBazaarIngredientTechCardPatch,
  getBazaarIngredientTechCardUnit,
  getCompatibleTechCardUnits,
  formatTechCardUnitPrice,
  isTechCardEligibleMenuItem,
  normalizeTechCard,
  techCardFingerprint,
  techCardStorageKey,
  validateTechCard,
} from '../lib/techCards'

function labels(lang) {
  if (lang === 'uz') return {
    title: 'Texnologik kartalar', subtitle: 'Taom retseptlari, masalliqlar tannarxi va porsiya chiqishi',
    search: 'Taomni qidirish…', all: 'Barchasi', ready: 'Tayyor', missing: 'To‘ldirilmagan',
    categories: 'Taom kategoriyalari', otherCategory: 'Boshqa taomlar',
    total: 'Jami taomlar', configured: 'Tayyor kartalar', needSetup: 'To‘ldirish kerak', average: 'O‘rtacha porsiya tannarxi',
    open: 'Kartani ochish', noResults: 'Mos taom topilmadi', noResultsHint: 'Qidiruv yoki filtrni o‘zgartiring.',
    listError: 'Texnologik kartalarni yuklab bo‘lmadi', migration: 'Ma’lumotlar bazasiga 156-migratsiyani qo‘llang.',
    editorSubtitle: 'Retsept, ishlab chiqarish chiqishi va haqiqiy masalliq tannarxi', ingredients: 'Masalliqlar',
    ingredientHint: 'Har bir masalliq miqdori va tanlangan birlik uchun narxini kiriting.', addIngredient: 'Masalliq qo‘shish',
    ingredientCatalogError: 'Bozor masalliqlarini yuklab bo‘lmadi.',
    ingredient: 'Masalliq', quantity: 'Miqdor', unit: 'Birlik', unitPrice: 'Birlik narxi', lineCost: 'Jami',
    includedItems: 'Kiritilgan menyu taomlari', includedItemsHint: 'Set sotilganda auditda hisoblanadigan tayyor taomlarni va ularning miqdorini tanlang.',
    addIncludedItem: 'Taom qo‘shish', selectIncludedItem: 'Taomni tanlang', noIncludedItems: 'Bu taomda kiritilgan menyu mahsulotlari yo‘q.',
    batch: 'Partiya va porsiya', batchOutput: 'Tayyor mahsulot chiqishi', portions: 'Partiyadagi porsiyalar',
    method: 'Tayyorlash usuli', methodPlaceholder: 'Tayyorlash bosqichlarini ketma-ket yozing…', preparationMethodRequired: 'Tayyorlash usulini kiriting.',
    notes: 'Ichki izohlar', notesPlaceholder: 'Saqlash, harorat yoki oshpaz uchun boshqa eslatmalar…',
    salePrice: 'Sotuv narxi', savedCost: 'Saqlangan real tannarx', batchCost: 'Partiya tannarxi',
    portionCost: 'Bir porsiya tannarxi', outputPerPortion: 'Bir porsiya chiqishi', estimatedProfit: 'Taxminiy sof foyda',
    save: 'Kartani saqlash', saving: 'Saqlanmoqda…', saved: 'Texnologik karta saqlandi.', back: 'Kartalar ro‘yxatiga',
    readOnly: 'Faqat ko‘rish', editProduct: 'Mahsulotni tahrirlash', productMissing: 'Taom topilmadi',
    productMissingHint: 'Bu mahsulot o‘chirilgan yoki mavjud emas.', unsaved: 'Saqlanmagan karta',
    baseRecipe: 'Asosiy retsept', copyRecipe: 'Retseptni nusxalash', copyFrom: 'Manba', scale: 'Miqyos', copy: 'Nusxalash', variantRecipe: 'Variant retsepti',
  }
  if (lang === 'ru') return {
    title: 'Техкарты', subtitle: 'Рецептуры блюд, стоимость ингредиентов и выход порций',
    search: 'Поиск блюда…', all: 'Все', ready: 'Готовые', missing: 'Не заполнены',
    categories: 'Категории блюд', otherCategory: 'Другие блюда',
    total: 'Всего блюд', configured: 'Готовые техкарты', needSetup: 'Нужно заполнить', average: 'Средняя себестоимость порции',
    open: 'Открыть техкарту', noResults: 'Подходящие блюда не найдены', noResultsHint: 'Измените поиск или фильтр.',
    listError: 'Не удалось загрузить техкарты', migration: 'Примените миграцию базы данных 156.',
    editorSubtitle: 'Рецептура, производственный выход и фактическая стоимость ингредиентов', ingredients: 'Ингредиенты',
    ingredientHint: 'Укажите количество и цену каждого ингредиента за выбранную единицу.', addIngredient: 'Добавить ингредиент',
    ingredientCatalogError: 'Не удалось загрузить ингредиенты базара.',
    ingredient: 'Ингредиент', quantity: 'Количество', unit: 'Единица', unitPrice: 'Цена за единицу', lineCost: 'Сумма',
    includedItems: 'Включённые блюда меню', includedItemsHint: 'Выберите готовые блюда и их количество, которые нужно учитывать при продаже этого сета.',
    addIncludedItem: 'Добавить блюдо', selectIncludedItem: 'Выберите блюдо', noIncludedItems: 'В это блюдо не включены другие позиции меню.',
    batch: 'Партия и порции', batchOutput: 'Выход готового продукта', portions: 'Порций из партии',
    method: 'Технология приготовления', methodPlaceholder: 'Опишите этапы приготовления по порядку…', preparationMethodRequired: 'Добавьте технологию приготовления.',
    notes: 'Внутренние примечания', notesPlaceholder: 'Хранение, температура или другие заметки для кухни…',
    salePrice: 'Цена продажи', savedCost: 'Сохранённая себестоимость', batchCost: 'Стоимость партии',
    portionCost: 'Себестоимость порции', outputPerPortion: 'Выход на порцию', estimatedProfit: 'Расчётная чистая прибыль',
    save: 'Сохранить техкарту', saving: 'Сохранение…', saved: 'Техкарта сохранена.', back: 'К списку техкарт',
    readOnly: 'Только просмотр', editProduct: 'Редактировать товар', productMissing: 'Блюдо не найдено',
    productMissingHint: 'Товар удалён или больше не существует.', unsaved: 'Техкарта не заполнена',
    baseRecipe: 'Основной рецепт', copyRecipe: 'Копировать рецепт', copyFrom: 'Источник', scale: 'Масштаб', copy: 'Копировать', variantRecipe: 'Техкарта варианта',
  }
  return {
    title: 'Tech Cards', subtitle: 'Meal recipes, ingredient costs, and portion yield',
    search: 'Search meals…', all: 'All', ready: 'Ready', missing: 'Not completed',
    categories: 'Meal categories', otherCategory: 'Other meals',
    total: 'Total meals', configured: 'Completed cards', needSetup: 'Need setup', average: 'Average portion cost',
    open: 'Open tech card', noResults: 'No matching meals', noResultsHint: 'Change the search or filter.',
    listError: 'Could not load tech cards', migration: 'Apply database migration 156.',
    editorSubtitle: 'Recipe, production yield, and actual ingredient cost', ingredients: 'Ingredients',
    ingredientHint: 'Enter each ingredient quantity and its price for the selected unit.', addIngredient: 'Add ingredient',
    ingredientCatalogError: 'Could not load Bazaar ingredients.',
    ingredient: 'Ingredient', quantity: 'Quantity', unit: 'Unit', unitPrice: 'Unit price', lineCost: 'Total',
    includedItems: 'Included menu items', includedItemsHint: 'Choose the prepared meals and quantities counted when this set is sold.',
    addIncludedItem: 'Add menu item', selectIncludedItem: 'Select a meal', noIncludedItems: 'No other menu items are included in this meal.',
    batch: 'Batch and portions', batchOutput: 'Finished batch output', portions: 'Portions per batch',
    method: 'Preparation method', methodPlaceholder: 'Write the preparation steps in order…', preparationMethodRequired: 'Add the preparation method.',
    notes: 'Internal notes', notesPlaceholder: 'Storage, temperature, or other kitchen notes…',
    salePrice: 'Selling price', savedCost: 'Saved real cost', batchCost: 'Batch cost',
    portionCost: 'Cost per portion', outputPerPortion: 'Output per portion', estimatedProfit: 'Estimated net profit',
    save: 'Save tech card', saving: 'Saving…', saved: 'Tech card saved.', back: 'Back to tech cards',
    readOnly: 'Read only', editProduct: 'Edit product', productMissing: 'Meal not found',
    productMissingHint: 'This product was archived or no longer exists.', unsaved: 'Tech card not completed',
    baseRecipe: 'Base recipe', copyRecipe: 'Copy recipe', copyFrom: 'Source', scale: 'Scale', copy: 'Copy', variantRecipe: 'Variant recipe',
  }
}

function formatDecimal(value, lang, maximumFractionDigits = 3) {
  return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ', {
    maximumFractionDigits,
  }).format(Number(value) || 0)
}

function formatOutputPerPortion(summary, unit, lang) {
  if (summary.outputPerPortion == null) return '—'
  let amount = summary.outputPerPortion
  let displayUnit = unit
  if (unit === 'kg' && amount < 1) {
    amount *= 1000
    displayUnit = 'g'
  } else if (unit === 'l' && amount < 1) {
    amount *= 1000
    displayUnit = 'ml'
  }
  return `${formatDecimal(amount, lang)} ${unitLabel(displayUnit, lang)}`
}

function TechCardImage({ item, className = '' }) {
  return (
    <MenuMedia
      src={item?.image_url}
      alt=""
      className={`h-full w-full object-cover object-center ${className}`}
      containerClassName="h-full w-full"
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-[#efece9] text-[#68655f]">
          <UtensilsCrossed size={24} />
        </div>
      }
    />
  )
}

async function loadTechCards() {
  const [cardsResult, ingredientsResult, componentsResult] = await Promise.all([
    supabase.from('menu_item_tech_cards').select('*').order('updated_at', { ascending: false }),
    supabase.from('menu_item_tech_card_ingredients').select('*').order('sort_order', { ascending: true }),
    supabase.from('menu_item_tech_card_components').select('*').order('sort_order', { ascending: true }),
  ])
  if (cardsResult.error) throw cardsResult.error
  if (ingredientsResult.error) throw ingredientsResult.error
  if (componentsResult.error) throw componentsResult.error

  const ingredientsByItemId = new Map()
  for (const ingredient of ingredientsResult.data || []) {
    const key = techCardStorageKey(ingredient.menu_item_id, ingredient.variant_option_id)
    const rows = ingredientsByItemId.get(key) || []
    rows.push(ingredient)
    ingredientsByItemId.set(key, rows)
  }
  const componentsByItemId = new Map()
  for (const component of componentsResult.data || []) {
    const key = techCardStorageKey(component.menu_item_id, component.variant_option_id)
    const rows = componentsByItemId.get(key) || []
    rows.push(component)
    componentsByItemId.set(key, rows)
  }

  return Object.fromEntries((cardsResult.data || []).map(card => [
    techCardStorageKey(card.menu_item_id, card.variant_option_id),
    normalizeTechCard({
      ...card,
      ingredients: ingredientsByItemId.get(techCardStorageKey(card.menu_item_id, card.variant_option_id)) || [],
      components: componentsByItemId.get(techCardStorageKey(card.menu_item_id, card.variant_option_id)) || [],
    }),
  ]))
}

// Catalog ingredients offer only units their price converts to; keep a legacy unit visible.
function ingredientUnitOptions(bazaarIngredient, currentUnit) {
  const units = bazaarIngredient
    ? getCompatibleTechCardUnits(getBazaarIngredientTechCardUnit(bazaarIngredient))
    : TECH_CARD_UNITS
  return units.includes(currentUnit) ? units : [...units, currentUnit]
}

// Workspace KPI tile, as on Expenses: caption label, quiet value, neutral icon circle.
function SummaryTile({ label, value, icon: Icon }) {
  return (
    <div className="ws-panel h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ws-caption">{label}</p>
          <p className="mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]">{value}</p>
        </div>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
          <Icon size={16} />
        </div>
      </div>
    </div>
  )
}

// Same look as the Menu category tiles: white hairline card, orange border and ring when active.
function CategoryFilterTile({ category, label, count, selected, onClick }) {
  const isAll = category.id === 'all'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative w-[104px] shrink-0 overflow-hidden rounded-xl border bg-white text-center transition-colors md:w-[112px] xl:w-[120px] ${selected
        ? 'border-[#ff5a00] ring-1 ring-[#ff5a00]'
        : 'border-[#e4e1de] hover:bg-[#f6f5f3]'}`}
    >
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-[#efece9]">
        {isAll ? (
          <span className={`grid h-11 w-11 place-items-center rounded-full ${selected ? 'bg-[#fff1e8] text-[#ff5a00]' : 'bg-white text-[#68655f]'}`}>
            <LayoutGrid size={20} />
          </span>
        ) : (
          <MenuMedia
            src={category.image_url}
            alt=""
            className="h-full w-full object-cover object-center"
            containerClassName="h-full w-full"
            fallback={<UtensilsCrossed size={24} className={selected ? 'text-[#ff5a00]' : 'text-[#68655f]'} />}
          />
        )}
      </div>
      <div className="flex min-h-[44px] items-center justify-center px-2 py-2">
        <p className={`line-clamp-2 text-[13px] font-medium leading-tight ${selected ? 'text-[#ff5a00]' : 'text-[#22201d]'}`}>{label}</p>
      </div>
      <span className="ws-count absolute right-1.5 top-1.5 !bg-white shadow-[0_1px_2px_rgb(34_32_29/10%)]">
        {count}
      </span>
    </button>
  )
}

export default function TechCards() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const { loaded, loadError } = useAppDataStatus()
  const { menuItemId } = useParams()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const l = labels(lang)
  const mayEdit = canEditMenu(profile || { role: state.user?.role })
  const [cardsByItemId, setCardsByItemId] = useState({})
  const [cardsLoading, setCardsLoading] = useState(true)
  const [cardsError, setCardsError] = useState('')
  const [bazaarIngredients, setBazaarIngredients] = useState([])
  const [bazaarIngredientsError, setBazaarIngredientsError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [form, setForm] = useState(null)
  const [originalFingerprint, setOriginalFingerprint] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [activeVariantOptionId, setActiveVariantOptionId] = useState('')
  const [copySourceOptionId, setCopySourceOptionId] = useState('')
  const [copyScale, setCopyScale] = useState('1')

  const activeItems = useMemo(() => state.menuItems
    .filter(isActiveMenuItem)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)), [state.menuItems])
  const techCardItems = useMemo(() => activeItems
    .filter(item => isTechCardEligibleMenuItem(item, state.categories)), [activeItems, state.categories])
  const categoriesById = useMemo(() => new Map(state.categories.map(category => [category.id, category])), [state.categories])
  const bazaarIngredientSuggestions = useMemo(() => bazaarIngredients.map(ingredient => ({
    key: ingredient.product_key,
    name: ingredient.product_name,
    category: ingredient.category,
    unit: ingredient.unit,
    normalUnitPrice: Number(ingredient.normal_unit_price) || 0,
  })), [bazaarIngredients])
  const categoryCounts = useMemo(() => techCardItems.reduce((counts, item) => {
    if (item.category_id) counts[item.category_id] = (counts[item.category_id] || 0) + 1
    return counts
  }, {}), [techCardItems])
  const mealCategories = useMemo(() => state.categories
    .filter(category => category.id !== 'all' && categoryCounts[category.id])
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)), [categoryCounts, state.categories])
  const editorItem = menuItemId ? techCardItems.find(item => item.id === menuItemId) : null
  const editorVariants = useMemo(() => editorItem
    ? getMenuItemOptionGroups(editorItem, lang, { includeUnavailable: true }).flatMap(group => group.options)
    : [], [editorItem, lang])

  useEffect(() => {
    if (!loaded || loadError) return undefined
    let active = true
    setCardsLoading(true)
    setCardsError('')
    loadTechCards()
      .then(cards => {
        if (active) setCardsByItemId(cards)
      })
      .catch(error => {
        if (active) setCardsError(error?.message || l.listError)
      })
      .finally(() => {
        if (active) setCardsLoading(false)
      })
    return () => { active = false }
  }, [loaded, loadError])

  useEffect(() => {
    if (!loaded || loadError) return undefined
    let active = true
    setBazaarIngredientsError('')
    supabase
      .from('bazaar_product_catalog')
      .select('product_key, product_name, category, unit, normal_unit_price')
      .eq('is_catalog_managed', true)
      .eq('is_active', true)
      .order('product_name')
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setBazaarIngredientsError(error.message || l.ingredientCatalogError)
          return
        }
        setBazaarIngredients(data || [])
      })
      .catch(error => {
        if (active) setBazaarIngredientsError(error?.message || l.ingredientCatalogError)
      })
    return () => { active = false }
  }, [loaded, loadError])

  useEffect(() => {
    if (!menuItemId || cardsLoading) return
    const key = techCardStorageKey(menuItemId, activeVariantOptionId)
    const nextForm = cardsByItemId[key]
      ? normalizeTechCard(cardsByItemId[key])
      : createBlankTechCard(menuItemId, activeVariantOptionId)
    setForm(nextForm)
    setOriginalFingerprint(techCardFingerprint(nextForm))
    setSaveError('')
    setSaveNotice('')
  }, [menuItemId, activeVariantOptionId, cardsLoading, cardsByItemId])

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return techCardItems.filter(item => {
      const hasCard = Object.keys(cardsByItemId).some(key => key.startsWith(`${item.id}::`))
      if (filter === 'ready' && !hasCard) return false
      if (filter === 'missing' && hasCard) return false
      if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false
      if (!needle) return true
      return [item.name_uz, item.name_ru, item.name_en, item.external_id]
        .some(value => String(value || '').toLowerCase().includes(needle))
    })
  }, [techCardItems, cardsByItemId, categoryFilter, filter, search])
  const filteredSections = useMemo(() => {
    const sections = mealCategories
      .map(category => ({
        id: category.id,
        label: getCategoryName(category, lang),
        items: filteredItems.filter(item => item.category_id === category.id),
      }))
      .filter(section => section.items.length > 0)
    const knownCategoryIds = new Set(mealCategories.map(category => category.id))
    const otherItems = filteredItems.filter(item => !knownCategoryIds.has(item.category_id))
    if (otherItems.length > 0) sections.push({ id: 'other', label: l.otherCategory, items: otherItems })
    return sections
  }, [filteredItems, l.otherCategory, lang, mealCategories])

  const configuredCards = techCardItems.filter(item => Object.keys(cardsByItemId).some(key => key.startsWith(`${item.id}::`)))
  const averagePortionCost = configuredCards.length
    ? configuredCards.reduce((sum, item) => {
      const card = cardsByItemId[techCardStorageKey(item.id)] || Object.entries(cardsByItemId).find(([key]) => key.startsWith(`${item.id}::`))?.[1]
      return sum + (calculateTechCardSummary(card, activeItems).portionCost || 0)
    }, 0) / configuredCards.length
    : 0

  function updateIngredient(index, patch) {
    setForm(current => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, ingredientIndex) => (
        ingredientIndex === index ? { ...ingredient, ...patch } : ingredient
      )),
    }))
    setSaveNotice('')
  }

  function addIngredient() {
    setForm(current => ({ ...current, ingredients: [...current.ingredients, createBlankTechCardIngredient()] }))
    setSaveNotice('')
  }

  function removeIngredient(index) {
    setForm(current => ({
      ...current,
      ingredients: current.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index),
    }))
    setSaveNotice('')
  }

  function updateComponent(index, patch) {
    setForm(current => ({
      ...current,
      components: current.components.map((component, componentIndex) => (
        componentIndex === index ? { ...component, ...patch } : component
      )),
    }))
    setSaveNotice('')
  }

  function addComponent() {
    setForm(current => ({
      ...current,
      components: [...current.components, createBlankTechCardComponent()],
    }))
    setSaveNotice('')
  }

  function removeComponent(index) {
    setForm(current => ({
      ...current,
      components: current.components.filter((_, componentIndex) => componentIndex !== index),
    }))
    setSaveNotice('')
  }

  function copyRecipe() {
    const source = cardsByItemId[techCardStorageKey(menuItemId, copySourceOptionId)]
      || Object.entries(cardsByItemId).find(([key]) => key.startsWith(`${menuItemId}::`))?.[1]
    if (!source) return
    const copied = copyAndScaleTechCard(source, activeVariantOptionId, copyScale)
    setForm(copied)
    setSaveError('')
    setSaveNotice('')
  }

  async function saveCard() {
    if (!mayEdit || !form || saving) return
    const validationError = validateTechCard(form, activeItems, {
      preparationMethodRequired: l.preparationMethodRequired,
    })
    if (validationError) {
      setSaveError(validationError)
      return
    }
    const payload = buildTechCardPayload(form)
    setSaving(true)
    setSaveError('')
    setSaveNotice('')
    try {
      const { error } = await supabase.rpc('save_menu_item_tech_card', { payload })
      if (error) throw error
      const savedCost = Math.max(0, Math.round(calculateTechCardSummary(form, activeItems).portionCost || 0))
      const savedCard = normalizeTechCard({ ...payload, updated_at: new Date().toISOString() })
      setCardsByItemId(current => ({ ...current, [techCardStorageKey(payload.menu_item_id, payload.variant_option_id)]: savedCard }))
      dispatch({
        type: 'SET_MENU_ITEM_COST',
        payload: payload.variant_option_id
          ? { id: payload.menu_item_id, variant_costs: { ...(editorItem.variant_costs || {}), [payload.variant_option_id]: savedCost }, cost_source: editorItem.cost_source || 'manual' }
          : { id: payload.menu_item_id, cost_price: savedCost, cost_source: 'tech_card' },
      })
      setForm(savedCard)
      setOriginalFingerprint(techCardFingerprint(savedCard))
      setSaveNotice(l.saved)
    } catch (error) {
      setSaveError(error?.message || l.listError)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded || loadError) {
    return (
      <AppShell title={l.title}>
        {!loaded ? (
          <OperationalLoading title={l.title} description={l.subtitle} />
        ) : (
          <OperationalError title={l.listError} description={loadError} actionLabel="Reload" onAction={() => window.location.reload()} />
        )}
      </AppShell>
    )
  }

  if (cardsLoading) {
    return <AppShell title={l.title}><OperationalLoading title={l.title} description={l.subtitle} /></AppShell>
  }

  if (cardsError) {
    return (
      <AppShell title={l.title}>
        <OperationalError
          title={l.listError}
          description={`${cardsError} ${l.migration}`}
          actionLabel="Reload"
          onAction={() => window.location.reload()}
        />
      </AppShell>
    )
  }

  if (menuItemId) {
    if (!editorItem || !form) {
      return (
        <AppShell title={l.title}>
          <OperationalError
            title={l.productMissing}
            description={l.productMissingHint}
            actionLabel={l.back}
            onAction={() => navigate('/admin/tech-cards')}
          />
        </AppShell>
      )
    }

    const summary = calculateTechCardSummary(form, activeItems)
    const category = categoriesById.get(editorItem.category_id)
    const dirty = techCardFingerprint(form) !== originalFingerprint
    const validationError = validateTechCard(form, activeItems, {
      preparationMethodRequired: l.preparationMethodRequired,
    })
    const activeVariant = editorVariants.find(option => option.id === activeVariantOptionId)
    const price = Number(activeVariant?.price ?? editorItem.price ?? 0)
    const savedCost = activeVariantOptionId
      ? editorItem.variant_costs?.[activeVariantOptionId]
      : editorItem.cost_price
    const estimatedProfit = summary.portionCost == null
      ? null
      : getSaleProfitSummary(price, summary.portionCost)

    const saveDisabled = saving || !dirty || !!validationError
    const ingredientColumns = 'sm:grid-cols-[minmax(140px,1.5fr)_90px_90px_minmax(120px,1fr)_110px_40px]'
    const fieldLabel = 'ws-caption mb-1 block sm:sr-only'

    return (
      <AppShell
        title={`${l.title} · ${getItemName(editorItem, lang)}`}
        back={{ label: l.back, onClick: () => navigate('/admin/tech-cards') }}
        titleAccessory={!mayEdit ? <span className="ws-badge">{l.readOnly}</span> : null}
        headerActions={mayEdit ? (
          <button
            type="button"
            onClick={saveCard}
            disabled={saveDisabled}
            title={validationError || ''}
            aria-label={saving ? l.saving : l.save}
            className="ws-btn ws-btn-primary !h-[38px]"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            <span className="hidden sm:inline">{saving ? l.saving : l.save}</span>
          </button>
        ) : null}
      >
        <div className="min-h-full bg-[#f6f5f3]">
          <div className="ws-page">
            <div className="ws-panel flex flex-wrap items-center gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg"><TechCardImage item={editorItem} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-[#22201d]">{getItemName(editorItem, lang)}</p>
                <p className="ws-caption truncate">{category ? getCategoryName(category, lang) : '—'} · {editorItem.external_id || editorItem.id}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/admin/menu/product/${encodeURIComponent(editorItem.id)}`)}
                className="ws-btn ws-btn-outline ws-btn-sm"
              >
                {l.editProduct}
              </button>
            </div>

            {(saveError || saveNotice) && (
              <div role={saveError ? 'alert' : 'status'} className={`ws-notice ${saveError ? 'ws-tone-negative' : 'ws-tone-positive'}`}>
                {saveError || saveNotice}
              </div>
            )}

            {editorVariants.length > 0 && (
              <section className="ws-panel">
                <p className="ws-caption mb-3 font-medium">{l.variantRecipe}</p>
                <div className="ws-segmented">
                  {[{ id: '', label: l.baseRecipe }, ...editorVariants].map(option => {
                    const selected = activeVariantOptionId === option.id
                    const ready = !!cardsByItemId[techCardStorageKey(editorItem.id, option.id)]
                    return (
                      <button
                        key={option.id || 'base'}
                        type="button"
                        onClick={() => setActiveVariantOptionId(option.id)}
                        disabled={saving || (dirty && !selected)}
                        title={dirty && !selected ? l.save : ''}
                        aria-pressed={selected}
                        className="disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {option.label} {ready ? '✓' : ''}
                      </button>
                    )
                  })}
                </div>

                {mayEdit && !cardsByItemId[techCardStorageKey(editorItem.id, activeVariantOptionId)] && Object.keys(cardsByItemId).some(key => key.startsWith(`${editorItem.id}::`)) && (
                  <div className="mt-4 grid gap-3 rounded-[10px] bg-[#f6f5f3] p-3 sm:grid-cols-[minmax(180px,1fr)_110px_auto] sm:items-end">
                    <label>
                      <span className="ws-caption mb-1 block">{l.copyFrom}</span>
                      <select value={copySourceOptionId} onChange={event => setCopySourceOptionId(event.target.value)} className="ws-input !h-10 !py-0">
                        {[{ id: '', label: l.baseRecipe }, ...editorVariants].filter(option => !!cardsByItemId[techCardStorageKey(editorItem.id, option.id)]).map(option => <option key={option.id || 'base'} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="ws-caption mb-1 block">{l.scale}</span>
                      <input inputMode="decimal" value={copyScale} onChange={event => setCopyScale(event.target.value)} className="ws-input !h-10 tabular-nums" />
                    </label>
                    <button type="button" onClick={copyRecipe} className="ws-btn ws-btn-outline !h-10"><Copy size={14} />{l.copy}</button>
                  </div>
                )}
              </section>
            )}

            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
              <div className="min-w-0 space-y-5">
                <section className="ws-panel">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="ws-heading">{l.ingredients}</h2>
                      <p className="ws-caption mt-0.5">{l.ingredientHint}</p>
                    </div>
                    {mayEdit && (
                      <button type="button" onClick={addIngredient} disabled={saving} className="ws-btn ws-btn-outline ws-btn-sm">
                        <Plus size={15} /> {l.addIngredient}
                      </button>
                    )}
                  </div>

                  {bazaarIngredientsError && (
                    <p role="alert" className="ws-notice ws-tone-caution mb-3">
                      {l.ingredientCatalogError} {bazaarIngredientsError}
                    </p>
                  )}

                  {form.ingredients.length === 0 ? (
                    <button type="button" onClick={mayEdit ? addIngredient : undefined} className="ws-empty w-full rounded-[10px] border border-dashed border-[#e4e1de] !py-10 disabled:cursor-default" disabled={!mayEdit}>
                      <ClipboardList size={22} />
                      <span className="text-sm font-medium text-[#68655f]">{l.addIngredient}</span>
                    </button>
                  ) : (
                    <div className="overflow-hidden rounded-[10px] border border-[#e4e1de]">
                      <div className={`ws-table-head hidden gap-2 px-3 py-2 sm:grid ${ingredientColumns}`} aria-hidden="true">
                        <span>{l.ingredient}</span>
                        <span>{l.quantity}</span>
                        <span>{l.unit}</span>
                        <span>{l.unitPrice}</span>
                        <span className="text-right">{l.lineCost}</span>
                        <span />
                      </div>
                      {form.ingredients.map((ingredient, index) => {
                        const line = summary.ingredients[index]
                        const selectedBazaarIngredient = bazaarIngredientSuggestions.find(item => item.name === ingredient.name)
                        return (
                          <div key={ingredient.id || index} className={`ws-row grid min-w-0 grid-cols-2 gap-2 p-3 sm:items-center ${ingredientColumns}`}>
                            <label className="col-span-2 min-w-0 sm:col-span-1">
                              <span className={fieldLabel}>{l.ingredient}</span>
                              <BazaarIngredientPicker
                                suggestions={bazaarIngredientSuggestions}
                                value={selectedBazaarIngredient?.key || ''}
                                fallbackLabel={ingredient.name}
                                onChange={key => {
                                  const selected = bazaarIngredientSuggestions.find(item => item.key === key)
                                  if (selected) updateIngredient(index, getBazaarIngredientTechCardPatch(selected))
                                }}
                                lang={lang}
                                disabled={!mayEdit || saving}
                                invalid={!selectedBazaarIngredient}
                              />
                            </label>
                            <label className="min-w-0">
                              <span className={fieldLabel}>{l.quantity}</span>
                              <input inputMode="decimal" value={ingredient.quantity} onChange={event => updateIngredient(index, { quantity: event.target.value })} disabled={!mayEdit || saving} className="ws-input tabular-nums disabled:bg-[#efece9]" />
                            </label>
                            <label className="min-w-0">
                              <span className={fieldLabel}>{l.unit}</span>
                              <select
                                value={ingredient.unit}
                                onChange={event => updateIngredient(index, selectedBazaarIngredient
                                  ? getBazaarIngredientTechCardPatch(selectedBazaarIngredient, event.target.value)
                                  : { unit: event.target.value })}
                                disabled={!mayEdit || saving}
                                className="ws-input !px-2 !pr-6 disabled:bg-[#efece9]"
                              >
                                {ingredientUnitOptions(selectedBazaarIngredient, ingredient.unit).map(unit => <option key={unit} value={unit}>{unitLabel(unit, lang)}</option>)}
                              </select>
                            </label>
                            <label className="min-w-0">
                              <span className={fieldLabel}>{l.unitPrice}</span>
                              <input inputMode="numeric" value={formatTechCardUnitPrice(ingredient.unit_price_uzs)} disabled className="ws-input min-w-0 cursor-not-allowed !border-[#e4e1de] !bg-[#f6f5f3] tabular-nums !text-[#68655f]" />
                            </label>
                            <div className="min-w-0">
                              <span className={fieldLabel}>{l.lineCost}</span>
                              <div className="flex h-11 items-center text-sm font-semibold tabular-nums text-[#22201d] sm:justify-end">{formatCurrency(Math.round(line?.lineCost || 0))}</div>
                            </div>
                            {mayEdit && (
                              <button type="button" onClick={() => removeIngredient(index)} disabled={saving} aria-label="Remove ingredient" className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm ws-btn-icon self-end justify-self-end sm:self-center">
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="ws-panel">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="ws-heading">{l.includedItems}</h2>
                      <p className="ws-caption mt-0.5 max-w-2xl">{l.includedItemsHint}</p>
                    </div>
                    {mayEdit && (
                      <button type="button" onClick={addComponent} disabled={saving} className="ws-btn ws-btn-outline ws-btn-sm">
                        <Plus size={15} /> {l.addIncludedItem}
                      </button>
                    )}
                  </div>

                  {form.components.length === 0 ? (
                    <button type="button" onClick={mayEdit ? addComponent : undefined} className="ws-empty w-full rounded-[10px] border border-dashed border-[#e4e1de] !py-8 disabled:cursor-default" disabled={!mayEdit}>
                      <UtensilsCrossed size={22} />
                      <span className="text-sm font-medium text-[#68655f]">{mayEdit ? l.addIncludedItem : l.noIncludedItems}</span>
                    </button>
                  ) : (
                    <div className="overflow-hidden rounded-[10px] border border-[#e4e1de]">
                      {form.components.map((component, index) => {
                        const componentSummary = summary.components[index]
                        return (
                        <div key={component.id || index} className="ws-row grid min-w-0 gap-3 p-3 sm:grid-cols-[minmax(220px,1fr)_130px_40px] sm:items-start">
                          <label className="min-w-0">
                            <span className="ws-caption mb-1 block">{l.includedItems}</span>
                            <MenuItemPicker
                              items={activeItems.filter(item => item.id !== editorItem.id)}
                              categories={state.categories}
                              value={component.component_menu_item_id}
                              selectedOptions={component.selected_options}
                              onChange={(itemId, selectedOptions) => updateComponent(index, {
                                component_menu_item_id: itemId,
                                selected_options: selectedOptions,
                              })}
                              lang={lang}
                              disabled={!mayEdit || saving}
                            />
                            {component.component_menu_item_id && (
                              <span className="ws-caption mt-1.5 block tabular-nums">
                                {l.savedCost}: {componentSummary?.costAvailable
                                  ? `${formatCurrency(Math.round(componentSummary.unitCost))} × ${formatDecimal(componentSummary.quantity, lang)} = ${formatCurrency(Math.round(componentSummary.lineCost))}`
                                  : '—'}
                              </span>
                            )}
                          </label>
                          <label>
                            <span className="ws-caption mb-1 block">{l.quantity}</span>
                            <div className="relative">
                              <input
                                inputMode="decimal"
                                value={component.quantity}
                                onChange={event => updateComponent(index, { quantity: event.target.value })}
                                disabled={!mayEdit || saving}
                                className="ws-input !pr-14 tabular-nums disabled:bg-[#efece9]"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#68655f]">
                                {unitLabel(activeItems.find(item => item.id === component.component_menu_item_id)?.sale_unit || 'piece', lang)}
                              </span>
                            </div>
                          </label>
                          {mayEdit && (
                            <button type="button" onClick={() => removeComponent(index)} disabled={saving} aria-label="Remove included menu item" className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm ws-btn-icon !h-11 justify-self-end sm:mt-[22px]">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="ws-panel">
                  <h2 className="ws-heading mb-4">{l.batch}</h2>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label>
                      <span className="ws-caption mb-1.5 block">{l.batchOutput}</span>
                      <input inputMode="decimal" value={form.batch_output_quantity} onChange={event => { setForm(current => ({ ...current, batch_output_quantity: event.target.value })); setSaveNotice('') }} disabled={!mayEdit || saving} placeholder="5" className="ws-input tabular-nums disabled:bg-[#efece9]" />
                    </label>
                    <label>
                      <span className="ws-caption mb-1.5 block">{l.unit}</span>
                      <select value={form.batch_output_unit} onChange={event => { setForm(current => ({ ...current, batch_output_unit: event.target.value })); setSaveNotice('') }} disabled={!mayEdit || saving} className="ws-input disabled:bg-[#efece9]">
                        {TECH_CARD_UNITS.map(unit => <option key={unit} value={unit}>{unitLabel(unit, lang)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="ws-caption mb-1.5 block">{l.portions}</span>
                      <input inputMode="decimal" value={form.portion_count} onChange={event => { setForm(current => ({ ...current, portion_count: event.target.value })); setSaveNotice('') }} placeholder="50" disabled={!mayEdit || saving} className="ws-input tabular-nums disabled:bg-[#efece9]" />
                    </label>
                  </div>
                </section>

                <section className="ws-panel">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[#22201d]">{l.method}</span>
                    <textarea rows="8" value={form.preparation_steps} onChange={event => { setForm(current => ({ ...current, preparation_steps: event.target.value })); setSaveNotice('') }} disabled={!mayEdit || saving} placeholder={l.methodPlaceholder} className="ws-input !h-auto resize-y !py-3 leading-relaxed disabled:bg-[#efece9]" />
                  </label>
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-sm font-medium text-[#22201d]">{l.notes}</span>
                    <textarea rows="3" value={form.notes} onChange={event => { setForm(current => ({ ...current, notes: event.target.value })); setSaveNotice('') }} disabled={!mayEdit || saving} placeholder={l.notesPlaceholder} className="ws-input !h-auto resize-y !py-3 leading-relaxed disabled:bg-[#efece9]" />
                  </label>
                </section>
              </div>

              <aside className="min-w-0 space-y-4 lg:sticky lg:top-5 lg:self-start">
                <section className="ws-panel">
                  <h2 className="ws-heading mb-2">{l.title}</h2>
                  <div className="divide-y divide-[#e4e1de]/60">
                    {[
                      [l.salePrice, formatCurrency(price)],
                      [l.savedCost, savedCost == null ? '—' : formatCurrency(savedCost)],
                      [l.batchCost, summary.batchCost == null ? '—' : formatCurrency(Math.round(summary.batchCost))],
                      [l.portionCost, summary.portionCost == null ? '—' : formatCurrency(Math.round(summary.portionCost))],
                      [l.outputPerPortion, formatOutputPerPortion(summary, form.batch_output_unit, lang)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="text-[13px] text-[#68655f]">{label}</span>
                        <span className="text-right text-sm font-semibold tabular-nums text-[#22201d]">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-[10px] bg-[#f6f5f3] px-3 py-2.5">
                    <span className="text-[13px] text-[#68655f]">{l.estimatedProfit}</span>
                    <span className={`text-right text-sm font-semibold tabular-nums ${estimatedProfit == null ? 'text-[#22201d]' : estimatedProfit.profit >= 0 ? 'text-[#1d7a52]' : 'text-[#c4262c]'}`}>{estimatedProfit == null
                      ? '—'
                      : formatCurrencyWithPercentage(estimatedProfit.profit, estimatedProfit.marginPct, lang)}</span>
                  </div>
                </section>

                {mayEdit && (
                  <button
                    type="button"
                    onClick={saveCard}
                    disabled={saveDisabled}
                    title={validationError || ''}
                    className="ws-btn ws-btn-primary w-full lg:hidden"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {saving ? l.saving : l.save}
                  </button>
                )}
                {validationError && dirty && <p className="ws-notice ws-tone-caution text-[13px]">{validationError}</p>}
              </aside>
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={l.title} headerActions={<TechCardPdfDownload items={techCardItems} cards={cardsByItemId} categories={state.categories} allItems={activeItems} lang={lang} labels={l} />}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile label={l.total} value={techCardItems.length} icon={UtensilsCrossed} />
            <SummaryTile label={l.configured} value={configuredCards.length} icon={BookOpenCheck} />
            <SummaryTile label={l.needSetup} value={techCardItems.length - configuredCards.length} icon={ClipboardList} />
            <SummaryTile label={l.average} value={formatCurrency(Math.round(averagePortionCost))} icon={CircleDollarSign} />
          </div>

          <section className="ws-panel" aria-labelledby="tech-card-categories-heading">
            <h2 id="tech-card-categories-heading" className="ws-heading mb-3">{l.categories}</h2>
            <div className="flex gap-3 overflow-x-auto p-px pb-1">
              {[
                { id: 'all', image_url: null },
                ...mealCategories,
              ].map(category => (
                <CategoryFilterTile
                  key={category.id}
                  category={category}
                  label={category.id === 'all' ? l.all : getCategoryName(category, lang)}
                  count={category.id === 'all' ? techCardItems.length : categoryCounts[category.id]}
                  selected={categoryFilter === category.id}
                  onClick={() => setCategoryFilter(category.id)}
                />
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-[220px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder={l.search} aria-label={l.search} className="ws-input !pl-9" />
            </label>
            <div className="ws-segmented">
              {[
                ['all', l.all], ['ready', l.ready], ['missing', l.missing],
              ].map(([key, label]) => (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="ws-panel ws-empty">
              <ClipboardList size={22} />
              <h3>{l.noResults}</h3>
              <p>{l.noResultsHint}</p>
            </div>
          ) : (
            <div className="space-y-8">
              {filteredSections.map(section => (
                <section key={section.id} aria-labelledby={`tech-card-section-${section.id}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <h2 id={`tech-card-section-${section.id}`} className="ws-display">{section.label}</h2>
                    <span className="ws-count">{section.items.length}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {section.items.map(item => {
                      const card = cardsByItemId[techCardStorageKey(item.id)]
                        || Object.entries(cardsByItemId).find(([key]) => key.startsWith(`${item.id}::`))?.[1]
                      const summary = card ? calculateTechCardSummary(card, activeItems) : null
                      const cardVariant = card?.variant_option_id
                        ? getMenuItemOptionGroups(item, lang, { includeUnavailable: true })
                          .flatMap(group => group.options)
                          .find(option => option.id === card.variant_option_id)
                        : null
                      const cardProfit = summary?.portionCost == null
                        ? null
                        : getSaleProfitSummary(Number(cardVariant?.price ?? item.price ?? 0), summary.portionCost)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => navigate(`/admin/tech-cards/${encodeURIComponent(item.id)}`)}
                          className="ws-panel ws-panel-flush group relative flex min-w-0 text-left transition-shadow hover:shadow-[0_4px_14px_rgb(34_32_29/8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40"
                        >
                          <div className="relative w-24 shrink-0 self-stretch sm:w-28">
                            <TechCardImage item={item} />
                          </div>
                          <div className="min-w-0 flex-1 p-4">
                            <div className="flex items-start gap-2">
                              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#22201d]">{getItemName(item, lang)}</p>
                              {cardProfit ? (
                                <span className={`ws-badge shrink-0 tabular-nums ${cardProfit.profit >= 0 ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
                                  {formatDecimal(cardProfit.marginPct, lang, 1)}%
                                </span>
                              ) : (
                                <ChevronRight size={18} className="shrink-0 text-[#68655f] transition-transform group-hover:translate-x-0.5 group-hover:text-[#ff5a00]" />
                              )}
                            </div>
                            {card ? (
                              <>
                                <p className="ws-caption mt-3">{l.portionCost}</p>
                                <p className="text-sm font-semibold tabular-nums text-[#22201d]">{summary.portionCost == null ? '—' : formatCurrency(Math.round(summary.portionCost))}</p>
                              </>
                            ) : (
                              <span className="ws-status ws-tone-caution mt-4">{l.unsaved}</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
