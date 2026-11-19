import { escapeTelegramHtml, sendTelegramMessage, sendTelegramPhoto } from '../../telegram/_lib/telegram.js'

// Google Maps reports and every posted reply go to the Zar Kebab Team group.
export async function loadGoogleTeamTarget(supabase, env = process.env) {
  const { data, error } = await supabase.from('telegram_notification_targets')
    .select('chat_id, is_enabled').eq('target_key', 'team_events').maybeSingle()
  if (error) throw error
  if (data && !data.is_enabled) return ''
  return String(data?.chat_id || env.TELEGRAM_TEAM_CHAT_ID || '').trim()
}

// Google returns review photos only for some reviews; the API field is optional.
export function reviewPhotoUrls(review) {
  return (review?.reviewMedia || review?.media || [])
    .map(item => item?.googleUrl || item?.thumbnailUrl || item?.sourceUrl || '')
    .filter(url => /^https:\/\//.test(url))
    .slice(0, 3)
}

export function buildReviewReplyMessage({ review, rating, comment, reply }) {
  const html = escapeTelegramHtml
  // Telegram text has no colours, so emoji carry them: a traffic-light dot and gold stars.
  const dot = rating >= 4 ? '🟢' : rating === 3 ? '🟡' : '🔴'
  const stars = `${dot} ${'⭐'.repeat(rating)} ${rating}/5`
  const name = String(review?.reviewer?.displayName || '').trim()
  return [
    '🤖 <b>ИИ-бот Zar Kebab ответил на отзыв в Google Maps</b>',
    `${stars}${name ? ` · ${html(name)}` : ''}`,
    '',
    '<b>Отзыв:</b>',
    html(comment || '(без текста, только оценка)'),
    '',
    '<b>Наш ответ:</b>',
    html(reply),
  ].join('\n').slice(0, 4000)
}

// Best effort: the reply is already public on Google, so a Telegram failure never undoes it.
export function createTeamReplyNotifier(supabase, options = {}) {
  const env = options.env || process.env
  const sendText = options.sendText || sendTelegramMessage
  const sendPhoto = options.sendPhoto || sendTelegramPhoto
  const fetchImpl = options.fetchImpl || fetch
  let chatIdPromise = null
  return async function notifyTeam(details) {
    try {
      chatIdPromise ||= loadGoogleTeamTarget(supabase, env)
      const chatId = await chatIdPromise
      if (!chatId) return { status: 'skipped' }
      const response = await sendText(chatId, buildReviewReplyMessage(details))
      for (const url of reviewPhotoUrls(details.review)) {
        const photo = await fetchImpl(url).then(res => (res.ok ? res.arrayBuffer() : null)).catch(() => null)
        if (photo) await sendPhoto(chatId, Buffer.from(photo), { caption: 'Фото из отзыва', filename: 'review.jpg' })
      }
      return { status: 'sent', messageId: Number(response?.result?.message_id) || null }
    } catch (error) {
      console.error('[google-reviews] team notification failed:', error)
      return { status: 'failed', error: String(error?.message || error).slice(0, 300) }
    }
  }
}
