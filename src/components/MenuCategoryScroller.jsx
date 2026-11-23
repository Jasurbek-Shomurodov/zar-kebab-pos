import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, UtensilsCrossed } from 'lucide-react'
import { getCategoryName } from '../lib/i18n'
import { getMenuCategoryScrollTarget } from '../lib/menuCategoryScroll'
import ImageLoadShimmer from './ImageLoadShimmer'

export function menuCategorySectionId(prefix, categoryId) {
  return `${prefix}-${String(categoryId).replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

const COLLAPSED_BAR_HEIGHT = 56
const COLLAPSE_SHOW_OFFSET = 61
const COLLAPSE_HIDE_OFFSET = 28
// Lux rows pad chips by 6px (py-1.5) so their glow is not clipped; the lux bar adds 4px (py-1),
// so chips line up when the row's top is 4px below the bar's top.
const LUX_SHOW_OFFSET = 4
const LUX_HIDE_OFFSET = 12
const LUX_BAR_HEIGHT = 64

function CategoryImage({ src, alt, active }) {
  return (
    <ImageLoadShimmer
      src={src}
      alt={alt}
      className="h-full w-full object-cover object-center"
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-orange-50">
          <UtensilsCrossed size={28} className={active ? 'text-[#ff4d00]' : 'text-orange-300'} />
        </div>
      }
    />
  )
}

// Admin pages share the Hoggish-style workspace look: hairline cards and one accent.
function WorkspaceCategoryCard({ category, active, title, onClick }) {
  const isAll = category.id === 'all'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-[104px] flex-shrink-0 overflow-hidden rounded-xl border bg-white text-center transition-colors md:w-[112px] xl:w-[120px] ${
        active
          ? 'border-[#ff5a00] ring-1 ring-[#ff5a00]'
          : 'border-[#e4e1de] hover:bg-[#f6f5f3]'
      }`}
    >
      <div className="aspect-square w-full overflow-hidden bg-[#efece9]">
        {isAll ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className={`grid h-11 w-11 place-items-center rounded-full ${active ? 'bg-[#fff1e8] text-[#ff5a00]' : 'bg-white text-[#68655f]'}`}>
              <LayoutGrid size={20} />
            </span>
          </div>
        ) : (
          <CategoryImage src={category.image_url} alt={title} active={active} />
        )}
      </div>
      <div className="flex min-h-[44px] items-center justify-center px-2 py-2">
        <p className={`line-clamp-2 text-[13px] font-medium leading-tight ${active ? 'text-[#ff5a00]' : 'text-[#22201d]'}`}>
          {title}
        </p>
      </div>
    </button>
  )
}

function WorkspaceCategoryChip({ category, active, title, count, onClick }) {
  const isAll = category.id === 'all'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-10 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border pl-1.5 pr-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-[#ff5a00] bg-white text-[#ff5a00]'
          : 'border-[#e4e1de] bg-white text-[#22201d] hover:bg-[#ebe8e5]'
      }`}
    >
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#efece9] text-[#68655f]">
        {isAll ? <LayoutGrid size={14} /> : category.image_url ? <CategoryImage src={category.image_url} alt={title} active={active} /> : <UtensilsCrossed size={14} />}
      </span>
      <span>{title}</span>
      {Number.isFinite(count) && <span className="ws-count">{count}</span>}
    </button>
  )
}

function LargeCategoryCard({ category, active, title, onClick }) {
  const isAll = category.id === 'all'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-[92px] w-[92px] flex-shrink-0 overflow-hidden rounded-[18px] border-2 text-center transition-all active:scale-[0.98] sm:min-w-[96px] sm:w-[96px] md:min-w-[108px] md:w-[108px] lg:min-w-[116px] lg:w-[116px] xl:min-w-[124px] xl:w-[124px] xl:rounded-[22px] ${
        active
          ? 'border-[#ff5a1f] bg-[#fff4ed] shadow-none ring-1 ring-inset ring-[#ff5a1f]/10'
          : 'border-[#E5E7EB] bg-white shadow-sm hover:border-orange-200 hover:shadow-md'
      }`}
    >
      <div className={`aspect-square w-full overflow-hidden ${
        isAll
          ? active ? 'bg-transparent' : 'bg-[#F8FAFC]'
          : active ? 'bg-[#FFE8D8]' : 'bg-[#F3F4F6]'
      }`}>
        {isAll ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl sm:h-10 sm:w-10 lg:h-11 lg:w-11 xl:h-12 xl:w-12 xl:rounded-2xl ${active ? 'bg-[#ff5a1f]/12 text-[#ff4d00]' : 'bg-white shadow-sm'}`}>
              <LayoutGrid size={20} className={active ? 'text-[#ff4d00]' : 'text-[#ff8a3d]'} />
            </div>
          </div>
        ) : (
          <CategoryImage src={category.image_url} alt={title} active={active} />
        )}
      </div>

      <div className="flex min-h-[38px] items-center justify-center px-1.5 py-1.5 sm:min-h-[48px] sm:px-2 md:min-h-[52px] lg:min-h-[54px] xl:min-h-[58px] xl:px-2.5 xl:py-2.5">
        <p className={`line-clamp-2 text-xs font-extrabold leading-tight md:text-[13px] xl:text-sm ${active ? 'text-[#ff4d00]' : 'text-[#1F2937]'}`}>
          {title}
        </p>
      </div>
    </button>
  )
}

function CategoryChip({ category, active, title, count, onClick }) {
  const isAll = category.id === 'all'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-11 w-auto min-w-fit max-w-none flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 py-1 text-sm font-black transition-all sm:min-w-[96px] sm:gap-2 sm:rounded-2xl sm:px-3 ${
        active
          ? 'border-[#ff5a1f] bg-[#fff4ed] text-[#ff4d00] shadow-sm'
          : 'border-[#E5E7EB] bg-white text-[#1F2937] hover:border-orange-200 hover:bg-orange-50/40'
      }`}
    >
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg ${active ? 'bg-[#FFE8D8]' : 'bg-[#F3F4F6]'}`}>
        {isAll ? (
          <LayoutGrid size={15} className={active ? 'text-[#ff4d00]' : 'text-[#ff8a3d]'} />
        ) : category.image_url ? (
          <CategoryImage src={category.image_url} alt={title} active={active} />
        ) : (
          <UtensilsCrossed size={15} className={active ? 'text-[#ff4d00]' : 'text-orange-300'} />
        )}
      </span>
      <span className="max-w-none flex-shrink-0 whitespace-nowrap text-xs leading-tight">{title}</span>
      {Number.isFinite(count) && (
        <span className={`flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-md px-1 text-xs font-black tabular-nums leading-none sm:h-6 sm:min-w-6 sm:rounded-lg sm:px-1.5 ${active ? 'bg-white/90 text-[#ff4d00]' : 'bg-[#E8F1FF] text-[#2563EB]'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

// Public zarkebab.uz: rounded glass pills with a small round photo (lux kit in index.css).
function LuxCategoryPill({ category, active, title, onClick }) {
  const isAll = category.id === 'all'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="lux-chip flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full pl-1.5 pr-4 text-[13px] font-medium sm:text-sm"
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-8 sm:w-8" style={{ background: 'rgb(255 255 255 / 18%)' }}>
        {isAll ? <LayoutGrid size={14} /> : category.image_url ? <CategoryImage src={category.image_url} alt="" active={active} /> : <UtensilsCrossed size={14} />}
      </span>
      {title}
    </button>
  )
}

// Animated by hand: native smooth scrollBy is ignored on the fixed lux bar in Chrome.
function animateRowScroll(row, target) {
  const from = row.scrollLeft
  const to = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, target))
  window.cancelAnimationFrame(row.__chipScrollFrame)
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    row.scrollLeft = to
    return
  }
  const start = performance.now()
  const step = now => {
    const progress = Math.min(1, (now - start) / 280)
    const eased = 1 - (1 - progress) ** 3
    row.scrollLeft = from + (to - from) * eased
    if (progress < 1) row.__chipScrollFrame = window.requestAnimationFrame(step)
  }
  row.__chipScrollFrame = window.requestAnimationFrame(step)
}

const ROW_ARROW_LABELS = {
  uz: { previous: 'Oldingi kategoriyalar', next: 'Keyingi kategoriyalar' },
  ru: { previous: 'Предыдущие категории', next: 'Следующие категории' },
  en: { previous: 'Previous categories', next: 'Next categories' },
}

/**
 * Paging arrows for a chip row. A mouse cannot swipe a horizontal row, so on desktop each side
 * that has more chips gets a button; CSS keeps them off touch screens (.lux-row-arrow).
 */
function RowArrows({ rowRef, lang, watch }) {
  const [edges, setEdges] = useState({ previous: false, next: false })
  const labels = ROW_ARROW_LABELS[lang] || ROW_ARROW_LABELS.en

  useEffect(() => {
    const row = rowRef.current
    if (!row) return undefined
    function measure() {
      const previous = row.scrollLeft > 8
      const next = row.scrollLeft + row.clientWidth < row.scrollWidth - 8
      setEdges(current => current.previous === previous && current.next === next ? current : { previous, next })
    }
    measure()
    row.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(row)
    return () => {
      row.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [rowRef, watch])

  function page(direction) {
    const row = rowRef.current
    if (row) animateRowScroll(row, row.scrollLeft + direction * row.clientWidth * 0.6)
  }

  return (
    <>
      {edges.previous && (
        <button type="button" onClick={() => page(-1)} aria-label={labels.previous} className="lux-row-arrow absolute top-1/2 z-10 h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full" style={{ left: 'max(4px, calc(50vw - 664px))' }}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
      {edges.next && (
        <button type="button" onClick={() => page(1)} aria-label={labels.next} className="lux-row-arrow absolute top-1/2 z-10 h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full" style={{ right: 'max(4px, calc(50vw - 664px))' }}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
    </>
  )
}

// Category jumps glide only when the guest has not asked for reduced motion.
function scrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function isScrollableElement(element) {
  if (!element || element === document.body || element === document.documentElement) return false
  const style = window.getComputedStyle(element)
  return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight
}

function findScrollContainer(element) {
  let current = element?.parentElement
  while (current) {
    if (isScrollableElement(current)) return current
    current = current.parentElement
  }
  return null
}

export default function MenuCategoryScroller({
  categories,
  compactMobile = false,
  activeCategoryId,
  onCategoryClick,
  onActiveCategoryChange,
  lang,
  itemCounts = {},
  sectionPrefix,
  scrollContainerRef,
  topOffset = 0,
  className = '',
  rowClassName = '',
  collapsedClassName = '',
  collapsedContentClassName = '',
  collapsedMaxWidth = null,
  collapsedHorizontalInset = 0,
  collapsedSurfaceClass = 'bg-[#FAF6EE]/95',
  collapsedPosition = 'sticky',
  scrollOffset = 84,
  variant = 'default',
  scrollArrows = false,
}) {
  const workspace = variant === 'workspace'
  const lux = variant === 'lux'
  const Card = lux ? LuxCategoryPill : workspace ? WorkspaceCategoryCard : LargeCategoryCard
  const Chip = lux ? LuxCategoryPill : workspace ? WorkspaceCategoryChip : CategoryChip
  const [collapsed, setCollapsed] = useState(false)
  const [fixedInsets, setFixedInsets] = useState(null)
  const sentinelRef = useRef(null)
  const rowRef = useRef(null)
  const collapsedRowRef = useRef(null)
  const collapsedBarRef = useRef(null)
  const activeRef = useRef(activeCategoryId)
  const pendingCategoryRef = useRef(null)
  const pendingCategoryTimerRef = useRef(null)

  useEffect(() => {
    activeRef.current = activeCategoryId
  }, [activeCategoryId])

  useEffect(() => () => {
    window.clearTimeout(pendingCategoryTimerRef.current)
  }, [])

  const cards = useMemo(() => categories || [], [categories])

  // The collapsed bar repeats every chip. While it is faded out it must not take
  // keyboard focus or be read twice by a screen reader.
  useEffect(() => {
    if (collapsedBarRef.current) collapsedBarRef.current.inert = !collapsed
  }, [collapsed])

  // Swap rows in place: the bar that takes over starts at the same horizontal position.
  // Only where both rows are actually shown (the public fixed bar): a hidden row reports
  // scrollLeft 0 and would yank the visible chips back to the start.
  useEffect(() => {
    if (!lux || collapsedPosition !== 'fixed') return
    const from = collapsed ? rowRef.current : collapsedRowRef.current
    const to = collapsed ? collapsedRowRef.current : rowRef.current
    if (from && to && from.clientWidth > 0) to.scrollLeft = from.scrollLeft
  }, [collapsed, collapsedPosition, lux])

  // Keep the active category visible: centre its chip horizontally (never scrolls the page).
  useEffect(() => {
    for (const row of [rowRef.current, collapsedRowRef.current]) {
      if (!row) continue
      const chip = [...row.querySelectorAll('button[aria-pressed="true"]')].find(button => button.offsetParent)
      if (!chip) continue
      const rowRect = row.getBoundingClientRect()
      const chipRect = chip.getBoundingClientRect()
      const delta = chipRect.left - rowRect.left - (rowRect.width - chipRect.width) / 2
      if (Math.abs(delta) > 4) animateRowScroll(row, row.scrollLeft + delta)
    }
  }, [activeCategoryId, collapsed])

  const collapsedWidthStyle = collapsedPosition === 'fixed' && fixedInsets && Number.isFinite(collapsedMaxWidth)
    ? (() => {
        const availableWidth = window.innerWidth - fixedInsets.left - fixedInsets.right
        const outerWidth = Math.min(collapsedMaxWidth, availableWidth)
        const inset = Math.min(Math.max(0, collapsedHorizontalInset), outerWidth / 2)
        const width = outerWidth - (inset * 2)
        return {
          left: fixedInsets.left + Math.max(0, (availableWidth - outerWidth) / 2) + inset,
          right: 'auto',
          width,
        }
      })()
    : null

  function titleFor(category) {
    if (category.id === 'all') {
      return lang === 'uz' ? 'Barchasi' : lang === 'ru' ? 'Все' : 'All'
    }
    return category.label || getCategoryName(category, lang)
  }

  function getScrollRoot() {
    return scrollContainerRef?.current || findScrollContainer(sentinelRef.current) || window
  }

  function getScrollElement() {
    return scrollContainerRef?.current || findScrollContainer(sentinelRef.current) || document.documentElement
  }

  function scrollToCategory(categoryId) {
    const root = getScrollRoot()
    const scroller = getScrollElement()
    const compactViewport = compactMobile && window.innerWidth < 640
    const stickyBarOffset = !compactViewport && collapsed && collapsedPosition === 'sticky'
      ? (lux ? LUX_BAR_HEIGHT : COLLAPSED_BAR_HEIGHT)
      : 0
    if (categoryId === 'all') {
      if (root === window) {
        window.scrollTo({ top: 0, behavior: scrollBehavior() })
      } else {
        scroller.scrollTo({ top: 0, behavior: scrollBehavior() })
      }
      return true
    }

    const section = document.getElementById(menuCategorySectionId(sectionPrefix, categoryId))
    if (!section) return false

    if (root === window) {
      const target = getMenuCategoryScrollTarget({
        sectionTop: section.getBoundingClientRect().top,
        rootTop: topOffset,
        scrollTop: window.scrollY,
        scrollOffset,
        stickyBarOffset,
      })
      window.scrollTo({ top: target, behavior: scrollBehavior() })
    } else {
      const rootRect = scroller.getBoundingClientRect()
      const target = getMenuCategoryScrollTarget({
        sectionTop: section.getBoundingClientRect().top,
        rootTop: rootRect.top,
        scrollTop: scroller.scrollTop,
        scrollOffset,
        stickyBarOffset,
      })
      scroller.scrollTo({ top: target, behavior: scrollBehavior() })
    }
    return true
  }

  function handleClick(category) {
    if (scrollToCategory(category.id)) {
      pendingCategoryRef.current = category.id
      window.clearTimeout(pendingCategoryTimerRef.current)
      pendingCategoryTimerRef.current = window.setTimeout(() => {
        pendingCategoryRef.current = null
      }, 180)
      activeRef.current = category.id
      onCategoryClick?.(category.id)
    }
  }

  useEffect(() => {
    const root = getScrollRoot()
    const scroller = getScrollElement()

    function updateFixedInsets() {
      if (collapsedPosition !== 'fixed' || root === window) {
        setFixedInsets(current => current === null ? current : null)
        return
      }

      const rootRect = scroller.getBoundingClientRect()
      const nextInsets = {
        top: Math.max(0, rootRect.top),
        left: Math.max(0, rootRect.left),
        right: Math.max(0, window.innerWidth - rootRect.right),
      }
      setFixedInsets(current => (
        current
        && current.top === nextInsets.top
        && current.left === nextInsets.left
        && current.right === nextInsets.right
          ? current
          : nextInsets
      ))
    }

    function handleScroll() {
      updateFixedInsets()
      const sentinel = sentinelRef.current
      if (sentinel) {
        const rect = sentinel.getBoundingClientRect()
        const rootTop = root === window ? topOffset : scroller.getBoundingClientRect().top
        setCollapsed(isCollapsed => lux && collapsedPosition === 'fixed'
          // Lux: hand over exactly when the chips reach the bar's chip line, with a small hysteresis.
          ? (isCollapsed ? rect.top <= rootTop + LUX_HIDE_OFFSET : rect.top <= rootTop + LUX_SHOW_OFFSET)
          : isCollapsed
            ? rect.bottom <= rootTop + COLLAPSE_HIDE_OFFSET
            : rect.bottom <= rootTop + COLLAPSE_SHOW_OFFSET
        )
      }

      if (!onActiveCategoryChange || !sectionPrefix) return
      const threshold = (root === window ? topOffset : scroller.getBoundingClientRect().top) + scrollOffset + 8
      const pendingCategory = pendingCategoryRef.current

      if (pendingCategory) {
        window.clearTimeout(pendingCategoryTimerRef.current)
        pendingCategoryTimerRef.current = window.setTimeout(() => {
          pendingCategoryRef.current = null
        }, 180)
        return
      }

      let nextActive = 'all'

      for (const category of cards) {
        if (category.id === 'all') continue
        const section = document.getElementById(menuCategorySectionId(sectionPrefix, category.id))
        if (!section) continue
        if (section.getBoundingClientRect().top <= threshold) {
          nextActive = category.id
        }
      }

      if (nextActive !== activeRef.current) {
        activeRef.current = nextActive
        onActiveCategoryChange(nextActive)
      }
    }

    handleScroll()
    root.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    const resizeObserver = collapsedPosition === 'fixed'
      && root !== window
      && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleScroll)
        : null
    resizeObserver?.observe(scroller)
    return () => {
      root.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      resizeObserver?.disconnect()
    }
  }, [cards, collapsedPosition, lux, onActiveCategoryChange, scrollContainerRef, scrollOffset, sectionPrefix, topOffset])

  return (
    <>
      <div
        ref={sentinelRef}
        className={`${className} ${compactMobile ? 'max-sm:sticky max-sm:top-0 max-sm:z-30 ' + (lux ? 'lux-sticky-row' : 'max-sm:bg-[#FAF6EE]') : ''}`}
        // Only the public fixed bar replaces the row; on phones the sticky row itself must stay visible.
        style={lux && collapsed && collapsedPosition === 'fixed' ? { visibility: 'hidden' } : undefined}
      >
        <div ref={rowRef} className={`flex gap-2 overflow-x-auto overflow-y-hidden pb-1 sm:gap-3 ${rowClassName}`} style={{ scrollbarWidth: 'none' }}>
          {cards.map(category => {
            const title = titleFor(category)
            return (
              <React.Fragment key={category.id}>
                {compactMobile && <div className="shrink-0 sm:hidden">
                  <Chip category={category} title={title} count={itemCounts[category.id]} active={activeCategoryId === category.id} onClick={() => handleClick(category)} />
                </div>}
                <div className={compactMobile ? 'hidden shrink-0 sm:block' : 'contents'}>
              <Card
                key={category.id}
                category={category}
                title={title}
                active={activeCategoryId === category.id}
                onClick={() => handleClick(category)}
              />
                </div>
              </React.Fragment>
            )
          })}
        </div>
        {scrollArrows && <RowArrows rowRef={rowRef} lang={lang} watch={cards.length} />}
      </div>

      <div
        ref={collapsedBarRef}
        aria-hidden={collapsed ? undefined : true}
        className={`${collapsedPosition === 'fixed' ? 'fixed left-0 right-0' : 'sticky -mx-1 overflow-hidden'} z-30 border-b ${workspace ? 'border-[#e4e1de]' : 'border-[#E5E7EB]'} ${collapsedSurfaceClass} px-1 py-1.5 backdrop-blur transition-all duration-200 ${
          collapsed ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        } ${compactMobile ? 'max-sm:hidden' : ''} ${collapsedClassName}`}
        style={{
          top: fixedInsets?.top ?? topOffset,
          ...(fixedInsets ? { left: fixedInsets.left, right: fixedInsets.right } : {}),
          ...(collapsedWidthStyle || {}),
          maxHeight: collapsedPosition === 'fixed' || collapsed ? (lux ? LUX_BAR_HEIGHT : COLLAPSED_BAR_HEIGHT) : 0,
        }}
      >
        <div ref={collapsedRowRef} className={`flex gap-2 overflow-x-auto overflow-y-hidden px-1 ${collapsedContentClassName}`} style={{ scrollbarWidth: 'none' }}>
          {cards.map(category => {
            const title = titleFor(category)
            return (
              <Chip
                key={category.id}
                category={category}
                title={title}
                count={itemCounts[category.id]}
                active={activeCategoryId === category.id}
                onClick={() => handleClick(category)}
              />
            )
          })}
        </div>
        {scrollArrows && <RowArrows rowRef={collapsedRowRef} lang={lang} watch={`${cards.length}:${collapsed}`} />}
      </div>
    </>
  )
}
