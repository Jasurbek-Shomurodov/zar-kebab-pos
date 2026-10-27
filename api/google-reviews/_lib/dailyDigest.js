import { restaurantTodayStr } from '../../../src/lib/analytics.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { loadIngredientInvestorTarget } from '../../telegram/_lib/ingredientNotifications.js'
import { sendTelegramPhoto } from '../../telegram/_lib/telegram.js'
import { renderGoogleDigestImage } from './dailyDigestImage.js'

const TABLE = 'google_business_daily_digests'

export function googleDigestDate(now = new Date()) {
  return restaurantTodayStr(now)
}

// Each daily task records its own part of the day's row (`reviews` or `menu`); a one-off
// report may also set a `title` and `highlights`.
export async function saveGoogleDigestPart(supabase, part, value, date = googleDigestDate()) {
  if (!['reviews', 'menu', 'title', 'highlights'].includes(part)) throw new Error(`Unknown Google digest part: ${part}`)
  const { error } = await supabase.from(TABLE)
    .upsert({ digest_date: date, [part]: value, updated_at: new Date().toISOString() }, { onConflict: 'digest_date' })
  if (error) throw error
}

// Replies drafted for 1–3★ reviews on earlier days, keyed by review id, so the bot reuses
// them while they wait for the owner's approval instead of spending Gemini quota again.
export async function loadHeldReviewDrafts(supabase, { days = 60, now = new Date() } = {}) {
  const since = googleDigestDate(new Date(now.getTime() - days * 86400000))
  const { data, error } = await supabase.from(TABLE).select('digest_date, reviews')
    .gte('digest_date', since).order('digest_date', { ascending: false })
  if (error) throw error
  const drafts = new Map()
  for (const row of data || []) {
    for (const result of row.reviews?.results || []) {
      if (result?.status === 'awaiting_approval' && result.reply && !drafts.has(result.reviewId)) drafts.set(result.reviewId, result.reply)
    }
  }
  return drafts
}

// Sends the day's image to the Investor group, alongside the daily reports, at most once.
export async function sendGoogleDailyDigest(supabase, options = {}) {
  const date = options.date || googleDigestDate()
  const env = options.env || process.env
  const send = options.send || sendTelegramPhoto
  const render = options.render || renderGoogleDigestImage

  const chatId = await loadIngredientInvestorTarget(supabase, env)
  if (!chatId) return { status: 'skipped', reason: 'Investor group is not configured' }

  // Claim the send first: a timeout leaves the outcome unknown, so it is held, never resent.
  const { data: claimed, error: claimError } = await supabase.from(TABLE)
    .update({ send_attempted_at: new Date().toISOString(), telegram_chat_id: chatId })
    .eq('digest_date', date)
    .is('send_attempted_at', null)
    .select('digest_date, reviews, menu, highlights, title')
  if (claimError) throw claimError
  if (!claimed?.length) return { status: 'held', reason: 'Already sent or attempted for this date' }

  const { data: previous, error: previousError } = await supabase.from(TABLE)
    .select('digest_date, reviews').lt('digest_date', date).order('digest_date', { ascending: false }).limit(1)
  if (previousError) throw previousError

  try {
    const photo = await render(claimed[0], previous?.[0] || null)
    const response = await send(chatId, photo, {
      caption: `🤖 <b>ИИ-бот Zar Kebab</b> о Google Maps: отзывы и меню, ${formatLongDate(date, 'ru', date)}`,
      filename: `google-maps-${date}.png`,
    })
    const messageId = Number(response?.result?.message_id) || null
    const { error } = await supabase.from(TABLE)
      .update({ telegram_message_id: messageId, sent_at: new Date().toISOString(), send_error: null })
      .eq('digest_date', date)
    if (error) throw error
    return { status: 'sent', messageId }
  } catch (sendError) {
    const message = String(sendError?.message || sendError).slice(0, 500)
    await supabase.from(TABLE).update({ send_error: message }).eq('digest_date', date)
    return { status: 'failed', error: message }
  }
}
