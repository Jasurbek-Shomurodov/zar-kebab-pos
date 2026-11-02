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
// Telegram downscales tall photos, so long cards continue on another page instead.
const MAX_PAGE_HEIGHT = 2100
const COLUMN_GAP = 24
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2
const CELL_PADDING = 14
const TOTAL_WIDTH = 150
const BAND_HEIGHT = 56
const TEXT_LINE_HEIGHT = 36
// Noto Sans averages ~0.56em per Cyrillic glyph; wrap on a slightly wider estimate.
const charsFor = (width, fontSize) => Math.floor(width / (fontSize * 0.58))
// The shipped Noto Sans has no U+2212 minus or U+2192 arrow; both render as empty boxes.
const MINUS = '–'

const TONES = {
  added: { background: '#e8f6ee', color: '#1d7a52' },
  removed: { background: '#fdeaea', color: '#c4262c' },
  changed: { background: '#fff4dc', color: '#b45309' },
  neutral: { background: '#f6efe4', color: '#7a6a5a' },
}
const MISSING_BACKGROUND = '#f7f4ef'

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
const money = value => new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))
const decimal = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value) || 0)
const unit = value => techCardUnitLabel(value, 'ru')
const signedMoney = value => `${value > 0 ? '+' : MINUS}${money(Math.abs(value))}`
const signedAmount = value => `${value < 0 ? MINUS : ''}${money(Math.abs(value))}`

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

function describeIngredient(row) {
  return { name: row.name, detail: `${decimal(row.quantity)} ${unit(row.unit)} × ${decimal(row.unit_price_uzs)}`, total: ingredientCost(row) }
}

function describeComponent(row) {
  const cost = componentCost(row)
  return {
    name: [row.name, row.variant].filter(Boolean).join(' · '),
    detail: cost == null ? `${decimal(row.quantity)} ${unit(row.unit)}, нет себестоимости` : `${decimal(row.quantity)} ${unit(row.unit)} × ${money(row.unit_cost)}`,
    total: cost,
  }
}

function rowAmount(row, describe) {
  const previous = row.before ? describe(row.before).total : 0
  const current = row.after ? describe(row.after).total : 0
  return previous == null || current == null ? 0 : current - previous
}

function quantityLabel(row) {
  return `${decimal(row.quantity)} ${unit(row.unit)}`
}

function changeSentence(row) {
  const parts = []
  if (quantityLabel(row.before) !== quantityLabel(row.after)) parts.push(`с ${quantityLabel(row.before)} на ${quantityLabel(row.after)}`)
  if (row.before.unit_price_uzs !== undefined && Number(row.before.unit_price_uzs) !== Number(row.after.unit_price_uzs)) {
    parts.push(`цена с ${decimal(row.before.unit_price_uzs)} на ${decimal(row.after.unit_price_uzs)}`)
  }
  return parts.join(', ')
}

function recipeChanges(rows, describe) {
  return rows.filter(row => row.status !== 'same').map(row => {
    const name = describe(row.after || row.before).name
    const amount = rowAmount(row, describe)
    if (row.status === 'added') return { tone: 'added', text: `Добавлено: ${name}, ${quantityLabel(row.after)}`, amount }
    if (row.status === 'removed') return { tone: 'removed', text: `Удалено: ${name}, ${quantityLabel(row.before)}`, amount }
    return { tone: 'changed', text: `${name}: ${changeSentence(row)}`, amount }
  })
}

// Plain sentences for the top of the image, costliest fact first.
export function describeTechCardChanges(snapshot) {
  const before = snapshot.before
  const after = snapshot.after
  if (!before) return []
  const changes = []
  const previousCost = before.portion_cost == null ? null : Number(before.portion_cost)
  const cost = after.portion_cost == null ? null : Number(after.portion_cost)
  if (previousCost !== cost) {
    changes.push({
      tone: cost != null && previousCost != null && cost < previousCost ? 'added' : 'removed',
      text: `Себестоимость порции: с ${previousCost == null ? '—' : money(previousCost)} на ${cost == null ? '—' : `${money(cost)} UZS`}`,
      amount: cost == null || previousCost == null ? 0 : cost - previousCost,
      strong: true,
    })
  }
  changes.push(
    ...recipeChanges(diffTechCardIngredients(before.ingredients || [], after.ingredients || []), describeIngredient),
    ...recipeChanges(diffTechCardComponents(before.components || [], after.components || []), describeComponent),
  )
  if (Number(before.portion_count) !== Number(after.portion_count)) {
    changes.push({ tone: 'changed', text: `Порций в партии: с ${decimal(before.portion_count)} на ${decimal(after.portion_count)}`, amount: 0 })
  }
  if (String(before.preparation_steps ?? '').trim() !== String(after.preparation_steps ?? '').trim()) {
    changes.push({ tone: 'changed', text: 'Изменена технология приготовления', amount: 0 })
  }
  if (String(before.notes ?? '').trim() !== String(after.notes ?? '').trim()) {
    changes.push({ tone: 'changed', text: 'Изменены примечания', amount: 0 })
  }
  return changes
}

function columnsFor(hasBefore) {
  return hasBefore
    ? [{ side: 'before', x: LEFT, width: COLUMN_WIDTH }, { side: 'after', x: LEFT + COLUMN_WIDTH + COLUMN_GAP, width: COLUMN_WIDTH }]
    : [{ side: 'after', x: LEFT, width: CONTENT_WIDTH }]
}

function sectionTitle(title, note = '') {
  return {
    height: 54,
    keepWithNext: true,
    draw: y => `<text x="${LEFT}" y="${y + 36}" font-size="27" font-weight="700" fill="#2a1d14">${escape(title)}</text>
      ${note ? `<text x="${RIGHT}" y="${y + 36}" text-anchor="end" font-size="19" fill="#a08870">${escape(note)}</text>` : ''}`,
  }
}

function columnBand(columns) {
  if (columns.length < 2) return ''
  return y => columns.map(column => `<rect x="${column.x}" y="${y}" width="${column.width}" height="${BAND_HEIGHT - 12}" rx="10" fill="${column.side === 'before' ? '#6b5d52' : '#1d7a52'}"/>
    <text x="${column.x + column.width / 2}" y="${y + 30}" text-anchor="middle" font-size="22" font-weight="700" letter-spacing="3" fill="white">${column.side === 'before' ? 'БЫЛО' : 'СТАЛО'}</text>`).join('')
}

function changesBlocks(snapshot) {
  const changes = describeTechCardChanges(snapshot)
  if (changes.length === 0) return []
  const rows = changes.map(change => {
    const lines = wrapText(change.text, charsFor(CONTENT_WIDTH - 210, 23))
    const height = lines.length * 32 + 16
    const tone = TONES[change.tone]
    const amountColor = change.amount > 0 ? '#c4262c' : '#1d7a52'
    return {
      height,
      draw: y => `<rect x="${LEFT}" y="${y}" width="${CONTENT_WIDTH}" height="${height}" fill="#fbf7f0"/>
        <circle cx="${LEFT + 20}" cy="${y + 26}" r="7" fill="${tone.color}"/>
        ${lines.map((line, index) => (change.strong
    ? `<text x="${LEFT + 40}" y="${y + 34 + index * 32}" font-size="23" font-weight="700" fill="#2a1d14">${escape(line)}</text>`
    : `<text x="${LEFT + 40}" y="${y + 34 + index * 32}" font-size="23" fill="#2a1d14">${escape(line)}</text>`)).join('')}
        ${change.amount ? `<text x="${RIGHT - 16}" y="${y + 34}" text-anchor="end" font-size="23" font-weight="700" fill="${amountColor}">${signedMoney(change.amount)}</text>` : ''}`,
    }
  })
  return [sectionTitle('Что изменилось'), ...rows, { height: 24, draw: () => '' }]
}

function metricValues(version, salePrice) {
  const cost = version?.portion_cost == null ? null : Number(version.portion_cost)
  const profit = cost == null ? null : salePrice - cost
  const output = Number(version?.batch_output_quantity) > 0 ? `${decimal(version.batch_output_quantity)} ${unit(version.batch_output_unit)}` : '—'
  return [
    ['Себестоимость порции', cost == null ? '—' : `${money(cost)} UZS`],
    ['Цена продажи', `${money(salePrice)} UZS`],
    ['Прибыль с порции', profit == null ? '—' : `${signedAmount(profit)} UZS${salePrice > 0 ? ` (${decimal(Math.round((profit / salePrice) * 1000) / 10)}%)` : ''}`],
    ['Порций в партии', decimal(version?.portion_count)],
    ['Выход партии', output],
  ]
}

function metricsBlocks(snapshot, columns) {
  const salePrice = Number(snapshot.sale_price) || 0
  const before = metricValues(snapshot.before, salePrice)
  const after = metricValues(snapshot.after, salePrice)
  return [...after.map(([label, value], index) => {
    const previous = before[index][1]
    const changed = !!snapshot.before && previous !== value
    const height = 46
    return {
      height,
      draw: y => columns.map(column => {
        const shown = column.side === 'before' ? previous : value
        return `${changed ? `<rect x="${column.x}" y="${y + 2}" width="${column.width}" height="${height - 4}" rx="6" fill="${TONES.changed.background}"/>` : ''}
          <text x="${column.x + CELL_PADDING}" y="${y + 30}" font-size="20" fill="#7a6a5a">${label}</text>
          <text x="${column.x + column.width - CELL_PADDING}" y="${y + 30}" text-anchor="end" font-size="22" font-weight="700" fill="#2a1d14">${escape(shown)}</text>
          <rect x="${column.x}" y="${y + height - 1}" width="${column.width}" height="1" fill="#eee2d2"/>`
      }).join(''),
    }
  }), { height: 22, draw: () => '' }]
}

function recipeCell(column, value, status, y, height, nameLines) {
  const right = column.x + column.width - CELL_PADDING
  if (!value) {
    return `<rect x="${column.x}" y="${y + 2}" width="${column.width}" height="${height - 4}" rx="8" fill="${MISSING_BACKGROUND}"/>
      <text x="${column.x + column.width / 2}" y="${y + height / 2 + 7}" text-anchor="middle" font-size="20" fill="#a08870">${column.side === 'before' ? 'не было' : 'удалено'}</text>`
  }
  const background = status === 'same' ? '' : TONES[status].background
  return `${background ? `<rect x="${column.x}" y="${y + 2}" width="${column.width}" height="${height - 4}" rx="8" fill="${background}"/>` : ''}
    ${nameLines.map((line, index) => `<text x="${column.x + CELL_PADDING}" y="${y + 32 + index * 28}" font-size="22" font-weight="600" fill="#2a1d14">${escape(line)}</text>`).join('')}
    <text x="${right}" y="${y + 32}" text-anchor="end" font-size="22" font-weight="700" fill="#2a1d14">${value.total == null ? '—' : money(value.total)}</text>
    <text x="${column.x + CELL_PADDING}" y="${y + 32 + nameLines.length * 28}" font-size="19" fill="#7a6a5a">${escape(value.detail)}</text>
    <rect x="${column.x}" y="${y + height - 1}" width="${column.width}" height="1" fill="#eee2d2"/>`
}

function recipeBlocks(title, rows, describe, columns) {
  if (rows.length === 0) return []
  const body = rows.map(row => {
    const values = { before: row.before ? describe(row.before) : null, after: row.after ? describe(row.after) : null }
    const wrapped = Object.fromEntries(columns.map(column => [
      column.side,
      values[column.side] ? wrapText(values[column.side].name, charsFor(column.width - CELL_PADDING * 2 - TOTAL_WIDTH, 22)) : [],
    ]))
    const lineCount = Math.max(...Object.values(wrapped).map(lines => lines.length), 1)
    const height = lineCount * 28 + 46
    return {
      height,
      draw: y => columns.map(column => recipeCell(column, values[column.side], row.status, y, height, wrapped[column.side])).join(''),
    }
  })
  return [sectionTitle(title), ...body, { height: 22, draw: () => '' }]
}

function textBlocks(title, before, after, hasBefore, columns) {
  const previous = String(before ?? '').trim()
  const current = String(after ?? '').trim()
  if (!previous && !current) return []
  const lineBlock = (text, x) => ({
    height: TEXT_LINE_HEIGHT,
    draw: y => `<text x="${x}" y="${y + 27}" font-size="23" fill="#2a1d14">${escape(text)}</text>`,
  })
  if (!hasBefore || previous === current) {
    return [
      sectionTitle(title, hasBefore ? 'без изменений' : ''),
      ...wrapText(current, charsFor(CONTENT_WIDTH, 23)).map(line => lineBlock(line, LEFT)),
      { height: 18, draw: () => '' },
    ]
  }
  const maxChars = charsFor(COLUMN_WIDTH - CELL_PADDING * 2, 21)
  const left = wrapText(previous || '—', maxChars)
  const right = wrapText(current || '—', maxChars)
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const rows = Array.from({ length: Math.max(left.length, right.length) }, (_, index) => ({
    height: 34,
    draw: y => columns.map(column => {
      const line = (column.side === 'before' ? left : right)[index] ?? ''
      const differs = line && !(column.side === 'before' ? rightSet : leftSet).has(line)
      const tone = column.side === 'before' ? TONES.removed : TONES.added
      return `${differs ? `<rect x="${column.x}" y="${y}" width="${column.width}" height="34" fill="${tone.background}"/>` : ''}
        <text x="${column.x + CELL_PADDING}" y="${y + 25}" font-size="21" fill="#2a1d14">${escape(line)}</text>`
    }).join(''),
  }))
  return [sectionTitle(title), ...rows, { height: 18, draw: () => '' }]
}

export function buildTechCardChangeBlocks(snapshot) {
  const before = snapshot.before
  const after = snapshot.after
  const columns = columnsFor(!!before)
  const band = columnBand(columns)
  return [
    ...changesBlocks(snapshot),
    ...(band ? [{ height: BAND_HEIGHT, keepWithNext: true, draw: band }] : []),
    ...metricsBlocks(snapshot, columns),
    ...recipeBlocks('Ингредиенты', diffTechCardIngredients(before?.ingredients || [], after.ingredients || []), describeIngredient, columns),
    ...recipeBlocks('Включённые блюда', diffTechCardComponents(before?.components || [], after.components || []), describeComponent, columns),
    ...textBlocks('Технология приготовления', before?.preparation_steps, after.preparation_steps, !!before, columns),
    ...textBlocks('Примечания', before?.notes, after.notes, !!before, columns),
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
  const band = columnBand(columnsFor(!!snapshot.before))
  const bandHeight = band ? BAND_HEIGHT : 0
  const roomOnPage = header => MAX_PAGE_HEIGHT - MARGIN * 2 - header - 48
  const pages = paginateTechCardBlocks(buildTechCardChangeBlocks(snapshot), roomOnPage(HEADER_HEIGHT), roomOnPage(CONTINUATION_HEADER_HEIGHT) - bandHeight)
  return pages.map((blocks, index) => {
    const header = index === 0 ? HEADER_HEIGHT : CONTINUATION_HEADER_HEIGHT
    let y = MARGIN + header + 28
    const repeatedBand = index > 0 && band ? band(y) : ''
    if (repeatedBand) y += bandHeight
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
  ${repeatedBand}
  ${body}
  </g></svg>`
  })
}

export async function renderTechCardChangeImages(snapshot) {
  configurePayrollFonts()
  return Promise.all(buildTechCardChangeImageSvgs(snapshot).map(svg => sharp(Buffer.from(svg), { density: 144 }).png().toBuffer()))
}
