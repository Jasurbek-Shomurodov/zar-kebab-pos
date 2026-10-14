import sharp from 'sharp'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { configurePayrollFonts } from './payrollReportImage.js'
import {
  getRussianMenuItemName,
  groupUnavailableMenuItems,
} from './menuAvailabilityMessages.js'

const WIDTH = 1200
const CARD_X = 40
const PADDING_X = 56
const COLUMN_GAP = 48
const COLUMN_WIDTH = (WIDTH - CARD_X * 2 - PADDING_X * 2 - COLUMN_GAP) / 2
const HEADER_HEIGHT = 190
const GROUP_TITLE_HEIGHT = 44
const LINE_HEIGHT = 42
const GROUP_PADDING = 34
const NUMBER_WIDTH = 52
// Noto Sans averages ~0.56em per Cyrillic glyph at 30px; wrap instead of truncating names.
const MAX_LINE_CHARS = Math.floor((COLUMN_WIDTH - NUMBER_WIDTH) / 17)

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

function wrapName(name) {
  const lines = []
  let current = ''
  for (const word of String(name).split(/\s+/).filter(Boolean)) {
    let rest = word
    while ([...rest].length > MAX_LINE_CHARS) {
      if (current) {
        lines.push(current)
        current = ''
      }
      lines.push([...rest].slice(0, MAX_LINE_CHARS).join(''))
      rest = [...rest].slice(MAX_LINE_CHARS).join('')
    }
    if (!rest) continue
    const candidate = current ? `${current} ${rest}` : rest
    if ([...candidate].length > MAX_LINE_CHARS) {
      lines.push(current)
      current = rest
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

function layoutGroups(items) {
  let itemNumber = 0
  return groupUnavailableMenuItems(items).map(group => {
    const rows = group.items.map(item => {
      itemNumber += 1
      return { number: itemNumber, lines: wrapName(getRussianMenuItemName(item)) }
    })
    const lineCount = rows.reduce((sum, row) => sum + row.lines.length, 0)
    return {
      categoryName: group.categoryName,
      rows,
      height: GROUP_TITLE_HEIGHT + lineCount * LINE_HEIGHT + GROUP_PADDING,
    }
  })
}

// Keep category order (left column first) and pick the split with the shortest tallest column.
function splitColumns(groups) {
  let best = { left: groups, right: [], height: groups.reduce((sum, g) => sum + g.height, 0) }
  for (let index = 1; index < groups.length; index += 1) {
    const left = groups.slice(0, index)
    const right = groups.slice(index)
    const height = Math.max(
      left.reduce((sum, g) => sum + g.height, 0),
      right.reduce((sum, g) => sum + g.height, 0)
    )
    if (height < best.height) best = { left, right, height }
  }
  return best
}

function renderColumn(groups, x, startY) {
  let y = startY
  return groups.map((group, groupIndex) => {
    const parts = [
      `<text x="${x}" y="${y + 30}" font-size="22" font-weight="700" letter-spacing="1.5" fill="#8b1e1e">${escape(group.categoryName.toLocaleUpperCase('ru'))}</text>`,
    ]
    let lineY = y + GROUP_TITLE_HEIGHT + 32
    for (const row of group.rows) {
      parts.push(`<text x="${x + NUMBER_WIDTH - 14}" y="${lineY}" text-anchor="end" font-size="30" fill="#a08870">${row.number}</text>`)
      for (const line of row.lines) {
        parts.push(`<text x="${x + NUMBER_WIDTH}" y="${lineY}" font-size="30" fill="#2a1d14">${escape(line)}</text>`)
        lineY += LINE_HEIGHT
      }
    }
    y += group.height
    if (groupIndex < groups.length - 1) {
      parts.push(`<rect x="${x}" y="${y - 12}" width="${COLUMN_WIDTH}" height="1.5" fill="#eee2d2"/>`)
    }
    return parts.join('')
  }).join('')
}

export function buildDailyUnavailableMenuImageSvg(items, businessDate, snapshotTime = '08:00') {
  const unavailableItems = Array.isArray(items) ? items : []
  const dateLabel = formatLongDate(businessDate, 'ru', businessDate || '—')
  const { left, right, height: columnsHeight } = splitColumns(layoutGroups(unavailableItems))
  const bodyTop = CARD_X + HEADER_HEIGHT + 28
  const footerTop = bodyTop + columnsHeight + 8
  const cardHeight = footerTop + 96 + 40 - CARD_X
  const height = cardHeight + CARD_X * 2
  const leftX = CARD_X + PADDING_X
  const rightX = leftX + COLUMN_WIDTH + COLUMN_GAP
  const cardWidth = WIDTH - CARD_X * 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="${WIDTH}" height="${height}" fill="#f6efe4"/>
  <g font-family="Noto Sans">
  <rect x="${CARD_X}" y="${CARD_X}" width="${cardWidth}" height="${cardHeight}" rx="28" fill="white"/>
  <path d="M${CARD_X} ${CARD_X + HEADER_HEIGHT}V${CARD_X + 28}a28 28 0 0 1 28 -28H${CARD_X + cardWidth - 28}a28 28 0 0 1 28 28V${CARD_X + HEADER_HEIGHT}Z" fill="#8b1e1e"/>
  <text x="${leftX}" y="${CARD_X + 58}" font-size="22" font-weight="700" letter-spacing="3" fill="#f3d9a4">ZAR KEBAB</text>
  <text x="${leftX}" y="${CARD_X + 118}" font-size="50" font-weight="700" fill="white">Недоступные блюда</text>
  <text x="${leftX}" y="${CARD_X + 160}" font-size="27" fill="white" fill-opacity="0.88">На ${escape(dateLabel)}, ${escape(snapshotTime)}</text>
  ${renderColumn(left, leftX, bodyTop)}
  ${renderColumn(right, rightX, bodyTop)}
  <rect x="${leftX}" y="${footerTop}" width="${cardWidth - PADDING_X * 2}" height="88" rx="18" fill="#2a1d14"/>
  <text x="${leftX + 32}" y="${footerTop + 56}" font-size="32" font-weight="700" fill="white">Всего</text>
  <text x="${leftX + cardWidth - PADDING_X * 2 - 32}" y="${footerTop + 56}" text-anchor="end" font-size="32" font-weight="700" fill="white">${unavailableItems.length}</text>
  </g></svg>`
}

export async function renderDailyUnavailableMenuImage(items, businessDate, snapshotTime) {
  configurePayrollFonts()
  return sharp(Buffer.from(buildDailyUnavailableMenuImageSvg(items, businessDate, snapshotTime)), { density: 144 })
    .png()
    .toBuffer()
}
