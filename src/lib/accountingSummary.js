import { getAccountingPaidOrderSummary } from './accounting.js'
import { loadPaidOrdersForRange } from './orderHistory.js'
import { supabase } from './supabase.js'

function isMissingAccountingSummaryRpc(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('get_accounting_paid_order_summary') && (
    message.includes('could not find the function') ||
    message.includes('schema cache') ||
    message.includes('function') && message.includes('not found')
  )
}

export async function loadAccountingPaidOrderSummary(dateFrom, dateTo, options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await dbClient.rpc('get_accounting_paid_order_summary', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  })

  if (!error) return data || {}
  if (!isMissingAccountingSummaryRpc(error) || options.allowLegacyFallback === false) throw error

  // Keep Accounting usable while the frontend and database migration are
  // deployed separately. Once migration 109 is present, this slower path is
  // never used.
  const orders = await loadPaidOrdersForRange(dateFrom, dateTo, {
    dbClient,
    pageSize: options.pageSize,
  })
  return getAccountingPaidOrderSummary(
    orders,
    dateFrom,
    dateTo,
    options.fallbackMenuItemMap
  )
}

export async function loadAccountingAllTimeBalance(options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await dbClient.rpc('get_accounting_all_time_balance')
  if (error) throw error
  return Math.round(Number(data?.balance ?? data) || 0)
}

function cashflowAmount(value) {
  return Math.round(Number(value) || 0)
}

// Monthly cash in/out plus investor support since opening, aggregated by
// migration 229 so a year of rows is never downloaded.
export async function loadAccountingMonthlyCashflow(monthCount = 12, options = {}) {
  const dbClient = options.dbClient || supabase
  const { data, error } = await dbClient.rpc('get_accounting_monthly_cashflow', {
    p_month_count: Math.max(1, Math.min(Math.round(Number(monthCount) || 12), 36)),
  })
  if (error) throw error
  const totals = data?.totals || {}
  return {
    months: (data?.months || []).map(row => ({
      monthStart: String(row?.month_start || '').slice(0, 10),
      cafeIncome: Math.max(0, cashflowAmount(row?.cafe_income)),
      orderCount: Math.max(0, cashflowAmount(row?.order_count)),
      salesCost: Math.max(0, cashflowAmount(row?.sales_cost)),
      investorSupport: Math.max(0, cashflowAmount(row?.investor_support)),
      otherIncome: Math.max(0, cashflowAmount(row?.other_income)),
      spent: Math.max(0, cashflowAmount(row?.spent)),
      salaries: Math.max(0, cashflowAmount(row?.salaries)),
    })).filter(row => /^\d{4}-\d{2}-01$/.test(row.monthStart)),
    totals: {
      investorSupport: Math.max(0, cashflowAmount(totals.investor_support)),
      operatingCash: cashflowAmount(totals.operating_cash),
      firstOrderMonth: totals.first_order_month ? String(totals.first_order_month).slice(0, 7) : null,
      firstInvestmentMonth: totals.first_investment_month ? String(totals.first_investment_month).slice(0, 7) : null,
    },
  }
}

export function isMissingAccountingMonthlyCashflowRpc(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return error?.code === 'PGRST202' || message.includes('get_accounting_monthly_cashflow') && (
    message.includes('could not find the function') || message.includes('schema cache') || message.includes('not found')
  )
}
