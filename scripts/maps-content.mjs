#!/usr/bin/env node
// Maps content: posts and photos/videos on every map (docs/agent/maps-sync.md).
//   Google Maps  API: this script creates, lists and deletes posts and photos/videos.
//   Yandex, 2GIS, TripAdvisor: no write API; the script prints the cabinet link and what to do there.
// Without --publish nothing is sent: the script shows the exact request (preview it, get the owner's OK).
//
//   npm run maps:content -- post --summary="Текст" [--photo=https://…jpg] [--cta=ORDER --cta-url=https://…]
//                           [--topic=OFFER|EVENT --title=… --start=2026-12-01 --end=2026-12-31 --coupon=… --terms=…]
//   npm run maps:content -- media --url=https://…(jpg|mp4) [--category=FOOD_AND_DRINK] [--format=VIDEO]
//   npm run maps:content -- posts | photos              list what is on Google now (read only)
//   npm run maps:content -- delete-post --name=<id> | delete-media --name=<id>
//   --publish   really send it to Google (needs CRON_SECRET in .env.local)
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLocalPost, buildMediaItem } from '../api/google-reviews/_lib/googleContent.js'
import { CABINET_URL, TWO_GIS_CABINET_URL, loadEnv } from './maps-menu-sync.mjs'

export const CONTENT_URL = 'https://www.zarkebab.uz/api/google-reviews/run?task=content'
export const TRIPADVISOR_URL = 'https://www.tripadvisor.com/Restaurant_Review-g293968-d34843209-Reviews-ZarKebab-Tashkent_Tashkent_Province.html'
const COMMANDS = { post: 'create-post', media: 'add-media', posts: 'list-posts', photos: 'list-media', 'delete-post': 'delete-post', 'delete-media': 'delete-media' }
const READ_ONLY = new Set(['list-posts', 'list-media'])
const OPTION_KEYS = { 'cta-url': 'ctaUrl' }

export function parseContentArgs(argv) {
  const [command, ...rest] = argv
  const action = COMMANDS[command]
  if (!action) throw new Error(`Command must be one of ${Object.keys(COMMANDS).join(', ')}`)
  const input = { action }
  let publish = false
  for (const arg of rest) {
    if (arg === '--publish') { publish = true; continue }
    const match = arg.match(/^--([a-z-]+)=([\s\S]*)$/)
    if (!match) throw new Error(`Unknown option ${arg}`)
    input[OPTION_KEYS[match[1]] || match[1]] = match[2]
  }
  return { input, publish: publish || READ_ONLY.has(action) }
}

// Throws on input Google would refuse, so a preview already catches mistakes.
export function previewBody(input) {
  if (input.action === 'create-post') return buildLocalPost(input)
  if (input.action === 'add-media') return buildMediaItem(input)
  return input
}

// What the owner does by hand on the maps without a write API.
export function manualSteps(action) {
  if (!['create-post', 'add-media'].includes(action)) return []
  const what = action === 'create-post' ? 'the same post' : 'the same photo/video'
  return [
    `Яндекс Карты: ${CABINET_URL.replace('price-lists/', '')} → publish ${what} in the cabinet`,
    `2ГИС: ${TWO_GIS_CABINET_URL} → publish ${what} in the cabinet`,
    `TripAdvisor: ${TRIPADVISOR_URL} → listing must be claimed first, then add ${what} in the Management Center`,
  ]
}

async function main() {
  const { input, publish } = parseContentArgs(process.argv.slice(2))
  const body = previewBody(input)
  if (!publish) {
    console.log('Preview only (add --publish to send to Google):')
    console.log(JSON.stringify(body, null, 2))
  } else {
    loadEnv()
    const secret = process.env.CRON_SECRET
    if (!secret) throw new Error('CRON_SECRET is missing from .env.local')
    const response = await fetch(CONTENT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.ok) throw new Error(payload.error || `Google content request failed (${response.status})`)
    console.log(JSON.stringify(payload, null, 2))
  }
  for (const step of manualSteps(input.action)) console.log(`• ${step}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`maps:content: ${error.message}`); process.exitCode = 1 })
}
