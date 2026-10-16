import { formatKpiStartTime, kpiRuleStartTimeApplies } from '../../../src/lib/dailyKpi.js'
import { expensePaymentMethodLabel } from '../../../src/lib/expenses.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml } from './telegram.js'
import {
  formatSalaryNotificationAmount,
  normalizeSalaryNotificationLanguage,
} from './salaryMessages.js'

const COPY = {
  uz: {
    title: 'Maosh to‘lovi',
    greeting: name => `Assalomu alaykum, ${name}!`,
    recorded: 'Maosh to‘lovi qayd etildi.',
    amount: 'To‘langan summa',
    date: 'To‘lov sanasi',
    method: 'To‘lov turi',
    note: 'Izoh',
    due: 'Qolgan to‘lov',
    createdBy: 'Rasmiylashtirdi',
    confirm: 'Qabul qilganimni tasdiqlayman',
    confirmed: 'To‘lov qabul qilingani tasdiqlandi.',
  },
  ru: {
    title: 'Выплата зарплаты',
    greeting: name => `Здравствуйте, ${name}!`,
    recorded: 'Выплата зарплаты зарегистрирована.',
    amount: 'Выплачено',
    date: 'Дата выплаты',
    method: 'Способ оплаты',
    note: 'Примечание',
    due: 'Осталось к выплате',
    createdBy: 'Оформил',
    confirm: 'Подтвердить получение',
    confirmed: 'Получение выплаты подтверждено.',
  },
  en: {
    title: 'Salary payment',
    greeting: name => `Hello, ${name}!`,
    recorded: 'A salary payment was recorded.',
    amount: 'Amount paid',
    date: 'Payment date',
    method: 'Payment method',
    note: 'Note',
    due: 'Remaining salary due',
    createdBy: 'Recorded by',
    confirm: 'Confirm receipt',
    confirmed: 'Payment receipt confirmed.',
  },
}

const GROUP_COPY = {
  uz: {
    recorded: 'Xodimga maosh to‘lovi qayd etildi.',
    employee: 'Xodim',
  },
  ru: {
    recorded: 'Зарегистрирована выплата сотруднику.',
    employee: 'Сотрудник',
  },
  en: {
    recorded: 'A salary payment was recorded for an employee.',
    employee: 'Employee',
  },
}

const GROUP_EVENT_COPY = {
  uz: {
    bonus: 'Xodim bonusi',
    kpiBonus: 'Kunlik KPI bonusi',
    fine: 'Xodim jarimasi',
    absence: 'Xodim yo‘qligi',
    employee: 'Xodim',
    amount: 'Summa',
    date: 'Sana',
    note: 'Izoh',
    reason: 'Sabab',
    due: 'To‘lanishi kerak',
    createdBy: 'Rasmiylashtirdi',
    salesBase: 'Savdo bazasi',
    kpiRate: 'KPI foizi',
  },
  ru: {
    bonus: 'Бонус сотруднику',
    kpiBonus: 'Ежедневный KPI-бонус',
    fine: 'Штраф сотрудника',
    absence: 'Отсутствие сотрудника',
    employee: 'Сотрудник',
    amount: 'Сумма',
    date: 'Дата',
    note: 'Примечание',
    reason: 'Причина',
    due: 'К выплате',
    createdBy: 'Оформил',
    salesBase: 'База продаж',
    kpiRate: 'Процент KPI',
  },
  en: {
    bonus: 'Employee bonus',
    kpiBonus: 'Daily KPI bonus',
    fine: 'Employee fine',
    absence: 'Employee absence',
    employee: 'Employee',
    amount: 'Amount',
    date: 'Date',
    note: 'Note',
    reason: 'Reason',
    due: 'Salary due',
    createdBy: 'Recorded by',
    salesBase: 'Sales base',
    kpiRate: 'KPI rate',
  },
}

const TEAM_EVENT_COPY = {
  uz: {
    bonusTitle: 'Xodim bonusi',
    kpiBonusTitle: 'Kunlik KPI bonusi',
    fineTitle: 'Xodim jarimasi',
    absenceTitle: 'Xodim yo\u2018qligi',
    note: 'Izoh',
    reason: 'Sabab',
    createdBy: 'Rasmiylashtirdi',
    systemActor: 'Tizim',
  },
  ru: {
    bonusTitle: 'Бонус сотруднику',
    kpiBonusTitle: 'Ежедневный KPI-бонус',
    fineTitle: 'Штраф сотрудника',
    absenceTitle: 'Отсутствие сотрудника',
    note: 'Примечание',
    reason: 'Причина',
    createdBy: 'Оформил',
    systemActor: 'Система',
  },
  en: {
    bonusTitle: 'Employee bonus',
    kpiBonusTitle: 'Daily KPI bonus',
    fineTitle: 'Employee fine',
    absenceTitle: 'Employee absence',
    note: 'Note',
    reason: 'Reason',
    createdBy: 'Recorded by',
    systemActor: 'System',
  },
}

const EMPLOYEE_EVENT_COPY = {
  uz: {
    greeting: name => `Assalomu alaykum, ${name}!`,
    bonusRecorded: 'Bonusingiz hisoblandi va maosh balansiga qo‘shildi.',
    kpiBonusRecorded: 'Kunlik KPI bonusingiz hisoblandi va maosh balansiga qo‘shildi.',
    legacyBonusRecorded: 'Sizga bonus hisoblandi.',
    legacyKpiBonusRecorded: 'Sizga kunlik KPI bonusi hisoblandi va to‘landi.',
    absenceRecorded: 'Sizning yo‘qligingiz qayd etildi.',
  },
  ru: {
    greeting: name => `Здравствуйте, ${name}!`,
    bonusRecorded: 'Ваш бонус начислен и добавлен к балансу зарплаты.',
    kpiBonusRecorded: 'Ваш ежедневный KPI-бонус рассчитан и добавлен к балансу зарплаты.',
    legacyBonusRecorded: 'Вам начислен бонус.',
    legacyKpiBonusRecorded: 'Вам рассчитан и сразу выплачен ежедневный KPI-бонус.',
    absenceRecorded: 'Ваше отсутствие зарегистрировано.',
  },
  en: {
    greeting: name => `Hello, ${name}!`,
    bonusRecorded: 'Your bonus was accrued to your salary balance.',
    kpiBonusRecorded: 'Your daily KPI bonus was calculated and added to your salary balance.',
    legacyBonusRecorded: 'A bonus was recorded for you.',
    legacyKpiBonusRecorded: 'Your daily KPI bonus was calculated and paid.',
    absenceRecorded: 'Your absence was recorded.',
  },
}

function isDailyKpiBonus(event) {
  return event?.source_type === 'daily_kpi'
}

function formatKpiRate(rateBps) {
  const value = Number(rateBps || 0) / 100
  return `${value.toFixed(2).replace(/\.00$/, '')}%`
}

function appendDailyKpiDetails(lines, event, copy) {
  if (!isDailyKpiBonus(event)) return
  lines.push(
    `<b>${copy.salesBase}:</b> ${formatSalaryNotificationAmount(event?.source_metadata?.sales_base_amount)} UZS`,
    `<b>${copy.kpiRate}:</b> ${escapeTelegramHtml(formatKpiRate(event?.source_metadata?.rate_bps))}`
  )
}

const SALARY_RATE_COPY = {
  uz: {
    title: 'Maosh o\u2018zgarishi',
    raiseTitle: 'Ajoyib yangilik — maoshingiz oshdi!',
    greeting: name => `Assalomu alaykum, ${name}!`,
    employeeRecorded: 'Maoshingiz o\u2018zgartirildi.',
    raiseRecorded: 'Tabriklaymiz! Mehnatingiz qadrlanib, maoshingiz oshirildi. 🎉',
    raiseThanks: 'Zar Kebab jamoasiga qo\u2018shayotgan hissangiz uchun katta rahmat! Yangi yutuqlar sari birga davom etamiz. 🌟',
    groupRecorded: 'Xodimning maoshi o\u2018zgartirildi.',
    employee: 'Xodim',
    previousRate: 'Oldingi maosh',
    newRate: 'Yangi maosh',
    effectiveFrom: 'Amal qilish sanasi',
    kpiRate: 'KPI foizi',
    kpiDisabled: 'o‘chirilgan',
    kpiNotConfigured: 'sozlanmagan',
    note: 'Izoh',
    due: 'To\u2018lanishi kerak',
    createdBy: 'O\u2018zgartirdi',
    daily: 'kunlik',
    monthly: 'oylik',
  },
  ru: {
    title: 'Изменение зарплаты',
    raiseTitle: 'Отличная новость — ваша зарплата повышена!',
    greeting: name => `Здравствуйте, ${name}!`,
    employeeRecorded: 'Ваша ставка зарплаты изменена.',
    raiseRecorded: 'Поздравляем! Ваш труд и вклад в команду получили заслуженное признание. 🎉',
    raiseThanks: 'Спасибо, что развиваетесь вместе с Zar Kebab. Желаем новых успехов и достижений! 🌟',
    groupRecorded: 'Ставка зарплаты сотрудника изменена.',
    employee: 'Сотрудник',
    previousRate: 'Предыдущая зарплата',
    newRate: 'Новая зарплата',
    effectiveFrom: 'Действует с',
    kpiRate: 'Процент KPI',
    kpiDisabled: 'выключен',
    kpiNotConfigured: 'не настроен',
    note: 'Примечание',
    due: 'К выплате',
    createdBy: 'Изменил',
    daily: 'дневная',
    monthly: 'месячная',
  },
  en: {
    title: 'Salary change',
    raiseTitle: 'Great news — your salary has increased!',
    greeting: name => `Hello, ${name}!`,
    employeeRecorded: 'Your salary rate was changed.',
    raiseRecorded: 'Congratulations! Your hard work and contribution to the team have been recognized. 🎉',
    raiseThanks: 'Thank you for growing with Zar Kebab. Here\u2019s to even more success and achievements ahead! 🌟',
    groupRecorded: 'An employee salary rate was changed.',
    employee: 'Employee',
    previousRate: 'Previous salary',
    newRate: 'New salary',
    effectiveFrom: 'Effective from',
    kpiRate: 'KPI rate',
    kpiDisabled: 'disabled',
    kpiNotConfigured: 'not configured',
    note: 'Note',
    due: 'Salary due',
    createdBy: 'Changed by',
    daily: 'daily',
    monthly: 'monthly',
  },
}

const KPI_RULE_COPY = {
  uz: {
    addedTitle: 'KPI sozlamasi qo‘shildi',
    changedTitle: 'KPI sozlamasi o‘zgartirildi',
    employee: 'Xodim',
    previousRate: 'Oldingi KPI',
    newRate: 'Yangi KPI',
    effectiveFrom: 'Amal qilish sanasi',
    disabled: 'o‘chirilgan',
    createdBy: 'O‘zgartirdi',
  },
  ru: {
    addedTitle: 'Настройка KPI добавлена',
    changedTitle: 'Настройка KPI изменена',
    employee: 'Сотрудник',
    previousRate: 'Предыдущий KPI',
    newRate: 'Новый KPI',
    effectiveFrom: 'Действует с',
    disabled: 'выключен',
    createdBy: 'Изменил',
  },
  en: {
    addedTitle: 'KPI setting added',
    changedTitle: 'KPI setting changed',
    employee: 'Employee',
    previousRate: 'Previous KPI',
    newRate: 'New KPI',
    effectiveFrom: 'Effective from',
    disabled: 'disabled',
    createdBy: 'Changed by',
  },
}

function formatSalaryRate(rate, copy) {
  const unit = rate?.rate_unit === 'monthly' ? copy.monthly : copy.daily
  return `${formatSalaryNotificationAmount(rate?.amount)} UZS (${unit})`
}

function appendSalaryRateDetails(lines, rate, copy, lang) {
  if (rate?.previous_rate?.amount) {
    lines.push(`<b>${copy.previousRate}:</b> ${escapeTelegramHtml(formatSalaryRate(rate.previous_rate, copy))}`)
  }
  lines.push(
    `<b>${copy.newRate}:</b> ${escapeTelegramHtml(formatSalaryRate(rate, copy))}`,
    `<b>${copy.effectiveFrom}:</b> ${escapeTelegramHtml(formatLongDate(rate?.effective_from, lang, '-'))}`,
    `<b>${copy.kpiRate}:</b> ${escapeTelegramHtml(
      !rate?.kpi_rule
        ? copy.kpiNotConfigured
        : rate.kpi_rule.is_enabled === false
          ? copy.kpiDisabled
          : formatKpiRate(rate.kpi_rule.rate_bps)
    )}`
  )
  if (String(rate?.note || '').trim()) {
    lines.push(`<b>${copy.note}:</b> ${escapeTelegramHtml(rate.note)}`)
  }
}

export function buildSalaryRateGroupMessage(rate, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = SALARY_RATE_COPY[lang]
  const lines = [
    `📈 <b>${copy.title}</b>`,
    '',
    copy.groupRecorded,
    '',
    `<b>${copy.employee}:</b> ${escapeTelegramHtml(rate?.employee_name || '-')}`,
  ]
  appendSalaryRateDetails(lines, rate, copy, lang)
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(rate?.created_by_name || '-')}`
  )
  return lines.join('\n')
}

export function buildKpiRuleGroupMessage(event, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = KPI_RULE_COPY[lang]
  const isAdded = event?.change_kind === 'added'
  const formatRule = (rateBps, isEnabled) => (
    isEnabled === false ? copy.disabled : formatKpiRate(rateBps)
  )
  const lines = [
    `🎯 <b>${isAdded ? copy.addedTitle : copy.changedTitle}</b>`,
    '',
    `<b>${copy.employee}:</b> ${escapeTelegramHtml(event?.employee_name || '-')}`,
  ]
  if (!isAdded && event?.previous_rate_bps != null) {
    lines.push(`<b>${copy.previousRate}:</b> ${escapeTelegramHtml(formatRule(
      event.previous_rate_bps,
      event.previous_is_enabled
    ))}`)
  }
  lines.push(
    `<b>${copy.newRate}:</b> ${escapeTelegramHtml(formatRule(
      event?.new_rate_bps,
      event?.new_is_enabled
    ))}`,
    `<b>${copy.effectiveFrom}:</b> ${escapeTelegramHtml(formatLongDate(event?.effective_from, lang, '-'))}`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(event?.created_by_name || '-')}`
  )
  const basisCopy = {
    ru: ['База KPI', 'Свои открытые заказы', 'Все заказы в зале', 'POS-аккаунт'],
    uz: ['KPI asosi', 'O‘zi ochgan buyurtmalar', 'Zaldagi barcha buyurtmalar', 'POS akkaunt'],
    en: ['KPI basis', 'Own opened orders', 'All dine-in orders', 'POS account'],
  }[lang]
  const basisLabel = value => value === 'restaurant' ? basisCopy[2] : basisCopy[1]
  if (event?.new_sales_basis) {
    const before = event.previous_sales_basis ? `${basisLabel(event.previous_sales_basis)} → ` : ''
    lines.push(`<b>${basisCopy[0]}:</b> ${escapeTelegramHtml(before + basisLabel(event.new_sales_basis))}`)
  }
  if (event?.new_start_time != null && kpiRuleStartTimeApplies(event.effective_from)) {
    const before = event.previous_start_time != null ? `${formatKpiStartTime(event.previous_start_time, lang)} → ` : ''
    lines.push(`<b>KPI:</b> ${escapeTelegramHtml(before + formatKpiStartTime(event.new_start_time, lang))}`)
  }
  if (event?.new_order_opener_name || event?.previous_order_opener_name) {
    lines.push(`<b>${basisCopy[3]}:</b> ${escapeTelegramHtml(`${event.previous_order_opener_name || '—'} → ${event.new_order_opener_name || '—'}`)}`)
  }
  return lines.join('\n')
}

export function buildEmployeeSalaryRateMessage(rate, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = SALARY_RATE_COPY[lang]
  const employeeName = escapeTelegramHtml(rate?.employee_name || '-')
  const isIncrease = rate?.previous_rate?.rate_unit === rate?.rate_unit
    && Number(rate?.amount || 0) > Number(rate?.previous_rate?.amount || 0)
  const lines = [
    `${isIncrease ? '🎉' : '📈'} <b>${isIncrease ? copy.raiseTitle : copy.title}</b>`,
    '',
    `<b>${copy.greeting(employeeName)}</b>`,
    isIncrease ? copy.raiseRecorded : copy.employeeRecorded,
    '',
  ]
  appendSalaryRateDetails(lines, rate, copy, lang)
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(rate?.created_by_name || '-')}`
  )
  if (isIncrease) {
    lines.push('', copy.raiseThanks)
  }
  return lines.join('\n')
}

export function getEmployeePaymentConfirmationCopy(language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  return {
    button: COPY[lang].confirm,
    confirmed: COPY[lang].confirmed,
  }
}

function salaryPaymentCopy(payment, lang) {
  const copy = COPY[lang]
  if (payment?.payment_method !== 'salary') return copy
  const labels = {
    en: ['Order paid from salary', 'The order balance was deducted from salary. No cash was paid out.', 'Salary deducted'],
    ru: ['Заказ оплачен из зарплаты', 'Остаток заказа списан из зарплаты. Наличные не выдавались.', 'Списано из зарплаты'],
    uz: ['Buyurtma maoshdan to‘landi', 'Buyurtma qoldig‘i maoshdan yechildi. Naqd pul berilmadi.', 'Maoshdan yechildi'],
  }[lang]
  return { ...copy, title: labels[0], recorded: labels[1], amount: labels[2] }
}

export function buildSalaryPaymentGroupMessage(payment, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = salaryPaymentCopy(payment, lang)
  const groupCopy = GROUP_COPY[lang]
  const lines = [
    `💵 <b>${copy.title}</b>`,
    '',
    payment?.payment_method === 'salary' ? copy.recorded : groupCopy.recorded,
    '',
    `<b>${groupCopy.employee}:</b> ${escapeTelegramHtml(payment?.employee_name || '-')}`,
    `<b>${copy.amount}:</b> ${formatSalaryNotificationAmount(payment?.amount)} UZS`,
    `<b>${copy.date}:</b> ${escapeTelegramHtml(formatLongDate(payment?.paid_date, lang, '-'))}`,
    `<b>${copy.method}:</b> ${escapeTelegramHtml(expensePaymentMethodLabel(payment?.payment_method, lang))}`,
  ]
  if (String(payment?.note || '').trim()) {
    lines.push(`<b>${copy.note}:</b> ${escapeTelegramHtml(payment.note)}`)
  }
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(payment?.created_by_name || '-')}`
  )
  return lines.join('\n')
}

export function buildSalaryGroupEventMessage(type, event, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = GROUP_EVENT_COPY[lang]
  const normalizedType = ['bonus', 'fine', 'absence'].includes(type) ? type : 'absence'
  const date = event?.bonus_date || event?.fine_date || event?.absence_date
  const eventTitle = normalizedType === 'bonus' && isDailyKpiBonus(event)
    ? copy.kpiBonus
    : copy[normalizedType]
  const lines = [
    `${normalizedType === 'bonus' ? isDailyKpiBonus(event) ? '🎯' : '🎁' : normalizedType === 'fine' ? '⚠️' : '📅'} <b>${eventTitle}</b>`,
    '',
    `<b>${copy.employee}:</b> ${escapeTelegramHtml(event?.employee_name || '-')}`,
  ]
  if (normalizedType !== 'absence') {
    lines.push(`<b>${copy.amount}:</b> ${formatSalaryNotificationAmount(event?.amount)} UZS`)
  }
  appendDailyKpiDetails(lines, event, copy)
  lines.push(`<b>${copy.date}:</b> ${escapeTelegramHtml(formatLongDate(date, lang, '-'))}`)
  const detail = normalizedType === 'fine' ? event?.reason : event?.note
  if (!isDailyKpiBonus(event) && String(detail || '').trim()) {
    lines.push(`<b>${normalizedType === 'fine' ? copy.reason : copy.note}:</b> ${escapeTelegramHtml(detail)}`)
  }
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(event?.created_by_name || '-')}`
  )
  return lines.join('\n')
}

export function buildSalaryTeamEventMessage(type, event, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = TEAM_EVENT_COPY[lang]
  const normalizedType = ['bonus', 'fine', 'absence'].includes(type) ? type : 'absence'
  const date = event?.bonus_date || event?.fine_date || event?.absence_date
  const detail = normalizedType === 'fine' ? event?.reason : event?.note
  if (normalizedType === 'absence') {
    const absenceCopy = TEAM_EVENT_COPY.ru
    const lines = [
      `📅 <b>${absenceCopy.absenceTitle}</b>`,
      `👤 <b>${escapeTelegramHtml(event?.employee_name || '-')}</b> · 🗓 ${escapeTelegramHtml(formatLongDate(date, 'ru', '-'))}`,
    ]
    if (String(detail || '').trim()) {
      lines.push(`📝 ${escapeTelegramHtml(String(detail).trim())}`)
    }
    lines.push(`✍️ <b>${absenceCopy.createdBy}:</b> ${escapeTelegramHtml(event?.created_by_name || absenceCopy.systemActor)}`)
    return lines.join('\n')
  }
  const lines = [
    `${normalizedType === 'bonus' ? isDailyKpiBonus(event) ? '🎯' : '🎁' : normalizedType === 'fine' ? '⚠️' : '📅'} <b>${
      normalizedType === 'bonus' && isDailyKpiBonus(event)
        ? copy.kpiBonusTitle
        : copy[`${normalizedType}Title`]
    }</b>`,
    `👤 <b>${escapeTelegramHtml(event?.employee_name || '-')}</b> · <b>${formatSalaryNotificationAmount(event?.amount)} UZS</b>`,
  ]
  lines.push(`🗓 ${escapeTelegramHtml(formatLongDate(date, lang, '-'))}`)
  if (!isDailyKpiBonus(event) && String(detail || '').trim()) {
    const detailLabel = normalizedType === 'fine' ? copy.reason : copy.note
    lines.push(`📝 <b>${detailLabel}:</b> ${escapeTelegramHtml(String(detail).trim())}`)
  }
  lines.push(`✍️ <b>${copy.createdBy}:</b> ${escapeTelegramHtml(event?.created_by_name || copy.systemActor)}`)
  return lines.join('\n')
}

export function buildEmployeeSalaryEventMessage(type, event, remainingDue = 0, language = 'ru') {
  const lang = type === 'bonus' && !isDailyKpiBonus(event)
    ? 'ru'
    : normalizeSalaryNotificationLanguage(language)
  const copy = GROUP_EVENT_COPY[lang]
  const employeeCopy = EMPLOYEE_EVENT_COPY[lang]
  const normalizedType = type === 'bonus' ? 'bonus' : 'absence'
  const date = normalizedType === 'bonus' ? event?.bonus_date : event?.absence_date
  const employeeName = escapeTelegramHtml(event?.employee_name || '-')
  const accruesToSalary = event?.accrues_to_salary === true
  const eventTitle = normalizedType === 'bonus' && isDailyKpiBonus(event)
    ? copy.kpiBonus
    : copy[normalizedType]
  const lines = [
    `${normalizedType === 'bonus' ? isDailyKpiBonus(event) ? '🎯' : '🎁' : '📅'} <b>${eventTitle}</b>`,
    '',
    `<b>${employeeCopy.greeting(employeeName)}</b>`,
    normalizedType === 'bonus'
      ? isDailyKpiBonus(event)
        ? accruesToSalary ? employeeCopy.kpiBonusRecorded : employeeCopy.legacyKpiBonusRecorded
        : accruesToSalary ? employeeCopy.bonusRecorded : employeeCopy.legacyBonusRecorded
      : employeeCopy.absenceRecorded,
    '',
  ]
  if (normalizedType === 'bonus') {
    lines.push(
      `<b>${copy.amount}:</b> ${formatSalaryNotificationAmount(event?.amount)} UZS`,
    )
    appendDailyKpiDetails(lines, event, copy)
    lines.push(`<b>${copy.date}:</b> ${escapeTelegramHtml(formatLongDate(date, lang, '-'))}`)
  } else {
    lines.push(`<b>${copy.date}:</b> ${escapeTelegramHtml(formatLongDate(date, lang, '-'))}`)
  }
  if (!isDailyKpiBonus(event) && String(event?.note || '').trim()) {
    lines.push(`<b>${copy.note}:</b> ${escapeTelegramHtml(event.note)}`)
  }
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(event?.created_by_name || '-')}`
  )
  return lines.join('\n')
}

export function buildEmployeePaymentMessage(payment, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = salaryPaymentCopy(payment, lang)
  const employeeName = escapeTelegramHtml(payment?.employee_name || 'сотрудник')
  const lines = [
    `💵 <b>${copy.title}</b>`,
    '',
    `<b>${copy.greeting(employeeName)}</b>`,
    copy.recorded,
    '',
    `<b>${copy.amount}:</b> ${formatSalaryNotificationAmount(payment?.amount)} UZS`,
    `<b>${copy.date}:</b> ${escapeTelegramHtml(formatLongDate(payment?.paid_date, lang, '-'))}`,
    `<b>${copy.method}:</b> ${escapeTelegramHtml(expensePaymentMethodLabel(payment?.payment_method, lang))}`,
  ]
  if (String(payment?.note || '').trim()) {
    lines.push(`<b>${copy.note}:</b> ${escapeTelegramHtml(payment.note)}`)
  }
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(payment?.created_by_name || '-')}`
  )
  return lines.join('\n')
}
