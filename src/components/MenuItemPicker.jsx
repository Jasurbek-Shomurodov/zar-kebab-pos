import { formatCurrency } from '../lib/formatCurrency'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, UtensilsCrossed } from 'lucide-react'
import MenuMedia from './MenuMedia'
import { getMenuItemOptionGroups } from './MenuProductCards'
import { getCategoryName, getItemName } from '../lib/i18n'

function pickerLabels(lang) {
  if (lang === 'uz') return {
    field: 'Taom', all: 'Barcha taomlar', search: 'Taom yoki kategoriya', select: 'Taomni tanlang', uncategorized: 'Boshqa', base: 'Asosiy', empty: 'Hech narsa topilmadi',
  }
  if (lang === 'ru') return {
    field: 'Блюдо', all: 'Все блюда', search: 'Блюдо или категория', select: 'Выберите блюдо', uncategorized: 'Другое', base: 'Основной', empty: 'Ничего не найдено',
  }
  return {
    field: 'Meal', all: 'All meals', search: 'Meal or category', select: 'Select a meal', uncategorized: 'Other', base: 'Base', empty: 'Nothing found',
  }
}

export default function MenuItemPicker({
  items = [],
  categories = [],
  value = '',
  selectedOptions = {},
  onChange,
  lang = 'en',
  disabled = false,
  autoOpen = false,
}) {
  const l = pickerLabels(lang)
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const [open, setOpen] = useState(autoOpen && !disabled)
  const [panelPosition, setPanelPosition] = useState(null)
  const [search, setSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState('all')
  const [expandedItemId, setExpandedItemId] = useState('')

  const selectedItem = items.find(item => item.id === value) || null
  const selectedItemOptionGroups = selectedItem
    ? getMenuItemOptionGroups(selectedItem, lang, { includeUnavailable: true })
    : []
  const selectedOptionLabels = selectedItemOptionGroups.flatMap(group => {
    const selectedOptionId = selectedOptions?.[group.id]
    const option = group.options.find(row => row.id === selectedOptionId)
    return option ? [option.label] : []
  })
  const sections = useMemo(() => {
    const categoryMap = new Map(categories.map(category => [category.id, category]))
    const grouped = new Map()
    for (const item of items) {
      const category = categoryMap.get(item.category_id)
      const key = category?.id || '__other__'
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          label: category ? getCategoryName(category, lang) : l.uncategorized,
          sortOrder: Number(category?.sort_order || Number.MAX_SAFE_INTEGER),
          items: [],
        })
      }
      grouped.get(key).items.push(item)
    }
    return [...grouped.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  }, [categories, items, lang, l.uncategorized])

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleSections = useMemo(() => sections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (!normalizedSearch) return true
        return `${getItemName(item, lang)} ${section.label}`.toLocaleLowerCase().includes(normalizedSearch)
      }),
    }))
    .filter(section => section.items.length > 0), [lang, normalizedSearch, sections])

  const visibleItems = activeCategoryId === 'all'
    ? visibleSections.flatMap(section => section.items)
    : (visibleSections.find(section => section.id === activeCategoryId)?.items || [])
  const activeSection = visibleSections.find(section => section.id === activeCategoryId)
  const panelTitle = activeCategoryId === 'all' ? l.all : (activeSection?.label || l.all)

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  // The panel is portaled to <body> so scroll/overflow containers (e.g. the
  // rounded Tech Card component list) can never clip it. It opens below the
  // trigger, or above it when there is more room there.
  useLayoutEffect(() => {
    if (!open) {
      setPanelPosition(null)
      return undefined
    }
    if (autoOpen) rootRef.current?.scrollIntoView({ block: 'center' })
    function place() {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const gap = 8
      const margin = 12
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const width = Math.min(620, viewportWidth - 2 * margin)
      const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin))
      const spaceBelow = viewportHeight - rect.bottom - gap - margin
      const spaceAbove = rect.top - gap - margin
      const openBelow = spaceBelow >= 420 || spaceBelow >= spaceAbove
      setPanelPosition(openBelow
        ? { left, width, top: rect.bottom + gap, maxHeight: Math.min(spaceBelow, 520) }
        : { left, width, bottom: viewportHeight - rect.top + gap, maxHeight: Math.min(spaceAbove, 520) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [autoOpen, open])

  useEffect(() => {
    if (activeCategoryId !== 'all' && !visibleSections.some(section => section.id === activeCategoryId)) {
      setActiveCategoryId('all')
    }
  }, [activeCategoryId, visibleSections])

  function selectItem(itemId, nextSelectedOptions = {}) {
    onChange?.(itemId, nextSelectedOptions)
    setOpen(false)
    setSearch('')
    setExpandedItemId('')
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => !disabled && setOpen(current => !current)}
        disabled={disabled}
        aria-expanded={open}
        aria-label={l.field}
        className="ws-input flex min-w-0 items-center gap-2.5 !px-2 text-left hover:border-orange-300 disabled:bg-[#efece9]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-orange-50">
          {selectedItem ? (
            <MenuMedia
              src={selectedItem.image_url}
              alt=""
              className="h-full w-full object-cover"
              containerClassName="h-full w-full"
              fallback={<UtensilsCrossed size={13} className="text-orange-300" />}
            />
          ) : <UtensilsCrossed size={13} className="text-orange-300" />}
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${selectedItem ? 'text-[#22201d]' : 'text-[#68655f]'}`}>
          {selectedItem
            ? `${getItemName(selectedItem, lang)}${selectedOptionLabels.length ? ` · ${selectedOptionLabels.join(', ')}` : ''}`
            : l.select}
        </span>
        <ChevronDown size={15} aria-hidden="true" className={`shrink-0 text-[#68655f] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && panelPosition && createPortal(
        <div
          ref={panelRef}
          style={panelPosition}
          className="fixed z-picker flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-slate-900/20 [container-type:inline-size]"
        >
          <div className="shrink-0 border-b border-gray-100 p-3">
            <div className="relative">
              <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
              <input
                autoFocus
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={l.search}
                aria-label={l.search}
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm font-semibold outline-none transition-colors focus:border-[#ff5a00] focus:bg-white focus:ring-2 focus:ring-[#ff5a00]/15"
              />
            </div>
          </div>

          {/* Narrow panels (phones) put the categories in one scrolling row above the dishes;
              two columns start only once the panel itself is wide enough for both. */}
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden [@container_(min-width:480px)]:grid-cols-[minmax(145px,230px)_minmax(0,1fr)] [@container_(min-width:480px)]:grid-rows-1">
            <div className="flex min-h-0 min-w-0 gap-1 overflow-x-auto border-b border-gray-100 bg-gray-50/70 p-2 [@container_(min-width:480px)]:flex-col [@container_(min-width:480px)]:gap-0 [@container_(min-width:480px)]:overflow-x-visible [@container_(min-width:480px)]:border-b-0 [@container_(min-width:480px)]:border-r">
              <button
                type="button"
                onClick={() => setActiveCategoryId('all')}
                className={`flex min-h-10 shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left [@container_(min-width:480px)]:mb-1 [@container_(min-width:480px)]:w-full ${activeCategoryId === 'all' ? 'bg-[#cc4800] text-white' : 'text-gray-800 hover:bg-white'}`}
              >
                <span className="whitespace-nowrap text-sm font-semibold">{l.all}</span>
                <span className={`text-xs font-semibold tabular-nums ${activeCategoryId === 'all' ? 'text-white' : 'text-[#68655f]'}`}>{items.length}</span>
              </button>
              <div className="contents [@container_(min-width:480px)]:block [@container_(min-width:480px)]:min-h-0 [@container_(min-width:480px)]:flex-1 [@container_(min-width:480px)]:space-y-1 [@container_(min-width:480px)]:overflow-y-auto [@container_(min-width:480px)]:pr-1">
                {visibleSections.map(section => (
                  <button
                    key={section.id}
                    type="button"
                    onMouseEnter={() => setActiveCategoryId(section.id)}
                    onFocus={() => setActiveCategoryId(section.id)}
                    onClick={() => setActiveCategoryId(section.id)}
                    className={`flex min-h-10 shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left [@container_(min-width:480px)]:w-full ${activeCategoryId === section.id ? 'bg-white text-[#bf4300] shadow-sm' : 'text-gray-800 hover:bg-white'}`}
                  >
                    <span className="min-w-0 whitespace-nowrap text-sm font-semibold [@container_(min-width:480px)]:truncate">{section.label}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#68655f]">{section.items.length}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 min-w-0 overflow-y-auto p-2">
              <div className="sticky top-0 z-10 mb-1 rounded-xl bg-white/95 px-3 py-2 backdrop-blur">
                <p className="truncate text-xs font-semibold text-[#68655f]">{panelTitle}</p>
              </div>
              {visibleItems.map(item => {
                const isSelected = item.id === value
                const optionGroups = getMenuItemOptionGroups(item, lang, { includeUnavailable: true })
                const hasSelectedOption = isSelected && optionGroups.some(group => selectedOptions?.[group.id])
                return (
                  <div key={item.id} className={`group rounded-xl transition-colors ${isSelected ? 'bg-orange-50 text-[#bf4300]' : 'text-gray-800 hover:bg-gray-50'}`}>
                    <button
                      type="button"
                      onClick={() => optionGroups.length > 0
                        ? setExpandedItemId(current => current === item.id ? '' : item.id)
                        : selectItem(item.id)}
                      aria-expanded={optionGroups.length > 0 ? expandedItemId === item.id : undefined}
                      className="flex w-full items-start gap-3 px-3 py-2 text-left"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-orange-50">
                        <MenuMedia
                          src={item.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                          containerClassName="h-full w-full"
                          fallback={<div className="flex h-full w-full items-center justify-center"><UtensilsCrossed size={14} className="text-orange-200" /></div>}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{getItemName(item, lang)}</p>
                        <p className="truncate text-xs font-medium text-[#68655f]">
                          {(() => {
                            const category = categories.find(row => row.id === item.category_id)
                            return category ? getCategoryName(category, lang) : l.uncategorized
                          })()}
                        </p>
                      </div>
                      {isSelected && !hasSelectedOption && <span aria-hidden="true" className="mt-3.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#ff5a00]" />}
                    </button>
                    {optionGroups.length > 0 && (
                      <div className={`grid transition-all duration-200 group-hover:grid-rows-[1fr] group-hover:opacity-100 group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100 ${expandedItemId === item.id ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="min-h-0 overflow-hidden">
                          <div className="space-y-2 border-t border-orange-100/70 px-3 pb-2.5 pt-2">
                            {optionGroups.map((group, groupIndex) => (
                              <div key={group.id}>
                                <p className="mb-1.5 text-xs font-semibold text-[#68655f]">{group.title}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {groupIndex === 0 && (
                                    <button
                                      type="button"
                                      onClick={() => selectItem(item.id)}
                                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${isSelected && !hasSelectedOption ? 'border-[#cc4800] bg-[#cc4800] text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:text-[#bf4300]'}`}
                                    >
                                      <span>{l.base}</span>
                                      <span className={`whitespace-nowrap tabular-nums ${isSelected && !hasSelectedOption ? 'text-white' : 'text-[#68655f]'}`}>{formatCurrency(Number(item.price) || 0)}</span>
                                    </button>
                                  )}
                                  {group.options.map(option => {
                                    const optionSelected = isSelected && selectedOptions?.[group.id] === option.id
                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => selectItem(item.id, { [group.id]: option.id })}
                                        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${optionSelected ? 'border-[#cc4800] bg-[#cc4800] text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:text-[#bf4300]'}`}
                                      >
                                        <span>{option.label}</span>
                                        <span className={`whitespace-nowrap tabular-nums ${optionSelected ? 'text-white' : 'text-[#68655f]'}`}>{formatCurrency(option.price)}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {visibleItems.length === 0 && (
                <div role="status" className="flex min-h-40 items-center justify-center px-4 text-center text-sm font-medium text-[#68655f]">{l.empty}</div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
