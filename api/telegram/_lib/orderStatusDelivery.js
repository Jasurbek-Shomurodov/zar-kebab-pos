import { createHash, randomUUID } from 'node:crypto'
import { deleteTelegramMessage, replyTelegramRemovedNotice, sendTelegramMessage, telegramOriginalMessageMissing } from './telegram.js'

export const ORDER_REMOVED_TEXT = '❌ <b>Заказ удалён</b>'

const TABLE = 'order_status_telegram_messages'

export async function sendTrackedOrderStatusMessage(supabase, orderIds, chatId, text, { salarySettlement = false } = {}) {
  const hash = salarySettlement ? createHash('sha256').update(JSON.stringify(['salary', [...orderIds].sort(), String(chatId)])).digest('hex').slice(0, 32) : null
  const id = hash ? `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20)}` : randomUUID()
  // Reserve before sending so a concurrent order deletion also queues this message.
  const reserved = await supabase.from(TABLE).insert({ id, order_ids: orderIds, chat_id: String(chatId) })
  if (reserved.error) {
    if (!salarySettlement || reserved.error.code !== '23505') throw reserved.error
    const existing = await supabase.from(TABLE).select('message_id').eq('id', id).maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data?.message_id) return { ok: true, result: { message_id: existing.data.message_id } }
    throw new Error('Salary order notification delivery is pending or unknown; check Telegram before retrying')
  }
  let response
  try { response = await sendTelegramMessage(chatId, text) }
  catch (error) {
    // A confirmed Telegram rejection did not send a message; release only that claim.
    if (salarySettlement && error.telegramRejected) {
      const released = await supabase.from(TABLE).delete().eq('id', id).is('message_id', null)
      if (released.error) throw released.error
    }
    throw error
  }
  const messageId = response?.result?.message_id
  if (!messageId) throw new Error('Telegram did not return a status message id')
  const saved = await supabase.from(TABLE).update({ message_id: String(messageId) }).eq('id', id)
  if (saved.error) {
    // Do not leave a known, untracked message behind after a persistence failure.
    await deleteTelegramMessage(chatId, messageId)
    throw saved.error
  }
  await retractDeletedOrderStatusMessages(supabase, orderIds)
  return response
}

export async function retractDeletedOrderStatusMessages(supabase, orderIds) {
  let query = supabase.from(TABLE).select('*').eq('delete_requested', true)
    .is('deleted_at', null).not('message_id', 'is', null)
    .order('attempted_at', { ascending: true, nullsFirst: true }).limit(100)
  if (orderIds?.length) query = query.overlaps('order_ids', orderIds)
  const { data, error } = await query
  if (error) throw error
  const results = []
  for (const row of data || []) {
    let failure = null
    try {
      // Keep the order message as history; reply to it with a removal notice.
      await replyTelegramRemovedNotice(row.chat_id, row.message_id, ORDER_REMOVED_TEXT)
    } catch (error) {
      if (!telegramOriginalMessageMissing(error)) failure = error
    }
    const now = new Date().toISOString()
    const saved = await supabase.from(TABLE).update({
      attempted_at: now,
      error_message: failure ? String(failure.message || failure) : '',
      ...(!failure ? { deleted_at: now } : {}),
    }).eq('id', row.id)
    if (saved.error) throw saved.error
    results.push({ id: row.id, deleted: !failure })
  }
  return { ok: results.every(row => row.deleted), results }
}
