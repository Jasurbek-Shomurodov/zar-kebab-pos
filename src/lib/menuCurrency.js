import { formatCurrency } from './formatCurrency.js'

export const MENU_CURRENCIES = ['UZS', 'USD', 'EUR']
export const DEFAULT_MENU_CURRENCY = 'UZS'
export const MENU_CURRENCY_CACHE_KEY = 'zk_menu_currency_rates_v1'
export const MENU_CURRENCY_RATE_TTL_DAYS = 3

const RATE_TTL_MS = MENU_CURRENCY_RATE_TTL_DAYS * 24 * 60 * 60 * 1000
const PRIMARY_RATES_URL = 'https://open.er-api.com/v6/latest/UZS'
const FALLBACK_RATES_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/uzs.json'

const formatUzs = formatCurrency

export function normalizeMenuCurrency(currency) {
  const normalized = String(currency || '').toUpperCase()
  return MENU_CURRENCIES.includes(normalized) ? normalized : DEFAULT_MENU_CURRENCY
}

export function getDefaultMenuCurrency() {
  try {
    return normalizeMenuCurrency(localStorage.getItem('zk_menu_currency'))
  } catch {
    return DEFAULT_MENU_CURRENCY
  }
}

export function saveMenuCurrency(currency) {
  const normalized = normalizeMenuCurrency(currency)
  try {
    localStorage.setItem('zk_menu_currency', normalized)
  } catch {
    // Storage can be unavailable in private or embedded browsers.
  }
  return normalized
}

function isValidRate(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

export function normalizeMenuCurrencyRates(rates = {}) {
  return {
    UZS: 1,
    USD: isValidRate(rates.USD) ? Number(rates.USD) : null,
    EUR: isValidRate(rates.EUR) ? Number(rates.EUR) : null,
    fetchedAt: rates.fetchedAt || null,
    source: rates.source || '',
  }
}

function readCachedRates(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(MENU_CURRENCY_CACHE_KEY) || 'null')
    if (!parsed?.fetchedAt) return null
    return normalizeMenuCurrencyRates(parsed)
  } catch {
    return null
  }
}

function writeCachedRates(rates, storage = globalThis.localStorage) {
  try {
    storage.setItem(MENU_CURRENCY_CACHE_KEY, JSON.stringify(rates))
  } catch {
    // Cache is optional.
  }
}

function parsePrimaryRates(data, now) {
  const rates = normalizeMenuCurrencyRates({
    USD: data?.rates?.USD,
    EUR: data?.rates?.EUR,
    fetchedAt: now,
    source: 'open.er-api.com',
  })
  if (!rates.USD || !rates.EUR) throw new Error('Live menu currency rates are incomplete')
  return rates
}

function parseFallbackRates(data, now) {
  const rows = data?.uzs || {}
  const rates = normalizeMenuCurrencyRates({
    USD: rows.usd,
    EUR: rows.eur,
    fetchedAt: now,
    source: 'currency-api',
  })
  if (!rates.USD || !rates.EUR) throw new Error('Fallback menu currency rates are incomplete')
  return rates
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`Currency rate request failed: ${response.status}`)
  return response.json()
}

export async function loadMenuCurrencyRates(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const storage = options.storage || globalThis.localStorage
  const now = options.now || Date.now()
  const cached = readCachedRates(storage)

  if (!fetchImpl) {
    return cached || normalizeMenuCurrencyRates()
  }

  if (cached && now - Number(cached.fetchedAt) < RATE_TTL_MS && !options.force) {
    return cached
  }

  try {
    const liveRates = parsePrimaryRates(await fetchJson(PRIMARY_RATES_URL, fetchImpl), now)
    writeCachedRates(liveRates, storage)
    return liveRates
  } catch (primaryError) {
    try {
      const fallbackRates = parseFallbackRates(await fetchJson(FALLBACK_RATES_URL, fetchImpl), now)
      writeCachedRates(fallbackRates, storage)
      return fallbackRates
    } catch {
      return cached || normalizeMenuCurrencyRates({
        source: primaryError?.message || 'unavailable',
      })
    }
  }
}

export function formatMenuCurrency(amountUzs, currency = DEFAULT_MENU_CURRENCY, rates = {}) {
  const normalized = normalizeMenuCurrency(currency)
  const amount = Math.max(0, Number(amountUzs) || 0)
  if (normalized === 'UZS') return formatUzs(amount)

  const liveRate = Number(rates?.[normalized])
  if (!Number.isFinite(liveRate) || liveRate <= 0) return formatUzs(amount)

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalized,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount * liveRate)
}
