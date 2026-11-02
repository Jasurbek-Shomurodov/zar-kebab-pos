import { formatLongDateTime } from '../../../src/lib/dateFormat.js'
import { callTelegramApi, escapeTelegramHtml } from './telegram.js'

// Investor message for a new Inventory item or a count change (277).
// Built only from the immutable queue snapshot, never from the live register.
export function isInventoryEvent(snapshot) {
  return snapshot?.event_type === 'inventory_added' || snapshot?.event_type === 'inventory_count_changed'
}

function count(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value) || 0)
}

function countLine(snapshot) {
  if (snapshot.event_type === 'inventory_added') return `Количество: <b>${count(snapshot.quantity)}</b>`
  const diff = Number(snapshot.quantity) - Number(snapshot.quantity_before)
  const sign = diff > 0 ? '+' : '−'
  return `Количество: ${count(snapshot.quantity_before)} → <b>${count(snapshot.quantity)}</b> (${sign}${count(Math.abs(diff))})`
}

// Also a photo caption, so it stays well under Telegram's 1024 characters.
export function buildInventoryInvestorMessage(snapshot) {
  if (!isInventoryEvent(snapshot)) throw new Error('Invalid inventory snapshot')
  const html = value => escapeTelegramHtml(value)
  return [
    snapshot.event_type === 'inventory_added' ? '🍽 <b>Добавлен инвентарь</b>' : '🍽 <b>Изменено количество инвентаря</b>',
    `Название: <b>${html(snapshot.name || '—')}</b>`,
    countLine(snapshot),
    `Сотрудник: ${html(snapshot.actor_name || 'Система')}`,
    `Дата: ${html(formatLongDateTime(snapshot.changed_at, 'ru', '—'))}`,
  ].join('\n')
}

// Telegram fetches the stored photo itself, so nothing is downloaded here.
export function sendTelegramPhotoUrl(chatId, photoUrl, caption) {
  return callTelegramApi('sendPhoto', { chat_id: chatId, photo: photoUrl, caption, parse_mode: 'HTML' })
}
