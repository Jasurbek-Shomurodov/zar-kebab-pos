import { getBearerToken, json, methodNotAllowed } from '../telegram/_lib/http.js'
import { getSupabaseAdmin } from '../telegram/_lib/supabaseAdmin.js'
import { isGoogleReviewBotConfigured, runGoogleReviewBot } from './_lib/runReviewBot.js'
import { runGoogleMenuSync } from './_lib/menuSync.js'

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

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST'])
  try {
    requireCronSecret(req)
    const task = requestTask(req)
    if (!['reviews', 'menu'].includes(task)) return json(res, 400, { ok: false, error: 'Unknown task' })
    if (!isGoogleReviewBotConfigured()) return json(res, 200, { ok: true, task, mode: 'disabled', found: 0 })
    // Menu sync: today's POS menu changes (prices, names, descriptions, photos) to Google Maps.
    const result = task === 'menu'
      ? await runGoogleMenuSync({ supabase: getSupabaseAdmin() })
      : await runGoogleReviewBot()
    return json(res, 200, { ok: true, task, ...result })
  } catch (error) {
    const status = Number(error?.status) || 500
    if (status >= 500) console.error('[google-reviews] run failed:', error)
    return json(res, status, { ok: false, error: error?.message || 'Google review bot failed' })
  }
}
