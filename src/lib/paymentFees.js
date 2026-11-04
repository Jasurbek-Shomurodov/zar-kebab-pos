import { supabase } from './supabase.js'

// Bank fees on card and terminal income (migration 278). Rates are kept with
// the date they take effect; the database applies each day's rate to that
// day's income, so a rate change never rewrites earlier periods. Fees are
// estimates shown in Financial analysis only, never saved as expenses.

export const BANK_FEE_CATEGORY = '__bank_fees__'
export const PAYMENT_FEE_METHODS = ['terminal', 'card']
export const MAX_PAYMENT_FEE_RATE_PCT = 20

function isMissingRpc(error, name) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`
  return error?.code === 'PGRST202' || error?.code === '42883' || text.includes(name)
}

export function isMissingPaymentFeesRpc(error) {
  return isMissingRpc(error, 'get_accounting_payment_fees') || isMissingRpc(error, 'set_payment_fee_rate')
}

function amount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function rate(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1000) / 1000 : 0
}

export function normalizePaymentFeeRates(rates = {}) {
  return {
    card: rate(rates?.card),
    terminal: rate(rates?.terminal),
    history: (Array.isArray(rates?.history) ? rates.history : [])
      .filter(row => PAYMENT_FEE_METHODS.includes(row?.method) && /^\d{4}-\d{2}-\d{2}$/.test(String(row?.effective_from || '').slice(0, 10)))
      .map(row => ({ method: row.method, effectiveFrom: String(row.effective_from).slice(0, 10), ratePct: rate(row.rate_pct) })),
  }
}

export function normalizePaymentFees(data = {}) {
  const days = (Array.isArray(data?.days) ? data.days : [])
    .map(row => ({
      date: String(row?.date || '').slice(0, 10),
      cardIncome: amount(row?.card_income),
      terminalIncome: amount(row?.terminal_income),
      cardFee: amount(row?.card_fee),
      terminalFee: amount(row?.terminal_fee),
    }))
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
  const totals = days.reduce((sum, row) => ({
    card: sum.card + row.cardFee,
    terminal: sum.terminal + row.terminalFee,
  }), { card: 0, terminal: 0 })
  return { rates: normalizePaymentFeeRates(data?.rates), days, totals, total: totals.card + totals.terminal }
}

// Calculated expense rows, one per method and day, so every Financial analysis
// view (Spent, Left, Sankey, P&L, daily chart, payment methods) counts the fee
// on the day and channel the bank takes it from.
export function buildPaymentFeeEntries(fees) {
  const rows = []
  for (const day of fees?.days || []) {
    for (const method of PAYMENT_FEE_METHODS) {
      const fee = method === 'card' ? day.cardFee : day.terminalFee
      if (fee <= 0) continue
      rows.push({
        id: `bank-fee-${method}-${day.date}`,
        entry_type: 'expense',
        expense_date: day.date,
        category: BANK_FEE_CATEGORY,
        payment_method: method,
        amount: fee,
        vendor: '',
        description: '',
        is_bank_fee_estimate: true,
      })
    }
  }
  return rows
}

export async function loadPaymentFees(dateFrom, dateTo, options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await dbClient.rpc('get_accounting_payment_fees', { p_date_from: dateFrom, p_date_to: dateTo })
  if (error) throw error
  return normalizePaymentFees(data || {})
}

export function parsePaymentFeeRate(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(text)) return null
  const number = Number(text)
  return number >= 0 && number <= MAX_PAYMENT_FEE_RATE_PCT ? number : null
}

export async function savePaymentFeeRate(method, ratePct, effectiveFrom, options = {}) {
  if (!PAYMENT_FEE_METHODS.includes(method)) throw new Error('Unknown payment method')
  const dbClient = options.dbClient || supabase
  const { data, error } = await dbClient.rpc('set_payment_fee_rate', {
    p_method: method,
    p_rate_pct: ratePct,
    p_effective_from: effectiveFrom || null,
  })
  if (error) throw error
  return normalizePaymentFeeRates(data || {})
}
