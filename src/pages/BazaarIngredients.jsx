import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Download, Edit3, Loader2, PackagePlus, Plus, RotateCcw, Save, Search, Tag, X } from 'lucide-react'
import { useIngredientTabs } from '../components/IngredientNavigation'
import BazaarCategoryPicker from '../components/BazaarCategoryPicker'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { canEditFeature } from '../lib/permissions'
import { formatCurrency } from '../lib/formatCurrency'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { withWriteTimeout } from '../lib/writeTimeout'
import { BAZAAR_CUSTOM_CATEGORY_MAX_LENGTH, BAZAAR_ENTRY_UNITS, bazaarCategoriesFor, bazaarCategoryLabel, bazaarUnitLabel, normalizeBazaarProductKey } from '../lib/bazaar'
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
  en: { addCategory: 'Add category', newCategory: 'New category name', categoryHint: 'The category becomes available in the ingredient form.', addCategoryButton: 'Add', categoryAdded: 'Category added.', categoryExists: 'This category already exists.', categoryFailed: 'Could not add the category.', categoryRequired: 'Enter a category name.', allCategories: 'Categories' },
  ru: { addCategory: 'Добавить категорию', newCategory: 'Название новой категории', categoryHint: 'Категория появится в форме ингредиента.', addCategoryButton: 'Добавить', categoryAdded: 'Категория добавлена.', categoryExists: 'Такая категория уже есть.', categoryFailed: 'Не удалось добавить категорию.', categoryRequired: 'Введите название категории.', allCategories: 'Категории' },
  uz: { addCategory: 'Kategoriya qo‘shish', newCategory: 'Yangi kategoriya nomi', categoryHint: 'Kategoriya masalliq formasida paydo bo‘ladi.', addCategoryButton: 'Qo‘shish', categoryAdded: 'Kategoriya qo‘shildi.', categoryExists: 'Bu kategoriya allaqachon mavjud.', categoryFailed: 'Kategoriyani qo‘shib bo‘lmadi.', categoryRequired: 'Kategoriya nomini kiriting.', allCategories: 'Kategoriyalar' },
}

function emptyIngredient() {
  return { product_key: '', product_name: '', category: 'vegetables', unit: 'kg', normal_unit_price: '' }
}

function isMissingMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('normal_unit_price') || text.includes('is_catalog_managed') || text.includes('save_bazaar_ingredient') || text.includes('set_bazaar_ingredient_active') || text.includes('add_bazaar_ingredient_category') || text.includes('pgrst202') || text.includes('pgrst204')
}

function savedIngredientRow(data) {
  return Array.isArray(data) ? data[0] : data
}

export default function BazaarIngredients() {
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const l = { ...(COPY[lang] || COPY.en), ...(CATEGORY_COPY[lang] || CATEGORY_COPY.en) }
  const canManage = canEditFeature(profile || state.user, 'ingredients')
  const [ingredients, setIngredients] = useState([])
  const [form, setForm] = useState(emptyIngredient)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
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
        .select('product_key, product_name, category, unit, normal_unit_price, is_active, is_catalog_managed, last_purchase_date, updated_at')
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
      return !normalizedQuery || normalizeBazaarProductKey(item.product_name).includes(normalizedQuery)
    })
  }, [ingredients, query, status])

  const allCategories = useMemo(() => bazaarCategoriesFor([...ingredients, ...customCategories]), [customCategories, ingredients])

  async function addCategory(event) {
    event.preventDefault()
    const name = categoryName.replace(/\s+/g, ' ').trim()
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
        setForm(current => ({ ...current, category: saved }))
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
    setForm({ ...ingredient, normal_unit_price: String(ingredient.normal_unit_price || '') })
    setError('')
    setNotice('')
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  async function saveIngredient(event) {
    event.preventDefault()
    if (!canManage || saving) return
    if (!form.product_name.trim() || Number(form.normal_unit_price) <= 0) {
      setError(l.required)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        ...(form.product_key ? { product_key: form.product_key } : {}),
        product_name: form.product_name.trim(),
        category: form.category,
        unit: form.unit,
        normal_unit_price: normalizeMoneyInput(form.normal_unit_price),
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
            .select('product_key, product_name, category, unit, normal_unit_price, is_active, is_catalog_managed, last_purchase_date, updated_at')
            .eq('product_key', expectedKey)
            .maybeSingle()
          if (reconcileError) throw reconcileError
          return bazaarIngredientMatches(data, payload) ? data : null
        },
      })
      if (saveError) throw saveError
      upsertIngredient(savedIngredientRow(savedData))
      setForm(emptyIngredient())
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
            .select('product_key, product_name, category, unit, normal_unit_price, is_active, is_catalog_managed, last_purchase_date, updated_at')
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

  const ingredientTabs = useIngredientTabs(lang)

  return (
    <AppShell
      title={ingredientTabs.title}
      tabs={ingredientTabs.tabs}
      headerActions={(
        <>
          {canManage && (
            <button type="button" onClick={() => { setCategoryPanelOpen(current => !current); setCategoryError('') }} aria-expanded={categoryPanelOpen} aria-label={l.addCategory} className="ws-btn ws-btn-outline !h-[38px]">
              <Tag size={16} /><span className="hidden lg:inline">{l.addCategory}</span>
            </button>
          )}
          <button type="button" onClick={downloadPdf} disabled={exportingPdf || loading || !!loadFailure || !filtered.length} title={l.pdfHint} aria-label={exportingPdf ? l.exportingPdf : l.downloadPdf} className="ws-btn ws-btn-outline !h-[38px]">
            {exportingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}<span className="hidden lg:inline">{exportingPdf ? l.exportingPdf : l.downloadPdf}</span>
          </button>
        </>
      )}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          {canManage && categoryPanelOpen && (
            <form onSubmit={addCategory} className="ws-panel">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><h2 className="ws-display">{l.addCategory}</h2><p className="ws-muted mt-1.5">{l.categoryHint}</p></div>
                <button type="button" onClick={() => setCategoryPanelOpen(false)} aria-label={l.cancel} className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"><X size={16} /></button>
              </div>
              <fieldset disabled={addingCategory} className="flex flex-col gap-2 sm:flex-row">
                <input autoFocus value={categoryName} onChange={event => setCategoryName(event.target.value)} maxLength={BAZAAR_CUSTOM_CATEGORY_MAX_LENGTH} placeholder={l.newCategory} aria-invalid={!!categoryError} className={`${INPUT} sm:max-w-sm ${categoryError ? '!border-[#c4262c]' : ''}`} />
                <button type="submit" className="ws-btn ws-btn-primary !h-11">{addingCategory ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{l.addCategoryButton}</button>
              </fieldset>
              {categoryError && <p role="alert" className="ws-caption mt-2 !text-[#c4262c]">{categoryError}</p>}
              <div className="mt-4">
                <p className="ws-caption mb-2 flex items-center gap-1.5 font-medium">{l.allCategories} <span className="ws-count">{allCategories.length}</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {allCategories.map(category => (
                    <span key={category.key} className={`ws-badge ${category.custom ? 'ws-tone-accent' : ''}`}>{bazaarCategoryLabel(category.key, lang)}</span>
                  ))}
                </div>
              </div>
            </form>
          )}

          {pdfFailed && <div role="alert" className="ws-notice ws-tone-negative">{l.pdfFailed}</div>}
          {displayedError && <div role="alert" className="ws-notice ws-tone-negative">{displayedError}</div>}
          {notice && !error && <div role="status" className="ws-notice ws-tone-positive">{notice}</div>}

          {canManage ? (
            <form onSubmit={saveIngredient} className="ws-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><h2 className="ws-display">{form.product_key ? l.edit : l.add}</h2><p className="ws-muted mt-1.5">{l.nameHint}</p></div>
                {form.product_key && <button type="button" onClick={() => setForm(emptyIngredient())} className="ws-btn ws-btn-ghost ws-btn-sm"><X size={14} />{l.cancel}</button>}
              </div>
              <fieldset disabled={saving} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(170px,1fr)_140px_minmax(190px,1fr)_auto] xl:items-end">
                <label className="ws-caption font-medium">{l.name}<input value={form.product_name} onChange={event => setForm(current => ({ ...current, product_name: event.target.value }))} maxLength={160} className={`${INPUT} mt-1.5`} /></label>
                <div className="ws-caption font-medium">{l.category}<div className="mt-1.5"><BazaarCategoryPicker value={form.category} ingredients={ingredients} extraCategories={customCategories} onChange={category => setForm(current => ({ ...current, category }))} lang={lang} disabled={saving} /></div></div>
                <label className="ws-caption font-medium">{l.unit}<select value={form.unit} onChange={event => setForm(current => ({ ...current, unit: event.target.value }))} className={`${INPUT} mt-1.5`}>{BAZAAR_ENTRY_UNITS.map(unit => <option key={unit.key} value={unit.key}>{bazaarUnitLabel(unit.key, lang)}</option>)}</select></label>
                <label className="ws-caption font-medium">{l.normalPrice}<input inputMode="numeric" value={formatMoneyInput(form.normal_unit_price)} onChange={event => setForm(current => ({ ...current, normal_unit_price: normalizeMoneyInput(event.target.value) }))} className={`${INPUT} mt-1.5 text-right tabular-nums`} /></label>
                <button type="submit" className="ws-btn ws-btn-primary !h-11">{saving ? <Loader2 size={16} className="animate-spin" /> : form.product_key ? <Save size={16} /> : <Plus size={16} />}{saving ? l.saving : l.save}</button>
              </fieldset>
            </form>
          ) : <div className="ws-notice ws-tone-caution">{l.readOnly}</div>}

          <section className="ws-panel ws-panel-flush">
            <div className="flex flex-col gap-3 border-b border-[#e4e1de] p-5 sm:flex-row sm:items-center sm:justify-between max-sm:p-4">
              <div className="relative w-full sm:max-w-sm"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={l.search} className={`${INPUT} !pl-9`} /></div>
              <div className="ws-segmented" role="group" aria-label={l.status}>{['active', 'archived', 'all'].map(key => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}>{l[key]}</button>)}</div>
            </div>
            {loading ? <OperationalLoading title={l.title} description="" /> : displayedError && ingredients.length === 0 ? <OperationalError title={l.loadFailed} description={displayedError} actionLabel={l.retry} onAction={loadIngredients} /> : filtered.length === 0 ? <div className="ws-empty"><PackagePlus /><p>{l.empty}</p></div> : (
              <div>{filtered.map(ingredient => (
                <div key={ingredient.product_key} className="ws-row grid gap-3 px-5 py-3.5 max-sm:px-4 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,0.7fr)_110px_minmax(180px,0.7fr)_auto] sm:items-center">
                  <div><p className="text-sm font-semibold text-[#22201d]">{ingredient.product_name}</p><span className={`ws-status mt-1 ${ingredient.is_active ? 'ws-tone-positive' : ''}`}>{ingredient.is_active ? l.active : l.archived}</span></div>
                  <p className="ws-muted">{bazaarCategoryLabel(ingredient.category, lang)}</p>
                  <p className="ws-muted">{bazaarUnitLabel(ingredient.unit, lang)}</p>
                  <p className="text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(ingredient.normal_unit_price)} / {bazaarUnitLabel(ingredient.unit, lang)}</p>
                  {canManage && <div className="flex justify-end gap-2"><button type="button" onClick={() => editIngredient(ingredient)} aria-label={l.edit} className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"><Edit3 size={14} /></button><button type="button" disabled={updatingKey === ingredient.product_key} onClick={() => setIngredientActive(ingredient)} className={`ws-btn ws-btn-sm ${ingredient.is_active ? 'ws-btn-ghost ws-btn-danger' : 'ws-btn-outline'}`}>{updatingKey === ingredient.product_key ? <Loader2 size={14} className="animate-spin" /> : ingredient.is_active ? <Archive size={14} /> : <RotateCcw size={14} />}{ingredient.is_active ? l.archive : l.restore}</button></div>}
                </div>
              ))}</div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
