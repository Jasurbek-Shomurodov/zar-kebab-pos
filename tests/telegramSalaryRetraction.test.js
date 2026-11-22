import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deleteTelegramMessage, editTelegramMessage } from '../api/telegram/_lib/telegram.js'

test('Telegram salary retraction calls deleteMessage with the tracked destination', async () => {
  const originalFetch = globalThis.fetch
  const originalToken = process.env.TELEGRAM_BOT_TOKEN
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => ({ ok: true, result: true }) }
  }

  try {
    await deleteTelegramMessage('-100123', '607')
    assert.match(request.url, /\/bottest-token\/deleteMessage$/)
    assert.deepEqual(JSON.parse(request.options.body), {
      chat_id: '-100123',
      message_id: 607,
    })
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken == null) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = originalToken
  }
})

test('salary-history deletion retracts Telegram messages before deleting its source row', () => {
  const historyPage = readFileSync(
    new URL('../src/pages/EmployeeSalaryHistory.jsx', import.meta.url),
    'utf8'
  )
  const retractCall = historyPage.indexOf('await retractTelegramSalaryEvent(entry.entryType, entry.id)')
  const sourceDelete = historyPage.search(/\.from\(table\)\s*\.delete\(\)/)

  assert.ok(retractCall >= 0)
  assert.ok(sourceDelete > retractCall)
  assert.match(historyPage, /telegramDeleteFailed/)
})

test('salary retraction covers private, Salary-group, and Team delivery message ids', () => {
  const endpoint = readFileSync(
    new URL('../api/telegram/employee-notification.js', import.meta.url),
    'utf8'
  )

  assert.match(endpoint, /notificationType === 'retract_salary_event'/)
  assert.match(endpoint, /access\.role !== 'owner'/)
  assert.match(endpoint, /employee_telegram_message_id/)
  assert.match(endpoint, /employee_chat_id, telegram_message_id, group_chat_id/)
  assert.match(endpoint, /group_telegram_message_id/)
  assert.match(endpoint, /team_telegram_message_id/)
  assert.match(endpoint, /telegramMessageWasAlreadyDeleted/)
  assert.match(endpoint, /Promise\.allSettled\(uniqueTargets\.map\(retractTrackedTelegramMessage\)\)/)
})

test('payment delivery snapshots the exact employee chat used by the sent message', () => {
  const migration = readFileSync(
    new URL('../migrations/157_salary_payment_employee_chat_tracking.sql', import.meta.url),
    'utf8'
  )
  const dbHealth = readFileSync(new URL('../src/lib/dbHealth.js', import.meta.url), 'utf8')
  const cliHealth = readFileSync(new URL('../scripts/check-db-health.js', import.meta.url), 'utf8')

  assert.match(migration, /add column if not exists employee_chat_id text/i)
  assert.match(migration, /before update of telegram_message_id/i)
  assert.match(migration, /employee_salary_telegram_links/i)
  assert.match(dbHealth, /employee_chat_id/)
  assert.match(dbHealth, /157_salary_payment_employee_chat_tracking/)
  assert.match(cliHealth, /employee_chat_id/)
})

function salaryRetractionWith(deleteTelegramMessage, editTelegramMessage = async () => { throw new Error('Unexpected edit') }) {
  const source = readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const tables = source.slice(source.indexOf('const RETRACTABLE_SALARY_EVENT_TABLES'), source.indexOf('\nfunction isMissingKpiBonusSourceColumns'))
  const helpers = source.slice(source.indexOf('function telegramMessageWasAlreadyDeleted'), source.indexOf('\nasync function', source.indexOf('async function retractSalaryEventMessages') + 10))
  return new Function('deleteTelegramMessage', 'editTelegramMessage', `${tables}\n${helpers}\nreturn retractSalaryEventMessages`)(deleteTelegramMessage, editTelegramMessage)
}

function rateRetractionDb(delivery) {
  return { from(table) {
    const query = {
      select() { return this }, eq() { return this },
      async maybeSingle() { return { data: table === 'employee_salary_rates' ? { id: 'rate', salary_profile_id: 'employee' } : delivery, error: null } },
    }
    return query
  } }
}

test('rate retraction deletes private, Investor and any recorded Team message using original chat IDs', async () => {
  const calls = []
  const retract = salaryRetractionWith(async (chat, message) => { calls.push([chat, message]) })
  const result = await retract(rateRetractionDb({
    employee_chat_id: 'employee-original', employee_telegram_message_id: '11',
    telegram_chat_id: 'investor-original', telegram_message_id: '22',
    team_chat_id: 'team-original', team_telegram_message_id: '33',
  }), 'rate', 'rate')
  assert.equal(result.ok, true)
  assert.deepEqual(calls, [['employee-original', '11'], ['investor-original', '22'], ['team-original', '33']])
})

test('rate retraction attempts every destination and reports partial failure for safe retry', async () => {
  const calls = []
  const retract = salaryRetractionWith(async (chat) => {
    calls.push(chat)
    if (chat === 'investor') throw new Error('Telegram delete denied')
  })
  await assert.rejects(retract(rateRetractionDb({
    employee_chat_id: 'employee', employee_telegram_message_id: '11',
    telegram_chat_id: 'investor', telegram_message_id: '22',
  }), 'rate', 'rate'), /salary_group.*Telegram delete denied/)
  assert.deepEqual(calls, ['employee', 'investor'])
})

test('browser accepts rate cleanup and backend and both deletion entry points enforce ownership', async () => {
  const client = readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
  const start = client.indexOf('export function retractTelegramSalaryEvent')
  const end = client.indexOf('\nexport ', start + 10)
  const retract = new Function('postAuthenticatedTelegramNotification', `${client.slice(start, end).replace('export ', '')}; return retractTelegramSalaryEvent`)(async payload => ({ ok: true, ...payload }))
  assert.deepEqual(await retract('rate', 'rate-id'), { ok: true, type: 'retract_salary_event', eventType: 'rate', eventId: 'rate-id' })
  const page = readFileSync(new URL('../src/pages/EmployeeSalaryHistory.jsx', import.meta.url), 'utf8')
  const salaries = readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
  assert.match(page, /canDeleteHistory = canManage && isOwner/)
  // The salary history is the only place a rate can be deleted: owner only, Telegram retracted before the row goes.
  assert.doesNotMatch(salaries, /from\('employee_salary_rates'\)\s*\.delete|retractTelegramSalaryEvent/)
  assert.match(page, /rate: 'employee_salary_rates'/)
  const retractAt = page.indexOf('await retractTelegramSalaryEvent(entry.entryType, entry.id)')
  assert.ok(retractAt > 0 && retractAt < page.search(/\.from\(table\)\s*\.delete\(\)/))
})


test('old rate messages are marked cancelled at every saved destination before deletion can continue', async () => {
  const edits = []
  const retract = salaryRetractionWith(async () => { throw new Error("Bad Request: message can't be deleted") }, async (...args) => { edits.push(args) })
  const result = await retract(rateRetractionDb({
    employee_chat_id: 'employee', employee_telegram_message_id: '11',
    telegram_chat_id: 'investor', telegram_message_id: '22',
  }), 'rate', 'rate')
  assert.deepEqual(result.retracted.map(row => row.status), ['cancelled', 'cancelled'])
  assert.deepEqual(edits.map(args => args.slice(0, 2)), [['employee', '11'], ['investor', '22']])
  assert.ok(edits.every(args => /Salary change cancelled/.test(args[2]) && /<s>/.test(args[2])))
})

test('cancellation retries accept unchanged text but still block when Telegram cannot edit', async () => {
  const delivery = { telegram_chat_id: 'investor', telegram_message_id: '22' }
  for (const message of ['Bad Request: message is not modified', 'Forbidden: bot was kicked']) {
    const retract = salaryRetractionWith(async () => { throw new Error("message can't be deleted") }, async () => { throw new Error(message) })
    if (message.includes('not modified')) {
      assert.equal((await retract(rateRetractionDb(delivery), 'rate', 'rate')).retracted[0].status, 'cancelled')
    } else {
      await assert.rejects(retract(rateRetractionDb(delivery), 'rate', 'rate'), /bot was kicked/)
    }
  }
})

test('transport errors never trigger cancellation edits', async () => {
  let edits = 0
  const retract = salaryRetractionWith(async () => { throw new Error('fetch failed') }, async () => { edits += 1 })
  await assert.rejects(retract(rateRetractionDb({ telegram_chat_id: 'investor', telegram_message_id: '22' }), 'rate', 'rate'), /fetch failed/)
  assert.equal(edits, 0)
})


test('Telegram cancellation edits the original message with strikethrough and clears buttons', async () => {
  const originalFetch = globalThis.fetch
  const originalToken = process.env.TELEGRAM_BOT_TOKEN
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) }
    return { ok: true, json: async () => ({ ok: true, result: true }) }
  }
  try {
    await editTelegramMessage('-100123', '607', '<s>Salary change cancelled</s>')
    assert.match(request.url, /\/editMessageText$/)
    assert.deepEqual(request.body, { chat_id: '-100123', message_id: 607, text: '<s>Salary change cancelled</s>', parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } })
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken == null) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = originalToken
  }
})


test('salary cleanup timeout releases a hanging request and invalid responses never allow deletion', async () => {
  const client = readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
  const start = client.indexOf('export function retractTelegramSalaryEvent')
  const end = client.indexOf('\nexport ', start + 10)
  const body = `${client.slice(start, end).replace('export ', '')}; return retractTelegramSalaryEvent`
  let expire, signal, cleared = false
  const retract = new Function('postAuthenticatedTelegramNotification', 'setTimeout', 'clearTimeout', body)(
    (_, options) => { signal = options.signal; return new Promise(() => {}) },
    callback => { expire = callback; return 1 },
    () => { cleared = true },
  )
  const pending = retract('rate', 'rate-id')
  expire()
  await assert.rejects(pending, /timed out.*record was kept/)
  assert.equal(signal.aborted, true)
  assert.equal(cleared, true)
  const invalid = new Function('postAuthenticatedTelegramNotification', body)(async () => ({}))
  await assert.rejects(invalid('rate', 'rate-id'), /invalid response/)
})

test('a session that resolves after cleanup timeout cannot send a late Telegram request', async () => {
  const source = readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
  const start = source.indexOf('async function postAuthenticatedTelegramNotification')
  const end = source.indexOf('\nexport ', start)
  let resolveSession, requests = 0
  const post = new Function('supabase', 'fetch', `${source.slice(start, end)}; return postAuthenticatedTelegramNotification`)(
    { auth: { getSession: () => new Promise(resolve => { resolveSession = resolve }) } },
    () => { requests += 1 },
  )
  const controller = new AbortController()
  const pending = post({}, { signal: controller.signal })
  controller.abort(new Error('cleanup timed out'))
  resolveSession({ data: { session: { access_token: 'test' } }, error: null })
  await assert.rejects(pending, /timed out/)
  assert.equal(requests, 0)
})
