import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, Coins, Instagram, MapPin, Phone, Search, Send, UtensilsCrossed, X } from 'lucide-react'
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
import { isPublicMenuCategory, isPublicMenuItem, isTouristHiddenMenuCategory, menuTimeWindowLabel } from '../lib/menuItems'
import { useApp } from '../store/AppContext'
import { findMenuItemByLinkKey, getMenuItemPublicPath } from '../lib/menuLinks'
import { getMenuItemForPriceMode } from '../lib/priceModes'
import { loadPublicMenuPriceSettings } from '../lib/db'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme } from '../lib/theme'
import MenuCategoryScroller, { menuCategorySectionId } from '../components/MenuCategoryScroller'
import {
  ProductCard as MenuProductCard,
  PublicDishCard,
  PublicDishDetailPage,
} from '../components/MenuProductCards'
import heroImage from '../assets/brand/zarkebab-hero-kebab.webp'

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
    googleMapsHref: 'https://www.google.com/maps/search/?api=1&query=Zar+Kebab+Matbuotchilar+17+Tashkent',
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
    about: 'Ko‘mirda pishirilgan kaboblar hamda o‘zbek, uyg‘ur va turk oshxonasining eng sevimli taomlari — nonushtadan kechki ovqatgacha, Toshkentda.',
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
    about: 'Шашлык на углях и любимые блюда узбекской, уйгурской и турецкой кухни — от завтрака до позднего ужина, в Ташкенте.',
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
    about: 'Charcoal-grilled kebabs and the much-loved dishes of Uzbek, Uyghur and Turkish cooking — from breakfast to a late dinner, in Tashkent.',
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
    <label className={`lux-chip relative inline-flex h-9 items-center rounded-full text-xs font-black ${className}`}>
      {Icon && (
        <Icon
          size={15}
          strokeWidth={2.5}
          aria-hidden="true"
          className="lux-gold pointer-events-none absolute left-2.5"
        />
      )}
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={`h-full cursor-pointer appearance-none rounded-full bg-transparent py-0 pr-3 text-xs font-black uppercase outline-none ${Icon ? 'pl-8' : 'pl-3'}`}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function CompactCurrencySelect({ value, onChange, ariaLabel }) {
  return (
    <label
      title={`${ariaLabel}: ${value}`}
      className="lux-chip relative flex h-9 w-9 items-center justify-center rounded-full"
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

// Where "location" can open. Without JavaScript (or if the chooser is unavailable) links fall back to Google Maps.
const MAP_APPS = [
  { key: 'google', label: 'Google Maps', href: PUBLIC_CONTACTS.location.googleMapsHref },
  { key: 'yandex', label: 'Yandex Maps', href: PUBLIC_CONTACTS.location.href },
  { key: 'apple', label: 'Apple Maps', href: 'https://maps.apple.com/?q=Zar%20Kebab&address=Matbuotchilar%2017%2C%20Tashkent' },
]

const MAP_CHOOSER_COPY = {
  uz: { title: 'Xaritada ochish', cancel: 'Bekor qilish' },
  ru: { title: 'Открыть в картах', cancel: 'Отмена' },
  en: { title: 'Open in maps', cancel: 'Cancel' },
}

function MapChooserSheet({ open, lang, onClose }) {
  const copy = MAP_CHOOSER_COPY[lang] || MAP_CHOOSER_COPY.en
  const firstOptionRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    firstOptionRef.current?.focus({ preventScroll: true })
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center" role="presentation" onClick={onClose} style={{ background: 'rgb(15 11 8 / 45%)' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        onClick={event => event.stopPropagation()}
        className="lux-glass zk-sheet-in w-full max-w-[380px] rounded-[28px] p-3"
      >
        <p className="lux-gold px-3 pb-2 pt-1 text-center text-[11px] font-medium uppercase tracking-[0.26em]">{copy.title}</p>
        <div className="space-y-2">
          {MAP_APPS.map((app, index) => (
            <a
              key={app.key}
              ref={index === 0 ? firstOptionRef : undefined}
              href={app.href}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="lux-soft lux-title flex h-12 items-center justify-between rounded-2xl px-4 text-[15px] font-medium transition-colors"
            >
              <span className="flex items-center gap-3"><MapPin size={17} className="lux-gold" />{app.label}</span>
              <span aria-hidden="true" className="lux-muted">↗</span>
            </a>
          ))}
        </div>
        <button type="button" onClick={onClose} className="lux-cta mt-3 h-12 w-full rounded-2xl text-sm font-semibold">
          {copy.cancel}
        </button>
      </div>
    </div>
  )
}

function PublicContactButtons({ className = '', onOpenMap }) {
  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
      <a
        href={PUBLIC_CONTACTS.telegram.href}
        target="_blank"
        rel="noreferrer"
        aria-label={PUBLIC_CONTACTS.telegram.label}
        className="lux-chip flex h-10 w-10 items-center justify-center rounded-full"
      >
        <Send size={16} />
      </a>
      <a
        href={PUBLIC_CONTACTS.phone.href}
        aria-label={PUBLIC_CONTACTS.phone.label}
        className="lux-chip flex h-10 w-10 items-center justify-center rounded-full"
      >
        <Phone size={16} />
      </a>
      <a
        href={PUBLIC_CONTACTS.instagram.href}
        target="_blank"
        rel="noreferrer"
        aria-label={PUBLIC_CONTACTS.instagram.label}
        className="lux-chip flex h-10 w-10 items-center justify-center rounded-full"
      >
        <Instagram size={16} />
      </a>
      <a
        href={PUBLIC_CONTACTS.location.googleMapsHref}
        target="_blank"
        rel="noreferrer"
        onClick={onOpenMap}
        aria-label={PUBLIC_CONTACTS.location.label}
        className="lux-chip flex h-10 w-10 items-center justify-center rounded-full"
      >
        <MapPin size={16} />
      </a>
    </div>
  )
}

function PublicMenuFooter({ copy, lang, onOpenMenu, onOpenCorporateSets, onOpenVacancies, onOpenMap }) {
  const year = new Date().getFullYear()
  return (
    <footer id="public-menu-contacts" className="lux-page-2 lux-line scroll-mt-28 border-t px-4 py-9 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 lg:grid-cols-[1.2fr_0.8fr_0.9fr_1.1fr]">
          <div className="col-span-2 lg:col-span-1">
            <img src={getBrandLogo(lang)} alt="Zar Kebab" className="h-14 w-auto object-contain" />
            <p className="zk-serif lux-body mt-4 max-w-xs text-[19px] font-medium leading-snug">{copy.about}</p>
          </div>
          <div>
            <h2 className="lux-gold text-[11px] font-medium uppercase tracking-[0.26em]">{copy.company}</h2>
            <nav className="lux-body mt-4 flex flex-col items-start gap-3 text-sm">
              <a href="/menu" onClick={onOpenMenu} className="hover:text-[#ff5a00]">{copy.menu}</a>
              <a href="/corporate-sets" onClick={onOpenCorporateSets} className="hover:text-[#ff5a00]">{copy.corporateSets}</a>
              <a href="/menu#public-menu-deals" onClick={event => navigateToPublicSection(event, 'public-menu-deals')} className="hover:text-[#ff5a00]">{copy.promotions}</a>
              <a href="/vacancies" onClick={onOpenVacancies} className="hover:text-[#ff5a00]">{copy.vacancies}</a>
            </nav>
          </div>
          <div>
            <h2 className="lux-gold text-[11px] font-medium uppercase tracking-[0.26em]">{copy.information}</h2>
            <div className="lux-body mt-4 space-y-3 text-sm">
              <p className="flex items-center gap-2"><Clock3 size={16} className="lux-gold" />{copy.hours}</p>
              <a href={PUBLIC_CONTACTS.location.googleMapsHref} target="_blank" rel="noreferrer" onClick={onOpenMap} className="flex items-start gap-2 hover:text-[#ff5a00]"><MapPin size={16} className="lux-gold mt-0.5 flex-shrink-0" />{PUBLIC_CONTACTS.location.label}</a>
            </div>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <h2 className="lux-gold text-[11px] font-medium uppercase tracking-[0.26em]">{copy.contacts}</h2>
            <a href={PUBLIC_CONTACTS.phone.href} className="zk-serif lux-title mt-3 block text-[24px] font-semibold hover:text-[#ff5a00]">{PUBLIC_CONTACTS.phone.label}</a>
            <PublicContactButtons className="mt-4 !justify-start" onOpenMap={onOpenMap} />
          </div>
        </div>
        <div className="lux-line lux-muted mt-9 flex flex-col gap-2 border-t pt-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Zar Kebab. {copy.rights}</p>
          <p>{copy.address}: {PUBLIC_CONTACTS.location.label}</p>
        </div>
      </div>
    </footer>
  )
}

function MenuSectionHeader({ title, subtitle = '', tone = 'default' }) {
  const titleClass = tone === 'deal' ? 'text-[#ff5a00]' : 'lux-title'

  return (
    <div className="mb-6 flex flex-col items-center text-center sm:mb-9">
      <h2 className={`zk-serif max-w-[90%] text-[34px] font-semibold leading-none sm:text-[48px] ${titleClass}`}>
        {title}
      </h2>
      <span aria-hidden="true" className="mt-3 h-px w-14 bg-[#C9A86A] sm:mt-4 sm:w-20" />
      {subtitle && (
        <p className="lux-gold mt-3 text-[12px] font-medium uppercase tracking-[0.2em] tabular-nums">{subtitle}</p>
      )}
    </div>
  )
}

// The product page sits on a dark photo in both themes, so its language chip is glass too.
const DETAIL_LANGUAGE_CLASS = '!h-11 !rounded-full !border-white/25 !bg-black/40 !text-white !shadow-none backdrop-blur'

const HERO_COPY = {
  uz: {
    eyebrow: 'O‘zbek · Uyg‘ur · Turk oshxonasi',
    tagline: 'Ko‘mirda pishirilgan kaboblar va milliy taomlar. Har kuni 08:00 dan 01:00 gacha, Toshkentda.',
    menu: 'Menyuni ko‘rish',
    reserve: 'Stol band qilish',
  },
  ru: {
    eyebrow: 'Узбекская · уйгурская · турецкая кухня',
    tagline: 'Шашлык на углях и национальные блюда. Ежедневно с 08:00 до 01:00, Ташкент.',
    menu: 'Смотреть меню',
    reserve: 'Забронировать стол',
  },
  en: {
    eyebrow: 'Uzbek · Uyghur · Turkish kitchen',
    tagline: 'Charcoal-grilled kebabs and national dishes. Open daily 08:00–01:00 in Tashkent.',
    menu: 'View menu',
    reserve: 'Reserve a table',
  },
}

/**
 * Full-width welcome section. The photo runs up under the see-through header and
 * fades into the page at the bottom, where the category chips sit.
 */
function PublicMenuHero({ lang, onViewMenu, headerOffset = 0, heroRef, theme = 'light' }) {
  const copy = HERO_COPY[lang] || HERO_COPY.en
  const dark = theme === 'dark'
  return (
    <section
      ref={heroRef}
      aria-label="Zar Kebab"
      className="relative isolate overflow-hidden"
      style={{ marginTop: -headerOffset, paddingTop: headerOffset }}
    >
      {/* One photo for both themes. Light mode shades only behind the text, so the bottom can
          fade straight into the cream page without a muddy dark band. */}
      <img
        src={heroImage}
        alt=""
        fetchpriority="high"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-center"
      />
      {dark ? (
        <>
          <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgb(20 17 14 / 45%) 0%, rgb(20 17 14 / 20%) 28%, rgb(20 17 14 / 62%) 62%, rgb(20 17 14 / 88%) 86%)' }} />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#14110E]/60 via-transparent to-transparent" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgb(20 15 11 / 38%) 0%, rgb(20 15 11 / 0%) 32%)' }} />
          <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(120% 90% at 0% 85%, rgb(20 15 11 / 72%) 0%, rgb(20 15 11 / 42%) 38%, rgb(20 15 11 / 0%) 70%)' }} />
        </>
      )}
      {/* Bottom edge melts into the page colour so the categories start on the photo. */}
      <div className="absolute inset-x-0 -bottom-px -z-10 h-28 sm:h-36" style={{ background: 'linear-gradient(0deg, var(--lux-page) 0%, var(--lux-page) 6px, transparent 100%)' }} />
      <div className="mx-auto flex min-h-[400px] max-w-[1280px] flex-col justify-end px-5 pb-[92px] pt-14 sm:min-h-[78vh] sm:px-8 sm:pb-[132px] sm:pt-24 lg:max-h-[820px]">
        <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-[#E7C98F] sm:text-xs sm:tracking-[0.32em]">{copy.eyebrow}</p>
        <h1 className="zk-serif mt-2 text-[52px] font-semibold leading-[0.9] text-white sm:mt-4 sm:text-[104px] lg:text-[128px]" style={{ textShadow: '0 4px 24px rgb(0 0 0 / 35%)' }}>Zar Kebab</h1>
        <p className="mt-3 max-w-[520px] text-[14px] font-light leading-relaxed text-white/85 sm:mt-5 sm:text-[17px]">{copy.tagline}</p>
        <div className="mt-5 flex flex-wrap gap-2.5 sm:mt-8 sm:gap-3">
          <a
            href="#public-menu-content"
            onClick={onViewMenu}
            className="lux-primary inline-flex h-11 items-center rounded-full px-7 text-sm font-semibold tracking-wide sm:h-12 sm:px-8"
          >
            {copy.menu}
          </a>
          <a
            href={PUBLIC_CONTACTS.phone.href}
            className="lux-on-photo inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold tracking-wide sm:h-12 sm:px-7"
          >
            {copy.reserve}
          </a>
        </div>
      </div>
    </section>
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
    <div className="zk-lux fixed inset-0 z-[90] flex flex-col">
      <div className="lux-header sticky top-0 z-10 border-b px-4 py-3">
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.close}
              className="lux-chip flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="zk-serif lux-title text-[26px] font-semibold">{labels.title}</h1>
          </div>

          <div className="lux-input relative flex h-12 items-center rounded-full">
            <Search size={18} className="lux-muted pointer-events-none absolute left-4" />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={event => onChange(event.target.value)}
              placeholder={labels.placeholder}
              className="h-full w-full bg-transparent pl-12 pr-12 text-base outline-none"
            />
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                aria-label={labels.clear}
                className="lux-muted absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:text-[#ff5a00]"
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
            <h2 className="lux-gold mb-3 text-[11px] font-medium uppercase tracking-[0.26em]">{labels.categories}</h2>
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
                    className="lux-chip inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium"
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
              <p className="zk-serif lux-title text-[22px] font-semibold">{labels.emptyTitle}</p>
              <p className="mt-1 max-w-[260px] text-sm text-[#8A94A6]">{labels.emptyText}</p>
            </div>
          ) : (
            <section>
              <h2 className="lux-gold mb-3 text-[11px] font-medium uppercase tracking-[0.26em]">{labels.dishes}</h2>
              <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-6 sm:gap-y-11 md:grid-cols-3 xl:grid-cols-4">
                {items.map((item, index) => (
                  <PublicDishCard
                    key={item.id}
                    item={item}
                    lang={lang}
                    eager={index < 4}
                    onOpenDetail={onOpenDetail}
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

async function loadPublicMenuData() {
  const rpcRes = await supabase.rpc('get_public_menu_data')

  if (!rpcRes.error && rpcRes.data) {
    const categories = (rpcRes.data.categories || []).filter(isPublicMenuCategory)
    const categoryIds = new Set(categories.map(category => category.id))
    return {
      categories,
      items: (rpcRes.data.items || []).filter(item => isPublicMenuItem(item) && (!item.category_id || categoryIds.has(item.category_id))),
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

  const categories = (catRes.data || []).filter(isPublicMenuCategory)
  const categoryIds = new Set(categories.map(category => category.id))
  return {
    categories,
    items: (itemRes.data || []).filter(item => isPublicMenuItem(item) && (!item.category_id || categoryIds.has(item.category_id))),
    source: 'direct',
    rpcError: rpcRes.error,
  }
}

export default function PublicMenu({ premium = false, searchMode = false, corporateSets = false }) {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const { state } = useApp()
  // Every public view (search included) follows the visitor's light/dark theme.
  const { theme } = useTheme()
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
  const [priceSettings, setPriceSettings] = useState({ touristMenuEnabled: true, publicTouristPrices: false })
  const menuBasePath = premium ? '/premium-menu' : corporateSets ? '/corporate-sets' : '/menu'
  const lang = premium ? premiumLang : appLang
  const seo = PUBLIC_MENU_SEO[lang] || PUBLIC_MENU_SEO.ru
  const siteCopy = PUBLIC_SITE_COPY[lang] || PUBLIC_SITE_COPY.en
  const showDetailOverlay = Boolean(detailItem)
  const headerRef = useRef(null)
  const heroRef = useRef(null)
  const [headerOverHero, setHeaderOverHero] = useState(!premium && !corporateSets)
  const savedScrollRef = useRef(0)
  const detailSourceRef = useRef(null)
  const [mapChooserOpen, setMapChooserOpen] = useState(false)
  const closeMapChooser = useCallback(() => setMapChooserOpen(false), [])
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
      // Price switches load with the menu so guests never see one price flip to another.
      const [data, nextPriceSettings] = await Promise.all([loadPublicMenuData(), loadPublicMenuPriceSettings()])
      if (menuLoadSeqRef.current !== seq) return
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

  // Over the welcome photo the header is see-through; past it, the regular glass bar returns.
  useEffect(() => {
    if (premium || corporateSets) {
      setHeaderOverHero(false)
      return undefined
    }
    function updateHeaderOverHero() {
      const hero = heroRef.current
      // The category chips overlap the photo's last ~110px; switch to the solid bar before they
      // reach the header, otherwise the chips show through it next to the sticky category bar.
      setHeaderOverHero(hero ? hero.getBoundingClientRect().bottom - 120 > headerOffset : true)
    }
    updateHeaderOverHero()
    window.addEventListener('scroll', updateHeaderOverHero, { passive: true })
    window.addEventListener('resize', updateHeaderOverHero)
    return () => {
      window.removeEventListener('scroll', updateHeaderOverHero)
      window.removeEventListener('resize', updateHeaderOverHero)
    }
  }, [corporateSets, headerOffset, premium])

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
  const showHero = !premium && !corporateSets
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
        <MenuSectionHeader title={getCategoryName(section.cat, lang)} subtitle={menuTimeWindowLabel(section.cat, lang)} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-6 sm:gap-y-11 md:grid-cols-3 xl:grid-cols-4">
          {section.items.map((item, index) => (
            <PublicDishCard
              key={item.id}
              item={item}
              lang={lang}
              eager={(section.cat.id === CORPORATE_SETS_CATEGORY_ID || groupedSections[0]?.cat.id === section.cat.id) && index < 6}
              onOpenDetail={openDetail}
              formatPrice={priceFormatter}
              linkBasePath={menuBasePath}
            />
          ))}
        </div>
      </section>
    )
  }

  // The tapped photo morphs into the product page and back (View Transitions; instant where unsupported).
  function morphDishPhoto(sourceElement, update) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || typeof document.startViewTransition !== 'function') {
      update()
      return
    }
    const transition = document.startViewTransition(() => {
      flushSync(update)
      if (sourceElement?.isConnected && !detailSourceRef.current) sourceElement.style.viewTransitionName = 'zk-dish'
    })
    transition.finished.finally(() => {
      if (sourceElement) sourceElement.style.viewTransitionName = ''
    })
  }

  function openMapChooser(event) {
    event?.preventDefault()
    setMapChooserOpen(true)
  }

  function openDetail(item, sourceElement = null) {
    savedScrollRef.current = window.scrollY
    detailSourceRef.current = sourceElement
    if (sourceElement) sourceElement.style.viewTransitionName = 'zk-dish'
    morphDishPhoto(sourceElement, () => {
      if (sourceElement) sourceElement.style.viewTransitionName = ''
      setDetailItem(item)
      navigate(getMenuItemPublicPath(item, menuBasePath))
    })
  }

  function closeDetail() {
    const scrollY = savedScrollRef.current
    const sourceElement = detailSourceRef.current
    detailSourceRef.current = null
    // Hide the details card before the transition snapshots the page: only the photo animates back.
    // (A captured card keeps applying its backdrop blur over the menu while it fades.)
    const details = document.querySelector('[data-dish-details]')
    if (details) {
      details.style.viewTransitionName = 'none'
      details.style.visibility = 'hidden'
    }
    morphDishPhoto(sourceElement, () => {
      setDetailItem(null)
      navigate(menuBasePath)
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
    <div className="zk-lux min-h-screen" style={{ paddingTop: headerOffset }}>
      <div data-nosnippet="">
        <header ref={headerRef} className={`${headerOverHero && !searchMode ? 'lux-header-photo' : 'lux-header'} fixed left-0 right-0 top-0 z-40 border-b transition-[background,box-shadow] duration-300`}>
          <div className="mx-auto max-w-[1280px] px-3 py-2 sm:px-6 sm:py-3">
            <div className="relative flex h-11 items-center justify-between lg:hidden">
              <button
                type="button"
                onClick={openSearch}
                aria-label={lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search'}
                className="lux-chip flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full active:scale-95"
              >
                <Search size={17} />
              </button>
              <ThemeToggle lang={lang} variant="lux" className="ml-1.5 mr-auto !h-9 !w-9" />

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
                {premium ? <LanguageSwitcher value={lang} onChange={setPremiumLang} compact variant="lux" /> : <LanguageSwitcher compact variant="lux" />}
              </div>
            </div>

            <div className="hidden grid-cols-[1fr_auto_1fr] items-center gap-3 lg:grid">
              <div className="min-w-0 justify-self-start">
                <button
                  type="button"
                  onClick={openSearch}
                  aria-label={lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search'}
                  className="lux-chip hidden h-10 w-10 items-center justify-center rounded-full"
                >
                  <Search size={17} />
                </button>
                {!premium && (
                  <nav className="hidden items-center gap-5 lg:flex" aria-label={siteCopy.company}>
                    <a href="/menu" onClick={openMenuHome} className="lux-title text-sm font-semibold transition-colors hover:text-[#ff5a00]">{siteCopy.menu}</a>
                    <a href="/corporate-sets" onClick={openCorporateSets} aria-current={corporateSets ? 'page' : undefined} className={`text-sm font-semibold transition-colors hover:text-[#ff5a00] ${corporateSets ? 'text-[#ff5a00]' : 'lux-title'}`}>{siteCopy.corporateSets}</a>
                    <a href="/menu#public-menu-deals" onClick={event => navigateToPublicSection(event, 'public-menu-deals')} className="lux-title text-sm font-semibold transition-colors hover:text-[#ff5a00]">{siteCopy.promotions}</a>
                    <a href="/vacancies" onClick={openVacancies} className="lux-title text-sm font-semibold transition-colors hover:text-[#ff5a00]">{siteCopy.vacancies}</a>
                    <a href="#public-menu-contacts" onClick={event => navigateToPublicSection(event, 'public-menu-contacts')} className="lux-title text-sm font-semibold transition-colors hover:text-[#ff5a00]">{siteCopy.contacts}</a>
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
                  className="lux-chip flex h-10 w-10 items-center justify-center rounded-full"
                >
                  <Search size={17} />
                </button>
                <ThemeToggle lang={lang} variant="lux" className="!h-10 !w-10" />
                <div className="hidden lg:block">
                  <HeaderSelect
                    value={menuCurrency}
                    onChange={changeMenuCurrency}
                    icon={Coins}
                    options={MENU_CURRENCIES.map(currency => ({
                      value: currency,
                      label: currency === 'UZS' ? 'UZS' : currency === 'USD' ? '$ USD' : '€ EUR',
                    }))}
                    ariaLabel={lang === 'uz' ? 'Valyuta' : lang === 'ru' ? 'Валюта' : 'Currency'}
                  />
                </div>
                {premium ? <LanguageSwitcher value={lang} onChange={setPremiumLang} variant="lux" /> : <LanguageSwitcher variant="lux" />}
              </div>
            </div>
          </div>
        </header>
      </div>

      {showHero && <PublicMenuHero lang={lang} onViewMenu={openMenuHome} headerOffset={headerOffset} heroRef={heroRef} theme={theme} />}

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
            className={`relative z-10 mx-[calc(50%-50vw)] mb-5 sm:mb-8 ${showHero ? '-mt-[76px] sm:-mt-[104px]' : 'mt-1'}`}
            rowClassName="lux-fade-edges !pb-1.5 pt-1.5 px-3 sm:px-[max(24px,calc(50vw-616px))]"
            collapsedContentClassName="lux-fade-edges py-1.5 !px-3 sm:!px-[max(24px,calc(50vw-616px))]"
            variant="lux"
            collapsedPosition="fixed"
            collapsedSurfaceClass="lux-header lux-bar"
            collapsedClassName="z-50 !border-0 !px-0 !py-1 !translate-y-0 !transition-none"
          />
        </div>}

        {loading ? (
          // Placeholders mirror PublicDishCard: photo, title, subtitle, price.
          <div className="grid grid-cols-2 gap-x-3 gap-y-7 pt-4 sm:gap-x-6 sm:gap-y-11 sm:pt-6 md:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="lux-glass rounded-[24px] p-1.5 sm:rounded-[28px] sm:p-2">
                <div className="zk-shimmer aspect-square w-full !rounded-[19px] sm:!rounded-[22px]" />
                <div className="px-1.5 pb-1.5 pt-3 sm:px-2 sm:pb-2">
                  <div className="zk-shimmer h-[18px] w-3/4 !rounded-md sm:h-5" />
                  <div className="zk-shimmer mt-2 h-3 w-full !rounded-md" />
                  <div className="zk-shimmer ml-auto mt-2.5 h-3.5 w-2/5 !rounded-md" />
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
          <div className="lux-glass rounded-[28px] p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
              <UtensilsCrossed size={28} className="text-orange-300" />
            </div>
            <p className="lux-title font-black">
              {lang === 'uz' ? 'Menyu hozircha mavjud emas' : lang === 'ru' ? 'Меню пока недоступно' : 'Menu is not available yet'}
            </p>
            <p className="mt-1 text-sm text-[#8A94A6]">
              {lang === 'uz' ? 'Iltimos, keyinroq qayta urinib ko‘ring.' : lang === 'ru' ? 'Пожалуйста, попробуйте позже.' : 'Please try again later.'}
            </p>
          </div>
        ) : (
          groupedSections ? (
            <div className="space-y-16 pb-12 pt-4 sm:space-y-24 sm:pb-16 sm:pt-6">
              {groupedSections.filter(section => section.cat.id === CORPORATE_SETS_CATEGORY_ID).map(renderCategorySection)}
              {groupedSections.filter(section => section.cat.id !== CORPORATE_SETS_CATEGORY_ID).map(renderCategorySection)}
              {/* Deals follow the regular categories so the menu itself leads the page. */}
              {dealItems.length > 0 && (
                <section id="public-menu-deals" className="scroll-mt-32">
                  <MenuSectionHeader title={dealsTitle} tone="deal" />
                  <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-6 sm:gap-y-11 md:grid-cols-3 xl:grid-cols-4">
                    {dealItems.map((item, index) => (
                      <PublicDishCard
                        key={`deal-${item.id}`}
                        item={item}
                        lang={lang}
                        eager={index < 4}
                        onOpenDetail={openDetail}
                        formatPrice={priceFormatter}
                        linkBasePath={menuBasePath}
                      />
                    ))}
                  </div>
                </section>
              )}
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
      {!premium && <PublicMenuFooter copy={siteCopy} lang={lang} onOpenMenu={openMenuHome} onOpenCorporateSets={openCorporateSets} onOpenVacancies={openVacancies} onOpenMap={openMapChooser} />}
      {showDetailOverlay && (
        <div className="fixed inset-0 z-[80]">
          <PublicDishDetailPage
            item={detailItem}
            category={categoryMap[detailItem.category_id]}
            lang={lang}
            onBack={closeDetail}
            formatPrice={priceFormatter}
            linkBasePath={menuBasePath}
            languageControl={premium
              ? <LanguageSwitcher value={lang} onChange={setPremiumLang} className={DETAIL_LANGUAGE_CLASS} />
              : <LanguageSwitcher className={DETAIL_LANGUAGE_CLASS} />}
            place={{
              name: 'Zar Kebab',
              subtitle: PUBLIC_CONTACTS.location.label,
              href: PUBLIC_CONTACTS.location.googleMapsHref,
              onClick: openMapChooser,
              logo: getBrandLogo(lang),
            }}
            reserve={premium ? null : { label: (HERO_COPY[lang] || HERO_COPY.en).reserve, href: PUBLIC_CONTACTS.phone.href }}
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
      <MapChooserSheet open={mapChooserOpen} lang={lang} onClose={closeMapChooser} />
    </div>
  )
}
