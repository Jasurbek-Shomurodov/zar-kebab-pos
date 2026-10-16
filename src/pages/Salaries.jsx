import CalendarPicker from '../components/CalendarPicker'
import React, { useEffect, useMemo, useState } from 'react'
import { BadgeMinus, CalendarX2, ChevronLeft, ChevronRight, Copy, Loader2, Plus, Save, Send, Users, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { accountingTitle, buildAccountingTabs } from '../lib/accountingTabs'
import { Shimmer } from '../components/PageShimmer'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { loadSalaryRows } from '../lib/salaryData'
import { formatCurrency } from '../lib/formatCurrency'
import { formatDateTime, formatLongDate } from '../lib/dateFormat'
import {
  formatKpiRatePercent,
  formatKpiSalesBasis,
  formatKpiStartTime,
  kpiRuleStartTimeApplies,
} from '../lib/dailyKpi'
import { canEditFeature } from '../lib/permissions'
import {
  EXPENSE_PAYMENT_METHODS,
  buildSalaryReactivationAbsenceRows,
  canRecordSalaryTransaction,
  expensePaymentMethodLabel,
  getSalaryAbsenceDates,
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
import { RollingValue } from '../components/RollingNumber'

const FIELD = 'ws-input !h-11 min-w-0 max-w-full font-medium disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]'
// Notes and reasons are free text, so they always get a multi-line field.
const NOTE_FIELD = 'ws-input !h-auto min-h-[76px] min-w-0 max-w-full resize-y !py-2.5 leading-relaxed disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]'
const PAGE_SIZE = 12
// Payment, bonus, fine and absence notes must explain the entry, not just name it.
const MIN_NOTE_WORDS = 5

function countNoteWords(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length
}
const TELEGRAM_DELIVERY_PAGE_SIZE = 5

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

export default function Salaries() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const role = (profile?.role || state.user?.role || 'guest').toLowerCase()
  const canManage = canEditFeature(profile || { role }, 'expenses')
  const today = todayExpenseDate()

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
      paymentNote: 'To‘lov izohi',
      bonusCommentPlaceholder: 'Bonus nima uchun berilmoqda? Kamida 5 ta so‘z.',
      paymentNotePlaceholder: 'To‘lov nima uchun? Kamida 5 ta so‘z.',
      fineReasonPlaceholder: 'Jarima sababi nima? Kamida 5 ta so‘z.',
      absenceReasonPlaceholder: 'Xodim nima uchun kelmadi? Kamida 5 ta so‘z.',
      fineReason: 'Jarima sababi',
      absence: 'Kelmagan kun',
      markAbsence: 'Kelmagan kunni belgilash',
      absenceDate: 'Kelmagan sana',
      absenceReason: 'Kelmaslik sababi',
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
      close: 'Yopish',
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
      kpiStartHelp: 'Shu vaqtdan boshlab ertasi kuni soat 04:00 gacha to‘langan buyurtmalar hisoblanadi, shuning uchun yarim tundan keyin yopilgan hisoblar kechki smenaga kiradi.',
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
      newTelegramTitle: 'Telegram (majburiy)',
      newTelegramHelp: 'Xodim havolani ochib, botda «Start» ni bossin. Telegram ulanmaguncha xodim qo‘shilmaydi.',
      newTelegramConnect: 'Telegramni ulash',
      newTelegramNewLink: 'Yangi havola',
      newTelegramWaiting: 'Xodim botda «Start» ni bosishi kutilmoqda',
      newTelegramLinked: 'Telegram ulandi',
      newTelegramExpired: 'Havola eskirdi. Yangisini yarating.',
      newTelegramRequired: 'Saqlashdan oldin xodimning Telegramini ulang.',
      newTelegramAlreadyLinked: 'Bu Telegram akkaunt boshqa xodimga ulangan. Boshqa akkaunt bilan yangi havola yarating.',
      newTelegramRegistrationInvalid: 'Telegram havolasi endi ishlamaydi. Yangisini yarating.',
      employeeDetailsInvalid: 'Ism, sana va maosh summasini tekshiring.',
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
      paymentNote: 'Комментарий к выплате',
      bonusCommentPlaceholder: 'За что этот бонус? Не менее 5 слов.',
      paymentNotePlaceholder: 'За что эта выплата? Не менее 5 слов.',
      fineReasonPlaceholder: 'За что этот штраф? Не менее 5 слов.',
      absenceReasonPlaceholder: 'Почему сотрудник отсутствует? Не менее 5 слов.',
      fineReason: 'Причина штрафа',
      absence: 'Отсутствие',
      markAbsence: 'Отметить отсутствие',
      absenceDate: 'Дата отсутствия',
      absenceReason: 'Причина отсутствия',
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
      close: 'Закрыть',
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
      kpiStartHelp: 'Учитываются заказы, оплаченные с этого времени до 04:00 следующего утра, поэтому счета, закрытые после полуночи, идут в вечернюю смену.',
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
      newTelegramTitle: 'Telegram (обязательно)',
      newTelegramHelp: 'Сотрудник открывает ссылку и нажимает «Start» в боте. Без подключённого Telegram сотрудника добавить нельзя.',
      newTelegramConnect: 'Подключить Telegram',
      newTelegramNewLink: 'Новая ссылка',
      newTelegramWaiting: 'Ждём, когда сотрудник нажмёт «Start» в боте',
      newTelegramLinked: 'Telegram подключён',
      newTelegramExpired: 'Ссылка устарела. Создайте новую.',
      newTelegramRequired: 'Подключите Telegram сотрудника перед сохранением.',
      newTelegramAlreadyLinked: 'Этот Telegram-аккаунт уже привязан к другому сотруднику. Создайте новую ссылку для другого аккаунта.',
      newTelegramRegistrationInvalid: 'Ссылка Telegram больше не действует. Создайте новую.',
      employeeDetailsInvalid: 'Проверьте имя, дату и сумму зарплаты.',
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
      paymentNote: 'Payment note',
      bonusCommentPlaceholder: 'What is this bonus for? At least 5 words.',
      paymentNotePlaceholder: 'What is this payment for? At least 5 words.',
      fineReasonPlaceholder: 'Why is the employee fined? At least 5 words.',
      absenceReasonPlaceholder: 'Why is the employee absent? At least 5 words.',
      fineReason: 'Reason for fine',
      absence: 'Absence',
      markAbsence: 'Mark absence',
      absenceDate: 'Absent date',
      absenceReason: 'Reason for absence',
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
      close: 'Close',
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
      kpiStartHelp: 'Counts orders paid from this time until 04:00 the next morning, so bills closed after midnight count toward the evening shift.',
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
      newTelegramTitle: 'Telegram (required)',
      newTelegramHelp: 'The employee opens the link and presses Start in the bot. An employee cannot be added until Telegram is connected.',
      newTelegramConnect: 'Connect Telegram',
      newTelegramNewLink: 'New link',
      newTelegramWaiting: 'Waiting for the employee to press Start in the bot',
      newTelegramLinked: 'Telegram connected',
      newTelegramExpired: 'The link expired. Create a new one.',
      newTelegramRequired: "Connect the employee's Telegram before saving.",
      newTelegramAlreadyLinked: 'This Telegram account is already linked to another employee. Create a new link for a different account.',
      newTelegramRegistrationInvalid: 'This Telegram link no longer works. Create a new one.',
      employeeDetailsInvalid: 'Check the name, date and salary amount.',
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
  const [telegramLinks, setTelegramLinks] = useState([])
  const [paymentDeliveries, setPaymentDeliveries] = useState([])
  const [paymentDeliveriesUnavailable, setPaymentDeliveriesUnavailable] = useState(false)
  const [groupEventDeliveries, setGroupEventDeliveries] = useState([])
  const [kpiRuleChangeEvents, setKpiRuleChangeEvents] = useState([])
  const [groupEventDeliveriesUnavailable, setGroupEventDeliveriesUnavailable] = useState(false)
  const [telegramSalaryProfileId, setTelegramSalaryProfileId] = useState('')
  const [telegramInviteUrl, setTelegramInviteUrl] = useState('')
  // New employees link Telegram first: { token, url, status, username, errorCode }.
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [telegramSendingKeys, setTelegramSendingKeys] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmActionKey, setConfirmActionKey] = useState('')
  const [page, setPage] = useState(1)
  const [telegramDeliveryPage, setTelegramDeliveryPage] = useState(1)
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
      setError(isMissingSalaryMigration(loadError) ? l.migration : loadError.message)
      setSalaryProfiles([])
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    void loadData({ showLoader: true })
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
        ...(kpiRuleStartTimeApplies(event?.effective_from) ? {
          previousKpiStartTime: event?.previous_start_time,
          newKpiStartTime: event?.new_start_time,
        } : {}),
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
    if (!canManage || amount <= 0 || countNoteWords(reason) < MIN_NOTE_WORDS || !canRecordSalaryTransaction(salaryProfile, entryType, paidDate)) return
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
        note: reason,
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || profile?.email || state.user?.name || '',
      }).select('id').single()
    } else {
      writeResult = await supabase.from('employee_salary_payments').insert({
        salary_profile_id: salaryProfile.id,
        paid_date: paidDate,
        amount,
        payment_method: transactionForm.payment_method || salaryProfile.payment_method || 'cash',
        note: reason,
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
    const reason = String(absenceForm.note || '').trim()
    if (!canManage || !salaryProfile || !absenceDate || countNoteWords(reason) < MIN_NOTE_WORDS) return
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
      note: reason,
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

  function chooseEntryType(entryType) {
    setTransactionForm(current => {
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
    })
  }


  // Static sections (headings, operation forms, Telegram link picker) render at once;
  // only values that depend on loaded data shimmer.
  return (
    <AppShell title={accountingTitle(lang)} tabs={buildAccountingTabs(lang, 'salaries', navigate)}>
      <div className="min-h-full overflow-x-hidden bg-[#f6f5f3]">
        <div className="ws-page">
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard
              icon={BadgeMinus}
              label={l.totalDue}
              description={l.totalDueHelp}
              value={loading ? <Shimmer className="h-6 w-40 max-w-full rounded-md" /> : formatCurrency(totalDue)}
            />
            <MetricCard
              icon={WalletCards}
              label={l.monthlyPayroll}
              description={l.monthlyPayrollHelp}
              value={loading ? <Shimmer className="h-6 w-40 max-w-full rounded-md" /> : formatCurrency(monthlyPayrollTotal)}
            />
            <button
              type="button"
              onClick={() => navigate('/admin/accounting/employees')}
              className="ws-panel group flex h-full items-start justify-between gap-3 text-left transition-shadow hover:shadow-[0_4px_14px_rgb(34_32_29/8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40"
            >
              <span className="min-w-0">
                <span className="ws-caption block">{l.employees}</span>
                <span className="mt-1 block text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]">{loading ? <Shimmer className="h-6 w-10 rounded-md" /> : activeSalaryProfiles.length}</span>
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
                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
                  <div className="ws-segmented !grid w-full grid-cols-4 sm:col-span-2 lg:col-span-12" role="group" aria-label={l.paymentBonus}>
                    {['payment', 'bonus', 'fine', 'absence'].map(entryType => {
                      const active = transactionForm.entry_type === entryType
                      const isFine = entryType === 'fine'
                      const isBonus = entryType === 'bonus'
                      const isAbsence = entryType === 'absence'
                      return (
                        <button
                          key={entryType}
                          type="button"
                          onClick={() => chooseEntryType(entryType)}
                          disabled={!canManage || loading}
                          aria-pressed={active}
                          className="min-w-0 !h-auto min-h-10 !whitespace-normal break-words !px-1.5 py-1 text-center !text-xs leading-tight disabled:cursor-not-allowed disabled:opacity-60 sm:!text-sm"
                        >
                          {isAbsence ? l.absence : isFine ? l.fineEntry : isBonus ? l.bonusEntry : l.paymentEntry}
                        </button>
                      )
                    })}
                  </div>
                  <p className={`ws-notice sm:col-span-2 lg:col-span-12 ${transactionForm.entry_type === 'fine' ? 'ws-tone-negative' : transactionForm.entry_type === 'absence' ? 'ws-tone-caution' : transactionForm.entry_type === 'bonus' ? 'ws-tone-positive' : 'ws-tone-accent'}`}>
                    {transactionGuidance}
                  </p>
                  {transactionForm.entry_type === 'absence' && (
                    <>
                      <div className="sm:col-span-2 lg:col-span-6">
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
                      <div className="sm:col-span-1 lg:col-span-3">
                        <Field label={l.absenceDate}>
                          <DateInput value={absenceForm.absence_date} lang={lang} onChange={value => setAbsenceForm(current => ({ ...current, absence_date: value }))} disabled={!canManage || loading} />
                        </Field>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-9">
                        <Field label={l.absenceReason}>
                          <textarea
                            rows={2}
                            value={absenceForm.note}
                            onChange={event => setAbsenceForm(current => ({ ...current, note: event.target.value }))}
                            placeholder={l.absenceReasonPlaceholder}
                            className={NOTE_FIELD}
                            disabled={!canManage || loading}
                            required
                          />
                        </Field>
                      </div>
                      {absenceAlreadyRecorded && (
                        <p role="alert" className="ws-notice ws-tone-negative sm:col-span-2 lg:order-last lg:col-span-12">
                          {l.absenceDuplicate}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={addAbsence}
                        disabled={!canManage || loading || !absenceForm.salary_profile_id || !absenceForm.absence_date || countNoteWords(absenceForm.note) < MIN_NOTE_WORDS || absenceAlreadyRecorded || saving === 'absence-create'}
                        className="ws-btn ws-btn-primary !h-11 self-end sm:col-span-2 lg:col-span-3 lg:mb-[22px]"
                      >
                        {saving === 'absence-create' ? <Loader2 size={16} className="animate-spin" /> : <CalendarX2 size={15} />}
                        {l.absence}
                      </button>
                    </>
                  )}
                  {transactionForm.entry_type !== 'absence' && (
                    <>
                  <div className={`sm:col-span-2 ${transactionForm.entry_type === 'payment' ? 'lg:col-span-3' : 'lg:col-span-6'}`}>
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
                  <div className="lg:col-span-3">
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
                  </div>
                  <div className="lg:col-span-3">
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
                  </div>
                  {transactionForm.entry_type === 'payment' && (
                    <div className="lg:col-span-3">
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
                    </div>
                  )}
                  {transactionForm.entry_type === 'fine' && (
                    <div className="sm:col-span-2 lg:col-span-9">
                      <Field label={l.fineReason}>
                        <textarea
                          rows={2}
                          value={transactionForm.note}
                          onChange={event => setTransactionForm(current => ({ ...current, note: event.target.value }))}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          data-gramm="false"
                          data-gramm_editor="false"
                          placeholder={l.fineReasonPlaceholder}
                          className={NOTE_FIELD}
                          disabled={!canManage || loading}
                          required
                        />
                      </Field>
                    </div>
                  )}
                  {transactionForm.entry_type === 'payment' && (
                    <div className="sm:col-span-2 lg:col-span-9">
                      <Field label={l.paymentNote}>
                        <textarea
                          rows={2}
                          value={transactionForm.note}
                          onChange={event => setTransactionForm(current => ({ ...current, note: event.target.value }))}
                          placeholder={l.paymentNotePlaceholder}
                          className={NOTE_FIELD}
                          disabled={!canManage || loading}
                          required
                        />
                      </Field>
                    </div>
                  )}
                  {transactionForm.entry_type === 'bonus' && (
                    <div className="sm:col-span-2 lg:col-span-9">
                      <Field label={l.bonusComment}>
                        <textarea
                          rows={2}
                          value={transactionForm.note}
                          onChange={event => setTransactionForm(current => ({ ...current, note: event.target.value }))}
                          placeholder={l.bonusCommentPlaceholder}
                          className={NOTE_FIELD}
                          disabled={!canManage || loading}
                          required
                        />
                      </Field>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addTransaction}
                    disabled={!canManage || loading || !transactionForm.salary_profile_id || normalizeExpenseAmount(transactionForm.amount) <= 0 || countNoteWords(transactionForm.note) < MIN_NOTE_WORDS || (saving !== '' && ['payment-create', 'bonus-create', 'fine-create'].includes(saving))}
                    className={`ws-btn ws-btn-primary !h-11 self-end items-center lg:col-span-3 lg:mb-[22px] sm:col-span-2`}
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

          <section aria-label={l.telegramTitle}>
            <div className="grid w-full min-w-0 grid-cols-1 items-stretch gap-4">
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
                    {loading ? (
                      <div className="space-y-2" aria-busy="true" aria-label={l.loadingTitle}>
                        {Array.from({ length: 3 }, (_, index) => <Shimmer key={index} className="h-12 w-full rounded-[10px]" />)}
                      </div>
                    ) : paymentDeliveriesUnavailable || groupEventDeliveriesUnavailable ? (
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

function MetricCard({ icon: Icon, label, value, description }) {
  return (
    <div className="ws-panel flex h-full items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="ws-caption">{label}</p>
        <div className="mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums text-[#22201d]"><RollingValue value={value} /></div>
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
