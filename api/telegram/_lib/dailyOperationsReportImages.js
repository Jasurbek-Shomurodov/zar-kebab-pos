import sharp from 'sharp'
import { inferOrderType, orderTypeLabel } from '../../../src/lib/orderTypes.js'
import { getRussianOrderItemDisplayName } from './orderStatusMessages.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatDateTime, formatLongDate } from '../../../src/lib/dateFormat.js'
import { formatCurrency } from '../../../src/lib/formatCurrency.js'
import { getOrderItemUnitPrice } from '../../../src/lib/priceModes.js'
import {
  bazaarCategoriesFor,
  bazaarCategoryLabel,
  bazaarUnitLabel,
  calculateBazaarExpectedTotal,
  calculateBazaarPriceDifference,
  calculateBazaarTotal,
  formatBazaarQuantity,
  getBazaarNormalLineTotal,
  getBazaarPriceDifference,
  getBazaarUnitCost,
  normalizeBazaarQuantityToBase,
  normalizeBazaarPurchase,
} from '../../../src/lib/bazaar.js'

const WIDTH = 1200
let fontsConfigured = false

const BAZAAR_COPY = {
  uz: {
    total: 'BOZOR BO‘YICHA JAMI', items: 'POZITSIYALAR', paid: 'TO‘LANGAN', normalPrice: 'ODATIY NARX',
    overallDifference: 'UMUMIY FARQ', bought: 'olindi', normal: 'odatdagi', difference: 'farq',
    unset: 'KIRITILMAGAN', noData: 'Bu kun uchun ma’lumot yo‘q', positions: 'poz.',
  },
  ru: {
    total: 'ИТОГО ПО БАЗАРУ', items: 'ПОЗИЦИЙ', paid: 'ОПЛАЧЕНО', normalPrice: 'НОРМАЛЬНАЯ ЦЕНА',
    overallDifference: 'ОБЩАЯ РАЗНИЦА', bought: 'куплено', normal: 'норма', difference: 'разница',
    unset: 'НЕ ЗАДАНА', noData: 'Нет данных за этот день', positions: 'поз.',
  },
  en: {
    total: 'BAZAAR TOTAL', items: 'ITEMS', paid: 'PAID', normalPrice: 'NORMAL PRICE',
    overallDifference: 'TOTAL DIFFERENCE', bought: 'bought', normal: 'normal', difference: 'difference',
    unset: 'NOT SET', noData: 'No data for this day', positions: 'items',
  },
}

function normalizeLanguage(language) {
  return ['uz', 'ru', 'en'].includes(language) ? language : 'ru'
}

function escapeSvg(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character])
}

function configureFonts() {
  if (fontsConfigured) return
  const fontDirectory = fileURLToPath(new URL('../../../node_modules/notosans-fontface/fonts/', import.meta.url))
  const configDirectory = join(tmpdir(), 'zar-kebab-fontconfig')
  const configPath = join(configDirectory, 'fonts.conf')
  mkdirSync(configDirectory, { recursive: true })
  writeFileSync(configPath, `<?xml version="1.0"?><fontconfig><dir>${escapeSvg(fontDirectory)}</dir><cachedir>${escapeSvg(join(tmpdir(), 'zar-kebab-font-cache'))}</cachedir><config></config></fontconfig>`)
  process.env.FONTCONFIG_FILE = configPath
  fontsConfigured = true
}

function quantity(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value) || 0)
}

function signedCurrency(value) {
  const amount = Math.round(Number(value) || 0)
  return `${amount > 0 ? '+' : ''}${formatCurrency(amount)}`
}

function varianceColor(value, darkBackground = false) {
  const amount = Math.round(Number(value) || 0)
  if (amount > 0) return darkBackground ? '#FCA5A5' : '#DC2626'
  if (amount < 0) return darkBackground ? '#86EFAC' : '#15803D'
  return darkBackground ? '#D7E5E2' : '#526461'
}

function reportShell({ title, subtitle, totalLabel, totalValue, rows, footer = '', accent = '#F97316' }) {
  const height = 390 + Math.max(rows.length, 1) * 74 + (footer ? 76 : 0)
  const rowMarkup = rows.length > 0
    ? rows.map((row, index) => {
        const y = 330 + index * 74
        return `<g>
          <rect x="64" y="${y - 42}" width="1072" height="62" rx="16" fill="${index % 2 ? '#F8FAF9' : '#F1F6F4'}"/>
          <text x="88" y="${y - 5}" font-size="25" font-weight="700" fill="#173B3F">${escapeSvg(row.name)}</text>
          <text x="760" y="${y - 5}" text-anchor="end" font-size="23" fill="#526461">${escapeSvg(row.detail)}</text>
          <text x="1110" y="${y - 5}" text-anchor="end" font-size="25" font-weight="800" fill="${row.color || '#173B3F'}">${escapeSvg(row.value)}</text>
        </g>`
      }).join('')
    : `<text x="600" y="350" text-anchor="middle" font-size="28" fill="#879592">Нет данных за этот день</text>`
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
    <rect width="${WIDTH}" height="${height}" rx="48" fill="#EAF0EE"/>
    <rect x="28" y="28" width="1144" height="${height - 56}" rx="38" fill="#FFFFFF"/>
    <g font-family="Noto Sans">
      <circle cx="92" cy="93" r="34" fill="#FFF1E8"/>
      <circle cx="92" cy="93" r="12" fill="${accent}"/>
      <text x="146" y="87" font-size="34" font-weight="800" fill="#173B3F">${escapeSvg(title)}</text>
      <text x="146" y="121" font-size="21" fill="#74827F">${escapeSvg(subtitle)}</text>
      <rect x="64" y="158" width="1072" height="102" rx="24" fill="#173B3F"/>
      <text x="92" y="199" font-size="19" font-weight="700" letter-spacing="1.5" fill="#A8D7D0">${escapeSvg(totalLabel)}</text>
      <text x="92" y="239" font-size="35" font-weight="800" fill="#FFFFFF">${escapeSvg(totalValue)}</text>
      ${rowMarkup}
      ${footer ? `<text x="600" y="${height - 62}" text-anchor="middle" font-size="20" fill="#74827F">${escapeSvg(footer)}</text>` : ''}
    </g>
  </svg>`
}

export function buildDailyBazaarReportSvg(purchases = [], date = '', language = 'ru') {
  const lang = normalizeLanguage(language)
  const copy = BAZAAR_COPY[lang]
  const normalized = purchases.map(normalizeBazaarPurchase)
  const items = normalized.flatMap(purchase => purchase.items || [])
  const total = normalized.reduce((sum, purchase) => sum + calculateBazaarTotal(purchase.items || []), 0)
  const expected = calculateBazaarExpectedTotal(items)
  const difference = calculateBazaarPriceDifference(items)
  const normalPriceItemCount = items.filter(item => getBazaarNormalLineTotal(item) > 0).length
  const hasCompleteNormalPrices = items.length > 0 && normalPriceItemCount === items.length
  const groups = bazaarCategoriesFor(items)
    .map(category => ({
      ...category,
      items: items.filter(item => item.category === category.key),
    }))
    .filter(group => group.items.length > 0)
  const totalCardY = 54
  const totalCardHeight = 126
  const contentStartY = 212
  const categoryHeight = 44
  const categoryGap = 12
  const rowHeight = 84
  const groupGap = 20
  const emptyHeight = 150
  const contentHeight = groups.length > 0
    ? groups.reduce((height, group) => (
        height + categoryHeight + categoryGap + group.items.length * rowHeight + groupGap
      ), 0)
    : emptyHeight
  const height = contentStartY + contentHeight + 36
  let itemNumber = 0
  let cursorY = contentStartY
  const groupMarkup = groups.length > 0
    ? groups.map(group => {
        const categoryY = cursorY
        cursorY += categoryHeight + categoryGap
        const itemMarkup = group.items.map((item, index) => {
          itemNumber += 1
          const rowY = cursorY
          cursorY += rowHeight
          const display = normalizeBazaarQuantityToBase(item.quantity, item.unit)
          const unitLabel = bazaarUnitLabel(display.unit, lang)
          const normalLineTotal = getBazaarNormalLineTotal(item)
          const normalUnitCost = display.quantity > 0 ? normalLineTotal / display.quantity : 0
          const itemDifference = getBazaarPriceDifference(item)
          const boughtDetail = `${formatBazaarQuantity(display.quantity)} ${unitLabel} · ${copy.bought} ${formatCurrency(Math.round(getBazaarUnitCost(item)))} / ${unitLabel}`
          const normalDetail = normalUnitCost > 0
            ? `${copy.normal} ${formatCurrency(Math.round(normalUnitCost))} / ${unitLabel}`
            : `${copy.normal} —`
          return `<g>
            <rect x="64" y="${rowY}" width="1072" height="74" rx="14" fill="${index % 2 ? '#F8FAF9' : '#F1F6F4'}"/>
            <text x="88" y="${rowY + 31}" font-size="23" font-weight="700" fill="#173B3F">${itemNumber}. ${escapeSvg(item.product_name)}</text>
            <text x="1110" y="${rowY + 31}" text-anchor="end" font-size="22" font-weight="800" fill="#173B3F">${escapeSvg(formatCurrency(item.line_total))}</text>
            <text x="88" y="${rowY + 59}" font-size="18" fill="#526461">${escapeSvg(boughtDetail)}</text>
            <text x="610" y="${rowY + 59}" font-size="18" fill="#526461">${escapeSvg(normalDetail)}</text>
            <text x="1110" y="${rowY + 59}" text-anchor="end" font-size="19" font-weight="800" fill="${normalLineTotal > 0 ? varianceColor(itemDifference) : '#879592'}">${escapeSvg(copy.difference)} ${normalLineTotal > 0 ? escapeSvg(signedCurrency(itemDifference)) : '—'}</text>
          </g>`
        }).join('')
        cursorY += groupGap
        return `<g>
          <rect x="64" y="${categoryY}" width="1072" height="${categoryHeight}" rx="13" fill="#FFF1E8"/>
          <circle cx="89" cy="${categoryY + 22}" r="7" fill="#F97316"/>
          <text x="110" y="${categoryY + 30}" font-size="21" font-weight="800" letter-spacing="0.8" fill="#9A4B16">${escapeSvg(bazaarCategoryLabel(group.key, lang).toLocaleUpperCase(lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US'))}</text>
          <text x="1110" y="${categoryY + 30}" text-anchor="end" font-size="18" font-weight="700" fill="#A36B45">${group.items.length} ${escapeSvg(copy.positions)}</text>
          ${itemMarkup}
        </g>`
      }).join('')
    : `<text x="600" y="270" text-anchor="middle" font-size="28" fill="#879592">${escapeSvg(copy.noData)}</text>`

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
    <rect width="${WIDTH}" height="${height}" rx="48" fill="#EAF0EE"/>
    <rect x="28" y="28" width="1144" height="${height - 56}" rx="38" fill="#FFFFFF"/>
    <g font-family="Noto Sans">
      <rect x="64" y="${totalCardY}" width="1072" height="${totalCardHeight}" rx="24" fill="#173B3F"/>
      <text x="92" y="86" font-size="18" font-weight="700" letter-spacing="1.4" fill="#A8D7D0">${escapeSvg(copy.total)} · ${escapeSvg(copy.items)}: ${items.length}</text>
      <text x="92" y="116" font-size="16" font-weight="700" fill="#A8D7D0">${escapeSvg(copy.paid)}</text>
      <text x="92" y="151" font-size="31" font-weight="800" fill="#FFFFFF">${escapeSvg(formatCurrency(total))}</text>
      <text x="515" y="116" font-size="16" font-weight="700" fill="#A8D7D0">${escapeSvg(copy.normalPrice)} · ${normalPriceItemCount}/${items.length}</text>
      <text x="515" y="151" font-size="31" font-weight="800" fill="#FFFFFF">${hasCompleteNormalPrices ? escapeSvg(formatCurrency(expected)) : escapeSvg(copy.unset)}</text>
      <text x="1110" y="116" text-anchor="end" font-size="16" font-weight="700" fill="#A8D7D0">${escapeSvg(copy.overallDifference)}</text>
      <text x="1110" y="151" text-anchor="end" font-size="31" font-weight="800" fill="${hasCompleteNormalPrices ? varianceColor(difference, true) : '#D7E5E2'}">${hasCompleteNormalPrices ? escapeSvg(signedCurrency(difference)) : '—'}</text>
      ${groupMarkup}
    </g>
  </svg>`
}

export function buildDailyIngredientConsumptionReportSvg(summary = {}, date = '') {
  const uncovered = Number(summary.uncoveredItemCount) || 0
  return reportShell({
    title: 'Расход ингредиентов',
    subtitle: `${formatLongDate(date, 'ru', date)} · по Tech Card проданных блюд`,
    totalLabel: 'РАСЧЁТНАЯ СТОИМОСТЬ ИНГРЕДИЕНТОВ',
    totalValue: formatCurrency(Math.round(Number(summary.totalSpent) || 0)),
    accent: '#0D9488',
    rows: (summary.ingredients || []).map(ingredient => ({
      name: ingredient.name,
      detail: `${quantity(ingredient.quantity)} ${ingredient.unit === 'piece' ? 'шт' : ingredient.unit}`,
      value: formatCurrency(ingredient.spent),
    })),
    footer: `Покрыто строк продаж: ${Number(summary.coveredItemCount) || 0} · без снимка Tech Card: ${uncovered}`,
  })
}

function openOrderStatusLabel(status) {
  return ({ sent_to_kitchen: 'На кухне', preparing: 'Готовится', ready: 'Готов', served: 'Подан', needs_bill: 'Нужен счёт', new: 'Новый', delivered: 'Доставлен' })[status]
    || 'Открыт'
}

function openOrderPlace(order) {
  const type = inferOrderType(order)
  if (type !== 'dine_in') return orderTypeLabel(type, 'ru')
  return String(order?.table_name || '').replace(/^(?:stol|table)\s*(?=\d)/i, 'Стол ') || 'В зале'
}

export function buildOpenOrdersReportSvg(orders = []) {
  const normalized = (orders || []).filter(order => order && order.status !== 'cancelled'
    && !['paid', 'cancelled'].includes(order.payment_status)).map(order => ({
    ...order,
    items: (order?.items || []).filter(item => item?.status !== 'cancelled'),
  }))
  const contentHeight = normalized.reduce((height, order) => height + 104 + Math.max(order.items.length, 1) * 48, 0)
  const height = 270 + Math.max(contentHeight, 120)
  let cursorY = 192
  const orderMarkup = normalized.length > 0 ? normalized.map((order, orderIndex) => {
    const orderY = cursorY
    const id = String(order?.id || '').slice(-6).toUpperCase()
    const itemRows = order.items.length > 0 ? order.items : [{ name: 'Нет позиций', quantity: 0 }]
    cursorY += 96
    const items = itemRows.map((item, itemIndex) => {
      const rowY = cursorY
      cursorY += 48
      const itemTotal = getOrderItemUnitPrice(item) * Math.max(0, Number(item?.quantity) || 0)
      return `<text x="112" y="${rowY}" font-size="20" fill="#4B5563">${escapeSvg(`${Number(item?.quantity) || 0} × ${getRussianOrderItemDisplayName(item, item?.menu_item) || 'Без названия'}`)}</text>
        <text x="1086" y="${rowY}" text-anchor="end" font-size="20" font-weight="700" fill="#374151">${item?.quantity ? escapeSvg(formatCurrency(itemTotal)) : ''}</text>
        ${itemIndex < itemRows.length - 1 ? `<line x1="112" y1="${rowY + 15}" x2="1086" y2="${rowY + 15}" stroke="#F3F4F6"/>` : ''}`
    }).join('')
    cursorY += 8
    return `<g>
      <rect x="64" y="${orderY - 32}" width="1072" height="${88 + itemRows.length * 48}" rx="22" fill="${orderIndex % 2 ? '#FFF7ED' : '#FFFBEB'}" stroke="#FED7AA"/>
      <text x="92" y="${orderY + 8}" font-size="25" font-weight="800" fill="#9A3412">${escapeSvg(`${orderIndex + 1}. ${openOrderPlace(order)} · #${id}`)}</text>
      <text x="1090" y="${orderY + 8}" text-anchor="end" font-size="25" font-weight="800" fill="#9A3412">${escapeSvg(formatCurrency(order?.total))}</text>
      <text x="92" y="${orderY + 40}" font-size="19" font-weight="600" fill="#C2410C">${escapeSvg(`${formatDateTime(order?.created_at, '')} · ${openOrderStatusLabel(order?.status)}`)}</text>
      ${items}
    </g>`
  }).join('') : '<text x="600" y="246" text-anchor="middle" font-size="30" font-weight="700" fill="#15803D">Все заказы закрыты</text>'

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
    <rect width="${WIDTH}" height="${height}" rx="48" fill="#FFF7ED"/>
    <rect x="28" y="28" width="1144" height="${height - 56}" rx="38" fill="#FFFFFF"/>
    <g font-family="Noto Sans">
      <circle cx="92" cy="91" r="34" fill="#FFEDD5"/><text x="92" y="102" text-anchor="middle" font-size="32">!</text>
      <text x="146" y="86" font-size="34" font-weight="800" fill="#7C2D12">НЕЗАКРЫТЫЕ ЗАКАЗЫ · ${normalized.length}</text>
      <text x="146" y="121" font-size="21" fill="#9A3412">Состояние на момент отправки отчёта · время Ташкента</text>
      ${orderMarkup}
    </g>
  </svg>`
}

export function buildDailyBazaarReportCaption(date) {
  return `🧺 <b>Ежедневный базар</b>\n📅 ${escapeSvg(formatLongDate(date, 'ru', date))}`
}

export function buildDailyInvestorReportsCaption(financialDate, bazaarDate) {
  return [
    '📊 <b>Ежедневные отчёты</b>',
    `💼 Финансы: ${escapeSvg(formatLongDate(financialDate, 'ru', financialDate))}`,
    `🧺 Базар: ${escapeSvg(formatLongDate(bazaarDate, 'ru', bazaarDate))}`,
  ].join('\n')
}

export function buildDailyIngredientConsumptionReportCaption(date) {
  return `🥕 <b>Расход ингредиентов по Tech Card</b>\n📅 ${escapeSvg(formatLongDate(date, 'ru', date))}`
}

export async function buildDailyBazaarReportPng(purchases, date, language = 'ru') {
  configureFonts()
  return sharp(Buffer.from(buildDailyBazaarReportSvg(purchases, date, language))).png({ compressionLevel: 9 }).toBuffer()
}

export async function buildDailyIngredientConsumptionReportPng(summary, date) {
  configureFonts()
  return sharp(Buffer.from(buildDailyIngredientConsumptionReportSvg(summary, date))).png({ compressionLevel: 9 }).toBuffer()
}

export async function buildOpenOrdersReportPng(orders) {
  configureFonts()
  return sharp(Buffer.from(buildOpenOrdersReportSvg(orders))).png({ compressionLevel: 9 }).toBuffer()
}
