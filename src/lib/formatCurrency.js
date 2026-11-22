import { formatDateOnly } from './dateFormat.js'

const GROUP_SEPARATOR = '\u00a0'

/**
 * Digits grouped in threes with a non-breaking space and a decimal comma: "1 250 000", "29 997,5".
 *
 * Written by hand instead of asking Intl for the Uzbek locale, because Chrome (desktop and Android)
 * reports that locale as supported while shipping no number data for it, and prints "1,250,000".
 * The output is identical to what a full-data runtime printed, so every device shows the same text.
 */
export function formatGroupedNumber(value, maximumFractionDigits = 3) {
  const number = Number(value)
  if (!Number.isFinite(number)) return String(number)
  const digits = Math.min(20, Math.max(0, Math.trunc(maximumFractionDigits) || 0))
  let [whole, fraction = ''] = Math.abs(number).toFixed(digits).split('.')
  fraction = fraction.replace(/0+$/, '')
  whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR)
  const negative = number < 0 || Object.is(number, -0)
  return `${negative ? '-' : ''}${whole}${fraction ? `,${fraction}` : ''}`
}

export function formatCurrency(amount) {
  return `${formatGroupedNumber(amount)} UZS`
}

const DECIMAL_COMMA_LANGS = new Set(['uz', 'ru'])

function localizeDecimal(text, lang) {
  return DECIMAL_COMMA_LANGS.has(lang) ? text.replace('.', ',') : text
}

/** "12,5%" in Uzbek and Russian, "12.5%" in English; trailing zeros dropped. */
export function formatPercent(value, lang = 'uz', maximumFractionDigits = 1) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  const digits = Math.min(6, Math.max(0, Math.trunc(maximumFractionDigits) || 0))
  const rounded = Number(number.toFixed(digits))
  return `${localizeDecimal(String(Object.is(rounded, -0) ? 0 : rounded), lang)}%`
}

const COMPACT_UNITS = {
  uz: { thousand: 'ming', million: 'mln', billion: 'mlrd' },
  ru: { thousand: 'тыс.', million: 'млн', billion: 'млрд' },
  en: { thousand: 'K', million: 'M', billion: 'B' },
}

/**
 * A short money figure for chart axes and bar labels: "12,5 mln", "850 ming", "1,2 mlrd".
 * Never used for a total someone pays or reconciles; those use formatCurrency.
 */
export function formatCompactCurrency(amount, lang = 'uz', { signed = false } = {}) {
  const number = Number(amount)
  if (!Number.isFinite(number)) return '—'
  const units = COMPACT_UNITS[lang] || COMPACT_UNITS.en
  const absolute = Math.abs(number)
  const sign = number < 0 ? '−' : signed && number > 0 ? '+' : ''
  const scaled = (divisor, unit) => {
    const scaledValue = absolute / divisor
    const text = localizeDecimal(String(Number(scaledValue.toFixed(scaledValue >= 100 ? 0 : 1))), lang)
    return `${sign}${text}${lang === 'en' ? '' : GROUP_SEPARATOR}${unit}`
  }
  if (absolute >= 1e9) return scaled(1e9, units.billion)
  if (absolute >= 1e6) return scaled(1e6, units.million)
  if (absolute >= 1e3) return scaled(1e3, units.thousand)
  return `${sign}${Math.round(absolute)}`
}

export function formatCurrencyWithPercentage(amount, percentage, lang = 'uz') {
  const currency = formatCurrency(amount)
  if (percentage == null || percentage === '') return currency
  const numericPercentage = Number(percentage)
  if (!Number.isFinite(numericPercentage)) return currency
  return `${currency} · ${formatPercent(numericPercentage, lang)}`
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  return formatDateOnly(dateStr, dateStr)
}
