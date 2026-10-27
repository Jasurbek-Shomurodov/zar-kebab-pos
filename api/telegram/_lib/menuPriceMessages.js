import { formatLongDateTime } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml } from './telegram.js'

// Investor message for a menu item price change (270).
// Built only from the immutable queue snapshot, never from the live catalog.
export function isMenuPriceEvent(snapshot) {
  return snapshot?.event_type === 'menu_price_changed'
}

function money(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))} UZS`
}

function priceLine(label, before, after) {
  if (Number(before) === Number(after)) return `${label}: ${money(after)}`
  const diff = Math.round(Number(after) || 0) - Math.round(Number(before) || 0)
  const sign = diff > 0 ? '+' : '−'
  return `${label}: ${money(before)} → <b>${money(after)}</b> (${sign}${money(Math.abs(diff))})`
}

export function buildMenuPriceInvestorMessage(snapshot) {
  const before = snapshot?.before
  const after = snapshot?.after
  if (!isMenuPriceEvent(snapshot) || !before || !after) throw new Error('Invalid menu price snapshot')
  const html = value => escapeTelegramHtml(value)
  const lines = [
    '💰 <b>Изменена цена в меню</b>',
    `Блюдо: <b>${html(snapshot.name || '—')}</b>`,
  ]
  if (snapshot.category) lines.push(`Категория: ${html(snapshot.category)}`)
  lines.push(priceLine('Цена', before.price, after.price))
  if (Number(before.old_price) !== Number(after.old_price)) {
    const show = value => Number(value) > 0 ? money(value) : 'нет'
    lines.push(`Старая (зачёркнутая) цена: ${show(before.old_price)} → <b>${show(after.old_price)}</b>`)
  }

  const beforeVariants = new Map((before.variants || []).map(variant => [variant.id, variant]))
  const afterIds = new Set((after.variants || []).map(variant => variant.id))
  const variantLines = []
  for (const variant of after.variants || []) {
    const previous = beforeVariants.get(variant.id)
    const name = html(variant.name || variant.id)
    if (!previous) variantLines.push(`• ${name}: <b>${money(variant.price)}</b> (новый)`)
    else if (Number(previous.price) !== Number(variant.price)) variantLines.push(`• ${priceLine(name, previous.price, variant.price)}`)
  }
  for (const variant of before.variants || []) {
    if (!afterIds.has(variant.id)) variantLines.push(`• ${html(variant.name || variant.id)}: ${money(variant.price)} (удалён)`)
  }
  if (variantLines.length) lines.push('Варианты:', ...variantLines)

  lines.push(
    `Сотрудник: ${html(snapshot.actor_name || 'Система')}`,
    `Дата: ${html(formatLongDateTime(snapshot.changed_at, 'ru', '—'))}`,
  )
  return lines.join('\n')
}
