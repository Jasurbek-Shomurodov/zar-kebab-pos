const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_BUSINESS_API_URL = 'https://mybusiness.googleapis.com/v4'

function required(value, name) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new Error(`Missing ${name}`)
  return normalized
}

function googleErrorMessage(payload, status) {
  return payload?.error?.message || payload?.error_description || `Google API request failed (${status})`
}

async function readResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 500) }
  }
}

export function getGoogleBusinessConfig(env = process.env) {
  return {
    clientId: required(env.GOOGLE_BUSINESS_CLIENT_ID, 'GOOGLE_BUSINESS_CLIENT_ID'),
    clientSecret: required(env.GOOGLE_BUSINESS_CLIENT_SECRET, 'GOOGLE_BUSINESS_CLIENT_SECRET'),
    refreshToken: required(env.GOOGLE_BUSINESS_REFRESH_TOKEN, 'GOOGLE_BUSINESS_REFRESH_TOKEN'),
    accountId: required(env.GOOGLE_BUSINESS_ACCOUNT_ID, 'GOOGLE_BUSINESS_ACCOUNT_ID'),
    locationId: required(env.GOOGLE_BUSINESS_LOCATION_ID, 'GOOGLE_BUSINESS_LOCATION_ID'),
  }
}

export function isGoogleReviewBotConfigured(env = process.env) {
  return [
    env.GOOGLE_BUSINESS_CLIENT_ID,
    env.GOOGLE_BUSINESS_CLIENT_SECRET,
    env.GOOGLE_BUSINESS_REFRESH_TOKEN,
    env.GOOGLE_BUSINESS_ACCOUNT_ID,
    env.GOOGLE_BUSINESS_LOCATION_ID,
  ].every(value => String(value || '').trim())
}

export async function getGoogleAccessToken(config, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  })
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await readResponse(response)
  if (!response.ok || !payload.access_token) {
    throw new Error(googleErrorMessage(payload, response.status))
  }
  return payload.access_token
}

export function googleLocationResource(config) {
  const accountId = encodeURIComponent(config.accountId.replace(/^accounts\//, ''))
  const locationId = encodeURIComponent(config.locationId.replace(/^locations\//, ''))
  return `accounts/${accountId}/locations/${locationId}`
}

export async function listUnansweredReviews(config, accessToken, options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const limit = Math.max(1, Math.min(Number(options.limit) || 10, 50))
  const params = new URLSearchParams({
    pageSize: String(Math.min(50, Math.max(limit * 2, 10))),
    orderBy: 'updateTime desc',
  })
  const response = await fetchImpl(
    `${GOOGLE_BUSINESS_API_URL}/${googleLocationResource(config)}/reviews?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const payload = await readResponse(response)
  if (!response.ok) throw new Error(googleErrorMessage(payload, response.status))
  return (payload.reviews || []).filter(review => !review.reviewReply).slice(0, limit)
}

export async function publishReviewReply(reviewName, reply, accessToken, fetchImpl = fetch) {
  const normalizedName = required(reviewName, 'review resource name')
  if (!/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/.test(normalizedName)) {
    throw new Error('Invalid Google review resource name')
  }
  const response = await fetchImpl(`${GOOGLE_BUSINESS_API_URL}/${normalizedName}/reply`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment: reply }),
  })
  const payload = await readResponse(response)
  if (!response.ok) throw new Error(googleErrorMessage(payload, response.status))
  return payload
}
