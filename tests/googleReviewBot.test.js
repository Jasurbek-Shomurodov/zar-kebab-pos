import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getGoogleAccessToken,
  listUnansweredReviews,
  publishReviewReply,
} from '../api/google-reviews/_lib/googleBusiness.js'
import {
  buildFallbackReply,
  detectReviewLanguage,
  generateReviewReply,
  originalReviewText,
  sanitizeReply,
} from '../api/google-reviews/_lib/replyGenerator.js'
import { runGoogleReviewBot } from '../api/google-reviews/_lib/runReviewBot.js'

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const config = {
  clientId: 'client',
  clientSecret: 'secret',
  refreshToken: 'refresh',
  accountId: '123',
  locationId: '456',
}

test('Google OAuth exchange uses the refresh-token grant', async () => {
  let request
  const token = await getGoogleAccessToken(config, async (url, options) => {
    request = { url, options }
    return response({ access_token: 'access-token' })
  })
  assert.equal(token, 'access-token')
  assert.equal(request.url, 'https://oauth2.googleapis.com/token')
  assert.equal(request.options.method, 'POST')
  assert.equal(request.options.body.get('grant_type'), 'refresh_token')
  assert.equal(request.options.body.get('refresh_token'), 'refresh')
})

test('review listing keeps only unanswered reviews', async () => {
  const reviews = await listUnansweredReviews(config, 'token', {
    limit: 5,
    fetchImpl: async url => {
      assert.match(url, /accounts\/123\/locations\/456\/reviews/)
      return response({ reviews: [
        { name: 'accounts/123/locations/456/reviews/a', starRating: 'FIVE' },
        { name: 'accounts/123/locations/456/reviews/b', reviewReply: { comment: 'Thanks' } },
      ] })
    },
  })
  assert.deepEqual(reviews.map(review => review.name), ['accounts/123/locations/456/reviews/a'])
})

test('publishing validates the Google resource name and sends only the reply', async () => {
  let request
  await publishReviewReply(
    'accounts/123/locations/456/reviews/abc',
    'Thank you!',
    'token',
    async (url, options) => {
      request = { url, options }
      return response({ updateTime: 'now' })
    },
  )
  assert.match(request.url, /reviews\/abc\/reply$/)
  assert.deepEqual(JSON.parse(request.options.body), { comment: 'Thank you!' })
  await assert.rejects(
    publishReviewReply('../reviews/abc', 'No', 'token', async () => response({})),
    /Invalid Google review resource name/,
  )
})

function geminiReply(text) {
  return { candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text }] } }] }
}

test('reply generation has safe templates and sanitizes model output', async () => {
  assert.match(buildFallbackReply({ starRating: 'ONE' }), /sorry/i)
  assert.match(buildFallbackReply({ starRating: 'FIVE' }), /Thank you/)
  assert.equal(sanitizeReply('  “Thank   you!”  '), 'Thank you!')
  const generated = await generateReviewReply(
    { starRating: 'FIVE', comment: 'Great food' },
    {
      apiKey: 'key',
      fetchImpl: async (url, options) => {
        assert.match(url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-[^/]+:generateContent$/)
        assert.equal(options.headers['x-goog-api-key'], 'key')
        const body = JSON.parse(options.body)
        assert.match(body.contents[0].parts[0].text, /untrusted data/)
        return response(geminiReply('Спасибо за ваш отзыв!'))
      },
    },
  )
  assert.deepEqual(generated, { reply: 'Спасибо за ваш отзыв!', source: 'gemini' })
})

test('template replies match the review language or are skipped', async () => {
  assert.equal(detectReviewLanguage('Очень вкусно'), 'ru')
  assert.equal(detectReviewLanguage('Жуда мазали, раҳмат'), 'uz-Cyrl')
  assert.equal(detectReviewLanguage("Juda mazali, zo'r joy"), 'uz-Latn')
  assert.equal(detectReviewLanguage('Great food'), 'en')
  assert.equal(detectReviewLanguage('', 'Russian'), 'ru')
  assert.equal(detectReviewLanguage('Super jedzenie, polecam!'), null)
  assert.equal(detectReviewLanguage('とても美味しい'), null)

  assert.match(buildFallbackReply({ starRating: 'FIVE', comment: 'Очень вкусно' }), /^Спасибо.*Zar Kebab/)
  assert.match(buildFallbackReply({ starRating: 'FIVE', comment: 'Juda mazali' }), /^Fikringiz.*Zar Kebab/)
  assert.match(buildFallbackReply({ starRating: 'ONE', comment: 'Жуда ёмон' }), /^Тажрибангиз.*Zar Kebab/)
  assert.match(
    buildFallbackReply({ starRating: 'FIVE', comment: '(Translated by Google) Very tasty\n\n(Original)\nОчень вкусно' }),
    /^Спасибо/,
  )
  assert.equal(buildFallbackReply({ starRating: 'FIVE', comment: 'とても美味しい' }), null)

  const generated = await generateReviewReply({ starRating: 'FIVE', comment: '' })
  assert.match(generated.reply, /^Спасибо/)
  await assert.rejects(
    generateReviewReply({ starRating: 'FIVE', comment: 'とても美味しい' }),
    /No reply template for this review language/,
  )
})

test('replies use the guest original text, not the Google translation', async () => {
  assert.equal(
    originalReviewText('(Translated by Google) Very tasty\n\n(Original)\nJuda mazali'),
    'Juda mazali',
  )
  assert.equal(originalReviewText('Очень вкусно'), 'Очень вкусно')
  await generateReviewReply(
    { starRating: 'FIVE', comment: '(Translated by Google) Very tasty\n\n(Original)\nJuda mazali' },
    {
      apiKey: 'key',
      fetchImpl: async (_url, options) => {
        const input = JSON.parse(options.body).contents[0].parts[0].text
        assert.match(input, /Juda mazali/)
        assert.doesNotMatch(input, /Very tasty/)
        assert.match(input, /exactly the same language and script/)
        assert.match(input, /Always mention Zar Kebab by name, and never name individual staff/)
        return response(geminiReply('Rahmat!'))
      },
    },
  )
})

test('bot previews by default and publishes only with the explicit switch', async () => {
  const calls = []
  const env = {
    GOOGLE_BUSINESS_CLIENT_ID: 'client',
    GOOGLE_BUSINESS_CLIENT_SECRET: 'secret',
    GOOGLE_BUSINESS_REFRESH_TOKEN: 'refresh',
    GOOGLE_BUSINESS_ACCOUNT_ID: '123',
    GOOGLE_BUSINESS_LOCATION_ID: '456',
    GOOGLE_REVIEW_BUSINESS_NAME: 'Zar Kebab',
  }
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'token' })
    if (url.endsWith('/reply')) return response({ updateTime: 'now' })
    return response({ reviews: [{
      name: 'accounts/123/locations/456/reviews/abc',
      reviewId: 'abc',
      starRating: 'FOUR',
      comment: 'Nice',
    }] })
  }

  const preview = await runGoogleReviewBot({ env, fetchImpl })
  assert.equal(preview.mode, 'preview')
  assert.equal(preview.results[0].status, 'preview')
  assert.equal(calls.some(call => call.url.endsWith('/reply')), false)

  env.GOOGLE_REVIEW_AUTO_PUBLISH = 'true'
  const published = await runGoogleReviewBot({ env, fetchImpl })
  assert.equal(published.results[0].status, 'published')
  assert.equal(calls.some(call => call.url.endsWith('/reply')), true)
})

test('Supabase runs the review bot daily at 13:00 Tashkent, outside the 08:00 job', async () => {
  const { readFile } = await import('node:fs/promises')
  const migration = await readFile(new URL('../migrations/225_google_review_reply_cron.sql', import.meta.url), 'utf8')
  assert.match(migration, /'zar-kebab-google-review-replies',\s*'0 8 \* \* \*'/)
  assert.match(migration, /url := 'https:\/\/www\.zarkebab\.uz\/api\/google-reviews\/run'/)
  assert.match(migration, /name = 'zar_kebab_daily_report_cron_secret'/)
  assert.match(migration, /where jobname = 'zar-kebab-google-review-replies'/)
  assert.match(migration, /revoke all on function public\.invoke_zar_kebab_google_review_replies\(\) from anon/)
  const dailyCron = await readFile(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  assert.doesNotMatch(dailyCron, /runGoogleReviewBot/)
})
