import { z } from 'zod'
import { defineTool, ToolError } from 'hoggish-assistant/server'
import { excelFile } from 'hoggish-assistant/excel'
import { formatDateOnly } from '../../../src/lib/dateFormat.js'
import { tableForModel } from '../../../src/lib/assistant/datasets.js'
import { MAX_TREND_MONTHS } from '../../../src/lib/assistant/ranges.js'
import { DatasetQueryError } from './loaders.js'

const MAX_EXPORT_DATASETS = 6

const DATASET_HELP = {
  summary: 'headline Accounting totals for the period: cafe income, orders, average check, cost of sales, gross profit and margin, income by payment method, investor support, other income, expenses by group (salaries, bazaar, staff meals, other) and net result',
  daily: 'one row per day (max 92 days): cafe income, orders, cost of sales, spent, spending groups, left',
  monthly: 'one row per month for the last N months (use `months`, max 24): cafe income, orders, cost of sales, other income, investor support, spent, salaries, operating result; ignores from/to',
  categories: 'expenses grouped by category with share of all expenses',
  expenses: 'every expense row including salary payments and staff meals (date, category, amount, payment method, vendor, description); optional `category` filter',
  dish_sales: 'direct dish sales from paid orders (max 92 days): quantity, item sales before service fee, orders; best sellers first',
}

const queryShape = {
  from: z.string().max(10).optional().describe('Period start, YYYY-MM-DD. Defaults to the first day of the current month.'),
  to: z.string().max(10).optional().describe('Period end, YYYY-MM-DD, inclusive. Defaults to today.'),
  months: z.number().int().min(1).max(MAX_TREND_MONTHS).optional().describe('Only for the monthly dataset. Defaults to 12.'),
  category: z.string().max(64).optional().describe('Only for the expenses dataset: an expense category key such as products_bazaar, rent or salary_waiter.'),
}

const toQuery = (dataset, input) => ({
  dataset,
  from: input.from,
  to: input.to,
  months: input.months,
  category: input.category,
})

/**
 * Stored keys in a table, with their labels in the user's language. For
 * descriptions only the system-written ones that translate are listed, so
 * typed notes are not repeated.
 */
function valueLabels(table, labels) {
  const out = {}
  for (const column of table.columns) {
    if (!['category', 'paymentMethod', 'description'].includes(column.key)) continue
    const keys = [...new Set(table.rows.map(row => row[column.key]).filter(value => typeof value === 'string'))]
    const entries = keys
      .map(key => [key, labels.value(column.key, key)])
      .filter(([key, label]) => column.key !== 'description' || (label && label !== key))
    if (entries.length) out[column.key] = Object.fromEntries(entries)
  }
  return out
}

async function load(loader, query) {
  try {
    return await loader.load(query)
  } catch (error) {
    // Bad dates or missing access: the model can explain or retry.
    if (error instanceof DatasetQueryError) throw new ToolError(error.message)
    throw error
  }
}

/** One Excel sheet per dataset, with translated headers and stored keys shown as words. */
function excelSheet({ table, period }, labels) {
  const title = labels.dataset(table.dataset)
  return {
    name: title,
    title: period ? `${title} · ${formatDateOnly(period.from)} – ${formatDateOnly(period.to)}` : title,
    columns: table.columns.map(column => ({
      key: column.key,
      type: column.type,
      label: value => labels.value(column.key, value),
    })),
    rows: table.rows,
  }
}

/**
 * Read-only tools for the datasets this profile may read. Nothing here writes:
 * no tool needs confirmation.
 */
export function assistantTools({ datasets, loader, labels }) {
  if (datasets.length === 0) return {}
  const dataset = z.enum(datasets)
  const datasetList = datasets.map(key => `- ${key}: ${DATASET_HELP[key]}`).join('\n')

  return {
    get_data: defineTool({
      description: [
        'Read one dataset for Zar Kebab. All money is whole UZS.',
        'Call it several times (in parallel when independent) to compare periods or combine datasets.',
        `Datasets:\n${datasetList}`,
      ].join('\n'),
      inputSchema: z.object({ dataset, ...queryShape }),
      execute: async input => {
        const { table, period } = await load(loader, toQuery(input.dataset, input))
        return { period, ...tableForModel(table), labels: valueLabels(table, labels) }
      },
    }),
    export_excel: defineTool({
      description: [
        'Create a downloadable Excel (.xlsx) file for the user, one sheet per dataset, with every row',
        '(not only the rows you saw). Use it whenever the user asks for Excel, a spreadsheet, a table file or a download.',
        'All datasets in one call share the same period. Tell the user the file is attached below your message.',
      ].join(' '),
      inputSchema: z.object({
        datasets: z.array(dataset).min(1).max(MAX_EXPORT_DATASETS),
        file_title: z.string().max(80).optional().describe('Short file name without extension, in the user\'s language.'),
        ...queryShape,
      }),
      execute: async (input, { attachFile }) => {
        const loaded = await Promise.all([...new Set(input.datasets)].map(key => load(loader, toQuery(key, input))))
        const file = await excelFile(
          input.file_title || labels.defaultFileName(),
          loaded.map(entry => excelSheet(entry, labels)),
          { translate: key => labels.column(key), creator: 'Zar Kebab' },
        )
        attachFile(file)
        return {
          fileName: file.fileName,
          sheets: loaded.map(({ table, period }) => ({ dataset: table.dataset, rows: table.rows.length, period })),
        }
      },
    }),
  }
}
