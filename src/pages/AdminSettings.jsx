import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Store, Percent, Globe, Printer, Bell, Shield, Table2, ChefHat,
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
import { useTheme, setTheme } from '../lib/theme'

// Settings page group and card labels (sections are shown in one column, grouped).
const SETTINGS_NAV_LABELS = {
  uz: {
    groups: { restaurant: 'Restoran', workspace: 'Ish joyi' },
    tabs: { general: 'Umumiy', checkinQr: 'Kelish QR kodi' },
    sections: { restaurant: 'Restoran ma’lumotlari', billing: 'Xizmat haqi', costs: 'Xarajatlar va maqsadlar', preferences: 'Sozlamalar va ko‘rinish', printing: 'Chop etish', tables: 'Stollar', health: 'Tizim holati' },
    cards: { restaurant: 'Asosiy', billing: 'Xizmat haqi', costs: 'Oylik va kunlik ko‘rsatkichlar', language: 'Til', appearance: 'Ko‘rinish', notifications: 'Bildirishnomalar', printing: 'Cheklar', tables: 'Zal' },
    theme: 'Mavzu', themeSub: 'Faqat shu qurilma uchun', themes: { light: 'Yorug‘', dark: 'Qorong‘i' },
  },
  ru: {
    groups: { restaurant: 'Ресторан', workspace: 'Рабочее место' },
    tabs: { general: 'Общие', checkinQr: 'QR для отметки' },
    sections: { restaurant: 'Данные ресторана', billing: 'Сервисный сбор', costs: 'Расходы и цели', preferences: 'Настройки и вид', printing: 'Печать', tables: 'Столы', health: 'Состояние системы' },
    cards: { restaurant: 'Основное', billing: 'Сервисный сбор', costs: 'Месячные и дневные показатели', language: 'Язык', appearance: 'Оформление', notifications: 'Уведомления', printing: 'Чеки', tables: 'Зал' },
    theme: 'Тема', themeSub: 'Только для этого устройства', themes: { light: 'Светлая', dark: 'Тёмная' },
  },
  en: {
    groups: { restaurant: 'Restaurant', workspace: 'Workspace' },
    tabs: { general: 'General', checkinQr: 'Check-in QR' },
    sections: { restaurant: 'Restaurant details', billing: 'Service charge', costs: 'Costs & targets', preferences: 'Preferences', printing: 'Printing', tables: 'Tables', health: 'System health' },
    cards: { restaurant: 'General', billing: 'Service charge', costs: 'Monthly and daily figures', language: 'Language', appearance: 'Appearance', notifications: 'Notifications', printing: 'Receipts', tables: 'Floor' },
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

function SettingRow({ icon: Icon, label, sub, children, compact = false }) {
  // On phones a wide control drops below its label at full width; toggles stay beside it.
  return (
    <div className="ws-row flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
      <div className={`flex min-w-0 flex-1 items-center gap-3 ${compact ? '' : 'basis-full sm:basis-0'}`}>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#22201d]">{label}</p>
          {sub && <p className="ws-caption mt-0.5">{sub}</p>}
        </div>
      </div>
      <div className={compact ? 'flex-shrink-0' : 'w-full sm:w-auto sm:flex-shrink-0'}>{children}</div>
    </div>
  )
}

function Toggle({ value, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a00] disabled:cursor-not-allowed disabled:opacity-60 ${value ? 'bg-[#ff5a00]' : 'bg-[#dcd9d6]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/20%)] transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
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
  const [averageDailyBreakEvenIncomeUzs, setAverageDailyBreakEvenIncomeUzs] = useState(String(settings.averageDailyBreakEvenIncomeUzs || ''))
  const [targetHistoryOpen, setTargetHistoryOpen] = useState(false)
  const [autoPrint,      setAutoPrint]      = useState(settings.autoPrint)
  const [autoPrintKitchenCheck, setAutoPrintKitchenCheck] = useState(!!settings.autoPrintKitchenCheck)
  const [touristMenuEnabled, setTouristMenuEnabled] = useState(settings.touristMenuEnabled !== false)
  const [publicTouristPrices, setPublicTouristPrices] = useState(settings.publicTouristPrices === true)
  const [receiptMarketing, setReceiptMarketing] = useState(settings.receiptMarketing || 'compactFooter')
  const [notifications,  setNotifications]  = useState(true)
  const [saved,          setSaved]          = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [health,         setHealth]         = useState(null)
  const [healthLoading,  setHealthLoading]  = useState(false)
  const [healthError,    setHealthError]    = useState('')

  useEffect(() => {
    setRestaurantName(settings.restaurantName)
    setServiceRate(settings.serviceRate)
    setTouristServiceRate(settings.touristServiceRate)
    setMonthlyRentUzs(String(settings.monthlyRentUzs || ''))
    setMonthlyUtilitiesUzs(String(settings.monthlyUtilitiesUzs || ''))
    setAverageDailyEmployeeMealUzs(String(settings.averageDailyEmployeeMealUzs || ''))
    setAverageDailyBreakEvenIncomeUzs(String(settings.averageDailyBreakEvenIncomeUzs || ''))
    setAutoPrint(settings.autoPrint)
    setAutoPrintKitchenCheck(!!settings.autoPrintKitchenCheck)
    setTouristMenuEnabled(settings.touristMenuEnabled !== false)
    setPublicTouristPrices(settings.publicTouristPrices === true)
    setReceiptMarketing(settings.receiptMarketing || 'compactFooter')
  }, [settings.restaurantName, settings.serviceRate, settings.touristServiceRate, settings.monthlyRentUzs, settings.monthlyUtilitiesUzs, settings.averageDailyEmployeeMealUzs, settings.averageDailyBreakEvenIncomeUzs, settings.autoPrint, settings.autoPrintKitchenCheck, settings.touristMenuEnabled, settings.publicTouristPrices, settings.receiptMarketing])


  async function saveSettings(overrides = {}) {
    if (!canManageSettings) return { error: new Error('Settings write access is required') }
    setSaving(true)
    setError('')
    const nextSettings = {
      restaurantName,
      serviceRate,
      touristServiceRate,
      monthlyRentUzs: Number(normalizeMoneyInput(monthlyRentUzs) || 0),
      monthlyUtilitiesUzs: Number(normalizeMoneyInput(monthlyUtilitiesUzs) || 0),
      averageDailyEmployeeMealUzs: Number(normalizeMoneyInput(averageDailyEmployeeMealUzs) || 0),
      averageDailyBreakEvenIncomeUzs: Number(normalizeMoneyInput(averageDailyBreakEvenIncomeUzs) || 0),
      autoPrint,
      autoPrintKitchenCheck,
      touristMenuEnabled,
      publicTouristPrices,
      receiptMarketing,
      ...overrides,
    }
    const result = await dispatch({
      type: 'SET_SETTINGS',
      payload: nextSettings,
    })
    setSaving(false)
    if (result?.error) {
      setError(result.error.message || 'Failed to save settings')
      return result
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    return result
  }

  // Save stays disabled until a saved setting differs (the sound toggle is device-local and never saved).
  const moneyChanged = (value, saved) => Number(normalizeMoneyInput(value) || 0) !== Number(saved || 0)
  const hasChanges = restaurantName !== settings.restaurantName
    || serviceRate !== settings.serviceRate
    || touristServiceRate !== settings.touristServiceRate
    || moneyChanged(monthlyRentUzs, settings.monthlyRentUzs)
    || moneyChanged(monthlyUtilitiesUzs, settings.monthlyUtilitiesUzs)
    || moneyChanged(averageDailyEmployeeMealUzs, settings.averageDailyEmployeeMealUzs)
    || moneyChanged(averageDailyBreakEvenIncomeUzs, settings.averageDailyBreakEvenIncomeUzs)
    || autoPrint !== settings.autoPrint
    || autoPrintKitchenCheck !== !!settings.autoPrintKitchenCheck
    || touristMenuEnabled !== (settings.touristMenuEnabled !== false)
    || publicTouristPrices !== (settings.publicTouristPrices === true)
    || receiptMarketing !== (settings.receiptMarketing || 'compactFooter')

  async function handleSave() {
    await saveSettings()
  }

  async function handleAutoPrintChange(nextValue) {
    if (!canManageSettings || saving) return
    setAutoPrint(nextValue)
    const result = await saveSettings({ autoPrint: nextValue })
    if (result?.error) setAutoPrint(!!settings.autoPrint)
  }

  async function handleTouristMenuChange(nextValue) {
    if (!canManageSettings || saving) return
    setTouristMenuEnabled(nextValue)
    const result = await saveSettings({ touristMenuEnabled: nextValue })
    if (result?.error) setTouristMenuEnabled(settings.touristMenuEnabled !== false)
  }

  async function handlePublicTouristPricesChange(nextValue) {
    if (!canManageSettings || saving) return
    setPublicTouristPrices(nextValue)
    const result = await saveSettings({ publicTouristPrices: nextValue })
    if (result?.error) setPublicTouristPrices(settings.publicTouristPrices === true)
  }

  async function handleServiceRateChange(nextRate) {
    if (!canManageSettings) return
    setServiceRate(nextRate)
    await saveSettings({ serviceRate: nextRate })
  }

  async function handleTouristServiceRateChange(nextRate) {
    if (!canManageSettings) return
    setTouristServiceRate(nextRate)
    await saveSettings({ touristServiceRate: nextRate })
  }

  async function checkHealth() {
    setHealthLoading(true)
    setHealthError('')
    try {
      setHealth(await runDbHealthChecks())
    } catch (err) {
      setHealthError(err.message || 'Could not check system health')
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
      averageDailyBreakEvenIncomeSub: 'Dashboard grafigidagi qizil nuqtali chiziq uchun kunlik maqsad',
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
      notifications:   'Bildirishnomalar',
      notifSub:        'Yangi buyurtmalar uchun ovozli signal',
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
      saving:          'Saqlanmoqda...',
      saved:           'Saqlandi!',
      saveError:       'Sozlamalarni saqlab bo‘lmadi',
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
      averageDailyBreakEvenIncomeSub: 'Дневная цель для красной пунктирной линии на графике Dashboard',
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
      notifications:   'Уведомления',
      notifSub:        'Звук при новых заказах',
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
      saving:          'Сохранение...',
      saved:           'Сохранено!',
      saveError:       'Не удалось сохранить настройки',
    },
    en: {
      title:           'Settings',
      sub:             'Restaurant configuration',
      restaurant:      'Restaurant Details',
      restaurantName:  'Restaurant Name',
      restaurantNameSub: 'Shown on receipts and reports',
      billing:         'Billing',
      serviceCharge:   'Regular Service Charge',
      serviceChargeSub: 'Added to Regular dine-in orders',
      touristMenu: 'Tourist menu',
      touristMenuSub: 'When off, tables open straight to Regular prices and the premium menu shows the regular menu',
      publicTouristPrices: 'Tourist prices on zarkebab.uz',
      publicTouristPricesSub: 'When on, the public menu shows Tourist prices. With the Tourist menu off it always shows Regular prices',
      touristServiceCharge: 'Tourist Service Charge',
      touristServiceChargeSub: 'Added to Tourist dine-in orders',
      monthlyRent:     'Monthly rent',
      monthlyRentSub:  'Shown in accounting estimate as UZS',
      monthlyUtilities: 'Monthly utilities bill',
      monthlyUtilitiesSub: 'Included in the monthly accounting estimate',
      averageDailyEmployeeMeal: 'Avg employees meal',
      averageDailyEmployeeMealSub: 'Average daily cost for each employee who is present',
      averageDailyBreakEvenIncome: 'Average daily break-even income',
      averageDailyBreakEvenIncomeSub: 'Daily target used by the red dotted line on the Dashboard chart',
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
      notifications:   'Notifications',
      notifSub:        'Sound alert for new orders',
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
        migration_definitions: 'Migrations: functions & triggers',
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
      save:            'Save Changes',
      saving:          'Saving...',
      saved:           'Saved!',
      saveError:       'Could not save settings',
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
                  className="ws-input !w-full sm:!w-[220px] sm:text-right disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]"
                />
              </SettingRow>
              </Section>
            )}

            {(
              <Section title={nav.sections.billing}>
              <SettingRow icon={Percent} label={l.serviceCharge} sub={l.serviceChargeSub}>
                <div className="ws-segmented flex w-full sm:inline-flex sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" role="group" aria-label={l.serviceCharge}>
                  {[0, 10, 15, 20].map(v => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={serviceRate === v}
                      onClick={() => handleServiceRateChange(v)}
                      disabled={!canManageSettings}
                      className="!px-3 tabular-nums disabled:cursor-not-allowed"
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow icon={Globe} label={l.touristMenu} sub={l.touristMenuSub} compact>
                <Toggle value={touristMenuEnabled} onChange={handleTouristMenuChange} disabled={!canManageSettings || saving} />
              </SettingRow>
              <SettingRow icon={Globe} label={l.publicTouristPrices} sub={l.publicTouristPricesSub} compact>
                <Toggle value={touristMenuEnabled && publicTouristPrices} onChange={handlePublicTouristPricesChange} disabled={!canManageSettings || saving || !touristMenuEnabled} />
              </SettingRow>
              <SettingRow icon={Percent} label={l.touristServiceCharge} sub={l.touristServiceChargeSub}>
                <div className="ws-segmented flex w-full sm:inline-flex sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" role="group" aria-label={l.touristServiceCharge}>
                  {[0, 10, 15, 20].map(v => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={touristServiceRate === v}
                      onClick={() => handleTouristServiceRateChange(v)}
                      disabled={!canManageSettings}
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
                    className="ws-input !w-full sm:!w-[220px] !pr-12 text-right font-medium tabular-nums disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]"
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#68655f]">UZS</span>
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
                    className="ws-input !w-full sm:!w-[220px] !pr-12 text-right font-medium tabular-nums disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]"
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#68655f]">UZS</span>
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
                    className="ws-input !w-full sm:!w-[220px] !pr-12 text-right font-medium tabular-nums disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]"
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#68655f]">UZS</span>
                </div>
              </SettingRow>
              <SettingRow icon={BadgeDollarSign} label={l.averageDailyBreakEvenIncome} sub={l.averageDailyBreakEvenIncomeSub}>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setTargetHistoryOpen(true)} className="ws-btn ws-btn-outline flex-shrink-0">
                    <History size={15} />
                    {l.targetHistory}
                  </button>
                  <div className="relative min-w-0 flex-1 sm:flex-none">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatMoneyInput(averageDailyBreakEvenIncomeUzs)}
                      onChange={event => setAverageDailyBreakEvenIncomeUzs(normalizeMoneyInput(event.target.value))}
                      disabled={!canManageSettings}
                      className="ws-input !w-full sm:!w-[220px] !pr-12 text-right font-medium tabular-nums disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]"
                      placeholder="0"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#68655f]">UZS</span>
                  </div>
                </div>
                {targetHistoryOpen && <BreakEvenTargetHistoryDialog lang={lang} onClose={() => setTargetHistoryOpen(false)} />}
              </SettingRow>
              </Section>
            )}

            <h2 className="ws-heading mt-4">{nav.groups.workspace}</h2>

            {(
              <>
                <Section title={nav.cards.language}>
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
                </Section>
                <Section title={nav.cards.appearance}>
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
                <Section title={nav.cards.notifications}>
                <SettingRow icon={Bell} label={l.notifications} sub={l.notifSub} compact>
                  <Toggle value={notifications} onChange={setNotifications} disabled={!canManageSettings} />
                </SettingRow>
                </Section>
              </>
            )}

            {(
              <Section title={nav.sections.printing}>
              <SettingRow icon={Printer} label={l.autoPrint} sub={l.autoPrintSub} compact>
                <Toggle value={autoPrint} onChange={handleAutoPrintChange} disabled={!canManageSettings || saving} />
              </SettingRow>
              <SettingRow icon={ChefHat} label={l.autoPrintKitchenCheck} sub={l.autoPrintKitchenCheckSub} compact>
                <Toggle value={autoPrintKitchenCheck} onChange={setAutoPrintKitchenCheck} disabled={!canManageSettings} />
              </SettingRow>
              <SettingRow icon={Printer} label={l.receiptMarketing} sub={l.receiptMarketingSub}>
                <select
                  value={receiptMarketing}
                  onChange={event => setReceiptMarketing(event.target.value)}
                  disabled={!canManageSettings}
                  className="ws-input !w-full sm:!w-[220px] disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]"
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
                  onClick={() => navigate('/admin/tables')}
                  className="ws-btn ws-btn-outline ws-btn-sm"
                >
                  {l.open}
                  <ChevronRight size={14} />
                </button>
              </SettingRow>
              </Section>
            )}

            {(
              <Section title={l.systemHealth}>
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
                      <Activity size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#22201d]">{l.systemHealth}</p>
                      <p className="ws-caption mt-0.5">{l.systemHealthSub}</p>
                    </div>
                  </div>
                  <button
                    onClick={checkHealth}
                    disabled={healthLoading}
                    className="ws-btn ws-btn-outline ws-btn-sm"
                  >
                    <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
                    {l.runHealth}
                  </button>
                </div>

                {healthError && (
                  <p className="ws-notice ws-tone-negative mt-3">
                    {healthError}
                  </p>
                )}

                {health && (
                  <div className="mt-4 rounded-xl border border-[#e4e1de] bg-[#f6f5f3] p-3">
                    <div className={`ws-badge mb-3 !text-[13px] ${health.ok ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
                      {health.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
                      {health.ok ? l.healthy : l.unhealthy}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[...health.checks].sort((a, b) => a.ok - b.ok).map(check => (
                        <div key={`${check.type}-${check.name}`} className={`rounded-lg border border-[#e4e1de] bg-white px-3 py-2 text-[13px] ${check.items?.length ? 'sm:col-span-2' : ''}`}>
                          <p className="font-semibold text-[#22201d]">{healthCheckName(check, l)}</p>
                          <p className={check.ok ? 'text-[#1d7a52]' : 'text-[#c4262c]'}>{healthMessage(check, l)}</p>
                          {!check.ok && check.items?.length > 0 && (
                            <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-[#c4262c]">
                              {check.items.map(item => <li key={item} className="break-all">{item}</li>)}
                            </ul>
                          )}
                          {!check.ok && healthHint(check) && (
                            <p className="mt-1 font-mono text-[11px] text-[#68655f]">{healthHint(check)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </Section>
            )}

            {(
              <>
            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !canManageSettings || (!hasChanges && !saved)}
              className={`ws-btn ws-btn-primary !h-11 w-full ${saved ? '!bg-[#1d7a52]' : ''}`}
            >
              {saved ? <Check size={16} /> : <Shield size={16} />}
              {saved ? l.saved : saving ? l.saving : l.save}
            </button>
            {error && (
              <p className="ws-notice ws-tone-negative">
                {l.saveError}: {error}
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
