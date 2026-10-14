import { normalizeKpiStartTime } from '../../../src/lib/dailyKpi.js'
import { deleteTelegramMessage, escapeTelegramHtml, sendTelegramMessage } from './telegram.js'

const money = value => new Intl.NumberFormat('ru-RU').format(Number(value) || 0).replace(/\s/g, ' ')

export function buildEmployeeOrderKpiMessage(snapshot) {
  const startTime = normalizeKpiStartTime(snapshot.start_time)
  const timeWindow = startTime && startTime !== '00:00' ? ` (с ${startTime}, Ташкент)` : ''
  return [
    `✅ Заказ №${escapeTelegramHtml(snapshot.order_number)} оплачен — ${money(snapshot.total)} сум`,
    snapshot.cut > 0 ? '🎉 Спасибо за вашу работу!' : '🙌 Спасибо за вашу работу!',
    `💰 Бонус с заказа: ≈ ${money(snapshot.cut)} сум`,
    ...(snapshot.daily_cut != null ? [`📈 Ваш KPI за смену${timeWindow}: ≈ ${money(snapshot.daily_cut)} сум`] : []),
  ].join('\n')
}

export async function deliverEmployeeOrderKpiNotification(supabase, row, send = sendTelegramMessage, retract = deleteTelegramMessage) {
  const table = 'employee_order_kpi_notifications'
  if (row.status !== 'queued' || row.delete_requested) return { status: 'duplicate' }
  const { data: claimed, error } = await supabase.from(table)
    .update({ status: 'processing', attempted_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'queued').eq('delete_requested', false).select('*').maybeSingle()
  if (error) throw error
  if (!claimed) return { status: 'duplicate' }
  try {
    const response = await send(claimed.chat_id, buildEmployeeOrderKpiMessage(claimed.snapshot))
    const messageId = response?.result?.message_id
    if (!messageId) throw new Error('Telegram delivery outcome is unknown')
    // Retry receipt persistence, never the Telegram send after an uncertain outcome.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase.from(table).update({ status: 'sent', telegram_message_id: messageId,
        sent_at: new Date().toISOString(), error_message: '' })
        .eq('id', row.id).eq('status', 'processing').select('id').maybeSingle()
      if (!result.error && result.data) {
        // Deletion may have committed while Telegram was accepting the send.
        // A cleanup failure must never turn a confirmed send into a retry.
        try {
          const cleanup = await retractDeletedEmployeeOrderKpiNotifications(supabase, row.id, retract)
          if (!cleanup.ok) return { status: 'sent', cleanupPending: true }
        } catch (error) {
          return { status: 'sent', cleanupPending: true }
        }
        return { status: 'sent' }
      }
    }
    throw new Error('Telegram accepted the message but its receipt could not be saved')
  } catch (error) {
    await supabase.from(table).update({ error_message: String(error?.message || error).slice(0, 1000) })
      .eq('id', row.id).eq('status', 'processing')
    return { status: 'processing', needsReview: true }
  }
}

export async function retractDeletedEmployeeOrderKpiNotifications(supabase, notificationId, retract = deleteTelegramMessage) {
  const table = 'employee_order_kpi_notifications'
  let query = supabase.from(table).select('*').eq('delete_requested', true)
    .is('deleted_at', null).not('telegram_message_id', 'is', null)
    .order('cleanup_attempted_at', { ascending: true, nullsFirst: true }).limit(30)
  if (notificationId) query = query.eq('id', notificationId)
  const { data, error } = await query
  if (error) throw error
  const results = []
  for (const row of data || []) {
    let failure = null
    try {
      await retract(row.chat_id, row.telegram_message_id)
    } catch (error) {
      if (!/message to delete not found/i.test(error.message || '')) failure = error
    }
    const now = new Date().toISOString()
    const saved = await supabase.from(table).update({
      cleanup_attempted_at: now,
      cleanup_error: failure ? String(failure.message || failure).slice(0, 1000) : '',
      ...(!failure ? { deleted_at: now } : {}),
    }).eq('id', row.id)
    if (saved.error) throw saved.error
    results.push({ id: row.id, deleted: !failure })
  }
  return { ok: results.every(row => row.deleted), results }
}

export async function drainEmployeeOrderKpiNotifications(supabase) {
  // Independent of queued sends; the minute cron also wakes for pending cleanup.
  const cleanup = await retractDeletedEmployeeOrderKpiNotifications(supabase)
  const { data, error } = await supabase.from('employee_order_kpi_notifications')
    .select('*').eq('status', 'queued').eq('delete_requested', false).order('created_at', { ascending: true }).limit(30)
  if (error) throw error
  const results = []
  for (const row of data || []) results.push(await deliverEmployeeOrderKpiNotification(supabase, row))
  return { sent: results.filter(row => row.status === 'sent').length,
    needsReview: results.filter(row => row.needsReview).length,
    cleanup }
}
