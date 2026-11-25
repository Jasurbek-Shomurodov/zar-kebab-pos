#!/usr/bin/env node
// Builds the Yandex Business price-list upload file and reports what changed since the last upload.
// Yandex has no price-list API, so the final upload stays a click in the cabinet (docs/agent/yandex-sync.md).
//
//   npm run yandex:menu                 live feed from www.zarkebab.uz -> deliverables/yandex-menu-regular.yml
//   npm run yandex:menu -- --from-db    build from Supabase with this checkout's feed code (.env.local service key)
//   npm run yandex:menu -- --dry-run    report the diff only, write nothing
//   npm run yandex:menu -- --out=path   write somewhere else
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FEED_URL = 'https://www.zarkebab.uz/yandex-menu.yml'
export const CABINET_URL = 'https://yandex.ru/sprav/34684464035/p/edit/price-lists/'
export const DEFAULT_OUT = 'deliverables/yandex-menu-regular.yml'
// Yandex warns on longer descriptions; the cut keeps the ellipsis inside the limit.
export const MAX_DESCRIPTION = 250

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }

export function decodeXml(value) {
  return String(value).replace(/&(amp|lt|gt|quot|apos);/g, entity => ENTITIES[entity])
}

export function encodeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Offer id, decoded name and price for every <offer> in a YML price list.
export function parseOffers(yml) {
  const offers = []
  for (const match of String(yml).matchAll(/<offer id="([^"]*)">([\s\S]*?)<\/offer>/g)) {
    const body = match[2]
    offers.push({
      id: decodeXml(match[1]),
      name: decodeXml(body.match(/<name>([\s\S]*?)<\/name>/)?.[1] || ''),
      price: Number(body.match(/<price>([\s\S]*?)<\/price>/)?.[1]) || 0,
    })
  }
  return offers
}

// Offers keyed by id: ids are POS item (and variant) ids, so a renamed dish is one change, not two.
export function diffOffers(previous, next) {
  const before = new Map(previous.map(offer => [offer.id, offer]))
  const after = new Map(next.map(offer => [offer.id, offer]))
  const added = next.filter(offer => !before.has(offer.id))
  const removed = previous.filter(offer => !after.has(offer.id))
  const repriced = []
  const renamed = []
  for (const offer of next) {
    const old = before.get(offer.id)
    if (!old) continue
    if (old.price !== offer.price) repriced.push({ id: offer.id, name: offer.name, from: old.price, to: offer.price })
    if (old.name !== offer.name) renamed.push({ id: offer.id, from: old.name, to: offer.name })
  }
  return { added, removed, repriced, renamed }
}

export function trimText(text, max = MAX_DESCRIPTION) {
  const chars = [...text]
  if (chars.length <= max) return text
  const cut = chars.slice(0, max - 1).join('')
  const space = cut.lastIndexOf(' ')
  const base = space > max / 2 ? cut.slice(0, space) : cut
  return `${base.replace(/[\s,.;:—–-]+$/u, '')}…`
}

// Shortens over-long descriptions at a word boundary; lengths count the decoded text Yandex shows.
export function trimDescriptions(yml, max = MAX_DESCRIPTION) {
  let trimmed = 0
  const output = String(yml).replace(/<description>([\s\S]*?)<\/description>/g, (whole, raw) => {
    const text = decodeXml(raw)
    const short = trimText(text, max)
    if (short === text) return whole
    trimmed += 1
    return `<description>${encodeXml(short)}</description>`
  })
  return { yml: output, trimmed }
}

export function formatPrice(value) {
  return `${Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ')} сум`
}

export function formatReport(diff) {
  const lines = []
  const section = (title, rows) => {
    if (!rows.length) return
    lines.push(`${title} (${rows.length}):`, ...rows.map(row => `  ${row}`))
  }
  section('Added', diff.added.map(offer => `+ ${offer.name} — ${formatPrice(offer.price)}`))
  section('Removed', diff.removed.map(offer => `- ${offer.name} — ${formatPrice(offer.price)}`))
  section('Repriced', diff.repriced.map(row => `~ ${row.name}: ${formatPrice(row.from)} → ${formatPrice(row.to)}`))
  section('Renamed', diff.renamed.map(row => `~ ${row.from} → ${row.to}`))
  return lines.length ? lines.join('\n') : 'No menu changes since the last upload.'
}

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

async function fetchLiveFeed() {
  const response = await fetch(FEED_URL, { headers: { 'Cache-Control': 'no-cache' } })
  if (!response.ok) throw new Error(`${FEED_URL} answered ${response.status}`)
  return response.text()
}

async function buildFromDb() {
  loadEnvFile(resolve(process.cwd(), '.env.local'))
  loadEnvFile(resolve(process.cwd(), '.env'))
  const { getSupabaseAdmin } = await import('../api/telegram/_lib/supabaseAdmin.js')
  const { loadPosMenu } = await import('../api/_lib/posMenu.js')
  const { buildYandexMenuYml } = await import('../api/yandex-menu/_lib/yandexFeed.js')
  const { categories, items } = await loadPosMenu(getSupabaseAdmin())
  return buildYandexMenuYml(categories, items).yml
}

// xmllint ships with macOS; elsewhere a missing binary only skips the check.
function validateXml(path) {
  try {
    execFileSync('xmllint', ['--noout', path], { stdio: ['ignore', 'ignore', 'pipe'] })
    return 'valid'
  } catch (error) {
    if (error.code === 'ENOENT') return 'skipped (xmllint not installed)'
    throw new Error(`xmllint rejected ${path}:\n${error.stderr?.toString() || error.message}`)
  }
}

export function parseArgs(argv) {
  const args = { fromDb: false, dryRun: false, out: DEFAULT_OUT }
  for (const arg of argv) {
    if (arg === '--from-db') args.fromDb = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length)
    else throw new Error(`Unknown option ${arg}`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outPath = resolve(process.cwd(), args.out)
  const previousPath = resolve(process.cwd(), DEFAULT_OUT)

  console.log(args.fromDb ? 'Building the price list from Supabase…' : `Downloading ${FEED_URL}…`)
  const source = args.fromDb ? await buildFromDb() : await fetchLiveFeed()
  const { yml, trimmed } = trimDescriptions(source)
  const offers = parseOffers(yml)
  // Each upload replaces Yandex's whole list, so an empty file would wipe the menu.
  if (!offers.length) throw new Error('The price list has no offers; refusing to write it.')

  const previous = existsSync(previousPath) ? parseOffers(readFileSync(previousPath, 'utf8')) : []
  console.log(`\n${offers.length} offers (last upload: ${previous.length}); ${trimmed} description(s) trimmed to ${MAX_DESCRIPTION} characters.\n`)
  console.log(formatReport(diffOffers(previous, offers)))

  if (args.dryRun) {
    console.log('\nDry run: nothing written.')
    return
  }
  writeFileSync(outPath, yml)
  console.log(`\nWrote ${args.out} — XML ${validateXml(outPath)}.`)
  console.log(`\nUpload it in Chrome: ${CABINET_URL}`)
  console.log('  Загрузить XLS/YML → choose the file → wait for "Прайс-лист успешно загружен, список товаров обновлен".')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`\nYandex menu sync failed: ${error.message}`)
    process.exitCode = 1
  })
}
