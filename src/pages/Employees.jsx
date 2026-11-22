import CalendarPicker from '../components/CalendarPicker'
import { EMPLOYEE_JOB_FUNCTIONS, employeeJobFunctionLabel } from '../lib/employeeJobFunctions'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck2, CalendarDays, CalendarX2, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, ExternalLink, HandCoins, History, Loader2, MonitorSmartphone, Pencil, Percent, Plus, Power, Save, ScanLine, Send, UserRound, Users, WalletCards, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { accountingTitle, buildAccountingTabs } from '../lib/accountingTabs'
import NewEmployeeDialog from '../components/NewEmployeeDialog'
import WorkspaceDialog from '../components/WorkspaceDialog'
import { OperationalError } from '../components/OperationalState'
import TimePicker24 from '../components/TimePicker24'
import PageShimmer, { Shimmer } from '../components/PageShimmer'
import { useApp } from '../store/AppContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate, formatTime } from '../lib/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import { canEditFeature, normalizeRole } from '../lib/permissions'
import { SALARY_ENTRY_TONES, compareSalaryAbsencesNewestFirst, formatSalaryBalance, formatSalaryEntryAmount } from '../lib/salaryTransactions'
import { getSalaryLedgerLoadError, isMissingSalaryMigration, loadSalaryRows } from '../lib/salaryData'
import {
  formatKpiRatePercent,
  formatKpiSalesBasis,
  getActiveKpiAccounts,
  getEffectiveKpiRule,
  getKpiAccountLinks,
} from '../lib/dailyKpi'
import {
  buildEmployeeKpiForm,
  buildEmployeeKpiRulePayload,
  buildEmployeeSalaryForm,
  buildSalaryRatePayload,
  getEmployeeKpiFormError,
  isEmployeeKpiChanged,
  isEmployeeSalaryChanged,
  isKpiRulePayloadChanged,
} from '../lib/employeeSettings'
import { notifyTelegramAbsenceUndo, notifyTelegramEmployeeLifecycle, notifyTelegramEmployeeProfileChange, notifyTelegramEmployeeRate, notifyTelegramKpiRuleChange } from '../lib/telegramNotifications'
import {
  getDailySalaryAmount,
  getSalaryAbsenceForDate,
  getSalaryAbsenceDates,
  getSalaryActiveUntil,
  getSalaryBalance,
  getSalaryDaySummary,
  getTotalSalaryDue,
  getExpenseEntryMinDate,
  isExpenseEntryDateAllowed,
  normalizeExpenseAmount,
  SALARY_RATE_UNITS,
  buildSalaryReactivationAbsenceRows,
  normalizeSalaryEndDate,
  todayExpenseDate,
} from '../lib/expenses'
import { RollingValue } from '../components/RollingNumber'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { buildAttendanceKioskQrDataUrl, buildAttendanceKioskUrl, formatArrivalSummary, isAttendanceStarted, normalizeWorkStartTime } from '../lib/attendance'


function composeEmployees(rows = [], rates = [], payments = [], bonuses = [], fines = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates
      .filter(rate => rate.salary_profile_id === row.id)
      .sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || ''))),
    payments: payments.filter(payment => payment.salary_profile_id === row.id),
    bonuses: bonuses.filter(bonus => bonus.salary_profile_id === row.id),
    fines: fines.filter(fine => fine.salary_profile_id === row.id),
    absences: absences
      .filter(absence => absence.salary_profile_id === row.id)
      .sort(compareSalaryAbsencesNewestFirst),
  }))
}

// `fallback` is the translated word for a nameless record; sorting and comparisons pass none.
function employeeName(employee, fallback) {
  return employee.employee_name || employee.profile?.full_name || employee.profile?.email || (typeof fallback === 'string' ? fallback : '')
}

export default function Employees() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const today = todayExpenseDate()
  const canManage = canEditFeature(profile || { role: state.user?.role }, 'expenses')
  const isOwner = normalizeRole(profile?.role || state.user?.role) === 'owner'
  const canEditName = canManage && isOwner

  const L = {
    uz: {
      title: 'Xodimlar',
      sub: 'Maosh tizimidagi xodimlar ro‘yxati',
      back: 'Maoshlarga qaytish',
      active: 'Faol',
      inactive: 'Nofaol',
      inactiveSection: 'Faolsizlantirilgan xodimlar',
      inactiveSalaryDue: 'To‘lanadigan maosh',
      inactiveNewestFirst: 'Eng oxirgi faolsizlantirilgan xodim birinchi',
      joined: 'Ishga kirgan',
      ended: 'Tugagan',
      daily: 'Kunlik',
      kpi: 'KPI',
      kpiEnabled: 'Faol',
      kpiDisabled: 'O‘chirilgan',
      kpiNotConfigured: 'Belgilanmagan',
      kpiUnavailable: 'Mavjud emas',
      activeDaily: 'Kunlik faol',
      absentToday: 'Bugun kelmagan',
      undoAbsence: 'Yo‘qlikni bekor qilish',
      undoAbsenceWarning: 'Bugungi maosh qayta hisoblanadi. Telegramdagi yuborilgan xabarlar o‘chirilmaydi.',
      undoAbsenceFailed: 'Bugungi yo‘qlikni bekor qilib bo‘lmadi.',
      undoAbsenceNotificationFailed: 'Yo‘qlik bekor qilindi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
      balance: 'Balans',
      todayPay: 'Bugun to‘lanadi',
      bonusShort: 'bonus',
      fineShort: 'jarima',
      paidShort: 'to‘langan',
      due: 'Qarz',
      endDate: 'Tugash sanasi',
      status: 'Holat',
      history: 'Maosh tarixi',
      historyBtn: 'Tarix',
      paymentHistory: 'To‘lovlar / bonuslar / jarimalar',
      paymentLabel: 'To‘lov',
      bonusLabel: 'Bonus',
      fineLabel: 'Jarima',
      absenceHistory: 'Kelmagan kunlar',
      absentLabel: 'Kelmagan',
      editName: 'Xodimni tahrirlash',
      jobFunction: 'Lavozim',
      noJobFunction: 'Lavozim belgilanmagan',
      employeeName: 'Xodim ismi',
      saveName: 'Saqlash',
      cancel: 'Bekor qilish',
      nameRequired: 'Xodim ismini kiriting.',
      deactivate: 'Faolsizlantirish',
      reactivate: 'Qayta yoqish',
      confirm: 'Tasdiqlash',
      empty: 'Xodimlar hali qo‘shilmagan',
      loadFailedTitle: 'Xodimlarni yuklab bo‘lmadi',
      loadFailed: 'Maosh ma’lumotlarini o‘qib bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.',
      saveFailed: 'Saqlab bo‘lmadi. O‘zgarish yozilmagan bo‘lishi mumkin: kartani tekshirib, qayta urinib ko‘ring.',
      linkFailed: 'Telegram havolasini yaratib bo‘lmadi. Qayta urinib ko‘ring.',
      copyFailed: 'Nusxalab bo‘lmadi. Havolani maydondan qo‘lda nusxalang.',
      screenActionFailed: 'Ekran havolasini o‘zgartirib bo‘lmadi. Qayta urinib ko‘ring.',
      close: 'Yopish',
      migration: 'Maosh jadvallari yangilanmagan. Supabase SQL editorida employee_salary migratsiyalarini ishga tushiring.',
      checkinQr: 'Kelish ekrani',
      checkinScreenHelp: 'Bu havolani kirish joyidagi planshet yoki telefonda oching va yoqiq qoldiring. Ekranda har 15 soniyada o‘zgaradigan QR chiqadi, shuning uchun saqlangan yoki yuborilgan kod taxminan 2 daqiqada ishlamay qoladi. Xodim telefon kamerasi bilan skanerlaydi va botda «Start» ni bosadi.',
      screenNone: 'Ekran havolasi hali yaratilmagan.',
      screenOnline: 'Ekran ishlayapti',
      screenOffline: 'Ekran aloqada emas',
      screenNeverOpened: 'Havola yaratilgan, ekran hali ochilmagan',
      screenLastSeen: 'oxirgi aloqa',
      createScreenLink: 'Ekran havolasini yaratish',
      replaceScreenLink: 'Yangi havola yaratish',
      replaceScreenWarning: 'Hozirgi ekran yangi havola ochilmaguncha ishlamaydi.',
      screenLinkOnce: 'Havola faqat bir marta ko‘rsatiladi. Kirish joyidagi qurilma kamerasi bilan QR ni skanerlang yoki havolani nusxalab oching.',
      screenQrAlt: 'Kelish ekrani havolasi QR kodi',
      copyLink: 'Nusxalash',
      linkCopied: 'Nusxalandi',
      openHere: 'Shu qurilmada ochish',
      turnOffScreen: 'Ekranni o‘chirish',
      turnOffWarning: 'Yangi ekran havolasi ochilmaguncha xodimlar kelganini belgilay olmaydi.',
      screenLoadFailed: 'Ekran holatini yuklab bo‘lmadi.',
      retry: 'Qayta urinish',
      checkinBotMissing: 'VITE_TELEGRAM_BOT_USERNAME sozlanmagan.',
      checkedInToday: 'Bugun kelganlar',
      notCheckedIn: 'Kelmagan',
      present: 'Keldi',
      workStart: 'Ish boshlanishi',
      workStartNotSet: 'Belgilanmagan',
      setWorkStart: 'Vaqtni belgilash',
      clearWorkStart: 'Vaqtni olib tashlash',
      worksRemotely: 'Masofaviy',
      worksRemotelyHint: 'QR orqali kelish belgilanmaydi',
      hour: 'Soat',
      minute: 'Daqiqa',
      done: 'Tayyor',
      addEmployee: 'Xodim qo‘shish',
      telegram: 'Telegram',
      telegramLinked: 'Ulangan',
      telegramNotLinked: 'Ulanmagan',
      telegramMuted: 'Xabarlar o‘chiq',
      telegramConnect: 'Telegram havolasini yaratish',
      telegramNewLink: 'Yangi havola',
      telegramHelp: 'Xodim QR ni skanerlasin yoki havolani ochib, botda «Start» ni bossin.',
      telegramWaiting: 'Xodim botda «Start» ni bosishi kutilmoqda',
      telegramQrAlt: 'Xodimning Telegram havolasi QR kodi',
      telegramBotMissing: 'VITE_TELEGRAM_BOT_USERNAME sozlanmagan.',
      profileSection: 'Xodim',
      salarySection: 'Maosh',
      salaryAmount: 'Maosh summasi',
      salaryUnit: 'Maosh turi',
      unitDaily: 'Kunlik',
      unitMonthly: 'Oylik',
      effectiveDate: 'Qachondan',
      salaryDateLimit: 'Ish haqi sanasi bugundan uch kundan ortiq oldin bo‘lishi mumkin emas.',
      salaryAmountRequired: 'Maosh summasini kiriting.',
      kpiOn: 'KPI faol',
      kpiOff: 'KPI o‘chirilgan',
      kpiRate: 'KPI foizi',
      kpiBasis: 'Hisoblash asosi',
      kpiOwnOrders: 'O‘zi ochgan buyurtmalar',
      kpiAllDineIn: 'Zaldagi barcha to‘langan buyurtmalar',
      kpiAccount: 'Xodimning kassadagi akkaunti',
      kpiSelectAccount: 'Faol xodim akkauntini tanlang',
      kpiAccountUnavailable: 'Tanlangan akkaunt faol emas yoki mavjud emas.',
      kpiFromCheckin: 'QR orqali kelgandan',
      kpiAccountRequired: 'O‘z buyurtmalari uchun Faol xodim akkauntini tanlang.',
      kpiAccountTaken: 'Bu akkaunt allaqachon boshqa xodimga bog‘langan. Bitta akkaunt faqat bitta xodimga KPI beradi:',
      kpiCheckinHelp: 'KPI xodim kelishda QR kodni skanerlagan paytdan ertasi kuni soat 04:00 gacha hisoblanadi. Skanerlamagan kuni KPI berilmaydi; masofaviy xodimlarda butun smena hisoblanadi.',
      kpiRateRequired: 'KPI foizini kiriting.',
      kpiDateInvalid: 'KPI sanasi bugundan oldin bo‘lishi mumkin emas.',
      employeeSaved: 'O‘zgarishlar saqlandi',
      rateTelegramFailed: 'Maosh stavkasi saqlandi, lekin Telegram xabarlari yuborilmadi.',
      profileTelegramFailed: 'Xodim ma’lumotlari saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
      kpiTelegramFailed: 'KPI sozlamasi saqlandi, lekin Maosh guruhiga Telegram xabari yuborilmadi.',
      profileOwnerOnly: 'Ism va lavozimni faqat egasi o‘zgartira oladi.',
      inactiveSettingsHint: 'Maosh va KPI faqat faol xodimlar uchun o‘zgartiriladi.',
      lifecycleNotificationFailed: 'Xodim holati saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
    },
    ru: {
      title: 'Сотрудники',
      sub: 'Список сотрудников в зарплатной системе',
      back: 'Назад к зарплатам',
      active: 'Активен',
      inactive: 'Неактивен',
      inactiveSection: 'Деактивированные сотрудники',
      inactiveSalaryDue: 'Зарплата к выплате',
      inactiveNewestFirst: 'Сначала недавно деактивированные',
      joined: 'Дата выхода',
      ended: 'Дата окончания',
      daily: 'За день',
      kpi: 'KPI',
      kpiEnabled: 'Включён',
      kpiDisabled: 'Выключен',
      kpiNotConfigured: 'Не настроен',
      kpiUnavailable: 'Недоступно',
      activeDaily: 'Активные за день',
      absentToday: 'Сегодня отсутствует',
      undoAbsence: 'Отменить отсутствие',
      undoAbsenceWarning: 'Зарплата за сегодня будет восстановлена. Отправленные сообщения Telegram не удаляются.',
      undoAbsenceFailed: 'Не удалось отменить сегодняшнее отсутствие.',
      undoAbsenceNotificationFailed: 'Отсутствие отменено, но сообщение в группу ZarKebab Investor не отправлено.',
      balance: 'Баланс',
      todayPay: 'К выплате за сегодня',
      bonusShort: 'бонус',
      fineShort: 'штраф',
      paidShort: 'выплачено',
      due: 'Долг',
      endDate: 'Дата окончания',
      status: 'Статус',
      history: 'История зарплаты',
      historyBtn: 'История',
      paymentHistory: 'Выплаты / бонусы / штрафы',
      paymentLabel: 'Выплата',
      bonusLabel: 'Бонус',
      fineLabel: 'Штраф',
      absenceHistory: 'Дни отсутствия',
      absentLabel: 'Отсутствовал',
      editName: 'Редактировать сотрудника',
      jobFunction: 'Должность',
      noJobFunction: 'Должность не указана',
      employeeName: 'Имя сотрудника',
      saveName: 'Сохранить',
      cancel: 'Отмена',
      nameRequired: 'Введите имя сотрудника.',
      deactivate: 'Деактивировать',
      reactivate: 'Включить снова',
      confirm: 'Подтвердить',
      empty: 'Сотрудники еще не добавлены',
      loadFailedTitle: 'Не удалось загрузить сотрудников',
      loadFailed: 'Не удалось прочитать данные по зарплате. Проверьте интернет и повторите.',
      saveFailed: 'Не удалось сохранить. Изменение могло не записаться: проверьте карточку и повторите.',
      linkFailed: 'Не удалось создать ссылку Telegram. Попробуйте ещё раз.',
      copyFailed: 'Не удалось скопировать. Скопируйте ссылку из поля вручную.',
      screenActionFailed: 'Не удалось изменить ссылку экрана. Попробуйте ещё раз.',
      close: 'Закрыть',
      migration: 'Таблицы зарплат не обновлены. Запустите миграции employee_salary в Supabase SQL Editor.',
      checkinQr: 'Экран отметки',
      checkinScreenHelp: 'Откройте эту ссылку на планшете или телефоне у входа и оставьте включённым. Экран показывает QR, который меняется каждые 15 секунд, поэтому сохранённый или пересланный код перестаёт работать примерно через 2 минуты. Сотрудник сканирует его камерой телефона и нажимает «Start» в боте.',
      screenNone: 'Ссылка экрана ещё не создана.',
      screenOnline: 'Экран работает',
      screenOffline: 'Экран не на связи',
      screenNeverOpened: 'Ссылка создана, экран ещё не открыт',
      screenLastSeen: 'последняя связь',
      createScreenLink: 'Создать ссылку экрана',
      replaceScreenLink: 'Создать новую ссылку',
      replaceScreenWarning: 'Текущий экран перестанет работать, пока на нём не откроют новую ссылку.',
      screenLinkOnce: 'Ссылка показывается только один раз. Отсканируйте QR камерой устройства у входа или скопируйте ссылку и откройте её там.',
      screenQrAlt: 'QR-код ссылки на экран отметки',
      copyLink: 'Копировать',
      linkCopied: 'Скопировано',
      openHere: 'Открыть на этом устройстве',
      turnOffScreen: 'Отключить экран',
      turnOffWarning: 'Сотрудники не смогут отмечаться, пока не откроют новую ссылку экрана.',
      screenLoadFailed: 'Не удалось загрузить состояние экрана.',
      retry: 'Повторить',
      checkinBotMissing: 'VITE_TELEGRAM_BOT_USERNAME не настроен.',
      checkedInToday: 'Отметились сегодня',
      notCheckedIn: 'Не отметился',
      present: 'Пришёл',
      workStart: 'Начало смены',
      workStartNotSet: 'Не задано',
      setWorkStart: 'Задать время',
      clearWorkStart: 'Убрать время',
      worksRemotely: 'Удалённо',
      worksRemotelyHint: 'Отмечаться по QR не нужно',
      hour: 'Час',
      minute: 'Минута',
      done: 'Готово',
      addEmployee: 'Добавить сотрудника',
      telegram: 'Telegram',
      telegramLinked: 'Подключён',
      telegramNotLinked: 'Не подключён',
      telegramMuted: 'Уведомления выкл.',
      telegramConnect: 'Создать ссылку Telegram',
      telegramNewLink: 'Новая ссылка',
      telegramHelp: 'Сотрудник сканирует QR или открывает ссылку и нажимает «Start» в боте.',
      telegramWaiting: 'Ждём, когда сотрудник нажмёт «Start» в боте',
      telegramQrAlt: 'QR-код ссылки Telegram сотрудника',
      telegramBotMissing: 'Не настроен VITE_TELEGRAM_BOT_USERNAME.',
      profileSection: 'Сотрудник',
      salarySection: 'Зарплата',
      salaryAmount: 'Сумма зарплаты',
      salaryUnit: 'Тип зарплаты',
      unitDaily: 'Дневная',
      unitMonthly: 'Месячная',
      effectiveDate: 'Действует с',
      salaryDateLimit: 'Дата зарплаты не может быть раньше, чем три дня назад.',
      salaryAmountRequired: 'Введите сумму зарплаты.',
      kpiOn: 'KPI включён',
      kpiOff: 'KPI выключен',
      kpiRate: 'Процент KPI',
      kpiBasis: 'База расчёта',
      kpiOwnOrders: 'Свои открытые заказы',
      kpiAllDineIn: 'Все оплаченные заказы в зале',
      kpiAccount: 'Учётная запись сотрудника',
      kpiSelectAccount: 'Выберите активного сотрудника',
      kpiAccountUnavailable: 'Выбранная учётная запись неактивна или недоступна.',
      kpiFromCheckin: 'С отметки по QR',
      kpiAccountRequired: 'Для расчёта по своим заказам выберите учётную запись сотрудника.',
      kpiAccountTaken: 'Эта учётная запись уже привязана к другому сотруднику. Одна запись начисляет KPI только одному сотруднику:',
      kpiCheckinHelp: 'KPI считается с момента сканирования QR при приходе до 04:00 следующего утра. Без отметки KPI за день не начисляется; удалённым сотрудникам считается вся смена.',
      kpiRateRequired: 'Укажите процент KPI.',
      kpiDateInvalid: 'Дата KPI не может быть в прошлом.',
      employeeSaved: 'Изменения сохранены',
      rateTelegramFailed: 'Ставка зарплаты сохранена, но сообщения в Telegram не отправлены.',
      profileTelegramFailed: 'Данные сотрудника сохранены, но сообщение в группу ZarKebab Investor не отправлено.',
      kpiTelegramFailed: 'Настройка KPI сохранена, но сообщение в группу зарплат не отправлено.',
      profileOwnerOnly: 'Имя и должность может менять только владелец.',
      inactiveSettingsHint: 'Зарплату и KPI можно менять только у активных сотрудников.',
      lifecycleNotificationFailed: 'Статус сотрудника сохранён, но сообщение в группу ZarKebab Investor не отправлено.',
    },
    en: {
      title: 'Employees',
      sub: 'Employee list from the salary system',
      back: 'Back to salaries',
      active: 'Active',
      inactive: 'Inactive',
      inactiveSection: 'Deactivated employees',
      inactiveSalaryDue: 'Salary due',
      inactiveNewestFirst: 'Most recently deactivated first',
      joined: 'Joined',
      ended: 'Ended',
      daily: 'Daily',
      kpi: 'KPI',
      kpiEnabled: 'Enabled',
      kpiDisabled: 'Disabled',
      kpiNotConfigured: 'Not configured',
      kpiUnavailable: 'Unavailable',
      activeDaily: 'Active daily',
      absentToday: 'Absent today',
      undoAbsence: 'Undo absence',
      undoAbsenceWarning: "Today's salary will be restored. Sent Telegram messages are not recalled.",
      undoAbsenceFailed: "Could not undo today's absence.",
      undoAbsenceNotificationFailed: 'Absence was undone, but the ZarKebab Investor group notification was not sent.',
      balance: 'Balance',
      todayPay: 'Payable today',
      bonusShort: 'bonus',
      fineShort: 'fine',
      paidShort: 'paid',
      due: 'Due',
      endDate: 'End date',
      status: 'Status',
      history: 'Salary history',
      historyBtn: 'History',
      paymentHistory: 'Payments / bonuses / fines',
      paymentLabel: 'Payment',
      bonusLabel: 'Bonus',
      fineLabel: 'Fine',
      absenceHistory: 'Absent dates',
      absentLabel: 'Absent',
      editName: 'Edit employee',
      jobFunction: 'Role',
      noJobFunction: 'Role not assigned',
      employeeName: 'Employee name',
      saveName: 'Save',
      cancel: 'Cancel',
      nameRequired: 'Enter the employee name.',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      confirm: 'Confirm',
      empty: 'No employees added yet',
      loadFailedTitle: 'Could not load employees',
      loadFailed: 'Could not read salary data. Check the connection and try again.',
      saveFailed: 'Could not save. The change may not have been stored: check the card and try again.',
      linkFailed: 'Could not create the Telegram link. Try again.',
      copyFailed: 'Could not copy. Copy the link from the field by hand.',
      screenActionFailed: 'Could not change the screen link. Try again.',
      close: 'Close',
      migration: 'Salary tables are not up to date. Run the employee_salary migrations in Supabase SQL Editor.',
      checkinQr: 'Check-in screen',
      checkinScreenHelp: 'Open this link on a tablet or phone at the entrance and leave it on. It shows a QR that changes every 15 seconds, so a saved or forwarded code stops working within about 2 minutes. Employees scan it with their phone camera and tap “Start” in the bot.',
      screenNone: 'No screen link yet.',
      screenOnline: 'Screen online',
      screenOffline: 'Screen offline',
      screenNeverOpened: 'Link created, screen not opened yet',
      screenLastSeen: 'last seen',
      createScreenLink: 'Create screen link',
      replaceScreenLink: 'Create new link',
      replaceScreenWarning: 'The current screen stops working until the new link is opened on it.',
      screenLinkOnce: 'This link is shown only once. Scan the QR with the entrance device’s camera, or copy the link and open it there.',
      screenQrAlt: 'QR code of the check-in screen link',
      copyLink: 'Copy',
      linkCopied: 'Copied',
      openHere: 'Open on this device',
      turnOffScreen: 'Turn off screen',
      turnOffWarning: 'Employees cannot check in until a new screen link is opened.',
      screenLoadFailed: 'Could not load the screen status.',
      retry: 'Retry',
      checkinBotMissing: 'VITE_TELEGRAM_BOT_USERNAME is not configured.',
      checkedInToday: 'Checked in today',
      notCheckedIn: 'Not checked in',
      present: 'Arrived',
      workStart: 'Work starts',
      workStartNotSet: 'Not set',
      setWorkStart: 'Set time',
      clearWorkStart: 'Clear time',
      worksRemotely: 'Remote',
      worksRemotelyHint: 'No QR check-in needed',
      hour: 'Hour',
      minute: 'Minute',
      done: 'Done',
      addEmployee: 'Add employee',
      telegram: 'Telegram',
      telegramLinked: 'Linked',
      telegramNotLinked: 'Not linked',
      telegramMuted: 'Notifications off',
      telegramConnect: 'Create Telegram link',
      telegramNewLink: 'New link',
      telegramHelp: 'The employee scans the QR or opens the link and presses Start in the bot.',
      telegramWaiting: 'Waiting for the employee to press Start in the bot',
      telegramQrAlt: 'QR code of the employee Telegram link',
      telegramBotMissing: 'VITE_TELEGRAM_BOT_USERNAME is not configured.',
      profileSection: 'Employee',
      salarySection: 'Salary',
      salaryAmount: 'Salary amount',
      salaryUnit: 'Salary type',
      unitDaily: 'Daily',
      unitMonthly: 'Monthly',
      effectiveDate: 'Effective from',
      salaryDateLimit: 'Salary dates cannot be more than three days before today.',
      salaryAmountRequired: 'Enter the salary amount.',
      kpiOn: 'KPI enabled',
      kpiOff: 'KPI disabled',
      kpiRate: 'KPI percentage',
      kpiBasis: 'Calculation basis',
      kpiOwnOrders: 'Own opened orders',
      kpiAllDineIn: 'All paid dine-in orders',
      kpiAccount: 'Employee POS account',
      kpiSelectAccount: 'Select an active employee account',
      kpiAccountUnavailable: 'Selected account is inactive or unavailable.',
      kpiFromCheckin: 'From QR check-in',
      kpiAccountRequired: 'Select an active employee account for own-order KPI.',
      kpiAccountTaken: 'This account is already linked to another employee. One account earns KPI for one employee only:',
      kpiCheckinHelp: 'KPI counts from the arrival QR scan until 04:00 the next morning. No check-in means no KPI that day; remote employees get the whole shift.',
      kpiRateRequired: 'Enter a KPI percentage.',
      kpiDateInvalid: 'The KPI date cannot be in the past.',
      employeeSaved: 'Changes saved',
      rateTelegramFailed: 'The salary rate was saved, but Telegram messages were not sent.',
      profileTelegramFailed: 'The employee details were saved, but the ZarKebab Investor group notification was not sent.',
      kpiTelegramFailed: 'The KPI setting was saved, but the Salary group message was not sent.',
      profileOwnerOnly: 'Only the owner can change the name and role.',
      inactiveSettingsHint: 'Salary and KPI can only be changed for active employees.',
      lifecycleNotificationFailed: 'The employee status was saved, but the ZarKebab Investor group notification was not sent.',
    },
  }
  const l = L[lang] || L.en

  const [employees, setEmployees] = useState([])
  const [kpiRules, setKpiRules] = useState([])
  const [kpiRulesAvailable, setKpiRulesAvailable] = useState(true)
  const [kpiAccounts, setKpiAccounts] = useState([])
  // null = links could not be read, so the card hides Telegram instead of guessing.
  const [telegramLinks, setTelegramLinks] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [confirmActionKey, setConfirmActionKey] = useState('')
  const [deactivateDates, setDeactivateDates] = useState({})
  const [inactiveExpanded, setInactiveExpanded] = useState(false)
  const [editingNameId, setEditingNameId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [editingJobFunction, setEditingJobFunction] = useState('')
  const [editingWorkStart, setEditingWorkStart] = useState('')
  const [editingRemote, setEditingRemote] = useState(false)
  const [salaryForm, setSalaryForm] = useState(null)
  const [kpiForm, setKpiForm] = useState(null)
  const [editError, setEditError] = useState('')
  // Brief "saved" popup after the edit dialog closes: { id, name }.
  const [savedNotice, setSavedNotice] = useState(null)
  useEffect(() => {
    if (!savedNotice) return undefined
    const timer = setTimeout(() => setSavedNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [savedNotice])
  const [telegramInvite, setTelegramInvite] = useState(null)
  const [newEmployeeOpen, setNewEmployeeOpen] = useState(false)
  const [checkins, setCheckins] = useState(() => new Map())
  // Until today's first check-in read lands, nobody is shown as present or missing.
  const [checkinsLoaded, setCheckinsLoaded] = useState(false)
  // Assume check-ins exist until the query says otherwise, so the KPI row and header
  // keep their final shape instead of growing a tile once the first poll returns.
  const [attendanceAvailable, setAttendanceAvailable] = useState(true)
  const [screenOpen, setScreenOpen] = useState(false)
  const [screenState, setScreenState] = useState({ loading: false, active: null, error: '' })
  const [screenLink, setScreenLink] = useState('')
  const [screenConfirm, setScreenConfirm] = useState('')
  const [screenBusy, setScreenBusy] = useState(false)
  const [screenCopied, setScreenCopied] = useState(false)
  const [screenQr, setScreenQr] = useState('')
  // Error codes, translated at render; raw database text goes to the console only.
  const [error, setError] = useState('')
  // A failed ledger read: no card, balance or total is shown until a retry succeeds.
  const [loadError, setLoadError] = useState('')

  async function loadEmployees() {
    setLoading(true)
    setError('')
    setLoadError('')
    const [teamRes, profileRes, rateRes, paymentRes, bonusRes, fineRes, absenceRes, kpiRuleRes, telegramLinkRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, status, created_at').order('full_name'),
      loadSalaryRows(() => supabase.from('employee_salary_profiles').select('*').order('employee_name')),
      loadSalaryRows(() => supabase.from('employee_salary_rates').select('*').order('effective_from', { ascending: false })),
      loadSalaryRows(() => supabase.from('employee_salary_payments').select('*')),
      loadSalaryRows(() => supabase.from('employee_salary_bonuses').select('*')),
      loadSalaryRows(() => supabase.from('employee_salary_fines').select('*')),
      loadSalaryRows(() => supabase.from('employee_salary_absences').select('*')),
      supabase.from('employee_kpi_rules')
        .select('id, salary_profile_id, effective_from, rate_bps, is_enabled, sales_basis, order_opener_profile_id, start_time, created_at, updated_at')
        .lte('effective_from', today)
        .order('effective_from', { ascending: false })
        .order('updated_at', { ascending: false }),
      supabase.from('employee_salary_telegram_links').select('salary_profile_id, notifications_enabled'),
    ])

    setKpiRules(kpiRuleRes.error ? [] : kpiRuleRes.data || [])
    setKpiRulesAvailable(!kpiRuleRes.error)
    setKpiAccounts(teamRes.error ? [] : getActiveKpiAccounts(teamRes.data || []))
    setTelegramLinks(telegramLinkRes.error ? null : new Map((telegramLinkRes.data || []).map(link => [link.salary_profile_id, link])))

    const salaryError = getSalaryLedgerLoadError([profileRes, rateRes, paymentRes, bonusRes, absenceRes], fineRes)
    if (salaryError) {
      console.error('[employees] ledger load failed:', salaryError)
      setLoadError(isMissingSalaryMigration(salaryError) ? 'migration' : 'loadFailed')
      setEmployees([])
    } else {
      // Only a database from before the fines migration gets here with a fines error.
      if (fineRes.error) setError('migration')
      setEmployees(composeEmployees(
        profileRes.data || [],
        rateRes.data || [],
        paymentRes.data || [],
        bonusRes.data || [],
        fineRes.data || [],
        absenceRes.data || [],
        teamRes.data || [],
      ).filter(employee => !employee.deleted_at))
    }
    setLoading(false)
  }

  useEffect(() => { loadEmployees() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Arrivals come from the Telegram bot, so poll today's check-ins quietly.
  useEffect(() => {
    let cancelled = false
    async function loadCheckins() {
      const { data, error: checkinError } = await supabase
        .from('employee_attendance_checkins')
        .select('salary_profile_id, business_date, checked_in_at, scheduled_start_time, minutes_late, arrival_status')
        .eq('business_date', today)
      if (cancelled) return
      setAttendanceAvailable(!checkinError)
      if (!checkinError) setCheckins(new Map((data || []).map(row => [row.salary_profile_id, row])))
      setCheckinsLoaded(true)
    }
    setCheckinsLoaded(false)
    loadCheckins()
    const timer = window.setInterval(loadCheckins, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [today])

  // The new link is shown once; its QR lets the entrance device scan it.
  useEffect(() => {
    let cancelled = false
    setScreenQr('')
    if (!screenLink) return undefined
    buildAttendanceKioskQrDataUrl(screenLink)
      .then(dataUrl => { if (!cancelled) setScreenQr(dataUrl) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [screenLink])

  const botConfigured = Boolean(String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim())

  async function loadScreenStatus() {
    setScreenState(current => ({ ...current, loading: true, error: '' }))
    const { data, error: statusError } = await supabase.rpc('get_attendance_kiosk_status')
    if (statusError) console.error('[employees] check-in screen status failed:', statusError)
    setScreenState({ loading: false, active: statusError ? null : data?.[0] || null, error: statusError ? 'screenLoadFailed' : '' })
  }

  function openScreenDialog() {
    setScreenOpen(true)
    setScreenLink('')
    setScreenConfirm('')
    setScreenCopied(false)
    loadScreenStatus()
  }

  // A new link revokes the old screen, so replacing or turning off asks twice.
  async function createScreenLink() {
    if (screenState.active && screenConfirm !== 'replace') {
      setScreenConfirm('replace')
      return
    }
    setScreenBusy(true)
    setScreenConfirm('')
    const { data: key, error: createError } = await supabase.rpc('create_attendance_kiosk')
    setScreenBusy(false)
    if (createError || !key) {
      console.error('[employees] check-in screen link failed:', createError)
      setScreenState(current => ({ ...current, error: 'screenActionFailed' }))
      return
    }
    setScreenLink(buildAttendanceKioskUrl(window.location.origin, key))
    setScreenCopied(false)
    loadScreenStatus()
  }

  async function turnOffScreen() {
    if (screenConfirm !== 'off') {
      setScreenConfirm('off')
      return
    }
    setScreenBusy(true)
    setScreenConfirm('')
    const { error: revokeError } = await supabase.rpc('revoke_attendance_kiosks')
    setScreenBusy(false)
    if (revokeError) {
      console.error('[employees] check-in screen was not turned off:', revokeError)
      setScreenState(current => ({ ...current, error: 'screenActionFailed' }))
      return
    }
    setScreenLink('')
    loadScreenStatus()
  }

  async function copyScreenLink() {
    try {
      await navigator.clipboard.writeText(screenLink)
      setScreenCopied(true)
    } catch {
      setScreenCopied(false)
    }
  }

  const activeEmployees = useMemo(() => employees.filter(item => item.is_active !== false), [employees])
  const absentTodayEmployeeIds = useMemo(() => new Set(
    activeEmployees
      .filter(employee => getSalaryAbsenceDates(employee).has(today))
      .map(employee => employee.id)
  ), [activeEmployees, today])
  const defaultActiveEmployees = useMemo(() => (
    [...activeEmployees].sort((a, b) => (
      getDailySalaryAmount(a, getSalaryActiveUntil(a, today)) - getDailySalaryAmount(b, getSalaryActiveUntil(b, today)) ||
      employeeName(a).localeCompare(employeeName(b))
    ))
  ), [activeEmployees, today])
  const defaultInactiveEmployees = useMemo(() => (
    employees
      .filter(item => item.is_active === false)
      .sort((a, b) => (
        String(b.ended_at || '').localeCompare(String(a.ended_at || '')) ||
        employeeName(a).localeCompare(employeeName(b))
      ))
  ), [employees])
  const sortedActiveEmployees = defaultActiveEmployees
  const inactiveEmployees = defaultInactiveEmployees
  const employeeGridEntries = [
    ...sortedActiveEmployees.map(employee => ({ type: 'employee', employee })),
    ...(inactiveEmployees.length > 0 ? [{ type: 'inactive-toggle', id: 'inactive-toggle' }] : []),
    ...(inactiveExpanded ? inactiveEmployees.map(employee => ({ type: 'employee', employee })) : []),
  ]
  const activeCount = activeEmployees.length
  // Shimmer only the first load; later reloads keep the last figures and roll to the new ones.
  const tilesLoading = loading && employees.length === 0
  const absentTodayCount = absentTodayEmployeeIds.size
  // Check-in stats appear from ATTENDANCE_START_DATE; the screen link and work start times can be set up before.
  const attendanceLive = attendanceAvailable && isAttendanceStarted(today)
  // Remote employees never scan: they leave the check-in count and their daily pay always counts as present.
  const attendanceTrackedEmployees = activeEmployees.filter(employee => employee.works_remotely !== true)
  const checkedInCount = attendanceTrackedEmployees.filter(employee => checkins.has(employee.id)).length
  const activeDailySalary = useMemo(() => (
    activeEmployees.reduce((sum, item) => sum + getDailySalaryAmount(item, today), 0)
  ), [activeEmployees, today])
  // Daily pay of the employees who checked in today, out of the full active daily payroll.
  const checkedInDailySalary = useMemo(() => (
    activeEmployees.reduce((sum, item) => sum + (checkins.has(item.id) || item.works_remotely === true ? getDailySalaryAmount(item, today) : 0), 0)
  ), [activeEmployees, checkins, today])
  // Today's pay across the team: daily pay of those not absent, plus today's bonuses, minus today's fines.
  const todaySalary = useMemo(() => employees.reduce((sum, item) => {
    const day = getSalaryDaySummary(item, today)
    return {
      earned: sum.earned + day.earned,
      bonuses: sum.bonuses + day.bonuses,
      fines: sum.fines + day.fines,
      paid: sum.paid + day.paid,
    }
  }, { earned: 0, bonuses: 0, fines: 0, paid: 0 }), [employees, today])
  const totalDue = useMemo(() => getTotalSalaryDue(employees, today), [employees, today])
  const inactiveSalaryDue = useMemo(() => getTotalSalaryDue(inactiveEmployees, today), [inactiveEmployees, today])

  async function toggleEmployeeActive(employee) {
    if (!canManage || !employee?.id) return
    const key = `employee-toggle-${employee.id}`
    const nextActive = employee.is_active === false
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      if (!nextActive) {
        setDeactivateDates(current => ({
          ...current,
          [employee.id]: normalizeSalaryEndDate(employee, current[employee.id], today),
        }))
      }
      return
    }
    setSaving(key)
    setError('')
    if (nextActive) {
      const absenceRows = buildSalaryReactivationAbsenceRows(employee, today)
      if (absenceRows.length > 0) {
        const { error: absenceError } = await supabase
          .from('employee_salary_absences')
          .upsert(absenceRows, { onConflict: 'salary_profile_id,absence_date', ignoreDuplicates: true })
        if (absenceError) {
          setSaving('')
          setConfirmActionKey('')
          console.error('[employees] reactivation absences were not saved:', absenceError)
          setError('saveFailed')
          return
        }
      }
    }
    const patch = nextActive
      ? { is_active: true, ended_at: null }
      : { is_active: false, ended_at: normalizeSalaryEndDate(employee, deactivateDates[employee.id], today) }
    const { error: updateError } = await supabase
      .from('employee_salary_profiles')
      .update(patch)
      .eq('id', employee.id)
    setSaving('')
    setConfirmActionKey('')
    if (updateError) {
      console.error('[employees] employee status was not saved:', updateError)
      setError('saveFailed')
      return
    }
    setDeactivateDates(current => {
      const next = { ...current }
      delete next[employee.id]
      return next
    })
    const notification = await notifyTelegramEmployeeLifecycle(
      employee.id,
      nextActive ? 'activated' : 'deactivated',
    )
    await loadEmployees()
    if (!notification?.ok) setError('lifecycleNotificationFailed')
  }

  async function undoEmployeeAbsence(employee) {
    if (!canManage || !employee?.id) return
    const absence = getSalaryAbsenceForDate(employee, today)
    if (!absence?.id) {
      await loadEmployees()
      setError('undoAbsenceFailed')
      return
    }
    const key = `absence-undo-${employee.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }

    setSaving(key)
    setError('')
    const { data, error: deleteError } = await supabase
      .from('employee_salary_absences')
      .delete()
      .eq('id', absence.id)
      .eq('salary_profile_id', employee.id)
      .eq('absence_date', today)
      .select('id')
    setSaving('')
    setConfirmActionKey('')
    if (deleteError || !data?.length) {
      if (deleteError) console.error('[employees] absence was not undone:', deleteError)
      setError('undoAbsenceFailed')
      return
    }
    const notification = await notifyTelegramAbsenceUndo(absence.id)
    await loadEmployees()
    if (!notification?.ok) setError('undoAbsenceNotificationFailed')
  }
  // Tapping a card opens one dialog for profile, salary and KPI changes.
  function openEmployeeEditor(employee) {
    if (!canManage || !employee?.id) return
    setEditingNameId(employee.id)
    setEditingName(employeeName(employee))
    setEditingJobFunction(employee.job_function || '')
    setEditingWorkStart(normalizeWorkStartTime(employee.work_start_time))
    setEditingRemote(employee.works_remotely === true)
    setSalaryForm(buildEmployeeSalaryForm(employee, today))
    setKpiForm(buildEmployeeKpiForm(kpiRules, employee, today))
    setTelegramInvite(null)
    setConfirmActionKey('')
    setEditError('')
  }

  function startNameEdit(employee) {
    if (!canEditName || !employee?.id) return
    openEmployeeEditor(employee)
  }

  function cancelNameEdit() {
    setEditingNameId(null)
    setEditingName('')
    setEditingJobFunction('')
    setEditingWorkStart('')
    setEditingRemote(false)
    setSalaryForm(null)
    setKpiForm(null)
    setTelegramInvite(null)
    setEditError('')
  }

  function isEmployeeProfileChanged(employee) {
    return editingName.trim() !== employeeName(employee)
      || (editingJobFunction || '') !== (employee.job_function || '')
      || editingWorkStart !== normalizeWorkStartTime(employee.work_start_time)
      || editingRemote !== (employee.works_remotely === true)
  }

  async function saveEmployeeName(employee) {
    if (!canEditName || !employee?.id || editingNameId !== employee.id) return false
    const nextName = editingName.trim()
    if (!nextName) {
      setEditError('nameRequired')
      return false
    }

    // One update, so migration 250's trigger records one Investor event per save.
    const { error: updateError } = await supabase
      .from('employee_salary_profiles')
      .update({
        employee_name: nextName,
        job_function: editingJobFunction || null,
        work_start_time: editingWorkStart || null,
        // Sent only once migration 252 added the column, so older databases keep saving.
        ...('works_remotely' in employee ? { works_remotely: editingRemote } : {}),
      })
      .eq('id', employee.id)
    if (updateError) {
      console.error('[employees] employee details were not saved:', updateError)
      setEditError('saveFailed')
      return false
    }
    void notifyTelegramEmployeeProfileChange(employee.id)
      .then(result => { if (!result?.ok && result?.status !== 'skipped') setError('profileTelegramFailed') })
    return true
  }

  // Background delivery: a failed message never blocks or undoes the saved change.
  function notifySalaryChangeInBackground(send, eventId, failureMessage) {
    if (!eventId) return
    void send(eventId)
      .then(result => {
        const delivered = ['sent', 'confirmed'].includes(result?.employee?.status)
          || result?.employeeIncludedInDailySummary === true
          || result?.group?.status === 'sent'
        if (!delivered) setError(failureMessage)
      })
      .catch(() => setError(failureMessage))
  }

  async function saveEmployeeSalary(employee) {
    const amount = normalizeExpenseAmount(salaryForm.salary_amount)
    if (amount <= 0) {
      setEditError('salaryAmountRequired')
      return false
    }
    if (!isExpenseEntryDateAllowed(salaryForm.effective_from, today)) {
      setEditError('salaryDateLimit')
      return false
    }
    const isInitialRate = (employee.rates || []).length === 0
    const { data: savedRate, error: rateError } = await supabase
      .from('employee_salary_rates')
      .insert(buildSalaryRatePayload({
        salaryProfileId: employee.id,
        effectiveFrom: salaryForm.effective_from,
        amount,
        salaryUnit: salaryForm.salary_unit,
        createdBy: profile?.id || null,
      }))
      .select('id')
      .single()
    if (rateError) {
      console.error('[employees] salary rate was not saved:', rateError)
      setEditError('saveFailed')
      return false
    }
    if (!isInitialRate) notifySalaryChangeInBackground(notifyTelegramEmployeeRate, savedRate?.id, 'rateTelegramFailed')
    return true
  }

  async function saveEmployeeKpi(employee) {
    const formError = getEmployeeKpiFormError({
      form: kpiForm,
      salaryProfileId: employee.id,
      today,
      kpiAccounts,
      kpiAccountLinks: getKpiAccountLinks(kpiRules, activeEmployees, today),
    })
    if (formError) {
      setEditError(formError.code === 'account_taken'
        ? { code: 'kpiAccountTaken', detail: formError.conflicts.map(item => employeeName(item, l.profileSection)).join(', ') }
        : {
          date: 'kpiDateInvalid',
          rate: 'kpiRateRequired',
          account_required: 'kpiAccountRequired',
        }[formError.code])
      return false
    }
    const payload = buildEmployeeKpiRulePayload({
      form: kpiForm,
      salaryProfileId: employee.id,
      createdBy: profile?.id || null,
      createdByName: profile?.full_name || profile?.email || state.user?.name || '',
    })
    const configurationChanged = isKpiRulePayloadChanged(kpiRules, payload)
    const { data: savedRule, error: saveError } = await supabase
      .from('employee_kpi_rules')
      .upsert(payload, { onConflict: 'salary_profile_id,effective_from' })
      .select('id, last_change_event_id')
      .single()
    if (saveError) {
      console.error('[employees] KPI rule was not saved:', saveError)
      setEditError('saveFailed')
      return false
    }
    if (configurationChanged) {
      notifySalaryChangeInBackground(notifyTelegramKpiRuleChange, savedRule?.last_change_event_id, 'kpiTelegramFailed')
    }
    return true
  }

  // Each part is saved only when it changed. After a partial failure the reload
  // refreshes the baselines, so a retry skips what was already stored.
  // Which parts of the edit dialog differ from the saved employee; Save stays disabled until one does.
  function getEmployeeEditChanges(employee) {
    const editable = employee.is_active !== false
    return {
      profileChanged: Boolean(canEditName && isEmployeeProfileChanged(employee)),
      salaryChanged: Boolean(editable && salaryForm && isEmployeeSalaryChanged(employee, salaryForm, today)),
      kpiChanged: Boolean(editable && kpiRulesAvailable && kpiForm && isEmployeeKpiChanged(kpiRules, employee, kpiForm, today)),
    }
  }

  async function saveEmployeeEdits() {
    const employee = employees.find(item => item.id === editingNameId)
    if (!canManage || !employee) return
    const { profileChanged, salaryChanged, kpiChanged } = getEmployeeEditChanges(employee)
    if (!profileChanged && !salaryChanged && !kpiChanged) {
      cancelNameEdit()
      return
    }

    setSaving(`employee-edit-${employee.id}`)
    setEditError('')
    setError('')
    let ok = true
    let wroteAny = false
    for (const [changed, save] of [
      [profileChanged, saveEmployeeName],
      [salaryChanged, saveEmployeeSalary],
      [kpiChanged, saveEmployeeKpi],
    ]) {
      if (!changed) continue
      ok = await save(employee)
      if (!ok) break
      wroteAny = true
    }
    setSaving('')
    if (ok) {
      cancelNameEdit()
      setSavedNotice({ id: Date.now(), name: editingName.trim() || employeeName(employee, l.profileSection) })
    }
    if (wroteAny) await loadEmployees()
  }

  // Same one-time link as Salaries: the bot binds the chat when the employee presses Start.
  async function createEmployeeTelegramLink(employee) {
    const botUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '')
    if (!canManage || !employee?.id) return
    if (!botUsername) {
      setEditError('telegramBotMissing')
      return
    }
    setEditError('')
    setTelegramInvite({ employeeId: employee.id, url: '', qr: '', loading: true, copied: false })
    const { data: token, error: linkError } = await supabase.rpc('create_employee_salary_telegram_link', {
      target_salary_profile_id: employee.id,
    })
    if (linkError || !token) {
      console.error('[employees] Telegram link failed:', linkError)
      setTelegramInvite(null)
      setEditError('linkFailed')
      return
    }
    const url = `https://t.me/${botUsername}?start=employee_${token}`
    setTelegramInvite({ employeeId: employee.id, url, qr: '', loading: false, copied: false })
    // Rendered in the browser so the one-time token never reaches a hosted QR service.
    import('qrcode')
      .then(QRCode => QRCode.default.toDataURL(url, { width: 280, margin: 1, errorCorrectionLevel: 'M' }))
      .then(qr => setTelegramInvite(current => (current?.url === url ? { ...current, qr } : current)))
      .catch(() => {})
  }

  async function copyEmployeeTelegramLink() {
    if (!telegramInvite?.url) return
    try {
      await navigator.clipboard.writeText(telegramInvite.url)
      setTelegramInvite(current => current && { ...current, copied: true })
    } catch {
      setEditError('copyFailed')
    }
  }

  const pendingTelegramEmployeeId = telegramInvite?.url && !telegramLinks?.has(telegramInvite.employeeId)
    ? telegramInvite.employeeId
    : ''
  // While a link is open, quietly check whether the employee has pressed Start.
  useEffect(() => {
    if (!pendingTelegramEmployeeId) return undefined
    let cancelled = false
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from('employee_salary_telegram_links')
        .select('salary_profile_id, notifications_enabled')
        .eq('salary_profile_id', pendingTelegramEmployeeId)
        .maybeSingle()
      if (cancelled || !data) return
      setTelegramLinks(current => new Map(current || []).set(data.salary_profile_id, data))
      setTelegramInvite(null)
    }, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [pendingTelegramEmployeeId])

  const editingEmployee = canManage ? employees.find(item => item.id === editingNameId) || null : null
  const errorText = error ? l[error] || l.saveFailed : ''
  const editErrorText = !editError
    ? ''
    : typeof editError === 'string'
      ? l[editError] || l.saveFailed
      : `${l[editError.code] || l.saveFailed} ${editError.detail || ''}`.trim()
  const screenErrorText = screenState.error ? l[screenState.error] || l.screenLoadFailed : ''
  const failed = Boolean(loadError)
  const absenceTone = SALARY_ENTRY_TONES.absence

  return (
    <AppShell title={accountingTitle(lang)} tabs={buildAccountingTabs(lang, 'employees', navigate)} headerActions={canManage && (
      <div className="flex items-center gap-2">
        {attendanceAvailable && (
          <button type="button" onClick={openScreenDialog} title={l.checkinQr} aria-label={l.checkinQr} className="ws-btn ws-btn-outline ws-btn-sm">
            <MonitorSmartphone size={15} /><span className="hidden sm:inline">{l.checkinQr}</span>
          </button>
        )}
        <button type="button" onClick={() => setNewEmployeeOpen(true)} className="ws-btn ws-btn-primary ws-btn-sm">
          <Plus size={15} />{l.addEmployee}
        </button>
      </div>
    )}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          {/* Tiles reflow by their own width, so an eight-digit amount never has to break. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
            {/* Absences are a subset of the active team, so they share its tile. */}
            <Kpi loading={tilesLoading} icon={Users} label={l.active} value={activeCount}
              note={`${l.absentToday}: ${absentTodayCount}`} noteAlert={absentTodayCount > 0} unavailable={failed} />
            {attendanceLive && <Kpi loading={tilesLoading || !checkinsLoaded} icon={ScanLine} label={l.checkedInToday} value={`${checkedInCount} / ${attendanceTrackedEmployees.length}`} unavailable={failed} />}
            {attendanceLive
              ? <Kpi loading={tilesLoading || !checkinsLoaded} icon={CalendarDays} label={l.activeDaily} value={formatCurrency(checkedInDailySalary)} total={formatCurrency(activeDailySalary)} unavailable={failed} />
              : <Kpi loading={tilesLoading} icon={CalendarDays} label={l.activeDaily} value={formatCurrency(activeDailySalary)} unavailable={failed} />}
            <Kpi loading={tilesLoading} icon={HandCoins} label={l.todayPay} value={formatSalaryBalance(todaySalary.earned)}
              danger={todaySalary.earned < 0} unavailable={failed}
              note={[
                todaySalary.bonuses > 0 && `${formatSalaryEntryAmount('bonus', todaySalary.bonuses)} ${l.bonusShort}`,
                todaySalary.fines > 0 && `${formatSalaryEntryAmount('fine', todaySalary.fines)} ${l.fineShort}`,
                todaySalary.paid > 0 && `${formatCurrency(todaySalary.paid)} ${l.paidShort}`,
              ].filter(Boolean)} />
            <Kpi loading={tilesLoading} icon={WalletCards} label={l.due} value={formatCurrency(totalDue)} hot={totalDue > 0} unavailable={failed} />
          </div>

          {errorText && !failed && <div role="alert" className="ws-notice ws-tone-negative">{errorText}</div>}

          {failed ? (
            <div className="ws-panel">
              <OperationalError lang={lang} title={l.loadFailedTitle} description={l[loadError] || l.loadFailed} actionLabel={l.retry} onAction={loadEmployees} />
            </div>
          ) : tilesLoading ? (
            <PageShimmer layout="employeeCards" />
          ) : employees.length === 0 ? (
            <div className="ws-panel ws-empty"><Users /><p>{l.empty}</p></div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {employeeGridEntries.map(entry => {
                if (entry.type === 'inactive-toggle') {
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setInactiveExpanded(current => !current)}
                      aria-expanded={inactiveExpanded}
                      className="ws-panel ws-inactive-card flex min-h-20 items-center justify-between gap-4 !py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40 md:col-span-2 xl:col-span-3"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="ws-inactive-avatar flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full">
                          <Users size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-[#22201d]">{l.inactiveSection}</span>
                          <span className="ws-caption mt-0.5 block">{l.inactiveNewestFirst}</span>
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-2 sm:gap-4">
                        <span className="text-right text-[13px] text-[#68655f]">{l.inactiveSalaryDue}: <span className="whitespace-nowrap font-semibold tabular-nums text-[#22201d]">{formatCurrency(inactiveSalaryDue)}</span></span>
                        <span className="ws-count ws-tone-caution-strong flex-shrink-0">{inactiveEmployees.length}</span>
                        {inactiveExpanded ? <ChevronUp size={18} className="text-[#68655f]" /> : <ChevronDown size={18} className="text-[#68655f]" />}
                      </span>
                    </button>
                  )
                }
                const employee = entry.employee
                const inactive = employee.is_active === false
                const todayAbsence = getSalaryAbsenceForDate(employee, today)
                const absentToday = !inactive && Boolean(todayAbsence)
                const activeUntil = getSalaryActiveUntil(employee, today)
                const salaryBalance = getSalaryBalance(employee, today)
                const toggleKey = `employee-toggle-${employee.id}`
                const confirmToggle = confirmActionKey === toggleKey
                const undoAbsenceKey = `absence-undo-${employee.id}`
                const confirmUndoAbsence = confirmActionKey === undoAbsenceKey
                const joinedDate = String(employee.joined_at || '').slice(0, 10)
                const deactivateDate = normalizeSalaryEndDate(employee, deactivateDates[employee.id], today)
                const effectiveKpiRule = getEffectiveKpiRule(kpiRules, employee.id, today)
                const todayCheckin = checkins.get(employee.id)
                const workStart = normalizeWorkStartTime(employee.work_start_time)
                const remote = employee.works_remotely === true
                const showAttendance = attendanceLive && !inactive && !absentToday && !remote
                const awaitingCheckin = showAttendance && checkinsLoaded && !todayCheckin
                return (
                  <section key={employee.id} onClick={event => {
                    // Buttons and fields inside the card keep their own actions.
                    if (event.target.closest('button, a, input, select, textarea, label')) return
                    openEmployeeEditor(employee)
                  }} className={`ws-panel group flex flex-col ${canManage ? 'cursor-pointer transition-shadow hover:shadow-md' : ''} ${
                    inactive
                      ? 'ws-inactive-card'
                      : absentToday
                        ? '!border-[#9a5a00]/40 ring-2 ring-[#9a5a00]/10'
                        : awaitingCheckin
                          ? 'ws-awaiting-card'
                          : ''
                  }`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-semibold ${
                          inactive
                            ? 'ws-inactive-avatar'
                            : absentToday
                              ? 'bg-[#9a5a00]/10 text-[#9a5a00]'
                              : awaitingCheckin
                                ? 'ws-awaiting-avatar'
                                : 'bg-[#ff5a00]/10 text-[#c24400]'
                        }`}>
                          {absentToday ? <CalendarX2 size={17} aria-hidden="true" /> : (employeeName(employee).trim().charAt(0).toUpperCase() || <UserRound size={17} aria-hidden="true" />)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1">
                            <h2 className="truncate text-[15px] font-semibold text-[#22201d]">{employeeName(employee, l.profileSection)}</h2>
                            {canEditName && (
                              <button
                                type="button"
                                onClick={() => startNameEdit(employee)}
                                title={l.editName}
                                aria-label={`${l.editName}: ${employeeName(employee, l.profileSection)}`}
                                className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon text-[#68655f] transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                              >
                                <Pencil size={13} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <p className="ws-caption">{employeeJobFunctionLabel(employee.job_function, lang) || l.noJobFunction}</p>
                        </div>
                      </div>
                      {/* Active is the normal state; only call out exceptions. */}
                      {(inactive || absentToday) && (
                        <span className={`ws-status ${inactive ? 'ws-tone-caution-strong' : absenceTone.badge}`}>
                          {inactive ? l.inactive : absentToday ? l.absentToday : l.active}
                        </span>
                      )}
                      {remote && !inactive && !absentToday && (
                        <span className="ws-status ws-tone-info" title={l.worksRemotelyHint}>{l.worksRemotely}</span>
                      )}
                      {showAttendance && !checkinsLoaded && <Shimmer className="h-6 w-16 rounded-full" />}
                      {showAttendance && checkinsLoaded && (
                        <span className={`ws-status ${
                          !todayCheckin
                            ? 'ws-tone-caution'
                            : todayCheckin.arrival_status === 'late' ? 'ws-tone-caution' : 'ws-tone-positive'
                        }`}>
                          {todayCheckin ? l.present : l.notCheckedIn}
                        </span>
                      )}
                    </div>

                    {/* Amounts stay at full contrast and on one line; the two figures wrap as a pair on a narrow card. */}
                    <div className={`mt-3 flex flex-wrap items-end justify-between gap-x-5 gap-y-2 rounded-xl px-3.5 py-2.5 ${inactive ? 'ws-inactive-stats' : awaitingCheckin ? 'bg-[var(--ws-card)]' : 'bg-[#f8f6f3]'}`}>
                      <Stat
                        label={l.balance}
                        value={formatSalaryBalance(salaryBalance)}
                        hot={salaryBalance > 0}
                        negative={salaryBalance < 0}
                        large
                      />
                      <Stat label={l.daily} value={formatCurrency(getDailySalaryAmount(employee, activeUntil))} />
                    </div>

                    <dl className="mb-3 mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      <Fact label={l.joined} value={formatLongDate(employee.joined_at, lang, employee.joined_at)} />
                      {inactive && employee.ended_at && <Fact label={l.ended} value={formatLongDate(employee.ended_at, lang, employee.ended_at)} />}
                      {attendanceAvailable && !inactive && !remote && (
                        <Fact label={l.workStart} value={workStart || l.workStartNotSet} muted={!workStart} />
                      )}
                      {showAttendance && todayCheckin && (
                        <Fact label={l.present} value={formatArrivalSummary(todayCheckin, lang)} hot={todayCheckin.arrival_status === 'late'} />
                      )}
                      {telegramLinks && (
                        <Fact label={l.telegram} value={
                          <span className={`ws-badge inline-flex items-center gap-1 ${!telegramLinks.has(employee.id) ? 'ws-tone-caution' : telegramLinks.get(employee.id).notifications_enabled === false ? '' : 'ws-tone-positive'}`}>
                            <Send size={11} aria-hidden="true" />
                            {!telegramLinks.has(employee.id)
                              ? l.telegramNotLinked
                              : telegramLinks.get(employee.id).notifications_enabled === false ? l.telegramMuted : l.telegramLinked}
                          </span>
                        } />
                      )}
                      <EmployeeKpiRow
                        label={l.kpi}
                        rule={effectiveKpiRule}
                        lang={lang}
                        available={kpiRulesAvailable}
                        enabledLabel={l.kpiEnabled}
                        disabledLabel={l.kpiDisabled}
                        notConfiguredLabel={l.kpiNotConfigured}
                        unavailableLabel={l.kpiUnavailable}
                        checkinLabel={l.kpiFromCheckin}
                      />
                    </dl>

                    {!inactive && confirmToggle && (
                      <label className="ws-notice ws-tone-negative mt-3 block !px-3 !py-2">
                        <span className="mb-1 block text-[13px] font-medium">{l.endDate}</span>
                        <DateInput
                          value={deactivateDate}
                          min={joinedDate || undefined}
                          max={today}
                          lang={lang}
                          onChange={value => setDeactivateDates(current => ({
                            ...current,
                            [employee.id]: normalizeSalaryEndDate(employee, value, today),
                          }))}
                        />
                      </label>
                    )}

                    {confirmUndoAbsence && (
                      <p role="alert" className="ws-notice ws-tone-caution mt-3 !px-3 !py-2 text-[13px] leading-relaxed">
                        {l.undoAbsenceWarning}
                      </p>
                    )}

                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[#e4e1de]/60 pt-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/accounting/employees/${employee.id}/history`)}
                        className="ws-btn ws-btn-outline ws-btn-sm"
                      >
                        <History aria-hidden="true" />{l.historyBtn}
                      </button>
                      {canManage && (
                        <>
                          {absentToday && (
                            <button
                              type="button"
                              onClick={() => undoEmployeeAbsence(employee)}
                              disabled={saving === undoAbsenceKey}
                              className={`ws-btn ws-btn-sm ${
                                confirmUndoAbsence
                                  ? 'ws-btn-danger-solid'
                                  : 'ws-btn-outline'
                              }`}
                            >
                              {saving === undoAbsenceKey
                                ? <Loader2 size={14} className="animate-spin" />
                                : <CalendarCheck2 size={14} />}
                              {confirmUndoAbsence ? l.confirm : l.undoAbsence}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleEmployeeActive(employee)}
                            disabled={saving === `employee-toggle-${employee.id}`}
                            className={`ws-btn ws-btn-sm ml-auto ${
                              inactive
                                ? confirmToggle ? 'ws-btn-primary' : 'ws-btn-outline'
                                : confirmToggle ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'
                            }`}
                          >
                            {saving === toggleKey ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                            {confirmToggle ? l.confirm : inactive ? l.reactivate : l.deactivate}
                          </button>
                        </>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {newEmployeeOpen && (
        <NewEmployeeDialog
          lang={lang}
          canManage={canManage}
          onClose={() => setNewEmployeeOpen(false)}
          onCreated={async ({ notificationError }) => {
            setNewEmployeeOpen(false)
            await loadEmployees()
            if (notificationError) setError('lifecycleNotificationFailed')
          }}
        />
      )}

      {editingEmployee && (
        <EmployeeEditDialog
          employee={editingEmployee}
          l={l}
          lang={lang}
          today={today}
          canEditProfile={canEditName}
          showWorkStart={attendanceAvailable}
          kpiAvailable={kpiRulesAvailable}
          kpiAccounts={kpiAccounts}
          telegramLink={telegramLinks ? telegramLinks.get(editingEmployee.id) || false : null}
          telegramInvite={telegramInvite?.employeeId === editingEmployee.id ? telegramInvite : null}
          onCreateTelegramLink={() => createEmployeeTelegramLink(editingEmployee)}
          onCopyTelegramLink={copyEmployeeTelegramLink}
          name={editingName}
          onNameChange={setEditingName}
          jobFunction={editingJobFunction}
          onJobFunctionChange={setEditingJobFunction}
          workStart={editingWorkStart}
          onWorkStartChange={setEditingWorkStart}
          showRemote={'works_remotely' in editingEmployee}
          remote={editingRemote}
          onRemoteChange={setEditingRemote}
          salaryForm={salaryForm}
          onSalaryFormChange={setSalaryForm}
          kpiForm={kpiForm}
          onKpiFormChange={setKpiForm}
          error={editErrorText}
          saving={saving === `employee-edit-${editingEmployee.id}`}
          hasChanges={Object.values(getEmployeeEditChanges(editingEmployee)).some(Boolean)}
          onSave={saveEmployeeEdits}
          onClose={cancelNameEdit}
        />
      )}

      {screenOpen && (
        <WorkspaceDialog
          title={l.checkinQr}
          onClose={() => setScreenOpen(false)}
          closeLabel={l.close}
          busy={screenBusy}
          notice={screenConfirm && (
            <p role="alert" className="ws-notice ws-tone-caution">
              {screenConfirm === 'off' ? l.turnOffWarning : l.replaceScreenWarning}
            </p>
          )}
          footer={(
            <>
              {screenState.active && (
                <button type="button" onClick={turnOffScreen} disabled={screenBusy || screenState.loading}
                  className={`ws-btn ${screenConfirm === 'off' ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'}`}>
                  <Power aria-hidden="true" />{screenConfirm === 'off' ? l.confirm : l.turnOffScreen}
                </button>
              )}
              <button type="button" onClick={createScreenLink} disabled={screenBusy || screenState.loading || !botConfigured}
                className="ws-btn ws-btn-primary">
                {screenBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <MonitorSmartphone aria-hidden="true" />}
                {screenConfirm === 'replace' ? l.confirm : screenState.active ? l.replaceScreenLink : l.createScreenLink}
              </button>
            </>
          )}
        >
          <p className="ws-muted">{l.checkinScreenHelp}</p>
          {!botConfigured && <p role="alert" className="ws-notice ws-tone-negative mt-4">{l.checkinBotMissing}</p>}

          <div className="mt-4 flex min-h-11 flex-wrap items-center gap-2">
            {screenState.loading ? (
              <Shimmer className="h-6 w-44 rounded-full" />
            ) : screenState.active ? (
              <ScreenStatus active={screenState.active} l={l} />
            ) : !screenState.error && (
              <span className="ws-status !whitespace-normal">{l.screenNone}</span>
            )}
          </div>

          {screenErrorText && (
            <div role="alert" className="ws-notice ws-tone-negative mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 flex-1">{screenErrorText}</span>
              <button type="button" onClick={loadScreenStatus} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>
            </div>
          )}

          {screenLink && (
            <div className="ws-notice ws-tone-positive mt-3">
              <p className="text-[13px] font-medium">{l.screenLinkOnce}</p>
              <div className="mt-3 flex justify-center">
                <div className="rounded-2xl bg-white p-2 ring-1 ring-black/5">
                  {screenQr
                    ? <img src={screenQr} alt={l.screenQrAlt} className="block size-[min(60vw,220px)]" />
                    : <Shimmer className="size-[min(60vw,220px)] rounded-xl" />}
                </div>
              </div>
              <input readOnly value={screenLink} aria-label={l.checkinQr} onFocus={event => event.target.select()} className="ws-input mt-3 w-full font-mono !text-xs" />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={copyScreenLink} className="ws-btn ws-btn-outline ws-btn-sm">
                  {screenCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{screenCopied ? l.linkCopied : l.copyLink}
                </button>
                <a href={screenLink} target="_blank" rel="noopener noreferrer" className="ws-btn ws-btn-outline ws-btn-sm">
                  <ExternalLink aria-hidden="true" />{l.openHere}
                </a>
              </div>
            </div>
          )}
        </WorkspaceDialog>
      )}
      {savedNotice && (
        <div key={savedNotice.id} role="status" aria-live="polite"
          className="zk-sheet-in pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-toast mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-[#22201d] px-4 py-3 text-white shadow-[0_12px_32px_rgb(0_0_0/24%)]">
          <CheckCircle2 size={20} className="flex-shrink-0 text-[#4ade80]" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">{l.employeeSaved}</span>
            <span className="block truncate text-[12px] text-white/70">{savedNotice.name}</span>
          </span>
        </div>
      )}
    </AppShell>
  )
}

function Kpi({ icon: Icon, label, value, total = '', note = '', noteAlert = false, hot = false, danger = false, loading = false, unavailable = false }) {
  const valueTone = danger ? 'text-[#c4262c]' : hot ? 'text-[#9a5a00]' : 'text-[#22201d]'
  const notes = (Array.isArray(note) ? note : [note]).filter(Boolean)
  const show = !loading && !unavailable
  return (
    <div className="ws-panel min-w-0">
      <p className="ws-caption flex items-center gap-1.5"><Icon size={14} className="flex-shrink-0" aria-hidden="true" />{label}</p>
      {/* An amount is one unbreakable figure; the tile grid reflows instead. */}
      <p className={`mt-1 whitespace-nowrap text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${unavailable ? 'text-[#68655f]' : valueTone}`}>
        {loading ? <Shimmer className="my-1 h-6 w-28 rounded-md" /> : unavailable ? '—' : <RollingValue value={value} />}
      </p>
      {show && total && <p className="ws-caption mt-0.5 whitespace-nowrap tabular-nums">/ {total}</p>}
      {show && notes.length > 0 && (
        <p className={`ws-caption mt-0.5 flex flex-wrap gap-x-2 tabular-nums ${noteAlert ? '!text-[#9a5a00] font-medium' : ''}`}>
          {notes.map(item => <span key={item} className="whitespace-nowrap">{item}</span>)}
        </p>
      )}
    </div>
  )
}

function Fact({ label, value, hot = false, muted = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-[#68655f]">{label}</dt>
      <dd className={`mt-0.5 break-words text-[13px] font-semibold tabular-nums ${hot ? 'text-[#9a5a00]' : muted ? 'text-[#68655f]' : 'text-[#22201d]'}`}>{value}</dd>
    </div>
  )
}

function Stat({ label, value, hot = false, negative = false, large = false }) {
  const tone = negative ? 'text-[#c4262c]' : hot ? 'text-[#9a5a00]' : 'text-[#22201d]'
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-[#68655f]">{label}</p>
      <p className={`mt-0.5 whitespace-nowrap font-semibold leading-tight tabular-nums tracking-[-.01em] ${large ? 'text-[19px]' : 'text-[15px] pt-[3px]'} ${tone}`}>{value}</p>
    </div>
  )
}

function EmployeeKpiRow({
  label,
  rule,
  lang,
  available,
  enabledLabel,
  disabledLabel,
  notConfiguredLabel,
  unavailableLabel,
  checkinLabel,
}) {
  const configured = Boolean(rule)
  const enabled = configured && rule.is_enabled !== false
  const statusLabel = !available
    ? unavailableLabel
    : !configured
      ? notConfiguredLabel
      : enabled
        ? enabledLabel
        : disabledLabel

  return (
    <div className="col-span-2 min-w-0">
      <dt className="text-[12px] text-[#68655f]">{label}</dt>
      <dd className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {configured && available && (
          <span className={`text-[13px] font-semibold tabular-nums ${enabled ? 'text-[#22201d]' : 'text-[#68655f]'}`}>
            {formatKpiRatePercent(rule.rate_bps, lang)}
          </span>
        )}
        <span className={`ws-badge ${enabled ? 'ws-tone-positive' : ''}`}>
          {statusLabel}
        </span>
        {configured && available && (
          <span className="min-w-0 text-[12px] leading-snug text-[#68655f]">
            {formatKpiSalesBasis(rule.sales_basis, lang)} · {checkinLabel}
          </span>
        )}
      </dd>
    </div>
  )
}

const DIALOG_FIELD = 'ws-input !h-11 min-w-0 w-full font-medium disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]'

function DialogField({ label, children, className = '' }) {
  return (
    <label className={`ws-caption flex min-w-0 flex-col gap-1.5 font-medium ${className}`}>
      {label}
      {children}
    </label>
  )
}

function EmployeeEditDialog({
  employee,
  l,
  lang,
  today,
  canEditProfile,
  showWorkStart,
  kpiAvailable,
  kpiAccounts,
  telegramLink,
  telegramInvite,
  onCreateTelegramLink,
  onCopyTelegramLink,
  name,
  onNameChange,
  jobFunction,
  onJobFunctionChange,
  workStart,
  onWorkStartChange,
  showRemote,
  remote,
  onRemoteChange,
  salaryForm,
  onSalaryFormChange,
  kpiForm,
  onKpiFormChange,
  error,
  saving,
  hasChanges,
  onSave,
  onClose,
}) {
  const active = employee.is_active !== false
  const nameRef = useRef(null)
  const setSalary = patch => onSalaryFormChange(current => ({ ...current, ...patch }))
  const setKpi = patch => onKpiFormChange(current => ({ ...current, ...patch }))
  const ownOrders = kpiForm?.sales_basis === 'employee_opened_orders'
  const sectionTitle = 'flex items-center gap-2 text-[14px] font-semibold text-[#22201d]'

  return (
    <WorkspaceDialog
      size="lg"
      title={employeeName(employee, l.profileSection)}
      description={l.editName}
      onClose={onClose}
      closeLabel={l.cancel}
      busy={Boolean(saving)}
      initialFocusRef={canEditProfile ? nameRef : undefined}
      bodyClassName="space-y-6"
      notice={error && <p role="alert" className="ws-notice ws-tone-negative">{error}</p>}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="ws-btn ws-btn-outline">{l.cancel}</button>
          <button type="button" onClick={onSave} disabled={saving || !hasChanges} className="ws-btn ws-btn-primary">
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {l.saveName}
          </button>
        </>
      )}
    >
      <section className="space-y-3">
        <h3 className={sectionTitle}><UserRound size={15} aria-hidden="true" />{l.profileSection}</h3>
        {!canEditProfile && <p className="ws-caption">{l.profileOwnerOnly}</p>}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
          <DialogField label={l.employeeName}>
            <input ref={nameRef} type="text" value={name} maxLength={120}
              onChange={event => onNameChange(event.target.value)}
              disabled={!canEditProfile || saving} className={DIALOG_FIELD} />
          </DialogField>
          <DialogField label={l.jobFunction}>
            <select value={jobFunction} onChange={event => onJobFunctionChange(event.target.value)}
              disabled={!canEditProfile || saving} className={DIALOG_FIELD}>
              <option value="">{l.noJobFunction}</option>
              {EMPLOYEE_JOB_FUNCTIONS.map(job => (
                <option key={job.value} value={job.value}>{employeeJobFunctionLabel(job.value, lang)}</option>
              ))}
            </select>
          </DialogField>
        </div>
        {showWorkStart && active && showRemote && (
          <div className="flex items-center justify-between gap-3 rounded-[10px] bg-[#efece9] px-3 py-2">
            <span id="employee-remote-label" className="min-w-0">
              <span className="block text-sm font-medium text-[#22201d]">{l.worksRemotely}</span>
              <span className="ws-caption block !text-xs">{l.worksRemotelyHint}</span>
            </span>
            <button type="button" role="switch" aria-checked={remote} aria-labelledby="employee-remote-label"
              disabled={!canEditProfile || saving} onClick={() => onRemoteChange(!remote)} className="ws-switch" />
          </div>
        )}
        {showWorkStart && active && !remote && (
          <div className="flex items-end gap-3">
            {workStart ? (
              <>
                <div className="min-w-0 flex-1">
                  <TimePicker24 value={workStart} label={l.workStart}
                    hourLabel={l.hour} minuteLabel={l.minute} doneLabel={l.done}
                    className={DIALOG_FIELD} disabled={!canEditProfile || saving}
                    onChange={onWorkStartChange} />
                </div>
                <button type="button" onClick={() => onWorkStartChange('')} disabled={!canEditProfile || saving}
                  title={l.clearWorkStart} aria-label={l.clearWorkStart} className="ws-btn ws-btn-ghost ws-btn-icon !h-11 !w-11">
                  <X aria-hidden="true" />
                </button>
              </>
            ) : (
              <button type="button" onClick={() => onWorkStartChange('09:00')} disabled={!canEditProfile || saving} className="ws-btn ws-btn-outline ws-btn-sm">
                {l.workStart}: {l.setWorkStart}
              </button>
            )}
          </div>
        )}
      </section>

      {telegramLink !== null && (
        <section className="space-y-3 border-t border-[#e4e1de] pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className={sectionTitle}><Send size={15} aria-hidden="true" />{l.telegram}</h3>
            <span className={`ws-badge ${!telegramLink ? 'ws-tone-caution' : telegramLink.notifications_enabled === false ? '' : 'ws-tone-positive'}`}>
              {!telegramLink ? l.telegramNotLinked : telegramLink.notifications_enabled === false ? l.telegramMuted : l.telegramLinked}
            </span>
          </div>
          {!telegramLink && active && (
            telegramInvite?.url ? (
              <div className="flex flex-wrap items-start gap-3">
                <div className="mx-auto shrink-0 rounded-2xl bg-white p-2 ring-1 ring-black/5">
                  {telegramInvite.qr
                    ? <img src={telegramInvite.qr} alt={l.telegramQrAlt} className="block size-[140px]" />
                    : <Shimmer className="size-[140px] rounded-xl" />}
                </div>
                <div className="min-w-[12rem] flex-1 space-y-2">
                  <p className="ws-caption">{l.telegramHelp}</p>
                  <input readOnly value={telegramInvite.url} aria-label={l.telegram} onFocus={event => event.target.select()} className="ws-input w-full font-mono !text-xs" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onCopyTelegramLink} className="ws-btn ws-btn-outline ws-btn-sm">
                      {telegramInvite.copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{telegramInvite.copied ? l.linkCopied : l.copyLink}
                    </button>
                    <button type="button" onClick={onCreateTelegramLink} disabled={saving} className="ws-btn ws-btn-ghost ws-btn-sm">{l.telegramNewLink}</button>
                  </div>
                  <p role="status" className="flex items-center gap-2 text-[12px] font-medium text-[#9a5a00]">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#9a5a00] motion-safe:animate-pulse" aria-hidden="true" />{l.telegramWaiting}
                  </p>
                </div>
              </div>
            ) : (
              <button type="button" onClick={onCreateTelegramLink} disabled={saving || telegramInvite?.loading} className="ws-btn ws-btn-outline ws-btn-sm">
                {telegramInvite?.loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}{l.telegramConnect}
              </button>
            )
          )}
        </section>
      )}

      {!active ? (
        <p className="ws-notice">{l.inactiveSettingsHint}</p>
      ) : (
        <>
          <section className="space-y-3 border-t border-[#e4e1de] pt-5">
            <h3 className={sectionTitle}><WalletCards size={15} aria-hidden="true" />{l.salarySection}</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
              <DialogField label={l.salaryAmount}>
                <div className="relative min-w-0">
                  <input type="text" inputMode="numeric" value={formatMoneyInput(salaryForm.salary_amount)}
                    onChange={event => setSalary({ salary_amount: normalizeMoneyInput(event.target.value) })}
                    disabled={saving} className={`${DIALOG_FIELD} pr-12 tabular-nums`} />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-[#68655f]">UZS</span>
                </div>
              </DialogField>
              <DialogField label={l.salaryUnit}>
                <select value={salaryForm.salary_unit} onChange={event => setSalary({ salary_unit: event.target.value })}
                  disabled={saving} className={DIALOG_FIELD}>
                  {SALARY_RATE_UNITS.map(unit => (
                    <option key={unit} value={unit}>{unit === 'monthly' ? l.unitMonthly : l.unitDaily}</option>
                  ))}
                </select>
              </DialogField>
              <DialogField label={l.effectiveDate}>
                <DateInput value={salaryForm.effective_from} lang={lang} min={getExpenseEntryMinDate(today)}
                  onChange={value => setSalary({ effective_from: value })} disabled={saving} />
              </DialogField>
            </div>
          </section>

          {kpiAvailable && kpiForm && (
            <section className="space-y-3 border-t border-[#e4e1de] pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className={sectionTitle}><Percent size={15} aria-hidden="true" />{l.kpi}</h3>
                <span className="flex min-w-0 items-center gap-3">
                  <span id="employee-kpi-switch-label" className="ws-caption min-w-0 text-right">{kpiForm.is_enabled ? l.kpiOn : l.kpiOff}</span>
                  <button type="button" role="switch" aria-checked={kpiForm.is_enabled} aria-labelledby="employee-kpi-switch-label"
                    disabled={saving} onClick={() => setKpi({ is_enabled: !kpiForm.is_enabled })} className="ws-switch" />
                </span>
              </div>
              {kpiForm.is_enabled && (
                <>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
                    <DialogField label={l.kpiBasis}>
                      <select value={kpiForm.sales_basis} onChange={event => setKpi({ sales_basis: event.target.value })}
                        disabled={saving} className={DIALOG_FIELD}>
                        <option value="employee_opened_orders">{l.kpiOwnOrders}</option>
                        <option value="restaurant">{l.kpiAllDineIn}</option>
                      </select>
                    </DialogField>
                    <DialogField label={l.kpiRate}>
                      <div className="relative min-w-0">
                        <input type="text" inputMode="decimal" value={kpiForm.rate_percentage}
                          onChange={event => {
                            const value = event.target.value.replace(',', '.').replace(/[^\d.]/g, '')
                            if (/^\d{0,3}(?:\.\d{0,2})?$/.test(value)) setKpi({ rate_percentage: value })
                          }}
                          disabled={saving} className={`${DIALOG_FIELD} pr-9 tabular-nums`} />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-[#68655f]">%</span>
                      </div>
                    </DialogField>
                  </div>
                  {ownOrders && (
                    <DialogField label={l.kpiAccount}>
                      <select value={kpiForm.order_opener_profile_id} onChange={event => setKpi({ order_opener_profile_id: event.target.value })}
                        disabled={saving} className={DIALOG_FIELD}>
                        <option value="">{l.kpiSelectAccount}</option>
                        {kpiForm.order_opener_profile_id && !kpiAccounts.some(account => account.id === kpiForm.order_opener_profile_id) && (
                          <option value={kpiForm.order_opener_profile_id} disabled>{l.kpiAccountUnavailable}</option>
                        )}
                        {kpiAccounts.map(account => (
                          <option key={account.id} value={account.id}>{account.full_name || account.email}</option>
                        ))}
                      </select>
                    </DialogField>
                  )}
                </>
              )}
              {kpiForm.is_enabled && (
                <p className="ws-caption !text-xs">{l.kpiCheckinHelp}</p>
              )}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
                <DialogField label={l.effectiveDate}>
                  <DateInput value={kpiForm.effective_from} lang={lang} min={today}
                    onChange={value => setKpi({ effective_from: value })} disabled={saving} />
                </DialogField>
              </div>
            </section>
          )}
        </>
      )}
    </WorkspaceDialog>
  )
}

// Every date field on this page is a full-size workspace field, in the dialog and on the card.
function DateInput(props) {
  return <CalendarPicker className={DIALOG_FIELD} {...props} />
}

// The entrance screen reports in at most every 20 s; over 90 s of silence = offline.
function ScreenStatus({ active, l }) {
  if (!active.last_seen_at) return <span className="ws-status ws-tone-caution">{l.screenNeverOpened}</span>
  const online = Date.now() - new Date(active.last_seen_at).getTime() < 90_000
  return (
    <span className={`ws-status ${online ? 'ws-tone-positive' : 'ws-tone-negative'}`}>
      {online ? l.screenOnline : `${l.screenOffline} · ${l.screenLastSeen} ${formatTime(active.last_seen_at)}`}
    </span>
  )
}
