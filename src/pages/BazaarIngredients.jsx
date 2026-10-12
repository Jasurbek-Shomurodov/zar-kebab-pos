import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Download, Loader2, PackagePlus, Plus, RotateCcw, Save, Search, Tag, X } from 'lucide-react'
import { useIngredientTabs } from '../components/IngredientNavigation'
import BazaarCategoryPicker from '../components/BazaarCategoryPicker'
import { startsWithCapitalOrDigit } from '../lib/nameStart'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { canEditFeature } from '../lib/permissions'
import { formatCurrency } from '../lib/formatCurrency'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { withWriteTimeout } from '../lib/writeTimeout'
import { BAZAAR_CUSTOM_CATEGORY_MAX_LENGTH, BAZAAR_ENTRY_UNITS, BAZAAR_PACKAGE_UNITS, bazaarPricePerPiece, normalizeBazaarPiecesPerUnit, bazaarCategoriesFor, bazaarCategoryLabel, bazaarUnitLabel, capitalizeBazaarIngredientName, capitalizeBazaarNameInput, normalizeBazaarProductKey } from '../lib/bazaar'
import { bazaarIngredientMatches, isBazaarIngredientNetworkError, runBazaarIngredientWriteWithRecovery } from '../lib/bazaarIngredientWrites'

const INPUT = 'ws-input disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]'

const COPY = {
  en: {
    downloadPdf: 'Download PDF', exportingPdf: 'Preparing PDF…', pdfFailed: 'Could not create the PDF. Please try again.', pdfHint: 'Export the current filtered list', status: 'Status',
    title: 'Ingredients', sub: 'Keep one canonical name and normal unit price for every ingredient.', back: 'Daily Bazaar', add: 'Add ingredient', edit: 'Edit ingredient', name: 'Ingredient name', nameHint: 'You can change the name. Past purchases keep their original names.', category: 'Category', unit: 'Purchase unit', normalPrice: 'Normal price per unit', save: 'Save ingredient', saving: 'Saving…', cancel: 'Cancel', search: 'Search ingredients…', active: 'Active', archived: 'Archived', all: 'All', archive: 'Archive', restore: 'Restore', empty: 'No ingredients found.', loadFailed: 'Could not load ingredients.', saveFailed: 'Could not save the ingredient.', statusFailed: 'Could not update the ingredient status.', connectionFailed: 'Connection was interrupted. Please try again; a completed save will not be duplicated.', saved: 'Ingredient saved.', statusUpdated: 'Ingredient status updated.', retry: 'Try again', readOnly: 'Your access is read-only.', required: 'Enter a name and a normal price greater than zero.', migrationMissing: 'Apply the latest Bazaar migrations to manage ingredients.'
  },
  ru: {
    downloadPdf: 'Скачать PDF', exportingPdf: 'Подготовка PDF…', pdfFailed: 'Не удалось создать PDF. Повторите попытку.', pdfHint: 'Экспорт текущего списка с учётом фильтров', status: 'Статус',
    title: 'Ингредиенты', sub: 'Единое название и обычная цена за единицу для каждого ингредиента.', back: 'Ежедневный базар', add: 'Добавить ингредиент', edit: 'Изменить ингредиент', name: 'Название ингредиента', nameHint: 'Название можно изменить. В прошлых закупках сохранится прежнее название.', category: 'Категория', unit: 'Единица закупки', normalPrice: 'Обычная цена за единицу', save: 'Сохранить', saving: 'Сохранение…', cancel: 'Отмена', search: 'Поиск ингредиентов…', active: 'Активные', archived: 'Архивные', all: 'Все', archive: 'В архив', restore: 'Восстановить', empty: 'Ингредиенты не найдены.', loadFailed: 'Не удалось загрузить ингредиенты.', saveFailed: 'Не удалось сохранить ингредиент.', statusFailed: 'Не удалось изменить статус ингредиента.', connectionFailed: 'Соединение прервалось. Повторите попытку — уже выполненное сохранение не продублируется.', saved: 'Ингредиент сохранён.', statusUpdated: 'Статус ингредиента изменён.', retry: 'Повторить', readOnly: 'У вас доступ только для чтения.', required: 'Введите название и обычную цену больше нуля.', migrationMissing: 'Примените последние миграции базара для управления ингредиентами.'
  },
  uz: {
    downloadPdf: 'PDF yuklab olish', exportingPdf: 'PDF tayyorlanmoqda…', pdfFailed: 'PDF yaratilmadi. Qayta urinib ko‘ring.', pdfHint: 'Filtrlangan ro‘yxatni yuklab olish', status: 'Holat',
    title: 'Masalliqlar', sub: 'Har bir masalliq uchun yagona nom va odatiy birlik narxini saqlang.', back: 'Kunlik bozor', add: 'Masalliq qo‘shish', edit: 'Masalliqni tahrirlash', name: 'Masalliq nomi', nameHint: 'Nomni o‘zgartirish mumkin. Oldingi xaridlarda eski nom saqlanadi.', category: 'Kategoriya', unit: 'Xarid birligi', normalPrice: 'Birlik uchun odatiy narx', save: 'Saqlash', saving: 'Saqlanmoqda…', cancel: 'Bekor qilish', search: 'Masalliq qidirish…', active: 'Faol', archived: 'Arxiv', all: 'Barchasi', archive: 'Arxivlash', restore: 'Tiklash', empty: 'Masalliq topilmadi.', loadFailed: 'Masalliqlarni yuklab bo‘lmadi.', saveFailed: 'Masalliqni saqlab bo‘lmadi.', statusFailed: 'Masalliq holatini o‘zgartirib bo‘lmadi.', connectionFailed: 'Aloqa uzildi. Qayta urinib ko‘ring — saqlangan yozuv takrorlanmaydi.', saved: 'Masalliq saqlandi.', statusUpdated: 'Masalliq holati yangilandi.', retry: 'Qayta urinish', readOnly: 'Sizda faqat ko‘rish huquqi bor.', required: 'Nom va noldan katta odatiy narx kiriting.', migrationMissing: 'Masalliqlarni boshqarish uchun oxirgi bozor migratsiyalarini qo‘llang.'
  },
}

const CATEGORY_COPY = {
  en: { piecesPerUnit: 'Pieces inside', piecesHint: 'Optional: 30 for a box of 30 eggs.', piecesInvalid: 'Pieces inside must be a whole number from 1 to 100 000.', perPiece: 'per piece', addCategory: 'Add category', newCategory: 'New category name', categoryHint: 'The category becomes available in the ingredient form.', addCategoryButton: 'Add', categoryAdded: 'Category added.', categoryExists: 'This category already exists.', categoryFailed: 'Could not add the category.', categoryRequired: 'Enter a category name.', allCategories: 'Categories' },
  ru: { piecesPerUnit: 'Штук внутри', piecesHint: 'Необязательно: 30 для короба из 30 яиц.', piecesInvalid: 'Количество штук должно быть целым числом от 1 до 100 000.', perPiece: 'за штуку', addCategory: 'Добавить категорию', newCategory: 'Название новой категории', categoryHint: 'Категория появится в форме ингредиента.', addCategoryButton: 'Добавить', categoryAdded: 'Категория добавлена.', categoryExists: 'Такая категория уже есть.', categoryFailed: 'Не удалось добавить категорию.', categoryRequired: 'Введите название категории.', allCategories: 'Категории' },
  uz: { piecesPerUnit: 'Ichida necha dona', piecesHint: 'Ixtiyoriy: 30 ta tuxumli quti uchun 30.', piecesInvalid: 'Dona soni 1 dan 100 000 gacha butun son bo‘lishi kerak.', perPiece: 'donasi', addCategory: 'Kategoriya qo‘shish', newCategory: 'Yangi kategoriya nomi', categoryHint: 'Kategoriya masalliq formasida paydo bo‘ladi.', addCategoryButton: 'Qo‘shish', categoryAdded: 'Kategoriya qo‘shildi.', categoryExists: 'Bu kategoriya allaqachon mavjud.', categoryFailed: 'Kategoriyani qo‘shib bo‘lmadi.', categoryRequired: 'Kategoriya nomini kiriting.', allCategories: 'Kategoriyalar' },
}

const LIST_COPY = {
  en: { namePlaceholder: 'e.g. Potatoes', pricePlaceholder: 'e.g. 12 000', nameStartInvalid: 'Name must start with a capital letter or a number.', ingredient: 'Ingredient', allCategoriesFilter: 'All categories', normalPriceShort: 'Normal price', shown: count => `${count} shown` },
  ru: { namePlaceholder: 'Например: Картофель', pricePlaceholder: 'Например: 12 000', nameStartInvalid: 'Название должно начинаться с заглавной буквы или цифры.', ingredient: 'Ингредиент', allCategoriesFilter: 'Все категории', normalPriceShort: 'Обычная цена', shown: count => `Показано: ${count}` },
  uz: { namePlaceholder: 'Masalan: Kartoshka', pricePlaceholder: 'Masalan: 12 000', nameStartInvalid: 'Nom bosh harf yoki raqam bilan boshlanishi kerak.', ingredient: 'Masalliq', allCategoriesFilter: 'Barcha kategoriyalar', normalPriceShort: 'Odatiy narx', shown: count => `${count} ta ko‘rsatilgan` },
}

// One grid for the header and rows keeps the columns aligned.

const INGREDIENT_COLUMNS = 'product_key, product_name, category, unit, normal_unit_price, pieces_per_unit, is_active, is_catalog_managed, last_purchase_date, updated_at'

function emptyIngredient() {
  return { product_key: '', product_name: '', category: 'vegetables', unit: 'kg', normal_unit_price: '', pieces_per_unit: '' }
}

function isMissingMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('normal_unit_price') || text.includes('pieces_per_unit') || text.includes('is_catalog_managed') || text.includes('save_bazaar_ingredient') || text.includes('set_bazaar_ingredient_active') || text.includes('add_bazaar_ingredient_category') || text.includes('pgrst202') || text.includes('pgrst204')
}

function savedIngredientRow(data) {
  return Array.isArray(data) ? data[0] : data
}

export default function BazaarIngredients() {
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const l = { ...(COPY[lang] || COPY.en), ...(CATEGORY_COPY[lang] || CATEGORY_COPY.en), ...(LIST_COPY[lang] || LIST_COPY.en) }
  const canManage = canEditFeature(profile || state.user, 'ingredients')
  const [ingredients, setIngredients] = useState([])
  // The ingredient open in the add/edit popup (no product_key = new); null while closed.
  const [editForm, setEditForm] = useState(null)
  // Snapshot taken when the popup opens; Save stays disabled until the draft differs from it.
  const [editOriginal, setEditOriginal] = useState(null)
  const editDialogRef = useRef(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingKey, setUpdatingKey] = useState('')
  const [error, setError] = useState('')
  const [loadFailure, setLoadFailure] = useState(null)
  const [notice, setNotice] = useState('')
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfFailed, setPdfFailed] = useState(false)
  const [customCategories, setCustomCategories] = useState([])
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState('')

  const errorMessage = useCallback((requestError, fallback) => {
    if (isMissingMigration(requestError)) return l.migrationMissing
    if (isBazaarIngredientNetworkError(requestError)) return l.connectionFailed
    return requestError?.message || fallback
  }, [l.connectionFailed, l.migrationMissing])

  const upsertIngredient = useCallback(ingredient => {
    if (!ingredient?.product_key) return
    setIngredients(current => [...current.filter(item => item.product_key !== ingredient.product_key), ingredient]
      .sort((left, right) => left.product_name.localeCompare(right.product_name)))
  }, [])

  const loadIngredients = useCallback(async () => {
    setLoading(true)
    setError('')
    setLoadFailure(null)
    try {
      const { data, error: loadError } = await supabase
        .from('bazaar_product_catalog')
        .select(INGREDIENT_COLUMNS)
        .eq('is_catalog_managed', true)
        .order('product_name')
      if (loadError) throw loadError
      setIngredients(data || [])
      // Saved categories may have no ingredients yet; before migration 214 the table is absent.
      const { data: categoryRows, error: categoryLoadError } = await supabase
        .from('bazaar_ingredient_categories')
        .select('category')
        .order('category')
      setCustomCategories(categoryLoadError ? [] : (categoryRows || []).map(row => row.category))
    } catch (loadError) {
      setLoadFailure(loadError)
    } finally {
      setLoading(false)
    }
  }, [])
  const displayedError = error || (loadFailure ? errorMessage(loadFailure, l.loadFailed) : '')

  useEffect(() => { loadIngredients() }, [loadIngredients])

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeBazaarProductKey(query)
    return ingredients.filter(item => {
      if (status === 'active' && !item.is_active) return false
      if (status === 'archived' && item.is_active) return false
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      return !normalizedQuery || normalizeBazaarProductKey(item.product_name).includes(normalizedQuery)
    })
  }, [categoryFilter, ingredients, query, status])

  const allCategories = useMemo(() => bazaarCategoriesFor([...ingredients, ...customCategories]), [customCategories, ingredients])
  const statusCounts = useMemo(() => {
    const active = ingredients.filter(item => item.is_active).length
    return { active, archived: ingredients.length - active, all: ingredients.length }
  }, [ingredients])

  async function addCategory(event) {
    event.preventDefault()
    const name = capitalizeBazaarIngredientName(categoryName.replace(/\s+/g, ' '))
    setCategoryError('')
    if (!name) { setCategoryError(l.categoryRequired); return }
    const normalizedName = name.toLocaleLowerCase()
    if (allCategories.some(category => ['uz', 'ru', 'en'].some(code => bazaarCategoryLabel(category.key, code).toLocaleLowerCase() === normalizedName))) {
      setCategoryError(l.categoryExists)
      return
    }
    setAddingCategory(true)
    try {
      // The RPC is idempotent by name, so retrying after a lost response is safe.
      const { data, error: addError } = await withWriteTimeout(supabase.rpc('add_bazaar_ingredient_category', { p_name: name }))
      if (addError) throw addError
      const saved = savedIngredientRow(data)?.category
      if (saved) {
        setCustomCategories(current => current.includes(saved) ? current : [...current, saved])
        setEditForm(current => current && !current.product_key ? { ...current, category: saved } : current)
      }
      setCategoryName('')
      setCategoryPanelOpen(false)
      setNotice(l.categoryAdded)
    } catch (addError) {
      setCategoryError(errorMessage(addError, l.categoryFailed))
    } finally {
      setAddingCategory(false)
    }
  }

  async function downloadPdf() {
    if (exportingPdf || loading || loadFailure || !filtered.length) return
    setExportingPdf(true)
    setPdfFailed(false)
    try {
      const { createIngredientsPdf } = await import('../lib/ingredientsPdf')
      const doc = await createIngredientsPdf(filtered, l, lang, { status: l[status], query })
      await doc.save('zar-kebab-ingredients.pdf', { returnPromise: true })
    } catch {
      setPdfFailed(true)
    } finally {
      setExportingPdf(false)
    }
  }

  function editIngredient(ingredient) {
    if (!canManage) return
    const draft = { ...ingredient, normal_unit_price: String(ingredient.normal_unit_price || ''), pieces_per_unit: String(ingredient.pieces_per_unit || '') }
    setEditForm(draft)
    setEditOriginal(draft)
    setError('')
    setNotice('')
  }

  function openAddDialog() {
    if (!canManage) return
    const draft = { ...emptyIngredient(), pieces_per_unit: '' }
    setEditForm(draft)
    setEditOriginal(draft)
    setError('')
    setNotice('')
  }

  function openCategoryDialog() {
    setCategoryPanelOpen(true)
    setCategoryError('')
    setCategoryName('')
  }

  function closeCategoryDialog() {
    if (addingCategory) return
    setCategoryPanelOpen(false)
    setCategoryError('')
  }

  function closeEditDialog() {
    if (saving) return
    setEditForm(null)
    setError('')
  }

  // `form` is the popup draft (new or existing ingredient); a successful save closes the popup.
  async function saveIngredient(event, form, setDraft) {
    event.preventDefault()
    if (!canManage || saving) return
    if (!form.product_name.trim() || Number(form.normal_unit_price) <= 0) {
      setError(l.required)
      return
    }
    if (!startsWithCapitalOrDigit(form.product_name)) {
      setError(l.nameStartInvalid)
      return
    }
    const piecesPerUnit = normalizeBazaarPiecesPerUnit(form.unit, form.pieces_per_unit)
    if (BAZAAR_PACKAGE_UNITS.has(form.unit) && String(form.pieces_per_unit || '').trim() && !piecesPerUnit) {
      setError(l.piecesInvalid)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        ...(form.product_key ? { product_key: form.product_key } : {}),
        product_name: capitalizeBazaarIngredientName(form.product_name),
        category: form.category,
        unit: form.unit,
        normal_unit_price: normalizeMoneyInput(form.normal_unit_price),
        pieces_per_unit: piecesPerUnit ? String(piecesPerUnit) : '',
      }
      const expectedKey = form.product_key || normalizeBazaarProductKey(payload.product_name)
      const { data: savedData, error: saveError } = await runBazaarIngredientWriteWithRecovery({
        write: () => withWriteTimeout(
          signal => supabase.rpc('save_bazaar_ingredient', { payload }).abortSignal(signal),
          'SAVE_BAZAAR_INGREDIENT',
        ),
        reconcile: async () => {
          const { data, error: reconcileError } = await supabase
            .from('bazaar_product_catalog')
            .select(INGREDIENT_COLUMNS)
            .eq('product_key', expectedKey)
            .maybeSingle()
          if (reconcileError) throw reconcileError
          return bazaarIngredientMatches(data, payload) ? data : null
        },
      })
      if (saveError) throw saveError
      upsertIngredient(savedIngredientRow(savedData))
      setDraft(null)
      setNotice(l.saved)
    } catch (saveError) {
      setError(errorMessage(saveError, l.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  async function setIngredientActive(ingredient) {
    if (!canManage || updatingKey) return
    setUpdatingKey(ingredient.product_key)
    setError('')
    setNotice('')
    try {
      const nextActive = !ingredient.is_active
      const { data: savedData, error: statusError } = await runBazaarIngredientWriteWithRecovery({
        write: () => withWriteTimeout(
          signal => supabase.rpc('set_bazaar_ingredient_active', {
            p_product_key: ingredient.product_key,
            p_is_active: nextActive,
          }).abortSignal(signal),
          'SET_BAZAAR_INGREDIENT_ACTIVE',
        ),
        reconcile: async () => {
          const { data, error: reconcileError } = await supabase
            .from('bazaar_product_catalog')
            .select(INGREDIENT_COLUMNS)
            .eq('product_key', ingredient.product_key)
            .maybeSingle()
          if (reconcileError) throw reconcileError
          return bazaarIngredientMatches(data, { is_active: nextActive }) ? data : null
        },
      })
      if (statusError) throw statusError
      upsertIngredient(savedIngredientRow(savedData))
      setNotice(l.statusUpdated)
    } catch (statusError) {
      setError(errorMessage(statusError, l.statusFailed))
    } finally {
      setUpdatingKey('')
    }
  }

  const editDialogOpen = !!editForm
  const draftFields = draft => draft && ['product_name', 'category', 'unit', 'normal_unit_price', 'pieces_per_unit']
    .map(field => String(draft[field] ?? '').trim())
    .join('\u0000')
  const editDirty = editDialogOpen && draftFields(editForm) !== draftFields(editOriginal)
  useEffect(() => {
    if (editDialogOpen) editDialogRef.current?.querySelector('input')?.focus()
  }, [editDialogOpen])

  const piecePriceHint = draft => {
    if (!BAZAAR_PACKAGE_UNITS.has(draft.unit)) return null
    const piecePrice = bazaarPricePerPiece(normalizeMoneyInput(draft.normal_unit_price), normalizeBazaarPiecesPerUnit(draft.unit, draft.pieces_per_unit))
    return piecePrice ? `${formatCurrency(Math.round(piecePrice))} ${l.perPiece}.` : l.piecesHint
  }

  // Shared fields for the add form and the edit popup.
  const renderIngredientFields = (form, setDraft) => {
    const isPackage = BAZAAR_PACKAGE_UNITS.has(form.unit)
    const nameStartInvalid = !startsWithCapitalOrDigit(form.product_name)
    return (
      <>
        <label className="ws-caption font-medium">{l.name}<input value={form.product_name} onChange={event => setDraft(current => ({ ...current, product_name: capitalizeBazaarNameInput(event.target.value) }))} autoCapitalize="sentences" maxLength={160} placeholder={l.namePlaceholder} aria-invalid={nameStartInvalid || undefined} className={`${INPUT} mt-1.5 ${nameStartInvalid ? '!border-[#c4262c]' : ''}`} />{nameStartInvalid && <span role="alert" className="mt-1 block text-[12px] text-[#c4262c]">{l.nameStartInvalid}</span>}</label>
        <div className="ws-caption font-medium">{l.category}<div className="mt-1.5"><BazaarCategoryPicker value={form.category} ingredients={ingredients} extraCategories={customCategories} onChange={category => setDraft(current => ({ ...current, category }))} lang={lang} disabled={saving} /></div></div>
        <label className="ws-caption font-medium">{l.unit}<select value={form.unit} onChange={event => setDraft(current => ({ ...current, unit: event.target.value }))} className={`${INPUT} mt-1.5`}>{BAZAAR_ENTRY_UNITS.map(unit => <option key={unit.key} value={unit.key}>{bazaarUnitLabel(unit.key, lang)}</option>)}</select></label>
        {isPackage && <label className="ws-caption font-medium" title={l.piecesHint}>{l.piecesPerUnit}<input inputMode="numeric" value={form.pieces_per_unit || ''} placeholder="30" onChange={event => setDraft(current => ({ ...current, pieces_per_unit: event.target.value.replace(/\D/g, '').slice(0, 6) }))} className={`${INPUT} mt-1.5 text-right tabular-nums`} /></label>}
        <label className="ws-caption font-medium">{l.normalPrice}<input inputMode="numeric" value={formatMoneyInput(form.normal_unit_price)} onChange={event => setDraft(current => ({ ...current, normal_unit_price: normalizeMoneyInput(event.target.value) }))} placeholder={l.pricePlaceholder} className={`${INPUT} mt-1.5 text-right tabular-nums`} /></label>
      </>
    )
  }
  const ingredientTabs = useIngredientTabs(lang)

  return (
    <AppShell
      title={ingredientTabs.title}
      tabs={ingredientTabs.tabs}
      headerActions={(
        <>
          {canManage ? (
            <>
              <button type="button" onClick={openAddDialog} aria-label={l.add} className="ws-btn ws-btn-primary !h-[38px]">
                <Plus size={16} /><span className="hidden sm:inline">{l.add}</span>
              </button>
              <button type="button" onClick={openCategoryDialog} aria-haspopup="dialog" aria-label={l.addCategory} className="ws-btn ws-btn-outline !h-[38px]">
                <Tag size={16} /><span className="hidden lg:inline">{l.addCategory}</span>
              </button>
            </>
          ) : null}
          <button type="button" onClick={downloadPdf} disabled={exportingPdf || loading || !!loadFailure || !filtered.length} title={l.pdfHint} aria-label={exportingPdf ? l.exportingPdf : l.downloadPdf} className="ws-btn ws-btn-outline !h-[38px]">
            {exportingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}<span className="hidden lg:inline">{exportingPdf ? l.exportingPdf : l.downloadPdf}</span>
          </button>
        </>
      )}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">

          {pdfFailed && <div role="alert" className="ws-notice ws-tone-negative">{l.pdfFailed}</div>}
          {displayedError && !editDialogOpen && <div role="alert" className="ws-notice ws-tone-negative">{displayedError}</div>}
          {notice && !error && <div role="status" className="ws-notice ws-tone-positive">{notice}</div>}

          {!canManage && <div className="ws-notice ws-tone-caution">{l.readOnly}</div>}

          <section className="ws-panel ws-panel-flush">
            {/* Toolbar: search, category filter and status with counts. */}
            <div className="flex flex-wrap items-center gap-3 border-b border-[#e4e1de] p-5 max-sm:p-4">
              <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={l.search} className={`${INPUT} !pl-9`} /></div>
              <div className="w-[220px] max-w-full"><BazaarCategoryPicker value={categoryFilter} ingredients={ingredients} extraCategories={customCategories} onChange={setCategoryFilter} lang={lang} allLabel={l.allCategoriesFilter} /></div>
              {!loading && <span className="ws-caption tabular-nums">{l.shown(filtered.length)}</span>}
              <div className="ws-segmented sm:ml-auto" role="group" aria-label={l.status}>{['active', 'archived', 'all'].map(key => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}>{l[key]}<span className="ml-1.5 tabular-nums text-[#68655f]">{statusCounts[key]}</span></button>)}</div>
            </div>
            {loading ? <OperationalLoading title={l.title} description="" /> : displayedError && ingredients.length === 0 ? <OperationalError title={l.loadFailed} description={displayedError} actionLabel={l.retry} onAction={loadIngredients} /> : filtered.length === 0 ? <div className="ws-empty"><PackagePlus /><p>{l.empty}</p></div> : (
              // Card grid: names, category and price read at a glance without stretching across the page.
              <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 2xl:grid-cols-4">
                {filtered.map(ingredient => (
                <div
                  key={ingredient.product_key}
                  {...(canManage ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `${l.edit}: ${ingredient.product_name}`,
                    onClick: () => editIngredient(ingredient),
                    onKeyDown: event => {
                      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
                      event.preventDefault()
                      editIngredient(ingredient)
                    },
                  } : {})}
                  className={`group flex min-w-0 flex-col rounded-xl border border-[#e4e1de] bg-white p-4 transition-shadow hover:shadow-[0_4px_14px_rgb(34_32_29/8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40 ${canManage ? 'cursor-pointer' : ''} ${ingredient.is_active ? '' : 'opacity-70'}`}
                >
                  {/* Tapping the card edits it; the only button is archive / restore in the top-right corner. */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-[#22201d]">{ingredient.product_name}</p>
                      {!ingredient.is_active && <span className="ws-status mt-1.5 inline-flex">{l.archived}</span>}
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        disabled={updatingKey === ingredient.product_key}
                        onClick={event => { event.stopPropagation(); setIngredientActive(ingredient) }}
                        aria-label={`${ingredient.is_active ? l.archive : l.restore}: ${ingredient.product_name}`}
                        title={ingredient.is_active ? l.archive : l.restore}
                        className={`ws-btn ws-btn-sm ws-btn-icon -mr-1.5 -mt-1.5 flex-shrink-0 ${ingredient.is_active ? 'ws-btn-ghost ws-btn-danger' : 'ws-btn-outline'}`}
                      >
                        {updatingKey === ingredient.product_key ? <Loader2 size={15} className="animate-spin" /> : ingredient.is_active ? <Archive size={15} /> : <RotateCcw size={15} />}
                      </button>
                    )}
                  </div>
                  <div className="mt-2"><span className="ws-badge">{bazaarCategoryLabel(ingredient.category, lang)}</span></div>
                  <div className="mt-4">
                    <p className="text-[18px] font-semibold leading-tight tabular-nums text-[#22201d]">{formatCurrency(ingredient.normal_unit_price)} <span className="text-sm font-normal text-[#68655f]">/ {bazaarUnitLabel(ingredient.unit, lang)}</span></p>
                    {ingredient.pieces_per_unit > 0 && <p className="ws-muted mt-1 tabular-nums">{ingredient.pieces_per_unit} {bazaarUnitLabel('pcs', lang)} · {formatCurrency(Math.round(bazaarPricePerPiece(ingredient.normal_unit_price, ingredient.pieces_per_unit)))} {l.perPiece}</p>}
                  </div>
                </div>
              ))}</div>
            )}
          </section>
        </div>
      </div>

      {canManage && editForm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label={l.cancel}
            onClick={closeEditDialog}
            disabled={saving}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm disabled:cursor-wait"
          />
          <form
            ref={editDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-ingredient-title"
            aria-busy={saving}
            onSubmit={event => saveIngredient(event, editForm, setEditForm)}
            onKeyDown={event => { if (event.key === 'Escape') closeEditDialog() }}
            className="ws-dialog relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="edit-ingredient-title" className="ws-display !text-[24px]">{editForm.product_key ? l.edit : l.add}</h2>
                <p className="ws-muted mt-1.5">{l.nameHint}{piecePriceHint(editForm) && <> {piecePriceHint(editForm)}</>}</p>
              </div>
              <button type="button" onClick={closeEditDialog} disabled={saving} aria-label={l.cancel} className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"><X size={16} /></button>
            </div>
            <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2 sm:[&>*:first-child]:col-span-2">
              {renderIngredientFields(editForm, setEditForm)}
            </fieldset>
            {displayedError && <p role="alert" className="ws-notice ws-tone-negative mt-4">{displayedError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeEditDialog} disabled={saving} className="ws-btn ws-btn-outline">{l.cancel}</button>
              <button type="submit" disabled={saving || !editDirty || !startsWithCapitalOrDigit(editForm.product_name)} className="ws-btn ws-btn-primary disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saving ? l.saving : l.save}</button>
            </div>
          </form>
        </div>
      )}
      {canManage && categoryPanelOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label={l.cancel}
            onClick={closeCategoryDialog}
            disabled={addingCategory}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm disabled:cursor-wait"
          />
          <form onSubmit={addCategory}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-category-title"
            aria-busy={addingCategory}
            onKeyDown={event => { if (event.key === 'Escape') closeCategoryDialog() }}
            className="ws-dialog relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><h2 id="add-category-title" className="ws-display !text-[24px]">{l.addCategory}</h2><p className="ws-muted mt-1.5">{l.categoryHint}</p></div>
              <button type="button" onClick={closeCategoryDialog} disabled={addingCategory} aria-label={l.cancel} className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"><X size={16} /></button>
            </div>
            <fieldset disabled={addingCategory}>
              <input autoFocus value={categoryName} onChange={event => setCategoryName(capitalizeBazaarNameInput(event.target.value))} autoCapitalize="sentences" maxLength={BAZAAR_CUSTOM_CATEGORY_MAX_LENGTH} placeholder={l.newCategory} aria-label={l.newCategory} aria-invalid={!!categoryError} className={`${INPUT} ${categoryError ? '!border-[#c4262c]' : ''}`} />
            </fieldset>
            {categoryError && <p role="alert" className="ws-caption mt-2 !text-[#c4262c]">{categoryError}</p>}
            <div className="mt-4">
              <p className="ws-caption mb-2 flex items-center gap-1.5 font-medium">{l.allCategories} <span className="ws-count">{allCategories.length}</span></p>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {allCategories.map(category => (
                  <span key={category.key} className={`ws-badge ${category.custom ? 'ws-tone-accent' : ''}`}>{bazaarCategoryLabel(category.key, lang)}</span>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeCategoryDialog} disabled={addingCategory} className="ws-btn ws-btn-outline">{l.cancel}</button>
              <button type="submit" disabled={addingCategory} className="ws-btn ws-btn-primary">{addingCategory ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{l.addCategoryButton}</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  )
}
