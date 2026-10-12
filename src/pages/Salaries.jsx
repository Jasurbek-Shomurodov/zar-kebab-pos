import CalendarPicker from '../components/CalendarPicker'
import TimePicker24 from '../components/TimePicker24'
import { EMPLOYEE_JOB_FUNCTIONS, employeeJobFunctionLabel } from '../lib/employeeJobFunctions'
import React, { useEffect, useMemo, useState } from 'react'
import { BadgeMinus, CalendarX2, ChevronLeft, ChevronRight, Copy, Loader2, Percent, Plus, Save, Send, Trash2, Users, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { loadSalaryRows } from '../lib/salaryData'
import { formatCurrency } from '../lib/formatCurrency'
import { formatDateTime, formatLongDate } from '../lib/dateFormat'
import {
  calculateDailyKpiBonus,
  formatKpiRateInput,
  formatKpiRatePercent,
  formatKpiSalesBasis,
  normalizeKpiStartTime,
  formatKpiStartTime,
  getEffectiveKpiRule,
  getKpiAccountLinks,
  getKpiAccountConflicts,
  getActiveKpiAccounts,
  getKpiRuleEditDate,
  removeKpiRulePreservingHistory,
  parseKpiPercentToBps,
} from '../lib/dailyKpi'
import { canEditFeature } from '../lib/permissions'
import {
  EXPENSE_PAYMENT_METHODS,
  SALARY_RATE_UNITS,
  buildSalaryReactivationAbsenceRows,
  canRecordSalaryTransaction,
  convertSalaryAmountToDaily,
  expensePaymentMethodLabel,
  getSalaryAbsenceDates,
  getExpenseEntryMinDate,
  isExpenseEntryDateAllowed,
  getSalaryBalance,
  getSalaryDue,
  getTotalSalaryDue,
  getTotalMonthlySalaryCommitment,
  normalizeExpenseAmount,
} from '../lib/expenses'
import { todayExpenseDate } from '../lib/expenses'
import {
  notifyTelegramEmployeeAbsence,
  notifyTelegramEmployeeBonus,
  notifyTelegramEmployeeFine,
  notifyTelegramEmployeeLifecycle,
  notifyTelegramEmployeePayment,
  notifyTelegramEmployeeRate,
  retractTelegramSalaryEvent,
  notifyTelegramKpiRuleChange,
} from '../lib/telegramNotifications'

const FIELD = 'ws-input !h-11 min-w-0 max-w-full font-medium disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]'
const PAGE_SIZE = 12
const TELEGRAM_DELIVERY_PAGE_SIZE = 5
const KPI_PREVIEW_BASE_AMOUNT = 10_000_000

function isMissingSalaryMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('employee_salary') && (
    text.includes('does not exist') ||
    text.includes('could not find the') ||
    text.includes('column') ||
    text.includes('amount') ||
    text.includes('schema cache') ||
    text.includes('42p01')
  )
}

function isMissingKpiMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (text.includes('employee_kpi_rules') || text.includes('employee_daily_kpi_results')) && (
    text.includes('does not exist') ||
    text.includes('could not find the') ||
    text.includes('schema cache') ||
    text.includes('42p01')
  )
}

function composeSalaryProfiles(rows = [], rates = [], payments = [], bonuses = [], fines = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates
      .filter(rate => rate.salary_profile_id === row.id)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    payments: payments
      .filter(payment => payment.salary_profile_id === row.id)
      .sort((a, b) => b.paid_date.localeCompare(a.paid_date)),
    bonuses: bonuses
      .filter(bonus => bonus.salary_profile_id === row.id)
      .sort((a, b) => b.bonus_date.localeCompare(a.bonus_date)),
    fines: fines
      .filter(fine => fine.salary_profile_id === row.id)
      .sort((a, b) => b.fine_date.localeCompare(a.fine_date)),
    absences: absences
      .filter(absence => absence.salary_profile_id === row.id)
      .sort((a, b) => b.absence_date.localeCompare(a.absence_date)),
  }))
}

function salaryRateUnitLabel(key, lang) {
  const labels = {
    daily: { uz: 'Kunlik', ru: 'Дневная', en: 'Daily' },
    monthly: { uz: 'Oylik', ru: 'Месячная', en: 'Monthly' },
  }
  return labels[key]?.[lang] || labels[key]?.en || key
}

function formatAmountInput(value) {
  const digits = String(value || '').replace(/\D+/g, '')
  if (!digits) return ''
  return new Intl.NumberFormat('uz-UZ').format(Number(digits))
}

function parseAmountInput(value) {
  return String(value || '').replace(/\D+/g, '')
}

function buildSalaryRatePayload({ salaryProfileId, effectiveFrom, amount, salaryUnit, note = '', createdBy = null }) {
  return {
    salary_profile_id: salaryProfileId,
    effective_from: effectiveFrom,
    amount,
    rate_unit: salaryUnit,
    daily_amount: convertSalaryAmountToDaily(amount, salaryUnit),
    note,
    created_by: createdBy,
  }
}

export default function Salaries() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const role = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const canManage = canEditFeature(profile || { role }, 'expenses')
  const canRemoveKpiRules = role === 'owner'
  const today = todayExpenseDate()
  const minimumSalaryDate = getExpenseEntryMinDate(today)

  const L = {
    uz: {
      title: 'Maoshlar',
      sub: 'Ishga kirgan sana, maosh va to‘lanishi kerak summa',
      back: 'Buxgalteriyaga qaytish',
      loadingTitle: 'Maosh ma’lumotlari yuklanmoqda',
      loadingDescription: 'Xodimlar, operatsiyalar va qoldiqlar tayyorlanmoqda.',
      add: 'Yangi xodim',
      jobFunction: 'Lavozim',
      selectJobFunction: 'Lavozimni tanlang',
      employee: 'Xodim',
      employeeName: 'Xodim ismi',
      joined: 'Ishga kirgan sana',
      effectiveDate: 'Qachondan',
      salaryDateLimit: 'Ish haqi sanasi bugundan uch kundan ortiq oldin bo‘lishi mumkin emas.',
      salaryAmount: 'Maosh summasi',
      salaryUnit: 'Maosh turi',
      method: 'To‘lov turi',
      save: 'Saqlash',
      delete: 'O‘chirish',
      remove: 'Butunlay o‘chirish',
      confirmDelete: 'Tasdiqlash',
      changeSalary: 'Maoshni o‘zgartirish',
      selectEmployee: 'Xodimni tanlang',
      recordPayment: 'To‘lovni yozish',
      paymentBonus: 'To‘lov / bonus / jarima / yo‘qlama',
      paymentEntry: 'To‘lov',
      bonusEntry: 'Bonus',
      fineEntry: 'Jarima',
      bonus: 'Bonus',
      addBonus: 'Bonus qo‘shish',
      addFine: 'Jarima yozish',
      paidDate: 'To‘lov sanasi',
      bonusDate: 'Bonus sanasi',
      fineDate: 'Jarima sanasi',
      bonusComment: 'Bonus izohi',
      bonusCommentPlaceholder: 'Bonus sababini yoki izohni kiriting (ixtiyoriy)',
      fineReason: 'Jarima sababi',
      absence: 'Kelmagan kun',
      markAbsence: 'Kelmagan kunni belgilash',
      absenceDate: 'Kelmagan sana',
      absenceHistory: 'Kelmagan kunlar',
      absentLabel: 'Kelmagan',
      amount: 'Summa',
      balance: 'Maosh balansi',
      due: 'To‘lanishi kerak',
      totalDue: 'Jami qarzdorlik',
      totalDueHelp: 'Bugungacha hisoblangan, hali to‘lanmagan maosh va bonuslar, jarimalar chegirilgan.',
      monthlyPayroll: 'Oylik maoshlar',
      monthlyPayrollHelp: 'Faol xodimlarning shu oy uchun hisoblangan maoshi. Bonus va jarimalarsiz.',
      employees: 'Xodimlar',
      openEmployees: 'Xodimlar ro‘yxatini ochish',
      quickActions: 'Kundalik operatsiyalar',
      quickActionsHelp: 'To‘lov, bonus, jarima yoki kelmagan kunni bir joyda yozing.',
      salarySettings: 'Maosh sozlamalari',
      salarySettingsHelp: 'Yangi xodim uchun maosh belgilang yoki amaldagi stavkani o‘zgartiring.',
      addHelp: 'Yangi xodim va uning boshlang‘ich maoshini kiriting.',
      changeHelp: 'Yangi stavka va u amal qiladigan sanani belgilang.',
      transactionHelp: 'Operatsiya turini tanlang, keyin xodim va summani kiriting.',
      paymentHelp: 'To‘lov xodimga bo‘lgan qarzni kamaytiradi.',
      bonusHelp: 'Bonus maosh balansiga qo‘shiladi va maosh to‘lovi yozilganda to‘lanadi.',
      fineHelp: 'Jarima maosh qarzini kamaytiradi, lekin kassa xarajati hisoblanmaydi.',
      absenceHelp: 'Tanlangan sana uchun ishga kelmagan xodimni belgilang.',
      absenceDuplicate: 'Bu xodimning tanlangan sanadagi yo‘qligi allaqachon belgilangan.',
      createdMessage: 'Xodim maoshi qo‘shildi',
      lifecycleTelegramFailed: 'Xodim o‘zgarishi saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
      rateSavedMessage: 'Yangi maosh stavkasi saqlandi',
      rateTelegramFailed: 'Maosh stavkasi saqlandi, lekin Telegram xabarlari yuborilmadi. 116-migratsiya va yetkazib berish holatini tekshiring.',
      transactionSavedMessage: 'Operatsiya saqlandi',
      paymentTelegramFailed: 'To‘lov saqlandi, lekin Telegram xabarlari yuborilmadi.',
      transactionTelegramFailed: 'Operatsiya saqlandi, lekin Telegram xabarlari yuborilmadi.',
      transactionTelegramPartial: 'Operatsiya saqlandi. Telegram xabarlaridan biri yuborilmadi; holatni pastda tekshiring.',
      absenceSavedMessage: 'Kelmagan kun saqlandi',
      accruedToday: 'Bugungi xarajat',
      history: 'Maosh tarixi',
      historyBtn: 'Tarix',
      payments: 'To‘lovlar',
      paymentHistory: 'To‘lovlar / bonuslar / jarimalar',
      paymentLabel: 'To‘lov',
      bonusLabel: 'Bonus',
      fineLabel: 'Jarima',
      active: 'Faol',
      inactive: 'Nofaol',
      deactivate: 'Faolsizlantirish',
      reactivate: 'Qayta yoqish',
      page: 'Sahifa',
      empty: 'Maosh sozlamalari yo‘q',
      migration: 'Maosh jadvallari yangilanmagan. 054–063, 099 va 169 maosh migratsiyalarini ishga tushiring.',
      readOnly: 'Bu sahifa faqat egasi uchun.',
      kpiTitle: 'Kunlik KPI bonuslari',
      kpiStartTime: 'KPI boshlanish vaqti (Toshkent)',
      kpiHour: 'Soat',
      kpiMinute: 'Daqiqa',
      kpiTimeDone: 'Tayyor',
      kpiCalculationHelp: 'KPI qanday hisoblanadi?',
      kpiStartHelp: 'Faqat shu vaqtdan boshlab ochilgan va o‘sha kuni yarim tungacha to‘langan buyurtmalar hisoblanadi. Mijoz kelgan vaqt — buyurtma ochilgan vaqt.',
      kpiStartRequired: 'KPI boshlanish vaqtini kiriting.',
      kpiHelp: "Har bir xodim uchun o‘z buyurtmalari yoki zaldagi barcha savdolardan KPI belgilang.",
      kpiBasis: "Hisoblash asosi",
      kpiOwnOrders: "O‘zi ochgan buyurtmalar",
      kpiAllDineIn: "Zaldagi barcha to‘langan buyurtmalar",
      kpiAccount: "Xodimning kassadagi akkaunti",
      kpiSelectAccount: "Faol xodim akkauntini tanlang",
      kpiAccountRequired: "O‘z buyurtmalari uchun Faol xodim akkauntini tanlang.",
      kpiAccountTaken: "Bu akkaunt allaqachon boshqa xodimga bog‘langan. Bitta akkaunt faqat bitta xodimga KPI beradi:",
      kpiAccountHelp: "Buyurtmalarni ochadigan faol akkauntni tanlang. Bog‘lanish KPI sozlamasi bilan saqlanadi.",
      kpiAccountNotNeeded: "Zaldagi barcha savdolar uchun akkaunt tanlash shart emas.",
      kpiAccountsEmpty: "Faol xodim akkauntlari topilmadi.",
      kpiAccountsFailed: "Akkauntlarni yuklab bo‘lmadi.",
      kpiAccountsRetry: "Qayta yuklash",
      kpiAccountUnavailable: "Tanlangan akkaunt faol emas yoki mavjud emas.",
      kpiAccountLinkedHere: "shu xodimga bog‘langan",
      kpiAccountLinkedTo: "bog‘langan:",
      kpiRuleTitle: 'Xodim KPI foizi',
      kpiRuleHelp: 'Yangi sana yangi sozlama yaratadi. Hali hisoblanmagan sanani qayta saqlab tuzatish mumkin.',
      kpiRate: 'KPI foizi',
      kpiEnabled: 'KPI faol',
      kpiDisabled: 'KPI o‘chirilgan',
      kpiSave: 'KPI sozlamasini saqlash',
      kpiSaved: 'KPI sozlamasi saqlandi',
      kpiTelegramFailed: 'KPI sozlamasi saqlandi, lekin Maosh guruhiga Telegram xabari yuborilmadi. 170-migratsiya va yetkazib berish holatini tekshiring.',
      kpiChangeLabel: 'KPI o‘zgarishi',
      kpiRemove: 'KPI sozlamasini olib tashlash',
      kpiRemoveTitle: 'KPI sozlamasini olib tashlaysizmi?',
      kpiRemoveFrom: 'KPI’ni o‘chirish sanasi',
      kpiRemoveWarning: 'Tanlangan sanadan oldingi sozlamalar, yakunlangan hisob-kitoblar va hisoblangan bonuslar o‘zgarmaydi. KPI faqat tanlangan sanadan boshlab o‘chiriladi.',
      kpiRemoveConfirm: 'Olib tashlash',
      kpiRemoveCancel: 'Bekor qilish',
      kpiRemoved: 'KPI sozlamasi olib tashlandi',
      kpiStopped: 'KPI tanlangan sanadan boshlab o‘chirildi. Oldingi ma’lumotlar saqlandi.',
      kpiRemoveOwnerOnly: 'KPI sozlamasini faqat egasi olib tashlashi mumkin.',
      kpiRemoveFailed: 'KPI sozlamasini olib tashlab bo‘lmadi.',
      kpiPreview: 'Hisoblash namunasi',
      kpiBaseStatement: "Hisoblash asosi: tanlangan buyurtmalardagi taom va ichimliklar summasi hamda xizmat haqi. Faqat zalda xizmat ko‘rsatilgan, shu kuni to‘langan buyurtmalar hisobga olinadi. Xostes va menejer uchun zaldagi barcha savdolarni tanlash mumkin. 16.09.2026 dan oldingi hisoblar o‘zgarmaydi.",
      kpiAccruesToSalary: 'Natija Bonus sifatida maosh balansiga qo‘shiladi va keyingi maosh to‘lovi bilan yopiladi. Xodim uni kunlik xabarda, Maosh guruhi umumiy hisobotda ko‘radi; ZarKebab Team alohida xabardor qilinadi.',
      kpiMigration: 'Kunlik KPI va guruh xabarlari uchun 129, 169 va 170, 196, 203-migratsiyalarni ishga tushiring.',
      kpiLoadFailed: 'KPI ma’lumotlarini yuklab bo‘lmadi.',
      telegramTitle: 'Telegram xabarnomalari',
      telegramHelp: 'Xodimga 30 daqiqada muddati tugaydigan shaxsiy ulanish havolasini yuboring.',
      telegramCreateLink: 'Ulanish havolasini yaratish',
      telegramCopy: 'Nusxalash',
      telegramCopied: 'Telegram havolasi nusxalandi',
      telegramLinked: 'Telegram ulangan',
      telegramBotMissing: 'VITE_TELEGRAM_BOT_USERNAME sozlanmagan.',
      telegramDeliveryTitle: 'Maosh xabarlari holati',
      telegramDeliveryHelp: 'Maosh xabarlari va KPI sozlamasi o‘zgarishlarining Maosh guruhiga yetkazilishini kuzating.',
      telegramDeliveryEmpty: 'Hali Telegram xabarlari yo‘q.',
      telegramDeliveryMigration: 'Telegram xabarlari tarixi uchun 108, 110, 111, 112, 113, 116, 119 va 170-migratsiyalarni ishga tushiring.',
      telegramEmployee: 'Xodim',
      telegramSalaryGroup: 'Maosh guruhi',
      telegramTeam: 'ZarKebab Team',
      telegramRetry: 'Qayta yuborish',
      telegramRetrySent: 'Telegram xabarlari yuborildi.',
      telegramRetryPartial: 'Telegram xabarlaridan biri yuborilmadi; holatni tekshiring.',
      telegramRetryFailed: 'Telegram xabarlari yuborilmadi.',
      telegramStatusPending: 'Kutilmoqda',
      telegramStatusNotAttempted: 'Urinilmagan',
      telegramStatusSent: 'Yuborildi',
      telegramStatusFailed: 'Xato',
      telegramStatusSkipped: 'O‘tkazib yuborildi',
      telegramStatusConfirmed: 'Qabul qilindi',
      telegramKpiCombined: 'KPI bonusi kunlik maosh xabariga qo‘shildi.',
      telegramMessageId: 'Xabar',
      previous: 'Oldingi',
      next: 'Keyingi',
      of: '/',
    },
    ru: {
      title: 'Зарплаты',
      sub: 'Дата выхода, зарплата и сумма к выплате',
      back: 'Назад к бухгалтерии',
      loadingTitle: 'Загрузка данных о зарплатах',
      loadingDescription: 'Подготавливаем сотрудников, операции и остатки.',
      add: 'Новый сотрудник',
      jobFunction: 'Должность',
      selectJobFunction: 'Выберите должность',
      employee: 'Сотрудник',
      employeeName: 'Имя сотрудника',
      joined: 'Дата выхода',
      effectiveDate: 'Действует с',
      salaryDateLimit: 'Дата зарплаты не может быть раньше, чем три дня назад.',
      salaryAmount: 'Сумма зарплаты',
      salaryUnit: 'Тип зарплаты',
      method: 'Способ оплаты',
      save: 'Сохранить',
      delete: 'Удалить',
      remove: 'Удалить полностью',
      confirmDelete: 'Подтвердить',
      changeSalary: 'Изменить зарплату',
      selectEmployee: 'Выберите сотрудника',
      recordPayment: 'Записать выплату',
      paymentBonus: 'Выплата / бонус / штраф / отсутствие',
      paymentEntry: 'Выплата',
      bonusEntry: 'Бонус',
      fineEntry: 'Штраф',
      bonus: 'Бонус',
      addBonus: 'Добавить бонус',
      addFine: 'Записать штраф',
      paidDate: 'Дата выплаты',
      bonusDate: 'Дата бонуса',
      fineDate: 'Дата штрафа',
      bonusComment: 'Комментарий к бонусу',
      bonusCommentPlaceholder: 'Укажите причину или комментарий (необязательно)',
      fineReason: 'Причина штрафа',
      absence: 'Отсутствие',
      markAbsence: 'Отметить отсутствие',
      absenceDate: 'Дата отсутствия',
      absenceHistory: 'Дни отсутствия',
      absentLabel: 'Отсутствовал',
      amount: 'Сумма',
      balance: 'Баланс зарплаты',
      due: 'К выплате',
      totalDue: 'Общий долг',
      totalDueHelp: 'Начисленные на сегодня, но ещё не выплаченные зарплаты и бонусы, за вычетом штрафов.',
      monthlyPayroll: 'Зарплаты в месяц',
      monthlyPayrollHelp: 'Расчёт зарплат активных сотрудников за весь текущий месяц. Без бонусов и штрафов.',
      employees: 'Сотрудники',
      openEmployees: 'Открыть список сотрудников',
      quickActions: 'Ежедневные операции',
      quickActionsHelp: 'Записывайте выплаты, бонусы, штрафы и отсутствия в одном месте.',
      salarySettings: 'Настройка зарплат',
      salarySettingsHelp: 'Назначьте зарплату новому сотруднику или измените действующую ставку.',
      addHelp: 'Укажите нового сотрудника и его первоначальную зарплату.',
      changeHelp: 'Укажите новую ставку и дату, с которой она действует.',
      transactionHelp: 'Сначала выберите тип операции, затем сотрудника и сумму.',
      paymentHelp: 'Выплата уменьшает долг перед сотрудником.',
      bonusHelp: 'Бонус добавляется к балансу зарплаты и выплачивается при регистрации выплаты зарплаты.',
      fineHelp: 'Штраф уменьшает долг по зарплате, но не считается расходом кассы.',
      absenceHelp: 'Отметьте сотрудника, который отсутствовал в выбранную дату.',
      absenceDuplicate: 'Отсутствие этого сотрудника на выбранную дату уже отмечено.',
      createdMessage: 'Зарплата сотрудника добавлена',
      lifecycleTelegramFailed: 'Изменение сотрудника сохранено, но сообщение в группу ZarKebab Investor не отправлено.',
      rateSavedMessage: 'Новая ставка зарплаты сохранена',
      rateTelegramFailed: 'Ставка зарплаты сохранена, но сообщения в Telegram не отправлены. Проверьте миграцию 116 и статус доставки.',
      transactionSavedMessage: 'Операция сохранена',
      paymentTelegramFailed: 'Выплата сохранена, но сообщения в Telegram не отправлены.',
      transactionTelegramFailed: 'Операция сохранена, но сообщения в Telegram не отправлены.',
      transactionTelegramPartial: 'Операция сохранена. Одно из сообщений Telegram не отправлено; проверьте статус ниже.',
      absenceSavedMessage: 'Отсутствие сохранено',
      accruedToday: 'Расход за день',
      history: 'История зарплаты',
      historyBtn: 'История',
      payments: 'Выплаты',
      paymentHistory: 'Выплаты / бонусы / штрафы',
      paymentLabel: 'Выплата',
      bonusLabel: 'Бонус',
      fineLabel: 'Штраф',
      active: 'Активен',
      inactive: 'Неактивен',
      deactivate: 'Деактивировать',
      reactivate: 'Включить снова',
      page: 'Страница',
      empty: 'Настроек зарплаты пока нет',
      migration: 'Таблицы зарплат не обновлены. Запустите миграции зарплат 054–063, 099 и 169.',
      readOnly: 'Эта страница доступна только владельцу.',
      kpiTitle: 'Ежедневные KPI-бонусы',
      kpiStartTime: 'Начало KPI (Ташкент)',
      kpiHour: 'Часы',
      kpiMinute: 'Минуты',
      kpiTimeDone: 'Готово',
      kpiCalculationHelp: 'Как рассчитывается KPI?',
      kpiStartHelp: 'Учитываются заказы, открытые с этого времени и оплаченные в тот же день до полуночи. Время прихода гостя — время открытия заказа.',
      kpiStartRequired: 'Укажите время начала KPI.',
      kpiHelp: "Для каждого сотрудника выберите KPI от своих заказов или всех продаж в зале.",
      kpiBasis: "База расчёта",
      kpiOwnOrders: "Свои открытые заказы",
      kpiAllDineIn: "Все оплаченные заказы в зале",
      kpiAccount: "Учётная запись сотрудника",
      kpiSelectAccount: "Выберите активного сотрудника",
      kpiAccountRequired: "Для расчёта по своим заказам выберите учётную запись сотрудника.",
      kpiAccountTaken: "Эта учётная запись уже привязана к другому сотруднику. Одна запись начисляет KPI только одному сотруднику:",
      kpiAccountHelp: "Выберите активную учётную запись, под которой сотрудник открывает заказы. Привязка сохранится вместе с настройкой KPI.",
      kpiAccountNotNeeded: "Для всех продаж в зале привязка к учётной записи не нужна.",
      kpiAccountsEmpty: "Нет активных учётных записей сотрудников.",
      kpiAccountsFailed: "Не удалось загрузить учётные записи.",
      kpiAccountsRetry: "Повторить",
      kpiAccountUnavailable: "Выбранная учётная запись неактивна или недоступна.",
      kpiAccountLinkedHere: "привязана к этому сотруднику",
      kpiAccountLinkedTo: "привязана:",
      kpiRuleTitle: 'KPI-процент сотрудника',
      kpiRuleHelp: 'Новая дата создаёт новую настройку. Настройку ещё не рассчитанного дня можно исправить той же датой.',
      kpiRate: 'Процент KPI',
      kpiEnabled: 'KPI включён',
      kpiDisabled: 'KPI выключен',
      kpiSave: 'Сохранить настройку KPI',
      kpiSaved: 'Настройка KPI сохранена',
      kpiTelegramFailed: 'Настройка KPI сохранена, но сообщение в группу зарплат не отправлено. Проверьте миграцию 170 и статус доставки.',
      kpiChangeLabel: 'Изменение KPI',
      kpiRemove: 'Удалить настройку KPI',
      kpiRemoveTitle: 'Удалить настройку KPI?',
      kpiRemoveFrom: 'Отключить KPI с',
      kpiRemoveWarning: 'Настройки, завершённые расчёты и начисленные бонусы до выбранной даты останутся без изменений. KPI будет отключён только с выбранной даты.',
      kpiRemoveConfirm: 'Удалить',
      kpiRemoveCancel: 'Отмена',
      kpiRemoved: 'Настройка KPI удалена',
      kpiStopped: 'KPI отключён с выбранной даты. Предыдущие данные сохранены.',
      kpiRemoveOwnerOnly: 'Удалить настройку KPI может только владелец.',
      kpiRemoveFailed: 'Не удалось удалить настройку KPI.',
      kpiPreview: 'Пример расчёта',
      kpiBaseStatement: "База расчёта — сумма блюд и напитков плюс плата за обслуживание. Учитываются только заказы в зале, оплаченные за выбранный день. Для хостес и менеджера можно выбрать все продажи в зале. Расчёты до 16.09.2026 не меняются.",
      kpiAccruesToSalary: 'Результат начисляется в баланс зарплаты как бонус и погашается следующей выплатой. Сотрудник видит его в ежедневном сообщении, группа зарплат — в общем отчёте; ZarKebab Team получает отдельное уведомление.',
      kpiMigration: 'Запустите миграции 129, 169 и 170, 196, 203 для ежедневных KPI и групповых уведомлений.',
      kpiLoadFailed: 'Не удалось загрузить данные KPI.',
      telegramTitle: 'Telegram-уведомления',
      telegramHelp: 'Отправьте сотруднику личную ссылку, которая действует 30 минут.',
      telegramCreateLink: 'Создать ссылку',
      telegramCopy: 'Копировать',
      telegramCopied: 'Ссылка Telegram скопирована',
      telegramLinked: 'Telegram подключён',
      telegramBotMissing: 'Не настроен VITE_TELEGRAM_BOT_USERNAME.',
      telegramDeliveryTitle: 'Статус уведомлений о зарплате',
      telegramDeliveryHelp: 'Проверяйте доставку сообщений о зарплате и изменениях настроек KPI в группу зарплат.',
      telegramDeliveryEmpty: 'Уведомлений Telegram пока нет.',
      telegramDeliveryMigration: 'Запустите миграции 108, 110, 111, 112, 113, 116, 119 и 170 для истории уведомлений.',
      telegramEmployee: 'Сотрудник',
      telegramSalaryGroup: 'Группа зарплат',
      telegramTeam: 'ZarKebab Team',
      telegramRetry: 'Отправить снова',
      telegramRetrySent: 'Сообщения Telegram отправлены.',
      telegramRetryPartial: 'Одно сообщение Telegram не отправлено; проверьте статус.',
      telegramRetryFailed: 'Сообщения Telegram не отправлены.',
      telegramStatusPending: 'Ожидает',
      telegramStatusNotAttempted: 'Не отправлялось',
      telegramStatusSent: 'Отправлено',
      telegramStatusFailed: 'Ошибка',
      telegramStatusSkipped: 'Пропущено',
      telegramStatusConfirmed: 'Получено',
      telegramKpiCombined: 'KPI-бонус включён в ежедневное сообщение о зарплате.',
      telegramMessageId: 'Сообщение',
      previous: 'Назад',
      next: 'Далее',
      of: 'из',
    },
    en: {
      title: 'Salaries',
      sub: 'Joining date, salary, and amount due',
      back: 'Back to accounting',
      loadingTitle: 'Loading salary data',
      loadingDescription: 'Preparing employees, operations, and balances.',
      add: 'New employee',
      jobFunction: 'Role',
      selectJobFunction: 'Select a role',
      employee: 'Employee',
      employeeName: 'Employee name',
      joined: 'Joining date',
      effectiveDate: 'Effective date',
      salaryDateLimit: 'Salary dates cannot be more than three days before today.',
      salaryAmount: 'Salary amount',
      salaryUnit: 'Salary type',
      method: 'Payment method',
      save: 'Save',
      delete: 'Delete',
      remove: 'Remove completely',
      confirmDelete: 'Confirm',
      changeSalary: 'Change salary',
      selectEmployee: 'Select employee',
      recordPayment: 'Record payment',
      paymentBonus: 'Record payment / bonus / fine / absence',
      paymentEntry: 'Payment',
      bonusEntry: 'Bonus',
      fineEntry: 'Fine',
      bonus: 'Bonus',
      addBonus: 'Add bonus',
      addFine: 'Record fine',
      paidDate: 'Paid date',
      bonusDate: 'Bonus date',
      fineDate: 'Fine date',
      bonusComment: 'Bonus comment',
      bonusCommentPlaceholder: 'Add a reason or comment (optional)',
      fineReason: 'Reason for fine',
      absence: 'Absence',
      markAbsence: 'Mark absence',
      absenceDate: 'Absent date',
      absenceHistory: 'Absent dates',
      absentLabel: 'Absent',
      amount: 'Amount',
      balance: 'Salary balance',
      due: 'Salary due',
      totalDue: 'Total due',
      totalDueHelp: 'Salary and bonuses earned through today but not yet paid, minus fines.',
      monthlyPayroll: 'Monthly salaries',
      monthlyPayrollHelp: 'Calculated salaries for active employees for the full current month. Excludes bonuses and fines.',
      employees: 'Employees',
      openEmployees: 'Open employee list',
      quickActions: 'Daily operations',
      quickActionsHelp: 'Record payments, bonuses, fines, and absences in one place.',
      salarySettings: 'Salary setup',
      salarySettingsHelp: 'Set a salary for a new employee or change an active rate.',
      addHelp: 'Enter a new employee and their starting salary.',
      changeHelp: 'Set the new rate and the date it takes effect.',
      transactionHelp: 'Choose an operation first, then select the employee and amount.',
      paymentHelp: 'A payment reduces the amount owed to the employee.',
      bonusHelp: 'A bonus is added to salary balance and paid when a salary payment is recorded.',
      fineHelp: 'A fine reduces payroll liability but is not a cash expense.',
      absenceHelp: 'Mark the employee who was absent on the selected date.',
      absenceDuplicate: 'This employee is already marked absent on the selected date.',
      createdMessage: 'Employee salary added',
      lifecycleTelegramFailed: 'The employee change was saved, but the ZarKebab Investor group notification was not sent.',
      rateSavedMessage: 'New salary rate saved',
      rateTelegramFailed: 'The salary rate was saved, but Telegram messages were not sent. Check migration 116 and the delivery status.',
      transactionSavedMessage: 'Transaction saved',
      paymentTelegramFailed: 'Payment saved, but the Telegram messages were not sent.',
      transactionTelegramFailed: 'Transaction saved, but the Telegram messages were not sent.',
      transactionTelegramPartial: 'Transaction saved. One Telegram message was not sent; check the status below.',
      absenceSavedMessage: 'Absence saved',
      accruedToday: 'Daily expense',
      history: 'Salary history',
      historyBtn: 'History',
      payments: 'Payments',
      paymentHistory: 'Payments / bonuses / fines',
      paymentLabel: 'Payment',
      bonusLabel: 'Bonus',
      fineLabel: 'Fine',
      active: 'Active',
      inactive: 'Inactive',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      page: 'Page',
      empty: 'No salary settings yet',
      migration: 'Salary tables are not up to date. Run salary migrations 054–063, 099, and 169.',
      readOnly: 'Only the owner can manage this page.',
      kpiTitle: 'Daily KPI bonuses',
      kpiStartTime: 'KPI start time (Tashkent)',
      kpiHour: 'Hour',
      kpiMinute: 'Minute',
      kpiTimeDone: 'Done',
      kpiCalculationHelp: 'How is KPI calculated?',
      kpiStartHelp: 'Counts orders opened at or after this time and paid the same day before midnight. Order opening time represents client arrival.',
      kpiStartRequired: 'Enter a KPI start time.',
      kpiHelp: "Choose KPI from an employee’s own orders or all dine-in sales.",
      kpiBasis: "Calculation basis",
      kpiOwnOrders: "Own opened orders",
      kpiAllDineIn: "All paid dine-in orders",
      kpiAccount: "Employee POS account",
      kpiSelectAccount: "Select an active employee account",
      kpiAccountRequired: "Select an active employee account for own-order KPI.",
      kpiAccountTaken: "This account is already linked to another employee. One account earns KPI for one employee only:",
      kpiAccountHelp: "Choose the active account this employee uses to open orders. The link is saved with the KPI setting.",
      kpiAccountNotNeeded: "All restaurant sales do not require an account link.",
      kpiAccountsEmpty: "No active employee accounts found.",
      kpiAccountsFailed: "Could not load employee accounts.",
      kpiAccountsRetry: "Retry",
      kpiAccountUnavailable: "Selected account is inactive or unavailable.",
      kpiAccountLinkedHere: "linked to this employee",
      kpiAccountLinkedTo: "linked to",
      kpiRuleTitle: 'Employee KPI percentage',
      kpiRuleHelp: 'A new date creates a new setting. An unprocessed date can be corrected by saving the same date.',
      kpiRate: 'KPI percentage',
      kpiEnabled: 'KPI enabled',
      kpiDisabled: 'KPI disabled',
      kpiSave: 'Save KPI setting',
      kpiSaved: 'KPI setting saved',
      kpiTelegramFailed: 'The KPI setting was saved, but the Salary group message was not sent. Check migration 170 and the delivery status.',
      kpiChangeLabel: 'KPI change',
      kpiRemove: 'Remove KPI setting',
      kpiRemoveTitle: 'Remove this KPI setting?',
      kpiRemoveFrom: 'Disable KPI from',
      kpiRemoveWarning: 'Settings, finalized calculations, and accrued bonuses before the selected date remain unchanged. KPI is disabled only from the selected date onward.',
      kpiRemoveConfirm: 'Remove',
      kpiRemoveCancel: 'Cancel',
      kpiRemoved: 'KPI setting removed',
      kpiStopped: 'KPI was disabled from the selected date. Earlier data was preserved.',
      kpiRemoveOwnerOnly: 'Only an owner can remove a KPI setting.',
      kpiRemoveFailed: 'Could not remove the KPI setting.',
      kpiPreview: 'Calculation example',
      kpiBaseStatement: "Base: paid subtotal + service for the selected orders, counted on the payment date. Choose all dine-in for hostesses and managers. Calculations before 16 Sep 2026 stay unchanged.",
      kpiAccruesToSalary: 'The result is added to salary balance as a bonus and settled by the next salary payment. The employee sees it in the daily message, Salary group in the aggregate report; ZarKebab Team is notified separately.',
      kpiMigration: 'Run migrations 129, 169, and 170, 196, 203 for daily KPI and group notifications.',
      kpiLoadFailed: 'Could not load KPI data.',
      telegramTitle: 'Telegram notifications',
      telegramHelp: 'Send the employee a private link that expires after 30 minutes.',
      telegramCreateLink: 'Create link',
      telegramCopy: 'Copy',
      telegramCopied: 'Telegram link copied',
      telegramLinked: 'Telegram linked',
      telegramBotMissing: 'VITE_TELEGRAM_BOT_USERNAME is not configured.',
      telegramDeliveryTitle: 'Salary notification status',
      telegramDeliveryHelp: 'Track salary messages and KPI setting changes delivered to the Salary group.',
      telegramDeliveryEmpty: 'No Telegram notifications yet.',
      telegramDeliveryMigration: 'Run migrations 108, 110, 111, 112, 113, 116, 119, and 170 to enable notification history.',
      telegramEmployee: 'Employee',
      telegramSalaryGroup: 'Salary group',
      telegramTeam: 'ZarKebab Team',
      telegramRetry: 'Send again',
      telegramRetrySent: 'Telegram messages sent.',
      telegramRetryPartial: 'One Telegram message was not sent; check the status.',
      telegramRetryFailed: 'Telegram messages were not sent.',
      telegramStatusPending: 'Pending',
      telegramStatusNotAttempted: 'Not attempted',
      telegramStatusSent: 'Sent',
      telegramStatusFailed: 'Failed',
      telegramStatusSkipped: 'Skipped',
      telegramStatusConfirmed: 'Received',
      telegramKpiCombined: 'The KPI Bonus is included in the daily salary message.',
      telegramMessageId: 'Message',
      previous: 'Previous',
      next: 'Next',
      of: 'of',
    },
  }
  const l = L[lang] || L.en
  const [salaryProfiles, setSalaryProfiles] = useState([])
  const [kpiAccounts, setKpiAccounts] = useState([])
  const [kpiAccountsError, setKpiAccountsError] = useState(false)
  const [telegramLinks, setTelegramLinks] = useState([])
  const [paymentDeliveries, setPaymentDeliveries] = useState([])
  const [paymentDeliveriesUnavailable, setPaymentDeliveriesUnavailable] = useState(false)
  const [groupEventDeliveries, setGroupEventDeliveries] = useState([])
  const [kpiRuleChangeEvents, setKpiRuleChangeEvents] = useState([])
  const [groupEventDeliveriesUnavailable, setGroupEventDeliveriesUnavailable] = useState(false)
  const [telegramSalaryProfileId, setTelegramSalaryProfileId] = useState('')
  const [telegramInviteUrl, setTelegramInviteUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [telegramSendingKeys, setTelegramSendingKeys] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmActionKey, setConfirmActionKey] = useState('')
  const [page, setPage] = useState(1)
  const [telegramDeliveryPage, setTelegramDeliveryPage] = useState(1)
  const [form, setForm] = useState({
    employee_name: '',
    job_function: '',
    joined_at: today,
    salary_amount: '',
    salary_unit: 'daily',
    payment_method: 'cash',
  })
  const [changeForm, setChangeForm] = useState({
    salary_profile_id: '',
    effective_from: today,
    salary_amount: '',
    salary_unit: 'daily',
    note: '',
  })
  const [transactionForm, setTransactionForm] = useState({
    salary_profile_id: '',
    entry_type: 'payment',
    paid_date: today,
    amount: '',
    payment_method: 'cash',
    note: '',
  })
  const [absenceForm, setAbsenceForm] = useState({
    salary_profile_id: '',
    absence_date: today,
    note: '',
  })
  const [salarySetupMode, setSalarySetupMode] = useState('add')
  const [kpiRules, setKpiRules] = useState([])
  const [kpiRulesLoading, setKpiRulesLoading] = useState(true)
  const [kpiRulesError, setKpiRulesError] = useState('')
  const [kpiRuleToRemove, setKpiRuleToRemove] = useState(null)
  const [kpiRuleRemoveError, setKpiRuleRemoveError] = useState('')
  const [kpiForm, setKpiForm] = useState({
    salary_profile_id: '',
    effective_from: today,
    rate_percentage: '1',
    sales_basis: 'employee_opened_orders',
    order_opener_profile_id: '',
    start_time: '00:00',
    is_enabled: true,
  })

  async function loadKpiRules() {
    setKpiRulesLoading(true)
    setKpiRulesError('')
    try {
      const { data, error: loadError } = await supabase
        .from('employee_kpi_rules')
        .select('*')
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
      if (loadError) {
        setKpiRules([])
        setKpiRulesError(isMissingKpiMigration(loadError) ? l.kpiMigration : loadError.message || l.kpiLoadFailed)
        return
      }
      setKpiRules(data || [])
    } catch (loadError) {
      setKpiRules([])
      setKpiRulesError(isMissingKpiMigration(loadError) ? l.kpiMigration : loadError?.message || l.kpiLoadFailed)
    } finally {
      setKpiRulesLoading(false)
    }
  }

  async function loadTelegramDeliveryData() {
    try {
      const [paymentDeliveryRes, groupEventDeliveryRes, kpiRuleChangeEventRes] = await Promise.all([
        supabase.from('employee_salary_payment_notification_deliveries')
          .select('id, payment_id, salary_profile_id, status, telegram_message_id, error_message, attempted_at, sent_at, confirmed_at, group_status, group_telegram_message_id, group_error_message, group_attempted_at, group_sent_at')
          .order('attempted_at', { ascending: false })
          .limit(100),
        supabase.from('employee_salary_group_notification_deliveries')
          .select('id, event_type, event_id, salary_profile_id, status, telegram_message_id, error_message, attempted_at, sent_at, employee_status, employee_telegram_message_id, employee_error_message, employee_attempted_at, employee_sent_at, team_status, team_telegram_message_id, team_error_message, team_attempted_at, team_sent_at')
          .order('attempted_at', { ascending: false })
          .limit(100),
        supabase.from('employee_kpi_rule_change_events')
          .select('id, salary_profile_id, employee_name_snapshot, change_kind, effective_from, previous_rate_bps, previous_is_enabled, new_rate_bps, new_is_enabled, previous_sales_basis, new_sales_basis, previous_start_time, new_start_time, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ])
      setPaymentDeliveries(paymentDeliveryRes.error ? [] : paymentDeliveryRes.data || [])
      setPaymentDeliveriesUnavailable(Boolean(paymentDeliveryRes.error))
      setGroupEventDeliveries(groupEventDeliveryRes.error ? [] : groupEventDeliveryRes.data || [])
      setKpiRuleChangeEvents(kpiRuleChangeEventRes.error ? [] : kpiRuleChangeEventRes.data || [])
      setGroupEventDeliveriesUnavailable(Boolean(groupEventDeliveryRes.error || kpiRuleChangeEventRes.error))
    } catch (deliveryError) {
      console.warn('[telegram] salary delivery status refresh failed:', deliveryError)
      setPaymentDeliveriesUnavailable(true)
      setGroupEventDeliveriesUnavailable(true)
      setKpiRuleChangeEvents([])
    }
  }

  async function loadData({ showLoader = false, refreshTelegram = true } = {}) {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const [teamRes, profileRes, rateRes, paymentRes, bonusRes, fineRes, absenceRes, telegramLinkRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role, status, created_at').order('full_name'),
        loadSalaryRows(() => supabase.from('employee_salary_profiles').select('*').order('employee_name')),
        loadSalaryRows(() => supabase.from('employee_salary_rates').select('*').order('effective_from', { ascending: false })),
        loadSalaryRows(() => supabase.from('employee_salary_payments').select('*').order('paid_date', { ascending: false })),
        loadSalaryRows(() => supabase.from('employee_salary_bonuses').select('*').order('bonus_date', { ascending: false })),
        loadSalaryRows(() => supabase.from('employee_salary_fines').select('*').order('fine_date', { ascending: false })),
        loadSalaryRows(() => supabase.from('employee_salary_absences').select('*').order('absence_date', { ascending: false })),
        supabase.from('employee_salary_telegram_links').select('salary_profile_id, telegram_user_id, linked_at, notifications_enabled'),
        refreshTelegram ? loadTelegramDeliveryData() : Promise.resolve(),
      ])
      setKpiAccountsError(Boolean(teamRes.error))
      setKpiAccounts(teamRes.error ? [] : getActiveKpiAccounts(teamRes.data || []))
      if (profileRes.error || rateRes.error || paymentRes.error || bonusRes.error || absenceRes.error) {
        const err = profileRes.error || rateRes.error || paymentRes.error || bonusRes.error || absenceRes.error
        setError(isMissingSalaryMigration(err) ? l.migration : err.message)
        setSalaryProfiles([])
      } else {
        if (fineRes.error) setError(isMissingSalaryMigration(fineRes.error) ? l.migration : fineRes.error.message)
        const teamRows = teamRes.data || []
        setSalaryProfiles(composeSalaryProfiles(profileRes.data || [], rateRes.data || [], paymentRes.data || [], bonusRes.data || [], fineRes.error ? [] : fineRes.data || [], absenceRes.data || [], teamRows)
          .filter(salaryProfile => !salaryProfile.deleted_at))
        setTelegramLinks(telegramLinkRes.error ? [] : telegramLinkRes.data || [])
      }
    } catch (loadError) {
      setKpiAccountsError(true)
      setKpiAccounts([])
      setError(isMissingSalaryMigration(loadError) ? l.migration : loadError.message)
      setSalaryProfiles([])
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    void loadData({ showLoader: true })
    void loadKpiRules()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function runTelegramNotificationInBackground(eventType, eventId, {
    retryKey = '',
    announceResult = false,
    failureMessage = '',
  } = {}) {
    const senders = {
      payment: notifyTelegramEmployeePayment,
      bonus: notifyTelegramEmployeeBonus,
      fine: notifyTelegramEmployeeFine,
      absence: notifyTelegramEmployeeAbsence,
      rate: notifyTelegramEmployeeRate,
      kpi_rule: notifyTelegramKpiRuleChange,
    }
    const send = senders[eventType]
    if (!send || !eventId) return

    if (retryKey) {
      setTelegramSendingKeys(current => (
        current.includes(retryKey) ? current : [...current, retryKey]
      ))
    }
    void send(eventId)
      .then(telegramResult => {
        const employeeTelegramSent = ['sent', 'confirmed'].includes(telegramResult?.employee?.status)
        const employeeDeliveryRequired = eventType !== 'kpi_rule'
        const employeeTelegramSatisfied = !employeeDeliveryRequired
          || employeeTelegramSent
          || telegramResult?.employeeIncludedInDailySummary === true
        const groupTelegramSent = telegramResult?.group?.status === 'sent'
        const teamDeliveryRequired = ['bonus', 'fine', 'absence'].includes(eventType)
        const teamTelegramSent = telegramResult?.team?.status === 'sent'
        const allRequiredDestinationsSent = employeeTelegramSatisfied
          && groupTelegramSent
          && (!teamDeliveryRequired || teamTelegramSent)
        const anyDestinationSent = (employeeDeliveryRequired && employeeTelegramSatisfied)
          || groupTelegramSent
          || (teamDeliveryRequired && teamTelegramSent)
        if (!announceResult) {
          if (failureMessage && !anyDestinationSent) {
            setMessage(failureMessage)
          }
          return
        }
        setMessage(allRequiredDestinationsSent
          ? l.telegramRetrySent
          : anyDestinationSent
            ? l.telegramRetryPartial
            : l.telegramRetryFailed)
      })
      .catch(notificationError => {
        console.warn(`[telegram] background ${eventType} notification failed:`, notificationError)
        if (announceResult) setMessage(l.telegramRetryFailed)
        else if (failureMessage) setMessage(failureMessage)
      })
      .finally(() => {
        if (retryKey) {
          setTelegramSendingKeys(current => current.filter(key => key !== retryKey))
        }
        void loadTelegramDeliveryData()
      })
  }

  async function createTelegramInvite() {
    const botUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '')
    if (!botUsername) {
      setError(l.telegramBotMissing)
      return
    }
    if (!canManage || !telegramSalaryProfileId) return

    setError('')
    setMessage('')
    setTelegramInviteUrl('')
    setSaving('telegram-link')
    const { data: token, error: linkError } = await supabase.rpc('create_employee_salary_telegram_link', {
      target_salary_profile_id: telegramSalaryProfileId,
    })
    setSaving('')
    if (linkError) {
      setError(linkError.message)
      return
    }
    setTelegramInviteUrl(`https://t.me/${botUsername}?start=employee_${token}`)
  }

  async function copyTelegramInvite() {
    if (!telegramInviteUrl) return
    try {
      await navigator.clipboard.writeText(telegramInviteUrl)
      setMessage(l.telegramCopied)
    } catch {
      setError(telegramInviteUrl)
    }
  }

  const sortedSalaryProfiles = useMemo(() => (
    [...salaryProfiles].sort((a, b) => {
      if (Boolean(a.is_active) !== Boolean(b.is_active)) return a.is_active ? -1 : 1
      const balanceDiff = getSalaryBalance(b, today) - getSalaryBalance(a, today)
      if (balanceDiff !== 0) return balanceDiff
      return String(a.employee_name || '').localeCompare(String(b.employee_name || ''))
    })
  ), [salaryProfiles, today])
  const pageCount = Math.max(1, Math.ceil(sortedSalaryProfiles.length / PAGE_SIZE))
  const pagedSalaryProfiles = useMemo(() => (
    sortedSalaryProfiles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  ), [sortedSalaryProfiles, page])
  const activeSalaryProfiles = useMemo(() => (
    sortedSalaryProfiles.filter(item => item.is_active !== false)
  ), [sortedSalaryProfiles])
  const selectedKpiProfile = activeSalaryProfiles.find(item => item.id === kpiForm.salary_profile_id)
  const selectedKpiRule = getEffectiveKpiRule(kpiRules, kpiForm.salary_profile_id, today)
  const kpiAccountLinks = useMemo(() => getKpiAccountLinks(kpiRules, activeSalaryProfiles, today), [kpiRules, activeSalaryProfiles, today])
  const kpiPreviewRateBps = parseKpiPercentToBps(kpiForm.rate_percentage)
  const kpiPreviewBonus = calculateDailyKpiBonus(KPI_PREVIEW_BASE_AMOUNT, kpiPreviewRateBps)
  const paymentDeliveryRows = useMemo(() => {
    const salaryProfileMap = new Map(salaryProfiles.map(item => [item.id, item]))
    return paymentDeliveries.map(delivery => {
      const salaryProfile = salaryProfileMap.get(delivery.salary_profile_id)
      const payment = salaryProfile?.payments?.find(item => item.id === delivery.payment_id)
      if (!payment) return null
      return {
        ...delivery,
        eventType: 'payment',
        eventId: delivery.payment_id,
        employeeName: salaryProfile?.employee_name || salaryProfile?.profile?.full_name || '—',
        amount: payment?.amount || 0,
        eventDate: payment?.paid_date || '',
        sortAt: delivery.attempted_at || delivery.group_attempted_at || '',
        employeeStatus: delivery.status,
        employeeTimestamp: delivery.confirmed_at || delivery.sent_at || delivery.attempted_at,
        employeeMessageId: delivery.telegram_message_id,
        employeeError: delivery.error_message,
        groupStatus: delivery.group_status,
        groupTimestamp: delivery.group_sent_at || delivery.group_attempted_at,
        groupMessageId: delivery.group_telegram_message_id,
        groupError: delivery.group_error_message,
      }
    }).filter(Boolean)
  }, [paymentDeliveries, salaryProfiles])
  const groupEventDeliveryRows = useMemo(() => {
    const salaryProfileMap = new Map(salaryProfiles.map(item => [item.id, item]))
    const kpiRuleChangeEventMap = new Map(kpiRuleChangeEvents.map(item => [item.id, item]))
    const collections = {
      bonus: 'bonuses',
      fine: 'fines',
      absence: 'absences',
      rate: 'rates',
    }
    const dateFields = {
      bonus: 'bonus_date',
      fine: 'fine_date',
      absence: 'absence_date',
      rate: 'effective_from',
      kpi_rule: 'effective_from',
    }
    return groupEventDeliveries.map(delivery => {
      const salaryProfile = salaryProfileMap.get(delivery.salary_profile_id)
      const event = delivery.event_type === 'kpi_rule'
        ? kpiRuleChangeEventMap.get(delivery.event_id)
        : salaryProfile?.[collections[delivery.event_type]]
          ?.find(item => item.id === delivery.event_id)
      if (!event) return null
      const employeeIncludedInDailySummary = delivery.event_type === 'bonus'
        && event?.source_type === 'daily_kpi'
      const groupExcludedForAutomaticKpi = employeeIncludedInDailySummary
      return {
        ...delivery,
        eventType: delivery.event_type,
        eventId: delivery.event_id,
        employeeName: event?.employee_name_snapshot || salaryProfile?.employee_name || salaryProfile?.profile?.full_name || '—',
        amount: event?.amount || 0,
        eventUnit: event?.rate_unit || '',
        eventDate: event?.[dateFields[delivery.event_type]] || '',
        previousKpiRateBps: event?.previous_rate_bps ?? null,
        previousKpiEnabled: event?.previous_is_enabled ?? null,
        newKpiRateBps: event?.new_rate_bps ?? null,
        newKpiEnabled: event?.new_is_enabled ?? null,
        previousKpiBasis: event?.previous_sales_basis,
        newKpiBasis: event?.new_sales_basis,
        previousKpiStartTime: event?.previous_start_time,
        newKpiStartTime: event?.new_start_time,
        sortAt: [delivery.attempted_at, delivery.employee_attempted_at, delivery.team_attempted_at]
          .filter(Boolean)
          .sort()
          .pop() || '',
        employeeStatus: delivery.employee_status,
        employeeTimestamp: delivery.employee_sent_at || delivery.employee_attempted_at,
        employeeMessageId: delivery.employee_telegram_message_id,
        employeeError: delivery.employee_error_message,
        employeeIncludedInDailySummary,
        showEmployeeDelivery: delivery.event_type !== 'kpi_rule',
        groupExcludedForAutomaticKpi,
        groupStatus: delivery.status,
        groupTimestamp: delivery.sent_at || delivery.attempted_at,
        groupMessageId: delivery.telegram_message_id,
        groupError: delivery.error_message,
        showTeamDelivery: ['bonus', 'fine', 'absence'].includes(delivery.event_type),
        teamStatus: delivery.team_status,
        teamTimestamp: delivery.team_sent_at || delivery.team_attempted_at,
        teamMessageId: delivery.team_telegram_message_id,
        teamError: delivery.team_error_message,
      }
    }).filter(Boolean)
  }, [groupEventDeliveries, kpiRuleChangeEvents, salaryProfiles])
  const telegramDeliveryRows = useMemo(() => (
    [...paymentDeliveryRows, ...groupEventDeliveryRows]
      .sort((a, b) => String(b.sortAt || '').localeCompare(String(a.sortAt || '')))
  ), [paymentDeliveryRows, groupEventDeliveryRows])
  const telegramDeliveryPageCount = Math.max(
    1,
    Math.ceil(telegramDeliveryRows.length / TELEGRAM_DELIVERY_PAGE_SIZE)
  )
  const pagedTelegramDeliveryRows = useMemo(() => (
    telegramDeliveryRows.slice(
      (telegramDeliveryPage - 1) * TELEGRAM_DELIVERY_PAGE_SIZE,
      telegramDeliveryPage * TELEGRAM_DELIVERY_PAGE_SIZE
    )
  ), [telegramDeliveryRows, telegramDeliveryPage])
  const paymentDeliveryStatusLabels = {
    pending: l.telegramStatusPending,
    not_attempted: l.telegramStatusNotAttempted,
    sent: l.telegramStatusSent,
    failed: l.telegramStatusFailed,
    skipped: l.telegramStatusSkipped,
    confirmed: l.telegramStatusConfirmed,
  }
  const groupEventTypeLabels = {
    bonus: l.bonusLabel,
    fine: l.fineLabel,
    absence: l.absence,
    rate: l.changeSalary,
    kpi_rule: l.kpiChangeLabel,
  }
  const paymentDeliveryStatusClasses = {
    pending: 'ws-tone-caution',
    not_attempted: '',
    sent: 'ws-tone-info',
    failed: 'ws-tone-negative',
    skipped: '',
    confirmed: 'ws-tone-positive',
  }
  const telegramDeliveryTypeStyles = {
    payment: {
      card: 'border-l-[#ff5a00]',
      label: 'ws-tone-accent',
    },
    bonus: {
      card: 'border-l-[#1d7a52]',
      label: 'ws-tone-positive',
    },
    fine: {
      card: 'border-l-[#c4262c]',
      label: 'ws-tone-negative',
    },
    absence: {
      card: 'border-l-[#9a5a00]',
      label: 'ws-tone-caution',
    },
    rate: {
      card: 'border-l-[#2a6fdb]',
      label: 'ws-tone-info',
    },
    kpi_rule: {
      card: 'border-l-[#68655f]',
      label: '',
    },
  }
  const transactionSalaryProfiles = useMemo(() => (
    sortedSalaryProfiles.filter(item => canRecordSalaryTransaction(
      item,
      transactionForm.entry_type,
      transactionForm.paid_date || today
    ))
  ), [sortedSalaryProfiles, transactionForm.entry_type, transactionForm.paid_date, today])
  const totalDue = useMemo(() => getTotalSalaryDue(salaryProfiles, today), [salaryProfiles, today])
  const monthlyPayrollTotal = useMemo(() => getTotalMonthlySalaryCommitment(salaryProfiles, today), [salaryProfiles, today])
  const selectedTransactionProfile = salaryProfiles.find(item => item.id === transactionForm.salary_profile_id)
  const selectedTransactionBalance = selectedTransactionProfile
    ? getSalaryBalance(selectedTransactionProfile, transactionForm.paid_date || today)
    : null
  const selectedAbsenceProfile = salaryProfiles.find(item => item.id === absenceForm.salary_profile_id)
  const selectedAbsenceDate = String(absenceForm.absence_date || today).slice(0, 10)
  const absenceAlreadyRecorded = Boolean(
    selectedAbsenceProfile &&
    selectedAbsenceDate &&
    getSalaryAbsenceDates(selectedAbsenceProfile).has(selectedAbsenceDate)
  )
  const transactionGuidance = transactionForm.entry_type === 'fine'
    ? l.fineHelp
    : transactionForm.entry_type === 'bonus'
      ? l.bonusHelp
      : transactionForm.entry_type === 'absence'
        ? l.absenceHelp
        : l.paymentHelp
  useEffect(() => {
    setPage(current => Math.min(current, pageCount))
  }, [pageCount])

  useEffect(() => {
    setTelegramDeliveryPage(current => Math.min(current, telegramDeliveryPageCount))
  }, [telegramDeliveryPageCount])

  function selectKpiEmployee(salaryProfileId, requestedRule = null) {
    const currentRule = requestedRule || getEffectiveKpiRule(kpiRules, salaryProfileId, today)
    setKpiForm({
      salary_profile_id: salaryProfileId,
      effective_from: getKpiRuleEditDate(requestedRule?.effective_from, today),
      rate_percentage: currentRule ? formatKpiRateInput(currentRule.rate_bps) : '1',
      sales_basis: currentRule?.sales_basis || 'employee_opened_orders',
      order_opener_profile_id: currentRule?.order_opener_profile_id || activeSalaryProfiles.find(item => item.id === salaryProfileId)?.profile_id || '',
      start_time: normalizeKpiStartTime(currentRule?.start_time),
      is_enabled: currentRule?.is_enabled !== false,
    })
  }

  async function saveKpiRule() {
    const salaryProfile = activeSalaryProfiles.find(item => item.id === kpiForm.salary_profile_id)
    const rateBps = parseKpiPercentToBps(kpiForm.rate_percentage)
    if (!canManage || !salaryProfile || !kpiForm.effective_from || kpiForm.effective_from < today || rateBps <= 0) return
    if (kpiForm.is_enabled && kpiForm.sales_basis === 'employee_opened_orders' && !kpiAccounts.some(account => account.id === kpiForm.order_opener_profile_id)) {
      setKpiRulesError(l.kpiAccountRequired)
      return
    }
    const accountConflicts = kpiForm.is_enabled && kpiForm.sales_basis === 'employee_opened_orders'
      ? getKpiAccountConflicts(kpiAccountLinks, kpiForm.order_opener_profile_id, salaryProfile.id)
      : []
    if (accountConflicts.length) {
      setKpiRulesError(`${l.kpiAccountTaken} ${accountConflicts.map(item => item.employee_name || '—').join(', ')}`)
      return
    }
    const startTime = normalizeKpiStartTime(kpiForm.start_time)
    if (!startTime) {
      setKpiRulesError(l.kpiStartRequired)
      return
    }
    const openerId = kpiForm.sales_basis === 'employee_opened_orders' ? kpiForm.order_opener_profile_id || null : null
    const existingRule = kpiRules.find(rule => (
      rule.salary_profile_id === salaryProfile.id
      && String(rule.effective_from || '').slice(0, 10) === kpiForm.effective_from
    ))
    const configurationChanged = !existingRule
      || normalizeKpiStartTime(existingRule.start_time) !== startTime
      || existingRule.sales_basis !== kpiForm.sales_basis
      || (existingRule.order_opener_profile_id || null) !== openerId
      || Number(existingRule.rate_bps) !== rateBps
      || Boolean(existingRule.is_enabled) !== Boolean(kpiForm.is_enabled)

    setSaving('kpi-rule')
    setKpiRulesError('')
    setError('')
    setMessage('')
    const { data: savedRule, error: saveError } = await supabase
      .from('employee_kpi_rules')
      .upsert({
        salary_profile_id: salaryProfile.id,
        effective_from: kpiForm.effective_from,
        rate_bps: rateBps,
        sales_basis: kpiForm.sales_basis,
        order_opener_profile_id: openerId,
        start_time: startTime,
        is_enabled: Boolean(kpiForm.is_enabled),
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
      }, { onConflict: 'salary_profile_id,effective_from' })
      .select('id, last_change_event_id')
      .single()
    setSaving('')
    if (saveError) {
      setKpiRulesError(isMissingKpiMigration(saveError) ? l.kpiMigration : saveError.message || l.kpiLoadFailed)
      return
    }
    setMessage(l.kpiSaved)
    if (configurationChanged) {
      runTelegramNotificationInBackground('kpi_rule', savedRule?.last_change_event_id, {
        failureMessage: l.kpiTelegramFailed,
      })
    }
    await loadKpiRules()
  }

  function requestRemoveKpiRule(salaryProfile, rule, effectiveFrom) {
    const removalDate = String(effectiveFrom || '').slice(0, 10)
    if (
      !canRemoveKpiRules
      || !salaryProfile?.id
      || !rule?.id
      || !/^\d{4}-\d{2}-\d{2}$/.test(removalDate)
      || removalDate < today
      || removalDate < String(rule.effective_from || '').slice(0, 10)
    ) return
    setKpiRulesError('')
    setKpiRuleRemoveError('')
    setKpiRuleToRemove({ salaryProfile, rule, effectiveFrom: removalDate })
  }

  function cancelRemoveKpiRule() {
    if (saving === `kpi-rule-delete-${kpiRuleToRemove?.rule?.id}`) return
    setKpiRuleToRemove(null)
    setKpiRuleRemoveError('')
  }

  async function removeKpiRule() {
    const rule = kpiRuleToRemove?.rule
    const effectiveFrom = kpiRuleToRemove?.effectiveFrom
    if (!canRemoveKpiRules || !rule?.id || !effectiveFrom) {
      setKpiRuleRemoveError(l.kpiRemoveOwnerOnly)
      return
    }

    const savingKey = `kpi-rule-delete-${rule.id}`
    setSaving(savingKey)
    setKpiRuleRemoveError('')
    setKpiRulesError('')
    setError('')
    setMessage('')

    let removalResult
    try {
      removalResult = await removeKpiRulePreservingHistory({
        client: supabase,
        rule,
        effectiveFrom,
        createdBy: profile?.id || null,
        createdByName: profile?.full_name || profile?.email || state.user?.name || '',
      })
    } catch (removalError) {
      removalResult = { action: 'failed', error: removalError }
    } finally {
      setSaving('')
    }

    if (removalResult.error) {
      setKpiRuleRemoveError(
        isMissingKpiMigration(removalResult.error)
          ? l.kpiMigration
          : l.kpiRemoveFailed
      )
      return
    }
    if (removalResult.action === 'not_deleted') {
      setKpiRuleRemoveError(l.kpiRemoveOwnerOnly)
      return
    }

    setKpiRuleToRemove(null)
    setKpiRuleRemoveError('')
    setKpiForm({
      salary_profile_id: '',
      effective_from: today,
      rate_percentage: '1',
      sales_basis: 'employee_opened_orders',
      order_opener_profile_id: '',
      start_time: '00:00',
      is_enabled: true,
    })
    setMessage(removalResult.action === 'disabled' ? l.kpiStopped : l.kpiRemoved)
    if (removalResult.action === 'disabled') {
      runTelegramNotificationInBackground('kpi_rule', removalResult.rule?.last_change_event_id, {
        failureMessage: l.kpiTelegramFailed,
      })
    }
    await loadKpiRules()
  }

  async function createSalaryProfile(event) {
    event.preventDefault()
    if (!canManage) return
    setError('')
    setMessage('')
    const employeeName = String(form.employee_name || '').trim()
    const amount = normalizeExpenseAmount(form.salary_amount)
    if (!isExpenseEntryDateAllowed(form.joined_at)) {
      setError(l.salaryDateLimit)
      return
    }
    if (!employeeName || !EMPLOYEE_JOB_FUNCTIONS.some(item => item.value === form.job_function) || !form.joined_at || amount <= 0) return
    setSaving('create')
    const { data: salaryProfile, error: profileError } = await supabase
      .from('employee_salary_profiles')
      .insert({
        profile_id: null,
        employee_name: employeeName,
        job_function: form.job_function,
        joined_at: form.joined_at,
        pay_schedule: 'monthly',
        payment_method: form.payment_method,
        created_by: profile?.id || null,
      })
      .select()
      .single()
    if (profileError) {
      setError(profileError.message)
      setSaving('')
      return
    }
    const { error: rateError } = await supabase
      .from('employee_salary_rates')
      .insert(buildSalaryRatePayload({
        salaryProfileId: salaryProfile.id,
        effectiveFrom: form.joined_at,
        amount,
        salaryUnit: form.salary_unit,
        createdBy: profile?.id || null,
      }))
    setSaving('')
    if (rateError) {
      await supabase.from('employee_salary_profiles').delete().eq('id', salaryProfile.id)
      setError(rateError.message)
      return
    }
    setMessage(l.createdMessage)
    setForm(current => ({ ...current, employee_name: '', job_function: '', salary_amount: '' }))
    await loadData({ refreshTelegram: false })
    const notification = await notifyTelegramEmployeeLifecycle(salaryProfile.id, 'created')
    if (!notification?.ok) setError(l.lifecycleTelegramFailed)
  }

  async function addRate() {
    const selectedProfile = salaryProfiles.find(item => item.id === changeForm.salary_profile_id)
    if (!selectedProfile) return
    const isInitialRate = (selectedProfile.rates || []).length === 0
    const amount = normalizeExpenseAmount(changeForm.salary_amount)
    const effectiveFrom = changeForm.effective_from
    if (!isExpenseEntryDateAllowed(effectiveFrom)) {
      setError(l.salaryDateLimit)
      return
    }
    if (!canManage || amount <= 0) return
    setError('')
    setMessage('')
    setSaving('rate-create')
    const { data: savedRate, error: rateError } = await supabase
      .from('employee_salary_rates')
      .insert(buildSalaryRatePayload({
        salaryProfileId: selectedProfile.id,
        effectiveFrom,
        amount,
        salaryUnit: changeForm.salary_unit || 'daily',
        note: changeForm.note || '',
        createdBy: profile?.id || null,
      }))
      .select('id')
      .single()
    setSaving('')
    if (rateError) {
      setError(rateError.message)
      return
    }
    setChangeForm({
      salary_profile_id: '',
      effective_from: today,
      salary_amount: '',
      salary_unit: 'daily',
      note: '',
    })
    setMessage(l.rateSavedMessage)
    if (!isInitialRate) {
      runTelegramNotificationInBackground('rate', savedRate?.id, {
        failureMessage: l.rateTelegramFailed,
      })
    }
    await loadData({ refreshTelegram: false })
  }

  async function addTransaction() {
    const salaryProfile = salaryProfiles.find(item => item.id === transactionForm.salary_profile_id)
    if (!salaryProfile) return
    const paidDate = transactionForm.paid_date || today
    const due = getSalaryDue(salaryProfile, paidDate)
    const amount = normalizeExpenseAmount(transactionForm.amount || due)
    const entryType = transactionForm.entry_type
    const isBonus = entryType === 'bonus'
    const isFine = entryType === 'fine'
    const reason = String(transactionForm.note || '').trim()
    if (!canManage || amount <= 0 || (isFine && !reason) || !canRecordSalaryTransaction(salaryProfile, entryType, paidDate)) return
    setError('')
    setMessage('')
    setSaving(`${entryType}-create`)
    let writeResult
    if (isFine) {
      writeResult = await supabase.from('employee_salary_fines').insert({
        salary_profile_id: salaryProfile.id,
        fine_date: paidDate,
        amount,
        reason,
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
      }).select('id').single()
    } else if (isBonus) {
      writeResult = await supabase.from('employee_salary_bonuses').insert({
        salary_profile_id: salaryProfile.id,
        bonus_date: paidDate,
        amount,
        payment_method: salaryProfile.payment_method || 'cash',
        accrues_to_salary: true,
        note: transactionForm.note || '',
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
      }).select('id').single()
    } else {
      writeResult = await supabase.from('employee_salary_payments').insert({
        salary_profile_id: salaryProfile.id,
        paid_date: paidDate,
        amount,
        payment_method: transactionForm.payment_method || salaryProfile.payment_method || 'cash',
        note: transactionForm.note || '',
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
      }).select('id').single()
    }
    setSaving('')
    const { error: writeError } = writeResult
    if (writeError) {
      setError(writeError.message)
      return
    }
    setTransactionForm({
      salary_profile_id: '',
      entry_type: 'payment',
      paid_date: today,
      amount: '',
      payment_method: 'cash',
      note: '',
    })
    setMessage(l.transactionSavedMessage)
    runTelegramNotificationInBackground(entryType, writeResult.data?.id)
    await loadData({ refreshTelegram: false })
  }

  async function addAbsence() {
    const salaryProfile = salaryProfiles.find(item => item.id === absenceForm.salary_profile_id)
    const absenceDate = String(absenceForm.absence_date || today).slice(0, 10)
    if (!canManage || !salaryProfile || !absenceDate) return
    setError('')
    setMessage('')
    if (getSalaryAbsenceDates(salaryProfile).has(absenceDate)) {
      setError(l.absenceDuplicate)
      return
    }
    setSaving('absence-create')
    const { data: savedAbsence, error: writeError } = await supabase.from('employee_salary_absences').insert({
      salary_profile_id: salaryProfile.id,
      absence_date: absenceDate,
      note: absenceForm.note || '',
      created_by: profile?.id || null,
      created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
    }).select('id').single()
    setSaving('')
    if (writeError) {
      setError(writeError.code === '23505' ? l.absenceDuplicate : writeError.message)
      return
    }
    setAbsenceForm({ salary_profile_id: '', absence_date: today, note: '' })
    setMessage(l.absenceSavedMessage)
    runTelegramNotificationInBackground('absence', savedAbsence?.id)
    await loadData({ refreshTelegram: false })
  }

  function retryTelegramDelivery(delivery) {
    if (!canManage || !delivery?.eventId || !delivery?.eventType) return
    const retryKey = `telegram-retry-${delivery.eventType}-${delivery.eventId}`
    setError('')
    setMessage('')
    runTelegramNotificationInBackground(delivery.eventType, delivery.eventId, {
      retryKey,
      announceResult: true,
    })
  }

  async function deleteRate(rate) {
    if (!canManage || role !== 'owner' || !rate?.id || saving) return
    const key = `rate-delete-${rate.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    setError('')
    try {
      await retractTelegramSalaryEvent('rate', rate.id)
      const { data: deleted, error: deleteError } = await supabase.from('employee_salary_rates').delete()
        .eq('id', rate.id).eq('salary_profile_id', rate.salary_profile_id).select('id')
      if (deleteError) throw deleteError
      if (!deleted?.length) throw new Error('Salary rate was not deleted')
      await loadData()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setSaving('')
      setConfirmActionKey('')
    }
  }

  async function toggleSalaryProfileActive(salaryProfile) {
    if (!canManage || !salaryProfile?.id) return
    const key = `profile-toggle-${salaryProfile.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    const nextActive = salaryProfile.is_active === false
    if (nextActive) {
      const absenceRows = buildSalaryReactivationAbsenceRows(salaryProfile, today)
      if (absenceRows.length > 0) {
        const { error: absenceError } = await supabase
          .from('employee_salary_absences')
          .upsert(absenceRows, { onConflict: 'salary_profile_id,absence_date', ignoreDuplicates: true })
        if (absenceError) {
          setSaving('')
          setConfirmActionKey('')
          setError(absenceError.message)
          return
        }
      }
    }
    const patch = nextActive
      ? { is_active: true, ended_at: null }
      : { is_active: false, ended_at: today }
    const { error: updateError } = await supabase
      .from('employee_salary_profiles')
      .update(patch)
      .eq('id', salaryProfile.id)
    setSaving('')
    setConfirmActionKey('')
    if (updateError) {
      setError(updateError.message)
      return
    }
    await loadData()
    const notification = await notifyTelegramEmployeeLifecycle(
      salaryProfile.id,
      nextActive ? 'activated' : 'deactivated',
    )
    if (!notification?.ok) setError(l.lifecycleTelegramFailed)
  }

  async function removeSalaryProfile(salaryProfile) {
    if (!canManage || !salaryProfile?.id) return
    const key = `profile-remove-${salaryProfile.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }
    setSaving(key)
    const { error: deleteError } = await supabase
      .from('employee_salary_profiles')
      .update({
        is_active: false,
        ended_at: salaryProfile.ended_at || today,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', salaryProfile.id)
    setSaving('')
    setConfirmActionKey('')
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await loadData()
    const notification = await notifyTelegramEmployeeLifecycle(salaryProfile.id, 'deactivated')
    if (!notification?.ok) setError(l.lifecycleTelegramFailed)
  }

  const backToAccounting = { label: l.back, onClick: () => navigate('/admin/accounting') }

  if (loading) {
    return (
      <AppShell title={l.title} back={backToAccounting}>
        <div className="min-h-full bg-[#f6f5f3]">
          <OperationalLoading
            title={l.loadingTitle}
            description={l.loadingDescription}
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={l.title} back={backToAccounting}>
      <div className="min-h-full overflow-x-hidden bg-[#f6f5f3]">
        <div className="ws-page">
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard
              icon={BadgeMinus}
              label={l.totalDue}
              description={l.totalDueHelp}
              value={loading ? '—' : formatCurrency(totalDue)}
            />
            <MetricCard
              icon={WalletCards}
              label={l.monthlyPayroll}
              description={l.monthlyPayrollHelp}
              value={loading ? '—' : formatCurrency(monthlyPayrollTotal)}
            />
            <button
              type="button"
              onClick={() => navigate('/admin/accounting/employees')}
              className="ws-panel group flex h-full items-start justify-between gap-3 text-left transition-shadow hover:shadow-[0_4px_14px_rgb(34_32_29/8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40"
            >
              <span className="min-w-0">
                <span className="ws-caption block">{l.employees}</span>
                <span className="mt-1 block text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]">{loading ? '—' : activeSalaryProfiles.length}</span>
                <span className="mt-2 block text-sm font-medium text-[#ff5a00] group-hover:underline">{l.openEmployees}</span>
              </span>
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
                <Users size={16} />
              </span>
            </button>
          </div>

          {!canManage && <div className="ws-notice ws-tone-accent">{l.readOnly}</div>}
          {error && <div role="alert" className="ws-notice ws-tone-negative">{error}</div>}
          {message && !error && <div role="status" aria-live="polite" className="ws-notice ws-tone-positive">{message}</div>}

          <section aria-labelledby="salary-operations-heading">
            <SectionHeading
              id="salary-operations-heading"
              title={l.quickActions}
              description={l.quickActionsHelp}
            />
            <div className="grid min-w-0 grid-cols-1 items-stretch gap-4">
              <div className="ws-panel flex h-full min-w-0 flex-col">
                <CardHeading icon={WalletCards} title={l.paymentBonus} description={l.transactionHelp} />
                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="ws-segmented !grid w-full grid-cols-4 sm:col-span-2" role="group" aria-label={l.paymentBonus}>
                    {['payment', 'bonus', 'fine', 'absence'].map(entryType => {
                      const active = transactionForm.entry_type === entryType
                      const isFine = entryType === 'fine'
                      const isBonus = entryType === 'bonus'
                      const isAbsence = entryType === 'absence'
                      return (
                        <button
                          key={entryType}
                          type="button"
                          onClick={() => setTransactionForm(current => {
                            const selectedProfile = salaryProfiles.find(item => item.id === current.salary_profile_id)
                            const paidDate = current.paid_date || today
                            const keepSelected = entryType !== 'absence' && canRecordSalaryTransaction(selectedProfile, entryType, paidDate)
                            return {
                              ...current,
                              entry_type: entryType,
                              salary_profile_id: keepSelected ? current.salary_profile_id : '',
                              amount: keepSelected && entryType === 'payment'
                                ? String(getSalaryDue(selectedProfile, paidDate) || '')
                                : '',
                              note: '',
                            }
                          })}
                          disabled={!canManage || loading}
                          aria-pressed={active}
                          className="min-w-0 !h-auto min-h-10 !whitespace-normal break-words !px-1.5 py-1 text-center !text-xs leading-tight disabled:cursor-not-allowed disabled:opacity-60 sm:!text-sm"
                        >
                          {isAbsence ? l.absence : isFine ? l.fineEntry : isBonus ? l.bonusEntry : l.paymentEntry}
                        </button>
                      )
                    })}
                  </div>
                  <p className={`ws-notice sm:col-span-2 ${transactionForm.entry_type === 'fine' ? 'ws-tone-negative' : transactionForm.entry_type === 'absence' ? 'ws-tone-caution' : transactionForm.entry_type === 'bonus' ? 'ws-tone-positive' : 'ws-tone-accent'}`}>
                    {transactionGuidance}
                  </p>
                  {transactionForm.entry_type === 'absence' && (
                    <>
                      <div className="sm:col-span-2">
                        <Field label={l.employee}>
                          <select
                            value={absenceForm.salary_profile_id}
                            onChange={event => setAbsenceForm(current => ({ ...current, salary_profile_id: event.target.value }))}
                            className={FIELD}
                            disabled={!canManage || loading}
                          >
                            <option value="">{l.selectEmployee}</option>
                            {activeSalaryProfiles.map(item => (
                              <option key={item.id} value={item.id}>{item.employee_name || item.profile?.full_name || item.profile?.email}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label={l.absenceDate}>
                          <DateInput value={absenceForm.absence_date} lang={lang} onChange={value => setAbsenceForm(current => ({ ...current, absence_date: value }))} disabled={!canManage || loading} />
                        </Field>
                      </div>
                      {absenceAlreadyRecorded && (
                        <p role="alert" className="ws-notice ws-tone-negative sm:col-span-2">
                          {l.absenceDuplicate}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={addAbsence}
                        disabled={!canManage || loading || !absenceForm.salary_profile_id || !absenceForm.absence_date || absenceAlreadyRecorded || saving === 'absence-create'}
                        className="ws-btn ws-btn-primary !h-11 sm:col-span-2"
                      >
                        {saving === 'absence-create' ? <Loader2 size={16} className="animate-spin" /> : <CalendarX2 size={15} />}
                        {l.absence}
                      </button>
                    </>
                  )}
                  {transactionForm.entry_type !== 'absence' && (
                    <>
                  <div className="sm:col-span-2">
                    <Field
                      label={l.employee}
                      hint={selectedTransactionProfile ? `${l.balance}: ${formatCurrency(selectedTransactionBalance)}` : ''}
                      hintClassName={selectedTransactionBalance < 0 ? 'text-[#c4262c]' : ''}
                    >
                      <select
                        value={transactionForm.salary_profile_id}
                        onChange={event => {
                          const selectedProfile = salaryProfiles.find(item => item.id === event.target.value)
                          const nextPaidDate = transactionForm.paid_date || today
                          const due = selectedProfile && transactionForm.entry_type === 'payment'
                            ? getSalaryDue(selectedProfile, nextPaidDate)
                            : ''
                          setTransactionForm(current => ({
                            ...current,
                            salary_profile_id: event.target.value,
                            amount: current.entry_type === 'payment'
                              ? (due > 0 ? String(due) : '')
                              : current.amount,
                            payment_method: selectedProfile?.payment_method || 'cash',
                          }))
                        }}
                        className={FIELD}
                        disabled={!canManage || loading}
                      >
                        <option value="">{l.selectEmployee}</option>
                        {transactionSalaryProfiles.map(item => {
                          const name = item.employee_name || item.profile?.full_name || item.profile?.email
                          const inactiveDue = item.is_active === false
                            ? ` · ${l.inactive} · ${l.balance}: ${formatCurrency(getSalaryBalance(item, transactionForm.paid_date || today))}`
                            : ''
                          return <option key={item.id} value={item.id}>{name}{inactiveDue}</option>
                        })}
                      </select>
                    </Field>
                  </div>
                  <Field label={transactionForm.entry_type === 'fine' ? l.fineDate : transactionForm.entry_type === 'bonus' ? l.bonusDate : l.paidDate}>
                    <DateInput
                      value={transactionForm.paid_date}
                      lang={lang}
                      onChange={value => {
                        const nextPaidDate = value
                        const selectedProfile = salaryProfiles.find(item => item.id === transactionForm.salary_profile_id)
                        const due = selectedProfile && transactionForm.entry_type === 'payment'
                          ? getSalaryDue(selectedProfile, nextPaidDate)
                          : ''
                        setTransactionForm(current => ({
                          ...current,
                          paid_date: nextPaidDate,
                          amount: current.entry_type === 'payment'
                            ? (due > 0 ? String(due) : '')
                            : current.amount,
                        }))
                      }}
                      disabled={!canManage || loading}
                    />
                  </Field>
                  <Field label={l.amount}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountInput(transactionForm.amount)}
                      onChange={event => setTransactionForm(current => ({ ...current, amount: parseAmountInput(event.target.value) }))}
                      placeholder="0 UZS"
                      className={FIELD}
                      disabled={!canManage || loading}
                    />
                  </Field>
                  {transactionForm.entry_type === 'payment' && (
                    <Field label={l.method}>
                      <select
                        value={transactionForm.payment_method}
                        onChange={event => setTransactionForm(current => ({ ...current, payment_method: event.target.value }))}
                        className={FIELD}
                        disabled={!canManage || loading}
                      >
                        {EXPENSE_PAYMENT_METHODS.map(method => <option key={method} value={method}>{expensePaymentMethodLabel(method, lang)}</option>)}
                      </select>
                    </Field>
                  )}
                  {transactionForm.entry_type === 'fine' && (
                    <div className="sm:col-span-2">
                      <Field label={l.fineReason}>
                        <input
                          type="text"
                          value={transactionForm.note}
                          onChange={event => setTransactionForm(current => ({ ...current, note: event.target.value }))}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          data-gramm="false"
                          data-gramm_editor="false"
                          className={FIELD}
                          disabled={!canManage || loading}
                          required
                        />
                      </Field>
                    </div>
                  )}
                  {transactionForm.entry_type === 'bonus' && (
                    <div className="sm:col-span-2">
                      <Field label={l.bonusComment}>
                        <input
                          type="text"
                          value={transactionForm.note}
                          onChange={event => setTransactionForm(current => ({ ...current, note: event.target.value }))}
                          placeholder={l.bonusCommentPlaceholder}
                          className={FIELD}
                          disabled={!canManage || loading}
                        />
                      </Field>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addTransaction}
                    disabled={!canManage || loading || !transactionForm.salary_profile_id || normalizeExpenseAmount(transactionForm.amount) <= 0 || (transactionForm.entry_type === 'fine' && !transactionForm.note.trim()) || (saving !== '' && ['payment-create', 'bonus-create', 'fine-create'].includes(saving))}
                    className={`ws-btn ws-btn-primary !h-11 self-end items-center ${['fine', 'bonus'].includes(transactionForm.entry_type) ? 'sm:col-span-2' : ''}`}
                  >
                    {['payment-create', 'bonus-create', 'fine-create'].includes(saving)
                      ? <Loader2 size={16} className="animate-spin" />
                      : transactionForm.entry_type === 'fine'
                        ? <BadgeMinus size={15} />
                        : transactionForm.entry_type === 'bonus'
                          ? <Plus size={15} />
                          : <WalletCards size={15} />}
                    {transactionForm.entry_type === 'fine' ? l.addFine : transactionForm.entry_type === 'bonus' ? l.addBonus : l.recordPayment}
                  </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="salary-settings-heading">
            <SectionHeading
              id="salary-settings-heading"
              title={l.salarySettings}
              description={l.salarySettingsHelp}
            />
            <div className="grid w-full min-w-0 grid-cols-1 items-stretch gap-4">
              <div className={`ws-panel h-full w-full min-w-0 max-w-full ${salarySetupMode === 'kpi' ? 'overflow-visible' : 'overflow-hidden'}`}>
                <CardHeading
                  icon={salarySetupMode === 'kpi' ? Percent : salarySetupMode === 'change' ? Save : Plus}
                  title={salarySetupMode === 'kpi' ? l.kpiRuleTitle : salarySetupMode === 'change' ? l.changeSalary : l.add}
                  description={salarySetupMode === 'kpi' ? l.kpiRuleHelp : salarySetupMode === 'change' ? l.changeHelp : l.addHelp}
                />
                <div className="ws-segmented !grid mb-5 w-full grid-cols-3" role="group" aria-label={l.salarySettings}>
                  {[
                    { key: 'add', label: l.add },
                    { key: 'change', label: l.changeSalary },
                    { key: 'kpi', label: l.kpiRuleTitle },
                  ].map(item => {
                    const active = salarySetupMode === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          if (item.key === 'change' && salarySetupMode !== 'change') {
                            setChangeForm(current => ({ ...current, effective_from: todayExpenseDate() }))
                          }
                          setSalarySetupMode(item.key)
                        }}
                        disabled={loading}
                        aria-pressed={active}
                        className="min-w-0 !h-auto min-h-10 !whitespace-normal break-words !px-1.5 py-1 text-center !text-xs leading-tight disabled:cursor-not-allowed disabled:opacity-60 sm:!text-sm"
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
                {salarySetupMode === 'add' && (
                <form onSubmit={createSalaryProfile} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Field label={l.employeeName}>
                      <input
                        type="text"
                        value={form.employee_name}
                        onChange={event => setForm(current => ({ ...current, employee_name: event.target.value }))}
                        className={FIELD}
                        disabled={!canManage || loading}
                      />
                    </Field>
                  </div>
                  <Field label={l.jobFunction}>
                    <select
                      value={form.job_function}
                      onChange={event => setForm(current => ({ ...current, job_function: event.target.value }))}
                      aria-label={l.jobFunction}
                      required
                      className={FIELD}
                      disabled={!canManage || loading}
                    >
                      <option value="" disabled>{l.selectJobFunction}</option>
                      {EMPLOYEE_JOB_FUNCTIONS.map(item => (
                        <option key={item.value} value={item.value}>{employeeJobFunctionLabel(item.value, lang)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={l.effectiveDate} hint={l.salaryDateLimit}>
                    <DateInput min={minimumSalaryDate} value={form.joined_at} lang={lang} onChange={value => setForm(current => ({ ...current, joined_at: value }))} disabled={!canManage || loading} />
                  </Field>
                  <Field label={l.salaryAmount}>
                    <input type="text" inputMode="numeric" value={formatAmountInput(form.salary_amount)} onChange={event => setForm(current => ({ ...current, salary_amount: parseAmountInput(event.target.value) }))} placeholder="0 UZS" className={FIELD} disabled={!canManage || loading} />
                  </Field>
                  <Field label={l.salaryUnit}>
                    <select value={form.salary_unit} onChange={event => setForm(current => ({ ...current, salary_unit: event.target.value }))} className={FIELD} disabled={!canManage || loading}>
                      {SALARY_RATE_UNITS.map(item => <option key={item} value={item}>{salaryRateUnitLabel(item, lang)}</option>)}
                    </select>
                  </Field>
                  <button
                    disabled={!canManage || loading || !form.employee_name.trim() || !form.job_function || normalizeExpenseAmount(form.salary_amount) <= 0 || saving === 'create'}
                    className="ws-btn ws-btn-primary !h-11 self-end items-center"
                  >
                    {saving === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{l.save}
                  </button>
                </form>
                )}

              {salarySetupMode === 'kpi' && (
              <DailyKpiSection
                embedded
                labels={l}
                lang={lang}
                minimumEffectiveDate={today}
                canManage={canManage}
                canRemoveRules={canRemoveKpiRules}
                loading={loading}
                activeSalaryProfiles={activeSalaryProfiles}
                kpiAccounts={kpiAccounts}
                kpiAccountLinks={kpiAccountLinks}
                accountsError={kpiAccountsError}
                onReloadAccounts={() => loadData({ showLoader: true, refreshTelegram: false })}
                selectedKpiProfile={selectedKpiProfile}
                form={kpiForm}
                onSelectEmployee={selectKpiEmployee}
                onFormChange={setKpiForm}
                onSave={saveKpiRule}
                saving={saving === 'kpi-rule'}
                ruleToRemove={kpiRuleToRemove}
                ruleRemoveError={kpiRuleRemoveError}
                removingRuleId={saving.startsWith('kpi-rule-delete-') ? saving.slice('kpi-rule-delete-'.length) : ''}
                onRequestRemoveRule={requestRemoveKpiRule}
                onCancelRemoveRule={cancelRemoveKpiRule}
                onConfirmRemoveRule={removeKpiRule}
                rulesLoading={kpiRulesLoading}
                rulesError={kpiRulesError}
                selectedRule={selectedKpiRule}
                previewRateBps={kpiPreviewRateBps}
                previewBonus={kpiPreviewBonus}
              />
              )}

              {salarySetupMode === 'change' && (
                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label={l.selectEmployee}>
                      <select
                        value={changeForm.salary_profile_id}
                        onChange={event => {
                          const selectedProfile = salaryProfiles.find(item => item.id === event.target.value)
                          setChangeForm(current => ({
                            ...current,
                            salary_profile_id: event.target.value,
                            effective_from: today,
                            salary_unit: selectedProfile?.rates?.[0]?.rate_unit || current.salary_unit,
                          }))
                        }}
                        className={FIELD}
                        disabled={!canManage || loading}
                      >
                        <option value="">{l.selectEmployee}</option>
                        {activeSalaryProfiles.map(item => (
                          <option key={item.id} value={item.id}>{item.employee_name || item.profile?.full_name || item.profile?.email}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label={l.effectiveDate} hint={l.salaryDateLimit}>
                    <DateInput min={minimumSalaryDate} value={changeForm.effective_from} lang={lang} onChange={value => setChangeForm(current => ({ ...current, effective_from: value }))} disabled={!canManage || loading} />
                  </Field>
                  <Field label={l.salaryAmount}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountInput(changeForm.salary_amount)}
                      onChange={event => setChangeForm(current => ({ ...current, salary_amount: parseAmountInput(event.target.value) }))}
                      placeholder="0 UZS"
                      className={FIELD}
                      disabled={!canManage || loading}
                    />
                  </Field>
                  <Field label={l.salaryUnit}>
                    <select value={changeForm.salary_unit} onChange={event => setChangeForm(current => ({ ...current, salary_unit: event.target.value }))} className={FIELD} disabled={!canManage || loading}>
                      {SALARY_RATE_UNITS.map(item => <option key={item} value={item}>{salaryRateUnitLabel(item, lang)}</option>)}
                    </select>
                  </Field>
                  <button
                    type="button"
                    onClick={() => addRate()}
                    disabled={!canManage || loading || !changeForm.salary_profile_id || !isExpenseEntryDateAllowed(changeForm.effective_from, today) || normalizeExpenseAmount(changeForm.salary_amount) <= 0 || saving === 'rate-create'}
                    className="ws-btn ws-btn-primary !h-11 self-end items-center"
                  >
                    {saving === 'rate-create' ? <Loader2 size={16} className="animate-spin" /> : <Save size={15} />}{l.save}
                  </button>
                </div>
              )}
              </div>

              <div className="ws-panel h-full min-w-0">
                <CardHeading icon={Send} title={l.telegramTitle} description={l.telegramHelp} />
                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Field label={l.selectEmployee}>
                    <select
                      value={telegramSalaryProfileId}
                      onChange={event => {
                        setTelegramSalaryProfileId(event.target.value)
                        setTelegramInviteUrl('')
                      }}
                      className={FIELD}
                      disabled={!canManage || loading}
                    >
                      <option value="">{l.selectEmployee}</option>
                      {activeSalaryProfiles.map(item => {
                        const linked = telegramLinks.some(link => link.salary_profile_id === item.id && link.linked_at)
                        const name = item.employee_name || item.profile?.full_name || item.profile?.email
                        return <option key={item.id} value={item.id}>{name}{linked ? ` · ${l.telegramLinked}` : ''}</option>
                      })}
                    </select>
                  </Field>
                  <button
                    type="button"
                    onClick={createTelegramInvite}
                    disabled={!canManage || loading || !telegramSalaryProfileId || saving === 'telegram-link'}
                    className="ws-btn ws-btn-primary !h-11 self-end items-center"
                  >
                    {saving === 'telegram-link' ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                    {l.telegramCreateLink}
                  </button>
                  {telegramInviteUrl && (
                    <div className="flex min-w-0 items-center gap-2 rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] p-2 sm:col-span-2">
                      <input readOnly value={telegramInviteUrl} className={`${FIELD} min-w-0 font-mono !text-xs`} />
                      <button
                        type="button"
                        onClick={copyTelegramInvite}
                        className="ws-btn ws-btn-outline !h-11"
                      >
                        <Copy size={15} />{l.telegramCopy}
                      </button>
                    </div>
                  )}
                  <div className="mt-2 border-t border-[#e4e1de] pt-4 sm:col-span-2">
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-[#22201d]">{l.telegramDeliveryTitle}</p>
                      <p className="ws-caption mt-0.5">{l.telegramDeliveryHelp}</p>
                    </div>
                    {paymentDeliveriesUnavailable || groupEventDeliveriesUnavailable ? (
                      <p className="ws-notice ws-tone-caution">
                        {l.telegramDeliveryMigration}
                      </p>
                    ) : telegramDeliveryRows.length === 0 ? (
                      <p className="ws-empty rounded-[10px] border border-dashed border-[#e4e1de] !py-6">
                        {l.telegramDeliveryEmpty}
                      </p>
                    ) : (
                      <>
                        <div className="overflow-hidden rounded-[10px] border border-[#e4e1de]">
                          {pagedTelegramDeliveryRows.map(delivery => {
                            const retryKey = `telegram-retry-${delivery.eventType}-${delivery.eventId}`
                            const typeStyle = telegramDeliveryTypeStyles[delivery.eventType] || telegramDeliveryTypeStyles.payment
                            const kpiValue = (rateBps, enabled, basis, startTime) => (
                              enabled === false ? l.kpiDisabled : `${formatKpiRatePercent(rateBps, lang)}${basis ? ` · ${formatKpiSalesBasis(basis, lang)}` : ''}${startTime != null ? ` · ${formatKpiStartTime(startTime, lang)}` : ''}`
                            )
                            const deliveryValue = delivery.eventType === 'kpi_rule'
                              ? delivery.previousKpiRateBps == null
                                ? kpiValue(delivery.newKpiRateBps, delivery.newKpiEnabled, delivery.newKpiBasis, delivery.newKpiStartTime)
                                : `${kpiValue(delivery.previousKpiRateBps, delivery.previousKpiEnabled, delivery.previousKpiBasis, delivery.previousKpiStartTime)} → ${kpiValue(delivery.newKpiRateBps, delivery.newKpiEnabled, delivery.newKpiBasis, delivery.newKpiStartTime)}`
                              : delivery.eventType === 'rate'
                                ? `${formatCurrency(delivery.amount)} · ${salaryRateUnitLabel(delivery.eventUnit, lang)}`
                                : delivery.eventType === 'absence'
                                  ? ''
                                  : formatCurrency(delivery.amount)
                            const deliveryDate = delivery.eventDate
                              ? formatLongDate(delivery.eventDate, lang, delivery.eventDate)
                              : ''
                            const canRetry = [
                              ...(delivery.showEmployeeDelivery !== false && !delivery.employeeIncludedInDailySummary
                                ? [delivery.employeeStatus]
                                : []),
                              ...(!delivery.groupExcludedForAutomaticKpi
                                ? [delivery.groupStatus]
                                : []),
                              ...(delivery.showTeamDelivery ? [delivery.teamStatus] : []),
                            ].some(status => ['not_attempted', 'failed', 'skipped'].includes(status))
                            return (
                              <div key={`${delivery.eventType}-${delivery.id}`} className={`ws-row border-l-4 px-3 py-3 ${typeStyle.card}`}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                      <p className="flex min-w-0 flex-wrap items-baseline gap-1.5 text-sm font-semibold text-[#22201d]">
                                        <span className="truncate">{delivery.employeeName}</span>
                                        {(deliveryValue || deliveryDate) && <span className="flex-shrink-0 text-[#68655f]">—</span>}
                                        {deliveryValue && <span className="flex-shrink-0 whitespace-nowrap tabular-nums">{deliveryValue}</span>}
                                        {deliveryValue && deliveryDate && <span className="flex-shrink-0 text-[#68655f]">·</span>}
                                        {deliveryDate && <span className="flex-shrink-0 whitespace-nowrap font-medium text-[#68655f]">{deliveryDate}</span>}
                                      </p>
                                      <span className={`ws-badge ${typeStyle.label}`}>
                                        {groupEventTypeLabels[delivery.eventType] || l.paymentLabel}
                                      </span>
                                    </div>
                                  </div>
                                  {canRetry && (
                                    <button
                                      type="button"
                                      onClick={() => retryTelegramDelivery(delivery)}
                                      disabled={!canManage || telegramSendingKeys.includes(retryKey)}
                                      className="ws-btn ws-btn-outline ws-btn-sm"
                                    >
                                      <Send size={14} />
                                      {l.telegramRetry}
                                    </button>
                                  )}
                                </div>
                                <div className={`mt-3 grid min-w-0 grid-cols-1 gap-2 ${delivery.showTeamDelivery ? 'sm:grid-cols-3' : delivery.showEmployeeDelivery === false ? '' : 'sm:grid-cols-2'}`}>
                                  {[
                                    ...(delivery.showEmployeeDelivery === false ? [] : [{
                                      key: 'employee',
                                      label: l.telegramEmployee,
                                      status: delivery.employeeStatus,
                                      timestamp: delivery.employeeTimestamp,
                                      messageId: delivery.employeeMessageId,
                                      error: delivery.employeeIncludedInDailySummary
                                        ? l.telegramKpiCombined
                                        : delivery.employeeError,
                                    }]),
                                    {
                                      key: 'group',
                                      label: l.telegramSalaryGroup,
                                      status: delivery.groupStatus,
                                      timestamp: delivery.groupTimestamp,
                                      messageId: delivery.groupMessageId,
                                      error: delivery.groupError,
                                    },
                                    ...(delivery.showTeamDelivery ? [{
                                      key: 'team',
                                      label: l.telegramTeam,
                                      status: delivery.teamStatus,
                                      timestamp: delivery.teamTimestamp,
                                      messageId: delivery.teamMessageId,
                                      error: delivery.teamError,
                                    }] : []),
                                  ].map(target => (
                                    <div key={target.key} className="rounded-lg border border-[#e4e1de] bg-white px-2.5 py-2">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-[#22201d]">{target.label}</span>
                                        <span className={`ws-status !text-xs ${
                                          paymentDeliveryStatusClasses[target.status] ?? paymentDeliveryStatusClasses.pending
                                        }`}>
                                          {paymentDeliveryStatusLabels[target.status] || target.status || l.telegramStatusPending}
                                        </span>
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs tabular-nums text-[#68655f]">
                                        <span>{formatDateTime(target.timestamp, '—')}</span>
                                        {target.messageId && (
                                          <span>{l.telegramMessageId} #{target.messageId}</span>
                                        )}
                                      </div>
                                      {target.error && (
                                        <p className={`mt-1.5 break-words rounded-md px-2 py-1.5 text-xs font-medium ${
                                          target.status === 'failed'
                                            ? 'ws-tone-negative'
                                            : 'ws-tone-caution'
                                        }`}>
                                          {target.error}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {telegramDeliveryPageCount > 1 && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <button
                              type="button"
                              aria-label={l.previous}
                              title={l.previous}
                              disabled={telegramDeliveryPage <= 1}
                              onClick={() => setTelegramDeliveryPage(current => Math.max(1, current - 1))}
                              className="ws-btn ws-btn-outline ws-btn-sm"
                            >
                              <ChevronLeft size={14} /> {l.previous}
                            </button>
                            <span className="ws-caption tabular-nums">
                              {l.page} {telegramDeliveryPage} {l.of} {telegramDeliveryPageCount}
                            </span>
                            <button
                              type="button"
                              aria-label={l.next}
                              title={l.next}
                              disabled={telegramDeliveryPage >= telegramDeliveryPageCount}
                              onClick={() => setTelegramDeliveryPage(current => Math.min(telegramDeliveryPageCount, current + 1))}
                              className="ws-btn ws-btn-outline ws-btn-sm"
                            >
                              {l.next} <ChevronRight size={14} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

function DailyKpiSection({
  embedded = false,
  labels,
  lang,
  minimumEffectiveDate,
  canManage,
  canRemoveRules,
  loading,
  activeSalaryProfiles,
  kpiAccounts,
  kpiAccountLinks = new Map(),
  accountsError,
  onReloadAccounts,
  selectedKpiProfile,
  form,
  onSelectEmployee,
  onFormChange,
  onSave,
  saving,
  ruleToRemove,
  ruleRemoveError,
  removingRuleId,
  onRequestRemoveRule,
  onCancelRemoveRule,
  onConfirmRemoveRule,
  rulesLoading,
  rulesError,
  selectedRule,
  previewRateBps,
  previewBonus,
}) {
  const employeeLabel = salaryProfile => (
    salaryProfile?.employee_name || salaryProfile?.profile?.full_name || salaryProfile?.profile?.email || '—'
  )
  const kpiAccountOptionLabel = account => {
    const name = `${account.full_name || account.email}${account.full_name && account.email ? ` (${account.email})` : ''}`
    const linked = kpiAccountLinks.get(account.id) || []
    if (!linked.length) return name
    if (linked.some(item => item.id === form.salary_profile_id)) return `✓ ${name} — ${labels.kpiAccountLinkedHere}`
    return `🔗 ${name} — ${labels.kpiAccountLinkedTo} ${linked.map(employeeLabel).join(', ')}`
  }
  const canRemoveSelectedRule = canRemoveRules
    && selectedKpiProfile
    && selectedRule
    && selectedRule.is_enabled !== false
    && /^\d{4}-\d{2}-\d{2}$/.test(String(form.effective_from || '').slice(0, 10))
    && String(form.effective_from).slice(0, 10) >= String(minimumEffectiveDate || '').slice(0, 10)
    && String(form.effective_from).slice(0, 10) >= String(selectedRule.effective_from || '').slice(0, 10)

  return (
    <>
      <div className={embedded ? 'min-w-0 max-w-full' : 'ws-panel h-full min-w-0 max-w-full'}>
          {!embedded && <CardHeading icon={Percent} title={labels.kpiRuleTitle} description={labels.kpiRuleHelp} />}

          {rulesError && (
            <p role="alert" className="ws-notice ws-tone-caution mb-4">
              {rulesError}
            </p>
          )}
          <div className="min-w-0 space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-[#e4e1de] pb-3">
              <p className="min-w-0 text-xs leading-relaxed text-[#68655f]">{labels.kpiHelp}</p>
            <button
              type="button"
              role="switch"
              aria-checked={form.is_enabled}
              onClick={() => onFormChange(current => ({ ...current, is_enabled: !current.is_enabled }))}
              disabled={!canManage || loading || rulesLoading}
              className={`inline-flex h-10 shrink-0 items-center justify-between gap-3 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                form.is_enabled
                  ? 'ws-tone-positive'
                  : 'border-[#e4e1de] bg-[#efece9] text-[#68655f]'
              }`}
            >
              <span>{form.is_enabled ? labels.kpiEnabled : labels.kpiDisabled}</span>
              <span className={`relative h-6 w-11 rounded-full transition-colors ${form.is_enabled ? 'bg-[#1d7a52]' : 'bg-[#dcd9d6]'}`} aria-hidden="true">
                <span className={`absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${form.is_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </span>
            </button>
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <Field label={labels.employee}>
                <select
                  value={form.salary_profile_id}
                  onChange={event => onSelectEmployee(event.target.value)}
                  className={FIELD}
                  disabled={!canManage || loading || rulesLoading}
                >
                  <option value="">{labels.selectEmployee}</option>
                  {activeSalaryProfiles.map(item => (
                    <option key={item.id} value={item.id}>{employeeLabel(item)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="min-w-0">
              <Field label={labels.kpiAccount}>
                <select value={form.order_opener_profile_id} className={FIELD}
                  aria-label={labels.kpiAccount}
                  disabled={!selectedKpiProfile || !canManage || loading || rulesLoading || form.sales_basis === 'restaurant' || accountsError}
                  onChange={event => onFormChange(current => ({ ...current, order_opener_profile_id: event.target.value }))}>
                  <option value="">{labels.kpiSelectAccount}</option>
                  {form.order_opener_profile_id && !kpiAccounts.some(account => account.id === form.order_opener_profile_id) && (
                    <option value={form.order_opener_profile_id} disabled>{labels.kpiAccountUnavailable}</option>
                  )}
                  {kpiAccounts.map(account => (
                    <option key={account.id} value={account.id}>{kpiAccountOptionLabel(account)}</option>
                  ))}
                </select>
              </Field>
              <p className="mt-2 text-xs text-[#68655f]">{form.sales_basis === 'restaurant' ? labels.kpiAccountNotNeeded : labels.kpiAccountHelp}</p>
              {selectedKpiProfile && form.is_enabled && form.sales_basis === 'employee_opened_orders' && (
                accountsError ? <p role="alert" className="mt-2 text-xs font-medium text-[#9a5a00]">
                  {labels.kpiAccountsFailed} <button type="button" onClick={onReloadAccounts} disabled={loading} className="font-medium text-[#ff5a00] underline">{labels.kpiAccountsRetry}</button>
                </p> : !kpiAccounts.length ? <p className="mt-2 text-xs font-medium text-[#9a5a00]">{labels.kpiAccountsEmpty}</p>
                  : null
              )}
            </div>
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-start gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <div className="min-w-0">
              <Field label={labels.kpiBasis}>
                <select value={form.sales_basis} className={FIELD}
                  disabled={!canManage || loading || rulesLoading}
                  onChange={event => onFormChange(current => ({ ...current, sales_basis: event.target.value }))}>
                  <option value="employee_opened_orders">{labels.kpiOwnOrders}</option>
                  <option value="restaurant">{labels.kpiAllDineIn}</option>
                </select>
              </Field>
            </div>
            <div className="min-w-0">
              <Field label={labels.kpiRate}>
                <div className="relative min-w-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.rate_percentage}
                    onChange={event => {
                      const value = event.target.value.replace(',', '.').replace(/[^\d.]/g, '')
                      if (/^\d{0,3}(?:\.\d{0,2})?$/.test(value)) {
                        onFormChange(current => ({ ...current, rate_percentage: value }))
                      }
                    }}
                    placeholder="1"
                    className={`${FIELD} pr-10`}
                    disabled={!canManage || loading || rulesLoading}
                    aria-describedby="daily-kpi-rate-preview"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-[#68655f]">%</span>
                </div>
              </Field>
            </div>
            </div>
            <div className="rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] p-3 sm:p-4">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
            <Field label={labels.effectiveDate}>
              <DateInput
                value={form.effective_from}
                lang={lang}
                min={minimumEffectiveDate}
                onChange={value => onFormChange(current => ({ ...current, effective_from: value }))}
                disabled={!canManage || loading || rulesLoading}
              />
            </Field>
            <div className="min-w-0">
              <TimePicker24 value={form.start_time} label={labels.kpiStartTime}
                hourLabel={labels.kpiHour} minuteLabel={labels.kpiMinute} doneLabel={labels.kpiTimeDone}
                className={FIELD} disabled={!canManage || loading || rulesLoading}
                onChange={value => onFormChange(current => ({ ...current, start_time: value }))} />
            </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#68655f]">{labels.kpiStartHelp}</p>
            </div>
            <div className="flex flex-col gap-4 border-t border-[#e4e1de] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div id="daily-kpi-rate-preview" className="min-w-0">
              <p className="ws-caption font-medium">{labels.kpiPreview}</p>
              <p className="mt-1 break-words text-sm font-semibold leading-relaxed tabular-nums text-[#22201d]">
                {formatCurrency(KPI_PREVIEW_BASE_AMOUNT)} × {previewRateBps > 0 ? formatKpiRatePercent(previewRateBps, lang) : '—'} = {previewRateBps > 0 ? formatCurrency(previewBonus) : '—'}
              </p>
            </div>
            <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">

              <button
                type="button"
                onClick={onSave}
                disabled={!canManage || loading || rulesLoading || !selectedKpiProfile || !form.effective_from || previewRateBps <= 0 || !normalizeKpiStartTime(form.start_time) || (form.is_enabled && form.sales_basis === 'employee_opened_orders' && !kpiAccounts.some(account => account.id === form.order_opener_profile_id)) || saving}
                className="ws-btn ws-btn-primary !h-11"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={15} />}
                {labels.kpiSave}
              </button>
            </div>            </div>
              {canRemoveSelectedRule && (
                <button
                  type="button"
                  onClick={() => onRequestRemoveRule(selectedKpiProfile, selectedRule, form.effective_from)}
                  disabled={Boolean(removingRuleId) || saving}
                  className="ws-btn ws-btn-ghost ws-btn-danger min-h-10 touch-manipulation !px-2"
                >
                  {removingRuleId === selectedRule.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {labels.kpiRemove}
                </button>
              )}
          </div>
          <details className="mt-4 min-w-0 break-words text-xs leading-relaxed text-[#68655f]">
            <summary className="cursor-pointer">{labels.kpiCalculationHelp}</summary>
            <p className="mt-2">{labels.kpiBaseStatement}</p>
            <p className="mt-1.5 font-semibold text-[#22201d]">{labels.kpiAccruesToSalary}</p>
          </details>
      </div>

      {ruleToRemove && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#22201d]/40 px-4 backdrop-blur-[2px]" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-kpi-rule-title"
            className="ws-dialog w-full max-w-md p-5 sm:p-6"
          >
            <div className="min-w-0">
              <h3 id="remove-kpi-rule-title" className="ws-display">{labels.kpiRemoveTitle}</h3>
              <p className="mt-3 truncate text-sm font-semibold text-[#22201d]">{employeeLabel(ruleToRemove.salaryProfile)}</p>
              <p className="ws-caption mt-0.5 tabular-nums">
                {formatKpiRatePercent(ruleToRemove.rule.rate_bps, lang)} · {labels.effectiveDate}: {formatLongDate(ruleToRemove.rule.effective_from, lang, ruleToRemove.rule.effective_from)}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#c4262c]">
                {labels.kpiRemoveFrom}: {formatLongDate(ruleToRemove.effectiveFrom, lang, ruleToRemove.effectiveFrom)}
              </p>
            </div>
            <p className="ws-notice ws-tone-caution mt-4 leading-relaxed">
              {labels.kpiRemoveWarning}
            </p>
            {ruleRemoveError && (
              <p role="alert" className="ws-notice ws-tone-negative mt-3 leading-relaxed">
                {ruleRemoveError}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onCancelRemoveRule}
                disabled={removingRuleId === ruleToRemove.rule.id}
                className="ws-btn ws-btn-outline !h-11"
              >
                {labels.kpiRemoveCancel}
              </button>
              <button
                type="button"
                onClick={onConfirmRemoveRule}
                disabled={removingRuleId === ruleToRemove.rule.id}
                className="ws-btn ws-btn-danger-solid !h-11"
              >
                {removingRuleId === ruleToRemove.rule.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={15} />}
                {labels.kpiRemoveConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MetricCard({ icon: Icon, label, value, description }) {
  return (
    <div className="ws-panel flex h-full items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="ws-caption">{label}</p>
        <p className="mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]">{value}</p>
        {description && <p className="ws-caption mt-2">{description}</p>}
      </div>
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
        <Icon size={16} />
      </span>
    </div>
  )
}

function SectionHeading({ id, title, description }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="ws-display">{title}</h2>
      <p className="ws-muted mt-1">{description}</p>
    </div>
  )
}

function CardHeading({ icon: Icon, title, description }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <span className="min-w-0 break-words">
        <span className="ws-heading block">{title}</span>
        <span className="ws-caption mt-1 block">{description}</span>
      </span>
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
        <Icon size={16} />
      </span>
    </div>
  )
}

function Field({ label, hint = '', hintClassName = '', children }) {
  return (
    <label className="block min-w-0">
      <span className="ws-caption mb-1.5 block font-medium">{label}</span>
      {children}
      {hint && <span className={`mt-1.5 block text-xs font-medium ${hintClassName || 'text-[#68655f]'}`}>{hint}</span>}
    </label>
  )
}

function DateInput(props) {
  return <CalendarPicker className={FIELD} {...props} />
}
