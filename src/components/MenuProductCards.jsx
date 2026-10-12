import React, { useEffect, useState } from 'react'
import { ArrowLeft, Check, Clock3, Copy, LayoutGrid, Minus, Play, Plus, UtensilsCrossed } from 'lucide-react'
import { getCategoryName, getItemDesc, getItemName, t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'
import { getMenuOptionPricing, getSelectedMenuBasePrice } from '../lib/menuPricing'
import { getMenuItemPublicUrl } from '../lib/menuLinks'
import { getMenuItemMediaUrls, isMenuVideoUrl } from '../lib/menuMedia'
import { menuPrepTimeLabel } from '../lib/menuPrepTime'
import { calculateUnitPrice, normalizePriceMode } from '../lib/priceModes'
import {
  changeMenuQuantity,
  formatMenuQuantity,
  isMenuItemSoldByWeight,
  menuPriceUnitSuffix,
  menuQuantityStep,
  normalizeMenuQuantity,
} from '../lib/menuSaleUnits'
import MenuMedia from './MenuMedia'

function MenuImageFallback({ iconSize = 32, active = false }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-orange-50">
      <UtensilsCrossed size={iconSize} className={active ? 'text-[#ff4d00]' : 'text-orange-300'} />
    </div>
  )
}

function SafeMenuImage({
  src,
  alt,
  className = '',
  fallbackIconSize = 32,
  active = false,
  loading = 'lazy',
  fetchPriority,
  controls = false,
  autoPlay = true,
}) {
  return (
    <MenuMedia
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      controls={controls}
      autoPlay={autoPlay}
      fallback={<MenuImageFallback iconSize={fallbackIconSize} active={active} />}
    />
  )
}

function plainMenuText(text) {
  return String(text || '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\s+/g, ' ').trim()
}

function FadingMenuDescription({ text, className = '' }) {
  const value = plainMenuText(text)
  if (!value) return null

  return (
    <p
      title={value}
      className={`overflow-hidden whitespace-nowrap ${className}`}
      style={{
        WebkitMaskImage: 'linear-gradient(90deg, #000 0%, #000 calc(100% - 34px), transparent 100%)',
        maskImage: 'linear-gradient(90deg, #000 0%, #000 calc(100% - 34px), transparent 100%)',
      }}
    >
      {value}
    </p>
  )
}

function FormattedMenuText({ text, fallback }) {
  const value = String(text || fallback || '')
  return value.split('\n').map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
    return (
      <React.Fragment key={lineIndex}>
        {lineIndex > 0 && <br />}
        {parts.map((part, partIndex) => {
          const boldMatch = part.match(/^\*\*([^*]+)\*\*$/)
          return boldMatch
            ? <strong key={partIndex} className="font-black text-[#1F2937]">{boldMatch[1]}</strong>
            : <React.Fragment key={partIndex}>{part}</React.Fragment>
        })}
      </React.Fragment>
    )
  })
}

function localizedOptionText(value, lang, fallback = '') {
  if (!value || typeof value !== 'object') return fallback
  return value[`label_${lang}`] || value[`title_${lang}`] || value.label || value.title || value.name || fallback
}

export function getMenuItemOptionGroups(item, lang = 'en', { audience = 'public', includeUnavailable = false } = {}) {
  let raw = item?.option_groups ?? item?.optionGroups ?? []
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw.map((group, groupIndex) => {
    const options = Array.isArray(group?.options) ? group.options : []
    return {
      id: String(group?.id || `group_${groupIndex + 1}`),
      title: localizedOptionText(group, lang, lang === 'uz' ? 'Variantlar' : lang === 'ru' ? 'Варианты' : 'Variants'),
      required: group?.required !== false,
      configured_options_count: options.length,
      options: options.map((option, optionIndex) => {
        const publicHidden = option?.public_hidden === true || option?.publicHidden === true
        const waiterHidden = option?.waiter_hidden === true || option?.waiterHidden === true
        const audienceVisible = audience === 'waiter' ? !waiterHidden : !publicHidden
        return {
          id: String(option?.id || `option_${optionIndex + 1}`),
          label: localizedOptionText(option, lang, String(option?.label || option?.name || '')),
          price: Math.max(0, Math.round(Number(option?.price ?? option?.variant_price ?? 0) || 0)),
          price_delta: Math.max(0, Math.round(Number(option?.price_delta ?? option?.priceDelta ?? 0) || 0)),
          stock_count: Math.max(0, Math.round(Number(option?.stock_count ?? option?.stockCount ?? 0) || 0)),
          available: option?.available !== false && audienceVisible,
          public_hidden: publicHidden,
          waiter_hidden: waiterHidden,
        }
      }).filter(option => option.label && (includeUnavailable || option.available)),
    }
  }).filter(group => group.configured_options_count > 0)
}

export function menuItemRequiresOptions(item, audience = 'public') {
  return getMenuItemOptionGroups(item, 'en', { audience }).some(group => group.required)
}

export function getOrderItemOptionLines(item, menuItem, lang = 'en') {
  const selectedOptions = item?.selected_options || item?.selectedOptions || {}
  const groups = getMenuItemOptionGroups(menuItem || item, lang, { includeUnavailable: true })
  const lines = selectedOptions && typeof selectedOptions === 'object'
    ? groups.map(group => {
        const selectedId = selectedOptions[group.id]
        const option = group.options.find(row => row.id === selectedId)
        return option?.label || ''
      }).filter(Boolean)
    : []

  if (lines.length > 0) return lines

  const notes = String(item?.notes || '')
  const noteMatches = [...notes.matchAll(/(?:Variants|Варианты|Variantlar)\s*:\s*([^:\n]+?)(?=(?:Variants|Варианты|Variantlar)\s*:|$|\n)/g)]
    .map(match => match[1].trim())
    .filter(Boolean)
  if (noteMatches.length > 0) return noteMatches

  const parentName = menuItem ? getItemName(menuItem, lang) : ''
  const rowName = String(item?.name || '').trim()
  const translatedNames = menuItem ? [menuItem.name_uz, menuItem.name_ru, menuItem.name_en]
    .map(normalizeComparableText)
    .filter(Boolean) : []
  if (translatedNames.includes(normalizeComparableText(rowName))) return []
  if (parentName && rowName && rowName !== parentName) return [rowName]

  return []
}

function normalizeComparableText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

export function getManualOrderNotes(item, menuItem, lang = 'en') {
  const notes = String(item?.notes || '')
  if (!notes) return ''
  const optionSet = new Set(getOrderItemOptionLines(item, menuItem, lang))
  return notes
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return false
      const optionText = trimmed.includes(':') ? trimmed.split(':').slice(1).join(':').trim() : trimmed
      return !optionSet.has(optionText)
    })
    .join('\n')
}

function optionNoteLine(groups, selectedOptions) {
  return groups.map(group => {
    const selectedId = selectedOptions[group.id]
    const option = group.options.find(item => item.id === selectedId)
    return option ? `${group.title}: ${option.label}` : ''
  }).filter(Boolean).join('\n')
}

async function copyTextToClipboard(text) {
  if (globalThis.navigator?.clipboard?.writeText) {
    try {
      await globalThis.navigator.clipboard.writeText(text)
      return
    } catch {
      // Some embedded browsers expose clipboard APIs but reject writes.
    }
  }
  const textarea = globalThis.document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  globalThis.document.body.appendChild(textarea)
  textarea.select()
  globalThis.document.execCommand('copy')
  globalThis.document.body.removeChild(textarea)
}

export function CategoryCard({ cat, active, onClick, lang, eager = false }) {
  const isAll = cat.id === 'all'
  const title = isAll
    ? (lang === 'uz' ? 'Barchasi' : lang === 'ru' ? 'Все' : 'All')
    : getCategoryName(cat, lang)

  return (
    <button
      onClick={onClick}
      className={`min-w-[124px] w-[124px] flex-shrink-0 overflow-hidden rounded-[20px] border-2 text-left transition-all active:scale-[0.98] ${
        active
          ? 'border-[#ff5a1f] bg-[#fff4ed] shadow-[0_8px_18px_rgba(255,90,31,0.16)]'
          : 'border-[#E5E7EB] bg-white shadow-sm hover:border-orange-200 hover:shadow-md'
      }`}
    >
      <div className={`aspect-square w-full overflow-hidden ${active ? 'bg-[#FFE8D8]' : 'bg-[#F3F4F6]'}`}>
        {isAll ? (
          <div className="h-full w-full flex items-center justify-center">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${active ? 'bg-[#ff5a1f]/15' : 'bg-white shadow-sm'}`}>
              <LayoutGrid size={24} className={active ? 'text-[#ff4d00]' : 'text-[#ff8a3d]'} />
            </div>
          </div>
        ) : cat.image_url ? (
          <SafeMenuImage
            src={cat.image_url}
            alt={title}
            className="h-full w-full object-cover object-center"
            fallbackIconSize={28}
            active={active}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : undefined}
          />
        ) : (
          <MenuImageFallback iconSize={28} active={active} />
        )}
      </div>

      <div className="min-h-[58px] px-2.5 py-2.5 text-center flex items-center justify-center">
        <p className={`line-clamp-2 text-sm font-extrabold leading-tight ${active ? 'text-[#ff4d00]' : 'text-[#1F2937]'}`}>
          {title}
        </p>
      </div>
    </button>
  )
}

export function ProductCard({ item, qty, onAdd, onIncrement, onDecrement, onOpenDetail, lang, readOnly = false, eager = false, formatPrice = formatCurrency, linkBasePath = '/menu', density = 'comfortable', compactMobileGrid = false, audience = readOnly ? 'public' : 'waiter' }) {
  const inCart = !readOnly && qty > 0
  const unavailable = !readOnly && item?.available === false
  const [copied, setCopied] = useState(false)
  const kcal = kcalLabel(item, lang)
  const grams = gramsLabel(item, lang)
  const millilitres = millilitresLabel(item, lang)
  const pricing = getMenuOptionPricing(item, getMenuItemOptionGroups(item, lang, { audience }))
  const priceUnit = menuPriceUnitSuffix(item, lang)
  const prepTime = menuPrepTimeLabel(item, lang)
  const hasVideo = isMenuVideoUrl(item.image_url)
  const showCompactPublicCard = readOnly
  const dense = !readOnly && density === 'compact'
  const labels = {
    copy: lang === 'uz' ? 'Havolani nusxalash' : lang === 'ru' ? 'Скопировать ссылку' : 'Copy link',
    copied: lang === 'uz' ? 'Nusxalandi' : lang === 'ru' ? 'Скопировано' : 'Copied',
    unavailable: lang === 'uz' ? 'Mavjud emas' : lang === 'ru' ? 'Недоступно' : 'Unavailable',
  }

  async function copyProductLink(event) {
    event.stopPropagation()
    await copyTextToClipboard(getMenuItemPublicUrl(item, globalThis.location?.origin, linkBasePath))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  function cartAnimationPayload(event) {
    const card = event.currentTarget.closest('[data-menu-product-card]')
    const source = card?.querySelector('[data-menu-product-image]') || event.currentTarget
    const rect = source.getBoundingClientRect()
    return {
      sourceRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      imageUrl: hasVideo ? '' : item.image_url || '',
      name: getItemName(item, lang),
    }
  }

  return (
    <>
    {compactMobileGrid && !readOnly && (
      <div data-menu-product-card className={`flex h-full flex-col gap-1 rounded-xl border bg-white p-2 sm:hidden ${inCart ? 'border-orange-300' : 'border-[#E5E7EB]'}`}>
        <button type="button" onClick={() => onOpenDetail(item)} className="flex w-full min-w-0 items-center gap-2 text-left">
          <span data-menu-product-image className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-orange-50">
            <SafeMenuImage src={item.image_url} alt="" className="h-full w-full object-cover" loading={eager ? 'eager' : 'lazy'} fallbackIconSize={24} />
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 text-[13px] font-bold leading-tight text-[#1F2937]">{getItemName(item, lang)}</span>

          </span>
        </button>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-1">
          <div className="min-w-[70px] flex-1">
            {pricing.discounted && <span className="block text-[10px] text-gray-400 line-through">{formatPrice(pricing.oldPrice)}</span>}
            <span className="mt-1 block text-[12px] font-black leading-tight text-[#ff5a00]">
              {formatPrice(pricing.price)}{pricing.maxPrice > pricing.price ? ` – ${formatPrice(pricing.maxPrice)}` : ''}{priceUnit}
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center">
          {inCart && <>
            <button type="button" aria-label={`${lang === 'ru' ? 'Уменьшить' : lang === 'uz' ? 'Kamaytirish' : 'Decrease'}: ${getItemName(item, lang)}`} onClick={() => onDecrement(item)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-50 text-gray-600"><Minus size={18} /></button>
            <span className="min-w-5 text-center text-sm font-black text-[#ff5a00]">{formatMenuQuantity(qty, item)}</span>
          </>}
          <button type="button" disabled={unavailable} aria-label={`${unavailable ? labels.unavailable : lang === 'ru' ? 'Добавить' : lang === 'uz' ? "Qo'shish" : 'Add'}: ${getItemName(item, lang)}`} onClick={e => inCart ? onIncrement(item, cartAnimationPayload(e)) : onAdd(item, cartAnimationPayload(e))} className="flex h-11 w-16 max-[359px]:w-14 items-center justify-center rounded-lg bg-orange-50 text-[#ff5a00] disabled:opacity-40"><Plus size={20} /></button>
          </div>
        </div>
      </div>
    )}
    <div
      data-menu-product-card
      onClick={() => onOpenDetail(item)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpenDetail(item)}
      className={`group flex h-full flex-col ${compactMobileGrid && !readOnly ? 'max-sm:hidden' : ''} overflow-hidden transition-all cursor-pointer select-none ${
        unavailable
          ? 'rounded-[18px] border-2 border-[#D1D5DB] bg-[#F3F4F6] shadow-none'
          : inCart
          ? 'rounded-[18px] border-2 border-[#ff5a00]/40 bg-white shadow-md shadow-orange-100/60'
          : showCompactPublicCard
            ? 'rounded-[16px] border border-[#E6EAF0] bg-white shadow-sm hover:-translate-y-0.5 hover:border-[#D8DEE8] hover:shadow-md sm:rounded-[18px]'
            : 'rounded-[18px] border-2 border-[#E5E7EB] bg-white shadow-sm hover:shadow-md hover:border-gray-200'
      }`}
    >
      <div data-menu-product-image className={`relative aspect-square w-full flex-shrink-0 overflow-hidden bg-orange-50 ${showCompactPublicCard ? 'rounded-b-[14px]' : ''}`}>
        <SafeMenuImage
          src={item.image_url}
          alt={getItemName(item, lang)}
          className={`h-full w-full object-cover object-center transition-all duration-300 ${unavailable ? 'grayscale opacity-55' : 'group-hover:scale-[1.02]'}`}
          fallbackIconSize={34}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
        />
        {hasVideo && (
          <span className="pointer-events-none absolute left-2 top-2 inline-flex h-8 items-center gap-1 rounded-full border border-white/80 bg-black/55 px-2.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm backdrop-blur">
            <Play size={12} fill="currentColor" />
            Video
          </span>
        )}
        {unavailable && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full border border-white/80 bg-[#4B5563]/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-sm backdrop-blur">
            {labels.unavailable}
          </span>
        )}
        {inCart && (
          <div className="absolute top-2 right-2 bg-[#ff5a00] text-white text-[11px] font-black rounded-full w-6 h-6 flex items-center justify-center shadow">
            {formatMenuQuantity(qty, item)}
          </div>
        )}
        {readOnly && (
          <button
            type="button"
            onClick={copyProductLink}
            title={copied ? labels.copied : labels.copy}
            aria-label={copied ? labels.copied : labels.copy}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/95 text-[#5B6472] shadow-sm backdrop-blur transition-colors hover:bg-[#fff4ed] hover:text-[#ff5a00] sm:right-2 sm:top-2 sm:h-8 sm:w-8"
          >
            {copied ? <Check size={16} /> : <Copy size={15} />}
          </button>
        )}
      </div>

      <div className={`${showCompactPublicCard ? 'p-2.5 pt-2 sm:p-3 sm:pt-2.5' : dense ? 'p-2.5' : 'p-3'} flex flex-col flex-1`}>
        <h3 className={`${showCompactPublicCard ? 'text-[13px] sm:text-[15px]' : dense ? 'text-[14px] mb-0.5 flex-1' : 'text-[15px] mb-1 flex-1'} font-bold ${unavailable ? 'text-[#6B7280]' : 'text-[#1F2937]'} line-clamp-2 leading-snug`}>
          {getItemName(item, lang)}
        </h3>
        <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-200">
          <Clock3 size={12} /> {prepTime}
        </span>
        {showCompactPublicCard && getItemDesc(item, lang) && (
          <FadingMenuDescription text={getItemDesc(item, lang)} className="mt-0.5 min-h-[15px] text-[11px] leading-snug text-[#8A94A6] sm:min-h-[16px] sm:text-[12px]" />
        )}
        {!showCompactPublicCard && getItemDesc(item, lang) && (
          <FadingMenuDescription text={getItemDesc(item, lang)} className={`${dense ? 'text-[11px] mb-1' : 'text-[12px] mb-1.5'} text-[#9CA3AF]`} />
        )}
        <div className={`${showCompactPublicCard ? 'mt-auto mb-0 items-end pt-2' : dense ? 'mt-auto mb-2 items-start pt-1' : 'mt-auto mb-2.5 items-start pt-1'} flex justify-between gap-2`}>
          <div className="min-w-0">
            {pricing.discounted && (
              <p className={`${showCompactPublicCard ? 'text-[13px]' : 'text-[12px]'} font-bold text-[#9CA3AF] line-through`}>{formatPrice(pricing.oldPrice)}</p>
            )}
            <p className={`${unavailable ? 'text-[#6B7280]' : pricing.discounted ? 'text-red-600' : 'text-[#ff5a00]'} ${showCompactPublicCard ? 'text-[15px] sm:text-[19px]' : dense ? 'text-[15px]' : 'text-[16px]'} font-black tracking-tight`}>
              {formatPrice(pricing.price)}{pricing.maxPrice > pricing.price ? ` – ${formatPrice(pricing.maxPrice)}` : ''}{priceUnit}
            </p>
          </div>
          {!showCompactPublicCard && (grams || millilitres || kcal) && (
            <div className="flex flex-wrap justify-end gap-1">
              {grams && (
                <span className={`rounded-full bg-[#F8FAFC] ${dense ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} font-black text-[#64748B] ring-1 ring-[#E5E7EB]`}>
                  {grams}
                </span>
              )}
              {millilitres && (
                <span className={`rounded-full bg-[#F8FAFC] ${dense ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} font-black text-[#64748B] ring-1 ring-[#E5E7EB]`}>
                  {millilitres}
                </span>
              )}
              {kcal && (
                <span className={`rounded-full bg-[#F8FAFC] ${dense ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} font-black text-[#64748B] ring-1 ring-[#E5E7EB]`}>
                  {kcal}
                </span>
              )}
            </div>
          )}
        </div>

        {readOnly ? null : inCart ? (
          <div
            onClick={e => e.stopPropagation()}
            className={`flex items-center justify-between rounded-xl border px-2 py-1 ${unavailable ? 'border-[#D1D5DB] bg-[#E5E7EB]' : 'border-[#ff5a00]/20 bg-[#fff1e8]'}`}
          >
            <button
              onClick={e => { e.stopPropagation(); onDecrement(item) }}
              className="w-9 h-9 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center hover:bg-red-50 hover:border-red-200 active:scale-90 transition-all shadow-sm"
            >
              <Minus size={14} className="text-[#6B7280]" />
            </button>
            <span className={`min-w-[24px] text-center text-[18px] font-black ${unavailable ? 'text-[#6B7280]' : 'text-[#ff5a00]'}`}>{formatMenuQuantity(qty, item)}</span>
            <button
              onClick={e => { e.stopPropagation(); onIncrement(item, cartAnimationPayload(e)) }}
              disabled={unavailable}
              className="w-9 h-9 rounded-xl bg-[#ff5a00] flex items-center justify-center hover:bg-[#cc4800] active:scale-90 transition-all shadow-sm disabled:cursor-not-allowed disabled:bg-[#9CA3AF] disabled:shadow-none"
            >
              <Plus size={14} className="text-white" />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onAdd(item, cartAnimationPayload(e)) }}
            disabled={unavailable}
            className="w-full rounded-xl bg-[#fff1e8] text-[#ff5a00] border border-[#ff5a00]/20 text-[13px] font-bold hover:bg-[#ff5a00] hover:text-white active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:border-[#D1D5DB] disabled:bg-[#E5E7EB] disabled:text-[#6B7280]"
            style={{ height: dense ? '34px' : '40px' }}
          >
            {!unavailable && <Plus size={14} />}
            {unavailable ? labels.unavailable : lang === 'uz' ? "Qo'shish" : lang === 'ru' ? 'Добавить' : 'Add'}
          </button>
        )}
      </div>
    </div>
    </>
  )
}

function splitCurrency(text) {
  const match = String(text).match(/^(.*?)(\s*(?:UZS|USD|EUR|so'm|сум))$/i)
  return match ? [match[1], match[2]] : [String(text), '']
}

function EditorialPrice({ amount, formatPrice, className = '' }) {
  const [value, currency] = splitCurrency(formatPrice(amount))
  return (
    <span className={`whitespace-nowrap tabular-nums ${className}`}>
      {value}{currency && <span className="ml-0.5 text-[0.72em] font-normal tracking-wide text-[#8C8277]">{currency}</span>}
    </span>
  )
}

/** Public zarkebab.uz dish card: borderless photo, serif name, quiet price. Staff screens keep ProductCard. */
export function PublicDishCard({ item, onOpenDetail, lang, eager = false, formatPrice = formatCurrency, linkBasePath = '/menu' }) {
  const [copied, setCopied] = useState(false)
  const pricing = getMenuOptionPricing(item, getMenuItemOptionGroups(item, lang, { audience: 'public' }))
  const priceUnit = menuPriceUnitSuffix(item, lang)
  const name = getItemName(item, lang)
  const description = plainMenuText(getItemDesc(item, lang))
  const discountPct = pricing.discounted && pricing.oldPrice > 0
    ? Math.round((1 - pricing.price / pricing.oldPrice) * 100)
    : 0
  const copyLabel = copied
    ? (lang === 'uz' ? 'Nusxalandi' : lang === 'ru' ? 'Скопировано' : 'Copied')
    : (lang === 'uz' ? 'Havolani nusxalash' : lang === 'ru' ? 'Скопировать ссылку' : 'Copy link')

  async function copyProductLink(event) {
    event.stopPropagation()
    await copyTextToClipboard(getMenuItemPublicUrl(item, globalThis.location?.origin, linkBasePath))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <article
      data-menu-product-card
      onClick={() => onOpenDetail(item)}
      role="button"
      tabIndex={0}
      onKeyDown={event => event.key === 'Enter' && onOpenDetail(item)}
      className="group flex h-full cursor-pointer select-none flex-col rounded-[22px] outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40 focus-visible:ring-offset-4"
    >
      <div data-menu-product-image className="relative aspect-square w-full overflow-hidden rounded-[18px] bg-[#EFE7DC] sm:rounded-[22px]">
        <SafeMenuImage
          src={item.image_url}
          alt={name}
          className="h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.05]"
          fallbackIconSize={34}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        {discountPct > 0 && (
          <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-[#ff5a00] px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shadow-sm sm:left-3 sm:top-3">
            −{discountPct}%
          </span>
        )}
        <button
          type="button"
          onClick={copyProductLink}
          title={copyLabel}
          aria-label={copyLabel}
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition-opacity hover:bg-black/55 sm:right-3 sm:top-3 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          {copied ? <Check size={15} /> : <Copy size={14} />}
        </button>
      </div>

      <div className="flex flex-1 flex-col px-0.5 pt-3 sm:pt-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <h3 className="zk-serif line-clamp-2 text-[19px] font-semibold leading-[1.1] text-[#1F1A15] sm:text-[23px]">{name}</h3>
          <p className="flex flex-shrink-0 items-baseline gap-2 text-[14px] font-medium text-[#1F1A15] sm:text-[15px]">
            {pricing.discounted && (
              <EditorialPrice amount={pricing.oldPrice} formatPrice={formatPrice} className="text-[12px] font-normal text-[#A39A8F] line-through" />
            )}
            <span className={pricing.discounted ? 'text-[#ff5a00]' : ''}>
              <EditorialPrice amount={pricing.price} formatPrice={formatPrice} />
              {pricing.maxPrice > pricing.price && <> – <EditorialPrice amount={pricing.maxPrice} formatPrice={formatPrice} /></>}
              {priceUnit && <span className="text-[0.8em] text-[#8C8277]">{priceUnit}</span>}
            </span>
          </p>
        </div>
        {description && (
          <p className="mt-1.5 line-clamp-1 text-[13px] font-light leading-snug text-[#857B70]">{description}</p>
        )}
      </div>
    </article>
  )
}

export function ProductDetailPage({ item, category, currentQty, currentNotes, lang, onBack, onCancel, onAddToCart, readOnly = false, formatPrice = formatCurrency, linkBasePath = '/menu', languageControl = null, audience = 'public' }) {
  const [qty, setQty] = useState(normalizeMenuQuantity(currentQty, item))
  const [notes, setNotes] = useState(currentNotes || '')
  const [selectedOptions, setSelectedOptions] = useState({})
  const [copied, setCopied] = useState(false)
  const [activeMediaUrl, setActiveMediaUrl] = useState('')

  useEffect(() => {
    setQty(normalizeMenuQuantity(currentQty, item))
    setNotes(currentNotes || '')
    setSelectedOptions({})
    setActiveMediaUrl(getMenuItemMediaUrls(item)[0] || '')
  }, [item?.id, item?.image_url, item?.media_urls, currentQty, currentNotes])

  if (!item) return null

  const name = getItemName(item, lang)
  const desc = getItemDesc(item, lang)
  const kcal = kcalLabel(item, lang)
  const grams = gramsLabel(item, lang)
  const millilitres = millilitresLabel(item, lang)
  const soldByWeight = isMenuItemSoldByWeight(item)
  const priceUnit = menuPriceUnitSuffix(item, lang)
  const prepTime = menuPrepTimeLabel(item, lang)
  const mediaUrls = getMenuItemMediaUrls(item)
  const unavailable = !readOnly && item?.available === false
  const displayedMediaUrl = mediaUrls.includes(activeMediaUrl) ? activeMediaUrl : mediaUrls[0] || ''
  const optionGroups = getMenuItemOptionGroups(item, lang, { audience })
  const missingRequiredOptions = optionGroups.some(group => (
    group.required && !group.options.some(option => option.id === selectedOptions[group.id])
  ))
  const itemPriceMode = normalizePriceMode(item.price_mode || item.priceMode)
  const selectedOptionBasePrice = getSelectedMenuBasePrice(item, optionGroups, selectedOptions)
  const pricing = getMenuOptionPricing(item, optionGroups, Object.keys(selectedOptions).length ? selectedOptions : null)
  const selectedOptionFullPrice = calculateUnitPrice(selectedOptionBasePrice, itemPriceMode)
  const optionNotes = optionNoteLine(optionGroups, selectedOptions)
  const finalNotes = [optionNotes, notes.trim()].filter(Boolean).join('\n')
  const labels = {
    back: lang === 'uz' ? 'Menyuga qaytish' : lang === 'ru' ? 'Назад в меню' : 'Back to menu',
    description: lang === 'uz' ? 'Tavsif' : lang === 'ru' ? 'Описание' : 'Description',
    noDescription: lang === 'uz' ? 'Tavsif qo‘shilmagan.' : lang === 'ru' ? 'Описание не добавлено.' : 'No description added.',
    quantity: soldByWeight ? (lang === 'uz' ? 'Og‘irligi (kg)' : lang === 'ru' ? 'Вес (кг)' : 'Weight (kg)') : (lang === 'uz' ? 'Miqdor' : lang === 'ru' ? 'Количество' : 'Quantity'),
    quantitySub: soldByWeight
      ? (lang === 'uz' ? 'Kerakli vaznni kiriting' : lang === 'ru' ? 'Укажите нужный вес' : 'Enter the required weight')
      : (lang === 'uz' ? 'Porsiyalar sonini tanlang' : lang === 'ru' ? 'Выберите количество порций' : 'Choose how many portions'),
    notes: lang === 'uz' ? 'Maxsus izohlar' : lang === 'ru' ? 'Особые заметки' : 'Special notes',
    notesSub: lang === 'uz' ? 'Buyurtma uchun ixtiyoriy ko‘rsatma' : lang === 'ru' ? 'Дополнительная инструкция к заказу' : 'Optional order instruction',
    notesPlaceholder: lang === 'uz' ? 'Masalan: piyozsiz, yaxshi pishiring...' : lang === 'ru' ? 'Например: без лука, хорошо прожарить...' : 'For example: no onion, well done...',
    cancel: lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel',
    add: lang === 'uz' ? "Savatga qo'shish" : lang === 'ru' ? 'Добавить в корзину' : 'Add to Cart',
    copy: lang === 'uz' ? 'Havolani nusxalash' : lang === 'ru' ? 'Скопировать ссылку' : 'Copy link',
    copied: lang === 'uz' ? 'Nusxalandi' : lang === 'ru' ? 'Скопировано' : 'Copied',
    unavailable: lang === 'uz' ? 'Mavjud emas' : lang === 'ru' ? 'Недоступно' : 'Unavailable',
    unavailableSub: lang === 'uz'
      ? 'Bu taomni hozir buyurtmaga qo‘shib bo‘lmaydi.'
      : lang === 'ru'
        ? 'Это блюдо сейчас нельзя добавить в заказ.'
        : 'This meal cannot be added to an order right now.',
  }
  const optionSectionTitle = lang === 'uz' ? 'Variantlar' : lang === 'ru' ? 'Варианты' : 'Options'
  const noAvailableOptions = lang === 'uz'
    ? 'Hozircha mavjud variant yo‘q.'
    : lang === 'ru'
      ? 'Сейчас нет доступных вариантов.'
      : 'No variants are currently available.'
  const shouldShowOptionSectionTitle = optionGroups.length !== 1 ||
    String(optionGroups[0]?.title || '').trim().toLocaleLowerCase() !== optionSectionTitle.toLocaleLowerCase()

  const total = selectedOptionFullPrice * qty

  async function copyProductLink() {
    await copyTextToClipboard(getMenuItemPublicUrl(item, globalThis.location?.origin, linkBasePath))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className={`flex h-full flex-col ${readOnly ? 'bg-white' : 'bg-[#FAF6EE]'}`}>
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[#E5E7EB] bg-white px-5 py-3 shadow-sm">
        <button
          onClick={onBack}
          className="w-11 h-11 rounded-2xl border border-[#E5E7EB] bg-white text-[#64748B] flex items-center justify-center hover:bg-[#F8FAFC] hover:text-[#0F3B2E] active:scale-95 transition-all shadow-sm"
          aria-label={labels.back}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className={`truncate text-xl font-black uppercase tracking-tight ${unavailable ? 'text-[#6B7280]' : 'text-[#111827]'}`}>{name}</h1>
          {category && (
            <p className="mt-0.5 text-xs font-black uppercase tracking-wider text-[#FF4D00]">
              {getCategoryName(category, lang)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {(languageControl || readOnly) && (
            <div className="mb-1 flex items-center justify-end gap-2">
              {languageControl}
              {readOnly && (
                <button
                  type="button"
                  onClick={copyProductLink}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[12px] font-black text-[#1F2937] shadow-sm transition-colors hover:border-orange-200 hover:bg-[#fff4ed] hover:text-[#ff5a00]"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span className="hidden sm:inline">{copied ? labels.copied : labels.copy}</span>
                </button>
              )}
            </div>
          )}
          {pricing.discounted && (
            <p className="whitespace-nowrap text-sm font-bold text-[#9CA3AF] line-through tabular-nums">
              {formatPrice(pricing.oldPrice)}
            </p>
          )}
          <p className={`text-xl sm:text-2xl font-black tabular-nums ${unavailable ? 'text-[#6B7280]' : pricing.discounted ? 'text-red-600' : 'text-[#FF4D00]'}`}>
            {formatPrice(pricing.price)}{pricing.maxPrice > pricing.price ? ` – ${formatPrice(pricing.maxPrice)}` : ''}{priceUnit}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-200">
            <Clock3 size={12} /> {prepTime}
          </span>
          {(grams || millilitres || kcal) && (
            <div className="flex flex-wrap justify-end gap-1">
              {grams && (
                <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                  {grams}
                </span>
              )}
              {millilitres && (
                <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                  {millilitres}
                </span>
              )}
              {kcal && (
                <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                  {kcal}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 ${readOnly ? 'pb-6' : 'pb-28'}`}>
        <div className="mx-auto w-full max-w-[1120px]">
          <section className="grid gap-5 rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm md:grid-cols-[minmax(320px,0.9fr)_minmax(360px,1.1fr)] md:p-5 lg:gap-6">
            <div className="min-w-0">
              <div className="relative aspect-square w-full overflow-hidden rounded-[22px] bg-orange-50 md:max-h-[520px]">
                <SafeMenuImage
                  src={displayedMediaUrl}
                  alt={name}
                  className={`h-full w-full object-cover object-center ${unavailable ? 'grayscale opacity-55' : ''}`}
                  fallbackIconSize={64}
                  controls={isMenuVideoUrl(displayedMediaUrl)}
                />
              </div>
              {mediaUrls.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="list" aria-label={name}>
                  {mediaUrls.map((url, index) => {
                    const active = url === displayedMediaUrl
                    return (
                      <button
                        key={url}
                        type="button"
                        role="listitem"
                        onClick={() => setActiveMediaUrl(url)}
                        aria-label={`${name} ${index + 1}`}
                        aria-pressed={active}
                        className={`relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 bg-orange-50 transition-colors ${
                          active ? 'border-[#ff5a00] ring-2 ring-orange-100' : 'border-[#E5E7EB] hover:border-orange-200'
                        }`}
                      >
                        <SafeMenuImage
                          src={url}
                          alt=""
                          className="h-full w-full object-cover object-center"
                          fallbackIconSize={22}
                          autoPlay={false}
                        />
                        {isMenuVideoUrl(url) && (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
                              <Play size={12} fill="currentColor" />
                            </span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-5">
              <div>
                {category && (
                  <span className="mb-3 inline-flex rounded-full bg-[#FFF4ED] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#FF4D00]">
                    {getCategoryName(category, lang)}
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={`text-2xl font-black uppercase tracking-tight sm:text-3xl ${unavailable ? 'text-[#6B7280]' : 'text-[#111827]'}`}>{name}</h2>
                  {unavailable && (
                    <span className="inline-flex rounded-full bg-[#E5E7EB] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#4B5563] ring-1 ring-[#D1D5DB]">
                      {labels.unavailable}
                    </span>
                  )}
                </div>
                {unavailable && <p className="mt-2 text-sm font-semibold text-[#6B7280]">{labels.unavailableSub}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {pricing.discounted && (
                    <p className="text-sm font-bold text-[#9CA3AF] line-through">{formatPrice(pricing.oldPrice)}</p>
                  )}
                  <p className={`${unavailable ? 'text-lg text-[#6B7280]' : pricing.discounted ? 'text-xl text-red-600' : 'text-lg text-[#FF4D00]'} font-black`}>
                    {formatPrice(pricing.price)}{pricing.maxPrice > pricing.price ? ` – ${formatPrice(pricing.maxPrice)}` : ''}{priceUnit}
                  </p>
                  {grams && (
                    <span className="rounded-full bg-[#FFF4ED] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#FF4D00] ring-1 ring-[#FFD8BF]">
                      {grams}
                    </span>
                  )}
                  {millilitres && (
                    <span className="rounded-full bg-[#FFF4ED] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#FF4D00] ring-1 ring-[#FFD8BF]">
                      {millilitres}
                    </span>
                  )}
                  {kcal && (
                    <span className="rounded-full bg-[#FFF4ED] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#FF4D00] ring-1 ring-[#FFD8BF]">
                      {kcal}
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t border-[#EEF2F6] pt-4">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#8EA0BB]">{labels.description}</p>
                <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#475569]">
                  <FormattedMenuText text={desc} fallback={labels.noDescription} />
                </p>
              </div>

              {optionGroups.length > 0 && (
              <div className="rounded-[22px] border border-[#E5E7EB] bg-[#FBFCFE] p-4">
                {shouldShowOptionSectionTitle && (
                <div className="mb-3">
                  <h3 className="text-base font-black text-[#111827]">
                    {optionSectionTitle}
                  </h3>
                </div>
                )}
                <div className="space-y-4">
                  {optionGroups.map(group => (
                    <div key={group.id}>
                      <p className="mb-2 text-sm font-black text-[#111827]">
                        {group.title}{group.required && <span className="text-[#ff5a00]">*</span>}
                      </p>
                      <div className="space-y-2">
                        {group.options.length === 0 && (
                          <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-400">
                            {noAvailableOptions}
                          </p>
                        )}
                        {group.options.map(option => (
                          <label
                            key={option.id}
                            className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer'} ${
                              selectedOptions[group.id] === option.id
                                ? 'border-[#ff5a00] bg-[#fff4ed] text-[#111827]'
                                : 'border-[#E5E7EB] bg-white text-[#475569]'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <input
                                type="radio"
                                name={`option-${item.id}-${group.id}`}
                                checked={selectedOptions[group.id] === option.id}
                                disabled={readOnly}
                                onChange={() => {
                                  if (!readOnly) setSelectedOptions(current => ({ ...current, [group.id]: option.id }))
                                }}
                                className="h-4 w-4 accent-[#ff5a00]"
                              />
                              <span className="truncate">{option.label}</span>
                            </span>
                            <span className="flex flex-shrink-0 items-center gap-2 text-xs font-black text-[#64748B]">
                              {option.stock_count > 0 && (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-100">
                                  {option.stock_count}
                                </span>
                              )}
                              {option.price > 0 ? formatPrice(calculateUnitPrice(option.price, itemPriceMode)) : option.price_delta > 0 ? `+${formatPrice(option.price_delta)}` : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {!readOnly && (
              <div className="rounded-[22px] border border-[#E5E7EB] bg-[#FBFCFE] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-black text-[#111827]">{labels.quantity}</h3>
                    <p className="mt-1 text-sm text-[#8A94A6]">{labels.quantitySub}</p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-4 rounded-[18px] border border-[#E5E7EB] bg-white p-1.5 sm:w-auto">
                    <button
                      onClick={() => setQty(q => Math.max(menuQuantityStep(item), changeMenuQuantity(q, item, -1)))}
                      className="w-12 h-12 rounded-2xl bg-white border border-[#E5E7EB] flex items-center justify-center text-[#64748B] hover:text-[#0F3B2E] active:scale-95 transition-all shadow-sm"
                    >
                      <Minus size={18} />
                    </button>
                    {soldByWeight ? (
                      <label className="flex min-w-[112px] items-center justify-center gap-1">
                        <input
                          type="number"
                          min={menuQuantityStep(item)}
                          step={menuQuantityStep(item)}
                          value={qty}
                          disabled={unavailable}
                          onChange={event => setQty(normalizeMenuQuantity(event.target.value, item))}
                          className="w-20 bg-transparent text-center text-2xl font-black leading-none text-[#111827] tabular-nums outline-none disabled:cursor-not-allowed disabled:text-[#9CA3AF]"
                          aria-label={labels.quantity}
                        />
                        <span className="text-sm font-black text-[#64748B]">kg</span>
                      </label>
                    ) : (
                      <span className="min-w-[44px] text-center text-2xl font-black leading-none text-[#111827] tabular-nums">{qty}</span>
                    )}
                    <button
                      onClick={() => setQty(q => changeMenuQuantity(q, item, 1))}
                      disabled={unavailable}
                      className="w-12 h-12 rounded-2xl bg-[#0F3B2E] flex items-center justify-center text-white hover:bg-[#0A2A20] active:scale-95 transition-all shadow-sm disabled:cursor-not-allowed disabled:bg-[#9CA3AF] disabled:shadow-none"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </div>
              )}

              {!readOnly && (
              <div className="rounded-[22px] border border-[#E5E7EB] bg-[#FBFCFE] p-4">
                <div className="mb-3">
                  <h3 className="text-base font-black text-[#111827]">{labels.notes}</h3>
                  <p className="mt-1 text-sm text-[#8A94A6]">{labels.notesSub}</p>
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={labels.notesPlaceholder}
                  rows={3}
                  className="w-full resize-none rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-3 text-[14px] leading-6 text-[#1F2937] placeholder-[#9CA3AF] transition-all focus:border-[#ff5a00] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/15"
                />
              </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {!readOnly && (
      <div className="sticky bottom-0 z-20 border-t border-[#E5E7EB] bg-white/95 px-4 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1120px] gap-3">
          <button
            onClick={onCancel}
            className="h-14 flex-1 rounded-2xl border border-[#E5E7EB] bg-white text-sm font-black text-[#64748B] hover:bg-[#F8FAFC] active:scale-[0.99] transition-all"
          >
              {t(lang, 'cancel')}
          </button>
          <button
            onClick={() => { if (!unavailable && !missingRequiredOptions) onAddToCart(item, qty, finalNotes, selectedOptions, selectedOptionBasePrice) }}
            disabled={unavailable || missingRequiredOptions}
            className="h-14 flex-[2] rounded-2xl bg-[#0F3B2E] text-sm sm:text-base font-black text-white hover:bg-[#0A2A20] active:scale-[0.99] transition-all shadow-[0_8px_18px_rgba(15,59,46,0.22)] disabled:cursor-not-allowed disabled:bg-[#9CA3AF] disabled:shadow-none"
          >
            {unavailable ? labels.unavailable : `${labels.add} - ${formatPrice(total)}`}
          </button>
        </div>
      </div>
      )}
    </div>
  )
}
