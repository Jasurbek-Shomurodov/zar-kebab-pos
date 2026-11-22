import React, { useEffect } from 'react'
import {
  ArrowRight, Building2, CheckCircle2, Clock, Instagram, MapPin, Phone,
  ShieldCheck, Sparkles, Truck, UsersRound, UtensilsCrossed, WalletCards,
} from 'lucide-react'
import { getBrandLogo } from '../lib/brandLogo'

const PHONE_DISPLAY = '+998 91-509-55-45'
const PHONE_HREF = 'tel:+998915095545'
const INSTAGRAM_HREF = 'https://www.instagram.com/zarkebab'

const heroImages = [
  'https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/m7-1781341629601-i5pq0dsp.webp',
  'https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/zk_lamb_ribs-1781341646381-bcgj9w6h.webp',
  'https://pub-8469d5b8068a45f7a181a1687a084944.r2.dev/menu/products/i1779076979129-1781341534806-oxuhchja.webp',
]

const benefits = [
  ['Сытные порции', 'Горячие блюда, шашлыки, супы, салаты и напитки для полноценного обеда.', UtensilsCrossed],
  ['Индивидуальное меню', 'Подберём меню под бюджет, количество сотрудников и формат питания.', Sparkles],
  ['Удобная доставка', 'Доставляем по Ташкенту в удобное для вас время.', Truck],
  ['Гибкая оплата', 'Наличные, перевод, терминал или договорённость для постоянных клиентов.', WalletCards],
]

const services = [
  ['Корпоративное питание', 'Ежедневные обеды для сотрудников офиса или компании.'],
  ['Питание для строительных и рабочих объектов', 'Комплексное питание 1-3 раза в день для больших команд.'],
  ['Обеды в офис', 'Горячие блюда, сеты и напитки с доставкой.'],
  ['Кейтеринг для мероприятий', 'Шашлыки, закуски, салаты, напитки и сеты для встреч, праздников и банкетов.'],
]

const packages = [
  ['Офисный обед', ['суп', 'горячее', 'салат', 'хлеб', 'напиток']],
  ['Шашлык сет для команды', ['шашлыки', 'лепёшки', 'салаты', 'напитки']],
  ['Питание на объект', ['завтрак', 'обед', 'ужин по графику']],
  ['Мероприятие', ['сеты', 'закуски', 'напитки', 'сервировка по договорённости']],
]

const steps = [
  'Оставьте заявку',
  'Мы уточним количество человек, бюджет и формат',
  'Подготовим меню и предложение',
  'Доставим заказ вовремя',
]

function upsertMeta(name, content) {
  let tag = document.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function SectionTitle({ eyebrow, title, text, tone = 'dark' }) {
  const light = tone === 'light'
  return (
    <div className="mx-auto mb-8 max-w-2xl text-center">
      {eyebrow && <p className={`mb-2 text-xs font-black uppercase tracking-[0.22em] ${light ? 'text-[#e3b65a]' : 'text-[#7a5a17]'}`}>{eyebrow}</p>}
      <h2 className={`text-3xl font-black tracking-tight sm:text-4xl ${light ? 'text-white' : 'text-[#18392f]'}`}>{title}</h2>
      {text && <p className={`mt-3 text-base leading-7 ${light ? 'text-[#f7e6c8]' : 'text-[#6d6256]'}`}>{text}</p>}
    </div>
  )
}

function ContactButton({ href, children, variant = 'primary' }) {
  const classes = variant === 'primary'
    ? 'bg-[#f3b33d] text-[#17372e] shadow-[0_18px_34px_rgba(179,119,31,0.22)] hover:bg-[#ffc75b]'
    : 'border border-[#d7c2a4] bg-white/85 text-[#17372e] hover:border-[#f3b33d] hover:bg-[#fff8ec]'
  return (
    <a href={href} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black transition-all ${classes}`}>
      {children}
    </a>
  )
}

function FoodVisual() {
  return (
    <div className="relative mx-auto grid max-w-[520px] grid-cols-5 gap-3">
      <div className="col-span-5 overflow-hidden rounded-[30px] border border-white/40 bg-[#fff8ec] p-3 shadow-2xl sm:col-span-3">
        <img src={heroImages[0]} alt="Zar Kebab catering" className="h-64 w-full rounded-[24px] object-cover" loading="eager" fetchPriority="high" />
      </div>
      <div className="col-span-5 grid gap-3 sm:col-span-2">
        {heroImages.slice(1).map((src, index) => (
          <div key={src} className="overflow-hidden rounded-[24px] border border-white/40 bg-white p-2 shadow-xl">
            <img src={src} alt={`Zar Kebab menu ${index + 1}`} className="h-28 w-full rounded-[18px] object-cover" loading="eager" />
          </div>
        ))}
      </div>
      <div className="absolute -bottom-5 left-5 rounded-2xl border border-[#f4d9a4] bg-white px-4 py-3 shadow-xl">
        <p className="text-xs font-black uppercase tracking-wide text-[#7a5a17]">для команд</p>
        <p className="text-lg font-black text-[#17372e]">от 10 до 300+ гостей</p>
      </div>
    </div>
  )
}

export default function CateringPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Кейтеринг и корпоративное питание в Ташкенте | Zar Kebab'
    upsertMeta('description', 'Zar Kebab предлагает корпоративное питание, обеды в офис, шашлык-сеты и кейтеринг для мероприятий в Ташкенте. Индивидуальное меню под ваш бюджет.')
    upsertMeta('keywords', 'кейтеринг Ташкент, корпоративное питание Ташкент, обеды в офис Ташкент, доставка обедов, Zar Kebab, шашлык кейтеринг')
    return () => { document.title = previousTitle }
  }, [])

  return (
    <div className="min-h-screen bg-[#fbf4e8] text-[#2b2925]">
      <header className="sticky top-0 z-40 border-b border-[#ead8bc] bg-[#fbf4e8]/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="/menu" className="flex items-center gap-3">
            <img src={getBrandLogo('ru')} alt="Zar Kebab" className="h-12 w-auto max-w-[150px] object-contain" />
          </a>
          <nav className="hidden items-center gap-6 text-sm font-bold text-[#4d463c] md:flex">
            <a href="#services" className="inline-flex min-h-11 items-center hover:text-[#7a5a17]">Услуги</a>
            <a href="#packages" className="inline-flex min-h-11 items-center hover:text-[#7a5a17]">Форматы</a>
            <a href="#contacts" className="inline-flex min-h-11 items-center hover:text-[#7a5a17]">Контакты</a>
          </nav>
          <ContactButton href={PHONE_HREF} variant="secondary">
            <Phone size={16} />
            <span className="hidden sm:inline">{PHONE_DISPLAY}</span>
            <span className="sm:hidden">Позвонить</span>
          </ContactButton>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#17372e] text-white">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 18% 22%, #f3b33d 0, transparent 28%), radial-gradient(circle at 78% 35%, #fff4d6 0, transparent 24%)' }} />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-16">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-[#f3b33d]/35 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#ffd477]">
                Zar Kebab Catering
              </p>
              <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Кейтеринг и корпоративное питание от Zar Kebab
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#f7e6c8]">
                Горячие обеды, шашлыки, сеты и комплексное питание для офисов, команд, строительных объектов и мероприятий в Ташкенте.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <ContactButton href="#contacts">Получить предложение<ArrowRight size={17} /></ContactButton>
                <ContactButton href={PHONE_HREF} variant="secondary"><Phone size={17} />Позвонить</ContactButton>
                <ContactButton href={INSTAGRAM_HREF} variant="secondary"><Instagram size={17} />Написать в Instagram</ContactButton>
              </div>
              <div className="mt-7 flex flex-wrap gap-2">
                {['Доставка по Ташкенту', 'Меню под ваш бюджет', 'Для малых и больших команд', 'Горячие блюда каждый день'].map(label => (
                  <span key={label} className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-[#fff5df]">{label}</span>
                ))}
              </div>
            </div>
            <FoodVisual />
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="преимущества" title="Почему выбирают Zar Kebab" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {benefits.map(([title, text, Icon]) => (
                <article key={title} className="rounded-3xl border border-[#ead8bc] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#18392f] text-[#f3b33d]"><Icon size={22} /></div>
                  <h3 className="text-lg font-black text-[#18392f]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6d6256]">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="services" className="bg-[#fffaf1] px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="услуги" title="Наши услуги" />
            <div className="grid gap-4 md:grid-cols-2">
              {services.map(([title, text], index) => (
                <article key={title} className="rounded-3xl border border-[#ead8bc] bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f3b33d] text-base font-black text-[#18392f]">{index + 1}</span>
                    <h3 className="text-xl font-black text-[#18392f]">{title}</h3>
                  </div>
                  <p className="text-sm leading-7 text-[#6d6256]">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="packages" className="px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="форматы" title="Примеры форматов питания" text="Финальное меню и стоимость рассчитываются индивидуально: от количества человек, графика и выбранных блюд." />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {packages.map(([title, items]) => (
                <article key={title} className="flex min-h-[260px] flex-col rounded-3xl border border-[#ead8bc] bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-black text-[#18392f]">{title}</h3>
                  <ul className="mt-4 space-y-2">
                    {items.map(item => (
                      <li key={item} className="flex gap-2 text-sm font-bold text-[#5f5549]">
                        <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-[#b8892f]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto rounded-2xl bg-[#fbf4e8] px-4 py-3 text-sm font-black text-[#8a6421]">Цена рассчитывается индивидуально</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#17372e] px-4 py-12 text-white sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="процесс" title="Как оформить заказ" tone="light" />
            <div className="grid gap-4 md:grid-cols-4">
              {steps.map((step, index) => (
                <article key={step} className="rounded-3xl border border-white/12 bg-white/8 p-5">
                  <span className="text-3xl font-black text-[#f3b33d]">{index + 1}</span>
                  <p className="mt-4 text-base font-black leading-6 text-white">{step}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="rounded-[34px] border border-[#ead8bc] bg-white p-7 shadow-sm">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-[#7a5a17]">качество</p>
              <h2 className="text-3xl font-black text-[#18392f]">Качество и свежесть каждый день</h2>
              <p className="mt-4 text-base leading-8 text-[#6d6256]">
                Мы готовим блюда из свежих продуктов, следим за чистотой кухни и подачей. Для корпоративных заказов можем заранее согласовать меню, порции и график доставки.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[[ShieldCheck, 'Свежие продукты'], [Clock, 'Горячая доставка'], [CheckCircle2, 'Контроль качества']].map(([Icon, title]) => (
                <article key={title} className="rounded-3xl border border-[#ead8bc] bg-white p-5 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0c9] text-[#9a6a17]"><Icon size={22} /></div>
                  <h3 className="font-black text-[#18392f]">{title}</h3>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-12 sm:px-6">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[36px] bg-[#18392f] p-8 text-white shadow-2xl sm:p-10">
            <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="text-3xl font-black sm:text-4xl">Нужно питание для команды или мероприятия?</h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[#f7e6c8]">Напишите нам — подготовим индивидуальное предложение под ваш бюджет и количество человек.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <ContactButton href={PHONE_HREF}><Phone size={17} />Позвонить: {PHONE_DISPLAY}</ContactButton>
                <ContactButton href={INSTAGRAM_HREF} variant="secondary"><Instagram size={17} />Instagram @zarkebab</ContactButton>
                <ContactButton href="#contacts" variant="secondary"><ArrowRight size={17} />Получить предложение</ContactButton>
              </div>
            </div>
          </div>
        </section>

        <section id="contacts" className="bg-[#fffaf1] px-4 py-12 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SectionTitle eyebrow="контакты" title="Свяжитесь с нами" text="Расскажите, сколько человек нужно накормить и какой формат вам подходит. Мы подготовим предложение." />
              <div className="grid gap-3">
                <a href={PHONE_HREF} className="flex items-center gap-3 rounded-2xl border border-[#ead8bc] bg-white p-4 font-black text-[#18392f] shadow-sm"><Phone className="text-[#b8892f]" />{PHONE_DISPLAY}</a>
                <a href={INSTAGRAM_HREF} className="flex items-center gap-3 rounded-2xl border border-[#ead8bc] bg-white p-4 font-black text-[#18392f] shadow-sm"><Instagram className="text-[#b8892f]" />@zarkebab</a>
                <div className="flex items-center gap-3 rounded-2xl border border-[#ead8bc] bg-white p-4 font-black text-[#18392f] shadow-sm"><MapPin className="text-[#b8892f]" />Ташкент, Матбуотчилар, 17</div>
              </div>
            </div>
            <div className="min-h-[320px] rounded-[34px] border border-[#ead8bc] bg-white p-6 shadow-sm">
              <div className="flex h-full min-h-[270px] flex-col justify-between rounded-[28px] bg-[#17372e] p-6 text-white">
                <div>
                  <Building2 size={34} className="text-[#f3b33d]" />
                  <h3 className="mt-4 text-2xl font-black">Zar Kebab</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-[#f7e6c8]">Кейтеринг, обеды в офис и горячие блюда для команд в Ташкенте.</p>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/10 p-4"><UsersRound className="mb-2 text-[#f3b33d]" /><p className="font-black">Команды любого размера</p></div>
                  <div className="rounded-2xl bg-white/10 p-4"><Truck className="mb-2 text-[#f3b33d]" /><p className="font-black">Доставка по графику</p></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
