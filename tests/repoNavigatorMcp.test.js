import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { navigationLimits, RepoNavigator } from '../mcp/repo-navigator.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-nav-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'src'), { recursive: true })
  await fs.mkdir(path.join(root, 'tests'), { recursive: true })
  await fs.mkdir(path.join(root, 'migrations'), { recursive: true })
  await fs.writeFile(path.join(root, 'src', 'App.jsx'), [
    "import { totalDue } from './money.js'",
    "export function App() {",
    "  return <Route path=\"/admin/accounting\" element={<Accounting />} />",
    "}",
    "export const PAYMENT_ACTION = 'MARK_ORDER_PAID'",
  ].join('\n'))
  await fs.writeFile(path.join(root, 'src', 'money.js'), [
    'export function totalDue(order) {',
    '  return order.items.reduce((sum, item) => sum + item.price, 0)',
    '}',
  ].join('\n'))
  await fs.writeFile(path.join(root, 'tests', 'money.test.js'), [
    "test('totalDue adds item prices', () => {",
    '  assert.equal(totalDue(order), 20)',
    '})',
  ].join('\n'))
  await fs.writeFile(path.join(root, 'migrations', '001.sql'), [
    'create table public.orders (id text);',
    'create or replace function public.settle_order(payload jsonb)',
    'returns void language sql as $$ select null; $$;',
  ].join('\n'))
  await fs.writeFile(path.join(root, '.env.local'), 'SUPABASE_SERVICE_ROLE_KEY=never-index-this')
  return root
}

test('indexes symbols, routes, tests, and SQL objects with compact rows', async (t) => {
  const root = await fixture(t)
  const navigator = new RepoNavigator(root)

  const symbol = await navigator.run({ op: 'find', q: 'totalDue' })
  assert.equal(symbol.rows[0][1], 'function')
  assert.equal(symbol.rows[0][2], 'src/money.js')

  const route = await navigator.run({ op: 'find', q: '/admin/accounting' })
  assert.ok(route.rows.some((row) => row[1] === 'route'))

  const testResult = await navigator.run({ op: 'find', q: 'adds item prices' })
  assert.ok(testResult.rows.some((row) => row[1] === 'test'))

  const sql = await navigator.run({ op: 'find', q: 'settle_order' })
  assert.ok(sql.rows.some((row) => row[1] === 'sql-function'))
})

test('reads only an indexed declaration and follows references', async (t) => {
  const root = await fixture(t)
  const navigator = new RepoNavigator(root)
  const found = await navigator.run({ op: 'find', q: 'totalDue' })
  const declaration = found.rows.find((row) => row[1] === 'function')
  const source = await navigator.run({ op: 'read', id: declaration[0], max_chars: 1_000 })

  assert.match(source.chunks[0][3], /1\|export function totalDue/)
  assert.doesNotMatch(source.chunks[0][3], /PAYMENT_ACTION/)

  const refs = await navigator.run({ op: 'refs', id: declaration[0] })
  assert.ok(refs.rows.some((row) => row[2] === 'src/App.jsx'))
  assert.ok(refs.rows.some((row) => row[2] === 'tests/money.test.js'))
})

test('keeps JavaScript declaration boundaries through strings, regexes, templates, and adjacent scalars', async (t) => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'src', 'lexer.js'), [
    'export function trickyBoundary(value) {',
    "  const url = 'https://example.test//path'",
    '  const matcher = /\\/\\/.*$/',
    '  const template = `literal // ${value}`',
    '  /* ignored { } // */',
    '  return matcher.test(url) && template.length > 0',
    '}',
    "export const scalarBoundary = 'done // here'",
    'export const objectBoundary = {',
    '  nested: true,',
    '}',
    'export const arrowBoundary =',
    '  async () =>',
    '  {',
    '    return true',
    '  }',
    'export const afterBoundary = true',
  ].join('\n'))
  const navigator = new RepoNavigator(root)

  const outline = await navigator.run({ op: 'outline', path: 'src/lexer.js', limit: 30 })
  const rangeFor = (label) => outline.rows.find((row) => row[4] === label)?.[3]
  assert.equal(rangeFor('trickyBoundary'), 'L1-7')
  assert.equal(rangeFor('scalarBoundary'), 'L8-8')
  assert.equal(rangeFor('objectBoundary'), 'L9-11')
  assert.equal(rangeFor('arrowBoundary'), 'L12-16')
  assert.equal(rangeFor('afterBoundary'), 'L17-17')
})

test('indexes JSX route tags but ignores route-looking strings, regexes, and comments', async (t) => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'src', 'route-fixtures.jsx'), [
    "const routeText = '<Route path=\"/fake-string\" element={<Fake />} />'",
    'const routePattern = /<Route path="\\/fake-regex"/',
    '// <Route path="/fake-comment" element={<Fake />} />',
    '/* <Route path="/fake-block" element={<Fake />} /> */',
    'export function RealRoute() {',
    '  return <Route path="/real-route" element={<Real />} />',
    '}',
  ].join('\n'))
  await fs.writeFile(path.join(root, 'tests', 'route-fixture.test.jsx'), "const fixture = '<Route path=\"/fake-test\" element={<Fake />} />'")
  const navigator = new RepoNavigator(root)

  const real = await navigator.run({ op: 'find', q: '/real-route' })
  assert.ok(real.rows.some((row) => row[1] === 'route' && row[4] === '/real-route'))
  for (const query of ['/fake-string', '/fake-regex', '/fake-comment', '/fake-block', '/fake-test']) {
    const output = await navigator.run({ op: 'find', q: query })
    assert.ok(!output.rows.some((row) => row[1] === 'route'), query)
  }
})

test('closes JSX functions at self-closing tags after expression attributes', async (t) => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'src', 'self-closing.jsx'), [
    'export function SelfClosingBoundary({ Icon, size }) {',
    '  return (',
    '    <button>',
    '      {Icon && <Icon size={size} />}',
    '    </button>',
    '  )',
    '}',
    'export const afterSelfClosingBoundary = true',
  ].join('\n'))
  const navigator = new RepoNavigator(root)
  const outline = await navigator.run({ op: 'outline', path: 'src/self-closing.jsx', limit: 20 })
  assert.equal(outline.rows.find((row) => row[4] === 'SelfClosingBoundary')?.[3], 'L1-7')
  assert.equal(outline.rows.find((row) => row[4] === 'afterSelfClosingBoundary')?.[3], 'L8-8')
})

test('confines reads and excludes secrets and symlinks', async (t) => {
  const root = await fixture(t)
  const outside = path.join(os.tmpdir(), `repo-nav-outside-${Date.now()}.js`)
  await fs.writeFile(outside, 'export const leaked = true')
  t.after(() => fs.rm(outside, { force: true }))
  await fs.symlink(outside, path.join(root, 'src', 'linked.js'))
  const navigator = new RepoNavigator(root)

  await assert.rejects(() => navigator.run({ op: 'read', path: '../outside.js' }), /outside/)
  await assert.rejects(() => navigator.run({ op: 'read', path: '.env.local' }), /outside/)
  const secret = await navigator.run({ op: 'find', q: 'never-index-this' })
  assert.equal(secret.rows.length, 0)
  const linked = await navigator.run({ op: 'find', q: 'leaked' })
  assert.equal(linked.rows.length, 0)
})

test('enforces output budgets and deterministic cursor pagination', async (t) => {
  const root = await fixture(t)
  const repeated = Array.from({ length: 80 }, (_, index) => `export const paymentValue${index} = 'payment'`).join('\n')
  await fs.writeFile(path.join(root, 'src', 'many.js'), repeated)
  const navigator = new RepoNavigator(root)
  const first = await navigator.run({ op: 'find', q: 'payment', limit: 50, max_chars: 700 })

  assert.ok(JSON.stringify(first).length <= 700)
  assert.equal(first.truncated, true)
  assert.ok(first.next)

  const again = await navigator.run({ op: 'find', q: 'payment', limit: 50, max_chars: 700 })
  assert.deepEqual(first, again)

  const second = await navigator.run({ op: 'find', q: 'payment', cursor: first.next, limit: 50, max_chars: 700 })
  assert.notDeepEqual(second.rows, first.rows)
})

test('rejects stale cursors after source changes', async (t) => {
  const root = await fixture(t)
  const navigator = new RepoNavigator(root)
  const first = await navigator.run({ op: 'find', q: 'total', limit: 1 })
  assert.ok(first.next)
  await fs.appendFile(path.join(root, 'src', 'money.js'), '\nexport const changed = true\n')

  await assert.rejects(
    () => navigator.run({ op: 'find', q: 'total', cursor: first.next }),
    /stale/,
  )
})

test('revision-binds IDs even when a declaration keeps the same name and line', async (t) => {
  const root = await fixture(t)
  const navigator = new RepoNavigator(root)
  const first = await navigator.run({ op: 'find', q: 'totalDue' })
  const oldId = first.rows.find((row) => row[1] === 'function')[0]
  await fs.writeFile(path.join(root, 'src', 'money.js'), [
    'export function totalDue(order) {',
    '  return order.items.reduce((sum, item) => sum + item.price, 1)',
    '}',
  ].join('\n'))

  await assert.rejects(() => navigator.run({ op: 'read', id: oldId }), /Unknown or stale ID/)
})

test('preserves declaration and explicit range boundaries across cursor-only reads', async (t) => {
  const root = await fixture(t)
  const functionLines = [
    'export function boundedDeclaration() {',
    ...Array.from({ length: 60 }, (_, index) => `  const value${index} = ${index}`),
    '  return value59',
    '}',
    'export const unrelatedAfterDeclaration = true',
  ]
  await fs.writeFile(path.join(root, 'src', 'bounded.js'), functionLines.join('\n'))
  const navigator = new RepoNavigator(root)
  const found = await navigator.run({ op: 'find', q: 'boundedDeclaration' })
  const declaration = found.rows.find((row) => row[1] === 'function')

  let request = { op: 'read', id: declaration[0], max_chars: 500 }
  const declarationLines = []
  for (let page = 0; page < 100; page += 1) {
    const output = await navigator.run(request)
    assert.ok(JSON.stringify(output).length <= 500)
    declarationLines.push(...output.chunks[0][3].split('\n').map((line) => Number(line.match(/^(\d+)\|/)?.[1])))
    if (!output.next) break
    request = { op: 'read', cursor: output.next, max_chars: 500 }
  }
  assert.equal(declarationLines.at(-1), 63)
  assert.ok(!declarationLines.includes(64))
  assert.equal(new Set(declarationLines).size, declarationLines.length)

  request = { op: 'read', path: 'src/bounded.js', range: '1:10', max_chars: 500 }
  const rangeLines = []
  for (let page = 0; page < 30; page += 1) {
    const output = await navigator.run(request)
    rangeLines.push(...output.chunks[0][3].split('\n').map((line) => Number(line.match(/^(\d+)\|/)?.[1])))
    if (!output.next) break
    request = { op: 'read', cursor: output.next, max_chars: 500 }
  }
  assert.equal(rangeLines.at(-1), 10)
  assert.ok(rangeLines.every((line) => line >= 1 && line <= 10))
})

test('paginates escape-heavy long lines without exceeding caps or repeating cursors', async (t) => {
  const root = await fixture(t)
  const longLine = `export const escapedPayload = "${'\\"'.repeat(2_000)}"`
  await fs.writeFile(path.join(root, 'src', 'long-line.js'), longLine)
  const navigator = new RepoNavigator(root)
  const found = await navigator.run({ op: 'find', q: 'escapedPayload' })
  const declaration = found.rows.find((row) => row[1] === 'symbol')
  let request = { op: 'read', id: declaration[0], max_chars: 500 }
  let reconstructed = ''
  const cursors = new Set()

  for (let page = 0; page < 100; page += 1) {
    const output = await navigator.run(request)
    assert.ok(JSON.stringify(output).length <= 500)
    reconstructed += output.chunks[0][3].replace(/^1\|/, '')
    if (!output.next) break
    assert.ok(!cursors.has(output.next), 'cursor must make progress')
    cursors.add(output.next)
    request = { op: 'read', cursor: output.next, max_chars: 500 }
  }

  assert.equal(reconstructed, longLine)
})

test('indexes complete large components, PL/pgSQL bodies, and multiline protected routes', async () => {
  const navigator = new RepoNavigator(projectRoot)
  const menu = await navigator.run({ op: 'find', q: 'AdminMenu', limit: 5 })
  const menuFunction = menu.rows.find((row) => row[1] === 'function' && row[2] === 'src/pages/AdminMenu.jsx')
  assert.ok(Number(menuFunction[3].split('-')[1]) > 2_400)

  const menuOutline = await navigator.run({ op: 'outline', path: 'src/pages/AdminMenu.jsx', limit: 50, max_chars: 16_000 })
  assert.equal(menuOutline.rows.find((row) => row[4] === 'ImageUploadField')?.[3], 'L422-487')
  assert.equal(menuOutline.rows.find((row) => row[4] === 'MediaGalleryField')?.[3], 'L489-658')
  assert.equal(menuOutline.rows.find((row) => row[4] === 'OrangeBtn')?.[3], 'L660-670')
  assert.equal(menuOutline.rows.find((row) => row[4] === 'VisibilityToggleButton')?.[3], 'L839-857')
  assert.equal(menuOutline.rows.find((row) => row[4] === 'SortableItemRow')?.[3], 'L1018-1114')

  const settlement = await navigator.run({ op: 'find', q: 'settle_orders_payment', limit: 5 })
  const sqlFunction = settlement.rows.find((row) => row[1] === 'sql-function')
  assert.equal(sqlFunction[2], 'migrations/083_atomic_order_payment_settlement.sql')
  assert.ok(Number(sqlFunction[3].split('-')[1]) >= 500)

  const routes = await navigator.run({ op: 'map', q: '/admin/accounting', limit: 20 })
  assert.ok(routes.rows.some((row) => row[1] === 'route' && row[4] === '/admin/accounting' && row[5].includes('Expenses')))
})

test('excludes local dot directories and common credential files', async (t) => {
  const root = await fixture(t)
  await fs.mkdir(path.join(root, '.claude'), { recursive: true })
  await fs.writeFile(path.join(root, '.claude', 'settings.local.json'), '{"privateMarker":"hidden-local-setting"}')
  await fs.writeFile(path.join(root, 'token.json'), '{"token":"hidden-token-value"}')
  await fs.writeFile(path.join(root, 'service-account.json'), '{"key":"hidden-service-account"}')
  await fs.writeFile(path.join(root, 'client_secret_local.json'), '{"key":"hidden-client-secret"}')
  await fs.writeFile(path.join(root, 'firebase-adminsdk-local.json'), '{"key":"hidden-firebase-secret"}')
  await fs.writeFile(path.join(root, 'serviceAccountKey.json'), '{"key":"hidden-service-key"}')
  const navigator = new RepoNavigator(root)

  for (const query of ['hidden-local-setting', 'hidden-token-value', 'hidden-service-account', 'hidden-client-secret', 'hidden-firebase-secret', 'hidden-service-key']) {
    const output = await navigator.run({ op: 'find', q: query })
    assert.equal(output.rows.length, 0)
  }
})

test('excludes archived legacy agent context from repository search', async (t) => {
  const root = await fixture(t)
  await fs.mkdir(path.join(root, 'docs', 'agent'), { recursive: true })
  await fs.writeFile(path.join(root, 'docs', 'agent', 'legacy-context.md'), 'obsolete-agent-marker')
  const navigator = new RepoNavigator(root)

  const output = await navigator.run({ op: 'find', q: 'obsolete-agent-marker' })
  assert.equal(output.rows.length, 0)
  await assert.rejects(
    () => navigator.run({ op: 'read', path: 'docs/agent/legacy-context.md' }),
    /Indexed text file not found/,
  )
})

test('bounds tiny queries, total index bytes, and cursor-only list continuation', async (t) => {
  const root = await fixture(t)
  const navigator = new RepoNavigator(root)
  await assert.rejects(() => navigator.run({ op: 'find', q: 'x' }), /2-512/)
  await assert.rejects(() => navigator.run({ op: 'find', q: Array.from({ length: 17 }, (_, index) => `word${index}`).join(' ') }), /16 searchable words/)
  const limited = new RepoNavigator(root, { maxTotalBytes: 10 })
  await assert.rejects(() => limited.run({ op: 'guide' }), /Index byte limit exceeded/)
  await assert.rejects(() => new RepoNavigator(root, { maxEntries: 1 }).run({ op: 'guide' }), /Index entry limit exceeded/)
  await assert.rejects(() => new RepoNavigator(root, { maxLines: 2 }).run({ op: 'guide' }), /Index line limit exceeded/)
  await assert.rejects(() => new RepoNavigator(root, { maxItems: 1 }).run({ op: 'guide' }), /Index item limit exceeded/)

  const projectNavigator = new RepoNavigator(projectRoot)
  const first = await projectNavigator.run({ op: 'map', max_chars: 500, limit: 50 })
  assert.ok(JSON.stringify(first).length <= 500)
  assert.ok(first.rows.length > 0)
  if (first.next) {
    const second = await projectNavigator.run({ op: 'map', cursor: first.next, max_chars: 500, limit: 50 })
    assert.notDeepEqual(second.rows, first.rows)
  }
})

test('keeps every curated project-map path valid', async () => {
  const map = JSON.parse(await fs.readFile(path.join(projectRoot, 'mcp', 'project-map.json'), 'utf8'))
  const paths = new Set([
    ...map.landmarks.map((entry) => entry[1]),
    ...map.tasks.map((task) => task.path),
    ...map.features.flatMap((feature) => [...feature.files, ...feature.tests]),
  ])
  for (const relativePath of paths) {
    const stat = await fs.stat(path.join(projectRoot, relativePath))
    assert.equal(stat.isFile(), true, relativePath)
  }

  const navigator = new RepoNavigator(projectRoot)
  const guide = await navigator.run({ op: 'guide', max_chars: 16_000 })
  const landmarks = guide.rows.filter((row) => row[1] === 'landmark')
  assert.equal(landmarks.length, map.landmarks.length)
  assert.equal(guide.rows.filter((row) => row[1] === 'command').length, map.commands.length)
  assert.equal(guide.rows.filter((row) => row[1] === 'rule').length, map.rules.length)
  for (const row of landmarks) {
    assert.ok(row[0], row[4])
    const source = await navigator.run({ op: 'read', id: row[0], max_chars: 500 })
    assert.equal(source.chunks[0][1], row[2])
  }
})

test('resolves curated task phrases directly to implementation declarations', async () => {
  const navigator = new RepoNavigator(projectRoot)
  const expectations = [
    ['atomic cashier settlement', 'migrations/083_atomic_order_payment_settlement.sql', 'settle_orders_payment'],
    ['paid order range loading', 'src/lib/orderHistory.js', 'loadPaidOrdersForRange'],
    ['large menu editor', 'src/pages/AdminMenu.jsx', 'AdminMenu'],
    ['sent cart snapshot removal', 'src/lib/analytics.js', 'removeSentCartItems'],
    ['stable profile synchronization', 'src/App.jsx', 'ProfileSync'],
    ['salary liability without advance netting', 'src/lib/expenses.js', 'getTotalSalaryDue'],
    ['variant tech card payload', 'src/lib/techCards.js', 'buildTechCardPayload'],
    ['daily bazaar idempotent retry', 'src/lib/bazaar.js', 'getBazaarSubmissionAttempt'],
    ['historical order profit', 'src/lib/profit.js', 'getOrderNetProfit'],
    ['guest mode pin verification', 'src/lib/guestMode.js', 'verifyGuestModePin'],
    ['telegram order status notification', 'src/lib/telegramNotifications.js', 'notifyTelegramOrderStatus'],
    ['daily salary cron', 'api/telegram/daily-salary.js', 'handler'],
  ]
  for (const [query, expectedPath, expectedLabel] of expectations) {
    const output = await navigator.run({ op: 'find', q: query, limit: 8 })
    assert.equal(output.rows[0][2], expectedPath, query)
    assert.equal(output.rows[0][4], expectedLabel, query)
  }
})

test('paginates the compact guide without dropping landmarks, commands, or guardrails', async () => {
  const navigator = new RepoNavigator(projectRoot)
  let request = { op: 'guide', max_chars: 500, limit: 50 }
  const kinds = []
  const cursors = new Set()
  for (let page = 0; page < 30; page += 1) {
    const output = await navigator.run(request)
    assert.ok(JSON.stringify(output).length <= 500)
    kinds.push(...output.rows.map((row) => row[1]))
    if (!output.next) break
    assert.ok(!cursors.has(output.next))
    cursors.add(output.next)
    request = { op: 'guide', cursor: output.next, max_chars: 500, limit: 50 }
  }
  assert.equal(kinds.filter((kind) => kind === 'landmark').length, 9)
  assert.equal(kinds.filter((kind) => kind === 'command').length, 4)
  assert.equal(kinds.filter((kind) => kind === 'rule').length, 8)
})

test('tool manifest and every operation retain hard token-proxy limits', async () => {
  const navigator = new RepoNavigator(projectRoot)
  for (const request of [
    { op: 'guide' },
    { op: 'map' },
    { op: 'find', q: 'accounting' },
    { op: 'outline', path: 'src/lib/analytics.js' },
    { op: 'read', path: 'src/lib/analytics.js' },
    { op: 'refs', q: 'getOrderPaymentSummary' },
  ]) {
    const output = await navigator.run({ ...request, max_chars: navigationLimits.hardMaxChars })
    assert.ok(JSON.stringify(output).length <= navigationLimits.hardMaxChars, request.op)
  }
})

function startServer() {
  const child = spawn(process.execPath, ['mcp/server.js'], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdout.setEncoding('utf8')
  let buffer = ''
  const waiting = new Map()
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const message = JSON.parse(line)
      const resolve = waiting.get(message.id)
      if (resolve) { waiting.delete(message.id); resolve(message) }
    }
  })
  return {
    child,
    request(message) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`MCP timeout for ${message.method}`)), 10_000)
        waiting.set(message.id, (response) => { clearTimeout(timeout); resolve(response) })
        child.stdin.write(`${JSON.stringify(message)}\n`)
      })
    },
  }
}

test('stdio server completes MCP initialization, discovery, and tool calls', async (t) => {
  const server = startServer()
  t.after(() => server.child.kill('SIGTERM'))
  const initialized = await server.request({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  })
  assert.equal(initialized.result.protocolVersion, '2025-06-18')
  assert.match(initialized.result.instructions, /read only selected IDs/)

  server.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  const listed = await server.request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ['repo_nav'])
  assert.ok(JSON.stringify(listed.result.tools).length < 1_500)

  const called = await server.request({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'repo_nav', arguments: { op: 'find', q: 'getOrderPaymentSummary', limit: 3 } },
  })
  assert.equal(called.result.isError, false)
  const output = JSON.parse(called.result.content[0].text)
  assert.ok(output.rows.some((row) => row[4] === 'getOrderPaymentSummary'))
})

test('stdio server enforces lifecycle and validates tool arguments', async (t) => {
  const server = startServer()
  t.after(() => server.child.kill('SIGTERM'))

  const early = await server.request({ jsonrpc: '2.0', id: 10, method: 'tools/list', params: {} })
  assert.equal(early.error.code, -32002)

  await server.request({
    jsonrpc: '2.0', id: 11, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  })
  server.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)

  const extra = await server.request({
    jsonrpc: '2.0', id: 12, method: 'tools/call',
    params: { name: 'repo_nav', arguments: { op: 'guide', unexpected: true } },
  })
  assert.equal(extra.error.code, -32602)

  const oversizedQuery = await server.request({
    jsonrpc: '2.0', id: 13, method: 'tools/call',
    params: { name: 'repo_nav', arguments: { op: 'find', q: 'a'.repeat(513) } },
  })
  assert.equal(oversizedQuery.error.code, -32602)

  const repeatedInitialize = await server.request({
    jsonrpc: '2.0', id: 14, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  })
  assert.equal(repeatedInitialize.error.code, -32600)

  const oversizedMethod = await server.request({ jsonrpc: '2.0', id: 15, method: 'x'.repeat(129), params: {} })
  assert.equal(oversizedMethod.error.code, -32600)

  const indexing = server.request({
    jsonrpc: '2.0', id: 16, method: 'tools/call',
    params: { name: 'repo_nav', arguments: { op: 'find', q: 'accounting', limit: 50 } },
  })
  const queued = server.request({
    jsonrpc: '2.0', id: 17, method: 'tools/call',
    params: { name: 'repo_nav', arguments: { op: 'guide' } },
  })
  server.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 17, reason: 'test' } })}\n`)
  const cancelled = await queued
  assert.equal(cancelled.error.code, -32800)
  await indexing
})
