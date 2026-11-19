import { restaurantTodayStr } from '../../../src/lib/analytics.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { loadGoogleTeamTarget } from './teamNotifications.js'
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

function digestCaption(date) {
  return `🤖 <b>ИИ-бот Zar Kebab</b> о Google Maps: отзывы и меню, ${formatLongDate(date, 'ru', date)}`
}

// Claims the day's digest and renders its image but leaves the send to the caller, so the
// 04:05 morning run can add it to the Team album. Returns { result } when there is nothing to send.
// The claim comes first: a timeout leaves the outcome unknown, so it is held, never resent.
export async function prepareGoogleDailyDigest(supabase, options = {}) {
  const date = options.date || googleDigestDate()
  const render = options.render || renderGoogleDigestImage
  const chatId = String(options.chatId || '').trim()
  if (!chatId) return { result: { status: 'skipped', reason: 'Team group is not configured' } }

  const { data: claimed, error: claimError } = await supabase.from(TABLE)
    .update({ send_attempted_at: new Date().toISOString(), telegram_chat_id: chatId })
    .eq('digest_date', date)
    .is('send_attempted_at', null)
    .select('digest_date, reviews, menu, highlights, title')
  if (claimError) throw claimError
  if (!claimed?.length) return { result: { status: 'held', reason: 'Already sent or attempted for this date' } }

  const fail = async sendError => {
    const message = String(sendError?.message || sendError).slice(0, 500)
    await supabase.from(TABLE).update({ send_error: message }).eq('digest_date', date)
    return { status: 'failed', error: message }
  }
  try {
    const { data: previous, error: previousError } = await supabase.from(TABLE)
      .select('digest_date, reviews').lt('digest_date', date).order('digest_date', { ascending: false }).limit(1)
    if (previousError) throw previousError
    const photo = await render(claimed[0], previous?.[0] || null)
    return {
      photo,
      filename: `google-maps-${date}.png`,
      caption: digestCaption(date),
      fail,
      async finish(messageId) {
        const id = Number(messageId) || null
        const { error } = await supabase.from(TABLE)
          .update({ telegram_message_id: id, sent_at: new Date().toISOString(), send_error: null })
          .eq('digest_date', date)
        if (error) throw error
        return { status: 'sent', messageId: id }
      },
    }
  } catch (error) {
    return { result: await fail(error) }
  }
}

// Sends the day's image alone to the Zar Kebab Team group at most once: the fallback when
// it could not join the 04:05 album (empty unavailable-dishes text, Google tasks still running).
export async function sendGoogleDailyDigest(supabase, options = {}) {
  const env = options.env || process.env
  const send = options.send || sendTelegramPhoto
  const chatId = await loadGoogleTeamTarget(supabase, env)
  const prepared = await prepareGoogleDailyDigest(supabase, { ...options, chatId })
  if (prepared.result) return prepared.result
  try {
    const response = await send(chatId, prepared.photo, { caption: prepared.caption, filename: prepared.filename })
    return await prepared.finish(response?.result?.message_id)
  } catch (sendError) {
    return prepared.fail(sendError)
  }
}
