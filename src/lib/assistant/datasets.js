import { canViewPage } from '../permissions.js'
import { normalizeExpenseAmount, normalizeExpenseEntryType } from '../expenses.js'
import { getDishSalesAnalysis } from '../dishSales.js'

/**
 * Datasets the assistant can read and export. Every one is built from the
 * shared Accounting/Reports helpers, so the assistant's numbers match the
 * pages. Payroll ledgers, recipes and costs per product stay out.
 */
export const ASSISTANT_DATASETS = [
  'summary',
  'daily',
  'monthly',
  'categories',
  'expenses',
  'dish_sales',
]

/** Datasets whose rows depend on a from/to date range. */
export const RANGED_DATASETS = new Set(['summary', 'daily', 'categories', 'expenses', 'dish_sales'])

/** Datasets read from individual paid orders; they allow shorter periods. */
export const ORDER_DATASETS = new Set(['daily', 'dish_sales'])

/**
 * Which datasets a profile may read. This only shapes the tool list: the
 * caller's own Supabase session (RLS and RPC access checks) still authorizes
 * every row that is read.
 */
export function allowedDatasets(profile) {
  const accounting = canViewPage(profile, 'expenses')
  const allowed = {
    summary: accounting,
    daily: accounting,
    monthly: canViewPage(profile, 'financial_analysis'),
    categories: accounting,
    expenses: accounting,
    dish_sales: canViewPage(profile, 'reports'),
  }
  return ASSISTANT_DATASETS.filter(dataset => allowed[dataset])
}

const amount = value => Math.round(Number(value ?? 0) || 0)

function pct(part, whole) {
  const denominator = Number(whole) || 0
  if (denominator <= 0) return null
  return Math.round(((Number(part) || 0) / denominator) * 1000) / 10
}

/**
 * Headline totals for a period from the Accounting page summary
 * (getAccountingPageSummaryFromOrderSummary) and its normalized paid-order summary.
 */
export function summaryTable(summary, orderSummary) {
  const cafeIncome = amount(summary.cafeIncome)
  const orderCount = amount(orderSummary.orderCount)
  const costTotal = amount(orderSummary.costTotal)
  const methods = orderSummary.paymentMethodIncome || {}
  const metrics = [
    ['cafeIncome', cafeIncome, 'UZS'],
    ['orderCount', orderCount, 'count'],
    ['averageCheck', orderCount > 0 ? Math.round(cafeIncome / orderCount) : 0, 'UZS'],
    ['averageDailyIncome', amount(orderSummary.cafeIncomeSummary?.averageDaily), 'UZS'],
    ['loyaltyIncome', amount(summary.loyaltyIncome), 'UZS'],
    ['salesCost', costTotal, 'UZS'],
    ['grossProfit', cafeIncome - costTotal, 'UZS'],
    ['grossMarginPct', pct(cafeIncome - costTotal, cafeIncome), '%'],
    ['incomeCash', amount(methods.cash), 'UZS'],
    ['incomeCard', amount(methods.card), 'UZS'],
    ['incomeTerminal', amount(methods.terminal), 'UZS'],
    ['incomeLoyaltyCard', amount(methods.loyalty_card), 'UZS'],
    ['incomeSalary', amount(methods.salary), 'UZS'],
    ['investorSupport', amount(summary.investorSupportTotal), 'UZS'],
    ['otherIncome', amount(summary.otherIncomeTotal), 'UZS'],
    ['totalExpenses', amount(summary.expenseSummary?.total), 'UZS'],
    ['salaryExpenses', amount(summary.salaryExpensesTotal), 'UZS'],
    ['bazaarExpenses', amount(summary.productBazaarExpensesTotal), 'UZS'],
    ['employeeMealExpenses', amount(summary.employeeMealExpensesTotal), 'UZS'],
    ['otherExpenses', amount(summary.otherExpensesTotal), 'UZS'],
    ['netIncome', amount(summary.netIncome), 'UZS'],
  ]
  return {
    dataset: 'summary',
    columns: [{ key: 'metric', type: 'text' }, { key: 'value', type: 'number' }, { key: 'unit', type: 'text' }],
    rows: metrics.map(([metric, value, unit]) => ({ metric, value, unit })),
  }
}

/**
 * One row per day. `incomeByDate` maps a date to its normalized paid-order
 * summary; `spendingDays` comes from buildDailySpending.
 */
export function dailyTable(spendingDays, incomeByDate) {
  return {
    dataset: 'daily',
    columns: [
      { key: 'date', type: 'date' },
      { key: 'cafeIncome', type: 'money' },
      { key: 'orderCount', type: 'number' },
      { key: 'salesCost', type: 'money' },
      { key: 'spent', type: 'money' },
      { key: 'salaryExpenses', type: 'money' },
      { key: 'bazaarExpenses', type: 'money' },
      { key: 'employeeMealExpenses', type: 'money' },
      { key: 'otherExpenses', type: 'money' },
      { key: 'left', type: 'money' },
    ],
    rows: spendingDays.map(day => {
      const income = incomeByDate.get(day.date) || {}
      const cafeIncome = amount(income.cafeIncome)
      return {
        date: day.date,
        cafeIncome,
        orderCount: amount(income.orderCount),
        salesCost: amount(income.costTotal),
        spent: amount(day.total),
        salaryExpenses: amount(day.salaries),
        bazaarExpenses: amount(day.bazaar),
        employeeMealExpenses: amount(day.meals),
        otherExpenses: amount(day.other),
        left: cafeIncome - amount(day.total),
      }
    }),
  }
}

/** Months from loadAccountingMonthlyCashflow (migration 230). */
export function monthlyTable(months) {
  return {
    dataset: 'monthly',
    columns: [
      { key: 'month', type: 'month' },
      { key: 'cafeIncome', type: 'money' },
      { key: 'orderCount', type: 'number' },
      { key: 'salesCost', type: 'money' },
      { key: 'otherIncome', type: 'money' },
      { key: 'investorSupport', type: 'money' },
      { key: 'spent', type: 'money' },
      { key: 'salaryExpenses', type: 'money' },
      { key: 'operatingResult', type: 'money' },
    ],
    rows: months.map(row => ({
      month: row.monthStart.slice(0, 7),
      cafeIncome: row.cafeIncome,
      orderCount: row.orderCount,
      salesCost: row.salesCost,
      otherIncome: row.otherIncome,
      investorSupport: row.investorSupport,
      spent: row.spent,
      salaryExpenses: row.salaries,
      // Same operating cash the RPC totals use; investor money is not earned.
      operatingResult: row.cafeIncome + row.otherIncome - row.spent,
    })),
  }
}

function expenseRows(entries) {
  return (entries || []).filter(row => (
    normalizeExpenseEntryType(row?.entry_type) === 'expense'
    && normalizeExpenseAmount(row?.amount) > 0
  ))
}

/** Expenses grouped by category, largest first, with their share of all expenses. */
export function categoriesTable(entries, expenseSummary) {
  const counts = new Map()
  for (const row of expenseRows(entries)) {
    const category = row.category || 'other'
    counts.set(category, (counts.get(category) || 0) + 1)
  }
  const total = amount(expenseSummary.total)
  return {
    dataset: 'categories',
    columns: [
      { key: 'category', type: 'text' },
      { key: 'amount', type: 'money' },
      { key: 'sharePct', type: 'percent' },
      { key: 'count', type: 'number' },
    ],
    rows: Object.entries(expenseSummary.byCategory || {})
      .map(([category, value]) => ({
        category,
        amount: amount(value),
        sharePct: pct(value, total),
        count: counts.get(category) || 0,
      }))
      .filter(row => row.amount > 0)
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category)),
  }
}

export function expensesTable(entries, category) {
  return {
    dataset: 'expenses',
    columns: [
      { key: 'date', type: 'date' },
      { key: 'category', type: 'text' },
      { key: 'amount', type: 'money' },
      { key: 'paymentMethod', type: 'text' },
      { key: 'vendor', type: 'text' },
      { key: 'description', type: 'text' },
    ],
    rows: expenseRows(entries)
      .filter(row => !category || (row.category || 'other') === category)
      .sort((a, b) => (
        String(a.expense_date || '').localeCompare(String(b.expense_date || ''))
        || String(a.created_at || '').localeCompare(String(b.created_at || ''))
      ))
      .map(row => ({
        date: row.expense_date || null,
        category: row.category || 'other',
        amount: normalizeExpenseAmount(row.amount),
        paymentMethod: row.payment_method || null,
        vendor: row.vendor || null,
        description: row.description || null,
      })),
  }
}

/** Direct dish sales from paid orders (Reports' Dish Analysis), best sellers by revenue first. */
export function dishSalesTable(orders) {
  const { dishes } = getDishSalesAnalysis({ orders })
  return {
    dataset: 'dish_sales',
    columns: [
      { key: 'dish', type: 'text' },
      { key: 'quantity', type: 'number' },
      { key: 'itemRevenue', type: 'money' },
      { key: 'orderCount', type: 'number' },
    ],
    rows: dishes
      .filter(dish => dish.quantity > 0)
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity || a.name.localeCompare(b.name, 'ru'))
      .map(dish => ({
        dish: dish.name,
        quantity: dish.quantity,
        itemRevenue: amount(dish.revenue),
        orderCount: dish.orders,
      })),
  }
}

/** The model sees at most this many rows per table; Excel exports get every row. */
export const MODEL_ROW_LIMIT = 200

export function tableForModel(table) {
  return {
    dataset: table.dataset,
    columns: table.columns.map(column => `${column.key}:${column.type}`),
    rowCount: table.rows.length,
    truncated: table.rows.length > MODEL_ROW_LIMIT,
    rows: table.rows.slice(0, MODEL_ROW_LIMIT),
  }
}
