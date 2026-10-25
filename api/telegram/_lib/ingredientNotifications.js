import { formatLongDateTime } from '../../../src/lib/dateFormat.js'
import { bazaarCategoryLabel, bazaarUnitLabel } from '../../../src/lib/bazaar.js'
import { escapeTelegramHtml, sendTelegramMessage } from './telegram.js'
import { buildMonthCloseInvestorMessage, isMonthCloseEvent } from './monthCloseMessages.js'

export async function loadIngredientInvestorTarget(supabase, env = process.env) {
  const { data, error } = await supabase.from('telegram_notification_targets')
    .select('chat_id, is_enabled').eq('target_key', 'salary_events').maybeSingle()
  if (error) throw error
  if (!data?.is_enabled) return ''
  return String(data.chat_id || env.TELEGRAM_SALARY_PAYMENTS_CHAT_ID || '').trim()
}

export function buildIngredientInvestorMessage(snapshot) {
  const titles = { created: 'Добавлен ингредиент', updated: 'Изменён ингредиент', archived: 'Ингредиент удалён (в архив)', restored: 'Ингредиент восстановлен' }
  const title = titles[snapshot?.event_type]
  if (!title || !snapshot?.after) throw new Error('Invalid ingredient notification snapshot')
  const after = snapshot.after
  const before = snapshot.before
  const html = value => escapeTelegramHtml(value)
  const price = value => new Intl.NumberFormat('ru-RU').format(Number(value) || 0) + ' UZS'
  const fields = [
    ['name', 'Название', value => value],
    ['category', 'Категория', value => bazaarCategoryLabel(value, 'ru')],
    ['unit', 'Единица', value => bazaarUnitLabel(value, 'ru')],
    ['normal_unit_price', 'Обычная цена за единицу', price],
    ['is_active', 'Статус', value => value ? 'Активен' : 'В архиве'],
  ]
  const lines = [
    `📦 <b>${title}</b>`,
    `Дата: ${html(formatLongDateTime(snapshot.changed_at, 'ru', '—'))}`,
    `Сотрудник: ${html(snapshot.actor_name || 'Система')}`,
  ]
  for (const [key, label, format] of fields) {
    const current = html(format(after[key]))
    if (before && before[key] !== after[key]) lines.push(`${label}: ${html(format(before[key]))} → <b>${current}</b>`)
    else lines.push(`${label}: ${current}`)
  }
  return lines.join('\n')
}

// The queue also carries Owner profit month close/reopen events (259).
export function buildInvestorQueueMessage(snapshot) {
  return isMonthCloseEvent(snapshot) ? buildMonthCloseInvestorMessage(snapshot) : buildIngredientInvestorMessage(snapshot)
}

// A compare-and-set claim prevents parallel workers from sending the same event.
// An uncertain Telegram result stays processing for review, never blindly resent.
export async function deliverIngredientNotification(supabase, row, chatId, send = sendTelegramMessage) {
  const table = 'ingredient_investor_notifications'
  const { data: claimed, error } = await supabase.from(table)
    .update({ status: 'processing', chat_id: chatId, attempted_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'queued').select('*').maybeSingle()
  if (error) throw error
  if (!claimed) return { status: 'duplicate' }
  const messageIds = []
  try {
    for (const message of [buildInvestorQueueMessage(claimed.snapshot)]) {
      const response = await send(chatId, message)
      const id = response?.result?.message_id
      if (!id) throw new Error('Telegram did not return a message id; delivery outcome is unknown')
      messageIds.push(id)
      let saved = false
      for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
        const result = await supabase.from(table).update({ telegram_message_ids: messageIds })
          .eq('id', row.id).eq('status', 'processing').select('id').maybeSingle()
        saved = !result.error && !!result.data
      }
      if (!saved) throw new Error('Telegram accepted the message but its receipt could not be saved')
    }
    const result = await supabase.from(table)
      .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: '' })
      .eq('id', row.id).eq('status', 'processing').select('id').maybeSingle()
    if (result.error || !result.data) throw result.error || new Error('Delivery ledger missing')
    return { status: 'sent' }
  } catch (error) {
    await supabase.from(table).update({ error_message: String(error?.message || error).slice(0, 1000) })
      .eq('id', row.id).eq('status', 'processing')
    return { status: 'processing', needsReview: true }
  }
}

export async function drainIngredientNotifications(supabase) {
  const chatId = await loadIngredientInvestorTarget(supabase)
  if (!chatId) return { status: 'not_configured', sent: 0 }
  const { data, error } = await supabase.from('ingredient_investor_notifications')
    .select('*').eq('status', 'queued').order('created_at', { ascending: true }).limit(20)
  if (error) throw error
  const results = []
  for (const row of data || []) results.push(await deliverIngredientNotification(supabase, row, chatId))
  return { sent: results.filter(row => row.status === 'sent').length, needsReview: results.filter(row => row.needsReview).length }
}
