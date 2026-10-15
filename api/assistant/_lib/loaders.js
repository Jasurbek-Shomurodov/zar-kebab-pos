import {
  loadAccountingMonthlyCashflow,
  loadAccountingPaidOrderSummary,
  loadReportsAccountingBundle,
} from '../../../src/lib/accountingSummary.js'
import {
  getAccountingPageSummaryFromOrderSummary,
  getAccountingPaidOrderSummary,
  normalizeAccountingPaidOrderSummary,
} from '../../../src/lib/accounting.js'
import {
  buildAccountingPeriodEntries,
  buildDailySpending,
  composeSalaryProfiles,
} from '../../../src/lib/accountingAnalysis.js'
import { matchesRange } from '../../../src/lib/analytics.js'
import { loadPaidOrdersForRange } from '../../../src/lib/orderHistory.js'
import {
  categoriesTable,
  dailyTable,
  dishSalesTable,
  expensesTable,
  monthlyTable,
  ORDER_DATASETS,
  RANGED_DATASETS,
  summaryTable,
} from '../../../src/lib/assistant/datasets.js'
import { clampMonths, MAX_ORDER_RANGE_DAYS, MAX_RANGE_DAYS, resolveRange } from '../../../src/lib/assistant/ranges.js'

/** A problem with the request the model can fix (bad dates, no access). */
export class DatasetQueryError extends Error {}

function isAccessError(error) {
  return error?.code === '42501' || /permission denied|access is required|not allowed/i.test(String(error?.message || ''))
}

/**
 * Loads assistant datasets with the caller's own Supabase client, so the same
 * RLS and RPC access checks as the Accounting and Reports pages apply.
 * Period loads are memoized for one answer: summary, categories and expenses
 * share the same entries.
 */
export function createDatasetLoader({ dbClient, today }) {
  const cache = new Map()
  const once = (key, load) => {
    if (!cache.has(key)) cache.set(key, load())
    return cache.get(key)
  }

  const accountingEntries = (from, to) => once(`entries:${from}:${to}`, async () => {
    const bundle = await loadReportsAccountingBundle({ dateFrom: from, dateTo: to }, { dbClient })
    if (!bundle) throw new DatasetQueryError('Accounting data is not available yet (migration 235 is missing).')
    const salaryProfiles = composeSalaryProfiles(
      bundle.salary.profiles,
      [],
      bundle.salary.payments,
      bundle.salary.bonuses,
      [],
      [],
      bundle.salary.team,
    )
    return buildAccountingPeriodEntries({
      expenses: bundle.expenses,
      salaryProfiles,
      employeeMealSnapshots: bundle.employeeMealSnapshots,
    }, from, to)
  })

  const paidOrderSummary = (from, to) => once(`orders-summary:${from}:${to}`, async () => (
    normalizeAccountingPaidOrderSummary(
      await loadAccountingPaidOrderSummary(from, to, { dbClient, allowLegacyFallback: false }),
      from,
      to,
    )
  ))

  const paidOrders = (from, to) => once(`orders:${from}:${to}`, () => loadPaidOrdersForRange(from, to, { dbClient }))

  async function buildTable(query, period) {
    switch (query.dataset) {
      case 'summary': {
        const [orderSummary, entries] = await Promise.all([
          paidOrderSummary(period.from, period.to),
          accountingEntries(period.from, period.to),
        ])
        const summary = getAccountingPageSummaryFromOrderSummary(orderSummary, entries, period.from, period.to)
        return summaryTable(summary, orderSummary)
      }
      case 'daily': {
        const [orders, entries] = await Promise.all([
          paidOrders(period.from, period.to),
          accountingEntries(period.from, period.to),
        ])
        const spendingDays = buildDailySpending(entries, period.from, period.to)
        const incomeByDate = new Map(spendingDays.map(({ date }) => [
          date,
          getAccountingPaidOrderSummary(orders.filter(order => matchesRange(order, date, date)), date, date),
        ]))
        return dailyTable(spendingDays, incomeByDate)
      }
      case 'monthly': {
        const { months } = await loadAccountingMonthlyCashflow(clampMonths(query.months), { dbClient })
        return monthlyTable(months)
      }
      case 'categories': {
        const entries = await accountingEntries(period.from, period.to)
        const summary = getAccountingPageSummaryFromOrderSummary({}, entries, period.from, period.to)
        return categoriesTable(entries, summary.expenseSummary)
      }
      case 'expenses':
        return expensesTable(await accountingEntries(period.from, period.to), query.category)
      case 'dish_sales':
        return dishSalesTable(await paidOrders(period.from, period.to))
      default:
        throw new DatasetQueryError(`Unknown dataset ${query.dataset}`)
    }
  }

  /** Returns { table, period } where period is null for undated datasets. */
  async function load(query) {
    let period = null
    if (RANGED_DATASETS.has(query.dataset)) {
      const maxDays = ORDER_DATASETS.has(query.dataset) ? MAX_ORDER_RANGE_DAYS : MAX_RANGE_DAYS
      const range = resolveRange(query.from, query.to, today, maxDays)
      if (range.error) throw new DatasetQueryError(range.error)
      period = range
    }
    try {
      return { table: await buildTable(query, period), period }
    } catch (error) {
      if (error instanceof DatasetQueryError) throw error
      if (isAccessError(error)) throw new DatasetQueryError('This account has no access to that data.')
      throw error
    }
  }

  return { load }
}
