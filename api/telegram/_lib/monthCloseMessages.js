import { formatLongDateTime, formatMonthYear } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml } from './telegram.js'

// Investor messages for Owner profit month closes and owner reopens (259).
// Built only from the immutable queue snapshot, never from live totals.
function money(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Math.abs(Math.round(Number(value) || 0)))} UZS`
}

function signedMoney(value) {
  const amount = Math.round(Number(value) || 0)
  return `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${money(amount)}`
}

function monthTitle(monthStart) {
  return formatMonthYear(String(monthStart || '').slice(0, 10), 'ru', String(monthStart || ''))
}

export function isMonthCloseEvent(snapshot) {
  return snapshot?.event_type === 'month_closed' || snapshot?.event_type === 'month_reopened'
}

export function buildMonthCloseInvestorMessage(snapshot) {
  const html = value => escapeTelegramHtml(value)
  const footer = [
    `Сотрудник: ${html(snapshot?.actor_name || 'Система')}`,
    `Дата: ${html(formatLongDateTime(snapshot?.changed_at, 'ru', '—'))}`,
  ]

  if (snapshot?.event_type === 'month_closed') {
    if (!snapshot.month_start) throw new Error('Invalid month close snapshot')
    const lines = [
      `🔒 <b>Месяц закрыт: ${html(monthTitle(snapshot.month_start))}</b>`,
      `Прибыль владельца: <b>${signedMoney(snapshot.owner_profit)}</b>`,
      '',
      `Доход кафе: ${money(snapshot.cafe_income)}`,
    ]
    if (Number(snapshot.other_income) > 0) lines.push(`Другой доход: ${money(snapshot.other_income)}`)
    lines.push(`Расходы: −${money(snapshot.recorded_expenses)}`)
    if (Number(snapshot.legacy_paid_bonuses) > 0) lines.push(`Сразу выплаченные бонусы: −${money(snapshot.legacy_paid_bonuses)}`)
    lines.push(`Питание сотрудников: −${money(snapshot.employee_meals)}`)
    lines.push(`Заработанная зарплата: −${money(snapshot.salary_earned)}`)
    if (Number(snapshot.investor_support) > 0) lines.push(`Поддержка инвестора (не прибыль): ${money(snapshot.investor_support)}`)
    lines.push(`Списано с общего остатка: ${signedMoney(snapshot.settled_amount)}`, '', ...footer)
    return lines.join('\n')
  }

  if (snapshot?.event_type === 'month_reopened') {
    const previous = snapshot.previous_close || {}
    if (!snapshot.month_start) throw new Error('Invalid month reopen snapshot')
    return [
      `🔓 <b>Месяц снова открыт: ${html(monthTitle(snapshot.month_start))}</b>`,
      `Прежняя прибыль владельца: ${signedMoney(previous.owner_profit)}`,
      `Причина: ${html(snapshot.reason || '—')}`,
      'Записи месяца снова можно изменять до повторного закрытия.',
      '',
      ...footer,
    ].join('\n')
  }

  throw new Error('Invalid month close notification snapshot')
}
