import {
  expenseCategoryLabel,
  expenseDescriptionLabel,
  expensePaymentMethodLabel,
} from '../../../src/lib/expenses.js'
import { formatCurrency } from '../../../src/lib/formatCurrency.js'
import { employeeJobFunctionLabel } from '../../../src/lib/employeeJobFunctions.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import {
  calculateBazaarExpectedTotal,
  calculateBazaarPriceDifference,
  getBazaarNormalLineTotal,
  getBazaarPriceDifference,
  normalizeBazaarPurchase,
} from '../../../src/lib/bazaar.js'
import { escapeTelegramHtml } from './telegram.js'

const COPY = {
  uz: {
    title: 'Investor yordami',
    amount: 'Summa',
    currentMonthTotal: 'Joriy oydagi investor yordami',
    date: 'Sana',
    method: 'To‘lov turi',
    source: 'Investor yoki manba',
    description: 'Izoh',
  },
  ru: {
    title: 'Поддержка инвестора',
    amount: 'Сумма',
    currentMonthTotal: 'Поддержка инвестора за текущий месяц',
    date: 'Дата',
    method: 'Способ оплаты',
    source: 'Инвестор или источник',
    description: 'Описание',
  },
  en: {
    title: 'Investor support',
    amount: 'Amount',
    currentMonthTotal: 'Investor support this month',
    date: 'Date',
    method: 'Payment method',
    source: 'Investor or source',
    description: 'Description',
  },
}

const EXPENSE_COPY = {
  uz: {
    title: 'Yangi xarajat',
    amount: 'Summa',
    monthTotal: 'Oylik xarajatlar jami',
    date: 'Sana',
    category: 'Kategoriya',
    vendor: 'Yetkazuvchi yoki oluvchi',
    description: 'Izoh',
    addedBy: 'Kiritgan',
    normalTotal: 'Odatiy narx bo‘yicha jami',
    difference: 'Farq',
    paid: 'To‘langan',
  },
  ru: {
    title: 'Новый расход',
    amount: 'Сумма',
    monthTotal: 'Расходы за месяц',
    date: 'Дата',
    category: 'Категория',
    vendor: 'Поставщик или получатель',
    description: 'Описание',
    addedBy: 'Добавил(а)',
    normalTotal: 'Итого по обычной цене',
    difference: 'Разница',
    paid: 'Оплачено',
  },
  en: {
    title: 'New expense',
    amount: 'Amount',
    monthTotal: 'Expenses for the month',
    date: 'Date',
    category: 'Category',
    vendor: 'Supplier or recipient',
    description: 'Description',
    addedBy: 'Added by',
    normalTotal: 'Normal-price total',
    difference: 'Difference',
    paid: 'Paid',
  },
}

function normalizeLanguage(language) {
  return ['uz', 'ru', 'en'].includes(language) ? language : 'ru'
}

export function buildInvestorIncomeGroupMessage(expense, language = 'ru', currentMonthTotal = null) {
  const lang = normalizeLanguage(language)
  const copy = COPY[lang]
  const lines = [
    `💰 <b>${copy.title}</b>`,
    `${copy.amount}: <b>${escapeTelegramHtml(formatCurrency(expense?.amount || 0))}</b>`,
    '',
  ]
  lines.push(
    `${copy.date}: ${escapeTelegramHtml(formatLongDate(expense?.expense_date, lang, expense?.expense_date || '—'))}`,
    `${copy.method}: ${escapeTelegramHtml(expensePaymentMethodLabel(expense?.payment_method, lang))}`,
  )
  if (expense?.vendor) lines.push(`${copy.source}: ${escapeTelegramHtml(expense.vendor)}`)
  if (expense?.description) {
    lines.push(`${copy.description}: ${escapeTelegramHtml(expenseDescriptionLabel(expense.description, lang))}`)
  }
  if (currentMonthTotal !== null && Number.isFinite(Number(currentMonthTotal))) {
    lines.push('', `${copy.currentMonthTotal}: <b>${escapeTelegramHtml(formatCurrency(currentMonthTotal))}</b>`)
  }
  return lines.join('\n')
}

function formatSignedCurrency(value) {
  const amount = Math.round(Number(value) || 0)
  return amount > 0 ? `+${formatCurrency(amount)}` : formatCurrency(amount)
}

export function buildInvestorExpenseGroupMessage(expense, language = 'ru', monthTotal = null, bazaarPurchase = null) {
  const lang = normalizeLanguage(language)
  const copy = EXPENSE_COPY[lang]
  const lines = [
    `🧾 <b>${copy.title}</b>`,
    `${copy.amount}: <b>${escapeTelegramHtml(formatCurrency(expense?.amount || 0))}</b>`,
    '',
    `${copy.date}: ${escapeTelegramHtml(formatLongDate(expense?.expense_date, lang, expense?.expense_date || '—'))}`,
    `${copy.category}: ${escapeTelegramHtml(expenseCategoryLabel(expense?.category, lang))}`,
  ]
  if (expense?.vendor) lines.push(`${copy.vendor}: ${escapeTelegramHtml(expense.vendor)}`)
  if (expense?.description) {
    lines.push(`${copy.description}: ${escapeTelegramHtml(expenseDescriptionLabel(expense.description, lang))}`)
  }
  if (expense?.actor_name || expense?.created_by_name) {
    lines.push(`${copy.addedBy}: ${escapeTelegramHtml(expense.actor_name || expense.created_by_name)}`)
  }
  if (bazaarPurchase) {
    const normalized = normalizeBazaarPurchase(bazaarPurchase)
    for (const [index, item] of normalized.items.entries()) {
      const normalLineTotal = getBazaarNormalLineTotal(item)
      const difference = getBazaarPriceDifference(item)
      lines.push(
        '',
        `${index + 1}. <b>${escapeTelegramHtml(item.product_name)}</b>`,
        `${copy.normalTotal}: ${escapeTelegramHtml(formatCurrency(normalLineTotal))} · ${copy.paid}: ${escapeTelegramHtml(formatCurrency(item.line_total))}`,
        `${copy.difference}: <b>${escapeTelegramHtml(formatSignedCurrency(difference))}</b>`,
      )
    }
    lines.push(
      '',
      `${copy.normalTotal}: <b>${escapeTelegramHtml(formatCurrency(calculateBazaarExpectedTotal(normalized.items)))}</b>`,
      `${copy.difference}: <b>${escapeTelegramHtml(formatSignedCurrency(calculateBazaarPriceDifference(normalized.items)))}</b>`,
    )
  }
  if (monthTotal !== null && Number.isFinite(Number(monthTotal))) {
    lines.push('', `${copy.monthTotal}: <b>${escapeTelegramHtml(formatCurrency(monthTotal))}</b>`)
  }
  return lines.join('\n')
}

export function buildAbsenceUndoInvestorMessage(delivery, language = 'ru') {
  const lang = normalizeLanguage(language)
  const copy = {
    uz: { title: 'Yo‘qlik bekor qilindi', employee: 'Xodim', date: 'Sana', actor: 'Bekor qilgan' },
    ru: { title: 'Отсутствие отменено', employee: 'Сотрудник', date: 'Дата', actor: 'Отменил(а)' },
    en: { title: 'Absence undone', employee: 'Employee', date: 'Date', actor: 'Undone by' },
  }[lang]
  const lines = [
    `✅ <b>${copy.title}</b>`,
    `${copy.employee}: <b>${escapeTelegramHtml(delivery?.employee_name || '—')}</b>`,
    `${copy.date}: ${escapeTelegramHtml(formatLongDate(delivery?.absence_date, lang, delivery?.absence_date || '—'))}`,
  ]
  if (delivery?.actor_name) lines.push(`${copy.actor}: ${escapeTelegramHtml(delivery.actor_name)}`)
  return lines.join('\n')
}

export function buildEmployeeLifecycleInvestorMessage(delivery, language = 'ru') {
  const lang = normalizeLanguage(language)
  const copy = {
    uz: {
      created: 'Yangi xodim qo‘shildi',
      activated: 'Xodim faollashtirildi',
      deactivated: 'Xodim faolsizlantirildi',
      employee: 'Xodim',
      date: 'Sana',
      salary: 'Asosiy maosh',
      daily: 'kunlik',
      monthly: 'oylik',
      actor: 'Amalni bajargan',
    },
    ru: {
      created: 'Добавлен новый сотрудник',
      activated: 'Сотрудник активирован',
      deactivated: 'Сотрудник деактивирован',
      employee: 'Сотрудник',
      date: 'Дата',
      salary: 'Базовая зарплата',
      daily: 'дневная',
      monthly: 'месячная',
      actor: 'Изменил(а)',
    },
    en: {
      created: 'New employee added',
      activated: 'Employee activated',
      deactivated: 'Employee deactivated',
      employee: 'Employee',
      date: 'Date',
      salary: 'Base salary',
      daily: 'daily',
      monthly: 'monthly',
      actor: 'Changed by',
    },
  }[lang]
  const eventType = ['created', 'activated', 'deactivated'].includes(delivery?.event_type)
    ? delivery.event_type
    : 'created'
  const icon = eventType === 'deactivated' ? '⛔️' : eventType === 'activated' ? '✅' : '👤'
  const lines = [
    `${icon} <b>${copy[eventType]}</b>`,
    `${copy.employee}: <b>${escapeTelegramHtml(delivery?.employee_name || '—')}</b>`,
    `${copy.date}: ${escapeTelegramHtml(formatLongDate(delivery?.effective_date, lang, delivery?.effective_date || '—'))}`,
  ]
  const salaryAmount = Math.round(Number(delivery?.salary_amount) || 0)
  if (eventType === 'created' && salaryAmount > 0) {
    const unit = delivery?.salary_unit === 'daily' ? copy.daily : copy.monthly
    lines.push(`${copy.salary}: <b>${escapeTelegramHtml(formatCurrency(salaryAmount))}</b> (${unit})`)
  }
  if (delivery?.actor_name) lines.push(`${copy.actor}: ${escapeTelegramHtml(delivery.actor_name)}`)
  return lines.join('\n')
}

// Only the fields that changed are listed, each as before → after.
export function buildEmployeeProfileChangeInvestorMessage(delivery, language = 'ru') {
  const lang = normalizeLanguage(language)
  const copy = {
    uz: { title: 'Xodim ma’lumotlari o‘zgartirildi', employee: 'Xodim', name: 'Ism', role: 'Lavozim', workStart: 'Ish boshlanishi', notSet: 'belgilanmagan', actor: 'O‘zgartirgan' },
    ru: { title: 'Данные сотрудника изменены', employee: 'Сотрудник', name: 'Имя', role: 'Должность', workStart: 'Начало работы', notSet: 'не задано', actor: 'Изменил(а)' },
    en: { title: 'Employee details changed', employee: 'Employee', name: 'Name', role: 'Role', workStart: 'Work starts', notSet: 'not set', actor: 'Changed by' },
  }[lang]
  const role = value => employeeJobFunctionLabel(value, lang) || copy.notSet
  const time = value => String(value || '').slice(0, 5) || copy.notSet
  const change = (label, before, after) => `${label}: ${escapeTelegramHtml(before)} → <b>${escapeTelegramHtml(after)}</b>`
  const lines = [
    `✏️ <b>${copy.title}</b>`,
    `${copy.employee}: <b>${escapeTelegramHtml(delivery?.name_after || '—')}</b>`,
  ]
  if ((delivery?.name_before || '') !== (delivery?.name_after || '')) {
    lines.push(change(copy.name, delivery?.name_before || '—', delivery?.name_after || '—'))
  }
  if ((delivery?.job_function_before || '') !== (delivery?.job_function_after || '')) {
    lines.push(change(copy.role, role(delivery?.job_function_before), role(delivery?.job_function_after)))
  }
  if (time(delivery?.work_start_before) !== time(delivery?.work_start_after)) {
    lines.push(change(copy.workStart, time(delivery?.work_start_before), time(delivery?.work_start_after)))
  }
  if (delivery?.actor_name) lines.push(`${copy.actor}: ${escapeTelegramHtml(delivery.actor_name)}`)
  return lines.join('\n')
}

export function buildInvestorOrderChangeMessage(delivery, language = 'ru') {
  const lang = normalizeLanguage(language)
  const copy = {
    uz: { deleted: 'Buyurtma o‘chirildi', compactDeleted: 'O‘chirilgan buyurtma', changed: 'To‘lov turi o‘zgartirildi', order: 'Buyurtma', table: 'Stol', total: 'Jami', before: 'Oldin', after: 'Keyin', actor: 'O‘zgartirgan' },
    ru: { deleted: 'Заказ удалён', compactDeleted: 'Удалён заказ', changed: 'Способ оплаты изменён', order: 'Заказ', table: 'Стол', total: 'Итого', before: 'Было', after: 'Стало', actor: 'Изменил(а)' },
    en: { deleted: 'Order deleted', compactDeleted: 'Deleted order', changed: 'Payment method changed', order: 'Order', table: 'Table', total: 'Total', before: 'Before', after: 'After', actor: 'Changed by' },
  }[lang]
  const formatMethods = rows => (Array.isArray(rows) ? rows : [])
    .map(row => `${expensePaymentMethodLabel(row?.method, lang)} — ${formatCurrency(row?.amount || 0)}`)
    .join(', ') || '—'
  const deleted = delivery?.event_type === 'order_deleted'
  if (deleted) {
    const orderLabel = escapeTelegramHtml(delivery?.order_number || delivery?.order_id || '—')
    const rawContext = String(delivery?.table_name || '').trim()
    const context = lang === 'ru' && rawContext.toLowerCase() === 'delivery' ? 'Доставка' : rawContext
    const details = [
      context && escapeTelegramHtml(context),
      `<b>${escapeTelegramHtml(formatCurrency(delivery?.total || 0))}</b>`,
    ].filter(Boolean).join(' · ')
    return [
      `🗑 <b>${copy.compactDeleted} #${orderLabel}</b> · ${details}`,
      `👤 ${escapeTelegramHtml(delivery?.actor_name || '—')}`,
      delivery?.deletion_reason && `${lang === 'ru' ? 'Причина' : lang === 'uz' ? 'Sabab' : 'Reason'}: ${escapeTelegramHtml(delivery.deletion_reason)}`,
    ].filter(Boolean).join('\n')
  }
  const lines = [
    `🔄 <b>${copy.changed}</b>`,
    `${copy.order}: <b>#${escapeTelegramHtml(delivery?.order_number || delivery?.order_id || '—')}</b>`,
  ]
  if (delivery?.table_name) lines.push(`${copy.table}: ${escapeTelegramHtml(delivery.table_name)}`)
  lines.push(`${copy.total}: <b>${escapeTelegramHtml(formatCurrency(delivery?.total || 0))}</b>`)
  lines.push(
    `${copy.before}: ${escapeTelegramHtml(formatMethods(delivery?.old_payment_methods))}`,
    `${copy.after}: ${escapeTelegramHtml(formatMethods(delivery?.new_payment_methods))}`,
  )
  if (delivery?.actor_name) lines.push(`${copy.actor}: ${escapeTelegramHtml(delivery.actor_name)}`)
  return lines.join('\n')
}
