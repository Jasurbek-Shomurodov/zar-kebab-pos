import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, Tag } from 'lucide-react'
import { bazaarCategoriesFor, bazaarCategoryLabel } from '../lib/bazaar'

function pickerLabels(lang) {
  if (lang === 'uz') return {
    search: 'Kategoriya qidirish', select: 'Kategoriyani tanlang', empty: 'Kategoriya topilmadi', categories: 'kategoriya', custom: 'Qo‘shilgan',
  }
  if (lang === 'ru') return {
    search: 'Поиск категории', select: 'Выберите категорию', empty: 'Категории не найдены', categories: 'категорий', custom: 'Добавлена',
  }
  return {
    search: 'Search categories', select: 'Select a category', empty: 'No categories found', categories: 'categories', custom: 'Added',
  }
}

// Same popover presentation as BazaarIngredientPicker, listing categories with ingredient counts.
export default function BazaarCategoryPicker({
  value = '',
  ingredients = [],
  onChange,
  lang = 'en',
  disabled = false,
  extraCategories = [],
  // Filters: an "All categories" entry (value 'all') and a label for rows without a category.
  allLabel = '',
  uncategorizedLabel = '',
}) {
  const l = pickerLabels(lang)
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const triggerRef = useRef(null)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const categories = useMemo(() => {
    const counts = new Map()
    for (const ingredient of ingredients) counts.set(ingredient.category, (counts.get(ingredient.category) || 0) + 1)
    const labelFor = key => (key === 'uncategorized' && uncategorizedLabel ? uncategorizedLabel : bazaarCategoryLabel(key, lang))
    const list = bazaarCategoriesFor([...ingredients, ...extraCategories, ...(value && value !== 'all' ? [value] : [])]).map(category => ({
      key: category.key,
      custom: Boolean(category.custom),
      label: labelFor(category.key),
      count: counts.get(category.key) || 0,
    }))
    if (uncategorizedLabel && counts.has('uncategorized')) {
      list.push({ key: 'uncategorized', custom: false, label: uncategorizedLabel, count: counts.get('uncategorized') })
    }
    return allLabel ? [{ key: 'all', custom: false, label: allLabel, count: ingredients.length }, ...list] : list
  }, [allLabel, extraCategories, ingredients, lang, uncategorizedLabel, value])
  const selectedLabel = categories.find(category => category.key === value)?.label || (value ? bazaarCategoryLabel(value, lang) : '')

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visible = categories.filter(category => !normalizedSearch || category.label.toLocaleLowerCase().includes(normalizedSearch))

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false)
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

  // Portaled and fixed, like BazaarIngredientPicker, so a scrolling dialog body cannot clip the list.
  useLayoutEffect(() => {
    if (!open) return undefined
    function place() {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(360, window.innerWidth - 16)
      const height = panelRef.current?.offsetHeight || 420
      const below = rect.bottom + 8
      const fitsBelow = below + height + 8 <= window.innerHeight
      const fitsAbove = rect.top - height - 8 >= 8
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: fitsBelow || !fitsAbove ? Math.max(8, Math.min(below, window.innerHeight - height - 8)) : rect.top - height - 8,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, normalizedSearch])

  function selectCategory(key) {
    if (!key) return
    onChange?.(key)
    setOpen(false)
    setSearch('')
  }

  function onSearchKeyDown(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (visible.length === 1) selectCategory(visible[0].key)
  }

  // Inside a dialog, Escape closes this list only: the event must not reach the dialog and discard the form.
  function closeOnPanelEscape(event) {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen(current => !current)}
        className="ws-input flex !h-11 items-center gap-2 text-left disabled:bg-[#efece9]"
      >
        <Tag size={15} className="shrink-0 text-[#68655f]" />
        <span className={`min-w-0 flex-1 truncate text-sm ${value ? 'text-[#22201d]' : 'text-[#68655f]'}`}>
          {selectedLabel || l.select}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-[#68655f] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ ...position, width: 'min(360px, calc(100vw - 16px))', maxHeight: 'calc(100dvh - 16px)' }}
          onKeyDown={closeOnPanelEscape}
          className="fixed z-picker flex flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl shadow-slate-900/20">
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                autoFocus
                value={search}
                onChange={event => setSearch(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={l.search}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-gray-50 pl-9 pr-3 text-sm font-semibold text-[#1F2937] outline-none transition-colors focus:border-[#ff5a00] focus:bg-white focus:ring-2 focus:ring-[#ff5a00]/15"
              />
            </div>
          </div>

          <div role="listbox" aria-label={l.select} className="max-h-[360px] min-h-0 flex-1 overflow-y-auto p-2">
            <div className="sticky top-0 z-10 mb-1 rounded-xl bg-white/95 px-3 py-2 backdrop-blur">
              <p className="text-xs font-medium text-[#68655f]">{visible.length} {l.categories}</p>
            </div>
            {visible.map(category => {
              const isSelected = category.key === value
              return (
                <button
                  key={category.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectCategory(category.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-[#fff1e8] text-[#bf4300]' : 'text-[#22201d] hover:bg-gray-50'}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#ff5a00]"><Tag size={15} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{category.label}</p>
                    {category.custom && <p className="text-xs font-medium text-[#68655f]">{l.custom}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#68655f]">{category.count}</span>
                  {isSelected && <Check size={15} className="shrink-0" />}
                </button>
              )
            })}
            {visible.length === 0 && <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm font-medium text-[#68655f]">{l.empty}</div>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
