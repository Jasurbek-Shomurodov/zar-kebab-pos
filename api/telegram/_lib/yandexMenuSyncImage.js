import sharp from 'sharp'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { configurePayrollFonts } from './payrollReportImage.js'

// Russian Team-group PNG for a Yandex Maps sync: price-list changes plus optional notes
// (reviews, profile). Public menu data only: names and regular prices, never costs.
const WIDTH = 1200
const CARD_X = 40
const PADDING_X = 56
const HEADER_HEIGHT = 190
const SECTION_TITLE_HEIGHT = 56
const LINE_HEIGHT = 42
const SECTION_GAP = 26
const MAX_LINE_CHARS = 56

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

export function formatSum(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('ru-RU').replace(/\s/g, ' ')} сум`
}

export function wrapLine(text, max = MAX_LINE_CHARS) {
  const lines = []
  let current = ''
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if ([...candidate].length > max && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

// Sections in reading order; empty ones are dropped so the image stays short.
export function yandexSyncSections(diff = {}, notes = []) {
  return [
    { title: 'Удалено', color: '#b42318', rows: (diff.removed || []).map(row => `${row.name} — ${formatSum(row.price)}`) },
    { title: 'Добавлено', color: '#1a7f37', rows: (diff.added || []).map(row => `${row.name} — ${formatSum(row.price)}`) },
    { title: 'Новая цена', color: '#9a6700', rows: (diff.repriced || []).map(row => `${row.name}: ${formatSum(row.from)} → ${formatSum(row.to)}`) },
    { title: 'Новое название', color: '#0969da', rows: (diff.renamed || []).map(row => `${row.from} → ${row.to}`) },
    { title: 'Отзывы и профиль', color: '#8b1e1e', rows: notes.filter(Boolean), plain: true },
  ].filter(section => section.rows.length)
}

export function buildYandexSyncImageSvg({ diff, offers = 0, previous = 0, date, notes = [] } = {}) {
  const sections = yandexSyncSections(diff, notes)
  const changed = ['added', 'removed', 'repriced', 'renamed'].some(key => (diff?.[key] || []).length)
  const dateLabel = formatLongDate(date, 'ru', date || '—')
  const leftX = CARD_X + PADDING_X
  const cardWidth = WIDTH - CARD_X * 2
  const parts = []
  let y = CARD_X + HEADER_HEIGHT + 34

  // Count tiles: positions now and the change since the last upload.
  const delta = offers - previous
  const tiles = [
    ['Позиций на картах', String(offers)],
    ['Изменение', delta === 0 ? '0' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`],
  ]
  const tileWidth = (cardWidth - PADDING_X * 2 - 24) / 2
  tiles.forEach(([label, value], index) => {
    const x = leftX + index * (tileWidth + 24)
    parts.push(`<rect x="${x}" y="${y}" width="${tileWidth}" height="120" rx="18" fill="#f6efe4"/>`)
    parts.push(`<text x="${x + 28}" y="${y + 42}" font-size="24" fill="#7a6552">${escape(label)}</text>`)
    parts.push(`<text x="${x + 28}" y="${y + 96}" font-size="44" font-weight="700" fill="#2a1d14">${escape(value)}</text>`)
  })
  y += 120 + SECTION_GAP + 10

  if (!sections.length) {
    parts.push(`<text x="${leftX}" y="${y + 36}" font-size="30" fill="#2a1d14">Изменений в меню нет.</text>`)
    y += 60
  }
  for (const section of sections) {
    const count = section.plain ? '' : ` (${section.rows.length})`
    parts.push(`<rect x="${leftX}" y="${y + 12}" width="8" height="30" rx="4" fill="${section.color}"/>`)
    parts.push(`<text x="${leftX + 22}" y="${y + 37}" font-size="26" font-weight="700" letter-spacing="1" fill="${section.color}">${escape(section.title.toLocaleUpperCase('ru'))}${escape(count)}</text>`)
    y += SECTION_TITLE_HEIGHT
    for (const row of section.rows) {
      const lines = wrapLine(row)
      lines.forEach((line, index) => {
        y += LINE_HEIGHT
        if (index === 0) parts.push(`<text x="${leftX + 22}" y="${y - 10}" font-size="29" fill="${section.color}">•</text>`)
        parts.push(`<text x="${leftX + 48}" y="${y - 10}" font-size="29" fill="#2a1d14">${escape(line)}</text>`)
      })
    }
    y += SECTION_GAP
  }

  const cardHeight = y - CARD_X + 30
  const height = cardHeight + CARD_X * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="${WIDTH}" height="${height}" fill="#f6efe4"/>
  <g font-family="Noto Sans">
  <rect x="${CARD_X}" y="${CARD_X}" width="${cardWidth}" height="${cardHeight}" rx="28" fill="white"/>
  <path d="M${CARD_X} ${CARD_X + HEADER_HEIGHT}V${CARD_X + 28}a28 28 0 0 1 28 -28H${CARD_X + cardWidth - 28}a28 28 0 0 1 28 28V${CARD_X + HEADER_HEIGHT}Z" fill="#8b1e1e"/>
  <text x="${leftX}" y="${CARD_X + 58}" font-size="22" font-weight="700" letter-spacing="3" fill="#f3d9a4">ZAR KEBAB · ЯНДЕКС КАРТЫ</text>
  <text x="${leftX}" y="${CARD_X + 118}" font-size="50" font-weight="700" fill="white">${changed ? 'Меню обновлено' : 'Меню проверено'}</text>
  <text x="${leftX}" y="${CARD_X + 160}" font-size="27" fill="white" fill-opacity="0.88">${escape(dateLabel)}</text>
  ${parts.join('\n  ')}
  </g></svg>`
}

export async function renderYandexSyncImage(summary) {
  configurePayrollFonts()
  return sharp(Buffer.from(buildYandexSyncImageSvg(summary)), { density: 144 }).png().toBuffer()
}
