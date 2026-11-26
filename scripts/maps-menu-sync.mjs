#!/usr/bin/env node
// Maps menu sync: builds the Yandex Business and 2GIS price lists from the POS menu and reports
// what changed since the last upload. Neither map has a price-list write API, so uploads stay a
// cabinet step (docs/agent/maps-sync.md); 2GIS can instead fetch /2gis-menu.csv by link.
//
//   npm run maps:menu                   live feed from www.zarkebab.uz -> deliverables/yandex-menu-regular.yml
//                                       and deliverables/2gis-menu.csv (npm run yandex:menu is the same command)
//   --provider=yandex|2gis|all          which price lists to build (default all)
//   --from-db                           build from Supabase with this checkout's feed code (.env.local service key)
//   --dry-run                           report the diff only, write nothing
//   --out=path                          write the Yandex file somewhere else
//   --uploaded                          after the cabinet upload: send the change report to the Team group
//   --note="text"                       extra line for the report image (reviews, profile); repeatable
//   --image=path                        also save the report PNG (preview it before sending)
//   --text                              send the old text report instead of the PNG
//
// Run in a terminal, the script waits for the upload and then sends the report itself (Ctrl+C skips it).
// The baselines are the committed deliverables files: commit them after each upload.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { buildTwoGisMenuCsv, parseTwoGisCsv } from '../api/_lib/twoGisMenu.js'

export const FEED_URL = 'https://www.zarkebab.uz/yandex-menu.yml'
export const CABINET_URL = 'https://yandex.ru/sprav/34684464035/p/edit/price-lists/'
export const DEFAULT_OUT = 'deliverables/yandex-menu-regular.yml'
export const TWO_GIS_OUT = 'deliverables/2gis-menu.csv'
export const TWO_GIS_FEED_URL = 'https://www.zarkebab.uz/2gis-menu.csv'
export const TWO_GIS_CABINET_URL = 'https://account.2gis.com/'
export const PROVIDERS = ['yandex', '2gis']
export const PROVIDER_LABELS = { yandex: 'Яндекс Карты', '2gis': '2ГИС' }
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))
}

// Russian Team-group message sent once the upload is live in the Yandex cabinet.
export function buildTeamMessage(diff, offers, { limit = 4000 } = {}) {
  const lines = [
    '🗺 <b>Меню Zar Kebab обновлено в Яндекс Картах</b>',
    `Позиций в прайс-листе: ${offers}`,
  ]
  const section = (title, rows) => {
    if (!rows.length) return
    lines.push('', `<b>${title} (${rows.length}):</b>`, ...rows.map(escapeHtml))
  }
  section('Добавлено', diff.added.map(offer => `➕ ${offer.name} — ${formatPrice(offer.price)}`))
  section('Удалено', diff.removed.map(offer => `➖ ${offer.name} — ${formatPrice(offer.price)}`))
  section('Новая цена', diff.repriced.map(row => `💰 ${row.name}: ${formatPrice(row.from)} → ${formatPrice(row.to)}`))
  section('Новое название', diff.renamed.map(row => `✏️ ${row.from} → ${row.to}`))
  if (lines.length === 2) lines.push('', 'Изменений в меню нет.')
  const text = lines.join('\n')
  if (text.length <= limit) return text
  // Telegram caps a message at 4096 characters; cut at a line and say so.
  const cut = text.slice(0, limit - 40)
  return `${cut.slice(0, cut.lastIndexOf('\n'))}\n…и ещё изменения (полный список в файле)`
}

export function hasChanges(diff) {
  return Object.values(diff).some(rows => rows.length > 0)
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
  let response
  try {
    response = await fetch(FEED_URL, { headers: { 'Cache-Control': 'no-cache' } })
  } catch (error) {
    throw new Error(`could not reach ${FEED_URL} (${error.cause?.code || error.message}); check the network or use --from-db`)
  }
  if (!response.ok) throw new Error(`${FEED_URL} answered ${response.status}`)
  return response.text()
}

function loadEnv() {
  loadEnvFile(resolve(process.cwd(), '.env.local'))
  loadEnvFile(resolve(process.cwd(), '.env'))
}

async function buildFromDb() {
  loadEnv()
  const { getSupabaseAdmin } = await import('../api/telegram/_lib/supabaseAdmin.js')
  const { loadPosMenu } = await import('../api/_lib/posMenu.js')
  const { buildYandexMenuYml } = await import('../api/yandex-menu/_lib/yandexFeed.js')
  const { categories, items } = await loadPosMenu(getSupabaseAdmin())
  return buildYandexMenuYml(categories, items).yml
}

// Business date in Tashkent, YYYY-MM-DD.
export function tashkentDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// Short caption under the report PNG; the image carries the full list.
export function buildTeamCaption(diff, maps) {
  const counts = [
    diff.removed.length && `удалено ${diff.removed.length}`,
    diff.added.length && `добавлено ${diff.added.length}`,
    diff.repriced.length && `новая цена ${diff.repriced.length}`,
    diff.renamed.length && `новое название ${diff.renamed.length}`,
  ].filter(Boolean)
  const list = (Array.isArray(maps) ? maps : [{ label: PROVIDER_LABELS.yandex, offers: maps }])
  const totals = list.map(map => `${map.label}: ${map.offers}`).join(' · ')
  return `🗺 <b>Карты: меню Zar Kebab обновлено</b>\n${totals}${counts.length ? ` · ${counts.join(', ')}` : ' · без изменений'}`
}

// 2GIS CSV rows as the {id, name, price} offers the diff works with.
export function twoGisOffers(csv) {
  return parseTwoGisCsv(csv).map(row => ({ id: row.id, name: row.name, price: Number(row.price) || 0 }))
}

async function renderReportImage(report) {
  const { renderMapsSyncImage } = await import('../api/telegram/_lib/mapsMenuSyncImage.js')
  return renderMapsSyncImage({ ...report, date: tashkentDate() })
}

// Same Team group as the Google Maps menu sync (telegram_notification_targets.team_events, env fallback).
// Sends one PNG with a short caption; falls back to the text report if the image cannot be rendered.
// report: { diff, maps: [{ label, offers, previous }], notes }
async function sendTeamReport(report, { text = false } = {}) {
  loadEnv()
  const { getSupabaseAdmin } = await import('../api/telegram/_lib/supabaseAdmin.js')
  const { loadGoogleTeamTarget } = await import('../api/google-reviews/_lib/teamNotifications.js')
  const { sendTelegramMessage, sendTelegramPhoto } = await import('../api/telegram/_lib/telegram.js')
  const chatId = await loadGoogleTeamTarget(getSupabaseAdmin())
  if (!chatId) {
    console.log('Team group target is disabled or missing; nothing sent.')
    return
  }
  let image = null
  if (!text) {
    try {
      image = await renderReportImage(report)
    } catch (error) {
      console.log(`Could not render the report image (${error.message}); sending text instead.`)
    }
  }
  const response = image
    ? await sendTelegramPhoto(chatId, image, { caption: buildTeamCaption(report.diff, report.maps), filename: `maps-menu-${tashkentDate()}.png` })
    : await sendTelegramMessage(chatId, buildTeamMessage(report.diff, report.maps[0]?.offers ?? 0))
  console.log(`Sent the ${image ? 'image' : 'text'} report to the Team group (message ${response?.result?.message_id ?? '?'}).`)
}

async function saveReportImage(path, report) {
  writeFileSync(path, await renderReportImage(report))
  console.log(`Saved the report image to ${path}.`)
}

// The committed file is what the map had before this upload.
function committedUpload(path = DEFAULT_OUT) {
  try {
    return execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

async function waitForUpload() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    await rl.question('\nPress Enter once the uploads are live to notify the Team group (Ctrl+C to skip)… ')
    return true
  } catch {
    return false
  } finally {
    rl.close()
  }
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
  const args = {
    fromDb: false, dryRun: false, uploaded: false, out: DEFAULT_OUT,
    notes: [], image: '', text: false, providers: [...PROVIDERS],
  }
  for (const arg of argv) {
    if (arg === '--from-db') args.fromDb = true
    else if (arg === '--uploaded') args.uploaded = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--text') args.text = true
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length)
    else if (arg.startsWith('--note=')) args.notes.push(arg.slice('--note='.length).trim())
    else if (arg.startsWith('--image=')) args.image = arg.slice('--image='.length)
    else if (arg.startsWith('--provider=')) {
      const value = arg.slice('--provider='.length).toLowerCase()
      if (value !== 'all' && !PROVIDERS.includes(value)) throw new Error(`Unknown provider ${value} (yandex, 2gis or all)`)
      args.providers = value === 'all' ? [...PROVIDERS] : [value]
    } else throw new Error(`Unknown option ${arg}`)
  }
  return args
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

// One provider's offers now and at the last committed upload.
function providerState(provider, current, outPath) {
  const parse = provider === 'yandex' ? parseOffers : twoGisOffers
  const path = provider === 'yandex' ? DEFAULT_OUT : TWO_GIS_OUT
  const previous = parse(committedUpload(path) || (provider === 'yandex' ? readIfExists(outPath) : readIfExists(resolve(process.cwd(), path))))
  const offers = parse(current)
  return { provider, label: PROVIDER_LABELS[provider], offers: offers.length, previous: previous.length, diff: diffOffers(previous, offers) }
}

// The image lists the Yandex diff (the full menu); 2GIS differs only by the categories it forbids.
export function buildReport(states, notes = []) {
  const main = states.find(state => state.provider === 'yandex') || states[0]
  return {
    diff: main.diff,
    maps: states.map(({ label, offers, previous }) => ({ label, offers, previous })),
    notes,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outPath = resolve(process.cwd(), args.out)
  const twoGisPath = resolve(process.cwd(), TWO_GIS_OUT)
  const wantsYandex = args.providers.includes('yandex')
  const wantsTwoGis = args.providers.includes('2gis')

  if (args.uploaded) {
    const states = []
    if (wantsYandex) {
      if (!existsSync(outPath)) throw new Error(`${args.out} does not exist; run npm run maps:menu first.`)
      states.push(providerState('yandex', readFileSync(outPath, 'utf8'), outPath))
    }
    if (wantsTwoGis) {
      if (!existsSync(twoGisPath)) throw new Error(`${TWO_GIS_OUT} does not exist; run npm run maps:menu first.`)
      states.push(providerState('2gis', readFileSync(twoGisPath, 'utf8'), outPath))
    }
    const report = buildReport(states, args.notes)
    console.log(formatReport(report.diff))
    if (args.image) await saveReportImage(resolve(process.cwd(), args.image), report)
    await sendTeamReport(report, { text: args.text })
    return
  }

  console.log(args.fromDb ? 'Building the price lists from Supabase…' : `Downloading ${FEED_URL}…`)
  const source = args.fromDb ? await buildFromDb() : await fetchLiveFeed()
  const { yml, trimmed } = trimDescriptions(source)
  // Each upload replaces the whole list on the map, so an empty file would wipe the menu.
  if (!parseOffers(yml).length) throw new Error('The price list has no offers; refusing to write it.')
  const { csv, offers: twoGisCount } = buildTwoGisMenuCsv(source)
  if (wantsTwoGis && !twoGisCount) throw new Error('The 2GIS price list has no offers; refusing to write it.')

  const states = []
  if (wantsYandex) states.push(providerState('yandex', yml, outPath))
  if (wantsTwoGis) states.push(providerState('2gis', csv, outPath))
  for (const state of states) {
    const extra = state.provider === 'yandex' ? `; ${trimmed} description(s) trimmed to ${MAX_DESCRIPTION} characters` : ''
    console.log(`\n${state.label}: ${state.offers} offers (last upload: ${state.previous})${extra}.`)
    console.log(formatReport(state.diff))
  }
  const report = buildReport(states, args.notes)

  if (args.image) await saveReportImage(resolve(process.cwd(), args.image), report)
  if (args.dryRun) {
    console.log('\nDry run: nothing written.')
    return
  }
  if (wantsYandex) {
    writeFileSync(outPath, yml)
    console.log(`\nWrote ${args.out} — XML ${validateXml(outPath)}.`)
    console.log(`Upload it in Chrome: ${CABINET_URL}`)
    console.log('  Загрузить XLS/YML → choose the file → wait for "Прайс-лист успешно загружен, список товаров обновлен".')
  }
  if (wantsTwoGis) {
    writeFileSync(twoGisPath, csv)
    console.log(`\nWrote ${TWO_GIS_OUT}.`)
    console.log(`2GIS: ${TWO_GIS_CABINET_URL} → Товары и услуги. With the link ${TWO_GIS_FEED_URL} set (По ссылке) 2GIS updates itself daily; otherwise Добавить → Из файла → this file.`)
  }
  if (process.stdin.isTTY && await waitForUpload()) await sendTeamReport(report, { text: args.text })
  else console.log('\nAfter the uploads, run: npm run maps:menu -- --uploaded')
  console.log('Then commit the deliverables files so the next run compares against them.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`\nMaps menu sync failed: ${error.message}`)
    process.exitCode = 1
  })
}
