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
  geminiRetryDelayMs,
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

function geminiRateLimit(retryDelay = '12s') {
  return response({
    error: {
      code: 429,
      message: 'Quota exceeded for metric: generate_content_free_tier_requests',
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }],
    },
  }, 429)
}

function fakeClock() {
  let time = 0
  return {
    now: () => time,
    sleep: async ms => { time += ms },
  }
}

test('Gemini rate limits are retried after the suggested delay, within the deadline', async () => {
  assert.equal(geminiRetryDelayMs(await geminiRateLimit('12s').json()), 12500)
  assert.equal(geminiRetryDelayMs({}), 15000)

  const clock = fakeClock()
  let calls = 0
  const generated = await generateReviewReply({ starRating: 'FIVE', comment: 'Great' }, {
    apiKey: 'key',
    ...clock,
    fetchImpl: async () => (++calls === 1 ? geminiRateLimit() : response(geminiReply('Thank you from Zar Kebab!'))),
  })
  assert.equal(generated.reply, 'Thank you from Zar Kebab!')
  assert.equal(calls, 2)
  assert.equal(clock.now(), 12500)

  calls = 0
  await assert.rejects(
    generateReviewReply({ starRating: 'FIVE', comment: 'Great' }, {
      apiKey: 'key',
      ...fakeClock(),
      deadline: 5000,
      fetchImpl: async () => { calls += 1; return geminiRateLimit() },
    }),
    error => error.status === 429,
  )
  assert.equal(calls, 1, 'a retry that would pass the deadline is not attempted')

  await assert.rejects(
    generateReviewReply({ starRating: 'FIVE', comment: 'Great' }, {
      apiKey: 'key',
      ...fakeClock(),
      fetchImpl: async () => response({ error: { message: 'bad key' } }, 400),
    }),
    /bad key/,
  )
})

test('bot paces Gemini calls and defers reviews past its time budget', async () => {
  const clock = fakeClock()
  const geminiCalls = []
  const env = {
    GOOGLE_BUSINESS_CLIENT_ID: 'client',
    GOOGLE_BUSINESS_CLIENT_SECRET: 'secret',
    GOOGLE_BUSINESS_REFRESH_TOKEN: 'refresh',
    GOOGLE_BUSINESS_ACCOUNT_ID: '123',
    GOOGLE_BUSINESS_LOCATION_ID: '456',
    GEMINI_API_KEY: 'key',
    GOOGLE_REVIEW_TIME_BUDGET_MS: '30000',
  }
  const fetchImpl = async url => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'token' })
    if (url.includes('generativelanguage')) {
      geminiCalls.push(clock.now())
      return response(geminiReply('Thank you from Zar Kebab!'))
    }
    return response({ reviews: ['a', 'b', 'c', 'd'].map(id => ({
      name: `accounts/123/locations/456/reviews/${id}`,
      reviewId: id,
      starRating: 'FIVE',
      comment: 'Great',
    })) })
  }

  const result = await runGoogleReviewBot({ env, fetchImpl, ...clock })
  assert.deepEqual(geminiCalls, [0, 13000, 26000])
  assert.deepEqual(result.results.map(item => item.status), ['preview', 'preview', 'preview', 'deferred'])
  assert.equal(result.succeeded, 3)
  assert.equal(result.failed, 0)
  assert.equal(result.deferred, 1)
})

test('a Gemini daily quota stops the run and defers the rest without retrying', async () => {
  const geminiCalls = []
  const env = {
    GOOGLE_BUSINESS_CLIENT_ID: 'client',
    GOOGLE_BUSINESS_CLIENT_SECRET: 'secret',
    GOOGLE_BUSINESS_REFRESH_TOKEN: 'refresh',
    GOOGLE_BUSINESS_ACCOUNT_ID: '123',
    GOOGLE_BUSINESS_LOCATION_ID: '456',
    GEMINI_API_KEY: 'key',
  }
  const fetchImpl = async url => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'token' })
    if (url.includes('generativelanguage')) {
      geminiCalls.push(url)
      if (geminiCalls.length === 1) return response(geminiReply('Thank you from Zar Kebab!'))
      return response({
        error: {
          code: 429,
          message: 'Generate content requests per day limit exceeded on Free Tier.',
          details: [
            { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
            { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' },
          ],
        },
      }, 429)
    }
    return response({ reviews: ['a', 'b', 'c'].map(id => ({
      name: `accounts/123/locations/456/reviews/${id}`,
      reviewId: id,
      starRating: 'FIVE',
      comment: 'Great',
    })) })
  }

  const result = await runGoogleReviewBot({ env, fetchImpl, ...fakeClock() })
  assert.equal(geminiCalls.length, 2)
  assert.deepEqual(result.results.map(item => item.status), ['preview', 'deferred', 'deferred'])
  assert.equal(result.failed, 0)
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

test('266 runs review replies and the menu sync right after the 04:05 reports, in their own jobs', async () => {
  const { readFile } = await import('node:fs/promises')
  const migration = await readFile(new URL('../migrations/266_google_business_daily_sync.sql', import.meta.url), 'utf8')
  const reports = await readFile(new URL('../migrations/244_kpi_day_ends_0400.sql', import.meta.url), 'utf8')
  assert.match(reports, /'zar-kebab-daily-reports',\s*'5 23 \* \* \*'/, 'daily reports still start at 23:05 UTC (04:05 Tashkent)')
  assert.match(migration, /'zar-kebab-google-review-replies',\s*'10 23 \* \* \*'/)
  assert.match(migration, /'zar-kebab-google-menu-sync',\s*'20 23 \* \* \*'/)
  assert.match(migration, /url := 'https:\/\/www\.zarkebab\.uz\/api\/google-reviews\/run\?task=menu'/)
  assert.match(migration, /name = 'zar_kebab_daily_report_cron_secret'/)
  assert.match(migration, /revoke all on function public\.invoke_zar_kebab_google_menu_sync\(\) from anon/)
  assert.match(migration, /alter table public\.google_menu_photo_keys enable row level security/)
  assert.match(migration, /revoke all on table public\.google_menu_photo_keys from anon, authenticated/)
  assert.doesNotMatch(migration, /invoke_zar_kebab_daily_reports/, 'never chained into the report job')
})
