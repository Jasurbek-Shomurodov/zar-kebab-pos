import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { MockLanguageModelV4 } from 'ai/test'
import { customProvider } from 'hoggish-assistant/server'
import { readEventStream } from 'hoggish-assistant'
import {
  allowedDatasets,
  categoriesTable,
  dailyTable,
  dishSalesTable,
  expensesTable,
  MODEL_ROW_LIMIT,
  monthlyTable,
  summaryTable,
  tableForModel,
} from '../src/lib/assistant/datasets.js'
import { createAssistantLabels } from '../src/lib/assistant/labels.js'
import { clampMonths, MAX_ORDER_RANGE_DAYS, resolveRange } from '../src/lib/assistant/ranges.js'
import { canViewPage, defaultPath, FEATURE_KEYS } from '../src/lib/permissions.js'
import { assistantTools } from '../api/assistant/_lib/tools.js'
import { DatasetQueryError } from '../api/assistant/_lib/loaders.js'
import { createZarAssistant } from '../api/assistant/_lib/assistant.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('periods default to this month, stop at today and respect dataset limits', () => {
  assert.deepEqual(resolveRange(undefined, undefined, '2026-10-15'), { from: '2026-10-01', to: '2026-10-15' })
  assert.deepEqual(resolveRange('2026-10-01', '2026-12-31', '2026-10-15'), { from: '2026-10-01', to: '2026-10-15' })
  assert.ok(resolveRange('2026-02-30', undefined, '2026-10-15').error)
  assert.ok(resolveRange('15.10.2026', undefined, '2026-10-15').error)
  assert.ok(resolveRange('2026-10-20', undefined, '2026-10-15').error)
  assert.ok(resolveRange('2026-01-01', '2026-10-15', '2026-10-15', MAX_ORDER_RANGE_DAYS).error)
  assert.equal(clampMonths(undefined), 12)
  assert.equal(clampMonths(0), 1)
  assert.equal(clampMonths(99), 24)
})

test('assistant is a Team page feature owners get by default', () => {
  assert.ok(FEATURE_KEYS.includes('assistant'))
  assert.equal(canViewPage({ role: 'owner', feature_access: null }, 'assistant'), true)
  assert.equal(canViewPage({ role: 'admin', feature_access: ['reports'] }, 'assistant'), false)
  assert.equal(defaultPath({ role: 'viewer', feature_access: ['assistant'] }), '/admin/assistant')

  const migration = read('migrations/251_ai_assistant.sql')
  assert.match(migration, /'assistant'/)
  // Earlier feature dependencies stay enforced.
  assert.match(migration, /not \('financial_analysis' = any\(feature_access\)\)\s+or 'expenses' = any\(feature_access\)/)
  assert.match(migration, /grant execute on function public\.record_assistant_model_request\(date, text, boolean\) to service_role/)
  assert.doesNotMatch(migration, /to authenticated/)
})

test('assistant datasets follow the holder\'s other features', () => {
  assert.deepEqual(allowedDatasets({ role: 'owner', feature_access: null }), ['summary', 'daily', 'monthly', 'categories', 'expenses', 'dish_sales'])
  assert.deepEqual(allowedDatasets({ role: 'admin', feature_access: ['assistant', 'reports'] }), ['dish_sales'])
  assert.deepEqual(allowedDatasets({ role: 'viewer', feature_access: ['assistant', 'expenses'] }), ['summary', 'daily', 'categories', 'expenses'])
  assert.deepEqual(allowedDatasets({ role: 'admin', feature_access: ['assistant'] }), [])
  assert.deepEqual(assistantTools({ datasets: [], loader: null, labels: null }), {})
})

test('summary uses the Accounting summary and paid-order totals', () => {
  const table = summaryTable({
    cafeIncome: 10_000_000,
    loyaltyIncome: 50_000,
    investorSupportTotal: 2_000_000,
    otherIncomeTotal: 100_000,
    expenseSummary: { total: 7_000_000 },
    salaryExpensesTotal: 3_000_000,
    productBazaarExpensesTotal: 2_500_000,
    employeeMealExpensesTotal: 500_000,
    otherExpensesTotal: 1_000_000,
    netIncome: 5_100_000,
  }, {
    orderCount: 400,
    costTotal: 3_000_000,
    cafeIncomeSummary: { averageDaily: 666_667 },
    paymentMethodIncome: { cash: 6_000_000, card: 1_000_000, terminal: 3_000_000, loyalty_card: 0, salary: 0 },
  })
  const value = metric => table.rows.find(row => row.metric === metric).value
  assert.equal(value('averageCheck'), 25_000)
  assert.equal(value('grossProfit'), 7_000_000)
  assert.equal(value('grossMarginPct'), 70)
  assert.equal(value('netIncome'), 5_100_000)
  assert.equal(table.rows.find(row => row.metric === 'grossMarginPct').unit, '%')
})

test('daily, monthly, category, expense and dish tables', () => {
  const daily = dailyTable(
    [{ date: '2026-10-01', total: 300, salaries: 100, bazaar: 150, meals: 50, other: 0 }],
    new Map([['2026-10-01', { cafeIncome: 1000, orderCount: 4, costTotal: 200 }]]),
  )
  assert.deepEqual(daily.rows[0], {
    date: '2026-10-01', cafeIncome: 1000, orderCount: 4, salesCost: 200, spent: 300,
    salaryExpenses: 100, bazaarExpenses: 150, employeeMealExpenses: 50, otherExpenses: 0, left: 700,
  })

  const monthly = monthlyTable([{ monthStart: '2026-09-01', cafeIncome: 900, orderCount: 3, salesCost: 100, otherIncome: 50, investorSupport: 500, spent: 600, salaries: 200 }])
  assert.equal(monthly.rows[0].month, '2026-09')
  assert.equal(monthly.rows[0].operatingResult, 350)

  const entries = [
    { entry_type: 'expense', category: 'products_bazaar', amount: 300, expense_date: '2026-10-02', payment_method: 'cash' },
    { entry_type: 'expense', category: 'rent', amount: 700, expense_date: '2026-10-01', payment_method: 'card' },
    { entry_type: 'income', category: 'investor_support', amount: 5000, expense_date: '2026-10-01' },
  ]
  const categories = categoriesTable(entries, { total: 1000, byCategory: { products_bazaar: 300, rent: 700 } })
  assert.deepEqual(categories.rows.map(row => [row.category, row.sharePct, row.count]), [['rent', 70, 1], ['products_bazaar', 30, 1]])

  const expenses = expensesTable(entries)
  assert.deepEqual(expenses.rows.map(row => row.category), ['rent', 'products_bazaar'])
  assert.deepEqual(expensesTable(entries, 'rent').rows.length, 1)

  const dishes = dishSalesTable([{
    id: 'o1',
    status: 'paid',
    payment_status: 'paid',
    paid_at: '2026-10-01T10:00:00+05:00',
    order_items: [
      { menu_item_id: 'kebab', name: 'Kebab', price: 30000, quantity: 2 },
      { menu_item_id: 'tea', name: 'Tea', price: 5000, quantity: 1 },
      { menu_item_id: 'cola', name: 'Cola', price: 9000, quantity: 1, status: 'cancelled' },
    ],
  }])
  assert.deepEqual(dishes.rows.map(row => [row.dish, row.quantity, row.itemRevenue]), [['Kebab', 2, 60000], ['Tea', 1, 5000]])

  const many = { ...expenses, rows: Array.from({ length: MODEL_ROW_LIMIT + 5 }, () => expenses.rows[0]) }
  assert.equal(tableForModel(many).truncated, true)
  assert.equal(tableForModel(many).rows.length, MODEL_ROW_LIMIT)
})


const RENT = { entry_type: 'expense', category: 'rent', amount: 700, expense_date: '2026-10-01', payment_method: 'card' }

test('tools read allowed datasets and turn bad queries into model-visible errors', async () => {
  const table = expensesTable([RENT])
  const queries = []
  const loader = {
    load: async query => {
      queries.push(query)
      if (query.from === '2026-13-01') throw new DatasetQueryError('Dates must be real YYYY-MM-DD dates.')
      return { table, period: { from: '2026-10-01', to: '2026-10-15' } }
    },
  }
  const tools = assistantTools({ datasets: ['expenses'], loader, labels: createAssistantLabels('ru') })
  assert.deepEqual(Object.keys(tools), ['get_data', 'export_excel'])
  assert.ok(Object.values(tools).every(tool => !tool.needsConfirmation), 'assistant tools are read-only')

  const result = await tools.get_data.execute({ dataset: 'expenses', from: '2026-10-01' }, {})
  assert.equal(result.rows[0].category, 'rent')
  assert.equal(result.labels.category.rent, 'Аренда')
  assert.deepEqual(queries[0], { dataset: 'expenses', from: '2026-10-01', to: undefined, months: undefined, category: undefined })

  await assert.rejects(tools.get_data.execute({ dataset: 'expenses', from: '2026-13-01' }, {}), { name: 'ToolError' })
  assert.equal(tools.get_data.inputSchema.safeParse({ dataset: 'dish_sales' }).success, false)
  assert.equal(tools.get_data.inputSchema.safeParse({ dataset: 'expenses', months: 99 }).success, false)
})

test('Excel export attaches a translated workbook', async () => {
  const loader = { load: async () => ({ table: expensesTable([RENT]), period: { from: '2026-10-01', to: '2026-10-15' } }) }
  const tools = assistantTools({ datasets: ['expenses'], loader, labels: createAssistantLabels('ru') })
  const files = []
  const result = await tools.export_excel.execute({ datasets: ['expenses'], file_title: 'Расходы: октябрь' }, { attachFile: file => files.push(file) })

  assert.equal(files.length, 1)
  assert.equal(result.fileName, files[0].fileName)
  assert.match(files[0].fileName, /\.xlsx$/)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(files[0].data)
  const sheet = workbook.worksheets[0]
  assert.equal(sheet.name, 'Расходы')
  assert.equal(sheet.getRow(3).getCell(1).value, 'Дата')
  assert.equal(sheet.getRow(4).getCell(3).value, 700)
  assert.equal(sheet.getRow(4).getCell(4).value, 'Карта')
})

const OWNER = { id: 'u1', email: 'owner@example.com', role: 'owner', status: 'active', feature_access: null }

/** A fake caller-scoped Supabase client: records the Authorization it was built with and every RPC. */
function fakeUserClient({ user = { id: 'u1' }, profile = OWNER } = {}) {
  const calls = { authorizations: [], rpcs: [] }
  const create = authorization => {
    calls.authorizations.push(authorization)
    return {
      auth: { getUser: async () => (user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } }) },
      from: table => {
        assert.equal(table, 'profiles')
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: profile, error: null }) }
        return query
      },
      rpc: async (name, args) => {
        calls.rpcs.push(name)
        assert.equal(name, 'get_reports_accounting')
        assert.ok(args.p_date_from && args.p_date_to)
        return { data: { expenses: [RENT], employee_meals: [], salary: { profiles: [], payments: [], bonuses: [], team: [] } }, error: null }
      },
    }
  }
  return { create, calls }
}

function mockModel(steps) {
  let index = 0
  const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } }
  return new MockLanguageModelV4({
    modelId: 'mock',
    doStream: async () => {
      const step = steps[Math.min(index++, steps.length - 1)]
      const chunks = [{ type: 'stream-start', warnings: [] }]
      if (step.text) chunks.push({ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: step.text }, { type: 'text-end', id: 't' })
      for (const call of step.calls || []) chunks.push({ type: 'tool-call', toolCallId: call.id, toolName: call.name, input: JSON.stringify(call.input) })
      const unified = step.calls ? 'tool-calls' : 'stop'
      chunks.push({ type: 'finish', finishReason: { unified, raw: unified }, usage })
      return { stream: new ReadableStream({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close() } }) }
    },
  })
}

function assistantWith(client, steps = [{ text: 'ok' }]) {
  return createZarAssistant({
    env: {},
    createUserClient: client.create,
    provider: customProvider({ name: 'mock', models: [{ model: 'mock', languageModel: mockModel(steps) }] }),
    quotaStore: { load: async () => [], record: async () => {} },
    onError: () => {},
  })
}

const chatRequest = (headers = {}) => new Request('http://localhost/api/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'Rent this month?' }] }),
})

test('route rejects missing or invalid sessions and accounts without the feature', async () => {
  const anonymous = fakeUserClient()
  const noToken = await assistantWith(anonymous).handle(chatRequest())
  assert.equal(noToken.status, 401)
  assert.deepEqual(await noToken.json(), { error: 'UNAUTHORIZED' })
  assert.equal(anonymous.calls.authorizations.length, 0)

  const badToken = await assistantWith(fakeUserClient({ user: null })).handle(chatRequest({ Authorization: 'Bearer bad' }))
  assert.equal(badToken.status, 401)

  const noFeature = { ...OWNER, role: 'admin', feature_access: ['reports'] }
  assert.equal((await assistantWith(fakeUserClient({ profile: noFeature })).handle(chatRequest({ Authorization: 'Bearer t' }))).status, 403)
  const pending = { ...OWNER, status: 'pending' }
  assert.equal((await assistantWith(fakeUserClient({ profile: pending })).handle(chatRequest({ Authorization: 'Bearer t' }))).status, 403)
  assert.equal((await assistantWith(fakeUserClient({ profile: null })).handle(new Request('http://localhost/api/assistant', { headers: { Authorization: 'Bearer t' } }))).status, 403)
})

test('an authorized chat reads data through the caller\'s own client', async () => {
  const client = fakeUserClient()
  const assistant = assistantWith(client, [
    { calls: [{ id: 'c1', name: 'get_data', input: { dataset: 'expenses' } }] },
    { text: 'Rent was 700 so\'m.' },
  ])
  const response = await assistant.handle(chatRequest({ Authorization: 'Bearer user-token', 'x-assistant-lang': 'ru' }))
  assert.equal(response.status, 200)
  const events = []
  for await (const event of readEventStream(response.body)) events.push(event)

  assert.deepEqual(client.calls.authorizations, ['Bearer user-token'])
  assert.deepEqual(client.calls.rpcs, ['get_reports_accounting'])
  assert.ok(events.some(event => event.type === 'tool' && event.name === 'get_data'))
  assert.equal(events.filter(event => event.type === 'text').map(event => event.text).join(''), 'Rent was 700 so\'m.')
  assert.deepEqual(events.at(-1), { type: 'done' })
})

test('quota endpoint needs a session and the assistant keeps no service-role data access', async () => {
  const unauthorized = await assistantWith(fakeUserClient()).handle(new Request('http://localhost/api/assistant'))
  assert.equal(unauthorized.status, 401)
  const usage = await assistantWith(fakeUserClient()).handle(new Request('http://localhost/api/assistant', { headers: { Authorization: 'Bearer t' } }))
  assert.equal(usage.status, 200)
  assert.equal((await usage.json()).provider, 'mock')

  const source = read('api/assistant/_lib/assistant.js')
  // The service role appears only inside the quota store.
  const serviceUses = source.split('SUPABASE_SERVICE_ROLE_KEY').length - 1
  assert.equal(serviceUses, 1)
  assert.match(source, /function serviceQuotaStore[\s\S]*SUPABASE_SERVICE_ROLE_KEY[\s\S]*createSupabaseQuotaStore/)
  for (const file of ['api/assistant/_lib/loaders.js', 'api/assistant/_lib/tools.js']) {
    assert.doesNotMatch(read(file), /SERVICE_ROLE|\.insert\(|\.update\(|\.delete\(|\.upsert\(/, file)
  }
  const page = read('src/pages/AdminAssistant.jsx')
  assert.doesNotMatch(page, /localStorage|sessionStorage/)
  // The language travels in a header so switching it never refetches the quota or resets the chat.
  assert.doesNotMatch(page, /context:/)
})
