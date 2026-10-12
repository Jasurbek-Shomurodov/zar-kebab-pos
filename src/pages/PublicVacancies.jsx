import React, { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, ChefHat, Clock3, MapPin, Phone, Send, UserRound, UsersRound } from 'lucide-react'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'
import { getBrandLogo } from '../lib/brandLogo'
import { useApp } from '../store/AppContext'

const TELEGRAM_URL = 'https://t.me/zarkebab_managerr'
const PHONE_HREF = 'tel:+998915095545'

const COPY = {
  uz: {
    back: 'Menyuga qaytish',
    eyebrow: 'Zar Kebab jamoasi',
    title: 'Biz bilan birga rivojlaning',
    intro: 'Mehmondo‘stlikni yaxshi ko‘radigan mas’uliyatli insonlarni jamoamizga taklif qilamiz.',
    openings: 'Ochiq ish o‘rinlari',
    waiter: 'Ofitsiant',
    waiterText: 'Mehmonlarga yuqori darajada xizmat ko‘rsatish va buyurtmalarni to‘g‘ri qabul qilish.',
    cook: 'Oshpaz',
    cookText: 'Taomlarni standartlarimiz asosida sifatli va o‘z vaqtida tayyorlash.',
    hostess: 'Hostess',
    hostessText: 'Mehmonlarni samimiy kutib olish, joylashtirish va rezervatsiyalarni boshqarish.',
    fullTime: 'To‘liq ish kuni',
    tashkent: 'Toshkent',
    apply: 'Telegram orqali ariza',
    call: 'Qo‘ng‘iroq qilish',
    applyTitle: 'O‘zingiz haqingizda aytib bering',
    applyText: 'Qaysi lavozimga qiziqishingiz, tajribangiz va telefon raqamingizni Telegram orqali yuboring.',
    backToVacancies: 'Barcha ish o‘rinlari',
    responsibilities: 'Vazifalar',
    requirements: 'Talablar',
    positionDetails: 'Ish haqida',
    applyForRole: 'Ushbu lavozimga ariza',
  },
  ru: {
    back: 'Вернуться в меню',
    eyebrow: 'Команда Zar Kebab',
    title: 'Развивайтесь вместе с нами',
    intro: 'Приглашаем ответственных людей, которые любят гостеприимство и хотят стать частью нашей команды.',
    openings: 'Открытые вакансии',
    waiter: 'Официант',
    waiterText: 'Обслуживать гостей на высоком уровне и точно принимать заказы.',
    cook: 'Повар',
    cookText: 'Качественно и вовремя готовить блюда по стандартам ресторана.',
    hostess: 'Хостес',
    hostessText: 'Тепло встречать и размещать гостей, управлять бронированиями.',
    fullTime: 'Полный рабочий день',
    tashkent: 'Ташкент',
    apply: 'Откликнуться в Telegram',
    call: 'Позвонить',
    applyTitle: 'Расскажите нам о себе',
    applyText: 'Напишите в Telegram, какая вакансия вас интересует, укажите опыт и номер телефона.',
    backToVacancies: 'Все вакансии',
    responsibilities: 'Обязанности',
    requirements: 'Требования',
    positionDetails: 'О вакансии',
    applyForRole: 'Откликнуться на вакансию',
  },
  en: {
    back: 'Back to menu',
    eyebrow: 'Zar Kebab team',
    title: 'Grow together with us',
    intro: 'We welcome responsible people who care about hospitality and want to become part of our team.',
    openings: 'Open positions',
    waiter: 'Waiter',
    waiterText: 'Provide attentive guest service and take orders accurately.',
    cook: 'Cook',
    cookText: 'Prepare dishes with consistent quality and timing according to our standards.',
    hostess: 'Hostess',
    hostessText: 'Welcome and seat guests warmly while managing reservations.',
    fullTime: 'Full time',
    tashkent: 'Tashkent',
    apply: 'Apply on Telegram',
    call: 'Call us',
    applyTitle: 'Tell us about yourself',
    applyText: 'Message us on Telegram with the role you want, your experience, and your phone number.',
    backToVacancies: 'All vacancies',
    responsibilities: 'Responsibilities',
    requirements: 'Requirements',
    positionDetails: 'Position details',
    applyForRole: 'Apply for this role',
  },
}

const VACANCY_DETAILS = {
  uz: {
    waiter: {
      description: 'Mehmonlar bilan ishlashni yoqtiradigan, xushmuomala va mas’uliyatli ofitsiant izlaymiz. Tajriba bo‘lsa yaxshi, tajribasiz nomzodlarga ish o‘rgatiladi.',
      responsibilities: ['Mehmonlarni kutib olish va buyurtmalarni to‘g‘ri qabul qilish', 'Taom va ichimliklarni sifatli yetkazish', 'Mijozlarga yuqori darajada xizmat ko‘rsatish', 'Stol va ish joyi tozaligiga rioya qilish'],
      requirements: ['Rus tilida erkin gaplasha olish — majburiy', 'Ingliz tilida mijozlar bilan bemalol muloqot qila olish', 'Xushmuomala, ozoda va mas’uliyatli bo‘lish', 'Mehmonlar bilan ishlashni yoqtirish'],
    },
    cook: {
      description: 'Oshpaz retsept va standartlarimiz asosida taomlarni barqaror sifatda tayyorlaydi. Biz tozalik, tezlik va mahsulotga ehtiyotkor munosabatni qadrlaymiz.',
      responsibilities: ['Taomlarni texnologik kartalar asosida tayyorlash', 'Mahsulot sifati va porsiya standartini nazorat qilish', 'Ish joyi va uskunalarni toza saqlash', 'Buyurtmalarni oshxona jamoasi bilan o‘z vaqtida chiqarish'],
      requirements: ['Oshxonada ishlash tajribasi', 'Sanitariya va xavfsizlik qoidalarini bilish', 'Tez va tartibli ishlash qobiliyati', 'Jamoada ishlashga tayyorlik'],
    },
    hostess: {
      description: 'Mehmonlarda Zar Kebab haqida iliq va yaxshi taassurot qoldiradigan hostess izlaymiz. Tajriba bo‘lsa yaxshi, tajribasiz nomzodlarga ish o‘rgatiladi.',
      responsibilities: ['Mehmonlarni samimiy kutib olish va joylashtirish', 'Rezervatsiyalarni nazorat qilish', 'Mehmonlarga menyu hamda kafe haqida ma’lumot berish', 'Kirish qismida tartibni va mehmonlar oqimini boshqarish', 'Xorijiy mehmonlar bilan muloqot qilish', 'Mehmonlarda yaxshi taassurot qoldirish'],
      requirements: ['Rus tilida erkin so‘zlasha olish — majburiy', 'Ingliz tilida bemalol muloqot qila olish', 'O‘zbek tilini bilish', 'Xushmuomala, ozoda va mas’uliyatli bo‘lish', 'Yaxshi kommunikatsiya qobiliyatiga ega bo‘lish', 'Mehmonlar bilan ishlashni yoqtirish'],
    },
  },
  ru: {
    waiter: {
      description: 'Ищем вежливого и ответственного официанта, которому нравится работать с гостями. Опыт будет преимуществом, кандидатов без опыта обучим.',
      responsibilities: ['Встречать гостей и правильно принимать заказы', 'Качественно подавать блюда и напитки', 'Обеспечивать высокий уровень обслуживания', 'Поддерживать чистоту столов и рабочего места'],
      requirements: ['Свободное владение русским языком — обязательно', 'Уверенное общение с гостями на английском языке', 'Вежливость, опрятность и ответственность', 'Желание работать с гостями'],
    },
    cook: {
      description: 'Повар готовит блюда стабильно высокого качества по нашим рецептам и стандартам. Для нас важны чистота, скорость и бережное отношение к продуктам.',
      responsibilities: ['Готовить блюда по технологическим картам', 'Контролировать качество продуктов и размер порций', 'Поддерживать чистоту рабочего места и оборудования', 'Вовремя отдавать заказы вместе с командой кухни'],
      requirements: ['Опыт работы на кухне', 'Знание санитарных норм и правил безопасности', 'Умение работать быстро и организованно', 'Готовность работать в команде'],
    },
    hostess: {
      description: 'Ищем хостес, которая создаст у гостей тёплое первое впечатление о Zar Kebab. Опыт будет преимуществом, кандидатов без опыта обучим.',
      responsibilities: ['Тепло встречать и размещать гостей', 'Контролировать бронирования', 'Рассказывать гостям о меню и кафе', 'Поддерживать порядок во входной зоне и управлять потоком гостей', 'Общаться с иностранными гостями', 'Создавать хорошее впечатление у гостей'],
      requirements: ['Свободное владение русским языком — обязательно', 'Уверенное общение на английском языке', 'Знание узбекского языка', 'Вежливость, опрятность и ответственность', 'Хорошие коммуникативные навыки', 'Желание работать с гостями'],
    },
  },
  en: {
    waiter: {
      description: 'We are looking for a polite and responsible waiter who enjoys working with guests. Experience is welcome, and training is provided for candidates without experience.',
      responsibilities: ['Welcome guests and take orders accurately', 'Deliver food and drinks with care', 'Provide a high standard of customer service', 'Keep tables and the work area clean'],
      requirements: ['Fluent Russian — required', 'Confident communication with guests in English', 'A polite, neat, and responsible attitude', 'Enjoyment of working with guests'],
    },
    cook: {
      description: 'The cook prepares consistently high-quality dishes using our recipes and standards. We value cleanliness, good timing, and careful handling of ingredients.',
      responsibilities: ['Prepare dishes from approved recipe cards', 'Control ingredient quality and portion standards', 'Keep the station and equipment clean', 'Complete orders on time with the kitchen team'],
      requirements: ['Professional kitchen experience', 'Knowledge of food safety and hygiene', 'Ability to work quickly and stay organized', 'A reliable team-oriented attitude'],
    },
    hostess: {
      description: 'We are looking for a hostess who will give every guest a warm first impression of Zar Kebab. Experience is welcome, and training is provided for candidates without experience.',
      responsibilities: ['Welcome and seat guests warmly', 'Manage reservations', 'Tell guests about the menu and cafe', 'Keep the entrance organized and manage guest flow', 'Communicate with international guests', 'Create a positive impression for every guest'],
      requirements: ['Fluent Russian — required', 'Confident communication in English', 'Knowledge of Uzbek', 'A polite, neat, and responsible attitude', 'Strong communication skills', 'Enjoyment of working with guests'],
    },
  },
}

export default function PublicVacancies() {
  const navigate = useNavigate()
  const { vacancyId } = useParams()
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const copy = COPY[lang] || COPY.en

  const details = VACANCY_DETAILS[lang] || VACANCY_DETAILS.en
  const positions = [
    { key: 'waiter', Icon: UserRound, title: copy.waiter, text: copy.waiterText, ...details.waiter },
    { key: 'cook', Icon: ChefHat, title: copy.cook, text: copy.cookText, ...details.cook },
    { key: 'hostess', Icon: UsersRound, title: copy.hostess, text: copy.hostessText, ...details.hostess },
  ]
  const selectedPosition = vacancyId ? positions.find(position => position.key === vacancyId) : null

  useEffect(() => {
    document.title = `${selectedPosition?.title || copy.openings} — Zar Kebab`
    document.documentElement.lang = lang
  }, [copy.openings, lang, selectedPosition?.title])

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

  function returnToMenu(event) {
    animatedNavigate(event, '/menu')
  }

  function returnFromPage(event) {
    animatedNavigate(event, selectedPosition ? '/vacancies' : '/menu')
  }

  return (
    <div className="zk-lux public-page-enter min-h-screen">
      <header className="lux-header sticky top-0 z-40 border-b">
        <div className="mx-auto grid h-16 max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:h-20 sm:px-6">
          <Link to={selectedPosition ? '/vacancies' : '/menu'} onClick={returnFromPage} className="lux-muted inline-flex min-w-0 items-center gap-2 justify-self-start text-xs font-medium uppercase tracking-[0.18em] transition-colors hover:text-[#ff5a00]">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">{selectedPosition ? copy.backToVacancies : copy.back}</span>
          </Link>
          <Link to="/menu" onClick={returnToMenu} aria-label="Zar Kebab" className="flex items-center gap-2.5 justify-self-center sm:gap-3">
            <img src={getBrandLogo(lang)} alt="" className="h-11 w-auto object-contain sm:h-14" />
            <span className="whitespace-nowrap text-[11px] font-black uppercase tracking-[0.15em] text-[#ff5a00] sm:text-xs">Zar Kebab</span>
          </Link>
          <div className="flex items-center gap-2 justify-self-end">
            <ThemeToggle lang={lang} variant="lux" className="!h-10 !w-10" />
            <LanguageSwitcher variant="lux" />
          </div>
        </div>
      </header>

      <main>
        {selectedPosition ? (
          <>
            <section className="lux-page-2 lux-line border-b">
              <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 sm:py-14">
                <div className="flex max-w-3xl items-start gap-4 sm:gap-5">
                  <span className="lux-glass lux-gold flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full sm:h-16 sm:w-16"><selectedPosition.Icon size={26} /></span>
                  <div>
                    <p className="lux-gold text-[11px] font-medium uppercase tracking-[0.3em]">{copy.eyebrow}</p>
                    <h1 className="zk-serif lux-title mt-2 text-[44px] font-semibold leading-none sm:text-[64px]">{selectedPosition.title}</h1>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                      <span className="lux-chip inline-flex items-center gap-1.5 rounded-full px-3 py-2"><Clock3 size={14} />{copy.fullTime}</span>
                      <span className="lux-chip inline-flex items-center gap-1.5 rounded-full px-3 py-2"><MapPin size={14} />{copy.tashkent}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              <div className="space-y-9">
                <div>
                  <h2 className="zk-serif lux-title text-[28px] font-semibold">{copy.positionDetails}</h2>
                  <p className="lux-body mt-3 max-w-3xl text-base font-light leading-7">{selectedPosition.description}</p>
                </div>
                <DetailList title={copy.responsibilities} items={selectedPosition.responsibilities} />
                <DetailList title={copy.requirements} items={selectedPosition.requirements} />
              </div>
              <aside className="lux-glass rounded-[28px] p-6 lg:sticky lg:top-24">
                <h2 className="zk-serif lux-title text-[28px] font-semibold">{copy.applyForRole}</h2>
                <p className="lux-muted mt-2 text-sm font-light leading-relaxed">{copy.applyText}</p>
                <div className="mt-5 space-y-3">
                  <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="lux-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold"><Send size={17} />{copy.apply}</a>
                  <a href={PHONE_HREF} className="lux-cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold"><Phone size={17} />{copy.call}</a>
                </div>
              </aside>
            </section>
          </>
        ) : (
          <>
        <section className="lux-page-2 lux-line border-b">
          <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
              <div className="max-w-3xl">
                <p className="lux-gold text-[11px] font-medium uppercase tracking-[0.3em]">{copy.eyebrow}</p>
                <h1 className="zk-serif lux-title mt-3 text-[46px] font-semibold leading-[0.98] sm:text-[72px]">{copy.title}</h1>
                <p className="lux-body mt-4 max-w-2xl text-base font-light leading-relaxed sm:text-lg">{copy.intro}</p>
              </div>
              <div className="lux-muted hidden border-l pl-5 text-sm font-light leading-relaxed lg:block" style={{ borderColor: '#C9A86A' }}>
                <p>{copy.applyText}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="zk-serif lux-title text-[34px] font-semibold sm:text-[44px]">{copy.openings}</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {positions.map(({ key, Icon, title, text }) => (
              <Link key={key} to={`/vacancies/${key}`} onClick={event => animatedNavigate(event, `/vacancies/${key}`)} className="lux-glass group rounded-[28px] p-6 transition-transform duration-300 hover:-translate-y-1">
                <span className="lux-soft lux-gold flex h-12 w-12 items-center justify-center rounded-full"><Icon size={21} /></span>
                <h3 className="zk-serif lux-title mt-5 text-[28px] font-semibold leading-none">{title}</h3>
                <p className="lux-body mt-3 min-h-16 text-sm font-light leading-relaxed">{text}</p>
                <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-medium">
                  <span className="lux-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"><Clock3 size={13} />{copy.fullTime}</span>
                  <span className="lux-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"><MapPin size={13} />{copy.tashkent}</span>
                </div>
                <span className="lux-gold mt-5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em]">{copy.positionDetails}<ArrowRight size={14} /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="px-4 pb-14 sm:px-6 sm:pb-20">
          <div className="lux-glass mx-auto flex max-w-[1280px] flex-col gap-6 rounded-[32px] px-6 py-8 sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="zk-serif lux-title text-[32px] font-semibold leading-tight">{copy.applyTitle}</h2>
              <p className="lux-muted mt-2 text-sm font-light leading-relaxed sm:text-base">{copy.applyText}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-shrink-0">
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="lux-primary inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold"><Send size={17} />{copy.apply}</a>
              <a href={PHONE_HREF} className="lux-cta inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold"><Phone size={17} />{copy.call}</a>
            </div>
          </div>
        </section>
          </>
        )}
      </main>
    </div>
  )
}

function DetailList({ title, items }) {
  return (
    <div>
      <h2 className="zk-serif lux-title text-[28px] font-semibold">{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map(item => (
          <li key={item} className="lux-body flex items-start gap-3 text-sm font-light leading-6 sm:text-base">
            <CheckCircle2 size={18} className="lux-gold mt-0.5 flex-shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
