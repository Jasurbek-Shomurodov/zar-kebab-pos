import React, { useEffect, useState } from 'react'
import { ArrowRight, Clock3, Flame, MapPin, Navigation, Phone, Send, ShieldCheck, Sunrise } from 'lucide-react'
import { isRestaurantOpen } from '../lib/openingHours'

const COPY = {
  uz: {
    eyebrow: 'Mehmonga keling',
    title: 'Bizni qanday topish mumkin',
    facts: [
      ['Halol oshxona', 'Barcha go‘shtimiz halol.'],
      ['Ko‘mirda pishirilgan', 'Shashlik va kaboblar har kuni cho‘g‘da tayyorlanadi.'],
      ['Nonushtadan kechki ovqatgacha', 'O‘zbek, uyg‘ur va turk oshxonasi bir joyda.'],
    ],
    openNow: 'Hozir ochiq',
    closedNow: 'Hozir yopiq',
    route: 'Yo‘nalish',
    call: 'Qo‘ng‘iroq',
    telegram: 'Telegram',
    catering: 'Jamoa va tadbirlar uchun keytering',
    actions: 'Tezkor aloqa',
  },
  ru: {
    eyebrow: 'Приходите в гости',
    title: 'Как нас найти',
    facts: [
      ['Халяльная кухня', 'Всё наше мясо — халяль.'],
      ['Готовим на углях', 'Шашлык и кебабы каждый день готовятся на мангале.'],
      ['От завтрака до позднего ужина', 'Узбекская, уйгурская и турецкая кухня в одном месте.'],
    ],
    openNow: 'Сейчас открыто',
    closedNow: 'Сейчас закрыто',
    route: 'Маршрут',
    call: 'Позвонить',
    telegram: 'Telegram',
    catering: 'Кейтеринг для команд и мероприятий',
    actions: 'Быстрая связь',
  },
  en: {
    eyebrow: 'Come and visit',
    title: 'How to find us',
    facts: [
      ['Halal kitchen', 'All our meat is halal.'],
      ['Cooked over charcoal', 'Shashlik and kebabs are grilled over coals every day.'],
      ['Breakfast to late dinner', 'Uzbek, Uyghur and Turkish cooking in one place.'],
    ],
    openNow: 'Open now',
    closedNow: 'Closed now',
    route: 'Directions',
    call: 'Call',
    telegram: 'Telegram',
    catering: 'Catering for teams and events',
    actions: 'Quick contact',
  },
}

const FACT_ICONS = [ShieldCheck, Flame, Sunrise]

// Re-checks once a minute so the badge flips at opening and closing time without a reload.
function useRestaurantOpen() {
  const [open, setOpen] = useState(() => isRestaurantOpen())
  useEffect(() => {
    const interval = window.setInterval(() => setOpen(isRestaurantOpen()), 60_000)
    return () => window.clearInterval(interval)
  }, [])
  return open
}

/** Where the restaurant is, when it is open and how to reach it. Sits above the footer on the home page. */
export function PublicVisitSection({ lang, contacts, hours, onOpenMap, onOpenCatering }) {
  const copy = COPY[lang] || COPY.en
  const open = useRestaurantOpen()

  return (
    <section id="public-menu-visit" className="lux-line scroll-mt-28 border-t px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto grid max-w-[1280px] gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-12">
        <div>
          <p className="lux-gold text-xs font-medium uppercase tracking-[0.3em]">{copy.eyebrow}</p>
          <h2 className="zk-serif lux-title mt-3 text-[34px] font-semibold leading-none sm:text-[48px]">{copy.title}</h2>
          <ul className="mt-7 grid gap-5 sm:grid-cols-3 lg:max-w-3xl">
            {copy.facts.map(([title, text], index) => {
              const Icon = FACT_ICONS[index]
              return (
                <li key={title}>
                  <span className="lux-soft lux-gold flex h-11 w-11 items-center justify-center rounded-full"><Icon size={19} aria-hidden="true" /></span>
                  <h3 className="zk-serif lux-title mt-3 text-[22px] font-semibold leading-tight">{title}</h3>
                  <p className="lux-body mt-1.5 text-sm font-light leading-relaxed">{text}</p>
                </li>
              )
            })}
          </ul>
          <a href="/catering" onClick={onOpenCatering} className="lux-gold mt-7 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold hover:underline">
            {copy.catering}<ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>

        <div className="lux-glass rounded-[28px] p-6">
          <p className={`inline-flex items-center gap-2 text-sm font-semibold ${open ? 'text-[#1d7a52]' : 'lux-muted'}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${open ? 'bg-[#1d7a52]' : 'bg-[#6F6358]'}`} />
            {open ? copy.openNow : copy.closedNow}
          </p>
          <div className="lux-body mt-2 text-sm">
            <p className="flex min-h-11 items-center gap-2 tabular-nums"><Clock3 size={16} aria-hidden="true" className="lux-gold flex-shrink-0" />{hours}</p>
            <a href={contacts.location.googleMapsHref} target="_blank" rel="noreferrer" onClick={onOpenMap} className="flex min-h-11 items-center gap-2 hover:underline">
              <MapPin size={16} aria-hidden="true" className="lux-gold flex-shrink-0" />{contacts.location.label}
            </a>
            <a href={contacts.phone.href} className="zk-serif lux-title inline-flex min-h-11 items-center text-[26px] font-semibold hover:underline">{contacts.phone.label}</a>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <a href={contacts.location.googleMapsHref} target="_blank" rel="noreferrer" onClick={onOpenMap} className="lux-primary inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold">
              <Navigation size={17} aria-hidden="true" />{copy.route}
            </a>
            <a href={contacts.telegram.href} target="_blank" rel="noreferrer" className="lux-cta inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold">
              <Send size={17} aria-hidden="true" />{copy.telegram}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Phone-only bar that keeps Call, Directions and Telegram in reach once the hero buttons have
 * scrolled away. Hidden (and inert) while the hero is on screen.
 */
export function PublicActionBar({ lang, contacts, visible, onOpenMap }) {
  const copy = COPY[lang] || COPY.en
  return (
    <nav
      aria-label={copy.actions}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : ''}
      className={`lux-header lux-bar fixed inset-x-0 bottom-0 z-20 border-t px-3 pt-2 transition-[opacity,transform] duration-200 lg:hidden ${visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`}
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto grid max-w-[520px] grid-cols-3 gap-2">
        <a href={contacts.phone.href} className="lux-primary inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold">
          <Phone size={16} aria-hidden="true" className="flex-shrink-0" /><span className="truncate">{copy.call}</span>
        </a>
        <a href={contacts.location.googleMapsHref} target="_blank" rel="noreferrer" onClick={onOpenMap} className="lux-chip lux-chip-static inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold">
          <Navigation size={16} aria-hidden="true" className="flex-shrink-0" /><span className="truncate">{copy.route}</span>
        </a>
        <a href={contacts.telegram.href} target="_blank" rel="noreferrer" className="lux-chip lux-chip-static inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold">
          <Send size={16} aria-hidden="true" className="flex-shrink-0" /><span className="truncate">{copy.telegram}</span>
        </a>
      </div>
    </nav>
  )
}
