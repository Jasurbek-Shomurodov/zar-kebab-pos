import { getBearerToken, json, methodNotAllowed } from '../telegram/_lib/http.js'
import { getSupabaseAdmin } from '../telegram/_lib/supabaseAdmin.js'
import { isGoogleReviewBotConfigured, runGoogleReviewBot } from './_lib/runReviewBot.js'
import { runGoogleMenuSync } from './_lib/menuSync.js'
import { serveYandexMenuFeed } from '../yandex-menu/_lib/yandexFeed.js'
import { googleDigestDate, loadHeldReviewDrafts, saveGoogleDigestPart, sendGoogleDailyDigest } from './_lib/dailyDigest.js'

function requireCronSecret(req) {
  const expected = process.env.CRON_SECRET
  if (!expected || getBearerToken(req) !== expected) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }
}

function requestTask(req) {
  const url = new URL(req.url || '/', 'https://www.zarkebab.uz')
  return String(url.searchParams.get('task') || 'reviews').trim()
}

async function recordPart(supabase, part, result, date) {
  try {
    await saveGoogleDigestPart(supabase, part, result, date)
  } catch (error) {
    console.error(`[google-reviews] could not record ${part} for the daily digest:`, error)
  }
}

export default async function handler(req, res) {
  // Public, no cron secret: Yandex Business fetches the menu feed from /yandex-menu.yml.
  if (requestTask(req) === 'yandex-feed') return serveYandexMenuFeed(req, res)
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST'])
  try {
    requireCronSecret(req)
    const task = requestTask(req)
    if (!['reviews', 'menu'].includes(task)) return json(res, 400, { ok: false, error: 'Unknown task' })
    if (!isGoogleReviewBotConfigured()) return json(res, 200, { ok: true, task, mode: 'disabled', found: 0 })
    const supabase = getSupabaseAdmin()
    const date = googleDigestDate()
    let result
    let failure = null
    try {
      // Menu sync: today's POS menu changes (prices, names, descriptions, photos) to Google Maps.
      result = task === 'menu'
        ? await runGoogleMenuSync({ supabase })
        : await runGoogleReviewBot({ heldDrafts: await loadHeldReviewDrafts(supabase) })
    } catch (error) {
      failure = error
      result = { error: String(error?.message || error).slice(0, 500) }
    }
    await recordPart(supabase, task === 'menu' ? 'menu' : 'reviews', result, date)
    // The menu sync runs last (04:20), so it sends the day's image for both tasks.
    const digest = task === 'menu' ? await sendGoogleDailyDigest(supabase, { date }) : undefined
    if (failure) throw failure
    return json(res, 200, { ok: true, task, ...result, ...(digest ? { digest } : {}) })
  } catch (error) {
    const status = Number(error?.status) || 500
    if (status >= 500) console.error('[google-reviews] run failed:', error)
    return json(res, status, { ok: false, error: error?.message || 'Google review bot failed' })
  }
}
