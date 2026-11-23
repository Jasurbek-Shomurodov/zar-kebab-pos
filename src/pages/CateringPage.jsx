import React, { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, CheckCircle2, Instagram, MapPin, Phone, Send,
  Sparkles, Truck, UtensilsCrossed, WalletCards,
} from 'lucide-react'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'
import { getBrandLogo } from '../lib/brandLogo'
import { useApp } from '../store/AppContext'
import heroImage from '../assets/brand/zarkebab-hero-kebab.webp'

const PHONE_DISPLAY = '+998 91-509-55-45'
const PHONE_HREF = 'tel:+998915095545'
const TELEGRAM_HREF = 'https://t.me/zarkebab'
const INSTAGRAM_HREF = 'https://www.instagram.com/zarkebab'

const BENEFIT_ICONS = [UtensilsCrossed, Sparkles, Truck, WalletCards]

const COPY = {
  ru: {
    seoTitle: 'Кейтеринг и корпоративное питание в Ташкенте | Zar Kebab',
    seoDescription: 'Zar Kebab предлагает корпоративное питание, обеды в офис, шашлык-сеты и кейтеринг для мероприятий в Ташкенте. Индивидуальное меню под ваш бюджет.',
    seoKeywords: 'кейтеринг Ташкент, корпоративное питание Ташкент, обеды в офис Ташкент, доставка обедов, Zar Kebab, шашлык кейтеринг',
    back: 'Вернуться в меню',
    eyebrow: 'Кейтеринг Zar Kebab',
    title: 'Кейтеринг и корпоративное питание от Zar Kebab',
    intro: 'Горячие обеды, шашлыки, сеты и комплексное питание для офисов, команд, строительных объектов и мероприятий в Ташкенте.',
    getOffer: 'Получить предложение',
    call: 'Позвонить',
    telegram: 'Написать в Telegram',
    guestsLabel: 'Для команд',
    guests: 'от 10 до 300+ гостей',
    tags: ['Доставка по Ташкенту', 'Меню под ваш бюджет', 'Горячие блюда каждый день'],
    benefitsTitle: 'Почему выбирают Zar Kebab',
    benefits: [
      ['Сытные порции', 'Горячие блюда, шашлыки, супы, салаты и напитки для полноценного обеда.'],
      ['Индивидуальное меню', 'Подберём меню под бюджет, количество сотрудников и формат питания.'],
      ['Удобная доставка', 'Доставляем по Ташкенту в удобное для вас время.'],
      ['Гибкая оплата', 'Наличные, перевод, терминал или договорённость для постоянных клиентов.'],
    ],
    servicesTitle: 'Наши услуги',
    services: [
      ['Корпоративное питание', 'Ежедневные обеды для сотрудников офиса или компании.'],
      ['Питание для строительных и рабочих объектов', 'Комплексное питание 1–3 раза в день для больших команд.'],
      ['Обеды в офис', 'Горячие блюда, сеты и напитки с доставкой.'],
      ['Кейтеринг для мероприятий', 'Шашлыки, закуски, салаты, напитки и сеты для встреч, праздников и банкетов.'],
    ],
    packagesTitle: 'Примеры форматов питания',
    packagesText: 'Финальное меню и стоимость рассчитываются индивидуально: от количества человек, графика и выбранных блюд.',
    packages: [
      ['Офисный обед', ['суп', 'горячее', 'салат', 'хлеб', 'напиток']],
      ['Шашлык-сет для команды', ['шашлыки', 'лепёшки', 'салаты', 'напитки']],
      ['Питание на объект', ['завтрак', 'обед', 'ужин по графику']],
      ['Мероприятие', ['сеты', 'закуски', 'напитки', 'сервировка по договорённости']],
    ],
    priceNote: 'Цена рассчитывается индивидуально',
    setsLink: 'Корпоративные сеты с ценами',
    stepsTitle: 'Как оформить заказ',
    steps: ['Оставьте заявку', 'Мы уточним количество человек, бюджет и формат', 'Подготовим меню и предложение', 'Доставим заказ вовремя'],
    contactTitle: 'Нужно питание для команды или мероприятия?',
    contactText: 'Напишите нам, сколько человек нужно накормить и какой формат вам подходит. Мы подготовим предложение под ваш бюджет.',
    address: 'Ташкент, Матбуотчилар, 17',
  },
  uz: {
    seoTitle: 'Toshkentda keytering va korporativ ovqatlanish | Zar Kebab',
    seoDescription: 'Zar Kebab Toshkentda korporativ ovqatlanish, ofisga tushlik, shashlik setlari va tadbirlar uchun keytering taklif qiladi. Byudjetingizga mos menyu.',
    seoKeywords: 'keytering Toshkent, korporativ ovqatlanish Toshkent, ofisga tushlik, Zar Kebab, shashlik keytering',
    back: 'Menyuga qaytish',
    eyebrow: 'Zar Kebab keytering',
    title: 'Zar Kebab keytering va korporativ ovqatlanish',
    intro: 'Toshkentdagi ofislar, jamoalar, qurilish obyektlari va tadbirlar uchun issiq tushliklar, shashliklar, setlar va kompleks ovqatlanish.',
    getOffer: 'Taklif olish',
    call: 'Qo‘ng‘iroq qilish',
    telegram: 'Telegramda yozish',
    guestsLabel: 'Jamoalar uchun',
    guests: '10 dan 300+ mehmongacha',
    tags: ['Toshkent bo‘ylab yetkazish', 'Byudjetingizga mos menyu', 'Har kuni issiq taomlar'],
    benefitsTitle: 'Nega Zar Kebab tanlanadi',
    benefits: [
      ['To‘yimli porsiyalar', 'To‘liq tushlik uchun issiq taomlar, shashliklar, sho‘rvalar, salatlar va ichimliklar.'],
      ['Individual menyu', 'Menyuni byudjet, xodimlar soni va ovqatlanish formatiga moslab tuzamiz.'],
      ['Qulay yetkazib berish', 'Toshkent bo‘ylab sizga qulay vaqtda yetkazamiz.'],
      ['Moslashuvchan to‘lov', 'Naqd, o‘tkazma, terminal yoki doimiy mijozlar uchun kelishuv asosida.'],
    ],
    servicesTitle: 'Xizmatlarimiz',
    services: [
      ['Korporativ ovqatlanish', 'Ofis yoki kompaniya xodimlari uchun har kungi tushliklar.'],
      ['Qurilish va ish obyektlari uchun ovqatlanish', 'Katta jamoalar uchun kuniga 1–3 mahal kompleks ovqatlanish.'],
      ['Ofisga tushlik', 'Issiq taomlar, setlar va ichimliklar yetkazib berish bilan.'],
      ['Tadbirlar uchun keytering', 'Uchrashuv, bayram va banketlar uchun shashliklar, gazaklar, salatlar, ichimliklar va setlar.'],
    ],
    packagesTitle: 'Ovqatlanish formatlari namunalari',
    packagesText: 'Yakuniy menyu va narx individual hisoblanadi: odamlar soni, jadval va tanlangan taomlarga qarab.',
    packages: [
      ['Ofis tushligi', ['sho‘rva', 'issiq taom', 'salat', 'non', 'ichimlik']],
      ['Jamoa uchun shashlik seti', ['shashliklar', 'nonlar', 'salatlar', 'ichimliklar']],
      ['Obyektga ovqatlanish', ['nonushta', 'tushlik', 'jadval bo‘yicha kechki ovqat']],
      ['Tadbir', ['setlar', 'gazaklar', 'ichimliklar', 'kelishuv asosida servis']],
    ],
    priceNote: 'Narx individual hisoblanadi',
    setsLink: 'Narxlari bilan korporativ setlar',
    stepsTitle: 'Buyurtma qanday beriladi',
    steps: ['Ariza qoldiring', 'Odamlar soni, byudjet va formatni aniqlaymiz', 'Menyu va taklif tayyorlaymiz', 'Buyurtmani o‘z vaqtida yetkazamiz'],
    contactTitle: 'Jamoa yoki tadbir uchun ovqat kerakmi?',
    contactText: 'Necha kishini ovqatlantirish kerakligini va qaysi format mos kelishini yozing. Byudjetingizga mos taklif tayyorlaymiz.',
    address: 'Toshkent, Matbuotchilar, 17',
  },
  en: {
    seoTitle: 'Catering and corporate meals in Tashkent | Zar Kebab',
    seoDescription: 'Zar Kebab offers corporate meals, office lunches, shashlik sets and event catering in Tashkent. A menu built around your budget.',
    seoKeywords: 'catering Tashkent, corporate meals Tashkent, office lunch Tashkent, Zar Kebab, shashlik catering',
    back: 'Back to menu',
    eyebrow: 'Zar Kebab catering',
    title: 'Catering and corporate meals from Zar Kebab',
    intro: 'Hot lunches, shashlik, sets and full meal plans for offices, teams, construction sites and events in Tashkent.',
    getOffer: 'Get an offer',
    call: 'Call us',
    telegram: 'Message on Telegram',
    guestsLabel: 'For teams',
    guests: 'from 10 to 300+ guests',
    tags: ['Delivery across Tashkent', 'A menu for your budget', 'Hot dishes every day'],
    benefitsTitle: 'Why teams choose Zar Kebab',
    benefits: [
      ['Generous portions', 'Hot dishes, shashlik, soups, salads and drinks for a complete lunch.'],
      ['A menu made for you', 'We build the menu around your budget, headcount and meal format.'],
      ['Convenient delivery', 'We deliver across Tashkent at the time that suits you.'],
      ['Flexible payment', 'Cash, bank transfer, card terminal or an agreement for regular clients.'],
    ],
    servicesTitle: 'Our services',
    services: [
      ['Corporate meals', 'Daily lunches for an office or company team.'],
      ['Meals for construction and work sites', 'Full meals one to three times a day for large crews.'],
      ['Office lunches', 'Hot dishes, sets and drinks, delivered.'],
      ['Event catering', 'Shashlik, starters, salads, drinks and sets for meetings, celebrations and banquets.'],
    ],
    packagesTitle: 'Example meal formats',
    packagesText: 'The final menu and price are worked out for each order: headcount, schedule and the dishes you choose.',
    packages: [
      ['Office lunch', ['soup', 'main dish', 'salad', 'bread', 'drink']],
      ['Shashlik set for a team', ['shashlik', 'flatbread', 'salads', 'drinks']],
      ['Meals on site', ['breakfast', 'lunch', 'dinner on schedule']],
      ['Event', ['sets', 'starters', 'drinks', 'table service by agreement']],
    ],
    priceNote: 'Priced for each order',
    setsLink: 'Corporate sets with prices',
    stepsTitle: 'How to order',
    steps: ['Send a request', 'We confirm headcount, budget and format', 'We prepare a menu and an offer', 'We deliver on time'],
    contactTitle: 'Need food for a team or an event?',
    contactText: 'Tell us how many people to feed and which format suits you. We will prepare an offer for your budget.',
    address: 'Matbuotchilar 17, Tashkent',
  },
}

function upsertMeta(name, content) {
  let tag = document.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function SectionHeading({ children, text = '' }) {
  return (
    <div className="max-w-3xl">
      <h2 className="zk-serif lux-title text-[34px] font-semibold leading-tight sm:text-[44px]">{children}</h2>
      {text && <p className="lux-muted mt-2 text-sm font-light leading-relaxed sm:text-base">{text}</p>}
    </div>
  )
}

function ContactActions({ copy, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap ${className}`}>
      <a href={TELEGRAM_HREF} target="_blank" rel="noreferrer" className="lux-primary inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold"><Send size={17} aria-hidden="true" />{copy.telegram}</a>
      <a href={PHONE_HREF} className="lux-cta inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold"><Phone size={17} aria-hidden="true" />{copy.call}</a>
    </div>
  )
}

export default function CateringPage() {
  const navigate = useNavigate()
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const copy = COPY[lang] || COPY.en

  useEffect(() => {
    const previousTitle = document.title
    document.title = copy.seoTitle
    upsertMeta('description', copy.seoDescription)
    upsertMeta('keywords', copy.seoKeywords)
    document.documentElement.lang = lang
    return () => { document.title = previousTitle }
  }, [copy.seoDescription, copy.seoKeywords, copy.seoTitle, lang])

  function animatedNavigate(event, path) {
    event.preventDefault()
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || typeof document.startViewTransition !== 'function') {
      navigate(path)
      return
    }
    document.startViewTransition(() => {
      flushSync(() => navigate(path))
    })
  }

  return (
    <div className="zk-lux public-page-enter min-h-screen">
      <header className="lux-header sticky top-0 z-40 border-b">
        <div className="mx-auto grid h-16 max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:h-20 sm:px-6">
          <Link to="/menu" onClick={event => animatedNavigate(event, '/menu')} aria-label={copy.back} className="lux-muted -ml-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 justify-self-start rounded-full px-2 text-sm font-medium hover:underline sm:justify-start">
            <ArrowLeft size={18} aria-hidden="true" className="flex-shrink-0" />
            <span className="hidden sm:inline">{copy.back}</span>
          </Link>
          <Link to="/menu" onClick={event => animatedNavigate(event, '/menu')} aria-label="Zar Kebab" className="flex min-h-11 items-center gap-2.5 justify-self-center sm:gap-3">
            <img src={getBrandLogo(lang)} alt="" className="h-11 w-auto object-contain sm:h-14" />
            <span className="lux-gold hidden whitespace-nowrap text-xs font-black uppercase tracking-[0.15em] min-[360px]:inline">Zar Kebab</span>
          </Link>
          <div className="flex items-center gap-2 justify-self-end">
            <ThemeToggle lang={lang} variant="lux" className="!h-11 !w-11" />
            <LanguageSwitcher variant="lux" />
          </div>
        </div>
      </header>

      <main>
        <section className="lux-page-2 lux-line border-b">
          <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-12">
            <div>
              <p className="lux-gold text-xs font-medium uppercase tracking-[0.3em]">{copy.eyebrow}</p>
              <h1 className="zk-serif lux-title mt-3 text-[40px] font-semibold leading-[1.02] sm:text-[60px]">{copy.title}</h1>
              <p className="lux-body mt-4 max-w-2xl text-base font-light leading-relaxed sm:text-lg">{copy.intro}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href="#contacts" className="lux-primary inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold">{copy.getOffer}<ArrowRight size={17} aria-hidden="true" /></a>
                <a href={PHONE_HREF} className="lux-cta inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold"><Phone size={17} aria-hidden="true" />{copy.call}</a>
              </div>
              <ul className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
                {copy.tags.map(tag => (
                  <li key={tag} className="lux-chip lux-chip-static inline-flex items-center rounded-full px-3 py-2">{tag}</li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="lux-glass rounded-[28px] p-2">
                <img src={heroImage} alt="" fetchpriority="high" className="aspect-[4/3] w-full rounded-[22px] object-cover" />
              </div>
              <div className="lux-glass absolute -bottom-4 left-5 rounded-2xl px-4 py-3">
                <p className="lux-gold text-xs font-medium uppercase tracking-[0.2em]">{copy.guestsLabel}</p>
                <p className="zk-serif lux-title text-[22px] font-semibold leading-tight">{copy.guests}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
          <SectionHeading>{copy.benefitsTitle}</SectionHeading>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.benefits.map(([title, text], index) => {
              const Icon = BENEFIT_ICONS[index]
              return (
                <article key={title} className="lux-glass rounded-[28px] p-6">
                  <span className="lux-soft lux-gold flex h-12 w-12 items-center justify-center rounded-full"><Icon size={21} aria-hidden="true" /></span>
                  <h3 className="zk-serif lux-title mt-5 text-[24px] font-semibold leading-tight">{title}</h3>
                  <p className="lux-body mt-2 text-sm font-light leading-relaxed">{text}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section id="services" className="lux-page-2 lux-line scroll-mt-24 border-y">
          <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
            <SectionHeading>{copy.servicesTitle}</SectionHeading>
            <ol className="mt-5 grid gap-x-10 md:grid-cols-2">
              {copy.services.map(([title, text], index) => (
                <li key={title} className="lux-line flex gap-4 border-b py-5">
                  <span className="zk-serif lux-gold w-8 flex-shrink-0 text-[28px] font-semibold leading-none tabular-nums">{index + 1}</span>
                  <div>
                    <h3 className="zk-serif lux-title text-[24px] font-semibold leading-tight">{title}</h3>
                    <p className="lux-body mt-1.5 text-sm font-light leading-relaxed">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="packages" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
          <SectionHeading text={copy.packagesText}>{copy.packagesTitle}</SectionHeading>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.packages.map(([title, items]) => (
              <article key={title} className="lux-glass flex flex-col rounded-[28px] p-6">
                <h3 className="zk-serif lux-title text-[24px] font-semibold leading-tight">{title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {items.map(item => (
                    <li key={item} className="lux-body flex items-start gap-2.5 text-sm font-light leading-6">
                      <CheckCircle2 size={17} aria-hidden="true" className="lux-gold mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="lux-muted mt-auto pt-5 text-xs">{copy.priceNote}</p>
              </article>
            ))}
          </div>
          <Link to="/corporate-sets" onClick={event => animatedNavigate(event, '/corporate-sets')} className="lux-gold mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold hover:underline">
            {copy.setsLink}<ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>

        <section className="lux-page-2 lux-line border-y">
          <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
            <SectionHeading>{copy.stepsTitle}</SectionHeading>
            <ol className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {copy.steps.map((step, index) => (
                <li key={step} className="border-t pt-4" style={{ borderColor: '#C9A86A' }}>
                  <span className="zk-serif lux-gold text-[34px] font-semibold leading-none tabular-nums">{index + 1}</span>
                  <p className="lux-title mt-2 text-base font-medium leading-snug">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="contacts" className="scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
          <div className="lux-glass mx-auto grid max-w-[1280px] gap-8 rounded-[32px] px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="max-w-2xl">
              <h2 className="zk-serif lux-title text-[32px] font-semibold leading-tight sm:text-[40px]">{copy.contactTitle}</h2>
              <p className="lux-muted mt-2 text-sm font-light leading-relaxed sm:text-base">{copy.contactText}</p>
              <ContactActions copy={copy} className="mt-6" />
            </div>
            <div className="lux-body flex flex-col text-sm">
              <a href={PHONE_HREF} className="zk-serif lux-title inline-flex min-h-11 items-center text-[26px] font-semibold hover:underline">{PHONE_DISPLAY}</a>
              <a href={INSTAGRAM_HREF} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 hover:underline"><Instagram size={16} aria-hidden="true" className="lux-gold" />@zarkebab</a>
              <p className="flex min-h-11 items-center gap-2"><MapPin size={16} aria-hidden="true" className="lux-gold flex-shrink-0" />{copy.address}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
