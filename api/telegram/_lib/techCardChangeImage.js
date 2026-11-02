import sharp from 'sharp'
import { formatLongDateTime } from '../../../src/lib/dateFormat.js'
import { techCardUnitLabel } from '../../../src/lib/techCards.js'
import { configurePayrollFonts } from './payrollReportImage.js'

const WIDTH = 1280
const MARGIN = 32
const PADDING = 40
const LEFT = MARGIN + PADDING
const CONTENT_WIDTH = WIDTH - (MARGIN + PADDING) * 2
const RIGHT = LEFT + CONTENT_WIDTH
const HEADER_HEIGHT = 196
const CONTINUATION_HEADER_HEIGHT = 92
const TILE_HEIGHT = 128
// Telegram downscales tall photos, so long cards continue on another page instead.
const MAX_PAGE_HEIGHT = 1760
const ROW_PADDING = 18
const ROW_LINE_HEIGHT = 30
const TEXT_LINE_HEIGHT = 36
const NAME_WIDTH = 330
const CELL_WIDTH = 290
const COLUMNS = { name: LEFT + 16, before: LEFT + 16 + NAME_WIDTH, after: LEFT + 16 + NAME_WIDTH + CELL_WIDTH, diff: RIGHT - 16 }
// Noto Sans averages ~0.56em per Cyrillic glyph; wrap on a slightly wider estimate.
const charsFor = (width, fontSize) => Math.floor(width / (fontSize * 0.58))

const ROW_STYLES = {
  added: { background: '#e8f6ee', label: 'Добавлено', color: '#1d7a52' },
  removed: { background: '#fdeaea', label: 'Удалено', color: '#c4262c' },
  changed: { background: '#fff4dc', label: 'Изменено', color: '#b45309' },
  same: { background: '', label: '', color: '#a08870' },
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
const money = value => new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))
const decimal = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value) || 0)
const unit = value => techCardUnitLabel(value, 'ru')
const signedMoney = value => `${value > 0 ? '+' : '−'}${money(Math.abs(value))}`

function wrapText(text, maxChars) {
  const lines = []
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    let current = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word
      while ([...rest].length > maxChars) {
        if (current) {
          lines.push(current)
          current = ''
        }
        lines.push([...rest].slice(0, maxChars).join(''))
        rest = [...rest].slice(maxChars).join('')
      }
      if (!rest) continue
      const candidate = current ? `${current} ${rest}` : rest
      if ([...candidate].length > maxChars) {
        lines.push(current)
        current = rest
      } else {
        current = candidate
      }
    }
    lines.push(current)
  }
  while (lines.length > 1 && !lines[lines.length - 1]) lines.pop()
  return lines
}

const ingredientKey = row => String(row?.name || '').trim().toLocaleLowerCase('ru')
const componentKey = row => `${row?.menu_item_id}:${JSON.stringify(row?.selected_options || {})}`
const ingredientCost = row => (Number(row.quantity) || 0) * (Number(row.unit_price_uzs) || 0)
function componentCost(row) {
  return row.unit_cost == null ? null : (Number(row.quantity) || 0) * Number(row.unit_cost)
}

// Rows keep the saved order; removed rows follow it, so the new recipe reads top to bottom.
export function diffTechCardRows(before = [], after = [], keyOf, isChanged) {
  const beforeByKey = new Map(before.map(row => [keyOf(row), row]))
  const afterKeys = new Set(after.map(keyOf))
  const rows = after.map(row => {
    const previous = beforeByKey.get(keyOf(row))
    if (!previous) return { status: 'added', before: null, after: row }
    return { status: isChanged(previous, row) ? 'changed' : 'same', before: previous, after: row }
  })
  for (const row of before) {
    if (!afterKeys.has(keyOf(row))) rows.push({ status: 'removed', before: row, after: null })
  }
  return rows
}

export function diffTechCardIngredients(before, after) {
  return diffTechCardRows(before, after, ingredientKey, (a, b) => Number(a.quantity) !== Number(b.quantity)
    || a.unit !== b.unit
    || Number(a.unit_price_uzs) !== Number(b.unit_price_uzs))
}

export function diffTechCardComponents(before, after) {
  return diffTechCardRows(before, after, componentKey, (a, b) => Number(a.quantity) !== Number(b.quantity))
}

function ingredientCell(row) {
  if (!row) return ['—', '']
  return [`${decimal(row.quantity)} ${unit(row.unit)}`, `× ${decimal(row.unit_price_uzs)} = ${money(ingredientCost(row))}`]
}

function componentCell(row) {
  if (!row) return ['—', '']
  const cost = componentCost(row)
  return [`${decimal(row.quantity)} ${unit(row.unit)}`, cost == null ? 'нет себестоимости' : `× ${money(row.unit_cost)} = ${money(cost)}`]
}

function rowDifference(row, costOf) {
  const previous = row.before ? costOf(row.before) : 0
  const current = row.after ? costOf(row.after) : 0
  return previous == null || current == null ? 0 : current - previous
}

function tableBlocks(title, rows, cellOf, costOf, nameOf) {
  if (rows.length === 0) return []
  const heading = {
    height: 84,
    keepWithNext: true,
    draw: y => `<text x="${LEFT}" y="${y + 34}" font-size="28" font-weight="700" fill="#2a1d14">${escape(title)}</text>
      <rect x="${LEFT}" y="${y + 50}" width="${CONTENT_WIDTH}" height="34" rx="8" fill="#f6efe4"/>
      <g font-size="19" font-weight="600" fill="#7a6a5a">
      <text x="${COLUMNS.name}" y="${y + 74}">Название</text>
      <text x="${COLUMNS.before}" y="${y + 74}">Было</text>
      <text x="${COLUMNS.after}" y="${y + 74}">Стало</text>
      <text x="${COLUMNS.diff}" y="${y + 74}" text-anchor="end">Разница, UZS</text></g>`,
  }
  const body = rows.map(row => {
    const nameLines = wrapText(nameOf(row.after || row.before), charsFor(NAME_WIDTH - 20, 23))
    const height = Math.max(nameLines.length, 2) * ROW_LINE_HEIGHT + ROW_PADDING
    const style = ROW_STYLES[row.status]
    const difference = rowDifference(row, costOf)
    const [beforeTop, beforeBottom] = cellOf(row.before)
    const [afterTop, afterBottom] = cellOf(row.after)
    const dim = row.status === 'same' ? '#7a6a5a' : '#2a1d14'
    return {
      height,
      draw: y => `${style.background ? `<rect x="${LEFT}" y="${y + 2}" width="${CONTENT_WIDTH}" height="${height - 4}" rx="8" fill="${style.background}"/>` : ''}
        ${nameLines.map((line, index) => `<text x="${COLUMNS.name}" y="${y + 33 + index * ROW_LINE_HEIGHT}" font-size="23" font-weight="600" fill="#2a1d14">${escape(line)}</text>`).join('')}
        <text x="${COLUMNS.before}" y="${y + 33}" font-size="23" fill="${dim}">${escape(beforeTop)}</text>
        <text x="${COLUMNS.before}" y="${y + 61}" font-size="18" fill="#7a6a5a">${escape(beforeBottom)}</text>
        ${row.status === 'same'
    ? `<text x="${COLUMNS.after}" y="${y + 33}" font-size="23" fill="${dim}">${escape(afterTop)}</text>`
    : `<text x="${COLUMNS.after}" y="${y + 33}" font-size="23" font-weight="700" fill="${dim}">${escape(afterTop)}</text>`}
        <text x="${COLUMNS.after}" y="${y + 61}" font-size="18" fill="#7a6a5a">${escape(afterBottom)}</text>
        <text x="${COLUMNS.diff}" y="${y + 33}" text-anchor="end" font-size="23" font-weight="700" fill="${difference > 0 ? '#c4262c' : difference < 0 ? '#1d7a52' : '#a08870'}">${difference ? signedMoney(difference) : '—'}</text>
        <text x="${COLUMNS.diff}" y="${y + 61}" text-anchor="end" font-size="17" font-weight="600" fill="${style.color}">${escape(style.label)}</text>
        <rect x="${LEFT}" y="${y + height - 1}" width="${CONTENT_WIDTH}" height="1" fill="#eee2d2"/>`,
    }
  })
  return [heading, ...body, { height: 20, draw: () => '' }]
}

function textBlocks(title, before, after, hasBefore) {
  const previous = String(before ?? '').trim()
  const current = String(after ?? '').trim()
  if (!previous && !current) return []
  const changed = hasBefore && previous !== current
  const parts = changed
    ? [['Было', previous || '—', '#c4262c'], ['Стало', current || '—', '#1d7a52']]
    : [['', current, '']]
  const blocks = [{
    height: 52,
    keepWithNext: true,
    draw: y => `<text x="${LEFT}" y="${y + 36}" font-size="28" font-weight="700" fill="#2a1d14">${escape(title)}</text>
      ${changed ? '' : hasBefore ? `<text x="${RIGHT}" y="${y + 36}" text-anchor="end" font-size="19" fill="#a08870">без изменений</text>` : ''}`,
  }]
  for (const [label, text, color] of parts) {
    if (label) {
      blocks.push({
        height: 36,
        keepWithNext: true,
        draw: y => `<text x="${LEFT}" y="${y + 26}" font-size="21" font-weight="700" fill="${color}">${label}</text>`,
      })
    }
    for (const line of wrapText(text, charsFor(CONTENT_WIDTH, 24))) {
      blocks.push({
        height: TEXT_LINE_HEIGHT,
        draw: y => `<text x="${LEFT}" y="${y + 27}" font-size="24" fill="#2a1d14">${escape(line)}</text>`,
      })
    }
  }
  blocks.push({ height: 18, draw: () => '' })
  return blocks
}

function tile(x, width, y, label, value, detail, detailColor = '#7a6a5a') {
  return `<rect x="${x}" y="${y}" width="${width}" height="${TILE_HEIGHT - 16}" rx="14" fill="#f6efe4"/>
    <text x="${x + 20}" y="${y + 32}" font-size="19" fill="#7a6a5a">${escape(label)}</text>
    <text x="${x + 20}" y="${y + 68}" font-size="29" font-weight="700" fill="#2a1d14">${escape(value)}</text>
    <text x="${x + 20}" y="${y + 96}" font-size="19" font-weight="600" fill="${detailColor}">${escape(detail)}</text>`
}

function summaryBlock(snapshot) {
  const before = snapshot.before
  const after = snapshot.after
  const salePrice = Number(snapshot.sale_price) || 0
  const cost = after.portion_cost == null ? null : Number(after.portion_cost)
  const previousCost = before?.portion_cost == null ? null : Number(before.portion_cost)
  const costChange = cost == null || previousCost == null ? 0 : cost - previousCost
  const profit = cost == null ? null : salePrice - cost
  const gap = 16
  const tileWidth = (CONTENT_WIDTH - gap * 3) / 4
  const portionsChanged = before && Number(before.portion_count) !== Number(after.portion_count)
  const tiles = [
    ['Себестоимость порции', cost == null ? '—' : `${money(cost)} UZS`,
      before ? (previousCost == null ? 'было: —' : `было: ${money(previousCost)}${costChange ? ` (${signedMoney(costChange)})` : ''}`) : '',
      costChange > 0 ? '#c4262c' : costChange < 0 ? '#1d7a52' : '#7a6a5a'],
    ['Цена продажи', `${money(salePrice)} UZS`, '', '#7a6a5a'],
    ['Прибыль с порции', profit == null ? '—' : `${profit < 0 ? '−' : ''}${money(Math.abs(profit))} UZS`,
      profit == null || salePrice <= 0 ? '' : `маржа ${decimal(Math.round((profit / salePrice) * 1000) / 10)}%`,
      profit != null && profit < 0 ? '#c4262c' : '#1d7a52'],
    ['Порций в партии', decimal(after.portion_count), portionsChanged ? `было: ${decimal(before.portion_count)}` : '', portionsChanged ? '#b45309' : '#7a6a5a'],
  ]
  return {
    height: TILE_HEIGHT + 8,
    draw: y => tiles.map(([label, value, detail, color], index) => tile(LEFT + index * (tileWidth + gap), tileWidth, y, label, value, detail, color)).join(''),
  }
}

export function buildTechCardChangeBlocks(snapshot) {
  const before = snapshot.before
  const after = snapshot.after
  return [
    summaryBlock(snapshot),
    ...tableBlocks('Ингредиенты', diffTechCardIngredients(before?.ingredients || [], after.ingredients || []), ingredientCell, ingredientCost, row => row.name),
    ...tableBlocks('Включённые блюда', diffTechCardComponents(before?.components || [], after.components || []), componentCell, componentCost, row => [row.name, row.variant].filter(Boolean).join(' · ')),
    ...textBlocks('Технология приготовления', before?.preparation_steps, after.preparation_steps, !!before),
    ...textBlocks('Примечания', before?.notes, after.notes, !!before),
  ]
}

// Keeps a heading with the row after it and never leaves a page empty.
export function paginateTechCardBlocks(blocks, firstPageRoom, nextPageRoom) {
  const pages = [[]]
  let room = firstPageRoom
  for (let index = 0; index < blocks.length; index += 1) {
    let needed = blocks[index].height
    for (let next = index; blocks[next]?.keepWithNext && next + 1 < blocks.length; next += 1) {
      needed += blocks[next + 1].height
    }
    if (needed > room && pages[pages.length - 1].length > 0) {
      pages.push([])
      room = nextPageRoom
    }
    pages[pages.length - 1].push(blocks[index])
    room -= blocks[index].height
  }
  return pages
}

function headerSvg(snapshot, height, pageNumber, pageCount) {
  const title = snapshot.event_type === 'created' ? 'Новая техкарта' : 'Изменена техкарта'
  const name = [snapshot.name, snapshot.variant].filter(Boolean).join(' · ')
  const cardWidth = WIDTH - MARGIN * 2
  const shape = `<path d="M${MARGIN} ${MARGIN + height}V${MARGIN + 24}a24 24 0 0 1 24 -24H${MARGIN + cardWidth - 24}a24 24 0 0 1 24 24V${MARGIN + height}Z" fill="#8b1e1e"/>`
  const pageLabel = pageCount > 1 ? `<text x="${RIGHT}" y="${MARGIN + 50}" text-anchor="end" font-size="22" fill="white" fill-opacity="0.88">${pageNumber} / ${pageCount}</text>` : ''
  if (pageNumber > 1) {
    return `${shape}${pageLabel}<text x="${LEFT}" y="${MARGIN + 58}" font-size="30" font-weight="700" fill="white">${escape(wrapText(name, charsFor(CONTENT_WIDTH - 120, 30))[0])}</text>`
  }
  return `${shape}${pageLabel}
    <text x="${LEFT}" y="${MARGIN + 50}" font-size="22" font-weight="700" letter-spacing="3" fill="#f3d9a4">ZAR KEBAB · ${escape(title.toLocaleUpperCase('ru'))}</text>
    <text x="${LEFT}" y="${MARGIN + 108}" font-size="46" font-weight="700" fill="white">${escape(wrapText(name, charsFor(CONTENT_WIDTH, 46))[0])}</text>
    <text x="${LEFT}" y="${MARGIN + 152}" font-size="24" fill="white" fill-opacity="0.88">${escape(formatLongDateTime(snapshot.changed_at, 'ru', '—'))} · ${escape(snapshot.actor_name || 'Система')}</text>`
}

export function buildTechCardChangeImageSvgs(snapshot) {
  if (!snapshot?.after) throw new Error('Invalid tech card notification snapshot')
  const roomOnPage = header => MAX_PAGE_HEIGHT - MARGIN * 2 - header - 48
  const pages = paginateTechCardBlocks(buildTechCardChangeBlocks(snapshot), roomOnPage(HEADER_HEIGHT), roomOnPage(CONTINUATION_HEADER_HEIGHT))
  return pages.map((blocks, index) => {
    const header = index === 0 ? HEADER_HEIGHT : CONTINUATION_HEADER_HEIGHT
    let y = MARGIN + header + 28
    const body = blocks.map(block => {
      const part = block.draw(y)
      y += block.height
      return part
    }).join('')
    const height = y + 20 + MARGIN
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="${WIDTH}" height="${height}" fill="#f6efe4"/>
  <g font-family="Noto Sans">
  <rect x="${MARGIN}" y="${MARGIN}" width="${WIDTH - MARGIN * 2}" height="${height - MARGIN * 2}" rx="24" fill="white"/>
  ${headerSvg(snapshot, header, index + 1, pages.length)}
  ${body}
  </g></svg>`
  })
}

export async function renderTechCardChangeImages(snapshot) {
  configurePayrollFonts()
  return Promise.all(buildTechCardChangeImageSvgs(snapshot).map(svg => sharp(Buffer.from(svg), { density: 144 }).png().toBuffer()))
}
