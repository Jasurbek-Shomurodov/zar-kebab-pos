import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dailySalary = readFileSync(
  new URL('../api/telegram/daily-salary.js', import.meta.url),
  'utf8'
)
const vercelConfig = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
)

test('daily salary cron reports authorized execution failures to the Investor group', () => {
  assert.match(dailySalary, /if \(cronAuthorized\)/)
  assert.match(dailySalary, /notifyDailySalaryCronFailure\(supabase, notificationDate, error\)/)
  assert.match(dailySalary, /notifySecondaryCronFailure\(supabase, getTashkentDate\(now\), error\)/)
  assert.match(dailySalary, /if \(requestFailed\)[\s\S]*notifyDailySalaryCronFailure/)
  assert.match(dailySalary, /failure alert skipped: Investor group is not configured/)
  assert.match(dailySalary, /CRON_FAILURE_ALERT_MARKER/)
  assert.match(dailySalary, /formatLongDate\(notificationDate, 'ru'/)
  assert.match(dailySalary, /formatLongDate\(businessDate, 'ru'/)
})

test('existing later cron independently checks the daily salary delivery', () => {
  assert.equal(vercelConfig.crons.length, 1)
  assert.equal(
    vercelConfig.crons.some(entry => entry.path === '/api/telegram/daily-salary'),
    false
  )
  const cron = vercelConfig.crons.find(entry => (
    entry.path === '/api/telegram/daily-salary?task=unavailable-products'
  ))
  assert.equal(cron?.schedule, '0 3 * * *')
  assert.match(dailySalary, /verifyDailySalaryCronDelivery\(supabase, notificationDate\)/)
  assert.match(dailySalary, /Promise\.allSettled/)
  assert.match(dailySalary, /daily_payroll_group_notification_deliveries/)
  assert.match(dailySalary, /delivery\?\.status === 'sent'/)
  assert.match(dailySalary, /Ежедневный финансовый отчёт не отправлен/)
  assert.match(dailySalary, /status: 'failed'/)
})

test('watchdog suppresses duplicate alerts and does not alert for an active run', () => {
  assert.match(dailySalary, /dailySalaryRunCanStillBeActive\(delivery\)/)
  assert.match(dailySalary, /status: 'in_progress'/)
  assert.match(dailySalary, /status: 'alert_already_sent'/)
  assert.match(dailySalary, /CRON_FAILURE_ALERT_MARKER/)
})

test('manual Investor report task sends the financial and unclosed-order photo album from finalized KPI data', () => {
  assert.match(dailySalary, /cronTask === 'investor-report'/)
  assert.match(dailySalary, /\.from\('employee_daily_kpi_results'\)[\s\S]*?\.eq\('business_date', notificationDate\)/)
  assert.match(dailySalary, /sendDailyInvestorReportAlbum\([\s\S]*?notificationDate,[\s\S]*?kpiResults \|\| \[\]/)
  assert.doesNotMatch(dailySalary, /import \{[\s\S]*buildDailyPayrollGroupReportPng[\s\S]*\} from '\.\/_lib\/payrollReportImage\.js'/)
  assert.match(dailySalary, /await import\('\.\/_lib\/payrollReportImage\.js'\)/)
  assert.match(dailySalary, /sendTelegramMediaGroup\(target\.chatId, photos\)/)
  assert.match(dailySalary, /kind: 'openOrders'/)
  assert.equal(
    vercelConfig.functions?.['api/telegram/daily-salary.js']?.includeFiles,
    '{node_modules/@img/sharp-libvips-linux-x64/**,node_modules/notosans-fontface/fonts/*.ttf}'
  )
})

function loadFunction(name, nextName, dependencies) {
  const start = dailySalary.indexOf(`async function ${name}(`)
  const end = dailySalary.indexOf(`\n${nextName}`, start)
  assert.ok(start >= 0 && end > start)
  return new Function(...Object.keys(dependencies), `${dailySalary.slice(start, end)}; return ${name}`)(...Object.values(dependencies))
}

function deliveryDatabase(rows, writes = []) {
  return {
    from() {
      const query = {
        select() { return query }, eq() { return query }, neq() { return query },
        maybeSingle: async () => ({ data: rows.shift(), error: null }),
        insert: async value => { writes.push(value); return { error: null } },
        update(value) { writes.push(value); return query },
      }
      return query
    },
  }
}

function watchdogDependencies(calls) {
  return {
    CRON_FAILURE_ALERT_MARKER: '[cron-failure-alerted]',
    dailySalaryRunCanStillBeActive: row => row?.status === 'pending' && row.active,
    recordMissingCheckinAbsences: async () => calls.push('absences'),
    finalizeEmployeeMealDate: async () => calls.push('meal'),
    finalizeDailyKpiDate: async () => { calls.push('kpi'); return ['finalized'] },
    sendDailyInvestorReportAlbum: async (db, date, results) => {
      assert.deepEqual(results, ['finalized']); calls.push('album')
    },
    loadInvestorGroupTarget: async () => ({ chatId: 'investor' }),
    sendTelegramMessage: async () => { calls.push('alert'); return { result: { message_id: 42 } } },
    buildDailySalaryWatchdogMessage: () => 'failed',
    getTelegramMessageId: response => String(response.result.message_id),
    markDailySalaryWatchdogAlerted: async () => calls.push('record-alert'),
    console: { error() {} },
  }
}

test('watchdog recovers previously alerted failures and verifies durable delivery', async () => {
  const calls = []
  const verify = loadFunction('verifyDailySalaryCronDelivery', 'async function loadUnavailableMenuItems', watchdogDependencies(calls))
  const db = deliveryDatabase([
    { status: 'failed', error_message: '[cron-failure-alerted] error' },
    { status: 'sent', telegram_message_id: '123' },
  ])
  assert.deepEqual(await verify(db, '2026-09-16'), { status: 'recovered' })
  assert.deepEqual(calls, ['absences', 'meal', 'kpi', 'album'])
})

test('watchdog does not replay sent, active, or uncertain pending reports', async () => {
  for (const row of [
    { status: 'sent', telegram_message_id: '123' },
    { status: 'pending', active: true },
    { status: 'pending', active: false },
  ]) {
    const calls = []
    const verify = loadFunction('verifyDailySalaryCronDelivery', 'async function loadUnavailableMenuItems', watchdogDependencies(calls))
    await verify(deliveryDatabase([row]), '2026-09-16')
    assert.ok(!calls.includes('album'))
    assert.ok(!calls.includes('kpi'))
  }
})

test('watchdog does not send a report when KPI finalization fails', async () => {
  const calls = []
  const dependencies = watchdogDependencies(calls)
  dependencies.finalizeDailyKpiDate = async () => { throw new Error('guard failure') }
  const verify = loadFunction('verifyDailySalaryCronDelivery', 'async function loadUnavailableMenuItems', dependencies)
  assert.equal((await verify(deliveryDatabase([null]), '2026-09-16')).status, 'alert_sent')
  assert.deepEqual(calls, ['absences', 'meal', 'alert', 'record-alert'])
})

test('watchdog requires durable sent confirmation before reporting recovery', async () => {
  const calls = []
  const verify = loadFunction('verifyDailySalaryCronDelivery', 'async function loadUnavailableMenuItems', watchdogDependencies(calls))
  const result = await verify(deliveryDatabase([null, { status: 'failed' }]), '2026-09-16')
  assert.equal(result.status, 'alert_sent')
  assert.ok(calls.includes('alert'))
})

test('failure alert retains Telegram confirmation and does not mark rejected sends as alerted', async () => {
  for (const accepted of [true, false]) {
    const writes = []
    const notify = loadFunction('notifyDailySalaryCronFailure', 'async function notifySecondaryCronFailure', {
      process: { env: {} },
      console: { error() {} },
      CRON_FAILURE_ALERT_MARKER: '[cron-failure-alerted]',
      loadInvestorGroupTarget: async () => ({ chatId: 'investor' }),
      buildDailySalaryCronFailureMessage: () => 'failure',
      sendTelegramMessage: async () => accepted ? { result: { message_id: 42 } } : {},
      getTelegramMessageId: response => {
        if (!response.result?.message_id) throw new Error('missing confirmation')
        return String(response.result.message_id)
      },
    })
    const result = await notify(deliveryDatabase([null], writes), '2026-09-16', new Error('guard failure'))
    assert.equal(result.status, accepted ? 'sent' : 'failed')
    assert.equal(writes.length, accepted ? 1 : 0)
    if (accepted) assert.match(writes[0].error_message, /Telegram message 42; chat investor; guard failure/)
  }
})
