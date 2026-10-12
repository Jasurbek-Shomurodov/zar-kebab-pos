import { getOrderPaymentFields } from '../lib/analytics.js'
import {
  isOffPremiseOrderType,
  normalizeOrderType,
  orderTypePrefix,
} from '../lib/orderTypes.js'
import {
  DEFAULT_REGULAR_SERVICE_RATE_PCT,
  DEFAULT_TOURIST_SERVICE_RATE_PCT,
  getConfiguredServiceRatePct,
} from '../lib/serviceRates.js'

export { normalizeOrderType }

export const DEFAULT_SETTINGS = {
  restaurantName: 'Zar Kebab',
  serviceRate:    DEFAULT_REGULAR_SERVICE_RATE_PCT,
  touristServiceRate: DEFAULT_TOURIST_SERVICE_RATE_PCT,
  monthlyRentUzs: 0,
  monthlyUtilitiesUzs: 0,
  averageDailyEmployeeMealUzs: 0,
  averageDailyBreakEvenIncomeUzs: 10_000_000,
  receiptFooter:  '',
  receiptMarketing: 'compactFooter',
  autoPrint:      false,
  touristMenuEnabled: true,
  publicTouristPrices: false,
  autoPrintKitchenCheck: false,
}

export function loadSettings() {
  try {
    const s = localStorage.getItem('zk_settings')
    return s ? JSON.parse(s) : {}
  } catch { return {} }
}

export function loadInitialLang() {
  try {
    const hostname = String(globalThis.location?.hostname || '').toLowerCase()
    const isPublicWebsite = hostname === 'zarkebab.uz' || hostname === 'www.zarkebab.uz'
    if (isPublicWebsite && !localStorage.getItem('zk_public_default_lang_ru_v1')) {
      localStorage.setItem('zk_lang', 'ru')
      localStorage.setItem('zk_public_default_lang_ru_v1', '1')
      return 'ru'
    }
    if (!localStorage.getItem('zk_default_lang_ru_v2')) {
      localStorage.setItem('zk_lang', 'ru')
      localStorage.setItem('zk_default_lang_ru_v2', '1')
      return 'ru'
    }
    return localStorage.getItem('zk_lang') || 'ru'
  } catch {
    return 'ru'
  }
}

export function serviceRatePctFromSettings(settings, priceMode) {
  return getConfiguredServiceRatePct(settings, priceMode)
}

export function makeLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export function recalcOrderTotals(order, settings) {
  const orderType = normalizeOrderType(order?.order_type || order?.orderType)
  const serviceRatePct = isOffPremiseOrderType(orderType) ? 0 : Number.isFinite(Number(order?.service_rate_pct))
    ? Number(order.service_rate_pct)
    : serviceRatePctFromSettings(settings, order?.price_mode || order?.priceMode)
  const paymentFields = getOrderPaymentFields(
    { ...order, order_type: orderType, service_rate_pct: serviceRatePct },
    order?.items || [],
    serviceRatePct
  )
  return { ...order, ...paymentFields }
}

export function makeOrderNumber(orderId, orderType = 'take_away') {
  const suffix = String(orderId || Date.now()).replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `${orderTypePrefix(orderType)}-${suffix}`
}

export function makeTakeAwayOrderNumber(orderId) {
  return makeOrderNumber(orderId, 'take_away')
}

export function getQuickSortOrder(item) {
  const value = Number(item?.quick_item_sort_order ?? item?.quickItemSortOrder ?? item?.sort_order ?? 9999)
  return Number.isFinite(value) ? value : 9999
}
