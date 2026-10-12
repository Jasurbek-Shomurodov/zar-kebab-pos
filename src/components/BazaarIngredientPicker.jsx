import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Package, Search } from 'lucide-react'
import { bazaarCategoriesFor, bazaarCategoryLabel, bazaarUnitLabel } from '../lib/bazaar'
import { formatCurrency } from '../lib/formatCurrency'

function pickerLabels(lang) {
  if (lang === 'uz') return {
    all: 'Barcha masalliqlar', search: 'Masalliq yoki kategoriya', select: 'Masalliqni tanlang', empty: 'Masalliq topilmadi', ingredients: 'masalliq', normalPrice: 'Odatiy narx',
  }
  if (lang === 'ru') return {
    all: 'Все ингредиенты', search: 'Ингредиент или категория', select: 'Выберите ингредиент', empty: 'Ингредиенты не найдены', ingredients: 'ингредиентов', normalPrice: 'Обычная цена',
  }
  return {
    all: 'All ingredients', search: 'Ingredient or category', select: 'Select an ingredient', empty: 'No ingredients found', ingredients: 'ingredients', normalPrice: 'Normal price',
  }
}

export default function BazaarIngredientPicker({
  suggestions = [],
  value = '',
  fallbackLabel = '',
  onChange,
  lang = 'en',
  disabled = false,
  invalid = false,
}) {
  const l = pickerLabels(lang)
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const selected = suggestions.find(item => item.key === value) || null

  const sections = useMemo(() => bazaarCategoriesFor(suggestions)
    .map(category => ({
      key: category.key,
      label: bazaarCategoryLabel(category.key, lang),
      items: suggestions
        .filter(item => item.category === category.key)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter(section => section.items.length > 0), [lang, suggestions])

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleSections = useMemo(() => sections
    .map(section => ({
      ...section,
      items: section.items.filter(item => (
        !normalizedSearch || `${item.name} ${section.label}`.toLocaleLowerCase().includes(normalizedSearch)
      )),
    }))
    .filter(section => section.items.length > 0), [normalizedSearch, sections])

  const visibleItems = activeCategory === 'all'
    ? visibleSections.flatMap(section => section.items)
    : (visibleSections.find(section => section.key === activeCategory)?.items || [])
  const activeSection = visibleSections.find(section => section.key === activeCategory)
  const panelTitle = activeCategory === 'all' ? l.all : (activeSection?.label || l.all)

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    if (activeCategory !== 'all' && !visibleSections.some(section => section.key === activeCategory)) {
      setActiveCategory('all')
    }
  }, [activeCategory, visibleSections])

  function selectIngredient(key) {
    onChange?.(key)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid}
        onClick={() => !disabled && setOpen(current => !current)}
        className={`flex h-11 w-full min-w-0 items-center gap-2 rounded-[10px] border px-3 text-left outline-none transition-[border-color,box-shadow] focus:border-[#ff5a00] focus:shadow-[0_0_0_3px_rgb(255_90_0/22%)] disabled:cursor-not-allowed disabled:bg-[#efece9] ${invalid ? 'border-[#c4262c] bg-[#fdf3f3]' : 'border-[#dcd9d6] bg-white'}`}
      >
        <Package size={15} className="shrink-0 text-[#68655f]" />
        <span className={`min-w-0 flex-1 truncate text-sm ${selected || fallbackLabel ? 'text-[#22201d]' : 'text-[#68655f]'}`}>
          {selected?.name || fallbackLabel || l.select}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-[#68655f] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(680px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl shadow-slate-900/20">
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                autoFocus
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={l.search}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-gray-50 pl-9 pr-3 text-sm font-semibold text-[#1F2937] outline-none transition-colors focus:border-[#ff5a00] focus:bg-white focus:ring-2 focus:ring-[#ff5a00]/15"
              />
            </div>
          </div>

          <div className="grid max-h-[440px] min-h-[280px] grid-cols-1 overflow-hidden sm:grid-cols-[230px_minmax(0,1fr)]">
            <div className="max-h-[180px] overflow-y-auto border-b border-gray-100 bg-gray-50/70 p-2 sm:max-h-[440px] sm:border-b-0 sm:border-r">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`mb-1 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left ${activeCategory === 'all' ? 'bg-[#ff5a00] text-white' : 'text-[#1F2937] hover:bg-white'}`}
              >
                <span className="truncate text-sm font-black">{l.all}</span>
                <span className={`text-[11px] font-black ${activeCategory === 'all' ? 'text-white/85' : 'text-[#9CA3AF]'}`}>{suggestions.length}</span>
              </button>
              <div className="space-y-1">
                {visibleSections.map(section => (
                  <button
                    key={section.key}
                    type="button"
                    onMouseEnter={() => setActiveCategory(section.key)}
                    onFocus={() => setActiveCategory(section.key)}
                    onClick={() => setActiveCategory(section.key)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left ${activeCategory === section.key ? 'bg-white text-[#ff5a00] shadow-sm' : 'text-[#1F2937] hover:bg-white'}`}
                  >
                    <span className="min-w-0 truncate text-sm font-bold">{section.label}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-[#6B7280]">{section.items.length}</span>
                  </button>
                ))}
              </div>
            </div>

            <div role="listbox" aria-label={panelTitle} className="max-h-[440px] overflow-y-auto p-2">
              <div className="sticky top-0 z-10 mb-1 rounded-xl bg-white/95 px-3 py-2 backdrop-blur">
                <p className="truncate text-xs font-black uppercase tracking-wide text-[#9CA3AF]">{panelTitle}</p>
                <p className="text-[10px] font-bold text-[#C3C8D0]">{visibleItems.length} {l.ingredients}</p>
              </div>
              {visibleItems.map(item => {
                const isSelected = item.key === value
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectIngredient(item.key)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-orange-50 text-[#ff5a00]' : 'text-[#1F2937] hover:bg-gray-50'}`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#ff5a00]"><Package size={16} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{item.name}</p>
                      <p className="truncate text-[11px] font-semibold text-[#9CA3AF]">{bazaarCategoryLabel(item.category, lang)} · {l.normalPrice} {formatCurrency(item.normalUnitPrice)} / {bazaarUnitLabel(item.unit, lang)}</p>
                    </div>
                    {isSelected && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#ff5a00]" />}
                  </button>
                )
              })}
              {visibleItems.length === 0 && <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm font-bold text-[#9CA3AF]">{l.empty}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
