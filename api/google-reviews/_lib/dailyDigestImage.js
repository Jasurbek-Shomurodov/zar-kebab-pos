import sharp from 'sharp'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { configurePayrollFonts } from '../../telegram/_lib/payrollReportImage.js'

const WIDTH = 1200
const CARD_X = 40
const PAD = 56
const INNER = WIDTH - CARD_X * 2 - PAD * 2
const HEADER_HEIGHT = 190
const MAX_REVIEWS = 6
const MAX_MENU_LINES = 8
const COLORS = {
  page: '#f6efe4', card: '#ffffff', brand: '#8b1e1e', gold: '#f3d9a4', ink: '#2a1d14', muted: '#7a6858',
  faint: '#a08870', rule: '#eee2d2', tile: '#faf5ee', good: '#1f7a46', warn: '#a5521b', bad: '#b42318', star: '#e8a317',
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
const money = value => `${Math.round(Number(value) || 0).toLocaleString('ru-RU').replace(/ /g, ' ')}`
const plural = (n, one, few, many) => {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

// Noto Sans covers Latin and Cyrillic; drop emoji and scripts it cannot draw instead of showing boxes.
export function drawableText(value) {
  return String(value ?? '')
    .replace(/[^ -ɏ̀-ͯЀ-ӿ‐-‧‰-›№→]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Mostly-unsupported text (e.g. Japanese with a Latin brand name) would read as a misleading fragment.
function mostlyDrawable(value) {
  const original = String(value ?? '').replace(/\s+/g, '')
  return !original || drawableText(value).replace(/\s+/g, '').length >= original.length * 0.6
}

function wrap(text, fontSize, width, maxLines = Infinity) {
  // Noto Sans averages ~0.55em per glyph across Latin and Cyrillic.
  const perLine = Math.max(8, Math.floor(width / (fontSize * 0.55)))
  const lines = []
  let current = ''
  for (const word of drawableText(text).split(' ').filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if ([...candidate].length <= perLine) { current = candidate; continue }
    if (current) lines.push(current)
    current = [...word].length > perLine ? [...word].slice(0, perLine).join('') : word
  }
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${[...kept[maxLines - 1]].slice(0, perLine - 1).join('').replace(/[\s,.;:]+$/, '')}…`
    return kept
  }
  return lines
}

function starPath(cx, cy, r) {
  const points = []
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? r * 0.45 : r
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`)
  }
  return `M${points.join('L')}Z`
}

function stars(x, y, rating, r = 13) {
  return Array.from({ length: 5 }, (_, i) =>
    `<path d="${starPath(x + r + i * (r * 2 + 6), y - r + 2, r)}" fill="${i < rating ? COLORS.star : COLORS.rule}"/>`).join('')
}

const REVIEW_STATUS = {
  published: ['Ответ опубликован', COLORS.good],
  preview: ['Черновик: автоответ выключен', COLORS.warn],
  deferred: ['Отложен до завтра', COLORS.warn],
  queued: ['Ждёт ответа', COLORS.muted],
  awaiting_approval: ['Ждёт вашего одобрения', COLORS.brand],
  failed: ['Ошибка ответа', COLORS.bad],
}

const FIELD_LABELS = {
  description: 'описание', translation: 'перевод', photo: 'фото', options: 'цены для туристов и варианты', section: 'раздел',
}

function signed(value, digits = 0) {
  const fixed = Math.abs(value).toFixed(digits).replace('.', ',')
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${fixed}`
}

// Turns the saved day row (plus yesterday's, for deltas) into drawable blocks.
export function buildGoogleDigestBlocks(digest = {}, previous = null) {
  const reviews = digest.reviews || null
  const menu = digest.menu || null
  const blocks = [{
    type: 'intro',
    title: 'Привет! Я ИИ-бот Zar Kebab',
    text: 'Каждое утро я сам веду наш профиль на Google Maps: отвечаю гостям на отзывы на их родном языке и сверяю меню на Google с кассой: цены, названия, описания, фото и цены для туристов. Вот что я сделал.',
  }]
  const highlights = Array.isArray(digest.highlights) ? digest.highlights.filter(Boolean) : []
  if (highlights.length) {
    blocks.push({ type: 'heading', text: 'Главное' })
    for (const text of highlights) blocks.push({ type: 'bullet', text })
  }

  const rating = reviews?.averageRating
  const previousRating = previous?.reviews?.averageRating
  const total = reviews?.totalReviewCount
  const previousTotal = previous?.reviews?.totalReviewCount
  const results = Array.isArray(reviews?.results) ? reviews.results : []
  const published = results.filter(result => result.status === 'published').length
  const changes = menu?.changes || {}
  const changeCount = ['added', 'removed', 'priceChanges', 'updated'].reduce((sum, key) => sum + (changes[key]?.length || 0), 0)

  blocks.push({ type: 'tiles', tiles: [
    {
      label: 'Рейтинг', value: rating ? rating.toFixed(1).replace('.', ',') : '—',
      sub: rating && previousRating ? (Math.abs(rating - previousRating) >= 0.05 ? `${signed(rating - previousRating, 1)} за сутки` : 'без изменений') : 'на Google Maps',
    },
    {
      label: 'Отзывов всего', value: Number.isFinite(total) ? String(total) : '—',
      sub: Number.isFinite(total) && Number.isFinite(previousTotal) ? `${signed(total - previousTotal)} за сутки` : 'на Google Maps',
    },
    { label: 'Ответов отправлено', value: String(published), sub: `из ${results.length} ${plural(results.length, 'нового', 'новых', 'новых')}` },
    {
      label: 'Меню', value: !menu ? '—' : menu.error ? 'Ошибка' : menu.mode === 'published' ? 'Обновлено' : 'Без изменений',
      tone: menu?.error ? 'bad' : menu?.mode === 'published' ? 'good' : null,
      sub: menu?.mode === 'published' ? `${changeCount} ${plural(changeCount, 'изменение', 'изменения', 'изменений')}` : menu?.items ? `${menu.items} позиций` : '',
    },
  ] })

  blocks.push({ type: 'heading', text: 'Отзывы' })
  if (!reviews) blocks.push({ type: 'line', text: 'Бот отзывов сегодня не запускался.', tone: 'warn' })
  else if (reviews.error) blocks.push({ type: 'line', text: `Ошибка: ${reviews.error}`, tone: 'bad' })
  else if (!results.length) blocks.push({ type: 'line', text: 'Новых отзывов без ответа нет: на все отзывы уже есть ответ.' })
  else {
    const ordered = [...results].sort((a, b) => (b.status === 'awaiting_approval') - (a.status === 'awaiting_approval'))
    for (const result of ordered.slice(0, MAX_REVIEWS)) blocks.push({ type: 'review', ...result })
    if (results.length > MAX_REVIEWS) blocks.push({ type: 'note', text: `…и ещё ${results.length - MAX_REVIEWS}` })
    const held = results.filter(result => result.status === 'awaiting_approval').length
    if (held) blocks.push({ type: 'note', text: `${held} ${plural(held, 'ответ на оценку 1–3★ ждёт', 'ответа на оценки 1–3★ ждут', 'ответов на оценки 1–3★ ждут')} вашего одобрения: бот не публикует их сам.`, tone: 'warn' })
    const deferred = results.filter(result => result.status === 'deferred').length
    if (deferred) blocks.push({ type: 'note', text: `${deferred} ${plural(deferred, 'отзыв отложен', 'отзыва отложены', 'отзывов отложены')} до завтра: дневной лимит Gemini.`, tone: 'warn' })
  }

  blocks.push({ type: 'heading', text: 'Меню на Google Maps' })
  if (!menu) blocks.push({ type: 'line', text: 'Синхронизация меню сегодня не запускалась.', tone: 'warn' })
  else if (menu.error) blocks.push({ type: 'line', text: `Ошибка синхронизации: ${menu.error}`, tone: 'bad' })
  else if (menu.mode !== 'published') blocks.push({ type: 'line', text: `Изменений нет: Google Maps совпадает с меню кассы (${menu.items} позиций, ${menu.sections} разделов).` })
  else {
    blocks.push({ type: 'line', text: `Меню обновлено: ${menu.items} позиций в ${menu.sections} разделах.`, tone: 'good' })
    const list = (title, rows, format) => {
      if (!rows?.length) return
      blocks.push({ type: 'subheading', text: `${title} · ${rows.length}` })
      for (const row of rows.slice(0, MAX_MENU_LINES)) blocks.push({ type: 'bullet', text: format(row) })
      if (rows.length > MAX_MENU_LINES) blocks.push({ type: 'note', text: `…и ещё ${rows.length - MAX_MENU_LINES}` })
    }
    list('Цены изменены', changes.priceChanges, row => `${row.name}: ${money(row.from)} → ${money(row.to)} сум`)
    list('Новые позиции', changes.added, row => `${row.name}: ${money(row.price)} сум`)
    list('Убраны с Google Maps', changes.removed, row => row.name)
    list('Обновлено', changes.updated, row => `${row.name}: ${row.fields.map(field => FIELD_LABELS[field] || field).join(', ')}`)
  }
  if (menu?.photosUploaded) blocks.push({ type: 'note', text: `Загружено новых фото: ${menu.photosUploaded}` })
  if (menu?.photosRemoved) blocks.push({ type: 'note', text: `Убрано устаревших фото меню: ${menu.photosRemoved}` })
  if (menu?.photoFailures?.length) blocks.push({ type: 'note', text: `Не удалось загрузить фото: ${menu.photoFailures.length}. Повтор завтра.`, tone: 'warn' })
  return blocks
}

const toneColor = tone => ({ good: COLORS.good, warn: COLORS.warn, bad: COLORS.bad })[tone] || COLORS.ink

function layout(blocks, x) {
  const parts = []
  let y = 0
  for (const block of blocks) {
    if (block.type === 'intro') {
      const lines = wrap(block.text, 24, INNER - 64)
      const boxHeight = 86 + lines.length * 34 + 22
      parts.push(`<rect x="${x}" y="${y}" width="${INNER}" height="${boxHeight}" rx="20" fill="#fbf1d9"/>`)
      parts.push(`<rect x="${x + 32}" y="${y + 28}" width="96" height="34" rx="17" fill="${COLORS.brand}"/>`)
      parts.push(`<text x="${x + 80}" y="${y + 52}" text-anchor="middle" font-size="19" font-weight="700" letter-spacing="1" fill="white">ИИ-БОТ</text>`)
      parts.push(`<text x="${x + 146}" y="${y + 54}" font-size="28" font-weight="700" fill="${COLORS.ink}">${escape(block.title)}</text>`)
      lines.forEach((line, i) => parts.push(`<text x="${x + 32}" y="${y + 108 + i * 34}" font-size="24" fill="${COLORS.ink}">${escape(line)}</text>`))
      y += boxHeight + 24
    } else if (block.type === 'tiles') {
      if (y > 0) y += 26
      const gap = 18
      const width = (INNER - gap * 3) / 4
      block.tiles.forEach((tile, i) => {
        const tx = x + i * (width + gap)
        parts.push(`<rect x="${tx}" y="${y}" width="${width}" height="150" rx="18" fill="${COLORS.tile}"/>`)
        parts.push(`<text x="${tx + 22}" y="${y + 40}" font-size="21" fill="${COLORS.muted}">${escape(tile.label)}</text>`)
        parts.push(`<text x="${tx + 22}" y="${y + 92}" font-size="${[...tile.value].length > 8 ? 30 : 44}" font-weight="700" fill="${toneColor(tile.tone)}">${escape(tile.value)}</text>`)
        if (tile.sub) parts.push(`<text x="${tx + 22}" y="${y + 128}" font-size="19" fill="${COLORS.faint}">${escape(tile.sub)}</text>`)
      })
      y += 150 + 20
    } else if (block.type === 'heading') {
      y += 34
      parts.push(`<text x="${x}" y="${y + 30}" font-size="24" font-weight="700" letter-spacing="1.5" fill="${COLORS.brand}">${escape(block.text.toLocaleUpperCase('ru'))}</text>`)
      parts.push(`<rect x="${x}" y="${y + 48}" width="${INNER}" height="1.5" fill="${COLORS.rule}"/>`)
      y += 70
    } else if (block.type === 'subheading') {
      y += 10
      parts.push(`<text x="${x}" y="${y + 26}" font-size="24" font-weight="700" fill="${COLORS.ink}">${escape(block.text)}</text>`)
      y += 40
    } else if (block.type === 'review') {
      const [statusText, statusColor] = REVIEW_STATUS[block.status] || [block.status, COLORS.muted]
      parts.push(stars(x, y + 26, Number(block.rating) || 0))
      parts.push(`<text x="${x + INNER}" y="${y + 24}" text-anchor="end" font-size="21" font-weight="700" fill="${statusColor}">${escape(statusText)}</text>`)
      y += 44
      const comment = mostlyDrawable(block.comment) ? drawableText(block.comment) : ''
      const commentLines = comment ? wrap(`«${comment}»`, 26, INNER, 3) : [block.comment ? 'Текст на языке, который картинка не отображает' : 'Без текста, только оценка']
      for (const line of commentLines) {
        parts.push(`<text x="${x}" y="${y + 26}" font-size="26" fill="${COLORS.ink}"${comment ? '' : ' font-style="italic"'}>${escape(line)}</text>`)
        y += 36
      }
      const replyText = block.reply
        ? (mostlyDrawable(block.reply) ? drawableText(block.reply) : 'на языке отзыва (картинка его не отображает)')
        : block.status === 'failed' ? drawableText(block.error) : ''
      if (replyText) {
        const replyLabel = block.status === 'failed' ? 'Ошибка: ' : block.status === 'awaiting_approval' ? 'Черновик ответа: ' : 'Ответ: '
        const replyLines = wrap(`${replyLabel}${replyText}`, 23, INNER - 24, block.status === 'awaiting_approval' ? 6 : 3)
        parts.push(`<rect x="${x}" y="${y + 6}" width="4" height="${replyLines.length * 32 + 4}" rx="2" fill="${block.status === 'failed' ? COLORS.bad : COLORS.gold}"/>`)
        for (const line of replyLines) {
          parts.push(`<text x="${x + 22}" y="${y + 30}" font-size="23" fill="${COLORS.muted}">${escape(line)}</text>`)
          y += 32
        }
        y += 8
      }
      y += 26
    } else {
      const fontSize = block.type === 'note' ? 22 : 25
      const indent = block.type === 'bullet' ? 26 : 0
      const lines = wrap(block.text, fontSize, INNER - indent)
      lines.forEach((line, i) => {
        if (block.type === 'bullet' && i === 0) parts.push(`<circle cx="${x + 8}" cy="${y + 18}" r="4" fill="${COLORS.faint}"/>`)
        parts.push(`<text x="${x + indent}" y="${y + 26}" font-size="${fontSize}" fill="${block.type === 'note' && !block.tone ? COLORS.muted : toneColor(block.tone)}">${escape(line)}</text>`)
        y += fontSize + 12
      })
      y += block.type === 'bullet' ? 2 : 8
    }
  }
  return { svg: parts.join(''), height: y }
}

export function buildGoogleDigestSvg(digest = {}, previous = null) {
  const date = digest.digest_date || ''
  const x = CARD_X + PAD
  const bodyTop = CARD_X + HEADER_HEIGHT + 36
  const { svg: body, height: bodyHeight } = layout(buildGoogleDigestBlocks(digest, previous), x)
  const footerTop = bodyTop + bodyHeight + 20
  const cardHeight = footerTop + 70 - CARD_X
  const height = cardHeight + CARD_X * 2
  const cardWidth = WIDTH - CARD_X * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="${WIDTH}" height="${height}" fill="${COLORS.page}"/>
  <g font-family="Noto Sans">
  <rect x="${CARD_X}" y="${CARD_X}" width="${cardWidth}" height="${cardHeight}" rx="28" fill="${COLORS.card}"/>
  <path d="M${CARD_X} ${CARD_X + HEADER_HEIGHT}V${CARD_X + 28}a28 28 0 0 1 28 -28H${CARD_X + cardWidth - 28}a28 28 0 0 1 28 28V${CARD_X + HEADER_HEIGHT}Z" fill="${COLORS.brand}"/>
  <text x="${x}" y="${CARD_X + 58}" font-size="22" font-weight="700" letter-spacing="3" fill="${COLORS.gold}">ZAR KEBAB · GOOGLE MAPS</text>
  <text x="${x}" y="${CARD_X + 118}" font-size="50" font-weight="700" fill="white">${escape(digest.title || 'Отчёт ИИ-бота за сутки')}</text>
  <text x="${x}" y="${CARD_X + 160}" font-size="27" fill="white" fill-opacity="0.88">${escape(formatLongDate(date, 'ru', date || '—'))}: отзывы и меню</text>
  <g transform="translate(0 ${bodyTop})">${body}</g>
  <rect x="${x}" y="${footerTop}" width="${INNER}" height="1.5" fill="${COLORS.rule}"/>
  <text x="${x}" y="${footerTop + 44}" font-size="21" fill="${COLORS.faint}">Ответы на отзывы в 04:10, синхронизация меню в 04:20 (Ташкент), каждый день.</text>
  </g></svg>`
}

export async function renderGoogleDigestImage(digest, previous) {
  configurePayrollFonts()
  return sharp(Buffer.from(buildGoogleDigestSvg(digest, previous)), { density: 144 }).png().toBuffer()
}
