import {
  getGoogleAccessToken,
  getGoogleBusinessConfig,
  isGoogleReviewBotConfigured,
  listUnansweredReviews,
  publishReviewReply,
} from './googleBusiness.js'
import { generateReviewReply, numericRating } from './replyGenerator.js'

export { isGoogleReviewBotConfigured }

export async function runGoogleReviewBot(options = {}) {
  const env = options.env || process.env
  const fetchImpl = options.fetchImpl || fetch
  const config = getGoogleBusinessConfig(env)
  const publish = String(env.GOOGLE_REVIEW_AUTO_PUBLISH || '').toLowerCase() === 'true'
  const limit = Math.max(1, Math.min(Number(env.GOOGLE_REVIEW_MAX_PER_RUN) || 10, 25))
  const accessToken = await getGoogleAccessToken(config, fetchImpl)
  const reviews = await listUnansweredReviews(config, accessToken, { fetchImpl, limit })
  const results = []

  for (const review of reviews) {
    try {
      const generated = await generateReviewReply(review, {
        apiKey: env.GEMINI_API_KEY,
        model: env.GOOGLE_REVIEW_GEMINI_MODEL,
        businessName: env.GOOGLE_REVIEW_BUSINESS_NAME || 'Zar Kebab',
        defaultLanguage: env.GOOGLE_REVIEW_DEFAULT_LANGUAGE || 'Russian',
        fetchImpl,
      })
      if (publish) await publishReviewReply(review.name, generated.reply, accessToken, fetchImpl)
      results.push({
        reviewId: review.reviewId || review.name?.split('/').pop(),
        rating: numericRating(review.starRating),
        status: publish ? 'published' : 'preview',
        source: generated.source,
        reply: generated.reply,
      })
    } catch (error) {
      results.push({
        reviewId: review.reviewId || review.name?.split('/').pop(),
        status: 'failed',
        error: String(error?.message || error).slice(0, 500),
      })
    }
  }

  return {
    mode: publish ? 'publish' : 'preview',
    found: reviews.length,
    succeeded: results.filter(result => result.status !== 'failed').length,
    failed: results.filter(result => result.status === 'failed').length,
    results,
  }
}
