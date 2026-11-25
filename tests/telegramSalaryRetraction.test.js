import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { editTelegramMessage, replyTelegramRemovedNotice, telegramOriginalMessageMissing } from '../api/telegram/_lib/telegram.js'

test('Telegram removal keeps the original and replies to the tracked destination', async () => {
  const originalFetch = globalThis.fetch
  const originalToken = process.env.TELEGRAM_BOT_TOKEN
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) })
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 700 } }) }
  }

  try {
    await replyTelegramRemovedNotice('-100123', '607', '❌ <b>Бонус удалён</b>')
    assert.equal(requests.length, 1)
    assert.match(requests[0].url, /\/bottest-token\/sendMessage$/)
    assert.deepEqual(requests[0].body, {
      chat_id: '-100123',
      text: '❌ <b>Бонус удалён</b>',
      parse_mode: 'HTML',
      reply_parameters: { message_id: 607, allow_sending_without_reply: false },
    })
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken == null) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = originalToken
  }
})

test('no POS deletion path calls Telegram deleteMessage on a tracked message', () => {
  for (const file of ['../api/telegram/employee-notification.js', '../api/telegram/_lib/employeeOrderKpiNotifications.js']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /deleteTelegramMessage/)
  }
  const orders = readFileSync(new URL('../api/telegram/_lib/orderStatusDelivery.js', import.meta.url), 'utf8')
  const retraction = orders.slice(orders.indexOf('export async function retractDeletedOrderStatusMessages'))
  assert.doesNotMatch(retraction, /deleteTelegramMessage/)
  assert.match(retraction, /replyTelegramRemovedNotice/)
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
  assert.match(endpoint, /telegramOriginalMessageMissing/)
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

function salaryRetractionWith(replyTelegramRemovedNotice) {
  const source = readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const tables = source.slice(source.indexOf('const RETRACTABLE_SALARY_EVENT_TABLES'), source.indexOf('\nfunction isMissingKpiBonusSourceColumns'))
  const helpers = source.slice(source.indexOf('const SALARY_EVENT_REMOVED_TEXT'), source.indexOf('\nasync function', source.indexOf('async function retractSalaryEventMessages') + 10))
  return new Function('replyTelegramRemovedNotice', 'telegramOriginalMessageMissing', `${tables}\n${helpers}\nreturn retractSalaryEventMessages`)(replyTelegramRemovedNotice, telegramOriginalMessageMissing)
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

test('rate retraction replies to private, Investor and any recorded Team message using original chat IDs', async () => {
  const calls = []
  const retract = salaryRetractionWith(async (chat, message, text) => { calls.push([chat, message]); assert.match(text, /Salary change cancelled/) })
  const result = await retract(rateRetractionDb({
    employee_chat_id: 'employee-original', employee_telegram_message_id: '11',
    telegram_chat_id: 'investor-original', telegram_message_id: '22',
    team_chat_id: 'team-original', team_telegram_message_id: '33',
  }), 'rate', 'rate')
  assert.equal(result.ok, true)
  assert.deepEqual(calls, [['employee-original', '11'], ['investor-original', '22'], ['team-original', '33']])
  assert.deepEqual(result.retracted.map(row => row.status), ['marked_removed', 'marked_removed', 'marked_removed'])
})

test('rate retraction attempts every destination and reports partial failure for safe retry', async () => {
  const calls = []
  const retract = salaryRetractionWith(async (chat) => {
    calls.push(chat)
    if (chat === 'investor') throw new Error('Telegram send denied')
  })
  await assert.rejects(retract(rateRetractionDb({
    employee_chat_id: 'employee', employee_telegram_message_id: '11',
    telegram_chat_id: 'investor', telegram_message_id: '22',
  }), 'rate', 'rate'), /salary_group.*Telegram send denied/)
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


test('each salary event type replies with its own removal notice', async () => {
  for (const [eventType, pattern] of [['bonus', /Бонус удалён/], ['fine', /Штраф удалён/], ['absence', /Отсутствие удалено/]]) {
    const texts = []
    const retract = salaryRetractionWith(async (_chat, _message, text) => { texts.push(text) })
    const db = { from(table) {
      return { select() { return this }, eq() { return this },
        async maybeSingle() { return { data: table.startsWith('employee_salary_group') ? { team_chat_id: 'team', team_telegram_message_id: '5' } : { id: 'e', salary_profile_id: 'p', source_type: 'manual' }, error: null } } }
    } }
    await retract(db, eventType, 'e')
    assert.equal(texts.length, 1)
    assert.match(texts[0], pattern)
  }
})

test('a message already removed by hand in Telegram counts as done', async () => {
  const retract = salaryRetractionWith(async () => { throw new Error('Bad Request: message to be replied not found') })
  const result = await retract(rateRetractionDb({ telegram_chat_id: 'investor', telegram_message_id: '22' }), 'rate', 'rate')
  assert.equal(result.retracted[0].status, 'already_deleted')
})

test('transport errors block the POS deletion so it can be retried', async () => {
  const retract = salaryRetractionWith(async () => { throw new Error('fetch failed') })
  await assert.rejects(retract(rateRetractionDb({ telegram_chat_id: 'investor', telegram_message_id: '22' }), 'rate', 'rate'), /fetch failed/)
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
