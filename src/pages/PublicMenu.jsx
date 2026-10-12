import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Clock3, Coins, Instagram, MapPin, Phone, Search, Send, UtensilsCrossed, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getCategoryName } from '../lib/i18n'
import { getBrandLogo } from '../lib/brandLogo'
import { getMenuPricing } from '../lib/menuPricing'
import {
  MENU_CURRENCIES,
  DEFAULT_MENU_CURRENCY,
  formatMenuCurrency,
  getDefaultMenuCurrency,
  loadMenuCurrencyRates,
  normalizeMenuCurrency,
  saveMenuCurrency,
} from '../lib/menuCurrency'
import { isCustomerMenuCategory, isCustomerMenuItem, isTouristHiddenMenuCategory } from '../lib/menuItems'
import { useApp } from '../store/AppContext'
import { findMenuItemByLinkKey, getMenuItemPublicPath } from '../lib/menuLinks'
import { getMenuItemForPriceMode } from '../lib/priceModes'
import { loadPublicMenuPriceSettings } from '../lib/db'
import LanguageSwitcher from '../components/LanguageSwitcher'
import MenuCategoryScroller, { menuCategorySectionId } from '../components/MenuCategoryScroller'
import {
  ProductCard as MenuProductCard,
  ProductDetailPage as MenuProductDetailPage,
} from '../components/MenuProductCards'

// Stable catalog identity: the Catering category is now Corporate Sets.
const CORPORATE_SETS_CATEGORY_ID = 'c1789462941735'

const PUBLIC_CONTACTS = {
  telegram: {
    label: 'Telegram',
    href: 'https://t.me/zarkebab',
  },
  phone: {
    label: '+998 91-509-55-45',
    href: 'tel:+998915095545',
  },
  instagram: {
    label: '@zarkebab',
    href: 'https://www.instagram.com/zarkebab',
  },
  location: {
    label: 'Matbuotchilar 17, Tashkent',
    href: 'https://yandex.com/maps/org/zarkebab/34684464035/',
  },
}

const PUBLIC_MENU_SEO = {
  uz: {
    title: 'Zar Kebab — O‘zbek, Uyg‘ur va Turk restorani',
    heading: 'Zar Kebab — Toshkentdagi O‘zbek, Uyg‘ur va Turk restorani',
    description: 'Nonushta · Tushlik · Kechki ovqat. Zar Kebab — Toshkentdagi O‘zbek, Uyg‘ur va Turk restorani. Menyu · Joy band qilish · Aksiyalar · Aloqa. +998 91-509-55-45. Har kuni 08:00 dan 01:00 gacha.',
    locale: 'uz_UZ',
  },
  ru: {
    title: 'Zar Kebab — узбекская, уйгурская и турецкая кухня',
    heading: 'Zar Kebab — ресторан узбекской, уйгурской и турецкой кухни в Ташкенте',
    description: 'Завтрак · Обед · Ужин. Zar Kebab — узбекская, уйгурская и турецкая кухня в Ташкенте. Меню · Бронирование · Акции · Контакты. +998 91-509-55-45. Ежедневно с 08:00 до 01:00.',
    locale: 'ru_RU',
  },
  en: {
    title: 'Zar Kebab — Uzbek, Uyghur & Turkish restaurant',
    heading: 'Zar Kebab — Uzbek, Uyghur & Turkish restaurant in Tashkent',
    description: 'Breakfast · Lunch · Dinner. Zar Kebab — Uzbek, Uyghur and Turkish restaurant in Tashkent. Menu · Reservations · Promotions · Contacts. +998 91-509-55-45. Open daily from 08:00 to 01:00.',
    locale: 'en_US',
  },
}

const PUBLIC_SITE_COPY = {
  uz: {
    menu: 'Menyu',
    corporateSets: 'Korporativ setlar',
    promotions: 'Aksiyalar',
    vacancies: 'Ish o‘rinlari',
    contacts: 'Aloqa',
    company: 'Restoran',
    information: 'Ma’lumot',
    address: 'Manzil',
    hours: 'Har kuni 08:00–01:00',
    rights: 'Barcha huquqlar himoyalangan.',
  },
  ru: {
    menu: 'Меню',
    corporateSets: 'Корпоративные сеты',
    promotions: 'Акции',
    vacancies: 'Вакансии',
    contacts: 'Контакты',
    company: 'Ресторан',
    information: 'Информация',
    address: 'Адрес',
    hours: 'Ежедневно 08:00–01:00',
    rights: 'Все права защищены.',
  },
  en: {
    menu: 'Menu',
    corporateSets: 'Corporate sets',
    promotions: 'Promotions',
    vacancies: 'Vacancies',
    contacts: 'Contacts',
    company: 'Restaurant',
    information: 'Information',
    address: 'Address',
    hours: 'Open daily 08:00–01:00',
    rights: 'All rights reserved.',
  },
}

function navigateToPublicSection(event, sectionId) {
  const target = document.getElementById(sectionId)
  if (!target) return
  event.preventDefault()
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  window.history.replaceState(null, '', `#${sectionId}`)
}

function HeaderSelect({ value, onChange, options, ariaLabel, icon: Icon, className = '' }) {
  return (
    <label className={`relative inline-flex h-9 items-center rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] text-xs font-black text-[#1F2937] shadow-sm transition-colors hover:bg-white ${className}`}>
      {Icon && (
        <Icon
          size={15}
          strokeWidth={2.5}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 text-[#ff5a00]"
        />
      )}
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={`h-full appearance-none rounded-xl bg-transparent py-0 pr-7 text-xs font-black uppercase outline-none ${Icon ? 'pl-8' : 'pl-3'}`}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} strokeWidth={3} className="pointer-events-none absolute right-2.5 text-[#64748B]" />
    </label>
  )
}

function CompactCurrencySelect({ value, onChange, ariaLabel }) {
  return (
    <label
      title={`${ariaLabel}: ${value}`}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] text-[#ff5a00] shadow-sm"
    >
      <Coins size={16} strokeWidth={2.5} aria-hidden="true" />
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {MENU_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
      </select>
    </label>
  )
}

function PublicContactButtons({ className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
      <a
        href={PUBLIC_CONTACTS.telegram.href}
        target="_blank"
        rel="noreferrer"
        aria-label={PUBLIC_CONTACTS.telegram.label}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700 transition-colors hover:bg-sky-100"
      >
        <Send size={16} />
      </a>
      <a
        href={PUBLIC_CONTACTS.phone.href}
        aria-label={PUBLIC_CONTACTS.phone.label}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
      >
        <Phone size={16} />
      </a>
      <a
        href={PUBLIC_CONTACTS.instagram.href}
        target="_blank"
        rel="noreferrer"
        aria-label={PUBLIC_CONTACTS.instagram.label}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100"
      >
        <Instagram size={16} />
      </a>
      <a
        href={PUBLIC_CONTACTS.location.href}
        target="_blank"
        rel="noreferrer"
        aria-label={PUBLIC_CONTACTS.location.label}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100"
      >
        <MapPin size={16} />
      </a>
    </div>
  )
}

function PublicMenuFooter({ copy, lang, onOpenMenu, onOpenCorporateSets, onOpenVacancies }) {
  const year = new Date().getFullYear()
  return (
    <footer id="public-menu-contacts" className="scroll-mt-28 border-t border-[#E5E7EB] bg-[#FAFAF9] px-4 py-9 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_0.9fr_1.1fr]">
          <div>
            <img src={getBrandLogo(lang)} alt="Zar Kebab" className="h-14 w-auto object-contain" />
            <p className="mt-4 max-w-xs text-sm font-medium leading-relaxed text-[#64748B]">{PUBLIC_MENU_SEO[lang]?.description || PUBLIC_MENU_SEO.en.description}</p>
          </div>
          <div>
            <h2 className="text-sm font-black text-[#1F2937]">{copy.company}</h2>
            <nav className="mt-4 flex flex-col items-start gap-3 text-sm font-semibold text-[#64748B]">
              <a href="/menu" onClick={onOpenMenu} className="hover:text-[#ff5a00]">{copy.menu}</a>
              <a href="/corporate-sets" onClick={onOpenCorporateSets} className="hover:text-[#ff5a00]">{copy.corporateSets}</a>
              <a href="/menu#public-menu-deals" onClick={event => navigateToPublicSection(event, 'public-menu-deals')} className="hover:text-[#ff5a00]">{copy.promotions}</a>
              <a href="/vacancies" onClick={onOpenVacancies} className="hover:text-[#ff5a00]">{copy.vacancies}</a>
            </nav>
          </div>
          <div>
            <h2 className="text-sm font-black text-[#1F2937]">{copy.information}</h2>
            <div className="mt-4 space-y-3 text-sm font-semibold text-[#64748B]">
              <p className="flex items-center gap-2"><Clock3 size={16} className="text-[#ff5a00]" />{copy.hours}</p>
              <a href={PUBLIC_CONTACTS.location.href} target="_blank" rel="noreferrer" className="flex items-start gap-2 hover:text-[#ff5a00]"><MapPin size={16} className="mt-0.5 flex-shrink-0 text-[#ff5a00]" />{PUBLIC_CONTACTS.location.label}</a>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-black text-[#1F2937]">{copy.contacts}</h2>
            <a href={PUBLIC_CONTACTS.phone.href} className="mt-4 block text-lg font-black text-[#1F2937] hover:text-[#ff5a00]">{PUBLIC_CONTACTS.phone.label}</a>
            <PublicContactButtons className="mt-4 justify-start" />
          </div>
        </div>
        <div className="mt-9 flex flex-col gap-2 border-t border-[#E5E7EB] pt-5 text-xs font-semibold text-[#94A3B8] sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Zar Kebab. {copy.rights}</p>
          <p>{copy.address}: {PUBLIC_CONTACTS.location.label}</p>
        </div>
      </div>
    </footer>
  )
}

function MenuSectionHeader({ title, tone = 'default' }) {
  const titleClass = tone === 'deal' ? 'text-red-600' : 'text-[#1F2937]'

  return (
    <div className="mb-3.5 flex items-center gap-3 sm:mb-5 sm:gap-5">
      <div className="h-px min-w-0 flex-1 bg-[#C9C9C9]" />
      <h2 className={`max-w-[76%] flex-shrink-0 text-center text-[22px] font-black leading-none tracking-tight sm:max-w-[70%] sm:text-[30px] ${titleClass}`}>
        {title}
      </h2>
      <div className="h-px min-w-0 flex-1 bg-[#C9C9C9]" />
    </div>
  )
}

function MobileSearchPage({
  open,
  value,
  onChange,
  onClose,
  items,
  categories,
  selectedCategoryId,
  lang,
  onOpenDetail,
  onSelectCategory,
  formatPrice,
  linkBasePath,
}) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  if (!open) return null

  const labels = {
    title: lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search',
    placeholder: lang === 'uz' ? 'Menyudan qidirish...' : lang === 'ru' ? 'Поиск по меню...' : 'Search menu...',
    clear: lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить' : 'Clear',
    close: lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close',
    emptyTitle: lang === 'uz' ? 'Hech narsa topilmadi' : lang === 'ru' ? 'Ничего не найдено' : 'No results found',
    emptyText: lang === 'uz' ? 'Boshqa nom yoki taomni qidirib ko‘ring.' : lang === 'ru' ? 'Попробуйте другое название или блюдо.' : 'Try another dish name or keyword.',
    categories: lang === 'uz' ? 'Kategoriyalar' : lang === 'ru' ? 'Категории' : 'Categories',
    dishes: lang === 'uz' ? 'Taomlar' : lang === 'ru' ? 'Блюда' : 'Dishes',
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-white text-[#1F2937]">
      <div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.close}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#64748B] transition-colors hover:border-orange-200 hover:text-[#ff5a00]"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-lg font-black text-[#1F2937]">{labels.title}</h1>
          </div>

          <div className="relative flex h-12 items-center rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] focus-within:border-[#ff5a00] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ff5a00]/20">
            <Search size={18} className="pointer-events-none absolute left-4 text-[#9CA3AF]" />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={event => onChange(event.target.value)}
              placeholder={labels.placeholder}
              className="h-full w-full bg-transparent pl-12 pr-12 text-base text-[#1F2937] placeholder-[#9CA3AF] outline-none"
            />
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                aria-label={labels.clear}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-[#9CA3AF] transition-colors hover:bg-white hover:text-[#ff5a00]"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-[1280px] pb-6">
          <section className="mb-7">
            <h2 className="mb-3 text-sm font-black text-[#1F2937]">{labels.categories}</h2>
            <div className="flex flex-wrap gap-2" role="list" aria-label={labels.categories}>
              {categories.map(category => {
                const active = selectedCategoryId === category.id
                const name = category.id === 'all'
                  ? (lang === 'uz' ? 'Barchasi' : lang === 'ru' ? 'Все' : 'All')
                  : getCategoryName(category, lang)
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectCategory(category.id)}
                    className={`inline-flex min-h-11 items-center rounded-2xl border px-4 text-sm font-black transition-colors ${active
                      ? 'border-[#ff5a00] bg-[#fff4ed] text-[#ff5a00]'
                      : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#1F2937] hover:border-orange-200 hover:bg-white hover:text-[#ff5a00]'}`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </section>

          {items.length === 0 ? (
            <div className="flex min-h-[35vh] flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
                <UtensilsCrossed size={28} className="text-orange-300" />
              </div>
              <p className="font-black text-[#1F2937]">{labels.emptyTitle}</p>
              <p className="mt-1 max-w-[260px] text-sm text-[#8A94A6]">{labels.emptyText}</p>
            </div>
          ) : (
            <section>
              <h2 className="mb-3 text-sm font-black text-[#1F2937]">{labels.dishes}</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {items.map((item, index) => (
                  <MenuProductCard
                    key={item.id}
                    item={item}
                    qty={0}
                    lang={lang}
                    eager={index < 4}
                    onOpenDetail={onOpenDetail}
                    readOnly
                    formatPrice={formatPrice}
                    linkBasePath={linkBasePath}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

async function loadPublicMenuData(now = new Date()) {
  const rpcRes = await supabase.rpc('get_public_menu_data')

  if (!rpcRes.error && rpcRes.data) {
    const categories = (rpcRes.data.categories || []).filter(category => isCustomerMenuCategory(category, now))
    const categoryIds = new Set(categories.map(category => category.id))
    return {
      categories,
      items: (rpcRes.data.items || []).filter(item => isCustomerMenuItem(item, now) && (!item.category_id || categoryIds.has(item.category_id))),
      source: 'rpc',
    }
  }

  console.warn('[guest-menu] public menu RPC unavailable, falling back to direct selects', rpcRes.error)
  const [catRes, itemRes] = await Promise.all([
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').order('sort_order'),
  ])

  if (catRes.error || itemRes.error) {
    throw catRes.error || itemRes.error
  }

  const categories = (catRes.data || []).filter(category => isCustomerMenuCategory(category, now))
  const categoryIds = new Set(categories.map(category => category.id))
  return {
    categories,
    items: (itemRes.data || []).filter(item => isCustomerMenuItem(item, now) && (!item.category_id || categoryIds.has(item.category_id))),
    source: 'direct',
    rpcError: rpcRes.error,
  }
}

export default function PublicMenu({ premium = false, searchMode = false, corporateSets = false }) {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const { state } = useApp()
  const appLang = state.lang || 'ru'

  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailItem, setDetailItem] = useState(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [searchCategoryId, setSearchCategoryId] = useState('all')
  const [headerOffset, setHeaderOffset] = useState(() => globalThis.window?.innerWidth < 640 ? 122 : 73)
  const [premiumLang, setPremiumLang] = useState('en')
  const [menuCurrency, setMenuCurrency] = useState(() => premium ? 'USD' : getDefaultMenuCurrency())
  const [currencyRates, setCurrencyRates] = useState({ UZS: 1 })
  const [visibilityNow, setVisibilityNow] = useState(() => new Date())
  const [priceSettings, setPriceSettings] = useState({ touristMenuEnabled: true, publicTouristPrices: false })
  const menuBasePath = premium ? '/premium-menu' : corporateSets ? '/corporate-sets' : '/menu'
  const lang = premium ? premiumLang : appLang
  const seo = PUBLIC_MENU_SEO[lang] || PUBLIC_MENU_SEO.ru
  const siteCopy = PUBLIC_SITE_COPY[lang] || PUBLIC_SITE_COPY.en
  const showDetailOverlay = Boolean(detailItem)
  const headerRef = useRef(null)
  const savedScrollRef = useRef(0)
  const menuLoadSeqRef = useRef(0)

  // The owner can switch the Tourist menu off; guests then see the regular menu.
  useEffect(() => {
    if (!premium || priceSettings.touristMenuEnabled) return
    navigate(itemId ? `/menu/item/${encodeURIComponent(itemId)}` : '/menu', { replace: true })
  }, [premium, priceSettings.touristMenuEnabled, itemId, navigate])

  useEffect(() => {
    if (premium) return

    const pageTitle = corporateSets ? `${siteCopy.corporateSets} — Zar Kebab` : seo.title
    document.title = pageTitle
    const description = document.querySelector('meta[name="description"]')
    description?.setAttribute('content', seo.description)

    document.querySelector('meta[property="og:title"]')?.setAttribute('content', pageTitle)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', seo.description)
    document.querySelector('meta[property="og:locale"]')?.setAttribute('content', seo.locale)
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', pageTitle)
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', seo.description)
    document.documentElement.lang = lang

    const canonical = document.querySelector('link[rel="canonical"]')
    canonical?.setAttribute('href', corporateSets ? 'https://www.zarkebab.uz/corporate-sets' : 'https://www.zarkebab.uz/')
  }, [corporateSets, lang, premium, seo.description, seo.locale, seo.title, siteCopy.corporateSets])

  // Links such as /menu#public-menu-deals arrive before the menu renders.
  useEffect(() => {
    if (loading) return
    const sectionId = window.location.hash.slice(1)
    if (!sectionId) return
    requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ block: 'start' }))
  }, [loading])

  const refreshPublicMenu = useCallback(async ({ showLoading = false } = {}) => {
    const seq = menuLoadSeqRef.current + 1
    menuLoadSeqRef.current = seq
    if (showLoading) setLoading(true)
    setError('')
    try {
      const now = new Date()
      // Price switches load with the menu so guests never see one price flip to another.
      const [data, nextPriceSettings] = await Promise.all([loadPublicMenuData(now), loadPublicMenuPriceSettings()])
      if (menuLoadSeqRef.current !== seq) return
      setVisibilityNow(now)
      setPriceSettings(nextPriceSettings)
      if (data.source === 'direct' && data.categories.length === 0 && data.items.length === 0 && data.rpcError) {
        throw new Error('Public menu SQL has not been applied yet. Run migrations/009_guest_public_menu.sql.')
      }
      setCategories(data.categories)
      setItems(data.items)
    } catch (err) {
      if (menuLoadSeqRef.current !== seq) return
      console.error('[guest-menu] failed to load public menu', err)
      setError('load_failed')
    } finally {
      if (menuLoadSeqRef.current === seq) setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshPublicMenu({ showLoading: true })
  }, [refreshPublicMenu])

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshPublicMenu({ showLoading: false })
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [refreshPublicMenu])

  useEffect(() => {
    function updateHeaderOffset() {
      const header = headerRef.current
      const measuredHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0
      setHeaderOffset(measuredHeight || (window.innerWidth < 640 ? 122 : 73))
    }

    updateHeaderOffset()
    const observer = typeof ResizeObserver !== 'undefined' && headerRef.current
      ? new ResizeObserver(updateHeaderOffset)
      : null
    observer?.observe(headerRef.current)
    const frame = requestAnimationFrame(updateHeaderOffset)
    window.addEventListener('resize', updateHeaderOffset)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', updateHeaderOffset)
    }
  }, [])

  useEffect(() => {
    function refreshWhenActive() {
      if (document.visibilityState === 'visible') {
        refreshPublicMenu({ showLoading: false })
      }
    }

    document.addEventListener('visibilitychange', refreshWhenActive)
    window.addEventListener('focus', refreshWhenActive)
    window.addEventListener('online', refreshWhenActive)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenActive)
      window.removeEventListener('focus', refreshWhenActive)
      window.removeEventListener('online', refreshWhenActive)
    }
  }, [refreshPublicMenu])

  useEffect(() => {
    if (menuCurrency === DEFAULT_MENU_CURRENCY) return
    let cancelled = false
    loadMenuCurrencyRates()
      .then(rates => {
        if (!cancelled) setCurrencyRates(rates)
      })
    return () => { cancelled = true }
  }, [menuCurrency])

  const searchQuery = search.trim().toLowerCase()
  const displayCategories = useMemo(
    () => premium ? categories.filter(category => !isTouristHiddenMenuCategory(category)) : categories,
    [categories, premium]
  )
  // Corporate sets live on their own page; the main public menu omits them.
  const listedCategories = useMemo(() => {
    if (corporateSets) return displayCategories.filter(category => category.id === CORPORATE_SETS_CATEGORY_ID)
    if (premium) return displayCategories
    return displayCategories.filter(category => category.id !== CORPORATE_SETS_CATEGORY_ID)
  }, [corporateSets, displayCategories, premium])
  const displayItems = useMemo(() => {
    const categoryIds = new Set(displayCategories.map(category => category.id))
    const visibleItems = items.filter(item => !item.category_id || categoryIds.has(item.category_id))
    return premium || priceSettings.publicTouristPrices
      ? visibleItems.map(item => getMenuItemForPriceMode(item, 'tourist'))
      : visibleItems
  }, [displayCategories, items, premium, priceSettings.publicTouristPrices])

  useEffect(() => {
    if (loading) return
    if (!itemId) {
      setDetailItem(null)
      return
    }
    const linkedItem = findMenuItemByLinkKey(displayItems, itemId)
    setDetailItem(linkedItem)
    if (error || !linkedItem) {
      navigate('/', { replace: true })
    }
  }, [displayItems, error, itemId, loading, navigate])

  const itemCounts = useMemo(() => {
    const counts = { all: displayItems.length }
    displayItems.forEach(item => { counts[item.category_id] = (counts[item.category_id] || 0) + 1 })
    return counts
  }, [displayItems])
  const categoryCards = useMemo(
    () => [{ id: 'all' }, ...listedCategories.filter(category => (itemCounts[category.id] || 0) > 0)
      .sort((a, b) => Number(b.id === CORPORATE_SETS_CATEGORY_ID) - Number(a.id === CORPORATE_SETS_CATEGORY_ID))],
    [listedCategories, itemCounts]
  )

  const searchResults = useMemo(() => {
    return displayItems.filter(item => {
      const names = [item.name_uz, item.name_ru, item.name_en, item.description_uz, item.description_ru, item.description_en]
      const matchesSearch = !searchQuery || names.some(value => value?.toLowerCase().includes(searchQuery))
      const matchesCategory = searchCategoryId === 'all' || item.category_id === searchCategoryId
      return matchesCategory && matchesSearch
    })
  }, [displayItems, searchCategoryId, searchQuery])

  const groupedSections = useMemo(() => {
    const sections = listedCategories
      .map(cat => ({
        cat,
        items: displayItems.filter(item => item.category_id === cat.id),
      }))
      .filter(section => section.items.length > 0)

    const categoryIds = new Set(displayCategories.map(cat => cat.id))
    const uncategorized = displayItems.filter(item => !categoryIds.has(item.category_id))
    if (!corporateSets && uncategorized.length > 0) {
      sections.push({
        cat: { id: 'uncategorized', name_uz: 'Boshqa', name_ru: 'Другое', name_en: 'Other' },
        items: uncategorized,
      })
    }

    return sections
  }, [corporateSets, displayCategories, displayItems, listedCategories])

  const dealItems = useMemo(() => {
    if (corporateSets) return []
    const listedIds = new Set(listedCategories.map(cat => cat.id))
    const categoryIds = new Set(displayCategories.map(cat => cat.id))
    return displayItems.filter(item =>
      (listedIds.has(item.category_id) || !categoryIds.has(item.category_id)) && getMenuPricing(item).discounted
    )
  }, [corporateSets, displayCategories, displayItems, listedCategories])
  const priceFormatter = useMemo(
    () => amount => formatMenuCurrency(amount, menuCurrency, currencyRates),
    [menuCurrency, currencyRates]
  )

  const dealsTitle = lang === 'uz' ? 'Chegirmalar' : lang === 'ru' ? 'Акции' : 'Deals'
  const menuTitle = premium
    ? (lang === 'uz' ? 'Premium menyu' : lang === 'ru' ? 'Премиум меню' : 'Premium Menu')
    : (lang === 'uz' ? 'Menyu' : lang === 'ru' ? 'Меню' : 'Menu')
  const categoryMap = useMemo(() => {
    const map = {}
    displayCategories.forEach(cat => { map[cat.id] = cat })
    return map
  }, [displayCategories])

  function renderCategorySection(section) {
    return (
      <section
        key={section.cat.id}
        id={menuCategorySectionId('public-menu-category', section.cat.id)}
        className="scroll-mt-32"
      >
        <MenuSectionHeader title={getCategoryName(section.cat, lang)} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {section.items.map((item, index) => (
            <MenuProductCard
              key={item.id}
              item={item}
              qty={0}
              lang={lang}
              eager={(section.cat.id === CORPORATE_SETS_CATEGORY_ID || groupedSections[0]?.cat.id === section.cat.id) && index < 6}
              onOpenDetail={openDetail}
              readOnly
              formatPrice={priceFormatter}
              linkBasePath={menuBasePath}
            />
          ))}
        </div>
      </section>
    )
  }

  function openDetail(item) {
    savedScrollRef.current = window.scrollY
    setDetailItem(item)
    navigate(getMenuItemPublicPath(item, menuBasePath))
  }

  function closeDetail() {
    const scrollY = savedScrollRef.current
    setDetailItem(null)
    setMissingItemLink(false)
    navigate(menuBasePath)
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: 'instant' })
    })
  }

  function changeMenuCurrency(currency) {
    const normalized = normalizeMenuCurrency(currency)
    setMenuCurrency(premium ? normalized : saveMenuCurrency(normalized))
  }

  function navigateWithTransition(path) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || typeof document.startViewTransition !== 'function') {
      navigate(path)
      return
    }
    document.startViewTransition(() => {
      flushSync(() => navigate(path))
    })
  }

  function openSearch() {
    setSearchCategoryId('all')
    if (premium) {
      setMobileSearchOpen(true)
      return
    }
    navigateWithTransition('/search')
  }

  function closeSearch() {
    if (searchMode) {
      navigateWithTransition('/menu')
      return
    }
    setMobileSearchOpen(false)
  }

  function openCorporateSets(event) {
    event.preventDefault()
    if (corporateSets) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    navigateWithTransition('/corporate-sets')
  }

  function openMenuHome(event) {
    if (!corporateSets) {
      navigateToPublicSection(event, 'public-menu-content')
      return
    }
    event.preventDefault()
    navigateWithTransition('/menu')
  }

  function openVacancies(event) {
    event.preventDefault()
    navigateWithTransition('/vacancies')
  }

  if (searchMode) {
    return (
      <MobileSearchPage
        open
        value={search}
        onChange={setSearch}
        onClose={closeSearch}
        items={searchResults}
        categories={categoryCards}
        selectedCategoryId={searchCategoryId}
        lang={lang}
        onOpenDetail={openDetail}
        onSelectCategory={setSearchCategoryId}
        formatPrice={priceFormatter}
        linkBasePath={menuBasePath}
      />
    )
  }

  return (
    <div className="min-h-screen bg-white text-[#1F2937]" style={{ paddingTop: headerOffset }}>
      <div data-nosnippet="">
        <header ref={headerRef} className="fixed left-0 right-0 top-0 z-40 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-[1280px] px-3 py-2 sm:px-6 sm:py-3">
            <div className="relative flex h-11 items-center justify-between lg:hidden">
              <button
                type="button"
                onClick={openSearch}
                aria-label={lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search'}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#64748B] shadow-sm transition-colors active:scale-95"
              >
                <Search size={17} />
              </button>

              <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 min-[360px]:gap-1 min-[400px]:gap-2">
                <img src={getBrandLogo(lang)} alt="Zar Kebab" className="h-7 w-auto object-contain min-[360px]:h-8 min-[400px]:h-9" />
                <span className="whitespace-nowrap text-[7px] font-black uppercase tracking-[0.03em] text-[#ff5a00] min-[360px]:text-[8px] min-[360px]:tracking-[0.08em] min-[400px]:text-[10px] min-[400px]:tracking-[0.14em]">Zar Kebab</span>
              </div>

              <div className="flex items-center gap-1 min-[400px]:gap-1.5">
                <div className="min-[400px]:hidden">
                  <CompactCurrencySelect
                    value={menuCurrency}
                    onChange={changeMenuCurrency}
                    ariaLabel={lang === 'uz' ? 'Valyuta' : lang === 'ru' ? 'Валюта' : 'Currency'}
                  />
                </div>
                <div className="hidden min-[400px]:block">
                  <HeaderSelect
                    value={menuCurrency}
                    onChange={changeMenuCurrency}
                    options={MENU_CURRENCIES.map(currency => ({ value: currency, label: currency }))}
                    ariaLabel={lang === 'uz' ? 'Valyuta' : lang === 'ru' ? 'Валюта' : 'Currency'}
                  />
                </div>
                {premium ? <LanguageSwitcher value={lang} onChange={setPremiumLang} compact /> : <LanguageSwitcher compact />}
              </div>
            </div>

            <div className="hidden grid-cols-[1fr_auto_1fr] items-center gap-3 lg:grid">
              <div className="min-w-0 justify-self-start">
                <button
                  type="button"
                  onClick={openSearch}
                  aria-label={lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search'}
                  className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#64748B] transition-colors hover:border-orange-200 hover:bg-white hover:text-[#ff5a00]"
                >
                  <Search size={17} />
                </button>
                {!premium && (
                  <nav className="hidden items-center gap-5 lg:flex" aria-label={siteCopy.company}>
                    <a href="/menu" onClick={openMenuHome} className="text-sm font-black text-[#1F2937] transition-colors hover:text-[#ff5a00]">{siteCopy.menu}</a>
                    <a href="/corporate-sets" onClick={openCorporateSets} aria-current={corporateSets ? 'page' : undefined} className={`text-sm font-black transition-colors hover:text-[#ff5a00] ${corporateSets ? 'text-[#ff5a00]' : 'text-[#1F2937]'}`}>{siteCopy.corporateSets}</a>
                    <a href="/menu#public-menu-deals" onClick={event => navigateToPublicSection(event, 'public-menu-deals')} className="text-sm font-black text-[#1F2937] transition-colors hover:text-[#ff5a00]">{siteCopy.promotions}</a>
                    <a href="/vacancies" onClick={openVacancies} className="text-sm font-black text-[#1F2937] transition-colors hover:text-[#ff5a00]">{siteCopy.vacancies}</a>
                    <a href="#public-menu-contacts" onClick={event => navigateToPublicSection(event, 'public-menu-contacts')} className="text-sm font-black text-[#1F2937] transition-colors hover:text-[#ff5a00]">{siteCopy.contacts}</a>
                  </nav>
                )}
              </div>

              <div className="flex items-center gap-2.5 justify-self-center sm:gap-3">
                <img src={getBrandLogo(lang)} alt="Zar Kebab" className="h-10 w-auto object-contain sm:h-12" />
                <span className="whitespace-nowrap text-[11px] font-black uppercase tracking-[0.15em] text-[#ff5a00] sm:text-xs">Zar Kebab</span>
              </div>

              <div className="flex items-center gap-2 justify-self-end">
                <button
                  type="button"
                  onClick={openSearch}
                  aria-label={lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search'}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#64748B] transition-colors hover:border-orange-200 hover:bg-white hover:text-[#ff5a00]"
                >
                  <Search size={17} />
                </button>
                <div className="hidden lg:block">
                  <HeaderSelect
                    value={menuCurrency}
                    onChange={changeMenuCurrency}
                    icon={Coins}
                    options={MENU_CURRENCIES.map(currency => ({
                      value: currency,
                      label: currency === 'UZS' ? "so'm UZS" : currency === 'USD' ? '$ USD' : '€ EUR',
                    }))}
                    ariaLabel={lang === 'uz' ? 'Valyuta' : lang === 'ru' ? 'Валюта' : 'Currency'}
                  />
                </div>
                {premium ? <LanguageSwitcher value={lang} onChange={setPremiumLang} /> : <LanguageSwitcher />}
              </div>
            </div>
          </div>
        </header>
      </div>

      <main id="public-menu-content" className="mx-auto max-w-[1280px] scroll-mt-28 px-3 pb-5 pt-3 sm:px-6 sm:pt-5">
        {!corporateSets && <div data-nosnippet="">
          <MenuCategoryScroller
            categories={categoryCards}
            activeCategoryId={activeCategory}
            onCategoryClick={setActiveCategory}
            onActiveCategoryChange={setActiveCategory}
            lang={lang}
            itemCounts={itemCounts}
            sectionPrefix="public-menu-category"
            topOffset={headerOffset}
            scrollOffset={64}
            className="mb-5 mt-0 rounded-[22px] border border-[#E5E7EB] bg-white p-2.5 shadow-sm sm:mb-7 sm:rounded-[28px] sm:p-4"
            collapsedPosition="fixed"
            collapsedSurfaceClass="bg-white/95"
            collapsedClassName="z-50 px-3 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-[1280px] sm:-translate-x-1/2 sm:px-4"
          />
        </div>}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white shadow-sm">
                <div className="aspect-square animate-pulse bg-orange-50" />
                <div className="space-y-2.5 p-3">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
                  <div className="h-5 w-1/2 animate-pulse rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-red-100 bg-red-50 p-10 text-center">
            <p className="font-semibold text-red-700">
              {lang === 'uz'
                ? 'Menyuni yuklab bo‘lmadi.'
                : lang === 'ru'
                  ? 'Не удалось загрузить меню.'
                  : 'Could not load the menu.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-black text-red-700 shadow-sm"
            >
              {lang === 'uz' ? 'Qayta urinish' : lang === 'ru' ? 'Попробовать снова' : 'Try again'}
            </button>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="rounded-[28px] border border-[#E5E7EB] bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
              <UtensilsCrossed size={28} className="text-orange-300" />
            </div>
            <p className="font-black text-[#1F2937]">
              {lang === 'uz' ? 'Menyu hozircha mavjud emas' : lang === 'ru' ? 'Меню пока недоступно' : 'Menu is not available yet'}
            </p>
            <p className="mt-1 text-sm text-[#8A94A6]">
              {lang === 'uz' ? 'Iltimos, keyinroq qayta urinib ko‘ring.' : lang === 'ru' ? 'Пожалуйста, попробуйте позже.' : 'Please try again later.'}
            </p>
          </div>
        ) : (
          groupedSections ? (
            <div className="space-y-7">
              {groupedSections.filter(section => section.cat.id === CORPORATE_SETS_CATEGORY_ID).map(renderCategorySection)}
              {dealItems.length > 0 && (
                <section id="public-menu-deals" className="scroll-mt-32">
                  <MenuSectionHeader title={dealsTitle} tone="deal" />
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {dealItems.map((item, index) => (
                      <MenuProductCard
                        key={`deal-${item.id}`}
                        item={item}
                        qty={0}
                        lang={lang}
                        eager={index < 4}
                        onOpenDetail={openDetail}
                        readOnly
                        formatPrice={priceFormatter}
                        linkBasePath={menuBasePath}
                      />
                    ))}
                  </div>
                </section>
              )}
              {groupedSections.filter(section => section.cat.id !== CORPORATE_SETS_CATEGORY_ID).map(renderCategorySection)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {displayItems.map((item, index) => (
                <MenuProductCard
                  key={item.id}
                  item={item}
                  qty={0}
                  lang={lang}
                  eager={index < 8}
                  onOpenDetail={openDetail}
                  readOnly
                  formatPrice={priceFormatter}
                  linkBasePath={menuBasePath}
                />
              ))}
            </div>
          )
        )}
      </main>
      {!premium && <PublicMenuFooter copy={siteCopy} lang={lang} onOpenMenu={openMenuHome} onOpenCorporateSets={openCorporateSets} onOpenVacancies={openVacancies} />}
      {showDetailOverlay && (
        <div className="fixed inset-0 z-[80] bg-white">
          <MenuProductDetailPage
            item={detailItem}
            category={categoryMap[detailItem.category_id]}
            currentQty={0}
            currentNotes=""
            lang={lang}
            onBack={closeDetail}
            onCancel={closeDetail}
            onAddToCart={() => {}}
            readOnly
            formatPrice={priceFormatter}
            linkBasePath={menuBasePath}
            languageControl={premium
              ? <LanguageSwitcher value={lang} onChange={setPremiumLang} />
              : <LanguageSwitcher />}
          />
        </div>
      )}
      <MobileSearchPage
        open={mobileSearchOpen}
        value={search}
        onChange={setSearch}
        onClose={closeSearch}
        items={searchResults}
        categories={categoryCards}
        selectedCategoryId={searchCategoryId}
        lang={lang}
        onOpenDetail={openDetail}
        onSelectCategory={setSearchCategoryId}
        formatPrice={priceFormatter}
        linkBasePath={menuBasePath}
      />
    </div>
  )
}
