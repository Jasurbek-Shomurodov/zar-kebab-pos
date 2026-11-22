import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Store, Percent, Globe, Printer, Shield, Table2, ChefHat, Loader2,
  Check, ChevronRight, Activity, AlertTriangle, RefreshCw, Home, Zap, UtensilsCrossed, BadgeDollarSign, Moon, Sun, History,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import AppShell from '../components/AppShell'
import { runDbHealthChecks } from '../lib/dbHealth'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { canEditFeature } from '../lib/permissions'
import AttendanceQrAccessSettings from '../components/AttendanceQrAccessSettings'
import BreakEvenTargetHistoryDialog from '../components/BreakEvenTargetHistoryDialog'
import DailyBreakEvenBreakdown from '../components/DailyBreakEvenBreakdown'
import { formatCurrency } from '../lib/formatCurrency'
import { useTheme, setTheme } from '../lib/theme'

// Settings page group and card labels (sections are shown in one column, grouped).
const SETTINGS_NAV_LABELS = {
  uz: {
    groups: { restaurant: 'Restoran', workspace: 'Ish joyi' },
    tabs: { general: 'Umumiy', checkinQr: 'Kelish QR kodi' },
    sections: { restaurant: 'Restoran ma’lumotlari', billing: 'Xizmat haqi', costs: 'Xarajatlar va maqsadlar', preferences: 'Sozlamalar va ko‘rinish', printing: 'Chop etish', tables: 'Stollar', health: 'Tizim holati' },
    cards: { restaurant: 'Asosiy', billing: 'Xizmat haqi', costs: 'Oylik va kunlik ko‘rsatkichlar', language: 'Til', appearance: 'Ko‘rinish', printing: 'Cheklar', tables: 'Zal' },
    theme: 'Mavzu', themeSub: 'Faqat shu qurilma uchun', themes: { light: 'Yorug‘', dark: 'Qorong‘i' },
  },
  ru: {
    groups: { restaurant: 'Ресторан', workspace: 'Рабочее место' },
    tabs: { general: 'Общие', checkinQr: 'QR для отметки' },
    sections: { restaurant: 'Данные ресторана', billing: 'Сервисный сбор', costs: 'Расходы и цели', preferences: 'Настройки и вид', printing: 'Печать', tables: 'Столы', health: 'Состояние системы' },
    cards: { restaurant: 'Основное', billing: 'Сервисный сбор', costs: 'Месячные и дневные показатели', language: 'Язык', appearance: 'Оформление', printing: 'Чеки', tables: 'Зал' },
    theme: 'Тема', themeSub: 'Только для этого устройства', themes: { light: 'Светлая', dark: 'Тёмная' },
  },
  en: {
    groups: { restaurant: 'Restaurant', workspace: 'Workspace' },
    tabs: { general: 'General', checkinQr: 'Check-in QR' },
    sections: { restaurant: 'Restaurant details', billing: 'Service charge', costs: 'Costs and targets', preferences: 'Preferences', printing: 'Printing', tables: 'Tables', health: 'System health' },
    cards: { restaurant: 'General', billing: 'Service charge', costs: 'Monthly and daily figures', language: 'Language', appearance: 'Appearance', printing: 'Receipts', tables: 'Floor' },
    theme: 'Theme', themeSub: 'Applies to this device only', themes: { light: 'Light', dark: 'Dark' },
  },
}

function Section({ title, children }) {
  return (
    <section className="ws-panel ws-panel-flush">
      <div className="border-b border-[#e4e1de] px-5 py-4">
        <h2 className="ws-heading">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  )
}

function SettingRow({ icon: Icon, label, sub, children, compact = false, status = null }) {
  // On phones a wide control drops below its label at full width; toggles stay beside it.
  return (
    <div className="ws-row flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
      <div className={`flex min-w-0 flex-1 items-center gap-3 ${compact ? '' : 'basis-full sm:basis-0'}`}>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
          <Icon size={16} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#22201d]">{label}</p>
          {sub && <p className="ws-caption mt-0.5">{sub}</p>}
        </div>
      </div>
      <div className={compact ? 'flex-shrink-0' : 'w-full sm:w-auto sm:flex-shrink-0'}>{children}</div>
      {status && <div className="flex basis-full justify-end">{status}</div>}
    </div>
  )
}

/** The saved or failed state of one instant-save control, shown in its own row. */
function FieldStatus({ state, labels }) {
  if (state === 'saving') {
    return <span role="status" className="ws-caption inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden="true" />{labels.saving}</span>
  }
  if (state === 'saved') {
    return <span role="status" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1d7a52]"><Check size={13} aria-hidden="true" />{labels.fieldSaved}</span>
  }
  if (state === 'failed') {
    return <span role="alert" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#c4262c]"><AlertTriangle size={13} aria-hidden="true" />{labels.fieldFailed}</span>
  }
  return null
}

function Toggle({ value, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!value}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="ws-switch"
    />
  )
}

function healthMessage(check, labels) {
  if (check.messageKey === 'ok') return labels.healthOk
  if (check.messageKey === 'available') return labels.healthAvailable
  if (check.messageKey === 'protected') return labels.healthProtected
  if (check.messageKey === 'missingColumn') return labels.healthMissingColumn(check.detail)
  if (check.messageKey === 'ownerOnly') return labels.healthOwnerOnly
  if (check.messageKey === 'migrationIssues') return labels.healthMigrationIssues(check.items.length)
  return check.detail || labels.healthUnknownError
}

function healthHint(check) {
  return check.hint || ''
}

function healthCheckName(check, labels) {
  return labels.healthNames?.[check.name] || check.name
}

export default function AdminSettings() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { theme } = useTheme()
  const lang     = state.lang
  const settings = state.settings
  const canManageSettings = canEditFeature(profile || { role: state.user?.role }, 'settings')

  const [restaurantName, setRestaurantName] = useState(settings.restaurantName)
  const [serviceRate,    setServiceRate]    = useState(settings.serviceRate)
  const [touristServiceRate, setTouristServiceRate] = useState(settings.touristServiceRate)
  const [monthlyRentUzs, setMonthlyRentUzs] = useState(String(settings.monthlyRentUzs || ''))
  const [monthlyUtilitiesUzs, setMonthlyUtilitiesUzs] = useState(String(settings.monthlyUtilitiesUzs || ''))
  const [averageDailyEmployeeMealUzs, setAverageDailyEmployeeMealUzs] = useState(String(settings.averageDailyEmployeeMealUzs || ''))
  const [targetHistoryOpen, setTargetHistoryOpen] = useState(false)
  const [autoPrint,      setAutoPrint]      = useState(settings.autoPrint)
  const [autoPrintKitchenCheck, setAutoPrintKitchenCheck] = useState(!!settings.autoPrintKitchenCheck)
  const [touristMenuEnabled, setTouristMenuEnabled] = useState(settings.touristMenuEnabled !== false)
  const [publicTouristPrices, setPublicTouristPrices] = useState(settings.publicTouristPrices === true)
  const [receiptMarketing, setReceiptMarketing] = useState(settings.receiptMarketing || 'compactFooter')
  const [saved,          setSaved]          = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [saveFailed,     setSaveFailed]     = useState(false)
  const [savingTyped,    setSavingTyped]    = useState(false)
  // One entry per instant-save control: 'saving' | 'saved' | 'failed'.
  const [fieldStates,    setFieldStates]    = useState({})
  const [health,         setHealth]         = useState(null)
  const [healthLoading,  setHealthLoading]  = useState(false)
  const [healthFailed,   setHealthFailed]   = useState(false)

  // Each draft follows only its own saved value, so saving one control never
  // discards what is being typed in another.
  useEffect(() => { setRestaurantName(settings.restaurantName) }, [settings.restaurantName])
  useEffect(() => { setServiceRate(settings.serviceRate) }, [settings.serviceRate])
  useEffect(() => { setTouristServiceRate(settings.touristServiceRate) }, [settings.touristServiceRate])
  useEffect(() => { setMonthlyRentUzs(String(settings.monthlyRentUzs || '')) }, [settings.monthlyRentUzs])
  useEffect(() => { setMonthlyUtilitiesUzs(String(settings.monthlyUtilitiesUzs || '')) }, [settings.monthlyUtilitiesUzs])
  useEffect(() => { setAverageDailyEmployeeMealUzs(String(settings.averageDailyEmployeeMealUzs || '')) }, [settings.averageDailyEmployeeMealUzs])
  useEffect(() => { setAutoPrint(settings.autoPrint) }, [settings.autoPrint])
  useEffect(() => { setAutoPrintKitchenCheck(!!settings.autoPrintKitchenCheck) }, [settings.autoPrintKitchenCheck])
  useEffect(() => { setTouristMenuEnabled(settings.touristMenuEnabled !== false) }, [settings.touristMenuEnabled])
  useEffect(() => { setPublicTouristPrices(settings.publicTouristPrices === true) }, [settings.publicTouristPrices])
  useEffect(() => { setReceiptMarketing(settings.receiptMarketing || 'compactFooter') }, [settings.receiptMarketing])

  // What is saved right now. The data layer rewrites the whole settings row, so every
  // write carries all of it; a control changes only its own field on top of this.
  function savedSettings() {
    return {
      restaurantName: settings.restaurantName,
      serviceRate: settings.serviceRate,
      touristServiceRate: settings.touristServiceRate,
      monthlyRentUzs: Number(settings.monthlyRentUzs || 0),
      monthlyUtilitiesUzs: Number(settings.monthlyUtilitiesUzs || 0),
      averageDailyEmployeeMealUzs: Number(settings.averageDailyEmployeeMealUzs || 0),
      autoPrint: !!settings.autoPrint,
      autoPrintKitchenCheck: !!settings.autoPrintKitchenCheck,
      touristMenuEnabled: settings.touristMenuEnabled !== false,
      publicTouristPrices: settings.publicTouristPrices === true,
      receiptMarketing: settings.receiptMarketing || 'compactFooter',
    }
  }

  async function writeSettings(previous, changes) {
    setSaving(true)
    const result = await dispatch({ type: 'SET_SETTINGS', payload: { ...previous, ...changes } })
    if (result?.error) {
      console.error('[settings] save failed:', result.error)
      // The store applied the change before the write; put the saved values back.
      await dispatch({ type: 'SET_SETTINGS', payload: previous })
    }
    setSaving(false)
    return result
  }

  // Instant-save controls (switches, presets, the receipt list): only the changed
  // field is sent on top of the saved settings, never the unsaved typed fields.
  async function saveSettings(overrides = {}) {
    if (!canManageSettings) return { error: new Error('Settings write access is required') }
    const keys = Object.keys(overrides)
    const mark = value => setFieldStates(current => ({ ...current, ...Object.fromEntries(keys.map(key => [key, value])) }))
    mark('saving')
    const result = await writeSettings(savedSettings(), overrides)
    mark(result?.error ? 'failed' : 'saved')
    if (!result?.error) {
      setTimeout(() => setFieldStates(current => {
        const next = { ...current }
        keys.forEach(key => { if (next[key] === 'saved') delete next[key] })
        return next
      }), 2000)
    }
    return result
  }

  // The Save button covers the typed fields only: the name and the three amounts.
  const moneyChanged = (value, saved) => Number(normalizeMoneyInput(value) || 0) !== Number(saved || 0)
  const hasChanges = restaurantName !== settings.restaurantName
    || moneyChanged(monthlyRentUzs, settings.monthlyRentUzs)
    || moneyChanged(monthlyUtilitiesUzs, settings.monthlyUtilitiesUzs)
    || moneyChanged(averageDailyEmployeeMealUzs, settings.averageDailyEmployeeMealUzs)

  async function handleSave() {
    if (!canManageSettings || saving) return
    setSaveFailed(false)
    const previous = savedSettings()
    // Kept across the rollback so a failed save does not lose what was typed.
    const typed = { restaurantName, monthlyRentUzs, monthlyUtilitiesUzs, averageDailyEmployeeMealUzs }
    setSavingTyped(true)
    const result = await writeSettings(previous, {
      restaurantName,
      monthlyRentUzs: Number(normalizeMoneyInput(monthlyRentUzs) || 0),
      monthlyUtilitiesUzs: Number(normalizeMoneyInput(monthlyUtilitiesUzs) || 0),
      averageDailyEmployeeMealUzs: Number(normalizeMoneyInput(averageDailyEmployeeMealUzs) || 0),
    })
    setSavingTyped(false)
    if (result?.error) {
      setRestaurantName(typed.restaurantName)
      setMonthlyRentUzs(typed.monthlyRentUzs)
      setMonthlyUtilitiesUzs(typed.monthlyUtilitiesUzs)
      setAverageDailyEmployeeMealUzs(typed.averageDailyEmployeeMealUzs)
      setSaveFailed(true)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleAutoPrintChange(nextValue) {
    if (!canManageSettings || saving) return
    setAutoPrint(nextValue)
    const result = await saveSettings({ autoPrint: nextValue })
    if (result?.error) setAutoPrint(!nextValue)
  }

  async function handleAutoPrintKitchenCheckChange(nextValue) {
    if (!canManageSettings || saving) return
    setAutoPrintKitchenCheck(nextValue)
    const result = await saveSettings({ autoPrintKitchenCheck: nextValue })
    if (result?.error) setAutoPrintKitchenCheck(!nextValue)
  }

  async function handleReceiptMarketingChange(nextValue) {
    if (!canManageSettings || saving) return
    const previousValue = receiptMarketing
    setReceiptMarketing(nextValue)
    const result = await saveSettings({ receiptMarketing: nextValue })
    if (result?.error) setReceiptMarketing(previousValue)
  }

  async function handleTouristMenuChange(nextValue) {
    if (!canManageSettings || saving) return
    setTouristMenuEnabled(nextValue)
    const result = await saveSettings({ touristMenuEnabled: nextValue })
    if (result?.error) setTouristMenuEnabled(!nextValue)
  }

  async function handlePublicTouristPricesChange(nextValue) {
    if (!canManageSettings || saving) return
    setPublicTouristPrices(nextValue)
    const result = await saveSettings({ publicTouristPrices: nextValue })
    if (result?.error) setPublicTouristPrices(!nextValue)
  }

  async function handleServiceRateChange(nextRate) {
    if (!canManageSettings || saving) return
    const previousRate = serviceRate
    setServiceRate(nextRate)
    const result = await saveSettings({ serviceRate: nextRate })
    if (result?.error) setServiceRate(previousRate)
  }

  async function handleTouristServiceRateChange(nextRate) {
    if (!canManageSettings || saving) return
    const previousRate = touristServiceRate
    setTouristServiceRate(nextRate)
    const result = await saveSettings({ touristServiceRate: nextRate })
    if (result?.error) setTouristServiceRate(previousRate)
  }

  async function checkHealth() {
    setHealthLoading(true)
    setHealthFailed(false)
    try {
      setHealth(await runDbHealthChecks())
    } catch (err) {
      console.error('[settings] health check failed:', err)
      setHealthFailed(true)
    } finally {
      setHealthLoading(false)
    }
  }

  const L = {
    uz: {
      title:           'Sozlamalar',
      sub:             'Restoran konfiguratsiyasi',
      restaurant:      'Restoran ma\'lumotlari',
      restaurantName:  'Restoran nomi',
      restaurantNameSub: 'Cheklarda va hisobotlarda ko\'rsatiladi',
      billing:         'Hisob-kitob',
      serviceCharge:   'Oddiy xizmat to\'lovi',
      serviceChargeSub: 'Oddiy narxdagi zal buyurtmalariga qo\'shiladi',
      touristMenu: 'Turist menyusi',
      touristMenuSub: 'O‘chirilganda stollar darhol oddiy narxlarda ochiladi va premium menyu oddiy menyuga yo‘naltiriladi',
      publicTouristPrices: 'zarkebab.uz saytida turist narxlari',
      publicTouristPricesSub: 'Yoqilganda ochiq menyu turist narxlarini ko‘rsatadi. Turist menyusi o‘chiq bo‘lsa, oddiy narxlar ko‘rinadi',
      touristServiceCharge: 'Turist xizmat to\'lovi',
      touristServiceChargeSub: 'Turist narxidagi zal buyurtmalariga qo\'shiladi',
      monthlyRent:     'Oylik ijara',
      monthlyRentSub:  'Buxgalteriya taxminida UZS ko‘rinadi',
      monthlyUtilities: 'Oylik kommunal',
      monthlyUtilitiesSub: 'Kommunal to‘lovlar oylik taxminiga qo‘shiladi',
      averageDailyEmployeeMeal: 'Xodimlar ovqatining o‘rtacha qiymati',
      averageDailyEmployeeMealSub: 'Har bir ishga kelgan xodim uchun kunlik o‘rtacha qiymat',
      averageDailyBreakEvenIncome: 'O‘rtacha kunlik zararsizlik daromadi',
      averageDailyBreakEvenIncomeSub: 'Har kuni ertalab kechagi xarajatlardan hisoblanadi; Dashboard grafigidagi qizil nuqtali chiziq',
      targetHistory: 'Tarix',
      system:          'Tizim',
      tableManagement: 'Stollar',
      tableManagementSub: 'Restoran stollari, zonalari va sig‘imini boshqarish',
      language:        'Til',
      languageSub:     'Interfeys tili',
      autoPrint:       'Hisobni avtomatik chop etish',
      autoPrintSub:    'Buyurtma kassirga yuborilganda hisobni darhol chop etish',
      autoPrintKitchenCheck: 'Oshxona chekini avtomatik chop etish',
      autoPrintKitchenCheckSub: 'Buyurtma oshxonaga yuborilganda darhol oshxona cheki chiqadi',
      receiptMarketing: 'Chek marketingi',
      receiptMarketingSub: 'Jami summadan keyin nima chiqishini tanlang',
      receiptMarketingModes: {
        none: 'Marketing yoq',
        compactFooter: 'Ixcham footer',
        loyaltyOnly: 'Faqat sodiqlik',
        instagramOnly: 'Faqat Instagram',
        full: 'To\'liq footer',
      },
      systemHealth:    'Tizim holati',
      systemHealthSub: 'Baza jadvallari, ustunlari va RPC tekshiruvi',
      runHealth:       'Tekshirish',
      healthy:         'Hammasi joyida',
      unhealthy:       'Muammo bor',
      healthOk:         'OK',
      healthAvailable:  'Mavjud',
      healthProtected:  'Himoyalangan',
      healthMissingColumn: column => `Ustun yo‘q: ${column}`,
      healthOwnerOnly: 'Faqat egasi tekshira oladi',
      healthMigrationIssues: count => `${count} ta muammo`,
      healthUnknownError: 'Noma’lum xatolik',
      healthNames: {
        migration_definitions: 'Migratsiyalar: funksiyalar va triggerlar',
        migration_receipts: 'Migratsiyalar: qo‘llanganlik belgilari',
        restaurant_tables: 'Restoran stollari',
        table_zones: 'Stol zonalari',
        orders: 'Buyurtmalar',
        order_items: 'Buyurtma mahsulotlari',
        order_payments: 'Buyurtma to‘lovlari',
        business_settings: 'Biznes sozlamalari',
        loyalty_cards: 'Sodiqlik kartalari',
        loyalty_transactions: 'Sodiqlik tranzaksiyalari',
        expenses: 'Buxgalteriya',
        menu_items: 'Menyu mahsulotlari',
        menu_categories: 'Menyu kategoriyalari',
        profiles: 'Profil foydalanuvchilari',
        order_payment_audit: 'To‘lov auditi',
        submit_order_to_kitchen: 'Buyurtma yuborish RPC',
      },
      open:             'Ochish',
      save:            'Saqlash',
      saving:          'Saqlanmoqda…',
      saved:           'Saqlandi',
      saveError:       'Sozlamalarni saqlab bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.',
      saveHint:        'Nom va summalar shu tugma bilan saqlanadi. Tugmachalar va tanlovlar darhol saqlanadi.',
      fieldSaved:      'Saqlandi',
      fieldFailed:     'Saqlanmadi. Qayta urinib ko‘ring.',
      healthFailed:    'Tizim holatini tekshirib bo‘lmadi. Qayta urinib ko‘ring.',
    },
    ru: {
      title:           'Настройки',
      sub:             'Конфигурация ресторана',
      restaurant:      'Данные ресторана',
      restaurantName:  'Название ресторана',
      restaurantNameSub: 'Отображается на чеках и в отчётах',
      billing:         'Выставление счётов',
      serviceCharge:   'Обычный сервисный сбор',
      serviceChargeSub: 'Добавляется к заказам в зале с обычной ценой',
      touristMenu: 'Туристическое меню',
      touristMenuSub: 'Если выключено, столы сразу открываются по обычным ценам, а премиум-меню ведёт на обычное меню',
      publicTouristPrices: 'Туристические цены на zarkebab.uz',
      publicTouristPricesSub: 'Если включено, публичное меню показывает туристические цены. При выключенном туристическом меню показываются обычные цены',
      touristServiceCharge: 'Сервисный сбор для туристов',
      touristServiceChargeSub: 'Добавляется к заказам в зале с туристической ценой',
      monthlyRent:     'Ежемесячная аренда',
      monthlyRentSub:  'Показывается в прогнозе бухгалтерии в UZS',
      monthlyUtilities: 'Ежемесячная коммуналка',
      monthlyUtilitiesSub: 'Добавляется в месячный прогноз расходов',
      averageDailyEmployeeMeal: 'Среднее питание сотрудников',
      averageDailyEmployeeMealSub: 'Средняя дневная стоимость на каждого присутствующего сотрудника',
      averageDailyBreakEvenIncome: 'Средний дневной доход безубыточности',
      averageDailyBreakEvenIncomeSub: 'Считается каждое утро по вчерашним расходам; красная пунктирная линия на графике Dashboard',
      targetHistory: 'История',
      system:          'Система',
      tableManagement: 'Столы',
      tableManagementSub: 'Управление столами, зонами и вместимостью',
      language:        'Язык',
      languageSub:     'Язык интерфейса',
      autoPrint:       'Автопечать счёта',
      autoPrintSub:    'Печатать счёт сразу при передаче заказа кассиру',
      autoPrintKitchenCheck: 'Автопечать кухонного чека',
      autoPrintKitchenCheckSub: 'Печатать кухонный чек сразу после отправки заказа',
      receiptMarketing: 'Маркетинг в чеке',
      receiptMarketingSub: 'Что печатать под итогом оплаты',
      receiptMarketingModes: {
        none: 'Без маркетинга',
        compactFooter: 'Компактный footer',
        loyaltyOnly: 'Только лояльность',
        instagramOnly: 'Только Instagram',
        full: 'Полный footer',
      },
      systemHealth:    'Состояние системы',
      systemHealthSub: 'Проверка таблиц, колонок и RPC в базе',
      runHealth:       'Проверить',
      healthy:         'Всё в порядке',
      unhealthy:       'Есть проблемы',
      healthOk:         'OK',
      healthAvailable:  'Доступно',
      healthProtected:  'Защищено',
      healthMissingColumn: column => `Нет колонки: ${column}`,
      healthOwnerOnly: 'Проверяет только владелец',
      healthMigrationIssues: count => `Проблем: ${count}`,
      healthUnknownError: 'Неизвестная ошибка',
      healthNames: {
        migration_definitions: 'Миграции: функции и триггеры',
        migration_receipts: 'Миграции: отметки применения',
        restaurant_tables: 'Столы ресторана',
        table_zones: 'Зоны столов',
        orders: 'Заказы',
        order_items: 'Позиции заказа',
        order_payments: 'Платежи заказа',
        business_settings: 'Настройки бизнеса',
        loyalty_cards: 'Карты лояльности',
        loyalty_transactions: 'Транзакции лояльности',
        expenses: 'Бухгалтерия',
        menu_items: 'Позиции меню',
        menu_categories: 'Категории меню',
        profiles: 'Профили пользователей',
        order_payment_audit: 'Аудит платежей',
        submit_order_to_kitchen: 'RPC отправки заказа',
      },
      open:             'Открыть',
      save:            'Сохранить',
      saving:          'Сохранение…',
      saved:           'Сохранено',
      saveError:       'Не удалось сохранить настройки. Проверьте интернет и попробуйте ещё раз.',
      saveHint:        'Название и суммы сохраняются этой кнопкой. Переключатели и выбор сохраняются сразу.',
      fieldSaved:      'Сохранено',
      fieldFailed:     'Не сохранено. Попробуйте ещё раз.',
      healthFailed:    'Не удалось проверить состояние системы. Попробуйте ещё раз.',
    },
    en: {
      title:           'Settings',
      sub:             'Restaurant configuration',
      restaurant:      'Restaurant details',
      restaurantName:  'Restaurant name',
      restaurantNameSub: 'Shown on receipts and reports',
      billing:         'Billing',
      serviceCharge:   'Regular service charge',
      serviceChargeSub: 'Added to Regular dine-in orders',
      touristMenu: 'Tourist menu',
      touristMenuSub: 'When off, tables open straight to Regular prices and the premium menu shows the regular menu',
      publicTouristPrices: 'Tourist prices on zarkebab.uz',
      publicTouristPricesSub: 'When on, the public menu shows Tourist prices. With the Tourist menu off it always shows Regular prices',
      touristServiceCharge: 'Tourist service charge',
      touristServiceChargeSub: 'Added to Tourist dine-in orders',
      monthlyRent:     'Monthly rent',
      monthlyRentSub:  'Shown in accounting estimate as UZS',
      monthlyUtilities: 'Monthly utilities bill',
      monthlyUtilitiesSub: 'Included in the monthly accounting estimate',
      averageDailyEmployeeMeal: 'Average employee meal',
      averageDailyEmployeeMealSub: 'Average daily cost for each employee who is present',
      averageDailyBreakEvenIncome: 'Average daily break-even income',
      averageDailyBreakEvenIncomeSub: 'Calculated every morning from yesterday’s costs; the red dotted line on the Dashboard chart',
      targetHistory: 'History',
      system:          'System',
      tableManagement: 'Tables',
      tableManagementSub: 'Manage restaurant tables, zones, and capacity',
      language:        'Language',
      languageSub:     'Interface language',
      autoPrint:       'Auto-print bill',
      autoPrintSub:    'Print the bill immediately when an order moves to cashier',
      autoPrintKitchenCheck: 'Auto-print kitchen check',
      autoPrintKitchenCheckSub: 'Print the kitchen check immediately when an order is submitted',
      receiptMarketing: 'Receipt marketing',
      receiptMarketingSub: 'Choose what prints under the total',
      receiptMarketingModes: {
        none: 'No marketing',
        compactFooter: 'Compact footer',
        loyaltyOnly: 'Loyalty only',
        instagramOnly: 'Instagram only',
        full: 'Full footer',
      },
      systemHealth:    'System health',
      systemHealthSub: 'Checks database tables, columns, and RPCs',
      runHealth:       'Check',
      healthy:         'Healthy',
      unhealthy:       'Needs attention',
      healthOk:         'OK',
      healthAvailable:  'Available',
      healthProtected:  'Protected',
      healthMissingColumn: column => `Missing column: ${column}`,
      healthOwnerOnly: 'Owner-only check',
      healthMigrationIssues: count => `${count} issue${count === 1 ? '' : 's'}`,
      healthUnknownError: 'Unknown error',
      healthNames: {
        migration_definitions: 'Migrations: functions and triggers',
        migration_receipts: 'Migrations: applied receipts',
        restaurant_tables: 'Restaurant tables',
        table_zones: 'Table zones',
        orders: 'Orders',
        order_items: 'Order items',
        order_payments: 'Order payments',
        business_settings: 'Business settings',
        loyalty_cards: 'Loyalty cards',
        loyalty_transactions: 'Loyalty transactions',
        expenses: 'Accounting',
        menu_items: 'Menu items',
        menu_categories: 'Menu categories',
        profiles: 'User profiles',
        order_payment_audit: 'Payment audit',
        submit_order_to_kitchen: 'Order submit RPC',
      },
      open:             'Open',
      save:            'Save changes',
      saving:          'Saving…',
      saved:           'Saved',
      saveError:       'Could not save the settings. Check the connection and try again.',
      saveHint:        'The name and the amounts are saved with this button. Switches and choices save at once.',
      fieldSaved:      'Saved',
      fieldFailed:     'Not saved. Try again.',
      healthFailed:    'Could not check system health. Try again.',
    },
  }
  const l = L[lang] || L.en

  const nav = SETTINGS_NAV_LABELS[lang] || SETTINGS_NAV_LABELS.en
  const tab = searchParams.get('tab') === 'checkin-qr' ? 'checkin-qr' : 'general'
  // The tab lives in the URL so refreshes and language switches keep it.
  const selectTab = next => setSearchParams(current => {
    const params = new URLSearchParams(current)
    if (next === 'general') params.delete('tab')
    else params.set('tab', next)
    return params
  }, { replace: true })

  return (
    <AppShell
      title={l.title}
      tabs={{
        label: l.title,
        value: tab,
        onChange: selectTab,
        items: [
          { key: 'general', label: nav.tabs.general },
          { key: 'checkin-qr', label: nav.tabs.checkinQr },
        ],
      }}
    >
      <div className="min-h-full bg-[#f6f5f3]">
      <div className="ws-page">
          <div className="flex min-w-0 flex-col gap-4">
            {tab === 'checkin-qr' ? (
              <AttendanceQrAccessSettings lang={lang} canManage={canManageSettings} />
            ) : (
            <>
            <h2 className="ws-heading mt-1">{nav.groups.restaurant}</h2>

            {(
              <Section title={nav.sections.restaurant}>
              <SettingRow icon={Store} label={l.restaurantName} sub={l.restaurantNameSub}>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={e => setRestaurantName(e.target.value)}
                  disabled={!canManageSettings}
                  aria-label={l.restaurantName}
                  autoComplete="organization"
                  className="ws-input !w-full sm:!w-[220px] sm:text-right"
                />
              </SettingRow>
              </Section>
            )}

            {(
              <Section title={nav.sections.billing}>
              <SettingRow icon={Percent} label={l.serviceCharge} sub={l.serviceChargeSub} status={<FieldStatus state={fieldStates.serviceRate} labels={l} />}>
                <div className="ws-segmented flex w-full sm:inline-flex sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" role="group" aria-label={l.serviceCharge}>
                  {[0, 10, 15, 20].map(v => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={serviceRate === v}
                      onClick={() => handleServiceRateChange(v)}
                      disabled={!canManageSettings || saving}
                      className="!px-3 tabular-nums disabled:cursor-not-allowed"
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow icon={Globe} label={l.touristMenu} sub={l.touristMenuSub} compact status={<FieldStatus state={fieldStates.touristMenuEnabled} labels={l} />}>
                <Toggle label={l.touristMenu} value={touristMenuEnabled} onChange={handleTouristMenuChange} disabled={!canManageSettings || saving} />
              </SettingRow>
              <SettingRow icon={Globe} label={l.publicTouristPrices} sub={l.publicTouristPricesSub} compact status={<FieldStatus state={fieldStates.publicTouristPrices} labels={l} />}>
                <Toggle label={l.publicTouristPrices} value={touristMenuEnabled && publicTouristPrices} onChange={handlePublicTouristPricesChange} disabled={!canManageSettings || saving || !touristMenuEnabled} />
              </SettingRow>
              <SettingRow icon={Percent} label={l.touristServiceCharge} sub={l.touristServiceChargeSub} status={<FieldStatus state={fieldStates.touristServiceRate} labels={l} />}>
                <div className="ws-segmented flex w-full sm:inline-flex sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" role="group" aria-label={l.touristServiceCharge}>
                  {[0, 10, 15, 20].map(v => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={touristServiceRate === v}
                      onClick={() => handleTouristServiceRateChange(v)}
                      disabled={!canManageSettings || saving}
                      className="!px-3 tabular-nums disabled:cursor-not-allowed"
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </SettingRow>
              </Section>
            )}

            {(
              <Section title={nav.sections.costs}>
              <SettingRow icon={Home} label={l.monthlyRent} sub={l.monthlyRentSub}>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatMoneyInput(monthlyRentUzs)}
                    onChange={event => setMonthlyRentUzs(normalizeMoneyInput(event.target.value))}
                    disabled={!canManageSettings}
                    aria-label={l.monthlyRent}
                    autoComplete="off"
                    className="ws-input !w-full sm:!w-[220px] !pr-12 text-right font-medium tabular-nums"
                    placeholder="0"
                  />
                  <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#68655f]">UZS</span>
                </div>
              </SettingRow>
              <SettingRow icon={Zap} label={l.monthlyUtilities} sub={l.monthlyUtilitiesSub}>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatMoneyInput(monthlyUtilitiesUzs)}
                    onChange={event => setMonthlyUtilitiesUzs(normalizeMoneyInput(event.target.value))}
                    disabled={!canManageSettings}
                    aria-label={l.monthlyUtilities}
                    autoComplete="off"
                    className="ws-input !w-full sm:!w-[220px] !pr-12 text-right font-medium tabular-nums"
                    placeholder="0"
                  />
                  <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#68655f]">UZS</span>
                </div>
              </SettingRow>
              <SettingRow icon={UtensilsCrossed} label={l.averageDailyEmployeeMeal} sub={l.averageDailyEmployeeMealSub}>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatMoneyInput(averageDailyEmployeeMealUzs)}
                    onChange={event => setAverageDailyEmployeeMealUzs(normalizeMoneyInput(event.target.value))}
                    disabled={!canManageSettings}
                    aria-label={l.averageDailyEmployeeMeal}
                    autoComplete="off"
                    className="ws-input !w-full sm:!w-[220px] !pr-12 text-right font-medium tabular-nums"
                    placeholder="0"
                  />
                  <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#68655f]">UZS</span>
                </div>
              </SettingRow>
              <SettingRow icon={BadgeDollarSign} label={l.averageDailyBreakEvenIncome} sub={l.averageDailyBreakEvenIncomeSub}>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <button type="button" onClick={() => setTargetHistoryOpen(true)} className="ws-btn ws-btn-outline flex-shrink-0">
                    <History size={15} aria-hidden="true" />
                    {l.targetHistory}
                  </button>
                  <p className="whitespace-nowrap text-right text-base font-semibold tabular-nums text-[#22201d] sm:min-w-[180px]">{formatCurrency(settings.averageDailyBreakEvenIncomeUzs)}</p>
                </div>
                {targetHistoryOpen && <BreakEvenTargetHistoryDialog lang={lang} onClose={() => setTargetHistoryOpen(false)} />}
              </SettingRow>
              <div className="px-4 pb-4 sm:px-5">
                <DailyBreakEvenBreakdown lang={lang} />
              </div>
              </Section>
            )}

            <h2 className="ws-heading mt-4">{nav.groups.workspace}</h2>

            <Section title={nav.sections.preferences}>
              <SettingRow icon={Globe} label={l.language} sub={l.languageSub}>
                <div className="ws-segmented flex w-full sm:inline-flex sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" role="group" aria-label={l.language}>
                  {['uz', 'ru', 'en'].map(lg => (
                    <button
                      key={lg}
                      type="button"
                      aria-pressed={lang === lg}
                      onClick={() => dispatch({ type: 'SET_LANG', payload: lg })}
                      className="!px-3 uppercase"
                    >
                      {lg}
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow icon={theme === 'dark' ? Moon : Sun} label={nav.theme} sub={nav.themeSub}>
                <div className="ws-segmented flex w-full sm:inline-flex sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" role="group" aria-label={nav.theme}>
                  {['light', 'dark'].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={theme === mode}
                      onClick={() => setTheme(mode)}
                      className="!px-3"
                    >
                      {nav.themes[mode]}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </Section>

            {(
              <Section title={nav.sections.printing}>
              <SettingRow icon={Printer} label={l.autoPrint} sub={l.autoPrintSub} compact status={<FieldStatus state={fieldStates.autoPrint} labels={l} />}>
                <Toggle label={l.autoPrint} value={autoPrint} onChange={handleAutoPrintChange} disabled={!canManageSettings || saving} />
              </SettingRow>
              <SettingRow icon={ChefHat} label={l.autoPrintKitchenCheck} sub={l.autoPrintKitchenCheckSub} compact status={<FieldStatus state={fieldStates.autoPrintKitchenCheck} labels={l} />}>
                <Toggle label={l.autoPrintKitchenCheck} value={autoPrintKitchenCheck} onChange={handleAutoPrintKitchenCheckChange} disabled={!canManageSettings || saving} />
              </SettingRow>
              <SettingRow icon={Printer} label={l.receiptMarketing} sub={l.receiptMarketingSub} status={<FieldStatus state={fieldStates.receiptMarketing} labels={l} />}>
                <select
                  value={receiptMarketing}
                  onChange={event => handleReceiptMarketingChange(event.target.value)}
                  disabled={!canManageSettings || saving}
                  aria-label={l.receiptMarketing}
                  className="ws-input !w-full sm:!w-[220px]"
                >
                  {['none', 'compactFooter', 'loyaltyOnly', 'instagramOnly', 'full'].map(mode => (
                    <option key={mode} value={mode}>{l.receiptMarketingModes[mode]}</option>
                  ))}
                </select>
              </SettingRow>
              </Section>
            )}

            {(
              <Section title={nav.sections.tables}>
              <SettingRow icon={Table2} label={l.tableManagement} sub={l.tableManagementSub} compact>
                <button
                  type="button"
                  onClick={() => navigate('/admin/tables')}
                  aria-label={`${l.open}: ${l.tableManagement}`}
                  className="ws-btn ws-btn-outline ws-btn-sm"
                >
                  {l.open}
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </SettingRow>
              </Section>
            )}

            {(
              <Section title={l.systemHealth}>
              <div className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
                      <Activity size={16} aria-hidden="true" />
                    </div>
                    <p className="ws-caption min-w-0">{l.systemHealthSub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={checkHealth}
                    disabled={healthLoading}
                    className="ws-btn ws-btn-outline ws-btn-sm"
                  >
                    {healthLoading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                    {l.runHealth}
                  </button>
                </div>

                {healthFailed && (
                  <p role="alert" className="ws-notice ws-tone-negative mt-3">
                    {l.healthFailed}
                  </p>
                )}

                {health && (
                  <div className="mt-4">
                    <div className={`ws-badge !text-[13px] ${health.ok ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
                      {health.ok ? <Check size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
                      {health.ok ? l.healthy : l.unhealthy}
                    </div>
                    <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
                      {[...health.checks].sort((a, b) => a.ok - b.ok).map(check => (
                        <li key={`${check.type}-${check.name}`} className={`min-w-0 border-t border-[#e4e1de] py-2 text-[13px] ${check.items?.length ? 'sm:col-span-2' : ''}`}>
                          <p className="font-semibold text-[#22201d]">{healthCheckName(check, l)}</p>
                          <p className={check.ok ? 'text-[#1d7a52]' : 'text-[#c4262c]'}>{healthMessage(check, l)}</p>
                          {!check.ok && check.items?.length > 0 && (
                            <ul className="mt-1 space-y-0.5 font-mono text-xs text-[#c4262c]">
                              {check.items.map(item => <li key={item} className="[overflow-wrap:anywhere]">{item}</li>)}
                            </ul>
                          )}
                          {!check.ok && healthHint(check) && (
                            <p className="mt-1 font-mono text-xs text-[#68655f] [overflow-wrap:anywhere]">{healthHint(check)}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              </Section>
            )}

            {(
              <>
            {/* Save button: the typed fields only */}
            {canManageSettings && <p className="ws-caption">{l.saveHint}</p>}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canManageSettings || (!hasChanges && !saved)}
              className={`ws-btn ws-btn-primary w-full ${saved ? '!bg-[#1d7a52]' : ''}`}
            >
              {saved ? <Check size={16} aria-hidden="true" /> : savingTyped ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Shield size={16} aria-hidden="true" />}
              {saved ? l.saved : savingTyped ? l.saving : l.save}
            </button>
            {saveFailed && (
              <p role="alert" className="ws-notice ws-tone-negative">
                {l.saveError}
              </p>
            )}
              </>
            )}
            </>
            )}
          </div>
      </div>
      </div>
    </AppShell>
  )
}
