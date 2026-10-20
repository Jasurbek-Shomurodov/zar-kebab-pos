import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { formatSalaryNotificationAmount } from './salaryMessages.js'

const WIDTH = 1200
const SANKEY_CARD_HEIGHT = 720
const SANKEY_SECTION_SHIFT = SANKEY_CARD_HEIGHT + 28
const HEIGHT = 1460 + SANKEY_SECTION_SHIFT
const CIRCLE_RADIUS = 205
const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS
let payrollFontsConfigured = false

function escapeFontConfigPath(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character])
}

export function configurePayrollFonts() {
  if (payrollFontsConfigured) return
  const fontDirectory = fileURLToPath(
    new URL('../../../node_modules/notosans-fontface/fonts/', import.meta.url)
  )
  const configDirectory = join(tmpdir(), 'zar-kebab-fontconfig')
  const configPath = join(configDirectory, 'fonts.conf')
  mkdirSync(configDirectory, { recursive: true })
  writeFileSync(configPath, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${escapeFontConfigPath(fontDirectory)}</dir>
  <cachedir>${escapeFontConfigPath(join(tmpdir(), 'zar-kebab-font-cache'))}</cachedir>
  <config></config>
</fontconfig>`)
  process.env.FONTCONFIG_FILE = configPath
  payrollFontsConfigured = true
}

function escapeSvg(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character])
}

function normalizeAmount(value) {
  return Math.round(Number(value) || 0)
}

function normalizePercent(value) {
  const percentage = Number.isFinite(Number(value)) ? Number(value) : 0
  return Math.max(0, Math.min(100, percentage))
}

function formatPercent(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(normalizePercent(value))}%`
}

function formatMoney(value) {
  return `${formatSalaryNotificationAmount(normalizeAmount(value))} UZS`
}

function donutSegment(percentage, offset, color) {
  const length = CIRCLE_LENGTH * normalizePercent(percentage) / 100
  const remaining = Math.max(0, CIRCLE_LENGTH - length)
  return `<circle r="${CIRCLE_RADIUS}" fill="none" stroke="${color}" stroke-width="112" stroke-dasharray="${length.toFixed(2)} ${remaining.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`
}

function donutPercentageLabel(percentage, offset, centerX, centerY) {
  const normalizedPercentage = normalizePercent(percentage)
  const middleRatio = (offset + (CIRCLE_LENGTH * normalizedPercentage / 200)) / CIRCLE_LENGTH
  const angle = (-90 + middleRatio * 360) * Math.PI / 180
  const labelRadius = normalizedPercentage < 8 ? CIRCLE_RADIUS + 2 : CIRCLE_RADIUS
  const x = centerX + Math.cos(angle) * labelRadius
  const y = centerY + Math.sin(angle) * labelRadius + 10
  const fontSize = normalizedPercentage < 8 ? 22 : 34
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="${fontSize}" font-weight="800" fill="#FFFFFF" stroke="#173B3F" stroke-opacity="0.28" stroke-width="5" paint-order="stroke">${escapeSvg(formatPercent(normalizedPercentage))}</text>`
}

function expenseRow(label, value, y, { labelSize = 29, accent = '#173B3F' } = {}) {
  return `
    <circle cx="126" cy="${y - 10}" r="7" fill="${accent}"/>
    <text x="154" y="${y}" font-size="${labelSize}" fill="#4D5A59">${escapeSvg(label)}</text>
    <text x="1065" y="${y}" text-anchor="end" font-size="31" font-weight="700" fill="#173B3F">${escapeSvg(value)}</text>`
}

const SANKEY_TOP = 176
const SANKEY_HEIGHT = 500
const SANKEY_GAP = 8
const SANKEY_LABEL_SLOT = 54
const SANKEY_BAR_WIDTH = 16
const SANKEY_COLUMNS = { source: 262, revenue: 452, profit: 626, outcome: 800 }

function layoutSankeyColumn(nodes, scale, top) {
  let y = top
  return nodes.map(node => {
    const height = Math.max(3, node.value * scale)
    const placed = { ...node, height, top: y, center: y + height / 2 }
    y += height + SANKEY_GAP
    return placed
  })
}

function sankeyColumnHeight(nodes) {
  if (!nodes.length) return 0
  const last = nodes[nodes.length - 1]
  return last.top + last.height - nodes[0].top
}

// Keeps two-line labels from overlapping while staying as close to their bars as possible.
function spreadSankeyLabels(nodes) {
  const centers = nodes.map(node => node.center)
  const lowest = SANKEY_TOP + SANKEY_HEIGHT - SANKEY_LABEL_SLOT / 2 + 20
  for (let index = 1; index < centers.length; index += 1) {
    centers[index] = Math.max(centers[index], centers[index - 1] + SANKEY_LABEL_SLOT)
  }
  for (let index = centers.length - 1; index >= 0; index -= 1) {
    const limit = index === centers.length - 1 ? lowest : centers[index + 1] - SANKEY_LABEL_SLOT
    centers[index] = Math.min(centers[index], limit)
  }
  return nodes.map((node, index) => ({ ...node, labelCenter: centers[index] }))
}

function sankeyLeader(fromX, fromY, toX, toY, color) {
  if (Math.abs(fromY - toY) < 4) return ''
  return `<path d="M${fromX} ${fromY.toFixed(1)}L${toX} ${toY.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-opacity="0.5" fill="none"/>`
}

function sankeyBand(x0, y0, x1, y1, thickness, color) {
  if (thickness <= 0) return ''
  const middle = (x0 + x1) / 2
  const y0b = y0 + thickness
  const y1b = y1 + thickness
  return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}C${middle.toFixed(1)} ${y0.toFixed(1)} ${middle.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}L${x1.toFixed(1)} ${y1b.toFixed(1)}C${middle.toFixed(1)} ${y1b.toFixed(1)} ${middle.toFixed(1)} ${y0b.toFixed(1)} ${x0.toFixed(1)} ${y0b.toFixed(1)}Z" fill="${color}" fill-opacity="0.32"/>`
}

function sankeyBar(x, top, height, color) {
  return `<rect x="${x}" y="${top.toFixed(1)}" width="${SANKEY_BAR_WIDTH}" height="${height.toFixed(1)}" rx="3" fill="${color}"/>`
}

// Shares can pass 100% on a loss day, so this skips formatPercent's clamp.
function revenueShare(value, revenue) {
  const share = revenue > 0 ? Math.round((value / revenue) * 1000) / 10 : 0
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(share)}%`
}

export function buildDailyCashFlowSankeySvg(summary, { colors, expenses }) {
  const revenueSources = [
    { label: 'Зал', value: normalizeAmount(summary?.dineInIncomeTotal), color: colors.regular },
    { label: 'Вне зала', value: normalizeAmount(summary?.offPremiseIncomeTotal), color: colors.offPremise },
    { label: 'Туристы', value: normalizeAmount(summary?.touristIncomeTotal), color: colors.tourist },
    { label: 'Игровой клуб', value: normalizeAmount(summary?.gameClubIncomeTotal), color: colors.gameClub },
  ].filter(source => source.value > 0)
  const revenue = revenueSources.reduce((sum, source) => sum + source.value, 0)
  const hasProfit = Number.isFinite(Number(summary?.cafeNetProfit))
  const header = `
    <circle cx="112" cy="52" r="22" fill="#E6F6F3"/>
    <path d="M100 44h10c8 0 8 16 16 16h0 M100 60h10c8 0 8-16 16-16" fill="none" stroke="${colors.regular}" stroke-width="4" stroke-linecap="round"/>
    <text x="150" y="63" font-size="24" font-weight="800" letter-spacing="2" fill="#173B3F">ДВИЖЕНИЕ ВЫРУЧКИ</text>
    <line x1="106" y1="92" x2="1094" y2="92" stroke="#E7EEEC" stroke-width="2"/>`
  const card = `<rect x="68" y="0" width="1064" height="${SANKEY_CARD_HEIGHT}" rx="34" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>`

  if (revenue <= 0 || !hasProfit) {
    return `${card}${header}
    <text x="600" y="${SANKEY_TOP + SANKEY_HEIGHT / 2}" text-anchor="middle" font-size="26" fill="#82918F">${revenue <= 0 ? 'Нет выручки за день' : 'Себестоимость недоступна'}</text>`
  }

  const cafeProfit = Math.min(revenue, Math.max(0, normalizeAmount(summary.cafeNetProfit)))
  const productCost = revenue - cafeProfit
  const spentItems = expenses.filter(item => item.value > 0)
  const spentTotal = spentItems.reduce((sum, item) => sum + item.value, 0)
  const remainder = cafeProfit - spentTotal
  const deficit = Math.max(0, -remainder)
  const costNode = productCost > 0 ? [{ label: 'Себестоимость', value: productCost, color: colors.cost, fromProfit: false }] : []
  // On a loss day the shortfall enters as a red node under revenue, so cost goes on top to keep its flow clear of it.
  const costFirst = deficit > 0
  const outcomes = [
    ...(costFirst ? costNode : []),
    ...(remainder > 0 ? [{ label: 'Чистая прибыль', value: remainder, color: colors.profit, fromProfit: true }] : []),
    ...spentItems.map(item => ({ ...item, fromProfit: true })),
    ...(costFirst ? [] : costNode),
  ]
  const outcomeTotal = outcomes.reduce((sum, node) => sum + node.value, 0)
  const largestColumn = Math.max(revenue + deficit + SANKEY_GAP, outcomeTotal)
  const scale = (SANKEY_HEIGHT - SANKEY_GAP * Math.max(revenueSources.length, outcomes.length)) / largestColumn
  const outcomeNodes = spreadSankeyLabels(layoutSankeyColumn(outcomes, scale, SANKEY_TOP))
  const revenueHeight = revenue * scale
  const revenueTop = SANKEY_TOP
  const profitTop = costFirst ? revenueTop + productCost * scale : revenueTop
  const costTop = costFirst ? revenueTop : revenueTop + cafeProfit * scale
  const deficitTop = revenueTop + revenueHeight + SANKEY_GAP

  const sourceNodesUnplaced = layoutSankeyColumn(revenueSources, scale, 0)
  const sourceSpan = sankeyColumnHeight(sourceNodesUnplaced)
  const sourceTop = Math.max(SANKEY_TOP, revenueTop + revenueHeight / 2 - sourceSpan / 2)
  const sourceNodes = spreadSankeyLabels(layoutSankeyColumn(revenueSources, scale, sourceTop))

  const bands = []
  let revenueCursor = revenueTop
  for (const node of sourceNodes) {
    bands.push(sankeyBand(SANKEY_COLUMNS.source + SANKEY_BAR_WIDTH, node.top, SANKEY_COLUMNS.revenue, revenueCursor, node.height, node.color))
    revenueCursor += node.value * scale
  }
  bands.push(sankeyBand(SANKEY_COLUMNS.revenue + SANKEY_BAR_WIDTH, profitTop, SANKEY_COLUMNS.profit, profitTop, cafeProfit * scale, colors.profit))
  if (deficit > 0) {
    bands.push(sankeyBand(SANKEY_COLUMNS.revenue + SANKEY_BAR_WIDTH, deficitTop, SANKEY_COLUMNS.profit, profitTop + cafeProfit * scale, deficit * scale, colors.loss))
  }
  let profitCursor = profitTop
  for (const node of outcomeNodes) {
    if (node.fromProfit) {
      bands.push(sankeyBand(SANKEY_COLUMNS.profit + SANKEY_BAR_WIDTH, profitCursor, SANKEY_COLUMNS.outcome, node.top, node.height, node.color))
      profitCursor += node.value * scale
    } else {
      bands.push(sankeyBand(SANKEY_COLUMNS.revenue + SANKEY_BAR_WIDTH, costTop, SANKEY_COLUMNS.outcome, node.top, node.height, node.color))
    }
  }

  const sourceLabelX = SANKEY_COLUMNS.source - 26
  const sourceLabels = sourceNodes.map(node => `
    ${sankeyLeader(SANKEY_COLUMNS.source - 4, node.center, sourceLabelX + 8, node.labelCenter, node.color)}
    <text x="${sourceLabelX}" y="${(node.labelCenter - 5).toFixed(1)}" text-anchor="end" font-size="19" font-weight="800" fill="${node.color}">${escapeSvg(node.label)}</text>
    <text x="${sourceLabelX}" y="${(node.labelCenter + 19).toFixed(1)}" text-anchor="end" font-size="18" font-weight="700" fill="#173B3F">${escapeSvg(formatMoney(node.value))}</text>`).join('')
  const outcomeLabelX = SANKEY_COLUMNS.outcome + SANKEY_BAR_WIDTH + 26
  const outcomeLabels = outcomeNodes.map(node => `
    ${sankeyLeader(SANKEY_COLUMNS.outcome + SANKEY_BAR_WIDTH + 4, node.center, outcomeLabelX - 8, node.labelCenter, node.color)}
    <text x="${outcomeLabelX}" y="${(node.labelCenter - 5).toFixed(1)}" font-size="19" font-weight="800" fill="${node.color}">${escapeSvg(node.label)}</text>
    <text x="${outcomeLabelX}" y="${(node.labelCenter + 19).toFixed(1)}" font-size="20" font-weight="800" fill="#173B3F">${escapeSvg(formatMoney(node.value))}<tspan dx="8" font-size="16" font-weight="700" fill="#82918F">· ${escapeSvg(revenueShare(node.value, revenue))}</tspan></text>`).join('')
  const columnLabel = (x, title, value, color) => `
    <text x="${x + SANKEY_BAR_WIDTH / 2}" y="130" text-anchor="middle" font-size="16" font-weight="800" letter-spacing="1.4" fill="#70817E">${title}</text>
    <text x="${x + SANKEY_BAR_WIDTH / 2}" y="156" text-anchor="middle" font-size="20" font-weight="800" fill="${color}">${escapeSvg(formatMoney(value))}</text>`
  const netProfit = Number.isFinite(Number(summary?.netProfit)) ? normalizeAmount(summary.netProfit) : remainder
  const headline = netProfit >= 0
    ? `ОСТАЁТСЯ ${revenueShare(netProfit, revenue)} ВЫРУЧКИ`
    : `УБЫТОК · ${formatMoney(Math.abs(netProfit))}`

  return `${card}${header}
    <text x="1094" y="63" text-anchor="end" font-size="20" font-weight="800" fill="${netProfit >= 0 ? colors.profit : colors.loss}">${escapeSvg(headline)}</text>
    ${columnLabel(SANKEY_COLUMNS.revenue, 'ВЫРУЧКА', revenue, '#173B3F')}
    ${columnLabel(SANKEY_COLUMNS.profit, 'ПРИБЫЛЬ КАФЕ', cafeProfit, colors.profit)}
    ${bands.join('\n    ')}
    ${sourceNodes.map(node => sankeyBar(SANKEY_COLUMNS.source, node.top, node.height, node.color)).join('')}
    ${sankeyBar(SANKEY_COLUMNS.revenue, revenueTop, revenueHeight, '#173B3F')}
    ${sankeyBar(SANKEY_COLUMNS.profit, profitTop, cafeProfit * scale, colors.profit)}
    ${deficit > 0 ? `${sankeyBar(SANKEY_COLUMNS.profit, profitTop + cafeProfit * scale, deficit * scale, colors.loss)}
    ${sankeyBar(SANKEY_COLUMNS.revenue, deficitTop, Math.max(3, deficit * scale), colors.loss)}
    <text x="${SANKEY_COLUMNS.revenue - 14}" y="${(deficitTop + deficit * scale / 2 - 5).toFixed(1)}" text-anchor="end" font-size="19" font-weight="800" fill="${colors.loss}">Убыток</text>
    <text x="${SANKEY_COLUMNS.revenue - 14}" y="${(deficitTop + deficit * scale / 2 + 19).toFixed(1)}" text-anchor="end" font-size="18" font-weight="700" fill="#173B3F">${escapeSvg(formatMoney(deficit))}</text>` : ''}
    ${outcomeNodes.map(node => sankeyBar(SANKEY_COLUMNS.outcome, node.top, node.height, node.color)).join('')}
    ${sourceLabels}
    ${outcomeLabels}`
}

export function buildDailyPayrollGroupReportSvg(summary, date) {
  const cafeIncome = normalizeAmount(summary?.cafeIncomeTotal)
  const cashIncome = normalizeAmount(summary?.cashIncomeTotal)
  const terminalIncome = normalizeAmount(summary?.terminalIncomeTotal)
  const cashAndTerminalIncome = cashIncome + terminalIncome
  const cashPaymentPercentage = cashAndTerminalIncome > 0
    ? Math.round((cashIncome / cashAndTerminalIncome) * 1000) / 10
    : 0
  const terminalPaymentPercentage = cashAndTerminalIncome > 0
    ? Math.round((100 - cashPaymentPercentage) * 10) / 10
    : 0
  const paymentLineWidth = 376
  const cashPaymentLineWidth = paymentLineWidth * cashPaymentPercentage / 100
  const dineInPercentage = normalizePercent(summary?.dineInPercentage)
  const offPremisePercentage = normalizePercent(summary?.offPremisePercentage)
  const touristPercentage = normalizePercent(summary?.touristPercentage)
  const dineInIncome = normalizeAmount(summary?.dineInIncomeTotal)
  const offPremiseIncome = normalizeAmount(summary?.offPremiseIncomeTotal)
  const touristIncome = normalizeAmount(summary?.touristIncomeTotal)
  const gameClubIncome = normalizeAmount(summary?.gameClubIncomeTotal)
  const gameClubPercentage = normalizePercent(summary?.gameClubPercentage)
  const gameClubOffset = CIRCLE_LENGTH * (dineInPercentage + offPremisePercentage + touristPercentage) / 100
  const firstSegmentLength = CIRCLE_LENGTH * dineInPercentage / 100
  const secondSegmentLength = CIRCLE_LENGTH * offPremisePercentage / 100
  const cafeNetProfit = Number.isFinite(Number(summary?.cafeNetProfit))
    ? formatMoney(summary.cafeNetProfit)
    : 'Недоступно'
  const isLoss = Number(summary?.netProfit) < 0
  const netProfit = Number.isFinite(Number(summary?.netProfit))
    ? `${isLoss ? '–' : ''}${formatMoney(Math.abs(Number(summary.netProfit)))}`
    : 'Недоступно'
  const employeeMealLabel = `Среднее питание сотрудников (${normalizeAmount(summary?.presentEmployeeCount)} × ${formatSalaryNotificationAmount(summary?.employeeMealPerEmployeeTotal)})`
  const overallExpense = normalizeAmount(summary?.salaryTotal)
    + normalizeAmount(summary?.kpiBonusTotal)
    + normalizeAmount(summary?.rentTotal)
    + normalizeAmount(summary?.utilitiesTotal)
    + normalizeAmount(summary?.employeeMealTotal)
    + normalizeAmount(summary?.estimatedTaxTotal)
  const chartCenterX = 365
  const chartCenterY = 613
  const regularColor = '#0D9488'
  const offPremiseColor = '#F97316'
  const touristColor = '#C026D3'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="average" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#173B3F"/>
      <stop offset="1" stop-color="#0D766F"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="52" fill="#EAF0EE"/>
  <rect x="34" y="34" width="1132" height="${1392 + SANKEY_SECTION_SHIFT}" rx="44" fill="#F8FAF9"/>
  <g font-family="Noto Sans">
    <g transform="translate(0 -210)">
    <rect x="68" y="270" width="1064" height="642" rx="34" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <text x="664" y="324" font-size="20" font-weight="700" letter-spacing="2.5" fill="#70817E">ВЫРУЧКА КАФЕ ЗА ДЕНЬ</text>
    <text x="664" y="382" font-size="49" font-weight="800" fill="#173B3F">${escapeSvg(formatMoney(cafeIncome))}</text>

    <rect x="646" y="402" width="424" height="126" rx="22" fill="#F0F7F5"/>
    <text x="668" y="430" font-size="16" font-weight="800" letter-spacing="1.4" fill="${regularColor}">НАЛИЧНЫЕ</text>
    <text x="668" y="464" font-size="25" font-weight="800" fill="#173B3F">${escapeSvg(formatMoney(cashIncome))}</text>
    <text x="1048" y="430" text-anchor="end" font-size="16" font-weight="800" letter-spacing="1.4" fill="${touristColor}">ТЕРМИНАЛ</text>
    <text x="1048" y="464" text-anchor="end" font-size="25" font-weight="800" fill="#173B3F">${escapeSvg(formatMoney(terminalIncome))}</text>
    <line x1="668" y1="489" x2="1044" y2="489" stroke="#D8E5E2" stroke-width="10" stroke-linecap="round"/>
    <line x1="668" y1="489" x2="${(668 + cashPaymentLineWidth).toFixed(1)}" y2="489" stroke="${regularColor}" stroke-width="10" stroke-linecap="round"/>
    <line x1="${(668 + cashPaymentLineWidth).toFixed(1)}" y1="489" x2="1044" y2="489" stroke="${touristColor}" stroke-width="10" stroke-linecap="round"/>
    <text x="668" y="516" font-size="16" font-weight="800" fill="${regularColor}">${escapeSvg(formatPercent(cashPaymentPercentage))}</text>
    <text x="1048" y="516" text-anchor="end" font-size="16" font-weight="800" fill="${touristColor}">${escapeSvg(formatPercent(terminalPaymentPercentage))}</text>

    <g transform="translate(${chartCenterX} ${chartCenterY}) rotate(-90)">
      <circle r="${CIRCLE_RADIUS}" fill="none" stroke="#E8EFED" stroke-width="112"/>
      ${donutSegment(dineInPercentage, 0, regularColor)}
      ${donutSegment(offPremisePercentage, firstSegmentLength, offPremiseColor)}
      ${donutSegment(touristPercentage, firstSegmentLength + secondSegmentLength, touristColor)}
      ${donutSegment(gameClubPercentage, gameClubOffset, "#2563EB")}
    </g>
    <circle cx="${chartCenterX}" cy="${chartCenterY}" r="143" fill="#FFFFFF"/>
    <text x="${chartCenterX}" y="602" text-anchor="middle" font-size="20" font-weight="700" letter-spacing="2" fill="#82918F">СТРУКТУРА</text>
    <text x="${chartCenterX}" y="638" text-anchor="middle" font-size="29" font-weight="700" fill="#173B3F">выручки</text>
    ${donutPercentageLabel(dineInPercentage, 0, chartCenterX, chartCenterY)}
    ${donutPercentageLabel(offPremisePercentage, firstSegmentLength, chartCenterX, chartCenterY)}
    ${donutPercentageLabel(touristPercentage, firstSegmentLength + secondSegmentLength, chartCenterX, chartCenterY)}
    ${donutPercentageLabel(gameClubPercentage, gameClubOffset, chartCenterX, chartCenterY)}

    <circle cx="671" cy="553" r="6" fill="${regularColor}"/>
    <text x="686" y="560" font-size="18" font-weight="700" letter-spacing="1.6" fill="${regularColor}">ЗАЛ</text>
    <text x="1048" y="560" text-anchor="end" font-size="18" font-weight="700" fill="${regularColor}">${escapeSvg(formatMoney(dineInIncome))}</text>
    <text x="664" y="592" font-size="27" font-weight="700" fill="#173B3F">Обычная выручка</text>
    <circle cx="671" cy="628" r="6" fill="${offPremiseColor}"/>
    <text x="686" y="635" font-size="18" font-weight="700" letter-spacing="1.6" fill="${offPremiseColor}">ВНЕ ЗАЛА</text>
    <text x="1048" y="635" text-anchor="end" font-size="18" font-weight="700" fill="${offPremiseColor}">${escapeSvg(formatMoney(offPremiseIncome))}</text>
    <text x="664" y="667" font-size="27" font-weight="700" fill="#173B3F">С собой + доставка</text>
    <circle cx="671" cy="703" r="6" fill="${touristColor}"/>
    <text x="686" y="710" font-size="18" font-weight="700" letter-spacing="1.6" fill="${touristColor}">ТУРИСТЫ</text>
    <text x="1048" y="710" text-anchor="end" font-size="18" font-weight="700" fill="${touristColor}">${escapeSvg(formatMoney(touristIncome))}</text>
    <text x="664" y="742" font-size="27" font-weight="700" fill="#173B3F">Туристическая выручка</text>

    <circle cx="671" cy="778" r="6" fill="#2563EB"/>
    <text x="686" y="785" font-size="18" font-weight="700" fill="#2563EB">ИГРОВОЙ КЛУБ</text>
    <text x="1048" y="785" text-anchor="end" font-size="18" font-weight="700" fill="#2563EB">${escapeSvg(formatMoney(gameClubIncome))}</text>

    <rect x="646" y="804" width="424" height="90" rx="22" fill="#EAF8F3"/>
    <text x="676" y="838" font-size="20" font-weight="700" fill="#4A6A61">ЧИСТАЯ ПРИБЫЛЬ КАФЕ</text>
    <text x="676" y="875" font-size="31" font-weight="800" fill="#137A58">${escapeSvg(cafeNetProfit)}</text>

    <g transform="translate(0 940)">
    ${buildDailyCashFlowSankeySvg(summary, {
      colors: { regular: regularColor, offPremise: offPremiseColor, tourist: touristColor, gameClub: '#2563EB', profit: '#137A58', cost: '#94A3B8', loss: '#EF4444' },
      expenses: [
        { label: 'Зарплата', value: normalizeAmount(summary?.salaryTotal), color: regularColor },
        { label: 'KPI-бонусы', value: normalizeAmount(summary?.kpiBonusTotal), color: touristColor },
        { label: 'Аренда', value: normalizeAmount(summary?.rentTotal), color: '#3B82F6' },
        { label: 'Коммуналка', value: normalizeAmount(summary?.utilitiesTotal), color: '#EAB308' },
        { label: 'Питание сотрудников', value: normalizeAmount(summary?.employeeMealTotal), color: offPremiseColor },
        { label: 'Оценочный soliq', value: normalizeAmount(summary?.estimatedTaxTotal), color: '#EF4444' },
      ],
    })}
    </g>

    <g transform="translate(0 ${SANKEY_SECTION_SHIFT})">
    <rect x="68" y="940" width="1064" height="448" rx="34" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <circle cx="112" cy="992" r="22" fill="#FFF0E7"/>
    <path d="M102 992h20 M106 982v20 M118 982v20" stroke="#F97316" stroke-width="4" stroke-linecap="round"/>
    <text x="150" y="1003" font-size="24" font-weight="800" letter-spacing="2" fill="#173B3F">РАСХОДЫ И НАЧИСЛЕНИЯ</text>
    <text x="1094" y="1003" text-anchor="end" font-size="20" font-weight="800" fill="#173B3F">ОБЩИЙ РАСХОД · ${escapeSvg(formatMoney(overallExpense))}</text>
    <line x1="106" y1="1032" x2="1094" y2="1032" stroke="#E7EEEC" stroke-width="2"/>
    ${expenseRow('Начисленная зарплата', formatMoney(summary?.salaryTotal), 1076, { accent: regularColor })}
    ${expenseRow('Автоматические KPI-бонусы', formatMoney(summary?.kpiBonusTotal), 1134, { accent: touristColor })}
    ${expenseRow('Аренда', formatMoney(summary?.rentTotal), 1192, { accent: '#3B82F6' })}
    ${expenseRow('Коммуналка', formatMoney(summary?.utilitiesTotal), 1250, { accent: '#EAB308' })}
    ${expenseRow(employeeMealLabel, formatMoney(summary?.employeeMealTotal), 1308, { labelSize: 26, accent: offPremiseColor })}
    ${expenseRow('Оценочный soliq (4%)', formatMoney(summary?.estimatedTaxTotal), 1366, { labelSize: 26, accent: '#EF4444' })}

    <rect x="68" y="1418" width="1064" height="190" rx="32" fill="url(#average)"/>
    <line x1="600" y1="1448" x2="600" y2="1578" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2"/>

    <circle cx="128" cy="1513" r="32" fill="#FFFFFF" fill-opacity="0.14"/>
    <path d="${isLoss ? 'M113 1503l11 11 9-8 15 18' : 'M113 1521l11-11 9 8 15-18'}" fill="none" stroke="${isLoss ? '#FCA5A5' : '#FFFFFF'}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="182" y="1497" font-size="19" font-weight="800" letter-spacing="1.4" fill="${isLoss ? '#FCA5A5' : '#A8E6DC'}">${isLoss ? 'УБЫТОК ЗА ДЕНЬ' : 'ЧИСТАЯ ПРИБЫЛЬ ЗА ДЕНЬ'}</text>
    <text x="182" y="1550" font-size="38" font-weight="800" fill="${isLoss ? '#FCA5A5' : '#FFFFFF'}">${escapeSvg(netProfit)}</text>

    <circle cx="660" cy="1513" r="32" fill="#FFFFFF" fill-opacity="0.14"/>
    <path d="M643 1521v-22 M655 1521v-34 M667 1521v-15 M679 1521v-43" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
    <text x="714" y="1485" font-size="17" font-weight="800" letter-spacing="1.1" fill="#A8E6DC">СРЕДНЯЯ ДНЕВНАЯ</text>
    <text x="714" y="1513" font-size="17" font-weight="800" letter-spacing="1.1" fill="#A8E6DC">ВЫРУЧКА КАФЕ ЗА МЕСЯЦ</text>
    <text x="714" y="1560" font-size="36" font-weight="800" fill="#FFFFFF">${escapeSvg(formatMoney(summary?.monthlyAverageCafeIncome))}</text>
    </g>
    </g>
  </g>
</svg>`
}

export function buildDailyPayrollGroupReportCaption(date) {
  const compactDate = formatLongDate(date, 'ru', date, { includeYear: false }).replace(/\s+/, '-')
  return `💼 <b>Зарплата, KPI и прибыль</b>\n📅 ${compactDate}`
}

export async function buildDailyPayrollGroupReportPng(summary, date) {
  configurePayrollFonts()
  const svg = buildDailyPayrollGroupReportSvg(summary, date)
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}
