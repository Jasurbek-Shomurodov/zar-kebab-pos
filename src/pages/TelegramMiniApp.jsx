import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  BadgePercent,
  Clock3,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Search,
  UtensilsCrossed,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatMenuTimeWindow, isPublicMenuCategory, isPublicMenuItem } from '../lib/menuItems'
import { formatCurrency } from '../lib/formatCurrency'
import { getCategoryName, getItemDesc, getItemName } from '../lib/i18n'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'
import { getMenuPricing } from '../lib/menuPricing'
import { menuPriceUnitSuffix } from '../lib/menuSaleUnits'
import { menuPrepTimeLabel } from '../lib/menuPrepTime'
import MenuMedia from '../components/MenuMedia'
import {
  getStoredTelegramSession,
  initTelegramWebApp,
  setStoredTelegramSession,
  telegramApi,
} from '../lib/telegramWebApp'

async function loadTelegramMenuData() {
  const rpcRes = await supabase.rpc('get_public_menu_data')
  if (!rpcRes.error && rpcRes.data) {
    const categories = (rpcRes.data.categories || []).filter(isPublicMenuCategory)
    const categoryIds = new Set(categories.map(category => category.id))
    return {
      categories,
      items: (rpcRes.data.items || []).filter(item => isPublicMenuItem(item) && (!item.category_id || categoryIds.has(item.category_id))),
    }
  }

  const [catRes, itemRes] = await Promise.all([
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').order('sort_order'),
  ])
  if (catRes.error || itemRes.error) throw catRes.error || itemRes.error
  const categories = (catRes.data || []).filter(isPublicMenuCategory)
  const categoryIds = new Set(categories.map(category => category.id))
  return {
    categories,
    items: (itemRes.data || []).filter(item => isPublicMenuItem(item) && (!item.category_id || categoryIds.has(item.category_id))),
  }
}

const T = {
  uz: {
    menu: 'Menyu',
    card: 'Karta',
    contact: 'Aloqa',
    searchMenu: 'Menyudan qidirish',
    all: 'Barchasi',
    loyaltyCard: 'Sodiqlik kartasi',
    cardNumberPlaceholder: '8 xonali karta raqami',
    checkBalance: 'Balansni tekshirish',
    contactTitle: 'Aloqa',
    restaurant: 'Zar Kebab restorani',
    contactSub: 'Buyurtmani o‘zgartirish uchun Telegram yoki telefon orqali restoranga murojaat qiling.',
    loading: 'Yuklanmoqda...',
    authError: 'Autentifikatsiya uchun sahifani Telegram botdan oching.',
    loadError: 'Telegram mini ilovasini yuklab bo‘lmadi.',
    invalidCard: '8 xonali karta raqamini kiriting.',
    availableBalance: amount => `Mavjud balans: ${amount}`,
    cardNotFound: 'Karta topilmadi.',
  },
  ru: {
    menu: 'Меню',
    card: 'Карта',
    contact: 'Контакты',
    searchMenu: 'Поиск по меню',
    all: 'Все',
    loyaltyCard: 'Карта лояльности',
    cardNumberPlaceholder: '8-значный номер карты',
    checkBalance: 'Проверить баланс',
    contactTitle: 'Контакты',
    restaurant: 'Ресторан Zar Kebab',
    contactSub: 'Чтобы изменить заказ, свяжитесь с рестораном напрямую в Telegram или по телефону.',
    loading: 'Загрузка...',
    authError: 'Откройте эту страницу из Telegram-бота для авторизации.',
    loadError: 'Не удалось загрузить Telegram mini app.',
    invalidCard: 'Введите 8-значный номер карты.',
    availableBalance: amount => `Доступный баланс: ${amount}`,
    cardNotFound: 'Карта не найдена.',
  },
  en: {
    menu: 'Menu',
    card: 'Card',
    contact: 'Contact',
    searchMenu: 'Search menu',
    all: 'All',
    loyaltyCard: 'Loyalty card',
    cardNumberPlaceholder: '8-digit card number',
    checkBalance: 'Check balance',
    contactTitle: 'Contact',
    restaurant: 'Zar Kebab Restaurant',
    contactSub: 'For changes to an order, please contact the restaurant directly from Telegram or by phone.',
    loading: 'Loading...',
    authError: 'Open this page from the Telegram bot to authenticate.',
    loadError: 'Telegram Mini App failed to load.',
    invalidCard: 'Enter an 8-digit card number.',
    availableBalance: amount => `Available balance: ${amount}`,
    cardNotFound: 'Card not found.',
  },
}

function tr(lang) {
  return T[lang] || T.en
}

function SafeImage({ src, alt }) {
  return (
    <MenuMedia
      src={src}
      alt={alt}
      className="h-full w-full object-cover object-center"
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-[#F4EFE7]">
          <UtensilsCrossed size={30} className="text-[#D39D70]" />
        </div>
      }
    />
  )
}

function BottomNav({ active, onSelect, lang }) {
  const l = tr(lang)
  const items = [
    { id: 'menu', label: l.menu, Icon: MenuIcon },
    { id: 'loyalty', label: l.card, Icon: BadgePercent },
    { id: 'contact', label: l.contact, Icon: MessageCircle },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8DED2] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
        {items.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`relative flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-black ${
              active === id ? 'bg-[#163B2D] text-white' : 'text-[#687366]'
            }`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function ProductCard({ item, lang }) {
  const name = getItemName(item, lang)
  const grams = gramsLabel(item, lang)
  const millilitres = millilitresLabel(item, lang)
  const kcal = kcalLabel(item, lang)
  const pricing = getMenuPricing(item)
  return (
    <article className="overflow-hidden rounded-[8px] border border-[#E8DED2] bg-white shadow-sm">
      <div className="relative aspect-square">
        <div className="h-full w-full">
          <SafeImage src={item.image_url} alt={name} />
        </div>
      </div>
      <div className="flex min-h-[152px] flex-col p-3">
        <h3 className="line-clamp-2 text-[15px] font-black leading-snug text-[#1E2B24]">{name}</h3>
        <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-[#8B9388]">{getItemDesc(item, lang)}</p>
        <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 ring-1 ring-amber-200">
          <Clock3 size={11} /> {menuPrepTimeLabel(item, lang)}
        </span>
        {(grams || millilitres || kcal) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {grams && (
              <span className="rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                {grams}
              </span>
            )}
            {millilitres && (
              <span className="rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                {millilitres}
              </span>
            )}
            {kcal && (
              <span className="rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                {kcal}
              </span>
            )}
          </div>
        )}
        <div className="mt-auto">
          {pricing.discounted && (
            <p className="text-[12px] font-bold text-[#8B9388] line-through">{formatCurrency(pricing.oldPrice)}</p>
          )}
          <p className={`${pricing.discounted ? 'text-red-600' : 'text-[#FF5A00]'} text-[16px] font-black`}>
            {formatCurrency(pricing.price)}{menuPriceUnitSuffix(item, lang)}
          </p>
        </div>
      </div>
    </article>
  )
}

function MenuView({ categories, items, lang }) {
  const l = tr(lang)
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const visibleItems = items.filter(item => {
    const categoryOk = activeCategory === 'all' || item.category_id === activeCategory
    const searchOk = !query || [item.name_uz, item.name_ru, item.name_en].some(value => value?.toLowerCase().includes(query))
    return categoryOk && searchOk
  })

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-[#E8DED2] bg-[#FBF6EE]/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <h1 className="text-2xl font-black text-[#163B2D]">Zar Kebab</h1>
          <div className="relative mt-3">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B9388]" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={l.searchMenu}
              className="h-11 w-full rounded-[8px] border border-[#E8DED2] bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#FF5A00]"
            />
          </div>
          <div className="category-scroll -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {[{ id: 'all', name_en: 'All' }, ...categories].map(category => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`h-10 shrink-0 rounded-[8px] px-4 text-sm font-black ${
                  activeCategory === category.id ? 'bg-[#163B2D] text-white' : 'border border-[#E8DED2] bg-white text-[#4C5B52]'
                }`}
              >
                {category.id === 'all' ? l.all : getCategoryName(category, lang)}
                {formatMenuTimeWindow(category) && (
                  <span className="ml-1.5 text-[11px] font-bold tabular-nums opacity-70">{formatMenuTimeWindow(category)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 py-4 pb-28">
        <div className="grid grid-cols-2 gap-3">
          {visibleItems.map(item => (
            <ProductCard key={item.id} item={item} lang={lang} />
          ))}
        </div>
      </main>
    </>
  )
}

function LoyaltyView({ loyalty, onLoyaltyChange, onCheckLoyalty, lang }) {
  const l = tr(lang)
  return (
    <main className="mx-auto max-w-md px-4 py-4 pb-28">
      <h1 className="text-2xl font-black text-[#163B2D]">{l.loyaltyCard}</h1>
      <section className="mt-4 rounded-[8px] border border-[#E8DED2] bg-white p-4">
        <input
          value={loyalty.cardNumber}
          onChange={event => onLoyaltyChange(event.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          placeholder={l.cardNumberPlaceholder}
          className="h-12 w-full rounded-[8px] border border-[#E8DED2] px-3 font-semibold outline-none focus:border-[#FF5A00]"
        />
        <button onClick={onCheckLoyalty} className="mt-3 h-12 w-full rounded-[8px] bg-[#163B2D] font-black text-white">
          {l.checkBalance}
        </button>
        {loyalty.message && <p className="mt-3 font-bold text-[#687366]">{loyalty.message}</p>}
      </section>
    </main>
  )
}

function ContactView({ lang }) {
  const l = tr(lang)
  return (
    <main className="mx-auto max-w-md px-4 py-4 pb-28">
      <h1 className="text-2xl font-black text-[#163B2D]">{l.contactTitle}</h1>
      <section className="mt-4 space-y-3 rounded-[8px] border border-[#E8DED2] bg-white p-4">
        <p className="flex items-center gap-2 font-bold text-[#4C5B52]"><MapPin size={18} /> {l.restaurant}</p>
        <p className="font-semibold text-[#687366]">{l.contactSub}</p>
      </section>
    </main>
  )
}

export default function TelegramMiniApp() {
  const [webApp, setWebApp] = useState(null)
  const [token, setToken] = useState(getStoredTelegramSession())
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [view, setView] = useState('menu')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loyalty, setLoyalty] = useState({ cardNumber: '', valid: false, balance: 0, message: '' })
  const lang = webApp?.initDataUnsafe?.user?.language_code?.startsWith('uz') ? 'uz' : webApp?.initDataUnsafe?.user?.language_code?.startsWith('en') ? 'en' : 'ru'
  const l = tr(lang)

  useEffect(() => {
    let cancelled = false
    let refreshInterval = 0
    async function refreshMenu() {
      const menu = await loadTelegramMenuData()
      if (!cancelled) {
        setCategories(menu.categories)
        setItems(menu.items)
      }
    }
    async function boot() {
      setLoading(true)
      setError('')
      try {
        const app = await initTelegramWebApp()
        if (!cancelled) setWebApp(app)

        const initData = app?.initData || ''
        if (initData) {
          const auth = await telegramApi('/api/telegram/auth', {
            method: 'POST',
            body: JSON.stringify({ initData }),
          })
          setStoredTelegramSession(auth.sessionToken)
          if (!cancelled) setToken(auth.sessionToken)
        } else if (!token) {
          throw new Error(l.authError)
        }

        await refreshMenu()
        refreshInterval = window.setInterval(() => {
          refreshMenu().catch(() => {})
        }, 60_000)
      } catch (err) {
        if (!cancelled) setError(err.message || l.loadError)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    boot()
    return () => {
      cancelled = true
      if (refreshInterval) window.clearInterval(refreshInterval)
    }
  }, [])

  async function checkLoyalty() {
    if (!/^\d{8}$/.test(loyalty.cardNumber)) {
      setLoyalty(prev => ({ ...prev, valid: false, balance: 0, message: l.invalidCard }))
      return
    }
    try {
      const data = await telegramApi(`/api/telegram/loyalty/${loyalty.cardNumber}`, { method: 'GET', token })
      setLoyalty(prev => ({
        ...prev,
        valid: data.valid,
        balance: data.balance || 0,
        message: data.valid ? l.availableBalance(formatCurrency(data.balance || 0)) : l.cardNotFound,
      }))
    } catch (err) {
      setLoyalty(prev => ({ ...prev, valid: false, balance: 0, message: err.message }))
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#FBF6EE] font-black text-[#163B2D]">{l.loading}</div>
  }

  if (error && !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF6EE] p-4">
        <div className="w-full max-w-sm rounded-[8px] border border-[#E8DED2] bg-white p-5 text-center">
          <AlertCircle className="mx-auto text-[#FF5A00]" size={34} />
          <p className="mt-3 font-black text-[#163B2D]">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FBF6EE] text-[#1E2B24]">
      {error && (
        <div className="mx-auto max-w-md px-4 pt-3">
          <div className="rounded-[8px] border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>
        </div>
      )}

      {view === 'menu' && (
        <MenuView
          categories={categories}
          items={items}
          lang={lang}
        />
      )}
      {view === 'loyalty' && (
        <LoyaltyView
          loyalty={loyalty}
          lang={lang}
          onLoyaltyChange={cardNumber => setLoyalty({ cardNumber, valid: false, balance: 0, message: '' })}
          onCheckLoyalty={checkLoyalty}
        />
      )}
      {view === 'contact' && <ContactView lang={lang} />}

      <BottomNav active={view} lang={lang} onSelect={setView} />
    </div>
  )
}
