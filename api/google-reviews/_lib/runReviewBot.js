import {
  getGoogleAccessToken,
  getGoogleBusinessConfig,
  isGoogleReviewBotConfigured,
  listUnansweredReviews,
  publishReviewReply,
} from './googleBusiness.js'
import { generateReviewReply, numericRating } from './replyGenerator.js'

export { isGoogleReviewBotConfigured }

// Gemini's free tier allows 5 generateContent requests per minute.
const DEFAULT_GEMINI_INTERVAL_MS = 13000
// Stop starting new replies well before the 300s function/cron timeout; the rest stay
// unanswered and are picked up by the next daily run.
const DEFAULT_TIME_BUDGET_MS = 240000

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function nonNegativeNumber(value, fallback) {
  const number = Number(value)
  return value !== undefined && value !== '' && Number.isFinite(number) && number >= 0 ? number : fallback
}

export async function runGoogleReviewBot(options = {}) {
  const env = options.env || process.env
  const fetchImpl = options.fetchImpl || fetch
  const sleep = options.sleep || defaultSleep
  const now = options.now || Date.now
  const startedAt = now()
  const deadline = startedAt + nonNegativeNumber(env.GOOGLE_REVIEW_TIME_BUDGET_MS, DEFAULT_TIME_BUDGET_MS)
  const usesGemini = Boolean(String(env.GEMINI_API_KEY || '').trim())
  const geminiIntervalMs = nonNegativeNumber(env.GOOGLE_REVIEW_GEMINI_INTERVAL_MS, DEFAULT_GEMINI_INTERVAL_MS)
  const config = getGoogleBusinessConfig(env)
  const publish = String(env.GOOGLE_REVIEW_AUTO_PUBLISH || '').toLowerCase() === 'true'
  const limit = Math.max(1, Math.min(Number(env.GOOGLE_REVIEW_MAX_PER_RUN) || 10, 25))
  const accessToken = await getGoogleAccessToken(config, fetchImpl)
  const reviews = await listUnansweredReviews(config, accessToken, { fetchImpl, limit })
  const results = []
  let lastGeminiAt = null
  let dailyQuotaReached = false

  for (const review of reviews) {
    const reviewId = review.reviewId || review.name?.split('/').pop()
    if (dailyQuotaReached) {
      results.push({ reviewId, status: 'deferred' })
      continue
    }
    if (usesGemini && lastGeminiAt != null) {
      const waitMs = lastGeminiAt + geminiIntervalMs - now()
      if (now() + Math.max(0, waitMs) >= deadline) {
        results.push({ reviewId, status: 'deferred' })
        continue
      }
      if (waitMs > 0) await sleep(waitMs)
    }
    try {
      // The quota counts request starts, so the interval runs from each call's start.
      if (usesGemini) lastGeminiAt = now()
      const generated = await generateReviewReply(review, {
        apiKey: env.GEMINI_API_KEY,
        model: env.GOOGLE_REVIEW_GEMINI_MODEL,
        businessName: env.GOOGLE_REVIEW_BUSINESS_NAME || 'Zar Kebab',
        defaultLanguage: env.GOOGLE_REVIEW_DEFAULT_LANGUAGE || 'Russian',
        fetchImpl,
        sleep,
        now,
        deadline,
      })
      if (publish) await publishReviewReply(review.name, generated.reply, accessToken, fetchImpl)
      results.push({
        reviewId,
        rating: numericRating(review.starRating),
        status: publish ? 'published' : 'preview',
        source: generated.source,
        reply: generated.reply,
      })
    } catch (error) {
      if (error?.dailyQuota) {
        dailyQuotaReached = true
        results.push({ reviewId, status: 'deferred' })
        continue
      }
      results.push({
        reviewId,
        status: 'failed',
        error: String(error?.message || error).slice(0, 500),
      })
    }
  }

  return {
    mode: publish ? 'publish' : 'preview',
    found: reviews.length,
    succeeded: results.filter(result => result.status === 'preview' || result.status === 'published').length,
    failed: results.filter(result => result.status === 'failed').length,
    deferred: results.filter(result => result.status === 'deferred').length,
    results,
  }
}
