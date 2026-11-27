import { getGoogleAccessToken, getGoogleBusinessConfig, googleLocationResource } from './googleBusiness.js'

// Google Business Profile posts (localPosts) and photos/videos (media), Business Profile API v4.
// Used by `npm run maps:content` through /api/google-reviews/run?task=content (cron secret).
// Yandex, 2GIS and TripAdvisor have no write API for posts or media: docs/agent/maps-sync.md.
const API_URL = 'https://mybusiness.googleapis.com/v4'
export const MAX_POST_SUMMARY = 1500
export const POST_TOPICS = ['STANDARD', 'EVENT', 'OFFER']
export const CTA_TYPES = ['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL']
export const MEDIA_CATEGORIES = ['COVER', 'PROFILE', 'LOGO', 'EXTERIOR', 'INTERIOR', 'FOOD_AND_DRINK', 'MENU', 'PRODUCT', 'TEAMS', 'ADDITIONAL']
export const CONTENT_ACTIONS = ['list-posts', 'create-post', 'delete-post', 'list-media', 'add-media', 'delete-media']
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi)(\?|#|$)/i

function fail(message) {
  throw Object.assign(new Error(message), { status: 400 })
}

function httpsUrl(value, name) {
  let url
  try { url = new URL(String(value || '')) } catch { fail(`${name} must be a full https:// link`) }
  if (url.protocol !== 'https:') fail(`${name} must be a full https:// link`)
  return url.toString()
}

function isoDate(value, name) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) fail(`${name} must look like 2026-12-31`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function mediaFormatFor(url, format) {
  if (format) {
    const upper = String(format).toUpperCase()
    if (!['PHOTO', 'VIDEO'].includes(upper)) fail('format must be PHOTO or VIDEO')
    return upper
  }
  return VIDEO_EXT.test(String(url)) ? 'VIDEO' : 'PHOTO'
}

// Pure: options -> localPost body. Throws status 400 on input Google would refuse.
export function buildLocalPost({ summary, topic = 'STANDARD', photo, cta, ctaUrl, title, start, end, coupon, terms } = {}) {
  const text = String(summary || '').trim()
  if (!text) fail('summary (the post text) is required')
  if ([...text].length > MAX_POST_SUMMARY) fail(`summary is longer than ${MAX_POST_SUMMARY} characters`)
  const topicType = String(topic).toUpperCase()
  if (!POST_TOPICS.includes(topicType)) fail(`topic must be one of ${POST_TOPICS.join(', ')}`)
  const post = { languageCode: 'ru', summary: text, topicType }
  if (cta) {
    const actionType = String(cta).toUpperCase()
    if (!CTA_TYPES.includes(actionType)) fail(`cta must be one of ${CTA_TYPES.join(', ')}`)
    // CALL uses the profile phone; every other button needs a link.
    post.callToAction = actionType === 'CALL' ? { actionType } : { actionType, url: httpsUrl(ctaUrl, 'ctaUrl') }
  }
  if (photo) post.media = [{ mediaFormat: 'PHOTO', sourceUrl: httpsUrl(photo, 'photo') }]
  if (topicType !== 'STANDARD') {
    if (!String(title || '').trim()) fail(`${topicType} posts need a title`)
    post.event = {
      title: String(title).trim().slice(0, 58),
      schedule: { startDate: isoDate(start, 'start'), endDate: isoDate(end || start, 'end') },
    }
  }
  if (topicType === 'OFFER') {
    post.offer = {}
    if (coupon) post.offer.couponCode = String(coupon).trim()
    if (terms) post.offer.termsConditions = String(terms).trim()
  }
  return post
}

export function buildMediaItem({ url, category = 'ADDITIONAL', format, description } = {}) {
  const sourceUrl = httpsUrl(url, 'url')
  const upper = String(category).toUpperCase()
  if (!MEDIA_CATEGORIES.includes(upper)) fail(`category must be one of ${MEDIA_CATEGORIES.join(', ')}`)
  const item = { mediaFormat: mediaFormatFor(sourceUrl, format), locationAssociation: { category: upper }, sourceUrl }
  if (description) item.description = String(description).trim()
  return item
}

function checkChildName(name, kind, location) {
  const value = String(name || '').trim()
  const full = value.includes('/') ? value : `${location}/${kind}/${value}`
  const id = full.slice(`${location}/${kind}/`.length)
  if (!full.startsWith(`${location}/${kind}/`) || !id || id.includes('/')) fail(`${kind} name does not belong to this profile`)
  return full
}

async function call(fetchImpl, token, method, path, body) {
  const response = await fetchImpl(`${API_URL}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let payload = {}
  try { payload = text ? JSON.parse(text) : {} } catch { payload = { raw: text.slice(0, 300) } }
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || `Google API request failed (${response.status})`), { status: 502 })
  return payload
}

function shortPost(post) {
  return { name: post.name, topic: post.topicType, state: post.state, summary: String(post.summary || '').slice(0, 200), createTime: post.createTime, searchUrl: post.searchUrl }
}

function shortMedia(item) {
  return { name: item.name, format: item.mediaFormat, category: item.locationAssociation?.category, createTime: item.createTime, googleUrl: item.googleUrl }
}

// One content action against the profile. input: { action, ...options }.
export async function runGoogleContentAction(input = {}, { env = process.env, fetchImpl = fetch } = {}) {
  const action = String(input.action || '')
  if (!CONTENT_ACTIONS.includes(action)) fail(`action must be one of ${CONTENT_ACTIONS.join(', ')}`)
  // Validate before spending a token request.
  const postBody = action === 'create-post' ? buildLocalPost(input) : null
  const mediaBody = action === 'add-media' ? buildMediaItem(input) : null
  const config = getGoogleBusinessConfig(env)
  const location = googleLocationResource(config)
  const token = await getGoogleAccessToken(config, fetchImpl)
  if (action === 'list-posts') {
    const payload = await call(fetchImpl, token, 'GET', `${location}/localPosts?pageSize=20`)
    return { action, posts: (payload.localPosts || []).map(shortPost) }
  }
  if (action === 'create-post') return { action, post: shortPost(await call(fetchImpl, token, 'POST', `${location}/localPosts`, postBody)) }
  if (action === 'delete-post') {
    const name = checkChildName(input.name, 'localPosts', location)
    await call(fetchImpl, token, 'DELETE', name)
    return { action, deleted: name }
  }
  if (action === 'list-media') {
    const payload = await call(fetchImpl, token, 'GET', `${location}/media?pageSize=100`)
    return { action, media: (payload.mediaItems || []).map(shortMedia), total: payload.totalMediaItemCount ?? null }
  }
  if (action === 'add-media') return { action, media: shortMedia(await call(fetchImpl, token, 'POST', `${location}/media`, mediaBody)) }
  const name = checkChildName(input.name, 'media', location)
  await call(fetchImpl, token, 'DELETE', name)
  return { action, deleted: name }
}
