import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLocalPost, buildMediaItem, mediaFormatFor, runGoogleContentAction } from '../api/google-reviews/_lib/googleContent.js'
import { manualSteps, parseContentArgs, previewBody } from '../scripts/maps-content.mjs'

const env = {
  GOOGLE_BUSINESS_CLIENT_ID: 'id', GOOGLE_BUSINESS_CLIENT_SECRET: 'secret', GOOGLE_BUSINESS_REFRESH_TOKEN: 'refresh',
  GOOGLE_BUSINESS_ACCOUNT_ID: '111', GOOGLE_BUSINESS_LOCATION_ID: '222',
}
const LOC = 'accounts/111/locations/222'

function fakeFetch(responses) {
  const calls = []
  const impl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : String(options.body)) : null })
    if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok' }))
    const next = responses.shift() ?? {}
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 })
  }
  return { impl, calls }
}

test('buildLocalPost makes a standard post with photo and order button', () => {
  const post = buildLocalPost({ summary: ' Новинка ', photo: 'https://x.uz/a.jpg', cta: 'order', ctaUrl: 'https://zarkebab.uz' })
  assert.deepEqual(post, {
    languageCode: 'ru', summary: 'Новинка', topicType: 'STANDARD',
    callToAction: { actionType: 'ORDER', url: 'https://zarkebab.uz/' },
    media: [{ mediaFormat: 'PHOTO', sourceUrl: 'https://x.uz/a.jpg' }],
  })
})

test('buildLocalPost builds offers with schedule and rejects bad input', () => {
  const offer = buildLocalPost({ summary: 'Скидка', topic: 'offer', title: 'Сет', start: '2026-12-01', end: '2026-12-31', coupon: 'ZAR10' })
  assert.deepEqual(offer.event.schedule, { startDate: { year: 2026, month: 12, day: 1 }, endDate: { year: 2026, month: 12, day: 31 } })
  assert.equal(offer.offer.couponCode, 'ZAR10')
  assert.deepEqual(buildLocalPost({ summary: 'a', cta: 'CALL' }).callToAction, { actionType: 'CALL' })
  assert.throws(() => buildLocalPost({}), /summary/)
  assert.throws(() => buildLocalPost({ summary: 'x'.repeat(1501) }), /1500/)
  assert.throws(() => buildLocalPost({ summary: 'a', cta: 'ORDER' }), /ctaUrl/)
  assert.throws(() => buildLocalPost({ summary: 'a', photo: 'http://x.uz/a.jpg' }), /https/)
  assert.throws(() => buildLocalPost({ summary: 'a', topic: 'EVENT', start: '2026-12-01' }), /title/)
  assert.throws(() => buildLocalPost({ summary: 'a', topic: 'EVENT', title: 't', start: '1.12.2026' }), /start/)
})

test('buildMediaItem detects videos and checks the category', () => {
  assert.equal(mediaFormatFor('https://x.uz/clip.MP4?v=1'), 'VIDEO')
  assert.equal(mediaFormatFor('https://x.uz/a.jpg'), 'PHOTO')
  assert.deepEqual(buildMediaItem({ url: 'https://x.uz/clip.mp4', category: 'food_and_drink' }), {
    mediaFormat: 'VIDEO', locationAssociation: { category: 'FOOD_AND_DRINK' }, sourceUrl: 'https://x.uz/clip.mp4',
  })
  assert.throws(() => buildMediaItem({ url: 'https://x.uz/a.jpg', category: 'SELFIE' }), /category/)
  assert.throws(() => buildMediaItem({ url: 'https://x.uz/a', format: 'GIF' }), /PHOTO or VIDEO/)
})

test('runGoogleContentAction creates, lists and deletes posts and media', async () => {
  const { impl, calls } = fakeFetch([{ body: { name: `${LOC}/localPosts/9`, topicType: 'STANDARD', state: 'LIVE', summary: 'Hi' } }])
  const created = await runGoogleContentAction({ action: 'create-post', summary: 'Hi' }, { env, fetchImpl: impl })
  assert.equal(created.post.name, `${LOC}/localPosts/9`)
  assert.equal(calls[1].url, `https://mybusiness.googleapis.com/v4/${LOC}/localPosts`)
  assert.equal(calls[1].method, 'POST')
  assert.equal(calls[1].body.summary, 'Hi')

  const list = fakeFetch([{ body: { mediaItems: [{ name: `${LOC}/media/1`, mediaFormat: 'VIDEO', locationAssociation: { category: 'INTERIOR' } }], totalMediaItemCount: 1 } }])
  const media = await runGoogleContentAction({ action: 'list-media' }, { env, fetchImpl: list.impl })
  assert.deepEqual(media.media[0], { name: `${LOC}/media/1`, format: 'VIDEO', category: 'INTERIOR', createTime: undefined, googleUrl: undefined })

  const del = fakeFetch([{ body: {} }])
  const deleted = await runGoogleContentAction({ action: 'delete-post', name: '9' }, { env, fetchImpl: del.impl })
  assert.equal(deleted.deleted, `${LOC}/localPosts/9`)
  assert.equal(del.calls[1].method, 'DELETE')
})

test('runGoogleContentAction refuses foreign names, unknown actions and reports Google errors', async () => {
  const { impl, calls } = fakeFetch([])
  await assert.rejects(runGoogleContentAction({ action: 'delete-media', name: 'accounts/9/locations/9/media/1' }, { env, fetchImpl: impl }), /does not belong/)
  await assert.rejects(runGoogleContentAction({ action: 'nuke' }, { env, fetchImpl: impl }), /action must be/)
  await assert.rejects(runGoogleContentAction({ action: 'create-post' }, { env, fetchImpl: impl }), /summary/)
  assert.equal(calls.filter(call => !call.url.includes('oauth2')).length, 0)
  const bad = fakeFetch([{ status: 400, body: { error: { message: 'Invalid photo' } } }])
  await assert.rejects(runGoogleContentAction({ action: 'add-media', url: 'https://x.uz/a.jpg' }, { env, fetchImpl: bad.impl }), /Invalid photo/)
})

test('maps:content parses commands, previews by default and lists manual steps', () => {
  const { input, publish } = parseContentArgs(['post', '--summary=Привет', '--cta=ORDER', '--cta-url=https://zarkebab.uz'])
  assert.deepEqual(input, { action: 'create-post', summary: 'Привет', cta: 'ORDER', ctaUrl: 'https://zarkebab.uz' })
  assert.equal(publish, false)
  assert.equal(parseContentArgs(['media', '--url=https://x.uz/a.jpg', '--publish']).publish, true)
  assert.equal(parseContentArgs(['posts']).publish, true)
  assert.throws(() => parseContentArgs(['tweet']), /Command/)
  assert.throws(() => parseContentArgs(['post', 'oops']), /Unknown option/)
  assert.equal(previewBody(input).callToAction.actionType, 'ORDER')
  assert.equal(manualSteps('create-post').length, 3)
  assert.match(manualSteps('add-media')[2], /claimed/)
  assert.deepEqual(manualSteps('list-posts'), [])
})
