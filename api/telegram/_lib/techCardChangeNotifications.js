import { formatLongDateTime } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml, sendTelegramMediaGroup, sendTelegramPhoto } from './telegram.js'
import { renderTechCardChangeImages } from './techCardChangeImage.js'

const TABLE = 'tech_card_change_notifications'
const ALBUM_SIZE = 10

// tech_card_events is the ZarKebab БОЗОРлик group. It shows protected prices and
// costs, so it has no env fallback and never borrows another group's target.
export async function loadTechCardChangeTarget(supabase) {
  const { data, error } = await supabase.from('telegram_notification_targets')
    .select('chat_id, is_enabled').eq('target_key', 'tech_card_events').maybeSingle()
  if (error) throw error
  if (!data?.is_enabled) return ''
  return String(data.chat_id || '').trim()
}

export function buildTechCardChangeCaption(snapshot) {
  const title = snapshot?.event_type === 'created' ? 'Новая техкарта' : 'Изменена техкарта'
  const name = [snapshot?.name, snapshot?.variant].filter(Boolean).join(' · ')
  return [
    `🧾 <b>${title}: ${escapeTelegramHtml(name)}</b>`,
    `Сотрудник: ${escapeTelegramHtml(snapshot?.actor_name || 'Система')}`,
    `Дата: ${escapeTelegramHtml(formatLongDateTime(snapshot?.changed_at, 'ru', '—'))}`,
  ].join('\n')
}

function messageIds(response) {
  const result = response?.result
  const ids = (Array.isArray(result) ? result : [result]).map(row => row?.message_id).filter(Boolean)
  if (ids.length === 0) throw new Error('Telegram did not return a message id; delivery outcome is unknown')
  return ids
}

export async function sendTechCardPages(chatId, pages, caption, {
  sendPhoto = sendTelegramPhoto,
  sendAlbum = sendTelegramMediaGroup,
  onSent = async () => {},
} = {}) {
  for (let start = 0; start < pages.length; start += ALBUM_SIZE) {
    const chunk = pages.slice(start, start + ALBUM_SIZE).map((photo, index) => ({
      photo,
      filename: `tech-card-${start + index + 1}.png`,
      caption: start + index === 0 ? caption : '',
    }))
    // Telegram albums need at least two photos.
    const response = chunk.length === 1
      ? await sendPhoto(chatId, chunk[0].photo, { caption: chunk[0].caption, filename: chunk[0].filename })
      : await sendAlbum(chatId, chunk)
    await onSent(messageIds(response))
  }
}

// A compare-and-set claim prevents parallel workers from sending the same event.
// Render errors happen before anything is sent, so they go back to the queue.
// An uncertain Telegram result stays processing for review, never blindly resent.
export async function deliverTechCardChangeNotification(supabase, row, chatId, {
  render = renderTechCardChangeImages,
  sendPhoto,
  sendAlbum,
} = {}) {
  const { data: claimed, error } = await supabase.from(TABLE)
    .update({ status: 'processing', chat_id: chatId, attempted_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'queued').select('*').maybeSingle()
  if (error) throw error
  if (!claimed) return { status: 'duplicate' }

  let pages
  try {
    pages = await render(claimed.snapshot)
  } catch (renderError) {
    await supabase.from(TABLE)
      .update({ status: 'queued', error_message: String(renderError?.message || renderError).slice(0, 1000) })
      .eq('id', row.id).eq('status', 'processing')
    return { status: 'queued', renderFailed: true }
  }

  const sentIds = []
  try {
    await sendTechCardPages(chatId, pages, buildTechCardChangeCaption(claimed.snapshot), {
      ...(sendPhoto ? { sendPhoto } : {}),
      ...(sendAlbum ? { sendAlbum } : {}),
      onSent: async ids => {
        sentIds.push(...ids)
        let saved = false
        for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
          const result = await supabase.from(TABLE).update({ telegram_message_ids: sentIds })
            .eq('id', row.id).eq('status', 'processing').select('id').maybeSingle()
          saved = !result.error && !!result.data
        }
        if (!saved) throw new Error('Telegram accepted the image but its receipt could not be saved')
      },
    })
    const result = await supabase.from(TABLE)
      .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: '' })
      .eq('id', row.id).eq('status', 'processing').select('id').maybeSingle()
    if (result.error || !result.data) throw result.error || new Error('Delivery ledger missing')
    return { status: 'sent' }
  } catch (sendError) {
    await supabase.from(TABLE).update({ error_message: String(sendError?.message || sendError).slice(0, 1000) })
      .eq('id', row.id).eq('status', 'processing')
    return { status: 'processing', needsReview: true }
  }
}

export async function drainTechCardChangeNotifications(supabase) {
  const chatId = await loadTechCardChangeTarget(supabase)
  if (!chatId) return { status: 'not_configured', sent: 0 }
  const { data, error } = await supabase.from(TABLE)
    .select('*').eq('status', 'queued').order('created_at', { ascending: true }).limit(10)
  if (error) throw error
  const results = []
  for (const row of data || []) results.push(await deliverTechCardChangeNotification(supabase, row, chatId))
  return {
    sent: results.filter(row => row.status === 'sent').length,
    renderFailed: results.filter(row => row.renderFailed).length,
    needsReview: results.filter(row => row.needsReview).length,
  }
}
