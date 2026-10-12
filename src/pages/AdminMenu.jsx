import { eligibleCategoryProfileIds } from '../lib/categoryScheduleAccess'
import { formatWriteError } from '../lib/writeErrorMessage'
import { orderTypeLabel } from '../lib/orderTypes'
import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  DndContext, closestCenter, pointerWithin, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable,
  arrayMove, rectSortingStrategy, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t, getItemName, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDateTime } from '../lib/dateFormat'
import { DEFAULT_MENU_PREP_MINUTES, menuPrepTimeLabel, normalizeMenuPrepMinutes } from '../lib/menuPrepTime'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'
import { getMenuPricing } from '../lib/menuPricing'
import { generateMenuExternalId } from '../lib/menuExternalId'
import AppShell from '../components/AppShell'
import MenuCategoryScroller, { menuCategorySectionId } from '../components/MenuCategoryScroller'
import {
  getQuickItemSortOrder,
  isActiveMenuCategory,
  isActiveMenuItem,
  isCashierQuickItem,
  isDeletedMenuCategory,
  isDeletedMenuItem,
  isPublicHiddenMenuItem,
} from '../lib/menuItems'
import {
  Plus, Edit2, Trash2, Archive, X, UtensilsCrossed,
  Search, LayoutGrid, List, Tag, FolderOpen, GripVertical,
  ImagePlus, Loader2, Bold, Eye, EyeOff, Lock, Clock3, ClipboardList, RotateCcw,
} from 'lucide-react'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useAppDataStatus } from '../store/appHooks'
import MenuMedia from '../components/MenuMedia'
import { supabase } from '../lib/supabase'
import { formatMoneyInput, normalizeMoneyInput, numberFromMoneyInput } from '../lib/moneyInput'
import {
  canChangeMenuItemAvailability,
  canChangeMenuItemPublicVisibility,
  canDeleteMenuCatalog as canDeleteMenuCatalogForProfile,
  canEditMenu as canEditMenuForProfile,
  canViewPage, normalizeRole,
} from '../lib/permissions'
import { getSaleProfitSummary } from '../lib/profit'
import { getRequiredMenuItemCost, hasRequiredMenuItemCost, isTechCardMenuItemCost } from '../lib/menuItemCosts'
import { isTechCardEligibleMenuItem } from '../lib/techCards'
import {
  getMenuItemMediaUrls,
  hasMenuItemImage,
  isMenuVideoUrl,
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_MIME_TYPES,
  MENU_PRODUCT_MEDIA_ACCEPT,
  MENU_VIDEO_MIME_TYPES,
  normalizeMenuMediaUrls,
} from '../lib/menuMedia'
import { trimMenuItemTextFields, trimMenuItemTextValue } from '../lib/menuItemText'
import {
  MENU_SALE_UNIT_KG,
  MENU_SALE_UNIT_PIECE,
  menuPriceUnitSuffix,
  menuSaleUnitLabel,
  normalizeMenuSaleUnit,
} from '../lib/menuSaleUnits'

// ── Shared primitives ─────────────────────────────────────────────────────────

const ADMIN_MENU_SCROLL_KEY = 'zar-admin-menu-scroll-top'
const MENU_IMAGE_TYPES = new Set(MENU_IMAGE_MIME_TYPES)
const MENU_PRODUCT_MEDIA_TYPES = new Set([...MENU_IMAGE_MIME_TYPES, ...MENU_VIDEO_MIME_TYPES])
const MAX_MENU_MEDIA_BYTES = 4 * 1024 * 1024

function saveAdminMenuScrollPosition(scrollTop) {
  if (typeof sessionStorage === 'undefined') return
  const normalized = Math.max(0, Math.round(Number(scrollTop) || 0))
  if (normalized <= 0) {
    clearSavedAdminMenuScrollPosition()
    return
  }
  sessionStorage.setItem(ADMIN_MENU_SCROLL_KEY, String(normalized))
}

function takeSavedAdminMenuScrollPosition() {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(ADMIN_MENU_SCROLL_KEY)
  if (raw == null) return null
  const scrollTop = Number(raw)
  return Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : null
}

function clearSavedAdminMenuScrollPosition() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(ADMIN_MENU_SCROLL_KEY)
}

function validateMenuImage(file, allowVideo = false) {
  const allowedTypes = allowVideo ? MENU_PRODUCT_MEDIA_TYPES : MENU_IMAGE_TYPES
  if (!allowedTypes.has(String(file?.type || '').toLowerCase())) {
    throw new Error(allowVideo
      ? 'Only JPEG, PNG, WebP, GIF, AVIF, MP4, or WebM menu media is allowed'
      : 'Only JPEG, PNG, WebP, GIF, or AVIF images are allowed')
  }
  if (Number(file?.size || 0) > MAX_MENU_MEDIA_BYTES) throw new Error('File must be 4 MB or smaller')
  return file
}

async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || ''
}

async function uploadMenuImageToR2({ file, type, entityId }) {
  const token = await getAuthToken()
  const body = new FormData()
  body.append('file', file)
  body.append('type', type)
  if (entityId) body.append('entityId', entityId)

  const response = await fetch('/api/menu-image/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Could not upload image')
  return data
}

function formatMenuImageUploadError(lang, message) {
  const text = String(message || '')
  return text
}

async function deleteMenuImageFromR2(imageUrl) {
  if (!imageUrl) return
  const token = await getAuthToken()
  await fetch('/api/menu-image/delete', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url: imageUrl }),
  })
}

function SafeMenuImage({ src, alt = '', className = '', fallbackClassName = '', iconSize = 28 }) {
  return (
    <MenuMedia
      src={src}
      alt={alt}
      className={className}
      containerClassName={fallbackClassName || 'h-full w-full'}
      fallback={
        <div className={`bg-orange-50 flex items-center justify-center ${fallbackClassName}`}>
          <UtensilsCrossed size={iconSize} className="text-orange-200" />
        </div>
      }
    />
  )
}

function Modal({ title, onClose, children, closeDisabled = false }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-[#22201d]/40 backdrop-blur-sm" onClick={closeDisabled ? undefined : onClose} />
      <div className="ws-dialog relative w-full sm:max-w-lg !rounded-b-none sm:!rounded-[16px] max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#e4e1de] flex-shrink-0">
          <h3 className="ws-display min-w-0 truncate">{title}</h3>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon disabled:cursor-wait"
          >
            <X size={17} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, type = 'text', value, onChange, placeholder, ...inputProps }) {
  return (
    <div>
      <label className="ws-caption mb-1.5 block font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        {...inputProps}
        className="ws-input"
      />
    </div>
  )
}

function MoneyField({ label, value, onChange, placeholder, className = '', labelClassName = '', ...inputProps }) {
  const formattedPlaceholder = formatMoneyInput(placeholder) || placeholder
  return (
    <div>
      <label className={labelClassName || 'ws-caption mb-1.5 block font-medium'}>{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={formatMoneyInput(value)}
        onChange={event => onChange({ target: { value: normalizeMoneyInput(event.target.value) } })}
        placeholder={formattedPlaceholder}
        autoComplete="off"
        {...inputProps}
        className={className || 'ws-input tabular-nums'}
      />
    </div>
  )
}

function ProfitMarginPreview({ price, cost, lang, inheritedCost = false }) {
  if (String(price ?? '').trim() === '' || String(cost ?? '').trim() === '') return null
  const summary = getSaleProfitSummary(numberFromMoneyInput(price), numberFromMoneyInput(cost))
  if (!summary) return null

  const labels = lang === 'uz'
    ? { profit: 'Sotuv foydasi', markup: 'Ustama', inherited: 'Asosiy tannarx' }
    : lang === 'ru'
      ? { profit: 'Прибыль с продажи', markup: 'Наценка', inherited: 'Себестоимость товара' }
      : { profit: 'Profit per sale', markup: 'Markup', inherited: 'Parent cost' }
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ'
  const markup = summary.markupPct == null
    ? '—'
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(summary.markupPct)}%`
  const positive = summary.profit >= 0

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-[10px] border px-3 py-2 ${positive ? 'border-[#e4e1de] bg-[#f6f5f3]' : 'border-[#c4262c]/30 bg-[#c4262c]/[.06]'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="ws-caption font-medium">{labels.profit}</span>
        {inheritedCost && <span className="ws-badge">{labels.inherited}</span>}
      </div>
      <div className={`flex items-center gap-2 text-sm font-semibold tabular-nums ${positive ? 'text-[#1d7a52]' : 'text-[#c4262c]'}`}>
        <span>{formatCurrency(summary.profit)}</span>
        <span className={`ws-badge ${positive ? 'ws-tone-positive' : 'ws-tone-negative'}`}>{labels.markup}: {markup}</span>
      </div>
    </div>
  )
}

function PricingFields({ form, setF, lang, compact = false, costRequired = false }) {
  const priceUnit = menuPriceUnitSuffix(form.sale_unit, lang)
  const techCardCost = isTechCardMenuItemCost(form)
  const labels = lang === 'uz'
    ? {
        title: 'Narx va foyda',
        private: 'Ichki ma’lumot',
        current: 'Hozirgi narx',
        old: 'Eski narx',
        cost: 'Haqiqiy tannarx',
        hint: 'Tannarx faqat sof foydani hisoblash uchun ishlatiladi. Menyu, buyurtma va cheklarda ko‘rsatilmaydi.',
        techCardHint: 'Bu tannarx texnologik kartadan hisoblangan. Uni o‘zgartirish uchun texnologik kartani tahrirlang.',
        required: 'Yangi mahsulot uchun haqiqiy tannarx majburiy.',
      }
    : lang === 'ru'
      ? {
          title: 'Цена и прибыль',
          private: 'Внутренние данные',
          current: 'Текущая цена',
          old: 'Старая цена',
          cost: 'Реальная себестоимость',
          hint: 'Себестоимость используется только для расчёта чистой прибыли. Она не показывается в меню, заказах и чеках.',
          techCardHint: 'Эта себестоимость рассчитана по техкарте. Чтобы изменить её, отредактируйте техкарту.',
          required: 'Для нового товара реальная себестоимость обязательна.',
        }
      : {
          title: 'Pricing and profit',
          private: 'Internal data',
          current: 'Current price',
          old: 'Old price',
          cost: 'Real cost',
          hint: 'Cost is used only to calculate net profit. It is never shown in menus, orders, or receipts.',
          techCardHint: 'This cost is calculated from the tech card. Edit the tech card to change it.',
          required: 'Real cost is required for every new product.',
        }
  const missingRequiredCost = costRequired && !hasRequiredMenuItemCost(form.cost_price)

  return (
    <div className={`rounded-xl border border-[#e4e1de] ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="ws-heading">{labels.title}</p>
        <span className="ws-badge">
          <Lock size={12} />
          {labels.private}
        </span>
      </div>
      <div className={`grid gap-3 ${compact ? 'sm:grid-cols-1' : 'sm:grid-cols-3'}`}>
        <MoneyField label={`${labels.current} (UZS${priceUnit})`} value={form.price} onChange={setF('price')} placeholder="35000" />
        <MoneyField label={`${labels.old} (UZS)`} value={form.old_price} onChange={setF('old_price')} placeholder="40000" />
        <MoneyField
          label={`${labels.cost} (UZS${priceUnit})${costRequired ? ' *' : ''}`}
          value={form.cost_price}
          onChange={setF('cost_price')}
          placeholder="18000"
          required={costRequired}
          disabled={techCardCost}
          aria-required={costRequired}
          aria-invalid={missingRequiredCost}
          className={`ws-input tabular-nums disabled:cursor-not-allowed disabled:!bg-[#efece9] disabled:!text-[#68655f] ${
            missingRequiredCost ? '!border-[#c4262c]' : ''
          }`}
          labelClassName={`ws-caption mb-1.5 block font-medium ${missingRequiredCost ? '!text-[#c4262c]' : ''}`}
        />
      </div>
      {costRequired && (
        <p className={`ws-caption mt-2 font-medium ${missingRequiredCost ? '!text-[#c4262c]' : ''}`}>
          * {labels.required}
        </p>
      )}
      <div className="mt-3">
        <ProfitMarginPreview price={form.price} cost={form.cost_price} lang={lang} />
      </div>
      <p className="ws-caption mt-3">
        {techCardCost ? labels.techCardHint : labels.hint}
      </p>
    </div>
  )
}

function SaleUnitField({ value, onChange, lang }) {
  const label = lang === 'uz' ? 'Sotish birligi' : lang === 'ru' ? 'Единица продажи' : 'Sold by'
  const hint = normalizeMenuSaleUnit(value) === MENU_SALE_UNIT_KG
    ? (lang === 'uz' ? 'Narx va tannarx 1 kg uchun. Ofitsiant vaznni o‘nlik son bilan kiritadi.' : lang === 'ru' ? 'Цена и себестоимость указаны за 1 кг. Официант вводит вес дробным числом.' : 'Price and real cost are per 1 kg. The waiter enters a decimal weight.')
    : (lang === 'uz' ? 'Miqdor faqat butun dona bilan kiritiladi.' : lang === 'ru' ? 'Количество вводится только целыми штуками.' : 'Quantity is entered in whole items.')

  return (
    <label className="block">
      <span className="ws-caption mb-1.5 block font-medium">{label}</span>
      <select
        value={normalizeMenuSaleUnit(value)}
        onChange={onChange}
        className="ws-input"
      >
        <option value={MENU_SALE_UNIT_PIECE}>{menuSaleUnitLabel(MENU_SALE_UNIT_PIECE, lang)}</option>
        <option value={MENU_SALE_UNIT_KG}>{menuSaleUnitLabel(MENU_SALE_UNIT_KG, lang)}</option>
      </select>
      <span className="ws-caption mt-1.5 block">{hint}</span>
    </label>
  )
}

function DescriptionField({ label, value, onChange, onBlur, lang }) {
  const textareaRef = useRef(null)
  const boldLabel = lang === 'uz' ? 'Qalin' : lang === 'ru' ? 'Жирный' : 'Bold'

  function updateValue(nextValue) {
    onChange({ target: { value: nextValue } })
  }

  function applyBold() {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = String(value || '')
    const selected = current.slice(start, end)
    const insert = selected ? `**${selected}**` : '**bold**'
    const nextValue = `${current.slice(0, start)}${insert}${current.slice(end)}`
    updateValue(nextValue)
    window.requestAnimationFrame(() => {
      textarea.focus()
      const cursorStart = selected ? start + insert.length : start + 2
      const cursorEnd = selected ? cursorStart : start + 6
      textarea.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="ws-caption block font-medium">{label}</label>
        <button
          type="button"
          onClick={applyBold}
          title={boldLabel}
          aria-label={boldLabel}
          className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
        >
          <Bold size={15} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        rows={4}
        className="ws-input !h-auto min-h-[112px] resize-y leading-6"
      />
    </div>
  )
}

function ImageUploadField({ label, value, onChange, onUploadComplete, lang, type, entityId, allowVideo = false }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const input = e.target
    setUploading(true)
    setError('')
    try {
      const previousUrl = value
      const data = await uploadMenuImageToR2({ file: validateMenuImage(file, allowVideo), type, entityId })
      onChange({ target: { value: data.url } })
      await onUploadComplete?.({ newUrl: data.url, previousUrl })
    } catch (err) {
      setError(`${t(lang, 'uploadError')}: ${formatMenuImageUploadError(lang, err.message)}`)
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  return (
    <div>
      <label className="ws-caption mb-1.5 block font-medium">{label}</label>
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="ws-btn ws-btn-outline ws-btn-sm !h-11 border-dashed !border-[#dcd9d6]"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {uploading ? t(lang, 'uploading') : t(lang, 'upload')}
        </button>
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder="https://..."
          className="ws-input flex-1"
        />
        <input
          ref={fileRef}
          type="file"
          accept={allowVideo ? MENU_PRODUCT_MEDIA_ACCEPT : MENU_IMAGE_ACCEPT}
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {value && (
        <MenuMedia
          src={value}
          alt={t(lang, allowVideo ? 'mediaPreview' : 'imagePreview')}
          controls={allowVideo}
          autoPlay={false}
          className={`mt-2 rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] object-cover object-center ${allowVideo ? 'h-24 w-36' : 'h-20 w-20'}`}
        />
      )}
      {allowVideo && <p className="ws-caption mt-1.5">{t(lang, 'mediaHelp')}</p>}
      {error && <p role="alert" className="ws-notice ws-tone-negative mt-2 !py-2 !text-[13px]">{error}</p>}
    </div>
  )
}

function MediaGalleryField({ label, values, onChange, onUploadComplete, lang, entityId, required = false }) {
  const fileRef = useRef(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const mediaUrls = normalizeMenuMediaUrls(values)

  async function handleFiles(event) {
    const input = event.target
    const files = [...(input.files || [])]
    if (files.length === 0) return

    setUploading(true)
    setError('')
    const nextUrls = [...mediaUrls]
    const failed = []
    for (const file of files) {
      try {
        const data = await uploadMenuImageToR2({
          file: validateMenuImage(file, true),
          type: 'product',
          entityId,
        })
        nextUrls.push(data.url)
        await onUploadComplete?.({ newUrl: data.url, previousUrl: '' })
      } catch (uploadError) {
        failed.push(uploadError.message)
      }
    }
    onChange(normalizeMenuMediaUrls(nextUrls))
    if (failed.length > 0) {
      setError(`${t(lang, 'uploadError')}: ${formatMenuImageUploadError(lang, failed[0])}`)
    }
    setUploading(false)
    input.value = ''
  }

  function addUrl() {
    const value = urlDraft.trim()
    if (!/^https?:\/\//i.test(value)) {
      setError(t(lang, 'invalidMediaUrl'))
      return
    }
    onChange(normalizeMenuMediaUrls([...mediaUrls, value]))
    setUrlDraft('')
    setError('')
  }

  function removeUrl(url) {
    onChange(mediaUrls.filter(value => value !== url))
    setError('')
  }

  function makeCover(url) {
    onChange([url, ...mediaUrls.filter(value => value !== url)])
  }

  const missingRequiredImage = required && !hasMenuItemImage(mediaUrls)

  return (
    <div>
      <label className={`ws-caption mb-1.5 block font-medium ${missingRequiredImage ? '!text-[#c4262c]' : ''}`}>{label}{required ? ' *' : ''}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="ws-btn ws-btn-outline ws-btn-sm !h-11 border-dashed !border-[#dcd9d6]"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {uploading ? t(lang, 'uploading') : t(lang, 'upload')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={MENU_PRODUCT_MEDIA_ACCEPT}
          multiple
          className="hidden"
          onChange={handleFiles}
        />
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            type="url"
            value={urlDraft}
            onChange={event => setUrlDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addUrl()
              }
            }}
            placeholder="https://..."
            className="ws-input flex-1"
          />
          <button
            type="button"
            onClick={addUrl}
            disabled={!urlDraft.trim()}
            className="ws-btn ws-btn-outline ws-btn-sm !h-11"
          >
            <Plus size={14} />
            {t(lang, 'addMediaUrl')}
          </button>
        </div>
      </div>

      {mediaUrls.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {mediaUrls.map((url, index) => (
            <div key={url} className={`overflow-hidden rounded-[10px] border bg-white ${index === 0 ? 'border-[#ff5a00]' : 'border-[#e4e1de]'}`}>
              <div className="relative aspect-square overflow-hidden bg-[#f6f5f3]">
                <MenuMedia
                  src={url}
                  alt={`${t(lang, 'mediaPreview')} ${index + 1}`}
                  controls={isMenuVideoUrl(url)}
                  autoPlay={false}
                  className="h-full w-full object-cover object-center"
                  containerClassName="h-full w-full"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center bg-[#f6f5f3]">
                      <UtensilsCrossed size={22} className="text-[#a8a49e]" />
                    </div>
                  }
                />
                {index === 0 && (
                  <span className="ws-badge absolute left-2 top-2 !border-transparent !bg-[#ff5a00] !text-white">
                    {t(lang, 'mediaCover')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeUrl(url)}
                  title={t(lang, 'deleteMedia')}
                  aria-label={`${t(lang, 'deleteMedia')} ${index + 1}`}
                  className="ws-btn ws-btn-outline ws-btn-danger ws-btn-sm ws-btn-icon absolute right-2 top-2"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => makeCover(url)}
                  className="flex h-11 w-full items-center justify-center gap-1 border-t border-[#e4e1de] text-[13px] font-medium text-[#68655f] transition-colors hover:bg-[#ebe8e5] hover:text-[#22201d]"
                >
                  {t(lang, 'makeMediaCover')}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="ws-caption mt-3 rounded-[10px] border border-dashed border-[#dcd9d6] bg-[#f6f5f3] px-3 py-5 text-center">
          {t(lang, 'mediaEmpty')}
        </div>
      )}
      <p className="ws-caption mt-1.5">{t(lang, 'mediaHelp')}</p>
      {required && (
        <p className={`ws-caption mt-1.5 font-medium ${missingRequiredImage ? '!text-[#c4262c]' : ''}`}>
          * {lang === 'uz'
            ? 'Yangi mahsulot uchun kamida bitta rasm majburiy.'
            : lang === 'ru'
              ? 'Для нового товара нужно хотя бы одно фото.'
              : 'At least one photo is required for every new product.'}
        </p>
      )}
      {error && <p role="alert" className="ws-notice ws-tone-negative mt-2 !py-2 !text-[13px]">{error}</p>}
    </div>
  )
}

function OrangeBtn({ onClick, icon: Icon, children, small }) {
  return (
    <button
      onClick={onClick}
      className={`ws-btn ws-btn-primary ${small ? 'ws-btn-sm' : ''}`}
    >
      {Icon && <Icon size={small ? 14 : 16} />}
      {children}
    </button>
  )
}

// ── Drag handle ───────────────────────────────────────────────────────────────

function pointerWithinOrClosestCenter(args) {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args)
}

function DragHandle({ listeners, attributes }) {
  return (
    <button
      {...listeners}
      {...attributes}
      className="flex-shrink-0 p-1 rounded-md text-[#a8a49e] hover:text-[#22201d] hover:bg-[#ebe8e5] transition-colors cursor-grab active:cursor-grabbing touch-none"
      tabIndex={-1}
    >
      <GripVertical size={15} />
    </button>
  )
}

function MenuPrice({ item, size = 'base', align = 'left' }) {
  const pricing = getMenuPricing(item)
  const currentSize = size === 'sm' ? 'text-xs' : size === 'row' ? 'text-sm' : 'text-[16px]'
  const oldSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]'

  return (
    <div className={`flex flex-col ${align === 'right' ? 'items-end' : 'items-start'} flex-shrink-0 leading-tight`}>
      {pricing.discounted && (
        <span className={`${oldSize} font-medium text-[#68655f] line-through tabular-nums`}>{formatCurrency(pricing.oldPrice)}</span>
      )}
      <span className={`${currentSize} font-semibold tabular-nums tracking-[-.01em] ${pricing.discounted ? 'text-[#c4262c]' : 'text-[#22201d]'}`}>
        {formatCurrency(pricing.price)}{menuPriceUnitSuffix(item)}
      </span>
    </div>
  )
}

function ExternalIdBadge({ item, compact = false }) {
  const externalId = String(item.external_id || item.externalId || '').trim()
  if (!externalId) return null

  return (
    <span className={`ws-badge w-fit font-mono ${compact ? '!px-1.5 !py-0' : ''}`}>
      <span className="font-sans opacity-70">ID</span>
      <span className="truncate">{externalId}</span>
    </span>
  )
}

function savingLabel(lang) {
  return lang === 'uz' ? 'Saqlanmoqda' : lang === 'ru' ? 'Сохранение' : 'Saving'
}

function itemVisibilityStatusLabel(lang, visible) {
  if (visible) return lang === 'uz' ? 'Mavjud' : lang === 'ru' ? 'Доступно' : 'Available'
  return lang === 'uz' ? 'Mavjud emas' : lang === 'ru' ? 'Недоступно' : 'Unavailable'
}

function ownerOnlyPublicVisibilityLabel(lang) {
  return lang === 'uz'
    ? 'Ommaviy menyudan faqat egasi yashira oladi'
    : lang === 'ru'
      ? 'Скрытие из публичного меню может изменить только владелец'
      : 'Only the owner can change public menu visibility'
}

function publicMenuHideControlLabel(lang) {
  return lang === 'uz'
    ? 'Ommaviy menyudan yashirish'
    : lang === 'ru'
      ? 'Скрыть из публичного меню'
      : 'Hide from public menu'
}

function ownerOnlyBadgeLabel(lang) {
  return lang === 'uz' ? 'Faqat egasi' : lang === 'ru' ? 'Только владелец' : 'Owner only'
}

function OwnerOnlyMenuItemCheckbox({ id, checked, onChange, disabled, canChange, label, ownerOnlyLabel, lang }) {
  const locked = !canChange

  return (
    <label
      htmlFor={id}
      title={locked ? ownerOnlyLabel : undefined}
      className={`flex min-h-[44px] items-center gap-3 text-sm font-medium ${locked ? 'cursor-not-allowed text-[#68655f]' : 'cursor-pointer text-[#22201d]'}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        onChange={event => onChange(event.target.checked)}
        disabled={disabled || locked}
        className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00] disabled:cursor-not-allowed"
      />
      <span>{label}</span>
      {locked && (
        <span className="ws-badge ml-auto">
          <Lock size={11} />
          {ownerOnlyBadgeLabel(lang)}
        </span>
      )}
    </label>
  )
}

function categoryVisibilityStatusLabel(lang, visible) {
  if (visible) return lang === 'uz' ? 'Ommaviy menyuda ko‘rinadi' : lang === 'ru' ? 'Видно в публичном меню' : 'Visible on public menu'
  return hiddenFromPublicMenuLabel(lang)
}

function hiddenFromPublicMenuLabel(lang) {
  return lang === 'uz' ? 'Ommaviy menyuda yashirin' : lang === 'ru' ? 'Скрыто в публичном меню' : 'Hidden from public menu'
}

function hiddenFromWaiterMenuLabel(lang) {
  return lang === 'uz' ? 'Ofitsiant menyusida yashirin' : lang === 'ru' ? 'Скрыто в меню официанта' : 'Hidden from waiter menu'
}

function hiddenFromTouristMenuLabel(lang) {
  return lang === 'uz' ? 'Turist menyusida yashirin' : lang === 'ru' ? 'Скрыто в туристическом меню' : 'Hidden from Tourist menu'
}

function visibilityActionLabel(lang, visible, kind = 'item') {
  if (kind === 'category') {
    if (visible) return lang === 'uz' ? 'Kategoriyani ommaviy menyudan yashirish' : lang === 'ru' ? 'Скрыть категорию из публичного меню' : 'Hide category from public menu'
    return lang === 'uz' ? 'Kategoriyani ommaviy menyuda ko‘rsatish' : lang === 'ru' ? 'Показать категорию в публичном меню' : 'Show category on public menu'
  }
  if (visible) return lang === 'uz' ? 'Mahsulotni mavjud emas deb belgilash' : lang === 'ru' ? 'Сделать позицию недоступной' : 'Mark item unavailable'
  return lang === 'uz' ? 'Mahsulotni mavjud deb belgilash' : lang === 'ru' ? 'Сделать позицию доступной' : 'Mark item available'
}

function saveFailedLabel(lang) {
  return lang === 'uz'
    ? 'O‘zgarishni saqlab bo‘lmadi. Internet ulanishini tekshiring.'
    : lang === 'ru'
      ? 'Не удалось сохранить изменение. Проверьте подключение.'
      : 'Could not save the change. Check the connection.'
}

function menuScheduleLabels(lang) {
  return {
    section: lang === 'uz' ? 'Vaqt oralig‘i' : lang === 'ru' ? 'Временной интервал' : 'Time interval',
    from: lang === 'uz' ? 'Ko‘rsatish boshlanishi' : lang === 'ru' ? 'Показывать с' : 'Show from',
    until: lang === 'uz' ? 'Ko‘rsatish tugashi' : lang === 'ru' ? 'Показывать до' : 'Show until',
    hint: lang === 'uz'
      ? 'Bo‘sh qoldirilsa doim ko‘rinadi.'
      : lang === 'ru'
        ? 'Оставьте пустым, чтобы показывать всегда.'
        : 'Leave empty to show all day.',
  }
}

function scheduleBadgeLabel(entity) {
  const from = String(entity?.visible_from_time || entity?.visibleFromTime || '').slice(0, 5)
  const until = String(entity?.visible_until_time || entity?.visibleUntilTime || '').slice(0, 5)
  if (from && until) return `${from}-${until}`
  if (from) return `${from}+`
  if (until) return `<${until}`
  return ''
}

function nullableMenuTime(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function VisibilityToggleButton({ visible, pending, onClick, lang, kind = 'item', compact = false }) {
  const label = visibilityActionLabel(lang, visible, kind)
  const Icon = visible ? EyeOff : Eye

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={event => event.stopPropagation()}
      disabled={pending}
      title={pending ? savingLabel(lang) : label}
      aria-label={pending ? savingLabel(lang) : label}
      className={`ws-btn ws-btn-outline ws-btn-sm disabled:cursor-wait ${compact ? 'ws-btn-icon' : ''} ${visible ? '' : '!text-[#1d7a52]'}`}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {!compact && <span className="whitespace-nowrap">{pending ? savingLabel(lang) : label}</span>}
    </button>
  )
}

// ── Sortable grid card ────────────────────────────────────────────────────────

function archiveLabels(lang) {
  if (lang === 'ru') return {
    tab: 'Архив',
    title: 'Архив меню',
    sub: 'Архивные позиции скрыты везде, но не удалены. История заказов сохраняется, их можно восстановить в любой момент.',
    categories: 'Категории',
    items: 'Блюда',
    empty: 'В архиве пусто.',
    search: 'Поиск в архиве…',
    restore: 'Восстановить',
    archivedAt: 'В архиве с',
    categoryArchived: 'Сначала восстановите категорию',
    itemRestored: 'Блюдо восстановлено и снова в меню.',
    categoryRestored: 'Категория восстановлена. Она пока скрыта — включите видимость во вкладке «Категории».',
  }
  if (lang === 'uz') return {
    tab: 'Arxiv',
    title: 'Menyu arxivi',
    sub: 'Arxivdagi elementlar hamma joyda yashirilgan, lekin o‘chirilmagan. Buyurtmalar tarixi saqlanadi, ularni istalgan vaqtda tiklash mumkin.',
    categories: 'Kategoriyalar',
    items: 'Taomlar',
    empty: 'Arxiv bo‘sh.',
    search: 'Arxivdan qidirish…',
    restore: 'Tiklash',
    archivedAt: 'Arxivlangan',
    categoryArchived: 'Avval kategoriyani tiklang',
    itemRestored: 'Taom tiklandi va yana menyuda.',
    categoryRestored: 'Kategoriya tiklandi. U hozircha yashirin — «Kategoriyalar» bo‘limida ko‘rinishni yoqing.',
  }
  return {
    tab: 'Archive',
    title: 'Menu archive',
    sub: 'Archived entries are hidden everywhere but not deleted. Order history is kept and they can be restored at any time.',
    categories: 'Categories',
    items: 'Items',
    empty: 'The archive is empty.',
    search: 'Search archive…',
    restore: 'Restore',
    archivedAt: 'Archived',
    categoryArchived: 'Restore its category first',
    itemRestored: 'Item restored and back on the menu.',
    categoryRestored: 'Category restored. It is still hidden — turn its visibility on in the Categories tab.',
  }
}

function SortableItemCard({ item, lang, onEdit, onDelete, onToggleVisibility, categories, visibilityPending, canChangeAvailability = false, canDelete = false, isDragging: _isDragging, readOnly = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  const cat = categories.find(c => c.id === item.category_id)
  const scheduleLabel = scheduleBadgeLabel(item)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="ws-panel ws-panel-flush group flex flex-col transition-shadow hover:shadow-[0_4px_14px_rgb(34_32_29/8%)]"
    >
      {/* Drag handle strip at top of image */}
      <div className="relative">
        <SafeMenuImage
          src={item.image_url}
          alt={getItemName(item, lang)}
          className="aspect-square w-full object-cover object-center"
          fallbackClassName="aspect-square w-full"
        />
        {/* Drag handle overlay */}
        {!readOnly && (
          <button
            {...listeners}
            {...attributes}
            className="absolute top-2 left-2 p-1.5 rounded-lg bg-white/90 backdrop-blur-sm text-[#68655f] hover:text-[#22201d] hover:bg-white transition-colors cursor-grab active:cursor-grabbing touch-none shadow-[0_1px_2px_rgb(34_32_29/10%)]"
            tabIndex={-1}
          >
            <GripVertical size={15} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="mb-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-[#22201d]">
          {getItemName(item, lang)}
        </p>
        {cat && (
          <p className="ws-caption mb-2">
            {getCategoryName(cat, lang)}
          </p>
        )}
        <div className="mb-3">
          <MenuPrice item={item} />
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <ExternalIdBadge item={item} />
          <span className="ws-badge">
            <Clock3 size={12} />
            {menuPrepTimeLabel(item, lang)}
          </span>
          {gramsLabel(item, lang) && (
            <span className="ws-badge">
              {gramsLabel(item, lang)}
            </span>
          )}
          {millilitresLabel(item, lang) && (
            <span className="ws-badge">
              {millilitresLabel(item, lang)}
            </span>
          )}
          {kcalLabel(item, lang) && (
            <span className="ws-badge">
              {kcalLabel(item, lang)}
            </span>
          )}
          {Number(item.stock_count ?? item.stockCount ?? 0) > 0 && (
            <span className="ws-badge ws-tone-caution">
              {lang === 'uz' ? 'Tokcha' : lang === 'ru' ? 'Полка' : 'Shelf'}: {Number(item.stock_count ?? item.stockCount ?? 0)}
            </span>
          )}
          {item.public_hidden && (
            <span className="ws-badge ws-tone-info">
              {hiddenFromPublicMenuLabel(lang)}
            </span>
          )}
          {scheduleLabel && (
            <span className="ws-badge ws-tone-positive">
              <Clock3 size={12} />
              {scheduleLabel}
            </span>
          )}
        </div>
        <div className="mb-3 mt-auto flex items-center justify-between gap-2">
          <span className={`ws-status ${item.available ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
            {itemVisibilityStatusLabel(lang, item.available)}
          </span>
          {!readOnly && (canChangeAvailability ? (
            <VisibilityToggleButton
              visible={!!item.available}
              pending={visibilityPending}
              onClick={() => onToggleVisibility(item)}
              lang={lang}
              compact
            />
          ) : (
            <span
              title={t(lang, 'available_item')}
              aria-label={t(lang, 'available_item')}
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#e4e1de] bg-[#efece9] text-[#68655f]"
            >
              <Lock size={14} />
            </span>
          ))}
        </div>

        {/* Actions */}
        {!readOnly && (
          <div className="flex items-center gap-1.5 border-t border-[#e4e1de]/60 pt-3">
            <button
              onClick={() => onEdit(item)}
              disabled={visibilityPending}
              className="ws-btn ws-btn-outline ws-btn-sm flex-1"
            >
              <Edit2 size={14} />
              {lang === 'uz' ? 'Tahrirl' : lang === 'ru' ? 'Ред.' : 'Edit'}
            </button>
            {canDelete && (
              <button
                type="button"
                onPointerDown={event => event.stopPropagation()}
                onClick={() => onDelete(item)}
                disabled={visibilityPending}
                aria-label={lang === 'uz' ? 'Mahsulotni arxivlash' : lang === 'ru' ? 'Архивировать товар' : 'Archive item'}
                className="touch-manipulation ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm"
              >
                <Archive size={14} />
                {lang === 'uz' ? 'Arxiv' : lang === 'ru' ? 'В архив' : 'Archive'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sortable list row ─────────────────────────────────────────────────────────

function SortableItemRow({ item, lang, onEdit, onDelete, onToggleVisibility, categories, visibilityPending, canChangeAvailability = false, canDelete = false, readOnly = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  const cat = categories.find(c => c.id === item.category_id)
  const scheduleLabel = scheduleBadgeLabel(item)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="ws-row flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:gap-4 sm:px-5"
    >
      {!readOnly && <DragHandle listeners={listeners} attributes={attributes} />}
      <SafeMenuImage
        src={item.image_url}
        alt={getItemName(item, lang)}
        className="h-12 w-12 flex-shrink-0 rounded-lg object-cover object-center"
        fallbackClassName="h-12 w-12 flex-shrink-0 rounded-lg"
        iconSize={18}
      />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-semibold text-[#22201d]">{getItemName(item, lang)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {cat && <p className="ws-caption">{getCategoryName(cat, lang)}</p>}
          <span className="ws-badge">
            <Clock3 size={12} />
            {menuPrepTimeLabel(item, lang)}
          </span>
          <ExternalIdBadge item={item} compact />
          {item.public_hidden && (
            <span className="ws-badge ws-tone-info">
              {hiddenFromPublicMenuLabel(lang)}
            </span>
          )}
          {scheduleLabel && (
            <span className="ws-badge ws-tone-positive">
              {scheduleLabel}
            </span>
          )}
        </div>
      </div>
      <MenuPrice item={item} size="row" align="right" />
      <span className={`ws-status flex-shrink-0 ${item.available ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
        {itemVisibilityStatusLabel(lang, item.available)}
      </span>
      {!readOnly && (
        <div className="flex w-full flex-shrink-0 justify-end gap-1.5 border-t border-[#e4e1de]/60 pt-2 sm:w-auto sm:border-0 sm:pt-0">
          {canChangeAvailability ? (
            <VisibilityToggleButton
              visible={!!item.available}
              pending={visibilityPending}
              onClick={() => onToggleVisibility(item)}
              lang={lang}
              compact
            />
          ) : (
            <span
              title={t(lang, 'available_item')}
              aria-label={t(lang, 'available_item')}
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#e4e1de] bg-[#efece9] text-[#68655f]"
            >
              <Lock size={13} />
            </span>
          )}
          <button
            onClick={() => onEdit(item)}
            disabled={visibilityPending}
            className="ws-btn ws-btn-outline ws-btn-sm"
          >
            <Edit2 size={14} />
            {lang === 'uz' ? 'Tahrirlash' : lang === 'ru' ? 'Редакт.' : 'Edit'}
          </button>
          {canDelete && (
            <button
              type="button"
              onPointerDown={event => event.stopPropagation()}
              onClick={() => onDelete(item)}
              disabled={visibilityPending}
              aria-label={lang === 'uz' ? 'Mahsulotni arxivlash' : lang === 'ru' ? 'Архивировать товар' : 'Archive item'}
              className="touch-manipulation ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm"
            >
              <Archive size={14} />
              {lang === 'uz' ? 'Arxiv' : lang === 'ru' ? 'В архив' : 'Archive'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sortable category row ─────────────────────────────────────────────────────

// The read-only layout removes drag/actions columns instead of leaving empty cells.
const CAT_EDIT_GRID = 'grid grid-cols-[20px_52px_minmax(0,1fr)_200px_90px_160px] items-center gap-4 px-5'
const CAT_READ_ONLY_GRID = 'grid grid-cols-[52px_minmax(260px,1fr)_minmax(220px,280px)_100px] items-center gap-4 px-5'

function SortableCatRow({ cat, lang, itemCount, onEdit, onDelete, onToggleVisibility, visibilityPending, sortIndex, canDelete = false, readOnly = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const scheduleLabel = scheduleBadgeLabel(cat)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${readOnly ? CAT_READ_ONLY_GRID : CAT_EDIT_GRID} ws-row py-3.5`}
    >
      {/* col 1 – drag handle */}
      {!readOnly && <DragHandle listeners={listeners} attributes={attributes} />}

      {/* col 2 – image */}
      {cat.image_url ? (
        <img src={cat.image_url} alt="" className="h-12 w-12 rounded-lg object-cover object-center" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-[#efece9] flex items-center justify-center">
          <Tag size={18} className="text-[#68655f]" />
        </div>
      )}

      {/* col 3 – name + count */}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#22201d]">{getCategoryName(cat, lang)}</p>
        <p className="ws-caption mt-0.5">
          {lang === 'uz' ? `${itemCount} ta element` :
           lang === 'ru' ? `${itemCount} позиций` :
           `${itemCount} item${itemCount !== 1 ? 's' : ''}`}
        </p>
        {(cat.waiter_hidden || cat.tourist_hidden || scheduleLabel) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {cat.waiter_hidden && (
              <span className="ws-badge">
                {hiddenFromWaiterMenuLabel(lang)}
              </span>
            )}
            {cat.tourist_hidden && (
              <span className="ws-badge">
                {hiddenFromTouristMenuLabel(lang)}
              </span>
            )}
            {scheduleLabel && (
              <span className="ws-badge ws-tone-positive">
                {scheduleLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* col 4 – status */}
      <div>
        <div className="flex items-center gap-1.5">
          <span className={`ws-status ${cat.hidden ? 'ws-tone-negative' : 'ws-tone-positive'}`}>
            {categoryVisibilityStatusLabel(lang, !cat.hidden)}
          </span>
          {!readOnly && (
            <VisibilityToggleButton
              visible={!cat.hidden}
              pending={visibilityPending}
              onClick={() => onToggleVisibility(cat)}
              lang={lang}
              kind="category"
              compact
            />
          )}
        </div>
      </div>

      {/* col 5 – sort order (centred) */}
      <div className="flex justify-center">
        <span className="ws-count">
          {sortIndex}
        </span>
      </div>

      {/* edit-only actions */}
      {!readOnly && (
        <div className="flex gap-1.5 justify-end">
            <button
              onClick={() => onEdit(cat)}
              disabled={visibilityPending}
              className="ws-btn ws-btn-outline ws-btn-sm"
            >
              <Edit2 size={14} />
              {lang === 'uz' ? 'Tahrirlash' : lang === 'ru' ? 'Ред.' : 'Edit'}
            </button>
            {canDelete && (
              <button
                onClick={() => onDelete(cat.id)}
                disabled={visibilityPending}
                className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm ws-btn-icon"
              >
                <Trash2 size={14} />
              </button>
            )}
        </div>
      )}
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

const blankItem = {
  id: '', category_id: '',
  name_uz: '', name_ru: '', name_en: '',
  description_uz: '', description_ru: '', description_en: '',
  external_id: '', price: '', old_price: '', cost_price: '', cost_source: 'manual', variant_costs: {}, sale_unit: MENU_SALE_UNIT_PIECE, grams: '', millilitres: '', kcal: '', stock_count: '', estimated_prep_minutes: DEFAULT_MENU_PREP_MINUTES, image_url: '', media_urls: [], available: true, sort_order: '',
  option_groups: [],
  option_groups_editor: [],
  show_in_cashier_quick_items: false,
  cashier_only: false,
  public_hidden: false,
  visible_from_time: '',
  visible_until_time: '',
  send_to_kitchen: false,
  quick_item_sort_order: '',
}

const blankCat = {
  id: '',
  name_uz: '',
  name_ru: '',
  name_en: '',
  image_url: '',
  sort_order: '',
  hidden: false,
  waiter_hidden: false,
  tourist_hidden: false,
  visible_from_time: '',
  visible_until_time: '',
  always_visible_take_away: false,
  always_visible_delivery: false,
  always_visible_game_club: false,
  always_visible_profile_ids: [],
}

function normalizeCategoryAlwaysVisibleProfileIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(profileId => String(profileId || '').trim()).filter(Boolean))].sort()
}

function getCategoryFormFingerprint(value = {}) {
  return JSON.stringify({
    id: String(value.id || ''),
    name_uz: trimMenuItemTextValue(value.name_uz),
    name_ru: trimMenuItemTextValue(value.name_ru),
    name_en: trimMenuItemTextValue(value.name_en),
    image_url: String(value.image_url || '').trim(),
    sort_order: Number(value.sort_order) || 0,
    hidden: !!value.hidden,
    waiter_hidden: !!value.waiter_hidden,
    tourist_hidden: !!value.tourist_hidden,
    visible_from_time: nullableMenuTime(value.visible_from_time),
    visible_until_time: nullableMenuTime(value.visible_until_time),
    always_visible_take_away: !!value.always_visible_take_away,
    always_visible_delivery: !!value.always_visible_delivery,
    always_visible_game_club: !!value.always_visible_game_club,
    always_visible_profile_ids: normalizeCategoryAlwaysVisibleProfileIds(value.always_visible_profile_ids),
  })
}

function parseOptionGroupsValue(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function optionGroupsToEditor(value, variantCosts = {}) {
  const protectedVariantCosts = variantCosts && typeof variantCosts === 'object' && !Array.isArray(variantCosts)
    ? variantCosts
    : {}
  return parseOptionGroupsValue(value).flatMap((group, groupIndex) => {
    const options = Array.isArray(group.options) ? group.options : []
    return options.map((option, optionIndex) => {
      const id = String(option.id || `option-${groupIndex + 1}-${optionIndex + 1}`)
      return {
        id,
        name_uz: option.label_uz || option.label || option.name || '',
        name_ru: option.label_ru || option.label || option.name || '',
        name_en: option.label_en || option.label || option.name || '',
        price: option.price ?? option.variant_price ?? '',
        cost_price: Object.prototype.hasOwnProperty.call(protectedVariantCosts, id) ? protectedVariantCosts[id] : '',
        stock_count: option.stock_count ?? option.stockCount ?? '',
        public_hidden: option.public_hidden === true || option.publicHidden === true || option.available === false,
        waiter_hidden: option.waiter_hidden === true || option.waiterHidden === true || option.available === false,
      }
    })
  })
}

function safeOptionId(value, fallback) {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback
}

function editorToOptionGroups(options, basePrice = 0) {
  const parentPrice = Math.max(0, Math.round(numberFromMoneyInput(basePrice)))
  const normalizedOptions = (options || []).map((option, optionIndex) => {
    const nameUz = String(option.name_uz || '').trim()
    const nameRu = String(option.name_ru || '').trim()
    const nameEn = String(option.name_en || '').trim()
    const fallback = nameUz || nameRu || nameEn
    if (!fallback) return null
    const optionPrice = Math.max(0, Math.round(numberFromMoneyInput(option.price)))
    const stockCount = Math.max(0, Math.round(Number(option.stock_count) || 0))
    return {
      id: safeOptionId(option.id, `option_${optionIndex + 1}`),
      label_uz: nameUz || fallback,
      label_ru: nameRu || fallback,
      label_en: nameEn || fallback,
      price: optionPrice,
      price_delta: Math.max(0, optionPrice - parentPrice),
      stock_count: stockCount,
      available: true,
      public_hidden: !!option.public_hidden,
      waiter_hidden: !!option.waiter_hidden,
    }
  }).filter(Boolean)

  if (normalizedOptions.length === 0) return []
  return [{
    id: 'variants',
    title_uz: 'Variantlar',
    title_ru: 'Варианты',
    title_en: 'Variants',
    required: true,
    options: normalizedOptions,
  }]
}

function editorToVariantCosts(options) {
  return Object.fromEntries((options || []).flatMap((option, optionIndex) => {
    if (String(option?.cost_price ?? '').trim() === '') return []
    const id = safeOptionId(option?.id, `option_${optionIndex + 1}`)
    const cost = Math.max(0, Math.round(numberFromMoneyInput(option.cost_price)))
    return [[id, cost]]
  }))
}

function OptionGroupsEditor({ value = [], onChange, lang, parentCost = '' }) {
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(null)

  function updateOption(optionIndex, patch) {
    onChange(value.map((option, index) => index === optionIndex ? { ...option, ...patch } : option))
  }

  function addOption() {
    onChange([
      ...value,
      {
        id: `option-${Date.now()}`,
        name_uz: '',
        name_ru: '',
        name_en: '',
        price: '',
        cost_price: '',
        stock_count: '',
        public_hidden: false,
        waiter_hidden: false,
      },
    ])
  }

  function removeOption(index) {
    onChange(value.filter((_, itemIndex) => itemIndex !== index))
    setPendingDeleteIndex(null)
  }

  const labels = {
    title: lang === 'uz' ? 'Variantlar' : lang === 'ru' ? 'Варианты' : 'Variants',
    add: lang === 'uz' ? 'Variant qo‘shish' : lang === 'ru' ? 'Добавить вариант' : 'Add variant',
    nameUz: lang === 'uz' ? 'Nomi (UZ)' : lang === 'ru' ? 'Название (UZ)' : 'Name (UZ)',
    nameRu: lang === 'uz' ? 'Nomi (RU)' : lang === 'ru' ? 'Название (RU)' : 'Name (RU)',
    nameEn: lang === 'uz' ? 'Nomi (EN)' : lang === 'ru' ? 'Название (EN)' : 'Name (EN)',
    price: lang === 'uz' ? 'Narx' : lang === 'ru' ? 'Цена' : 'Price',
    cost: lang === 'uz' ? 'Haqiqiy tannarx' : lang === 'ru' ? 'Реальная себестоимость' : 'Real cost',
    stock: lang === 'uz' ? 'Qoldiq' : lang === 'ru' ? 'Остаток' : 'Stock',
    visibility: lang === 'uz' ? 'Ko‘rinish' : lang === 'ru' ? 'Видимость' : 'Visibility',
    publicMenu: lang === 'uz' ? 'Ommaviy menyu' : lang === 'ru' ? 'Публичное меню' : 'Public menu',
    waiterMenu: lang === 'uz' ? 'Ofitsiant menyusi' : lang === 'ru' ? 'Меню официанта' : 'Waiter menu',
    visible: lang === 'uz' ? 'Ko‘rinadi' : lang === 'ru' ? 'Видно' : 'Visible',
    hidden: lang === 'uz' ? 'Yashirilgan' : lang === 'ru' ? 'Скрыто' : 'Hidden',
    empty: lang === 'uz' ? 'Mahsulotda variantlar bo‘lsa qo‘shing.' : lang === 'ru' ? 'Добавьте варианты, если они есть у товара.' : 'Add variants when this item has choices.',
    deleteTitle: lang === 'uz' ? 'Variantni o‘chirish' : lang === 'ru' ? 'Удалить вариант' : 'Delete variant',
    deletePrompt: lang === 'uz'
      ? 'Bu variantni o‘chirishni xohlaysizmi? Bu amal mahsulot saqlanganda qo‘llanadi.'
      : lang === 'ru'
        ? 'Удалить этот вариант? Изменение будет применено после сохранения товара.'
        : 'Delete this variant? The change will be applied when the product is saved.',
    cancel: lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel',
    confirmDelete: lang === 'uz' ? 'Variantni o‘chirish' : lang === 'ru' ? 'Удалить вариант' : 'Delete variant',
  }

  const pendingDeleteOption = pendingDeleteIndex === null ? null : value[pendingDeleteIndex]
  const pendingDeleteName = pendingDeleteOption
    ? (pendingDeleteOption[`name_${lang}`] || pendingDeleteOption.name_ru || pendingDeleteOption.name_uz || pendingDeleteOption.name_en || '')
    : ''

  return (
    <>
    <div className="rounded-xl border border-[#e4e1de] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="ws-heading flex items-center gap-2">{labels.title}<span className="ws-count">{value.length}</span></label>
        <button
          type="button"
          onClick={addOption}
          className="ws-btn ws-btn-outline ws-btn-sm"
        >
          <Plus size={13} />
          {labels.add}
        </button>
      </div>

      {value.length === 0 ? (
        <p className="ws-caption rounded-[10px] border border-dashed border-[#dcd9d6] bg-[#f6f5f3] px-3 py-3">{labels.empty}</p>
      ) : (
        <div className="space-y-3">
          {value.map((option, optionIndex) => {
            const hasOwnCost = String(option.cost_price ?? '').trim() !== ''
            const effectiveCost = hasOwnCost ? option.cost_price : parentCost
            return (
            <div key={option.id || optionIndex} className="min-w-0 rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] p-3">
              <div className="grid min-w-0 gap-2 md:grid-cols-3">
                <label className="min-w-0">
                  <span className="ws-caption mb-1 block font-medium">{labels.nameUz}</span>
                  <input
                    type="text"
                    value={option.name_uz}
                    onChange={event => updateOption(optionIndex, { name_uz: event.target.value })}
                    placeholder={labels.nameUz}
                    className="ws-input"
                  />
                </label>
                <label className="min-w-0">
                  <span className="ws-caption mb-1 block font-medium">{labels.nameRu}</span>
                  <input
                    type="text"
                    value={option.name_ru}
                    onChange={event => updateOption(optionIndex, { name_ru: event.target.value })}
                    placeholder={labels.nameRu}
                    className="ws-input"
                  />
                </label>
                <label className="min-w-0">
                  <span className="ws-caption mb-1 block font-medium">{labels.nameEn}</span>
                  <input
                    type="text"
                    value={option.name_en}
                    onChange={event => updateOption(optionIndex, { name_en: event.target.value })}
                    placeholder={labels.nameEn}
                    className="ws-input"
                  />
                </label>
              </div>
              <div className="mt-3 grid min-w-0 items-end gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                  <MoneyField
                    label={labels.price}
                    value={option.price}
                    onChange={event => updateOption(optionIndex, { price: event.target.value })}
                    placeholder={labels.price}
                    labelClassName="ws-caption mb-1.5 flex h-10 items-end font-medium leading-4"
                    className="ws-input tabular-nums"
                  />
                  <MoneyField
                    label={labels.cost}
                    value={option.cost_price}
                    onChange={event => updateOption(optionIndex, { cost_price: event.target.value })}
                    placeholder={String(parentCost || '').trim() || labels.cost}
                    labelClassName="ws-caption mb-1.5 flex h-10 items-end font-medium leading-4"
                    className="ws-input tabular-nums"
                  />
                  <label className="min-w-0">
                    <span className="ws-caption mb-1.5 flex h-10 items-end font-medium leading-4">{labels.stock}</span>
                    <input
                      type="number"
                      min="0"
                      value={option.stock_count}
                      onChange={event => updateOption(optionIndex, { stock_count: event.target.value })}
                      placeholder={labels.stock}
                      className="ws-input tabular-nums"
                    />
                  </label>
                </div>
                <div className="min-w-0">
                  <span className="ws-caption mb-1.5 flex h-10 items-end font-medium leading-4">{labels.visibility}</span>
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="ws-segmented !grid min-w-0 flex-1 grid-cols-2 xl:flex-none">
                      {[
                        ['public_hidden', labels.publicMenu],
                        ['waiter_hidden', labels.waiterMenu],
                      ].map(([field, menuLabel]) => {
                        const hidden = !!option[field]
                        return (
                          <button
                            key={field}
                            type="button"
                            onClick={() => updateOption(optionIndex, { [field]: !hidden })}
                            title={`${menuLabel}: ${hidden ? labels.hidden : labels.visible}`}
                            aria-label={`${menuLabel}: ${hidden ? labels.hidden : labels.visible}`}
                            aria-pressed={!hidden}
                            className={`min-w-0 !px-3 !text-[13px] xl:min-w-[132px] ${hidden ? '' : '!text-[#1d7a52]'}`}
                          >
                            {hidden ? <EyeOff size={14} className="flex-shrink-0" /> : <Eye size={14} className="flex-shrink-0" />}
                            <span className="truncate">{menuLabel}</span>
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteIndex(optionIndex)}
                      aria-label={labels.deleteTitle}
                      title={labels.deleteTitle}
                      className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm ws-btn-icon !h-11 !w-11"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <ProfitMarginPreview price={option.price} cost={effectiveCost} lang={lang} inheritedCost={!hasOwnCost} />
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
    {pendingDeleteOption && (
      <Modal title={labels.deleteTitle} onClose={() => setPendingDeleteIndex(null)}>
        <p className="ws-muted">
          {labels.deletePrompt}
        </p>
        {pendingDeleteName && (
          <p className="mt-3 rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] px-3 py-2.5 text-sm font-semibold text-[#22201d]">
            {pendingDeleteName}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingDeleteIndex(null)}
            className="ws-btn ws-btn-outline"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={() => removeOption(pendingDeleteIndex)}
            className="ws-btn ws-btn-danger-solid"
          >
            <Trash2 size={15} />
            {labels.confirmDelete}
          </button>
        </div>
      </Modal>
    )}
    </>
  )
}

function menuItemToProductForm(i) {
  const mediaUrls = getMenuItemMediaUrls(i)
  const normalizedText = trimMenuItemTextFields(i)
  return {
    ...blankItem,
    ...i,
    ...normalizedText,
    cost_price: i.cost_price ?? i.costPrice ?? '',
    sale_unit: normalizeMenuSaleUnit(i.sale_unit ?? i.saleUnit),
    millilitres: i.millilitres ?? i.milliliters ?? (Number(i.litres ?? i.liters) > 0 ? Math.round(Number(i.litres ?? i.liters) * 1000) : ''),
    stock_count: i.stock_count ?? i.stockCount ?? 0,
    estimated_prep_minutes: normalizeMenuPrepMinutes(i.estimated_prep_minutes ?? i.estimatedPrepMinutes),
    sort_order: i.sort_order ?? 0,
    show_in_cashier_quick_items: isCashierQuickItem(i),
    cashier_only: !!(i.cashier_only || i.cashierOnly),
    public_hidden: !!(i.public_hidden || i.publicHidden || i.hide_from_public || i.hideFromPublic),
    visible_from_time: String(i.visible_from_time || i.visibleFromTime || '').slice(0, 5),
    visible_until_time: String(i.visible_until_time || i.visibleUntilTime || '').slice(0, 5),
    send_to_kitchen: !!(i.send_to_kitchen || i.sendToKitchen),
    quick_item_sort_order: i.quick_item_sort_order ?? i.quickItemSortOrder ?? '',
    variant_costs: i.variant_costs ?? i.variantCosts ?? {},
    image_url: mediaUrls[0] || '',
    media_urls: mediaUrls,
    option_groups_editor: optionGroupsToEditor(
      i.option_groups ?? i.optionGroups,
      i.variant_costs ?? i.variantCosts,
    ),
  }
}

function getItemFormFingerprint(form = {}) {
  const normalizedText = trimMenuItemTextFields(form)
  return JSON.stringify({
    category_id: String(form.category_id || ''),
    name_uz: normalizedText.name_uz || '',
    name_ru: normalizedText.name_ru || '',
    name_en: normalizedText.name_en || '',
    description_uz: normalizedText.description_uz || '',
    description_ru: normalizedText.description_ru || '',
    description_en: normalizedText.description_en || '',
    image_url: String(form.image_url || ''),
    media_urls: normalizeMenuMediaUrls(form.media_urls),
    price: numberFromMoneyInput(form.price),
    old_price: Math.max(0, Math.round(numberFromMoneyInput(form.old_price))),
    cost_price: Math.max(0, Math.round(numberFromMoneyInput(form.cost_price))),
    variant_costs: editorToVariantCosts(form.option_groups_editor),
    sale_unit: normalizeMenuSaleUnit(form.sale_unit),
    grams: Math.max(0, Math.round(Number(form.grams) || 0)),
    millilitres: Math.max(0, Math.round(Number(form.millilitres) || 0)),
    kcal: Math.max(0, Math.round(Number(form.kcal) || 0)),
    stock_count: Math.max(0, Math.round(Number(form.stock_count) || 0)),
    estimated_prep_minutes: normalizeMenuPrepMinutes(form.estimated_prep_minutes),
    sort_order: Number(form.sort_order) || 0,
    quick_item_sort_order: Number(form.quick_item_sort_order) || 0,
    available: !!form.available,
    show_in_cashier_quick_items: !!form.show_in_cashier_quick_items,
    cashier_only: !!form.cashier_only,
    public_hidden: !!form.public_hidden,
    visible_from_time: nullableMenuTime(form.visible_from_time),
    visible_until_time: nullableMenuTime(form.visible_until_time),
    send_to_kitchen: !!form.send_to_kitchen,
    option_groups: editorToOptionGroups(form.option_groups_editor, form.price),
  })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminMenu() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const { loaded, loadError } = useAppDataStatus()
  const lang = state.lang
  const canEditMenu = canEditMenuForProfile(profile || { role: state.user?.role })
  const isOwner = normalizeRole(profile?.role || state.user?.role) === 'owner'
  const canChangeAvailability = canChangeMenuItemAvailability(profile || { role: state.user?.role })
  const canChangePublicVisibility = canChangeMenuItemPublicVisibility(profile || { role: state.user?.role })
  const canDeleteMenuCatalog = canDeleteMenuCatalogForProfile(profile || { role: state.user?.role })
  const canViewTechCards = canViewPage(profile || { role: state.user?.role }, 'tech_cards')
  const scheduleLabels = menuScheduleLabels(lang)
  const navigate = useNavigate()
  const { productId, categoryId } = useParams()
  const [searchParams] = useSearchParams()
  const isProductEditorPage = !!productId
  const isCategoryEditorPage = !!categoryId
  const isMenuEditorPage = isProductEditorPage || isCategoryEditorPage

  const [tab,        setTab]        = useState(['categories', 'archive'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'items')
  const [itemModal,  setItemModal]  = useState(null)
  const [catModal,   setCatModal]   = useState(null)
  const [form,       setForm]       = useState(blankItem)
  const [catForm,    setCatForm]    = useState(blankCat)
  const [search,     setSearch]     = useState('')
  const [filterCat,  setFilterCat]  = useState('all')
  const [filterAvail,setFilterAvail]= useState('all')
  const [gridView,   setGridView]   = useState(true)
  const [activeId,   setActiveId]   = useState(null) // drag overlay
  const [savingItemId, setSavingItemId] = useState('')
  const [deleteItemCandidate, setDeleteItemCandidate] = useState(null)
  const [deleteCategoryCandidate, setDeleteCategoryCandidate] = useState(null)
  const [deleteItemError, setDeleteItemError] = useState('')
  const [savingCatId, setSavingCatId] = useState('')
  const [restoringId, setRestoringId] = useState('')
  const [archiveSearch, setArchiveSearch] = useState('')
  const [savingItemForm, setSavingItemForm] = useState(false)
  const [savingCatForm, setSavingCatForm] = useState(false)
  const [originalItemFormFingerprint, setOriginalItemFormFingerprint] = useState('')
  const [originalCatFormFingerprint, setOriginalCatFormFingerprint] = useState('')
  const [menuNotice, setMenuNotice] = useState(null)
  const [categoryOverrideProfiles, setCategoryOverrideProfiles] = useState([])
  const [categoryOverrideProfilesReady, setCategoryOverrideProfilesReady] = useState(false)
  const [categoryOverrideProfilesLoading, setCategoryOverrideProfilesLoading] = useState(false)
  const [categoryOverrideProfilesError, setCategoryOverrideProfilesError] = useState('')
  const uploadedItemImageUrlsRef = useRef(new Set())
  const uploadedCatImageUrlsRef = useRef(new Set())
  const productEditorInitializedRef = useRef('')
  const categoryEditorInitializedRef = useRef('')
  const shellScrollRef = useRef(null)
  const deleteDialogRef = useRef(null)
  const deleteCancelButtonRef = useRef(null)
  const currentItemFormFingerprint = useMemo(() => getItemFormFingerprint(form), [form])
  const isItemFormDirty = itemModal === 'new'
    || (itemModal === 'edit' && !!originalItemFormFingerprint && currentItemFormFingerprint !== originalItemFormFingerprint)
  const hasValidNewItemCost = itemModal !== 'new' || hasRequiredMenuItemCost(form.cost_price)
  const hasRequiredNewItemImage = itemModal !== 'new' || hasMenuItemImage(form.media_urls)
  const canSaveItemForm = !savingItemForm
    && canEditMenu
    && !!trimMenuItemTextValue(form.name_uz)
    && !!form.price
    && !!form.category_id
    && hasValidNewItemCost
    && hasRequiredNewItemImage
    && isItemFormDirty
  const currentCatFormFingerprint = useMemo(() => getCategoryFormFingerprint(catForm), [catForm])
  const isCatFormDirty = catModal === 'new'
    || (catModal === 'edit' && !!originalCatFormFingerprint && currentCatFormFingerprint !== originalCatFormFingerprint)
  const canSaveCatForm = !savingCatForm
    && canEditMenu
    && !!trimMenuItemTextValue(catForm.name_uz)
    && isCatFormDirty

  // One archive dialog serves both products and categories.
  const archiveCandidate = deleteItemCandidate || deleteCategoryCandidate
  const archiveCandidateIsCategory = !deleteItemCandidate && !!deleteCategoryCandidate
  const archivePending = !!archiveCandidate && (archiveCandidateIsCategory ? savingCatId : savingItemId) === archiveCandidate.id

  useEffect(() => {
    if (!archiveCandidate || !canDeleteMenuCatalog) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => deleteCancelButtonRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [canDeleteMenuCatalog, archiveCandidate?.id])

  useEffect(() => {
    if (!isCategoryEditorPage || !isOwner) return undefined
    let active = true
    setCategoryOverrideProfilesLoading(true)
    setCategoryOverrideProfilesReady(false)
    setCategoryOverrideProfilesError('')
    supabase
      .from('profiles')
      .select('id, full_name, email, role, status')
      .eq('status', 'active')
      .neq('role', 'guest')
      .order('full_name')
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setCategoryOverrideProfiles([])
          setCategoryOverrideProfilesError(error.message || 'Could not load users')
        } else {
          setCategoryOverrideProfiles(data || [])
          setCategoryOverrideProfilesReady(true)
        }
        setCategoryOverrideProfilesLoading(false)
      })
      .catch(error => {
        if (!active) return
        setCategoryOverrideProfiles([])
        setCategoryOverrideProfilesError(error?.message || 'Could not load users')
        setCategoryOverrideProfilesLoading(false)
      })
    return () => { active = false }
  }, [isCategoryEditorPage, isOwner])

  function handleDeleteDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!archivePending) closeDeleteItemDialog()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(deleteDialogRef.current?.querySelectorAll('button:not([disabled])') || [])
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Sensors: pointer (mouse/trackpad) + touch
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  // ── Sorted data ────────────────────────────────────────────────────────────
  const sortedCategories = useMemo(() =>
    [...state.categories].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.categories]
  )
  const realSortedCats = useMemo(() =>
    sortedCategories.filter(c => c.id !== 'all' && isActiveMenuCategory(c)),
    [sortedCategories]
  )

  const sortedItems = useMemo(() =>
    state.menuItems
      .filter(isActiveMenuItem)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.menuItems]
  )

  const archivedCategories = useMemo(() =>
    state.categories
      .filter(c => c.id !== 'all' && isDeletedMenuCategory(c))
      .sort((a, b) => String(b.deleted_at || '').localeCompare(String(a.deleted_at || ''))),
    [state.categories]
  )

  const archivedItems = useMemo(() =>
    state.menuItems
      .filter(isDeletedMenuItem)
      .sort((a, b) => String(b.deleted_at || '').localeCompare(String(a.deleted_at || ''))),
    [state.menuItems]
  )

  const quickItems = useMemo(() =>
    sortedItems
      .filter(isCashierQuickItem)
      .sort((a, b) => getQuickItemSortOrder(a) - getQuickItemSortOrder(b)),
    [sortedItems]
  )

  const filteredItems = useMemo(() => {
    return sortedItems.filter(item => {
      const matchAvail  = filterAvail === 'all'
        || (filterAvail === 'available' && item.available && !item.cashier_only)
        || (filterAvail === 'hidden' && !item.available)
        || (filterAvail === 'cashier_only' && !!item.cashier_only)
        || (filterAvail === 'public_hidden' && !!item.public_hidden)
      const q           = search.trim().toLowerCase()
      const externalId  = String(item.external_id || item.externalId || '').toLowerCase()
      const matchSearch = !q || getItemName(item, lang).toLowerCase().includes(q) || externalId.includes(q)
      return (matchAvail || savingItemId === item.id) && matchSearch
    })
  }, [sortedItems, filterAvail, search, lang, savingItemId])

  const itemCountByCat = useMemo(() => {
    const m = { all: sortedItems.length }
    sortedItems.forEach(i => { m[i.category_id] = (m[i.category_id] || 0) + 1 })
    return m
  }, [sortedItems])

  async function cleanupTrackedUploads(ref, keepUrls = []) {
    const keep = new Set(keepUrls.filter(Boolean))
    const staleUrls = [...ref.current].filter(url => !keep.has(url))
    ref.current.clear()
    await Promise.allSettled(staleUrls.map(url => deleteMenuImageFromR2(url)))
  }

  async function handleTrackedUpload(ref, { newUrl, previousUrl }) {
    if (newUrl) ref.current.add(newUrl)
    if (previousUrl && previousUrl !== newUrl && ref.current.has(previousUrl)) {
      ref.current.delete(previousUrl)
      await deleteMenuImageFromR2(previousUrl).catch(() => {})
    }
  }

  useEffect(() => {
    if (!loaded || !isProductEditorPage) return
    if (productEditorInitializedRef.current === productId) return
    productEditorInitializedRef.current = productId
    uploadedItemImageUrlsRef.current.clear()

    if (!canEditMenu) {
      navigate('/admin/menu', { replace: true })
      return
    }

    if (productId === 'new') {
      const maxOrder = sortedItems.length > 0
        ? Math.max(...sortedItems.map(i => i.sort_order ?? 0)) : 0
      const maxQuickOrder = quickItems.length > 0
        ? Math.max(...quickItems.map(i => getQuickItemSortOrder(i))) : 0
      const quick = searchParams.get('quick') === '1'
      if (quick) {
        const nextForm = {
          ...blankItem,
          id: 'i' + Date.now(),
          external_id: generateMenuExternalId(),
          sort_order: maxOrder + 1,
          show_in_cashier_quick_items: true,
          cashier_only: false,
          public_hidden: false,
          send_to_kitchen: false,
          quick_item_sort_order: maxQuickOrder + 1,
          option_groups_editor: [],
        }
        setForm(nextForm)
        setOriginalItemFormFingerprint(getItemFormFingerprint(nextForm))
      } else {
        const nextForm = {
          ...blankItem,
          id: 'i' + Date.now(),
          external_id: generateMenuExternalId(),
          sort_order: maxOrder + 1,
          show_in_cashier_quick_items: false,
          cashier_only: false,
          public_hidden: false,
          send_to_kitchen: false,
          quick_item_sort_order: '',
          option_groups_editor: [],
        }
        setForm(nextForm)
        setOriginalItemFormFingerprint(getItemFormFingerprint(nextForm))
      }
      setItemModal('new')
      return
    }

    const item = sortedItems.find(row => row.id === productId)
    if (!item) {
      navigate('/admin/menu', { replace: true })
      return
    }
    const nextForm = menuItemToProductForm(item)
    setForm(nextForm)
    setOriginalItemFormFingerprint(getItemFormFingerprint(nextForm))
    setItemModal('edit')
  }, [loaded, isProductEditorPage, productId, quickItems, searchParams, sortedItems, navigate, canEditMenu])

  useEffect(() => {
    if (!loaded || !isCategoryEditorPage) return
    if (categoryEditorInitializedRef.current === categoryId) return
    categoryEditorInitializedRef.current = categoryId
    uploadedCatImageUrlsRef.current.clear()

    if (!canEditMenu) {
      navigate('/admin/menu?tab=categories', { replace: true })
      return
    }

    if (categoryId === 'new') {
      const maxOrder = realSortedCats.length > 0
        ? Math.max(...realSortedCats.map(category => category.sort_order ?? 0))
        : 0
      const nextForm = {
        ...blankCat,
        id: 'c' + Date.now(),
        sort_order: maxOrder + 1,
      }
      setCatForm(nextForm)
      setOriginalCatFormFingerprint(getCategoryFormFingerprint(nextForm))
      setCatModal('new')
      return
    }

    const category = realSortedCats.find(row => row.id === categoryId)
    if (!category) {
      navigate('/admin/menu?tab=categories', { replace: true })
      return
    }
    const nextForm = {
      ...blankCat,
      ...category,
      sort_order: category.sort_order ?? 0,
      hidden: !!category.hidden,
      waiter_hidden: !!(category.waiter_hidden || category.waiterHidden || category.hide_from_waiter || category.hideFromWaiter),
      tourist_hidden: !!(category.tourist_hidden || category.touristHidden || category.hide_from_tourist || category.hideFromTourist),
      visible_from_time: String(category.visible_from_time || category.visibleFromTime || '').slice(0, 5),
      visible_until_time: String(category.visible_until_time || category.visibleUntilTime || '').slice(0, 5),
      always_visible_profile_ids: normalizeCategoryAlwaysVisibleProfileIds(category.always_visible_profile_ids),
    }
    setCatForm(nextForm)
    setOriginalCatFormFingerprint(getCategoryFormFingerprint(nextForm))
    setCatModal('edit')
  }, [loaded, isCategoryEditorPage, categoryId, realSortedCats, navigate, canEditMenu])

  useEffect(() => {
    if (!loaded || isMenuEditorPage) return undefined
    const savedScrollTop = takeSavedAdminMenuScrollPosition()
    if (savedScrollTop == null) return undefined

    let frameId = 0
    let cancelled = false

    function restore(attemptsLeft = 10) {
      if (cancelled) return
      const scroller = shellScrollRef.current
      if (scroller) {
        scroller.scrollTop = savedScrollTop
        if (Math.abs(scroller.scrollTop - savedScrollTop) <= 2 || attemptsLeft <= 0) {
          clearSavedAdminMenuScrollPosition()
          return
        }
      }
      frameId = window.requestAnimationFrame(() => restore(attemptsLeft - 1))
    }

    frameId = window.requestAnimationFrame(() => restore())
    return () => {
      cancelled = true
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [loaded, isMenuEditorPage, tab, filteredItems.length])

  // ── Item CRUD ──────────────────────────────────────────────────────────────
  function saveMenuListScrollBeforeProductNavigation() {
    saveAdminMenuScrollPosition(shellScrollRef.current?.scrollTop || 0)
  }

  function openNewItem() {
    if (!canEditMenu) return
    saveMenuListScrollBeforeProductNavigation()
    navigate('/admin/menu/product/new')
  }
  function openNewQuickItem() {
    if (!canEditMenu) return
    saveMenuListScrollBeforeProductNavigation()
    navigate('/admin/menu/product/new?quick=1')
  }
  function openEditItem(i) {
    if (!canEditMenu) return
    saveMenuListScrollBeforeProductNavigation()
    navigate(`/admin/menu/product/${encodeURIComponent(i.id)}`)
  }
  async function closeItemModal() {
    if (savingItemForm) return
    await cleanupTrackedUploads(uploadedItemImageUrlsRef)
    setItemModal(null)
    if (isProductEditorPage) {
      productEditorInitializedRef.current = ''
      navigate('/admin/menu')
    }
  }
  async function saveItem() {
    if (savingItemForm || !canEditMenu || !isItemFormDirty) return
    if (!trimMenuItemTextValue(form.name_uz) || !form.price || !form.category_id) return
    const requiredCost = itemModal === 'new' ? getRequiredMenuItemCost(form.cost_price) : null
    if (itemModal === 'new' && requiredCost === null) {
      setMenuNotice({
        tone: 'error',
        message: lang === 'uz'
          ? 'Yangi mahsulot uchun haqiqiy tannarxni kiriting.'
          : lang === 'ru'
            ? 'Укажите реальную себестоимость нового товара.'
            : 'Enter the real cost for the new product.',
      })
      return
    }
    if (itemModal === 'new' && !hasMenuItemImage(form.media_urls)) {
      setMenuNotice({ error: new Error('menu_item_image_required'), actionType: 'ADD_MENU_ITEM' })
      return
    }
    setSavingItemForm(true)
    setMenuNotice(null)
    try {
      const optionGroups = editorToOptionGroups(form.option_groups_editor, form.price)
      const existingItem = itemModal === 'edit'
        ? state.menuItems.find(item => item.id === form.id)
        : null
      const savedAvailability = canChangeAvailability
        ? !!form.available
        : (existingItem ? existingItem.available !== false : true)
      const savedPublicHidden = canChangePublicVisibility
        ? !!form.public_hidden
        : (existingItem ? isPublicHiddenMenuItem(existingItem) : false)
      const oldMediaUrls = getMenuItemMediaUrls(existingItem)
      const mediaUrls = normalizeMenuMediaUrls(form.media_urls)
      const {
        option_groups_editor: _optionGroupsEditor,
        option_groups: _optionGroups,
        cost_source: _costSource,
        waiter_hidden: _legacyWaiterHidden,
        ...formFields
      } = form
      const result = await dispatch({
        type: itemModal === 'new' ? 'ADD_MENU_ITEM' : 'UPDATE_MENU_ITEM',
        payload: {
          ...formFields,
          image_url: mediaUrls[0] || '',
          media_urls: mediaUrls,
          option_groups: optionGroups,
          available: savedAvailability,
          external_id: itemModal === 'new' ? String(form.external_id || generateMenuExternalId()).trim() : state.menuItems.find(item => item.id === form.id)?.external_id,
          price: numberFromMoneyInput(form.price),
          old_price: Math.max(0, Math.round(numberFromMoneyInput(form.old_price))),
          cost_price: itemModal === 'new'
            ? requiredCost
            : Math.max(0, Math.round(numberFromMoneyInput(form.cost_price))),
          variant_costs: editorToVariantCosts(form.option_groups_editor),
          sale_unit: normalizeMenuSaleUnit(form.sale_unit),
          grams: Math.max(0, Math.round(Number(form.grams) || 0)),
          millilitres: Math.max(0, Math.round(Number(form.millilitres) || 0)),
          kcal: Math.max(0, Math.round(Number(form.kcal) || 0)),
          stock_count: Math.max(0, Math.round(Number(form.stock_count) || 0)),
          estimated_prep_minutes: normalizeMenuPrepMinutes(form.estimated_prep_minutes),
          sort_order: Number(form.sort_order) || 0,
          quick_item_sort_order: Number(form.quick_item_sort_order) || 0,
          show_in_cashier_quick_items: !!form.show_in_cashier_quick_items,
          cashier_only: !!form.cashier_only,
          public_hidden: savedPublicHidden,
          visible_from_time: nullableMenuTime(form.visible_from_time),
          visible_until_time: nullableMenuTime(form.visible_until_time),
          send_to_kitchen: !!form.send_to_kitchen,
        },
      })
      if (result?.error) {
        setMenuNotice({ tone: 'error', message: result.error.message || saveFailedLabel(lang) })
        return
      }
      await cleanupTrackedUploads(uploadedItemImageUrlsRef, mediaUrls)
      const keptMediaUrls = new Set(mediaUrls)
      await Promise.allSettled(
        oldMediaUrls
          .filter(url => !keptMediaUrls.has(url))
          .map(url => deleteMenuImageFromR2(url))
      )
      setItemModal(null)
      if (isProductEditorPage) {
        productEditorInitializedRef.current = ''
        navigate('/admin/menu')
      }
    } finally {
      setSavingItemForm(false)
    }
  }
  async function toggleItemVisibility(item) {
    if (!canChangeAvailability || !item?.id || savingItemId) return
    setSavingItemId(item.id)
    setMenuNotice(null)
    try {
      const result = await dispatch({
        type: 'UPDATE_MENU_ITEM',
        payload: { ...item, available: !item.available },
      })
      if (result?.error) {
        setMenuNotice({ tone: 'error', message: result.error.message || saveFailedLabel(lang) })
      }
    } finally {
      setSavingItemId('')
    }
  }
  async function deleteItem(id) {
    if (!canDeleteMenuCatalog || savingItemId) return
    setSavingItemId(id)
    setMenuNotice(null)
    setDeleteItemError('')
    try {
      const result = await dispatch({ type: 'DELETE_MENU_ITEM', payload: id })
      if (result?.error) {
        const message = result.error.message || saveFailedLabel(lang)
        setMenuNotice({ tone: 'error', message })
        setDeleteItemError(message)
        return
      }
      setDeleteItemCandidate(null)
      setDeleteItemError('')
    } catch (error) {
      const message = error?.message || saveFailedLabel(lang)
      setMenuNotice({ tone: 'error', message })
      setDeleteItemError(message)
    } finally {
      setSavingItemId('')
    }
  }

  async function restoreArchived(type, id) {
    if (!canDeleteMenuCatalog || restoringId || !id) return
    setRestoringId(id)
    setMenuNotice(null)
    try {
      const result = await dispatch({ type, payload: id })
      if (result?.error) {
        setMenuNotice({ tone: 'error', message: result.error.message || saveFailedLabel(lang) })
        return
      }
      const labels = archiveLabels(lang)
      setMenuNotice({ tone: 'success', message: type === 'RESTORE_CATEGORY' ? labels.categoryRestored : labels.itemRestored })
    } catch (error) {
      setMenuNotice({ tone: 'error', message: error?.message || saveFailedLabel(lang) })
    } finally {
      setRestoringId('')
    }
  }

  function requestDeleteItem(item) {
    if (!canDeleteMenuCatalog || savingItemId || !item?.id) return
    setDeleteItemError('')
    setDeleteItemCandidate(item)
  }

  function closeDeleteItemDialog() {
    if (archivePending) return
    setDeleteItemCandidate(null)
    setDeleteCategoryCandidate(null)
    setDeleteItemError('')
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────
  function openNewCat() {
    if (!canEditMenu) return
    saveMenuListScrollBeforeProductNavigation()
    navigate('/admin/menu/category/new')
  }
  function openEditCat(c) {
    if (!canEditMenu) return
    saveMenuListScrollBeforeProductNavigation()
    navigate(`/admin/menu/category/${encodeURIComponent(c.id)}`)
  }
  async function closeCatModal() {
    if (savingCatForm) return
    await cleanupTrackedUploads(uploadedCatImageUrlsRef)
    setCatModal(null)
    setOriginalCatFormFingerprint('')
    if (isCategoryEditorPage) {
      categoryEditorInitializedRef.current = ''
      setTab('categories')
      navigate('/admin/menu?tab=categories')
    }
  }
  async function saveCat() {
    if (savingCatForm || !canEditMenu || !isCatFormDirty) return
    if (!trimMenuItemTextValue(catForm.name_uz)) return
    if (isOwner && !categoryOverrideProfilesReady) {
      setMenuNotice({ tone: 'error', error: { code: 'POS_CATEGORY_STAFF_NOT_LOADED' }, actionType: 'UPDATE_CATEGORY' })
      return
    }
    setSavingCatForm(true)
    setMenuNotice(null)
    try {
      const oldImageUrl = catModal === 'edit'
        ? state.categories.find(category => category.id === catForm.id)?.image_url
        : ''
      const { always_visible_profile_ids: _scheduleOverrides, ...categoryFormFields } = catForm
      const result = await dispatch({
        type: catModal === 'new' ? 'ADD_CATEGORY' : 'UPDATE_CATEGORY',
        payload: {
          ...categoryFormFields,
          name_uz: trimMenuItemTextValue(catForm.name_uz),
          name_ru: trimMenuItemTextValue(catForm.name_ru),
          name_en: trimMenuItemTextValue(catForm.name_en),
          sort_order: Number(catForm.sort_order) || 0,
          hidden: !!catForm.hidden,
          waiter_hidden: !!catForm.waiter_hidden,
          tourist_hidden: !!catForm.tourist_hidden,
          visible_from_time: nullableMenuTime(catForm.visible_from_time),
          visible_until_time: nullableMenuTime(catForm.visible_until_time),
          ...(isOwner ? {
            always_visible_profile_ids: eligibleCategoryProfileIds(catForm.always_visible_profile_ids, categoryOverrideProfiles),
          } : {}),
        },
      })
      if (result?.error) {
        setMenuNotice({ tone: 'error', error: result.error, actionType: 'UPDATE_CATEGORY' })
        return
      }
      await cleanupTrackedUploads(uploadedCatImageUrlsRef, [catForm.image_url])
      if (oldImageUrl && oldImageUrl !== catForm.image_url) {
        await deleteMenuImageFromR2(oldImageUrl)
      }
      setCatModal(null)
      setOriginalCatFormFingerprint('')
      if (isCategoryEditorPage) {
        categoryEditorInitializedRef.current = ''
        setTab('categories')
        navigate('/admin/menu?tab=categories')
      }
    } finally {
      setSavingCatForm(false)
    }
  }
  async function toggleCategoryVisibility(cat) {
    if (!canEditMenu || !cat?.id || cat.id === 'all' || savingCatId) return
    setSavingCatId(cat.id)
    setMenuNotice(null)
    try {
      const result = await dispatch({
        type: 'UPDATE_CATEGORY',
        payload: { ...cat, hidden: !cat.hidden },
      })
      if (result?.error) {
        setMenuNotice({ tone: 'error', message: result.error.message || saveFailedLabel(lang) })
      }
    } finally {
      setSavingCatId('')
    }
  }
  function deleteCat(id) {
    if (!canDeleteMenuCatalog) return
    if (id === 'all' || savingCatId) return
    const category = realSortedCats.find(cat => cat.id === id)
    if (!category) return
    setDeleteItemError('')
    setDeleteCategoryCandidate(category)
  }

  async function archiveCategory(id) {
    if (!canDeleteMenuCatalog || savingCatId) return
    setSavingCatId(id)
    setMenuNotice(null)
    setDeleteItemError('')
    try {
      const result = await dispatch({ type: 'DELETE_CATEGORY', payload: id })
      if (result?.error) {
        const message = result.error.message || saveFailedLabel(lang)
        setMenuNotice({ tone: 'error', message })
        setDeleteItemError(message)
        return
      }
      setDeleteCategoryCandidate(null)
      setDeleteItemError('')
    } catch (error) {
      const message = error?.message || saveFailedLabel(lang)
      setMenuNotice({ tone: 'error', message })
      setDeleteItemError(message)
    } finally {
      setSavingCatId('')
    }
  }

  function setF(key)  { return e => setForm(f => ({ ...f, [key]: e.target.value })) }
  function trimF(key) { return () => setForm(f => ({ ...f, [key]: trimMenuItemTextValue(f[key]) })) }
  function setCF(key) { return e => setCatForm(f => ({ ...f, [key]: e.target.value })) }
  function trimCF(key) { return () => setCatForm(f => ({ ...f, [key]: trimMenuItemTextValue(f[key]) })) }
  function toggleCategoryScheduleOverride(profileId) {
    setCatForm(current => {
      const selectedProfileIds = new Set(normalizeCategoryAlwaysVisibleProfileIds(current.always_visible_profile_ids))
      if (selectedProfileIds.has(profileId)) selectedProfileIds.delete(profileId)
      else selectedProfileIds.add(profileId)
      return { ...current, always_visible_profile_ids: [...selectedProfileIds].sort() }
    })
  }

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function movedSortUpdates(rows, activeIdValue, overIdValue, sortKey = 'sort_order', getOrder = row => row?.[sortKey]) {
    const oldIndex = rows.findIndex(row => row.id === activeIdValue)
    const newIndex = rows.findIndex(row => row.id === overIdValue)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return []
    const sortSlots = rows.map((row, index) => {
      const value = Number(getOrder(row))
      return Number.isFinite(value) ? value : index + 1
    })
    return arrayMove(rows, oldIndex, newIndex).map((row, index) => ({
      id: row.id,
      [sortKey]: sortSlots[index],
    }))
  }

  function handleItemDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!canEditMenu) return
    if (!over || active.id === over.id) return
    const updates = movedSortUpdates(filteredItems, active.id, over.id)
    if (updates.length === 0) return
    dispatch({ type: 'REORDER_MENU_ITEM', payload: { updates } })
  }

  function handleCatDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!canEditMenu) return
    if (!over || active.id === over.id) return
    const updates = movedSortUpdates(realSortedCats, active.id, over.id)
    if (updates.length === 0) return
    dispatch({ type: 'REORDER_CATEGORY', payload: { updates } })
  }

  function handleQuickItemDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!canEditMenu) return
    if (!over || active.id === over.id) return
    const updates = movedSortUpdates(quickItems, active.id, over.id, 'quick_item_sort_order', getQuickItemSortOrder)
    if (updates.length === 0) return
    dispatch({ type: 'REORDER_QUICK_ITEM', payload: { updates } })
  }

  // Overlay item for drag ghost
  const activeItem = activeId ? filteredItems.find(i => i.id === activeId) : null
  const activeCat  = activeId ? realSortedCats.find(c => c.id === activeId) : null

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!loaded || loadError) {
    return (
      <AppShell title={t(lang, 'menu')} contentRef={shellScrollRef}>
        <div className="min-h-full bg-[#f6f5f3]">
          {!loaded ? (
            <OperationalLoading layout="cards"
              title={lang === 'uz' ? 'Menyu yuklanmoqda' : lang === 'ru' ? 'Загрузка меню' : 'Loading menu'}
              description={lang === 'uz' ? 'Kategoriyalar va mahsulotlar olinmoqda.' : lang === 'ru' ? 'Получаем категории и позиции.' : 'Fetching categories and items.'}
            />
          ) : (
            <OperationalError
              title={lang === 'uz' ? 'Menyuni yuklab bo‘lmadi' : lang === 'ru' ? 'Не удалось загрузить меню' : 'Could not load menu'}
              description={loadError}
              actionLabel={lang === 'uz' ? 'Qayta yuklash' : lang === 'ru' ? 'Перезагрузить' : 'Reload'}
              onAction={() => window.location.reload()}
            />
          )}
        </div>
      </AppShell>
    )
  }

  if (isCategoryEditorPage) {
    const editorTitle = catModal === 'new'
      ? t(lang, 'addCategory')
      : (lang === 'uz' ? 'Kategoriyani tahrirlash' : lang === 'ru' ? 'Редактировать категорию' : 'Edit Category')
    const categoryItemCount = catModal === 'edit' ? (itemCountByCat[catForm.id] || 0) : 0
    const publicVisible = !catForm.hidden
    const waiterVisible = !catForm.waiter_hidden
    const touristVisible = !catForm.tourist_hidden

    return (
      <AppShell
        title={editorTitle}
        back={{ label: t(lang, 'cancel'), onClick: closeCatModal }}
        headerActions={catModal ? (
          <button
            type="button"
            onClick={saveCat}
            disabled={!canSaveCatForm}
            className="ws-btn ws-btn-primary !h-[38px]"
          >
            {savingCatForm && <Loader2 size={16} className="animate-spin" />}
            {savingCatForm ? savingLabel(lang) : t(lang, 'save')}
          </button>
        ) : null}
      >
        <div className="min-h-full bg-[#f6f5f3]">
          <div className="ws-page">
            {menuNotice && (
              <div role="alert" className="ws-notice ws-tone-negative">
                {menuNotice.error ? formatWriteError(menuNotice.error, lang, menuNotice.actionType) : menuNotice.message}
              </div>
            )}
            {!catModal ? (
              <OperationalLoading layout="form"
                title={lang === 'uz' ? 'Kategoriya ochilmoqda' : lang === 'ru' ? 'Открываем категорию' : 'Opening category'}
                description={lang === 'uz' ? 'Ma’lumotlar tayyorlanmoqda.' : lang === 'ru' ? 'Подготавливаем данные.' : 'Preparing the editor.'}
              />
            ) : (
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <section className="ws-panel min-w-0 space-y-5 self-start overflow-hidden">
                  <div>
                    <h2 className="ws-display">
                      {lang === 'uz' ? 'Kategoriya ma’lumotlari' : lang === 'ru' ? 'Данные категории' : 'Category details'}
                    </h2>
                    <p className="ws-muted mt-1.5">
                      {lang === 'uz' ? 'Har bir menyu tili uchun aniq nom kiriting.' :
                       lang === 'ru' ? 'Укажите понятное название для каждого языка меню.' :
                       'Add a clear name for every menu language.'}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label={t(lang, 'nameUz')} value={catForm.name_uz} onChange={setCF('name_uz')} onBlur={trimCF('name_uz')} autoFocus />
                    <Field label={t(lang, 'nameRu')} value={catForm.name_ru} onChange={setCF('name_ru')} onBlur={trimCF('name_ru')} />
                    <Field label={t(lang, 'nameEn')} value={catForm.name_en} onChange={setCF('name_en')} onBlur={trimCF('name_en')} />
                  </div>

                  <div className="rounded-xl border border-[#e4e1de] bg-[#f6f5f3] p-4">
                    <p className="ws-caption mb-3 font-medium">
                      {lang === 'uz' ? 'Jonli ko‘rinish' : lang === 'ru' ? 'Предпросмотр' : 'Live preview'}
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-[#e4e1de] bg-white">
                        <SafeMenuImage
                          src={catForm.image_url}
                          alt={trimMenuItemTextValue(catForm[`name_${lang}`]) || trimMenuItemTextValue(catForm.name_uz)}
                          className="h-full w-full object-cover object-center"
                          fallbackClassName="h-full w-full"
                          iconSize={22}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-[#22201d]">
                          {trimMenuItemTextValue(catForm[`name_${lang}`]) || trimMenuItemTextValue(catForm.name_uz) || (lang === 'uz' ? 'Nomsiz kategoriya' : lang === 'ru' ? 'Категория без названия' : 'Untitled category')}
                        </p>
                        <p className="ws-caption mt-0.5">
                          {catModal === 'new'
                            ? (lang === 'uz' ? 'Yangi kategoriya' : lang === 'ru' ? 'Новая категория' : 'New category')
                            : (lang === 'uz' ? `${categoryItemCount} ta mahsulot` : lang === 'ru' ? `${categoryItemCount} позиций` : `${categoryItemCount} menu items`)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`ws-badge ${publicVisible ? 'ws-tone-positive' : ''}`}>
                            {publicVisible
                              ? (lang === 'uz' ? 'Ommaviy menyuda' : lang === 'ru' ? 'В публичном меню' : 'Public menu')
                              : (lang === 'uz' ? 'Ommaviy menyuda yashirin' : lang === 'ru' ? 'Скрыто публично' : 'Hidden publicly')}
                          </span>
                          <span className={`ws-badge ${waiterVisible ? 'ws-tone-positive' : ''}`}>
                            {waiterVisible
                              ? (lang === 'uz' ? 'Ofitsiant menyusida' : lang === 'ru' ? 'В меню официанта' : 'Waiter menu')
                              : (lang === 'uz' ? 'Ofitsiantdan yashirin' : lang === 'ru' ? 'Скрыто от официанта' : 'Hidden from waiter')}
                          </span>
                          <span className={`ws-badge ${touristVisible ? 'ws-tone-positive' : ''}`}>
                            {touristVisible
                              ? (lang === 'uz' ? 'Turist menyusida' : lang === 'ru' ? 'В туристическом меню' : 'Tourist menu')
                              : hiddenFromTouristMenuLabel(lang)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <aside className="min-w-0 space-y-4">
                  <section className="ws-panel space-y-4">
                    <div>
                      <p className="ws-caption mb-1.5 font-medium">
                        {lang === 'uz' ? 'Kategoriya ID' : lang === 'ru' ? 'ID категории' : 'Category ID'}
                      </p>
                      <p className="truncate rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] px-3 py-2.5 font-mono text-sm text-[#22201d]">{catForm.id || '—'}</p>
                    </div>

                    <ImageUploadField
                      label={t(lang, 'imageUrl')}
                      value={catForm.image_url}
                      onChange={setCF('image_url')}
                      onUploadComplete={upload => handleTrackedUpload(uploadedCatImageUrlsRef, upload)}
                      lang={lang}
                      type="category"
                      entityId={catForm.id}
                    />

                    <Field label={t(lang, 'sortOrder')} type="number" min="0" value={catForm.sort_order} onChange={setCF('sort_order')} placeholder="1" />

                    <div className="rounded-xl border border-[#e4e1de] p-4">
                      <p className="mb-3 text-sm font-semibold text-[#22201d]">{scheduleLabels.section}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={scheduleLabels.from} type="time" value={catForm.visible_from_time || ''} onChange={setCF('visible_from_time')} />
                        <Field label={scheduleLabels.until} type="time" value={catForm.visible_until_time || ''} onChange={setCF('visible_until_time')} />
                      </div>
                      <p className="ws-caption mt-2">{scheduleLabels.hint}</p>
                      <fieldset className="mt-4 border-t border-[#e4e1de] pt-3">
                        <legend className="float-left w-full ws-caption font-medium">
                          {lang === 'uz' ? 'Ushbu buyurtmalar uchun vaqtdan tashqari ham ko‘rsatish' : lang === 'ru' ? 'Показывать вне расписания для заказов' : 'Always show outside schedule for'}
                        </legend>
                        <div className="clear-both pt-1">
                          {['take_away', 'delivery', 'game_club'].map(orderType => {
                            const field = `always_visible_${orderType}`
                            return (
                              <label key={orderType} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-medium text-[#22201d]">
                                <input type="checkbox" checked={!!catForm[field]}
                                  className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00]"
                                  onChange={event => {
                                    const checked = event.target.checked
                                    setCatForm(current => ({ ...current, [field]: checked }))
                                  }} />
                                {orderTypeLabel(orderType, lang)}
                              </label>
                            )
                          })}
                        </div>
                      </fieldset>
                    </div>

                    {isOwner && <div className="rounded-xl border border-[#e4e1de] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#22201d]">
                          {lang === 'uz' ? 'Vaqtdan tashqari ko‘rsatish' : lang === 'ru' ? 'Показывать вне расписания' : 'Visible outside schedule'}
                        </p>
                        <span className="ws-count">
                          {(categoryOverrideProfilesReady ? eligibleCategoryProfileIds(catForm.always_visible_profile_ids, categoryOverrideProfiles) : normalizeCategoryAlwaysVisibleProfileIds(catForm.always_visible_profile_ids)).length}
                        </span>
                      </div>
                      <p className="ws-caption mt-1">
                        {lang === 'uz'
                          ? 'Tanlangan xodimlar bu kategoriyani ofitsiant menyusida belgilangan vaqtdan tashqari ham ko‘radi. Ommaviy menyuga ta’sir qilmaydi.'
                          : lang === 'ru'
                            ? 'Выбранные сотрудники увидят категорию в меню официанта даже вне указанного времени. Публичное меню не изменится.'
                            : 'Selected staff see this category in the waiter menu outside its scheduled hours. The public menu is unaffected.'}
                      </p>

                      <div className="mt-3 max-h-64 overflow-y-auto rounded-[10px] border border-[#e4e1de] bg-white">
                        {categoryOverrideProfilesLoading && (
                          <div className="ws-caption flex items-center gap-2 px-3 py-3">
                            <Loader2 size={14} className="animate-spin" />
                            {lang === 'uz' ? 'Xodimlar yuklanmoqda…' : lang === 'ru' ? 'Загрузка сотрудников…' : 'Loading staff…'}
                          </div>
                        )}
                        {!categoryOverrideProfilesLoading && categoryOverrideProfilesError && (
                          <p role="alert" className="ws-notice ws-tone-negative m-2 !py-2 !text-[13px]">
                            {categoryOverrideProfilesError}
                          </p>
                        )}
                        {!categoryOverrideProfilesLoading && !categoryOverrideProfilesError && categoryOverrideProfiles.length === 0 && (
                          <p className="ws-caption px-3 py-3">
                            {lang === 'uz' ? 'Faol xodimlar topilmadi.' : lang === 'ru' ? 'Активные сотрудники не найдены.' : 'No active staff found.'}
                          </p>
                        )}
                        {!categoryOverrideProfilesLoading && !categoryOverrideProfilesError && categoryOverrideProfiles.map(staffProfile => {
                          const checked = normalizeCategoryAlwaysVisibleProfileIds(catForm.always_visible_profile_ids).includes(staffProfile.id)
                          return (
                            <label
                              key={staffProfile.id}
                              className="ws-row flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCategoryScheduleOverride(staffProfile.id)}
                                disabled={savingCatForm}
                                className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00] disabled:cursor-wait"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-[#22201d]">
                                  {staffProfile.full_name || staffProfile.email || staffProfile.id}
                                </span>
                                <span className="ws-caption block truncate">
                                  {[staffProfile.role, staffProfile.email].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>}
                  </section>

                  <section className="ws-panel space-y-2">
                    <div className="mb-3">
                      <h2 className="ws-heading">
                        {lang === 'uz' ? 'Ko‘rinish' : lang === 'ru' ? 'Видимость' : 'Visibility'}
                      </h2>
                      <p className="ws-caption mt-1">
                        {lang === 'uz' ? 'Kategoriya qayerda ko‘rinishini tanlang.' :
                         lang === 'ru' ? 'Выберите, где показывать категорию.' :
                         'Choose where this category appears.'}
                      </p>
                    </div>

                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[10px] border border-[#e4e1de] p-3 transition-colors hover:bg-[#f6f5f3]">
                      <input
                        type="checkbox"
                        checked={publicVisible}
                        onChange={event => setCatForm(current => ({ ...current, hidden: !event.target.checked }))}
                        disabled={savingCatForm}
                        className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00] disabled:cursor-wait"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[#22201d]">
                          {lang === 'uz' ? 'Ommaviy menyu' : lang === 'ru' ? 'Публичное меню' : 'Public menu'}
                        </span>
                        <span className="ws-caption block">
                          {publicVisible
                            ? (lang === 'uz' ? 'Mijozlarga ko‘rinadi' : lang === 'ru' ? 'Видно гостям' : 'Visible to guests')
                            : (lang === 'uz' ? 'Mijozlardan yashirin' : lang === 'ru' ? 'Скрыто от гостей' : 'Hidden from guests')}
                        </span>
                      </span>
                      {publicVisible ? <Eye size={16} className="shrink-0 text-[#1d7a52]" /> : <EyeOff size={16} className="shrink-0 text-[#68655f]" />}
                    </label>

                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[10px] border border-[#e4e1de] p-3 transition-colors hover:bg-[#f6f5f3]">
                      <input
                        type="checkbox"
                        checked={waiterVisible}
                        onChange={event => setCatForm(current => ({ ...current, waiter_hidden: !event.target.checked }))}
                        disabled={savingCatForm}
                        className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00] disabled:cursor-wait"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[#22201d]">
                          {lang === 'uz' ? 'Ofitsiant menyusi' : lang === 'ru' ? 'Меню официанта' : 'Waiter menu'}
                        </span>
                        <span className="ws-caption block">
                          {waiterVisible
                            ? (lang === 'uz' ? 'Ofitsiantlarga ko‘rinadi' : lang === 'ru' ? 'Видно официантам' : 'Visible to waiters')
                            : (lang === 'uz' ? 'Ofitsiantlardan yashirin' : lang === 'ru' ? 'Скрыто от официантов' : 'Hidden from waiters')}
                        </span>
                      </span>
                      {waiterVisible ? <Eye size={16} className="shrink-0 text-[#1d7a52]" /> : <EyeOff size={16} className="shrink-0 text-[#68655f]" />}
                    </label>

                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[10px] border border-[#e4e1de] p-3 transition-colors hover:bg-[#f6f5f3]">
                      <input
                        type="checkbox"
                        checked={touristVisible}
                        onChange={event => setCatForm(current => ({ ...current, tourist_hidden: !event.target.checked }))}
                        disabled={savingCatForm}
                        className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00] disabled:cursor-wait"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[#22201d]">
                          {lang === 'uz' ? 'Turist menyusi' : lang === 'ru' ? 'Туристическое меню' : 'Tourist menu'}
                        </span>
                        <span className="ws-caption block">
                          {touristVisible
                            ? (lang === 'uz' ? 'Turist narxida ko‘rinadi' : lang === 'ru' ? 'Видно при туристических ценах' : 'Visible with Tourist pricing')
                            : (lang === 'uz' ? 'Turist narxidan yashirin' : lang === 'ru' ? 'Скрыто при туристических ценах' : 'Hidden with Tourist pricing')}
                        </span>
                      </span>
                      {touristVisible ? <Eye size={16} className="shrink-0 text-[#1d7a52]" /> : <EyeOff size={16} className="shrink-0 text-[#68655f]" />}
                    </label>
                  </section>

                  <div className="ws-panel flex gap-2 !p-3">
                    <button
                      type="button"
                      onClick={closeCatModal}
                      disabled={savingCatForm}
                      className="ws-btn ws-btn-outline flex-1 disabled:cursor-wait"
                    >
                      {t(lang, 'cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={saveCat}
                      disabled={!canSaveCatForm}
                      className="ws-btn ws-btn-primary flex-1"
                    >
                      {savingCatForm && <Loader2 size={15} className="animate-spin" />}
                      {savingCatForm ? savingLabel(lang) : t(lang, 'save')}
                    </button>
                  </div>
                </aside>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    )
  }

  if (isProductEditorPage) {
    const editorTitle = itemModal === 'new' ? t(lang, 'addItem') : t(lang, 'editItem')
    return (
      <AppShell
        title={editorTitle}
        back={{ label: t(lang, 'cancel'), onClick: closeItemModal }}
        headerActions={itemModal ? (
          <>
            {itemModal === 'edit' && form.id && canViewTechCards && isTechCardEligibleMenuItem(form, state.categories) && (
              <button
                type="button"
                onClick={() => navigate(`/admin/tech-cards/${encodeURIComponent(form.id)}`)}
                disabled={savingItemForm}
                aria-label={lang === 'uz' ? 'Tex karta' : lang === 'ru' ? 'Техкарта' : 'Tech card'}
                className="ws-btn ws-btn-outline !h-[38px] disabled:cursor-wait"
              >
                <ClipboardList size={16} />
                <span className="hidden sm:inline">{lang === 'uz' ? 'Tex karta' : lang === 'ru' ? 'Техкарта' : 'Tech card'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={saveItem}
              disabled={!canSaveItemForm}
              className="ws-btn ws-btn-primary !h-[38px]"
            >
              {savingItemForm && <Loader2 size={16} className="animate-spin" />}
              {savingItemForm ? savingLabel(lang) : t(lang, 'save')}
            </button>
          </>
        ) : null}
      >
        <div className="min-h-full bg-[#f6f5f3]">
          <div className="ws-page">
            {menuNotice && (
              <div role="alert" className="ws-notice ws-tone-negative">
                {menuNotice.error ? formatWriteError(menuNotice.error, lang, menuNotice.actionType) : menuNotice.message}
              </div>
            )}
            {!itemModal ? (
              <OperationalLoading layout="form"
                title={lang === 'uz' ? 'Mahsulot ochilmoqda' : lang === 'ru' ? 'Открываем товар' : 'Opening product'}
                description={lang === 'uz' ? 'Ma’lumotlar tayyorlanmoqda.' : lang === 'ru' ? 'Подготавливаем данные.' : 'Preparing the editor.'}
              />
            ) : (
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <section className="ws-panel min-w-0 space-y-5 self-start overflow-hidden">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="ws-caption mb-1.5 block font-medium">{t(lang, 'category')}</label>
                      <select
                        value={form.category_id}
                        onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                        className="ws-input"
                      >
                        <option value="">— {t(lang, 'category')} —</option>
                        {realSortedCats.map(c => (
                          <option key={c.id} value={c.id}>{getCategoryName(c, lang)}</option>
                        ))}
                      </select>
                    </div>
                    <Field
                      label={lang === 'uz' ? 'Tokchadagi soni' : lang === 'ru' ? 'Количество на полке' : 'Shelf count'}
                      type="number"
                      value={form.stock_count}
                      onChange={setF('stock_count')}
                      placeholder="24"
                    />
                    <Field
                      label={lang === 'uz' ? 'Tayyorlash vaqti (daq)' : lang === 'ru' ? 'Время приготовления (мин)' : 'Preparation time (min)'}
                      type="number"
                      min="1"
                      max="180"
                      value={form.estimated_prep_minutes}
                      onChange={setF('estimated_prep_minutes')}
                      placeholder="15"
                    />
                  </div>

                  <PricingFields form={form} setF={setF} lang={lang} costRequired={itemModal === 'new'} />

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={t(lang, 'nameUz')} value={form.name_uz} onChange={setF('name_uz')} onBlur={trimF('name_uz')} />
                    <Field label={t(lang, 'nameRu')} value={form.name_ru} onChange={setF('name_ru')} onBlur={trimF('name_ru')} />
                    <Field label={t(lang, 'nameEn')} value={form.name_en} onChange={setF('name_en')} onBlur={trimF('name_en')} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <DescriptionField label={t(lang, 'descUz')} value={form.description_uz} onChange={setF('description_uz')} onBlur={trimF('description_uz')} lang={lang} />
                    <DescriptionField label={t(lang, 'descRu')} value={form.description_ru} onChange={setF('description_ru')} onBlur={trimF('description_ru')} lang={lang} />
                    <DescriptionField label={t(lang, 'descEn')} value={form.description_en} onChange={setF('description_en')} onBlur={trimF('description_en')} lang={lang} />
                  </div>

                  <OptionGroupsEditor
                    value={form.option_groups_editor}
                    onChange={optionGroups => setForm(current => ({ ...current, option_groups_editor: optionGroups }))}
                    lang={lang}
                    parentCost={form.cost_price}
                  />
                </section>

                <aside className="min-w-0 space-y-4">
                  <section className="ws-panel space-y-4">
                    <div>
                      <p className="ws-caption mb-1.5 font-medium">
                        {lang === 'uz' ? 'Tashqi ID' : lang === 'ru' ? 'Внешний ID' : 'External ID'}
                      </p>
                      <p className="truncate rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] px-3 py-2.5 font-mono text-sm text-[#22201d]">{form.external_id || '—'}</p>
                    </div>
                    <MediaGalleryField
                      label={t(lang, 'mediaUrl')}
                      values={form.media_urls}
                      onChange={mediaUrls => setForm(current => ({
                        ...current,
                        image_url: mediaUrls[0] || '',
                        media_urls: mediaUrls,
                      }))}
                      onUploadComplete={upload => handleTrackedUpload(uploadedItemImageUrlsRef, upload)}
                      lang={lang}
                      entityId={form.id}
                      required={itemModal === 'new'}
                    />
                    <SaleUnitField value={form.sale_unit} onChange={setF('sale_unit')} lang={lang} />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t(lang, 'sortOrder')} type="number" value={form.sort_order} onChange={setF('sort_order')} placeholder="1" />
                      <Field label={`${t(lang, 'gramsLabel')} (${t(lang, 'grams')})`} type="number" value={form.grams} onChange={setF('grams')} placeholder="250" />
                      <Field label={`${t(lang, 'millilitresLabel')} (${t(lang, 'millilitres')})`} type="number" value={form.millilitres} onChange={setF('millilitres')} placeholder="500" />
                      <Field label={`${t(lang, 'kcalLabel')} (${t(lang, 'kcal')})`} type="number" value={form.kcal} onChange={setF('kcal')} placeholder="420" />
                      <Field
                        label={lang === 'uz' ? 'Tezkor tartib' : lang === 'ru' ? 'Порядок быстрого' : 'Quick order'}
                        type="number"
                        value={form.quick_item_sort_order}
                        onChange={setF('quick_item_sort_order')}
                        placeholder="1"
                      />
                    </div>
                    <div className="rounded-xl border border-[#e4e1de] p-4">
                      <p className="mb-3 text-sm font-semibold text-[#22201d]">{scheduleLabels.section}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={scheduleLabels.from} type="time" value={form.visible_from_time || ''} onChange={setF('visible_from_time')} />
                        <Field label={scheduleLabels.until} type="time" value={form.visible_until_time || ''} onChange={setF('visible_until_time')} />
                      </div>
                      <p className="ws-caption mt-2">{scheduleLabels.hint}</p>
                    </div>
                    <div className="border-t border-[#e4e1de] pt-2">
                      <OwnerOnlyMenuItemCheckbox
                        id="product-availability"
                        checked={form.available}
                        onChange={available => setForm(current => ({ ...current, available }))}
                        disabled={savingItemForm}
                        canChange={canChangeAvailability}
                        label={t(lang, 'available_item')}
                        ownerOnlyLabel={t(lang, 'available_item')}
                        lang={lang}
                      />
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-medium text-[#22201d]">
                        <input type="checkbox" checked={!!form.show_in_cashier_quick_items} onChange={e => setForm(f => ({ ...f, show_in_cashier_quick_items: e.target.checked }))} disabled={savingItemForm} className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00] disabled:cursor-wait" />
                        {lang === 'uz' ? 'Kassir tezkor mahsulotlarida ko‘rsatish' : lang === 'ru' ? 'Показывать в быстрых товарах кассира' : 'Show in cashier quick items'}
                      </label>
                      <OwnerOnlyMenuItemCheckbox
                        id="product-public-hidden"
                        checked={form.public_hidden}
                        onChange={public_hidden => setForm(current => ({ ...current, public_hidden }))}
                        disabled={savingItemForm}
                        canChange={canChangePublicVisibility}
                        label={publicMenuHideControlLabel(lang)}
                        ownerOnlyLabel={ownerOnlyPublicVisibilityLabel(lang)}
                        lang={lang}
                      />
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-medium text-[#22201d]">
                        <input type="checkbox" checked={!!form.cashier_only} onChange={e => setForm(f => ({ ...f, cashier_only: e.target.checked }))} disabled={savingItemForm} className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00] disabled:cursor-wait" />
                        {lang === 'uz' ? 'Faqat kassirda ko‘rsatish' : lang === 'ru' ? 'Только для кассира' : 'Cashier only'}
                      </label>
                    </div>
                  </section>
                  <div className="ws-panel sticky bottom-4 flex gap-2 !p-3">
                    <button onClick={closeItemModal} disabled={savingItemForm} className="ws-btn ws-btn-outline flex-1 disabled:cursor-wait">
                      {t(lang, 'cancel')}
                    </button>
                    <button onClick={saveItem} disabled={!canSaveItemForm} className="ws-btn ws-btn-primary flex-1">
                      {savingItemForm && <Loader2 size={15} className="animate-spin" />}
                      {savingItemForm ? savingLabel(lang) : t(lang, 'save')}
                    </button>
                  </div>
                </aside>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      title={t(lang, 'menu')}
      contentRef={shellScrollRef}
      tabs={{
        label: t(lang, 'menu'),
        value: tab,
        onChange: setTab,
        items: [
          { key: 'items', label: t(lang, 'menuItems') },
          { key: 'categories', label: t(lang, 'categories') },
          { key: 'quick_items', label: lang === 'uz' ? 'Tezkor mahsulotlar' : lang === 'ru' ? 'Быстрые товары' : 'Quick Items' },
          { key: 'archive', label: `${archiveLabels(lang).tab}${archivedItems.length + archivedCategories.length ? ` (${archivedItems.length + archivedCategories.length})` : ''}` },
        ],
      }}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          {menuNotice && (
            <div className={`ws-notice ${menuNotice.tone === 'success' ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
              {menuNotice.error ? formatWriteError(menuNotice.error, lang, menuNotice.actionType) : menuNotice.message}
            </div>
          )}

          {/* ══ Menu Items tab ═══════════════════════════════════════════════ */}
          {tab === 'items' && (
            <>
              <div className="ws-panel">
              {/* Toolbar row 1: search + availability + grid toggle + add */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[240px]">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={lang === 'uz' ? 'Menyu elementlarini qidirish...' :
                                 lang === 'ru' ? 'Поиск позиций меню...' : 'Search menu items...'}
                    className="ws-input !pl-9"
                  />
                </div>
                <select
                  value={filterAvail}
                  onChange={e => setFilterAvail(e.target.value)}
                  className="ws-input !w-auto"
                >
                  <option value="all">
                    {lang === 'uz' ? 'Mavjudlik' : lang === 'ru' ? 'Доступность' : 'Availability'}
                  </option>
                  <option value="available">
                    {lang === 'uz' ? 'Mavjud' : lang === 'ru' ? 'Доступно' : 'Available'}
                  </option>
                  <option value="hidden">
                    {lang === 'uz' ? 'Mavjud emas' : lang === 'ru' ? 'Недоступно' : 'Unavailable'}
                  </option>
                  <option value="cashier_only">
                    {lang === 'uz' ? 'Faqat kassirda' : lang === 'ru' ? 'Только у кассира' : 'Only cashier'}
                  </option>
                  <option value="public_hidden">
                    {hiddenFromPublicMenuLabel(lang)}
                  </option>
                </select>
                <div className="ws-segmented" role="group" aria-label={lang === 'uz' ? 'Ko‘rinish' : lang === 'ru' ? 'Вид' : 'View'}>
                  <button
                    type="button"
                    aria-pressed={gridView}
                    aria-label={lang === 'uz' ? 'Kartalar' : lang === 'ru' ? 'Карточки' : 'Cards'}
                    onClick={() => setGridView(true)}
                    className="!px-3"
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    type="button"
                    aria-pressed={!gridView}
                    aria-label={lang === 'uz' ? 'Ro‘yxat' : lang === 'ru' ? 'Список' : 'List'}
                    onClick={() => setGridView(false)}
                    className="!px-3"
                  >
                    <List size={16} />
                  </button>
                </div>
                {canEditMenu && <OrangeBtn onClick={openNewItem} icon={Plus}>{t(lang, 'addItem')}</OrangeBtn>}
              </div>

              {/* Toolbar row 2: category cards */}
              <MenuCategoryScroller
                categories={[
                  { id: 'all', label: lang === 'uz' ? 'Hammasi' : lang === 'ru' ? 'Все' : 'All', image_url: null },
                  ...realSortedCats.map(c => ({ ...c, label: getCategoryName(c, lang) })),
                ]}
                activeCategoryId={filterCat}
                onCategoryClick={setFilterCat}
                onActiveCategoryChange={setFilterCat}
                lang={lang}
                itemCounts={itemCountByCat}
                sectionPrefix="admin-menu-category"
                scrollContainerRef={shellScrollRef}
                topOffset={0}
                variant="workspace"
                collapsedPosition="fixed"
                collapsedSurfaceClass="bg-[#f6f5f3]/90"
                collapsedClassName="!px-0 !py-2"
                collapsedContentClassName="mx-auto max-w-[1440px] !px-4 sm:!px-6 xl:!px-9"
              />
              </div>

              {/* Hint */}
              {canEditMenu && filteredItems.length > 1 && (
                <p className="ws-caption -mb-2 flex items-center gap-1.5">
                  <GripVertical size={13} />
                  {lang === 'uz' ? 'Tartiblash uchun sudrang' : lang === 'ru' ? 'Перетащите для сортировки' : 'Drag to reorder'}
                </p>
              )}

              {filteredItems.length === 0 ? (
                <div className="ws-panel ws-empty">
                  <UtensilsCrossed />
                  {search || filterCat !== 'all' || filterAvail !== 'all' ? (
                    // Filters are active — just tell user to adjust them, no Add button
                    <>
                      <h3>
                        {lang === 'uz' ? 'Natija topilmadi' : lang === 'ru' ? 'Ничего не найдено' : 'No results found'}
                      </h3>
                      <p>
                        {lang === 'uz' ? 'Filtrni tozalang yoki boshqa qidiruv kiriting' : lang === 'ru' ? 'Попробуйте другой фильтр или запрос' : 'Try adjusting your filters or search'}
                      </p>
                    </>
                  ) : (
                    // Truly empty — no items exist yet
                    <>
                      <h3>
                        {lang === 'uz' ? 'Menyu elementlari yo\'q' : lang === 'ru' ? 'Нет позиций меню' : 'No menu items yet'}
                      </h3>
                      <p>
                        {lang === 'uz' ? 'Birinchi elementni qo\'shing' : lang === 'ru' ? 'Добавьте первую позицию' : 'Add your first item'}
                      </p>
                      {canEditMenu && <OrangeBtn onClick={openNewItem} icon={Plus}>{t(lang, 'addItem')}</OrangeBtn>}
                    </>
                  )}
                </div>
              ) : (() => {
                // Category chips scroll to these grouped sections.
                const showGrouped = true

                // Build category sections for grouped view
                const sections = showGrouped
                  ? realSortedCats
                      .map(cat => ({
                        cat,
                        items: filteredItems.filter(i => i.category_id === cat.id),
                      }))
                      .filter(s => s.items.length > 0)
                  : null

                // Uncategorised items (no matching category)
                const uncategorised = showGrouped
                  ? filteredItems.filter(i => !realSortedCats.some(c => c.id === i.category_id))
                  : []

                const DragGhost = () => activeItem ? (
                  <div className="w-44 rotate-2 overflow-hidden rounded-xl border border-[#e4e1de] bg-white opacity-95 shadow-2xl">
                    <SafeMenuImage
                      src={activeItem.image_url}
                      className="aspect-square w-full object-cover object-center"
                      fallbackClassName="aspect-square w-full"
                      iconSize={24}
                    />
                    <div className="p-2.5">
                      <p className="truncate text-[13px] font-semibold text-[#22201d]">{getItemName(activeItem, lang)}</p>
                      <MenuPrice item={activeItem} size="sm" />
                      {gramsLabel(activeItem, lang) && (
                        <p className="text-[#64748B] font-black text-[10px]">{gramsLabel(activeItem, lang)}</p>
                      )}
                      {millilitresLabel(activeItem, lang) && (
                        <p className="text-[#64748B] font-black text-[10px]">{millilitresLabel(activeItem, lang)}</p>
                      )}
                      {kcalLabel(activeItem, lang) && (
                        <p className="text-[#64748B] font-black text-[10px]">{kcalLabel(activeItem, lang)}</p>
                      )}
                    </div>
                  </div>
                ) : null

                return (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={pointerWithinOrClosestCenter}
                    onDragStart={e => setActiveId(e.active.id)}
                    onDragEnd={handleItemDragEnd}
                    onDragCancel={() => setActiveId(null)}
                  >
                    <SortableContext
                      items={filteredItems.map(i => i.id)}
                      strategy={gridView ? rectSortingStrategy : verticalListSortingStrategy}
                    >
                      {showGrouped ? (
                        // ── Grouped by category ──────────────────────────────
                        <div className="space-y-9">
                          {sections.map(({ cat, items: catItems }) => (
                            <div
                              key={cat.id}
                              id={menuCategorySectionId('admin-menu-category', cat.id)}
                              className="scroll-mt-24"
                            >
                              {/* Section header */}
                              <div className="mb-4 flex flex-wrap items-center gap-2.5">
                                {cat.image_url && (
                                  <img src={cat.image_url} alt="" className="h-8 w-8 flex-shrink-0 rounded-lg object-cover object-center" />
                                )}
                                <h3 className="ws-display">
                                  {getCategoryName(cat, lang)}
                                </h3>
                                <span className="ws-count">
                                  {catItems.length}
                                </span>
                                {cat.hidden && (
                                  <span className="ws-badge ws-tone-info">
                                    {hiddenFromPublicMenuLabel(lang)}
                                  </span>
                                )}
                                {cat.waiter_hidden && (
                                  <span className="ws-badge">
                                    {hiddenFromWaiterMenuLabel(lang)}
                                  </span>
                                )}
                                {cat.tourist_hidden && (
                                  <span className="ws-badge">
                                    {hiddenFromTouristMenuLabel(lang)}
                                  </span>
                                )}
                              </div>

                              {gridView ? (
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                                  {catItems.map(item => (
                                    <SortableItemCard
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={requestDeleteItem}
                                      onToggleVisibility={toggleItemVisibility}
                                      visibilityPending={savingItemId === item.id}
                                      categories={realSortedCats}
                                      canChangeAvailability={canChangeAvailability}
                                      canDelete={canDeleteMenuCatalog}
                                      readOnly={!canEditMenu}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="ws-panel ws-panel-flush">
                                  {catItems.map(item => (
                                    <SortableItemRow
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={requestDeleteItem}
                                      onToggleVisibility={toggleItemVisibility}
                                      visibilityPending={savingItemId === item.id}
                                      categories={realSortedCats}
                                      canChangeAvailability={canChangeAvailability}
                                      canDelete={canDeleteMenuCatalog}
                                      readOnly={!canEditMenu}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Uncategorised items (edge case) */}
                          {uncategorised.length > 0 && (
                            <div>
                              <div className="mb-4 flex items-center gap-2.5">
                                <h3 className="ws-display">
                                  {lang === 'uz' ? 'Kategoriyasiz' : lang === 'ru' ? 'Без категории' : 'Uncategorised'}
                                </h3>
                                <span className="ws-count">
                                  {uncategorised.length}
                                </span>
                              </div>
                              {gridView ? (
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                                  {uncategorised.map(item => (
                                    <SortableItemCard
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={requestDeleteItem}
                                      onToggleVisibility={toggleItemVisibility}
                                      visibilityPending={savingItemId === item.id}
                                      categories={realSortedCats}
                                      canChangeAvailability={canChangeAvailability}
                                      canDelete={canDeleteMenuCatalog}
                                      readOnly={!canEditMenu}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="ws-panel ws-panel-flush">
                                  {uncategorised.map(item => (
                                    <SortableItemRow
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={requestDeleteItem}
                                      onToggleVisibility={toggleItemVisibility}
                                      visibilityPending={savingItemId === item.id}
                                      categories={realSortedCats}
                                      canChangeAvailability={canChangeAvailability}
                                      canDelete={canDeleteMenuCatalog}
                                      readOnly={!canEditMenu}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        // ── Flat grid (specific category or active filter) ────
                        gridView ? (
                          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                            {filteredItems.map(item => (
                              <SortableItemCard
                                key={item.id}
                                item={item}
                                lang={lang}
                                onEdit={openEditItem}
                                onDelete={requestDeleteItem}
                                onToggleVisibility={toggleItemVisibility}
                                visibilityPending={savingItemId === item.id}
                                categories={realSortedCats}
                                canChangeAvailability={canChangeAvailability}
                                canDelete={canDeleteMenuCatalog}
                                readOnly={!canEditMenu}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="ws-panel ws-panel-flush">
                            {filteredItems.map(item => (
                              <SortableItemRow
                                key={item.id}
                                item={item}
                                lang={lang}
                                onEdit={openEditItem}
                                onDelete={requestDeleteItem}
                                onToggleVisibility={toggleItemVisibility}
                                visibilityPending={savingItemId === item.id}
                                categories={realSortedCats}
                                canChangeAvailability={canChangeAvailability}
                                canDelete={canDeleteMenuCatalog}
                                readOnly={!canEditMenu}
                              />
                            ))}
                          </div>
                        )
                      )}
                    </SortableContext>

                    <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                      <DragGhost />
                    </DragOverlay>
                  </DndContext>
                )
              })()}

              {filteredItems.length > 0 && (
                <p className="ws-caption text-center">
                  {lang === 'uz' ? `${filteredItems.length} ta element` :
                   lang === 'ru' ? `Итого: ${filteredItems.length} позиций` :
                   `Total ${filteredItems.length} item${filteredItems.length !== 1 ? 's' : ''}`}
                </p>
              )}
            </>
          )}

          {/* ══ Categories tab ═══════════════════════════════════════════════ */}
          {tab === 'categories' && (
            <>
              {canEditMenu && (
                <div className="flex justify-end">
                  <OrangeBtn onClick={openNewCat} icon={Plus}>{t(lang, 'addCategory')}</OrangeBtn>
                </div>
              )}

              {realSortedCats.length === 0 ? (
                <div className="ws-panel ws-empty">
                  <FolderOpen />
                  <h3>
                    {lang === 'uz' ? 'Kategoriyalar yo\'q' : lang === 'ru' ? 'Нет категорий' : 'No categories yet'}
                  </h3>
                  <p>
                    {lang === 'uz' ? 'Birinchi kategoriyani qo\'shing' :
                     lang === 'ru' ? 'Добавьте первую категорию' : 'Add your first category'}
                  </p>
                  {canEditMenu && <OrangeBtn onClick={openNewCat} icon={Plus}>{t(lang, 'addCategory')}</OrangeBtn>}
                </div>
              ) : (
                <>
                  {canEditMenu && <p className="ws-caption flex items-center gap-1.5">
                    <GripVertical size={13} />
                    {lang === 'uz' ? 'Tartiblash uchun sudrang' : lang === 'ru' ? 'Перетащите для сортировки' : 'Drag to reorder'}
                  </p>}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={pointerWithinOrClosestCenter}
                    onDragStart={e => setActiveId(e.active.id)}
                    onDragEnd={handleCatDragEnd}
                    onDragCancel={() => setActiveId(null)}
                  >
                    <SortableContext
                      items={realSortedCats.map(c => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="ws-panel ws-panel-flush">
                        {/* Header uses the exact same edit/read-only grid as its rows. */}
                        <div className={`${canEditMenu ? CAT_EDIT_GRID : CAT_READ_ONLY_GRID} ws-table-head py-3`}>
                          {canEditMenu && <span />}
                          <span />
                          <span>{lang === 'uz' ? 'Nomi' : lang === 'ru' ? 'Название' : 'Name'}</span>
                          <span>{lang === 'uz' ? 'Ommaviy menyu' : lang === 'ru' ? 'Публичное меню' : 'Public menu'}</span>
                          <span className="text-center">{lang === 'uz' ? 'Tartib' : lang === 'ru' ? 'Порядок' : 'Sort Order'}</span>
                          {canEditMenu && <span className="text-right">{lang === 'uz' ? 'Amallar' : lang === 'ru' ? 'Действия' : 'Actions'}</span>}
                        </div>

                        {realSortedCats.map((cat, idx) => (
                          <SortableCatRow
                            key={cat.id}
                            cat={cat}
                            lang={lang}
                            itemCount={itemCountByCat[cat.id] || 0}
                            onEdit={openEditCat}
                            onDelete={deleteCat}
                            onToggleVisibility={toggleCategoryVisibility}
                            visibilityPending={savingCatId === cat.id}
                            sortIndex={idx + 1}
                            canDelete={canDeleteMenuCatalog}
                            readOnly={!canEditMenu}
                          />
                        ))}

                        {/* Footer */}
                        <div className="ws-caption border-t border-[#e4e1de] bg-[#f6f5f3] px-5 py-3 text-center">
                          {lang === 'uz' ? `Jami ${realSortedCats.length} ta kategoriya` :
                           lang === 'ru' ? `Всего категорий: ${realSortedCats.length}` :
                           `Total ${realSortedCats.length} categor${realSortedCats.length !== 1 ? 'ies' : 'y'}`}
                        </div>
                      </div>
                    </SortableContext>

                    {/* Drag overlay ghost */}
                    <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                      {activeCat && (
                        <div className="flex items-center gap-4 rounded-xl border border-[#e4e1de] bg-white px-5 py-4 opacity-95 shadow-2xl">
                          {activeCat.image_url ? (
                            <img src={activeCat.image_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg object-cover object-center" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-[#efece9] flex items-center justify-center flex-shrink-0">
                              <Tag size={18} className="text-[#68655f]" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-semibold text-[#22201d]">{getCategoryName(activeCat, lang)}</p>
                            <p className="ws-caption">{itemCountByCat[activeCat.id] || 0} items</p>
                          </div>
                        </div>
                      )}
                    </DragOverlay>
                  </DndContext>
                </>
              )}
            </>
          )}

          {/* ══ Quick Items tab ═════════════════════════════════════════════ */}
          {tab === 'quick_items' && (
            <>
              <div className="ws-panel ws-panel-title">
                <div>
                  <h2 className="ws-display">
                    {lang === 'uz' ? 'Kassadagi tezkor mahsulotlar' : lang === 'ru' ? 'Быстрые товары у кассы' : 'Cashier Quick Items'}
                  </h2>
                  <p className="ws-muted mt-1.5">
                    {lang === 'uz'
                      ? 'Bu mahsulotlar faqat kassir to‘lov ekranida ko‘rinadi.'
                      : lang === 'ru'
                        ? 'Эти товары видны только на экране оплаты кассира.'
                        : 'These items appear only on the cashier payment screen.'}
                  </p>
                </div>
                {canEditMenu && (
                  <OrangeBtn onClick={openNewQuickItem} icon={Plus}>
                    {lang === 'uz' ? 'Tezkor mahsulot qo‘shish' : lang === 'ru' ? 'Добавить быстрый товар' : 'Add Quick Item'}
                  </OrangeBtn>
                )}
              </div>

              {quickItems.length === 0 ? (
                <div className="ws-panel ws-empty">
                  <Tag />
                  <h3>
                    {lang === 'uz' ? 'Tezkor mahsulotlar yo‘q' : lang === 'ru' ? 'Быстрых товаров пока нет' : 'No quick items yet'}
                  </h3>
                  <p>
                    {lang === 'uz'
                      ? 'Kassada tez qo‘shiladigan mahsulot yarating.'
                      : lang === 'ru'
                        ? 'Создайте товар, который кассир сможет быстро добавить.'
                        : 'Create items cashiers can add quickly at checkout.'}
                  </p>
                  {canEditMenu && (
                    <OrangeBtn onClick={openNewQuickItem} icon={Plus}>
                      {lang === 'uz' ? 'Tezkor mahsulot qo‘shish' : lang === 'ru' ? 'Добавить быстрый товар' : 'Add Quick Item'}
                    </OrangeBtn>
                  )}
                </div>
              ) : (
                <>
                  {canEditMenu && <p className="ws-caption flex items-center gap-1.5">
                    <GripVertical size={13} />
                    {lang === 'uz' ? 'Tartiblash uchun sudrang' : lang === 'ru' ? 'Перетащите для сортировки' : 'Drag to reorder'}
                  </p>}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={pointerWithinOrClosestCenter}
                    onDragStart={e => setActiveId(e.active.id)}
                    onDragEnd={handleQuickItemDragEnd}
                    onDragCancel={() => setActiveId(null)}
                  >
                    <SortableContext
                      items={quickItems.map(i => i.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                        {quickItems.map(item => (
                          <SortableItemCard
                            key={item.id}
                            item={item}
                            lang={lang}
                            onEdit={openEditItem}
                            onDelete={requestDeleteItem}
                            onToggleVisibility={toggleItemVisibility}
                            visibilityPending={savingItemId === item.id}
                            categories={realSortedCats}
                            canChangeAvailability={canChangeAvailability}
                            canDelete={canDeleteMenuCatalog}
                            readOnly={!canEditMenu}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                      {activeItem && (
                        <div className="w-44 rotate-2 overflow-hidden rounded-xl border border-[#e4e1de] bg-white opacity-95 shadow-2xl">
                          <SafeMenuImage
                            src={activeItem.image_url}
                            className="aspect-square w-full object-cover object-center"
                            fallbackClassName="aspect-square w-full"
                            iconSize={24}
                          />
                          <div className="p-2.5">
                            <p className="truncate text-[13px] font-semibold text-[#22201d]">{getItemName(activeItem, lang)}</p>
                            <MenuPrice item={activeItem} size="sm" />
                          </div>
                        </div>
                      )}
                    </DragOverlay>
                  </DndContext>
                </>
              )}
            </>
          )}

          {/* ══ Archive tab ═════════════════════════════════════════════════ */}
          {tab === 'archive' && (() => {
            const labels = archiveLabels(lang)
            const q = archiveSearch.trim().toLowerCase()
            const cats = archivedCategories.filter(cat => !q || getCategoryName(cat, lang).toLowerCase().includes(q))
            const items = archivedItems.filter(item => !q || getItemName(item, lang).toLowerCase().includes(q) || String(item.external_id || '').toLowerCase().includes(q))
            const restoreButton = (type, id, disabledReason = '') => canDeleteMenuCatalog && (
              disabledReason
                ? <span className="ws-caption">{disabledReason}</span>
                : (
                  <button
                    type="button"
                    disabled={!!restoringId}
                    onClick={() => restoreArchived(type, id)}
                    className="ws-btn ws-btn-outline ws-btn-sm"
                  >
                    {restoringId === id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    {labels.restore}
                  </button>
                )
            )
            return (
              <>
                <div className="ws-panel">
                  <h2 className="ws-display">{labels.title}</h2>
                  <p className="ws-muted mt-1.5">{labels.sub}</p>
                  <div className="relative mt-4">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
                    <input
                      value={archiveSearch}
                      onChange={e => setArchiveSearch(e.target.value)}
                      placeholder={labels.search}
                      className="ws-input !pl-9"
                    />
                  </div>
                </div>
                {!cats.length && !items.length ? (
                  <div className="ws-panel ws-empty">
                    <Archive />
                    <p>{labels.empty}</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {cats.length > 0 && (
                      <section className="ws-panel ws-panel-flush">
                        <h3 className="ws-heading flex items-center gap-2 border-b border-[#e4e1de] px-5 py-4">{labels.categories} <span className="ws-count">{cats.length}</span></h3>
                        {cats.map(cat => (
                          <div key={cat.id} className="ws-row flex flex-wrap items-center gap-3 px-5 py-3">
                            <FolderOpen size={20} className="flex-shrink-0 text-[#68655f]" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-[#22201d]">{getCategoryName(cat, lang)}</p>
                              <p className="ws-caption">{labels.archivedAt} {formatLongDateTime(cat.deleted_at, lang)}</p>
                            </div>
                            {restoreButton('RESTORE_CATEGORY', cat.id)}
                          </div>
                        ))}
                      </section>
                    )}
                    {items.length > 0 && (
                      <section className="ws-panel ws-panel-flush">
                        <h3 className="ws-heading flex items-center gap-2 border-b border-[#e4e1de] px-5 py-4">{labels.items} <span className="ws-count">{items.length}</span></h3>
                        {items.map(item => {
                          const cat = state.categories.find(c => c.id === item.category_id)
                          const categoryArchived = !!cat && isDeletedMenuCategory(cat)
                          return (
                            <div key={item.id} className="ws-row flex flex-wrap items-center gap-3 px-5 py-3">
                              <SafeMenuImage
                                src={item.image_url}
                                alt={getItemName(item, lang)}
                                className="h-12 w-12 flex-shrink-0 rounded-lg object-cover object-center opacity-70 grayscale"
                                fallbackClassName="h-12 w-12 flex-shrink-0 rounded-lg"
                                iconSize={18}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-[#22201d]">{getItemName(item, lang)}</p>
                                <p className="ws-caption">
                                  {[cat && getCategoryName(cat, lang), formatCurrency(item.price), `${labels.archivedAt} ${formatLongDateTime(item.deleted_at, lang)}`].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              {restoreButton('RESTORE_MENU_ITEM', item.id, categoryArchived ? labels.categoryArchived : '')}
                            </div>
                          )
                        })}
                      </section>
                    )}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {canDeleteMenuCatalog && archiveCandidate && (

        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label={lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close'}
            onClick={closeDeleteItemDialog}
            disabled={archivePending}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm disabled:cursor-wait"
          />
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-menu-item-title"
            aria-describedby="delete-menu-item-description"
            aria-busy={archivePending}
            onKeyDown={handleDeleteDialogKeyDown}
            tabIndex={-1}
            className="ws-dialog relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto p-6"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#c4262c]/10 text-[#c4262c]">
              <Archive size={20} />
            </div>
            <h2 id="delete-menu-item-title" className="ws-display mt-4 !text-[24px]">
              {archiveCandidateIsCategory
                ? (lang === 'uz' ? 'Kategoriyani arxivlaysizmi?' : lang === 'ru' ? 'Архивировать категорию?' : 'Archive category?')
                : (lang === 'uz' ? 'Mahsulotni arxivlaysizmi?' : lang === 'ru' ? 'Архивировать товар?' : 'Archive item?')}
            </h2>
            <p className="mt-2 break-words text-sm font-semibold leading-6 text-[#22201d]">
              {archiveCandidateIsCategory ? getCategoryName(archiveCandidate, lang) : getItemName(archiveCandidate, lang)}
            </p>
            <p id="delete-menu-item-description" className="ws-muted mt-2">
              {archiveCandidateIsCategory
                ? (lang === 'uz'
                  ? 'Kategoriya va undagi taomlar menyudan yashiriladi. Hech narsa o‘chirilmaydi: «Arxiv» bo‘limidan tiklash mumkin.'
                  : lang === 'ru'
                    ? 'Категория и её блюда скроются из меню. Ничего не удаляется: восстановить можно во вкладке «Архив».'
                    : 'The category and its items will be hidden from the menu. Nothing is deleted: restore it from the Archive tab.')
                : (lang === 'uz'
                  ? 'Mahsulot menyudan arxivlanadi. Oldingi buyurtmalar tarixi saqlanadi.'
                  : lang === 'ru'
                    ? 'Товар будет архивирован из меню. История прошлых заказов сохранится.'
                    : 'The item will be archived from the menu. Previous order history will remain.')}
            </p>
            {deleteItemError && (
              <p role="alert" className="ws-notice ws-tone-negative mt-3">
                {deleteItemError}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                ref={deleteCancelButtonRef}
                type="button"
                onClick={closeDeleteItemDialog}
                disabled={archivePending}
                className="ws-btn ws-btn-outline flex-1"
              >
                {lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => (archiveCandidateIsCategory ? archiveCategory(archiveCandidate.id) : deleteItem(archiveCandidate.id))}
                disabled={archivePending}
                className="ws-btn ws-btn-danger-solid flex-1"
              >
                {archivePending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Archive size={16} />}
                {archivePending
                  ? (lang === 'uz' ? 'Arxivlanmoqda…' : lang === 'ru' ? 'Архивирование…' : 'Archiving…')
                  : (lang === 'uz' ? 'Arxivlash' : lang === 'ru' ? 'В архив' : 'Archive')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item modal ──────────────────────────────────────────────────────── */}
      {itemModal && (
        <Modal title={itemModal === 'new' ? t(lang, 'addItem') : t(lang, 'editItem')} onClose={closeItemModal} closeDisabled={savingItemForm}>
          <div className="space-y-3">
            {menuNotice && (
              <div role="alert" className="ws-notice ws-tone-negative">
                {menuNotice.error ? formatWriteError(menuNotice.error, lang, menuNotice.actionType) : menuNotice.message}
              </div>
            )}
            <div>
              <label className="ws-caption mb-1.5 block font-medium">{t(lang, 'category')}</label>
              <select
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="ws-input"
              >
                <option value="">— {t(lang, 'category')} —</option>
                {realSortedCats.map(c => (
                  <option key={c.id} value={c.id}>{getCategoryName(c, lang)}</option>
                ))}
              </select>
            </div>
            <Field label={t(lang, 'nameUz')} value={form.name_uz} onChange={setF('name_uz')} onBlur={trimF('name_uz')} />
            <Field label={t(lang, 'nameRu')} value={form.name_ru} onChange={setF('name_ru')} onBlur={trimF('name_ru')} />
            <Field label={t(lang, 'nameEn')} value={form.name_en} onChange={setF('name_en')} onBlur={trimF('name_en')} />
            <div>
              <p className="ws-caption mb-1.5 font-medium">
                {lang === 'uz' ? 'Tashqi ID' : lang === 'ru' ? 'Внешний ID' : 'External ID'}
              </p>
              <p className="truncate rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] px-3 py-2.5 font-mono text-sm text-[#22201d]">{form.external_id || '—'}</p>
            </div>
            <DescriptionField label={t(lang, 'descUz')} value={form.description_uz} onChange={setF('description_uz')} onBlur={trimF('description_uz')} lang={lang} />
            <DescriptionField label={t(lang, 'descRu')} value={form.description_ru} onChange={setF('description_ru')} onBlur={trimF('description_ru')} lang={lang} />
            <DescriptionField label={t(lang, 'descEn')} value={form.description_en} onChange={setF('description_en')} onBlur={trimF('description_en')} lang={lang} />
            <OptionGroupsEditor
              value={form.option_groups_editor}
              onChange={optionGroups => setForm(current => ({ ...current, option_groups_editor: optionGroups }))}
              lang={lang}
              parentCost={form.cost_price}
            />
            <PricingFields form={form} setF={setF} lang={lang} compact costRequired={itemModal === 'new'} />
            <SaleUnitField value={form.sale_unit} onChange={setF('sale_unit')} lang={lang} />
            <Field label={`${t(lang, 'gramsLabel')} (${t(lang, 'grams')})`} type="number" value={form.grams} onChange={setF('grams')} placeholder="250" />
            <Field label={`${t(lang, 'millilitresLabel')} (${t(lang, 'millilitres')})`} type="number" value={form.millilitres} onChange={setF('millilitres')} placeholder="500" />
            <Field label={`${t(lang, 'kcalLabel')} (${t(lang, 'kcal')})`} type="number" value={form.kcal} onChange={setF('kcal')} placeholder="420" />
            <Field
              label={lang === 'uz' ? 'Tokchadagi soni' : lang === 'ru' ? 'Количество на полке' : 'Shelf count'}
              type="number"
              value={form.stock_count}
              onChange={setF('stock_count')}
              placeholder="24"
            />
            <Field
              label={lang === 'uz' ? 'Tayyorlash vaqti (daq)' : lang === 'ru' ? 'Время приготовления (мин)' : 'Preparation time (min)'}
              type="number"
              min="1"
              max="180"
              value={form.estimated_prep_minutes}
              onChange={setF('estimated_prep_minutes')}
              placeholder="15"
            />
            <MediaGalleryField
              label={t(lang, 'mediaUrl')}
              values={form.media_urls}
              onChange={mediaUrls => setForm(current => ({
                ...current,
                image_url: mediaUrls[0] || '',
                media_urls: mediaUrls,
              }))}
              onUploadComplete={upload => handleTrackedUpload(uploadedItemImageUrlsRef, upload)}
              lang={lang}
              entityId={form.id}
              required={itemModal === 'new'}
            />
            <Field label={t(lang, 'sortOrder')} type="number" value={form.sort_order} onChange={setF('sort_order')} placeholder="1" />
            <Field
              label={lang === 'uz' ? 'Tezkor mahsulot tartibi' : lang === 'ru' ? 'Порядок быстрого товара' : 'Quick item order'}
              type="number"
              value={form.quick_item_sort_order}
              onChange={setF('quick_item_sort_order')}
              placeholder="1"
            />
            <div className="rounded-xl border border-[#e4e1de] p-4">
              <p className="mb-3 text-sm font-semibold text-[#22201d]">{scheduleLabels.section}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={scheduleLabels.from} type="time" value={form.visible_from_time || ''} onChange={setF('visible_from_time')} />
                <Field label={scheduleLabels.until} type="time" value={form.visible_until_time || ''} onChange={setF('visible_until_time')} />
              </div>
              <p className="ws-caption mt-2">{scheduleLabels.hint}</p>
            </div>
            <OwnerOnlyMenuItemCheckbox
              id="modal-product-availability"
              checked={form.available}
              onChange={available => setForm(current => ({ ...current, available }))}
              disabled={savingItemForm}
              canChange={canChangeAvailability}
              label={t(lang, 'available_item')}
              ownerOnlyLabel={t(lang, 'available_item')}
              lang={lang}
            />
            <div className="flex min-h-[44px] items-center gap-3">
              <input
                id="cashierQuick"
                type="checkbox"
                checked={!!form.show_in_cashier_quick_items}
                onChange={e => setForm(f => ({ ...f, show_in_cashier_quick_items: e.target.checked }))}
                disabled={savingItemForm}
                className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00] disabled:cursor-wait"
              />
              <label htmlFor="cashierQuick" className="cursor-pointer text-sm font-medium text-[#22201d]">
                {lang === 'uz' ? 'Kassir tezkor mahsulotlarida ko‘rsatish' : lang === 'ru' ? 'Показывать в быстрых товарах кассира' : 'Show in cashier quick items'}
              </label>
            </div>
            <OwnerOnlyMenuItemCheckbox
              id="modal-product-public-hidden"
              checked={form.public_hidden}
              onChange={public_hidden => setForm(current => ({ ...current, public_hidden }))}
              disabled={savingItemForm}
              canChange={canChangePublicVisibility}
              label={publicMenuHideControlLabel(lang)}
              ownerOnlyLabel={ownerOnlyPublicVisibilityLabel(lang)}
              lang={lang}
            />
            <div className="flex min-h-[44px] items-center gap-3">
              <input
                id="cashierOnly"
                type="checkbox"
                checked={!!form.cashier_only}
                onChange={e => setForm(f => ({ ...f, cashier_only: e.target.checked }))}
                disabled={savingItemForm}
                className="h-[18px] w-[18px] shrink-0 accent-[#ff5a00] disabled:cursor-wait"
              />
              <label htmlFor="cashierOnly" className="cursor-pointer text-sm font-medium text-[#22201d]">
                {lang === 'uz' ? 'Faqat kassirda ko‘rsatish' : lang === 'ru' ? 'Только для кассира' : 'Cashier only'}
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={closeItemModal} disabled={savingItemForm} className="ws-btn ws-btn-outline flex-1 disabled:cursor-wait">
                {t(lang, 'cancel')}
              </button>
              <button onClick={saveItem} disabled={!canSaveItemForm} className="ws-btn ws-btn-primary flex-1">
                {savingItemForm && <Loader2 size={15} className="animate-spin" />}
                {savingItemForm ? savingLabel(lang) : t(lang, 'save')}
              </button>
            </div>
          </div>
        </Modal>
      )}

    </AppShell>
  )
}
