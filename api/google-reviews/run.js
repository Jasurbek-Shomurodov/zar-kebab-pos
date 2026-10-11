import { getBearerToken, json, methodNotAllowed } from '../telegram/_lib/http.js'
import { isGoogleReviewBotConfigured, runGoogleReviewBot } from './_lib/runReviewBot.js'

function requireCronSecret(req) {
  const expected = process.env.CRON_SECRET
  if (!expected || getBearerToken(req) !== expected) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST'])
  try {
    requireCronSecret(req)
    if (!isGoogleReviewBotConfigured()) return json(res, 200, { ok: true, mode: 'disabled', found: 0 })
    const result = await runGoogleReviewBot()
    return json(res, 200, { ok: true, ...result })
  } catch (error) {
    const status = Number(error?.status) || 500
    if (status >= 500) console.error('[google-reviews] run failed:', error)
    return json(res, status, { ok: false, error: error?.message || 'Google review bot failed' })
  }
}
